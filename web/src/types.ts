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

export type Zone = 'battlefield' | 'stack' | 'hand' | 'graveyard' | 'exile' | 'library' | 'commander'

export type BoardCard = {
  id: string
  name: string
  owner: string
  zone: Zone
  tapped?: boolean
  note?: string
  manaCost?: string | null
  typeLine?: string | null
  oracleText?: string | null
  image?: string | null
  backImage?: string | null
  scryfallId?: string | null
  legalities?: Record<string, string> | null
  colors?: string[] | null
  order?: number
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
