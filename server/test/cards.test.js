import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, handValue, isValidDiscard } from '../src/cards.js';

test('deck has 56 unique cards', () => {
  const deck = createDeck();
  assert.equal(deck.length, 56);
  assert.equal(new Set(deck.map((c) => c.id)).size, 56);
});

test('two decks combine into 112 unique cards for 6-10 player games', () => {
  const deck = createDeck(2);
  assert.equal(deck.length, 112);
  assert.equal(new Set(deck.map((c) => c.id)).size, 112);
  // Values/ranks are unaffected by the extra deck - only ids differ.
  const aces = deck.filter((c) => c.rank === 'A');
  assert.equal(aces.length, 8); // 4 suits x 2 decks
  assert.equal(new Set(aces.map((c) => c.value)).size, 1);
  assert.equal(deck.filter((c) => c.rank === 'JOKER').length, 8);
});

test('card values match brief', () => {
  const deck = createDeck();
  const byId = Object.fromEntries(deck.map((c) => [c.id, c]));
  assert.equal(byId['AS'].value, 1);
  assert.equal(byId['10H'].value, 10);
  assert.equal(byId['JD'].value, 11);
  assert.equal(byId['QC'].value, 11);
  assert.equal(byId['KS'].value, 11);
  assert.equal(byId['JOKER1'].value, 0);
});

test('handValue sums card values', () => {
  const deck = createDeck();
  const byId = Object.fromEntries(deck.map((c) => [c.id, c]));
  const hand = [byId['AS'], byId['10H'], byId['JOKER1']];
  assert.equal(handValue(hand), 11);
});

test('single card discard is always valid', () => {
  const deck = createDeck();
  assert.equal(isValidDiscard([deck[0]]), true);
});

test('pair/triple/quad of same rank is valid, mixed rank is not', () => {
  const deck = createDeck();
  const byId = Object.fromEntries(deck.map((c) => [c.id, c]));
  assert.equal(isValidDiscard([byId['7S'], byId['7H']]), true);
  assert.equal(isValidDiscard([byId['7S'], byId['7H'], byId['7D']]), true);
  assert.equal(isValidDiscard([byId['7S'], byId['7H'], byId['7D'], byId['7C']]), true);
  assert.equal(isValidDiscard([byId['7S'], byId['8H']]), false);
});

test('joker cannot join a meld', () => {
  const deck = createDeck();
  const byId = Object.fromEntries(deck.map((c) => [c.id, c]));
  assert.equal(isValidDiscard([byId['7S'], byId['JOKER1']]), false);
});

test('same-suit run of 3+ consecutive cards is valid', () => {
  const deck = createDeck();
  const byId = Object.fromEntries(deck.map((c) => [c.id, c]));
  assert.equal(isValidDiscard([byId['4S'], byId['5S'], byId['6S']]), true);
  assert.equal(isValidDiscard([byId['5S'], byId['4S'], byId['6S']]), true); // order independent
  assert.equal(isValidDiscard([byId['4S'], byId['5S']]), false); // needs 3 min, and mismatched rank rule kicks in first
  assert.equal(isValidDiscard([byId['4S'], byId['5H'], byId['6S']]), false); // mixed suit
  assert.equal(isValidDiscard([byId['4S'], byId['6S'], byId['8S']]), false); // not consecutive
});

test('ace is low for runs (A-2-3 valid, Q-K-A invalid)', () => {
  const deck = createDeck();
  const byId = Object.fromEntries(deck.map((c) => [c.id, c]));
  assert.equal(isValidDiscard([byId['AS'], byId['2S'], byId['3S']]), true);
  assert.equal(isValidDiscard([byId['QS'], byId['KS'], byId['AS']]), false);
});
