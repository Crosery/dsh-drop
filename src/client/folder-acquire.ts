/**
 * Turning a dropped folder into a path the agent can list.
 *
 * The same ladder files take, with a folder's own evidence at each rung:
 *
 * 1. **The desktop bridge.** Inside the desktop app the folder's `File`
 *    (from `getAsFile()`, read during the drop) has a real path, and the
 *    folder is referenced where it lies. The walk that follows only counts,
 *    for the card; nothing is uploaded and no limit applies.
 * 2. **A path hint.** A drag that carried a `file://` URL for the folder
 *    offers a path the Host checks by the folder's first files — their
 *    relative paths, sizes and mtimes — before it is referenced in place.
 * 3. **A copy.** Otherwise the folder is walked under the limits the Host
 *    announced, refused whole when it crosses one, and uploaded file by file
 *    into a batch that the Host publishes as one folder on commit.
 *
 * DOM-free apart from `fetch`, which is injected, so the whole ladder runs
 * under `node --test` over fake entries and a fake Host.
 * @module @crosery/dsh-drop/client/folder-acquire
 */

import {
  BATCH_HEADER, BATCH_ROUTE, DEFAULT_FOLDER_IGNORE, DEFAULT_FOLDER_MAX_DEPTH, DEFAULT_FOLDER_MAX_FILES,
  FOLDER_SAMPLE_SIZE, RELPATH_HEADER, RESOLVE_ROUTE, STAGE_ROUTE, fileNameOf, mentionFor,
  type BatchBeginOk, type BatchCommitOk, type BatchLimitsOk, type BatchRequest, type FolderLimit,
  type FolderLimits, type FolderSummary, type ResolveOk, type ResolveRequest, type StageErr,
} from '../contract.ts'
import { listingOf, sampleOf, walkFolder, type EntryLike, type WalkableFile, type WalkResult } from '../folder.ts'
import type { Acquisition, Fetcher } from './acquire.ts'

/** How far a folder copy is. */
export interface FolderProgress {
  done: number
  total: number
  bytes: number
  totalBytes: number
}

/** What became of one folder. */
export type FolderOutcome =
  | {
    ok: true
    /** Absolute path of the folder, without a trailing separator. */
    path: string
    how: Acquisition
    summary: FolderSummary
    /** Relative paths of its first files. */
    listing: string[]
  }
  /** Refused whole: it crossed a limit. */
  | { ok: false, reason: 'over-limit', limit: FolderLimit, limits: FolderLimits }
  /** Nothing in it could be sent. */
  | { ok: false, reason: 'empty', summary: FolderSummary }

/** How many files upload at once. Small: they share one disk and one connection. */
const UPLOAD_CONCURRENCY = 4

/** Document-relative form of a Host route; see `acquire.ts`. */
function relative(route: string): string {
  return route.startsWith('/') ? route.slice(1) : route
}

/** The part of a browser file a folder copy reads. */
export type FolderFile = WalkableFile & { readonly name?: string }

/**
 * A walk's counts as a summary.
 * @param walk - the walk.
 * @param unreadable - extra files that could not be sent.
 * @returns the summary.
 */
function summaryOf<F extends WalkableFile>(walk: WalkResult<F>, unreadable = 0): FolderSummary {
  return {
    files: walk.files.length,
    bytes: walk.bytes,
    ignored: walk.ignored,
    unreadable: walk.unreadable + unreadable,
    symlinks: 0,
    truncated: walk.truncated || walk.overLimit !== undefined,
  }
}

/**
 * Count a folder that is referenced in place, for its card.
 *
 * Nothing depends on the answer — the folder is already referenced — so the
 * count stops at the default file ceiling and says it did, and the default
 * ignore list keeps it out of dependency trees.
 * @param root - the folder's entry.
 * @param signal - cancellation.
 * @returns the summary and the first paths.
 */
