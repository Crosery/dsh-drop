/**
 * Browser half: take the file drops and pastes the shipped composer refuses.
 *
 * The shipped drag handling lives on `document` in bubble phase and forwards
 * every dropped file to the image path, which throws
 * `UnsupportedImageMediaTypeError` on anything that is not PNG/JPEG/WebP/GIF.
 * This plugin's listeners run in CAPTURE phase, so they see the same events
 * first and can call `stopPropagation()` to keep the shipped handler out of a
 * transfer it would only reject. Transfers this plugin does not claim — every
 * file an image the composer accepts — pass through untouched.
 *
 * Drop and paste are the same operation behind two gestures: both carry a
 * `DataTransfer`, both are claimed by the same rule, and both end in the same
 * pipeline. Only the event plumbing differs.
 *
 * A mixed transfer is split rather than taken whole: the image members go to
 * the composer's own validated intake, and the rest are acquired and staged —
 * held beside the draft, never written into it, so a dropped file leaves the
 * text box exactly as the user typed it. `submit-guard.ts` splices their paths
 * into the message as it is sent.
 * @module @crosery/dsh-drop/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type DroppedEntry } from '../contract.ts';
import { AttachedFiles } from './attached.ts';
import { type Acquired } from './acquire.ts';
export { createOverlay } from './overlay.ts';
export { messages } from './messages.ts';
export type { Messages } from './messages.ts';
export { installReferenceFit } from './reference-fit.ts';
export { installDropStyles } from './styles.ts';
export { composerBridge, imageIntakeBridge, installPreviewRail } from './rail-entry.ts';
export type { ComposerBridge, ImageIntakeBridge } from './rail-entry.ts';
export { AttachedFiles, composeSubmission } from './attached.ts';
export type { AttachedFile } from './attached.ts';
export { installSubmitGuard, isSendKey } from './submit-guard.ts';
export type { ComposerHandle } from './submit-guard.ts';
export { PreviewStore } from './preview-store.ts';
export type { DropAsset } from './preview-store.ts';
export { DropRail } from './DropRail.tsx';
export type { DropRailInjected, DropRailProps } from './DropRail.tsx';
export { DropLightbox, usePreviewText } from './DropLightbox.tsx';
export type { DropLightboxProps } from './DropLightbox.tsx';
export { DROP_NS, en, zh } from './locales.ts';
export type { DropKey } from './locales.ts';
export { acquire, hintFor } from './acquire.ts';
export type { Acquired, Acquisition } from './acquire.ts';
export { claimsFileTypes, fileNameOf, mentionFor, planDrop, uriListPaths } from '../contract.ts';
export type { DropPlan, DroppedEntry } from '../contract.ts';
export { dropKindOf, extensionOf, formatDropBytes, kindBadge, looksBinary, mediaTypeFor, } from '../preview.ts';
export type { DropKind } from '../preview.ts';
export declare const name = "@crosery/dsh-drop";
/**
 * Whether this plugin claims a transfer.
 *
 * Read from `items` rather than `files` because during `dragover` the browser
 * withholds file contents and names but still exposes each item's `kind` and
 * MIME type — which is exactly and only what this decision needs. A file with
 * no type the OS could guess arrives as the empty string, which is not an
 * accepted image type, so it is claimed. That is the right answer: the shipped
 * path would have refused it too.
 * @param transfer - the transfer's DataTransfer, possibly null.
 * @returns true when at least one member is not a composer-acceptable image.
 */
export declare function claimsTransfer(transfer: DataTransfer | null): boolean;
/**
 * Read transfer entries while the DataTransfer is still valid.
 *
 * Both `getAsFile()` and `webkitGetAsEntry()` must be called synchronously
 * inside the event handler — the item list is neutered as soon as the handler
 * yields, so a single `await` before this runs loses the whole transfer.
 * @param transfer - the drop or paste DataTransfer.
 * @returns entries in transfer order.
 */
export declare function readEntries(transfer: DataTransfer): DroppedEntry<File>[];
/**
 * Read the path hints a transfer carries, if any.
 *
 * Must also run synchronously: `getData` on a neutered DataTransfer returns the
 * empty string, which is indistinguishable from a transfer that never carried
 * the flavor at all.
 * @param transfer - the drop or paste DataTransfer.
 * @returns absolute paths in list order; empty when the platform withheld them.
 */
export declare function readHints(transfer: DataTransfer): string[];
/**
 * Stage acquired paths against a session, outside the draft.
 *
 * This is where the plugin stopped writing into the composer. A reference used
 * to be spliced into the draft as an occurrence, which is what left a marker in
 * the text box — an occurrence must span at least one character, because that
 * span is what the submit transaction expands into the absolute path.
 *
 * Held here instead, the path costs the draft nothing and is spliced in by
 * `submit-guard.ts` at the moment the message is sent. That mirrors how images
 * already work: `imageIds` is a list beside the draft, not inside it.
 * @param attached - the staging list.
 * @param sessionId - the session the drop belongs to.
 * @param acquired - acquired files, in transfer order.
 * @returns how many files were staged.
 */
export declare function stageReferences(attached: AttachedFiles, sessionId: string, acquired: readonly Acquired[]): number;
/**
 * Mount the capture-phase transfer handling.
 * @param ctx - browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
