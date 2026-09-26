/**
 * Acquiring staged files, each one cancellable by its own card.
 *
 * Every staged entry — a file or a folder — shows up in the rail as `pending`
 * the moment it is dropped, and its card has a remove control from that
 * moment on. Removing it has to stop the work behind it: the upload is
 * aborted, the queue moves on to the next item instead of waiting for bytes
 * nobody wants, and a failure the removal caused is not reported for a card
 * that is already gone. Plugin teardown stops everything at once.
 *
 * DOM-free: the acquisition and the preview store are handed in, so the queue
 * is testable.
 * @module @crosery/dsh-drop/client/staging-jobs
 */

import { mentionFor, type StagedCandidate } from '../contract.ts'
import type { AcquirableFile, Acquired } from './acquire.ts'
import type { AttachedFiles } from './attached.ts'

/**
 * A signal that aborts when either input does.
 *
 * Written out rather than `AbortSignal.any`, which older Safari lacks.
 * @param a - one signal.
 * @param b - the other.
 * @returns the combined signal, and the release of its listeners.
 */
export function linked(a: AbortSignal, b: AbortSignal): { signal: AbortSignal, release: () => void } {
  const both = new AbortController()
  const release = (): void => {
    a.removeEventListener('abort', forward)
    b.removeEventListener('abort', forward)
  }
  const forward = (event: Event): void => {
    release()
    both.abort((event.target as AbortSignal).reason)
  }
  if (a.aborted || b.aborted) {
    both.abort(a.aborted ? a.reason : b.reason)
    return { signal: both.signal, release }
  }
  a.addEventListener('abort', forward)
  b.addEventListener('abort', forward)
  return { signal: both.signal, release }
}

/** The work behind each pending entry, by entry id, under the plugin's lifetime. */
export class EntryJobs {
  private readonly controllers = new Map<number, AbortController>()
  private readonly plugin: AbortSignal

  /**
   * @param plugin - aborted when the plugin goes; every job goes with it.
   */
  constructor(plugin: AbortSignal) {
    // Assigned by hand: Node's type stripping, which runs the test suite,
    // refuses TypeScript parameter properties.
    this.plugin = plugin
  }

  /** Whether the plugin is gone. */
  get closed(): boolean {
    return this.plugin.aborted
  }

  /**
   * Track an entry from the moment its card appears, so removing the card
   * while the entry still waits its turn cancels it too.
   * @param id - the entry's id.
   * @returns the entry's own cancellation signal.
   */
  open(id: number): AbortSignal {
    const controller = new AbortController()
    this.controllers.set(id, controller)
    return controller.signal
  }

  /**
   * The signal one entry's work runs under.
   * @param id - the entry's id, {@link open}ed earlier.
   * @returns a signal aborted by the entry's cancellation or the plugin's, and
   *   the release that forgets the entry once its work is done.
   */
  run(id: number): { signal: AbortSignal, release: () => void } {
    const controller = this.controllers.get(id) ?? cancelled()
    const { signal, release } = linked(this.plugin, controller.signal)
    return {
      signal,
      release: () => {
        release()
        if (this.controllers.get(id) === controller) this.controllers.delete(id)
      },
    }
  }

  /**
   * Stop an entry's work, if it has any; called when its card leaves.
   * @param id - the entry's id.
   */
  cancel(id: number): void {
    this.controllers.get(id)?.abort()
    this.controllers.delete(id)
  }

  /** Forget every entry; the plugin's own abort has already stopped their work. */
  clear(): void {
    this.controllers.clear()
  }
}

/** An already-aborted controller: work for an entry that was cancelled or never opened. */
function cancelled(): AbortController {
  const controller = new AbortController()
  controller.abort()
  return controller
}

/** What {@link stageFiles} needs from the plugin. */
export interface StageFilesDeps<F extends AcquirableFile> {
  /** The staged list the entries live in. Its release hook must {@link EntryJobs.cancel} the entry. */
  readonly attached: AttachedFiles
  readonly jobs: EntryJobs
  /** Pair an entry with its bytes before its card first renders. */
  preview(key: string, file: F): void
  /** Get a readable path for one file; aborts with the signal. */
  acquire(file: F, bridged: string | undefined, hints: readonly string[], signal: AbortSignal): Promise<Acquired>
  /** Report the files that could not be acquired. Never counts a removed one. */
  failed(sessionId: string, count: number): void
}

/**
 * Acquire staged candidates for one session, one at a time.
 *
 * Each file shows up in the rail at once as `pending`, so a large upload is
 * visible and a send cannot leave without it. Sequential rather than
 * concurrent: a multi-file transfer is usually a few large files, and letting
 * them race would have them compete for the same disk while making the
 * mention order nondeterministic.
 * @param deps - the plugin's side.
 * @param sessionId - the session the files were dropped on.
 * @param candidates - the files, in drop order.
 * @param hints - absolute paths decoded from the transfer.
 */
export async function stageFiles<F extends AcquirableFile>(
  deps: StageFilesDeps<F>,
  sessionId: string,
  candidates: readonly StagedCandidate<F>[],
  hints: readonly string[],
): Promise<void> {
  const { attached, jobs } = deps
  let failed = 0
  const queued = candidates.map((candidate) => {
    // A path already staged in this session is not staged again.
    if (candidate.path !== undefined && attached.list(sessionId)
      .some((entry) => entry.status === 'ready' && entry.path === candidate.path)) return undefined
    const entry = attached.add(sessionId, {
      kind: 'file', status: 'pending', name: candidate.file.name, size: candidate.file.size,
    })
    // Pair the entry with the bytes before it renders, so the first paint
    // already has a thumbnail to show.
    deps.preview(entry.key, candidate.file)
    return { candidate, entry, waiting: jobs.open(entry.id) }
  })
  for (const job of queued) {
    if (job === undefined) continue
    if (jobs.closed) return
    // Removed while waiting its turn: nothing to acquire for.
    if (job.waiting.aborted) continue
    const { signal, release } = jobs.run(job.entry.id)
    try {
      const one = await deps.acquire(job.candidate.file, job.candidate.path, hints, signal)
      if (mentionFor(one.path) === undefined) throw new Error('acquired path cannot be referenced')
      attached.update(sessionId, job.entry.id, { status: 'ready', path: one.path, how: one.how })
    } catch (error) {
      if (jobs.closed) return
      // Removed mid-upload: the card is gone, and so is the reason to report.
      if (signal.aborted) continue
      console.warn('[dsh-drop] could not acquire a file', error)
      attached.remove(sessionId, job.entry.id)
      failed += 1
    } finally {
      release()
    }
  }
  if (failed > 0) deps.failed(sessionId, failed)
}
