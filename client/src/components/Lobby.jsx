import { useState } from 'react';
import InstructionsOverlay from './InstructionsOverlay';

export default function Lobby({ onCreate, onJoin, error, busy }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState('join');
  const [showInstructions, setShowInstructions] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (mode === 'create') onCreate(name.trim());
    else onJoin(name.trim(), roomCode.trim());
  }

  return (
    <div className="panel lobby-panel">
      <h1>200</h1>
      <p className="subtitle">A card game for 2-5 players. Keep your hand low, call when confident.</p>

      <div className="mode-toggle">
        <button type="button" className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>
          Join Room
        </button>
        <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>
          Create Room
        </button>
      </div>

      <form onSubmit={submit} className="lobby-form">
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Sam" />
        </label>

        {mode === 'join' && (
          <label>
            Room code
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={5}
              placeholder="ABCDE"
            />
          </label>
        )}

        {error && <div className="error-text">{error}</div>}

        <button type="submit" className="primary" disabled={busy}>
          {mode === 'create' ? 'Create Room' : 'Join Room'}
        </button>
      </form>

      <button type="button" className="secondary lobby-how-to-play" onClick={() => setShowInstructions(true)}>
        How to Play
      </button>

      {showInstructions && <InstructionsOverlay onClose={() => setShowInstructions(false)} />}
    </div>
  );
}
