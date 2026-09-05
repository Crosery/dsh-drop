/**
 * Turning a dropped or pasted file into a path the agent can read.
 *
 * Two outcomes, in preference order. **In place** is the good one: the drag
 * carried a `file://` URL, the Host confirmed that path is this exact file, and
 * the reference points at the user's own file — edits to it are visible on the
 * next read, and nothing was duplicated. **Copied** is the fallback for
 * everything else: a browser that withholds the URL, a file from outside any
 * path this process can reach, a paste with no path flavor at all.
 *
 * The fallback is not a defect to be engineered away. A file can arrive from a
 * download panel, another application's drag source, or a clipboard image with
 * no filesystem existence at all; those have no path to reference, and a copy
 * is the only way they can reach the model.
 * @module @crosery/dsh-drop/client/acquire
 */

import {
  NAME_HEADER, RESOLVE_ROUTE, STAGE_ROUTE, fileNameOf,
  type ResolveOk, type ResolveRequest, type StageOk,
} from '../contract.ts'

/** Where a referenced path came from. */
export type Acquisition = 'in-place' | 'copied'

/** One acquired file: its path and how that path was obtained. */
export interface Acquired {
  path: string
  how: Acquisition
}

/**
 * Ask the Host whether a hinted path is this file.
 * @param path - absolute path decoded from the drag's file URL.
 * @param file - the dropped file, for its size and mtime.
 * @param signal - cancellation for plugin teardown.
 * @returns the confirmed path, or undefined when it did not match.
 */
async function resolveInPlace(path: string, file: File, signal: AbortSignal): Promise<string | undefined> {
  const claim: ResolveRequest = { path, size: file.size, lastModified: file.lastModified }
  try {
    const response = await fetch(RESOLVE_ROUTE, {
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
 * @returns the absolute staged path.
 * @throws when the Host refuses or the request fails.
 */
async function stage(file: File, signal: AbortSignal): Promise<string> {
  const response = await fetch(STAGE_ROUTE, {
    method: 'POST',
    headers: { [NAME_HEADER]: encodeURIComponent(file.name) },
    body: file,
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
 * @param hints - absolute paths decoded from the transfer's `text/uri-list`.
 * @param signal - cancellation for plugin teardown.
 * @returns the path and how it was obtained.
 * @throws when the file had no usable path and could not be copied either.
 */
export async function acquire(file: File, hints: readonly string[], signal: AbortSignal): Promise<Acquired> {
  const hint = hintFor(file, hints)
  if (hint !== undefined) {
    const confirmed = await resolveInPlace(hint, file, signal)
    if (confirmed !== undefined) return { path: confirmed, how: 'in-place' }
  }
  return { path: await stage(file, signal), how: 'copied' }
}
