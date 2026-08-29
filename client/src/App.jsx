import { useCallback, useEffect, useState } from 'react';
import './App.css';
import { socket, call } from './socket';
import Lobby from './components/Lobby';
import WaitingRoom from './components/WaitingRoom';
import Table from './components/Table';

function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [state, setState] = useState({ room: null, game: null, hand: null, yourPlayerId: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
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
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
    };
  }, []);

  const runAction = useCallback(async (event, payload) => {
    setError('');
    setBusy(true);
    try {
      await call(event, payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCreate = (name) => runAction('room:create', { name });
  const handleJoin = (name, roomCode) => runAction('room:join', { name, roomCode });
  const handleStart = () => runAction('room:start', {});
  const handleNextRound = () => runAction('room:nextRound', {});
  const handleDiscard = (cardIds) => runAction('game:discard', { cardIds });
  const handleDraw = (source) => runAction('game:draw', { source });
  const handleCall = () => runAction('game:call', {});

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
        error={error}
      />
    </div>
  );
}

export default App;
