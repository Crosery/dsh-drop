/**
 * Retention for the staging directory.
 *
 * A drop makes a copy, and copies of half-gigabyte videos accumulate silently
 * under the user's harness home. Pruning runs once at activation rather than on
 * a timer: the directory only grows while the app is being used, and a
 * boot-time pass costs one `readdir` on a directory that is usually empty.
 * @module @crosery/dsh-drop/prune
 */

import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { isPrunableStageDir } from './contract.ts'

/**
 * Remove staging day-directories past retention.
 *
 * Only entries whose names match this plugin's own `YYYY-MM-DD` spelling are
 * considered, so a user who parks something else in the staging root keeps it.
 * A missing root is the normal state before the first drop and is not an error.
 * @param root - absolute staging root.
 * @param keepDays - retention in days; 0 or less disables pruning entirely.
 * @param now - current epoch milliseconds.
 * @returns the directories removed, for logging and tests.
 */
export async function pruneStage(root: string, keepDays: number, now: number): Promise<string[]> {
  if (keepDays <= 0) return []

  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const removed: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!isPrunableStageDir(entry.name, keepDays, now)) continue
    const path = join(root, entry.name)
    try {
      await rm(path, { recursive: true, force: true })
      removed.push(path)
    } catch {
      // A directory the user has open, or a permission problem. Retention is
      // hygiene, not correctness; the next activation tries again.
    }
  }
  return removed
}
