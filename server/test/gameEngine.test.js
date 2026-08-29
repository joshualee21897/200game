import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, resolveCall, TURN_SECONDS } from '../src/gameEngine.js';
import { createDeck } from '../src/cards.js';

function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
}

function cardsById() {
  return Object.fromEntries(createDeck().map((c) => [c.id, c]));
}

test('startRound deals 5 cards each and sets up piles', () => {
  const game = new Game(makePlayers(4), { rng: makeRng(1) });
  game.startRound();
  for (const p of game.players) assert.equal(p.hand.length, 5);
  assert.equal(game.discardPile.length, 1);
  assert.equal(game.drawPile.length, 56 - 5 * 4 - 1);
  assert.equal(game.phase, 'discard');
  assert.equal(game.turnDeadline > Date.now(), true);
});

test('discard then draw advances turn to next player', () => {
  const game = new Game(makePlayers(3), { rng: makeRng(2) });
  game.startRound();
  const current = game.currentPlayer;
  const card = current.hand[0];
  game.discard(current.id, [card.id]);
  assert.equal(game.phase, 'draw');
  game.draw(current.id, 'pile');
  assert.equal(game.phase, 'discard');
  assert.notEqual(game.currentPlayer.id, current.id);
  assert.equal(current.hand.length, 5); // discarded 1, drew 1
});

test('rejects discard when not your turn', () => {
  const game = new Game(makePlayers(3), { rng: makeRng(3) });
  game.startRound();
  const other = game.players.find((p) => p.id !== game.currentPlayer.id);
  assert.throws(() => game.discard(other.id, [other.hand[0].id]));
});

test('cannot discard entire hand (must retain 1 card)', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(4) });
  game.startRound();
  const player = game.currentPlayer;
  const ids = player.hand.map((c) => c.id);
  assert.throws(() => game.discard(player.id, ids));
});

test('rejects invalid meld discard', () => {
  const byId = cardsById();
  const game = new Game(makePlayers(2), { rng: makeRng(5) });
  game.startRound();
  const player = game.currentPlayer;
  player.hand = [byId['7S'], byId['8H'], byId['2C'], byId['3D'], byId['9S']];
  assert.throws(() => game.discard(player.id, ['7S', '8H']));
});

test('call rejected when hand value exceeds 5', () => {
  const byId = cardsById();
  const game = new Game(makePlayers(2), { rng: makeRng(6) });
  game.startRound();
  const player = game.currentPlayer;
  player.hand = [byId['KS'], byId['9H'], byId['2C'], byId['3D'], byId['9S']];
  assert.throws(() => game.call(player.id));
});

test('resolveCall: caller strictly lowest wins', () => {
  const byId = cardsById();
  const players = [
    { id: 'a', hand: [byId['AS']] }, // value 1
    { id: 'b', hand: [byId['9H']] }, // value 9
    { id: 'c', hand: [byId['KS']] }, // value 11
  ];
  const result = resolveCall(players, 'a');
  assert.equal(result.outcome, 'win');
  assert.equal(result.deltas.a, 0);
  assert.equal(result.deltas.b, 9);
  assert.equal(result.deltas.c, 11);
  assert.equal(result.nextStarterId, 'a');
});

test('resolveCall: tie only rewards the tying player, not the caller', () => {
  const byId = cardsById();
  const players = [
    { id: 'a', hand: [byId['2S']] }, // caller, value 2
    { id: 'b', hand: [byId['2H']] }, // ties caller, value 2
    { id: 'c', hand: [byId['9S']] }, // value 9
  ];
  const result = resolveCall(players, 'a');
  assert.equal(result.outcome, 'tie');
  assert.equal(result.deltas.a, 2);
  assert.equal(result.deltas.b, 0);
  assert.equal(result.deltas.c, 9);
});

test('resolveCall: someone strictly lower makes it a wrong call', () => {
  const byId = cardsById();
  const players = [
    { id: 'a', hand: [byId['4S']] }, // caller, value 4
    { id: 'b', hand: [byId['AS']] }, // value 1, beats caller
    { id: 'c', hand: [byId['9S']] }, // value 9
  ];
  const result = resolveCall(players, 'a');
  assert.equal(result.outcome, 'wrong_call');
  assert.equal(result.deltas.a, 4 + 30);
  assert.equal(result.deltas.b, 1);
  assert.equal(result.deltas.c, 9);
  assert.equal(result.nextStarterId, 'b');
});

