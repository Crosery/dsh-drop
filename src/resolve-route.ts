/**
 * The resolve route: confirm that a path really is the file that was dropped.
 *
 * This is what keeps a copy from being the only outcome. When the drag carries
 * a `file://` URL — Finder and Explorer usually put one on `text/uri-list` —
 * the file already has a path the agent can read, and copying it into the
 * staging directory would leave the user referencing a stale duplicate of a
 * file they can still edit. So the browser's claim is checked and, if it holds,
 * the original path is referenced in place.
 *
 * The route only ever calls `stat`. It writes nothing, reads no bytes, and
 * returns nothing the caller did not already send — a path is echoed back only
 * when its size and modification time match what the caller claimed, so it
 * cannot be used to read a directory listing or a file's contents. It does
 * confirm existence for a fully-specified guess (path plus exact size plus
 * exact mtime), which is a far weaker oracle than the staging route beside it
 * already offers.
 *
 * A folder is claimed the same way, with its contents standing in for the
 * size and mtime a directory does not meaningfully have: the browser
 * describes up to {@link FOLDER_SAMPLE_SIZE} of the folder's files, and every
 * one of them has to be a regular file inside the claimed directory with that
 * size and mtime. A folder with fewer files has to be described completely.
 * Only then does the route look inside — a bounded walk that follows no link
 * — and answer counts, never names.
 * @module @crosery/dsh-drop/resolve-route
 */

import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute, join } from 'node:path'
import {
  DEFAULT_FOLDER_IGNORE, DEFAULT_FOLDER_MAX_DEPTH, FOLDER_SAMPLE_SIZE, MTIME_TOLERANCE_MS, UNMENTIONABLE,
  isIgnoredName, safeRelativeSegments,
  type FolderSampleEntry, type FolderSummary, type ResolveOk, type ResolveRequest, type StageErr,
} from './contract.ts'
import { crossSite, declaresJson, insideRoot, refused, type RequestRejection } from './stage-route.ts'

/**
 * Largest claim body accepted: a folder claim carries a sample of relative
 * paths, each at most 1 KB, which stays far below this.
 */
const MAX_BODY_BYTES = 16384

/** A finite number, or undefined. */
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Read a folder claim's sample, rejecting anything malformed.
 * @param raw - the parsed `sample` member.
 * @returns the entries, or undefined when the sample is not usable.
 */
function readSample(raw: unknown): FolderSampleEntry[] | undefined {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > FOLDER_SAMPLE_SIZE) return undefined
  const sample: FolderSampleEntry[] = []
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) return undefined
    const path: unknown = Reflect.get(item, 'path')
    const size = finite(Reflect.get(item, 'size'))
    const lastModified = finite(Reflect.get(item, 'lastModified'))
    if (typeof path !== 'string' || path === '' || size === undefined || lastModified === undefined) return undefined
    sample.push({ path, size, lastModified })
  }
  return sample
}

/**
 * Read and parse the JSON claim.
 * @param req - the request.
 * @returns the claim, or undefined when the body is oversized or malformed.
 */
export async function readClaim(req: IncomingMessage): Promise<ResolveRequest | undefined> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<ResolveRequest>
    if (typeof value.path !== 'string' || value.path === '') return undefined
    if (value.kind === 'directory') {
      const sample = readSample(value.sample)
      if (sample === undefined) return undefined
      return { path: value.path, size: 0, lastModified: 0, kind: 'directory', sample }
    }
    if (value.kind !== undefined && value.kind !== 'file') return undefined
    if (typeof value.size !== 'number' || !Number.isFinite(value.size)) return undefined
    if (typeof value.lastModified !== 'number' || !Number.isFinite(value.lastModified)) return undefined
    return { path: value.path, size: value.size, lastModified: value.lastModified }
  } catch {
    return undefined
  }
}

/**
 * Whether a stat result matches the claim.
 * @param entry - size and mtime read from disk.
 * @param claim - what the browser said about the dropped file.
 * @returns true when the path is the same file.
 */
export function claimMatches(entry: { size: number, mtimeMs: number }, claim: ResolveRequest): boolean {
  if (entry.size !== claim.size) return false
  return Math.abs(entry.mtimeMs - claim.lastModified) <= MTIME_TOLERANCE_MS
}

/** How a folder is looked into. */
export interface FolderRules {
  /** Base names skipped and counted. */
  ignore: readonly string[]
  /** Deepest level walked, in path segments below the folder. */
  maxDepth: number
  /** Apply the Windows name rules to sample paths. */
  win32?: boolean | undefined
  /** Most entries visited before the count stops, truncated. */
  maxEntries?: number | undefined
  /** Most milliseconds spent before the count stops, truncated. */
  budgetMs?: number | undefined
}

/** Default entry cap of a folder summary. */
const SUMMARY_MAX_ENTRIES = 50_000

/** Default time cap of a folder summary. */
const SUMMARY_BUDGET_MS = 2000

/**
 * Count what one directory holds, within bounds.
 *
 * Breadth-first over `readdir` entries, and links are counted, never
 * followed — a link back to an ancestor is one more entry, not a loop.
 * Names on the ignore list are counted and not opened. The walk stops at
 * the entry or time cap, or below the depth ceiling, and says so.
 * @param root - absolute directory path.
 * @param rules - ignore list and caps.
 * @returns the counts.
 */
