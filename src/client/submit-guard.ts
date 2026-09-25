/**
 * Splicing the staged paths into the message as it is sent.
 *
 * A file's path has to reach the model as prompt text, and the only public way
 * to put text into a message is the draft. Holding the path outside the draft
 * keeps the text box clean, which means something has to put it back at the
 * last moment. That moment is the send gesture: Enter in the composer, or its
 * Send control. Listeners on `document` in capture phase see both before the
 * composer's own handlers do.
 *
 * **Textarea composer (0.1.0–0.1.1).** The guard takes the gesture over:
 * rewrite the draft to include the mentions, submit through the action face,
 * clear the staged list. That train's `setDraft` is a plain string write.
 *
 * **Lexical composer (0.1.2 onward).** The guard does not submit. It appends
 * the mentions at the end of the document and lets the gesture continue to the
 * composer's own handler, which sends with the user's delivery mode, its
 * upload gate and slash adjudication intact. Once the gesture has run, the
 * guard looks: a committed send cleared the draft (or entered a transaction),
 * so the staged files are cleared; a refused send left the block in place, so
 * it is taken back out and the files stay staged. Staged files are never
 * cleared on the strength of a gesture alone.
 *
 * What it deliberately never does is send anything itself beyond the
 * composer's own action face: calling `session.prompt` directly would mean
 * reimplementing attachments, slash commands, delivery modes and failure
 * restoration — things the composer already does correctly.
 * @module @crosery/dsh-drop/client/submit-guard
 */

import { mentionFor } from '../contract.ts'
import type { AttachedFile } from './attached.ts'
import { composeSubmission } from './attached.ts'
import { appendMentions, withdrawMentions, type Appended, type ComposerFace } from './composer-face.ts'
import {
  acceptsSubmission, lexicalEnterVerdict, primaryRoleOf, sendButtonVerdict, sendObserved,
  type ComposerFacts, type KeyFacts, type PrimaryRole, type SendVerdict,
} from './send-plan.ts'

/** What the guard needs from the plugin. */
export interface SubmitGuardDeps {
  /** The composer whose card contains a target, when a rail is mounted there. */
  composerAt: (target: Element) => ComposerFace | undefined
  /** The session's staged entries. */
  staged: (sessionId: string) => readonly AttachedFile[]
  /** Called once a send carried these entries out. */
  onSent: (sessionId: string, ids: readonly number[]) => void
  /** Raise a notice in the session's composer. */
  notify: (sessionId: string, level: 'info' | 'error', text: string) => void
  /** Copy for the two notices the guard raises. */
  copy: () => { waiting: (count: number) => string, attachFailed: string }
}

/**
 * Whether a keyboard event is the textarea composer's send gesture.
 *
 * Shift+Enter is a newline and IME composition is mid-word, so neither is a
 * send. `isComposing` has to be read off the native event: React's synthetic
 * event does not carry it, and a capture listener sees the native one anyway.
 * @param event - the observed keydown.
 * @returns true when this keystroke would submit.
 */
export function isSendKey(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing' | 'keyCode'>): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false
  if (event.isComposing || event.keyCode === 229) return false
  return true
}

/** The native keydown, as the decision reads it. */
function keyFacts(event: KeyboardEvent): KeyFacts {
  return {
    key: event.key,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altGraph: typeof event.getModifierState === 'function' && event.getModifierState('AltGraph'),
    isComposing: event.isComposing,
    keyCode: event.keyCode,
    repeat: event.repeat,
  }
}

/** The ready entries' mentions, in order, and their ids. */
function readyMentions(entries: readonly AttachedFile[]): { mentions: string[], ids: number[] } {
  const mentions: string[] = []
  const ids: number[] = []
  for (const entry of entries) {
    if (entry.status !== 'ready' || entry.path === undefined) continue
    const mention = mentionFor(entry.path, entry.kind)
    if (mention === undefined) continue
    mentions.push(mention)
    ids.push(entry.id)
  }
  return { mentions, ids }
}

/** The composer card around an element. */
function cardOf(element: Element): Element | null {
  return element.closest('[data-composer-card]')
}

/**
 * Whether an open completion menu has an option highlighted, so Enter picks it.
 * @param card - the composer card.
 * @returns true when Enter belongs to the menu.
 */
function menuPick(card: Element | null): boolean {
  const selector = '[data-trigger-menu] [aria-activedescendant]'
  return (card?.querySelector(selector) ?? document.querySelector(selector)) !== null
}

/**
 * The primary control's role, from its place and its glyph.
 * @param button - a button inside a composer card.
 * @param card - that card.
 * @returns send, stop, or other.
 */
function primaryRole(button: HTMLButtonElement, card: Element): PrimaryRole {
  const buttons = card.querySelectorAll('button')
  const last = buttons.item(buttons.length - 1)
  const svg = button.querySelector(':scope > svg')
  return primaryRoleOf(last === button, svg?.querySelector('rect') != null, svg?.querySelector('path') != null)
}

/**
 * Install the send interception for the plugin's lifetime.
 *
 * The guard is inert unless the addressed session has files staged, so an
 * ordinary message — no drops — takes the shipped path untouched.
 * @param deps - the plugin's side of the guard.
 * @returns a disposer removing every listener.
 */
