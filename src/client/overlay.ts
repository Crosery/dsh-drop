/**
 * The drop invitation shown for file drags this plugin claims.
 *
 * Plain DOM rather than a slot component. The shipped overlay lives inside
 * `conversation.input.attachments` and says "drag images here", with a disabled
 * variant when the current route takes no images — copy that is wrong twice
 * over for a dropped `.md`, and actively misleading in the disabled case, since
 * this plugin accepts the drop the overlay is declining. Suppressing the
 * shipped overlay for these drags and drawing our own is the only way the two
 * stay in agreement, and one absolutely-positioned element needs no React.
 * @module @crosery/dsh-drop/client/overlay
 */

/** Style tag id, matching the convention other client bundles use. */
const STYLE_ID = '@crosery/dsh-drop/overlay.css'

/** Copy, by the two locales the shipped dictionaries carry. */
const COPY = {
  zh: { title: '拖入文件', desc: '图片直接附加，其他文件插入为 @ 文件引用' },
  en: { title: 'Drop files here', desc: 'Images attach; other files are inserted as @ file references' },
} as const

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
  padding: 20px 28px;
  border-radius: 16px;
  border: 2px dashed var(--dsw-alias-border-2, rgba(255, 255, 255, 0.6));
  background: var(--dsw-alias-bg-1, #fff);
  color: var(--dsw-alias-text-1, #111);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  font-size: 14px;
  text-align: center;
}
.dsh-drop-overlay-title { font-size: 16px; font-weight: 600; }
.dsh-drop-overlay-desc { opacity: 0.7; }
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

/** Pick the copy matching the document language, defaulting to Chinese. */
function copy(): { title: string, desc: string } {
  return document.documentElement.lang.toLowerCase().startsWith('en') ? COPY.en : COPY.zh
}

/** Show and hide handles over one overlay element. */
export interface Overlay {
  show(): void
  hide(): void
  dispose(): void
}

/**
 * Create the overlay controller.
 *
 * The element is built lazily and removed on hide, so a session that never
 * receives a drop carries no extra node.
 * @returns the controller; `dispose` removes any element still mounted.
 */
export function createOverlay(): Overlay {
  let element: HTMLElement | undefined

  const hide = (): void => {
    element?.remove()
    element = undefined
  }

  return {
    show() {
      if (element !== undefined) return
      installStyles()
      const text = copy()
      const host = document.createElement('div')
      host.className = 'dsh-drop-overlay'
      const card = document.createElement('div')
      card.className = 'dsh-drop-overlay-card'
      const title = document.createElement('div')
      title.className = 'dsh-drop-overlay-title'
      title.textContent = text.title
      const desc = document.createElement('div')
      desc.className = 'dsh-drop-overlay-desc'
      desc.textContent = text.desc
      card.append(title, desc)
      host.append(card)
      document.body.appendChild(host)
      element = host
    },
    hide,
    dispose: hide,
  }
}
