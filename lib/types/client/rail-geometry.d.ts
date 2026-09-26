/**
 * The rail's overflow geometry, with no React in reach.
 *
 * What the overflow hook (`use-rail-overflow.ts`) reads, and when it reads
 * it, kept apart from React so both can be tested without a DOM.
 * @module @crosery/dsh-drop/client/rail-geometry
 */
/**
 * Which edges of a horizontal scroller have content beyond them.
 * @param scrollLeft - the scroll offset.
 * @param scrollWidth - the content's width.
 * @param clientWidth - the visible width.
 * @returns whether content is hidden to the left and to the right.
 */
export declare function overflowEdges(scrollLeft: number, scrollWidth: number, clientWidth: number): {
    start: boolean;
    end: boolean;
};
/** The observers {@link watchRail} uses; the page's own by default. */
export interface RailObservers {
    ResizeObserver?: typeof ResizeObserver | undefined;
    MutationObserver?: typeof MutationObserver | undefined;
}
/**
 * Call `measure` whenever the rail's overflow can change: it scrolls, it or
 * any card in it changes size, or a card comes or goes.
 * @param rail - the scrolling element; its children are the cards.
 * @param measure - re-reads the geometry.
 * @param observers - the observer classes, where the page has them.
 * @returns the disposer.
 */
export declare function watchRail(rail: HTMLElement, measure: () => void, observers?: RailObservers): () => void;
