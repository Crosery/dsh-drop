/**
 * The files staged for the next message, held outside the draft.
 *
 * This is the file half of what the composer's attachment ids are for images:
 * an ordered list that lives beside the draft rather than inside it, so the
 * composer's text stays exactly what the user typed. A dropped file leaves no
 * character behind.
 *
 * Images can do this because the wire format has an image content block.
 * Files have none here, so the path has to reach the model as prompt text —
 * which means somebody has to splice it in at send time. That is the trade
 * this module exists to make: the draft is clean, and in exchange this plugin
 * owns one interception point (see `submit-guard.ts`).
 *
 * An entry exists from the moment of the drop, `pending` while its path is
 * being acquired, so the card shows up at once and a send cannot leave
 * without it. Per session, because drafts are per session: switching sessions
 * and coming back has to find the same attachments, and sending in one
 * session must not empty another's.
 * @module @crosery/dsh-drop/client/attached
 */
/** What one staged reference names. Directories are spelled with a trailing slash. */
export type AttachedKind = 'file' | 'directory';
/** Where an entry is in its acquisition. */
export type AttachedStatus = 'pending' | 'ready' | 'error';
/** How a ready entry's path was obtained. */
export type AttachedHow = 'in-place' | 'copied';
/** One file staged for the next message. */
export interface AttachedFile {
    /** Stable identity for React keys and removal; monotonic per store. */
    readonly id: number;
    /** Preview-material key; stable for the entry's lifetime. */
    readonly key: string;
    readonly kind: AttachedKind;
    readonly status: AttachedStatus;
    /** Display name, as the browser reported it. */
    readonly name: string;
    /** Byte length, when known. */
    readonly size?: number | undefined;
    /** Absolute path, as the model will receive it; present once `ready`. */
    readonly path?: string | undefined;
    /** How the path was obtained; present once `ready`. */
    readonly how?: AttachedHow | undefined;
}
/** The fields a caller supplies when staging; identity and key are assigned here. */
export type AttachedInput = Omit<AttachedFile, 'id' | 'key'>;
/** Mutable fields of an existing entry. */
export type AttachedUpdate = Partial<Pick<AttachedFile, 'status' | 'path' | 'how' | 'size'>>;
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
    /** Called once for every entry that leaves the store. */
    private readonly onRelease;
    /**
     * @param onRelease - called once for every entry that leaves the store, so
     *   the preview material behind it can be released.
     */
    constructor(onRelease?: (entry: AttachedFile) => void);
    /**
     * Stage one file for a session.
     *
     * A ready path already staged in the session is not staged twice: the
     * existing entry is returned instead, and no second card appears.
     * @param sessionId - the owning session.
     * @param input - the entry's fields; a bare string stages a ready path.
     * @returns the staged entry, or the existing one it duplicates.
     */
    add(sessionId: string, input: AttachedInput | string): AttachedFile;
    /**
     * Change one entry, typically `pending` → `ready`.
     *
     * Becoming ready with a path another ready entry already holds removes this
     * entry instead: the reference is already staged.
     * @param sessionId - the owning session.
     * @param id - the entry's identity.
     * @param update - the fields to change.
     * @returns the entry now standing for the file, or undefined when it is gone.
     */
    update(sessionId: string, id: number, update: AttachedUpdate): AttachedFile | undefined;
    /**
     * Drop one staged file.
     * @param sessionId - the owning session.
     * @param id - the entry's identity.
     */
    remove(sessionId: string, id: number): void;
    /**
     * Clear staged files after a send carried them out.
     *
     * Called only once the send is observed: the paths went out with that
     * message, and leaving them staged would silently attach them to the next
     * one too.
     * @param sessionId - the owning session.
     * @param ids - the entries that were sent; all of the session's when omitted.
     */
    clear(sessionId: string, ids?: readonly number[]): void;
    /**
     * Read one session's staged files.
     * @param sessionId - the owning session.
     * @returns a reference-stable snapshot, empty when nothing is staged.
     */
    list(sessionId: string): readonly AttachedFile[];
    /**
     * One session's entries by status.
     * @param sessionId - the owning session.
     * @param status - the status to select.
     * @returns the matching entries, in order.
     */
    withStatus(sessionId: string, status: AttachedStatus): readonly AttachedFile[];
    /**
     * Subscribe to changes in any session's list.
     * @param listener - called after every mutation.
     * @returns the unsubscribe function.
     */
    subscribe(listener: () => void): () => void;
    /** A ready entry holding `path`, other than `except`. */
    private findPath;
    /** Re-freeze one session's snapshot and notify subscribers. */
    private publish;
}
/**
 * The text actually sent on the textarea composer, with the staged mentions
 * spliced in.
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
 * ("look at these"), and the model receives the mentions alone.
 * @param draft - what the user typed, verbatim.
 * @param mentions - staged `@` mentions, in attachment order.
 * @returns the prompt text to submit.
 */
export declare function composeSubmission(draft: string, mentions: readonly string[]): string;
