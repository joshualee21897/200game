const SUITS = ['S', 'H', 'D', 'C'];
// Ace ranks low (matches its point value of 1) for both value lookup and run sequencing.
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function rankValue(rank) {
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 11;
  return Number(rank);
}

export function createDeck(deckCount = 1) {
  const cards = [];
  let jokerCounter = 0;
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) {
      for (const rank of RANK_ORDER) {
        // Card ids must stay unique even when multiple decks are combined
        // (6-10 player games) - only suffix them when there's more than one
        // deck, so single-deck ids (and everything keyed off them, like
        // existing tests/fixtures) are unchanged.
        const id = deckCount > 1 ? `${rank}${suit}-${d + 1}` : `${rank}${suit}`;
        cards.push({ id, rank, suit, value: rankValue(rank) });
      }
    }
    for (let i = 0; i < 4; i++) {
      jokerCounter += 1;
      cards.push({ id: `JOKER${jokerCounter}`, rank: 'JOKER', suit: null, value: 0 });
    }
  }
  return cards;
}

export function shuffle(cards, rng = Math.random) {
  const arr = cards.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function handValue(cards) {
  return cards.reduce((sum, c) => sum + c.value, 0);
}

/**
 * Validates a proposed discard: a single card, or a same-rank meld (2-4
 * cards, no jokers), or a same-suit run of >=3 consecutive cards (no
 * jokers - they cannot substitute as wilds).
 */
export function isValidDiscard(cards) {
  if (!cards || cards.length === 0) return false;
  if (cards.length === 1) return true;

  const hasJoker = cards.some((c) => c.rank === 'JOKER');
  if (hasJoker) return false; // jokers are standalone only

  const sameRank = cards.every((c) => c.rank === cards[0].rank);
  if (sameRank) return cards.length >= 2 && cards.length <= 4;

  if (cards.length < 3) return false;
  const sameSuit = cards.every((c) => c.suit === cards[0].suit);
  if (!sameSuit) return false;

  const indices = cards.map((c) => RANK_ORDER.indexOf(c.rank)).sort((a, b) => a - b);
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) return false;
  }
  return true;
}

export { SUITS, RANK_ORDER };
