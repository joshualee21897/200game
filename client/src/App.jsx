import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { socket, call } from './socket';
import { saveSession, loadSession, clearSession } from './session';
import Lobby from './components/Lobby';
import WaitingRoom from './components/WaitingRoom';
import Table from './components/Table';
import NotificationToggle from './components/NotificationToggle';

function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [state, setState] = useState({ room: null, game: null, hand: null, yourPlayerId: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Tracks whether the *current live socket connection* has actually been
  // joined to a room server-side - not the same thing as "do we have room
  // data to show". A disconnect kills that association even though the
  // stale room/game data stays on screen (so the UI doesn't flash blank),
  // so this must be reset on every disconnect and only set once a join
  // actually succeeds on the new connection - never inferred from React
  // state, which lags behind and would otherwise make a real reconnect
  // look like "already joined" and skip re-joining entirely.
  const joinedRef = useRef(false);
  // Once we've shown a room at all, a later disconnect is a mid-session
  // blip, not a fresh load - the UI should keep showing the last known
  // board with a small "reconnecting" note instead of wiping the whole
  // screen back to a blank "Connecting..." panel, which used to happen on
  // even a sub-second network hiccup and read as "I got disconnected"
  // every time, even though socket.io was about to auto-reconnect anyway.
  const hadRoomRef = useRef(false);
  const [rejoinFailed, setRejoinFailed] = useState(false);

  useEffect(() => {
    // A saved session survives page reloads and lets us silently re-attach
    // to a still-held seat after the underlying socket drops and
    // reconnects (a flaky connection, not a deliberate "leave"). It's only
    // ever attempted when the current connection isn't already known to be
    // joined, so it never interrupts someone actively using the app.
    // Retries broadly (not just the one specific race it used to target)
    // with a short backoff, since a reconnect can transiently fail for a
    // few different reasons - only gives up and clears the session after
    // several tries actually fail to find that seat.
    function attemptAutoRejoin(attempt = 0) {
      if (joinedRef.current) return;
      const saved = loadSession();
      if (!saved) return;
      setRejoinFailed(false);
      call('room:join', { name: saved.name, roomCode: saved.roomCode })
        .then(() => {
          joinedRef.current = true;
          setRejoinFailed(false);
        })
        .catch((err) => {
          if (attempt < 5) {
            setTimeout(() => attemptAutoRejoin(attempt + 1), Math.min(1000 * 2 ** attempt, 8000));
          } else if (/room not found|no longer/i.test(err.message)) {
            // The room itself is genuinely gone - nothing left to retry.
            clearSession();
          } else {
            // Something else is stopping the rejoin (e.g. the room's now
            // full, or mid-round in a way that matters) - stop retrying
            // silently and let the player see what's going on and choose.
            setRejoinFailed(true);
          }
        });
    }

    function onConnect() {
      setConnected(true);
      attemptAutoRejoin();
    }
    function onDisconnect() {
      setConnected(false);
      // This socket is dead; whatever room it was joined to no longer
      // applies to whatever connection comes next.
      joinedRef.current = false;
    }
    function onState(payload) {
      setState(payload);
      if (payload.room) {
        joinedRef.current = true;
        hadRoomRef.current = true;
      }
    }
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    // The socket may already have connected before this effect subscribed
    // (it connects as soon as the module loads) - sync in case we missed it.
    setConnected(socket.connected);
    if (socket.connected) attemptAutoRejoin();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
    };
  }, []);

  useEffect(() => {
    // The match is over - no reason to auto-rejoin this room on a future
    // reload, so let the next visit land on a clean lobby.
    if (state.game?.phase === 'game_end') clearSession();
  }, [state.game?.phase]);

  useEffect(() => {
    // Tells the server whenever this tab/window goes into or out of the
    // background - a backgrounded mobile browser (an in-app browser like
    // Telegram's included) can throttle JS for several seconds while
    // keeping the socket connected, which would otherwise let the current
    // player's 30s turn clock silently run out before they're even
    // looking again. The server only actually acts on this while it's this
    // player's own turn, so it's safe to just always report it.
    function reportVisibility() {
      socket.emit('player:visibility', { hidden: document.hidden });
    }
    document.addEventListener('visibilitychange', reportVisibility);
    return () => document.removeEventListener('visibilitychange', reportVisibility);
  }, []);

  const isMyTurn =
    !!state.game &&
    (state.game.phase === 'discard' || state.game.phase === 'draw') &&
    state.game.currentPlayerId === state.yourPlayerId;

  useEffect(() => {
    // Flashes the tab title so a player who's alt-tabbed away still
    // notices it's their turn, instead of only finding out once they
    // happen to switch back. Only bothers flashing while the tab is
    // actually hidden - no need to hijack the title while they're
    // already looking at the board.
    const BASE_TITLE = '200';
    const TURN_TITLE = '🟢 Your turn! · 200';
    let intervalId = null;

    function stopFlashing() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      document.title = BASE_TITLE;
    }

    function startFlashing() {
      if (intervalId) return;
      let showTurnTitle = true;
      document.title = TURN_TITLE;
      intervalId = setInterval(() => {
        showTurnTitle = !showTurnTitle;
        document.title = showTurnTitle ? TURN_TITLE : BASE_TITLE;
      }, 1000);
    }

    function handleVisibilityChange() {
      if (!isMyTurn) return;
      if (document.hidden) startFlashing();
      else stopFlashing();
    }

    if (isMyTurn && document.hidden) startFlashing();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopFlashing();
    };
  }, [isMyTurn]);

  const runAction = useCallback(async (event, payload) => {
    setError('');
    setBusy(true);
    try {
      return await call(event, payload);
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCreate = async (name) => {
    const res = await runAction('room:create', { name });
    if (res) saveSession(name, res.roomCode);
  };
  const handleJoin = async (name, roomCode) => {
    const res = await runAction('room:join', { name, roomCode });
    if (res) saveSession(name, res.roomCode);
  };
  const handleStart = (bustThreshold, seriesLength) => runAction('room:start', { bustThreshold, seriesLength });
  const handleStartNextGame = () => runAction('room:nextGame', {});
  const handleAddBot = (difficulty) => runAction('room:addBot', { difficulty });
  const handleRemoveBot = (botId) => runAction('room:removeBot', { botId });
  const handleNextRound = () => runAction('room:nextRound', {});
  const handleDiscard = (cardIds) => runAction('game:discard', { cardIds });
  const handleDraw = (source, cardId) => runAction('game:draw', { source, cardId });
  const handleCall = () => runAction('game:call', {});
  const handleRpsChoice = (move) => runAction('game:rpsChoice', { move });

  // Only the very first load (never having seen a room yet) shows the
  // full blank "Connecting..." screen. Once a room's been shown at least
  // once, a later disconnect keeps showing that last-known board - with a
  // small banner below - rather than yanking it away on every brief blip,
  // which is what used to make the game feel like it "disconnected
  // easily" even when socket.io reconnected within a second or two.
  if (!connected && !hadRoomRef.current) {
    return (
      <div className="app-shell">
        <div className="panel">
          <p>Connecting to server&hellip;</p>
        </div>
      </div>
    );
  }

  const reconnectBanner = !connected && (
    <div className="reconnect-banner">🔌 Reconnecting&hellip;</div>
  );
  const rejoinFailedBanner = rejoinFailed && (
    <div className="reconnect-banner reconnect-banner-failed">
      Couldn't rejoin your seat automatically.
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setRejoinFailed(false);
          clearSession();
          window.location.reload();
        }}
      >
        Back to lobby
      </button>
    </div>
  );

  if (!state.room) {
    return (
      <div className="app-shell">
        <Lobby onCreate={handleCreate} onJoin={handleJoin} error={error} busy={busy} />
        {rejoinFailedBanner}
      </div>
    );
  }

  if (state.room.status === 'lobby') {
    return (
      <div className="app-shell">
        <WaitingRoom
          room={state.room}
          playerId={state.yourPlayerId}
          onStart={handleStart}
          onAddBot={handleAddBot}
          onRemoveBot={handleRemoveBot}
          error={error}
          busy={busy}
        />
        <NotificationToggle playerId={state.yourPlayerId} />
        {reconnectBanner}
        {rejoinFailedBanner}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Table
        room={state.room}
        game={state.game}
        hand={state.hand || []}
        playerId={state.yourPlayerId}
        onDiscard={handleDiscard}
        onDraw={handleDraw}
        onCall={handleCall}
        onNextRound={handleNextRound}
        onRpsChoice={handleRpsChoice}
        onNextGame={handleStartNextGame}
        error={error}
      />
      <NotificationToggle playerId={state.yourPlayerId} />
      {reconnectBanner}
      {rejoinFailedBanner}
    </div>
  );
}

export default App;
