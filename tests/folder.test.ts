/**
 * The folder walk over fake filesystem entries.
 *
 * The fakes behave like Chromium's: a directory reader answers in batches and
 * ends with an empty one, `file()` can fail, and a directory can contain
 * itself. The walk must see every batch, count what it skips, stop at the
 * first limit, and end on a cycle.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_FOLDER_IGNORE, type FolderLimits } from '../src/contract.ts'
import { listingOf, sampleOf, walkFolder, type EntryLike } from '../src/folder.ts'

interface FakeFile { name: string, size: number, lastModified: number }

/** A file entry; `broken` makes `file()` fail the way an unreadable file does. */
function file(name: string, size = 1, broken = false): EntryLike<FakeFile> {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file(success, failure) {
      if (broken) failure?.(new Error('NotReadableError'))
      else success({ name, size, lastModified: 1000 })
    },
  }
}

/** A directory entry whose reader answers `batch` entries per call. */
function dir(name: string, children: EntryLike<FakeFile>[] | (() => EntryLike<FakeFile>[]), batch = 100, broken = false): EntryLike<FakeFile> & { reads: number } {
  const entry = {
    name,
    isFile: false,
    isDirectory: true,
    reads: 0,
    createReader() {
      let offset = 0
      return {
        readEntries(success: (entries: EntryLike<FakeFile>[]) => void, failure?: (error: unknown) => void) {
          entry.reads += 1
          if (broken) {
            failure?.(new Error('NotFoundError'))
            return
          }
          const list = typeof children === 'function' ? children() : children
          const slice = list.slice(offset, offset + batch)
          offset += slice.length
          // Asynchronous, like the real reader.
          queueMicrotask(() => { success(slice) })
        },
      }
    },
  }
  return entry
}

const limits: FolderLimits = {
  maxFiles: 10_000, maxBytes: 1e12, maxFileBytes: 1e12, maxDepth: 32, ignore: DEFAULT_FOLDER_IGNORE,
}

describe('walkFolder', () => {
  it('reads every batch until the reader answers empty', async () => {
    const children = Array.from({ length: 250 }, (_, index) => file(`f${index}.txt`))
    const root = dir('big', children, 100)
    const walk = await walkFolder(root, limits)
    assert.equal(walk.files.length, 250, 'a single readEntries call would have stopped at 100')
    assert.equal(root.reads, 4, '100 + 100 + 50 + the empty batch')
  })

  it('keeps structure as relative segments, files before subdirectories', async () => {
    const root = dir('proj', [
      dir('src', [file('a.ts', 3), dir('deep', [file('b.ts', 4)])]),
      file('README.md', 5),
    ])
    const walk = await walkFolder(root, limits)
    assert.deepEqual(walk.files.map((one) => one.segments.join('/')), ['README.md', 'src/a.ts', 'src/deep/b.ts'])
    assert.equal(walk.bytes, 12)
    assert.deepEqual(listingOf(walk.files), ['README.md', 'src/a.ts', 'src/deep/b.ts'])
    assert.deepEqual(sampleOf(walk.files, 2), [
      { path: 'README.md', size: 5, lastModified: 1000 },
      { path: 'src/a.ts', size: 3, lastModified: 1000 },
    ])
  })

  it('skips and counts ignored names without opening them', async () => {
    const git = dir('.git', [file('HEAD')])
    const modules = dir('node_modules', [file('x.js')])
    const root = dir('proj', [git, modules, file('.DS_Store'), file('index.js')])
    const walk = await walkFolder(root, limits)
    assert.deepEqual(walk.files.map((one) => one.segments.join('/')), ['index.js'])
    assert.equal(walk.ignored, 3)
    assert.equal(git.reads + modules.reads, 0, 'an ignored directory is never listed')
  })

  it('counts unreadable files and directories and carries on', async () => {
    const root = dir('proj', [file('ok.txt'), file('locked.txt', 1, true), dir('private', [], 100, true)])
    const walk = await walkFolder(root, limits)
    assert.deepEqual(walk.files.map((one) => one.segments.join('/')), ['ok.txt'])
    assert.equal(walk.unreadable, 2)
    assert.equal(walk.overLimit, undefined)
  })

  it('stops at the file ceiling', async () => {
    const root = dir('proj', Array.from({ length: 5 }, (_, index) => file(`f${index}`)))
    const walk = await walkFolder(root, { ...limits, maxFiles: 3 })
    assert.equal(walk.overLimit, 'files')
    assert.equal(walk.files.length, 3)
  })

  it('stops at the total byte ceiling and at the per-file ceiling', async () => {
    const root = dir('proj', [file('a', 6), file('b', 6)])
    assert.equal((await walkFolder(root, { ...limits, maxBytes: 10 })).overLimit, 'bytes')
    assert.equal((await walkFolder(root, { ...limits, maxFileBytes: 5 })).overLimit, 'file-bytes')
    assert.equal((await walkFolder(root, { ...limits, maxBytes: 12 })).overLimit, undefined)
  })

  it('stops at the depth ceiling', async () => {
    const root = dir('proj', [dir('a', [dir('b', [file('c.txt')])])])
    assert.equal((await walkFolder(root, { ...limits, maxDepth: 2 })).overLimit, 'depth')
    assert.equal((await walkFolder(root, { ...limits, maxDepth: 3 })).overLimit, undefined)
  })

  it('ends on a directory that contains itself', async () => {
    let loop: EntryLike<FakeFile>
    // The child list is built lazily so the entry can list itself.
    const self = dir('loop', () => [file('x.txt'), loop])
    loop = self
    const walk = await walkFolder(self, { ...limits, maxDepth: 5 })
    assert.equal(walk.overLimit, 'depth')
    const counted = await walkFolder(self, { ...limits, maxDepth: 5, stopAfter: 100 })
    assert.equal(counted.overLimit, undefined, 'a display count never refuses')
    assert.equal(counted.truncated, true)
    assert.equal(counted.files.length, 5)
  })

  it('ends on a tree of empty directories with no files at all', async () => {
    const wide = (depth: number): EntryLike<FakeFile> =>
      dir(`d${depth}`, depth === 0 ? [] : Array.from({ length: 25 }, () => wide(depth - 1)))
    const walk = await walkFolder(wide(2), { ...limits, maxFiles: 10 })
    assert.equal(walk.files.length, 0)
    assert.equal(walk.overLimit, undefined, '650 directories stay under the visit bound')
    const bounded = await walkFolder(wide(3), { ...limits, maxFiles: 10 })
    assert.equal(bounded.overLimit, 'files', 'the visit bound stops what the file ceiling cannot')
  })

  it('stops early for a sample without judging limits', async () => {
    const root = dir('proj', Array.from({ length: 20 }, (_, index) => file(`f${index}`, 100)))
    const walk = await walkFolder(root, { ...limits, maxBytes: 10, stopAfter: 8 })
    assert.equal(walk.files.length, 8)
    assert.equal(walk.truncated, true)
    assert.equal(walk.overLimit, undefined)
  })

  it('rejects with the signal once aborted', async () => {
    const controller = new AbortController()
    const root = dir('proj', () => {
      controller.abort(new Error('removed'))
      return [file('a')]
    })
    await assert.rejects(walkFolder(root, { ...limits, signal: controller.signal }), /removed/)
  })
})
