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
  return {
    name: print.name,
    manaCost: print.manaCost || print.mana_cost || card.manaCost || null,
    typeLine: print.typeLine || print.type_line || card.typeLine || null,
    oracleText: print.oracleText || print.oracle_text || card.oracleText || null,
    image: print.image || print.image_uris?.normal || print.image_uris?.large || null,
    scryfallId: print.scryfallId || print.scryfall_id || print.scryfallId ?? null,
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
    return { id, deck: moxfieldCache[id].deck, fetchedAt: moxfieldCache[id].fetchedAt, cached: true }
  }
  const api = new MoxfieldApi()
  const deck = await api.deckList.findById(id)
  const record = { deck: simplifyDeck(deck), fetchedAt: Date.now() }
  moxfieldCache[id] = record
  saveCache()
  return { id, deck, fetchedAt: record.fetchedAt, cached: false }
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
        addLog(currentRoom, 'Deck', `${name} imported deck from ${data.url || 'unknown source'}`)
        broadcastSnapshot(currentRoom)
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
