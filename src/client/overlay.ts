/**
 * The drop invitation shown while files are dragged over the page.
 *
 * Plain DOM rather than a slot component. The shipped overlay lives inside the
 * attachment seat this plugin occupies, so it is gone, and its copy described
 * images only. One absolutely-positioned element needs no React, and it can
 * sit above every composer on the page at once.
 *
 * It has two faces. The invitation says what happens to each kind of file and
 * repeats the composer's image limits. The blocked face appears when the
 * composer under the pointer refuses files — a subagent's composer, a
 * composer mid-send, a blank composer with no session — so the user learns
 * why before letting go rather than after.
 * @module @crosery/dsh-drop/client/overlay
 */

import { messages } from './messages.ts'

/** Style tag id, matching the convention other client bundles use. */
const STYLE_ID = '@crosery/dsh-drop/overlay.css'

/**
 * Every color is a theme token both harness trains define, so the card follows
 * light and dark palettes: the composer's own surface, its primary label, and
 * its layer-2 border. The fallbacks only apply outside the app shell.
 */
const CSS = `
.dsh-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.32));
  backdrop-filter: var(--dsw-mask-blur, blur(2px));
}
.dsh-drop-overlay-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  max-width: min(440px, calc(100vw - 48px));
  padding: 20px 28px;
  border-radius: 16px;
  border: 2px dashed var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.6));
  background: var(--dsw-specific-input-major, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
  box-shadow: var(--dsw-shadow-lv2, 0 8px 32px rgba(0, 0, 0, 0.18));
  font-size: 14px;
  line-height: 20px;
  text-align: center;
}
.dsh-drop-overlay[data-blocked] .dsh-drop-overlay-card {
  border-color: var(--dsw-alias-state-error-primary, #d33);
}
.dsh-drop-overlay-title { font-size: 16px; font-weight: 600; }
.dsh-drop-overlay-desc,
.dsh-drop-overlay-limits { color: var(--dsw-alias-label-secondary, inherit); }
.dsh-drop-overlay-limits { font-size: 12px; }
@media (prefers-reduced-motion: no-preference) {
  .dsh-drop-overlay { animation: dsh-drop-fade 120ms ease-out; }
  @keyframes dsh-drop-fade { from { opacity: 0 } to { opacity: 1 } }
}
`

/**
 * Install the stylesheet once per document.
 *
 * Guarded by an id lookup rather than a module-level flag: a hot replacement
 * re-runs the module but not the document, and a second identical tag would
 * accumulate on every reload.
 */
function installStyles(): void {
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`
  if (document.querySelector(selector) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@crosery/dsh-drop'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** What the overlay shows for the composer under the pointer. */
export interface OverlayState {
  /** The composer refuses the drop; `noSession` says why. */
  blocked: boolean
  /** No session is open at all. */
  noSession: boolean
  /** The composer's image limits, when it publishes them. */
  limits?: { readonly count: number, readonly size: string } | undefined
}

/** Show and hide handles over one overlay element. */
export interface Overlay {
  show(state: OverlayState): void
  hide(): void
  dispose(): void
}

/** The three text lines for one state. */
function linesFor(state: OverlayState): [title: string, desc: string, limits: string] {
  const copy = messages()
  if (state.blocked) {
    return [copy.overlayBlockedTitle, state.noSession ? copy.overlayNoSession : copy.overlayBusy, '']
  }
  const limits = state.limits === undefined ? '' : copy.overlayLimits(state.limits.count, state.limits.size)
  return [copy.overlayTitle, copy.overlayDesc, limits]
}

/**
 * Create the overlay controller.
 *
 * The element is built lazily and removed on hide, so a session that never
 * receives a drop carries no extra node. `show` is called on every dragover
 * and only touches the DOM when the state it shows changes.
 * @returns the controller; `dispose` removes any element still mounted.
 */
export function createOverlay(): Overlay {
  let element: HTMLElement | undefined
  let shown = ''

  const hide = (): void => {
    element?.remove()
    element = undefined
    shown = ''
  }

  return {
    show(state) {
      const lines = linesFor(state)
      const signature = `${String(state.blocked)}|${lines.join('|')}`
      if (element !== undefined && signature === shown) return
      installStyles()
      if (element === undefined) {
        element = document.createElement('div')
        element.className = 'dsh-drop-overlay'
        element.setAttribute('role', 'status')
        document.body.appendChild(element)
      }
      element.toggleAttribute('data-blocked', state.blocked)
      const card = document.createElement('div')
      card.className = 'dsh-drop-overlay-card'
      const [titleText, descText, limitsText] = lines
      for (const [name, text] of [['title', titleText], ['desc', descText], ['limits', limitsText]] as const) {
        if (text === '') continue
        const line = document.createElement('div')
        line.className = `dsh-drop-overlay-${name}`
        line.textContent = text
        card.append(line)
      }
      element.replaceChildren(card)
      shown = signature
    },
    hide,
    dispose: hide,
  }
}
