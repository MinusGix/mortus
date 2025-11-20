The core project idea is a web application to play Magic the Gathering against other players over the internet easy peasy.

Cards: Access cards and graphics from scryfall api.
Decks: Support loading decks from various places, like moxfield.
Cache decks, card information, and graphics locally to avoid slamming the scryfall api.

Cards would be recognized based on common patterns and identifiers for their effects, with custom registration of effects on the server-side.
Effects are defined in code.

Use supabase for storing game information.

Possibly using some free server like render to run game logic and websocket server.

# Game Recordings
Record game actions, but also their effects for later review and analysis. Effects are stored so that reviews can be replayed accurately even if the code changes later.

# Random Numbers
Random generation is done on the server-side to avoid cheating. As well, consistent seeds based on the initially random game code. This ensures repeated good seeds.


SKETCH:
```js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURATION ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } }); // Allow all connections for now

// Connect to your "Long Term Memory"
const supabase = createClient('YOUR_SUPABASE_URL', 'YOUR_SUPABASE_ANON_KEY');

// Image Cache Setup (Ephemeral)
const CACHE_DIR = path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

// --- IMAGE PROXY (The Temporary Cache) ---
app.get('/card/:id', async (req, res) => {
    const cardId = req.params.id;
    const localPath = path.join(CACHE_DIR, `${cardId}.jpg`);

    if (fs.existsSync(localPath)) return res.sendFile(localPath);

    try {
        const response = await axios({
            url: `https://api.scryfall.com/cards/${cardId}?format=image`,
            method: 'GET',
            responseType: 'stream'
        });
        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);
        writer.on('finish', () => res.sendFile(localPath));
    } catch (e) {
        res.status(404).send('Card not found');
    }
});

// --- GAME SERVER (The Logic) ---
// Store active games in memory (RAM is fast!)
const activeGames = {}; 

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('join_game', (roomId) => {
        socket.join(roomId);
        if (!activeGames[roomId]) {
            activeGames[roomId] = { 
                history: [], // The "Replay" log
                startTime: new Date() 
            };
        }
    });

    socket.on('game_action', (data) => {
        const { roomId, action } = data;
        
        // 1. Broadcast move to opponent
        socket.to(roomId).emit('game_action', action);

        // 2. Record move in RAM
        if (activeGames[roomId]) {
            activeGames[roomId].history.push({
                player: socket.id,
                move: action,
                timestamp: Date.now()
            });
        }
    });

    socket.on('game_over', async (data) => {
        const { roomId, winner, p1Deck, p2Deck } = data;
        const game = activeGames[roomId];

        if (game) {
            console.log("Saving replay to database...");
            
            // 3. FLUSH TO DATABASE (Persist forever)
            const { error } = await supabase
                .from('game_replays')
                .insert({
                    player1_deck_name: p1Deck,
                    player2_deck_name: p2Deck,
                    winner: winner,
                    game_log: game.history // Dumps the whole array as JSON
                });

            if (error) console.error('Error saving replay:', error);
            
            // Clear from RAM to save memory
            delete activeGames[roomId]; 
        }
    });
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
```

# Appearance
Allow changing the appearance of the game to the user. Though at first we'll just have a fancy vintage theme and a simple dark modern theme. Background, borders, tokens, edges, details, etc.

Flat main board area. Decks to the left with graveyard and exile. Commander(s) position. Cards can be played and can have tokens on them.


  - Goal: browser-based MTG tabletop with online matchmaking, authoritative server, and persistent replays; fast to join (room code + spectators), minimal setup (paste a
    Moxfield link), and themeable table.
  - Architecture: Node/Express + Socket.IO for real-time; Supabase for auth/storage/replays; Scryfall for card data/images with local disk cache + periodic background refresh;
    optional CDN proxy for images to offload the server. Consider a lightweight rules/effects engine service to keep websocket node lean.
  - Card/data pipeline: nightly Scryfall bulk import into Supabase (cards, rulings, set info); store card faces and oracle text for rules parsing; local image cache with LRU
    cleanup and hash-based filenames; detect updates via Scryfall ETag; maintain a derived table for common pattern IDs used by the effect engine.
  - Deck ingest: support Moxfield/Archidekt/CSV; normalize to internal card IDs; store sideboard/commander flags; validate against card DB; cache imports per URL hash to avoid
    re-fetching.
  - Gameplay protocol: room creation returns a seed used for all RNG; server is authoritative for shuffles/draws/random targets; clients send intent, server applies rules/
    effects, returns resolved state delta; support reconnection with state snapshot; spectators are read-only.
  - Rules/effect engine: declare effects as code modules keyed by a pattern registry (e.g., “draw X cards”, “ETB trigger”, “mana ability”); allow manual overrides for edge
    cases; log both intent and resolved effects for replays; include a generic stack, priority passes, turn structure, and layers for continuous effects; plugin slots for
    custom formats/house rules.
  - Replays/recordings: store both action log and resolved effects + RNG seed; allow deterministic replay even if code changes (version replays against stored engine version or
    embed effect resolution results); add annotations for users to bookmark turns.
  - Persistence model (Supabase): tables for users/profiles, decks/imports, card_cache, games (metadata + current state pointer), game_logs (JSONB), game_actions (normalized),
    replays, audit/trust events; row-level security to keep private games private; signed URLs for image fetches if needed.
  - Anti-cheat/trust: server handles RNG/shuffles; hash decklist upon join; optional client integrity pings; audit log of manual overrides; limit custom card injections to
    private rooms only.
  - UI/UX: two initial themes (vintage parchment with subtle grain; modern dark minimal); layout: flat board center, player zones compact on left/right, commander zone
    prominent, tokens/attachments stacked; drag/drop with snap points; keyboard shortcuts for common actions; accessible color choices and reduced-motion toggle.
  - Offline/perf: optimistic UI for actions while waiting for server ack; prefetch top of library; debounce network chatter; compress state diffs; lazy-load images; worker for
    rules evaluation on client for previews.
  - Ops: deploy logic/websocket on Render/Fly; static front-end on Vercel/Netlify; cron worker for Scryfall sync + cache pruning; monitor via health pings and basic metrics
    (active rooms, latency).
  - MVP slice: 2-player casual, 60-card constructed; basic stack/turn flow; shuffling/drawing/casting permanents/spells, combat with blockers; text-only battlefield with a
    simple card panel; Moxfield import; deterministic replays.
