export function handValue(cards) {
  return cards.reduce((sum, c) => sum + c.value, 0);
}