export async function countFolder<F extends WalkableFile>(
  root: EntryLike<F>,
  signal: AbortSignal,
): Promise<{ summary: FolderSummary, listing: string[] }> {
  const walk = await walkFolder(root, {
    maxFiles: DEFAULT_FOLDER_MAX_FILES,
    maxBytes: Number.POSITIVE_INFINITY,
    maxFileBytes: Number.POSITIVE_INFINITY,
    maxDepth: DEFAULT_FOLDER_MAX_DEPTH,
    ignore: DEFAULT_FOLDER_IGNORE,
    stopAfter: DEFAULT_FOLDER_MAX_FILES,
    signal,
  })
  return { summary: summaryOf(walk), listing: listingOf(walk.files) }
}

/** A refused request, carrying the Host's reason. */
export class HostRefusal extends Error {
  readonly status: number
  readonly body: Partial<StageErr>
  constructor(status: number, body: Partial<StageErr>) {
    super(`host refused: ${status} ${body.error ?? ''}`)
    this.name = 'HostRefusal'
    this.status = status
    this.body = body
  }
}

/**
 * One batch-route call.
 * @param http - the request function.
 * @param request - the control body.
 * @param signal - cancellation; absent for the abort that must outlive one.
 * @returns the parsed answer.
 * @throws HostRefusal when the Host refused.
 */
async function control<T>(http: Fetcher, request: BatchRequest, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  }
  if (signal !== undefined) init.signal = signal
  const response = await http(relative(BATCH_ROUTE), init)
  const body = await response.json().catch(() => ({})) as unknown
  if (!response.ok) throw new HostRefusal(response.status, body as Partial<StageErr>)
  return body as T
}

/**
 * Ask the Host whether a hinted path is this folder.
 * @param path - absolute path decoded from the drag, trailing separator removed.
 * @param walk - the folder walk the sample is taken from.
 * @param signal - cancellation.
 * @param http - the request function.
 * @returns the confirmed path and the Host's counts, or undefined.
 */
async function resolveFolder<F extends WalkableFile>(
  path: string,
  walk: WalkResult<F>,
  signal: AbortSignal,
  http: Fetcher,
): Promise<ResolveOk | undefined> {
  const claim: ResolveRequest = {
    path, size: 0, lastModified: 0, kind: 'directory', sample: sampleOf(walk.files, FOLDER_SAMPLE_SIZE),
  }
  try {
    const response = await http(relative(RESOLVE_ROUTE), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(claim),
      signal,
    })
    if (!response.ok) return undefined
    const body = await response.json() as ResolveOk
    return typeof body.path === 'string' && body.path !== '' ? body : undefined
  } catch {
    signal.throwIfAborted()
    return undefined
  }
}

/**
 * Upload a walked folder into one batch and publish it.
 * @param name - the folder's name.
 * @param walk - the walk, already judged within limits.
 * @param signal - cancellation; aborting removes the batch.
 * @param http - the request function.
 * @param onProgress - called after each file.
 * @returns the outcome.
 */
