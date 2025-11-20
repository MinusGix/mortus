export type PlayerStatus = 'Ready' | 'Waiting' | 'Testing'

export type PlayerSummary = {
  id: string
  name: string
  deck: string
  life: number
  status: PlayerStatus
  commander: string
  color: string
}

export type Zone = 'battlefield' | 'stack' | 'hand'

export type BoardCard = {
  id: string
  name: string
  owner: string
  zone: Zone
  tapped?: boolean
  note?: string
}

export type LogEntry = {
  label: string
  detail: string
  timestamp: number
}

export type PendingTask = {
  id: string
  text: string
  done?: boolean
}

export type GameSnapshot = {
  seed: string
  players: PlayerSummary[]
  board: BoardCard[]
  log: LogEntry[]
  pending: PendingTask[]
}