export async function summarizeDirectory(root: string, rules: FolderRules): Promise<FolderSummary> {
  const summary: FolderSummary = { files: 0, bytes: 0, ignored: 0, unreadable: 0, symlinks: 0, truncated: false }
  const maxEntries = rules.maxEntries ?? SUMMARY_MAX_ENTRIES
  const deadline = Date.now() + (rules.budgetMs ?? SUMMARY_BUDGET_MS)
  let entries = 0
  const queue: { dir: string, depth: number }[] = [{ dir: root, depth: 0 }]
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!
    let children
    try {
      children = await readdir(dir, { withFileTypes: true })
    } catch {
      summary.unreadable += 1
      continue
    }
    for (const child of children) {
      entries += 1
      if (entries > maxEntries || Date.now() > deadline) {
        summary.truncated = true
        return summary
      }
      if (isIgnoredName(child.name, rules.ignore)) {
        summary.ignored += 1
        continue
      }
      if (child.isSymbolicLink()) {
        summary.symlinks += 1
        continue
      }
      const path = join(dir, child.name)
      if (child.isDirectory()) {
        if (depth + 1 >= rules.maxDepth) summary.truncated = true
        else queue.push({ dir: path, depth: depth + 1 })
        continue
      }
      if (!child.isFile()) continue
      try {
        summary.bytes += (await lstat(path)).size
        summary.files += 1
      } catch {
        summary.unreadable += 1
      }
    }
  }
  return summary
}

/**
 * Check a folder claim and, when it holds, count the folder.
 *
 * Every sampled file must be a distinct file (not merely a distinct spelling
 * of one), a regular file (not a link), resolve
 * inside the claimed directory, and match its claimed size and mtime. An
 * empty sample claims an empty folder, so the directory may hold nothing but
 * ignored names. And the sample must be as large as the folder allows: a
 * caller who knows one file cannot claim a folder of a thousand.
 * @param path - the claimed absolute directory.
 * @param sample - the claim's files.
 * @param rules - how the folder is looked into.
 * @returns the counts, or undefined when the claim does not hold.
 */
export async function claimDirectory(
  path: string,
  sample: readonly FolderSampleEntry[],
  rules: FolderRules,
): Promise<FolderSummary | undefined> {
  const entry = await stat(path)
  if (!entry.isDirectory()) return undefined
  const real = await realpath(path)
  const seen = new Set<string>()
  for (const claim of sample) {
    const segments = safeRelativeSegments(claim.path, { maxDepth: rules.maxDepth, win32: rules.win32 })
    if (segments === undefined) return undefined
    const target = join(path, ...segments)
    const file = await lstat(target, { bigint: true })
    if (!file.isFile()) return undefined
    if (!claimMatches({ size: Number(file.size), mtimeMs: Number(file.mtimeNs) / 1e6 }, claim)) return undefined
    // Distinct files, not distinct spellings: on a case- or
    // normalization-insensitive volume (APFS, NTFS) `readme.md` and
    // `README.md` are one file, as is a path through a link back into the
    // folder. The inode says so where the path cannot; a volume that reports
    // none keeps the path as the key.
    const key = file.ino === 0n ? `path:${segments.join('/')}` : `${file.dev}:${file.ino}`
    if (seen.has(key)) return undefined
    seen.add(key)
    // A link in the middle of the path could lead anywhere; the file has to
    // really live inside the folder.
    if (!insideRoot(real, await realpath(target))) return undefined
  }
  if (sample.length === 0) {
    const names = await readdir(path)
    if (names.some((name) => !isIgnoredName(name, rules.ignore))) return undefined
  }
  const summary = await summarizeDirectory(path, rules)
  if (sample.length < Math.min(FOLDER_SAMPLE_SIZE, summary.files)) return undefined
  return summary
}

/** Runtime knobs of the resolve route. */
export interface ResolveOptions {
  /** The Host's admission check, when the running harness has one. */
  reject?: RequestRejection | undefined
  /** How a claimed folder is looked into; read per request. */
  folder?: (() => FolderRules) | undefined
}

/** The default folder rules, for a route built without settings. */
const DEFAULT_RULES: FolderRules = { ignore: DEFAULT_FOLDER_IGNORE, maxDepth: DEFAULT_FOLDER_MAX_DEPTH }

/**
 * Build the resolve handler.
 * @param opts - the admission check.
 * @returns a node:http handler owning the full response lifecycle.
 */
export function resolveHandler(opts: ResolveOptions = {}): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const json = (res: ServerResponse, status: number, body: ResolveOk | StageErr): void => {
    const payload = JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(payload)
  }

  return async (req, res) => {
    if (refused(opts.reject, req, res)) return
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method' })
      return
    }
    // The same cross-site gate the stage route applies: a declared JSON body
    // and no cross-origin Fetch Metadata.
    if (!declaresJson(req) || crossSite(req)) {
      req.resume()
      json(res, 403, { error: 'forbidden' })
      return
    }
    const claim = await readClaim(req)
    if (claim === undefined || !isAbsolute(claim.path) || UNMENTIONABLE.test(claim.path)) {
      json(res, 404, { error: 'no-match' })
      return
    }
    if (claim.kind === 'directory') {
      // Echoed without its trailing separator; the mention adds its own.
      const path = claim.path.length > 1 ? claim.path.replace(/[\\/]+$/, '') : claim.path
      try {
        const summary = await claimDirectory(path, claim.sample ?? [], opts.folder?.() ?? DEFAULT_RULES)
        if (summary === undefined) json(res, 404, { error: 'no-match' })
        else json(res, 200, { path, summary })
      } catch {
        json(res, 404, { error: 'no-match' })
      }
      return
    }
    try {
      const entry = await stat(claim.path)
      // A directory of the right size is not the dropped file; only a regular
      // file can be read back by the path this would hand the model.
      if (!entry.isFile() || !claimMatches(entry, claim)) {
        json(res, 404, { error: 'no-match' })
        return
      }
      json(res, 200, { path: claim.path })
    } catch {
      json(res, 404, { error: 'no-match' })
    }
  }
}
