import { useEffect, useState } from 'react';

export default function Timer({ deadline }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (!deadline) return null;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className={`timer ${remaining <= 10 ? 'timer-urgent' : ''}`}>{remaining}s</span>;
}
