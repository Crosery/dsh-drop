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

import type { Context } from '@deepseek-ai/cordis'

/** Style tag id, matching the convention the other client bundles use. */
const STYLE_ID = '@crosery/dsh-drop/preview-rail.css'

const SHEET = `
/* The rail sits INSIDE the composer card, in the seat the shipped image rail
   used to hold — so it needs no surface of its own, only the same inset the
   shipped strip had. */
.dshdrop-rail-wrap {
  position: relative;
  min-width: 0;
  padding: 4px 12px 0;
}

.dshdrop-rail {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.dshdrop-rail::-webkit-scrollbar { display: none; }

.dshdrop-item {
  position: relative;
  flex: none;
  height: 64px;
}

/* A hidden scrollbar keeps the rail from reading as a form control, and leaves
   a clipped rail indistinguishable from a full one. These are the shipped
   attachment rail's edge circles, which is the convention this composer
   already teaches. */
.dshdrop-arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin);
  border-radius: 999px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
  box-shadow: var(--dsw-shadow-lv2);
  cursor: pointer;
  transform: translateY(-50%);
}
.dshdrop-arrowLeft { left: 4px; }
.dshdrop-arrowRight { right: 4px; }
.dshdrop-arrow:hover { color: var(--dsw-alias-label-primary); }
.dshdrop-arrow:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
}

/* The thumbnail card: identical box to the shipped draft-image rail, so a
   dropped GIF or video sits beside a dropped PNG as one row of peers. */
.dshdrop-thumb {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin);
  border-radius: 16px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  cursor: zoom-in;
  overflow: hidden;
}
.dshdrop-thumb img,
.dshdrop-thumb video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* The identity card: a file with no visual preview still has a name, a format
   and a size, and those are what the user needs to confirm the right file is
   attached. */
.dshdrop-doc {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: max-content;
  min-width: 148px;
  max-width: 240px;
  height: 64px;
  padding: 0 12px 0 10px;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin);
  border-radius: 16px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dshdrop-doc:hover { border-color: var(--dsw-alias-border-l2); }
/* Drawn as a page rather than given an icon: the extension IS the glyph, and
   a format badge stays legible at sizes where a bespoke pictogram would not. */
.dshdrop-glyph {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 42px;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
  border-radius: 5px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-tertiary);
}
/* The folded corner, cut from the page's own top-right. */
.dshdrop-glyph::before {
  content: "";
  position: absolute;
  top: -1px;
  right: -1px;
  width: 11px;
  height: 11px;
  border-left: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
  border-bottom: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
  border-bottom-left-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover);
}
.dshdrop-badge {
  max-width: 30px;
  overflow: hidden;
  font-size: 9px;
  font-weight: 600;
  line-height: 12px;
  letter-spacing: 0.02em;
  color: var(--dsw-alias-label-secondary);
}
.dshdrop-lines { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dshdrop-name {
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  /* Two-line clamp keeps a long name readable without letting one card set
     the height of the whole rail. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.dshdrop-meta {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Play affordance over a video thumbnail: without it a paused first frame is
   indistinguishable from a still image. */
.dshdrop-play {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(0 0 0 / .55);
  color: #fff;
  pointer-events: none;
}

.dshdrop-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-button-contrast-fill);
  color: var(--dsw-alias-label-primary-inverted);
  cursor: pointer;
  opacity: 0;
  transition: opacity .2s ease-in-out;
}
.dshdrop-item:hover .dshdrop-remove,
.dshdrop-remove:focus-visible { opacity: 1; }
/* Touch surfaces have no hover, so the control has to stay put. */
@media (pointer: coarse) { .dshdrop-remove { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .dshdrop-remove { transition: none; } }

.dshdrop-thumb:focus-visible,
.dshdrop-doc:focus-visible,
.dshdrop-remove:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
}

/* The expanded preview. Same layer, mask and dismissal shape as the shipped
   image lightbox, so opening a PDF feels like opening an image. */
.dshdrop-lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  padding: 24px 24px 32px;
}
.dshdrop-mask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
}
/* The header rides its own surface rather than sitting on the mask. That mask
   is a light scrim in the light theme, so text tinted for a dark backdrop
   would be white on near-white — unreadable, and unreadable differently per
   theme. On a surface it uses the ordinary label tokens and holds contrast in
   both. */
.dshdrop-head {
  position: relative;
  justify-self: center;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  min-width: 0;
  padding: 6px 6px 6px 16px;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin);
  border-radius: 999px;
  background: var(--dsw-specific-input-major);
  box-shadow: var(--dsw-shadow-lv2);
  color: var(--dsw-alias-label-primary);
}
.dshdrop-headName {
  min-width: 0;
  flex: auto;
  font-size: 14px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshdrop-headMeta {
  flex: none;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.dshdrop-headAction {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dshdrop-headAction:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dshdrop-headAction:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
.dshdrop-stage {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 0;
}
.dshdrop-stageImage {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  object-fit: contain;
  background: var(--dsw-specific-input-major);
}
.dshdrop-stageVideo {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  background: #000;
}
.dshdrop-stageAudio { width: min(520px, 100%); }
/* A PDF frame must NOT be sandboxed: Chrome refuses to hand a sandboxed frame
   to its PDF viewer and renders a download prompt instead. */
.dshdrop-stageFrame {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 12px;
  background: var(--dsw-alias-bg-base);
}
.dshdrop-stageText {
  box-sizing: border-box;
  width: min(920px, 100%);
  max-height: 100%;
  margin: 0;
  padding: 16px 20px;
  border-radius: 12px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 20px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}
.dshdrop-stageEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 32px;
  border-radius: 12px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}
`

/**
 * Mount the rail stylesheet for the owning plugin's lifetime.
 *
 * Guarded by an id lookup rather than a module-level flag: a hot replacement
 * re-runs the module but not the document, and a second identical tag would
 * accumulate on every reload.
 * @param ctx - owning plugin context.
 */
export function installDropStyles(ctx: Context): void {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`
    const existing = document.querySelector(selector)
    if (existing !== null) return () => {}
    const tag = document.createElement('style')
    tag.dataset.plugin = '@crosery/dsh-drop'
    tag.dataset.pluginCss = STYLE_ID
    tag.textContent = SHEET
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, '@crosery/dsh-drop: preview rail stylesheet')
}
