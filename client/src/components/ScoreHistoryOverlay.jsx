function nameFor(room, id) {
  return room.seats.find((s) => s.id === id)?.name || 'Someone';
}

function outcomeLabel(outcome) {
  if (outcome === 'win') return '🏆 Win';
  if (outcome === 'push') return '🤝 Push';
  return '⚠️ Wrong call';
}

export default function ScoreHistoryOverlay({ game, room, onClose }) {
  const history = game.roundHistory || [];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div className="instructions-header">
          <h2>Score History</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close score history">
            &times;
          </button>
        </div>

        {history.length === 0 ? (
          <p className="subtitle">No rounds completed yet - scores will show up here after the first call.</p>
        ) : (
          <div className="history-table-wrap">
            <table className="result-table history-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Caller</th>
                  {room.seats.map((s) => (
                    <th key={s.id}>{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.roundNumber}>
                    <td>{r.roundNumber}</td>
                    <td>
                      {nameFor(room, r.callerId)}
                      <div className="history-outcome">{outcomeLabel(r.outcome)}</div>
                    </td>
                    {room.seats.map((s) => {
                      const delta = r.deltas[s.id];
                      const hitMilestone = r.milestoneHitPlayerIds?.includes(s.id);
                      return (
                        <td key={s.id}>
                          <span className={delta > 0 ? 'history-delta-add' : 'history-delta-zero'}>
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                          <div className="history-score-after">
                            {r.scoresAfter[s.id]} pts
                            {hitMilestone ? ' ✨' : ''}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
