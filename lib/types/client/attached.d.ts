/**
 * The files staged for the next message, held outside the draft.
 *
 * This is the file half of what `imageIds` is for images: an ordered list that
 * lives beside the draft rather than inside it, so the composer's text stays
 * exactly what the user typed. A dropped file leaves no character behind.
 *
 * Images can do this because the wire format has an image content block and
 * the composer carries `imageIds` through submit for it. Files have neither,
 * so the path has to reach the model as prompt text — which means somebody has
 * to splice it in at send time. That is the trade this module exists to make:
 * the draft is clean, and in exchange this plugin owns one interception point
 * (see `submit-guard.ts`).
 *
 * Per session, because drafts are per session: switching sessions and coming
 * back has to find the same attachments, and sending in one session must not
 * empty another's.
 * @module @crosery/dsh-drop/client/attached
 */
/** One file staged for the next message. */
export interface AttachedFile {
    /** Stable identity for React keys and removal; monotonic per store. */
    readonly id: number;
    /** Absolute path, as the model will receive it. */
    readonly path: string;
}
/** A subscribable, per-session list of staged files. */
export declare class AttachedFiles {
    private readonly bySession;
    private readonly listeners;
    private seq;
    /**
     * Snapshot identity per session.
     *
     * `useSyncExternalStore` compares snapshots by reference and loops forever if
     * a fresh array comes back every read, so each session keeps one frozen array
     * that is replaced only on a real mutation.
     */
    private readonly snapshots;
    /** The empty snapshot, shared so an untouched session is reference-stable. */
    private static readonly EMPTY;
    /**
     * Stage one file for a session.
     * @param sessionId - the owning session.
     * @param path - absolute path to attach.
     * @returns the staged entry.
     */
    add(sessionId: string, path: string): AttachedFile;
    /**
     * Drop one staged file.
     * @param sessionId - the owning session.
     * @param id - the entry's identity.
     */
    remove(sessionId: string, id: number): void;
    /**
     * Clear a session's staged files.
     *
     * Called after a send commits: the paths went out with that message, and
     * leaving them staged would silently attach them to the next one too.
     * @param sessionId - the owning session.
     */
    clear(sessionId: string): void;
    /**
     * Read one session's staged files.
     * @param sessionId - the owning session.
     * @returns a reference-stable snapshot, empty when nothing is staged.
     */
    list(sessionId: string): readonly AttachedFile[];
    /**
     * Subscribe to changes in any session's list.
     * @param listener - called after every mutation.
     * @returns the unsubscribe function.
     */
    subscribe(listener: () => void): () => void;
    /** Re-freeze one session's snapshot and notify subscribers. */
    private publish;
}
/**
 * The text actually sent, with the staged mentions spliced in.
 *
 * **The user's words lead and the mentions follow.** Not for the model's sake —
 * it reads either order — but for the session title, which is derived from the
 * head of the first message. Mentions first turned every session that began
 * with a drop into `@/Users/…/drops/2026-09-04/…` in the sidebar, each one
 * truncated at the same prefix and none of them distinguishable. Trailing them
 * keeps the title the sentence the user actually typed.
 *
 * A blank line separates the two so a path cannot fuse onto a sentence that
 * ends without punctuation.
 *
 * An empty draft is fine: a message that is only attachments is a real request
 * ("look at these"), and the model receives the mentions alone. This is the
 * one thing the draft-resident design could not do — the composer refuses to
 * submit an empty draft, so a file with no typed words had nothing to ride on.
 * @param draft - what the user typed, verbatim.
 * @param mentions - staged `@` mentions, in attachment order.
 * @returns the prompt text to submit.
 */
export declare function composeSubmission(draft: string, mentions: readonly string[]): string;
