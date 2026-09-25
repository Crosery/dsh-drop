/**
 * The send interception end to end, over a minimal document model.
 *
 * Two composer generations: the 0.1.0–0.1.1 textarea, where the guard takes
 * the gesture over, and the 0.1.2+ Lexical editor, where it appends the
 * mentions and lets the composer's own handler send — then clears the staged
 * files only once the send is seen, and takes the mentions back out when the
 * composer refused. The "composer" below behaves like the shipped one: it
 * handles Enter and Send in the bubble phase, after the guard's capture pass,
 * and refuses to send an empty draft.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { installSubmitGuard, type SubmitGuardDeps } from '../src/client/submit-guard.ts'
import { composerFace, snapshotOf, type ActionsLike, type ComposerFace } from '../src/client/composer-face.ts'
import type { AttachedFile } from '../src/client/attached.ts'
import type { InsertionSpan } from '../src/client/send-plan.ts'

/** One node of the model document. */
class FakeElement {
  parent: FakeElement | null = null
  readonly children: FakeElement[] = []
  disabled = false
  readOnly = false
  readonly tag: string
  readonly attrs: Record<string, string>
  constructor(tag: string, attrs: Record<string, string> = {}, children: FakeElement[] = []) {
    this.tag = tag
    this.attrs = attrs
    for (const child of children) this.append(child)
  }

  append(child: FakeElement): this {
    child.parent = this
    this.children.push(child)
    return this
  }

  get isContentEditable(): boolean { return this.attrs.contenteditable === 'true' }
  hasAttribute(name: string): boolean { return name in this.attrs }
  getAttribute(name: string): string | null { return this.attrs[name] ?? null }
  setAttribute(name: string, value: string): void { this.attrs[name] = value }

  /** Simple selectors only: a tag, or `[attr]`. */
  is(selector: string): boolean {
    const attr = /^\[([\w-]+)\]$/.exec(selector)
    if (attr !== null) return attr[1]! in this.attrs
    return this.tag === selector
  }

  /** One compound selector: `a, b` alternatives and `a b` descendants. */
  matches(selector: string): boolean {
    return selector.split(',').some((alternative) => {
      const parts = alternative.trim().split(/\s+/)
      if (!this.is(parts[parts.length - 1]!)) return false
      let ancestor = this.parent
      for (let i = parts.length - 2; i >= 0; i -= 1) {
        while (ancestor !== null && !ancestor.is(parts[i]!)) ancestor = ancestor.parent
        if (ancestor === null) return false
        ancestor = ancestor.parent
      }
      return true
    })
  }

  closest(selector: string): FakeElement | null {
    let node: FakeElement | null = this
    while (node !== null) {
      if (node.matches(selector)) return node
      node = node.parent
    }
    return null
  }

  private descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()])
  }

  querySelector(selector: string): FakeElement | null {
    if (selector.startsWith(':scope > ')) {
      const rest = selector.slice(':scope > '.length)
      return this.children.find((child) => child.is(rest)) ?? null
    }
    return this.descendants().find((node) => node.matches(selector)) ?? null
  }

  querySelectorAll(selector: string): { length: number, item(i: number): FakeElement | null } {
    const found = this.descendants().filter((node) => node.matches(selector))
    return { length: found.length, item: (i) => found[i] ?? null }
  }
}

class FakeTextArea extends FakeElement {}

