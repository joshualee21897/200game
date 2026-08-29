import Card from './Card';

const OUTCOME_LABEL = {
  win: 'won the round!',
  tie: 'tied the caller — no bonus for the caller.',
  wrong_call: 'called wrongly — 30 point penalty!',
};

export default function RoundEndOverlay({ game, room, playerId, onNextRound }) {
  const result = game.roundResult;

  return (
    <div className="overlay">
      <div className="overlay-panel">
        <h2>Round {game.roundNumber} Result</h2>
        <p className="outcome-line">{OUTCOME_LABEL[result.outcome]}</p>

        <table className="result-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Hand</th>
              <th>Value</th>
              <th>+/-</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {room.seats.map((s) => {
              const v = result.values.find((x) => x.id === s.id);
              const delta = result.deltas[s.id];
              return (
                <tr key={s.id} className={s.id === playerId ? 'row-you' : ''}>
                  <td>{s.name}</td>
                  <td className="hand-cell">
                    {(result.hands[s.id] || []).map((c) => (
                      <Card key={c.id} card={c} small />
                    ))}
                  </td>
                  <td>{v?.value}</td>
                  <td>{delta > 0 ? `+${delta}` : delta}</td>
                  <td>{result.scoresAfter[s.id]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="subtitle">
          Next round starts with {room.seats.find((s) => s.id === result.nextStarterId)?.name}.
        </p>
        <button type="button" className="primary" onClick={onNextRound}>
          Next Round
        </button>
      </div>
    </div>
  );
}
