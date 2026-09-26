/**
 * The folder batch: a dropped folder copied to the Host with its structure.
 *
 * A folder that has no path the Host can read — dropped into a browser, which
 * never reveals one — reaches the model only as a copy. Copying it file by
 * file through the single-file route would flatten it; this route keeps the
 * tree. The browser opens a batch, sends each file through the staging route
 * with the batch id and the file's path inside the folder, and commits. Only
 * then does the folder appear under the staging root, whole, under a name
 * nothing else holds:
 *
 * - `begin` makes a private directory (`drops/DAY/.batch-<uuid>/`) and
 *   answers with a random id — the capability for that directory alone — and
 *   the limits the batch runs under;
 * - each file's relative path is re-sanitized here, never trusted
 *   ({@link safeRelativeSegments}), joined under the private tree, checked to
 *   still be inside it, and published without replacing anything;
 * - the per-file ceiling and the folder's file, byte and depth ceilings are
 *   enforced on what actually arrives; crossing one refuses the whole batch
 *   and removes it, because a folder copied in part would mislead the model;
 * - `commit` claims the final name with an exclusive `mkdir` and renames the
 *   tree onto that claim, so a reader either never learns the path or sees
 *   the whole folder;
 * - `abort`, an idle timeout and plugin disposal remove a batch that will
 *   never commit.
 * @module @crosery/dsh-drop/folder-stage
 */

import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, rmdir } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join, relative, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import {
  RELPATH_HEADER, folderCandidate, safeFolderName, safeRelativeSegments, stageDayDir,
  type BatchAbortOk, type BatchBeginOk, type BatchCommitOk, type BatchFileOk, type BatchLimitsOk,
  type BatchRequest, type FolderLimit, type FolderLimits, type StageErr,
} from './contract.ts'
import {
  crossSite, declaresJson, headerOf, insideRoot, publishStage, refused, sendJson,
  type BatchReceiver, type RequestRejection,
} from './stage-route.ts'

/** Largest control body accepted; an op, an id and a folder name. */
const MAX_BODY_BYTES = 4096

/** A batch untouched for this long is removed. */
const DEFAULT_IDLE_MS = 30 * 60_000

/** Most batches open at once; one per folder being uploaded. */
const DEFAULT_MAX_OPEN = 8

/** How many suffixed folder names to try before a random prefix. */
const MAX_COLLISION_ATTEMPTS = 100

/** Thrown while a file streams in, when a ceiling is crossed. */
class OverLimitError extends Error {
  readonly limit: FolderLimit
  constructor(limit: FolderLimit) {
    super(`folder upload crosses its ${limit} ceiling`)
    this.name = 'OverLimitError'
    this.limit = limit
  }
}

/** One open batch. */
interface Batch {
  readonly id: string
  /** The name the folder is published under, sanitized. */
  readonly name: string
  /** The day directory the folder is published into. */
  readonly dayDir: string
  /** The batch's private directory; everything below it is this batch's. */
  readonly home: string
  /** The folder being assembled. */
  readonly tree: string
  /** Partial uploads, kept outside the tree so none is ever published half-written. */
  readonly parts: string
  /** The limits announced at `begin`; later settings edits do not move them. */
  readonly limits: FolderLimits
  /** Files published into the tree. */
  files: number
  /** Bytes received, including files still streaming. */
  bytes: number
  /** Uploads streaming now. */
  inFlight: number
  /** Last activity, epoch milliseconds. */
  touched: number
  /** Set once the batch was committed, aborted or expired. */
  closed: boolean
}

/** Runtime knobs of the batch route. */
export interface BatchOptions {
  /** Absolute staging root. */
  root: () => string
  /** The limits a new batch runs under, read at `begin`. */
  limits: () => FolderLimits
  /** Clock, injected so tests do not depend on the wall clock. */
  now?: () => number
  /** Idle time after which a batch is removed. */
  idleMs?: number
  /** Most batches open at once. */
  maxOpen?: number
  /** Apply the Windows name rules; the running platform by default. */
  win32?: boolean
  /** Sweep interval for idle batches; 0 sweeps only when a request arrives. */
  sweepEveryMs?: number
  /** The Host's admission check, when the running harness has one. */
  reject?: RequestRejection | undefined
}

/** The batch route and the batch-file receiver, sharing one set of open batches. */
export interface BatchStore extends BatchReceiver {
  /** Handler of {@link BATCH_ROUTE}: `limits`, `begin`, `commit`, `abort`. */
  handler(req: IncomingMessage, res: ServerResponse): Promise<void>
  /** Remove batches idle past the timeout. */
  sweep(): Promise<void>
  /** Remove every open batch; the store answers nothing afterwards. */
  dispose(): Promise<void>
  /** How many batches are open. */
  open(): number
}

