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
 * The replacement costs no capability. The composer's own drafts arrive as
 * owner props — images with their preview URL, and from 0.1.3 generic file
 * drafts with their upload state — so this entry renders them from data,
 * shows upload progress and failures, and offers the composer's retry. The
 * shipped component itself is never imported; the bundle-purity contract
 * forbids that anyway.
 *
 * The two halves keep their different natures underneath. A draft belongs to
 * the composer and is removed through its verb; a staged reference is a path
 * this plugin holds beside the draft and appends at send time. Neither puts a
 * character in the text box — which is the whole point — so they are removed
 * through different machinery but read as one list.
 *
 * The rail also registers itself with the plugin, per mount: the drop, paste
 * and send listeners find the composer a gesture belongs to through that
 * registration, because the page can hold more than one composer.
 * @module @crosery/dsh-drop/client/DropRail
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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
import { fileNameOf, freshFiles } from '../contract.ts'
import { dropKindOf, formatDropBytes, kindBadge, type DropKind } from '../preview.ts'
import type { AttachedFile } from './attached.ts'
import { composerFace, snapshotOf, type ActionsLike, type ComposerFace, type InputSnapshot, type ScopeLike } from './composer-face.ts'
import { DropLightbox, usePreviewText, type FolderListing } from './DropLightbox.tsx'
import { ChevronLeftGlyph, ChevronRightGlyph, CloseGlyph, FolderGlyph, PlayGlyph, RetryGlyph } from './icons.tsx'
import { DROP_NS, type DropKey } from './locales.ts'
import type { DropAsset } from './preview-store.ts'
import type { RailRecord } from './registry.ts'
import { planRemovalFocus, settleRemovalFocus, type PendingFocus } from './rail-focus.ts'
import { useRailOverflow } from './use-rail-overflow.ts'

/** What a card shows: a file's medium, or a folder. */
type RailKind = DropKind | 'folder'

/** Locale key naming each medium, for the card's meta line. */
const KIND_LABEL: Readonly<Record<RailKind, DropKey>> = {
  image: 'kind.image',
  video: 'kind.video',
  audio: 'kind.audio',
  pdf: 'kind.pdf',
  document: 'kind.document',
  text: 'kind.text',
  archive: 'kind.archive',
  file: 'kind.file',
  folder: 'kind.folder',
}

/** The kinds whose card is a thumbnail rather than an identity row. */
const THUMBNAIL_KINDS: readonly RailKind[] = ['image', 'video']

/** The composer limits the seat publishes for its drop invitation. */
export interface DropLimits {
  readonly count: number
  readonly size: string
}

/** One mounted rail, as the drop, paste and send listeners reach it. */
export interface RailHandle extends RailRecord {
  /** The composer's image limits, when published. */
  dropLimits(): DropLimits | undefined
  /**
   * Hand files to the composer's own validated intake, minus any the seat
   * already holds (same name, size and modification time).
   */
  addFiles(files: readonly File[]): void
  /** The composer's send verbs; absent on a blank composer. */
  readonly composer: ComposerFace | undefined
}

/** The per-session input facade, read structurally: notices and the live state. */
export interface SessionInputLike {
  notify?: ((level: 'info' | 'error', text: string) => void) | undefined
  readonly state?: { getSnapshot?: (() => unknown) | undefined } | undefined
}

/** How the plugin reaches one session's input facade and scope. */
export interface SessionAccess {
  /** The session's input facade, for the live state and notices. */
  inputOf(sessionId: string): SessionInputLike | undefined
  /** The session-scope context, for its scoped input events. */
  scopeOf(sessionId: string): ScopeLike | undefined
}

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
  /** Preview material for one key; absent when this page never held the bytes. */
  assetOf: (key: string) => DropAsset | undefined
  /** Record the bytes behind one composer draft, for its card and preview. */
  putAsset: (key: string, file: File) => void
  /** Let one composer draft's preview material go. */
  releaseAsset: (key: string) => void
  /** Decode one text file's head, cached per key. */
  textOf: (key: string) => Promise<string | undefined>
  /** Register this mount with the plugin's listeners; returns the disposer. */
  register: (rail: RailHandle) => () => void
  /** The session services the send path reads through. */
  access: SessionAccess
  /** Report a textarea composer, where the reference-chip CSS still applies. */
  onLegacyComposer: () => void
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

