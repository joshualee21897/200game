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

test('addBot: defaults to medium difficulty and accepts easy/hard, rejects garbage', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  const { playerId: defaultBot } = rm.addBot(room.code, hostId);
  const { playerId: easyBot } = rm.addBot(room.code, hostId, 'easy');
  const { playerId: hardBot } = rm.addBot(room.code, hostId, 'hard');
  const stored = rm.getRoom(room.code);
  assert.equal(stored.seats.find((s) => s.id === defaultBot).botDifficulty, 'medium');
  assert.equal(stored.seats.find((s) => s.id === easyBot).botDifficulty, 'easy');
  assert.equal(stored.seats.find((s) => s.id === hardBot).botDifficulty, 'hard');
  assert.throws(() => rm.addBot(room.code, hostId, 'nightmare'));
});

test('removeBot: only the host can remove a bot, and it frees the seat', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  const { playerId: bobId } = rm.joinRoom(room.code, 'Bob');
  const { playerId: botId } = rm.addBot(room.code, hostId);
  assert.equal(rm.getRoom(room.code).seats.length, 3);

  assert.throws(() => rm.removeBot(room.code, bobId, botId)); // not host
  rm.removeBot(room.code, hostId, botId);
  const stored = rm.getRoom(room.code);
  assert.equal(stored.seats.length, 2);
  assert.equal(stored.seats.some((s) => s.id === botId), false);
});

test('removeBot: refuses to remove a human seat even if targeted', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  const { playerId: bobId } = rm.joinRoom(room.code, 'Bob');
  assert.throws(() => rm.removeBot(room.code, hostId, bobId));
  assert.equal(rm.getRoom(room.code).seats.length, 2);
});

test('removeBot: rejects once the game has started', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  const { playerId: botId } = rm.addBot(room.code, hostId);
  rm.startGame(room.code, hostId, { rng: () => 0.42 });
  assert.throws(() => rm.removeBot(room.code, hostId, botId));
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

test('addChatMessage appends a message tagged with the sender name, visible via roomSummary', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  rm.addChatMessage(room.code, hostId, '  gg  ');
  const stored = rm.getRoom(room.code);
  assert.equal(stored.chatMessages.length, 1);
  assert.equal(stored.chatMessages[0].text, 'gg'); // trimmed
  assert.equal(stored.chatMessages[0].name, 'Alice');
  assert.equal(rm.roomSummary(stored).chatMessages.length, 1);
});

test('addChatMessage rejects an empty message and a sender not seated in the room', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  assert.throws(() => rm.addChatMessage(room.code, hostId, '   '));
  assert.throws(() => rm.addChatMessage(room.code, 'not-a-real-id', 'hi'));
});

test('addChatMessage caps history so a long-running room does not grow chat forever', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  for (let i = 0; i < 210; i++) rm.addChatMessage(room.code, hostId, `msg ${i}`);
  const stored = rm.getRoom(room.code);
  assert.equal(stored.chatMessages.length, 200);
  // Oldest messages fall off the front - the most recent ones survive.
  assert.equal(stored.chatMessages[stored.chatMessages.length - 1].text, 'msg 209');
});

test('startGame initializes a fresh series (defaulting an invalid/omitted length to 1)', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  const { playerId: bobId } = rm.joinRoom(room.code, 'Bob');
  rm.startGame(room.code, hostId, { seriesLength: 99 }); // not one of the supported lengths
  const stored = rm.getRoom(room.code);
  assert.equal(stored.seriesLength, 1);
  assert.deepEqual(stored.seriesWins, { [hostId]: 0, [bobId]: 0 });
  assert.equal(stored.seriesGameNumber, 1);
  assert.equal(rm.roomSummary(stored).seriesLength, 1);
});

test('recordSeriesGameResult tallies the winner and is idempotent', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  const { playerId: bobId } = rm.joinRoom(room.code, 'Bob');
  rm.startGame(room.code, hostId, { seriesLength: 3 });
  const stored = rm.getRoom(room.code);
  // Simulate the game having just ended with Alice as winner.
  stored.game.phase = 'game_end';
  stored.game.finalResult = { winnerId: hostId, bustedPlayerIds: [bobId], standings: [] };
  rm.recordSeriesGameResult(stored);
  assert.equal(stored.seriesWins[hostId], 1);
  assert.equal(stored.seriesWins[bobId], 0);
  // A second call (e.g. from a different code path noticing the same
  // game_end) must not double-count the same result.
  rm.recordSeriesGameResult(stored);
  assert.equal(stored.seriesWins[hostId], 1);
});

test('startNextGameInSeries starts a fresh game with the same seats and bust threshold', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  rm.joinRoom(room.code, 'Bob');
  rm.startGame(room.code, hostId, { seriesLength: 3, bustThreshold: 100 });
  const stored = rm.getRoom(room.code);
  stored.game.phase = 'game_end';
  stored.game.finalResult = { winnerId: hostId, bustedPlayerIds: [], standings: [] };
  rm.recordSeriesGameResult(stored);

  rm.startNextGameInSeries(room.code, hostId);
  assert.equal(stored.seriesGameNumber, 2);
  assert.equal(stored.game.phase, 'rps');
  assert.equal(stored.game.bustThreshold, 100);
  assert.equal(stored.seriesGameResultRecorded, false);
});

test('startNextGameInSeries rejects once a player has a majority of series wins', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  rm.joinRoom(room.code, 'Bob');
  rm.startGame(room.code, hostId, { seriesLength: 3 }); // best of 3 -> majority is 2
  const stored = rm.getRoom(room.code);
  stored.seriesWins[hostId] = 2;
  stored.game.phase = 'game_end';
  stored.game.finalResult = { winnerId: hostId, bustedPlayerIds: [], standings: [] };
  assert.throws(() => rm.startNextGameInSeries(room.code, hostId));
});

test('startNextGameInSeries requires the current game to be over, and only the host may call it', () => {
  const rm = new RoomManager();
  const { room, playerId: hostId } = rm.createRoom('Alice');
  const { playerId: bobId } = rm.joinRoom(room.code, 'Bob');
  rm.startGame(room.code, hostId, { seriesLength: 3 });
  const stored = rm.getRoom(room.code);
  assert.throws(() => rm.startNextGameInSeries(room.code, hostId)); // still mid-game
  stored.game.phase = 'game_end';
  stored.game.finalResult = { winnerId: hostId, bustedPlayerIds: [], standings: [] };
  assert.throws(() => rm.startNextGameInSeries(room.code, bobId)); // not host
});
