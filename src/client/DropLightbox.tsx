/**
 * The expanded preview of one dropped file.
 *
 * Same layer, mask and dismissal shape as the shipped image lightbox, so
 * opening a dropped PDF feels like opening a dropped PNG. What differs is the
 * stage: an image renders as an image, a video and an audio file get native
 * transport controls, a PDF goes to the browser's own viewer, and a text file
 * renders as monospaced source. A format with no in-page renderer — Word,
 * Keynote, an archive — says so rather than showing a broken frame; the file
 * is still referenced in the draft either way, so the preview failing is not
 * the send failing.
 *
 * Focus is moved in on mount, cycled inside the dialog while it is open, and
 * restored to the opener on unmount. That last part matters because the opener
 * is a card in a horizontally scrolling rail: losing focus there would drop
 * the user back at the start of the page.
 * @module @crosery/dsh-drop/client/DropLightbox
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode, ReactPortal } from 'react'
import { createPortal } from 'react-dom'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { formatDropBytes } from '../preview.ts'
import type { DropAsset } from './preview-store.ts'
import { DROP_NS } from './locales.ts'

/** Props of the expanded preview. */
export interface DropLightboxProps {
  /** Display name shown in the header and used as the dialog's accessible name. */
  name: string
  /** The file's preview material; absent once a reload dropped the bytes. */
  asset: DropAsset | undefined
  /** Decoded text for the `text` kind; undefined while loading or unavailable. */
  text: string | undefined
  /** Dismissal (Escape, mask press, close control). */
  onClose: () => void
  /** This plugin's namespace translator. */
  t: TranslateNS<typeof DROP_NS>
}

/** Focusable descendants of the dialog, in tab order. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, [href], video, audio, iframe, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.tabIndex !== -1)
}

/**
 * Render the preview stage for one asset.
 * @param props - the asset, its decoded text, and the translator.
 * @returns the element that actually plays or shows the file.
 */
function Stage({ asset, text, t }: Pick<DropLightboxProps, 'asset' | 'text' | 't'>): ReactNode {
  if (asset === undefined) {
    return <div className="dshdrop-stageEmpty">{t('state.reloaded')}</div>
  }
  if (asset.url !== undefined) {
    if (asset.kind === 'image') {
      return <img className="dshdrop-stageImage" src={asset.url} alt={asset.name} />
    }
    if (asset.kind === 'video') {
      return (
        <video className="dshdrop-stageVideo" src={asset.url} controls autoPlay playsInline>
          {t('media.noVideo')}
        </video>
      )
    }
    if (asset.kind === 'audio') {
      return (
        <audio className="dshdrop-stageAudio" src={asset.url} controls>
          {t('media.noAudio')}
        </audio>
      )
    }
    if (asset.kind === 'pdf') {
      // Deliberately not sandboxed: Chrome refuses to hand a sandboxed frame
      // to its PDF viewer and renders a download prompt in place of the file.
      return <iframe className="dshdrop-stageFrame" src={asset.url} title={asset.name} />
    }
  }
  if (asset.kind === 'text') {
    if (text === undefined) return <div className="dshdrop-stageEmpty">{t('state.binary')}</div>
    return <pre className="dshdrop-stageText">{text}</pre>
  }
  return <div className="dshdrop-stageEmpty">{t('state.noPreview')}</div>
}

/**
 * Show one dropped file at full size.
 * @param props - name, asset, decoded text, dismissal, translator.
 * @returns the dialog, portalled to the document body.
 */
export function DropLightbox({ name, asset, text, onClose, t }: DropLightboxProps): ReactPortal | null {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (dialog === null) return
      // Contain tab navigation: the composer behind this dialog is still a
      // focusable textarea, and tabbing into it would leave an open modal
      // over an input the user cannot see they are typing into.
      const stops = focusables(dialog)
      if (stops.length === 0) return
      const first = stops[0]!
      const last = stops[stops.length - 1]!
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      openerRef.current?.focus()
    }
  }, [onClose])

  const size = formatDropBytes(asset?.size ?? 0)

  return createPortal(
    <div
      ref={dialogRef}
      className="dshdrop-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div className="dshdrop-mask" aria-hidden="true" onMouseDown={onClose} />
      <div className="dshdrop-head">
        <span className="dshdrop-headName">{name}</span>
        {size !== '' && <span className="dshdrop-headMeta">{size}</span>}
        <button
          ref={closeRef}
          type="button"
          className="dshdrop-headAction"
          aria-label={t('action.close')}
          onClick={onClose}
        >
          <IconCloseOutline16 size={16} />
        </button>
      </div>
      <div className="dshdrop-stage">
        <Stage asset={asset} text={text} t={t} />
      </div>
    </div>,
    document.body,
  )
}

/**
 * Load one path's decoded text while a preview is open.
 *
 * A hook rather than an effect inside {@link DropLightbox} so the dialog stays
 * a pure function of its props: the caller owns the async read, and a preview
 * of a file that does not render as text never starts one.
 * @param path - the previewed path, or null when nothing text-shaped is open.
 * @param read - the store's decoder.
 * @returns the decoded text, or undefined while loading or unavailable.
 */
export function usePreviewText(
  path: string | null,
  read: (path: string) => Promise<string | undefined>,
): string | undefined {
  const [text, setText] = useState<string | undefined>(undefined)
  useEffect(() => {
    setText(undefined)
    if (path === null) return
    let live = true
    void read(path).then((value) => {
      if (live) setText(value)
    })
    return () => { live = false }
  }, [path, read])
  return text
}
