import { suitSymbol, isRed } from '../cardDisplay';

export default function Card({ card, selected, disabled, onClick, faceDown, small }) {
  const baseClasses = [
    'card',
    small ? 'card-small' : '',
    disabled ? 'card-disabled' : '',
    onClick ? 'card-clickable' : '',
  ];

  if (faceDown) {
    const classes = [...baseClasses, 'card-back'].filter(Boolean).join(' ');
    return (
      <button type="button" className={classes} onClick={onClick} disabled={disabled}>
        <span className="card-back-pattern" aria-hidden="true" />
      </button>
    );
  }

  const isJoker = card.rank === 'JOKER';
  const suit = suitSymbol(card.suit);
  const classes = [...baseClasses, isJoker ? 'card-joker' : isRed(card) ? 'card-red' : 'card-black', selected ? 'card-selected' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} onClick={onClick} disabled={disabled}>
      {isJoker ? (
        <span className="card-joker-face">
          <span className="card-joker-star" aria-hidden="true">
            ★
          </span>
          <span className="card-joker-text">JOKER</span>
          <span className="card-joker-star" aria-hidden="true">
            ★
          </span>
        </span>
      ) : (
        <>
          <span className="card-corner card-corner-top">
            <span className="card-corner-rank">{card.rank}</span>
            <span className="card-corner-suit">{suit}</span>
          </span>
          <span className="card-center-suit" aria-hidden="true">
            {suit}
          </span>
          <span className="card-corner card-corner-bottom">
            <span className="card-corner-rank">{card.rank}</span>
            <span className="card-corner-suit">{suit}</span>
          </span>
        </>
      )}
    </button>
  );
}
