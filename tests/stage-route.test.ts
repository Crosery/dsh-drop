/**
 * The staging endpoint against a real node:http server and a real temporary
 * directory. The interesting assertions are the refusals — a write endpoint
 * that answers "here is your path" for a traversal attempt is the failure this
 * suite exists to catch.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
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
