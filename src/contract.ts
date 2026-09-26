/**
 * Constants and pure helpers shared by both halves.
 *
 * Kept free of `@deepseek-ai/schemastery` on purpose: the browser half imports
 * this module, and a schema constructor reachable from it would be inlined
 * whole into the client bundle.
 * @module @crosery/dsh-drop/contract
 */

/** Host route that stages one dropped file and answers with its path. */
export const STAGE_ROUTE = '/crosery/dsh-drop/stage'

/**
 * Host route that checks whether a browser-supplied path really is the dropped
 * file, so it can be referenced in place instead of copied.
 */
export const RESOLVE_ROUTE = '/crosery/dsh-drop/resolve'

/**
 * Host route that manages one folder upload: `begin` opens a batch, each file
 * then goes through {@link STAGE_ROUTE} with {@link BATCH_HEADER} and
 * {@link RELPATH_HEADER}, and `commit` publishes the tree (or `abort` drops it).
 */
export const BATCH_ROUTE = '/crosery/dsh-drop/batch'

/** Settings section owned by this plugin. */
export const DROP_SETTINGS_NAMESPACE = 'crosery-drop'

/** Request header carrying the URI-encoded browser file name. */
export const NAME_HEADER = 'x-dsh-drop-name'

/** Request header naming the folder batch a staged file belongs to. */
export const BATCH_HEADER = 'x-dsh-drop-batch'

/** Request header carrying one batch file's URI-encoded path, relative to the folder. */
export const RELPATH_HEADER = 'x-dsh-drop-path'

/** Directory under the harness home that owns staged copies. */
export const STAGE_DIR = 'drops'

export const MAX_BYTES_FIELD = 'maxBytes'
export const KEEP_DAYS_FIELD = 'keepDays'
export const FOLDER_MAX_FILES_FIELD = 'folderMaxFiles'
export const FOLDER_MAX_BYTES_FIELD = 'folderMaxBytes'
export const FOLDER_MAX_DEPTH_FIELD = 'folderMaxDepth'
export const FOLDER_IGNORE_FIELD = 'folderIgnore'

/** Default per-file ceiling: large enough for a screen recording. */
export const DEFAULT_MAX_BYTES = 512 * 1024 * 1024

/** Default staging retention in days; 0 disables pruning. */
export const DEFAULT_KEEP_DAYS = 30

/** Default ceiling on the files one copied folder may hold. */
export const DEFAULT_FOLDER_MAX_FILES = 2000

/** Default ceiling on one copied folder's total bytes: the single-file ceiling. */
export const DEFAULT_FOLDER_MAX_BYTES = DEFAULT_MAX_BYTES

/** Default ceiling on how deep a copied folder may nest, in path segments below it. */
export const DEFAULT_FOLDER_MAX_DEPTH = 32

/**
 * Names skipped when a folder is copied, matched against each entry's exact
 * base name: version-control stores, dependency trees and desktop metadata —
 * large, rarely what the user meant to send, and all reproducible.
 */
export const DEFAULT_FOLDER_IGNORE: readonly string[] = Object.freeze([
  '.git', 'node_modules', '.DS_Store', 'Thumbs.db', '__MACOSX', '.svn', '.hg',
])

/**
 * How many of a folder's files the browser describes when it claims a path
 * for the folder. Enough that guessing them is impractical; few enough that
 * the claim stays one small request.
 */
export const FOLDER_SAMPLE_SIZE = 8

