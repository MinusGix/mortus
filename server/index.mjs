import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import MoxfieldApi from 'moxfield-api'
import { randomBytes } from 'crypto'

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

const createRoomState = (seed = makeSeed()) => ({
  seed,
  players: basePlayers(),
  board: baseBoard(),
  log: [{ label: 'Seed', detail: `Game seed locked (${seed}) for determinism`, timestamp: now() }],
  pending: basePending(),
})

const getRoom = (code) => {
  if (!rooms.has(code)) {
    rooms.set(code, { code, state: createRoomState(code), clients: new Set() })
  }
  return rooms.get(code)
}

const broadcastSnapshot = (room) => {
  const payload = JSON.stringify({ type: 'snapshot', room: room.code, state: room.state })
  room.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(payload)
  })
}

const addLog = (room, label, detail) => {
  room.state.log = [{ label, detail, timestamp: now() }, ...room.state.log].slice(0, 50)
}

const updatePending = (room, taskId) => {
  room.state.pending = room.state.pending.map((task) =>
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

const simplifyCard = (card) => {
  if (!card) return null
  const print = card.print || card.card || card
  const scryfallId = print.scryfallId ?? print.scryfall_id ?? card.scryfallId ?? card.scryfall_id ?? null
  return {
    name: print.name,
    manaCost: print.manaCost || print.mana_cost || card.manaCost || null,
    typeLine: print.typeLine || print.type_line || card.typeLine || null,
    oracleText: print.oracleText || print.oracle_text || card.oracleText || null,
    image: print.image || print.image_uris?.normal || print.image_uris?.large || null,
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

const fetchMoxfield = async (idOrUrl) => {
  const id = normalizeId(idOrUrl)
  if (moxfieldCache[id]) {
    const entry = moxfieldCache[id]
    if (entry.deck && entry.deck.mainboard) {
      return { id, deck: entry.deck, fetchedAt: entry.fetchedAt, cached: true }
    }
    if (entry.deck && entry.deck.boards) {
      const simplified = simplifyDeck(entry.deck)
      const record = { deck: simplified, fetchedAt: entry.fetchedAt || Date.now() }
      moxfieldCache[id] = record
      saveCache()
      return { id, deck: simplified, fetchedAt: record.fetchedAt, cached: true }
    }
  }
  const api = new MoxfieldApi()
  const deck = await api.deckList.findById(id)
  const record = { deck: simplifyDeck(deck), fetchedAt: Date.now() }
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
          scryfallId: card.scryfallId || null,
          legalities: card.legalities || null,
          colors: card.colors || null,
        })
      }
    })

    const libraryShuffled = shuffle(library).map((card, idx) => ({ ...card, order: idx }))
    const draws = libraryShuffled.splice(0, 3).map((card) => ({ ...card, zone: 'battlefield', note: card.typeLine }))

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

  socket.on('message', (raw) => {
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
        addLog(currentRoom, 'Join', `${name} joined room ${roomCode}`)
        broadcastSnapshot(currentRoom)
        break
      }
      case 'create_room': {
        const code = makeSeed()
        const room = getRoom(code)
        room.state = createRoomState(code)
        room.clients.add(socket)
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
        fetchMoxfield(data.url)
          .then((result) => {
            const commanders = Object.values(result.deck.commanders || {}).map((entry) => entry.card?.name).filter(Boolean)
            currentRoom.state.players = currentRoom.state.players.map((p) => ({
              ...p,
              deck: result.deck.name || p.deck,
              commander: commanders.join(' / ') || p.commander,
            }))
            currentRoom.state.board = buildBoardFromDeck(result.deck, currentRoom.state.players)
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
        currentRoom.state.players = currentRoom.state.players.map((p) =>
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
      case 'simulate_action': {
        if (!currentRoom) return
        addLog(currentRoom, data.label || 'Action', data.detail || 'No detail')
        broadcastSnapshot(currentRoom)
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
