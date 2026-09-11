/**
 * The drop invitation shown for file drags this plugin claims.
 *
 * Plain DOM rather than a slot component. The shipped overlay lives inside
 * `conversation.input.attachments` and says "drag images here", with a disabled
 * variant when the current route takes no images — copy that is wrong twice
 * over for a dropped `.md`, and actively misleading in the disabled case, since
 * this plugin accepts the drop the overlay is declining. Suppressing the
 * shipped overlay for these drags and drawing our own is the only way the two
 * stay in agreement, and one absolutely-positioned element needs no React.
 * @module @crosery/dsh-drop/client/overlay
 */
/** Show and hide handles over one overlay element. */
export interface Overlay {
    show(): void;
    hide(): void;
    dispose(): void;
}
/**
 * Create the overlay controller.
 *
 * The element is built lazily and removed on hide, so a session that never
 * receives a drop carries no extra node.
 * @returns the controller; `dispose` removes any element still mounted.
 */
export declare function createOverlay(): Overlay;