/** Durable configuration of the staging endpoint. */
export interface DropSettings {
  /** Per-file ceiling in bytes; a larger upload is refused with 413. */
  [MAX_BYTES_FIELD]: number
  /** Staged copies older than this many days are pruned at activation; 0 disables. */
  [KEEP_DAYS_FIELD]: number
  /**
   * Most files one copied folder may hold. Optional in the type because a
   * section saved before folder support has no such key; the schema default
   * fills it, and {@link folderLimitsOf} does too.
   */
  [FOLDER_MAX_FILES_FIELD]?: number
  /** Most bytes one copied folder may hold in total. */
  [FOLDER_MAX_BYTES_FIELD]?: number
  /** Deepest nesting one copied folder may have, in path segments. */
  [FOLDER_MAX_DEPTH_FIELD]?: number
  /** Base names skipped (and counted) when a folder is copied. */
  [FOLDER_IGNORE_FIELD]?: string[]
}

/**
 * The limits one folder copy runs under, as the Host announces them.
 *
 * Returned by the batch route so the browser can refuse an oversized folder
 * before uploading a byte of it; the Host enforces the same numbers on what
 * actually arrives.
 */
export interface FolderLimits {
  /** Most files. */
  maxFiles: number
  /** Most bytes in total. */
  maxBytes: number
  /** Most bytes in one file: the single-file ceiling. */
  maxFileBytes: number
  /** Deepest nesting, in path segments below the folder. */
  maxDepth: number
  /** Base names skipped and counted. */
  ignore: readonly string[]
}

/** A positive whole number, or the fallback. */
function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback
}

/**
 * The folder limits a settings value implies, every gap filled by its default.
 * @param settings - the resolved settings, possibly from before folder support.
 * @returns complete limits.
 */
export function folderLimitsOf(settings: Partial<DropSettings>): FolderLimits {
  const ignore = settings[FOLDER_IGNORE_FIELD]
  return {
    maxFiles: positive(settings[FOLDER_MAX_FILES_FIELD], DEFAULT_FOLDER_MAX_FILES),
    maxBytes: positive(settings[FOLDER_MAX_BYTES_FIELD], DEFAULT_FOLDER_MAX_BYTES),
    maxFileBytes: positive(settings[MAX_BYTES_FIELD], DEFAULT_MAX_BYTES),
    maxDepth: positive(settings[FOLDER_MAX_DEPTH_FIELD], DEFAULT_FOLDER_MAX_DEPTH),
    ignore: Array.isArray(ignore)
      ? ignore.filter((name): name is string => typeof name === 'string' && name !== '')
      : DEFAULT_FOLDER_IGNORE,
  }
}

/** Which folder limit a refused folder crossed. */
export type FolderLimit = 'files' | 'bytes' | 'file-bytes' | 'depth'

/**
 * What one referenced folder holds, as far as a bounded look could tell.
 *
 * Counts, never contents: the card shows them so the user can see the right
 * folder is attached and roughly how big it is.
 */
export interface FolderSummary {
  /** Regular files counted (copied, for a copy). */
  files: number
  /** Their total bytes. */
  bytes: number
  /** Entries skipped by the ignore list. */
  ignored: number
  /** Entries that could not be read. */
  unreadable: number
  /** Symbolic links seen and not followed. */
  symlinks: number
  /** Whether the count stopped at a cap before the whole tree was seen. */
  truncated: boolean
}

/**
 * Whether one base name is on an ignore list.
 * @param name - an entry's base name.
 * @param ignore - the list; exact, case-sensitive matches.
 * @returns true when the entry is skipped.
 */
export function isIgnoredName(name: string, ignore: readonly string[]): boolean {
  return ignore.includes(name)
}

/**
 * The media types the shipped composer accepts as draft images.
 *
 * This is a mirror of `imageMediaType()` in
 * `@deepseek-ai/dsh-client-ui-conversation`, not a preference of this plugin:
 * the whole point is to take exactly the files that function throws on and
 * leave the ones it accepts alone. `image/svg+xml` and `image/avif` are absent
 * here for the same reason they are absent there — they are handled as files.
 */
export const COMPOSER_IMAGE_MEDIA_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]

/**
 * Whether the shipped composer would accept a browser-declared type as a draft image.
 * @param mediaType - browser-declared MIME value, possibly empty.
 * @returns true when the built-in image path handles it.
 */
