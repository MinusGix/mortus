import { WebSocketServer } from 'ws'
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

const server = new WebSocketServer({ port: PORT })
console.log(`Websocket server on ws://localhost:${PORT}`)

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
