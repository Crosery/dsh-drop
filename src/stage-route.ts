/**
 * The staging route: one dropped file in, one absolute path out.
 *
 * This is a write endpoint, which is a different security shape from the read
 * endpoints elsewhere in this workspace. A signed reference is the answer when
 * the caller names the path (`@crosery/dsh-viewer`'s asset route); here the
 * caller names nothing — the destination directory is fixed by configuration
 * and the browser only contributes a file name, which is reduced to a single
 * safe segment before it is joined. The resolved target is then re-checked
 * against the staging root, so a sanitizer bug degrades to a refusal rather
 * than to a write outside the directory.
 *
 * Bytes stream to a temporary file and are renamed into place only after the
 * body completes. A reader therefore either does not see the file or sees all
 * of it — never the first half of a video the browser was still uploading.
 * @module @crosery/dsh-drop/stage-route
 */

import { createWriteStream } from 'node:fs'
import { mkdir, link, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import {
  NAME_HEADER, safeStageName, stageCandidate, stageDayDir,
  type StageErr, type StageOk,
} from './contract.ts'

/** Thrown by the counting transform when the body exceeds the ceiling. */
class TooLargeError extends Error {
  constructor() {
    super('upload exceeds the configured ceiling')
    this.name = 'TooLargeError'
  }
}

/** How many suffixed candidates to try before giving up on a readable name. */
const MAX_COLLISION_ATTEMPTS = 100

/** Runtime knobs the route reads fresh on every request. */
export interface StageOptions {
  /** Absolute staging root; re-read per request so a settings edit takes effect live. */
  root: () => string
  /** Per-file ceiling in bytes. */
  maxBytes: () => number
  /** Clock, injected so tests do not depend on the wall clock. */
  now?: () => number
}

/**
 * Answer with a JSON body and no cache.
 * @param res - the response.
 * @param status - HTTP status.
 * @param body - payload.
 */
function json(res: ServerResponse, status: number, body: StageOk | StageErr): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(payload)
}

/**
 * Read the file name the browser declared.
 *
 * The header is URI-encoded because a file name is arbitrary Unicode and HTTP
 * header values are not. A malformed encoding is not worth refusing over — the
 * sanitizer's fallback name is a better outcome than a failed drop.
 * @param req - the request.
 * @returns a single safe path segment.
 */
export function requestedName(req: IncomingMessage): string {
  const raw = req.headers[NAME_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === undefined) return safeStageName('')
  try {
    return safeStageName(decodeURIComponent(value))
  } catch {
    return safeStageName(value)
  }
}

/** Publish complete bytes atomically; link refuses an existing target. */
export async function publishStage(temp: string, dir: string, name: string): Promise<string> {
  for (let attempt = 0; attempt <= MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const candidate = join(dir, attempt === MAX_COLLISION_ATTEMPTS
      ? `${randomUUID()}-${name}` : stageCandidate(name, attempt))
    try {
      await link(temp, candidate)
      return candidate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('could not publish a unique staged path')
}

/**
 * Whether a resolved target is inside the staging root.
 *
 * Defense in depth behind {@link safeStageName}: the sanitizer is what makes
 * traversal impossible, and this is what makes a sanitizer bug harmless.
 * @param root - absolute staging root.
 * @param target - absolute candidate path.
 * @returns true when target is root or below it.
 */
export function insideRoot(root: string, target: string): boolean {
  const base = resolve(root)
  const path = resolve(target)
  return path === base || path.startsWith(base.endsWith(sep) ? base : `${base}${sep}`)
}

/**
 * Build the staging request handler.
 * @param opts - runtime knobs.
 * @returns a node:http handler owning the full response lifecycle.
 */
export function stageHandler(opts: StageOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const clock = opts.now ?? Date.now

  return async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method' })
      return
    }

    // A browser simple/form POST cannot supply this non-safelisted header.
    // No CORS permission is granted; Fetch Metadata additionally rejects cross-origin calls.
    if (typeof req.headers[NAME_HEADER] !== 'string'
      || (req.headers['sec-fetch-site'] !== undefined && req.headers['sec-fetch-site'] !== 'same-origin')) {
      req.resume()
      json(res, 403, { error: 'forbidden' })
      return
    }

    const root = opts.root()
    const dir = join(root, stageDayDir(clock()))
    const name = requestedName(req)
    const limit = opts.maxBytes()

    let temp: string | undefined
    let status: number
    let body: StageOk | StageErr
    try {
      await mkdir(dir, { recursive: true })
      temp = join(dir, `.incoming-${randomUUID()}`)

      let seen = 0
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          seen += chunk.length
          if (seen > limit) {
            done(new TooLargeError())
            return
          }
          done(null, chunk)
        },
      })

      await pipeline(req, meter, createWriteStream(temp))

      const target = await publishStage(temp, dir, name)
      if (insideRoot(root, target)) {
        await rm(temp)
        temp = undefined
        status = 200
        body = { path: target }
      } else {
        status = 400
        body = { error: 'write-failed' }
      }
    } catch (error) {
      status = error instanceof TooLargeError ? 413 : 500
      body = { error: error instanceof TooLargeError ? 'too-large' : 'write-failed' }
    }

    // Cleanup precedes the response rather than trailing it in a `finally`:
    // a caller that reads the staging directory the moment it is refused must
    // not find the abandoned partial upload it was just told does not exist.
    if (temp !== undefined) await rm(temp, { force: true }).catch(() => {})
    json(res, status, body)
  }
}