async function copyFolder<F extends FolderFile>(
  name: string,
  walk: WalkResult<F>,
  signal: AbortSignal,
  http: Fetcher,
  onProgress: (progress: FolderProgress) => void,
): Promise<FolderOutcome> {
  const begun = await control<BatchBeginOk>(http, { op: 'begin', name }, signal)
  const id = begun.id
  // Everything below runs under a signal of its own, so one failed file can
  // stop the others; the caller's signal feeds it.
  const inner = new AbortController()
  const forward = (): void => { inner.abort(signal.reason) }
  signal.addEventListener('abort', forward, { once: true })
  const total = walk.files.length
  const progress: FolderProgress = { done: 0, total, bytes: 0, totalBytes: walk.bytes }
  onProgress({ ...progress })

  let skipped = 0
  let refusal: HostRefusal | undefined
  let failure: unknown
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < total && refusal === undefined && failure === undefined) {
      const { segments, file } = walk.files[next++]!
      try {
        const response = await http(relative(STAGE_ROUTE), {
          method: 'POST',
          headers: { [BATCH_HEADER]: id, [RELPATH_HEADER]: encodeURIComponent(segments.join('/')) },
          body: file as unknown as BodyInit,
          signal: inner.signal,
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as Partial<StageErr>
          // A path the Host will not create costs this file, not the folder.
          if (response.status === 400 && body.error === 'unsafe-path') skipped += 1
          else throw new HostRefusal(response.status, body)
        } else {
          await response.json().catch(() => undefined)
        }
      } catch (error) {
        if (refusal === undefined && failure === undefined) {
          if (error instanceof HostRefusal) refusal = error
          else failure = error
          inner.abort(error)
        }
        return
      }
      progress.done += 1
      progress.bytes += file.size
      onProgress({ ...progress })
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, total) }, worker))
    signal.throwIfAborted()
    if (refusal !== undefined) {
      // The Host drops a batch that crossed a ceiling itself.
      if (refusal.status === 413) {
        return { ok: false, reason: 'over-limit', limit: refusal.body.limit ?? 'bytes', limits: begun.limits }
      }
      throw refusal
    }
    if (failure !== undefined) throw failure
    const committed = await control<BatchCommitOk>(http, { op: 'commit', id }, signal)
    return {
      ok: true,
      path: committed.path,
      how: 'copied',
      summary: {
        ...committed.summary,
        ignored: walk.ignored,
        unreadable: walk.unreadable + skipped,
      },
      listing: listingOf(walk.files),
    }
  } catch (error) {
    // Best effort and deliberately without the aborted signal: the Host's
    // idle sweep removes the batch if this never arrives.
    if (!(error instanceof HostRefusal && (error.body.error === 'empty' || error.status === 413))) {
      void control(http, { op: 'abort', id }).catch(() => {})
    }
    if (error instanceof HostRefusal && error.body.error === 'empty') {
      return { ok: false, reason: 'empty', summary: summaryOf(walk, skipped) }
    }
    throw error
  } finally {
    signal.removeEventListener('abort', forward)
  }
}

/**
 * Get a readable path for one dropped folder that has no bridge path.
 * @param root - the folder's entry, read during the drop.
 * @param name - the folder's name.
 * @param hints - absolute paths decoded from the drag's `text/uri-list`.
 * @param signal - cancellation: the card's removal or plugin teardown.
 * @param onProgress - called as files upload.
 * @param http - the request function; `fetch` by default.
 * @returns the outcome.
 * @throws when the Host could not be reached or refused for another reason.
 */
export async function acquireFolder<F extends FolderFile>(
  root: EntryLike<F>,
  name: string,
  hints: readonly string[],
  signal: AbortSignal,
  onProgress: (progress: FolderProgress) => void,
  http: Fetcher = (url, init) => fetch(url, init),
): Promise<FolderOutcome> {
  const { limits } = await control<BatchLimitsOk>(http, { op: 'limits' }, signal)
  const walk = await walkFolder(root, { ...limits, signal })

  // A hinted path is worth checking even for a folder too big to copy:
  // referenced in place, its size costs nothing.
  const hint = hints.find((path) => fileNameOf(path) === name)
  const path = hint === undefined ? undefined : hint.length > 1 ? hint.replace(/[\\/]+$/, '') : hint
  if (path !== undefined && mentionFor(path, 'directory') !== undefined) {
    const confirmed = await resolveFolder(path, walk, signal, http)
    if (confirmed !== undefined) {
      return {
        ok: true,
        path: confirmed.path,
        how: 'in-place',
        summary: confirmed.summary ?? summaryOf(walk),
        listing: listingOf(walk.files),
      }
    }
  }

  if (walk.overLimit !== undefined) return { ok: false, reason: 'over-limit', limit: walk.overLimit, limits }
  if (walk.files.length === 0) return { ok: false, reason: 'empty', summary: summaryOf(walk) }
  return copyFolder(name, walk, signal, http, onProgress)
}
