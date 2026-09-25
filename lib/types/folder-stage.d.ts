/**
 * The folder batch: a dropped folder copied to the Host with its structure.
 *
 * A folder that has no path the Host can read — dropped into a browser, which
 * never reveals one — reaches the model only as a copy. Copying it file by
 * file through the single-file route would flatten it; this route keeps the
 * tree. The browser opens a batch, sends each file through the staging route
 * with the batch id and the file's path inside the folder, and commits. Only
 * then does the folder appear under the staging root, whole, under a name
 * nothing else holds:
 *
 * - `begin` makes a private directory (`drops/DAY/.batch-<uuid>/`) and
 *   answers with a random id — the capability for that directory alone — and
 *   the limits the batch runs under;
 * - each file's relative path is re-sanitized here, never trusted
 *   ({@link safeRelativeSegments}), joined under the private tree, checked to
 *   still be inside it, and published without replacing anything;
 * - the per-file ceiling and the folder's file, byte and depth ceilings are
 *   enforced on what actually arrives; crossing one refuses the whole batch
 *   and removes it, because a folder copied in part would mislead the model;
 * - `commit` claims the final name with an exclusive `mkdir` and renames the
 *   tree onto that claim, so a reader either never learns the path or sees
 *   the whole folder;
 * - `abort`, an idle timeout and plugin disposal remove a batch that will
 *   never commit.
 * @module @crosery/dsh-drop/folder-stage
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type FolderLimits } from './contract.ts';
import { type BatchReceiver, type RequestRejection } from './stage-route.ts';
/** Runtime knobs of the batch route. */
export interface BatchOptions {
    /** Absolute staging root. */
    root: () => string;
    /** The limits a new batch runs under, read at `begin`. */
    limits: () => FolderLimits;
    /** Clock, injected so tests do not depend on the wall clock. */
    now?: () => number;
    /** Idle time after which a batch is removed. */
    idleMs?: number;
    /** Most batches open at once. */
    maxOpen?: number;
    /** Apply the Windows name rules; the running platform by default. */
    win32?: boolean;
    /** Sweep interval for idle batches; 0 sweeps only when a request arrives. */
    sweepEveryMs?: number;
    /** The Host's admission check, when the running harness has one. */
    reject?: RequestRejection | undefined;
}
/** The batch route and the batch-file receiver, sharing one set of open batches. */
export interface BatchStore extends BatchReceiver {
    /** Handler of {@link BATCH_ROUTE}: `limits`, `begin`, `commit`, `abort`. */
    handler(req: IncomingMessage, res: ServerResponse): Promise<void>;
    /** Remove batches idle past the timeout. */
    sweep(): Promise<void>;
    /** Remove every open batch; the store answers nothing afterwards. */
    dispose(): Promise<void>;
    /** How many batches are open. */
    open(): number;
}
/**
 * Publish an assembled folder under a name nothing else holds.
 *
 * The name is claimed with an exclusive `mkdir` — the directory analogue of
 * the `link` the single-file route publishes with — and the tree is renamed
 * onto that empty claim, which POSIX `rename` replaces. A claim somebody else
 * wrote into in between refuses the rename, and the next name is tried. On
 * Windows, where `rename` will not replace a directory at all, the empty
 * claim is removed first.
 * @param tree - the assembled folder.
 * @param dir - the directory to publish into.
 * @param name - the sanitized folder name.
 * @returns the published absolute path.
 */
export declare function publishDirectory(tree: string, dir: string, name: string): Promise<string>;
/**
 * Build the batch store.
 * @param opts - runtime knobs.
 * @returns the batch route handler and the batch-file receiver.
 */
export declare function batchStore(opts: BatchOptions): BatchStore;
