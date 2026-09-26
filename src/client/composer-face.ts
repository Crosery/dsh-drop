/**
 * One composer's send-side verbs, assembled from whatever the running harness
 * publishes.
 *
 * The rail receives the composer's input state and action face as props, and
 * the session's scope through the plugin's services. Which members exist
 * depends on the train:
 *
 * | Train        | Text insertion                                     |
 * | ------------ | -------------------------------------------------- |
 * | 0.1.7        | `inputActions.insertText(text, span)` + `captureInsertion()` |
 * | 0.1.2–0.1.6  | the scoped `slash/input-insert-text` event          |
 * | 0.1.0–0.1.1  | none: the textarea path rewrites the draft instead  |
 *
 * Each rung is feature-detected at call time, never assumed from a version,
 * and a rung that refuses (a stale revision, a locked editor) answers false so
 * the caller can decline instead of sending a message without its files.
 *
 * DOM-free: the rail hands in plain functions, so the ladder is testable.
 * @module @crosery/dsh-drop/client/composer-face
 */

import {
  appendSpan, insertedSpan, mentionBlock,
  type InsertionSpan, type OccurrenceLength,
} from './send-plan.ts'

/** The input state the send path reads. */
export interface InputSnapshot {
  /** Clipboard projection of the document. */
  readonly draft: string
  /** Reference chips, with their clipboard lengths; empty on the textarea composer. */
  readonly occurrences: readonly OccurrenceLength[]
  /** Editor revision, when the train publishes one. */
  readonly draftRev: number | undefined
  /** Input-machine phase. */
  readonly phase: string | undefined
}

/**
 * Read an input state of any train into the fields the send path uses.
 *
 * The state's shape grew over the trains (`occurrences` and `draftRev` arrived
 * with the Lexical composer), so it is read structurally and anything
 * unrecognizable answers undefined rather than a guess.
 * @param raw - the published input state.
 * @returns the snapshot, or undefined when there is no draft string.
 */
export function snapshotOf(raw: unknown): InputSnapshot | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const draft: unknown = Reflect.get(raw, 'draft')
  if (typeof draft !== 'string') return undefined
  const occurrences: unknown = Reflect.get(raw, 'occurrences')
  const draftRev: unknown = Reflect.get(raw, 'draftRev')
  const phase: unknown = Reflect.get(raw, 'phase')
  return {
    draft,
    occurrences: Array.isArray(occurrences)
      ? occurrences.filter((occurrence): occurrence is OccurrenceLength =>
        typeof occurrence === 'object' && occurrence !== null && typeof Reflect.get(occurrence, 'length') === 'number')
      : [],
    draftRev: typeof draftRev === 'number' ? draftRev : undefined,
    phase: typeof phase === 'string' ? phase : undefined,
  }
}

/** The action face members the ladder may call, each optional. */
export interface ActionsLike {
  captureInsertion?: () => InsertionSpan
  insertText?: (text: string, span: InsertionSpan) => boolean
  setDraft?: (text: string) => void
  submit?: () => void
}

/** A session-scope context, as far as emitting its scoped events goes. */
export interface ScopeLike {
  bail?: (...args: unknown[]) => unknown
}

/** What the rail supplies. */
export interface ComposerParts {
  readonly sessionId: string
  /** Latest input state: the live store when reachable, else the last render. */
  input(): InputSnapshot | undefined
  /** The session's action face from the standard kit, when present. */
  actions(): ActionsLike | undefined
  /** The session-scope context, for the scoped insert event. */
  scope(): ScopeLike | undefined
  /** Official file drafts still uploading. */
  uploadsPending(): boolean
  /** The session is running a turn. */
  running(): boolean
}

/** The verbs the send guard drives. */
export interface ComposerFace {
  readonly sessionId: string
  input(): InputSnapshot | undefined
  /**
   * The editor revision a new insertion must carry.
   * @returns the live revision, or undefined when the train publishes none.
   */
  revision(): number | undefined
  /**
   * Insert plain text over a detect span, keeping reference chips intact.
   * @param text - the text; empty to delete the span.
   * @param span - the span, with the revision it was computed at.
   * @returns whether the editor applied it.
   */
  insert(text: string, span: InsertionSpan): boolean
  /**
   * Insert text over the live selection, the way a paste does.
   * @param text - the text.
   * @returns whether the train offers this and the editor applied it.
   */
  insertAtSelection(text: string): boolean
  /** Replace the whole draft (textarea path, and a chip-free fallback). */
  setDraft(text: string): boolean
  /** Enter the composer's submit transaction through the action face. */
  submit(): boolean
  uploadsPending(): boolean
  running(): boolean
}

