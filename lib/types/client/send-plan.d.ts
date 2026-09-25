/**
 * The decisions behind the send interception, with no DOM in reach.
 *
 * Staged files reach the model as `@` mentions appended to the message, and
 * the only moment to append them is the send gesture. Two composer
 * generations exist:
 *
 * - **0.1.0–0.1.1** draw the draft in a `<textarea>`. The guard takes the
 *   gesture, rewrites the draft through `setDraft`, and re-submits.
 * - **0.1.2 onward** draw it in a Lexical `contenteditable`, where `setDraft`
 *   rebuilds the document as plain text (reference chips flatten) and
 *   `inputActions.submit()` is hard-wired to one delivery mode. So the guard
 *   no longer submits at all: it inserts the mentions at the end of the
 *   document and lets the composer's own Enter or Send handler run, with its
 *   delivery mode, upload gate and slash adjudication intact.
 *
 * Every rule that decides whether to act, and every offset the insertion
 * uses, lives here so the test suite can pin it.
 * @module @crosery/dsh-drop/client/send-plan
 */
/** The keyboard facts one Enter decision reads, off the native event. */
export interface KeyFacts {
    readonly key: string;
    readonly shiftKey: boolean;
    readonly altKey: boolean;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    /** `getModifierState('AltGraph')`. */
    readonly altGraph: boolean;
    readonly isComposing: boolean;
    readonly keyCode: number;
    readonly repeat: boolean;
}
/** The composer facts one send decision reads. */
export interface ComposerFacts {
    /** The editor root carries `data-composer-composing` (Safari ends IME before keydown). */
    readonly composing: boolean;
    /** An open trigger menu has a highlighted option, so Enter picks it. */
    readonly menuPick: boolean;
    /** The input accepts edits: editable, not `aria-disabled`, not read-only. */
    readonly editable: boolean;
    /** The input machine's phase, when one is published. */
    readonly phase: string | undefined;
    /** Staged files ready to be referenced. */
    readonly ready: number;
    /** Staged files still being acquired. */
    readonly pending: number;
    /** Official file drafts still uploading: the composer itself refuses to send. */
    readonly uploadsPending: boolean;
}
/**
 * What the guard does with one send gesture.
 *
 * - `pass`: not ours; the composer proceeds untouched.
 * - `wait`: files are still being acquired; the gesture is held back so a
 *   message never leaves with half of its references.
 * - `append`: insert the mentions, then let the composer's handler send.
 * - `submit`: insert the mentions and submit through the action face, because
 *   the composer's own control is disabled (an empty draft with only staged
 *   files) and would never fire.
 */
export type SendVerdict = 'pass' | 'wait' | 'append' | 'submit';
/**
 * Whether the machine is in a phase that accepts a submission.
 * @param phase - the published phase, when any.
 * @returns true for `plain` and `claimed`.
 */
export declare function acceptsSubmission(phase: string | undefined): boolean;
/**
 * Whether a keydown is one the Lexical composer submits on.
 *
 * Mirrors the composer's own Enter command: Shift+Enter is a newline;
 * Alt/AltGraph, Ctrl+Meta and Shift with Ctrl or Meta are swallowed; an IME
 * composition (including the few milliseconds after it ends) is mid-word; an
 * auto-repeated Enter is ignored. Ctrl or Meta alone is the accelerated send,
 * which the composer resolves to steer or queue itself.
 * @param key - the keydown.
 * @param composing - the editor root's composition marker.
 * @returns true when this keystroke reaches the composer's submit.
 */
export declare function isLexicalSendKey(key: KeyFacts, composing: boolean): boolean;
/**
 * Decide what an Enter in the Lexical composer does with staged files.
 * @param key - the keydown.
 * @param composer - the composer's current facts.
 * @returns the verdict.
 */
