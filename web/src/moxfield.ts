import type { DeckListType } from 'moxfield-api'

const STORAGE_KEY = 'mortus-moxfield-cache-v1'
const inMemoryCache: Record<string, CachedMoxfieldDeck> = {}

export type CachedMoxfieldDeck = {
  id: string
  decklist: DeckListType
  fetchedAt: number
}

export type MoxfieldDeckSummary = {
  id: string
  name: string
  commanders: string[]
  mainboardCount: number
  cachedAt: number
}

const getStorage = () => (typeof window !== 'undefined' ? window.localStorage : null)

const loadCache = () => {
  const storage = getStorage()
  if (!storage) return { ...inMemoryCache }
  try {
    const data = storage.getItem(STORAGE_KEY)
    if (!data) return { ...inMemoryCache }
    return { ...inMemoryCache, ...(JSON.parse(data) as Record<string, CachedMoxfieldDeck>) }
  } catch {
    return { ...inMemoryCache }
  }
}

const saveCache = (cache: Record<string, CachedMoxfieldDeck>) => {
  const storage = getStorage()
  Object.assign(inMemoryCache, cache)
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    /* ignore write failures */
  }
}

const normalizeId = (raw: string) => {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Enter a Moxfield deck link or id')
  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split('/').filter(Boolean)
    const deckIndex = parts.findIndex((p) => p === 'decks')
    if (deckIndex >= 0 && parts[deckIndex + 1]) return parts[deckIndex + 1]
    return parts.pop() ?? trimmed
  } catch {
    return trimmed
  }
}

const proxyBase = import.meta.env.VITE_MOXFIELD_PROXY || 'http://localhost:4000/moxfield'

export async function getMoxfieldDeck(idOrUrl: string): Promise<CachedMoxfieldDeck> {
  const id = normalizeId(idOrUrl)
  const cache = loadCache()
  if (cache[id]) {
    return cache[id]
  }

  const response = await fetch(`${proxyBase}/${id}`)
  if (!response.ok) {
    throw new Error(`Moxfield proxy error ${response.status}`)
  }
  const decklist = (await response.json()) as DeckListType
  const record: CachedMoxfieldDeck = { id, decklist, fetchedAt: Date.now() }
  saveCache({ ...cache, [id]: record })
  return record
}

export const summarizeDeck = (decklist: DeckListType, id: string, cachedAt = Date.now()): MoxfieldDeckSummary => {
  const boards = (decklist as any).boards ?? {}
  const mainboard = boards.mainboard?.cards ?? (decklist as any)?.mainboard ?? {}

  const commandersBoard = boards.commanders?.cards ?? boards.commander?.cards ?? {}
  const commanderNames = Object.values(commandersBoard as Record<string, any>).map(
    (card) => card?.card?.name ?? card?.name ?? card?.print?.name,
  )

  const mainboardCount = Object.values(mainboard as Record<string, any>).reduce((sum, card: any) => {
    const qty = card?.quantity ?? card?.qty ?? card?.count ?? 1
    return sum + Number(qty || 0)
  }, 0)

  return {
    id,
    name: (decklist as any).name ?? 'Moxfield deck',
    commanders: commanderNames.filter(Boolean),
    mainboardCount,
    cachedAt,
  }
}
