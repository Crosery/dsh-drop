/**
 * Turning a dropped folder into a path the agent can list.
 *
 * The same ladder files take, with a folder's own evidence at each rung:
 *
 * 1. **The desktop bridge.** Inside the desktop app the folder's `File`
 *    (from `getAsFile()`, read during the drop) has a real path, and the
 *    folder is referenced where it lies. The walk that follows only counts,
 *    for the card; nothing is uploaded and no limit applies.
 * 2. **A path hint.** A drag that carried a `file://` URL for the folder
 *    offers a path the Host checks by the folder's first files — their
 *    relative paths, sizes and mtimes — before it is referenced in place.
 * 3. **A copy.** Otherwise the folder is walked under the limits the Host
 *    announced, refused whole when it crosses one, and uploaded file by file
 *    into a batch that the Host publishes as one folder on commit.
 *
 * DOM-free apart from `fetch`, which is injected, so the whole ladder runs
 * under `node --test` over fake entries and a fake Host.
 * @module @crosery/dsh-drop/client/folder-acquire
 */
import { type FolderLimit, type FolderLimits, type FolderSummary, type StageErr } from '../contract.ts';
import { type EntryLike, type WalkableFile } from '../folder.ts';
import type { Acquisition, Fetcher } from './acquire.ts';
/** How far a folder copy is. */
export interface FolderProgress {
    done: number;
    total: number;
    bytes: number;
    totalBytes: number;
}
/** What became of one folder. */
export type FolderOutcome = {
    ok: true;
    /** Absolute path of the folder, without a trailing separator. */
    path: string;
    how: Acquisition;
    summary: FolderSummary;
    /** Relative paths of its first files. */
    listing: string[];
}
/** Refused whole: it crossed a limit. */
 | {
    ok: false;
    reason: 'over-limit';
    limit: FolderLimit;
    limits: FolderLimits;
}
/** Nothing in it could be sent. */
 | {
    ok: false;
    reason: 'empty';
    summary: FolderSummary;
};
/** The part of a browser file a folder copy reads. */
export type FolderFile = WalkableFile & {
    readonly name?: string;
};
/**
 * Count a folder that is referenced in place, for its card.
 *
 * Nothing depends on the answer — the folder is already referenced — so the
 * count stops at the default file ceiling and says it did, and the default
 * ignore list keeps it out of dependency trees.
 * @param root - the folder's entry.
 * @param signal - cancellation.
 * @returns the summary and the first paths.
 */
export declare function countFolder<F extends WalkableFile>(root: EntryLike<F>, signal: AbortSignal): Promise<{
    summary: FolderSummary;
    listing: string[];
}>;
/** A refused request, carrying the Host's reason. */
export declare class HostRefusal extends Error {
    readonly status: number;
    readonly body: Partial<StageErr>;
    constructor(status: number, body: Partial<StageErr>);
}
/**
 * Get a readable path for one dropped folder that has no bridge path.
 * @param root - the folder's entry, read during the drop.
 * @param name - the folder's name.
 * @param hints - absolute paths decoded from the drag's `text/uri-list`.
 * @param signal - cancellation: the card's removal or plugin teardown.
 * @param onProgress - called as files upload.
 * @param http - the request function; `fetch` by default.
 * @returns the outcome.
 * @throws when the Host could not be reached or refused for another reason.
 */
export declare function acquireFolder<F extends FolderFile>(root: EntryLike<F>, name: string, hints: readonly string[], signal: AbortSignal, onProgress: (progress: FolderProgress) => void, http?: Fetcher): Promise<FolderOutcome>;