/**
 * One draft attachment, as the seat hands it over.
 *
 * Restated structurally rather than imported from the conversation package:
 * the union gained a `kind` and a file member with no `previewUrl` over the
 * trains, and naming one train's type would pin the component to that train.
 */
export interface SeatAttachment {
  /** Draft identity, for the owner's remove and retry verbs. */
  id: string
  /** `image`, or `file` from 0.1.3-alpha.2; absent on trains that predate the field. */
  kind?: string | undefined
  /** The browser `File` behind the draft. */
  file: File
  /** Object URL for drafts that have pixels; absent for generic files. */
  previewUrl?: string | undefined
}

/** One file draft's upload, as the seat reports it (0.1.3 onward). */
export type SeatUpload =
  | { readonly status: 'uploading', readonly loaded: number, readonly total?: number | undefined }
  | { readonly status: 'ready' }
  | { readonly status: 'error', readonly message: string }

/**
 * The seat's owner share plus the session-kit members this rail reads.
 *
 * Restated rather than imported, because the seat's props moved between
 * trains: 0.1.3-alpha.2 renamed `onAddImages` → `onAddFiles` and
 * `onRemoveImage` → `onRemoveAttachment`, and added file drafts with
 * `uploads` / `onRetryFile`. Every train-dependent member is optional and the
 * rail calls whichever the running harness supplies — one registration,
 * every train.
 */
