import type { DeckListType } from 'moxfield-api'

export type MoxfieldDeckSummary = {
  id: string
  name: string
  commanders: string[]
  mainboardCount: number
  cachedAt: number
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
