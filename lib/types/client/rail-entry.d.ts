/**
 * Registering the attachment rail.
 *
 * Split from the client entry so the entry keeps one job — translating a
 * `DataTransfer` into acquired paths — and so the slot registration, the only
 * part with a hard dependency on the UI services, sits behind its own nested
 * inject.
 *
 * The rail takes `conversation.input.attachments`, the seat the shipped
 * attachment plugin occupies. That seat is `single`, so this is a replacement:
 * at `priority: -1` this entry shadows the shipped one (lowest renders), and
 * the shipped entry comes back by itself if this plugin unloads. Replacing
 * rather than adding is the point — images and files belong in one strip, and
 * a single seat is the only place they can share.
 *
 * Two duties come with the seat. The rail renders the composer's drafts from
 * the owner props, and the shipped entry's document-level drop handling goes
 * away with it, so the drop pipeline feeds images back through the seat's own
 * intake. Each mounted rail registers with the {@link RailRegistry} for that.
 *
 * The trains before 0.1.0-rc.8 have no such seat. There the rail takes a row
 * in `conversation.input.dock` above the composer card instead (`DockRail`),
 * and which of the two renders is decided by the declarations themselves
 * (`rail-seats.ts`), so a page never shows two.
 * @module @crosery/dsh-drop/client/rail-entry
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { AttachedFiles } from './attached.ts';
import { type RailHandle, type SessionAccess } from './DropRail.tsx';
import type { DraftImages, ImageLimits, ImageRefusal } from './early-composer.ts';
import type { PreviewStore } from './preview-store.ts';
import type { RailRegistry } from './registry.ts';
/** What the rail registration is built from. */
export interface RailDeps {
    /** The preview material the rail reads. */
    store: PreviewStore;
    /** The staged references. */
    attached: AttachedFiles;
    /** Where each mounted rail registers. */
    registry: RailRegistry<RailHandle>;
    /** The session services the send path reads through. */
    access: SessionAccess;
    /** Called when a rail finds itself in a textarea composer (0.1.1 and earlier). */
    onLegacyComposer: () => void;
    /** The conversation service's draft images, for the dock rail's image intake. */
    images: DraftImages<File>;
    /** Say why dropped images were refused (dock rail only). */
    refuseImages: (sessionId: string, reason: ImageRefusal, limits: ImageLimits | undefined) => void;
}
/**
 * Mount the attachment rail for the plugin's lifetime.
 *
 * Nested inject rather than a top-level one: without `slots` or `locale` the
 * rail cannot render, but a hard requirement would turn a missing UI service
 * into a boot failure.
 * @param ctx - browser plugin context.
 * @param deps - the stores, the registry, and the session access.
 */
export declare function installPreviewRail(ctx: ClientContext, deps: RailDeps): void;