export interface SeatProps {
  /** Browser-owned draft attachments in input order. */
  attachments: readonly SeatAttachment[]
  /** Whether the composer takes a drop now; absent means it always does. */
  canAcceptDrop?: boolean | undefined
  /** Add one dropped batch through the composer's validation path (name up to 0.1.2). */
  onAddImages?: ((files: readonly File[]) => void) | undefined
  /** Add one dropped batch through the composer's validation path (name from 0.1.3-alpha.2). */
  onAddFiles?: ((files: readonly File[]) => void) | undefined
  /**
   * Remove one draft attachment through the service (name up to 0.1.2).
   *
   * Method shorthand is load-bearing: the id is branded by the conversation
   * package (`DraftAttachmentId`), and the brand's symbol is not importable
   * without naming one train — a method signature is checked bivariantly, so
   * the owner's branded parameter still satisfies this plain-string one.
   */
  onRemoveImage?(id: string): void
  /** Remove one draft attachment through the service (name from 0.1.3-alpha.2). */
  onRemoveAttachment?(id: string): void
  /** Upload state per file draft (0.1.3-alpha.2 onward). */
  uploads?: Readonly<Record<string, SeatUpload>> | undefined
  /** Restart one failed file upload (0.1.3-alpha.2 onward). */
  onRetryFile?(id: string): void
  /** Display-ready image limits for the drop invitation. */
  dropLimits?: DropLimits | undefined
  /**
   * Session facts from the standard kit (0.1.2 onward), read for `running`
   * only: while a turn runs, the composer's primary control is Stop.
   */
  useSession?: (<S>(selector: (session: { running?: boolean }) => S) => S | undefined) | undefined
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

/** One item in the rail: a composer draft, or a staged reference. */
type RailItem =
  | {
    row: 'seat'
    key: string
    name: string
    kind: DropKind
    /** Thumbnail or preview URL. */
    url: string | undefined
    /** Preview-store key, for drafts whose bytes this page keeps. */
    assetKey: string | undefined
    size: number
    upload: SeatUpload | undefined
    remove: () => void
    retry: (() => void) | undefined
  }
  | {
    row: 'staged'
    key: string
    entry: AttachedFile
    name: string
    kind: RailKind
    asset: DropAsset | undefined
    remove: () => void
  }

/** The key a composer draft's preview material is stored under. */
function seatKey(id: string): string {
  return `seat:${id}`
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
 * A folder card's leading glyph.
 * @returns the glyph element.
 */
function FolderIcon(): ReactNode {
  return (
    <span className="dshdrop-glyph" data-folder="" aria-hidden="true">
      <FolderGlyph size={26} />
    </span>
  )
}

/**
 * The counts part of a folder card's meta line.
 * @param entry - the folder's staged entry.
 * @param t - the translator.
 * @returns the parts, in reading order.
 */
function folderMeta(entry: AttachedFile, t: DropRailProps['t']): string[] {
  const summary = entry.summary
  if (entry.status === 'pending') {
    const progress = entry.progress
    if (progress === undefined) return [t('state.scanning')]
    return [
      t('state.uploadingFiles', { done: String(progress.done), total: String(progress.total) }),
      formatDropBytes(progress.totalBytes),
    ]
  }
  if (summary === undefined) return []
  const parts = [
    summary.truncated
      ? t('meta.filesAtLeast', { count: String(summary.files) })
      : summary.files === 1 ? t('meta.oneFile') : t('meta.files', { count: String(summary.files) }),
    formatDropBytes(summary.bytes),
  ]
  if (summary.ignored > 0) parts.push(t('meta.ignored', { count: String(summary.ignored) }))
  if (summary.unreadable > 0) parts.push(t('meta.unreadable', { count: String(summary.unreadable) }))
  return parts
}

/**
 * The status part of a card's meta line.
 * @param item - the card's item.
 * @param t - the translator.
 * @returns the status text, or empty when there is nothing to say.
 */
function statusOf(item: RailItem, t: DropRailProps['t']): string {
  if (item.row === 'staged') {
    // A pending folder says how far it is in its counts instead.
    if (item.entry.status === 'pending') return item.kind === 'folder' ? '' : t('state.staging')
    if (item.entry.how === 'in-place') return t('state.inPlace')
    if (item.entry.how === 'copied') return t('state.copied')
    return ''
  }
  const upload = item.upload
  if (upload === undefined || upload.status === 'ready') return ''
  if (upload.status === 'error') return t('state.failed')
  const total = upload.total ?? item.size
  const percent = total > 0 ? Math.min(100, Math.floor((upload.loaded / total) * 100)) : 0
  return t('state.uploading', { percent: `${percent}%` })
}

/**
 * One card in the rail.
 *
 * A thumbnail for anything with pixels, an identity row (format, name, size,
 * state) for anything without. A card's job is to let the user confirm the
 * right file is attached and see whether it is ready.
 * @param props - the item, its preview URL, the open callback, the translator.
 * @returns the card and its controls.
 */
function Card({ item, url, onOpen, onRemove, t }: {
  item: RailItem
  url: string | undefined
  onOpen: () => void
  onRemove: () => void
  t: DropRailProps['t']
}): ReactNode {
  const size = item.row === 'seat' ? item.size : item.entry.size ?? item.asset?.size ?? 0
  const folder = item.row === 'staged' && item.kind === 'folder'
  const thumbnail = THUMBNAIL_KINDS.includes(item.kind) && url !== undefined
  const status = statusOf(item, t)
  const busy = item.row === 'staged' ? item.entry.status === 'pending' : item.upload?.status === 'uploading'
  const failed = item.row === 'seat' && item.upload?.status === 'error'
  const counts = folder ? folderMeta(item.entry, t) : [formatDropBytes(size)]
  const meta = [t(KIND_LABEL[item.kind]), ...counts, status].filter((part) => part !== '').join(' · ')
  const path = item.row === 'staged' ? item.entry.path : undefined
  // A folder's meta line is the longest, and the card clips it; the tooltip
  // keeps all of it.
  const title = folder ? [path ?? item.name, meta].join('\n') : path ?? item.name
  // A folder reads as one: its name carries the separator a mention gives it.
  const label = folder ? `${item.name}/` : item.name

  return (
    <div
      className="dshdrop-item"
      data-dshdrop-key={item.key}
      data-state={failed ? 'error' : busy ? 'busy' : undefined}
      data-kind={folder ? 'folder' : undefined}
      aria-busy={busy || undefined}
    >
      {thumbnail
        ? (
          <button
            type="button"
            className="dshdrop-thumb"
            aria-label={t('action.open', { name: item.name })}
            title={title}
            onClick={onOpen}
          >
            {item.kind === 'image'
              ? <img src={url} alt="" />
              // `#t=0.1` asks the element to seek past the first frame, which
              // is black in most containers; without it the card is a void.
              : <video src={`${url ?? ''}#t=0.1`} muted playsInline preload="metadata" />}
            {item.kind === 'video' && (
              <span className="dshdrop-play" aria-hidden="true">
                <PlayGlyph size={11} />
              </span>
            )}
          </button>
        )
        : (
          <button
            type="button"
            className="dshdrop-doc"
            aria-label={t('action.open', { name: label })}
            title={title}
            onClick={onOpen}
          >
            {folder ? <FolderIcon /> : <Glyph name={item.name} />}
            <span className="dshdrop-lines">
              <span className="dshdrop-name">{label}</span>
              <span className="dshdrop-meta">{meta}</span>
            </span>
          </button>
        )}
      {item.row === 'seat' && item.retry !== undefined && failed && (
        <button
          type="button"
          className="dshdrop-retry"
          aria-label={t('action.retry', { name: item.name })}
          title={item.upload?.status === 'error' ? item.upload.message : undefined}
          onClick={item.retry}
        >
          <RetryGlyph size={12} />
        </button>
      )}
      <button
        type="button"
        className="dshdrop-remove"
        aria-label={t('action.remove', { name: label })}
        onClick={onRemove}
      >
        <CloseGlyph size={10} />
      </button>
    </div>
  )
}

/**
 * A folder entry's listing for the preview dialog.
 * @param entry - the folder's staged entry.
 * @returns the paths and how many files went unlisted, or undefined while unknown.
 */
function listingFor(entry: AttachedFile): FolderListing | undefined {
  if (entry.listing === undefined || entry.summary === undefined) return undefined
  const more = Math.max(0, entry.summary.files - entry.listing.length)
  return { paths: entry.listing, more, atLeast: entry.summary.truncated }
}

/**
 * The composer's attachment rail.
 *
 * Renders only a hidden anchor while nothing is attached, the same posture the
 * shipped entry takes: an absent strip costs no layout inside the composer
 * card. The anchor is what places this mount inside its composer card, so the
 * listeners can tell which composer a gesture landed on.
 * @param props - attachment owner share, injected preview face, locale seat.
 * @returns the rail.
 */
export function DropRail(props: DropRailProps): ReactNode {
  const {
    attachments, canAcceptDrop, onAddImages, onAddFiles, onRemoveImage, onRemoveAttachment,
    uploads, onRetryFile, dropLimits, useSession, useInput, inputActions, sessionId,
    assetOf, putAsset, releaseAsset, textOf, register, access, onLegacyComposer,
    useAttached, detach, t,
  } = props
  const attached = useAttached((staged) => staged)
  const [open, setOpen] = useState<string | null>(null)
  const anchorRef = useRef<HTMLSpanElement | null>(null)

  // One verb per concern, whichever name the running harness publishes.
  const addFiles = onAddFiles ?? onAddImages
  const removeAttachment = onRemoveAttachment ?? onRemoveImage

  // The whole input state, read as an opaque snapshot: its fields vary by
  // train, and `snapshotOf` keeps only the ones the send path needs.
  const rawInput: unknown = useInput((state: unknown) => state)
  const running = useSession?.((session) => session.running === true) ?? false
  const uploadsPending = attachments.some(
    (attachment) => attachment.kind === 'file' && uploads?.[attachment.id]?.status !== 'ready',
  )

  // Everything the registered handle reads, refreshed every render. The
  // handle is registered once per session; reading through this ref keeps it
  // current without re-registering on every keystroke.
  const latest = useRef({
    attachments, canAcceptDrop, dropLimits, addFiles, rawInput, running, uploadsPending,
    actions: inputActions as unknown as ActionsLike | undefined,
  })
  latest.current = {
    attachments, canAcceptDrop, dropLimits, addFiles, rawInput, running, uploadsPending,
    actions: inputActions as unknown as ActionsLike | undefined,
  }

  useEffect(() => {
    const cardOf = (): Element | null => anchorRef.current?.closest('[data-composer-card]') ?? null
    const liveInput = (): InputSnapshot | undefined => {
      if (sessionId !== undefined) {
        // The session's own store answers the state as of this instant; the
        // last render can trail it by one edit.
        const store = access.inputOf(sessionId)?.state
        if (typeof store?.getSnapshot === 'function') {
          const live = snapshotOf(store.getSnapshot())
          if (live !== undefined) return live
        }
      }
      return snapshotOf(latest.current.rawInput)
    }
    const composer = sessionId === undefined
      ? undefined
      : composerFace({
        sessionId,
        input: liveInput,
        actions: () => latest.current.actions,
        scope: () => access.scopeOf(sessionId),
        uploadsPending: () => latest.current.uploadsPending,
        running: () => latest.current.running,
      })
    const handle: RailHandle = {
      sessionId,
      contains: (target) => {
        const card = cardOf()
        return card !== null && target instanceof Node && card.contains(target)
      },
      canAcceptDrop: () => latest.current.canAcceptDrop ?? true,
      dropLimits: () => latest.current.dropLimits,
      addFiles: (files) => {
        const intake = latest.current.addFiles
        if (intake === undefined) return
        const fresh = freshFiles(latest.current.attachments.map((attachment) => attachment.file), files)
        if (fresh.length > 0) intake(fresh)
      },
      composer,
    }
    const card = cardOf()
    if (card !== null && card.querySelector('textarea') !== null && card.querySelector('[data-composer-input]') === null) {
      onLegacyComposer()
    }
    return register(handle)
  }, [register, access, sessionId, onLegacyComposer])

  // Composer file drafts carry no preview URL; their bytes are kept here for
  // the card and the lightbox (recorded while the items are built, which is
  // idempotent per key), and let go the moment the draft leaves.
  const seatKeys = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const live = new Set(attachments.filter((attachment) => attachment.previewUrl === undefined)
      .map((attachment) => seatKey(attachment.id)))
    for (const key of seatKeys.current) if (!live.has(key)) releaseAsset(key)
    seatKeys.current = live
  }, [attachments, releaseAsset])
  useEffect(() => () => {
    for (const key of seatKeys.current) releaseAsset(key)
    seatKeys.current = new Set()
  }, [releaseAsset])

