/**
 * Browser half: take every file drop and paste, and give each one the path it
 * should take.
 *
 * This plugin occupies the composer's attachment seat, which took the shipped
 * entry's drop listeners down with it, so its own listeners are the only ones
 * left. They sit on `document` in CAPTURE phase and stop the transfer there.
 * The trains without that seat (0.1.0-rc.7 and earlier) keep the composer's
 * own image-only listeners on `document` in the bubble phase; stopping the
 * transfer in the capture phase is what keeps them from taking the images a
 * second time and from discarding everything else. Each transfer is routed to
 * the composer it landed on (the page can hold more than one) and split:
 *
 * - **Images** the composer encodes natively (PNG, JPEG, WebP, GIF) go to that
 *   composer's own validated intake, and become ordinary image attachments.
 * - **Every other file** is acquired as a path — referenced in place when the
 *   desktop app or the drag itself vouches for one, copied to the Host
 *   otherwise — and held beside the draft as a staged reference, never
 *   written into it. `submit-guard.ts` appends the mentions as the message is
 *   sent, so a dropped file leaves the text box exactly as the user typed it.
 * - **Folders** become one reference each, `@/path/to/folder/`: referenced in
 *   place when the desktop app or the drag vouches for a path, otherwise
 *   walked and copied to the Host with their structure (`folder-acquire.ts`).
 *   Images inside a folder travel with the folder, not as image attachments.
 *
 * Drop and paste are the same operation behind two gestures: both carry a
 * `DataTransfer`, both are claimed by the same rule, and both end in the same
 * pipeline. Only the event plumbing differs.
 * @module @crosery/dsh-drop/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only throughout. These pull the Context merges that give `ctx` its
// services; a value import would fail the client bundle-purity contract and, at
// runtime, need a specifier the loader's module table cannot answer.
//
// `dsh-client-runtime` is deliberately NOT imported: it stopped publishing
// after 0.1.1, and from 0.1.2 the slot registry is declared by
// `dsh-client-ui-renderer` while the session services moved to
// `dsh-api-session-controller`. The two services this entry reads are declared
// structurally below instead, so one build serves every train.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import {
  claimsTransfer as claimsTransferShape, mentionFor, pasteTextIsFileNames, planDrop, uriListPaths,
  type DroppedEntry, type StagedCandidate,
} from '../contract.ts'
import { createOverlay } from './overlay.ts'
import { createToast } from './toast.ts'
import { messages } from './messages.ts'
import { installReferenceFit } from './reference-fit.ts'
import { installDropStyles } from './styles.ts'
import { installPreviewRail } from './rail-entry.ts'
import type { RailHandle, SessionAccess, SessionInputLike } from './DropRail.tsx'
import { AttachedFiles } from './attached.ts'
import { installSubmitGuard } from './submit-guard.ts'
import { PreviewStore } from './preview-store.ts'
import { acquire, bridgePath, hostPathBridge } from './acquire.ts'
import { EntryJobs, stageFiles } from './staging-jobs.ts'
import { acquireFolder, countFolder } from './folder-acquire.ts'
import type { EntryLike } from '../folder.ts'
import { RailRegistry, type RailRoute } from './registry.ts'
import type { ScopeLike } from './composer-face.ts'
import type { DraftImage, DraftImages, ImageLimits, ImageRefusal } from './early-composer.ts'

export { createOverlay } from './overlay.ts'
export type { Overlay, OverlayState } from './overlay.ts'
export { createToast } from './toast.ts'
export { messages } from './messages.ts'
export type { Messages } from './messages.ts'
export { installReferenceFit } from './reference-fit.ts'
export { installDropStyles } from './styles.ts'
export { installPreviewRail } from './rail-entry.ts'
export type { RailDeps } from './rail-entry.ts'
export { AttachedFiles, composeSubmission } from './attached.ts'
export type { AttachedFile, AttachedInput, AttachedKind, AttachedStatus } from './attached.ts'
export { installSubmitGuard, isSendKey } from './submit-guard.ts'
export type { SubmitGuardDeps } from './submit-guard.ts'
export {
  appendMentions, composerFace, snapshotOf, withdrawMentions,
} from './composer-face.ts'
export type { Appended, ComposerFace, ComposerParts, InputSnapshot } from './composer-face.ts'
export {
  acceptsSubmission, appendSpan, detectEnd, insertedSpan, isLexicalSendKey, isModifiedSendKey, lexicalEnterVerdict,
  mentionBlock, primaryRoleOf, sendButtonVerdict, sendObserved,
} from './send-plan.ts'
export type { ComposerFacts, KeyFacts, PrimaryRole, SendVerdict } from './send-plan.ts'
export { RailRegistry } from './registry.ts'
export type { RailRecord, RailRoute } from './registry.ts'
export { PreviewStore } from './preview-store.ts'
export type { DropAsset } from './preview-store.ts'
export { DropRail } from './DropRail.tsx'
export type {
  DropRailInjected, DropRailProps, RailHandle, SeatAttachment, SeatUpload, SessionAccess, SessionInputLike,
} from './DropRail.tsx'
export { DockRail } from './DockRail.tsx'
export type { DockRailInjected, DockRailProps } from './DockRail.tsx'
export { DOCK_SLOT, REGION_SELECTOR, SEAT_SLOT, SeatWatch, wireRailSeats } from './rail-seats.ts'
export type { RailPlacement, RailRegistrations, SlotDeclarations } from './rail-seats.ts'
export {
  acceptsDrop, addToDraft, draftImageIds, dropLimitsOf, imageLimitsOf, intakeImages,
} from './early-composer.ts'
export type {
  DraftImage, DraftImages, DropLimits, ImageFile, ImageIntake, ImageIntakeResult, ImageLimits, ImageRefusal,
} from './early-composer.ts'
export { DropLightbox, usePreviewText } from './DropLightbox.tsx'
export type { DropLightboxProps } from './DropLightbox.tsx'
export { DROP_NS, en, zh } from './locales.ts'
export type { DropKey } from './locales.ts'
export { acquire, bridgePath, hintFor, hostPathBridge } from './acquire.ts'
export type { Acquired, Acquisition, HostPathBridge } from './acquire.ts'
export { EntryJobs, linked, stageFiles } from './staging-jobs.ts'
export type { StageFilesDeps } from './staging-jobs.ts'
export { acquireFolder, countFolder, HostRefusal } from './folder-acquire.ts'
export type { FolderOutcome, FolderProgress } from './folder-acquire.ts'
export { listingOf, sampleOf, walkFolder } from '../folder.ts'
export type { EntryLike, ReaderLike, WalkedFile, WalkOptions, WalkResult } from '../folder.ts'
export {
  claimsTransfer as claimsTransferShape, fileNameOf, freshFiles, mentionFor, pasteTextIsFileNames,
  planDrop, uriListPaths,
} from '../contract.ts'
export type { DropPlan, DroppedEntry, StagedCandidate, TransferShape } from '../contract.ts'
export {
  dropKindOf, extensionOf, formatDropBytes, kindBadge, looksBinary, mediaTypeFor,
} from '../preview.ts'
export type { DropKind } from '../preview.ts'

export const name = '@crosery/dsh-drop'

/**
 * The client session-service slice this plugin reads, declared structurally.
 *
 * `sessions` is declared by `@deepseek-ai/dsh-client-runtime` up to harness
 * 0.1.1 and by `@deepseek-ai/dsh-api-session-controller` from 0.1.2, and the
 * former stopped publishing. Importing either one pins this build to a single
 * train, so the one member this plugin calls is declared here and the service
 * is read by name. The selected session is NOT read from here: 0.1.7 removed
 * `list.getSnapshot().current`, and each composer's rail knows its own.
 */
