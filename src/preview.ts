/**
 * What a dropped file looks like before it is sent.
 *
 * The shipped composer answers this question for images and only images: a
 * PNG becomes a 64px thumbnail in the attachment rail, and the user sees the
 * thing they dropped. Everything this plugin accepts — a video, a PDF, a
 * Markdown file — used to arrive as a path and nothing else, so the composer
 * could show a name but never the content behind it.
 *
 * These are the pure decisions behind the preview rail: which medium a file
 * belongs to, what type its preview loads under, how its size reads, and what
 * badge it carries. All of it is DOM-free on purpose — the browser half only
 * supplies names, types and byte samples, so every rule here is reachable from
 * `node --test`.
 * @module @crosery/dsh-drop/preview
 */

/**
 * The medium a dropped file belongs to.
 *
 * Coarser than a media type on purpose: this axis picks a card layout, not a
 * decoder. `document` is the group with no browser renderer at all (Office,
 * iWork) — it gets an identity card rather than a failed preview, which is the
 * honest presentation of a file the page genuinely cannot open.
 */
export type DropKind = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'text' | 'archive' | 'file'

/**
 * Extension to medium.
 *
 * Consulted before the browser-declared type because it is the more reliable
 * of the two for exactly the files this plugin exists to handle: a `.md`
 * arrives as `text/markdown`, `text/plain`, or the empty string depending on
 * the platform, while its extension is the same everywhere.
 */
const KIND_BY_EXTENSION: Readonly<Record<string, DropKind>> = {
  // Raster and vector images. The four the shipped composer accepts are here
  // too — a mixed drop hands those back to the shipped path, but a paste of a
  // lone SVG still lands on this table.
  png: 'image', jpg: 'image', jpeg: 'image', jfif: 'image', webp: 'image', gif: 'image',
  svg: 'image', avif: 'image', heic: 'image', heif: 'image', bmp: 'image', ico: 'image',
  tif: 'image', tiff: 'image',

  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', mkv: 'video', avi: 'video',
  ogv: 'video', mpg: 'video', mpeg: 'video',

  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', ogg: 'audio',
  oga: 'audio', opus: 'audio', aiff: 'audio', wma: 'audio',

  pdf: 'pdf',

  doc: 'document', docx: 'document', ppt: 'document', pptx: 'document',
  xls: 'document', xlsx: 'document', odt: 'document', ods: 'document', odp: 'document',
  rtf: 'document', pages: 'document', numbers: 'document', key: 'document', epub: 'document',

  md: 'text', markdown: 'text', mdx: 'text', txt: 'text', log: 'text', csv: 'text',
  tsv: 'text', json: 'text', jsonl: 'text', yaml: 'text', yml: 'text', toml: 'text',
  ini: 'text', conf: 'text', env: 'text', xml: 'text', html: 'text', htm: 'text',
  css: 'text', scss: 'text', less: 'text', js: 'text', mjs: 'text', cjs: 'text',
  jsx: 'text', ts: 'text', tsx: 'text', vue: 'text', svelte: 'text', py: 'text',
  rb: 'text', go: 'text', rs: 'text', java: 'text', kt: 'text', swift: 'text',
  c: 'text', h: 'text', cc: 'text', cpp: 'text', hpp: 'text', cs: 'text', php: 'text',
  sh: 'text', bash: 'text', zsh: 'text', fish: 'text', sql: 'text', graphql: 'text',
  lua: 'text', r: 'text', pl: 'text', patch: 'text', diff: 'text',

  zip: 'archive', tar: 'archive', gz: 'archive', tgz: 'archive', bz2: 'archive',
  xz: 'archive', rar: 'archive', '7z': 'archive', zst: 'archive',
}

/**
 * Media-type prefix to medium, for files whose extension says nothing.
 *
 * The fallback rather than the primary rule: a browser reports
 * `application/octet-stream` often enough that trusting it first would file
 * half the drops under `file`.
 */
const KIND_BY_TYPE_PREFIX: readonly (readonly [string, DropKind])[] = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
  ['text/', 'text'],
]

/** Exact media types worth recognizing when the name carries no extension. */
const KIND_BY_TYPE: Readonly<Record<string, DropKind>> = {
  'application/pdf': 'pdf',
  'application/json': 'text',
  'application/xml': 'text',
  'application/zip': 'archive',
  'application/gzip': 'archive',
  'application/x-tar': 'archive',
}

