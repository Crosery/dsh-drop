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

import { useCallback, useEffect, useRef, useState } from 'react'

/** Sub-pixel slack: a rail scrolled to its end can land a fraction short. */
const EPSILON = 1

/** Smallest page step, so a very narrow rail still advances usefully. */
const MIN_STEP = 200

/** One card's worth of context is kept visible across a page. */
const OVERLAP = 74

/** Which edges of the rail have content beyond them, plus the pager. */
export interface RailOverflow {
  /** Attach to the scrolling element. */
  ref: (element: HTMLDivElement | null) => void
  /** Whether content is hidden to the left. */
  atStart: boolean
  /** Whether content is hidden to the right. */
  atEnd: boolean
  /** Page the rail one viewport in the given direction. */
  page: (direction: -1 | 1) => void
}

/**
 * Track a horizontally scrolling rail's overflow state.
 * @param count - how many cards the rail holds; a change re-measures.
 * @returns the ref to attach, the two edge flags, and the pager.
 */
export function useRailOverflow(count: number): RailOverflow {
  const railRef = useRef<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const measure = useCallback(() => {
    const rail = railRef.current
    if (rail === null) return
    const max = rail.scrollWidth - rail.clientWidth
    setEdges({ start: rail.scrollLeft > EPSILON, end: rail.scrollLeft < max - EPSILON })
  }, [])

  const ref = useCallback((element: HTMLDivElement | null) => {
    railRef.current = element
    measure()
  }, [measure])

  useEffect(() => {
    const rail = railRef.current
    if (rail === null) return
    measure()
    rail.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined
    observer?.observe(rail)
    return () => {
      rail.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [measure, count])

  const page = useCallback((direction: -1 | 1) => {
    const rail = railRef.current
    if (rail === null) return
    const step = Math.max(MIN_STEP, rail.clientWidth - OVERLAP)
    const smooth = typeof window.matchMedia === 'function'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    rail.scrollBy({ left: step * direction, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  return { ref, atStart: edges.start, atEnd: edges.end, page }
}