export function isComposerImageType(mediaType: string): boolean {
  return COMPOSER_IMAGE_MEDIA_TYPES.includes(mediaType)
}

/**
 * The parts of a `DataTransfer` the claim decision reads.
 *
 * Restated as plain values rather than read off the DOM class so the rule is
 * reachable from a test with no DOM. During `dragover` the browser withholds
 * names and bytes but still exposes `types` and each item's `kind`, which is
 * exactly and only what this decision needs.
 */
export interface TransferShape {
  /** `DataTransfer.types`. */
  readonly types: readonly string[]
  /** How many members have `kind === 'file'`. */
  readonly fileItems: number
  /** `DataTransfer.files.length`; some browsers fill it but not `items`. */
  readonly files: number
}

/**
 * Whether this plugin takes a transfer.
 *
 * Any transfer carrying a file is taken, images included: this plugin owns
 * the composer's attachment seat, and the shipped entry's document listeners
 * went with it, so nothing else would receive the drop. Images are then handed
 * straight back to the composer's own intake, which keeps them on the native
 * path. A drag of plain text or a link carries no file member and is left to
 * the page.
 * @param shape - the transfer's types and member counts.
 * @returns true when the transfer carries at least one file.
 */
export function claimsTransfer(shape: TransferShape): boolean {
  if (!shape.types.includes('Files')) return false
  return shape.fileItems > 0 || shape.files > 0
}

/**
 * One dropped entry, read while the transfer was still valid.
 *
 * `path` is the desktop app's answer for the file, when it has one; `entry`
 * is the browser's directory handle, carried for folder handling. Both have
 * to be read synchronously inside the event handler — the item list is
 * neutered as soon as the handler yields.
 */
export interface DroppedEntry<F, E = unknown> {
  file: F | null
  isDirectory: boolean
  /** Absolute path the host bridge reported; absent on the Web or for unbacked files. */
  path?: string | undefined
  /** The browser's filesystem entry, kept for directories. */
  entry?: E | undefined
}

/** One file this plugin acquires and references, with any path known up front. */
export interface StagedCandidate<F> {
  file: F
  /** Absolute path from the desktop bridge; absent when only bytes arrived. */
  path: string | undefined
}

/** How one drop divides between the shipped image path and this plugin's. */
export interface DropPlan<F, E = unknown> {
  /** Files the shipped composer accepts as draft images. */
  images: F[]
  /** Files this plugin acquires and references. */
  staged: StagedCandidate<F>[]
  /**
   * Directories in the drop, in drop order.
   *
   * Carried rather than counted so folder handling can take them from here;
   * until it exists they are reported and skipped.
   */
  folders: DroppedEntry<F, E>[]
}

/**
 * Split dropped entries into the paths each one takes.
 *
 * Generic over the file rather than typed to `File`: the only property this
 * decision reads is `type`, and depending on the DOM class for it would put
 * the rule out of reach of the test suite.
 * @param entries - entries read from the DataTransfer, in drop order.
 * @returns the plan.
 */
export function planDrop<F extends { type: string }, E = unknown>(
  entries: readonly DroppedEntry<F, E>[],
): DropPlan<F, E> {
  const plan: DropPlan<F, E> = { images: [], staged: [], folders: [] }
  for (const entry of entries) {
    if (entry.isDirectory) {
      plan.folders.push(entry)
      continue
    }
    if (entry.file === null) continue
    if (isComposerImageType(entry.file.type)) plan.images.push(entry.file)
    else plan.staged.push({ file: entry.file, path: entry.path === '' ? undefined : entry.path })
  }
  return plan
}

/** The identity two browser files share when they are, for every practical purpose, the same file. */
export interface FileSignature {
  readonly name: string
  readonly size: number
  readonly lastModified?: number | undefined
}

