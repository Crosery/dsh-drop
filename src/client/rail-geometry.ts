/**
 * The rail's overflow geometry, with no React in reach.
 *
 * What the overflow hook (`use-rail-overflow.ts`) reads, and when it reads
 * it, kept apart from React so both can be tested without a DOM.
 * @module @crosery/dsh-drop/client/rail-geometry
 */

/** Sub-pixel slack: a rail scrolled to its end can land a fraction short. */
const EPSILON = 1

/**
 * Which edges of a horizontal scroller have content beyond them.
 * @param scrollLeft - the scroll offset.
 * @param scrollWidth - the content's width.
 * @param clientWidth - the visible width.
 * @returns whether content is hidden to the left and to the right.
 */
export function overflowEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): { start: boolean, end: boolean } {
  const max = scrollWidth - clientWidth
  return { start: scrollLeft > EPSILON, end: scrollLeft < max - EPSILON }
}

/** The observers {@link watchRail} uses; the page's own by default. */
export interface RailObservers {
  ResizeObserver?: typeof ResizeObserver | undefined
  MutationObserver?: typeof MutationObserver | undefined
}

/**
 * Call `measure` whenever the rail's overflow can change: it scrolls, it or
 * any card in it changes size, or a card comes or goes.
 * @param rail - the scrolling element; its children are the cards.
 * @param measure - re-reads the geometry.
 * @param observers - the observer classes, where the page has them.
 * @returns the disposer.
 */
export function watchRail(
  rail: HTMLElement,
  measure: () => void,
  observers: RailObservers = globalThis,
): () => void {
  rail.addEventListener('scroll', measure, { passive: true })
  const Resize = observers.ResizeObserver
  const resize = typeof Resize === 'function' ? new Resize(measure) : undefined
  if (resize !== undefined) {
    resize.observe(rail)
    for (const card of Array.from(rail.children)) resize.observe(card)
  }
  // Cards come and go without the rail changing size; each new one is watched
  // too, and a departure re-measures.
  const Mutation = observers.MutationObserver
  const mutations = typeof Mutation === 'function'
    ? new Mutation((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) if (node.nodeType === 1) resize?.observe(node as Element)
        for (const node of Array.from(record.removedNodes)) if (node.nodeType === 1) resize?.unobserve(node as Element)
      }
      measure()
    })
    : undefined
  mutations?.observe(rail, { childList: true })
  return () => {
    rail.removeEventListener('scroll', measure)
    resize?.disconnect()
    mutations?.disconnect()
  }
}
