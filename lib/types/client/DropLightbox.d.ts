/**
 * The expanded preview of one dropped file.
 *
 * Same layer, mask and dismissal shape as the shipped image lightbox, so
 * opening a dropped PDF feels like opening a dropped PNG. What differs is the
 * stage: an image renders as an image, a video and an audio file get native
 * transport controls, a PDF goes to the browser's own viewer, and a text file
 * renders as monospaced source. A format with no in-page renderer — Word,
 * Keynote, an archive — says so rather than showing a broken frame; the file
 * is still referenced in the draft either way, so the preview failing is not
 * the send failing.
 *
 * Focus is moved in on mount, cycled inside the dialog while it is open, and
 * restored to the opener on unmount. That last part matters because the opener
 * is a card in a horizontally scrolling rail: losing focus there would drop
 * the user back at the start of the page.
 * @module @crosery/dsh-drop/client/DropLightbox
 */
import type { ReactPortal } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { DropAsset } from './preview-store.ts';
import { DROP_NS } from './locales.ts';
/** Props of the expanded preview. */
export interface DropLightboxProps {
    /** Display name shown in the header and used as the dialog's accessible name. */
    name: string;
    /** The file's preview material; absent once a reload dropped the bytes. */
    asset: DropAsset | undefined;
    /** Decoded text for the `text` kind; undefined while loading or unavailable. */
    text: string | undefined;
    /** Dismissal (Escape, mask press, close control). */
    onClose: () => void;
    /** This plugin's namespace translator. */
    t: TranslateNS<typeof DROP_NS>;
}
/**
 * Show one dropped file at full size.
 * @param props - name, asset, decoded text, dismissal, translator.
 * @returns the dialog, portalled to the document body.
 */
export declare function DropLightbox({ name, asset, text, onClose, t }: DropLightboxProps): ReactPortal | null;
/**
 * Load one path's decoded text while a preview is open.
 *
 * A hook rather than an effect inside {@link DropLightbox} so the dialog stays
 * a pure function of its props: the caller owns the async read, and a preview
 * of a file that does not render as text never starts one.
 * @param path - the previewed path, or null when nothing text-shaped is open.
 * @param read - the store's decoder.
 * @returns the decoded text, or undefined while loading or unavailable.
 */
export declare function usePreviewText(path: string | null, read: (path: string) => Promise<string | undefined>): string | undefined;
