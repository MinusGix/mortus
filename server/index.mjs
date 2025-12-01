import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import MoxfieldApi from 'moxfield-api'
import { randomBytes } from 'crypto'
import { supabase } from './db.mjs'
import { Game } from './engine/game.mjs'
import { ActionTypes } from './engine/types.mjs'

const PORT = process.env.PORT || 4000
const rooms = new Map()

const makeSeed = () => `ROOM-${randomBytes(3).toString('hex').toUpperCase()}`
const now = () => Date.now()

const basePlayers = () => [
  {
    id: 'p1',
    name: 'Mira',
    deck: 'Temur Cascade',
    life: 21,
    status: 'Ready',
    commander: 'Maelstrom Wanderer',
    color: '#72e081',
  },
  {
    id: 'p2',
    name: 'Row',
    deck: 'Izzet Spells',
    life: 18,
    status: 'Testing',
    commander: 'Jhoira, Weatherlight Captain',
    color: '#68c5ff',
  },
]

const baseBoard = () => [
  { id: '1', name: 'Maelstrom Wanderer', owner: 'Mira', zone: 'battlefield', note: 'Haste, double cascade' },
  { id: '2', name: 'Solemn Simulacrum', owner: 'Mira', zone: 'battlefield', tapped: true, note: 'Fetched Island' },
  { id: '3', name: 'Panharmonicon', owner: 'Row', zone: 'battlefield', note: 'Doubles ETB triggers' },
  { id: '4', name: 'Whirlwind Denial', owner: 'Row', zone: 'stack', note: 'Counter unless 4' },
  { id: '5', name: 'Mystic Remora', owner: 'Row', zone: 'battlefield', note: 'Upkeep 0' },
  { id: '6', name: 'Island', owner: 'Row', zone: 'battlefield', tapped: true },
  { id: '7', name: 'Command Tower', owner: 'Mira', zone: 'battlefield' },
  // commander / hand / graveyard / exile
  { id: '8', name: 'Maelstrom Wanderer', owner: 'Mira', zone: 'commander', note: 'Commander' },
  { id: '9', name: 'Sakura-Tribe Elder', owner: 'Mira', zone: 'graveyard', note: 'Sacked for land' },
  { id: '10', name: 'Cyclonic Rift', owner: 'Row', zone: 'exile', note: 'Exiled by Remora' },
  { id: '11', name: 'Steam Vents', owner: 'Row', zone: 'graveyard', note: 'Fetch target' },
  { id: '12', name: 'Brainstorm', owner: 'Row', zone: 'hand', note: 'Hand' },
  { id: '13', name: 'Arcane Denial', owner: 'Row', zone: 'hand', note: 'Hand' },
  { id: '14', name: 'Misty Rainforest', owner: 'Mira', zone: 'hand', note: 'Hand' },
  { id: '15', name: 'Everflowing Chalice', owner: 'Mira', zone: 'hand', note: 'Hand' },
]

const basePending = () => [
  { id: 'auth', text: 'Authorize websocket endpoint' },
  { id: 'rules', text: 'SANDBOX: local-only rules engine' },
  { id: 'deck', text: 'Deck import from Moxfield link' },
  { id: 'cache', text: 'Cache Scryfall image batch' },
]

const createRoomGame = (seed = makeSeed()) => {
  const initialState = {
    seed,
    players: basePlayers(),
    board: baseBoard(),
    log: [{ label: 'Seed', detail: `Game seed locked (${seed}) for determinism`, timestamp: now() }],
    pending: basePending(),
  }
  return new Game(initialState)
}

const getRoom = (code) => {
  if (!rooms.has(code)) {
    rooms.set(code, { code, game: createRoomGame(code), clients: new Set() })
  }
  return rooms.get(code)
}

