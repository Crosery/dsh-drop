/**
 * Retention for the staging directory.
 *
 * A drop makes a copy, and copies of half-gigabyte videos accumulate silently
 * under the user's harness home. Pruning runs once at activation rather than on
 * a timer: the directory only grows while the app is being used, and a
 * boot-time pass costs one `readdir` on a directory that is usually empty.
 *
 * The same pass can clear what a Host that stopped mid-upload left behind: a
 * folder batch's private `.batch-*` directory, or a single file's
 * `.incoming-*` partial. Neither is ever published or referenced, so day
 * retention would keep them for `keepDays` — and forever with retention off.
 * @module @crosery/dsh-drop/prune
 */

import { lstat, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { isPrunableStageDir, isStageDayDir } from './contract.ts'

/** Options of {@link pruneStage}. */
export interface PruneOptions {
  /**
   * Also remove upload leftovers — `.batch-*` directories and `.incoming-*`
   * files inside the day directories — that nothing has written to for this
   * many milliseconds. Absent: leave them.
   */
  leftoverIdleMs?: number | undefined
}

/**
 * Remove staging day-directories past retention and, when asked, the
 * leftovers of uploads that never finished.
 *
 * Only entries whose names match this plugin's own `YYYY-MM-DD` spelling are
 * considered, so a user who parks something else in the staging root keeps it.
 * A missing root is the normal state before the first drop and is not an error.
 * @param root - absolute staging root.
 * @param keepDays - retention in days; 0 or less keeps every day directory.
 * @param now - current epoch milliseconds.
 * @param options - whether to sweep upload leftovers too.
 * @returns the paths removed, for logging and tests.
 */
export async function pruneStage(
  root: string,
  keepDays: number,
  now: number,
  options: PruneOptions = {},
): Promise<string[]> {
  const leftoverIdleMs = options.leftoverIdleMs
  if (keepDays <= 0 && leftoverIdleMs === undefined) return []

  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const removed: string[] = []
  for (const entry of entries) {
    // The entry itself, never a link's target: a link is not a directory here.
    if (!entry.isDirectory()) continue
    const path = join(root, entry.name)
    if (isPrunableStageDir(entry.name, keepDays, now)) {
      if (await remove(path)) removed.push(path)
    } else if (leftoverIdleMs !== undefined && isStageDayDir(entry.name)) {
      removed.push(...await sweepLeftovers(path, now, leftoverIdleMs))
    }
  }
  return removed
}

/**
 * Remove one day directory's upload leftovers idle past the limit.
 *
 * Idle is measured from the latest write anywhere the upload writes, so a
 * batch still being filled — by this Host or by another one sharing the home
 * — is left alone: its directory, its `parts/` (touched as each file starts
 * and is published) and every part still streaming.
 * @param dir - one `YYYY-MM-DD` directory under the staging root.
 * @param now - current epoch milliseconds.
 * @param idleMs - how long a leftover must have gone unwritten.
 * @returns the paths removed.
 */
async function sweepLeftovers(dir: string, now: number, idleMs: number): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const removed: string[] = []
  for (const entry of entries) {
    const batch = entry.name.startsWith('.batch-') && entry.isDirectory()
    const partial = entry.name.startsWith('.incoming-') && entry.isFile()
    if (!batch && !partial) continue
    const path = join(dir, entry.name)
    const written = batch ? await lastBatchWrite(path) : await mtimeOf(path)
    if (written === undefined || now - written <= idleMs) continue
    if (await remove(path)) removed.push(path)
  }
  return removed
}

/**
 * The latest write under one batch directory, as far as an upload makes them.
 * @param home - the batch's private directory.
 * @returns epoch milliseconds, or undefined when nothing could be read.
 */
async function lastBatchWrite(home: string): Promise<number | undefined> {
  const parts = join(home, 'parts')
  const stamps = [await mtimeOf(home), await mtimeOf(parts), await mtimeOf(join(home, 'tree'))]
  try {
    for (const name of await readdir(parts)) stamps.push(await mtimeOf(join(parts, name)))
  } catch {
    // No `parts/`: the batch died before its first file.
  }
  const known = stamps.filter((stamp) => stamp !== undefined)
  return known.length === 0 ? undefined : Math.max(...known)
}

/**
 * One entry's own modification time, not a link target's.
 * @param path - absolute path.
 * @returns epoch milliseconds, or undefined when it cannot be read.
 */
async function mtimeOf(path: string): Promise<number | undefined> {
  try {
    return (await lstat(path)).mtimeMs
  } catch {
    return undefined
  }
}

/**
 * Remove one path, recursively.
 * @param path - absolute path under the staging root.
 * @returns whether it went.
 */
async function remove(path: string): Promise<boolean> {
  try {
    await rm(path, { recursive: true, force: true })
    return true
  } catch {
    // A directory the user has open, or a permission problem. Retention is
    // hygiene, not correctness; the next activation tries again.
    return false
  }
}
