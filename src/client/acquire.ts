/**
 * Turning a dropped or pasted file into a path the agent can read.
 *
 * Three rungs, in preference order:
 *
 * 1. **The desktop bridge.** The desktop app's preload publishes
 *    `globalThis.__DSH_HOST_PATHS__.pathFor(file)` (Electron's
 *    `webUtils.getPathForFile`), which answers the real path of a file that
 *    came from disk and `''` for one that did not. That path is referenced
 *    where it lies: nothing is copied, and edits to the file are visible on
 *    the next read.
 * 2. **A path hint.** A Finder or Explorer drag can carry a `file://` URL on
 *    `text/uri-list`. It comes from an untrusted side of the boundary, so the
 *    Host checks it against the size and mtime the drag reported before it is
 *    referenced in place.
 * 3. **A copy.** Everything else — a Web page, a download panel, a clipboard
 *    image with no filesystem existence at all — is streamed to the Host and
 *    referenced there. The fallback is not a defect to be engineered away:
 *    those files have no path to reference.
 *
 * Requests use document-relative URLs, as the harness's own upload does: the
 * desktop app serves the page from `dsh-app://app/` and forwards everything
 * else to the Host, and a deployment behind a path prefix keeps working.
 * @module @crosery/dsh-drop/client/acquire
 */

import {
  NAME_HEADER, RESOLVE_ROUTE, STAGE_ROUTE, fileNameOf, mentionFor,
  type ResolveOk, type ResolveRequest, type StageOk,
} from '../contract.ts'

/** Where a referenced path came from. */
export type Acquisition = 'in-place' | 'copied'

/** One acquired file: its path and how that path was obtained. */
export interface Acquired {
  path: string
  how: Acquisition
}

/** The desktop app's path bridge, as its preload publishes it. */
export interface HostPathBridge {
  /** The file's absolute path, or `''` when it is not backed by disk. */
  pathFor(file: unknown): string
}

/**
 * The desktop path bridge, when this page runs inside the desktop app.
 *
 * No declaration file names it — it is documented only in prose upstream — so
 * it is read by feature detection, never assumed.
 * @param scope - where to look; the global object by default.
 * @returns the bridge, or undefined on the Web.
 */
export function hostPathBridge(scope: object = globalThis): HostPathBridge | undefined {
  const bridge: unknown = Reflect.get(scope, '__DSH_HOST_PATHS__')
  if (typeof bridge !== 'object' || bridge === null) return undefined
  return typeof Reflect.get(bridge, 'pathFor') === 'function' ? bridge as HostPathBridge : undefined
}

/**
 * The bridge's path for one file, read defensively.
 *
 * Electron throws for a non-`File` argument and answers `''` for a file with no
 * disk backing; both mean "no path", as does a missing bridge.
 * @param file - the dropped file.
 * @param bridge - the bridge, when present.
 * @returns the absolute path, or undefined.
 */
export function bridgePath(file: unknown, bridge: HostPathBridge | undefined = hostPathBridge()): string | undefined {
  if (bridge === undefined) return undefined
  try {
    const path = bridge.pathFor(file)
    return typeof path === 'string' && path !== '' ? path : undefined
  } catch {
    return undefined
  }
}

/** The request function acquisition uses; `fetch` in the browser, a double in tests. */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

/** The part of a `File` acquisition reads. */
export interface AcquirableFile {
  readonly name: string
  readonly size: number
  readonly lastModified: number
}

/** Document-relative form of a Host route. */
function relative(route: string): string {
  return route.startsWith('/') ? route.slice(1) : route
}

/**
 * Ask the Host whether a hinted path is this file.
 * @param path - absolute path decoded from the drag's file URL.
 * @param file - the dropped file, for its size and mtime.
 * @param signal - cancellation for plugin teardown.
 * @param http - the request function.
 * @returns the confirmed path, or undefined when it did not match.
 */
async function resolveInPlace(
  path: string,
  file: AcquirableFile,
  signal: AbortSignal,
  http: Fetcher,
): Promise<string | undefined> {
  const claim: ResolveRequest = { path, size: file.size, lastModified: file.lastModified }
  try {
    const response = await http(relative(RESOLVE_ROUTE), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(claim),
      signal,
    })
    if (!response.ok) return undefined
    const body = await response.json() as ResolveOk
    return typeof body.path === 'string' && body.path !== '' ? body.path : undefined
  } catch {
    return undefined
  }
}

/**
 * Upload the bytes and take the path the Host wrote them to.
 * @param file - the dropped file.
 * @param signal - cancellation for plugin teardown.
 * @param http - the request function.
 * @returns the absolute staged path.
 * @throws when the Host refuses or the request fails.
 */
async function stage(file: AcquirableFile, signal: AbortSignal, http: Fetcher): Promise<string> {
  const response = await http(relative(STAGE_ROUTE), {
    method: 'POST',
    headers: { [NAME_HEADER]: encodeURIComponent(file.name) },
    body: file as unknown as BodyInit,
    signal,
  })
  if (!response.ok) throw new Error(`stage failed: ${response.status}`)
  const body = await response.json() as StageOk
  if (typeof body.path !== 'string' || body.path === '') throw new Error('stage returned no path')
  return body.path
}

/**
 * Pair a file with the drag's path hints by base name.
 *
 * The hint list and the file list are both in drop order and usually align
 * one-to-one, but matching by name rather than by index keeps a drag whose
 * flavors disagree from attaching one file's bytes to another file's path — the
 * one mistake here that would be silent and wrong rather than merely a copy.
 * @param file - the dropped file.
 * @param hints - absolute paths decoded from the drag.
 * @returns the matching hint, or undefined.
 */
export function hintFor(file: { name: string }, hints: readonly string[]): string | undefined {
  return hints.find((hint) => fileNameOf(hint) === file.name)
}

/**
 * Get a readable path for one file, preferring the original over a copy.
 * @param file - the dropped or pasted file.
 * @param bridged - the desktop bridge's path for it, read during the event.
 * @param hints - absolute paths decoded from the transfer's `text/uri-list`.
 * @param signal - cancellation for plugin teardown.
 * @param http - the request function; `fetch` by default.
 * @returns the path and how it was obtained.
 * @throws when the file had no usable path and could not be copied either.
 */
export async function acquire(
  file: AcquirableFile,
  bridged: string | undefined,
  hints: readonly string[],
  signal: AbortSignal,
  http: Fetcher = (url, init) => fetch(url, init),
): Promise<Acquired> {
  // A path the desktop app vouches for is the file itself. One that cannot be
  // spelled as a mention (a quote or a control character in it) is copied
  // under a safe name instead.
  if (bridged !== undefined && mentionFor(bridged) !== undefined) return { path: bridged, how: 'in-place' }
  const hint = hintFor(file, hints)
  if (hint !== undefined && mentionFor(hint) !== undefined) {
    const confirmed = await resolveInPlace(hint, file, signal, http)
    if (confirmed !== undefined) return { path: confirmed, how: 'in-place' }
  }
  return { path: await stage(file, signal, http), how: 'copied' }
}