const broadcastSnapshot = (room) => {
  const state = room.game.state
  // Calculate hand counts globally first
  const handCounts = state.players.reduce((acc, p) => {
    const count = state.board.filter((c) => c.zone === 'hand' && c.owner === p.name).length
    acc[p.id] = count
    return acc
  }, {})

  room.clients.forEach((client) => {
    if (client.readyState !== client.OPEN) return

    // Clone state to avoid mutating the source of truth
    const snapshot = { ...state }
    
    // 1. Filter Board: Remove cards in hand that don't belong to the viewer
    // If client has no playerId (spectator), they see NO hands (or maybe all? let's say none for privacy)
    const viewerId = client.playerId
    const viewerName = state.players.find((p) => p.id === viewerId)?.name

    snapshot.board = snapshot.board.filter((card) => {
      if (card.zone !== 'hand') return true
      // Only show hand cards if they belong to the viewer
      return card.owner === viewerName
    })

    // 2. Enrich Players: Add handCount and Rotate
    // We want the viewer to be at index 0 (Hero)
    const playersWithCounts = snapshot.players.map((p) => ({
      ...p,
      handCount: handCounts[p.id] || 0,
    }))

    let sortedPlayers = playersWithCounts
    if (viewerId) {
      const idx = playersWithCounts.findIndex((p) => p.id === viewerId)
      if (idx > -1) {
        // Rotate so viewer is first: [viewer, ...others, ...beforeViewer]
        // Actually, simple rotation:
        const before = playersWithCounts.slice(0, idx)
        const after = playersWithCounts.slice(idx)
        sortedPlayers = [...after, ...before]
      }
    }

    snapshot.players = sortedPlayers

    client.send(JSON.stringify({ type: 'snapshot', room: room.code, state: snapshot }))
  })
}

const addLog = (room, label, detail) => {
  // We can use the game's log directly or dispatch an effect.
  // For now, direct mutation to match existing pattern, but ideally we use effects.
  room.game.state.log = [{ label, detail, timestamp: now() }, ...room.game.state.log].slice(0, 50)
}

const updatePending = (room, taskId) => {
  room.game.state.pending = room.game.state.pending.map((task) =>
    task.id === taskId ? { ...task, done: !task.done } : task,
  )
}

const cachePath = new URL('./moxfield-cache.json', import.meta.url)
const loadCache = () => {
  if (!existsSync(cachePath)) return {}
  try {
    return JSON.parse(readFileSync(cachePath, 'utf8'))
  } catch {
    return {}
  }
}

let moxfieldCache = loadCache()

const saveCache = () => {
  try {
    writeFileSync(cachePath, JSON.stringify(moxfieldCache, null, 2))
  } catch (err) {
    console.error('Failed to persist moxfield cache', err)
  }
}

const normalizeId = (raw) => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) throw new Error('Missing deck id')
  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split('/').filter(Boolean)
    const deckIdx = parts.findIndex((p) => p === 'decks')
    if (deckIdx >= 0 && parts[deckIdx + 1]) return parts[deckIdx + 1]
    return parts.pop() || trimmed
  } catch {
    return trimmed
  }
}

const CARD_BACK_URL = process.env.CARD_BACK_URL || 'https://cards.scryfall.io/normal/back/5/3/532746e2-f822-4920-ab31-94e0c8baaa84.jpg'

const scryfallImageFromId = (id) => {
  if (!id || typeof id !== 'string' || id.length < 2) return null
  const safe = id.toLowerCase()
  return `https://cards.scryfall.io/normal/front/${safe[0]}/${safe[1]}/${safe}.jpg`
}

const scryfallBackFromId = (id) => {
  if (!id || typeof id !== 'string' || id.length < 2) return null
  const safe = id.toLowerCase()
  return CARD_BACK_URL || `https://cards.scryfall.io/back/${safe[0]}/${safe[1]}/${safe}.jpg`
}

const simplifyCard = (card) => {
  if (!card) return null
  const print = card.print || card.card || card
  const scryfallId = print.scryfallId ?? print.scryfall_id ?? card.scryfallId ?? card.scryfall_id ?? null
  const image =
    print.image ||
    print.image_uris?.normal ||
    print.image_uris?.large ||
    print.images?.normal ||
    print.images?.large ||
    print.card_faces?.[0]?.image_uris?.normal ||
    print.card_faces?.[0]?.image_uris?.large ||
    (scryfallId ? scryfallImageFromId(scryfallId) : null) ||
    null
  const backImage =
    print.image_back ||
    print.card_faces?.[1]?.image_uris?.normal ||
    print.card_faces?.[1]?.image_uris?.large ||
    (scryfallId ? scryfallBackFromId(scryfallId) : null) ||
    null
  return {
    name: print.name,
    manaCost: print.manaCost || print.mana_cost || card.manaCost || null,
    typeLine: print.typeLine || print.type_line || card.typeLine || null,
    oracleText: print.oracleText || print.oracle_text || card.oracleText || null,
    image,
    backImage,
    scryfallId,
    legalities: print.legalities || card.legalities || null,
    colors: print.color_identity || print.colors || card.colors || null,
  }
}

