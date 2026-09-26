/**
 * Which seat the rail takes on the running harness.
 *
 * From 0.1.0-rc.8 the composer bar declares `conversation.input.attachments`,
 * a seat inside the composer card, and the rail takes it. The trains before
 * it — 0.0.1-rc.5 and 0.1.0-rc.2 through rc.7, as released — never declare
 * that seat: their composer draws its own image strip inside the card, and a
 * registration waiting on the seat waits forever. What those trains do
 * declare is `conversation.input.dock`, the full-width row stacked directly
 * above the composer card (the queue and todo strips live there), and that is
 * where the rail goes instead. The seat's alternatives are worse: the input
 * overlay is a zero-height anchor meant for popovers, and the left/right
 * slots are single controls in the tool row.
 *
 * Which one applies is read from the declarations, never from a version: an
 * early harness installed today resolves its caret dependencies to 0.1.0-rc.8
 * packages and does declare the seat. The two slots are declared by different
 * `register` calls (the dock by the conversation root, the seat by the
 * composer bar), in an order that differs between trains, so no single moment
 * can decide. Instead both entries are registered wherever their slot exists,
 * and the dock entry renders only while no seat is declared — exactly one
 * rail per composer on every train.
 *
 * DOM-free, so the rule can be pinned against a model of each train's
 * declarations.
 * @module @crosery/dsh-drop/client/rail-seats
 */
/** The seat inside the composer card (0.1.0-rc.8 onward). */
export declare const SEAT_SLOT = "conversation.input.attachments";
/** The row above the composer card, on every train. */
export declare const DOCK_SLOT = "conversation.input.dock";
/** Where one rail mount sits: in the attachment seat, or in the dock. */
export type RailPlacement = 'seat' | 'dock';
/**
 * The element a mount answers for, as a selector from the mount outward.
 *
 * A seat mount lives inside the composer card, so the card is its composer.
 * A dock mount lives beside the card, so its composer is the whole composer
 * seat (`data-composer-seat`, one per conversation): the dock rows, the card,
 * and the rail itself — a drop onto the rail's own cards lands on it too.
 */
export declare const REGION_SELECTOR: Readonly<Record<RailPlacement, string>>;
/**
 * Whether the attachment seat is declared right now, observably.
 *
 * Counted rather than flagged: a composer bar that re-registers can declare
 * the seat again before the previous declaration's disposer has run, and a
 * boolean would be cleared by the older disposer while the newer seat stands.
 */
export declare class SeatWatch {
    private live;
    private readonly listeners;
    /** Whether some composer declares the attachment seat. */
    declared(): boolean;
    /**
     * Record one declaration of the seat.
     * @returns the disposer, which retracts exactly this declaration.
     */
    mark(): () => void;
    /**
     * Follow the declaration state.
     * @param listener - called after every change.
     * @returns the unsubscribe function.
     */
    subscribe(listener: () => void): () => void;
    private changed;
}
/**
 * The slot service's declaration hook, as far as this wiring uses it.
 *
 * The key is a plain string: the early trains' SlotMap has no key for the
 * seat, and waiting on a slot that is never declared is exactly the answer
 * wanted there.
 */
export interface SlotDeclarations {
    /**
     * Run `callback` for each lifetime of a slot's declaration: at once when it
     * is declared, otherwise when it gets declared; its disposer runs when the
     * declaration goes.
     */
    inject(key: string, callback: () => () => void): () => void;
}
/** The two registrations, each answering its disposer. */
export interface RailRegistrations {
    /** The rail in the attachment seat. */
    seat: () => () => void;
    /** The rail in the dock, which renders only while {@link SeatWatch.declared} is false. */
    dock: () => () => void;
}
/**
 * Register the rail into whichever slots the harness declares.
 * @param slots - the slot service.
 * @param watch - the seat's declaration state, which the dock entry reads.
 * @param register - the two registrations.
 */
export declare function wireRailSeats(slots: SlotDeclarations, watch: SeatWatch, register: RailRegistrations): void;
