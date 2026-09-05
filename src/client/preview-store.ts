/**
 * The bytes behind a dropped file, kept alive for as long as its card is.
 *
 * A reference in the draft is a path, and a path is all the model ever needs.
 * A preview needs more: the `File` the drop carried, an object URL an `<img>`
 * or `<video>` can load, and for a text file a decoded prefix. None of that
 * survives a reload, which is the honest limit of this cache — a draft
 * restored from the session store shows identity cards without thumbnails,
 * because the bytes are genuinely gone.
 *
 * Object URLs are process-global and are not reclaimed by unmounting the
 * element that used them, so somebody has to own their lifetime. That owner is
 * this store: one URL per path, minted when the file is recorded, all of them
 * revoked when the plugin unloads.
 * @module @crosery/dsh-drop/client/preview-store
 */

import { dropKindOf, looksBinary, mediaTypeFor, type DropKind } from '../preview.ts'

/** How many bytes of a text file are decoded for its preview. */
const TEXT_SAMPLE_BYTES = 64 * 1024

/** The media a browser can actually render, and therefore the only ones worth an object URL. */
const RENDERABLE: readonly DropKind[] = ['image', 'video', 'audio', 'pdf']

/** Everything a card knows about one dropped file beyond its path. */
export interface DropAsset {
  /** Display name as the browser reported it, which may differ from the staged name. */
  readonly name: string
  /** Browser-declared media type, possibly empty. */
  readonly mediaType: string
  /** Byte length. */
  readonly size: number
  /** Which preview this file gets. */
  readonly kind: DropKind
  /** Object URL for media elements; undefined for the kinds nothing can render. */
  readonly url: string | undefined
}

/**
 * Per-path preview material for the files dropped in this page's lifetime.
 *
 * Keyed by path rather than by occurrence id: the path is what survives the
 * machine's occurrence churn, so deleting a chip and dropping the same file
 * again reuses the URL and the decoded text instead of paying for both twice.
 */
export class PreviewStore {
  private readonly assets = new Map<string, DropAsset>()
  private readonly files = new Map<string, File>()
  private readonly texts = new Map<string, Promise<string | undefined>>()
  private readonly urls = new Set<string>()
  private disposed = false

  /**
   * Record one acquired file against the path it was referenced by.
   *
   * Idempotent per path: a second drop of the same file keeps the first
   * asset, so a card never flickers through a new object URL for identical
   * bytes.
   * @param path - the absolute path inserted into the draft.
   * @param file - the dropped file that path stands for.
   */
  put(path: string, file: File): void {
    if (this.disposed || this.assets.has(path)) return
    const kind = dropKindOf(file.name, file.type)
    this.files.set(path, file)
    this.assets.set(path, {
      name: file.name,
      mediaType: mediaTypeFor(file.name, file.type),
      size: file.size,
      kind,
      // Only the renderable kinds get a URL. Minting one for a 400 MB archive
      // would pin its bytes for the page's lifetime and render nothing.
      url: RENDERABLE.includes(kind) ? this.mintUrl(file) : undefined,
    })
  }

  /**
   * Read one path's preview material.
   * @param path - the absolute path.
   * @returns the asset, or undefined when this page never saw the bytes.
   */
  get(path: string): DropAsset | undefined {
    return this.assets.get(path)
  }

  /**
   * Decode the head of a text file, once per path.
   *
   * Answers undefined for a file with no retained bytes, one that turns out to
   * be binary, and a read that fails. All three render identically — an
   * identity card with no excerpt — so distinguishing them would add a state
   * the UI does not use.
   * @param path - the absolute path.
   * @returns the decoded prefix, or undefined.
   */
  text(path: string): Promise<string | undefined> {
    const cached = this.texts.get(path)
    if (cached !== undefined) return cached
    const pending = this.decode(path)
    this.texts.set(path, pending)
    return pending
  }

  /** Revoke every URL this store minted and drop its retained bytes. */
  dispose(): void {
    this.disposed = true
    for (const url of this.urls) URL.revokeObjectURL(url)
    this.urls.clear()
    this.assets.clear()
    this.files.clear()
    this.texts.clear()
  }

  /**
   * Mint and track one object URL, tolerating an environment without them.
   *
   * A blob URL inherits its source's media type, and a drop is not required to
   * declare one — a typeless PDF hands the frame bytes it renders as source
   * text rather than as a document. `slice` re-types without copying, which
   * matters when the source is a several-hundred-megabyte recording.
   */
  private mintUrl(file: File): string | undefined {
    if (typeof URL.createObjectURL !== 'function') return undefined
    const mediaType = mediaTypeFor(file.name, file.type)
    const source = file.type !== mediaType && mediaType !== ''
      ? file.slice(0, file.size, mediaType)
      : file
    const url = URL.createObjectURL(source)
    this.urls.add(url)
    return url
  }

  /** The uncached read behind {@link text}. */
  private async decode(path: string): Promise<string | undefined> {
    const file = this.files.get(path)
    if (file === undefined) return undefined
    try {
      const sample = await file.slice(0, TEXT_SAMPLE_BYTES).text()
      return looksBinary(sample) ? undefined : sample
    } catch {
      return undefined
    }
  }
}
