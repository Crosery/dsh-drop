/**
 * Host half: the two endpoints that turn a dropped file into a readable path.
 *
 * A `File` from a `DataTransfer` carries a name, a size, a type and its bytes —
 * never its location, and no API recovers it. But the drag around it sometimes
 * does: Finder and Explorer put a `file://` URL on the `text/uri-list` flavor
 * beside the bytes. So there are two ways to get a path, and they are tried in
 * that order.
 *
 * **resolve** takes the browser's claimed path and checks it against the size
 * and mtime the same drag reported. A match means the user's own file is
 * already readable where it lies, and referencing it there is strictly better
 * than copying: no duplicate, and later edits are visible on the next read.
 *
 * **stage** is the fallback, and it is not going away — a file can arrive from
 * a download panel, another application's drag source, or a clipboard entry
 * with no filesystem existence at all. Those have no path to reference, and
 * copying the bytes is the only way they reach the model.
 *
 * Either way the composer receives an `@` mention of a path rather than the
 * file's contents. `@` references are plain prompt text upstream (see
 * `@deepseek-ai/dsh-file-reference`), so a dropped 40 MB log costs a path's
 * worth of tokens until the model decides to read it. (Inside the desktop app
 * the browser half asks the app for the path first and needs neither route.)
 *
 * A **folder** takes the same two roads. Its path, when the drag carries one,
 * is checked by the files it contains; without one, the browser walks the
 * folder and **batch** copies it with its structure — one private directory
 * per folder, published whole under its own name on commit.
 *
 * All three are raw `webServer` routes, which the harness does not
 * authenticate by itself. From 0.1.2 each request is put through the Host's
 * own admission check (`connection.requestRejection`: its Host/Origin fence
 * and login-cookie authentication) before anything else; 0.1.0 and 0.1.1 have
 * no such check, and the routes keep their cross-site gates only. On every
 * train a request is refused while the connection service is down.
 * @module @crosery/dsh-drop
 */

import type { IncomingHttpHeaders } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
// Type-only: pulls the ctx.settings merge. The two value helpers this plugin
// used to import (`installSettingsSection`, `settingsNamespace`) were removed
// in 0.1.2; `mountSettingsSection` below drives whichever API the running
// harness publishes instead of importing one train's.
import type {} from '@deepseek-ai/dsh-settings'
// Type-only: pulls the ctx.webServer merge without a value dependency.
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  BATCH_ROUTE, DROP_SETTINGS_NAMESPACE, RESOLVE_ROUTE, STAGE_DIR, STAGE_ROUTE, folderLimitsOf,
  type DropSettings,
} from './contract.ts'
import { DropSettingsSchema } from './settings.ts'
import { stageHandler, type RequestRejection } from './stage-route.ts'
import { resolveHandler } from './resolve-route.ts'
import { BATCH_IDLE_MS, batchStore } from './folder-stage.ts'
import { pruneStage } from './prune.ts'

export {
  BATCH_HEADER, BATCH_ROUTE, COMPOSER_IMAGE_MEDIA_TYPES, DEFAULT_FOLDER_IGNORE, DEFAULT_FOLDER_MAX_BYTES,
  DEFAULT_FOLDER_MAX_DEPTH, DEFAULT_FOLDER_MAX_FILES, DROP_SETTINGS_NAMESPACE, FOLDER_SAMPLE_SIZE,
  MTIME_TOLERANCE_MS, RELPATH_HEADER, RESOLVE_ROUTE, STAGE_DIR, STAGE_ROUTE,
  fileNameOf, folderCandidate, folderLimitsOf, isComposerImageType, isIgnoredName, isPrunableStageDir, isStageDayDir,
  mentionFor, pathFromFileUrl, safeFolderName, safeRelativeSegments, safeStageName, stageCandidate,
  stageDayDir, uriListPaths,
} from './contract.ts'
export type {
  BatchAbortOk, BatchBeginOk, BatchCommitOk, BatchFileOk, BatchLimitsOk, BatchRequest, DropSettings,
  FolderLimit, FolderLimits, FolderSampleEntry, FolderSummary, NameRules, ResolveOk, ResolveRequest, StageErr,
  StageOk,
} from './contract.ts'
export { DropSettingsSchema } from './settings.ts'
export {
  crossSite, declaresJson, insideRoot, refused, requestedName, publishStage, sendJson, stageHandler,
} from './stage-route.ts'
export type { BatchReceiver, RequestRejection, StageOptions } from './stage-route.ts'
export { claimDirectory, claimMatches, readClaim, resolveHandler, summarizeDirectory } from './resolve-route.ts'
export type { FolderRules, ResolveOptions } from './resolve-route.ts'
export { BATCH_IDLE_MS, batchStore, publishDirectory } from './folder-stage.ts'
export type { BatchOptions, BatchStore } from './folder-stage.ts'
export { pruneStage } from './prune.ts'
export type { PruneOptions } from './prune.ts'

