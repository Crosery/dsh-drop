/**
 * The browser's side of a folder drop, end to end against the real Host
 * routes over node:http: fake directory entries holding real `File`s are
 * walked, checked against a drag hint, and copied into a batch that the Host
 * publishes as one folder.
 */

import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { DEFAULT_FOLDER_IGNORE, type FolderLimits } from '../src/contract.ts'
import { stageHandler } from '../src/stage-route.ts'
import { resolveHandler } from '../src/resolve-route.ts'
import { batchStore, type BatchStore } from '../src/folder-stage.ts'
import { acquireFolder, countFolder, type FolderProgress } from '../src/client/folder-acquire.ts'
import type { Fetcher } from '../src/client/acquire.ts'
import type { EntryLike } from '../src/folder.ts'

const MTIME = Date.UTC(2026, 7, 1)

/** A file entry over a real `File`. */
function file(name: string, content: string): EntryLike<File> {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file(success) { success(new File([content], name, { lastModified: MTIME })) },
  }
}

/** A directory entry answering its children in one batch, then empty. */
function dir(name: string, children: EntryLike<File>[]): EntryLike<File> {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      let done = false
      return {
        readEntries(success) {
          const batch = done ? [] : children
          done = true
          queueMicrotask(() => { success(batch) })
        },
      }
    },
  }
}