  const items = useMemo<RailItem[]>(() => {
    const drafts: RailItem[] = attachments.map((attachment) => {
      const assetKey = attachment.previewUrl === undefined ? seatKey(attachment.id) : undefined
      if (assetKey !== undefined) putAsset(assetKey, attachment.file)
      const kind: DropKind = attachment.kind === 'file'
        ? dropKindOf(attachment.file.name, attachment.file.type)
        : attachment.previewUrl !== undefined ? 'image' : dropKindOf(attachment.file.name, attachment.file.type)
      return {
        row: 'seat',
        key: `seat:${attachment.id}`,
        name: attachment.file.name,
        kind,
        url: attachment.previewUrl ?? (assetKey === undefined ? undefined : assetOf(assetKey)?.url),
        assetKey,
        size: attachment.file.size,
        upload: uploads?.[attachment.id],
        remove: () => { removeAttachment?.(attachment.id) },
        retry: onRetryFile === undefined ? undefined : () => { onRetryFile(attachment.id) },
      }
    })
    const staged: RailItem[] = attached.map((entry) => {
      const asset = assetOf(entry.key)
      return {
        row: 'staged',
        key: entry.key,
        entry,
        // The name the user dropped: a copy may have been suffixed on disk
        // (`notes-2.md`), and the card's tooltip carries the real path.
        name: entry.name === '' && entry.path !== undefined ? fileNameOf(entry.path) : entry.name,
        kind: entry.kind === 'directory' ? 'folder' : asset?.kind ?? dropKindOf(entry.name, ''),
        asset,
        // Drafts and staged files are held by different owners; a card only
        // knows it has a remove verb.
        remove: () => { detach(entry.id) },
      }
    })
    // Drafts first, then staged files. The two lists carry independent orders
    // — one is the composer's attachment array, the other this plugin's
    // staging list — so there is no single sequence to interleave them into.
    return [...drafts, ...staged]
  }, [attachments, attached, uploads, assetOf, putAsset, removeAttachment, onRetryFile, detach])

