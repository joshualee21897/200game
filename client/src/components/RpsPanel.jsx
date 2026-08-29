const MOVES = [
  { id: 'rock', label: 'Rock', icon: '✊' },
  { id: 'paper', label: 'Paper', icon: '✋' },
  { id: 'scissors', label: 'Scissors', icon: '✌️' },
];

function nameFor(room, id) {
  return room.seats.find((s) => s.id === id)?.name || 'Someone';
}

export default function RpsPanel({ room, game, playerId, onChoose }) {
  const rps = game.rps;
  const isActive = rps.active.includes(playerId);
  const hasSubmitted = rps.submitted.includes(playerId);
  const canChoose = isActive && !hasSubmitted;

  return (
    <div className="table rps-table">
      <div className="rps-header">
        <h2>Who goes first?</h2>
        <p className="subtitle">
          {rps.active.length === room.seats.length
            ? 'Rock-paper-scissors decides who opens round 1.'
            : `Throw-off continues between ${rps.active.map((id) => nameFor(room, id)).join(' and ')}.`}
        </p>
      </div>

      <div className="rps-players">
        {rps.active.map((id) => (
          <div key={id} className={`rps-player-chip ${rps.submitted.includes(id) ? 'rps-player-ready' : ''}`}>
            {nameFor(room, id)}
            {id === playerId && <span className="badge badge-you">You</span>}
            <span className="rps-player-status">{rps.submitted.includes(id) ? 'Locked in' : 'Choosing…'}</span>
          </div>
        ))}
      </div>

      {isActive ? (
        <div className="rps-choices">
          {MOVES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="rps-choice-button"
              disabled={!canChoose}
              onClick={() => onChoose(m.id)}
            >
              <span className="rps-choice-icon">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rps-header">
          <p className="subtitle">You've been eliminated from the throw-off &mdash; waiting to see who starts.</p>
        </div>
      )}

      {rps.lastRound && (
        <div className="rps-last-round">
          <div className="rps-last-round-title">
            {rps.lastRound.tie ? "It's a tie — throw again!" : 'Last throw:'}
          </div>
          <div className="rps-last-round-choices">
            {Object.entries(rps.lastRound.choices).map(([id, move]) => (
              <span key={id} className={`rps-last-choice ${rps.lastRound.eliminated.includes(id) ? 'rps-eliminated' : ''}`}>
                {nameFor(room, id)}: {MOVES.find((m) => m.id === move)?.icon} {move}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