describe('acquireFolder', () => {
  let root: string
  let server: Server
  let origin: string
  let store: BatchStore
  let limits: FolderLimits
  let requests: string[]

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-drop-folder-acquire-'))
    store = batchStore({ root: () => join(root, 'drops'), limits: () => limits, win32: false })
    const stage = stageHandler({ root: () => join(root, 'drops'), maxBytes: () => limits.maxFileBytes, batches: store })
    const resolve = resolveHandler({ folder: () => ({ ignore: limits.ignore, maxDepth: limits.maxDepth }) })
    server = createServer((req, res) => {
      requests.push(req.url ?? '')
      if (req.url === '/crosery/dsh-drop/batch') void store.handler(req, res)
      else if (req.url === '/crosery/dsh-drop/resolve') void resolve(req, res)
      else void stage(req, res)
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  beforeEach(() => {
    limits = { maxFiles: 100, maxBytes: 10_000, maxFileBytes: 5_000, maxDepth: 8, ignore: DEFAULT_FOLDER_IGNORE }
    requests = []
  })

  after(async () => {
    await store.dispose()
    await new Promise<void>((done) => server.close(() => done()))
    await rm(root, { recursive: true, force: true })
  })

  // Document-relative URLs, resolved against the test server the way the
  // page resolves them against its own origin.
  const http: Fetcher = (url, init) => fetch(`${origin}/${url}`, init)
  const signal = new AbortController().signal

  const project = (): EntryLike<File> => dir('proj', [
    file('README.md', '# proj'),
    dir('src', [file('index.ts', 'export {}'), file('logo.png', 'PNG')]),
    dir('.git', [file('HEAD', 'ref')]),
    dir('node_modules', [file('x.js', 'x')]),
  ])

  it('copies a folder with its structure and reports what it skipped', async () => {
    const progress: FolderProgress[] = []
    const outcome = await acquireFolder(project(), 'proj', [], signal, (one) => { progress.push(one) }, http)
    assert.equal(outcome.ok, true)
    if (!outcome.ok) return
    assert.equal(outcome.how, 'copied')
    assert.match(outcome.path, /[\\/]drops[\\/]\d{4}-\d{2}-\d{2}[\\/]proj$/)
    const files = (await readdir(outcome.path, { recursive: true })).sort()
    assert.deepEqual(files, ['README.md', 'src', join('src', 'index.ts'), join('src', 'logo.png')])
    assert.equal(await readFile(join(outcome.path, 'src', 'logo.png'), 'utf8'), 'PNG', 'an image inside a folder travels with it')
    assert.deepEqual(outcome.summary, { files: 3, bytes: 6 + 9 + 3, ignored: 2, unreadable: 0, symlinks: 0, truncated: false })
    assert.deepEqual(outcome.listing, ['README.md', 'src/index.ts', 'src/logo.png'])
    assert.deepEqual(progress.at(-1), { done: 3, total: 3, bytes: 18, totalBytes: 18 })
  })

  it('refuses a folder over a limit before uploading a byte', async () => {
    limits = { ...limits, maxFiles: 2 }
    const outcome = await acquireFolder(project(), 'proj', [], signal, () => {}, http)
    assert.deepEqual(outcome, { ok: false, reason: 'over-limit', limit: 'files', limits })
    assert.deepEqual(requests, ['/crosery/dsh-drop/batch'], 'only the limits were asked for')
  })

  it('reports a folder with nothing to send', async () => {
    const outcome = await acquireFolder(dir('bare', [dir('.git', [file('HEAD', 'x')])]), 'bare', [], signal, () => {}, http)
    assert.equal(outcome.ok, false)
    if (outcome.ok) return
    assert.equal(outcome.reason, 'empty')
  })

  it('references a hinted folder in place when its files check out', async () => {
    const real = join(root, 'on disk', 'proj')
    await mkdir(join(real, 'src'), { recursive: true })
    const write = async (path: string, content: string) => {
      await writeFile(join(real, ...path.split('/')), content)
      await utimes(join(real, ...path.split('/')), MTIME / 1000, MTIME / 1000)
    }
    await write('README.md', '# proj')
    await write('src/index.ts', 'export {}')
    await write('src/logo.png', 'PNG')
    const outcome = await acquireFolder(project(), 'proj', [`${real}/`], signal, () => {}, http)
    assert.equal(outcome.ok, true)
    if (!outcome.ok) return
    assert.equal(outcome.how, 'in-place')
    assert.equal(outcome.path, real)
    assert.equal(outcome.summary.files, 3)
    assert.ok(!requests.includes('/crosery/dsh-drop/stage'), 'nothing was uploaded')
  })

  it('falls back to a copy when the hinted folder does not match', async () => {
    const decoy = join(root, 'decoy', 'proj')
    await mkdir(decoy, { recursive: true })
    await writeFile(join(decoy, 'README.md'), 'something else')
    const outcome = await acquireFolder(project(), 'proj', [decoy], signal, () => {}, http)
    assert.equal(outcome.ok, true)
    if (!outcome.ok) return
    assert.equal(outcome.how, 'copied')
    assert.notEqual(outcome.path, decoy)
  })

  it('aborts the batch when the caller aborts mid-upload', async () => {
    const controller = new AbortController()
    const slow: Fetcher = async (url, init) => {
      // Abort as the first file goes out, the way removing the card does.
      if (url.endsWith('/stage')) controller.abort(new Error('removed'))
      return http(url, init)
    }
    await assert.rejects(acquireFolder(project(), 'proj', [], controller.signal, () => {}, slow))
    // The abort control request is fire-and-forget; give it a moment.
    await new Promise((done) => setTimeout(done, 100))
    assert.equal(store.open(), 0, 'the Host dropped the batch')
    const day = (await readdir(join(root, 'drops'))).find((name) => /^\d{4}-/.test(name))!
    const left = (await readdir(join(root, 'drops', day))).filter((name) => name.startsWith('.batch-'))
    assert.deepEqual(left, [])
  })

  it('surfaces a Host that refuses to begin', async () => {
    const refusing: Fetcher = async (url, init) => {
      const body = JSON.parse(String(init.body)) as { op: string }
      if (body.op === 'begin') return new Response(JSON.stringify({ error: 'busy' }), { status: 429 })
      return http(url, init)
    }
    await assert.rejects(acquireFolder(project(), 'proj', [], signal, () => {}, refusing), /429/)
  })
})

describe('countFolder', () => {
  it('counts a folder for its card without judging any limit', async () => {
    const counted = await countFolder(dir('proj', [
      file('a.txt', 'aa'), dir('node_modules', [file('x', 'x')]), dir('sub', [file('b.txt', 'b')]),
    ]), new AbortController().signal)
    assert.deepEqual(counted.summary, { files: 2, bytes: 3, ignored: 1, unreadable: 0, symlinks: 0, truncated: false })
    assert.deepEqual(counted.listing, ['a.txt', 'sub/b.txt'])
  })
})
