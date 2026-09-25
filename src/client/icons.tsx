/**
 * The rail's glyphs, drawn inline.
 *
 * The primitives package renames its icons between harness trains — the
 * size-suffixed `IconCloseOutline16` of 0.1.1–0.1.5 is `IconCloseOutline` /
 * `…Regular` / `…Medium` on 0.1.7 — and a missing export is `undefined` at
 * runtime, which React refuses the moment a card renders. A handful of paths
 * drawn here remove that cross-train dependency entirely: the bundle requires
 * nothing from the primitives module, so no rename can reach it.
 * @module @crosery/dsh-drop/client/icons
 */

import type { ReactNode } from 'react'

/** Props every glyph takes. */
interface GlyphProps {
  /** Edge length in CSS pixels. */
  size?: number
}

/**
 * Wrap one set of paths in a decorative, currentColor SVG.
 * @param size - edge length.
 * @param children - the paths.
 * @returns the SVG element.
 */
function Svg({ size = 16, children }: { size?: number, children: ReactNode }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** A cross, for remove and close controls. */
export function CloseGlyph({ size }: GlyphProps): ReactNode {
  return (
    <Svg size={size}>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  )
}

/** A left chevron, for paging the rail back. */
export function ChevronLeftGlyph({ size }: GlyphProps): ReactNode {
  return (
    <Svg size={size}>
      <path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/** A right chevron, for paging the rail forward. */
export function ChevronRightGlyph({ size }: GlyphProps): ReactNode {
  return (
    <Svg size={size}>
      <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/** A play triangle, marking a video thumbnail. */
export function PlayGlyph({ size }: GlyphProps): ReactNode {
  return (
    <Svg size={size}>
      <path d="M5 3.2v9.6a.6.6 0 00.9.5l7.4-4.8a.6.6 0 000-1L5.9 2.7a.6.6 0 00-.9.5z" fill="currentColor" />
    </Svg>
  )
}

/** A circular arrow, for retrying a failed upload. */
export function RetryGlyph({ size }: GlyphProps): ReactNode {
  return (
    <Svg size={size}>
      <path
        d="M13 8a5 5 0 11-1.46-3.54M13 3v2.6h-2.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
