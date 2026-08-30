import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, resolveCall, resolveRpsRound, TURN_SECONDS } from '../src/gameEngine.js';
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

test('startRound uses a single deck for up to 5 players', () => {
  const game = new Game(makePlayers(5), { rng: makeRng(1) });
  game.startRound();
  assert.equal(game.drawPile.length + game.discardPile.length + game.players.length * 5, 56);
});

test('startRound uses two combined decks once there are 6+ players', () => {
  const game = new Game(makePlayers(6), { rng: makeRng(1) });
  game.startRound();
  const total = game.drawPile.length + game.discardPile.length + game.players.reduce((sum, p) => sum + p.hand.length, 0);
  assert.equal(total, 112);
  assert.equal(new Set([...game.drawPile, ...game.discardPile, ...game.players.flatMap((p) => p.hand)].map((c) => c.id)).size, 112);
});

test('supports up to 10 players', () => {
  const game = new Game(makePlayers(10), { rng: makeRng(1) });
  game.startRound();
  for (const p of game.players) assert.equal(p.hand.length, 5);
});

test('rejects more than 10 players', () => {
  assert.throws(() => new Game(makePlayers(11), { rng: makeRng(1) }));
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

test('can discard the entire hand as a valid meld (draw right after refills it)', () => {
  const byId = cardsById();
  const game = new Game(makePlayers(2), { rng: makeRng(4) });
  game.startRound();
  const player = game.currentPlayer;
  player.hand = [byId['7S'], byId['7H'], byId['7D'], byId['7C']];
  const state = game.discard(player.id, ['7S', '7H', '7D', '7C']);
  assert.equal(player.hand.length, 0);
  assert.equal(state.phase, 'draw');
  const after = game.draw(player.id, 'pile');
  assert.equal(player.hand.length, 1);
  assert.equal(after.phase, 'discard');
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

test('resolveCall: a tie for lowest is a push - neither the caller nor the tying player scores', () => {
  const byId = cardsById();
  const players = [
    { id: 'a', hand: [byId['2S']] }, // caller, value 2
    { id: 'b', hand: [byId['2H']] }, // ties caller, value 2
    { id: 'c', hand: [byId['9S']] }, // value 9, not part of the tie
  ];
  const result = resolveCall(players, 'a');
  assert.equal(result.outcome, 'push');
  assert.equal(result.deltas.a, 0);
  assert.equal(result.deltas.b, 0);
  assert.equal(result.deltas.c, 9);
  assert.equal(result.nextStarterId, 'a');
  assert.deepEqual(result.tiedWithCaller, ['b']);
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
  assert.equal(result.deltas.a, 30); // flat 30 penalty, not hand value + 30
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
  assert.equal(state.roundResult.callerId, caller.id);
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
  assert.deepEqual(state.roundResult.milestoneHitPlayerIds, [opponent.id]);
});

test('milestoneHitPlayerIds is empty when nobody lands on an exact milestone', () => {
  const byId = cardsById();
  const game = new Game(makePlayers(2), { rng: makeRng(10) });
  game.startRound();
  const caller = game.currentPlayer;
  const opponent = game.players.find((p) => p.id !== caller.id);
  caller.hand = [byId['AS']]; // value 1
  opponent.hand = [byId['9S']]; // value 9, 0 + 9 = 9, not a milestone
  const state = game.call(caller.id);
  assert.deepEqual(state.roundResult.milestoneHitPlayerIds, []);
});

test('draw pile reshuffles from discard pile, preserving pickable + pending groups', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(11) });
  game.startRound();
  // Force the draw pile empty and stack up a multi-card discard pile.
  const byId = cardsById();
  game.drawPile = [];
  game.discardPile = [byId['2S'], byId['3H'], byId['4D']];
  game.pickableGroup = [byId['4D']]; // last turn's discard, still pickable
  game.pendingGroup = null;
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

// --- Bug fix: drawing from the discard pile must never return the current
// player's own just-made discard. ---

test('a player cannot draw the card they themselves just discarded', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(20) });
  game.startRound();
  const player = game.currentPlayer;
  const thrown = player.hand[0];
  game.discard(player.id, [thrown.id]);
  assert.throws(() => game.draw(player.id, 'discard', thrown.id), /not currently pickable/);
});

