/**
 * Folder claims on the resolve route, over real node:http and real
 * directories.
 *
 * A folder path is echoed back only when the caller described the folder's
 * files correctly — enough of them, each a real file inside it with the
 * claimed size and mtime. The summary walk that follows must stay bounded:
 * links are counted, never followed, so a link loop cannot hang it.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import {
  DEFAULT_FOLDER_IGNORE, FOLDER_SAMPLE_SIZE,
  type FolderSampleEntry, type ResolveOk, type StageErr,
} from '../src/contract.ts'
import { resolveHandler, summarizeDirectory } from '../src/resolve-route.ts'

describe('resolve route, folder claims', () => {
  let base: string
  let project: string
  let many: string
  let server: Server
  let origin: string

  before(async () => {
    base = await mkdtemp(join(tmpdir(), 'dsh-drop-resolve-dir-'))
    project = join(base, 'my project')
    await mkdir(join(project, 'src'), { recursive: true })
    await mkdir(join(project, '.git'), { recursive: true })
    await writeFile(join(project, 'README.md'), 'hello')
    await writeFile(join(project, 'src', 'index.ts'), 'export {}')
    await writeFile(join(project, '.git', 'HEAD'), 'ref')
    many = join(base, 'many')
    await mkdir(many)
    for (let index = 0; index < 12; index += 1) await writeFile(join(many, `f${index}.txt`), String(index))
    const handler = resolveHandler({ folder: () => ({ ignore: DEFAULT_FOLDER_IGNORE, maxDepth: 32 }) })
    server = createServer((req, res) => { void handler(req, res) })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(async () => {
    await new Promise<void>((done) => server.close(() => done()))
    await rm(base, { recursive: true, force: true })
  })

  const describeFile = async (root: string, path: string): Promise<FolderSampleEntry> => {
    const entry = await stat(join(root, ...path.split('/')))
    return { path, size: entry.size, lastModified: entry.mtimeMs }
  }

  const post = (path: string, sample: FolderSampleEntry[], kind = 'directory') => fetch(`${origin}/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, size: 0, lastModified: 0, kind, sample }),
  })

  it('confirms a folder whose sample matches, with a summary', async () => {
    const sample = [await describeFile(project, 'README.md'), await describeFile(project, 'src/index.ts')]
    const response = await post(`${project}/`, sample)
    assert.equal(response.status, 200)
    const body = await response.json() as ResolveOk
    assert.equal(body.path, project, 'echoed without its trailing separator')
    assert.deepEqual(body.summary, {
      files: 2, bytes: 5 + 9, ignored: 1, unreadable: 0, symlinks: 0, truncated: false,
    })
  })

  it('refuses a sample with a wrong size or mtime', async () => {
    const good = await describeFile(project, 'README.md')
    assert.equal((await post(project, [{ ...good, size: good.size + 1 }, await describeFile(project, 'src/index.ts')])).status, 404)
    assert.equal((await post(project, [{ ...good, lastModified: good.lastModified - 3_600_000 }])).status, 404)
  })

  it('refuses a sample that climbs out of the folder', async () => {
    await writeFile(join(base, 'outside.txt'), 'x')
    const outside = await stat(join(base, 'outside.txt'))
    const response = await post(project, [{ path: '../outside.txt', size: outside.size, lastModified: outside.mtimeMs }])
    assert.equal(response.status, 404)
    assert.equal(((await response.json()) as StageErr).error, 'no-match')
  })

  it('refuses a directory claim on a file, and a file claim on a directory', async () => {
    const file = join(project, 'README.md')
    assert.equal((await post(file, [])).status, 404)
    const entry = await stat(project)
    const asFile = await fetch(`${origin}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: project, size: entry.size, lastModified: entry.mtimeMs }),
    })
    assert.equal(asFile.status, 404)
  })

  it('refuses a sample smaller than the folder allows', async () => {
    // Knowing one file of twelve is not knowing the folder.
    const one = [await describeFile(many, 'f0.txt')]
    assert.equal((await post(many, one)).status, 404)
    const eight = await Promise.all(Array.from({ length: FOLDER_SAMPLE_SIZE }, (_, index) => describeFile(many, `f${index}.txt`)))
    assert.equal((await post(many, eight)).status, 200)
  })

  it('refuses a sample that repeats one file to look larger', async () => {
    const one = await describeFile(many, 'f0.txt')
    assert.equal((await post(many, Array.from({ length: FOLDER_SAMPLE_SIZE }, () => one))).status, 404)
  })

  it('refuses a sample larger than the protocol allows', async () => {
    const one = await describeFile(many, 'f0.txt')
    assert.equal((await post(many, Array.from({ length: FOLDER_SAMPLE_SIZE + 1 }, () => one))).status, 404)
  })

  it('confirms an empty folder only when it is empty', async () => {
    const empty = join(base, 'empty')
    await mkdir(join(empty, '.git'), { recursive: true })
    assert.equal((await post(empty, [])).status, 200, 'ignored names do not count')
    assert.equal((await post(project, [])).status, 404)
  })

  it('refuses a sampled file reached through a link', async () => {
    const linked = join(base, 'linked')
    await mkdir(linked)
    await symlink(join(project, 'src'), join(linked, 'src'))
    const sample = [await describeFile(project, 'src/index.ts')]
    assert.equal((await post(linked, sample)).status, 404)
  })

  it('counts a link loop once and finishes', async () => {
    const loop = join(base, 'loop')
    await mkdir(join(loop, 'inner'), { recursive: true })
    await writeFile(join(loop, 'inner', 'a.txt'), 'a')
    await symlink(loop, join(loop, 'inner', 'back'))
    const summary = await summarizeDirectory(loop, { ignore: [], maxDepth: 32 })
    assert.deepEqual(summary, { files: 1, bytes: 1, ignored: 0, unreadable: 0, symlinks: 1, truncated: false })
    const response = await post(loop, [await describeFile(loop, 'inner/a.txt')])
    assert.equal(response.status, 200)
  })

  it('stops a summary at its caps and says so', async () => {
    const capped = await summarizeDirectory(many, { ignore: [], maxDepth: 32, maxEntries: 5 })
    assert.equal(capped.truncated, true)
    assert.ok(capped.files <= 5)
    const shallow = await summarizeDirectory(project, { ignore: [], maxDepth: 1 })
    assert.equal(shallow.truncated, true, 'src/ lies below the depth ceiling')
    assert.equal(shallow.files, 1)
  })
})
