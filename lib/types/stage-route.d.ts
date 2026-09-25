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
/**
 * The Host's own admission check for a raw Web route, when it has one.
 *
 * From 0.1.2 the harness can gate a Web route itself with
 * `connection.requestRejection(req)`: its Host/Origin fence and its
 * login-cookie authentication. Routes registered straight on `webServer` are
 * otherwise open to any local caller. 0.1.0 and 0.1.1 have no such check, and
 * the callback answers undefined there.
 * @param req - the request.
 * @returns 401 or 403 to refuse, undefined to admit.
 */
export type RequestRejection = (req: IncomingMessage) => number | undefined;
/**
 * Answer a request the Host's admission check refused, if it did.
 * @param reject - the admission check, when the Host has one.
 * @param req - the request.
 * @param res - the response, owned when the answer is true.
 * @returns true when the request was refused and answered.
 */
export declare function refused(reject: RequestRejection | undefined, req: IncomingMessage, res: ServerResponse): boolean;
/**
 * Whether Fetch Metadata marks a request as coming from another site.
 *
 * Absent is admitted: non-browser clients never send it, and the desktop
 * app's protocol forwarder strips it before the request reaches the Host.
 * @param req - the request.
 * @returns true when the browser declared a cross-origin caller.
 */
export declare function crossSite(req: IncomingMessage): boolean;
/**
 * Whether a request body is declared as JSON.
 *
 * `application/json` is not a CORS-safelisted type, so a cross-site page can
 * only send it after a preflight these routes never grant: requiring it keeps
 * a no-cors form post from reaching the handler.
 * @param req - the request.
 * @returns true for an `application/json` body.
 */
export declare function declaresJson(req: IncomingMessage): boolean;
/** The one value of a request header, when it was sent exactly once. */
export declare function headerOf(req: IncomingMessage, name: string): string | undefined;
/** Where a file that belongs to a folder batch is handed. */
export interface BatchReceiver {
    /**
     * Take one batch file's request, owning the full response.
     * @param req - the upload.
     * @param res - its response.
     * @param id - the batch the request names.
     */
    receive(req: IncomingMessage, res: ServerResponse, id: string): Promise<void>;
}
/** Runtime knobs the route reads fresh on every request. */
export interface StageOptions {
    /** Absolute staging root; re-read per request so a settings edit takes effect live. */
    root: () => string;
    /** Per-file ceiling in bytes. */
    maxBytes: () => number;
    /** Clock, injected so tests do not depend on the wall clock. */
    now?: () => number;
    /** The Host's admission check, when the running harness has one. */
    reject?: RequestRejection | undefined;
    /** Folder batches; a request naming one is handed there. */
    batches?: BatchReceiver | undefined;
}
/**
 * Answer with a JSON body and no cache.
 * @param res - the response.
 * @param status - HTTP status.
 * @param body - payload.
 */
export declare function sendJson(res: ServerResponse, status: number, body: object): void;
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
