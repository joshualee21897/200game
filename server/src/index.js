import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './roomManager.js';
import { handValue } from './cards.js';
import { chooseBotRpsMove, chooseBotDiscard, shouldBotCall, chooseBotDrawSource } from './bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const ROUND_END_AUTO_ADVANCE_MS = 12000;
const BOT_THINK_MS = 3000;

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// In production the client is pre-built and served from here directly, so
// the app runs as a single process/port with no separate Vite dev server.
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: CLIENT_ORIGIN } });

const roomManager = new RoomManager();
const turnTimers = new Map(); // roomCode -> Timeout
const roundAdvanceTimers = new Map(); // roomCode -> Timeout
const botTimers = new Map(); // roomCode -> Timeout

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

function clearBotTimer(code) {
  const t = botTimers.get(code);
  if (t) clearTimeout(t);
  botTimers.delete(code);
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
    scheduleBotTurn(room);
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
      scheduleBotTurn(room);
    } catch (err) {
      console.error('auto round advance failed', err);
    }
  }, ROUND_END_AUTO_ADVANCE_MS);
  roundAdvanceTimers.set(room.code, handle);
}

function botThinkDelay() {
  return BOT_THINK_MS;
}

function isBotSeat(room, playerId) {
  return room.seats.find((s) => s.id === playerId)?.isBot === true;
}

function runBotTurn(game, botId) {
  const player = game.players.find((p) => p.id === botId);
  const difficulty = player.botDifficulty;
  const value = handValue(player.hand);
  if (shouldBotCall(value, difficulty)) {
    game.call(botId);
    return;
  }
  const cardIds = chooseBotDiscard(player.hand, difficulty);
  game.discard(botId, cardIds);
  const { source, cardId } = chooseBotDrawSource(game.pickableGroup, difficulty);
  game.draw(botId, source, cardId);
}

/**
 * Drives whichever bot needs to act next, if any - a bot throw-off choice
 * during 'rps', or a bot's full discard+draw (or call) turn once it's the
 * current player. Re-schedules itself after acting so a run of consecutive
 * bot turns (e.g. several bots in a row, or a multi-bot RPS sub-round)
 * keeps going without a human needing to do anything in between.
 */
function scheduleBotTurn(room) {
  clearBotTimer(room.code);
  const game = room.game;
  if (!game) return;

  if (game.phase === 'rps') {
    const pendingBotIds = game.rps.active.filter((id) => !game.rps.choices[id] && isBotSeat(room, id));
    if (pendingBotIds.length === 0) return;
    const handle = setTimeout(() => {
      for (const botId of pendingBotIds) {
        try {
          game.submitRpsChoice(botId, chooseBotRpsMove());
        } catch (err) {
          console.error('bot rps choice failed', err);
        }
      }
      broadcastState(room);
      scheduleTurnTimer(room);
      scheduleBotTurn(room);
    }, botThinkDelay());
    botTimers.set(room.code, handle);
    return;
  }

  if (game.phase === 'discard' || game.phase === 'draw') {
    const current = game.currentPlayer;
    if (!current || !isBotSeat(room, current.id)) return;
    const handle = setTimeout(() => {
      try {
        runBotTurn(game, current.id);
      } catch (err) {
        console.error('bot turn failed', err);
      }
      broadcastState(room);
      clearTurnTimer(room.code);
      if (game.phase === 'round_end') scheduleRoundAdvance(room);
      else scheduleTurnTimer(room);
      scheduleBotTurn(room);
    }, botThinkDelay());
    botTimers.set(room.code, handle);
  }
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

  socket.on('room:addBot', ({ difficulty } = {}, cb) => {
    try {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room) throw new Error('Not in a room');
      roomManager.addBot(room.code, socket.data.playerId, difficulty);
      cb?.({ ok: true });
      broadcastState(room);
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('room:removeBot', ({ botId } = {}, cb) => {
    try {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room) throw new Error('Not in a room');
      roomManager.removeBot(room.code, socket.data.playerId, botId);
      cb?.({ ok: true });
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
      scheduleBotTurn(started);
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
      scheduleBotTurn(room);
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('game:rpsChoice', ({ move } = {}, cb) => {
    try {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || !room.game) throw new Error('No active game');
      room.game.submitRpsChoice(socket.data.playerId, move);
      cb?.({ ok: true });
      broadcastState(room);
      scheduleTurnTimer(room); // no-ops unless the throw-off just resolved into round 1
      scheduleBotTurn(room);
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

  socket.on('game:draw', ({ source, cardId } = {}, cb) => {
    try {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || !room.game) throw new Error('No active game');
      room.game.draw(socket.data.playerId, source, cardId);
      cb?.({ ok: true });
      broadcastState(room);
      scheduleTurnTimer(room);
      scheduleBotTurn(room);
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
