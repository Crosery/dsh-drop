/**
 * The staged-file queue and the cancellation behind each card.
 *
 * Removing a pending card has to stop its upload: otherwise the bytes keep
 * flowing, the next file waits behind them, a copy lands nobody references,
 * and a failure is reported for a card the user already removed.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AttachedFiles } from '../src/client/attached.ts'
import { EntryJobs, linked, stageFiles, type StageFilesDeps } from '../src/client/staging-jobs.ts'
import type { Acquired } from '../src/client/acquire.ts'
import type { StagedCandidate } from '../src/contract.ts'

interface FakeFile {
  readonly name: string
  readonly size: number
  readonly lastModified: number
}

const file = (name: string): StagedCandidate<FakeFile> => ({ file: { name, size: 3, lastModified: 0 }, path: undefined })

/** One acquisition the test settles by hand, as a slow upload would. */
interface Upload {
  readonly name: string
  readonly signal: AbortSignal
  resolve(path: string): void
  reject(error: Error): void
}

/** The queue around one plugin lifetime, with uploads the test drives. */
function harness() {
  const plugin = new AbortController()
  const jobs = new EntryJobs(plugin.signal)
  const attached = new AttachedFiles((entry) => { jobs.cancel(entry.id) })
  const uploads: Upload[] = []
  const reported: number[] = []
  const deps: StageFilesDeps<FakeFile> = {
    attached,
    jobs,
    preview: () => {},
    acquire: (dropped, _bridged, _hints, signal) => new Promise<Acquired>((resolve, reject) => {
      signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      uploads.push({
        name: dropped.name,
        signal,
        resolve: (path) => { resolve({ path, how: 'copied' }) },
        reject,
      })
    }),
    failed: (_session, count) => { reported.push(count) },
  }
  return { plugin, jobs, attached, uploads, reported, deps }
}

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

const idOf = (attached: AttachedFiles, name: string): number => {
  const entry = attached.list('s').find((one) => one.name === name)
  assert.ok(entry, `${name} is staged`)
  return entry.id
}

describe('stageFiles', () => {
  it('aborts a removed file\'s upload, moves on, and reports nothing for it', async () => {
    const { attached, uploads, reported, deps } = harness()
    const run = stageFiles(deps, 's', [file('big.mov'), file('notes.md')], [])
    await settle()
    assert.deepEqual(uploads.map((one) => one.name), ['big.mov'], 'one at a time')

    attached.remove('s', idOf(attached, 'big.mov'))
    assert.equal(uploads[0]!.signal.aborted, true, 'the upload is aborted with the card')
    await settle()
    assert.deepEqual(uploads.map((one) => one.name), ['big.mov', 'notes.md'], 'the queue did not wait')

    uploads[1]!.resolve('/tmp/drops/notes.md')
    await run
    assert.deepEqual(attached.list('s').map((one) => [one.name, one.status]), [['notes.md', 'ready']])
    assert.deepEqual(reported, [], 'a removed card has nothing to report')
  })

  it('never starts a file removed while it waits its turn', async () => {
    const { attached, uploads, reported, deps } = harness()
    const run = stageFiles(deps, 's', [file('a.md'), file('b.md'), file('c.md')], [])
    await settle()
    attached.remove('s', idOf(attached, 'b.md'))
    uploads[0]!.resolve('/tmp/drops/a.md')
    await settle()
    assert.deepEqual(uploads.map((one) => one.name), ['a.md', 'c.md'])
    uploads[1]!.resolve('/tmp/drops/c.md')
    await run
    assert.deepEqual(reported, [])
  })

  it('reports a file that failed on its own, and drops its card', async () => {
    const { attached, uploads, reported, deps } = harness()
    const run = stageFiles(deps, 's', [file('a.md'), file('b.md')], [])
    await settle()
    uploads[0]!.reject(new Error('stage failed: 500'))
    await settle()
    uploads[1]!.resolve('/tmp/drops/b.md')
    await run
    assert.deepEqual(attached.list('s').map((one) => one.name), ['b.md'])
    assert.deepEqual(reported, [1])
  })

  it('stops with the plugin, reporting nothing', async () => {
    const { plugin, uploads, reported, deps } = harness()
    const run = stageFiles(deps, 's', [file('a.md'), file('b.md')], [])
    await settle()
    plugin.abort()
    await run
    assert.equal(uploads[0]!.signal.aborted, true)
    assert.equal(uploads.length, 1, 'nothing further starts')
    assert.deepEqual(reported, [])
  })
})

describe('EntryJobs', () => {
  it('forgets an entry once its work is released, so a later cancel is a no-op', () => {
    const jobs = new EntryJobs(new AbortController().signal)
    const waiting = jobs.open(1)
    const { signal, release } = jobs.run(1)
    release()
    jobs.cancel(1)
    assert.equal(waiting.aborted, false)
    assert.equal(signal.aborted, false)
  })

  it('runs an entry that was cancelled or never opened under an aborted signal', () => {
    const jobs = new EntryJobs(new AbortController().signal)
    jobs.open(1)
    jobs.cancel(1)
    assert.equal(jobs.run(1).signal.aborted, true)
    assert.equal(jobs.run(2).signal.aborted, true)
  })
})

describe('linked', () => {
  it('aborts with whichever input aborts first, and starts aborted when one already is', () => {
    const a = new AbortController()
    const b = new AbortController()
    const both = linked(a.signal, b.signal)
    b.abort('removed')
    assert.equal(both.signal.aborted, true)
    assert.equal(both.signal.reason, 'removed')
    assert.equal(linked(a.signal, AbortSignal.abort('gone')).signal.aborted, true)
  })
})
