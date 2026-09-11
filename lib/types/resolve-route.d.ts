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
 * @module @crosery/dsh-drop/resolve-route
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type ResolveRequest } from './contract.ts';
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
/**
 * Build the resolve handler.
 * @returns a node:http handler owning the full response lifecycle.
 */
export declare function resolveHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