/**
 * Settings namespace this plugin owns, as the settings service keys it.
 *
 * A plain string rather than a branded one: 0.1.2 deleted the
 * `settingsNamespace()` constructor that produced the brand, and the service
 * validates the name at registration either way.
 */
export const DROP_NAMESPACE = DROP_SETTINGS_NAMESPACE

export const name = '@crosery/dsh-drop'

export type Config = DropSettings

export const Config = DropSettingsSchema

/** One registered namespace's owner-facing handle, as this plugin reads it. */
interface SettingsScopeLike {
  get(): DropSettings
  watch(callback: () => void): () => void
}

/** Callbacks a mount invokes. Identical on every harness train that has a mount. */
export interface SettingsHooks {
  /** Receive the authoritative value: the resolved section while one is attached. */
  setSource(current: () => DropSettings): void
  /** Re-judge derived state after an attach, a detach, or a committed change. */
  onChange(): void
  /** Reject a resolved section this plugin could not act on. */
  validate?: (value: DropSettings) => void
}

/**
 * Structural view of the settings service.
 *
 * 0.1.7 replaced both mounts below with `SettingsForms`, which builds its form
 * from this plugin's exported `Config` for the profile entry (`drop`) and
 * writes edits into that entry's config — so on 0.1.7 neither method exists,
 * {@link mountSettingsSection} returns without mounting, and `apply` receives
 * the edited values as its config. A `crosery-drop` section left in an old
 * `settings.yaml` is not carried over: 0.1.7's one-time import looks for an
 * entry named after the section, and this entry is named `drop`.
 *
 * 0.1.2 moved this mount from a package export to a service method:
 * `installSettingsSection(ctx, ns, schema, entry, hooks)` became
 * `ctx.settings.installSection(owner, ns, schema, entry, hooks)`, and the
 * `settingsNamespace()` brand constructor went with it. The hooks and the
 * registration they wire are unchanged, so this plugin drives whichever
 * surface the running harness publishes.
 *
 * A static import of the removed export is what actually breaks a user: ESM
 * resolves named exports before any code runs, so on 0.1.2 and later the whole
 * host entry fails to load — `does not provide an export named
 * 'installSettingsSection'` — instead of degrading to entry-config behavior.
 */
interface SettingsServiceLike {
  installSection?(
    owner: Context,
    ns: string,
    schema: unknown,
    entry: DropSettings,
    hooks: SettingsHooks,
  ): void
  register?(
    ns: string,
    schema: unknown,
    options: { base?: Partial<DropSettings>; validate?: (value: DropSettings) => void },
  ): SettingsScopeLike
}

/**
 * Value mirror of cordis's `FiberState` members {@link isUnloading} compares
 * against. A const enum has no runtime object to import, and the comparison has
 * to run — the same mirror the harness itself carries for this check.
 */
const FIBER_DISPOSED = 4
const FIBER_UNLOADING = 5

