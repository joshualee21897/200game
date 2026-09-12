import crypto from 'node:crypto';
import { Game } from './gameEngine.js';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const RECONNECT_GRACE_MS = 5 * 60 * 1000;
const BOT_NAME_POOL = ['Ace', 'Rusty', 'Circuit', 'Chip', 'Pixel', 'Nova', 'Domino', 'Cash', 'Dealer', 'Vega'];
const BOT_DIFFICULTIES = ['easy', 'medium', 'hard'];
const MAX_CHAT_MESSAGES = 200; // keeps a long-running room's history from growing unbounded
const MAX_CHAT_MESSAGE_LENGTH = 300;
const SERIES_LENGTHS = [1, 3, 5, 7];

function genRoomCode(existingCodes) {
  let code;
  do {
    code = Array.from({ length: 5 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
  } while (existingCodes.has(code));
  return code;
}

export class RoomManager {
  constructor({ reconnectGraceMs = RECONNECT_GRACE_MS } = {}) {
    this.rooms = new Map(); // code -> room
    this.reconnectGraceMs = reconnectGraceMs;
  }

  createRoom(hostName) {
    const trimmed = (hostName || '').trim();
    if (!trimmed) throw new Error('Name is required');
    const code = genRoomCode(new Set(this.rooms.keys()));
    const hostId = crypto.randomUUID();
    const room = {
      code,
      hostId,
      status: 'lobby', // lobby | in_game | ended
      seats: [{ id: hostId, name: trimmed, connected: true }],
      game: null,
      disconnectTimers: new Map(),
      chatMessages: [],
    };
    this.rooms.set(code, room);
    return { room, playerId: hostId };
  }

  /**
   * Joining with a name that already occupies a disconnected seat re-attaches
   * to that seat (this is our reconnect mechanism, since players only carry
   * a typed display name, not a persistent client id).
   */
  joinRoom(code, name) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found');

    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('Name is required');

    const existing = room.seats.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (existing.connected) throw new Error('That name is already active in this room');
      this.clearDisconnectTimer(room, existing.id);
      existing.connected = true;
      return { room, playerId: existing.id, reconnected: true };
    }

    if (room.status !== 'lobby') throw new Error('Game already in progress');
    if (room.seats.length >= MAX_PLAYERS) throw new Error('Room is full');

    const playerId = crypto.randomUUID();
    room.seats.push({ id: playerId, name: trimmed, connected: true });
    return { room, playerId, reconnected: false };
  }

  /**
   * Adds a computer-controlled seat so a solo player (or a group short a
   * few friends) can still fill a table. Bots are seats like any other -
   * same MAX_PLAYERS cap, same turn order - just flagged `isBot: true` so
   * the server drives their turns automatically (see index.js) instead of
   * waiting on a socket that will never send one.
   */
  addBot(code, requesterId, difficulty = 'medium') {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== requesterId) throw new Error('Only the host can add a bot');
    if (room.status !== 'lobby') throw new Error('Game already in progress');
    if (room.seats.length >= MAX_PLAYERS) throw new Error('Room is full');
    if (!BOT_DIFFICULTIES.includes(difficulty)) throw new Error('Invalid bot difficulty');

    const taken = new Set(room.seats.map((s) => s.name.toLowerCase()));
    let name = BOT_NAME_POOL.find((n) => !taken.has(n.toLowerCase()));
    if (!name) {
      let suffix = 2;
      do {
        name = `Bot ${suffix}`;
        suffix += 1;
      } while (taken.has(name.toLowerCase()));
    }

    const playerId = crypto.randomUUID();
    room.seats.push({ id: playerId, name, connected: true, isBot: true, botDifficulty: difficulty });
    return { room, playerId };
  }

  /**
   * Undoes an accidental Add Bot click - host-only, lobby-only, and only
   * ever removes a bot seat (never a real player, even if the host somehow
   * passed a human's id here).
   */
  removeBot(code, requesterId, botId) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== requesterId) throw new Error('Only the host can remove a bot');
    if (room.status !== 'lobby') throw new Error('Game already in progress');
    const seat = room.seats.find((s) => s.id === botId);
    if (!seat || !seat.isBot) throw new Error('That bot no longer exists');
    room.seats = room.seats.filter((s) => s.id !== botId);
    return { room };
  }

  /**
   * Appends a chat message from a seated player (bot or human - a bot seat
   * can't actually call this since nothing drives it to, but nothing here
   * needs to special-case that). Available in the lobby and mid-game alike,
   * since there's no reason to gate simple table talk to one or the other.
   */
  addChatMessage(code, playerId, text) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found');
    const seat = room.seats.find((s) => s.id === playerId);
    if (!seat) throw new Error('Not in this room');
    const trimmed = (text || '').trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
    if (!trimmed) throw new Error('Message is empty');

    const message = { id: crypto.randomUUID(), playerId, name: seat.name, text: trimmed, at: Date.now() };
    room.chatMessages.push(message);
    if (room.chatMessages.length > MAX_CHAT_MESSAGES) room.chatMessages.shift();
    return room;
  }

  startGame(code, requesterId, options = {}) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== requesterId) throw new Error('Only the host can start the game');
    if (room.status !== 'lobby') throw new Error('Game already started');
    if (room.seats.length < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} players`);
    if (room.seats.length > MAX_PLAYERS) throw new Error(`No more than ${MAX_PLAYERS} players`);

    room.game = new Game(
      room.seats.map((s) => ({ id: s.id, name: s.name, isBot: !!s.isBot, botDifficulty: s.botDifficulty })),
      options
    );
    room.status = 'in_game';
    // A fresh series always starts here, even for a lone standalone game
    // (seriesLength 1) - that way the room's series fields are always in a
    // consistent shape once a game exists, rather than sometimes present.
    room.seriesLength = SERIES_LENGTHS.includes(options.seriesLength) ? options.seriesLength : 1;
    room.seriesWins = Object.fromEntries(room.seats.map((s) => [s.id, 0]));
    room.seriesGameNumber = 1;
    room.seriesGameResultRecorded = false;
    // Game starts itself in a 'rps' phase (throw-off to decide who opens
    // round 1) and calls startRound() once that resolves - see gameEngine.js.
    return room;
  }

  /**
   * Tallies the game that just ended toward the room's running series
   * score. Idempotent (guarded by seriesGameResultRecorded) since the
   * server can end up checking "did this call just end the game" from a
   * couple of different call sites (a human's game:call vs a bot's).
   */
  recordSeriesGameResult(room) {
    if (!room.game || room.game.phase !== 'game_end') return;
    if (room.seriesGameResultRecorded) return;
    const winnerId = room.game.finalResult?.winnerId;
    if (winnerId && room.seriesWins[winnerId] != null) {
      room.seriesWins[winnerId] += 1;
    }
    room.seriesGameResultRecorded = true;
  }

  /**
   * Starts the next game in the series with the same seats (and the same
   * bust threshold), once the current one has ended and the series itself
   * isn't decided yet - "best of N" means first to a majority of N wins,
   * not necessarily playing all N games.
   */
  startNextGameInSeries(code, requesterId) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== requesterId) throw new Error('Only the host can start the next game');
    if (!room.game || room.game.phase !== 'game_end') throw new Error('The current game is not over yet');
    const target = Math.ceil(room.seriesLength / 2);
    const decided = Object.values(room.seriesWins).some((wins) => wins >= target);
    if (decided) throw new Error('The series is already decided');

    room.game = new Game(
      room.seats.map((s) => ({ id: s.id, name: s.name, isBot: !!s.isBot, botDifficulty: s.botDifficulty })),
      { bustThreshold: room.game.bustThreshold }
    );
    room.seriesGameNumber += 1;
    room.seriesGameResultRecorded = false;
    return room;
  }

  startNextRound(code) {
    const room = this.rooms.get(code);
    if (!room || !room.game) throw new Error('No active game');
    const nextStarterId = room.game.roundResult?.nextStarterId;
    room.game.startRound(nextStarterId);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  findRoomByPlayerId(playerId) {
    for (const room of this.rooms.values()) {
      if (room.seats.some((s) => s.id === playerId)) return room;
    }
    return null;
  }

  markDisconnected(code, playerId, onExpire) {
    const room = this.rooms.get(code);
    if (!room) return;
    const seat = room.seats.find((s) => s.id === playerId);
    if (!seat) return;
    seat.connected = false;
    if (room.game) room.game.setConnected(playerId, false);

    const timer = setTimeout(() => {
      room.disconnectTimers.delete(playerId);
      if (room.status === 'lobby') {
        room.seats = room.seats.filter((s) => s.id !== playerId);
        if (room.seats.length === 0) this.rooms.delete(code);
      }
      onExpire?.();
    }, this.reconnectGraceMs);
    room.disconnectTimers.set(playerId, timer);
  }

  clearDisconnectTimer(room, playerId) {
    const timer = room.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers.delete(playerId);
    }
    if (room.game) room.game.setConnected(playerId, true);
  }

  roomSummary(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      seats: room.seats.map((s) => ({
        id: s.id,
        name: s.name,
        connected: s.connected,
        isBot: !!s.isBot,
        botDifficulty: s.botDifficulty,
      })),
      chatMessages: room.chatMessages,
      seriesLength: room.seriesLength ?? null,
      seriesWins: room.seriesWins ?? null,
      seriesGameNumber: room.seriesGameNumber ?? null,
    };
  }
}

export { MIN_PLAYERS, MAX_PLAYERS, RECONNECT_GRACE_MS, SERIES_LENGTHS };
