/**
 * Composer notice copy.
 *
 * Not registered with `ctx.locale`: these strings surface through
 * `SessionInput.notify`, which takes a rendered string rather than a namespace
 * key, so a dictionary registration would add a service dependency without
 * adding a capability. Two locales, matching the shipped dictionaries.
 * @module @crosery/dsh-drop/client/messages
 */
/** The message set one locale supplies. */
export interface Messages {
    /** One or more files staged and referenced. */
    added: (count: number) => string;
    /** Every file failed to stage. */
    failed: string;
    /** Directories were part of the drop and were skipped. */
    directories: string;
    /** No session is current, so there is no draft to write into. */
    noSession: string;
}
/**
 * Resolve the message set for the document language.
 * @returns the copy set, defaulting to Chinese.
 */
export declare function messages(): Messages;
