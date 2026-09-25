/**
 * The decisions inside the send interception: when a gesture is ours, where
 * the mentions go in the editor's coordinates, and how a committed send is
 * told apart from a refused one.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendSpan, detectEnd, insertedSpan, isLexicalSendKey, lexicalEnterVerdict, mentionBlock,
  primaryRoleOf, sendButtonVerdict, sendObserved, type ComposerFacts, type KeyFacts,
} from '../src/client/send-plan.ts'

/** A plain Enter, overridable per case. */
function key(overrides: Partial<KeyFacts> = {}): KeyFacts {
  return {
    key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, altGraph: false,
    isComposing: false, keyCode: 13, repeat: false, ...overrides,
  }
}

/** An idle composer with one ready staged file, overridable per case. */
function composer(overrides: Partial<ComposerFacts> = {}): ComposerFacts {
  return {
    composing: false, menuPick: false, editable: true, phase: 'plain',
    ready: 1, pending: 0, uploadsPending: false, ...overrides,
  }
}

describe('isLexicalSendKey', () => {
  it('takes a plain Enter and the accelerated Ctrl or Meta Enter', () => {
    assert.equal(isLexicalSendKey(key(), false), true)
    assert.equal(isLexicalSendKey(key({ ctrlKey: true }), false), true)
    assert.equal(isLexicalSendKey(key({ metaKey: true }), false), true)
  })

  it('declines exactly what the composer declines', () => {
    assert.equal(isLexicalSendKey(key({ shiftKey: true }), false), false, 'Shift+Enter is a newline')
    assert.equal(isLexicalSendKey(key({ altKey: true }), false), false)
    assert.equal(isLexicalSendKey(key({ altGraph: true }), false), false)
    assert.equal(isLexicalSendKey(key({ ctrlKey: true, metaKey: true }), false), false)
    assert.equal(isLexicalSendKey(key({ shiftKey: true, metaKey: true }), false), false)
    assert.equal(isLexicalSendKey(key({ repeat: true }), false), false, 'an auto-repeated Enter is ignored')
    assert.equal(isLexicalSendKey(key({ key: 'a' }), false), false)
  })

  it('never takes an Enter that belongs to an IME composition', () => {
    assert.equal(isLexicalSendKey(key({ isComposing: true }), false), false)
    assert.equal(isLexicalSendKey(key({ keyCode: 229 }), false), false)
    // Safari ends the composition before the keydown; the editor root keeps
    // the marker for a few milliseconds to cover it.
    assert.equal(isLexicalSendKey(key(), true), false)
  })
})

describe('lexicalEnterVerdict', () => {
  it('appends when files are staged and the composer is open', () => {
    assert.equal(lexicalEnterVerdict(key(), composer()), 'append')
    assert.equal(lexicalEnterVerdict(key(), composer({ phase: 'claimed' })), 'append')
  })

  it('passes when nothing is staged, so an ordinary message is untouched', () => {
    assert.equal(lexicalEnterVerdict(key(), composer({ ready: 0 })), 'pass')
  })

  it('holds the send while a staged file is still being prepared', () => {
    assert.equal(lexicalEnterVerdict(key(), composer({ pending: 1 })), 'wait')
    assert.equal(lexicalEnterVerdict(key(), composer({ ready: 0, pending: 2 })), 'wait')
  })

  it('leaves the composer its own refusals', () => {
    assert.equal(lexicalEnterVerdict(key(), composer({ uploadsPending: true })), 'pass', 'it says "still uploading" itself')
    assert.equal(lexicalEnterVerdict(key(), composer({ phase: 'submitting' })), 'pass')
    assert.equal(lexicalEnterVerdict(key(), composer({ phase: 'adjudicating' })), 'pass')
    assert.equal(lexicalEnterVerdict(key(), composer({ phase: undefined })), 'pass')
    assert.equal(lexicalEnterVerdict(key(), composer({ editable: false })), 'pass')
  })

  it('lets Enter pick a highlighted completion instead of sending', () => {
    assert.equal(lexicalEnterVerdict(key(), composer({ menuPick: true })), 'pass')
  })

  it('does not act on a composing Enter', () => {
    assert.equal(lexicalEnterVerdict(key({ isComposing: true }), composer()), 'pass')
    assert.equal(lexicalEnterVerdict(key(), composer({ composing: true })), 'pass')
  })
})

