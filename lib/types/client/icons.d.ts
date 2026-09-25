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
import type { ReactNode } from 'react';
/** Props every glyph takes. */
interface GlyphProps {
    /** Edge length in CSS pixels. */
    size?: number;
}
/** A cross, for remove and close controls. */
export declare function CloseGlyph({ size }: GlyphProps): ReactNode;
/** A left chevron, for paging the rail back. */
export declare function ChevronLeftGlyph({ size }: GlyphProps): ReactNode;
/** A right chevron, for paging the rail forward. */
export declare function ChevronRightGlyph({ size }: GlyphProps): ReactNode;
/** A play triangle, marking a video thumbnail. */
export declare function PlayGlyph({ size }: GlyphProps): ReactNode;
/** A circular arrow, for retrying a failed upload. */
export declare function RetryGlyph({ size }: GlyphProps): ReactNode;
export {};