/**
 * Whether two files carry the same name, size and modification time.
 *
 * The composer has no stable file identity: dropping the same PNG twice makes
 * two drafts. Name, byte length and mtime together are what the browser
 * exposes, and a collision among them is far rarer than the accidental double
 * drop this catches.
 * @param a - one file.
 * @param b - the other.
 * @returns true when all three match.
 */
export function sameFile(a: FileSignature, b: FileSignature): boolean {
  return a.name === b.name && a.size === b.size && (a.lastModified ?? 0) === (b.lastModified ?? 0)
}

/**
 * Remove the files already present, and repeats within the batch itself.
 * @param present - files already attached.
 * @param incoming - the new batch, in order.
 * @returns the members of `incoming` worth adding, in order.
 */
export function freshFiles<F extends FileSignature>(present: readonly FileSignature[], incoming: readonly F[]): F[] {
  const kept: F[] = []
  for (const file of incoming) {
    if (present.some((other) => sameFile(other, file))) continue
    if (kept.some((other) => sameFile(other, file))) continue
    kept.push(file)
  }
  return kept
}

/**
 * Whether a paste's plain-text flavor only restates the files it carries.
 *
 * A file copied in Finder or Explorer arrives with its name (or a `file://`
 * URL) on `text/plain` beside the bytes. Inserting that text next to the
 * attachment would put the file in the message twice, so it is dropped — but
 * only then. A spreadsheet copy carries real text beside a rendered PNG, and
 * that text is the point of the paste.
 * @param text - the clipboard's plain-text flavor.
 * @param names - names of the pasted files.
 * @returns true when every line is one of the file names or a local file URL.
 */
export function pasteTextIsFileNames(text: string, names: readonly string[]): boolean {
  const lines = text.split(/\r\n|\r|\n/).map((line) => line.trim()).filter((line) => line !== '')
  if (lines.length === 0) return true
  return lines.every((line) => {
    if (names.includes(line)) return true
    const path = pathFromFileUrl(line)
    return path !== undefined && names.includes(fileNameOf(path))
  })
}

/** Successful staging answer. */
export interface StageOk {
  /** Absolute path of the staged copy. */
  path: string
}

/** Refused staging answer. */
export interface StageErr {
  /** Machine-readable reason. */
  error:
    | 'method' | 'forbidden' | 'unauthorized' | 'unavailable' | 'too-large' | 'write-failed' | 'no-match'
    | 'too-many' | 'too-deep' | 'unknown-batch' | 'unsafe-path' | 'bad-request' | 'busy' | 'empty'
  /** For a folder refused over a limit: which one. */
  limit?: FolderLimit | undefined
}

/** One file of a folder batch, published. */
export interface BatchFileOk {
  /** Where it landed, relative to the folder, `/`-separated; may carry a collision suffix. */
  path: string
}

/** Batch route request: open, publish, drop, or just read the limits. */
export type BatchRequest =
  | { op: 'limits' }
  | { op: 'begin', name: string }
  | { op: 'commit', id: string }
  | { op: 'abort', id: string }

/** Answer to `limits`. */
export interface BatchLimitsOk {
  limits: FolderLimits
}

/** Answer to `begin`: the batch's capability id and the limits it runs under. */
export interface BatchBeginOk {
  id: string
  limits: FolderLimits
}

/** Answer to `commit`: the published folder and what it holds. */
export interface BatchCommitOk {
  /** Absolute path of the published folder, without a trailing separator. */
  path: string
  summary: FolderSummary
}

/** Answer to `abort`. */
export interface BatchAbortOk {
  aborted: true
}

/**
 * A claim that a path on disk IS the dropped file.
 *
 * The browser never volunteers a dropped file's location, but the drag itself
 * sometimes carries one alongside the bytes: a Finder or Explorer drag can put
 * a `file://` URL on the `text/uri-list` flavor. That URL is a hint from an
 * untrusted side of the boundary, so it is not believed — it is checked against
 * the size and modification time the same drag reported for the file. A path
 * that matches is referenced where it lies; anything else falls back to a copy.
 */
