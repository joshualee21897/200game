import { createDeck, shuffle, handValue, isValidDiscard } from './cards.js';

export const TURN_SECONDS = 30;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;
const HAND_SIZE = 5;

function milestoneRebate(total) {
  if (total === 50 || total === 100 || total === 150 || total === 200) {
    return total - 50;
  }
  return total;
}

/**
 * Resolves a call per the brief:
 *  - caller strictly lowest -> caller adds 0, everyone else adds own value.
 *  - someone else ties the caller's value -> only the tying player(s) add 0;
 *    the caller (having failed to be *strictly* lowest) adds their own value
 *    like a normal non-winner.
 *  - someone strictly beats the caller -> wrong call: caller adds a flat 30
 *    penalty only (not their hand value on top of it), everyone else adds
 *    their own value as normal.
 */
export function resolveCall(players, callerId) {
  const values = players.map((p) => ({ id: p.id, value: handValue(p.hand) }));
  const callerValue = values.find((v) => v.id === callerId).value;
  const others = values.filter((v) => v.id !== callerId);
  const someoneStrictlyLower = others.some((v) => v.value < callerValue);
  const tiers = others.filter((v) => v.value === callerValue);

  const deltas = {};
  let outcome;
  if (someoneStrictlyLower) {
    outcome = 'wrong_call';
    deltas[callerId] = 30;
    for (const v of others) deltas[v.id] = v.value;
  } else if (tiers.length > 0) {
    outcome = 'tie';
    deltas[callerId] = callerValue;
    for (const v of others) deltas[v.id] = v.value === callerValue ? 0 : v.value;
  } else {
    outcome = 'win';
    deltas[callerId] = 0;
    for (const v of others) deltas[v.id] = v.value;
  }

  const minValue = Math.min(...values.map((v) => v.value));
  const nextStarterId = values.find((v) => v.value === minValue).id;

  return { outcome, values, deltas, nextStarterId };
}

export const RPS_MOVES = ['rock', 'paper', 'scissors'];
const RPS_BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

/**
 * Resolves one simultaneous rock-paper-scissors sub-round among `active`
 * player ids given their `choices` (id -> move). Standard multi-player
 * convention: if everyone threw the same move, or all three moves are in
 * play, it's a wash and everyone re-throws. Otherwise exactly two distinct
 * moves are in play - whichever beats the other survives; players who threw
 * the losing move are eliminated. Repeated until one player remains.
 */
export function resolveRpsRound(active, choices) {
  const distinctMoves = [...new Set(active.map((id) => choices[id]))];
  if (distinctMoves.length !== 2) {
    return { tie: true, winningMove: null, winners: active, eliminated: [] };
  }
  const [a, b] = distinctMoves;
  const winningMove = RPS_BEATS[a] === b ? a : b;
  const winners = active.filter((id) => choices[id] === winningMove);
  const eliminated = active.filter((id) => choices[id] !== winningMove);
  return { tie: false, winningMove, winners, eliminated };
}

