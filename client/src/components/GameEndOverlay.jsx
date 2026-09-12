import Confetti from './Confetti';

function listNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function GameEndOverlay({ game, room, playerId, onNextGame }) {
  const result = game.finalResult;
  const bustedIds = result.bustedPlayerIds || [];
  const bustedNames = bustedIds.map((id) => room.seats.find((s) => s.id === id)?.name).filter(Boolean);
  const winnerName = room.seats.find((s) => s.id === result.winnerId)?.name;
  const isWinner = playerId === result.winnerId;
  const isBusted = bustedIds.includes(playerId);

  const bustBeVerb = bustedNames.length > 1 ? 'are' : 'is';

  const seriesLength = room.seriesLength || 1;
  const seriesWins = room.seriesWins || {};
  const isSeries = seriesLength > 1;
  // Best of N is a race to a majority of the N games, not necessarily
  // playing all of them - e.g. best of 5 is decided the moment someone
  // reaches 3 wins.
  const seriesTarget = Math.ceil(seriesLength / 2);
  const seriesWinnerId = Object.keys(seriesWins).find((id) => seriesWins[id] >= seriesTarget);
  const seriesWinnerName = seriesWinnerId ? room.seats.find((s) => s.id === seriesWinnerId)?.name : null;
  const isHost = room.hostId === playerId;

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

        {isSeries && (
          <div className="series-standings">
            <h3>
              {seriesWinnerId ? 'Series Result' : `Best of ${seriesLength} · Game ${room.seriesGameNumber || 1}`}
            </h3>
            {seriesWinnerId && <p className="win-banner series-win-banner">🏆 {seriesWinnerName} wins the series!</p>}
            <ul className="series-wins-list">
              {room.seats.map((s) => (
                <li key={s.id} className={s.id === playerId ? 'row-you' : ''}>
                  <span>
                    {s.name}
                    {s.id === playerId ? ' (You)' : ''}
                  </span>
                  <span>
                    {seriesWins[s.id] ?? 0} win{(seriesWins[s.id] ?? 0) === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isSeries && !seriesWinnerId ? (
          isHost ? (
            <button type="button" className="primary" onClick={onNextGame}>
              Start Next Game
            </button>
          ) : (
            <p className="subtitle">Waiting for the host to start the next game&hellip;</p>
          )
        ) : (
          <p className="subtitle">Start a new room to play again.</p>
        )}
      </div>
    </div>
  );
}
