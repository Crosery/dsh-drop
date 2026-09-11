/**
 * The composer's attachment rail: everything staged for the next message, in
 * one strip.
 *
 * This entry takes the seat the shipped attachment plugin occupies
 * (`conversation.input.attachments`), which is a `single` slot — so taking it
 * is a replacement, not an addition. That is deliberate. As two separate
 * strips, a dropped PNG and a dropped MP4 read as two unrelated features, when
 * to the user they are one act: these are the files I am sending. Occupying
 * the seat is the only way they share a row, because the seat admits exactly
 * one occupant.
 *
 * The replacement costs no capability: draft images arrive as owner props
 * (`attachments`, each carrying its own `previewUrl`), so this entry renders
 * them from data rather than by importing the shipped component — which the
 * client bundle-purity contract forbids anyway.
 *
 * The two halves keep their different natures underneath. An image is a draft
 * attachment the Host encodes into the request; a file is a path this plugin
 * holds beside the draft and splices into the message at send time. Neither
 * puts a character in the composer — which is the whole point — so they are
 * removed through different machinery but read as one list.
 * @module @crosery/dsh-drop/client/DropRail
 */
import type { ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AttachedFile } from './attached.ts';
import { DROP_NS } from './locales.ts';
import type { DropAsset } from './preview-store.ts';
/** Business face this plugin injects into the rail. */
export interface DropRailInjected {
    /**
     * The framework-resolved session this occurrence belongs to.
     *
     * Bound by the registration's `inject` factory rather than read off the
     * standard kit: 0.1.2 stopped merging `sessionId` into the props of
     * session-maybe slots and hands it to the factory instead.
     */
    sessionId: string | undefined;
    /** Preview material for one path; absent when this page never held the bytes. */
    assetOf: (path: string) => DropAsset | undefined;
    /** Decode one text file's head, cached per path. */
    textOf: (path: string) => Promise<string | undefined>;
    /**
     * Publish the seat's image intake to the plugin's document-level drag
     * handling.
     *
     * Taking this seat takes the shipped entry's document listeners down with
     * it, so this plugin becomes the only thing receiving image drops — and
     * `onAddImages`, the composer's own validated intake path, reaches only into
     * this component. The rail hands it outward for the drop pipeline to call.
     */
    bindImageIntake: (intake: ((files: readonly File[]) => void) | undefined) => void;
    /**
     * Publish this session's composer verbs to the submit guard.
     *
     * The guard runs on document-level listeners and needs the draft, the write
     * path and the submit trigger — all of which arrive as props here and
     * nowhere else.
     */
    bindComposer: (handle: ComposerBinding | undefined) => void;
    /**
     * Files staged for this session.
     *
     * A `hooks` compartment rather than a plain array: the inject factory runs
     * once per entry materialization, so a value would freeze at whatever was
     * staged that instant. The framework binds this source into a `useAttached`
     * selector hook, and the rail follows every drop and removal.
     */
    hooks: {
        attached: {
            getSnapshot: () => readonly AttachedFile[];
            subscribe: (fn: () => void) => () => void;
        };
    };
    /** Unstage one file. */
    detach: (id: number) => void;
}
/** What the rail publishes for the submit guard to drive. */
export interface ComposerBinding {
    sessionId: string;
    draft: () => string;
    setDraft: (text: string) => void;
    submit: () => void;
    ready: () => boolean;
}
/**
 * One draft attachment, as the seat hands it over.
 *
 * Restated structurally rather than imported from the conversation package:
 * 0.1.2 widened this union with a file member that carries no `previewUrl`, and
 * naming one train's type would pin the component to that train.
 */
export interface SeatAttachment {
    /** Draft identity, for the owner's remove verb. */
    id: string;
    /** The browser `File` behind the draft. */
    file: {
        name: string;
        size: number;
    };
    /** Object URL for drafts that have pixels; absent for generic files. */
    previewUrl?: string | undefined;
}
/**
 * The seat's owner share plus the two session-kit members this rail reads.
 *
 * Restated rather than imported, because the seat's prop names moved in 0.1.2:
 * `onAddImages` → `onAddFiles` and `onRemoveImage` → `onRemoveAttachment`, and
 * draft attachments grew a file member with no `previewUrl`. Both name pairs are
 * optional here and the rail calls whichever pair the running harness supplies —
 * one registration, either train.
 */
export interface SeatProps {
    /** Browser-owned draft attachments in input order. */
    attachments: readonly SeatAttachment[];
    /** Add one dropped batch through the composer's validation path (≤0.1.1 name). */
    onAddImages?: ((files: readonly File[]) => void) | undefined;
    /** Add one dropped batch through the composer's validation path (≥0.1.2 name). */
    onAddFiles?: ((files: readonly File[]) => void) | undefined;
    /**
     * Remove one draft attachment through the service (≤0.1.1 name).
     *
     * Method shorthand is load-bearing: the id is branded by the conversation
     * package (`DraftAttachmentId`), and the brand's symbol is not importable
     * without naming one train — a method signature is checked bivariantly, so
     * the owner's branded parameter still satisfies this plain-string one.
     */
    onRemoveImage?(id: string): void;
    /** Remove one draft attachment through the service (≥0.1.2 name). */
    onRemoveAttachment?(id: string): void;
}
/**
 * Full rail props: the seat's share, this plugin's injected face, and the
 * locale seat.
 *
 * The seat's runtime share keeps everything this rail does not restate — the
 * session kit (`useInput`, `inputActions`) and the `useAttached` hook the
 * framework synthesizes from the injected `hooks` compartment.
 */
export type DropRailProps = Omit<PropsRuntime<'conversation.input.attachments'>, keyof SeatProps> & SeatProps & InjectFace<DropRailInjected> & PropsLocale<typeof DROP_NS>;
/**
 * The composer's attachment rail.
 *
 * Renders nothing while nothing is attached, the same posture the shipped
 * entry takes: an absent strip costs no layout inside the composer card.
 * @param props - attachment owner share, injected preview face, locale seat.
 * @returns the rail, or null when there is nothing to show.
 */
export declare function DropRail({ attachments, onAddImages, onAddFiles, onRemoveImage, onRemoveAttachment, useInput, inputActions, sessionId, assetOf, textOf, bindImageIntake, bindComposer, useAttached, detach, t, }: DropRailProps): ReactNode;
