/**
 * The composer of the early trains, as the dock rail meets it.
 *
 * On 0.0.1-rc.5 and 0.1.0-rc.2 through rc.7 (as released) the rail sits in
 * `conversation.input.dock` rather than in the attachment seat (see
 * `rail-seats.ts`), so it gets none of the seat's owner verbs. What it gets
 * instead is the dock's owner share — the session and input snapshots — and
 * the session's standard kit, and from those it assembles what the seat
 * would have handed it:
 *
 * - **Images** go to the composer's own draft images, through the public
 *   pair the composer itself uses: `conversation.createDraftImages(files)`
 *   and `inputActions.addImages(ids)`. The composer's strip inside the card
 *   renders them, as it always has; the rail does not draw them a second
 *   time. The composer checks its limits in its drop handler, before that
 *   pair, so the same checks run here, in the same order, against the same
 *   `imageLimits` projection.
 * - **Whether a drop is taken** mirrors the composer's `canAcceptDrop`: not on
 *   a removed session, not on a subagent whose parent is offline, not while a
 *   submission is being adjudicated or sent.
 *
 * DOM-free: every read is structural, and the intake takes plain functions.
 * @module @crosery/dsh-drop/client/early-composer
 */
import { type FileSignature } from '../contract.ts';
/** The image limits a drop invitation repeats. */
export interface DropLimits {
    readonly count: number;
    readonly size: string;
}
/** The composer's image limits, as the `imageLimits` projection publishes them. */
export interface ImageLimits {
    /** MIME types the Host serializes as images. */
    readonly mediaTypes: readonly string[];
    readonly maxImagesPerMessage: number;
    readonly maxImageBytes: number;
    readonly maxMessageImageBytes: number;
}
/**
 * Read the `imageLimits` projection.
 * @param raw - the projection value.
 * @returns the limits, or undefined while unknown or unrecognizable.
 */
export declare function imageLimitsOf(raw: unknown): ImageLimits | undefined;
/**
 * The limits the drop invitation shows.
 * @param limits - the composer's image limits.
 * @returns count and display size, or undefined while unknown.
 */
export declare function dropLimitsOf(limits: ImageLimits | undefined): DropLimits | undefined;
/** A file as the intake reads it. */
export interface ImageFile extends FileSignature {
    readonly type: string;
}
/** One draft image the composer holds. */
export interface DraftImage<F> {
    readonly id: string;
    readonly file: F;
}
/** Why the composer did not take a batch of images. */
export type ImageRefusal = 
/** A type the Host does not take as an image. */
'type'
/** The draft would hold more than `maxImagesPerMessage`. */
 | 'count'
/** One image is larger than `maxImageBytes`. */
 | 'size'
/** The draft's images would exceed `maxMessageImageBytes` together. */
 | 'total'
/** The composer is mid-submission, or offers no image intake at all. */
 | 'busy';
/** What the intake reaches. */
export interface ImageIntake<F extends ImageFile> {
    /** The composer's limits; undefined while the projection is unknown. */
    readonly limits: ImageLimits | undefined;
    /** The images the draft already holds. */
    held(): readonly F[];
    /**
     * Register files as draft images (`conversation.createDraftImages`).
     * Throws on a type it refuses; undefined when the service offers none.
     */
    create(files: readonly F[]): readonly DraftImage<F>[] | undefined;
    /** Append ids to the draft (`inputActions.addImages`); false while busy. */
    add(ids: readonly string[]): boolean;
    /** Let created images go again (`conversation.releaseDraftImages`). */
    release(images: readonly DraftImage<F>[]): void;
}
/** An intake's answer: how many images went in, or why none did. */
export type ImageIntakeResult = {
    readonly added: number;
} | {
    readonly refused: ImageRefusal;
};
/**
 * Hand a batch of images to the composer's draft.
 *
 * Files the draft already holds (same name, size and modification time) are
 * skipped first, as the seat's intake does on later trains. The batch then
 * passes the composer's own checks in its own order — type, count, size,
 * total — and goes in whole or not at all, which is what the composer's drop
 * handler does.
 * @param intake - the composer's side.
 * @param files - the dropped images, in order.
 * @returns the count added, or the refusal.
 */
export declare function intakeImages<F extends ImageFile>(intake: ImageIntake<F>, files: readonly F[]): ImageIntakeResult;
/**
 * The conversation service's draft-image members the early trains publish
 * (`createDraftImages`, `draftImages`, `releaseDraftImages`), each answering
 * nothing when the running service lacks it.
 */
export interface DraftImages<F> {
    /** Register files as draft images; throws on a type the composer refuses. */
    create(files: readonly F[]): readonly DraftImage<F>[] | undefined;
    /** The draft images behind a list of ids, in order. */
    held(ids: readonly string[]): readonly DraftImage<F>[];
    /** Let draft images go that never made it into a draft. */
    release(images: readonly DraftImage<F>[]): void;
}
/**
 * Append draft image ids through the session's action face.
 * @param actions - the standard kit's `inputActions`.
 * @param ids - the ids to append.
 * @returns true when the composer took them; false while busy or absent.
 */
export declare function addToDraft(actions: unknown, ids: readonly string[]): boolean;
/**
 * Whether the composer takes a drop now, read off the dock's owner share.
 *
 * The composer's own rule: not a removed session, not a continuable subagent
 * whose parent is offline, not while a submission is in flight.
 * @param session - the session snapshot.
 * @param input - the input snapshot.
 * @returns true when a drop may land.
 */
export declare function acceptsDrop(session: unknown, input: unknown): boolean;
/**
 * The draft's image ids, off the input snapshot.
 * @param input - the input snapshot.
 * @returns the ids in draft order; empty when the train publishes none.
 */
export declare function draftImageIds(input: unknown): readonly string[];
