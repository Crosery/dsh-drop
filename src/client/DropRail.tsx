/**
 * The composer's attachment rail: everything staged for the next message, in
 * one strip.
 *
 * This entry takes the seat the shipped attachment plugin occupies
 * (`conversation.input.attachments`), which is a `single` slot — so taking it
 * is a replacement, not an addition. That is deliberate. As two separate
 * strips, a dropped PNG and a dropped MP4 read as two unrelated features, when
 * to the user they are one act: these are the files I am sending. Occupying
 * the seat is the only way they share a row, because the seat admits exactly
 * one occupant.
 *
 * The replacement costs no capability: draft images arrive as owner props
 * (`attachments`, each carrying its own `previewUrl`), so this entry renders
 * them from data rather than by importing the shipped component — which the
 * client bundle-purity contract forbids anyway.
 *
 * The two halves keep their different natures underneath. An image is a draft
 * attachment the Host encodes into the request; a file is a path this plugin
 * holds beside the draft and splices into the message at send time. Neither
 * puts a character in the composer — which is the whole point — so they are
 * removed through different machinery but read as one list.
 * @module @crosery/dsh-drop/client/DropRail
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconChevronLeftOutline14, IconChevronRightOutline14, IconCloseOutline16, IconPlayOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: these pull the SlotMap declaration for the attachment seat and
// the standard-kit merges. A value import would fail the bundle-purity gate.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { fileNameOf } from '../contract.ts'
import { formatDropBytes, kindBadge, type DropKind } from '../preview.ts'
import type { AttachedFile } from './attached.ts'
import { DropLightbox, usePreviewText } from './DropLightbox.tsx'
import { DROP_NS, type DropKey } from './locales.ts'
import type { DropAsset } from './preview-store.ts'
import { useRailOverflow } from './use-rail-overflow.ts'

/** Locale key naming each medium, for the card's meta line. */
const KIND_LABEL: Readonly<Record<DropKind, DropKey>> = {
  image: 'kind.image',
  video: 'kind.video',
  audio: 'kind.audio',
  pdf: 'kind.pdf',
  document: 'kind.document',
  text: 'kind.text',
  archive: 'kind.archive',
  file: 'kind.file',
}

/** The kinds whose card is a thumbnail rather than an identity row. */
const THUMBNAIL_KINDS: readonly DropKind[] = ['image', 'video']

/** Business face this plugin injects into the rail. */
export interface DropRailInjected {
  /** Preview material for one path; absent when this page never held the bytes. */
  assetOf: (path: string) => DropAsset | undefined
  /** Decode one text file's head, cached per path. */
  textOf: (path: string) => Promise<string | undefined>
  /**
   * Publish the seat's image intake to the plugin's document-level drag
   * handling.
   *
   * Taking this seat takes the shipped entry's document listeners down with
   * it, so this plugin becomes the only thing receiving image drops — and
   * `onAddImages`, the composer's own validated intake path, reaches only into
   * this component. The rail hands it outward for the drop pipeline to call.
   */
  bindImageIntake: (intake: ((files: readonly File[]) => void) | undefined) => void
  /**
   * Publish this session's composer verbs to the submit guard.
   *
   * The guard runs on document-level listeners and needs the draft, the write
   * path and the submit trigger — all of which arrive as props here and
   * nowhere else.
   */
  bindComposer: (handle: ComposerBinding | undefined) => void
  /**
   * Files staged for this session.
   *
   * A `hooks` compartment rather than a plain array: the inject factory runs
   * once per entry materialization, so a value would freeze at whatever was
   * staged that instant. The framework binds this source into a `useAttached`
   * selector hook, and the rail follows every drop and removal.
   */
  hooks: {
    attached: {
      getSnapshot: () => readonly AttachedFile[]
      subscribe: (fn: () => void) => () => void
    }
  }
  /** Unstage one file. */
  detach: (id: number) => void
}

/** What the rail publishes for the submit guard to drive. */
export interface ComposerBinding {
  sessionId: string
  draft: () => string
  setDraft: (text: string) => void
  submit: () => void
  ready: () => boolean
}

