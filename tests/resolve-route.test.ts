/**
 * Path recovery: decoding the drag's file URL, and the Host check that decides
 * whether that path may be referenced in place instead of copied.
 *
 * The claim comes from the browser, so the assertions that matter are the
 * refusals — a route that echoed back any path it was handed would turn a
 * dropped file into a reference to a file the user never dropped.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdtemp, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import {
  MTIME_TOLERANCE_MS, pathFromFileUrl, uriListPaths,
  type ResolveOk, type ResolveRequest, type StageErr,
} from '../src/contract.ts'
import { claimMatches, resolveHandler } from '../src/resolve-route.ts'

describe('pathFromFileUrl', () => {
  it('decodes a plain file URL', () => {
    assert.equal(pathFromFileUrl('file:///Users/a/notes.md'), '/Users/a/notes.md')
  })

  it('percent-decodes spaces and non-ASCII names', () => {
    assert.equal(pathFromFileUrl('file:///Users/a/my%20notes.md'), '/Users/a/my notes.md')
    assert.equal(pathFromFileUrl('file:///Users/a/%E7%AC%94%E8%AE%B0.md'), '/Users/a/笔记.md')
  })

  it('accepts the explicit localhost host', () => {
    assert.equal(pathFromFileUrl('file://localhost/Users/a/notes.md'), '/Users/a/notes.md')
  })

  it('refuses a remote share this process cannot stat by path', () => {
    assert.equal(pathFromFileUrl('file://fileserver/share/notes.md'), undefined)
  })

  it('refuses anything that is not a file URL', () => {
    assert.equal(pathFromFileUrl('https://example.com/notes.md'), undefined)
    assert.equal(pathFromFileUrl('/Users/a/notes.md'), undefined)
    assert.equal(pathFromFileUrl(''), undefined)
  })
})

describe('uriListPaths', () => {
  it('reads one path per line and skips RFC 2483 comments', () => {
    const text = '# comment\r\nfile:///a/one.md\r\nfile:///a/two.md\r\n'
    assert.deepEqual(uriListPaths(text), ['/a/one.md', '/a/two.md'])
  })

  it('keeps the file half of a mixed drag', () => {
    assert.deepEqual(uriListPaths('https://example.com\nfile:///a/one.md'), ['/a/one.md'])
  })

  it('reads an absent flavor as no hints', () => {
    assert.deepEqual(uriListPaths(''), [])
  })
})

describe('claimMatches', () => {
  const claim: ResolveRequest = { path: '/a/notes.md', size: 100, lastModified: 1_700_000_000_000 }

  it('accepts an exact match', () => {
    assert.equal(claimMatches({ size: 100, mtimeMs: claim.lastModified }, claim), true)
  })

  it('tolerates filesystem timestamp truncation', () => {
    assert.equal(claimMatches({ size: 100, mtimeMs: claim.lastModified - 999 }, claim), true)
    assert.equal(claimMatches({ size: 100, mtimeMs: claim.lastModified + MTIME_TOLERANCE_MS }, claim), true)
  })

  it('rejects a file modified outside the tolerance', () => {
    assert.equal(claimMatches({ size: 100, mtimeMs: claim.lastModified + 60_000 }, claim), false)
  })

  it('rejects a different size at the same timestamp', () => {
    assert.equal(claimMatches({ size: 101, mtimeMs: claim.lastModified }, claim), false)
  })
})

describe('resolve route', () => {
  let dir: string
  let server: Server
  let origin: string

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-drop-resolve-'))
    const handler = resolveHandler()
    server = createServer((req, res) => { void handler(req, res) })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const post = async (body: unknown) =>
    fetch(`${origin}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('echoes a path whose size and mtime match the dropped file', async () => {
    const path = join(dir, 'real.md')
    await writeFile(path, 'hello')
    const entry = await stat(path)

    const response = await post({ path, size: entry.size, lastModified: entry.mtimeMs })
    assert.equal(response.status, 200)
    assert.equal(((await response.json()) as ResolveOk).path, path)
  })

  it('refuses a path whose size disagrees', async () => {
    const path = join(dir, 'real.md')
    const entry = await stat(path)
    const response = await post({ path, size: entry.size + 1, lastModified: entry.mtimeMs })
    assert.equal(response.status, 404)
    assert.equal(((await response.json()) as StageErr).error, 'no-match')
  })

  it('refuses a path modified since the drag reported it', async () => {
    const path = join(dir, 'moved.md')
    await writeFile(path, 'hello')
    const entry = await stat(path)
    const shifted = new Date(entry.mtimeMs - 3_600_000)
    await utimes(path, shifted, shifted)
    const response = await post({ path, size: entry.size, lastModified: entry.mtimeMs })
    assert.equal(response.status, 404)
  })

  it('refuses a directory even at a matching size', async () => {
    const entry = await stat(dir)
    const response = await post({ path: dir, size: entry.size, lastModified: entry.mtimeMs })
    assert.equal(response.status, 404)
  })

  it('refuses a path that does not exist', async () => {
    const response = await post({ path: join(dir, 'absent.md'), size: 5, lastModified: Date.now() })
    assert.equal(response.status, 404)
  })

  it('refuses a relative path', async () => {
    const response = await post({ path: 'real.md', size: 5, lastModified: Date.now() })
    assert.equal(response.status, 404)
  })

  it('refuses a malformed claim', async () => {
    const response = await post({ path: 42 })
    assert.equal(response.status, 404)
  })

  it('refuses a method other than POST', async () => {
    const response = await fetch(`${origin}/resolve`)
    assert.equal(response.status, 405)
    assert.equal(((await response.json()) as StageErr).error, 'method')
  })
})