export class Game {
  constructor(players, { rng = Math.random } = {}) {
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
      throw new Error(`Game requires ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
    }
    this.rng = rng;
    this.players = players.map((p) => ({
      id: p.id,
      name: p.name,
      hand: [],
      score: 0,
      connected: true,
    }));
    this.roundNumber = 0;
    this.drawPile = [];
    this.discardPile = [];
    // pickableGroup: cards currently choosable via a "draw from discard"
    // action - the group discarded on the *previous* turn. pendingGroup: the
    // cards the *current* player just discarded this turn - visible on top
    // of the pile, but not choosable by that same player (see draw()).
    this.pickableGroup = [];
    this.pendingGroup = null;
    this.turnIndex = 0;
    // A brand-new game always opens with a rock-paper-scissors throw-off to
    // decide who starts round 1; every round after that is decided by
    // resolveCall's nextStarterId instead (see startNextRound / call()).
    this.phase = 'rps';
    this.rps = {
      active: this.players.map((p) => p.id),
      choices: {},
      lastRound: null,
      winnerId: null,
    };
    this.roundResult = null;
    this.finalResult = null;
    this.turnDeadline = null;
  }

  get currentPlayer() {
    return this.players[this.turnIndex];
  }

  submitRpsChoice(playerId, move) {
    if (this.phase !== 'rps') throw new Error('Not currently deciding who starts');
    if (!this.rps.active.includes(playerId)) throw new Error('You are not part of this throw-off');
    if (!RPS_MOVES.includes(move)) throw new Error('Invalid move');
    if (this.rps.choices[playerId]) throw new Error('Already chosen this round');

    this.rps.choices[playerId] = move;
    if (Object.keys(this.rps.choices).length === this.rps.active.length) {
      this.resolveRpsSubRound();
    }
    return this.getState();
  }

  resolveRpsSubRound() {
    const choices = { ...this.rps.choices };
    const result = resolveRpsRound(this.rps.active, choices);
    this.rps.lastRound = { choices, eliminated: result.eliminated, tie: result.tie };
    this.rps.active = result.winners;
    this.rps.choices = {};
    if (result.winners.length === 1) {
      this.rps.winnerId = result.winners[0];
      this.startRound(result.winners[0]);
    }
  }

  playerById(id) {
    const p = this.players.find((pl) => pl.id === id);
    if (!p) throw new Error('Unknown player');
    return p;
  }

  startRound(startingPlayerId) {
    if (this.finalResult) throw new Error('Game already ended');
    const deck = shuffle(createDeck(), this.rng);
    for (const player of this.players) {
      player.hand = deck.splice(0, HAND_SIZE);
    }
    this.drawPile = deck;
    this.discardPile = [this.drawPile.pop()];
    this.pickableGroup = [...this.discardPile];
    this.pendingGroup = null;
    if (startingPlayerId) {
      this.turnIndex = this.players.findIndex((p) => p.id === startingPlayerId);
    }
    this.roundNumber += 1;
    this.phase = 'discard';
    this.roundResult = null;
    this.turnDeadline = Date.now() + TURN_SECONDS * 1000;
    return this.getState();
  }

  requireTurn(playerId, expectedPhase) {
    if (this.phase !== expectedPhase) {
      throw new Error(`Not valid during phase ${this.phase}`);
    }
    if (this.currentPlayer.id !== playerId) {
      throw new Error('Not your turn');
    }
  }

  discard(playerId, cardIds) {
    this.requireTurn(playerId, 'discard');
    const player = this.playerById(playerId);
    const cards = cardIds.map((id) => {
      const card = player.hand.find((c) => c.id === id);
      if (!card) throw new Error(`Card ${id} not in hand`);
      return card;
    });
    if (!isValidDiscard(cards)) throw new Error('Invalid discard');
    // A discard may empty the hand entirely - the mandatory draw that
    // immediately follows (same turn, before anyone else can act) always
    // brings it back to at least 1 card.
    const idSet = new Set(cardIds);
    player.hand = player.hand.filter((c) => !idSet.has(c.id));
    this.discardPile.push(...cards);
    // Not pickable yet - a player can never draw their own just-made
    // discard. It becomes the pickable group for the *next* player once
    // this turn ends (see advanceTurn).
    this.pendingGroup = cards;
    this.phase = 'draw';
    return this.getState();
  }

  /**
   * Cards that must not be shuffled away: the group discarded last turn
   * (still pickable) plus whatever the current player just threw this turn
   * (about to become pickable). Everything else in the discard pile is
   * fair game to reshuffle into a fresh draw pile.
   */
  reshuffleIfNeeded() {
    if (this.drawPile.length > 0) return;
    const keepIds = new Set([...this.pickableGroup, ...(this.pendingGroup || [])].map((c) => c.id));
    const keep = this.discardPile.filter((c) => keepIds.has(c.id));
    const pool = this.discardPile.filter((c) => !keepIds.has(c.id));
    if (pool.length === 0) {
      throw new Error('No cards left in draw pile; draw from discard instead');
    }
    this.discardPile = keep;
    this.drawPile = shuffle(pool, this.rng);
  }

  // Best-effort version of reshuffleIfNeeded used right after the draw pile
  // is emptied, so its count never sits at a stale 0 waiting for someone to
  // attempt another draw first - it refills proactively the moment the last
  // card is taken. Silently no-ops if there's genuinely nothing left to
  // reshuffle yet (rare, very late in a round).
  topUpDrawPile() {
    try {
      this.reshuffleIfNeeded();
    } catch {
      // Nothing to reshuffle yet - leave it empty; the pickable discard
      // group is still available to draw from instead.
    }
  }

  draw(playerId, source, cardId) {
    this.requireTurn(playerId, 'draw');
    const player = this.playerById(playerId);
    let card;
    if (source === 'discard') {
      if (!cardId) throw new Error('Must specify which discard-pile card to take');
      if (!this.pickableGroup.some((c) => c.id === cardId)) {
        throw new Error('That card is not currently pickable from the discard pile');
      }
      const idx = this.discardPile.findIndex((c) => c.id === cardId);
      card = this.discardPile[idx];
      this.discardPile.splice(idx, 1);
      this.pickableGroup = this.pickableGroup.filter((c) => c.id !== cardId);
    } else if (source === 'pile') {
      this.reshuffleIfNeeded();
      card = this.drawPile.pop();
      if (this.drawPile.length === 0) this.topUpDrawPile();
    } else {
      throw new Error('Invalid draw source');
    }
    player.hand.push(card);
    this.advanceTurn();
    return this.getState();
  }

  advanceTurn() {
    // Whatever the player who just finished their turn discarded becomes
    // the pickable group for the next player; anything left unclaimed from
    // before is now buried (per the "only the immediately preceding turn's
    // group" rule).
    this.pickableGroup = this.pendingGroup || [];
    this.pendingGroup = null;
    this.turnIndex = (this.turnIndex + 1) % this.players.length;
    this.phase = 'discard';
    this.turnDeadline = Date.now() + TURN_SECONDS * 1000;
  }

  call(playerId) {
    this.requireTurn(playerId, 'discard');
    const player = this.playerById(playerId);
    const value = handValue(player.hand);
    if (value > 5) throw new Error('Hand value must be 5 or less to call');

    const result = resolveCall(this.players, playerId);
    let bustedPlayerId = null;
    for (const p of this.players) {
      const delta = result.deltas[p.id];
      let total = p.score + delta;
      total = milestoneRebate(total);
      p.score = total;
      if (total >= 201 && !bustedPlayerId) bustedPlayerId = p.id;
    }

    this.roundResult = {
      ...result,
      callerId: playerId,
      hands: Object.fromEntries(this.players.map((p) => [p.id, p.hand])),
      scoresAfter: Object.fromEntries(this.players.map((p) => [p.id, p.score])),
    };

    if (bustedPlayerId) {
      const standings = this.players
        .filter((p) => p.id !== bustedPlayerId)
        .slice()
        .sort((a, b) => a.score - b.score);
      this.finalResult = {
        bustedPlayerId,
        winnerId: standings.length ? standings[0].id : null,
        standings: standings.map((p) => ({ id: p.id, name: p.name, score: p.score })),
      };
      this.phase = 'game_end';
    } else {
      this.phase = 'round_end';
    }
    return this.getState();
  }

  autoDraw() {
    const player = this.currentPlayer;
    try {
      this.draw(player.id, 'pile');
    } catch {
      // Draw pile (and reshuffle pool) exhausted - fall back to whatever is
      // currently pickable from the discard pile.
      const card = this.pickableGroup[0];
      this.draw(player.id, 'discard', card.id);
    }
  }

  handleTimeout() {
    if (this.phase === 'discard') {
      const player = this.currentPlayer;
      this.discard(player.id, [player.hand[0].id]);
      this.autoDraw();
    } else if (this.phase === 'draw') {
      this.autoDraw();
    }
    return this.getState();
  }

  setConnected(playerId, connected) {
    const player = this.playerById(playerId);
    player.connected = connected;
  }

  getState() {
    return {
      roundNumber: this.roundNumber,
      phase: this.phase,
      currentPlayerId: this.phase === 'rps' ? null : this.players[this.turnIndex]?.id ?? null,
      turnDeadline: this.turnDeadline,
      drawPileCount: this.drawPile.length,
      discardPile: this.discardPile,
      pickableGroup: this.pickableGroup,
      pendingGroup: this.pendingGroup || [],
      rps:
        this.phase === 'rps'
          ? { active: this.rps.active, submitted: Object.keys(this.rps.choices), lastRound: this.rps.lastRound }
          : null,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
        handCount: p.hand.length,
      })),
      roundResult: this.roundResult,
      finalResult: this.finalResult,
    };
  }

  getHand(playerId) {
    return this.playerById(playerId).hand;
  }
}
