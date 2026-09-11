/**
 * Registering the attachment rail, and the bridge back to the drop pipeline.
 *
 * Split from the client entry so the entry keeps one job — translating a
 * `DataTransfer` into acquired paths — and so the slot registration, the only
 * part with a hard dependency on the UI services, sits behind its own nested
 * inject.
 *
 * The rail takes `conversation.input.attachments`, the seat the shipped
 * attachment plugin occupies. That seat is `single`, so this is a replacement:
 * at `priority: -1` this entry shadows the shipped one (lowest renders), and
 * the shipped entry comes back by itself if this plugin unloads. Replacing
 * rather than adding is the point — images and files belong in one strip, and
 * a single seat is the only place they can share.
 *
 * Two duties come with the seat. The rail renders draft images from the owner
 * props, and the shipped entry's document-level image intake goes away, so the
 * drop pipeline has to feed images back through the seat's own `onAddImages`.
 * {@link imageIntakeBridge} is that path.
 * @module @crosery/dsh-drop/client/rail-entry
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the SlotMap seat, the standard-prop kits, and the locale service.
// `dsh-client-ui-renderer` owns the slot registry declaration from 0.1.2;
// `dsh-client-runtime` published it up to 0.1.1 and stopped shipping, so
// importing either one by name would pin this build to a single train.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AttachedFile, AttachedFiles } from './attached.ts'
import { DropRail, type ComposerBinding } from './DropRail.tsx'
import { DROP_NS, en, zh } from './locales.ts'
import type { PreviewStore } from './preview-store.ts'
import type { ComposerHandle } from './submit-guard.ts'

/**
 * Shadowing rank for the attachment seat.
 *
 * Lowest renders, and the shipped entry registers without a priority (so, 0).
 * A second registration at the SAME priority throws rather than shadowing, so
 * this value is load-bearing, not decoration.
 */
const RAIL_PRIORITY = -1

/** The no-session snapshot; shared so its identity is stable across reads. */
const EMPTY: readonly AttachedFile[] = Object.freeze([])

/**
 * The composer's image intake, published by the mounted rail.
 *
 * A mutable holder rather than a parameter because the two sides live in
 * different worlds: `onAddImages` is an owner prop, reachable only inside the
 * rendered component, while the drag listeners that need it are installed in
 * the plugin's apply scope. The rail writes on mount and clears on unmount, so
 * a transfer arriving with no composer mounted finds `undefined` and the
 * images are declined rather than dropped into nothing.
 */
export interface ImageIntakeBridge {
  /** Called by the rail as it mounts and unmounts. */
  bind: (intake: ((files: readonly File[]) => void) | undefined) => void
  /** The live intake, or undefined when no rail is mounted. */
  current: () => ((files: readonly File[]) => void) | undefined
}

/**
 * Create the holder connecting the mounted rail to the drag listeners.
 * @returns the bridge.
 */
export function imageIntakeBridge(): ImageIntakeBridge {
  let intake: ((files: readonly File[]) => void) | undefined
  return {
    bind: (next) => { intake = next },
    current: () => intake,
  }
}

/**
 * The mounted composer's verbs, for the submit guard.
 *
 * Same shape and same reason as {@link ImageIntakeBridge}: the draft, its write
 * path and the submit trigger are props, reachable only inside the rendered
 * rail, while the guard's listeners live in the plugin's apply scope.
 */
export interface ComposerBridge {
  /** Called by the rail as its session's composer mounts, changes, and unmounts. */
  bind: (handle: ComposerBinding | undefined) => void
  /** The live composer, or undefined when none is mounted. */
  current: () => ComposerHandle | undefined
}

/**
 * Create the holder connecting the mounted rail to the submit guard.
 * @returns the bridge.
 */
export function composerBridge(): ComposerBridge {
  let handle: ComposerBinding | undefined
  return {
    bind: (next) => { handle = next },
    current: () => handle,
  }
}

/**
 * Mount the attachment rail for the plugin's lifetime.
 *
 * Nested inject rather than a top-level one: without `slots` or `locale` the
 * drop path still works — files are acquired and referenced exactly as before,
 * they simply have no rail, and the shipped image rail keeps its seat — while
 * a hard requirement would turn a missing UI service into a boot failure.
 * @param ctx - browser plugin context.
 * @param store - the preview material the rail reads.
 * @param bridge - the image-intake holder the rail publishes into.
 */
export function installPreviewRail(
  ctx: ClientContext,
  store: PreviewStore,
  images: ImageIntakeBridge,
  composer: ComposerBridge,
  attached: AttachedFiles,
): void {
  // The session-independent members are built once; a fresh object per inject
  // call would break the entry's memoization.
  const shared = {
    assetOf: (path: string) => store.get(path),
    textOf: (path: string) => store.text(path),
    bindImageIntake: images.bind,
    bindComposer: composer.bind,
  }

  ctx.inject(['slots', 'locale'], (scoped) => {
    scoped.effect(
      () => scoped.locale.register(DROP_NS, { zh, en }),
      '@crosery/dsh-drop: rail dictionaries',
    )
    scoped.slots.inject('conversation.input.attachments', () => scoped.slots.register({
      name: 'conversation.input.attachments',
      priority: RAIL_PRIORITY,
      locale: DROP_NS,
      // The staged list rides the `hooks` compartment, not a plain value: the
      // inject factory runs once when the entry materializes, so a value read
      // there would freeze at whatever was staged in that instant. A
      // `HostObservable` is bound into a `useAttached` selector hook instead,
      // and the rail re-renders on every drop and removal.
      //
      // `sessionId` arrives as the factory's parameter — the framework-resolved
      // current session, `undefined` while none is selected. It used to arrive
      // as a standard prop; 0.1.2 stopped merging it there, so the rail takes it
      // from this share and works on either train.
      inject: (sessionId) => ({
        ...shared,
        sessionId,
        hooks: {
          attached: {
            getSnapshot: () => (sessionId === undefined ? EMPTY : attached.list(sessionId)),
            subscribe: (fn: () => void) => attached.subscribe(fn),
          },
        },
        detach: (id: number) => { if (sessionId !== undefined) attached.remove(sessionId, id) },
      }),
    }, DropRail))
  })
}
