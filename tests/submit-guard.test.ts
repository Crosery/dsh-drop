/**
 * The send gesture, as the guard recognizes it. The rest of the guard is DOM
 * wiring; this is the decision inside it.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSendKey } from '../src/client/submit-guard.ts'

/** One keydown, shaped as the guard reads it. */
function key(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return { key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13, ...overrides } as KeyboardEvent
}

describe('isSendKey', () => {
  it('takes a plain Enter', () => {
    assert.equal(isSendKey(key()), true)
  })

  it('declines Shift+Enter, which inserts a newline', () => {
    assert.equal(isSendKey(key({ shiftKey: true })), false)
  })

  it('declines any other key', () => {
    assert.equal(isSendKey(key({ key: 'a' })), false)
    assert.equal(isSendKey(key({ key: 'Escape' })), false)
  })

  it('declines an Enter that is closing an IME composition', () => {
    // Committing a Chinese or Japanese candidate sends Enter mid-word; taking
    // it would submit while the user is still typing one.
    assert.equal(isSendKey(key({ isComposing: true })), false)
    assert.equal(isSendKey(key({ keyCode: 229 })), false, 'the legacy composition signal')
  })
})
