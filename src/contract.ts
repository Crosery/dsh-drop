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

/** Settings section owned by this plugin. */
export const DROP_SETTINGS_NAMESPACE = 'crosery-drop'

/** Request header carrying the URI-encoded browser file name. */
export const NAME_HEADER = 'x-dsh-drop-name'

/** Directory under the harness home that owns staged copies. */
export const STAGE_DIR = 'drops'

export const MAX_BYTES_FIELD = 'maxBytes'
export const KEEP_DAYS_FIELD = 'keepDays'

/** Default per-file ceiling: large enough for a screen recording. */
export const DEFAULT_MAX_BYTES = 512 * 1024 * 1024

/** Default staging retention in days; 0 disables pruning. */
export const DEFAULT_KEEP_DAYS = 30

/** Durable configuration of the staging endpoint. */
export interface DropSettings {
  /** Per-file ceiling in bytes; a larger upload is refused with 413. */
  [MAX_BYTES_FIELD]: number
  /** Staged copies older than this many days are pruned at activation; 0 disables. */
  [KEEP_DAYS_FIELD]: number
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
 * Whether this plugin claims a drag carrying these file media types.
 *
 * Lives here rather than in the client entry so it is reachable from a test
 * that has no DOM: every drag decision this plugin makes is one call to this
 * function, and the client entry only supplies the types.
 * @param mediaTypes - browser-declared types of the drag's file members.
 * @returns true when at least one member is not a composer-acceptable image.
 */
export function claimsFileTypes(mediaTypes: readonly string[]): boolean {
  return mediaTypes.some((mediaType) => !isComposerImageType(mediaType))
}

/** One dropped entry: its file (absent when the browser withheld it) and whether it is a directory. */
export interface DroppedEntry<F> {
  file: F | null
  isDirectory: boolean
}

/** How one drop divides between the shipped image path and this plugin's. */
export interface DropPlan<F> {
  /** Files the shipped composer accepts as draft images. */
  images: F[]
  /** Files this plugin stages and references. */
  staged: F[]
  /** Whether any member was a directory. */
  directories: boolean
}

/**
 * Split dropped entries into the two paths.
 *
 * Generic over the file rather than typed to `File` for the same reason
 * {@link claimsFileTypes} lives here: the only property this decision reads is
 * `type`, and depending on the DOM class for it would put the rule out of reach
 * of the test suite.
 * @param entries - entries read from the DataTransfer, in drop order.
 * @returns the plan.
 */
export function planDrop<F extends { type: string }>(entries: readonly DroppedEntry<F>[]): DropPlan<F> {
  const plan: DropPlan<F> = { images: [], staged: [], directories: false }
  for (const entry of entries) {
    if (entry.isDirectory) {
      plan.directories = true
      continue
    }
    if (entry.file === null) continue
    if (isComposerImageType(entry.file.type)) plan.images.push(entry.file)
    else plan.staged.push(entry.file)
  }
  return plan
}

/** Successful staging answer. */
export interface StageOk {
  /** Absolute path of the staged copy. */
  path: string
}

/** Refused staging answer. */
export interface StageErr {
  /** Machine-readable reason. */
  error: 'method' | 'forbidden' | 'too-large' | 'write-failed' | 'no-match'
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
  /** Byte length the browser reported for the dropped file. */
  size: number
  /** `File.lastModified`, epoch milliseconds. */
  lastModified: number
}

/** Confirmed in-place answer. */
export interface ResolveOk {
  /** The same absolute path, echoed only after it matched. */
  path: string
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
 * will happily hand over a 4 KB name that no filesystem accepts.
 * @param raw - the browser-declared file name.
 * @returns a single path segment safe to join onto the staging root.
 */
export function safeStageName(raw: string): string {
  const segment = raw.split(/[\\/]/).pop() ?? ''
  // Control characters and double quotes are stripped rather than escaped:
  // `formatFileMention()` upstream refuses to represent either, so a staged
  // name containing one could never be written as an `@` reference.
  const cleaned = segment.replace(/[\u0000-\u001F\u007F"]/g, '').trim()
  if (cleaned === '' || /^\.+$/.test(cleaned)) return FALLBACK_NAME

  const dot = cleaned.lastIndexOf('.')
  // A leading dot is part of the name (`.gitignore`), not an extension marker.
  const hasExt = dot > 0 && dot < cleaned.length - 1
  const base = hasExt ? cleaned.slice(0, dot) : cleaned
  const ext = hasExt ? cleaned.slice(dot) : ''
  // UTF-8 byte budgets, not UTF-16 lengths: leave room for collision suffixes.
  const fit = (value: string, budget: number): string => {
    let result = ''
    const encoder = new TextEncoder()
    for (const character of value) {
      if (encoder.encode(result + character).length > budget) break
      result += character
    }
    return result
  }
  const trimmed = fit(base, MAX_BASE_LENGTH)
  return trimmed === '' ? FALLBACK_NAME : trimmed + fit(ext, 32)
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

/**
 * Render one absolute path as the composer's `@` file mention.
 *
 * The quoted form is the upstream syntax for paths containing whitespace
 * (`@"path with spaces"`), so quoting is driven by the path's content rather
 * than applied unconditionally — an unquoted mention is what the completion
 * menu itself inserts, and matching it keeps a dropped reference
 * indistinguishable from a typed one.
 * @param path - absolute filesystem path.
 * @returns the draft text for one reference occurrence.
 */
export function mentionFor(path: string): string {
  return /[\s"]/.test(path) ? `@"${path}"` : `@${path}`
}

/**
 * The display name of one staged path.
 *
 * Just the base name — the full path is what the model receives, and what the
 * preview card shows is what the user needs to recognize the file by.
 * @param path - absolute filesystem path.
 * @returns the last path segment, or the whole path when it has no separator.
 */
export function fileNameOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const name = cut < 0 ? path : path.slice(cut + 1)
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
