import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './roomManager.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const ROUND_END_AUTO_ADVANCE_MS = 12000;

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: CLIENT_ORIGIN } });

const roomManager = new RoomManager();
const turnTimers = new Map(); // roomCode -> Timeout
const roundAdvanceTimers = new Map(); // roomCode -> Timeout

function clearTurnTimer(code) {
  const t = turnTimers.get(code);
  if (t) clearTimeout(t);
  turnTimers.delete(code);
}

function clearRoundAdvanceTimer(code) {
  const t = roundAdvanceTimers.get(code);
  if (t) clearTimeout(t);
  roundAdvanceTimers.delete(code);
}

function scheduleTurnTimer(room) {
  clearTurnTimer(room.code);
  const game = room.game;
  if (!game || (game.phase !== 'discard' && game.phase !== 'draw')) return;
  const delay = Math.max(0, game.turnDeadline - Date.now());
  const handle = setTimeout(() => {
    try {
      game.handleTimeout();
    } catch (err) {
      console.error('handleTimeout failed', err);
    }
    broadcastState(room);
    scheduleTurnTimer(room);
  }, delay);
  turnTimers.set(room.code, handle);
}

function scheduleRoundAdvance(room) {
  clearRoundAdvanceTimer(room.code);
  const handle = setTimeout(() => {
    try {
      roomManager.startNextRound(room.code);
      broadcastState(room);
      scheduleTurnTimer(room);
    } catch (err) {
      console.error('auto round advance failed', err);
    }
  }, ROUND_END_AUTO_ADVANCE_MS);
  roundAdvanceTimers.set(room.code, handle);
}

function broadcastState(room) {
  const sockets = io.sockets.adapter.rooms.get(room.code);
  if (!sockets) return;
  const roomSummary = roomManager.roomSummary(room);
  const gameState = room.game ? room.game.getState() : null;
  for (const socketId of sockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    const hand = room.game && socket.data.playerId ? room.game.getHand(socket.data.playerId) : null;
    socket.emit('state', { room: roomSummary, game: gameState, hand, yourPlayerId: socket.data.playerId });
  }
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name } = {}, cb) => {
    try {
      const { room, playerId } = roomManager.createRoom(name);
      socket.data.playerId = playerId;
      socket.data.roomCode = room.code;
      socket.join(room.code);
      cb?.({ ok: true, roomCode: room.code, playerId });
      broadcastState(room);
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('room:join', ({ roomCode, name } = {}, cb) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const { room, playerId, reconnected } = roomManager.joinRoom(code, name);
      socket.data.playerId = playerId;
      socket.data.roomCode = room.code;
      socket.join(room.code);
      cb?.({ ok: true, roomCode: room.code, playerId, reconnected });
      broadcastState(room);
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('room:start', (_payload, cb) => {
    try {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room) throw new Error('Not in a room');
      const started = roomManager.startGame(room.code, socket.data.playerId);
      cb?.({ ok: true });
      broadcastState(started);
      scheduleTurnTimer(started);
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('room:nextRound', (_payload, cb) => {
    try {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || !room.game) throw new Error('No active game');
      if (room.game.phase !== 'round_end') throw new Error('Round is not over');
      clearRoundAdvanceTimer(room.code);
      roomManager.startNextRound(room.code);
      cb?.({ ok: true });
      broadcastState(room);
      scheduleTurnTimer(room);
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('game:discard', ({ cardIds } = {}, cb) => {
    try {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || !room.game) throw new Error('No active game');
      room.game.discard(socket.data.playerId, cardIds || []);
      cb?.({ ok: true });
      broadcastState(room);
      scheduleTurnTimer(room);
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('game:draw', ({ source } = {}, cb) => {
    try {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || !room.game) throw new Error('No active game');
      room.game.draw(socket.data.playerId, source);
      cb?.({ ok: true });
      broadcastState(room);
      scheduleTurnTimer(room);
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('game:call', (_payload, cb) => {
    try {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || !room.game) throw new Error('No active game');
      room.game.call(socket.data.playerId);
      cb?.({ ok: true });
      broadcastState(room);
      clearTurnTimer(room.code);
      if (room.game.phase === 'round_end') scheduleRoundAdvance(room);
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    roomManager.markDisconnected(roomCode, playerId, () => {
      const room = roomManager.getRoom(roomCode);
      if (room) broadcastState(room);
    });
    const room = roomManager.getRoom(roomCode);
    if (room) broadcastState(room);
  });
});

httpServer.listen(PORT, () => {
  console.log(`200 game server listening on :${PORT}`);
});
