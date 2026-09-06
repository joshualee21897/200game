import { useEffect, useState } from 'react';
import Card from './Card';
import Confetti from './Confetti';

function nameFor(room, id) {
  return room.seats.find((s) => s.id === id)?.name || 'Someone';
}

function listNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function outcomeText(result, room) {
  const callerName = nameFor(room, result.callerId);
  if (result.outcome === 'win') {
    return `${callerName} won the round!`;
  }
  if (result.outcome === 'push') {
    const tierNames = result.tiedWithCaller.map((id) => nameFor(room, id));
    return `${callerName} called and tied with ${listNames(tierNames)} — a push, no points for either!`;
  }
  const lowestNames = (result.lowestOtherIds || []).map((id) => nameFor(room, id));
  const verb = lowestNames.length > 1 ? 'win' : 'wins';
  return `${callerName} called wrongly — 30 point penalty! ${listNames(lowestNames)} ${verb} the round with the lowest hand and adds nothing.`;
}

function ClownBanner({ name }) {
  return (
    <div className="clown-banner">
      <span className="clown-emoji" aria-hidden="true">
        🤡
      </span>
      <span className="clown-text">Jokes on you, {name}!</span>
    </div>
  );
}

// A much bigger version of the clown, shown to EVERY player at the table
// (not just whoever made the wrong call) - it covers the round-end panel
// and result table entirely at first, with the wrong caller's name front
// and center on it, and tapping it dismisses the clown to reveal the
// actual results underneath.
function BigClown({ name, onDismiss }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onDismiss();
    }
  }

  return (
    <div
      className="big-clown-layer"
      onClick={onDismiss}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Dismiss to see the round results"
    >
      <span className="big-clown-name">{name}</span>
      <div className="big-clown-emoji-wrap">
        <span className="big-clown-emoji" aria-hidden="true">
          🤡
        </span>
      </div>
      <span className="big-clown-hint">Tap the clown to see the results</span>
    </div>
  );
}

// The celebratory counterpart to the big clown - shown to every player
// when someone lands on a milestone rebate, with their name(s) front and
// center. Tapping it dismisses the celebration to reveal the results.
function BigCelebration({ names, onDismiss }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onDismiss();
    }
  }

  return (
    <div
      className="big-celebration-layer"
      onClick={onDismiss}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Dismiss to see the round results"
    >
      <span className="big-celebration-name">{listNames(names)}</span>
      <div className="big-celebration-emoji-wrap">
        <span className="big-celebration-emoji" aria-hidden="true">
          🎉
        </span>
      </div>
      <span className="big-celebration-hint">Tap to see the results</span>
    </div>
  );
}

function MilestoneBanner({ names }) {
  return (
    <div className="milestone-banner">
      <span className="milestone-burst" aria-hidden="true">
        <span className="milestone-star">✨</span>
        <span className="milestone-star">🌟</span>
        <span className="milestone-star">✨</span>
      </span>
      <span className="milestone-text">Milestone bonus for {listNames(names)} — 50 points shaved off!</span>
    </div>
  );
}

export default function RoundEndOverlay({ game, room, playerId, onNextRound }) {
  const result = game.roundResult;
  const milestoneNames = (result.milestoneHitPlayerIds || []).map((id) => nameFor(room, id));
  const [clownDismissed, setClownDismissed] = useState(false);
  const [celebrationDismissed, setCelebrationDismissed] = useState(false);

  // A fresh round-end always starts with the clown/celebration showing
  // again - dismissing either is per-round, not permanent.
  useEffect(() => {
    setClownDismissed(false);
    setCelebrationDismissed(false);
  }, [game.roundNumber]);

  // Every player at the table sees the big clown when someone calls
  // wrongly, not just whoever made the bad call. If a milestone also hits
  // the same round, the celebration takeover follows right after the
  // clown is dismissed, so one big moment is revealed at a time.
  const showBigClown = result.outcome === 'wrong_call' && !clownDismissed;
  const showBigCelebration = !showBigClown && milestoneNames.length > 0 && !celebrationDismissed;

  return (
    <div className="overlay">
      {result.outcome === 'win' && <Confetti count={40} />}
      {showBigClown && <BigClown name={nameFor(room, result.callerId)} onDismiss={() => setClownDismissed(true)} />}
      {showBigCelebration && (
        <BigCelebration names={milestoneNames} onDismiss={() => setCelebrationDismissed(true)} />
      )}
      <div className="overlay-panel">
        <h2>Round {game.roundNumber} Result</h2>
        {result.outcome === 'wrong_call' && <ClownBanner name={nameFor(room, result.callerId)} />}
        {milestoneNames.length > 0 && <MilestoneBanner names={milestoneNames} />}
        <p className="outcome-line">{outcomeText(result, room)}</p>

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
                  <td>
                    {s.name}
                    {s.id === result.callerId && <span className="badge">Caller</span>}
                  </td>
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
