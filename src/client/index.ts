/**
 * Browser half: take the file drops and pastes the shipped composer refuses.
 *
 * The shipped drag handling lives on `document` in bubble phase and forwards
 * every dropped file to the image path, which throws
 * `UnsupportedImageMediaTypeError` on anything that is not PNG/JPEG/WebP/GIF.
 * This plugin's listeners run in CAPTURE phase, so they see the same events
 * first and can call `stopPropagation()` to keep the shipped handler out of a
 * transfer it would only reject. Transfers this plugin does not claim — every
 * file an image the composer accepts — pass through untouched.
 *
 * Drop and paste are the same operation behind two gestures: both carry a
 * `DataTransfer`, both are claimed by the same rule, and both end in the same
 * pipeline. Only the event plumbing differs.
 *
 * A mixed transfer is split rather than taken whole: the image members go to
 * the composer's own validated intake, and the rest are acquired and staged —
 * held beside the draft, never written into it, so a dropped file leaves the
 * text box exactly as the user typed it. `submit-guard.ts` splices their paths
 * into the message as it is sent.
 * @module @crosery/dsh-drop/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only throughout. These pull the Context merges that give `ctx` its
// services; a value import would fail the client bundle-purity contract and, at
// runtime, need a specifier the loader's module table cannot answer.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  claimsFileTypes, mentionFor, planDrop, uriListPaths, type DroppedEntry,
} from '../contract.ts'
import { createOverlay } from './overlay.ts'
import { messages } from './messages.ts'
import { installReferenceFit } from './reference-fit.ts'
import { installDropStyles } from './styles.ts'
import {
  composerBridge, imageIntakeBridge, installPreviewRail,
  type ComposerBridge, type ImageIntakeBridge,
} from './rail-entry.ts'
import { AttachedFiles } from './attached.ts'
import { installSubmitGuard } from './submit-guard.ts'
import { PreviewStore } from './preview-store.ts'
import { acquire, type Acquired } from './acquire.ts'

export { createOverlay } from './overlay.ts'
export { messages } from './messages.ts'
export type { Messages } from './messages.ts'
export { installReferenceFit } from './reference-fit.ts'
export { installDropStyles } from './styles.ts'
export { composerBridge, imageIntakeBridge, installPreviewRail } from './rail-entry.ts'
export type { ComposerBridge, ImageIntakeBridge } from './rail-entry.ts'
export { AttachedFiles, composeSubmission } from './attached.ts'
export type { AttachedFile } from './attached.ts'
export { installSubmitGuard, isSendKey } from './submit-guard.ts'
export type { ComposerHandle } from './submit-guard.ts'
export { PreviewStore } from './preview-store.ts'
export type { DropAsset } from './preview-store.ts'
export { DropRail } from './DropRail.tsx'
export type { DropRailInjected, DropRailProps } from './DropRail.tsx'
export { DropLightbox, usePreviewText } from './DropLightbox.tsx'
export type { DropLightboxProps } from './DropLightbox.tsx'
export { DROP_NS, en, zh } from './locales.ts'
export type { DropKey } from './locales.ts'
export { acquire, hintFor } from './acquire.ts'
export type { Acquired, Acquisition } from './acquire.ts'
export { claimsFileTypes, fileNameOf, mentionFor, planDrop, uriListPaths } from '../contract.ts'
export type { DropPlan, DroppedEntry } from '../contract.ts'
export {
  dropKindOf, extensionOf, formatDropBytes, kindBadge, looksBinary, mediaTypeFor,
} from '../preview.ts'
export type { DropKind } from '../preview.ts'

export const name = '@crosery/dsh-drop'

/**
 * The per-session input facade.
 *
 * Derived structurally because `@deepseek-ai/dsh-client-ui-conversation` does
 * not export `SessionInput` by name; `IConversation.input.for` is the only
 * public path to it, and its return type is the same interface.
 */
type SessionInput = ReturnType<IConversation['input']['for']>

/**
 * Whether this plugin claims a transfer.
 *
 * Read from `items` rather than `files` because during `dragover` the browser
 * withholds file contents and names but still exposes each item's `kind` and
 * MIME type — which is exactly and only what this decision needs. A file with
 * no type the OS could guess arrives as the empty string, which is not an
 * accepted image type, so it is claimed. That is the right answer: the shipped
 * path would have refused it too.
 * @param transfer - the transfer's DataTransfer, possibly null.
 * @returns true when at least one member is not a composer-acceptable image.
 */
