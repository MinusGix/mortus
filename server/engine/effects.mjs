import { EffectTypes } from './types.mjs'

/**
 * Applies a single effect to the game state.
 * Mutates the state in place.
 * @param {import('./types.mjs').GameState} state
 * @param {import('./types.mjs').Effect} effect
 */
export const applyEffect = (state, effect) => {
  switch (effect.type) {
    case EffectTypes.MOVE_ZONE: {
      const { cardId, fromZone, toZone, index } = effect.payload
      const card = state.board.find(c => c.id === cardId)
      if (!card) {
        console.warn(`Card ${cardId} not found for MOVE_ZONE`)
        return
      }
      
      // Update card zone
      card.zone = toZone
      
      // Handle ordering if index is provided (simple implementation for now)
      // In a real implementation, we might need to reorder the array or use a linked list
      // For now, we just update the zone property.
      
      // If moving to hand/library, we might want to reset some state
      if (toZone === 'hand' || toZone === 'library') {
        card.tapped = false
      }
      break
    }
    
    case EffectTypes.TAP_CARD: {
      const { cardId } = effect.payload
      const card = state.board.find(c => c.id === cardId)
      if (card) {
        card.tapped = true
      }
      break
    }

    case EffectTypes.UNTAP_CARD: {
      const { cardId } = effect.payload
      const card = state.board.find(c => c.id === cardId)
      if (card) {
        card.tapped = false
      }
      break
    }

    case EffectTypes.MODIFY_LIFE: {
      const { playerId, amount } = effect.payload
      const player = state.players.find(p => p.id === playerId)
      if (player) {
        player.life += amount
      }
      break
    }

    case EffectTypes.ADD_LOG: {
      const { label, detail } = effect.payload
      state.log = [{ label, detail, timestamp: Date.now() }, ...state.log].slice(0, 50)
      break
    }

    default:
      console.warn(`Unknown effect type: ${effect.type}`)
  }
}

/**
 * Returns the inverse of an effect for Undo functionality.
 * @param {import('./types.mjs').Effect} effect
 * @returns {import('./types.mjs').Effect}
 */
export const invertEffect = (effect) => {
  switch (effect.type) {
    case EffectTypes.MOVE_ZONE: {
      const { cardId, fromZone, toZone } = effect.payload
      // Inverse is moving back from toZone to fromZone
      return {
        type: EffectTypes.MOVE_ZONE,
        payload: { cardId, fromZone: toZone, toZone: fromZone }
      }
    }

    case EffectTypes.TAP_CARD: {
      const { cardId } = effect.payload
      return {
        type: EffectTypes.UNTAP_CARD,
        payload: { cardId }
      }
    }

    case EffectTypes.UNTAP_CARD: {
      const { cardId } = effect.payload
      return {
        type: EffectTypes.TAP_CARD,
        payload: { cardId }
      }
    }

    case EffectTypes.MODIFY_LIFE: {
      const { playerId, amount } = effect.payload
      return {
        type: EffectTypes.MODIFY_LIFE,
        payload: { playerId, amount: -amount }
      }
    }

    case EffectTypes.ADD_LOG: {
      // Logs are tricky to "undo" perfectly without storing the previous log state.
      // For now, we might just ignore it or add a "Undo" log entry.
      // Or we could remove the specific log entry if we had an ID.
      // Let's emit a special "REMOVE_LOG" effect or just ignore for now.
      // Ideally, we'd just pop the log from the state if we treat it as a stack, 
      // but the log is a rolling buffer.
      // Let's return a null effect or a no-op for now, as undoing logs is cosmetic.
      return { type: 'NO_OP', payload: {} }
    }

    default:
      console.warn(`Cannot invert effect type: ${effect.type}`)
      return { type: 'NO_OP', payload: {} }
  }
}
