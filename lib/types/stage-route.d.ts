/**
 * The staging route: one dropped file in, one absolute path out.
 *
 * This is a write endpoint, which is a different security shape from the read
 * endpoints elsewhere in this workspace. A signed reference is the answer when
 * the caller names the path (`@crosery/dsh-viewer`'s asset route); here the
 * caller names nothing — the destination directory is fixed by configuration
 * and the browser only contributes a file name, which is reduced to a single
 * safe segment before it is joined. The resolved target is then re-checked
 * against the staging root, so a sanitizer bug degrades to a refusal rather
 * than to a write outside the directory.
 *
 * Bytes stream to a temporary file and are renamed into place only after the
 * body completes. A reader therefore either does not see the file or sees all
 * of it — never the first half of a video the browser was still uploading.
 * @module @crosery/dsh-drop/stage-route
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Runtime knobs the route reads fresh on every request. */
export interface StageOptions {
    /** Absolute staging root; re-read per request so a settings edit takes effect live. */
    root: () => string;
    /** Per-file ceiling in bytes. */
    maxBytes: () => number;
    /** Clock, injected so tests do not depend on the wall clock. */
    now?: () => number;
}
/**
 * Read the file name the browser declared.
 *
 * The header is URI-encoded because a file name is arbitrary Unicode and HTTP
 * header values are not. A malformed encoding is not worth refusing over — the
 * sanitizer's fallback name is a better outcome than a failed drop.
 * @param req - the request.
 * @returns a single safe path segment.
 */
export declare function requestedName(req: IncomingMessage): string;
/** Publish complete bytes atomically; link refuses an existing target. */
export declare function publishStage(temp: string, dir: string, name: string): Promise<string>;
/**
 * Whether a resolved target is inside the staging root.
 *
 * Defense in depth behind {@link safeStageName}: the sanitizer is what makes
 * traversal impossible, and this is what makes a sanitizer bug harmless.
 * @param root - absolute staging root.
 * @param target - absolute candidate path.
 * @returns true when target is root or below it.
 */
export declare function insideRoot(root: string, target: string): boolean;
/**
 * Build the staging request handler.
 * @param opts - runtime knobs.
 * @returns a node:http handler owning the full response lifecycle.
 */
export declare function stageHandler(opts: StageOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
