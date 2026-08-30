import Card from './Card';

const c = (id, rank, suit) => ({ id, rank, suit });

const VALUE_EXAMPLES = [
  { card: c('7D', '7', 'D'), label: '7 points' },
  { card: c('KS', 'K', 'S'), label: '11 points' },
  { card: c('AH', 'A', 'H'), label: '1 point' },
  { card: c('J1', 'JOKER', null), label: '0 points' },
];

const VALID_MELD = [c('7D', '7', 'D'), c('7S', '7', 'S'), c('7C', '7', 'C')];
const INVALID_MELD = [c('7D', '7', 'D'), c('8S', '8', 'S')];
const VALID_RUN = [c('4H', '4', 'H'), c('5H', '5', 'H'), c('6H', '6', 'H')];

const CALL_OK_HAND = [c('AC', 'A', 'C'), c('2D', '2', 'D')];
const CALL_BAD_HAND = [c('KH', 'K', 'H'), c('9S', '9', 'S')];

const PICKABLE_MELD = [c('7D', '7', 'D'), c('7S', '7', 'S'), c('7C', '7', 'C')];
const PENDING_THROW = [c('9C', '9', 'C')];

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
        <p className="subtitle">Keep your hand value low. Call when you're confident. Don't bust past 200.</p>

        <section>
          <h3>Card values</h3>
          <div className="demo-strip">
            {VALUE_EXAMPLES.map(({ card, label }) => (
              <div key={card.id} className="demo-card-item">
                <Card card={card} />
                <span className="demo-card-caption">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3>Who goes first?</h3>
          <div className="demo-row">
            <span className="rps-choice-icon">✊</span>
            <span className="rps-choice-icon">✋</span>
            <span className="rps-choice-icon">✌️</span>
            <span className="demo-arrow">&rarr;</span>
            <span className="demo-caption demo-caption-inline">
              Rock-paper-scissors picks who opens round 1. Ties re-throw. Later rounds: lowest hand from the last
              reveal opens.
            </span>
          </div>
        </section>

        <section>
          <h3>Your turn, step 1: discard</h3>
          <div className="demo-row">
            <div className="demo-box">
              <div className="demo-cards">
                {VALID_MELD.map((card) => (
                  <Card key={card.id} card={card} />
                ))}
              </div>
              <span className="demo-verdict demo-verdict-ok">&#10003; pair/triple/quad</span>
            </div>
            <div className="demo-box">
              <div className="demo-cards">
                {VALID_RUN.map((card) => (
                  <Card key={card.id} card={card} />
                ))}
              </div>
              <span className="demo-verdict demo-verdict-ok">&#10003; same-suit run of 3+</span>
            </div>
            <div className="demo-box demo-box-invalid">
              <div className="demo-cards">
                {INVALID_MELD.map((card) => (
                  <Card key={card.id} card={card} />
                ))}
              </div>
              <span className="demo-verdict demo-verdict-bad">&#10007; mismatched cards</span>
            </div>
          </div>
          <p className="demo-caption">
            A single card is always fine too &mdash; and you can even discard your whole hand this way, since the
            draw right after always leaves you at least 1 card.
          </p>
        </section>

        <section>
          <h3>Your turn, step 2: draw</h3>
          <div className="demo-row">
            <div className="pile">
              <div className="pile-label">Discard pile</div>
              <div className="discard-stack">
                <div className="discard-group discard-group-meld">
                  {PICKABLE_MELD.map((card) => (
                    <Card key={card.id} card={card} small />
                  ))}
                </div>
                <div className="discard-pending">
                  {PENDING_THROW.map((card) => (
                    <Card key={card.id} card={card} small disabled />
                  ))}
                </div>
              </div>
            </div>
            <span className="demo-arrow">&rarr;</span>
            <span className="demo-caption demo-caption-inline">
              The dim card on top is what <em>you</em> just threw &mdash; never pickable. Everything the{' '}
              <em>previous</em> turn discarded is fair game; if it was a meld, take any one card from the group.
            </span>
          </div>
        </section>

        <section>
          <h3>Calling</h3>
          <div className="demo-row">
            <div className="demo-box">
              <div className="demo-cards">
                {CALL_OK_HAND.map((card) => (
                  <Card key={card.id} card={card} />
                ))}
              </div>
              <span className="demo-verdict demo-verdict-ok">&#10003; value 3 &mdash; can call</span>
            </div>
            <div className="demo-box demo-box-invalid">
              <div className="demo-cards">
                {CALL_BAD_HAND.map((card) => (
                  <Card key={card.id} card={card} />
                ))}
              </div>
              <span className="demo-verdict demo-verdict-bad">&#10007; value 20 &mdash; too high</span>
            </div>
          </div>
          <p className="demo-caption">Hand value 5 or less to call. Then everyone reveals:</p>
          <ul>
            <li>
              <strong>You're strictly lowest</strong> &mdash; you add 0, everyone else adds their hand value.
            </li>
            <li>
              <strong>Someone ties you for lowest</strong> &mdash; a push, like tying the dealer: neither of you adds
              anything, but anyone else at the table still adds their own value as normal.
            </li>
            <li>
              <strong>Someone beats you</strong> &mdash; wrong call! You add a flat 30-point penalty instead of your
              hand value. Only whoever has the single lowest hand adds nothing (they've effectively won the round for
              you); everyone else who merely had a lower hand than you &mdash; without being the overall lowest &mdash;
              still adds their own value.
            </li>
          </ul>
        </section>

        <section>
          <h3>Scoring &amp; busting</h3>
          <div className="demo-scale">
            <div className="demo-scale-step demo-scale-rebate">50</div>
            <span className="demo-arrow">&rarr;</span>
            <div className="demo-scale-step demo-scale-rebate">100</div>
            <span className="demo-arrow">&rarr;</span>
            <div className="demo-scale-step demo-scale-rebate">150</div>
            <span className="demo-arrow">&rarr;</span>
            <div className="demo-scale-step demo-scale-rebate">200</div>
            <span className="demo-arrow">&rarr;</span>
            <div className="demo-scale-step demo-scale-bust">201+</div>
          </div>
          <p className="demo-caption">
            Landing exactly on 50/100/150/200 rebates 50 points off your total. Going over 200 without landing on it
            busts you &mdash; game over, lowest remaining score wins.
          </p>
        </section>
      </div>
    </div>
  );
}
