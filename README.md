# 200

A real-time online multiplayer version of "200," a 2-10 player card game. Keep your hand value low, call when you're confident, and avoid busting past 200 points across rounds. Games of 6-10 players are dealt from two shuffled-together decks instead of one.

Full rules: see the project brief this was built from, or just play — the UI surfaces hand value, legal actions, and round results as you go.

## Stack

- **Server**: Node.js, Express, Socket.io. Server-authoritative game state (deck, hands, turn order, scoring) held in memory — nothing persists across a server restart.
- **Client**: React (Vite), plain CSS, `socket.io-client`.

## Running locally

Requires Node 20+.

```bash
npm install
npm run dev
```

This starts the server on `http://localhost:3001` and the client on `http://localhost:5173`. Open the client URL in two or more browser tabs/windows to play with yourself, or share your local network address with friends on the same network.

Run just the server tests:

```bash
npm test
```

### Production mode

```bash
npm start
```

This builds the React client (`vite build`) and then runs only the Express server, which serves the built client alongside the API/Socket.io on a single port (`http://localhost:3001` by default, or `$PORT`). There's no Vite dev server involved. The client connects its socket to the same origin the page was loaded from, so no `CLIENT_ORIGIN`/`VITE_SERVER_URL` configuration is needed as long as everything is served from that one process.

## How a game works

1. One player creates a room and shares the 5-letter room code.
2. 2-10 players join by typing a display name and the room code (no accounts) - or the host can click "Add Bot" in the waiting room to fill empty seats with computer players (handy for solo/practice games or short-handed groups). Bots play automatically: they meld/discard, choose a draw source, and call, each with a short "thinking" delay.
3. The host starts the game once at least 2 players are seated. Everyone throws rock-paper-scissors to decide who opens round 1 (ties and 3+-way splits just re-throw among whoever's still tied for the win).
4. Each turn: discard a single card or a valid meld (pair/triple/quad of one rank, or a same-suit run of 3+ consecutive cards — Ace is low, Jokers can't join a meld) — including your entire hand if it's all one valid meld, since the draw right after always brings you back to at least 1 card — then draw one card from the draw pile or the top of the discard pile.
5. If your hand value is 5 or less, you may call instead of discarding. All hands are revealed and scored per the round-resolution rules below.
6. Running totals persist across rounds; landing exactly on 50/100/150/200 rebates 50 points. Going over 200 (without landing exactly on it) ends the game for that player. Whoever had the lowest hand value at the last reveal opens the next round (see below).
7. Each turn has a 30-second clock; if it expires the server auto-plays (discards a card and/or draws) so the game never stalls. The rock-paper-scissors throw-off itself isn't timed.

### Reconnecting

Players are identified by their typed display name, not an account — there's no persistent login. If your connection drops mid-game, rejoin the same room with the **same name** (case-insensitive) to reclaim your seat and hand. A dropped seat is only freed automatically if the room is still in its lobby (pre-game) and the player doesn't return within a couple of minutes; once a game is underway, a seat is held indefinitely (the turn timer keeps the game moving in the meantime).

A flaky connection (WiFi blip, phone locking, browser auto-reconnecting the socket) doesn't need any of that typed back in manually: the client remembers your name and room code in `localStorage` and silently re-joins as soon as the socket reconnects, before you'd even notice you dropped. That saved session is cleared once the game you were in actually ends, so a later visit starts at a clean lobby instead of trying to rejoin a finished match.

## Notable implementation decisions

A few points in the brief were open to interpretation; here's what was implemented and why:

- **Call resolution — ties and wrong calls.** A caller who is strictly lowest wins (adds 0); if someone *ties* the caller's value, only the tying player adds 0 — the caller, having failed to be *strictly* lowest, adds their own hand value like a normal non-winner. If anyone is *strictly* lower, it's a wrong call: the caller adds a flat 30-point penalty only (not their hand value on top of it).
- **Next round's starter.** The brief says "the winner of each round starts the next round," but doesn't say who starts after a tie or a wrong call (no one "wins" in those cases). Implemented as: the caller starts next whenever their call succeeds (including a tie for lowest — ties go to the caller), otherwise whoever was strictly lowest starts next.
- **Runs and Ace ordering.** Ace is always low (matching its 1-point value), so `A-2-3` is a valid run but `Q-K-A` is not.
- **Turn timer scope.** The 30-second clock covers a full turn (discard *and* draw), not each action separately — it resets only when the turn passes to the next player.
- **Game end / overall winner.** The brief specifies the busted player "instantly loses" but doesn't name an overall winner among a 3+ player table. The UI reports the busted player and shows final standings, with the lowest remaining score highlighted as the effective winner.
- **Players supported.** The brief's overview says "4-5 player" but the setup section explicitly says "2-5 players supported" — implemented as 2-10, with two decks shuffled together once a table has 6+ players.

## What's not built

Per this build's scope: everything runs in-memory (a server restart loses all rooms/games), and there's no deployment configuration — this is meant to be run locally with `npm run dev`. Both would be straightforward to add later (a Redis/DB-backed store for persistence; a Dockerfile plus env-based config for hosting).
