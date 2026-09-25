/**
 * The insertion ladder over each train's composer, against a model editor.
 *
 * The model keeps the one property that matters: a reference chip is ONE
 * character in the detect coordinates insertion spans use, and its whole
 * `@path` text in the clipboard projection the input state publishes. An
 * insertion computed in the wrong coordinates lands inside the user's words,
 * and these cases would see it.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendMentions, composerFace, snapshotOf, withdrawMentions,
  type ActionsLike, type ComposerParts, type ScopeLike,
} from '../src/client/composer-face.ts'
import type { InsertionSpan } from '../src/client/send-plan.ts'

/** A model of the Lexical composer's document: characters and chips. */
class ModelEditor {
  units: { text: string, chip: boolean }[] = []
  rev = 0
  phase = 'plain'

  type(text: string): void {
    for (const char of text) this.units.push({ text: char, chip: false })
    this.rev += 1
  }

  chip(text: string): void {
    this.units.push({ text, chip: true })
    this.rev += 1
  }

  get draft(): string {
    return this.units.map((unit) => unit.text).join('')
  }

  get state() {
    return {
      draft: this.draft,
      occurrences: this.units.filter((unit) => unit.chip).map((unit) => ({ length: unit.text.length })),
      draftRev: this.rev,
      phase: this.phase,
      attachmentIds: [],
    }
  }

  insertText(text: string, span: InsertionSpan): boolean {
    if (span.draftRev !== this.rev) return false
    if (span.start < 0 || span.end > this.units.length) return false
    this.units.splice(span.start, span.end - span.start, ...[...text].map((char) => ({ text: char, chip: false })))
    this.rev += 1
    return true
  }

  setDraft(text: string): void {
    this.units = [...text].map((char) => ({ text: char, chip: false }))
    this.rev += 1
  }
}

/** The 0.1.7 action face over a model editor. */
function actions017(editor: ModelEditor): ActionsLike {
  return {
    captureInsertion: () => ({ start: editor.units.length, end: editor.units.length, draftRev: editor.rev }),
    insertText: (text, span) => editor.insertText(text, span),
    setDraft: (text) => { editor.setDraft(text) },
    submit: () => {},
  }
}

/** Parts for one composer over a model editor. */
function parts(editor: ModelEditor, actions: ActionsLike | undefined, scope?: ScopeLike): ComposerParts {
  return {
    sessionId: 's',
    input: () => snapshotOf(editor.state),
    actions: () => actions,
    scope: () => scope,
    uploadsPending: () => false,
    running: () => false,
  }
}

describe('snapshotOf', () => {
  it('reads every train\'s input state into the fields the send path uses', () => {
    assert.deepEqual(snapshotOf({ draft: 'hi', occurrences: [{ length: 3, ref: 'x' }], draftRev: 4, phase: 'plain' }), {
      draft: 'hi', occurrences: [{ length: 3, ref: 'x' }], draftRev: 4, phase: 'plain',
    })
    // 0.1.1 publishes no revision; its chips live in the textarea mirror.
    assert.deepEqual(snapshotOf({ draft: 'hi', phase: 'plain' }), { draft: 'hi', occurrences: [], draftRev: undefined, phase: 'plain' })
  })

  it('answers nothing for a state without a draft', () => {
    assert.equal(snapshotOf(undefined), undefined)
    assert.equal(snapshotOf({ phase: 'plain' }), undefined)
  })
})

