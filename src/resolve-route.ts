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
 * @module @crosery/dsh-drop/resolve-route
 */

import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute } from 'node:path'
import {
  MTIME_TOLERANCE_MS, type ResolveOk, type ResolveRequest, type StageErr,
} from './contract.ts'

/** Largest claim body accepted; a path plus two numbers is far below this. */
const MAX_BODY_BYTES = 8192

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

/**
 * Build the resolve handler.
 * @returns a node:http handler owning the full response lifecycle.
 */
export function resolveHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
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
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method' })
      return
    }
    const claim = await readClaim(req)
    if (claim === undefined || !isAbsolute(claim.path) || /[\u0000-\u001f\u007f"]/.test(claim.path)) {
      json(res, 404, { error: 'no-match' })
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
