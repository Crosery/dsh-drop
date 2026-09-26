/**
 * The staging endpoint against a real node:http server and a real temporary
 * directory. The interesting assertions are the refusals — a write endpoint
 * that answers "here is your path" for a traversal attempt is the failure this
 * suite exists to catch.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import type { AddressInfo } from 'node:net'
import { NAME_HEADER, type StageErr, type StageOk } from '../src/contract.ts'
import { insideRoot, stageHandler } from '../src/stage-route.ts'
import { pruneStage } from '../src/prune.ts'

describe('insideRoot', () => {
  it('accepts the root and its descendants', () => {
    assert.equal(insideRoot('/a/b', '/a/b'), true)
    assert.equal(insideRoot('/a/b', '/a/b/c/d.md'), true)
  })

  it('rejects a sibling whose path merely shares the prefix', () => {
    assert.equal(insideRoot('/a/b', '/a/bc'), false)
  })

  it('rejects an escape through ..', () => {
    assert.equal(insideRoot('/a/b', '/a/b/../../etc/passwd'), false)
  })
})

describe('stage route', () => {
  let root: string
  let server: Server
  let origin: string
  let limit = 1024

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-drop-'))
    const handler = stageHandler({
      root: () => root,
      maxBytes: () => limit,
      now: () => Date.UTC(2026, 7, 31),
    })
    server = createServer((req, res) => { void handler(req, res) })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const post = async (name: string, body: string | Uint8Array) =>
    fetch(`${origin}/stage`, {
      method: 'POST',
      headers: { [NAME_HEADER]: encodeURIComponent(name) },
      body: typeof body === 'string' ? body : new Uint8Array(body),
    })

  it('writes the bytes and answers with the path it wrote', async () => {
    const response = await post('notes.md', '# hello\n')
    assert.equal(response.status, 200)
    const body = await response.json() as StageOk
    assert.equal(body.path, join(root, '2026-08-31', 'notes.md'))
    assert.equal(await readFile(body.path, 'utf8'), '# hello\n')
  })

  it('suffixes a second drop of the same name instead of overwriting', async () => {
    const response = await post('notes.md', 'second')
    const body = await response.json() as StageOk
    assert.equal(body.path, join(root, '2026-08-31', 'notes-2.md'))
    // The first drop is still readable at the path its mention referenced.
    assert.equal(await readFile(join(root, '2026-08-31', 'notes.md'), 'utf8'), '# hello\n')
  })

  it('confines a traversal attempt to the staging directory', async () => {
    const response = await post('../../escaped.md', 'nope')
    assert.equal(response.status, 200)
    const body = await response.json() as StageOk
    assert.equal(dirname(body.path), join(root, '2026-08-31'))
    assert.equal(body.path.includes('..'), false)
  })

  it('publishes concurrent same-name uploads without overwriting', async () => {
    const contents = Array.from({ length: 12 }, (_, i) => 'parallel-' + i)
    const paths = await Promise.all(contents.map(async (text) => {
      const response = await post('parallel.md', text)
      assert.equal(response.status, 200)
      return ((await response.json()) as StageOk).path
    }))
    assert.equal(new Set(paths).size, contents.length)
    assert.deepEqual(await Promise.all(paths.map((path) => readFile(path, 'utf8'))), contents)
  })

  it('rejects a simple cross-site POST without writing', async () => {
    const before = await readdir(join(root, '2026-08-31'))
    assert.equal((await fetch(origin + '/stage', { method: 'POST', body: 'x' })).status, 403)
    assert.equal((await fetch(origin + '/stage', {
      method: 'POST', headers: { [NAME_HEADER]: 'attack.txt', 'sec-fetch-site': 'cross-site' }, body: 'x',
    })).status, 403)
    assert.deepEqual(await readdir(join(root, '2026-08-31')), before)
  })

  it('refuses a body over the ceiling and leaves nothing behind', async () => {
    const response = await post('big.bin', new Uint8Array(limit + 1))
    assert.equal(response.status, 413)
    assert.equal(((await response.json()) as StageErr).error, 'too-large')
    const entries = await readdir(join(root, '2026-08-31'))
    // No partial file, and no abandoned .incoming- temporary.
    assert.equal(entries.some((name) => name.startsWith('.incoming-')), false)
    assert.equal(entries.includes('big.bin'), false)
  })

  it('refuses a method other than POST', async () => {
    const response = await fetch(`${origin}/stage`)
    assert.equal(response.status, 405)
    assert.equal(((await response.json()) as StageErr).error, 'method')
  })

  it('falls back to a usable name when the browser sends none', async () => {
    const response = await post('', 'x')
    const body = await response.json() as StageOk
    assert.equal(body.path, join(root, '2026-08-31', 'dropped-file'))
  })
})

describe('pruneStage', () => {
  it('removes only its own expired day directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-drop-prune-'))
    await mkdir(join(root, '2026-07-01'), { recursive: true })
    await mkdir(join(root, '2026-08-30'), { recursive: true })
    await mkdir(join(root, 'my-stuff'), { recursive: true })
    await writeFile(join(root, 'loose.txt'), 'x')

    const removed = await pruneStage(root, 30, Date.UTC(2026, 7, 31))

    assert.deepEqual(removed, [join(root, '2026-07-01')])
    const left = (await readdir(root)).sort()
    assert.deepEqual(left, ['2026-08-30', 'loose.txt', 'my-stuff'])
  })

  it('is a no-op before the first drop creates the root', async () => {
    assert.deepEqual(await pruneStage(join(tmpdir(), 'dsh-drop-absent-root'), 30, Date.now()), [])
  })
})

describe('pruneStage, upload leftovers', () => {
  const IDLE = 30 * 60_000
  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)

  /** Backdate a path's own timestamps. */
  const age = async (path: string, ms: number): Promise<void> => {
    const at = new Date(now - ms)
    await utimes(path, at, at)
  }

  /** A batch directory as `begin` lays it out, with one published file and one part. */
  const batch = async (dir: string, name: string, idleFor: number, streamingFor?: number): Promise<string> => {
    const home = join(dir, name)
    await mkdir(join(home, 'tree', 'src'), { recursive: true })
    await mkdir(join(home, 'parts'), { recursive: true })
    await writeFile(join(home, 'tree', 'src', 'a.ts'), 'a')
    await writeFile(join(home, 'parts', 'part-1'), 'partial')
    await age(join(home, 'parts', 'part-1'), streamingFor ?? idleFor)
    for (const path of [join(home, 'tree', 'src', 'a.ts'), join(home, 'tree', 'src'), join(home, 'tree'), join(home, 'parts'), home]) {
      await age(path, idleFor)
    }
    return home
  }

  it('removes leftovers idle past the batch timeout, inside day directories only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-drop-leftovers-'))
    const day = join(root, today)
    await mkdir(day)
    const staleBatch = await batch(day, '.batch-stale', 2 * IDLE)
    await batch(day, '.batch-fresh', 60_000)
    await writeFile(join(day, '.incoming-stale'), 'x')
    await age(join(day, '.incoming-stale'), 2 * IDLE)
    await writeFile(join(day, '.incoming-fresh'), 'x')
    await writeFile(join(day, 'notes.md'), 'a published drop')
    await age(join(day, 'notes.md'), 2 * IDLE)
    // Leftover names in the wrong place, or of the wrong kind, are not ours.
    await batch(root, '.batch-at-root', 2 * IDLE)
    await mkdir(join(root, 'my-stuff'))
    await batch(join(root, 'my-stuff'), '.batch-parked', 2 * IDLE)
    await mkdir(join(day, '.incoming-dir'))
    await age(join(day, '.incoming-dir'), 2 * IDLE)
    // A link is never followed out of the staging root.
    const outside = await mkdtemp(join(tmpdir(), 'dsh-drop-outside-'))
    await writeFile(join(outside, 'keep.txt'), 'keep')
    await symlink(outside, join(day, '.batch-link'))

    const removed = await pruneStage(root, 30, now, { leftoverIdleMs: IDLE })

    assert.deepEqual(removed.sort(), [staleBatch, join(day, '.incoming-stale')].sort())
    assert.deepEqual((await readdir(day)).sort(), ['.batch-fresh', '.batch-link', '.incoming-dir', '.incoming-fresh', 'notes.md'])
    assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'keep')
    assert.deepEqual((await readdir(root)).sort(), ['.batch-at-root', today, 'my-stuff'])
    assert.deepEqual(await readdir(join(root, 'my-stuff')), ['.batch-parked'])
  })

  it('keeps a batch whose part is still being written, however old its directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-drop-leftovers-live-'))
    const day = join(root, today)
    await mkdir(day)
    await batch(day, '.batch-live', 2 * IDLE, 5_000)
    assert.deepEqual(await pruneStage(root, 30, now, { leftoverIdleMs: IDLE }), [])
    assert.deepEqual(await readdir(day), ['.batch-live'])
  })

  it('sweeps leftovers with retention off, and leaves them without the option', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-drop-leftovers-off-'))
    const day = join(root, today)
    await mkdir(day)
    await writeFile(join(day, '.incoming-stale'), 'x')
    await age(join(day, '.incoming-stale'), 2 * IDLE)
    assert.deepEqual(await pruneStage(root, 30, now), [], 'a retention-only pass')
    assert.deepEqual(await pruneStage(root, 0, now), [])
    assert.deepEqual(await pruneStage(root, 0, now, { leftoverIdleMs: IDLE }), [join(day, '.incoming-stale')])
  })
})