/**
 * The lowercased extension of a file name, without its dot.
 *
 * A leading dot is part of the name (`.gitignore` has no extension), matching
 * the rule `safeStageName()` already applies when it splits a staged name.
 * @param name - the file name, with or without directories.
 * @returns the extension, or the empty string when there is none.
 */
export function extensionOf(name: string): string {
  const cut = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  const base = cut < 0 ? name : name.slice(cut + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/**
 * Which preview one dropped file gets.
 * @param name - the file name.
 * @param mediaType - browser-declared type, possibly empty.
 * @returns the medium its card renders as.
 */
export function dropKindOf(name: string, mediaType = ''): DropKind {
  const extension = extensionOf(name)
  // Own-property check only: a file called `report.constructor` must fall
  // through to the type rules rather than resolve to an inherited member.
  if (extension !== '' && Object.hasOwn(KIND_BY_EXTENSION, extension)) return KIND_BY_EXTENSION[extension]!
  const type = mediaType.toLowerCase()
  if (Object.hasOwn(KIND_BY_TYPE, type)) return KIND_BY_TYPE[type]!
  for (const [prefix, kind] of KIND_BY_TYPE_PREFIX) {
    if (type.startsWith(prefix)) return kind
  }
  return 'file'
}

/**
 * Media types for the formats a browser renders, keyed by extension.
 *
 * Only the renderable ones: this table exists to give an object URL a type
 * when the drop did not carry one, and a type nothing can render buys nothing.
 */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp', ico: 'image/x-icon',
  tif: 'image/tiff', tiff: 'image/tiff',

  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mkv: 'video/x-matroska', ogv: 'video/ogg', mpg: 'video/mpeg', mpeg: 'video/mpeg',

  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  aiff: 'audio/aiff',

  pdf: 'application/pdf',
}

/**
 * The media type a preview element should load one file under.
 *
 * A `File` from a drop is not required to declare a type, and an object URL
 * minted from a typeless blob inherits that emptiness: the browser then guesses
 * from the bytes, and for a PDF it guesses wrong — the frame renders the file's
 * source as plain text instead of handing it to the PDF viewer. The extension
 * is the better evidence in exactly that case, so it fills the gap. A type the
 * browser DID declare is never second-guessed; it saw the drag and this
 * function did not.
 * @param name - the file name.
 * @param declared - the browser-declared type, possibly empty.
 * @returns the type to load under, or the empty string when nothing is known.
 */
export function mediaTypeFor(name: string, declared: string): string {
  // A .pdf must never become a same-origin HTML frame, even with hostile MIME.
  if (dropKindOf(name, declared) === 'pdf') return 'application/pdf'
  if (declared !== '') return declared
  const extension = extensionOf(name)
  return extension !== '' && Object.hasOwn(MIME_BY_EXTENSION, extension)
    ? MIME_BY_EXTENSION[extension]!
    : ''
}

/**
 * The short badge a card shows for a file with no visual preview.
 *
 * The extension, uppercased and capped — `DOCX`, `XLSX`, `ZIP`. A name with no
 * extension answers the empty string, and the card falls back to its medium
 * glyph rather than printing a placeholder.
 * @param name - the file name.
 * @returns the badge text, or the empty string.
 */
export function kindBadge(name: string): string {
  const extension = extensionOf(name)
  return extension.length === 0 || extension.length > 5 ? '' : extension.toUpperCase()
}

/**
 * Human-readable byte size.
 *
 * One decimal below 10 units and none above, so a rail of cards keeps a stable
 * width instead of jittering between `9.87 MB` and `104.2 MB`.
 * @param bytes - byte count.
 * @returns the formatted size, or the empty string for a non-positive count.
 */
export function formatDropBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? String(Math.round(value)) : value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

/**
 * Whether a decoded byte sample is binary rather than text.
 *
 * A NUL byte is the discriminator every `file(1)`-style heuristic starts with,
 * and it is enough here: the question is only whether printing this sample
 * into a card would produce readable lines or mojibake. A replacement
 * character means the decoder already failed on a non-UTF-8 sequence.
 * @param sample - a decoded prefix of the file.
 * @returns true when the sample should not be shown as text.
 */
export function looksBinary(sample: string): boolean {
  return sample.includes('\u0000') || sample.includes('\uFFFD')
}
