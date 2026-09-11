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
/** The composer verbs this guard drives, published by the mounted rail. */
export interface ComposerHandle {
    /** The session whose composer this is. */
    sessionId: string;
    /** Current draft text. */
    draft: () => string;
    /** Replace the draft (the composer's single public write path). */
    setDraft: (text: string) => void;
    /** Enter the composer's submit transaction. */
    submit: () => void;
    /** Whether the machine currently accepts a submission at all. */
    ready: () => boolean;
}
/** Accessor for the mentions staged against one session. */
export type StagedMentions = (sessionId: string) => readonly string[];
/**
 * Whether a keyboard event is the composer's send gesture.
 *
 * Shift+Enter is a newline and IME composition is mid-word, so neither is a
 * send. `isComposing` has to be read off the native event: React's synthetic
 * event does not carry it, and a capture listener sees the native one anyway.
 * @param event - the observed keydown.
 * @returns true when this keystroke would submit.
 */
export declare function isSendKey(event: KeyboardEvent): boolean;
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
export declare function installSubmitGuard(handle: () => ComposerHandle | undefined, staged: StagedMentions, onSent: (sessionId: string) => void): () => void;