  const overflow = useRailOverflow(items.length)
  const previewed = items.find((item) => item.key === open) ?? null

  // An item can leave while its preview is open — the user removes it, or a
  // send clears it. Close rather than strand a dialog over a file that is no
  // longer attached.
  useEffect(() => {
    if (open !== null && previewed === null) setOpen(null)
  }, [open, previewed])

  // Removing a card removes its focused remove control with it, and the
  // browser would drop focus to <body>. Focus moves to the neighbouring card
  // instead, or back to the composer's input once the rail is empty — only
  // when the press came from inside the rail, and only once the card's owner
  // has actually removed it (see `rail-focus.ts`).
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const pendingFocus = useRef<PendingFocus | null>(null)
  const removeItem = (item: RailItem): void => {
    const active = document.activeElement
    if (active !== null && wrapRef.current?.contains(active) === true) {
      pendingFocus.current = planRemovalFocus(items.map((one) => one.key), item.key)
    }
    item.remove()
  }
  useEffect(() => {
    const pending = pendingFocus.current
    if (pending === null) return
    const wrap = wrapRef.current
    const active = document.activeElement
    const focus = active === null || active === document.body
      ? 'lost'
      : wrap?.contains(active) === true ? 'rail' : 'elsewhere'
    const decision = settleRemovalFocus(pending, items.map((one) => one.key), focus)
    if (decision === 'wait') return
    pendingFocus.current = null
    if (decision === 'drop') return
    const target = decision === 'composer'
      ? anchorRef.current?.closest('[data-composer-card]')
        ?.querySelector<HTMLElement>('[data-composer-input], textarea')
      : Array.from(wrap?.querySelectorAll<HTMLElement>('[data-dshdrop-key]') ?? [])
        .find((card) => card.dataset.dshdropKey === decision.card)
        ?.querySelector<HTMLElement>('.dshdrop-remove')
    target?.focus()
  }, [items])

