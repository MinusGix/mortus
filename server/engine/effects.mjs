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

    case EffectTypes.SET_ZONE_ORDER: {
      const { zone, owner, order } = effect.payload
      // order is an array of cardIds in the desired order
      // We need to reorder the cards in state.board that match zone/owner

      // 1. Extract cards in that zone/owner
      const cardsInZone = state.board.filter(c => c.zone === zone && c.owner === owner)
      const otherCards = state.board.filter(c => c.zone !== zone || c.owner !== owner)

      // 2. Sort cardsInZone based on 'order' array
      // If a cardId is missing from 'order', put it at the end (shouldn't happen if logic is correct)
      const sortedCards = cardsInZone.sort((a, b) => {
        const indexA = order.indexOf(a.id)
        const indexB = order.indexOf(b.id)
        if (indexA === -1) return 1
        if (indexB === -1) return -1
        return indexA - indexB
      })

      // 3. Reconstruct board (preserving relative order of other cards is tricky if we just concat)
      // Actually, state.board is a flat list. The order in the list MATTERS for the library/stack.
      // So we should probably just append the sorted cards to the others, OR 
      // if we want to be precise, we replace the chunk. 
      // But since 'board' is a mix of everything, 'order' usually implies "top to bottom" for library/stack.

      // Let's assume we just want to replace the state.board with a new array where 
      // the cards of this zone/owner are in the new order, and others are untouched.
      // BUT, to preserve the "slot" of the zone relative to others? No, zones are logical.
      // So we can just filter out the old ones and push the new ones? 
      // Wait, if we just append, they might move "after" other cards? 
      // Does board order matter for distinct zones? 
      // Yes, for library/stack. No for hand/battlefield usually.
      // So let's just reconstruct:

      state.board = [...otherCards, ...sortedCards]
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

    case EffectTypes.SET_ZONE_ORDER: {
      const { zone, owner, previousOrder } = effect.payload
      // Inverse is setting the order back to previousOrder
      return {
        type: EffectTypes.SET_ZONE_ORDER,
        payload: { zone, owner, order: previousOrder, previousOrder: effect.payload.order }
      }
    }

    default:
      console.warn(`Cannot invert effect type: ${effect.type}`)
      return { type: 'NO_OP', payload: {} }
  }
}
