/**
 * Where focus goes when a card is removed: the neighbouring card, else the
 * composer — never `<body>`, and never away from somewhere the user put it.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planRemovalFocus, settleRemovalFocus } from '../src/client/rail-focus.ts'

describe('planRemovalFocus', () => {
  it('aims at the next card, else the previous one', () => {
    assert.deepEqual(planRemovalFocus(['a', 'b', 'c'], 'b'), { removed: 'b', next: 'c' })
    assert.deepEqual(planRemovalFocus(['a', 'b', 'c'], 'c'), { removed: 'c', next: 'b' })
    assert.deepEqual(planRemovalFocus(['a', 'b', 'c'], 'a'), { removed: 'a', next: 'b' })
  })

  it('has no card to aim at when the rail held only this one', () => {
    assert.deepEqual(planRemovalFocus(['a'], 'a'), { removed: 'a', next: undefined })
  })
})

describe('settleRemovalFocus', () => {
  const pending = planRemovalFocus(['a', 'b', 'c'], 'b')

  it('focuses the neighbour once the card has left and focus fell to the page', () => {
    assert.deepEqual(settleRemovalFocus(pending, ['a', 'c'], 'lost'), { card: 'c' })
  })

  it('falls back to the composer when the rail emptied, or the neighbour left too', () => {
    assert.equal(settleRemovalFocus(planRemovalFocus(['a'], 'a'), [], 'lost'), 'composer')
    assert.equal(settleRemovalFocus(pending, ['a'], 'lost'), 'composer')
  })

  it('waits while the owner has not removed the card yet', () => {
    assert.equal(settleRemovalFocus(pending, ['a', 'b', 'c'], 'rail'), 'wait')
  })

  it('leaves focus the user placed elsewhere alone', () => {
    assert.equal(settleRemovalFocus(pending, ['a', 'c'], 'elsewhere'), 'drop')
    assert.equal(settleRemovalFocus(pending, ['a', 'c'], 'rail'), 'drop')
    assert.equal(settleRemovalFocus(pending, ['a', 'b', 'c'], 'elsewhere'), 'drop', 'a refused removal, and the user moved on')
  })
})