/** Globals the guard reads, swapped in for the suite. */
const listeners = new Map<string, (event: unknown) => void>()
const saved = Object.fromEntries(
  ['document', 'Element', 'HTMLElement', 'HTMLTextAreaElement'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
)
before(() => {
  Object.assign(globalThis, {
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLTextAreaElement: FakeTextArea,
    document: {
      addEventListener: (type: string, fn: (event: unknown) => void) => { listeners.set(type, fn) },
      removeEventListener: (type: string, fn: (event: unknown) => void) => { if (listeners.get(type) === fn) listeners.delete(type) },
      querySelector: () => null,
    },
  })
})
after(() => {
  for (const [key, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

/** A dispatched event: capture listener first, then the composer's own handler unless stopped. */
function dispatch(type: string, target: FakeElement, props: Record<string, unknown>, bubble?: () => void): boolean {
  let prevented = false
  let stopped = false
  const event = {
    type,
    target,
    key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    isComposing: false, keyCode: 13, repeat: false, button: 0,
    getModifierState: () => false,
    preventDefault: () => { prevented = true },
    stopPropagation: () => { stopped = true },
    ...props,
  }
  listeners.get(type)?.(event)
  if (!stopped && !prevented) bubble?.()
  return prevented
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5))

/** A composer model: a Lexical-like document of characters, with the shipped submit rules. */
class Composer {
  text = ''
  rev = 0
  phase = 'plain'
  uploadsPending = false
  running = false
  sent: string[] = []

  readonly actions: ActionsLike = {
    captureInsertion: () => ({ start: this.text.length, end: this.text.length, draftRev: this.rev }),
    insertText: (text: string, span: InsertionSpan) => {
      if (span.draftRev !== this.rev || this.phase !== 'plain') return false
      this.text = this.text.slice(0, span.start) + text + this.text.slice(span.end)
      this.rev += 1
      return true
    },
    setDraft: (text: string) => { this.text = text; this.rev += 1 },
    submit: () => { this.send() },
  }

  /** The shipped submit: refuses while uploading or for an empty draft, then commits. */
  send(): void {
    if (this.uploadsPending || this.text.trim() === '') return
    this.sent.push(this.text.trim())
    this.text = ''
    this.rev += 1
  }

  face(sessionId = 's'): ComposerFace {
    return composerFace({
      sessionId,
      input: () => snapshotOf({ draft: this.text, occurrences: [], draftRev: this.rev, phase: this.phase }),
      actions: () => this.actions,
      scope: () => undefined,
      uploadsPending: () => this.uploadsPending,
      running: () => this.running,
    })
  }
}

/** The staged list and the guard around one composer. */
function harness(composer: Composer, entries: AttachedFile[]) {
  let staged = [...entries]
  const notices: string[] = []
  const deps: SubmitGuardDeps = {
    composerAt: () => composer.face(),
    staged: () => staged,
    onSent: (_session, ids) => { staged = staged.filter((entry) => !ids.includes(entry.id)) },
    notify: (_session, level, text) => { notices.push(`${level}:${text}`) },
    copy: () => ({ waiting: (count) => `waiting ${count}`, attachFailed: 'attach failed' }),
  }
  const release = installSubmitGuard(deps)
  return { release, notices, staged: () => staged }
}

const ready = (id: number, path: string): AttachedFile =>
  ({ id, key: `staged:${id}`, kind: 'file', status: 'ready', name: path, path, how: 'copied' })
const pending = (id: number): AttachedFile =>
  ({ id, key: `staged:${id}`, kind: 'file', status: 'pending', name: 'big.mov' })
const folder = (id: number, path: string): AttachedFile =>
  ({ id, key: `staged:${id}`, kind: 'directory', status: 'ready', name: path, path, how: 'copied' })
const uploadingFolder = (id: number): AttachedFile => ({
  id, key: `staged:${id}`, kind: 'directory', status: 'pending', name: 'proj',
  progress: { done: 3, total: 40, bytes: 100, totalBytes: 4000 },
})

/** The Lexical composer's DOM: a card holding the editor and the control row. */
function lexicalCard() {
  const input = new FakeElement('div', { 'data-composer-input': '', contenteditable: 'true', role: 'textbox' })
  const send = new FakeElement('button', {}, [new FakeElement('svg', {}, [new FakeElement('path')])])
  const plus = new FakeElement('button', {}, [new FakeElement('svg', {}, [new FakeElement('path')])])
  const card = new FakeElement('div', { 'data-composer-card': '' }, [input, new FakeElement('div', {}, [plus, send])])
  return { card, input, send, plus }
}

describe('Lexical composer (0.1.2 onward)', () => {
  it('appends the mentions on Enter, lets the composer send, then clears', async () => {
    const composer = new Composer()
    composer.text = 'look at this'
    const { input } = lexicalCard()
    const guard = harness(composer, [ready(1, '/tmp/a.pdf'), ready(2, '/tmp/b c.md')])
    try {
      const prevented = dispatch('keydown', input, {}, () => { composer.send() })
      assert.equal(prevented, false, 'the composer\'s own Enter handler sends')
      assert.deepEqual(composer.sent, ['look at this\n\n@/tmp/a.pdf\n@"/tmp/b c.md"'])
      assert.equal(guard.staged().length, 2, 'not cleared on the strength of the gesture alone')
      await tick()
      assert.deepEqual(guard.staged(), [])
    } finally { guard.release() }
  })

  it('sends a file-only message with Enter', async () => {
    const composer = new Composer()
    const { input } = lexicalCard()
    const guard = harness(composer, [ready(1, '/tmp/a.pdf')])
    try {
      dispatch('keydown', input, {}, () => { composer.send() })
      assert.deepEqual(composer.sent, ['@/tmp/a.pdf'])
      await tick()
      assert.deepEqual(guard.staged(), [])
    } finally { guard.release() }
  })

  it('takes the mentions back out when the composer refuses the send', async () => {
    const composer = new Composer()
    composer.text = 'hello'
    composer.uploadsPending = false
    const { input } = lexicalCard()
    const guard = harness(composer, [ready(1, '/tmp/a.pdf')])
    try {
      // The composer's handler refuses (as it does while its own uploads run
      // or a steer takes the queue): nothing is sent.
      dispatch('keydown', input, {}, () => {})
      assert.equal(composer.text, 'hello\n\n@/tmp/a.pdf ')
      await tick()
      assert.equal(composer.text, 'hello', 'the block is withdrawn')
      assert.equal(guard.staged().length, 1, 'and the file stays staged for the retry')
    } finally { guard.release() }
  })

  it('leaves Shift+Enter, IME Enter and a highlighted menu to the composer', async () => {
    const composer = new Composer()
    composer.text = 'hello'
    const { input, card } = lexicalCard()
    const guard = harness(composer, [ready(1, '/tmp/a.pdf')])
    try {
      dispatch('keydown', input, { shiftKey: true })
      dispatch('keydown', input, { isComposing: true })
      dispatch('keydown', input, { keyCode: 229 })
      input.setAttribute('data-composer-composing', '')
      dispatch('keydown', input, {})
      delete input.attrs['data-composer-composing']
      const menu = new FakeElement('div', { 'data-trigger-menu': '' }, [new FakeElement('div', { role: 'listbox', 'aria-activedescendant': 'opt-0' })])
      card.append(menu)
      dispatch('keydown', input, {})
      assert.equal(composer.text, 'hello', 'nothing was appended')
      await tick()
      assert.equal(guard.staged().length, 1)
    } finally { guard.release() }
  })

  it('holds the send while a staged file is still being prepared', () => {
    const composer = new Composer()
    composer.text = 'hello'
    const { input } = lexicalCard()
    const guard = harness(composer, [ready(1, '/tmp/a.pdf'), pending(2)])
    try {
      let sent = false
      assert.equal(dispatch('keydown', input, {}, () => { sent = true }), true)
      assert.equal(sent, false)
      assert.deepEqual(guard.notices, ['info:waiting 1'])
      assert.equal(composer.text, 'hello')
    } finally { guard.release() }
  })

  it('sends a ready folder as one trailing-slash mention', async () => {
    const composer = new Composer()
    composer.text = 'review this'
    const { input } = lexicalCard()
    const guard = harness(composer, [folder(1, '/tmp/drops/proj'), folder(2, '/Users/a/my site'), ready(3, '/tmp/a.pdf')])
    try {
      dispatch('keydown', input, {}, () => { composer.send() })
      assert.deepEqual(composer.sent, ['review this\n\n@/tmp/drops/proj/\n@"/Users/a/my site/"\n@/tmp/a.pdf'])
      await tick()
      assert.deepEqual(guard.staged(), [])
    } finally { guard.release() }
  })

  it('holds the send, not a partial list, while a folder is still uploading', () => {
    const composer = new Composer()
    composer.text = 'hello'
    const { input } = lexicalCard()
    const guard = harness(composer, [ready(1, '/tmp/a.pdf'), uploadingFolder(2)])
    try {
      let sent = false
      assert.equal(dispatch('keydown', input, {}, () => { sent = true }), true)
      assert.equal(sent, false)
      assert.deepEqual(guard.notices, ['info:waiting 1'])
      assert.equal(composer.text, 'hello', 'nothing was appended')
      assert.equal(guard.staged().length, 2)
    } finally { guard.release() }
  })

  it('appends on an enabled Send click and lets the click send', async () => {
    const composer = new Composer()
    composer.text = 'hi'
    const { send } = lexicalCard()
    const guard = harness(composer, [ready(1, '/tmp/a.pdf')])
    try {
      assert.equal(dispatch('click', send, {}, () => { composer.send() }), false)
      assert.deepEqual(composer.sent, ['hi\n\n@/tmp/a.pdf'])
      await tick()
      assert.deepEqual(guard.staged(), [])
    } finally { guard.release() }
  })

  it('never lets the Stop control carry files', async () => {
    const composer = new Composer()
    composer.running = true
    const { card } = lexicalCard()
    const stop = new FakeElement('button', {}, [new FakeElement('svg', {}, [new FakeElement('rect')])])
    card.children[1]!.append(stop)
    const guard = harness(composer, [ready(1, '/tmp/a.pdf')])
    try {
      let stopped = false
      dispatch('click', stop, {}, () => { stopped = true })
      assert.equal(stopped, true)
      assert.equal(composer.text, '')
      await tick()
      assert.equal(guard.staged().length, 1)
    } finally { guard.release() }
  })

  it('ignores other buttons in the card', () => {
    const composer = new Composer()
    const { plus } = lexicalCard()
    const guard = harness(composer, [ready(1, '/tmp/a.pdf')])
    try {
      dispatch('click', plus, {})
      assert.equal(composer.text, '')
    } finally { guard.release() }
  })

  it('submits a file-only message when the disabled Send is pressed while idle', async () => {
    const composer = new Composer()
    const { send } = lexicalCard()
    send.disabled = true
    const guard = harness(composer, [ready(1, '/tmp/a.pdf')])
    try {
      assert.equal(dispatch('pointerdown', send, {}), true)
      assert.deepEqual(composer.sent, ['@/tmp/a.pdf'])
      await tick()
      assert.deepEqual(guard.staged(), [])
    } finally { guard.release() }
  })

  it('leaves a disabled Send alone while a turn runs', () => {
    const composer = new Composer()
    composer.running = true
    const { send } = lexicalCard()
    send.disabled = true
    const guard = harness(composer, [ready(1, '/tmp/a.pdf')])
    try {
      assert.equal(dispatch('pointerdown', send, {}), false)
      assert.deepEqual(composer.sent, [])
    } finally { guard.release() }
  })

  it('passes an ordinary message untouched when nothing is staged', () => {
    const composer = new Composer()
    composer.text = 'plain'
    const { input } = lexicalCard()
    const guard = harness(composer, [])
    try {
      dispatch('keydown', input, {}, () => { composer.send() })
      assert.deepEqual(composer.sent, ['plain'])
    } finally { guard.release() }
  })

  it('reports an insertion the editor refused instead of sending without the files', () => {
    const composer = new Composer()
    composer.text = 'x'
    const { input } = lexicalCard()
    // A draft carrying a chip with an insertion the editor refuses: neither
    // rung can append without losing the chip.
    const face = composerFace({
      sessionId: 's',
      input: () => snapshotOf({ draft: 'x@/chip', occurrences: [{ length: 6 }], draftRev: 1, phase: 'plain' }),
      actions: () => ({ captureInsertion: () => ({ start: 0, end: 0, draftRev: 1 }), insertText: () => false }),
      scope: () => undefined,
      uploadsPending: () => false,
      running: () => false,
    })
    const notices: string[] = []
    const release = installSubmitGuard({
      composerAt: () => face,
      staged: () => [ready(1, '/tmp/a.pdf')],
      onSent: () => { throw new Error('must not clear') },
      notify: (_s, level, text) => { notices.push(`${level}:${text}`) },
      copy: () => ({ waiting: () => '', attachFailed: 'attach failed' }),
    })
    try {
      let sent = false
      assert.equal(dispatch('keydown', input, {}, () => { sent = true }), true)
      assert.equal(sent, false)
      assert.deepEqual(notices, ['error:attach failed'])
    } finally { release() }
  })
})

describe('textarea composer (0.1.0–0.1.1)', () => {
  it('rewrites and submits itself, once, and leaves native retries alone', () => {
    const composer = new Composer()
    const textarea = new FakeTextArea('textarea')
    new FakeElement('div', { 'data-composer-card': '' }, [textarea])
    const guard = harness(composer, [ready(1, '/tmp/brief.md')])
    try {
      assert.equal(dispatch('keydown', textarea, { shiftKey: true }), false)
      assert.equal(dispatch('keydown', textarea, { isComposing: true }), false)
      textarea.readOnly = true; assert.equal(dispatch('keydown', textarea, {}), false); textarea.readOnly = false
      textarea.disabled = true; assert.equal(dispatch('keydown', textarea, {}), false); textarea.disabled = false
      textarea.setAttribute('aria-expanded', 'true'); assert.equal(dispatch('keydown', textarea, {}), false)
      textarea.setAttribute('aria-expanded', 'false')
      composer.phase = 'submitting'; assert.equal(dispatch('keydown', textarea, {}), false); composer.phase = 'plain'
      assert.deepEqual(composer.sent, [])

      assert.equal(dispatch('keydown', textarea, {}), true, 'the guard takes the gesture over')
      assert.deepEqual(composer.sent, ['@/tmp/brief.md'])
      assert.deepEqual(guard.staged(), [])
      assert.equal(dispatch('keydown', textarea, {}), false, 'a retry sees no staged files')

      guard.release()
      assert.equal(listeners.size, 0, 'every listener is removed')
    } finally { guard.release() }
  })

  it('sends a folder with its trailing slash, and waits for one still uploading', () => {
    const composer = new Composer()
    composer.text = 'see'
    const textarea = new FakeTextArea('textarea')
    new FakeElement('div', { 'data-composer-card': '' }, [textarea])
    const waiting = harness(composer, [uploadingFolder(1)])
    try {
      assert.equal(dispatch('keydown', textarea, {}), true, 'held')
      assert.deepEqual(composer.sent, [])
      assert.deepEqual(waiting.notices, ['info:waiting 1'])
    } finally { waiting.release() }
    const guard = harness(composer, [folder(2, '/tmp/drops/proj')])
    try {
      assert.equal(dispatch('keydown', textarea, {}), true)
      assert.deepEqual(composer.sent, ['see\n\n@/tmp/drops/proj/'])
    } finally { guard.release() }
  })

  it('takes the Send click on the textarea composer, found by structure', () => {
    const composer = new Composer()
    composer.text = 'see'
    const textarea = new FakeTextArea('textarea')
    const send = new FakeElement('button', {}, [new FakeElement('svg', {}, [new FakeElement('path')])])
    new FakeElement('div', { 'data-composer-card': '' }, [textarea, send])
    const guard = harness(composer, [ready(1, '/tmp/a.md')])
    try {
      assert.equal(dispatch('click', send, {}), true)
      assert.deepEqual(composer.sent, ['see\n\n@/tmp/a.md'])
    } finally { guard.release() }
  })
})
