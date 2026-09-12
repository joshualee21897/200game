import { useEffect, useState } from 'react';

export default function Timer({ remainingMs, turnDeadline }) {
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
    //
    // Keyed on turnDeadline too, not just remainingMs: remainingMs is
    // computed on the server immediately after turnDeadline is set, so at
    // the start of practically every fresh turn it reads as the same
    // ~30000 - and since that's the exact same primitive value React
    // compares in the dependency array, an effect keyed on remainingMs
    // alone would silently skip re-anchoring turn after turn (they all
    // "look like" no change), leaving the display counting down from
    // whichever turn happened to set the very first anchor. turnDeadline
    // is a real absolute timestamp that differs for every turn, so it
    // can't collide the same way - remainingMs stays in the array too so a
    // *paused* turn (turnDeadline null the whole time) still re-anchors if
    // the frozen remaining time itself changes, e.g. the same player comes
    // up again while still away.
    setLocalDeadline(remainingMs == null ? null : Date.now() + remainingMs);
  }, [remainingMs, turnDeadline]);

  if (localDeadline == null) return null;
  const remaining = Math.max(0, Math.ceil((localDeadline - now) / 1000));
  return <span className={`timer ${remaining <= 10 ? 'timer-urgent' : ''}`}>{remaining}s</span>;
}
