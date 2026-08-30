import { RPS_MOVES } from './gameEngine.js';

// Bot strategy is intentionally simple - it plays reasonably, not
// optimally, since it can't see other players' hands and this is meant
// for casual solo/practice play rather than a serious opponent.

export function chooseBotRpsMove() {
  return RPS_MOVES[Math.floor(Math.random() * RPS_MOVES.length)];
}

/**
 * Groups same-rank cards (2-4 of a kind, jokers excluded - they can't
 * meld) as candidate multi-card discards, picking whichever legal group
 * sheds the most value this turn. Falls back to the single highest-value
 * card when no meld is available. Same-suit runs aren't considered - a
 * reasonable simplification for a casual bot.
 */
export function chooseBotDiscard(hand) {
  const byRank = new Map();
  for (const c of hand) {
    if (c.rank === 'JOKER') continue;
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank).push(c);
  }

  let best = null;
  for (const group of byRank.values()) {
    if (group.length < 2) continue;
    const value = group.reduce((sum, c) => sum + c.value, 0);
    if (!best || value > best.value) best = { cards: group, value };
  }
  if (best) return best.cards.map((c) => c.id);

  const highest = hand.reduce((max, c) => (c.value > max.value ? c : max), hand[0]);
  return [highest.id];
}

// A call requires hand value <= 5; bots take that chance whenever it's
// available rather than trying to judge how safe it is against hands they
// can't see.
export function shouldBotCall(handValue) {
  return handValue <= 5;
}

/**
 * Prefers grabbing a low-value card sitting face-up on the discard pile
 * over the gamble of the face-down draw pile, but only when it's cheap
 * enough (<=3) to be clearly worth it; otherwise draws blind.
 */
export function chooseBotDrawSource(pickableGroup) {
  if (pickableGroup.length > 0) {
    const lowest = pickableGroup.reduce((min, c) => (c.value < min.value ? c : min), pickableGroup[0]);
    if (lowest.value <= 3) return { source: 'discard', cardId: lowest.id };
  }
  return { source: 'pile', cardId: undefined };
}