interface DropSessions {
  /** The Agent scope for one session, or undefined while it is unknown. */
  scope(id: string): unknown
}

/**
 * The conversation-service slice this plugin reads.
 *
 * The draft-image members are the early trains' (0.0.1-rc.5 – 0.1.0-rc.7),
 * where the dock rail feeds the composer's own draft images; later trains
 * hand the seat an intake instead, so they are optional.
 */
interface DropConversation {
  readonly input: { for(actx: never): SessionInputLike }
  createDraftImages?(files: readonly File[]): readonly DraftImage<File>[]
  draftImages?(ids: readonly never[]): readonly DraftImage<File>[]
  releaseDraftImages?(images: readonly never[]): void
}

/**
 * Whether this plugin claims a transfer.
 * @param transfer - the transfer's DataTransfer, possibly null.
 * @returns true when it carries at least one file.
 */
export function claimsTransfer(transfer: DataTransfer | null): boolean {
  if (transfer === null) return false
  let fileItems = 0
  for (const item of transfer.items) {
    if (item.kind === 'file') fileItems += 1
  }
  return claimsTransferShape({ types: [...transfer.types], fileItems, files: transfer.files.length })
}

/**
 * Read transfer entries while the DataTransfer is still valid.
 *
 * `getAsFile()`, `webkitGetAsEntry()` and the desktop bridge's `pathFor` are
 * all called synchronously inside the event handler — the item list is
 * neutered as soon as the handler yields, so a single `await` before this runs
 * loses the whole transfer.
 * @param transfer - the drop or paste DataTransfer.
 * @returns entries in transfer order.
 */
