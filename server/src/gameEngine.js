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
 *  - someone strictly beats the caller -> wrong call: caller adds value+30,
 *    everyone else adds their own value as normal.
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
    deltas[callerId] = callerValue + 30;
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
    this.turnIndex = Math.floor(this.rng() * this.players.length);
    this.phase = 'waiting';
    this.roundResult = null;
    this.finalResult = null;
    this.turnDeadline = null;
  }

  get currentPlayer() {
    return this.players[this.turnIndex];
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
    if (cards.length >= player.hand.length) {
      throw new Error('Must retain at least 1 card in hand');
    }
    const idSet = new Set(cardIds);
    player.hand = player.hand.filter((c) => !idSet.has(c.id));
    this.discardPile.push(...cards);
    this.phase = 'draw';
    return this.getState();
  }

  draw(playerId, source) {
    this.requireTurn(playerId, 'draw');
    const player = this.playerById(playerId);
    let card;
    if (source === 'discard') {
      if (this.discardPile.length === 0) throw new Error('Discard pile is empty');
      card = this.discardPile.pop();
    } else if (source === 'pile') {
      if (this.drawPile.length === 0) {
        const pool = this.discardPile.slice(0, -1);
        if (pool.length === 0) {
          throw new Error('No cards left in draw pile; draw from discard instead');
        }
        const top = this.discardPile[this.discardPile.length - 1];
        this.discardPile = [top];
        this.drawPile = shuffle(pool, this.rng);
      }
      card = this.drawPile.pop();
    } else {
      throw new Error('Invalid draw source');
    }
    player.hand.push(card);
    this.advanceTurn();
    return this.getState();
  }

  advanceTurn() {
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

  handleTimeout() {
    if (this.phase === 'discard') {
      const player = this.currentPlayer;
      if (player.hand.length <= 1) {
        // Only card left - can't legally discard it (must retain 1), so skip to draw.
        this.phase = 'draw';
      } else {
        const card = player.hand[0];
        this.discard(player.id, [card.id]);
      }
      this.draw(player.id, this.drawPile.length > 0 ? 'pile' : 'discard');
    } else if (this.phase === 'draw') {
      const player = this.currentPlayer;
      this.draw(player.id, this.drawPile.length > 0 ? 'pile' : 'discard');
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
      currentPlayerId: this.players[this.turnIndex]?.id ?? null,
      turnDeadline: this.turnDeadline,
      drawPileCount: this.drawPile.length,
      discardPile: this.discardPile,
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
