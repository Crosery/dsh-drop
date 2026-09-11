/**
 * Turning a dropped or pasted file into a path the agent can read.
 *
 * Two outcomes, in preference order. **In place** is the good one: the drag
 * carried a `file://` URL, the Host confirmed that path is this exact file, and
 * the reference points at the user's own file — edits to it are visible on the
 * next read, and nothing was duplicated. **Copied** is the fallback for
 * everything else: a browser that withholds the URL, a file from outside any
 * path this process can reach, a paste with no path flavor at all.
 *
 * The fallback is not a defect to be engineered away. A file can arrive from a
 * download panel, another application's drag source, or a clipboard image with
 * no filesystem existence at all; those have no path to reference, and a copy
 * is the only way they can reach the model.
 * @module @crosery/dsh-drop/client/acquire
 */
/** Where a referenced path came from. */
export type Acquisition = 'in-place' | 'copied';
/** One acquired file: its path and how that path was obtained. */
export interface Acquired {
    path: string;
    how: Acquisition;
}
/**
 * Pair a file with the drag's path hints by base name.
 *
 * The hint list and the file list are both in drop order and usually align
 * one-to-one, but matching by name rather than by index keeps a drag whose
 * flavors disagree from attaching one file's bytes to another file's path — the
 * one mistake here that would be silent and wrong rather than merely a copy.
 * @param file - the dropped file.
 * @param hints - absolute paths decoded from the drag.
 * @returns the matching hint, or undefined.
 */
export declare function hintFor(file: {
    name: string;
}, hints: readonly string[]): string | undefined;
/**
 * Get a readable path for one file, preferring the original over a copy.
 * @param file - the dropped or pasted file.
 * @param hints - absolute paths decoded from the transfer's `text/uri-list`.
 * @param signal - cancellation for plugin teardown.
 * @returns the path and how it was obtained.
 * @throws when the file had no usable path and could not be copied either.
 */
export declare function acquire(file: File, hints: readonly string[], signal: AbortSignal): Promise<Acquired>;