const simplifyDeck = (deck) => {
  const boards = deck.boards || {}
  const mapCards = (board = {}) =>
    Object.entries(board.cards || board).reduce((acc, [key, card]) => {
      acc[key] = {
        quantity: card.quantity || card.qty || card.count || 1,
        card: simplifyCard(card.card || card),
      }
      return acc
    }, {})

  return {
    id: deck.id,
    name: deck.name,
    commanders: mapCards(boards.commanders),
    mainboard: mapCards(boards.mainboard),
    sideboard: mapCards(boards.sideboard),
    maybeboard: mapCards(boards.maybeboard),
    companions: mapCards(boards.companions),
  }
}

const upgradeDeckImages = (deck) => {
  const mapBoard = (board = {}) =>
    Object.fromEntries(
      Object.entries(board || {}).map(([key, entry]) => {
        const card = entry?.card || {}
        const withImage = card.image
          ? card
          : card.scryfallId
            ? { ...card, image: scryfallImageFromId(card.scryfallId), backImage: scryfallBackFromId(card.scryfallId) }
            : card
        return [key, { ...entry, card: withImage }]
      }),
    )

  return {
    ...deck,
    commanders: mapBoard(deck.commanders),
    mainboard: mapBoard(deck.mainboard),
    sideboard: mapBoard(deck.sideboard),
    maybeboard: mapBoard(deck.maybeboard),
    companions: mapBoard(deck.companions),
  }
}

const fetchMoxfield = async (idOrUrl) => {
  const id = normalizeId(idOrUrl)
  if (moxfieldCache[id]) {
    const entry = moxfieldCache[id]
    if (entry.deck && entry.deck.mainboard) {
      const deck = upgradeDeckImages(entry.deck)
      moxfieldCache[id] = { ...entry, deck }
      return { id, deck, fetchedAt: entry.fetchedAt, cached: true }
    }
    if (entry.deck && entry.deck.boards) {
      const simplified = simplifyDeck(entry.deck)
      const record = { deck: upgradeDeckImages(simplified), fetchedAt: entry.fetchedAt || Date.now() }
      moxfieldCache[id] = record
      saveCache()
      return { id, deck: simplified, fetchedAt: record.fetchedAt, cached: true }
    }
  }
  const api = new MoxfieldApi()
  const deck = await api.deckList.findById(id)
  const record = { deck: upgradeDeckImages(simplifyDeck(deck)), fetchedAt: Date.now() }
  moxfieldCache[id] = record
  saveCache()
  return { id, deck, fetchedAt: record.fetchedAt, cached: false }
}

let cardCounter = 0
const nextCardId = (owner, name) => `c-${owner}-${name}-${++cardCounter}-${randomBytes(2).toString('hex')}`

