/**
 * Retention for the staging directory.
 *
 * A drop makes a copy, and copies of half-gigabyte videos accumulate silently
 * under the user's harness home. Pruning runs once at activation rather than on
 * a timer: the directory only grows while the app is being used, and a
 * boot-time pass costs one `readdir` on a directory that is usually empty.
 *
 * The same pass can clear what a Host that stopped mid-upload left behind: a
 * folder batch's private `.batch-*` directory, or a single file's
 * `.incoming-*` partial. Neither is ever published or referenced, so day
 * retention would keep them for `keepDays` — and forever with retention off.
 * @module @crosery/dsh-drop/prune
 */
/** Options of {@link pruneStage}. */
export interface PruneOptions {
    /**
     * Also remove upload leftovers — `.batch-*` directories and `.incoming-*`
     * files inside the day directories — that nothing has written to for this
     * many milliseconds. Absent: leave them.
     */
    leftoverIdleMs?: number | undefined;
}
/**
 * Remove staging day-directories past retention and, when asked, the
 * leftovers of uploads that never finished.
 *
 * Only entries whose names match this plugin's own `YYYY-MM-DD` spelling are
 * considered, so a user who parks something else in the staging root keeps it.
 * A missing root is the normal state before the first drop and is not an error.
 * @param root - absolute staging root.
 * @param keepDays - retention in days; 0 or less keeps every day directory.
 * @param now - current epoch milliseconds.
 * @param options - whether to sweep upload leftovers too.
 * @returns the paths removed, for logging and tests.
 */
export declare function pruneStage(root: string, keepDays: number, now: number, options?: PruneOptions): Promise<string[]>;