/**
 * Publish an assembled folder under a name nothing else holds.
 *
 * The name is claimed with an exclusive `mkdir` — the directory analogue of
 * the `link` the single-file route publishes with — and the tree is renamed
 * onto that empty claim, which POSIX `rename` replaces. A claim somebody else
 * wrote into in between refuses the rename, and the next name is tried. On
 * Windows, where `rename` will not replace a directory at all, the empty
 * claim is removed first.
 * @param tree - the assembled folder.
 * @param dir - the directory to publish into.
 * @param name - the sanitized folder name.
 * @returns the published absolute path.
 */
export async function publishDirectory(tree: string, dir: string, name: string): Promise<string> {
  for (let attempt = 0; attempt <= MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const candidate = join(dir, attempt === MAX_COLLISION_ATTEMPTS
      ? `${randomUUID()}-${name}` : folderCandidate(name, attempt))
    try {
      await mkdir(candidate)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
    try {
      await rename(tree, candidate)
      return candidate
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOTEMPTY' || code === 'EEXIST') continue
      if (code !== 'EPERM' && code !== 'EACCES') throw error
    }
    // Windows: the claim is ours and empty; give it up and take the name.
    await rmdir(candidate).catch(() => {})
    try {
      await rename(tree, candidate)
      return candidate
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOTEMPTY' && code !== 'EEXIST' && code !== 'EPERM' && code !== 'EACCES') throw error
    }
  }
  throw new Error('could not publish a unique folder path')
}

/**
 * Read one JSON control body.
 * @param req - the request.
 * @returns the parsed request, or undefined when it is oversized or malformed.
 */
async function readControl(req: IncomingMessage): Promise<BatchRequest | undefined> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const op: unknown = Reflect.get(value, 'op')
  if (op === 'limits') return { op }
  if (op === 'begin') {
    const name: unknown = Reflect.get(value, 'name')
    return typeof name === 'string' ? { op, name } : undefined
  }
  if (op === 'commit' || op === 'abort') {
    const id: unknown = Reflect.get(value, 'id')
    return typeof id === 'string' && id !== '' ? { op, id } : undefined
  }
  return undefined
}

/**
 * Build the batch store.
 * @param opts - runtime knobs.
 * @returns the batch route handler and the batch-file receiver.
 */
