import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RPS_MOVES } from '../src/gameEngine.js';
import { chooseBotRpsMove, chooseBotDiscard, shouldBotCall, chooseBotDrawSource } from '../src/bot.js';
import { createDeck } from '../src/cards.js';

function cardsById() {
  return Object.fromEntries(createDeck().map((c) => [c.id, c]));
}

test('chooseBotRpsMove always returns a legal move', () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(RPS_MOVES.includes(chooseBotRpsMove()));
  }
});

test('chooseBotDiscard prefers the highest-value same-rank group over a single card', () => {
  const byId = cardsById();
  const hand = [byId['9S'], byId['9H'], byId['2C'], byId['KS']];
  const result = chooseBotDiscard(hand);
  assert.deepEqual(new Set(result), new Set(['9S', '9H']));
});

test('chooseBotDiscard picks the higher-value group when multiple groups exist', () => {
  const byId = cardsById();
  const hand = [byId['3S'], byId['3H'], byId['9C'], byId['9D']];
  const result = chooseBotDiscard(hand);
  assert.deepEqual(new Set(result), new Set(['9C', '9D']));
});

test('chooseBotDiscard falls back to the single highest-value card with no melds', () => {
  const byId = cardsById();
  const hand = [byId['2S'], byId['KH'], byId['5C'], byId['JOKER1']];
  const result = chooseBotDiscard(hand);
  assert.deepEqual(result, ['KH']);
});

test('chooseBotDiscard never proposes a joker as part of a meld', () => {
  const byId = cardsById();
  const hand = [byId['JOKER1'], byId['JOKER2'], byId['5S']];
  const result = chooseBotDiscard(hand);
  assert.deepEqual(result, ['5S']); // jokers can't meld even though there are two of them
});

test('shouldBotCall matches the call-eligibility threshold', () => {
  assert.equal(shouldBotCall(0), true);
  assert.equal(shouldBotCall(5), true);
  assert.equal(shouldBotCall(6), false);
});

test('chooseBotDrawSource takes a cheap pickable card', () => {
  const byId = cardsById();
  const result = chooseBotDrawSource([byId['2S'], byId['9H']]);
  assert.deepEqual(result, { source: 'discard', cardId: '2S' });
});

test('chooseBotDrawSource draws blind when the cheapest pickable card is still pricey', () => {
  const byId = cardsById();
  const result = chooseBotDrawSource([byId['9H'], byId['KS']]);
  assert.deepEqual(result, { source: 'pile', cardId: undefined });
});

test('chooseBotDrawSource draws blind when nothing is pickable', () => {
  const result = chooseBotDrawSource([]);
  assert.deepEqual(result, { source: 'pile', cardId: undefined });
});

test('easy difficulty ignores melds and picks a random card from hand', () => {
  const byId = cardsById();
  const hand = [byId['9S'], byId['9H'], byId['2C']];
  const ids = new Set(hand.map((c) => c.id));
  for (let i = 0; i < 20; i++) {
    const result = chooseBotDiscard(hand, 'easy');
    assert.equal(result.length, 1);
    assert.ok(ids.has(result[0]));
  }
});

test('hard difficulty sheds a same-suit run over a smaller same-rank group', () => {
  const byId = cardsById();
  // Run 4-5-6-7 of spades (value 22) beats the pair of 9s (value 18).
  const hand = [byId['4S'], byId['5S'], byId['6S'], byId['7S'], byId['9C'], byId['9D']];
  const result = chooseBotDiscard(hand, 'hard');
  assert.deepEqual(new Set(result), new Set(['4S', '5S', '6S', '7S']));
});

test('medium difficulty does not consider runs, only same-rank groups', () => {
  const byId = cardsById();
  const hand = [byId['4S'], byId['5S'], byId['6S'], byId['2C'], byId['2D']];
  const result = chooseBotDiscard(hand, 'medium');
  // The 4-5-6 run is never even considered at medium difficulty, so the
  // only candidate is the pair of 2s - taken even though shedding it is
  // worth less than the single 6S would be, since any meld beats a
  // single card (it shrinks the hand by more for the same one turn).
  assert.deepEqual(new Set(result), new Set(['2C', '2D']));
});

test('shouldBotCall: easy is more conservative than medium/hard', () => {
  assert.equal(shouldBotCall(2, 'easy'), true);
  assert.equal(shouldBotCall(3, 'easy'), false);
  assert.equal(shouldBotCall(5, 'easy'), false);
  assert.equal(shouldBotCall(5, 'medium'), true);
  assert.equal(shouldBotCall(5, 'hard'), true);
});

test('chooseBotDrawSource: easy never takes from the discard pile', () => {
  const byId = cardsById();
  const result = chooseBotDrawSource([byId['AS']], 'easy');
  assert.deepEqual(result, { source: 'pile', cardId: undefined });
});

test('chooseBotDrawSource: hard takes a pricier pickable card than medium would', () => {
  const byId = cardsById();
  const result = chooseBotDrawSource([byId['5S']], 'hard');
  assert.deepEqual(result, { source: 'discard', cardId: '5S' });
  const mediumResult = chooseBotDrawSource([byId['5S']], 'medium');
  assert.deepEqual(mediumResult, { source: 'pile', cardId: undefined });
});
