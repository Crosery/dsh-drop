/**
 * Splicing the staged paths into the message as it is sent.
 *
 * A file's path has to reach the model as prompt text — the wire format has no
 * file content block — and the only public way to put text into a message is
 * the draft. Keeping the path IN the draft is what this plugin used to do, and
 * it is why a dropped file left a marker in the composer. Holding the path
 * outside the draft means something has to put it back at the last moment.
 *
 * That moment is the send gesture. Both gestures — Enter in the textarea and
 * the send button — end in the same two composer calls, so a capture-phase
 * listener sees them before the composer's own React handler does. When files
 * are staged, this guard takes the gesture, rewrites the draft to include the
 * mentions, and re-submits through the composer's own action face. Everything
 * downstream is unchanged: the same machine, the same adjudication, the same
 * sink, the same error handling.
 *
 * What it deliberately does NOT do is send anything itself. Calling
 * `session.prompt` directly would mean reimplementing image attachments, slash
 * adjudication, queue-versus-steer delivery, and the draft's failure
 * restoration — four things the composer already does correctly.
 * @module @crosery/dsh-drop/client/submit-guard
 */

import { composeSubmission } from './attached.ts'

/** The composer verbs this guard drives, published by the mounted rail. */
export interface ComposerHandle {
  /** The session whose composer this is. */
  sessionId: string
  /** Current draft text. */
  draft: () => string
  /** Replace the draft (the composer's single public write path). */
  setDraft: (text: string) => void
  /** Enter the composer's submit transaction. */
  submit: () => void
  /** Whether the machine currently accepts a submission at all. */
  ready: () => boolean
}

/** Accessor for the mentions staged against one session. */
export type StagedMentions = (sessionId: string) => readonly string[]

/**
 * Whether a keyboard event is the composer's send gesture.
 *
 * Shift+Enter is a newline and IME composition is mid-word, so neither is a
 * send. `isComposing` has to be read off the native event: React's synthetic
 * event does not carry it, and a capture listener sees the native one anyway.
 * @param event - the observed keydown.
 * @returns true when this keystroke would submit.
 */
export function isSendKey(event: KeyboardEvent): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false
  if (event.isComposing || event.keyCode === 229) return false
  return true
}

/**
 * Install the send interception for the plugin's lifetime.
 *
 * Listeners sit on `document` in capture phase, which is what puts them ahead
 * of the composer's handlers (React 18 delegates from the root container, so
 * its handlers run in the bubble phase of a listener attached above it).
 *
 * The guard is inert unless the addressed session has files staged, so an
 * ordinary message — no drops — takes the shipped path untouched, including
 * the Cmd/Ctrl+Enter steer gesture this interception cannot express.
 * @param handle - reads the currently mounted composer, or undefined.
 * @param staged - the mentions staged per session.
 * @param onSent - called after a submission carried its staged files out.
 * @returns a disposer removing both listeners.
 */
export function installSubmitGuard(
  handle: () => ComposerHandle | undefined,
  staged: StagedMentions,
  onSent: (sessionId: string) => void,
): () => void {
  /**
   * Rewrite and re-submit, or decline and let the composer proceed.
   * @returns true when the gesture was taken over.
   */
  const intercept = (): boolean => {
    const composer = handle()
    if (composer === undefined || !composer.ready()) return false
    const mentions = staged(composer.sessionId)
    if (mentions.length === 0) return false

    const draft = composer.draft()
    // The composer refuses an empty draft, so this is also what makes a
    // message of pure attachments sendable at all.
    composer.setDraft(composeSubmission(draft, mentions))
    composer.submit()
    // Cleared unconditionally: on success the paths went out, and on failure
    // the composer retains the rewritten draft — which still holds them, so
    // re-staging would duplicate every path on the retry.
    onSent(composer.sessionId)
    return true
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isSendKey(event)) return
    const target = event.target
    if (!(target instanceof HTMLTextAreaElement)) return
    if (target.closest('[data-composer-card]') === null || target.disabled || target.readOnly) return
    if (target.getAttribute('aria-expanded') === 'true') return
    if (!intercept()) return
    event.preventDefault()
    event.stopPropagation()
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('button')
    if (button === null || button.disabled || button.closest('[data-composer-card]') === null) return
    // The send control is the composer card's primary button. Identified by
    // its class rather than its label, which is localized — and which flips to
    // the stop action while a turn runs, a gesture this guard must not touch.
    if (!/_primary\b/.test(button.className)) return
    if (!intercept()) return
    event.preventDefault()
    event.stopPropagation()
  }

  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('click', onClick, true)
  return () => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('click', onClick, true)
  }
}