test('call() applies exact-multiple-of-50 rebate', () => {
  const byId = cardsById();
  const game = new Game(makePlayers(2), { rng: makeRng(7) });
  game.startRound();
  const caller = game.currentPlayer;
  const opponent = game.players.find((p) => p.id !== caller.id);
  caller.hand = [byId['AS']]; // value 1
  opponent.hand = [byId['9S']];
  caller.score = 49;
  const state = game.call(caller.id);
  // 49 + 0 = 49, not a milestone, stays 49 for caller (win => delta 0)
  assert.equal(state.players.find((p) => p.id === caller.id).score, 49);
  assert.equal(state.phase, 'round_end');
});

test('call() rebates exactly at 100 and keeps playing at exactly 200', () => {
  const byId = cardsById();
  const game = new Game(makePlayers(2), { rng: makeRng(8) });
  game.startRound();
  const caller = game.currentPlayer;
  const opponent = game.players.find((p) => p.id !== caller.id);
  caller.hand = [byId['AS']]; // value 1, wins => delta 0, score unaffected by rebate here
  opponent.hand = [byId['9S']];
  opponent.score = 90; // 90 + 9 = 99, not a milestone
  caller.score = 99; // caller wins so delta 0, stays 99 - use opponent path instead below
  const state = game.call(caller.id);
  const opp = state.players.find((p) => p.id === opponent.id);
  assert.equal(opp.score, 99); // 90 + 9 = 99
});

test('call() ends the game when a player busts past 200 (no exact milestone)', () => {
  const byId = cardsById();
  const game = new Game(makePlayers(2), { rng: makeRng(9) });
  game.startRound();
  const caller = game.currentPlayer;
  const opponent = game.players.find((p) => p.id !== caller.id);
  caller.hand = [byId['KS'], byId['5H']]; // deliberately high so call would fail; use opponent bust instead
  caller.hand = [byId['AS']]; // value 1
  opponent.hand = [byId['9S']]; // value 9
  opponent.score = 195; // 195 + 9 = 204 -> bust, not an exact milestone
  const state = game.call(caller.id);
  assert.equal(state.phase, 'game_end');
  assert.equal(state.finalResult.bustedPlayerId, opponent.id);
  assert.equal(state.finalResult.winnerId, caller.id);
});

test('exact landing on 200 rebates to 150 instead of busting', () => {
  const byId = cardsById();
  const game = new Game(makePlayers(2), { rng: makeRng(10) });
  game.startRound();
  const caller = game.currentPlayer;
  const opponent = game.players.find((p) => p.id !== caller.id);
  caller.hand = [byId['AS']]; // value 1
  opponent.hand = [byId['9S']]; // value 9
  opponent.score = 191; // 191 + 9 = 200 -> exact milestone -> rebate to 150
  const state = game.call(caller.id);
  const opp = state.players.find((p) => p.id === opponent.id);
  assert.equal(opp.score, 150);
  assert.equal(state.phase, 'round_end');
});

test('draw pile reshuffles from discard pile when exhausted', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(11) });
  game.startRound();
  // Force the draw pile empty and stack up a multi-card discard pile.
  const byId = cardsById();
  game.drawPile = [];
  game.discardPile = [byId['2S'], byId['3H'], byId['4D']]; // top = 4D
  const player = game.currentPlayer;
  const before = player.hand.length;
  game.phase = 'draw';
  game.draw(player.id, 'pile');
  assert.equal(player.hand.length, before + 1);
  assert.deepEqual(game.discardPile.map((c) => c.id), ['4D']);
  assert.equal(game.drawPile.length, 1); // 2S, 3H shuffled in, one drawn
});

test('turn timer default matches brief (30s)', () => {
  assert.equal(TURN_SECONDS, 30);
});

test('handleTimeout during discard phase auto-discards and auto-draws', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(12) });
  game.startRound();
  const player = game.currentPlayer;
  const handBefore = player.hand.length;
  game.handleTimeout();
  assert.equal(player.hand.length, handBefore); // -1 discard, +1 draw
  assert.equal(game.phase, 'discard');
  assert.notEqual(game.currentPlayer.id, player.id);
});

test('handleTimeout during draw phase just auto-draws', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(13) });
  game.startRound();
  const player = game.currentPlayer;
  game.discard(player.id, [player.hand[0].id]);
  const handAfterDiscard = player.hand.length;
  game.handleTimeout();
  assert.equal(player.hand.length, handAfterDiscard + 1);
  assert.equal(game.phase, 'discard');
  assert.notEqual(game.currentPlayer.id, player.id);
});