  const previewKey = previewed === null || previewed.kind !== 'text'
    ? null
    : previewed.row === 'staged' ? previewed.entry.key : previewed.assetKey ?? null
  const previewText = usePreviewText(previewKey, textOf)

  const anchor = <span ref={anchorRef} hidden data-dshdrop-rail="" />
  if (items.length === 0) return anchor

  const previewAsset = (item: RailItem): DropAsset | undefined => {
    if (item.row === 'staged' && item.kind === 'folder') {
      // No bytes behind a folder; the dialog's header reads its total size.
      return { name: item.name, mediaType: '', size: item.entry.summary?.bytes ?? 0, kind: 'file', url: undefined }
    }
    if (item.row === 'staged') return item.asset
    if (item.assetKey !== undefined) return assetOf(item.assetKey)
    // A draft image's preview URL belongs to the composer, not to this plugin,
    // so its preview material is assembled here.
    return { name: item.name, mediaType: '', size: item.size, kind: 'image', url: item.url }
  }

  return (
    <div className="dshdrop-rail-wrap" ref={wrapRef}>
      {anchor}
      <div className="dshdrop-rail" ref={overflow.ref} role="group" aria-label={t('rail.label')}>
        {items.map((item) => (
          <Card
            key={item.key}
            item={item}
            url={item.row === 'seat' ? item.url : item.asset?.url}
            onOpen={() => { setOpen(item.key) }}
            onRemove={() => { removeItem(item) }}
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
          <ChevronLeftGlyph size={14} />
        </button>
      )}
      {overflow.atEnd && (
        <button
          type="button"
          className="dshdrop-arrow dshdrop-arrowRight"
          aria-label={t('action.scrollRight')}
          onClick={() => { overflow.page(1) }}
        >
          <ChevronRightGlyph size={14} />
        </button>
      )}
      {previewed !== null && (
        <DropLightbox
          name={previewed.row === 'staged' && previewed.kind === 'folder' ? `${previewed.name}/` : previewed.name}
          asset={previewAsset(previewed)}
          text={previewText}
          folder={previewed.row === 'staged' && previewed.kind === 'folder'}
          listing={previewed.row === 'staged' && previewed.kind === 'folder' ? listingFor(previewed.entry) : undefined}
          onClose={() => { setOpen(null) }}
          t={t}
        />
      )}
    </div>
  )
}