/**
 * Full rail props: the attachment seat's owner share, the injected face with
 * its `hooks` compartment bound into selector hooks, and the locale seat.
 */
export type DropRailProps =
  PropsRuntime<'conversation.input.attachments'>
  & InjectFace<DropRailInjected>
  & PropsLocale<typeof DROP_NS>

/** One item in the rail: a draft image, or a referenced file. */
type RailItem =
  | {
    row: 'image'
    key: string
    name: string
    url: string
    size: number
    remove: () => void
  }
  | {
    row: 'file'
    key: string
    path: string
    name: string
    kind: DropKind
    asset: DropAsset | undefined
    remove: () => void
  }

/**
 * The identity card's leading glyph: a page carrying the format.
 * @param name - the file name the badge is derived from.
 * @returns the glyph element.
 */
function Glyph({ name }: { name: string }): ReactNode {
  return (
    <span className="dshdrop-glyph" aria-hidden="true">
      <span className="dshdrop-badge">{kindBadge(name)}</span>
    </span>
  )
}

/**
 * One card in the rail.
 *
 * A thumbnail for anything with pixels, an identity row (format, name, size)
 * for anything without. Name, format and size only — a card's job is to let
 * the user confirm the right file is attached, which the name does.
 * @param props - the item, its preview URL, the open callback, the translator.
 * @returns the card and its remove control.
 */
function Card({ item, url, onOpen, t }: {
  item: RailItem
  url: string | undefined
  onOpen: () => void
  t: DropRailProps['t']
}): ReactNode {
  const kind: DropKind = item.row === 'image' ? 'image' : item.kind
  const size = item.row === 'image' ? item.size : item.asset?.size ?? 0
  const sizeText = formatDropBytes(size)
  const thumbnail = THUMBNAIL_KINDS.includes(kind) && url !== undefined

  return (
    <div className="dshdrop-item">
      {thumbnail
        ? (
          <button
            type="button"
            className="dshdrop-thumb"
            aria-label={t('action.open', { name: item.name })}
            title={item.name}
            onClick={onOpen}
          >
            {kind === 'image'
              ? <img src={url} alt="" />
              // `#t=0.1` asks the element to seek past the first frame, which
              // is black in most containers; without it the card is a void.
              : <video src={`${url ?? ''}#t=0.1`} muted playsInline preload="metadata" />}
            {kind === 'video' && (
              <span className="dshdrop-play" aria-hidden="true">
                <IconPlayOutline16 size={11} />
              </span>
            )}
          </button>
        )
        : (
          <button
            type="button"
            className="dshdrop-doc"
            aria-label={t('action.open', { name: item.name })}
            title={item.name}
            onClick={onOpen}
          >
            <Glyph name={item.name} />
            <span className="dshdrop-lines">
              <span className="dshdrop-name">{item.name}</span>
              <span className="dshdrop-meta">
                {sizeText === '' ? t(KIND_LABEL[kind]) : `${t(KIND_LABEL[kind])} · ${sizeText}`}
              </span>
            </span>
          </button>
        )}
      <button
        type="button"
        className="dshdrop-remove"
        aria-label={t('action.remove', { name: item.name })}
        onClick={item.remove}
      >
        <IconCloseOutline16 size={10} />
      </button>
    </div>
  )
}

/**
 * The composer's attachment rail.
 *
 * Renders nothing while nothing is attached, the same posture the shipped
 * entry takes: an absent strip costs no layout inside the composer card.
 * @param props - attachment owner share, injected preview face, locale seat.
 * @returns the rail, or null when there is nothing to show.
 */