/**
 * Assemble the face.
 * @param parts - what the rail can reach.
 * @returns the face.
 */
export function composerFace(parts: ComposerParts): ComposerFace {
  return {
    sessionId: parts.sessionId,
    input: () => parts.input(),
    revision: () => {
      const actions = parts.actions()
      if (typeof actions?.captureInsertion === 'function') {
        try {
          return actions.captureInsertion().draftRev
        } catch {
          // Fall through to the published state.
        }
      }
      return parts.input()?.draftRev
    },
    insert: (text, span) => {
      const actions = parts.actions()
      if (typeof actions?.insertText === 'function') {
        try {
          return actions.insertText(text, span) === true
        } catch {
          return false
        }
      }
      // 0.1.2–0.1.6: the same edit through the scoped event the completion
      // menu uses. Passing the scope as `this` is what confines the event to
      // this session's composer; without it every mounted session would hear it.
      const scope = parts.scope()
      if (typeof scope?.bail === 'function') {
        try {
          return scope.bail(scope, 'slash/input-insert-text', { text, span }) === true
        } catch {
          return false
        }
      }
      return false
    },
    insertAtSelection: (text) => {
      const actions = parts.actions()
      if (typeof actions?.insertText !== 'function' || typeof actions.captureInsertion !== 'function') return false
      try {
        return actions.insertText(text, actions.captureInsertion()) === true
      } catch {
        return false
      }
    },
    setDraft: (text) => {
      const actions = parts.actions()
      if (typeof actions?.setDraft !== 'function') return false
      actions.setDraft(text)
      return true
    },
    submit: () => {
      const actions = parts.actions()
      if (typeof actions?.submit !== 'function') return false
      actions.submit()
      return true
    },
    uploadsPending: () => parts.uploadsPending(),
    running: () => parts.running(),
  }
}

/** How a mention block went in, so it can be taken back out the same way. */
export interface Appended {
  /** The inserted text; the draft ends with it until the send commits. */
  readonly block: string
  /** `insert` kept every chip; `setDraft` rewrote a chip-free draft. */
  readonly via: 'insert' | 'setDraft'
}

/**
 * Append the staged mentions to the end of the document.
 *
 * The span is computed from the state and the revision is checked against it:
 * a state read before the latest edit would put the block in the middle of
 * the user's words, so a mismatch refuses instead. When the train offers no
 * insertion at all, a draft with no reference chips can still be rewritten
 * whole without losing anything; a draft with chips cannot, and is refused.
 * @param face - the composer.
 * @param mentions - the staged `@` mentions, in order.
 * @returns how the block went in, or undefined when it could not.
 */
export function appendMentions(face: ComposerFace, mentions: readonly string[]): Appended | undefined {
  if (mentions.length === 0) return undefined
  const state = face.input()
  if (state === undefined) return undefined
  const block = mentionBlock(state.draft, mentions)
  const rev = face.revision()
  // The state trails the editor: computing the end from it would land the
  // block inside words typed since. Refuse, and let the next gesture retry.
  if (rev !== undefined && state.draftRev !== undefined && state.draftRev !== rev) return undefined
  if (rev !== undefined && face.insert(block, appendSpan(state.draft, state.occurrences, rev))) {
    return { block, via: 'insert' }
  }
  if (state.occurrences.length > 0) return undefined
  return face.setDraft(state.draft + block) ? { block, via: 'setDraft' } : undefined
}

/**
 * Take an appended block back out after the composer refused the send.
 * @param face - the composer.
 * @param appended - what {@link appendMentions} reported.
 * @returns true when the draft no longer ends with the block.
 */
export function withdrawMentions(face: ComposerFace, appended: Appended): boolean {
  const state = face.input()
  if (state === undefined) return false
  if (!state.draft.endsWith(appended.block)) return true
  if (appended.via === 'insert') {
    const rev = face.revision() ?? state.draftRev
    const span = rev === undefined ? undefined : insertedSpan(state.draft, state.occurrences, rev, appended.block)
    if (span !== undefined && face.insert('', span)) return true
  }
  if (state.occurrences.length > 0) return false
  return face.setDraft(state.draft.slice(0, state.draft.length - appended.block.length))
}
