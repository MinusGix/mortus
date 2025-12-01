import { applyEffect, invertEffect } from './effects.mjs'
import { processAction } from './rules.mjs'

export class Game {
  constructor(initialState) {
    this.state = {
      ...initialState,
      history: [], // Ensure history exists
    }
  }

  /**
   * Dispatches an action to the engine.
   * @param {import('./types.mjs').Action} action
   */
  dispatch(action) {
    // 1. Process Action -> Effects
    let effects = []
    try {
      effects = processAction(this.state, action)
    } catch (err) {
      console.error('Action failed:', err.message)
      return // Or throw, depending on how we want to handle it
    }

    // 2. Apply Effects
    effects.forEach(effect => {
      applyEffect(this.state, effect)
    })

    // 3. Record History
    this.state.history.push({
      action,
      effects,
      timestamp: Date.now()
    })
  }

  /**
   * Undoes the last action.
   */
  undo() {
    const lastEntry = this.state.history.pop()
    if (!lastEntry) return

    // Apply inverse effects in reverse order
    const inverseEffects = lastEntry.effects.map(invertEffect).reverse()
    
    inverseEffects.forEach(effect => {
      if (effect.type !== 'NO_OP') {
        applyEffect(this.state, effect)
      }
    })
    
    // Remove the log entry if it was added? 
    // Our invertEffect for ADD_LOG returns NO_OP, so the log remains.
    // This is acceptable for now, or we could explicitly handle log removal if we tracked log IDs.
  }
}
