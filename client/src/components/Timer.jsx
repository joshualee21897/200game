import { useEffect, useState } from 'react';

export default function Timer({ remainingMs }) {
  const [now, setNow] = useState(Date.now());
  const [localDeadline, setLocalDeadline] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Anchored to our own clock at the moment this remaining-time snapshot
    // arrives, rather than trusting the server's absolute deadline
    // timestamp directly - a client whose system clock doesn't match the
    // server's would otherwise show the wrong countdown from the start
    // (seconds lost or gained equal to however far off the clocks are).
    setLocalDeadline(remainingMs == null ? null : Date.now() + remainingMs);
  }, [remainingMs]);

  if (localDeadline == null) return null;
  const remaining = Math.max(0, Math.ceil((localDeadline - now) / 1000));
  return <span className={`timer ${remaining <= 10 ? 'timer-urgent' : ''}`}>{remaining}s</span>;
}
