/**
 * Walking a dropped folder in the browser.
 *
 * A folder dropped onto a page arrives as a `FileSystemDirectoryEntry`, the
 * only handle the platform gives for one: no path, no size, just a reader
 * that lists children a batch at a time. This module turns that into a
 * manifest — every file with its path relative to the folder — under the
 * limits the Host announced, so an oversized folder is refused before a byte
 * of it is uploaded, and never half-sent.
 *
 * DOM-free on purpose, the way `preview.ts` is: the entry shapes are restated
 * structurally below, so the walk runs under `node --test` against fake
 * entries, including the awkward ones — a reader that answers in batches, a
 * file that cannot be read, a directory that contains itself.
 * @module @crosery/dsh-drop/folder
 */

import { isIgnoredName, type FolderLimit, type FolderLimits, type FolderSampleEntry } from './contract.ts'

/** A directory reader: `readEntries` answers one batch per call, empty when done. */
export interface ReaderLike<F> {
  readEntries(success: (entries: EntryLike<F>[]) => void, failure?: (error: unknown) => void): void
}

/**
 * One filesystem entry, as far as the walk reads it.
 *
 * Mirrors `FileSystemEntry` and its two subtypes; `file` exists on file
 * entries and `createReader` on directory entries, and both are checked at
 * run time rather than trusted from the flags.
 */
export interface EntryLike<F> {
  readonly name: string
  readonly isFile: boolean
  readonly isDirectory: boolean
  file?(success: (file: F) => void, failure?: (error: unknown) => void): void
  createReader?(): ReaderLike<F>
}

/** The part of a browser file the walk reads. */
export interface WalkableFile {
  readonly size: number
  readonly lastModified?: number | undefined
}

/** One file found in the folder. */
export interface WalkedFile<F> {
  /** Path below the folder, one segment per level; the last is the file name. */
  segments: string[]
  file: F
}

/** How a walk is bounded. */
export interface WalkOptions extends FolderLimits {
  /** Stops the walk; the promise rejects with the signal's reason. */
  signal?: AbortSignal | undefined
  /**
   * Stop after this many files, without judging any limit: enough for a
   * sample or a display count. Unset walks the whole tree.
   */
  stopAfter?: number | undefined
}

/** What a walk found. */
export interface WalkResult<F> {
  /** Files in walk order: each directory's own files before its subdirectories. */
  files: WalkedFile<F>[]
  /** Total bytes of `files`. */
  bytes: number
  /** Entries skipped by name. */
  ignored: number
  /** Files or directories that could not be read. */
  unreadable: number
  /** The first limit the folder crossed; the walk stopped there. */
  overLimit?: FolderLimit | undefined
  /** Whether `stopAfter` ended the walk before the tree was seen. */
  truncated: boolean
}

/**
 * Upper bound on entries visited, directories included, as a multiple of the
 * file ceiling. A tree of empty directories holds no files, so the file
 * ceiling alone would never stop it.
 */
const VISIT_FACTOR = 8

/** Floor of the visit bound, for small file ceilings. */
const MIN_VISITS = 10_000

/**
 * Every child of one directory.
 *
 * `readEntries` answers in batches — about a hundred per call in Chromium —
 * and signals the end with an empty one, so a single call silently loses
 * everything past the first batch.
 * @param reader - the directory's reader.
 * @param signal - cancellation.
 * @returns the children in the order the reader gave them.
 */
