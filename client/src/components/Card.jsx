import { cardLabel, isRed } from '../cardDisplay';

export default function Card({ card, selected, disabled, onClick, faceDown, small }) {
  const classes = [
    'card',
    faceDown ? 'card-back' : card.rank === 'JOKER' ? 'card-joker' : isRed(card) ? 'card-red' : 'card-black',
    small ? 'card-small' : '',
    selected ? 'card-selected' : '',
    disabled ? 'card-disabled' : '',
    onClick ? 'card-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} onClick={onClick} disabled={disabled}>
      {!faceDown && <span className="card-label">{cardLabel(card)}</span>}
    </button>
  );
}
