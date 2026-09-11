/**
 * Announcing that the rail has more cards than fit.
 *
 * The rail hides its scrollbar, which is what keeps a row of thumbnails from
 * looking like a form control — and which also means a clipped rail is
 * indistinguishable from a full one. The shipped attachment rail answers this
 * with edge arrows recomputed from scroll geometry, and a dropped-file rail
 * sitting in the same composer should answer it the same way rather than
 * inventing a second convention.
 *
 * Geometry is re-read on scroll, on card-count changes, and on rail resize —
 * a `ResizeObserver` rather than a window listener, because the composer also
 * narrows when the sidebar or the details panel opens, and neither of those
 * resizes the window.
 * @module @crosery/dsh-drop/client/use-rail-overflow
 */
/** Which edges of the rail have content beyond them, plus the pager. */
export interface RailOverflow {
    /** Attach to the scrolling element. */
    ref: (element: HTMLDivElement | null) => void;
    /** Whether content is hidden to the left. */
    atStart: boolean;
    /** Whether content is hidden to the right. */
    atEnd: boolean;
    /** Page the rail one viewport in the given direction. */
    page: (direction: -1 | 1) => void;
}
/**
 * Track a horizontally scrolling rail's overflow state.
 * @param count - how many cards the rail holds; a change re-measures.
 * @returns the ref to attach, the two edge flags, and the pager.
 */
export declare function useRailOverflow(count: number): RailOverflow;