async function readAll<F>(reader: ReaderLike<F>, signal: AbortSignal | undefined): Promise<EntryLike<F>[]> {
  const all: EntryLike<F>[] = []
  for (;;) {
    signal?.throwIfAborted()
    const batch = await new Promise<EntryLike<F>[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    if (batch.length === 0) return all
    all.push(...batch)
  }
}

/**
 * One file entry's `File`.
 * @param entry - a file entry.
 * @returns the file.
 */
function fileOf<F>(entry: EntryLike<F>): Promise<F> {
  return new Promise<F>((resolve, reject) => {
    if (typeof entry.file !== 'function') {
      reject(new Error('entry has no file'))
      return
    }
    entry.file(resolve, reject)
  })
}

/**
 * Walk one dropped folder.
 *
 * Depth-first, each directory's files before its subdirectories, so the
 * first files found — the ones a sample is taken from — sit near the top.
 * Names on the ignore list are skipped without being opened (`node_modules`
 * is never listed, only counted once). A file or directory that fails to
 * read is counted and skipped; one bad entry does not sink the folder.
 *
 * A limit is judged as each file is found, and the walk stops at the first
 * one crossed: the caller refuses the folder whole, so reading further would
 * only delay saying so. A directory nested inside itself — possible through
 * links on some platforms — ends at the depth limit.
 * @param root - the dropped folder's entry.
 * @param options - limits, cancellation and an optional early stop.
 * @returns what was found.
 */
export async function walkFolder<F extends WalkableFile>(
  root: EntryLike<F>,
  options: WalkOptions,
): Promise<WalkResult<F>> {
  const result: WalkResult<F> = { files: [], bytes: 0, ignored: 0, unreadable: 0, truncated: false }
  const visitLimit = Math.max(MIN_VISITS, options.maxFiles * VISIT_FACTOR)
  let visited = 0
  const stack: { entry: EntryLike<F>, segments: string[] }[] = [{ entry: root, segments: [] }]

  while (stack.length > 0) {
    options.signal?.throwIfAborted()
    const { entry: directory, segments } = stack.pop()!
    if (typeof directory.createReader !== 'function') {
      result.unreadable += 1
      continue
    }
    let children: EntryLike<F>[]
    try {
      children = await readAll(directory.createReader(), options.signal)
    } catch {
      options.signal?.throwIfAborted()
      result.unreadable += 1
      continue
    }

    const subdirectories: { entry: EntryLike<F>, segments: string[] }[] = []
    for (const child of children) {
      options.signal?.throwIfAborted()
      visited += 1
      if (visited > visitLimit) {
        result.overLimit = 'files'
        return result
      }
      if (isIgnoredName(child.name, options.ignore)) {
        result.ignored += 1
        continue
      }
      const path = [...segments, child.name]
      if (path.length > options.maxDepth) {
        // A count for display does not refuse anything; it just stops short.
        if (options.stopAfter !== undefined) {
          result.truncated = true
          continue
        }
        result.overLimit = 'depth'
        return result
      }
      if (child.isDirectory) {
        subdirectories.push({ entry: child, segments: path })
        continue
      }
      if (!child.isFile) continue
      let file: F
      try {
        file = await fileOf(child)
      } catch {
        options.signal?.throwIfAborted()
        result.unreadable += 1
        continue
      }
      if (options.stopAfter === undefined) {
        if (result.files.length + 1 > options.maxFiles) {
          result.overLimit = 'files'
          return result
        }
        if (file.size > options.maxFileBytes) {
          result.overLimit = 'file-bytes'
          return result
        }
        if (result.bytes + file.size > options.maxBytes) {
          result.overLimit = 'bytes'
          return result
        }
      }
      result.files.push({ segments: path, file })
      result.bytes += file.size
      if (options.stopAfter !== undefined && result.files.length >= options.stopAfter) {
        result.truncated = true
        return result
      }
    }
    // Reversed onto the stack so the first subdirectory is walked first.
    for (let index = subdirectories.length - 1; index >= 0; index -= 1) stack.push(subdirectories[index]!)
  }
  return result
}

/**
 * The first files of a walk, described for a folder claim.
 * @param files - walked files, in walk order.
 * @param count - how many to take.
 * @returns sample entries with `/`-joined relative paths.
 */
export function sampleOf<F extends WalkableFile>(files: readonly WalkedFile<F>[], count: number): FolderSampleEntry[] {
  return files.slice(0, count).map(({ segments, file }) => ({
    path: segments.join('/'),
    size: file.size,
    lastModified: file.lastModified ?? 0,
  }))
}

/** Most relative paths a folder card keeps for its listing. */
export const LISTING_LIMIT = 200

/**
 * The listing a folder card shows: relative paths, at most {@link LISTING_LIMIT}.
 * @param files - walked files, in walk order.
 * @returns `/`-joined paths.
 */
export function listingOf<F>(files: readonly WalkedFile<F>[]): string[] {
  return files.slice(0, LISTING_LIMIT).map(({ segments }) => segments.join('/'))
}
