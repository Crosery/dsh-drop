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
import { type FolderLimit, type FolderLimits, type FolderSampleEntry } from './contract.ts';
/** A directory reader: `readEntries` answers one batch per call, empty when done. */
export interface ReaderLike<F> {
    readEntries(success: (entries: EntryLike<F>[]) => void, failure?: (error: unknown) => void): void;
}
/**
 * One filesystem entry, as far as the walk reads it.
 *
 * Mirrors `FileSystemEntry` and its two subtypes; `file` exists on file
 * entries and `createReader` on directory entries, and both are checked at
 * run time rather than trusted from the flags.
 */
export interface EntryLike<F> {
    readonly name: string;
    readonly isFile: boolean;
    readonly isDirectory: boolean;
    file?(success: (file: F) => void, failure?: (error: unknown) => void): void;
    createReader?(): ReaderLike<F>;
}
/** The part of a browser file the walk reads. */
export interface WalkableFile {
    readonly size: number;
    readonly lastModified?: number | undefined;
}
/** One file found in the folder. */
export interface WalkedFile<F> {
    /** Path below the folder, one segment per level; the last is the file name. */
    segments: string[];
    file: F;
}
/** How a walk is bounded. */
export interface WalkOptions extends FolderLimits {
    /** Stops the walk; the promise rejects with the signal's reason. */
    signal?: AbortSignal | undefined;
    /**
     * Stop after this many files, without judging any limit: enough for a
     * sample or a display count. Unset walks the whole tree.
     */
    stopAfter?: number | undefined;
}
/** What a walk found. */
export interface WalkResult<F> {
    /** Files in walk order: each directory's own files before its subdirectories. */
    files: WalkedFile<F>[];
    /** Total bytes of `files`. */
    bytes: number;
    /** Entries skipped by name. */
    ignored: number;
    /** Files or directories that could not be read. */
    unreadable: number;
    /** The first limit the folder crossed; the walk stopped there. */
    overLimit?: FolderLimit | undefined;
    /** Whether `stopAfter` ended the walk before the tree was seen. */
    truncated: boolean;
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
export declare function walkFolder<F extends WalkableFile>(root: EntryLike<F>, options: WalkOptions): Promise<WalkResult<F>>;
/**
 * The first files of a walk, described for a folder claim.
 * @param files - walked files, in walk order.
 * @param count - how many to take.
 * @returns sample entries with `/`-joined relative paths.
 */
export declare function sampleOf<F extends WalkableFile>(files: readonly WalkedFile<F>[], count: number): FolderSampleEntry[];
/** Most relative paths a folder card keeps for its listing. */
export declare const LISTING_LIMIT = 200;
/**
 * The listing a folder card shows: relative paths, at most {@link LISTING_LIMIT}.
 * @param files - walked files, in walk order.
 * @returns `/`-joined paths.
 */
export declare function listingOf<F>(files: readonly WalkedFile<F>[]): string[];
