import { ActionTypes, EffectTypes } from './types.mjs'

/**
 * Processes an action and returns a list of effects.
 * Does NOT mutate state.
 * @param {import('./types.mjs').GameState} state
 * @param {import('./types.mjs').Action} action
 * @returns {import('./types.mjs').Effect[]}
 */
export const processAction = (state, action) => {
  const effects = []

  switch (action.type) {
    case ActionTypes.PLAY_LAND: {
      const { cardId, playerId } = action.payload
      const card = state.board.find(c => c.id === cardId)
      
      if (!card) {
        throw new Error('Card not found')
      }
      
      if (card.owner !== playerId && card.owner !== state.players.find(p => p.id === playerId)?.name) {
         // Note: owner in board is name, playerId is id. We need to map them.
         // For now, let's assume simple validation or that the caller handles basic auth.
         // But strictly, we should check ownership.
      }

      if (card.zone !== 'hand') {
        throw new Error('Card must be in hand to play as land')
      }

      // In a real engine, we'd check if it's a land card, if land drop is available, etc.
      // For now, we assume it's valid.

      effects.push({
        type: EffectTypes.MOVE_ZONE,
        payload: {
          cardId,
          fromZone: 'hand',
          toZone: 'battlefield'
        }
      })

      effects.push({
        type: EffectTypes.ADD_LOG,
        payload: {
          label: 'Land',
          detail: `${state.players.find(p => p.id === playerId)?.name || playerId} played ${card.name}`
        }
      })
      break
    }

    case ActionTypes.TAP_CARD: {
      const { cardId, playerId } = action.payload
      const card = state.board.find(c => c.id === cardId)
      if (!card) throw new Error('Card not found')
      
      if (card.tapped) throw new Error('Card is already tapped')

      effects.push({
        type: EffectTypes.TAP_CARD,
        payload: { cardId }
      })
      break
    }

    case ActionTypes.UNTAP_CARD: {
        const { cardId } = action.payload
        const card = state.board.find(c => c.id === cardId)
        if (!card) throw new Error('Card not found')
        
        if (!card.tapped) throw new Error('Card is already untapped')
  
        effects.push({
          type: EffectTypes.UNTAP_CARD,
          payload: { cardId }
        })
        break
      }

    default:
      console.warn(`Unknown action type: ${action.type}`)
  }

  return effects
}
