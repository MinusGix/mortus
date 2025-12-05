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

    case ActionTypes.MOVE_CARD: {
      const { cardId, toZone, index } = action.payload
      const card = state.board.find(c => c.id === cardId)
      if (!card) throw new Error('Card not found')

      effects.push({
        type: EffectTypes.MOVE_ZONE,
        payload: {
          cardId,
          fromZone: card.zone,
          toZone,
          index
        }
      })

      // Log it
      effects.push({
        type: EffectTypes.ADD_LOG,
        payload: {
          label: 'Move',
          detail: `${state.players.find(p => p.id === action.playerId)?.name} moved ${card.name} to ${toZone}`
        }
      })
      break
    }

    case ActionTypes.DRAW_CARD: {
      const { playerId, amount = 1 } = action.payload
      const player = state.players.find(p => p.id === playerId)
      if (!player) throw new Error('Player not found')

      // Find top cards of library
      const library = state.board
        .filter(c => c.owner === player.name && c.zone === 'library')
      // Assuming board order is top-to-bottom for library? 
      // Or we need to sort? The engine doesn't enforce sort order in state.board strictly unless we do.
      // But SET_ZONE_ORDER puts them at the end.
      // Let's assume the END of the array is the "TOP" of the library for pop(), or 0 is top?
      // Usually 0 is top. Let's assume 0 is top.
      // Wait, SET_ZONE_ORDER appends. So if we append, the last elements are the ones we just sorted.
      // If we want 0 to be top, we should prepend?
      // Let's define: Index 0 is TOP of library.

      // If we use 0 as top, then `state.board` order matters.
      // In `SET_ZONE_ORDER`, we did `[...otherCards, ...sortedCards]`.
      // So the sorted cards are at the END.
      // So the LAST element is the "bottom" or "top"?
      // Let's say the LAST element is the TOP of the library (like a stack).
      // Then pop() works naturally.

      // Let's grab the last 'amount' cards from the library subset of board.
      // Actually, we need to find them in the main board array to get their IDs.
      // But `state.board` is mixed.
      // We need to filter first.

      // Optimization: We can't easily "pop" from a filtered list and know the index in the main list without search.
      // But we can just find the cards.

      const libraryCards = state.board.filter(c => c.owner === player.name && c.zone === 'library')
      // If we assume the order in `state.board` reflects the library order (relative to each other),
      // then we take the last N cards.

      const cardsToDraw = libraryCards.slice(-amount)

      cardsToDraw.forEach(card => {
        effects.push({
          type: EffectTypes.MOVE_ZONE,
          payload: {
            cardId: card.id,
            fromZone: 'library',
            toZone: 'hand'
          }
        })
      })

      effects.push({
        type: EffectTypes.ADD_LOG,
        payload: {
          label: 'Draw',
          detail: `${player.name} drew ${amount} card${amount > 1 ? 's' : ''}`
        }
      })
      break
    }

    case ActionTypes.SHUFFLE_LIBRARY: {
      const { playerId } = action.payload
      const player = state.players.find(p => p.id === playerId)

      const libraryCards = state.board.filter(c => c.owner === player.name && c.zone === 'library')
      const currentOrder = libraryCards.map(c => c.id)

      // Fisher-Yates shuffle
      const newOrder = [...currentOrder]
      for (let i = newOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
      }

      effects.push({
        type: EffectTypes.SET_ZONE_ORDER,
        payload: {
          zone: 'library',
          owner: player.name,
          order: newOrder,
          previousOrder: currentOrder
        }
      })

      effects.push({
        type: EffectTypes.ADD_LOG,
        payload: {
          label: 'Shuffle',
          detail: `${player.name} shuffled their library`
        }
      })
      break
    }

    case ActionTypes.MODIFY_LIFE: {
      const { playerId, amount } = action.payload
      effects.push({
        type: EffectTypes.MODIFY_LIFE,
        payload: { playerId, amount }
      })

      effects.push({
        type: EffectTypes.ADD_LOG,
        payload: {
          label: 'Life',
          detail: `${state.players.find(p => p.id === playerId)?.name} ${amount > 0 ? 'gained' : 'lost'} ${Math.abs(amount)} life`
        }
      })
      break
    }

    default:
      console.warn(`Unknown action type: ${action.type}`)
  }

  return effects
}