const shuffle = (arr) => {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const buildBoardFromDeck = (deck, players) => {
  const board = []

  players.forEach((player) => {
    const mainboard = deck.mainboard || {}
    const commanders = deck.commanders || {}
    const library = []

    Object.values(mainboard).forEach((entry) => {
      const qty = entry?.quantity || 1
      for (let i = 0; i < qty; i++) {
        const card = entry.card || {}
        library.push({
          id: nextCardId(player.name, card.name || 'card'),
          name: card.name || 'Unknown card',
          owner: player.name,
          zone: 'library',
          manaCost: card.manaCost || null,
          typeLine: card.typeLine || null,
          oracleText: card.oracleText || null,
          image: card.image || null,
          backImage: card.backImage || scryfallBackFromId(card.scryfallId) || null,
          scryfallId: card.scryfallId || null,
          legalities: card.legalities || null,
          colors: card.colors || null,
        })
      }
    })

    const libraryShuffled = shuffle(library).map((card, idx) => ({ ...card, order: idx }))
    const draws = libraryShuffled.splice(0, 7).map((card) => ({ ...card, zone: 'hand', note: 'Hand' }))

    Object.values(commanders).forEach((entry) => {
      const qty = entry?.quantity || 1
      for (let i = 0; i < qty; i++) {
        const card = entry.card || {}
        board.push({
          id: nextCardId(player.name, card.name || 'Commander'),
          name: card.name || 'Commander',
          owner: player.name,
          zone: 'commander',
          note: 'Commander',
          manaCost: card.manaCost || null,
          typeLine: card.typeLine || null,
          oracleText: card.oracleText || null,
          image: card.image || null,
          backImage: card.backImage || scryfallBackFromId(card.scryfallId) || null,
          scryfallId: card.scryfallId || null,
          legalities: card.legalities || null,
          colors: card.colors || null,
        })
      }
    })

    board.push(...draws, ...libraryShuffled)
  })

  return board
}

const httpServer = createServer((req, res) => {
  res.writeHead(404)
  res.end('not found')
})

const server = new WebSocketServer({ server: httpServer })
httpServer.listen(PORT, () => {
  console.log(`Websocket + proxy server on http://localhost:${PORT}`)
})

server.on('connection', (socket) => {
  let currentRoom = null
  let name = `Guest-${randomBytes(2).toString('hex')}`

  const safeSend = (msg) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(msg))
    }
  }

  socket.on('message', async (raw) => {
    let data
    try {
      data = JSON.parse(raw.toString())
    } catch {
      safeSend({ type: 'error', message: 'Invalid JSON' })
      return
    }

    switch (data.type) {
      case 'join': {
        const { room: roomCode, playerName } = data
        if (!roomCode) {
          safeSend({ type: 'error', message: 'Missing room code' })
          return
        }
        name = playerName || name
        currentRoom = getRoom(roomCode)
        currentRoom.clients.add(socket)

        // Assign Player ID
        // Simple logic: First available slot
        const takenIds = new Set()
        currentRoom.clients.forEach(c => {
          if (c.playerId) takenIds.add(c.playerId)
        })

        if (!takenIds.has('p1')) {
          socket.playerId = 'p1'
        } else if (!takenIds.has('p2')) {
          socket.playerId = 'p2'
        } else {
          socket.playerId = null // Spectator
        }

        // Update player name if assigned
        if (socket.playerId) {
          const oldName = currentRoom.game.state.players.find(p => p.id === socket.playerId)?.name
          
          currentRoom.game.state.players = currentRoom.game.state.players.map(p => 
            p.id === socket.playerId ? { ...p, name: name } : p
          )

          // Update card ownership if name changed
          if (oldName && oldName !== name) {
            currentRoom.game.state.board = currentRoom.game.state.board.map(card => 
              card.owner === oldName ? { ...card, owner: name } : card
            )
          }
        }

        addLog(currentRoom, 'Join', `${name} joined room ${roomCode} as ${socket.playerId || 'Spectator'}`)
        broadcastSnapshot(currentRoom)
        break
      }
      case 'create_room': {
        const code = makeSeed()
        const room = getRoom(code)
        // room.game is already created by getRoom
        room.clients.add(socket)
        
        // Creator is always p1
        socket.playerId = 'p1'
        
        currentRoom = room
        safeSend({ type: 'room_created', room: code })
        broadcastSnapshot(room)
        break
      }
      case 'import_deck': {
        if (!currentRoom) return
        if (!data.url) {
          addLog(currentRoom, 'Deck', `${name} tried to import a deck without a URL/id`)
          safeSend({ type: 'error', message: 'Missing deck url or id' })
          break
        }
        
        const playerId = socket.playerId
        if (!playerId) {
           safeSend({ type: 'error', message: 'You are not a player' })
           break
        }

        fetchMoxfield(data.url)
          .then((result) => {
            const commanders = Object.values(result.deck.commanders || {}).map((entry) => entry.card?.name).filter(Boolean)
            
            // Update player metadata
            currentRoom.game.state.players = currentRoom.game.state.players.map((p) => 
              p.id === playerId ? {
                ...p,
                deck: result.deck.name || p.deck,
                commander: commanders.join(' / ') || p.commander,
              } : p
            )

            const player = currentRoom.game.state.players.find(p => p.id === playerId)

            // Remove existing cards owned by this player
            currentRoom.game.state.board = currentRoom.game.state.board.filter(c => c.owner !== player.name)

            // Build new cards ONLY for this player
            const newCards = buildBoardFromDeck(result.deck, [player])
            currentRoom.game.state.board.push(...newCards)

            addLog(
              currentRoom,
              'Deck',
              `${name} imported deck ${result.deck.name || result.id} (cached: ${result.cached ? 'yes' : 'no'})`,
            )
            broadcastSnapshot(currentRoom)
          })
          .catch((err) => {
            addLog(currentRoom, 'Deck', `${name} failed to import deck: ${err?.message || 'Unknown error'}`)
            safeSend({ type: 'error', message: err?.message || 'Failed to import deck' })
          })
        break
      }
      case 'fetch_moxfield': {
        const { url, requestId } = data
        const sendResult = (payload) => safeSend({ type: 'moxfield_result', requestId, ...payload })
        if (!url) {
          sendResult({ error: 'Missing deck url or id' })
          break
        }
        fetchMoxfield(url)
          .then((result) => sendResult(result))
          .catch((err) => sendResult({ error: err?.message || 'Failed to load deck' }))
        break
      }
      case 'update_status': {
        if (!currentRoom) return
        currentRoom.game.state.players = currentRoom.game.state.players.map((p) =>
          p.id === data.playerId ? { ...p, status: data.status } : p,
        )
        addLog(currentRoom, 'Status', `${name} set ${data.playerId} to ${data.status}`)
        broadcastSnapshot(currentRoom)
        break
      }
      case 'toggle_task': {
        if (!currentRoom) return
        updatePending(currentRoom, data.taskId)
        addLog(currentRoom, 'Task', `${name} toggled ${data.taskId}`)
        broadcastSnapshot(currentRoom)
        break
      }
      case 'spectate': {
        if (!currentRoom) return
        addLog(currentRoom, 'Spectate', `${name} entered spectate-only mode`)
        broadcastSnapshot(currentRoom)
        break
      }
      case 'game_action': {
        if (!currentRoom) return
        if (!socket.playerId) {
            safeSend({ type: 'error', message: 'Spectators cannot perform actions' })
            break
        }

        try {
            currentRoom.game.dispatch({
                ...data.action,
                playerId: socket.playerId,
            })
            broadcastSnapshot(currentRoom)
        } catch (err) {
            safeSend({ type: 'error', message: err.message })
        }
        break
      }
      case 'undo': {
        if (!currentRoom) return
        if (!socket.playerId) {
            safeSend({ type: 'error', message: 'Spectators cannot undo' })
            break
        }
        currentRoom.game.undo()
        addLog(currentRoom, 'Undo', `${name} undid the last action`)
        broadcastSnapshot(currentRoom)
        break
      }
      case 'simulate_action': {
        if (!currentRoom) return
        addLog(currentRoom, data.label || 'Action', data.detail || 'No detail')
        broadcastSnapshot(currentRoom)
        break
      }
      case 'game_over': {
        if (!currentRoom) return
        const { winner } = data
        addLog(currentRoom, 'Game Over', `Winner: ${winner}`)
        broadcastSnapshot(currentRoom)

        if (supabase) {
          const { error } = await supabase
            .from('game_replays')
            .insert({
              room_code: currentRoom.code,
              winner,
              log: currentRoom.game.state.log,
              final_state: currentRoom.game.state,
              history: currentRoom.game.state.history // Save the full history!
            })
          
          if (error) {
            console.error('Error saving replay:', error)
            safeSend({ type: 'error', message: 'Failed to save replay' })
          } else {
            console.log('Replay saved successfully')
            safeSend({ type: 'notification', message: 'Replay saved!' })
          }
        } else {
            console.log('Supabase not configured, skipping replay save')
        }
        break
      }
      default:
        safeSend({ type: 'error', message: 'Unknown message type' })
    }
  })

  socket.on('close', () => {
    if (currentRoom) currentRoom.clients.delete(socket)
  })
})