describe('the insertion ladder', () => {
  it('uses the 0.1.7 action face when it exists', () => {
    const editor = new ModelEditor()
    editor.type('hi')
    const face = composerFace(parts(editor, actions017(editor)))
    assert.equal(face.revision(), editor.rev)
    assert.equal(face.insert('!', { start: 2, end: 2, draftRev: editor.rev }), true)
    assert.equal(editor.draft, 'hi!')
  })

  it('falls back to the scoped insert event on 0.1.2–0.1.6, passing the scope as `this`', () => {
    const editor = new ModelEditor()
    editor.type('hi')
    const calls: unknown[][] = []
    const scope: ScopeLike = {
      bail: (...args: unknown[]) => {
        calls.push(args)
        const [, name, request] = args as [unknown, string, { text: string, span: InsertionSpan }]
        return name === 'slash/input-insert-text' && editor.insertText(request.text, request.span) ? true : undefined
      },
    }
    const face = composerFace(parts(editor, { setDraft: () => {}, submit: () => {} }, scope))
    assert.equal(face.revision(), editor.rev, 'the published revision stands in for captureInsertion')
    assert.equal(face.insert('!', { start: 2, end: 2, draftRev: editor.rev }), true)
    assert.equal(calls[0]?.[0], scope, 'the scope is the dispatch `this`, which confines the event')
    assert.equal(editor.draft, 'hi!')
  })

  it('answers false when the train offers no insertion, or the editor refuses', () => {
    const editor = new ModelEditor()
    assert.equal(composerFace(parts(editor, {})).insert('x', { start: 0, end: 0, draftRev: 0 }), false)
    const face = composerFace(parts(editor, actions017(editor)))
    assert.equal(face.insert('x', { start: 0, end: 0, draftRev: editor.rev + 1 }), false, 'stale revision')
    const throwing = composerFace(parts(editor, { insertText: () => { throw new Error('locked') } }))
    assert.equal(throwing.insert('x', { start: 0, end: 0, draftRev: 0 }), false)
  })

  it('pastes over the live selection only where the train can', () => {
    const editor = new ModelEditor()
    editor.type('ab')
    assert.equal(composerFace(parts(editor, actions017(editor))).insertAtSelection('X'), true)
    assert.equal(editor.draft, 'abX')
    assert.equal(composerFace(parts(editor, { setDraft: () => {} })).insertAtSelection('Y'), false)
  })
})

describe('appendMentions and withdrawMentions', () => {
  it('appends after the user\'s chips and words, in detect coordinates', () => {
    const editor = new ModelEditor()
    editor.type('see ')
    editor.chip('@/Users/a/spec.md')
    editor.type(' please')
    const face = composerFace(parts(editor, actions017(editor)))
    const appended = appendMentions(face, ['@/tmp/a.pdf', '@"/tmp/b c.txt"'])
    assert.deepEqual(appended, { block: '\n\n@/tmp/a.pdf\n@"/tmp/b c.txt" ', via: 'insert' })
    assert.equal(editor.draft, 'see @/Users/a/spec.md please\n\n@/tmp/a.pdf\n@"/tmp/b c.txt" ')
    assert.equal(editor.units.filter((unit) => unit.chip).length, 1, 'the user\'s chip is still a chip')

    assert.equal(withdrawMentions(face, appended!), true)
    assert.equal(editor.draft, 'see @/Users/a/spec.md please')
    assert.equal(editor.units.filter((unit) => unit.chip).length, 1)
  })

  it('sends a file-only message as the mentions alone', () => {
    const editor = new ModelEditor()
    const face = composerFace(parts(editor, actions017(editor)))
    assert.equal(appendMentions(face, ['@/tmp/a.pdf'])?.block, '@/tmp/a.pdf ')
    assert.equal(editor.draft, '@/tmp/a.pdf ')
  })

  it('refuses a state read before the latest edit rather than insert mid-draft', () => {
    const editor = new ModelEditor()
    editor.type('hello')
    const stale = { ...editor.state }
    editor.type(' world')
    const face = composerFace({ ...parts(editor, actions017(editor)), input: () => snapshotOf(stale) })
    editor.chip('@/x')
    assert.equal(appendMentions(face, ['@/a']), undefined)
    assert.equal(editor.draft, 'hello world@/x')
  })

  it('rewrites a chip-free draft whole when no insertion exists, and refuses one with chips', () => {
    const plain = new ModelEditor()
    plain.type('hi')
    const plainFace = composerFace(parts(plain, { setDraft: (text) => { plain.setDraft(text) } }))
    assert.deepEqual(appendMentions(plainFace, ['@/a']), { block: '\n\n@/a ', via: 'setDraft' })
    assert.equal(plain.draft, 'hi\n\n@/a ')
    assert.equal(withdrawMentions(plainFace, { block: '\n\n@/a ', via: 'setDraft' }), true)
    assert.equal(plain.draft, 'hi')

    const chipped = new ModelEditor()
    chipped.chip('@/x')
    const chippedFace = composerFace(parts(chipped, { setDraft: (text) => { chipped.setDraft(text) } }))
    assert.equal(appendMentions(chippedFace, ['@/a']), undefined, 'setDraft would flatten the chip')
    assert.equal(chipped.units[0]?.chip, true)
  })

  it('treats a block that already left as withdrawn', () => {
    const editor = new ModelEditor()
    const face = composerFace(parts(editor, actions017(editor)))
    assert.equal(withdrawMentions(face, { block: '@/a ', via: 'insert' }), true)
  })
})
