import crypto from 'node:crypto';
import { Game } from './gameEngine.js';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;
const RECONNECT_GRACE_MS = 2 * 60 * 1000;

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

  startGame(code, requesterId, options = {}) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== requesterId) throw new Error('Only the host can start the game');
    if (room.status !== 'lobby') throw new Error('Game already started');
    if (room.seats.length < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} players`);
    if (room.seats.length > MAX_PLAYERS) throw new Error(`No more than ${MAX_PLAYERS} players`);

    room.game = new Game(room.seats.map((s) => ({ id: s.id, name: s.name })), options);
    room.status = 'in_game';
    room.game.startRound();
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
      seats: room.seats.map((s) => ({ id: s.id, name: s.name, connected: s.connected })),
    };
  }
}

export { MIN_PLAYERS, MAX_PLAYERS, RECONNECT_GRACE_MS };