export function DropRail({
  attachments, onRemoveImage, onAddImages, useInput, inputActions, sessionId,
  assetOf, textOf, bindImageIntake, bindComposer, useAttached, detach, t,
}: DropRailProps): ReactNode {
  const attached = useAttached((staged) => staged)
  const [open, setOpen] = useState<string | null>(null)

  // The seat's image intake is the composer's validated path (count, byte and
  // media-type limits). Publishing it lets this plugin's document listeners —
  // now the only ones, since taking the seat unmounted the shipped entry's —
  // hand image members back to it.
  useEffect(() => {
    bindImageIntake(onAddImages)
    return () => { bindImageIntake(undefined) }
  }, [bindImageIntake, onAddImages])

  const phase = useInput((state) => state.phase)
  const draft = useInput((state) => state.draft) ?? ''

  // The submit guard needs the draft and the composer's write and submit
  // verbs. They exist only as props, so the rail is where they are published;
  // a stale closure would submit an old draft, hence the dependency on both.
  useEffect(() => {
    if (sessionId === undefined || inputActions === undefined) {
      bindComposer(undefined)
      return
    }
    bindComposer({
      sessionId,
      draft: () => draft,
      setDraft: (text) => { inputActions.setDraft(text) },
      submit: () => { inputActions.submit() },
      // Mid-transaction the machine ignores writes, so rewriting the draft
      // then would drop the paths silently.
      ready: () => phase === 'plain' || phase === 'claimed',
    })
    return () => { bindComposer(undefined) }
  }, [bindComposer, sessionId, inputActions, draft, phase])

  const items = useMemo<RailItem[]>(() => {
    const images: RailItem[] = attachments.map((attachment) => ({
      row: 'image',
      key: `image:${attachment.id}`,
      name: attachment.file.name,
      url: attachment.previewUrl,
      size: attachment.file.size,
      remove: () => { onRemoveImage(attachment.id) },
    }))
    const files: RailItem[] = attached.map((entry) => ({
      row: 'file',
      key: `file:${entry.id}`,
      path: entry.path,
      name: assetOf(entry.path)?.name ?? fileNameOf(entry.path),
      kind: assetOf(entry.path)?.kind ?? 'file',
      asset: assetOf(entry.path),
      // Draft images and staged files are held by different owners; a card
      // only knows it has a remove verb.
      remove: () => { detach(entry.id) },
    }))
    // Images first, then files. The two lists carry independent orders — one is
    // the composer's image array, the other this plugin's staging list — so
    // there is no single sequence to interleave them into.
    return [...images, ...files]
  }, [attachments, attached, assetOf, onRemoveImage, detach])

  const overflow = useRailOverflow(items.length)
  const previewed = items.find((item) => item.key === open) ?? null

  // An item can leave while its preview is open — the user deletes the chip in
  // the textarea, or a send clears the draft. Close rather than strand a dialog
  // over a file that is no longer attached.
  useEffect(() => {
    if (open !== null && previewed === null) setOpen(null)
  }, [open, previewed])

  const previewText = usePreviewText(
    previewed !== null && previewed.row === 'file' && previewed.kind === 'text'
      ? previewed.path
      : null,
    textOf,
  )

  if (items.length === 0) return null

  return (
    <div className="dshdrop-rail-wrap">
      <div className="dshdrop-rail" ref={overflow.ref} role="group" aria-label={t('rail.label')}>
        {items.map((item) => (
          <Card
            key={item.key}
            item={item}
            url={item.row === 'image' ? item.url : item.asset?.url}
            onOpen={() => { setOpen(item.key) }}
            t={t}
          />
        ))}
      </div>
      {overflow.atStart && (
        <button
          type="button"
          className="dshdrop-arrow dshdrop-arrowLeft"
          aria-label={t('action.scrollLeft')}
          onClick={() => { overflow.page(-1) }}
        >
          <IconChevronLeftOutline14 size={14} />
        </button>
      )}
      {overflow.atEnd && (
        <button
          type="button"
          className="dshdrop-arrow dshdrop-arrowRight"
          aria-label={t('action.scrollRight')}
          onClick={() => { overflow.page(1) }}
        >
          <IconChevronRightOutline14 size={14} />
        </button>
      )}
      {previewed !== null && (
        <DropLightbox
          name={previewed.name}
          asset={previewed.row === 'file'
            ? previewed.asset
            // A draft image has no store asset — it belongs to the composer,
            // not to this plugin — so its preview material is assembled here.
            : {
              name: previewed.name,
              mediaType: '',
              size: previewed.size,
              kind: 'image',
              url: previewed.url,
            }}
          text={previewText}
          onClose={() => { setOpen(null) }}
          t={t}
        />
      )}
    </div>
  )
}
