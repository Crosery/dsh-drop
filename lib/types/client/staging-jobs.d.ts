/**
 * Acquiring staged files, each one cancellable by its own card.
 *
 * Every staged entry — a file or a folder — shows up in the rail as `pending`
 * the moment it is dropped, and its card has a remove control from that
 * moment on. Removing it has to stop the work behind it: the upload is
 * aborted, the queue moves on to the next item instead of waiting for bytes
 * nobody wants, and a failure the removal caused is not reported for a card
 * that is already gone. Plugin teardown stops everything at once.
 *
 * DOM-free: the acquisition and the preview store are handed in, so the queue
 * is testable.
 * @module @crosery/dsh-drop/client/staging-jobs
 */
import { type StagedCandidate } from '../contract.ts';
import type { AcquirableFile, Acquired } from './acquire.ts';
import type { AttachedFiles } from './attached.ts';
/**
 * A signal that aborts when either input does.
 *
 * Written out rather than `AbortSignal.any`, which older Safari lacks.
 * @param a - one signal.
 * @param b - the other.
 * @returns the combined signal, and the release of its listeners.
 */
export declare function linked(a: AbortSignal, b: AbortSignal): {
    signal: AbortSignal;
    release: () => void;
};
/** The work behind each pending entry, by entry id, under the plugin's lifetime. */
export declare class EntryJobs {
    private readonly controllers;
    private readonly plugin;
    /**
     * @param plugin - aborted when the plugin goes; every job goes with it.
     */
    constructor(plugin: AbortSignal);
    /** Whether the plugin is gone. */
    get closed(): boolean;
    /**
     * Track an entry from the moment its card appears, so removing the card
     * while the entry still waits its turn cancels it too.
     * @param id - the entry's id.
     * @returns the entry's own cancellation signal.
     */
    open(id: number): AbortSignal;
    /**
     * The signal one entry's work runs under.
     * @param id - the entry's id, {@link open}ed earlier.
     * @returns a signal aborted by the entry's cancellation or the plugin's, and
     *   the release that forgets the entry once its work is done.
     */
    run(id: number): {
        signal: AbortSignal;
        release: () => void;
    };
    /**
     * Stop an entry's work, if it has any; called when its card leaves.
     * @param id - the entry's id.
     */
    cancel(id: number): void;
    /** Forget every entry; the plugin's own abort has already stopped their work. */
    clear(): void;
}
/** What {@link stageFiles} needs from the plugin. */
export interface StageFilesDeps<F extends AcquirableFile> {
    /** The staged list the entries live in. Its release hook must {@link EntryJobs.cancel} the entry. */
    readonly attached: AttachedFiles;
    readonly jobs: EntryJobs;
    /** Pair an entry with its bytes before its card first renders. */
    preview(key: string, file: F): void;
    /** Get a readable path for one file; aborts with the signal. */
    acquire(file: F, bridged: string | undefined, hints: readonly string[], signal: AbortSignal): Promise<Acquired>;
    /** Report the files that could not be acquired. Never counts a removed one. */
    failed(sessionId: string, count: number): void;
}
/**
 * Acquire staged candidates for one session, one at a time.
 *
 * Each file shows up in the rail at once as `pending`, so a large upload is
 * visible and a send cannot leave without it. Sequential rather than
 * concurrent: a multi-file transfer is usually a few large files, and letting
 * them race would have them compete for the same disk while making the
 * mention order nondeterministic.
 * @param deps - the plugin's side.
 * @param sessionId - the session the files were dropped on.
 * @param candidates - the files, in drop order.
 * @param hints - absolute paths decoded from the transfer.
 */
export declare function stageFiles<F extends AcquirableFile>(deps: StageFilesDeps<F>, sessionId: string, candidates: readonly StagedCandidate<F>[], hints: readonly string[]): Promise<void>;