export interface ResolveRequest {
  /** Absolute path decoded from the drag's file URL. */
  path: string
  /** Byte length the browser reported for the dropped file; unused for a folder. */
  size: number
  /** `File.lastModified`, epoch milliseconds; unused for a folder. */
  lastModified: number
  /** What the path is claimed to be; a file when absent. */
  kind?: MentionKind | undefined
  /**
   * For a folder: up to {@link FOLDER_SAMPLE_SIZE} of its files, described
   * the same way a file claim describes itself. A folder has no size or mtime
   * worth matching, so its contents stand in for them.
   */
  sample?: FolderSampleEntry[] | undefined
}

/** One file a folder claim describes. */
export interface FolderSampleEntry {
  /** Path relative to the folder, `/`-separated. */
  path: string
  size: number
  lastModified: number
}

/** Confirmed in-place answer. */
export interface ResolveOk {
  /** The same absolute path, echoed only after it matched. */
  path: string
  /** For a folder: what a bounded look found in it. */
  summary?: FolderSummary | undefined
}

/**
 * Modification-time slack when matching a claim.
 *
 * `File.lastModified` is truncated to milliseconds and some filesystems store
 * whole seconds, so an exact comparison would reject a correct path. Two
 * seconds is wide enough for that truncation and far narrower than the window
 * in which a file would have to be replaced for the match to be wrong.
 */
export const MTIME_TOLERANCE_MS = 2000

/**
 * Characters an `@` mention cannot carry.
 *
 * The same class upstream `formatFileMention()` refuses: C0 and C1 controls,
 * DEL, and the double quote that delimits a quoted mention. A path containing
 * one cannot be written as a reference that parses back to itself.
 */