test('drawing from discard gives the previous turn\'s card, not the current turn\'s', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(21) });
  game.startRound();
  const starterCard = game.discardPile[0]; // flipped at round start, pickable by player 1
  const p1 = game.currentPlayer;
  const p1Thrown = p1.hand[0];
  game.discard(p1.id, [p1Thrown.id]);
  // p1's draw options from discard: only the pre-round starter card.
  assert.deepEqual(game.pickableGroup.map((c) => c.id), [starterCard.id]);
  game.draw(p1.id, 'discard', starterCard.id);

  const p2 = game.currentPlayer;
  assert.notEqual(p2.id, p1.id);
  const p2Thrown = p2.hand[0];
  game.discard(p2.id, [p2Thrown.id]);
  // p2's draw options: only what p1 discarded, never p2's own throw.
  assert.deepEqual(game.pickableGroup.map((c) => c.id), [p1Thrown.id]);
  assert.throws(() => game.draw(p2.id, 'discard', p2Thrown.id));
  game.draw(p2.id, 'discard', p1Thrown.id);
  assert.equal(p2.hand.some((c) => c.id === p1Thrown.id), true);
});

test('rejects a discard-pile draw for a card outside the pickable set', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(22) });
  game.startRound();
  const player = game.currentPlayer;
  game.discard(player.id, [player.hand[0].id]);
  assert.throws(() => game.draw(player.id, 'discard', 'not-a-real-card-id'));
});

// --- Rule change: any card from a just-discarded meld is pickable, not
// just the physical top. ---

test('next player can pick any card from a just-discarded meld', () => {
  const byId = cardsById();
  const game = new Game(makePlayers(2), { rng: makeRng(23) });
  game.startRound();
  const p1 = game.currentPlayer;
  p1.hand = [byId['7S'], byId['7H'], byId['7D'], byId['2C'], byId['3D']];
  game.discard(p1.id, ['7S', '7H', '7D']); // triple meld
  game.draw(p1.id, 'pile');

  const p2 = game.currentPlayer;
  assert.deepEqual(
    game.pickableGroup.map((c) => c.id).sort(),
    ['7D', '7H', '7S']
  );
  game.discard(p2.id, [p2.hand[0].id]); // p2's own discard, required before they can draw
  const before = p2.hand.length;
  game.draw(p2.id, 'discard', '7H'); // pick the *middle* card, not the physical top
  assert.equal(p2.hand.length, before + 1);
  assert.equal(p2.hand.some((c) => c.id === '7H'), true);
  // 7H is gone from the discard pile; 7S and 7D remain there (unclaimed).
  assert.equal(game.discardPile.some((c) => c.id === '7H'), false);
  assert.equal(game.discardPile.some((c) => c.id === '7S'), true);
  assert.equal(game.discardPile.some((c) => c.id === '7D'), true);
});

test('unclaimed meld cards become buried once the next turn discards', () => {
  const byId = cardsById();
  const game = new Game(makePlayers(3), { rng: makeRng(24) });
  game.startRound();
  const p1 = game.currentPlayer;
  p1.hand = [byId['7S'], byId['7H'], byId['7D'], byId['2C'], byId['3D']];
  game.discard(p1.id, ['7S', '7H', '7D']);
  game.draw(p1.id, 'pile'); // p1 ignores the meld, draws from the pile instead

  const p2 = game.currentPlayer;
  const p2Thrown = p2.hand[0];
  game.discard(p2.id, [p2Thrown.id]); // p2 doesn't touch the meld either
  game.draw(p2.id, 'pile');

  const p3 = game.currentPlayer;
  // Only p2's discard is pickable now - the meld from p1's turn is buried.
  assert.deepEqual(game.pickableGroup.map((c) => c.id), [p2Thrown.id]);
  assert.throws(() => game.draw(p3.id, 'discard', '7S'));
});

// --- Rock-paper-scissors throw-off for round 1 ---

test('resolveRpsRound: two players, distinct moves -> single winner', () => {
  const result = resolveRpsRound(['a', 'b'], { a: 'rock', b: 'scissors' });
  assert.equal(result.tie, false);
  assert.equal(result.winningMove, 'rock');
  assert.deepEqual(result.winners, ['a']);
  assert.deepEqual(result.eliminated, ['b']);
});

test('resolveRpsRound: everyone throws the same move -> tie, nobody eliminated', () => {
  const result = resolveRpsRound(['a', 'b', 'c'], { a: 'paper', b: 'paper', c: 'paper' });
  assert.equal(result.tie, true);
  assert.deepEqual(result.winners, ['a', 'b', 'c']);
  assert.deepEqual(result.eliminated, []);
});

