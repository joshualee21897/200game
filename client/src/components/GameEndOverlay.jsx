import { useMemo } from 'react';

const CONFETTI_COLORS = ['#ffd257', '#58b95c', '#4fb0e0', '#f2665f', '#e0a934'];

function ConfettiLayer() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 0.7,
        duration: 2.2 + Math.random() * 1.4,
        drift: (Math.random() - 0.5) * 140,
        rotate: 360 + Math.random() * 360,
      })),
    []
  );

  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--drift': `${p.drift}px`,
            '--rotate': `${p.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}

export default function GameEndOverlay({ game, room, playerId }) {
  const result = game.finalResult;
  const bustedName = room.seats.find((s) => s.id === result.bustedPlayerId)?.name;
  const winnerName = room.seats.find((s) => s.id === result.winnerId)?.name;
  const isWinner = playerId === result.winnerId;
  const isBusted = playerId === result.bustedPlayerId;

  return (
    <div className="overlay">
      {isWinner && <ConfettiLayer />}
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
