import { type GameSnapshot, type PendingTask, type PlayerStatus } from './types'

export type ConnectionStatus = 'connecting' | 'open' | 'closed'

export type ClientState = {
  status: ConnectionStatus
  room: string | null
  snapshot: GameSnapshot | null
  lastError?: string
}

export type WsClient = ReturnType<typeof createWsClient>

export const createWsClient = (url: string) => {
  let ws: WebSocket | null = null
  let listeners: Array<(state: ClientState) => void> = []
  let createResolvers: Array<(room: string) => void> = []
  let requestId = 0
  const pendingMoxfield = new Map<
    string,
    (result: { id: string; deck: unknown; fetchedAt: number; cached: boolean; error?: string }) => void
  >()

  let state: ClientState = {
    status: 'closed',
    room: null,
    snapshot: null,
  }

  const notify = () => {
    listeners.forEach((cb) => cb(state))
  }

  const setState = (patch: Partial<ClientState>) => {
    state = { ...state, ...patch }
    notify()
  }

  const waitForOpen = () =>
    new Promise<void>((resolve) => {
      if (ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }
      if (!ws) {
        resolve()
        return
      }
      ws.addEventListener(
        'open',
        () => {
          resolve()
        },
        { once: true },
      )
    })

  const handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)
      switch (data.type) {
        case 'snapshot':
          setState({ snapshot: data.state as GameSnapshot, room: data.room ?? state.room })
          return
        case 'room_created':
          setState({ room: data.room })
          createResolvers.forEach((resolve) => resolve(data.room))
          createResolvers = []
          return
        case 'moxfield_result': {
          const resolver = pendingMoxfield.get(data.requestId)
          if (resolver) {
            resolver(data)
            pendingMoxfield.delete(data.requestId)
          }
          return
        }
        case 'error':
          setState({ lastError: data.message })
          return
        default:
          return
      }
    } catch (err) {
      setState({ lastError: err instanceof Error ? err.message : 'Failed to parse server message' })
    }
  }

  const connect = () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    ws = new WebSocket(url)
    setState({ status: 'connecting', lastError: undefined })
    ws.addEventListener('open', () => setState({ status: 'open' }))
    ws.addEventListener('close', () => setState({ status: 'closed' }))
    ws.addEventListener('error', () => setState({ status: 'closed', lastError: 'Connection error' }))
    ws.addEventListener('message', handleMessage)
  }

  const send = async (payload: unknown) => {
    connect()
    await waitForOpen()
    ws?.send(JSON.stringify(payload))
  }

  return {
    connect,
    subscribe(cb: (state: ClientState) => void) {
      listeners.push(cb)
      cb(state)
      return () => {
        listeners = listeners.filter((fn) => fn !== cb)
      }
    },
    async joinRoom(room: string, playerName?: string) {
      await send({ type: 'join', room, playerName })
    },
    async createRoom() {
      await send({ type: 'create_room' })
      return new Promise<string>((resolve) => {
        createResolvers.push(resolve)
      })
    },
    async importDeck(url: string) {
      await send({ type: 'import_deck', url })
    },
    async updateStatus(playerId: string, status: PlayerStatus) {
      await send({ type: 'update_status', playerId, status })
    },
    async toggleTask(taskId: PendingTask['id']) {
      await send({ type: 'toggle_task', taskId })
    },
    async spectate() {
      await send({ type: 'spectate' })
    },
    async simulateAction(label: string, detail: string) {
      await send({ type: 'simulate_action', label, detail })
    },
    async gameAction(action: { type: string; payload?: unknown }) {
      await send({ type: 'game_action', action })
    },
    async undo() {
      await send({ type: 'undo' })
    },
    async fetchMoxfield(url: string) {
      const id = `mox-${++requestId}-${Date.now()}`
      await send({ type: 'fetch_moxfield', url, requestId: id })
      return new Promise<{
        id: string
        deck: unknown
        fetchedAt: number
        cached: boolean
        error?: string
      }>((resolve, reject) => {
        pendingMoxfield.set(id, (result) => {
          if (result?.error) {
            reject(new Error(result.error))
          } else {
            resolve(result)
          }
        })
      })
    },
    getState: () => state,
  }
}
