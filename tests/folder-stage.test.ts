/**
 * The folder batch against a real node:http server and real temporary
 * directories.
 *
 * What matters is where bytes can land: inside the batch's own tree and
 * nowhere else, never over an existing path, and never as a half folder —
 * a refusal removes everything the batch wrote.
 */

import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import {
  BATCH_HEADER, DEFAULT_FOLDER_IGNORE, NAME_HEADER, RELPATH_HEADER,
  type BatchBeginOk, type BatchCommitOk, type FolderLimits, type StageErr, type StageOk,
} from '../src/contract.ts'
import { stageHandler } from '../src/stage-route.ts'
import { batchStore, publishDirectory, type BatchStore } from '../src/folder-stage.ts'

const DAY = '2026-08-31'

describe('folder batch', () => {
  let root: string
  let server: Server
  let origin: string
  let store: BatchStore
  let clock = Date.UTC(2026, 7, 31)
  let limits: FolderLimits

  const defaults = (): FolderLimits => ({
    maxFiles: 10, maxBytes: 1000, maxFileBytes: 500, maxDepth: 4, ignore: DEFAULT_FOLDER_IGNORE,
  })

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-drop-batch-'))
    store = batchStore({
      root: () => root,
      limits: () => limits,
      now: () => clock,
      idleMs: 60_000,
      maxOpen: 3,
      win32: false,
    })
    const stage = stageHandler({ root: () => root, maxBytes: () => 500, now: () => clock, batches: store })
    server = createServer((req, res) => {
      void (req.url === '/batch' ? store.handler(req, res) : stage(req, res))
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  beforeEach(async () => {
    limits = defaults()
    clock = Date.UTC(2026, 7, 31)
    await store.dispose()
    // A fresh store per test would need a fresh server; disposing clears the
    // batches, and the flag is reset by rebuilding below.
    store = batchStore({
      root: () => root, limits: () => limits, now: () => clock, idleMs: 60_000, maxOpen: 3, win32: false,
    })
    const stage = stageHandler({ root: () => root, maxBytes: () => 500, now: () => clock, batches: store })
    server.removeAllListeners('request')
    server.on('request', (req, res) => { void (req.url === '/batch' ? store.handler(req, res) : stage(req, res)) })
    await rm(join(root, DAY), { recursive: true, force: true })
  })

  after(async () => {
    await store.dispose()
    await new Promise<void>((done) => server.close(() => done()))
    await rm(root, { recursive: true, force: true })
  })

  const control = (body: unknown, headers: Record<string, string> = {}) => fetch(`${origin}/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

  const begin = async (name: string): Promise<BatchBeginOk> => {
    const response = await control({ op: 'begin', name })
    assert.equal(response.status, 200)
    return await response.json() as BatchBeginOk
  }

  const put = (id: string, path: string, body: string) => fetch(`${origin}/stage`, {
    method: 'POST',
    headers: { [BATCH_HEADER]: id, [RELPATH_HEADER]: encodeURIComponent(path) },
    body,
  })

  const commit = async (id: string) => control({ op: 'commit', id })

  /** Everything under a directory, as sorted relative paths. */
  const tree = async (dir: string): Promise<string[]> =>
    (await readdir(dir, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
      .sort()

  /** Names in the day directory. */
  const day = async (): Promise<string[]> => (await readdir(join(root, DAY)).catch(() => [])).sort()

  it('announces its limits without opening anything', async () => {
    const response = await control({ op: 'limits' })
    assert.equal(response.status, 200)
    assert.deepEqual(((await response.json()) as { limits: FolderLimits }).limits, limits)
    assert.deepEqual(await day(), [])
  })

  it('keeps the folder structure and publishes it whole on commit', async () => {
    const { id, limits: announced } = await begin('proj')
    assert.deepEqual(announced, limits)
    assert.equal((await put(id, 'README.md', 'hello')).status, 200)
    assert.equal((await put(id, 'src/index.ts', 'export {}')).status, 200)
    assert.equal((await put(id, 'src/lib/deep.ts', 'x')).status, 200)
    // Nothing is visible under its final name before commit.
    assert.deepEqual((await day()).filter((name) => !name.startsWith('.batch-')), [])

    const response = await commit(id)
    assert.equal(response.status, 200)
    const body = await response.json() as BatchCommitOk
    assert.equal(body.path, join(root, DAY, 'proj'))
    assert.deepEqual(await tree(body.path), ['README.md', 'src/index.ts', 'src/lib/deep.ts'].map((path) => join(...path.split('/'))))
    assert.equal(await readFile(join(body.path, 'src', 'index.ts'), 'utf8'), 'export {}')
    assert.equal(body.summary.files, 3)
    assert.equal(body.summary.bytes, 5 + 9 + 1)
    assert.deepEqual(await day(), ['proj'], 'the private batch directory is gone')
  })

  it('confines a traversal path or refuses it, never writing outside the tree', async () => {
    const { id } = await begin('proj')
    const escape = await put(id, '../../escaped.txt', 'nope')
    assert.equal(escape.status, 400)
    assert.equal(((await escape.json()) as StageErr).error, 'unsafe-path')
    const rooted = await put(id, '/etc/passwd', 'confined')
    assert.equal(rooted.status, 200, 'a leading root is relativized, not followed')
    const body = await (await commit(id)).json() as BatchCommitOk
    assert.deepEqual(await tree(body.path), [join('etc', 'passwd')])
    assert.deepEqual(await readdir(root), [DAY], 'nothing landed beside the day directory')
  })

  it('suffixes names that sanitize alike instead of overwriting', async () => {
    const { id } = await begin('proj')
    assert.equal((await put(id, 'a\u0007b.txt', 'first')).status, 200)
    const second = await put(id, 'ab.txt', 'second')
    assert.equal(second.status, 200)
    assert.equal(((await second.json()) as { path: string }).path, 'ab-2.txt')
    const body = await (await commit(id)).json() as BatchCommitOk
    assert.equal(await readFile(join(body.path, 'ab.txt'), 'utf8'), 'first')
    assert.equal(await readFile(join(body.path, 'ab-2.txt'), 'utf8'), 'second')
  })

  it('refuses the whole folder over the byte ceiling and removes it', async () => {
    const { id } = await begin('proj')
    assert.equal((await put(id, 'a.bin', 'x'.repeat(400))).status, 200)
    assert.equal((await put(id, 'b.bin', 'x'.repeat(400))).status, 200)
    const over = await put(id, 'c.bin', 'x'.repeat(400))
    assert.equal(over.status, 413)
    assert.deepEqual(await over.json(), { error: 'too-large', limit: 'bytes' })
    assert.deepEqual(await day(), [], 'the batch and its files are gone')
    assert.equal((await commit(id)).status, 404, 'and cannot be committed')
  })

  it('refuses a file over the per-file ceiling', async () => {
    const { id } = await begin('proj')
    const over = await put(id, 'big.bin', 'x'.repeat(501))
    assert.equal(over.status, 413)
    assert.deepEqual(await over.json(), { error: 'too-large', limit: 'file-bytes' })
    assert.deepEqual(await day(), [])
  })

  it('refuses the folder over the file-count ceiling', async () => {
    limits = { ...defaults(), maxFiles: 2 }
    const { id } = await begin('proj')
    assert.equal((await put(id, 'a', '1')).status, 200)
    assert.equal((await put(id, 'b', '2')).status, 200)
    const over = await put(id, 'c', '3')
    assert.equal(over.status, 413)
    assert.deepEqual(await over.json(), { error: 'too-many', limit: 'files' })
    assert.deepEqual(await day(), [])
  })

  it('refuses the folder over the depth ceiling', async () => {
    const { id } = await begin('proj')
    const over = await put(id, 'a/b/c/d/e.txt', 'deep')
    assert.equal(over.status, 413)
    assert.deepEqual(await over.json(), { error: 'too-deep', limit: 'depth' })
    assert.deepEqual(await day(), [])
  })

  it('answers 404 for an unknown or expired batch', async () => {
    const unknown = await put('not-a-batch', 'a.txt', 'x')
    assert.equal(unknown.status, 404)
    assert.equal(((await unknown.json()) as StageErr).error, 'unknown-batch')

    const { id } = await begin('proj')
    assert.equal((await put(id, 'a.txt', 'x')).status, 200)
    clock += 60_001
    const expired = await put(id, 'b.txt', 'y')
    assert.equal(expired.status, 404)
    assert.deepEqual(await day(), [], 'the idle sweep removed what it had')
  })

  it('removes everything on abort', async () => {
    const { id } = await begin('proj')
    assert.equal((await put(id, 'a.txt', 'x')).status, 200)
    const response = await control({ op: 'abort', id })
    assert.equal(response.status, 200)
    assert.deepEqual(await day(), [])
    assert.equal((await control({ op: 'abort', id })).status, 404)
  })

  it('leaves nothing behind when an abort races an upload still streaming', async () => {
    const { id } = await begin('proj')
    let push: ((chunk: Uint8Array | null) => void) | undefined
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (chunk) => { if (chunk === null) controller.close(); else controller.enqueue(chunk) }
      },
    })
    const upload = fetch(`${origin}/stage`, {
      method: 'POST',
      headers: { [BATCH_HEADER]: id, [RELPATH_HEADER]: encodeURIComponent('nested/slow.bin') },
      body,
      duplex: 'half',
    } as RequestInit)
    push!(new TextEncoder().encode('first half'))
    // Wait until the Host is writing the part, not for a fixed time.
    const parts = join(root, DAY, `.batch-${id}`, 'parts')
    for (const deadline = Date.now() + 5000; Date.now() < deadline;) {
      if ((await readdir(parts).catch(() => [])).length > 0) break
      await new Promise((done) => setTimeout(done, 10))
    }
    // Busy while the file streams: a commit now would publish a half folder.
    assert.equal((await commit(id)).status, 409)
    assert.equal((await control({ op: 'abort', id })).status, 200)
    push!(new TextEncoder().encode('second half'))
    push!(null)
    const response = await upload
    assert.equal(response.status, 404)
    assert.deepEqual(await day(), [], 'the directories the upload created were removed too')
  })

  it('refuses to commit a batch with no files', async () => {
    const { id } = await begin('empty')
    const response = await commit(id)
    assert.equal(response.status, 400)
    assert.equal(((await response.json()) as StageErr).error, 'empty')
    assert.deepEqual(await day(), [])
  })

  it('publishes next to an existing folder of the same name under a suffix', async () => {
    await mkdir(join(root, DAY, 'proj'), { recursive: true })
    await writeFile(join(root, DAY, 'proj', 'keep.txt'), 'theirs')
    const { id } = await begin('proj')
    assert.equal((await put(id, 'mine.txt', 'mine')).status, 200)
    const body = await (await commit(id)).json() as BatchCommitOk
    assert.equal(body.path, join(root, DAY, 'proj-2'))
    assert.equal(await readFile(join(root, DAY, 'proj', 'keep.txt'), 'utf8'), 'theirs')
    assert.deepEqual(await tree(join(root, DAY, 'proj')), ['keep.txt'])
  })

  it('gives two concurrent commits of one name distinct folders', async () => {
    const one = await begin('twin')
    const two = await begin('twin')
    assert.equal((await put(one.id, 'a.txt', '1')).status, 200)
    assert.equal((await put(two.id, 'a.txt', '2')).status, 200)
    const [first, second] = await Promise.all([commit(one.id), commit(two.id)])
    const paths = [(await first.json() as BatchCommitOk).path, (await second.json() as BatchCommitOk).path].sort()
    assert.deepEqual(paths, [join(root, DAY, 'twin'), join(root, DAY, 'twin-2')])
  })

  it('refuses a cross-site caller before writing anything', async () => {
    const response = await control({ op: 'begin', name: 'proj' }, { 'sec-fetch-site': 'cross-site' })
    assert.equal(response.status, 403)
    const plain = await fetch(`${origin}/batch`, {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ op: 'begin', name: 'x' }),
    })
    assert.equal(plain.status, 403, 'a no-cors form post cannot declare JSON')
    const { id } = await begin('proj')
    const upload = await fetch(`${origin}/stage`, {
      method: 'POST',
      headers: { [BATCH_HEADER]: id, [RELPATH_HEADER]: 'a.txt', 'sec-fetch-site': 'cross-site' },
      body: 'x',
    })
    assert.equal(upload.status, 403)
    assert.deepEqual((await readdir(join(root, DAY))).filter((name) => !name.startsWith('.batch-')), [])
  })

  it('caps how many batches are open at once', async () => {
    await begin('a')
    await begin('b')
    await begin('c')
    const fourth = await control({ op: 'begin', name: 'd' })
    assert.equal(fourth.status, 429)
    assert.equal(store.open(), 3)
  })

  it('removes every open batch on dispose', async () => {
    const { id } = await begin('proj')
    assert.equal((await put(id, 'a.txt', 'x')).status, 200)
    await store.dispose()
    assert.equal(store.open(), 0)
    assert.deepEqual(await day(), [])
    assert.equal((await put(id, 'b.txt', 'y')).status, 404)
  })

  it('rejects malformed control bodies', async () => {
    assert.equal((await control({ op: 'explode' })).status, 400)
    assert.equal((await control({ op: 'commit' })).status, 400)
    const get = await fetch(`${origin}/batch`)
    assert.equal(get.status, 405)
  })
})

describe('Windows name rules on a Windows Host', () => {
  it('publishes a folder and a file under names Windows can create, decided before the bytes arrive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-drop-win32-'))
    const limits: FolderLimits = {
      maxFiles: 10, maxBytes: 1000, maxFileBytes: 500, maxDepth: 4, ignore: DEFAULT_FOLDER_IGNORE,
    }
    const now = (): number => Date.UTC(2026, 7, 31)
    const store = batchStore({ root: () => root, limits: () => limits, now, win32: true })
    const stage = stageHandler({ root: () => root, maxBytes: () => 500, now, batches: store, win32: true })
    const local = createServer((req, res) => { void (req.url === '/batch' ? store.handler(req, res) : stage(req, res)) })
    await new Promise<void>((done) => local.listen(0, '127.0.0.1', done))
    const origin = `http://127.0.0.1:${(local.address() as AddressInfo).port}`
    try {
      const control = (body: unknown) => fetch(`${origin}/batch`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const { id } = await (await control({ op: 'begin', name: 'Q3: plan' })).json() as BatchBeginOk
      const put = await fetch(`${origin}/stage`, {
        method: 'POST', headers: { [BATCH_HEADER]: id, [RELPATH_HEADER]: encodeURIComponent('notes.md') }, body: 'x',
      })
      assert.equal(put.status, 200)
      const committed = await control({ op: 'commit', id })
      assert.equal(committed.status, 200)
      assert.equal(((await committed.json()) as BatchCommitOk).path, join(root, DAY, 'Q3_ plan'))

      const single = await fetch(`${origin}/stage`, {
        method: 'POST', headers: { [NAME_HEADER]: encodeURIComponent('aux: log.txt') }, body: 'y',
      })
      assert.equal(single.status, 200)
      assert.equal(((await single.json()) as StageOk).path, join(root, DAY, 'aux_ log.txt'))
    } finally {
      await store.dispose()
      await new Promise<void>((done) => local.close(() => done()))
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('publishDirectory', () => {
  it('claims the plain name, then suffixes, never replacing a folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-drop-publish-'))
    try {
      const make = async (label: string) => {
        const tree = join(dir, `.tree-${label}`)
        await mkdir(tree)
        await writeFile(join(tree, 'f.txt'), label)
        return tree
      }
      assert.equal(await publishDirectory(await make('1'), dir, 'out'), join(dir, 'out'))
      assert.equal(await publishDirectory(await make('2'), dir, 'out'), join(dir, 'out-2'))
      assert.equal(await readFile(join(dir, 'out', 'f.txt'), 'utf8'), '1')
      assert.equal(await readFile(join(dir, 'out-2', 'f.txt'), 'utf8'), '2')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