/**
 * Whether this plugin's own fiber is tearing down, rather than merely losing the
 * settings service.
 *
 * The detach path exists to hand a *still-running* plugin back its composition
 * entry. When the plugin itself is unloading there is nothing to fall back to:
 * re-running the retention pass against the entry would act on a fiber that is
 * already disposing.
 * @param ctx - this plugin's context.
 * @returns true while its fiber is unloading or disposed.
 */
function isUnloading(ctx: Context): boolean {
  const state = ctx.fiber?.state
  return state === FIBER_UNLOADING || state === FIBER_DISPOSED
}

/**
 * Mount the `crosery-drop` namespace over whichever settings API exists.
 *
 * Only called while a settings service is present: a composition without one
 * keeps the composition entry as the sole source, which {@link apply}
 * establishes on its own.
 * @param ctx - plugin context: the mount's owner, and the injection parent.
 * @param config - composition entry config; both the `base` layer and the
 *   fallback value once the settings service detaches.
 * @param hooks - source and change callbacks.
 */
export function mountSettingsSection(ctx: Context, config: DropSettings, hooks: SettingsHooks): void {
  ctx.inject(['settings'], (scoped) => {
    const settings = scoped.settings as unknown as SettingsServiceLike
    if (typeof settings.installSection === 'function') {
      settings.installSection(ctx, DROP_NAMESPACE, DropSettingsSchema, config, hooks)
      return
    }
    // 0.1.1 and earlier: drive the registration the removed helper drove, so
    // settings keep working across the rename instead of silently reverting to
    // the composition entry.
    if (typeof settings.register !== 'function') return
    const scope = settings.register(DROP_NAMESPACE, DropSettingsSchema, {
      base: config,
      validate: hooks.validate,
    })
    hooks.setSource(() => scope.get())
    scoped.effect(() => () => {
      // Owner unload is not a detach: see {@link isUnloading}.
      if (isUnloading(ctx)) return
      hooks.setSource(() => config)
      hooks.onChange()
    }, '@crosery/dsh-drop: settings detach')
    hooks.onChange()
    scope.watch(() => {
      if (isUnloading(ctx)) return
      hooks.onChange()
    })
  })
}

/** The Host connection's admission check, as far as this plugin reads it. */
interface ConnectionLike {
  requestRejection?: (request: { headers: IncomingHttpHeaders }) => number | undefined
}

/**
 * The running Host's admission check for raw Web routes, read per request.
 *
 * Every train publishes a `connection` service: it is the browser's `/api`
 * transport, and each shipped Web composition carries it beside `webServer`.
 * What differs is its login check — `requestRejection` exists from
 * 0.1.2-alpha.2; the 0.1.0 and 0.1.1 service has none, and those trains admit.
 *
 * An absent service refuses (503) on every train rather than admitting. On
 * 0.1.2 and later its absence is not evidence of an old harness: the
 * connection plugin's `apply` is async (it awaits its browser-auth store), it
 * is gone while a config edit restarts it, and gone for good if it fails to
 * activate — each a moment when the harness's own `/api` is closed and an
 * anonymous caller must not reach these routes. On 0.1.0 and 0.1.1 the
 * refusal costs nothing: that plugin injects `webServer` and applies
 * synchronously, so it is up whenever these routes are, and no page can talk
 * to a Host without it anyway.
 *
 * The train is not detected any other way, on purpose. Resolving the
 * connection package from here reads the profile's module tree, which can
 * hold another version of a harness package than the one running; and the
 * loader registers a plugin only once its module is imported, which can be
 * after the Web server already listens.
 *
 * Read by name at request time rather than injected: a nested
 * `inject(['connection'])` would unregister the routes, and drop every open
 * folder batch with them, on each connection restart.
 * @param ctx - this plugin's context.
 * @returns the check: 503 while the service is absent, the service's own
 *   answer where it has a check, admission on the trains without one.
 */
export function hostAdmission(ctx: { get(name: string): unknown }): RequestRejection {
  return (req) => {
    const connection = ctx.get('connection') as ConnectionLike | undefined
    if (connection === undefined || connection === null) return 503
    if (typeof connection.requestRejection !== 'function') return undefined
    return connection.requestRejection(req)
  }
}