export function installSubmitGuard(deps: SubmitGuardDeps): () => void {
  /** Sends appended and not yet judged, by session: one gesture at a time. */
  const inFlight = new Map<string, Appended>()

  /** The facts a Lexical send decision reads. */
  const factsFor = (input: Element | null, card: Element | null, composer: ComposerFace): ComposerFacts => {
    const entries = deps.staged(composer.sessionId)
    const editable = input instanceof HTMLElement
      && input.isContentEditable
      && input.getAttribute('aria-disabled') !== 'true'
    return {
      composing: input?.hasAttribute('data-composer-composing') ?? false,
      menuPick: menuPick(card),
      editable,
      phase: composer.input()?.phase,
      ready: readyMentions(entries).mentions.length,
      pending: entries.filter((entry) => entry.status === 'pending').length,
      uploadsPending: composer.uploadsPending(),
    }
  }

  /**
   * Judge an appended send once the gesture has run.
   *
   * A macrotask later, not a microtask: the composer commits the send
   * synchronously inside the gesture, but the rail's copy of the input state
   * is refreshed by a React render that lands in a microtask.
   */
  const judge = (composer: ComposerFace, appended: Appended, ids: readonly number[]): void => {
    inFlight.set(composer.sessionId, appended)
    setTimeout(() => {
      inFlight.delete(composer.sessionId)
      if (sendObserved(composer.input(), appended.block)) {
        deps.onSent(composer.sessionId, ids)
        return
      }
      withdrawMentions(composer, appended)
    }, 0)
  }

  /** Run a Lexical verdict; answers whether the event must be stopped. */
  const act = (verdict: SendVerdict, composer: ComposerFace): boolean => {
    if (verdict === 'pass') return false
    const entries = deps.staged(composer.sessionId)
    if (verdict === 'wait') {
      const pending = entries.filter((entry) => entry.status === 'pending').length
      deps.notify(composer.sessionId, 'info', deps.copy().waiting(pending))
      return true
    }
    // A second gesture before the first was judged would append the block
    // twice; the first one is still deciding.
    if (inFlight.has(composer.sessionId)) return false
    const { mentions, ids } = readyMentions(entries)
    const appended = appendMentions(composer, mentions)
    if (appended === undefined) {
      deps.notify(composer.sessionId, 'error', deps.copy().attachFailed)
      return true
    }
    if (verdict === 'submit') composer.submit()
    judge(composer, appended, ids)
    return false
  }

  /** The textarea composer: take the gesture over, as 0.1.0–0.1.1 require. */
  const legacySend = (composer: ComposerFace): boolean => {
    const state = composer.input()
    if (!acceptsSubmission(state?.phase) || state === undefined) return false
    const entries = deps.staged(composer.sessionId)
    const pending = entries.filter((entry) => entry.status === 'pending').length
    const { mentions, ids } = readyMentions(entries)
    if (mentions.length === 0 && pending === 0) return false
    if (pending > 0) {
      deps.notify(composer.sessionId, 'info', deps.copy().waiting(pending))
      return true
    }
    if (!composer.setDraft(composeSubmission(state.draft, mentions))) return false
    composer.submit()
    // Cleared at once: on failure this composer keeps the rewritten draft,
    // which still holds the paths, so re-staging would duplicate them.
    deps.onSent(composer.sessionId, ids)
    return true
  }

  const stop = (event: Event): void => {
    event.preventDefault()
    event.stopPropagation()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') return
    const target = event.target
    if (!(target instanceof Element)) return

    if (target instanceof HTMLTextAreaElement) {
      if (!isSendKey(event)) return
      const card = cardOf(target)
      if (card === null || target.disabled || target.readOnly) return
      if (card.querySelector('[data-composer-input]') !== null) return
      if (target.getAttribute('aria-expanded') === 'true') return
      const composer = deps.composerAt(target)
      if (composer !== undefined && legacySend(composer)) stop(event)
      return
    }

    const input = target.closest('[data-composer-input]')
    if (input === null) return
    const card = cardOf(input)
    const composer = deps.composerAt(input)
    if (composer === undefined) return
    const verdict = lexicalEnterVerdict(keyFacts(event), factsFor(input, card, composer))
    if (act(verdict, composer)) stop(event)
  }

  /** The Send control, enabled: append and let the composer's click send. */
  const onClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('button')
    const card = button === null ? null : cardOf(button)
    if (button === null || card === null) return
    const role = primaryRole(button, card)
    if (role !== 'send' || button.disabled) return
    const composer = deps.composerAt(button)
    if (composer === undefined) return
    const input = card.querySelector('[data-composer-input]')
    if (input === null) {
      if (legacySend(composer)) stop(event)
      return
    }
    const verdict = sendButtonVerdict(role, true, composer.running(), factsFor(input, card, composer))
    if (act(verdict, composer)) stop(event)
  }

  /**
   * The Send control, disabled: an empty draft whose only content is staged
   * files. A disabled button never dispatches `click`, so the press is caught
   * at `pointerdown` and the message is submitted through the action face.
   */
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('button')
    const card = button === null ? null : cardOf(button)
    if (button === null || card === null || !button.disabled) return
    const input = card.querySelector('[data-composer-input]')
    if (input === null) return
    const role = primaryRole(button, card)
    const composer = deps.composerAt(button)
    if (composer === undefined) return
    const verdict = sendButtonVerdict(role, false, composer.running(), factsFor(input, card, composer))
    if (verdict === 'pass') return
    if (act(verdict, composer) || verdict === 'submit') stop(event)
  }

  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('pointerdown', onPointerDown, true)
  return () => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('pointerdown', onPointerDown, true)
  }
}
