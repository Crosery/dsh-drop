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
// Type-only: these pull the SlotMap declaration for the attachment seat, the
// standard-kit merges, and the locale seat. A value import would fail the
// bundle-purity gate.
//
// `@deepseek-ai/dsh-client-runtime` is deliberately NOT imported: it stopped
// publishing after 0.1.1, and from 0.1.2 the slot registry is declared by
// `dsh-client-ui-renderer` and the session services by
// `dsh-api-session-controller`. Importing either train's owner pins this build
// to that train, so the props this component reads are restated below instead.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
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
  /**
   * The framework-resolved session this occurrence belongs to.
   *
   * Bound by the registration's `inject` factory rather than read off the
   * standard kit: 0.1.2 stopped merging `sessionId` into the props of
   * session-maybe slots and hands it to the factory instead.
   */
  sessionId: string | undefined
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
 * One draft attachment, as the seat hands it over.
 *
 * Restated structurally rather than imported from the conversation package:
 * 0.1.2 widened this union with a file member that carries no `previewUrl`, and
 * naming one train's type would pin the component to that train.
 */
export interface SeatAttachment {
  /** Draft identity, for the owner's remove verb. */
  id: string
  /** The browser `File` behind the draft. */
  file: { name: string; size: number }
  /** Object URL for drafts that have pixels; absent for generic files. */
  previewUrl?: string | undefined
}

/**
 * The seat's owner share plus the two session-kit members this rail reads.
 *
 * Restated rather than imported, because the seat's prop names moved in 0.1.2:
 * `onAddImages` → `onAddFiles` and `onRemoveImage` → `onRemoveAttachment`, and
 * draft attachments grew a file member with no `previewUrl`. Both name pairs are
 * optional here and the rail calls whichever pair the running harness supplies —
 * one registration, either train.
 */
export interface SeatProps {
  /** Browser-owned draft attachments in input order. */
  attachments: readonly SeatAttachment[]
  /** Add one dropped batch through the composer's validation path (≤0.1.1 name). */
  onAddImages?: ((files: readonly File[]) => void) | undefined
  /** Add one dropped batch through the composer's validation path (≥0.1.2 name). */
  onAddFiles?: ((files: readonly File[]) => void) | undefined
  /**
   * Remove one draft attachment through the service (≤0.1.1 name).
   *
   * Method shorthand is load-bearing: the id is branded by the conversation
   * package (`DraftAttachmentId`), and the brand's symbol is not importable
   * without naming one train — a method signature is checked bivariantly, so
   * the owner's branded parameter still satisfies this plain-string one.
   */
  onRemoveImage?(id: string): void
  /** Remove one draft attachment through the service (≥0.1.2 name). */
  onRemoveAttachment?(id: string): void
}

/**
 * Full rail props: the seat's share, this plugin's injected face, and the
 * locale seat.
 *
 * The seat's runtime share keeps everything this rail does not restate — the
 * session kit (`useInput`, `inputActions`) and the `useAttached` hook the
 * framework synthesizes from the injected `hooks` compartment.
 */
export type DropRailProps =
  Omit<PropsRuntime<'conversation.input.attachments'>, keyof SeatProps>
  & SeatProps
  & InjectFace<DropRailInjected>
  & PropsLocale<typeof DROP_NS>

/** One item in the rail: a draft attachment, or a referenced file. */
type RailItem =
  | {
    row: 'image'
    key: string
    name: string
    /** Preview URL; absent for a draft the composer holds without pixels. */
    url: string | undefined
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
  attachments, onAddImages, onAddFiles, onRemoveImage, onRemoveAttachment,
  useInput, inputActions, sessionId,
  assetOf, textOf, bindImageIntake, bindComposer, useAttached, detach, t,
}: DropRailProps): ReactNode {
  const attached = useAttached((staged) => staged)
  const [open, setOpen] = useState<string | null>(null)

  // One verb per concern, whichever name the running harness publishes:
  // 0.1.2 renamed the seat's owner share, and this registration serves both.
  const addFiles = onAddFiles ?? onAddImages
  const removeAttachment = onRemoveAttachment ?? onRemoveImage

  // The seat's file intake is the composer's validated path (count, byte and
  // media-type limits). Publishing it lets this plugin's document listeners —
  // now the only ones, since taking the seat unmounted the shipped entry's —
  // hand members back to it.
  useEffect(() => {
    bindImageIntake(addFiles)
    return () => { bindImageIntake(undefined) }
  }, [bindImageIntake, addFiles])

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
      // Draft images carry a preview URL; a file-kind draft (0.1.2 widened the
      // union) has none, so its card renders as an identity row instead of a
      // thumbnail.
      url: attachment.previewUrl,
      size: attachment.file.size,
      remove: () => { removeAttachment?.(attachment.id) },
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
  }, [attachments, attached, assetOf, removeAttachment, detach])

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
