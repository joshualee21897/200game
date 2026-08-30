import { useState } from 'react';
import InstructionsOverlay from './InstructionsOverlay';

const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

function difficultyLabel(id) {
  return DIFFICULTIES.find((d) => d.id === id)?.label || 'Medium';
}

export default function WaitingRoom({ room, playerId, onStart, onAddBot, onRemoveBot, error, busy }) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [difficulty, setDifficulty] = useState('medium');
  const isHost = room.hostId === playerId;
  const canStart = room.seats.length >= 2 && room.seats.length <= 10;
  const canAddBot = room.seats.length < 10;

  return (
    <div className="panel">
      <h2>Room {room.code}</h2>
      <p className="subtitle">Share this code with friends so they can join - or add a computer player and start solo.</p>

      <ul className="seat-list">
        {room.seats.map((s) => (
          <li key={s.id} className={s.connected ? '' : 'seat-disconnected'}>
            {s.name}
            {s.isBot && (
              <span className="badge badge-bot">
                🤖 Bot &middot; {difficultyLabel(s.botDifficulty)}
              </span>
            )}
            {s.id === room.hostId && <span className="badge">Host</span>}
            {s.id === playerId && <span className="badge badge-you">You</span>}
            {!s.connected && <span className="badge badge-warn">Disconnected</span>}
            {isHost && s.isBot && (
              <button type="button" className="icon-button seat-remove" onClick={() => onRemoveBot(s.id)} title="Remove bot">
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && <div className="error-text">{error}</div>}

      <div className="waiting-room-actions">
        {isHost ? (
          <>
            <button type="button" className="primary" onClick={onStart} disabled={!canStart || busy}>
              Start Game {room.seats.length < 2 ? '(need at least 2 players)' : ''}
            </button>
            <div className="bot-difficulty-picker">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={difficulty === d.id ? 'active' : ''}
                  onClick={() => setDifficulty(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button type="button" className="secondary" onClick={() => onAddBot(difficulty)} disabled={!canAddBot || busy}>
              Add Bot
            </button>
          </>
        ) : (
          <p>Waiting for the host to start the game&hellip;</p>
        )}
        <button type="button" className="secondary" onClick={() => setShowInstructions(true)}>
          How to Play
        </button>
      </div>

      {showInstructions && <InstructionsOverlay onClose={() => setShowInstructions(false)} />}
    </div>
  );
}
