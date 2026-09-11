/**
 * Preview-rail copy.
 *
 * Registered with `ctx.locale` rather than resolved from `document.lang` the
 * way `messages.ts` does it: composer notices take a rendered string, but a
 * slot entry declaring `locale:` receives the framework's `t` seat, which
 * follows a locale switch without a remount. The two dictionaries must carry
 * identical key sets — the locale service rejects a namespace whose locales
 * disagree.
 * @module @crosery/dsh-drop/client/locales
 */
/**
 * Namespace owning this plugin's copy.
 *
 * Scoped like every other name this package publishes: a bare `drop` would sit
 * in the same flat namespace table as the shipped dictionaries and collide
 * with the next plugin that has a drop surface.
 */
export declare const DROP_NS = "crosery.drop";
/** Dictionary key domain of this plugin's namespace. */
export type DropKey = 'rail.label' | 'kind.image' | 'kind.video' | 'kind.audio' | 'kind.pdf' | 'kind.document' | 'kind.text' | 'kind.archive' | 'kind.file' | 'action.remove' | 'action.open' | 'action.close' | 'action.openTab' | 'action.scrollLeft' | 'action.scrollRight' | 'state.noPreview' | 'state.reloaded' | 'state.binary' | 'media.noVideo' | 'media.noAudio';
/** Simplified Chinese copy. */
export declare const zh: Record<DropKey, string>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The preview rail's copy. */
        'crosery.drop': DropKey;
    }
}
/** English copy. */
export declare const en: Record<DropKey, string>;