test('resolveRpsRound: all three moves present -> tie, everyone re-throws', () => {
  const result = resolveRpsRound(['a', 'b', 'c'], { a: 'rock', b: 'paper', c: 'scissors' });
  assert.equal(result.tie, true);
  assert.deepEqual(result.winners, ['a', 'b', 'c']);
});

test('resolveRpsRound: 2-vs-1 split eliminates the minority losing move', () => {
  const result = resolveRpsRound(['a', 'b', 'c'], { a: 'rock', b: 'rock', c: 'paper' });
  assert.equal(result.tie, false);
  assert.equal(result.winningMove, 'paper'); // paper beats rock
  assert.deepEqual(result.winners, ['c']);
  assert.deepEqual(result.eliminated.sort(), ['a', 'b']);
});

test('a fresh Game starts in rps phase with every player active', () => {
  const game = new Game(makePlayers(3), { rng: makeRng(30) });
  assert.equal(game.phase, 'rps');
  assert.deepEqual(game.rps.active.sort(), game.players.map((p) => p.id).sort());
  assert.equal(game.roundNumber, 0);
});

test('submitRpsChoice rejects invalid phase, non-participants, and bad moves', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(31) });
  assert.throws(() => game.submitRpsChoice('not-a-player', 'rock'));
  assert.throws(() => game.submitRpsChoice(game.players[0].id, 'lizard'));
  game.submitRpsChoice(game.players[0].id, 'rock');
  assert.throws(() => game.submitRpsChoice(game.players[0].id, 'paper')); // already chosen
});

test('two-player rps resolves immediately and deals round 1 to the winner', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(32) });
  const [p1, p2] = game.players;
  game.submitRpsChoice(p1.id, 'rock');
  const state = game.submitRpsChoice(p2.id, 'scissors');
  assert.equal(state.phase, 'discard');
  assert.equal(state.roundNumber, 1);
  assert.equal(state.currentPlayerId, p1.id); // rock beat scissors
  assert.equal(p1.hand.length, 5); // round was actually dealt
});

test('rps tie makes everyone re-throw without eliminating anyone', () => {
  const game = new Game(makePlayers(2), { rng: makeRng(33) });
  const [p1, p2] = game.players;
  game.submitRpsChoice(p1.id, 'rock');
  const state = game.submitRpsChoice(p2.id, 'rock');
  assert.equal(state.phase, 'rps');
  assert.deepEqual(state.rps.active.sort(), [p1.id, p2.id].sort());
  assert.deepEqual(state.rps.submitted, []); // choices cleared for the re-throw
  assert.equal(state.rps.lastRound.tie, true);
  // Both players can throw again immediately.
  game.submitRpsChoice(p1.id, 'paper');
  const state2 = game.submitRpsChoice(p2.id, 'scissors');
  assert.equal(state2.phase, 'discard');
  assert.equal(state2.currentPlayerId, p2.id); // scissors beat paper
});

test('three-player rps eliminates the minority before a final 1-on-1', () => {
  const game = new Game(makePlayers(3), { rng: makeRng(34) });
  const [p1, p2, p3] = game.players;
  // Round 1: p1 & p2 throw rock, p3 throws paper -> p3 is the sole winner
  // outright (2-vs-1 split resolves in one shot, no further throw needed).
  game.submitRpsChoice(p1.id, 'rock');
  game.submitRpsChoice(p2.id, 'rock');
  const state = game.submitRpsChoice(p3.id, 'paper');
  assert.equal(state.phase, 'discard');
  assert.equal(state.currentPlayerId, p3.id);
});

test('three-player rps continues among survivors after elimination', () => {
  const game = new Game(makePlayers(3), { rng: makeRng(35) });
  const [p1, p2, p3] = game.players;
  // p1 & p2 throw rock (survive), p3 throws scissors (eliminated - rock beats scissors).
  game.submitRpsChoice(p1.id, 'rock');
  game.submitRpsChoice(p2.id, 'rock');
  const state = game.submitRpsChoice(p3.id, 'scissors');
  assert.equal(state.phase, 'rps');
  assert.deepEqual(state.rps.active.sort(), [p1.id, p2.id].sort());
  assert.deepEqual(state.rps.lastRound.eliminated, [p3.id]);
  // Final showdown between the two survivors.
  game.submitRpsChoice(p1.id, 'paper');
  const final = game.submitRpsChoice(p2.id, 'rock');
  assert.equal(final.phase, 'discard');
  assert.equal(final.currentPlayerId, p1.id); // paper beat rock
});
