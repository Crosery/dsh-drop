/**
 * Registering the attachment rail.
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
 * Two duties come with the seat. The rail renders the composer's drafts from
 * the owner props, and the shipped entry's document-level drop handling goes
 * away with it, so the drop pipeline feeds images back through the seat's own
 * intake. Each mounted rail registers with the {@link RailRegistry} for that.
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
import { DropRail, type RailHandle, type SessionAccess } from './DropRail.tsx'
import { DROP_NS, en, zh } from './locales.ts'
import type { PreviewStore } from './preview-store.ts'
import type { RailRegistry } from './registry.ts'

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

/** What the rail registration is built from. */
export interface RailDeps {
  /** The preview material the rail reads. */
  store: PreviewStore
  /** The staged references. */
  attached: AttachedFiles
  /** Where each mounted rail registers. */
  registry: RailRegistry<RailHandle>
  /** The session services the send path reads through. */
  access: SessionAccess
  /** Called when a rail finds itself in a textarea composer (0.1.0–0.1.1). */
  onLegacyComposer: () => void
}

/**
 * Mount the attachment rail for the plugin's lifetime.
 *
 * Nested inject rather than a top-level one: without `slots` or `locale` the
 * rail cannot render, but a hard requirement would turn a missing UI service
 * into a boot failure.
 * @param ctx - browser plugin context.
 * @param deps - the stores, the registry, and the session access.
 */
export function installPreviewRail(ctx: ClientContext, deps: RailDeps): void {
  const { store, attached, registry, access, onLegacyComposer } = deps
  // The session-independent members are built once; a fresh object per inject
  // call would break the entry's memoization.
  const shared = {
    assetOf: (key: string) => store.get(key),
    putAsset: (key: string, file: File) => { store.put(key, file) },
    releaseAsset: (key: string) => { store.release(key) },
    textOf: (key: string) => store.text(key),
    register: (rail: RailHandle) => registry.register(rail),
    access,
    onLegacyComposer,
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
      // session of this occurrence, `undefined` on a blank composer. Each
      // composer on the page gets its own occurrence, so a second composer
      // (the subagent sidebar) gets its own session here too.
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
