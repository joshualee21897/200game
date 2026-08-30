import Confetti from './Confetti';

export default function GameEndOverlay({ game, room, playerId }) {
  const result = game.finalResult;
  const bustedName = room.seats.find((s) => s.id === result.bustedPlayerId)?.name;
  const winnerName = room.seats.find((s) => s.id === result.winnerId)?.name;
  const isWinner = playerId === result.winnerId;
  const isBusted = playerId === result.bustedPlayerId;

  return (
    <div className="overlay">
      {isWinner && <Confetti count={70} />}
      <div className="overlay-panel">
        <h2>Game Over</h2>

        {isWinner && <p className="win-banner">🎉 You Won! 🎉</p>}
        {isBusted && (
          <>
            <div className="bust-animation" aria-hidden="true">
              <span className="bust-balloon">🎈</span>
              <span className="bust-shard">💥</span>
            </div>
            <p className="lose-banner">You Lose!</p>
          </>
        )}

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
