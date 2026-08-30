import { RPS_MOVES } from './gameEngine.js';
import { RANK_ORDER } from './cards.js';

// Bot strategy is intentionally simple - it plays reasonably, not
// optimally, since it can't see other players' hands and this is meant
// for casual solo/practice play rather than a serious opponent. Three
// difficulty tiers ('easy' | 'medium' | 'hard') tune how well it sheds
// value and how readily it takes cards from the discard pile; RPS is left
// untiered since there's no meaningful skill to apply there.

export function chooseBotRpsMove() {
  return RPS_MOVES[Math.floor(Math.random() * RPS_MOVES.length)];
}

/**
 * Same-suit runs of 3+ consecutive cards (Ace low, no jokers) - only the
 * maximal run per suit is returned, not every sub-run within it, since a
 * greedy value-maximizing bot always prefers shedding the biggest chunk it
 * can anyway. Duplicate ranks in the same suit (possible in 6-10 player,
 * two-deck games) just end a streak early rather than breaking run-finding.
 */
function findRuns(hand) {
  const bySuit = new Map();
  for (const c of hand) {
    if (c.rank === 'JOKER') continue;
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
    bySuit.get(c.suit).push(c);
  }

  const runs = [];
  for (const cards of bySuit.values()) {
    const sorted = [...cards].sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));
    let streak = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prevIdx = RANK_ORDER.indexOf(streak[streak.length - 1].rank);
      const curIdx = RANK_ORDER.indexOf(sorted[i].rank);
      if (curIdx === prevIdx + 1) {
        streak.push(sorted[i]);
      } else if (curIdx !== prevIdx) {
        if (streak.length >= 3) runs.push(streak);
        streak = [sorted[i]];
      }
    }
    if (streak.length >= 3) runs.push(streak);
  }
  return runs;
}

/**
 * Picks a discard. Medium/hard find every legal same-rank group (2-4 of a
 * kind, jokers excluded) - hard also looks for same-suit runs - and take
 * whichever option sheds the most value, falling back to the single
 * highest-value card. Easy just throws away a random card, missing melds
 * entirely, which is the main thing that makes it weaker.
 */
export function chooseBotDiscard(hand, difficulty = 'medium') {
  if (difficulty === 'easy') {
    const pick = hand[Math.floor(Math.random() * hand.length)];
    return [pick.id];
  }

  const candidates = [];
  const byRank = new Map();
  for (const c of hand) {
    if (c.rank === 'JOKER') continue;
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank).push(c);
  }
  for (const group of byRank.values()) {
    if (group.length >= 2) candidates.push(group);
  }
  if (difficulty === 'hard') candidates.push(...findRuns(hand));

  let best = null;
  for (const cards of candidates) {
    const value = cards.reduce((sum, c) => sum + c.value, 0);
    if (!best || value > best.value) best = { cards, value };
  }
  if (best) return best.cards.map((c) => c.id);

  const highest = hand.reduce((max, c) => (c.value > max.value ? c : max), hand[0]);
  return [highest.id];
}

// A call requires hand value <= 5. Easy plays it safe and only calls when
// very low, missing riskier-but-legal chances; medium and hard both take
// every legal chance since there's no visibility into other hands to
// judge risk more finely than that.
export function shouldBotCall(handValue, difficulty = 'medium') {
  if (difficulty === 'easy') return handValue <= 2;
  return handValue <= 5;
}

/**
 * Prefers grabbing a low-value card sitting face-up on the discard pile
 * over the gamble of the face-down draw pile. Hard is willing to take a
 * pricier pickable card (<=5) than medium (<=3); easy never looks at the
 * discard pile at all.
 */
export function chooseBotDrawSource(pickableGroup, difficulty = 'medium') {
  if (difficulty === 'easy') return { source: 'pile', cardId: undefined };
  const threshold = difficulty === 'hard' ? 5 : 3;
  if (pickableGroup.length > 0) {
    const lowest = pickableGroup.reduce((min, c) => (c.value < min.value ? c : min), pickableGroup[0]);
    if (lowest.value <= threshold) return { source: 'discard', cardId: lowest.id };
  }
  return { source: 'pile', cardId: undefined };
}
