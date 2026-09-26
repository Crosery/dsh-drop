/**
 * Browser half: take every file drop and paste, and give each one the path it
 * should take.
 *
 * This plugin occupies the composer's attachment seat, which took the shipped
 * entry's drop listeners down with it, so its own listeners are the only ones
 * left. They sit on `document` in CAPTURE phase and stop the transfer there.
 * Each transfer is routed to the composer it landed on (the page can hold
 * more than one) and split:
 *
 * - **Images** the composer encodes natively (PNG, JPEG, WebP, GIF) go to that
 *   composer's own validated intake, and become ordinary image attachments.
 * - **Every other file** is acquired as a path — referenced in place when the
 *   desktop app or the drag itself vouches for one, copied to the Host
 *   otherwise — and held beside the draft as a staged reference, never
 *   written into it. `submit-guard.ts` appends the mentions as the message is
 *   sent, so a dropped file leaves the text box exactly as the user typed it.
 * - **Folders** become one reference each, `@/path/to/folder/`: referenced in
 *   place when the desktop app or the drag vouches for a path, otherwise
 *   walked and copied to the Host with their structure (`folder-acquire.ts`).
 *   Images inside a folder travel with the folder, not as image attachments.
 *
 * Drop and paste are the same operation behind two gestures: both carry a
 * `DataTransfer`, both are claimed by the same rule, and both end in the same
 * pipeline. Only the event plumbing differs.
 * @module @crosery/dsh-drop/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type DroppedEntry } from '../contract.ts';
export { createOverlay } from './overlay.ts';
export type { Overlay, OverlayState } from './overlay.ts';
export { createToast } from './toast.ts';
export { messages } from './messages.ts';
export type { Messages } from './messages.ts';
export { installReferenceFit } from './reference-fit.ts';
export { installDropStyles } from './styles.ts';
export { installPreviewRail } from './rail-entry.ts';
export type { RailDeps } from './rail-entry.ts';
export { AttachedFiles, composeSubmission } from './attached.ts';
export type { AttachedFile, AttachedInput, AttachedKind, AttachedStatus } from './attached.ts';
export { installSubmitGuard, isSendKey } from './submit-guard.ts';
export type { SubmitGuardDeps } from './submit-guard.ts';
export { appendMentions, composerFace, snapshotOf, withdrawMentions, } from './composer-face.ts';
export type { Appended, ComposerFace, ComposerParts, InputSnapshot } from './composer-face.ts';
export { acceptsSubmission, appendSpan, detectEnd, insertedSpan, isLexicalSendKey, isModifiedSendKey, lexicalEnterVerdict, mentionBlock, primaryRoleOf, sendButtonVerdict, sendObserved, } from './send-plan.ts';
export type { ComposerFacts, KeyFacts, PrimaryRole, SendVerdict } from './send-plan.ts';
export { RailRegistry } from './registry.ts';
export type { RailRecord, RailRoute } from './registry.ts';
export { PreviewStore } from './preview-store.ts';
export type { DropAsset } from './preview-store.ts';
export { DropRail } from './DropRail.tsx';
export type { DropRailInjected, DropRailProps, RailHandle, SeatAttachment, SeatUpload, SessionAccess, SessionInputLike, } from './DropRail.tsx';
export { DropLightbox, usePreviewText } from './DropLightbox.tsx';
export type { DropLightboxProps } from './DropLightbox.tsx';
export { DROP_NS, en, zh } from './locales.ts';
export type { DropKey } from './locales.ts';
export { acquire, bridgePath, hintFor, hostPathBridge } from './acquire.ts';
export type { Acquired, Acquisition, HostPathBridge } from './acquire.ts';
export { EntryJobs, linked, stageFiles } from './staging-jobs.ts';
export type { StageFilesDeps } from './staging-jobs.ts';
export { acquireFolder, countFolder, HostRefusal } from './folder-acquire.ts';
export type { FolderOutcome, FolderProgress } from './folder-acquire.ts';
export { listingOf, sampleOf, walkFolder } from '../folder.ts';
export type { EntryLike, ReaderLike, WalkedFile, WalkOptions, WalkResult } from '../folder.ts';
export { claimsTransfer as claimsTransferShape, fileNameOf, freshFiles, mentionFor, pasteTextIsFileNames, planDrop, uriListPaths, } from '../contract.ts';
export type { DropPlan, DroppedEntry, StagedCandidate, TransferShape } from '../contract.ts';
export { dropKindOf, extensionOf, formatDropBytes, kindBadge, looksBinary, mediaTypeFor, } from '../preview.ts';
export type { DropKind } from '../preview.ts';
export declare const name = "@crosery/dsh-drop";
/**
 * Whether this plugin claims a transfer.
 * @param transfer - the transfer's DataTransfer, possibly null.
 * @returns true when it carries at least one file.
 */
export declare function claimsTransfer(transfer: DataTransfer | null): boolean;
/**
 * Read transfer entries while the DataTransfer is still valid.
 *
 * `getAsFile()`, `webkitGetAsEntry()` and the desktop bridge's `pathFor` are
 * all called synchronously inside the event handler — the item list is
 * neutered as soon as the handler yields, so a single `await` before this runs
 * loses the whole transfer.
 * @param transfer - the drop or paste DataTransfer.
 * @returns entries in transfer order.
 */
export declare function readEntries(transfer: DataTransfer): DroppedEntry<File, FileSystemEntry>[];
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
 * Mount the capture-phase transfer handling.
 * @param ctx - browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
