/**
 * A last-resort notice, for when no composer can show one.
 *
 * Every notice this plugin raises goes through the target session's composer
 * (`SessionInput.notify`) when there is one. A drop onto a page with no
 * session open has no composer to speak through, and a silent refusal reads
 * as a broken drop — so the message is shown here instead, as a small status
 * line at the bottom of the viewport.
 * @module @crosery/dsh-drop/client/toast
 */
/** Show and dispose handles over the toast. */
export interface Toast {
    show(text: string): void;
    dispose(): void;
}
/**
 * Create the toast controller.
 * @returns the controller; `dispose` removes any notice still shown.
 */
export declare function createToast(): Toast;
