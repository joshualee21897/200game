const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED_SUITS = new Set(['H', 'D']);

export function suitSymbol(suit) {
  return SUIT_SYMBOL[suit] || '';
}

export function isRed(card) {
  return RED_SUITS.has(card.suit);
}
