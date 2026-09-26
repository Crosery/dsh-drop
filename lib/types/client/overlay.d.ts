/**
 * The drop invitation shown while files are dragged over the page.
 *
 * Plain DOM rather than a slot component. The shipped overlay lives inside the
 * attachment seat this plugin occupies, so it is gone, and its copy described
 * images only. One absolutely-positioned element needs no React, and it can
 * sit above every composer on the page at once.
 *
 * It has two faces. The invitation says what happens to each kind of file and
 * repeats the composer's image limits. The blocked face appears when the
 * composer under the pointer refuses files — a subagent's composer, a
 * composer mid-send, a blank composer with no session — so the user learns
 * why before letting go rather than after.
 * @module @crosery/dsh-drop/client/overlay
 */
/** What the overlay shows for the composer under the pointer. */
export interface OverlayState {
    /** The composer refuses the drop; `noSession` says why. */
    blocked: boolean;
    /** No session is open at all. */
    noSession: boolean;
    /** The composer's image limits, when it publishes them. */
    limits?: {
        readonly count: number;
        readonly size: string;
    } | undefined;
}
/** Show and hide handles over one overlay element. */
export interface Overlay {
    show(state: OverlayState): void;
    hide(): void;
    dispose(): void;
}
/**
 * Create the overlay controller.
 *
 * The element is built lazily and removed on hide, so a session that never
 * receives a drop carries no extra node. `show` is called on every dragover
 * and only touches the DOM when the state it shows changes.
 * @returns the controller; `dispose` removes any element still mounted.
 */
export declare function createOverlay(): Overlay;