export function claimsTransfer(transfer: DataTransfer | null): boolean {
  if (transfer === null) return false
  if (!transfer.types.includes('Files')) return false
  const types: string[] = []
  for (const item of transfer.items) {
    if (item.kind === 'file') types.push(item.type)
  }
  // An empty list means every file member is an image the shipped path takes,
  // or the platform withheld the item list during this phase. Both decline: the
  // shipped overlay stays correct for image drags, and a withheld list is
  // re-decided at drop time, where real files are always available.
  // The replacement rail owns image intake too; no shipped listener remains.
  return types.length > 0 || transfer.files.length > 0
}

/**
 * Read transfer entries while the DataTransfer is still valid.
 *
 * Both `getAsFile()` and `webkitGetAsEntry()` must be called synchronously
 * inside the event handler — the item list is neutered as soon as the handler
 * yields, so a single `await` before this runs loses the whole transfer.
 * @param transfer - the drop or paste DataTransfer.
 * @returns entries in transfer order.
 */
export function readEntries(transfer: DataTransfer): DroppedEntry<File>[] {
  const entries: DroppedEntry<File>[] = []
  for (const item of transfer.items) {
    if (item.kind !== 'file') continue
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    entries.push({ file: item.getAsFile(), isDirectory: entry?.isDirectory ?? false })
  }
  // Some browsers populate `files` but not `items`; fall back rather than drop.
  if (entries.length === 0) {
    for (const file of transfer.files) entries.push({ file, isDirectory: false })
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
 * Stage acquired paths against a session, outside the draft.
 *
 * This is where the plugin stopped writing into the composer. A reference used
 * to be spliced into the draft as an occurrence, which is what left a marker in
 * the text box — an occurrence must span at least one character, because that
 * span is what the submit transaction expands into the absolute path.
 *
 * Held here instead, the path costs the draft nothing and is spliced in by
 * `submit-guard.ts` at the moment the message is sent. That mirrors how images
 * already work: `imageIds` is a list beside the draft, not inside it.
 * @param attached - the staging list.
 * @param sessionId - the session the drop belongs to.
 * @param acquired - acquired files, in transfer order.
 * @returns how many files were staged.
 */
export function stageReferences(
  attached: AttachedFiles,
  sessionId: string,
  acquired: readonly Acquired[],
): number {
  for (const { path } of acquired) attached.add(sessionId, path)
  return acquired.length
}

/**
 * Hand image members to the composer's own intake.
 *
 * This plugin now occupies the attachment seat, which took the shipped
 * entry's document-level image listeners down with it — so re-dispatching a
 * synthetic event, as this used to do, would reach nobody. The seat's
 * `onAddImages` is the composer's validated path (count, byte and media-type
 * limits, plus its own error banners), and the mounted rail publishes it
 * through the bridge.
 *
 * A transfer arriving with no rail mounted finds nothing to call. That is the
 * no-session case, where the shipped path had no draft to add images to
 * either.
 * @param intake - the bridge to the mounted rail's image intake.
 * @param images - files the composer accepts as draft images.
 */
function handImagesToComposer(
  intake: ImageIntakeBridge,
  images: readonly File[],
): void {
  if (images.length === 0) return
  intake.current()?.(images)
}

/**
 * Mount the capture-phase transfer handling.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  // The bytes behind every path this page acquires, so a reference can be
  // shown as the file it stands for rather than as its name alone. Owned here
  // because object URLs outlive the elements that use them: one revoke pass at
  // plugin disposal is what releases them.
  const previews = new PreviewStore()
  ctx.effect(() => () => { previews.dispose() }, '@crosery/dsh-drop: preview material')
  // Taking the attachment seat means owning image intake too; the rail
  // publishes the composer's own intake here for the drag listeners to call.
  const images = imageIntakeBridge()
  // Files staged for the next message, held beside the draft the way the
  // composer holds `imageIds` — which is what keeps the text box clean.
  const attached = new AttachedFiles()
  const composer = composerBridge()
  installDropStyles(ctx)
  installPreviewRail(ctx, previews, images, composer, attached)
  // The staged paths reach the model only because this guard splices them into
  // the message as it is sent.
  ctx.effect(
    () => installSubmitGuard(
      () => composer.current(),
      (sessionId) => attached.list(sessionId).map((entry) => mentionFor(entry.path)),
      (sessionId) => { attached.clear(sessionId) },
    ),
    '@crosery/dsh-drop: submit guard',
  )

  ctx.inject(['sessions', 'conversation'], (scoped) => {
    scoped.effect(() => {
      const overlay = createOverlay()
      const disposeReferenceFit = installReferenceFit()
      const aborter = new AbortController()
      let depth = 0

      /**
       * The current session's id, or undefined outside a session.
       *
       * Branded, because `sessions.scope` demands it; the staging store keys on
       * the plain string, which every brand erases to.
       */
      const currentSession = () => scoped.sessions.list.getSnapshot().current

      /** Resolve the current session's input facade, for notices. */
      const currentInput = (): SessionInput | undefined => {
        const id = currentSession()
        if (id === undefined) return undefined
        const agent = scoped.sessions.scope(id)
        if (agent === undefined) return undefined
        return scoped.conversation.input.for(agent)
      }

      /**
       * The shared tail of both gestures.
       *
       * Drop and paste no longer differ at all here: they used to, because the
       * shipped image listener had to be reached by replaying the right kind of
       * synthetic event, and this plugin now feeds that path directly.
       */
      const consume = (transfer: DataTransfer): void => {
        const plan = planDrop(readEntries(transfer))
        const hints = readHints(transfer)
        handImagesToComposer(images, plan.images)

        if (plan.staged.length === 0) {
          if (plan.directories) currentInput()?.notify('error', messages().directories)
          return
        }
        const sessionId = currentSession()
        const input = currentInput()
        if (sessionId === undefined || input === undefined) {
          currentInput()?.notify('error', messages().noSession)
          return
        }

        // Sequential rather than concurrent: a multi-file transfer is usually a
        // few large files, and letting them race would have them compete for
        // the same disk while making the mention order nondeterministic.
        void (async () => {
          const acquired: Acquired[] = []
          for (const file of plan.staged) {
            try {
              const one = await acquire(file, hints, aborter.signal)
              // Pair the path with the bytes before the reference exists, so
              // the rail's first render already has a thumbnail to show.
              previews.put(one.path, file)
              acquired.push(one)
            } catch (error) {
              if (aborter.signal.aborted) return
              console.warn('[dsh-drop] could not acquire a file', error)
            }
          }
          if (acquired.length === 0) {
            input.notify('error', messages().failed)
            return
          }
          const landed = stageReferences(attached, sessionId, acquired)
          if (plan.directories) {
            const copy = messages()
            input.notify('info', `${copy.added(landed)}（${copy.directories}）`)
          }
        })()
      }

      const reset = (): void => {
        depth = 0
        overlay.hide()
      }

      const onDragEnter = (event: DragEvent): void => {
        if (!claimsTransfer(event.dataTransfer)) return
        event.preventDefault()
        event.stopPropagation()
        depth += 1
        overlay.show()
      }

      const onDragOver = (event: DragEvent): void => {
        const transfer = event.dataTransfer
        if (!claimsTransfer(transfer)) return
        // preventDefault is what makes the element a drop target at all; without
        // it the browser cancels the drag and no drop event is ever delivered.
        event.preventDefault()
        event.stopPropagation()
        if (transfer !== null) transfer.dropEffect = 'copy'
        overlay.show()
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
        consume(transfer)
      }

      const onPaste = (event: ClipboardEvent): void => {
        const transfer = event.clipboardData
        if (!claimsTransfer(transfer) || transfer === null) return
        // Without preventDefault the textarea would also receive the clipboard's
        // text flavor — for a file copied in Finder that is its name, pasted as
        // literal text beside the chip.
        event.preventDefault()
        event.stopPropagation()
        consume(transfer)
      }

      document.addEventListener('dragenter', onDragEnter, true)
      document.addEventListener('dragover', onDragOver, true)
      document.addEventListener('dragleave', onDragLeave, true)
      document.addEventListener('drop', onDrop, true)
      document.addEventListener('paste', onPaste, true)
      window.addEventListener('dragend', reset)

      return () => {
        aborter.abort()
        document.removeEventListener('dragenter', onDragEnter, true)
        document.removeEventListener('dragover', onDragOver, true)
        document.removeEventListener('dragleave', onDragLeave, true)
        document.removeEventListener('drop', onDrop, true)
        document.removeEventListener('paste', onPaste, true)
        window.removeEventListener('dragend', reset)
        overlay.dispose()
        disposeReferenceFit()
      }
    }, '@crosery/dsh-drop: composer file transfer')
  })
}