export function batchStore(opts: BatchOptions): BatchStore {
  const clock = opts.now ?? Date.now
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS
  const maxOpen = opts.maxOpen ?? DEFAULT_MAX_OPEN
  const win32 = opts.win32 ?? process.platform === 'win32'
  const batches = new Map<string, Batch>()
  let disposed = false

  /** Close a batch and remove everything it wrote. */
  const drop = async (batch: Batch): Promise<void> => {
    batch.closed = true
    batches.delete(batch.id)
    await rm(batch.home, { recursive: true, force: true }).catch(() => {})
  }

  const sweep = async (): Promise<void> => {
    const now = clock()
    const stale = [...batches.values()].filter((batch) => batch.inFlight === 0 && now - batch.touched > idleMs)
    await Promise.all(stale.map(drop))
  }

  const timer = opts.sweepEveryMs !== undefined && opts.sweepEveryMs > 0
    ? setInterval(() => { void sweep() }, opts.sweepEveryMs)
    : undefined
  // A pending sweep must not keep a Host process alive on its own.
  timer?.unref()

  const refuse = (res: ServerResponse, status: number, body: StageErr): void => { sendJson(res, status, body) }

  const begin = async (res: ServerResponse, name: string): Promise<void> => {
    await sweep()
    if (batches.size >= maxOpen) {
      refuse(res, 429, { error: 'busy' })
      return
    }
    const id = randomUUID()
    const dayDir = join(opts.root(), stageDayDir(clock()))
    const home = join(dayDir, `.batch-${id}`)
    const batch: Batch = {
      id,
      name: safeFolderName(name, { win32 }),
      dayDir,
      home,
      tree: join(home, 'tree'),
      parts: join(home, 'parts'),
      limits: opts.limits(),
      files: 0,
      bytes: 0,
      inFlight: 0,
      touched: clock(),
      closed: false,
    }
    try {
      await mkdir(batch.tree, { recursive: true })
      await mkdir(batch.parts, { recursive: true })
    } catch {
      await rm(home, { recursive: true, force: true }).catch(() => {})
      refuse(res, 500, { error: 'write-failed' })
      return
    }
    batches.set(id, batch)
    sendJson(res, 200, { id, limits: batch.limits } satisfies BatchBeginOk)
  }

  const commit = async (res: ServerResponse, batch: Batch): Promise<void> => {
    if (batch.inFlight > 0) {
      refuse(res, 409, { error: 'busy' })
      return
    }
    if (batch.files === 0) {
      await drop(batch)
      refuse(res, 400, { error: 'empty' })
      return
    }
    batch.closed = true
    batches.delete(batch.id)
    let path: string
    try {
      path = await publishDirectory(batch.tree, batch.dayDir, batch.name)
    } catch {
      await rm(batch.home, { recursive: true, force: true }).catch(() => {})
      refuse(res, 500, { error: 'write-failed' })
      return
    }
    await rm(batch.home, { recursive: true, force: true }).catch(() => {})
    sendJson(res, 200, {
      path,
      summary: { files: batch.files, bytes: batch.bytes, ignored: 0, unreadable: 0, symlinks: 0, truncated: false },
    } satisfies BatchCommitOk)
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (refused(opts.reject, req, res)) return
    if (req.method !== 'POST') {
      req.resume()
      refuse(res, 405, { error: 'method' })
      return
    }
    if (!declaresJson(req) || crossSite(req)) {
      req.resume()
      refuse(res, 403, { error: 'forbidden' })
      return
    }
    const control = await readControl(req)
    if (control === undefined) {
      refuse(res, 400, { error: 'bad-request' })
      return
    }
    if (disposed) {
      refuse(res, 404, { error: 'unknown-batch' })
      return
    }
    if (control.op === 'limits') {
      sendJson(res, 200, { limits: opts.limits() } satisfies BatchLimitsOk)
      return
    }
    if (control.op === 'begin') {
      await begin(res, control.name)
      return
    }
    await sweep()
    const batch = batches.get(control.id)
    if (batch === undefined) {
      refuse(res, 404, { error: 'unknown-batch' })
      return
    }
    if (control.op === 'abort') {
      await drop(batch)
      sendJson(res, 200, { aborted: true } satisfies BatchAbortOk)
      return
    }
    await commit(res, batch)
  }

  const receive = async (req: IncomingMessage, res: ServerResponse, id: string): Promise<void> => {
    await sweep()
    const batch = disposed ? undefined : batches.get(id)
    if (batch === undefined) {
      req.resume()
      refuse(res, 404, { error: 'unknown-batch' })
      return
    }
    batch.touched = clock()

    let decoded: string | undefined
    try {
      const raw = headerOf(req, RELPATH_HEADER)
      decoded = raw === undefined ? undefined : decodeURIComponent(raw)
    } catch {
      decoded = undefined
    }
    // Sanitized without a depth ceiling first, so a path that is merely too
    // deep is told apart from one that is unsafe: the first refuses the
    // folder, the second only this file.
    const segments = decoded === undefined ? undefined : safeRelativeSegments(decoded, { maxDepth: Infinity, win32 })
    if (segments === undefined) {
      req.resume()
      refuse(res, 400, { error: 'unsafe-path' })
      return
    }
    const { limits } = batch
    if (segments.length > limits.maxDepth) {
      req.resume()
      await drop(batch)
      refuse(res, 413, { error: 'too-deep', limit: 'depth' })
      return
    }
    if (batch.files + batch.inFlight + 1 > limits.maxFiles) {
      req.resume()
      await drop(batch)
      refuse(res, 413, { error: 'too-many', limit: 'files' })
      return
    }
    const target = join(batch.tree, ...segments)
    if (!insideRoot(batch.tree, target) || target === batch.tree) {
      req.resume()
      refuse(res, 400, { error: 'unsafe-path' })
      return
    }

    batch.inFlight += 1
    const part = join(batch.parts, randomUUID())
    let seen = 0
    let status: number
    let body: BatchFileOk | StageErr
    try {
      try {
        await mkdir(dirname(target), { recursive: true })
      } catch {
        // A file already sits where this path needs a directory — two names
        // that sanitized alike. Only this file is refused.
        req.resume()
        throw Object.assign(new Error('path is occupied'), { unsafe: true })
      }
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          seen += chunk.length
          batch.bytes += chunk.length
          if (seen > limits.maxFileBytes) {
            done(new OverLimitError('file-bytes'))
            return
          }
          if (batch.bytes > limits.maxBytes) {
            done(new OverLimitError('bytes'))
            return
          }
          done(null, chunk)
        },
      })
      await pipeline(req, meter, createWriteStream(part))
      if (batch.closed) throw new Error('batch closed')
      const published = await publishStage(part, dirname(target), segments[segments.length - 1]!)
      batch.files += 1
      status = 200
      body = { path: relative(batch.tree, published).split(sep).join('/') }
    } catch (error) {
      batch.bytes -= seen
      if (error instanceof OverLimitError) {
        status = 413
        body = { error: error.limit === 'files' ? 'too-many' : 'too-large', limit: error.limit }
        await drop(batch)
      } else if (batch.closed) {
        status = 404
        body = { error: 'unknown-batch' }
      } else if (Reflect.get(error as object, 'unsafe') === true) {
        status = 400
        body = { error: 'unsafe-path' }
      } else {
        status = 500
        body = { error: 'write-failed' }
      }
    } finally {
      batch.inFlight -= 1
      batch.touched = clock()
    }
    await rm(part, { force: true }).catch(() => {})
    // An abort that raced this upload may have removed the batch while its
    // directories were being created; whatever this request recreated goes too.
    if (batch.closed && !batches.has(batch.id)) {
      await rm(batch.home, { recursive: true, force: true }).catch(() => {})
    }
    sendJson(res, status, body)
  }

  return {
    handler,
    receive,
    sweep,
    open: () => batches.size,
    dispose: async () => {
      disposed = true
      if (timer !== undefined) clearInterval(timer)
      await Promise.all([...batches.values()].map(drop))
    },
  }
}
