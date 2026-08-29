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
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    // A saved session survives page reloads and lets us silently re-attach
    // to a still-held seat after the underlying socket drops and
    // reconnects (a flaky connection, not a deliberate "leave"). It's only
    // ever attempted when we don't already know we're in a room, so it
    // never interrupts someone actively using the app.
    function attemptAutoRejoin(retriesLeft = 2) {
      if (stateRef.current.room) return;
      const saved = loadSession();
      if (!saved) return;
      call('room:join', { name: saved.name, roomCode: saved.roomCode }).catch((err) => {
        // The old socket's seat may not have flipped to "disconnected" yet
        // server-side when a flaky connection reconnects fast - give that a
        // moment and retry before giving up on the saved session.
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
    }
    function onState(payload) {
      setState(payload);
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
  const handleStart = () => runAction('room:start', {});
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
        <WaitingRoom room={state.room} playerId={state.yourPlayerId} onStart={handleStart} error={error} busy={busy} />
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
