import { test } from 'node:test'
import assert from 'node:assert'
import { Game } from '../engine/game.mjs'
import { ActionTypes } from '../engine/types.mjs'

const createTestState = () => ({
    seed: 'test-seed',
    players: [
        { id: 'p1', name: 'Player 1', life: 40 },
        { id: 'p2', name: 'Player 2', life: 40 }
    ],
    board: [
        { id: 'c1', name: 'Card 1', owner: 'Player 1', zone: 'library' },
        { id: 'c2', name: 'Card 2', owner: 'Player 1', zone: 'library' },
        { id: 'c3', name: 'Card 3', owner: 'Player 1', zone: 'library' },
    ],
    log: [],
    history: []
})

test('Game Engine - Draw Card', async (t) => {
    const game = new Game(createTestState())

    // Draw 1 card
    game.dispatch({
        type: ActionTypes.DRAW_CARD,
        playerId: 'p1',
        payload: { playerId: 'p1', amount: 1 }
    })

    const hand = game.state.board.filter(c => c.zone === 'hand')
    const library = game.state.board.filter(c => c.zone === 'library')

    assert.strictEqual(hand.length, 1, 'Hand should have 1 card')
    assert.strictEqual(library.length, 2, 'Library should have 2 cards')
    assert.strictEqual(hand[0].id, 'c3', 'Should draw the last card (top of library)')
})

test('Game Engine - Shuffle Library', async (t) => {
    const game = new Game(createTestState())
    const initialOrder = game.state.board.map(c => c.id)

    // Shuffle
    game.dispatch({
        type: ActionTypes.SHUFFLE_LIBRARY,
        playerId: 'p1',
        payload: { playerId: 'p1' }
    })

    const newOrder = game.state.board.map(c => c.id)

    // It's possible to shuffle into same order, but unlikely for 3 cards? 
    // Actually 1/6 chance. Let's just check that the zone is still library and count is same.
    // And that history has the event.

    assert.strictEqual(game.state.board.length, 3)
    assert.strictEqual(game.state.history.length, 1)
    assert.strictEqual(game.state.history[0].action.type, ActionTypes.SHUFFLE_LIBRARY)
})

test('Game Engine - Modify Life', async (t) => {
    const game = new Game(createTestState())

    game.dispatch({
        type: ActionTypes.MODIFY_LIFE,
        playerId: 'p1',
        payload: { playerId: 'p1', amount: -3 }
    })

    const p1 = game.state.players.find(p => p.id === 'p1')
    assert.strictEqual(p1.life, 37)
})

test('Game Engine - Undo', async (t) => {
    const game = new Game(createTestState())

    // Action 1: Draw
    game.dispatch({
        type: ActionTypes.DRAW_CARD,
        playerId: 'p1',
        payload: { playerId: 'p1', amount: 1 }
    })

    assert.strictEqual(game.state.board.find(c => c.id === 'c3').zone, 'hand')

    // Undo
    game.undo()

    assert.strictEqual(game.state.board.find(c => c.id === 'c3').zone, 'library')
    assert.strictEqual(game.state.history.length, 0)
})

test('Game Engine - Undo Shuffle', async (t) => {
    const game = new Game(createTestState())
    const initialOrder = JSON.stringify(game.state.board.map(c => c.id))

    game.dispatch({
        type: ActionTypes.SHUFFLE_LIBRARY,
        playerId: 'p1',
        payload: { playerId: 'p1' }
    })

    game.undo()

    const finalOrder = JSON.stringify(game.state.board.map(c => c.id))
    assert.strictEqual(finalOrder, initialOrder, 'Order should be restored after undo')
})
