import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/roomManager.js';

test('createRoom + joinRoom builds a lobby', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  assert.equal(room.seats.length, 1);
  const { playerId: p2 } = rm.joinRoom(room.code, 'Bob');
  assert.equal(rm.getRoom(room.code).seats.length, 2);
  assert.notEqual(hostId, p2);
});

test('rejects joining with a name already active', () => {
  const rm = new RoomManager();
  const { room } = rm.createRoom('Alice');
  assert.throws(() => rm.joinRoom(room.code, 'Alice'));
});

test('rejects joining a full room (max 10)', () => {
  const rm = new RoomManager();
  const { room } = rm.createRoom('P1');
  for (const n of ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']) rm.joinRoom(room.code, n);
  assert.throws(() => rm.joinRoom(room.code, 'P11'));
});

test('addBot: only the host can add a bot, and it fills a seat with isBot set', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  const { playerId: bobId } = rm.joinRoom(room.code, 'Bob');
  assert.throws(() => rm.addBot(room.code, bobId)); // not host

  const { playerId: botId } = rm.addBot(room.code, hostId);
  const stored = rm.getRoom(room.code);
  assert.equal(stored.seats.length, 3);
  const botSeat = stored.seats.find((s) => s.id === botId);
  assert.equal(botSeat.isBot, true);
  assert.equal(botSeat.connected, true);
});

test('addBot: lets a solo host reach the 2-player minimum and start', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  assert.throws(() => rm.startGame(room.code, hostId)); // only 1 player
  rm.addBot(room.code, hostId);
  const started = rm.startGame(room.code, hostId, { rng: () => 0.42 });
  assert.equal(started.status, 'in_game');
  assert.equal(started.game.players.filter((p) => p.isBot).length, 1);
});

test('addBot: gives each bot a distinct name, never colliding with a human or an earlier bot', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  const names = new Set(['alice']);
  for (let i = 0; i < 5; i++) {
    const { playerId } = rm.addBot(room.code, hostId);
    const seat = rm.getRoom(room.code).seats.find((s) => s.id === playerId);
    const lower = seat.name.toLowerCase();
    assert.equal(names.has(lower), false);
    names.add(lower);
  }
});

test('addBot: rejects once the room is full', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  for (let i = 0; i < 9; i++) rm.addBot(room.code, hostId);
  assert.equal(rm.getRoom(room.code).seats.length, 10);
  assert.throws(() => rm.addBot(room.code, hostId));
});

test('only host can start; requires at least 2 players', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  assert.throws(() => rm.startGame(room.code, hostId)); // only 1 player
  const { playerId: bobId } = rm.joinRoom(room.code, 'Bob');
  assert.throws(() => rm.startGame(room.code, bobId)); // not host
  const started = rm.startGame(room.code, hostId, { rng: () => 0.42 });
  assert.equal(started.status, 'in_game');
  assert.equal(started.game.phase, 'rps'); // throw-off decides who opens round 1
});

test('reconnect re-attaches to a disconnected seat by name', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  rm.joinRoom(room.code, 'Bob');
  rm.startGame(room.code, hostId, { rng: () => 0.1 });

  rm.markDisconnected(room.code, hostId);
  const stored = rm.getRoom(room.code);
  assert.equal(stored.seats.find((s) => s.id === hostId).connected, false);
  assert.equal(stored.game.players.find((p) => p.id === hostId).connected, false);

  const { playerId, reconnected } = rm.joinRoom(room.code, 'alice'); // case-insensitive
  assert.equal(playerId, hostId);
  assert.equal(reconnected, true);
  assert.equal(stored.seats.find((s) => s.id === hostId).connected, true);
  assert.equal(stored.game.players.find((p) => p.id === hostId).connected, true);
});

test('disconnecting during lobby frees the seat after grace period', async () => {
  const rm = new RoomManager({ reconnectGraceMs: 10 });
  const { room, playerId: hostId } = rm.createRoom('Alice');
  rm.joinRoom(room.code, 'Bob');

  await new Promise((resolve) => {
    rm.markDisconnected(room.code, hostId, resolve);
  });

  const stored = rm.getRoom(room.code);
  assert.equal(stored.seats.length, 1);
  assert.equal(stored.seats[0].name, 'Bob');
});

test('disconnecting mid-game keeps the seat (no auto-removal)', async () => {
  const rm = new RoomManager({ reconnectGraceMs: 10 });
  const { room, playerId: hostId } = rm.createRoom('Alice');
  rm.joinRoom(room.code, 'Bob');
  rm.startGame(room.code, hostId, { rng: () => 0.1 });

  await new Promise((resolve) => {
    rm.markDisconnected(room.code, hostId, resolve);
  });

  const stored = rm.getRoom(room.code);
  assert.equal(stored.seats.length, 2);
  assert.equal(stored.seats.find((s) => s.id === hostId).connected, false);
});
