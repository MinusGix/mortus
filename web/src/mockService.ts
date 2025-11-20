import { type BoardCard, type GameSnapshot, type LogEntry, type PendingTask, type PlayerSummary } from './types'

const seedCards = (): BoardCard[] => [
  { id: '1', name: 'Maelstrom Wanderer', owner: 'Mira', zone: 'battlefield', note: 'Haste, double cascade' },
  { id: '2', name: 'Solemn Simulacrum', owner: 'Mira', zone: 'battlefield', tapped: true, note: 'Fetched Island' },
  { id: '3', name: 'Panharmonicon', owner: 'Row', zone: 'battlefield', note: 'Doubles ETB triggers' },
  { id: '4', name: 'Whirlwind Denial', owner: 'Row', zone: 'stack', note: 'Counter unless 4' },
  { id: '5', name: 'Mystic Remora', owner: 'Row', zone: 'battlefield', note: 'Upkeep 0' },
  { id: '6', name: 'Island', owner: 'Row', zone: 'battlefield', tapped: true },
  { id: '7', name: 'Command Tower', owner: 'Mira', zone: 'battlefield' },
]

const seedPlayers = (): PlayerSummary[] => [
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

const seedLog = (): LogEntry[] => [
  { label: 'Resolved', detail: 'Solemn Simulacrum ETB — searched basic Island', timestamp: Date.now() - 100000 },
  { label: 'Trigger', detail: 'Panharmonicon sees Solemn — double ETB prepared', timestamp: Date.now() - 82000 },
  { label: 'Stack', detail: 'Whirlwind Denial cast targeting cascade spells', timestamp: Date.now() - 61000 },
  { label: 'Action', detail: 'Combat declared — Meanderer swings for 7 commander', timestamp: Date.now() - 38000 },
  { label: 'Seed', detail: 'Game seed locked (A1B2-CASCADE) for determinism', timestamp: Date.now() - 20000 },
]

const seedPending = (): PendingTask[] => [
  { id: 'auth', text: 'Authorize websocket endpoint' },
  { id: 'rules', text: 'SANDBOX: local-only rules engine' },
  { id: 'deck', text: 'Deck import from Moxfield link' },
  { id: 'cache', text: 'Cache Scryfall image batch' },
]

export const getInitialSnapshot = (): GameSnapshot => ({
  seed: 'A1B2-CASCADE',
  players: seedPlayers(),
  board: seedCards(),
  log: seedLog(),
  pending: seedPending(),
})

export type MockServer = ReturnType<typeof createMockServer>

export const createMockServer = () => {
  let snapshot = getInitialSnapshot()
  let listeners: Array<(state: GameSnapshot) => void> = []

  const notify = () => {
    const copy: GameSnapshot = {
      ...snapshot,
      players: [...snapshot.players],
      board: [...snapshot.board],
      log: [...snapshot.log],
      pending: [...snapshot.pending],
    }
    listeners.forEach((cb) => cb(copy))
  }

  const addLog = (label: string, detail: string) => {
    snapshot = { ...snapshot, log: [{ label, detail, timestamp: Date.now() }, ...snapshot.log].slice(0, 20) }
  }

  return {
    subscribe(cb: (state: GameSnapshot) => void) {
      listeners.push(cb)
      cb(snapshot)
      return () => {
        listeners = listeners.filter((fn) => fn !== cb)
      }
    },
    joinRoom(code: string) {
      addLog('Join', `Joined room ${code} (mock)`)
      notify()
    },
    createRoom() {
      const code = `ROOM-${Math.random().toString(16).slice(2, 6).toUpperCase()}`
      snapshot = { ...snapshot, seed: code }
      addLog('Seed', `Created new room ${code}`)
      notify()
      return code
    },
    importDeck(url: string) {
      addLog('Deck', `Imported deck from ${url}`)
      notify()
    },
    updateStatus(playerId: string, status: PlayerSummary['status']) {
      snapshot = {
        ...snapshot,
        players: snapshot.players.map((p) => (p.id === playerId ? { ...p, status } : p)),
      }
      addLog('Status', `Updated ${playerId} to ${status}`)
      notify()
    },
    togglePending(taskId: string) {
      snapshot = {
        ...snapshot,
        pending: snapshot.pending.map((task) =>
          task.id === taskId ? { ...task, done: !task.done } : task,
        ),
      }
      addLog('Task', `Toggled task ${taskId}`)
      notify()
    },
    simulateAction(label: string, detail: string) {
      addLog(label, detail)
      notify()
    },
  }
}