export declare function lexicalEnterVerdict(key: KeyFacts, composer: ComposerFacts): SendVerdict;
/** The primary control's role, read from its structure. */
export type PrimaryRole = 'send' | 'stop' | 'other';
/**
 * Classify a button inside the composer card by its structure.
 *
 * Every published composer draws its primary control as the card's last
 * button, holding one 16-unit SVG: an arrow (`path`) while it sends, a rounded
 * square (`rect`) while it stops a running turn. Class names are no guide —
 * they carry a per-build hash (`uV2eYG_primary` on the Web bundle,
 * `QJwAZG_primary` in the desktop app) — and the label is localized.
 * @param isLastButton - the button is the last one in its composer card.
 * @param hasRect - its SVG draws a rectangle.
 * @param hasPath - its SVG draws a path.
 * @returns the role.
 */
export declare function primaryRoleOf(isLastButton: boolean, hasRect: boolean, hasPath: boolean): PrimaryRole;
/**
 * Decide what a press of the composer's primary control does with staged files.
 * @param role - send, stop, or not the primary control at all.
 * @param enabled - whether the control can be activated.
 * @param running - whether the session is running a turn.
 * @param composer - the composer's current facts.
 * @returns the verdict.
 */
export declare function sendButtonVerdict(role: PrimaryRole, enabled: boolean, running: boolean, composer: ComposerFacts): SendVerdict;
/** One reference chip, as the input state reports it. */
export interface OccurrenceLength {
    /** The chip's length in the clipboard projection (`draft`). */
    readonly length: number;
}
/**
 * The end of the document in the editor's detect coordinates.
 *
 * Insertion spans are detect offsets, where each reference chip is ONE
 * placeholder character; `draft` is the clipboard projection, where the same
 * chip spells out its full text. The end offset is therefore the draft length
 * with every chip folded back to one character.
 * @param draft - clipboard projection of the document.
 * @param occurrences - the chips in it.
 * @returns the detect offset of the document end.
 */
export declare function detectEnd(draft: string, occurrences: readonly OccurrenceLength[]): number;
/**
 * The text appended to a draft to carry the staged mentions.
 *
 * The user's words lead and the mentions follow, one per line after a blank
 * line — the session title is derived from the head of the first message, and
 * a title of `@/Users/…` tells the user nothing. The separator adapts to what
 * the draft already ends with, and an empty draft takes no separator at all.
 *
 * The trailing space is load-bearing: it closes the last `@` token, so the
 * composer's completion menu does not reopen on the freshly inserted path in
 * the instant before the send commits.
 * @param draft - clipboard projection of the current draft.
 * @param mentions - staged `@` mentions, in attachment order.
 * @returns the text to insert at the document end.
 */
export declare function mentionBlock(draft: string, mentions: readonly string[]): string;
/** An insertion span in detect coordinates, with the revision it was taken at. */
export interface InsertionSpan {
    readonly start: number;
    readonly end: number;
    readonly draftRev: number;
}
/**
 * Where the mention block goes: a collapsed span at the document end.
 * @param draft - clipboard projection of the current draft.
 * @param occurrences - the chips in it.
 * @param draftRev - the editor revision these were read at.
 * @returns the span.
 */
export declare function appendSpan(draft: string, occurrences: readonly OccurrenceLength[], draftRev: number): InsertionSpan;
/**
 * The span covering an inserted block that is still at the document end, for
 * taking it back out.
 * @param draft - clipboard projection after the insertion.
 * @param occurrences - the chips in it.
 * @param draftRev - the current editor revision.
 * @param inserted - the block that was inserted.
 * @returns the span, or undefined when the draft no longer ends with it.
 */
export declare function insertedSpan(draft: string, occurrences: readonly OccurrenceLength[], draftRev: number, inserted: string): InsertionSpan | undefined;
/** The part of the input state the send observation compares. */
export interface ObservedInput {
    readonly draft: string;
    readonly phase: string | undefined;
}
/**
 * Whether the composer took the message that carried the inserted mentions.
 *
 * A send either commits (the editor clears, or keeps only what was typed
 * after the snapshot) or enters a transaction phase (a slash command being
 * adjudicated). A refused send — uploads still running, a steer that took the
 * queue instead, a disabled composer — leaves the draft exactly as the
 * insertion left it, ending in the block.
 * @param after - the input state once the gesture has run, or undefined when
 *   the composer is gone.
 * @param inserted - the block that was inserted.
 * @returns true when the block left with a message.
 */
export declare function sendObserved(after: ObservedInput | undefined, inserted: string): boolean;
