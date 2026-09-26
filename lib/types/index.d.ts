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
import type { Context } from '@deepseek-ai/cordis';
import { type DropSettings } from './contract.ts';
import { type RequestRejection } from './stage-route.ts';
export { BATCH_HEADER, BATCH_ROUTE, COMPOSER_IMAGE_MEDIA_TYPES, DEFAULT_FOLDER_IGNORE, DEFAULT_FOLDER_MAX_BYTES, DEFAULT_FOLDER_MAX_DEPTH, DEFAULT_FOLDER_MAX_FILES, DROP_SETTINGS_NAMESPACE, FOLDER_SAMPLE_SIZE, MTIME_TOLERANCE_MS, RELPATH_HEADER, RESOLVE_ROUTE, STAGE_DIR, STAGE_ROUTE, fileNameOf, folderCandidate, folderLimitsOf, isComposerImageType, isIgnoredName, isPrunableStageDir, isStageDayDir, mentionFor, pathFromFileUrl, safeFolderName, safeRelativeSegments, safeStageName, stageCandidate, stageDayDir, uriListPaths, } from './contract.ts';
export type { BatchAbortOk, BatchBeginOk, BatchCommitOk, BatchFileOk, BatchLimitsOk, BatchRequest, DropSettings, FolderLimit, FolderLimits, FolderSampleEntry, FolderSummary, NameRules, ResolveOk, ResolveRequest, StageErr, StageOk, } from './contract.ts';
export { DropSettingsSchema } from './settings.ts';
export { crossSite, declaresJson, insideRoot, refused, requestedName, publishStage, sendJson, stageHandler, } from './stage-route.ts';
export type { BatchReceiver, RequestRejection, StageOptions } from './stage-route.ts';
export { claimDirectory, claimMatches, readClaim, resolveHandler, summarizeDirectory } from './resolve-route.ts';
export type { FolderRules, ResolveOptions } from './resolve-route.ts';
export { BATCH_IDLE_MS, batchStore, publishDirectory } from './folder-stage.ts';
export type { BatchOptions, BatchStore } from './folder-stage.ts';
export { pruneStage } from './prune.ts';
export type { PruneOptions } from './prune.ts';
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
export declare function hostAdmission(ctx: {
    get(name: string): unknown;
}): RequestRejection;
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
