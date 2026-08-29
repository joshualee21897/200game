export default function GameEndOverlay({ game, room, playerId }) {
  const result = game.finalResult;
  const bustedName = room.seats.find((s) => s.id === result.bustedPlayerId)?.name;
  const winnerName = room.seats.find((s) => s.id === result.winnerId)?.name;

  return (
    <div className="overlay">
      <div className="overlay-panel">
        <h2>Game Over</h2>
        <p className="outcome-line">
          {bustedName} busted past 200 and is out.
          {winnerName && ` ${winnerName} finishes with the lowest score.`}
        </p>

        <table className="result-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {result.standings.map((s, i) => (
              <tr key={s.id} className={s.id === playerId ? 'row-you' : ''}>
                <td>{i + 1}</td>
                <td>{s.name}</td>
                <td>{s.score}</td>
              </tr>
            ))}
            <tr className="row-busted">
              <td>&mdash;</td>
              <td>{bustedName}</td>
              <td>busted</td>
            </tr>
          </tbody>
        </table>

        <p className="subtitle">Start a new room to play again.</p>
      </div>
    </div>
  );
}
