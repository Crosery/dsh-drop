/**
 * A last-resort notice, for when no composer can show one.
 *
 * Every notice this plugin raises goes through the target session's composer
 * (`SessionInput.notify`) when there is one. A drop onto a page with no
 * session open has no composer to speak through, and a silent refusal reads
 * as a broken drop — so the message is shown here instead, as a small status
 * line at the bottom of the viewport.
 * @module @crosery/dsh-drop/client/toast
 */

/** Style tag id, matching the convention other client bundles use. */
const STYLE_ID = '@crosery/dsh-drop/toast.css'

/** How long one notice stays up. */
const VISIBLE_MS = 4000

const CSS = `
.dsh-drop-toast {
  position: fixed;
  left: 50%;
  bottom: 96px;
  z-index: 2147483001;
  max-width: min(480px, calc(100vw - 32px));
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.4));
  background: var(--dsw-specific-menu, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
  box-shadow: var(--dsw-shadow-lv2, 0 8px 24px rgba(0, 0, 0, 0.18));
  font-size: 13px;
  line-height: 20px;
  transform: translateX(-50%);
  pointer-events: none;
}
`

/** Show and dispose handles over the toast. */
export interface Toast {
  show(text: string): void
  dispose(): void
}

/**
 * Create the toast controller.
 * @returns the controller; `dispose` removes any notice still shown.
 */
export function createToast(): Toast {
  let element: HTMLElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const hide = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    element?.remove()
    element = undefined
  }

  return {
    show(text) {
      const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`
      if (document.querySelector(selector) === null) {
        const tag = document.createElement('style')
        tag.dataset.plugin = '@crosery/dsh-drop'
        tag.dataset.pluginCss = STYLE_ID
        tag.textContent = CSS
        document.head.appendChild(tag)
      }
      hide()
      element = document.createElement('div')
      element.className = 'dsh-drop-toast'
      element.setAttribute('role', 'status')
      element.setAttribute('aria-live', 'polite')
      element.textContent = text
      document.body.appendChild(element)
      timer = setTimeout(hide, VISIBLE_MS)
    },
    dispose: hide,
  }
}
