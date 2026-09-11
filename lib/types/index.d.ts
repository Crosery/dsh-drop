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
import type { Context } from '@deepseek-ai/cordis';
import { type DropSettings } from './contract.ts';
export { COMPOSER_IMAGE_MEDIA_TYPES, DROP_SETTINGS_NAMESPACE, MTIME_TOLERANCE_MS, RESOLVE_ROUTE, STAGE_DIR, STAGE_ROUTE, fileNameOf, isComposerImageType, isPrunableStageDir, mentionFor, pathFromFileUrl, safeStageName, stageCandidate, stageDayDir, uriListPaths, } from './contract.ts';
export type { DropSettings, ResolveOk, ResolveRequest, StageErr, StageOk } from './contract.ts';
export { DropSettingsSchema } from './settings.ts';
export { insideRoot, requestedName, publishStage, stageHandler } from './stage-route.ts';
export { claimMatches, readClaim, resolveHandler } from './resolve-route.ts';
export { pruneStage } from './prune.ts';
/**
 * Settings namespace this plugin owns, as the settings service keys it.
 *
 * A plain string rather than a branded one: 0.1.2 deleted the
 * `settingsNamespace()` constructor that produced the brand, and the service
 * validates the name at registration either way.
 */
export declare const DROP_NAMESPACE = "crosery-drop";
export declare const name = "@crosery/dsh-drop";
export type Config = DropSettings;
export declare const Config: import("@deepseek-ai/schemastery").default<DropSettings>;
/** Callbacks a mount invokes. Identical on every harness train that has a mount. */
export interface SettingsHooks {
    /** Receive the authoritative value: the resolved section while one is attached. */
    setSource(current: () => DropSettings): void;
    /** Re-judge derived state after an attach, a detach, or a committed change. */
    onChange(): void;
    /** Reject a resolved section this plugin could not act on. */
    validate?: (value: DropSettings) => void;
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
export declare function mountSettingsSection(ctx: Context, config: DropSettings, hooks: SettingsHooks): void;
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
export declare function apply(ctx: Context, config: Config): void;