export const UNMENTIONABLE = /[\u0000-\u001F\u007F-\u009F"]/u

/**
 * Decode one `file://` URL into an absolute path.
 * @param url - candidate URL text, already trimmed.
 * @returns the decoded path, or undefined when this is not a local file URL.
 */
export function pathFromFileUrl(url: string): string | undefined {
  if (!/^file:\/\//i.test(url)) return undefined
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  // A host other than the implicit localhost names a remote share this process
  // cannot stat by path.
  if (parsed.hostname !== '' && parsed.hostname !== 'localhost') return undefined
  try {
    const path = decodeURIComponent(parsed.pathname)
    return path === '' ? undefined : path
  } catch {
    return undefined
  }
}

/**
 * Parse the `text/uri-list` drag flavor into absolute paths.
 *
 * The format is one URI per line with `#` comment lines (RFC 2483). Non-file
 * entries are dropped rather than rejected: a drag can mix a file with a web
 * URL, and the file half is still usable.
 * @param text - raw flavor content, possibly empty.
 * @returns decoded absolute paths in list order.
 */
export function uriListPaths(text: string): string[] {
  const paths: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const path = pathFromFileUrl(trimmed)
    if (path !== undefined) paths.push(path)
  }
  return paths
}

/** Longest base name this plugin will write, extension excluded. */
const MAX_BASE_LENGTH = 100

/** Fallback when the browser-supplied name carries nothing usable. */
const FALLBACK_NAME = 'dropped-file'

/**
 * Reduce a browser-supplied file name to something safe to create inside the
 * staging directory.
 *
 * Three separate hazards collapse into this one function. Path traversal is the
 * obvious one: only the last segment survives, and a segment that is entirely
 * dots is discarded. Control characters and double quotes are the second — they
 * are not a filesystem problem but an `@` mention problem, since
 * `formatFileMention()` upstream refuses to represent them, so a file named
 * with one could never be referenced afterward. Length is the third: a browser
 * will happily hand over a 4 KB name that no filesystem accepts. On a Windows
 * Host its name rules apply as well ({@link NameRules}): a name the browser's
 * platform allows, such as `Q3: plan.txt`, would otherwise upload in full and
 * then fail to publish.
 * @param raw - the browser-declared file name.
 * @param rules - the Host platform's name rules.
 * @returns a single path segment safe to join onto the staging root.
 */
export function safeStageName(raw: string, rules: NameRules = {}): string {
  const segment = raw.split(/[\\/]/).pop() ?? ''
  // Control characters and double quotes are stripped rather than escaped:
  // `formatFileMention()` upstream refuses to represent either, so a staged
  // name containing one could never be written as an `@` reference.
  let cleaned = segment.replace(/[\u0000-\u001F\u007F-\u009F"]/g, '').trim()
  if (rules.win32 === true) cleaned = win32Segment(cleaned)
  if (cleaned === '' || /^\.+$/.test(cleaned)) return FALLBACK_NAME
  return fitSegment(cleaned) || FALLBACK_NAME
}

/** Longest extension kept, in UTF-8 bytes. */
const MAX_EXT_LENGTH = 32

/**
 * Cut one name to the segment budget, keeping its extension.
 *
 * UTF-8 byte budgets, not UTF-16 lengths: filesystems count bytes, and the
 * margin below the usual 255-byte limit leaves room for collision suffixes.
 * @param name - a cleaned segment.
 * @returns the fitted segment; empty when nothing of the base fits.
 */
function fitSegment(name: string): string {
  const dot = name.lastIndexOf('.')
  // A leading dot is part of the name (`.gitignore`), not an extension marker.
  const hasExt = dot > 0 && dot < name.length - 1
  const base = hasExt ? name.slice(0, dot) : name
  const ext = hasExt ? name.slice(dot) : ''
  const trimmed = fitBytes(base, MAX_BASE_LENGTH)
  return trimmed === '' ? '' : trimmed + fitBytes(ext, MAX_EXT_LENGTH)
}

/** The longest prefix of `value` within `budget` UTF-8 bytes, whole code points only. */
function fitBytes(value: string, budget: number): string {
  let result = ''
  let used = 0
  const encoder = new TextEncoder()
  for (const character of value) {
    const size = encoder.encode(character).length
    if (used + size > budget) break
    result += character
    used += size
  }
  return result
}

/** Longest relative path a folder copy writes, in UTF-8 bytes. */
export const MAX_RELATIVE_PATH_BYTES = 1024

/** Characters Windows refuses in a file name. */
const WIN32_FORBIDDEN = /[<>:"|?*]/g

/** Device names Windows reserves in every directory, with or without an extension. */
const WIN32_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i

/** Which platform's name rules a published name follows. */
export interface NameRules {
  /** Apply the Windows name rules as well; the Host decides, by its own platform. */
  win32?: boolean | undefined
}

/**
 * Apply the Windows name rules to one cleaned segment: reserved characters
 * replaced, trailing dots and spaces dropped (Windows drops them itself, so
 * the published name would differ from the one answered), device names
 * prefixed.
 * @param segment - a segment already free of separators and controls.
 * @returns the segment as Windows can create it; empty when nothing is left.
 */
function win32Segment(segment: string): string {
  const cleaned = segment.replace(WIN32_FORBIDDEN, '_').replace(/[. ]+$/, '')
  return WIN32_RESERVED.test(cleaned) ? `_${cleaned}` : cleaned
}

/** Options of {@link safeRelativeSegments}. */
export interface RelativePathRules extends NameRules {
  /** Most segments the path may have. */
  maxDepth: number
}

/**
 * Reduce a browser-supplied path inside a dropped folder to segments safe to
 * create under the folder's copy.
 *
 * The relative path is the one part of a folder upload the browser chooses,
 * so it is treated like the file name of a single upload, segment by segment:
 *
 * - separators of both platforms split it, and empty segments — a leading
 *   root, a doubled slash — vanish, so `/etc/passwd` becomes `etc/passwd`
 *   under the copy rather than anything outside it; a drive prefix (`C:`)
 *   is dropped the same way;
 * - a `.` or `..` segment rejects the whole path: there is no faithful place
 *   inside the copy for it, and resolving it would be the traversal;
 * - C0 and C1 controls are stripped (inner names otherwise stay faithful — a
 *   quote in a nested name is harmless, only the folder's own name is ever
 *   written as a mention); on Windows the reserved characters, device names
 *   and trailing dots or spaces are replaced as well;
 * - each segment keeps the single-file budget, and the whole path at most
 *   {@link MAX_RELATIVE_PATH_BYTES} bytes.
 *
 * Two different names that clean to the same segment are not merged: the
 * Host publishes every file without replacing an existing path, so the second
 * one lands under a suffixed name.
 * @param raw - the path as the browser sent it.
 * @param rules - depth ceiling and platform.
 * @returns the segments, or undefined when the path must be refused.
 */
export function safeRelativeSegments(raw: string, rules: RelativePathRules): string[] | undefined {
  const parts = raw.split(/[\\/]/).filter((part) => part !== '')
  if (parts.length > 0 && /^[A-Za-z]:$/.test(parts[0]!)) parts.shift()
  const segments: string[] = []
  for (const part of parts) {
    if (part === '.' || part === '..') return undefined
    let cleaned = part.replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    if (rules.win32 === true) cleaned = win32Segment(cleaned)
    // Stripping can expose a dot segment (`.\u0001.`); it is refused like one.
    if (cleaned === '' || cleaned === '.' || cleaned === '..') return undefined
    const fitted = fitSegment(cleaned)
    if (fitted === '') return undefined
    segments.push(fitted)
  }
  if (segments.length === 0 || segments.length > rules.maxDepth) return undefined
  if (new TextEncoder().encode(segments.join('/')).length > MAX_RELATIVE_PATH_BYTES) return undefined
  return segments
}

/**
 * The name a copied folder is published under.
 *
 * The folder's own name is the one segment that becomes part of a mention,
 * so it follows the single-file rules — quotes and controls stripped, and on
 * a Windows Host that platform's name rules. Decided when the batch begins:
 * a name Windows refuses (`Q3: plan`) would otherwise upload in full and fail
 * only at commit.
 * @param raw - the dropped folder's name.
 * @param rules - the Host platform's name rules.
 * @returns a single safe segment.
 */
export function safeFolderName(raw: string, rules: NameRules = {}): string {
  const segment = raw.split(/[\\/]/).filter((part) => part !== '').pop() ?? ''
  const cleaned = segment.replace(/[\u0000-\u001F\u007F-\u009F"]/g, '').trim()
  if (cleaned === '' || /^\.+$/.test(cleaned)) return FALLBACK_FOLDER_NAME
  // After the cut: a cut can end the name on a dot or a space again.
  const fitted = fitBytes(cleaned, MAX_BASE_LENGTH)
  return (rules.win32 === true ? win32Segment(fitted) : fitted) || FALLBACK_FOLDER_NAME
}

/** Fallback when the dropped folder's name carries nothing usable. */
const FALLBACK_FOLDER_NAME = 'dropped-folder'

/**
 * The nth candidate name for one published folder.
 *
 * Suffixed at the end rather than before an extension: `site.v2` is a folder
 * name, not a stem and a type.
 * @param name - the sanitized folder name.
 * @param attempt - zero for the plain name, then 1, 2, … for suffixed variants.
 * @returns the candidate segment.
 */
export function folderCandidate(name: string, attempt: number): string {
  return attempt === 0 ? name : `${name}-${attempt + 1}`
}

/**
 * The nth candidate name for one staged file.
 *
 * Collisions are resolved by suffix rather than by content hash: dropping the
 * same bytes twice is a deliberate act often enough (a file edited between two
 * drops keeps its name), and hashing a half-gigabyte video to answer "have I
 * seen this?" costs more than the duplicate copy it would save.
 * @param name - the sanitized base name.
 * @param attempt - zero for the plain name, then 1, 2, … for suffixed variants.
 * @returns the candidate segment.
 */
export function stageCandidate(name: string, attempt: number): string {
  if (attempt === 0) return name
  const dot = name.lastIndexOf('.')
  const hasExt = dot > 0 && dot < name.length - 1
  const base = hasExt ? name.slice(0, dot) : name
  const ext = hasExt ? name.slice(dot) : ''
  return `${base}-${attempt + 1}${ext}`
}

/** What a mention names: one file, or a directory (spelled with a trailing slash). */
export type MentionKind = 'file' | 'directory'

/**
 * Render one absolute path as the composer's `@` file mention.
 *
 * Mirrors upstream `formatFileMention()` rule for rule, because the model's
 * reference prompt parses what that function writes:
 *
 * - a path containing a control character or a double quote has no mention
 *   form at all, so the answer is `undefined` and the caller falls back to a
 *   copy under a safe name;
 * - whitespace forces the quoted form (`@"path with spaces"`), anything else
 *   stays bare — which is what the completion menu itself inserts, so a
 *   dropped reference is indistinguishable from a typed one;
 * - a directory ends in `/`, which is how the reference prompt tells the
 *   model to list it. Its quoted form is closed (`@"/a b/dir/"`), the way the
 *   0.1.7 composer writes a dropped folder: only the completion menu leaves
 *   the quote open, so typing can descend another level, and a message sent
 *   with an open quote would run the path into the next line.
 * @param path - absolute filesystem path.
 * @param kind - whether the path names a file or a directory.
 * @returns the draft text for one reference, or undefined when unrepresentable.
 */
export function mentionFor(path: string, kind: MentionKind = 'file'): string | undefined {
  const target = kind === 'directory' && !/[\\/]$/.test(path) ? `${path}/` : path
  if (UNMENTIONABLE.test(target)) return undefined
  if (!/\s/u.test(target)) return `@${target}`
  return `@"${target}"`
}

/**
 * The display name of one staged path.
 *
 * Just the base name — the full path is what the model receives, and what the
 * preview card shows is what the user needs to recognize the file by. A
 * trailing separator is ignored, so a directory reads as its own name.
 * @param path - absolute filesystem path.
 * @returns the last path segment, or the whole path when it has no separator.
 */
export function fileNameOf(path: string): string {
  // A directory path may end in its separator; the name is the segment before.
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const name = cut < 0 ? trimmed : trimmed.slice(cut + 1)
  return name === '' ? path : name
}

/** Matches exactly the `YYYY-MM-DD` directory names this plugin creates. */
const DATE_DIR = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Whether a staging subdirectory is old enough to prune.
 *
 * The name has to match this plugin's own `YYYY-MM-DD` spelling before its age
 * is even considered. Pruning walks a directory under the user's harness home,
 * so "I did not create this" is the first question, not the second.
 * @param dirName - the immediate subdirectory name.
 * @param keepDays - retention in days; 0 or less never prunes.
 * @param now - current epoch milliseconds.
 * @returns true when the directory is this plugin's and past retention.
 */
export function isPrunableStageDir(dirName: string, keepDays: number, now: number): boolean {
  if (keepDays <= 0) return false
  const match = DATE_DIR.exec(dirName)
  if (match === null) return false
  const [, year, month, day] = match
  const stamp = Date.UTC(Number(year), Number(month) - 1, Number(day))
  if (!Number.isFinite(stamp)) return false
  return now - stamp > keepDays * 86_400_000
}

/**
 * The `YYYY-MM-DD` bucket a drop lands in.
 * @param now - current epoch milliseconds.
 * @returns the UTC date directory name.
 */
export function stageDayDir(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}
