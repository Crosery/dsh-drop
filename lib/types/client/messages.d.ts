/**
 * Notice and overlay copy.
 *
 * Not registered with `ctx.locale`: these strings surface through
 * `SessionInput.notify`, a toast, or the plain-DOM drop overlay, none of which
 * takes a namespace key, so a dictionary registration would add a service
 * dependency without adding a capability. Two locales, matching the shipped
 * dictionaries.
 * @module @crosery/dsh-drop/client/messages
 */
import type { FolderLimit, FolderLimits } from '../contract.ts';
import type { ImageLimits, ImageRefusal } from './early-composer.ts';
/** The message set one locale supplies. */
export interface Messages {
    /** Some files could not be staged; the rest were. */
    failed: (count: number) => string;
    /** A folder crossed a copy limit and was not added. */
    folderOverLimit: (name: string, limit: FolderLimit, limits: FolderLimits) => string;
    /** A folder held nothing that could be sent. */
    folderEmpty: (name: string) => string;
    /** A folder could not be added for another reason. */
    folderFailed: (name: string) => string;
    /** No session is open, so there is nothing to hold the files against. */
    noSession: string;
    /** The composer under the drop is not taking files right now. */
    blocked: string;
    /** A send was held back while attachments are still uploading. */
    waiting: (count: number) => string;
    /** The staged mentions could not be added to the outgoing message. */
    attachFailed: string;
    /**
     * Dropped images the composer's limits refused. Raised only on the early
     * trains, where this plugin runs the composer's checks itself; the wording
     * is the composer's own.
     */
    imageRefused: (reason: ImageRefusal, limits: ImageLimits | undefined) => string;
    /** Overlay: the invitation. */
    overlayTitle: string;
    /** Overlay: what happens to each kind of file. */
    overlayDesc: string;
    /** Overlay: the image limits the composer enforces. */
    overlayLimits: (count: number, size: string) => string;
    /** Overlay: the composer under the pointer refuses the drop. */
    overlayBlockedTitle: string;
    /** Overlay: why, when there is no session at all. */
    overlayNoSession: string;
    /** Overlay: why, when the composer is busy or read-only. */
    overlayBusy: string;
}
/**
 * Resolve the message set for the document language.
 * @returns the copy set, defaulting to Chinese.
 */
export declare function messages(): Messages;
