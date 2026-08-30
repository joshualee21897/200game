import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { socket, call } from './socket';
import { saveSession, loadSession, clearSession } from './session';
import Lobby from './components/Lobby';
import WaitingRoom from './components/WaitingRoom';
import Table from './components/Table';

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

  useEffect(() => {
    // A saved session survives page reloads and lets us silently re-attach
    // to a still-held seat after the underlying socket drops and
    // reconnects (a flaky connection, not a deliberate "leave"). It's only
    // ever attempted when the current connection isn't already known to be
    // joined, so it never interrupts someone actively using the app.
    function attemptAutoRejoin(retriesLeft = 2) {
      if (joinedRef.current) return;
      const saved = loadSession();
      if (!saved) return;
      call('room:join', { name: saved.name, roomCode: saved.roomCode })
        .then(() => {
          joinedRef.current = true;
        })
        .catch((err) => {
          // The old socket's seat may not have flipped to "disconnected" yet
          // server-side when a flaky connection reconnects fast - give that
          // a moment and retry before giving up on the saved session.
          if (retriesLeft > 0 && /already active/i.test(err.message)) {
            setTimeout(() => attemptAutoRejoin(retriesLeft - 1), 1500);
          } else {
            clearSession();
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
      if (payload.room) joinedRef.current = true;
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
  const handleStart = (bustThreshold) => runAction('room:start', { bustThreshold });
  const handleAddBot = (difficulty) => runAction('room:addBot', { difficulty });
  const handleRemoveBot = (botId) => runAction('room:removeBot', { botId });
  const handleNextRound = () => runAction('room:nextRound', {});
  const handleDiscard = (cardIds) => runAction('game:discard', { cardIds });
  const handleDraw = (source, cardId) => runAction('game:draw', { source, cardId });
  const handleCall = () => runAction('game:call', {});
  const handleRpsChoice = (move) => runAction('game:rpsChoice', { move });

  if (!connected) {
    return (
      <div className="app-shell">
        <div className="panel">
          <p>Connecting to server&hellip;</p>
        </div>
      </div>
    );
  }

  if (!state.room) {
    return (
      <div className="app-shell">
        <Lobby onCreate={handleCreate} onJoin={handleJoin} error={error} busy={busy} />
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
        error={error}
      />
    </div>
  );
}

export default App;
