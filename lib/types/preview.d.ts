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
export type DropKind = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'text' | 'archive' | 'file';
/**
 * The lowercased extension of a file name, without its dot.
 *
 * A leading dot is part of the name (`.gitignore` has no extension), matching
 * the rule `safeStageName()` already applies when it splits a staged name.
 * @param name - the file name, with or without directories.
 * @returns the extension, or the empty string when there is none.
 */
export declare function extensionOf(name: string): string;
/**
 * Which preview one dropped file gets.
 * @param name - the file name.
 * @param mediaType - browser-declared type, possibly empty.
 * @returns the medium its card renders as.
 */
export declare function dropKindOf(name: string, mediaType?: string): DropKind;
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
export declare function mediaTypeFor(name: string, declared: string): string;
/**
 * The short badge a card shows for a file with no visual preview.
 *
 * The extension, uppercased and capped — `DOCX`, `XLSX`, `ZIP`. A name with no
 * extension answers the empty string, and the card falls back to its medium
 * glyph rather than printing a placeholder.
 * @param name - the file name.
 * @returns the badge text, or the empty string.
 */
export declare function kindBadge(name: string): string;
/**
 * Human-readable byte size.
 *
 * One decimal below 10 units and none above, so a rail of cards keeps a stable
 * width instead of jittering between `9.87 MB` and `104.2 MB`.
 * @param bytes - byte count.
 * @returns the formatted size, or the empty string for a non-positive count.
 */
export declare function formatDropBytes(bytes: number): string;
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
export declare function looksBinary(sample: string): boolean;
