const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED_SUITS = new Set(['H', 'D']);

export function suitSymbol(suit) {
  return SUIT_SYMBOL[suit] || '';
}

export function isRed(card) {
  return RED_SUITS.has(card.suit);
}

export function cardLabel(card) {
  if (card.rank === 'JOKER') return 'JOKER';
  return `${card.rank}${suitSymbol(card.suit)}`;
}