export function readEntries(transfer: DataTransfer): DroppedEntry<File, FileSystemEntry>[] {
  const bridge = hostPathBridge()
  const entries: DroppedEntry<File, FileSystemEntry>[] = []
  for (const item of transfer.items) {
    if (item.kind !== 'file') continue
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    const file = item.getAsFile()
    entries.push({
      file,
      isDirectory: entry?.isDirectory ?? false,
      path: file === null ? undefined : bridgePath(file, bridge),
      entry: entry ?? undefined,
    })
  }
  // Some browsers populate `files` but not `items`; fall back rather than drop.
  if (entries.length === 0) {
    for (const file of transfer.files) {
      entries.push({ file, isDirectory: false, path: bridgePath(file, bridge) })
    }
  }
  return entries
}

/**
 * Read the path hints a transfer carries, if any.
 *
 * Must also run synchronously: `getData` on a neutered DataTransfer returns the
 * empty string, which is indistinguishable from a transfer that never carried
 * the flavor at all.
 * @param transfer - the drop or paste DataTransfer.
 * @returns absolute paths in list order; empty when the platform withheld them.
 */
export function readHints(transfer: DataTransfer): string[] {
  const hints = uriListPaths(transfer.getData('text/uri-list'))
  if (hints.length > 0) return hints
  // Some sources put the file URL on the plain-text flavor instead.
  return uriListPaths(transfer.getData('text/plain'))
}

/**
 * Whether an element takes typed text on its own, outside any composer.
 * @param target - an event target.
 * @returns true for inputs, textareas and contenteditable hosts.
 */
function isForeignEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('[data-composer-card]') !== null) return false
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true
  return target instanceof HTMLElement && target.isContentEditable
}

