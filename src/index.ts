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
 * worth of tokens until the model decides to read it.
 * @module @crosery/dsh-drop
 */

import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
// Type-only: pulls the ctx.webServer merge without a value dependency.
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  DROP_SETTINGS_NAMESPACE, RESOLVE_ROUTE, STAGE_DIR, STAGE_ROUTE, type DropSettings,
} from './contract.ts'
import { DropSettingsSchema } from './settings.ts'
import { stageHandler } from './stage-route.ts'
import { resolveHandler } from './resolve-route.ts'
import { pruneStage } from './prune.ts'

export {
  COMPOSER_IMAGE_MEDIA_TYPES, DROP_SETTINGS_NAMESPACE, MTIME_TOLERANCE_MS,
  RESOLVE_ROUTE, STAGE_DIR, STAGE_ROUTE,
  fileNameOf, isComposerImageType, isPrunableStageDir, mentionFor,
  pathFromFileUrl, safeStageName, stageCandidate, stageDayDir, uriListPaths,
} from './contract.ts'
export type { DropSettings, ResolveOk, ResolveRequest, StageErr, StageOk } from './contract.ts'
export { DropSettingsSchema } from './settings.ts'
export { insideRoot, requestedName, publishStage, stageHandler } from './stage-route.ts'
export { claimMatches, readClaim, resolveHandler } from './resolve-route.ts'
export { pruneStage } from './prune.ts'

/** Settings namespace this plugin owns. */
export const DROP_NAMESPACE = settingsNamespace(DROP_SETTINGS_NAMESPACE)

export const name = '@crosery/dsh-drop'

export type Config = DropSettings

export const Config = DropSettingsSchema

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

  ctx.inject(['webServer'], (scoped) => {
    scoped.effect(() => scoped.webServer.register({
      kind: 'exact',
      path: STAGE_ROUTE,
      handler: stageHandler({
        root: () => root,
        maxBytes: () => source().maxBytes,
      }),
    }), '@crosery/dsh-drop: stage route')

    // Registered beside staging rather than inside it: this one never writes.
    // It is what lets a drag that carried a real path reference the user's own
    // file instead of a copy of it.
    scoped.effect(() => scoped.webServer.register({
      kind: 'exact',
      path: RESOLVE_ROUTE,
      handler: resolveHandler(),
    }), '@crosery/dsh-drop: resolve route')
  })

  // Retention is the one setting with an effect outside a request. Re-running
  // the pass when the value changes is what makes shortening it take effect now
  // rather than at the next boot; keying on the value keeps every other
  // committed settings change from re-walking the directory.
  let prunedWith: number | undefined
  const prune = (): void => {
    const keepDays = source().keepDays
    if (keepDays === prunedWith) return
    prunedWith = keepDays
    // Detached on purpose: a slow or failing prune must not delay or fail
    // activation, and retention is hygiene rather than correctness.
    void pruneStage(root, keepDays, Date.now()).catch((error: unknown) => {
      console.warn(`[dsh-drop] could not prune ${root}`, error)
    })
  }

  installSettingsSection(ctx, DROP_NAMESPACE, DropSettingsSchema, config, {
    setSource: (current) => { source = current },
    onChange: prune,
    // `natural()` admits zero, and a zero ceiling refuses every drop while
    // looking like a configured limit rather than a mistake.
    validate: (value) => {
      if (value.maxBytes < 1) throw new Error('crosery-drop.maxBytes must be at least 1 byte')
    },
  })

  // A composition with no settings provider never reaches `onChange`, so the
  // entry-config pass has to be established here too. The value guard makes the
  // redundant call in the provider case a no-op.
  prune()
}
