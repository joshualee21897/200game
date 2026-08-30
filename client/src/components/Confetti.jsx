import { useMemo } from 'react';

const CONFETTI_COLORS = ['#ffd257', '#58b95c', '#4fb0e0', '#f2665f', '#e0a934'];

export default function Confetti({ count = 70 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 0.7,
        duration: 2.2 + Math.random() * 1.4,
        drift: (Math.random() - 0.5) * 140,
        rotate: 360 + Math.random() * 360,
      })),
    [count]
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