/**
 * Mount the settings section and the staging route.
 *
 * `webServer` is injected as a nested scope rather than declared in a top-level
 * `inject`: an entry that never activates is a hard boot failure, so requiring
 * the HTTP server would make this bundle un-composable with `dsh-headless`
 * instead of merely inert there. Without a server there is no browser to drop
 * into, and the plugin correctly does nothing.
 * @param ctx - plugin context.
 * @param config - composition entry config, used as the settings `base` layer.
 */
export function apply(ctx: Context, config: Config): void {
  let source = (): DropSettings => config
  const root = dshHomePath(STAGE_DIR)
  const reject = hostAdmission(ctx)

  ctx.inject(['webServer'], (scoped) => {
    // Folder batches live as long as the routes that serve them: when the Web
    // server goes, every batch still open is removed with it.
    const batches = batchStore({
      root: () => root,
      limits: () => folderLimitsOf(source()),
      sweepEveryMs: 60_000,
      reject,
    })
    scoped.effect(() => () => { void batches.dispose() }, '@crosery/dsh-drop: folder batches')

    scoped.effect(() => scoped.webServer.register({
      kind: 'exact',
      path: STAGE_ROUTE,
      handler: stageHandler({
        root: () => root,
        maxBytes: () => source().maxBytes,
        reject,
        batches,
      }),
    }), '@crosery/dsh-drop: stage route')

    scoped.effect(() => scoped.webServer.register({
      kind: 'exact',
      path: BATCH_ROUTE,
      handler: batches.handler,
    }), '@crosery/dsh-drop: batch route')

    // Registered beside staging rather than inside it: this one never writes.
    // It is what lets a drag that carried a real path reference the user's own
    // file or folder instead of a copy of it.
    scoped.effect(() => scoped.webServer.register({
      kind: 'exact',
      path: RESOLVE_ROUTE,
      handler: resolveHandler({
        reject,
        folder: () => {
          const limits = folderLimitsOf(source())
          return { ignore: limits.ignore, maxDepth: limits.maxDepth }
        },
      }),
    }), '@crosery/dsh-drop: resolve route')
  })

  // Retention is the one setting with an effect outside a request. Re-running
  // the pass when the value changes is what makes shortening it take effect now
  // rather than at the next boot; keying on the value keeps every other
  // committed settings change from re-walking the directory.
  let prunedWith: number | undefined
  // The first pass, at activation, also clears what an upload interrupted by
  // a crash left behind; later passes only re-apply retention, so a batch
  // this Host is still filling is never in question.
  let swept = false
  const prune = (): void => {
    const keepDays = source().keepDays
    if (keepDays === prunedWith) return
    prunedWith = keepDays
    const options = swept ? {} : { leftoverIdleMs: BATCH_IDLE_MS }
    swept = true
    // Detached on purpose: a slow or failing prune must not delay or fail
    // activation, and retention is hygiene rather than correctness.
    void pruneStage(root, keepDays, Date.now(), options).catch((error: unknown) => {
      console.warn(`[dsh-drop] could not prune ${root}`, error)
    })
  }

  mountSettingsSection(ctx, config, {
    setSource: (current) => { source = current },
    onChange: prune,
    // `natural()` admits zero, and a zero ceiling refuses every drop while
    // looking like a configured limit rather than a mistake.
    validate: (value) => {
      if (value.maxBytes < 1) throw new Error('crosery-drop.maxBytes must be at least 1 byte')
      // The same trap per folder ceiling: zero would refuse every folder.
      for (const field of ['folderMaxFiles', 'folderMaxBytes', 'folderMaxDepth'] as const) {
        const limit = value[field]
        if (limit !== undefined && limit < 1) throw new Error(`crosery-drop.${field} must be at least 1`)
      }
    },
  })

  // A composition with no settings provider never reaches `onChange`, so the
  // entry-config pass has to be established here too. The value guard makes the
  // redundant call in the provider case a no-op.
  prune()
}
