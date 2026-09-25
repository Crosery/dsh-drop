/**
 * The resolve route: confirm that a path really is the file that was dropped.
 *
 * This is what keeps a copy from being the only outcome. When the drag carries
 * a `file://` URL — Finder and Explorer usually put one on `text/uri-list` —
 * the file already has a path the agent can read, and copying it into the
 * staging directory would leave the user referencing a stale duplicate of a
 * file they can still edit. So the browser's claim is checked and, if it holds,
 * the original path is referenced in place.
 *
 * The route only ever calls `stat`. It writes nothing, reads no bytes, and
 * returns nothing the caller did not already send — a path is echoed back only
 * when its size and modification time match what the caller claimed, so it
 * cannot be used to read a directory listing or a file's contents. It does
 * confirm existence for a fully-specified guess (path plus exact size plus
 * exact mtime), which is a far weaker oracle than the staging route beside it
 * already offers.
 *
 * A folder is claimed the same way, with its contents standing in for the
 * size and mtime a directory does not meaningfully have: the browser
 * describes up to {@link FOLDER_SAMPLE_SIZE} of the folder's files, and every
 * one of them has to be a regular file inside the claimed directory with that
 * size and mtime. A folder with fewer files has to be described completely.
 * Only then does the route look inside — a bounded walk that follows no link
 * — and answer counts, never names.
 * @module @crosery/dsh-drop/resolve-route
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type FolderSampleEntry, type FolderSummary, type ResolveRequest } from './contract.ts';
import { type RequestRejection } from './stage-route.ts';
/**
 * Read and parse the JSON claim.
 * @param req - the request.
 * @returns the claim, or undefined when the body is oversized or malformed.
 */
export declare function readClaim(req: IncomingMessage): Promise<ResolveRequest | undefined>;
/**
 * Whether a stat result matches the claim.
 * @param entry - size and mtime read from disk.
 * @param claim - what the browser said about the dropped file.
 * @returns true when the path is the same file.
 */
export declare function claimMatches(entry: {
    size: number;
    mtimeMs: number;
}, claim: ResolveRequest): boolean;
/** How a folder is looked into. */
export interface FolderRules {
    /** Base names skipped and counted. */
    ignore: readonly string[];
    /** Deepest level walked, in path segments below the folder. */
    maxDepth: number;
    /** Apply the Windows name rules to sample paths. */
    win32?: boolean | undefined;
    /** Most entries visited before the count stops, truncated. */
    maxEntries?: number | undefined;
    /** Most milliseconds spent before the count stops, truncated. */
    budgetMs?: number | undefined;
}
/**
 * Count what one directory holds, within bounds.
 *
 * Breadth-first over `readdir` entries, and links are counted, never
 * followed — a link back to an ancestor is one more entry, not a loop.
 * Names on the ignore list are counted and not opened. The walk stops at
 * the entry or time cap, or below the depth ceiling, and says so.
 * @param root - absolute directory path.
 * @param rules - ignore list and caps.
 * @returns the counts.
 */
export declare function summarizeDirectory(root: string, rules: FolderRules): Promise<FolderSummary>;
/**
 * Check a folder claim and, when it holds, count the folder.
 *
 * Every sampled file must be distinct, a regular file (not a link), resolve
 * inside the claimed directory, and match its claimed size and mtime. An
 * empty sample claims an empty folder, so the directory may hold nothing but
 * ignored names. And the sample must be as large as the folder allows: a
 * caller who knows one file cannot claim a folder of a thousand.
 * @param path - the claimed absolute directory.
 * @param sample - the claim's files.
 * @param rules - how the folder is looked into.
 * @returns the counts, or undefined when the claim does not hold.
 */
export declare function claimDirectory(path: string, sample: readonly FolderSampleEntry[], rules: FolderRules): Promise<FolderSummary | undefined>;
/** Runtime knobs of the resolve route. */
export interface ResolveOptions {
    /** The Host's admission check, when the running harness has one. */
    reject?: RequestRejection | undefined;
    /** How a claimed folder is looked into; read per request. */
    folder?: (() => FolderRules) | undefined;
}
/**
 * Build the resolve handler.
 * @param opts - the admission check.
 * @returns a node:http handler owning the full response lifecycle.
 */
export declare function resolveHandler(opts?: ResolveOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