/**
 * Mount the capture-phase transfer handling.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  // The bytes behind every attachment this page shows, so a card can be the
  // file it stands for rather than its name alone. Owned here because object
  // URLs outlive the elements that use them.
  const previews = new PreviewStore()
  ctx.effect(() => () => { previews.dispose() }, '@crosery/dsh-drop: preview material')
  // Aborted when the plugin goes: every acquisition in flight stops with it.
  const aborter = new AbortController()
  // Acquisitions by entry id, files and folders alike: removing the card
  // aborts its upload (the Host drops a folder's batch), and the queue moves on.
  const jobs = new EntryJobs(aborter.signal)
  // Files staged for the next message, held beside the draft the way the
  // composer holds its attachment ids — which is what keeps the text box
  // clean. An entry that leaves (sent or removed) lets its bytes go.
  const attached = new AttachedFiles((entry) => {
    previews.release(entry.key)
    jobs.cancel(entry.id)
  })
  const registry = new RailRegistry<RailHandle>()
  const toast = createToast()
  ctx.effect(() => () => { toast.dispose() }, '@crosery/dsh-drop: toast')

  // The session services, filled while `sessions` and `conversation` are
  // present. The rail and the listeners read through this one holder.
  let sessions: DropSessions | undefined
  let conversation: DropConversation | undefined
  const access: SessionAccess = {
    inputOf: (sessionId) => {
      const agent = sessions?.scope(sessionId)
      if (agent === undefined || conversation === undefined) return undefined
      try {
        return conversation.input.for(agent as never)
      } catch {
        return undefined
      }
    },
    scopeOf: (sessionId) => sessions?.scope(sessionId) as ScopeLike | undefined,
  }

  /**
   * Raise a notice in a session's composer, or as a toast when there is none.
   *
   * Never silent: a drop that does nothing without saying why reads as a
   * broken drop.
   */
  const notify = (sessionId: string | undefined, level: 'info' | 'error', text: string): void => {
    const input = sessionId === undefined ? undefined : access.inputOf(sessionId)
    if (input !== undefined && typeof input.notify === 'function') {
      input.notify(level, text)
      return
    }
    toast.show(text)
  }

  // The reference-chip CSS applies only to the textarea composer (0.1.0–0.1.1),
  // installed the first time a rail reports one.
  let referenceFit: (() => void) | undefined
  ctx.effect(() => () => {
    referenceFit?.()
    referenceFit = undefined
  }, '@crosery/dsh-drop: reference fit')
  const onLegacyComposer = (): void => {
    referenceFit ??= installReferenceFit()
  }

  // The composer's draft images, for the dock rail's image intake on the
  // trains without an attachment seat. Ids and descriptors travel back to the
  // service exactly as it minted them.
  const images: DraftImages<File> = {
    create: (files) => conversation?.createDraftImages?.(files),
    held: (ids) => conversation?.draftImages?.(ids as never[]) ?? [],
    release: (created) => { conversation?.releaseDraftImages?.(created as never[]) },
  }
  const refuseImages = (sessionId: string, reason: ImageRefusal, limits: ImageLimits | undefined): void => {
    notify(sessionId, 'error', messages().imageRefused(reason, limits))
  }

  installDropStyles(ctx)
  installPreviewRail(ctx, { store: previews, attached, registry, access, onLegacyComposer, images, refuseImages })
  // The staged paths reach the model only because this guard appends them to
  // the message as it is sent.
  ctx.effect(
    () => installSubmitGuard({
      composerAt: (target) => registry.at(target)?.composer,
      staged: (sessionId) => attached.list(sessionId),
      onSent: (sessionId, ids) => { attached.clear(sessionId, ids) },
      notify,
      copy: () => messages(),
    }),
    '@crosery/dsh-drop: submit guard',
  )

  ctx.inject(['sessions', 'conversation'], (scoped) => {
    scoped.effect(() => {
      // Read by name rather than through the ambient merge: every harness train
      // declares `ctx.sessions`, but each declares it from a different package,
      // so the value is narrowed once to the slice this plugin calls.
      sessions = scoped.get('sessions') as unknown as DropSessions | undefined
      conversation = scoped.get('conversation') as unknown as DropConversation | undefined
      return () => {
        sessions = undefined
        conversation = undefined
      }
    }, '@crosery/dsh-drop: session services')
  })

  const overlay = createOverlay()
  let depth = 0

  /** Acquire staged candidates for one session, one at a time. */
  const stageAll = (
    sessionId: string,
    candidates: readonly StagedCandidate<File>[],
    hints: readonly string[],
  ): Promise<void> => stageFiles<File>({
    attached,
    jobs,
    preview: (key, file) => { previews.put(key, file) },
    acquire,
    failed: (id, count) => { notify(id, 'error', messages().failed(count)) },
  }, sessionId, candidates, hints)

  /**
   * Acquire dropped folders for one session, one folder at a time.
   *
   * Each folder shows up in the rail at once as `pending`, and a send waits
   * for it. A folder the desktop app has a path for is ready immediately and
   * only counted for its card; any other is walked and, unless a drag hint
   * checks out, copied. A folder that fails says so and leaves the rest of
   * the drop alone.
   */
  const stageFolders = async (
    sessionId: string,
    folders: readonly DroppedEntry<File, FileSystemEntry>[],
    hints: readonly string[],
  ): Promise<void> => {
    const copy = messages()
    const queued = folders.map((folder) => {
      const name = folder.entry?.name ?? folder.file?.name ?? ''
      const entry = attached.add(sessionId, { kind: 'directory', status: 'pending', name })
      return { folder, name, entry, waiting: jobs.open(entry.id) }
    })
    for (const { folder, name, entry, waiting } of queued) {
      if (jobs.closed) return
      if (waiting.aborted) continue
      const { signal, release } = jobs.run(entry.id)
      const root = folder.entry as unknown as EntryLike<File> | undefined
      try {
        if (folder.path !== undefined && mentionFor(folder.path, 'directory') !== undefined) {
          attached.update(sessionId, entry.id, { status: 'ready', path: folder.path, how: 'in-place' })
          if (root !== undefined) {
            const counted = await countFolder(root, signal)
            attached.update(sessionId, entry.id, counted)
          }
          continue
        }
        if (root === undefined) throw new Error('the browser gave no folder entry')
        const outcome = await acquireFolder(root, name, hints, signal, (progress) => {
          attached.update(sessionId, entry.id, { progress })
        })
        if (!outcome.ok) {
          attached.remove(sessionId, entry.id)
          notify(sessionId, 'error', outcome.reason === 'empty'
            ? copy.folderEmpty(name)
            : copy.folderOverLimit(name, outcome.limit, outcome.limits))
          continue
        }
        if (mentionFor(outcome.path, 'directory') === undefined) throw new Error('folder path cannot be referenced')
        attached.update(sessionId, entry.id, {
          status: 'ready', path: outcome.path, how: outcome.how,
          summary: outcome.summary, listing: outcome.listing, progress: undefined,
        })
      } catch (error) {
        // Removed by the user, or the plugin is going: nothing to report.
        if (signal.aborted) continue
        console.warn('[dsh-drop] could not acquire a folder', error)
        // A folder already referenced in place stays; only its count failed.
        if (attached.list(sessionId).some((one) => one.id === entry.id && one.status === 'pending')) {
          attached.remove(sessionId, entry.id)
          notify(sessionId, 'error', copy.folderFailed(name))
        }
      } finally {
        release()
      }
    }
  }

  /**
   * The shared tail of both gestures: route, split, hand over, acquire.
   * @param transfer - the drop or paste DataTransfer, still valid.
   * @param route - the composer it belongs to.
   */
  const consume = (transfer: DataTransfer, route: RailRoute<RailHandle> | undefined): void => {
    const plan = planDrop(readEntries(transfer))
    const hints = readHints(transfer)
    const copy = messages()
    if (route === undefined) {
      notify(undefined, 'error', copy.noSession)
      return
    }
    const { rail, blocked } = route
    // A route is open only with a session and an accepting seat; the
    // composer's own rules decide the rest (a subagent's composer, one mid-send).
    if (blocked || rail.sessionId === undefined) {
      notify(rail.sessionId, 'error', rail.sessionId === undefined ? copy.noSession : copy.blocked)
      return
    }
    // Each part of a mixed drop goes its own way, and one refused item never
    // takes the others down with it.
    if (plan.images.length > 0) rail.addFiles(plan.images)
    if (plan.staged.length > 0) void stageAll(rail.sessionId, plan.staged, hints)
    if (plan.folders.length > 0) void stageFolders(rail.sessionId, plan.folders, hints)
  }

  let watchdog: ReturnType<typeof setTimeout> | undefined
  const reset = (): void => {
    depth = 0
    if (watchdog !== undefined) clearTimeout(watchdog)
    watchdog = undefined
    overlay.hide()
  }

  /**
   * Take the overlay down when the drag goes quiet.
   *
   * A drag over the page fires `dragover` continuously (the HTML processing
   * model repeats it every few hundred milliseconds even while the pointer
   * rests), but a drag cancelled outside the page, or abandoned by the
   * platform, can end without the final `dragleave` — and a full-page overlay
   * left standing would cover the app.
   */
  const armWatchdog = (): void => {
    if (watchdog !== undefined) clearTimeout(watchdog)
    watchdog = setTimeout(reset, 1500)
  }

  /** Show the overlay for the composer a drag is over. */
  const showFor = (target: EventTarget | null): RailRoute<RailHandle> | undefined => {
    const route = registry.route(target)
    overlay.show({
      blocked: route === undefined || route.blocked,
      noSession: route === undefined || route.rail.sessionId === undefined,
      limits: route?.rail.dropLimits(),
    })
    return route
  }

  const onDragEnter = (event: DragEvent): void => {
    if (!claimsTransfer(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    depth += 1
    showFor(event.target)
    armWatchdog()
  }

  const onDragOver = (event: DragEvent): void => {
    const transfer = event.dataTransfer
    if (!claimsTransfer(transfer)) return
    // preventDefault is what makes the element a drop target at all; without
    // it the browser cancels the drag and no drop event is ever delivered.
    event.preventDefault()
    event.stopPropagation()
    showFor(event.target)
    // Always `copy`, even over a composer that refuses: a refused drop would
    // bounce back with no event at all, and the user would be left with a file
    // that silently did nothing. Accepting it lets the drop say why instead.
    if (transfer !== null) transfer.dropEffect = 'copy'
    armWatchdog()
  }

  const onDragLeave = (event: DragEvent): void => {
    if (!claimsTransfer(event.dataTransfer)) return
    event.stopPropagation()
    depth = Math.max(0, depth - 1)
    if (depth === 0) overlay.hide()
  }

  const onDrop = (event: DragEvent): void => {
    const transfer = event.dataTransfer
    if (!claimsTransfer(transfer) || transfer === null) return
    event.preventDefault()
    event.stopPropagation()
    reset()
    consume(transfer, registry.route(event.target))
  }

  const onPaste = (event: ClipboardEvent): void => {
    const transfer = event.clipboardData
    if (!claimsTransfer(transfer) || transfer === null) return
    // A paste into some other plugin's field is that field's business.
    if (isForeignEditable(event.target)) return
    const route = registry.route(event.target)
    // Read the text before the transfer is consumed: a spreadsheet copy
    // carries real text beside its rendered image, and that text is the point
    // of the paste. Only a plain restatement of the file names is dropped.
    const text = transfer.getData('text/plain')
    const names = [...transfer.files].map((file) => file.name)
    const keepText = text !== '' && !pasteTextIsFileNames(text, names)
    // Taken whole: letting the event through would also hand the files to the
    // composer's own paste path.
    event.preventDefault()
    event.stopPropagation()
    consume(transfer, route)
    if (keepText) insertPastedText(route?.rail, event.target, text)
  }

  /**
   * Put a paste's genuine text where the paste was aimed.
   *
   * 0.1.7 offers an insertion over the live selection, which is exactly a
   * paste; older composers get the browser's own text insertion into the
   * focused input, which their editors handle as typing.
   */
  const insertPastedText = (rail: RailHandle | undefined, target: EventTarget | null, text: string): void => {
    if (rail?.composer?.insertAtSelection(text) === true) return
    const input = target instanceof Element
      ? target.closest<HTMLElement>('[data-composer-input], textarea')
      : null
    if (input === null) return
    input.focus()
    document.execCommand('insertText', false, text)
  }

  ctx.effect(() => {
    document.addEventListener('dragenter', onDragEnter, true)
    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('dragleave', onDragLeave, true)
    document.addEventListener('drop', onDrop, true)
    document.addEventListener('paste', onPaste, true)
    window.addEventListener('dragend', reset)
    return () => {
      aborter.abort()
      jobs.clear()
      document.removeEventListener('dragenter', onDragEnter, true)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('dragleave', onDragLeave, true)
      document.removeEventListener('drop', onDrop, true)
      document.removeEventListener('paste', onPaste, true)
      window.removeEventListener('dragend', reset)
      reset()
      overlay.dispose()
    }
  }, '@crosery/dsh-drop: composer file transfer')
}
