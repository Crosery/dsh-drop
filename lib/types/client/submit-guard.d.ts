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
import type { AttachedFile } from './attached.ts';
import { type ComposerFace } from './composer-face.ts';
/** What the guard needs from the plugin. */
export interface SubmitGuardDeps {
    /** The composer whose card contains a target, when a rail is mounted there. */
    composerAt: (target: Element) => ComposerFace | undefined;
    /** The session's staged entries. */
    staged: (sessionId: string) => readonly AttachedFile[];
    /** Called once a send carried these entries out. */
    onSent: (sessionId: string, ids: readonly number[]) => void;
    /** Raise a notice in the session's composer. */
    notify: (sessionId: string, level: 'info' | 'error', text: string) => void;
    /** Copy for the two notices the guard raises. */
    copy: () => {
        waiting: (count: number) => string;
        attachFailed: string;
    };
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
export declare function isSendKey(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing' | 'keyCode'>): boolean;
/**
 * Install the send interception for the plugin's lifetime.
 *
 * The guard is inert unless the addressed session has files staged, so an
 * ordinary message — no drops — takes the shipped path untouched.
 * @param deps - the plugin's side of the guard.
 * @returns a disposer removing every listener.
 */
export declare function installSubmitGuard(deps: SubmitGuardDeps): () => void;
