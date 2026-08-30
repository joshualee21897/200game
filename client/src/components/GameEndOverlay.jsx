import Confetti from './Confetti';

function listNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function GameEndOverlay({ game, room, playerId }) {
  const result = game.finalResult;
  const bustedIds = result.bustedPlayerIds || [];
  const bustedNames = bustedIds.map((id) => room.seats.find((s) => s.id === id)?.name).filter(Boolean);
  const winnerName = room.seats.find((s) => s.id === result.winnerId)?.name;
  const isWinner = playerId === result.winnerId;
  const isBusted = bustedIds.includes(playerId);

  const bustBeVerb = bustedNames.length > 1 ? 'are' : 'is';

  let rank = 0;

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
          {listNames(bustedNames)} busted past {game.bustThreshold} and {bustBeVerb} out.
          {winnerName ? ` ${winnerName} finishes with the lowest score.` : ' No one is left standing!'}
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
            {result.standings.map((s) => {
              if (!s.busted) rank += 1;
              return (
                <tr key={s.id} className={`${s.id === playerId ? 'row-you' : ''} ${s.busted ? 'row-busted' : ''}`}>
                  <td>{s.busted ? '—' : rank}</td>
                  <td>{s.name}</td>
                  <td>
                    {s.score}
                    {s.busted ? ' (busted)' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="subtitle">Start a new room to play again.</p>
      </div>
    </div>
  );
}
