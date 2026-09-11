/**
 * The preview rail's stylesheet, mounted for exactly this plugin's lifetime.
 *
 * Plain prefixed class names rather than CSS Modules: the repository's module
 * pipeline is not published, so an out-of-tree package that wants a hashed
 * class map has to reproduce it. Every color is a `--dsw-*` semantic token, so
 * the rail follows the active palette with no theme branch of its own, and the
 * geometry reuses the `--dsh-composer-*` variables the shipped docks are laid
 * out with — that is what makes the rail line up with the composer card at
 * every width instead of at the one width it was measured at.
 *
 * The thumbnail metrics (64px box, 16px radius, 18px remove button in the
 * corner) are the shipped attachment rail's, restated rather than imported: a
 * dropped video should sit beside a dropped PNG and look like it belongs to
 * the same rail, and the shipped class names carry a build hash that changes
 * on every upstream rebuild.
 * @module @crosery/dsh-drop/client/styles
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * Mount the rail stylesheet for the owning plugin's lifetime.
 *
 * Guarded by an id lookup rather than a module-level flag: a hot replacement
 * re-runs the module but not the document, and a second identical tag would
 * accumulate on every reload.
 * @param ctx - owning plugin context.
 */
export declare function installDropStyles(ctx: Context): void;
