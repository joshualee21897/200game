import { createDeck, shuffle, handValue, isValidDiscard } from './cards.js';

export const TURN_SECONDS = 30;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const HAND_SIZE = 5;
// 6-10 players burn through a single 56-card deck too fast for the
// draw/discard cycle to feel right, so those games are played with two
// decks shuffled together (112 cards) instead.
const DOUBLE_DECK_MIN_PLAYERS = 6;
export const BUST_THRESHOLDS = [50, 100, 150, 200];
const DEFAULT_BUST_THRESHOLD = 200;

// Every exact multiple of 50 up to (and including) the bust threshold
// rebates 50 points off - e.g. a 100-point game only has milestones at 50
// and 100; a default 200-point game keeps all four (50/100/150/200).
// Landing exactly on the threshold itself still rebates rather than
// busting, same as it always has.
function milestoneRebate(total, bustThreshold) {
  if (total > 0 && total <= bustThreshold && total % 50 === 0) {
    return total - 50;
  }
  return total;
}

/**
 * Resolves a call per the brief:
 *  - caller strictly lowest -> clean win: caller adds 0, everyone else adds
 *    their own value.
 *  - caller ties with someone else for lowest (no one strictly below) ->
 *    a push, like tying the dealer in blackjack: neither the caller nor
 *    the tied player(s) add anything, but anyone else at the table still
 *    adds their own value as normal. The caller still keeps the deal for
 *    the next round either way (win or push).
 *  - someone strictly beats the caller -> wrong call: caller adds a flat 30
 *    penalty only (not their hand value on top of it). Only whoever has
 *    the single lowest hand among the non-callers effectively "wins" the
 *    round and adds nothing (ties for that lowest spot all get the same
 *    pass); everyone else - including anyone else who merely beat the
 *    caller without being the overall lowest - still adds their own value
 *    as normal. Whoever was lowest opens next.
 */
export function resolveCall(players, callerId) {
  const values = players.map((p) => ({ id: p.id, value: handValue(p.hand) }));
  const callerValue = values.find((v) => v.id === callerId).value;
  const others = values.filter((v) => v.id !== callerId);
  const someoneStrictlyLower = others.some((v) => v.value < callerValue);
  const tiedWithCaller = others.filter((v) => v.value === callerValue).map((v) => v.id);

  const deltas = {};
  let outcome;
  let nextStarterId;
  let lowestOtherIds = [];
  if (someoneStrictlyLower) {
    outcome = 'wrong_call';
    deltas[callerId] = 30;
    const minOthers = Math.min(...others.map((v) => v.value));
    lowestOtherIds = others.filter((v) => v.value === minOthers).map((v) => v.id);
    for (const v of others) deltas[v.id] = lowestOtherIds.includes(v.id) ? 0 : v.value;
    nextStarterId = lowestOtherIds[0];
  } else {
    outcome = tiedWithCaller.length > 0 ? 'push' : 'win';
    deltas[callerId] = 0;
    for (const v of others) deltas[v.id] = tiedWithCaller.includes(v.id) ? 0 : v.value;
    nextStarterId = callerId;
  }

  return { outcome, values, deltas, nextStarterId, tiedWithCaller, lowestOtherIds };
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
  constructor(players, { rng = Math.random, bustThreshold = DEFAULT_BUST_THRESHOLD } = {}) {
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
      throw new Error(`Game requires ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
    }
    if (!BUST_THRESHOLDS.includes(bustThreshold)) {
      throw new Error(`Bust threshold must be one of ${BUST_THRESHOLDS.join(', ')}`);
    }
    this.rng = rng;
    this.bustThreshold = bustThreshold;
    this.players = players.map((p) => ({
      id: p.id,
      name: p.name,
      hand: [],
      score: 0,
      connected: true,
      isBot: !!p.isBot,
      botDifficulty: p.botDifficulty,
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
    this.roundHistory = [];
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
    const deckCount = this.players.length >= DOUBLE_DECK_MIN_PLAYERS ? 2 : 1;
    const deck = shuffle(createDeck(deckCount), this.rng);
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
    const milestoneHitPlayerIds = [];
    for (const p of this.players) {
      const delta = result.deltas[p.id];
      const preRebate = p.score + delta;
      const total = milestoneRebate(preRebate, this.bustThreshold);
      if (total !== preRebate) milestoneHitPlayerIds.push(p.id);
      p.score = total;
    }
    // Computed as a separate pass (not inline above) so every player's
    // score is finalized first - more than one player can cross the
    // threshold in the same round (e.g. several non-callers each adding
    // their own value on a wrong call), and all of them should show as
    // busted, not just whoever happened to be iterated first.
    const bustedPlayerIds = this.players.filter((p) => p.score > this.bustThreshold).map((p) => p.id);

    this.roundResult = {
      ...result,
      callerId: playerId,
      hands: Object.fromEntries(this.players.map((p) => [p.id, p.hand])),
      scoresAfter: Object.fromEntries(this.players.map((p) => [p.id, p.score])),
      milestoneHitPlayerIds,
    };
    // A lighter-weight record (no actual hands) kept for every round so far
    // this game, for the "history" view - unlike roundResult, which the
    // client only shows once and then discards on the next round.
    this.roundHistory.push({
      roundNumber: this.roundNumber,
      callerId: playerId,
      outcome: result.outcome,
      values: result.values,
      deltas: result.deltas,
      scoresAfter: this.roundResult.scoresAfter,
      tiedWithCaller: result.tiedWithCaller,
      lowestOtherIds: result.lowestOtherIds,
      milestoneHitPlayerIds,
    });

    if (bustedPlayerIds.length > 0) {
      const bustedSet = new Set(bustedPlayerIds);
      // Ascending by score ranks everyone at once - busted players always
      // sort to the bottom on their own since a bust score is by
      // definition above the threshold every non-busted score is under.
      const standings = this.players
        .slice()
        .sort((a, b) => a.score - b.score)
        .map((p) => ({ id: p.id, name: p.name, score: p.score, busted: bustedSet.has(p.id) }));
      const winner = standings.find((p) => !p.busted);
      this.finalResult = {
        bustedPlayerIds,
        winnerId: winner ? winner.id : null,
        standings,
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
      bustThreshold: this.bustThreshold,
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
        isBot: p.isBot,
        botDifficulty: p.botDifficulty,
        handCount: p.hand.length,
      })),
      roundResult: this.roundResult,
      roundHistory: this.roundHistory,
      finalResult: this.finalResult,
    };
  }

  getHand(playerId) {
    return this.playerById(playerId).hand;
  }
}
