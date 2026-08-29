export default function InstructionsOverlay({ onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-panel instructions-panel" onClick={(e) => e.stopPropagation()}>
        <div className="instructions-header">
          <h2>How to Play &ldquo;200&rdquo;</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close instructions">
            &times;
          </button>
        </div>

        <section>
          <h3>Goal</h3>
          <p>
            Keep your hand value low. When you're confident it's low enough, call &mdash; if you're right, everyone
            else adds their hand value to their running score while you add nothing. Whoever busts past 200 first
            loses the game.
          </p>
        </section>

        <section>
          <h3>Card values</h3>
          <ul>
            <li>Number cards (2&ndash;10): face value</li>
            <li>Jack, Queen, King: 11 points each</li>
            <li>Ace: always 1 point</li>
            <li>Joker: 0 points, and can only ever be discarded on its own &mdash; it can't join a meld</li>
          </ul>
        </section>

        <section>
          <h3>Starting the game</h3>
          <p>
            Everyone throws rock-paper-scissors to decide who opens round 1. A tie, or all three moves appearing at
            once, just means a re-throw. From round 2 onward, whoever had the lowest hand value at the last reveal
            opens the next round.
          </p>
        </section>

        <section>
          <h3>Your turn</h3>
          <p>Each turn has two steps, and a 30-second clock &mdash; if you run out of time the server auto-plays for you.</p>
          <ol>
            <li>
              <strong>Discard</strong> a single card, or a valid meld: a pair/triple/quadruple of one rank, or a
              same-suit run of 3+ consecutive cards (Ace is low, so A-2-3 works but Q-K-A doesn't). You can even
              discard your entire hand this way &mdash; the draw right after always leaves you with at least 1 card.
            </li>
            <li>
              <strong>Draw</strong> one replacement card, either from the face-down draw pile, or from the discard
              pile. From the discard pile you can only take what the <em>previous</em> turn discarded &mdash; never
              the card(s) you just threw yourself. If the previous turn discarded a meld, every card in it is
              individually pickable (shown grouped together) until someone takes one.
            </li>
          </ol>
        </section>

        <section>
          <h3>Calling</h3>
          <p>You may call instead of discarding, but only if your current hand value is 5 or less. Then everyone reveals their hands:</p>
          <ul>
            <li><strong>You're strictly the lowest</strong> &mdash; you win the round and add 0. Everyone else adds their own hand value.</li>
            <li><strong>Someone ties your value</strong> &mdash; that player adds 0. You add your own hand value like a normal non-winner (you weren't strictly lowest).</li>
            <li><strong>Someone beats you</strong> &mdash; wrong call! You add a flat 30-point penalty. Everyone else adds their own hand value as normal.</li>
          </ul>
        </section>

        <section>
          <h3>Scoring &amp; busting</h3>
          <p>
            Running totals carry across rounds. Landing exactly on 50, 100, 150, or 200 rebates 50 points off your
            total. Going over 200 (without landing exactly on it) busts you out and ends the game &mdash; whoever has
            the lowest score among the rest is the winner.
          </p>
        </section>
      </div>
    </div>
  );
}
