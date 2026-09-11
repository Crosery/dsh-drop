/**
 * Two corrections to how the shipped UI renders `@` file references.
 *
 * Neither is this plugin's own markup — both are upstream's, and both affect
 * every reference in the app, including the ones the `@` completion menu
 * inserts. They live here because this plugin is what makes long paths common
 * enough to hit them daily.
 *
 * Both rules are attribute-keyed rather than class-keyed: the shipped class
 * names carry a build hash (`uV2eYG_chipIcon`, `gdEzaW_refChip`) that changes
 * on every upstream rebuild, while `data-decoration` and `data-ref-chip` are
 * written literally in the markup.
 *
 * **In the composer** the icon overhangs the glyph it decorates. Chips are
 * drawn on a mirror layer stacked behind the textarea, so every character must
 * occupy exactly the width it occupies in the real text or the line drifts out
 * of alignment. The shipped markup honors that — the `@` marker renders
 * transparent to reserve its advance width, with the domain icon absolutely
 * centered over it, out of flow — but the icon is emitted at a fixed 16 px,
 * which is wider than an `@` advance at any composer font size. It overhangs on
 * both sides and collides with the first character of the label; a monospace
 * composer font makes it obvious. `width: 100%` resolves against the marker's
 * own positioned box, which IS the `@` advance, so the icon is sized to its
 * slot by construction rather than by a number that the next font change would
 * invalidate. Being absolutely positioned, it contributes nothing to layout.
 *
 * **In the message history** a long reference overflows its bubble. The chip is
 * an `inline-flex` with `white-space: nowrap` and no width bound, so an 80-
 * character file name renders 720 px wide inside a 557 px bubble and spills
 * past its rounded corner into the page. The file name is a bare text node —
 * an anonymous flex item — so no selector can reach it; switching the chip to
 * `inline-block` puts the text in a box that `text-overflow` can act on, and
 * the name truncates with an ellipsis instead. Nothing is lost: the chip's
 * `title` already carries the full path.
 * @module @crosery/dsh-drop/client/reference-fit
 */
/**
 * Install both corrections for the document's lifetime.
 *
 * They apply to every reference in the app, not only the ones this plugin's
 * drops produce: the same markup backs the `@` completion menu's references,
 * and a fix that covered only dropped files would leave the UI inconsistent
 * with itself.
 * @returns a disposer removing the stylesheet.
 */
export declare function installReferenceFit(): () => void;