describe('primaryRoleOf and sendButtonVerdict', () => {
  it('reads the role from the last button and its glyph, never a class', () => {
    assert.equal(primaryRoleOf(true, false, true), 'send')
    assert.equal(primaryRoleOf(true, true, false), 'stop')
    assert.equal(primaryRoleOf(true, false, false), 'other')
    assert.equal(primaryRoleOf(false, false, true), 'other', 'an arrow elsewhere in the card is not Send')
  })

  it('never lets the Stop control carry files', () => {
    assert.equal(sendButtonVerdict('stop', true, true, composer()), 'pass')
    assert.equal(sendButtonVerdict('other', true, false, composer()), 'pass')
  })

  it('appends on an enabled Send and lets its click send', () => {
    assert.equal(sendButtonVerdict('send', true, false, composer()), 'append')
    assert.equal(sendButtonVerdict('send', true, true, composer()), 'append')
  })

  it('submits a file-only message through the action face when Send is disabled and idle', () => {
    assert.equal(sendButtonVerdict('send', false, false, composer()), 'submit')
  })

  it('leaves a disabled Send alone while a turn runs or files are pending', () => {
    assert.equal(sendButtonVerdict('send', false, true, composer()), 'pass', 'the action face would ignore the busy-Enter mode')
    assert.equal(sendButtonVerdict('send', false, false, composer({ pending: 1 })), 'pass')
    assert.equal(sendButtonVerdict('send', true, false, composer({ pending: 1 })), 'wait')
  })
})

describe('detectEnd', () => {
  it('equals the draft length without chips', () => {
    assert.equal(detectEnd('hello', []), 5)
    assert.equal(detectEnd('', []), 0)
  })

  it('folds each chip to one placeholder character', () => {
    // "see @/a/b.md and @/c.md": two chips of 8 and 6 clipboard characters.
    const draft = 'see @/a/b.md and @/c.md'
    assert.equal(detectEnd(draft, [{ length: 8 }, { length: 6 }]), draft.length - 8 - 6 + 2)
  })
})

describe('mentionBlock', () => {
  it('leads with a blank line after typed words and closes the last token', () => {
    assert.equal(mentionBlock('look', ['@/a.md', '@/b.pdf']), '\n\n@/a.md\n@/b.pdf ')
  })

  it('adds no separator to an empty or blank draft', () => {
    assert.equal(mentionBlock('', ['@/a.md']), '@/a.md ')
    assert.equal(mentionBlock('  ', ['@/a.md']), '@/a.md ')
  })

  it('completes rather than doubles a separator the draft already has', () => {
    assert.equal(mentionBlock('look\n', ['@/a.md']), '\n@/a.md ')
    assert.equal(mentionBlock('look\n\n', ['@/a.md']), '@/a.md ')
  })

  it('is empty with nothing staged', () => {
    assert.equal(mentionBlock('look', []), '')
  })
})

describe('appendSpan and insertedSpan', () => {
  it('collapses at the detect end with the given revision', () => {
    assert.deepEqual(appendSpan('ab @/x', [{ length: 3 }], 7), { start: 4, end: 4, draftRev: 7 })
  })

  it('covers a block still at the end, in detect coordinates', () => {
    const block = '\n\n@/a.md '
    const draft = `hi @/c${block}`
    assert.deepEqual(insertedSpan(draft, [{ length: 3 }], 9, block), {
      start: detectEnd(draft, [{ length: 3 }]) - block.length,
      end: detectEnd(draft, [{ length: 3 }]),
      draftRev: 9,
    })
  })

  it('answers nothing when the block is gone', () => {
    assert.equal(insertedSpan('', [], 1, '@/a.md '), undefined)
    assert.equal(insertedSpan('typed after', [], 1, '@/a.md '), undefined)
  })
})

describe('sendObserved', () => {
  const block = '\n\n@/a.md '

  it('sees a committed send as a cleared draft', () => {
    assert.equal(sendObserved({ draft: '', phase: 'plain' }, block), true)
    assert.equal(sendObserved({ draft: 'typed meanwhile', phase: 'plain' }, block), true)
  })

  it('sees a slash command entering its transaction as sent', () => {
    assert.equal(sendObserved({ draft: `/goal x${block}`, phase: 'adjudicating' }, block), true)
  })

  it('sees a refused send as the block still at the end', () => {
    assert.equal(sendObserved({ draft: `hello${block}`, phase: 'plain' }, block), false)
  })

  it('treats a vanished composer as sent, so nothing is attached twice', () => {
    assert.equal(sendObserved(undefined, block), true)
  })
})
