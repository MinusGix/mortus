/**
 * @typedef {Object} Action
 * @property {string} type - The type of action (e.g., 'PLAY_LAND', 'CAST_SPELL')
 * @property {string} playerId - The ID of the player performing the action
 * @property {Object} [payload] - Additional data for the action (e.g., cardId, targetId)
 * @property {number} [timestamp] - When the action occurred
 */

/**
 * @typedef {Object} Effect
 * @property {string} type - The type of effect (e.g., 'MOVE_ZONE', 'MODIFY_LIFE')
 * @property {Object} payload - Data required to apply the effect
 */

/**
 * @typedef {Object} GameState
 * @property {string} seed - Random seed for the game
 * @property {Array<Object>} players - List of players
 * @property {Array<Object>} board - List of cards on the board/hands/decks
 * @property {Array<Object>} log - Human readable log
 * @property {Array<{action: Action, effects: Effect[]}>} history - Full history for undo/replay
 */

export const ActionTypes = {
  PLAY_LAND: 'PLAY_LAND',
  CAST_SPELL: 'CAST_SPELL',
  DRAW_CARD: 'DRAW_CARD',
  PASS_PRIORITY: 'PASS_PRIORITY',
  // ... add more as needed
}

export const EffectTypes = {
  MOVE_ZONE: 'MOVE_ZONE',
  TAP_CARD: 'TAP_CARD',
  UNTAP_CARD: 'UNTAP_CARD',
  MODIFY_LIFE: 'MODIFY_LIFE',
  ADD_LOG: 'ADD_LOG',
}
