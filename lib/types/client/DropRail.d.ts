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
 * The replacement costs no capability. The composer's own drafts arrive as
 * owner props — images with their preview URL, and from 0.1.3 generic file
 * drafts with their upload state — so this entry renders them from data,
 * shows upload progress and failures, and offers the composer's retry. The
 * shipped component itself is never imported; the bundle-purity contract
 * forbids that anyway.
 *
 * The two halves keep their different natures underneath. A draft belongs to
 * the composer and is removed through its verb; a staged reference is a path
 * this plugin holds beside the draft and appends at send time. Neither puts a
 * character in the text box — which is the whole point — so they are removed
 * through different machinery but read as one list.
 *
 * The rail also registers itself with the plugin, per mount: the drop, paste
 * and send listeners find the composer a gesture belongs to through that
 * registration, because the page can hold more than one composer.
 * @module @crosery/dsh-drop/client/DropRail
 */
import type { ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AttachedFile } from './attached.ts';
import { type ComposerFace, type ScopeLike } from './composer-face.ts';
import { DROP_NS } from './locales.ts';
import type { DropAsset } from './preview-store.ts';
import type { RailRecord } from './registry.ts';
/** The composer limits the seat publishes for its drop invitation. */
export interface DropLimits {
    readonly count: number;
    readonly size: string;
}
/** One mounted rail, as the drop, paste and send listeners reach it. */
export interface RailHandle extends RailRecord {
    /** The composer's image limits, when published. */
    dropLimits(): DropLimits | undefined;
    /**
     * Hand files to the composer's own validated intake, minus any the seat
     * already holds (same name, size and modification time).
     */
    addFiles(files: readonly File[]): void;
    /** The composer's send verbs; absent on a blank composer. */
    readonly composer: ComposerFace | undefined;
}
/** The per-session input facade, read structurally: notices and the live state. */
export interface SessionInputLike {
    notify?: ((level: 'info' | 'error', text: string) => void) | undefined;
    readonly state?: {
        getSnapshot?: (() => unknown) | undefined;
    } | undefined;
}
/** How the plugin reaches one session's input facade and scope. */
export interface SessionAccess {
    /** The session's input facade, for the live state and notices. */
    inputOf(sessionId: string): SessionInputLike | undefined;
    /** The session-scope context, for its scoped input events. */
    scopeOf(sessionId: string): ScopeLike | undefined;
}
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
    /** Preview material for one key; absent when this page never held the bytes. */
    assetOf: (key: string) => DropAsset | undefined;
    /** Record the bytes behind one composer draft, for its card and preview. */
    putAsset: (key: string, file: File) => void;
    /** Let one composer draft's preview material go. */
    releaseAsset: (key: string) => void;
    /** Decode one text file's head, cached per key. */
    textOf: (key: string) => Promise<string | undefined>;
    /** Register this mount with the plugin's listeners; returns the disposer. */
    register: (rail: RailHandle) => () => void;
    /** The session services the send path reads through. */
    access: SessionAccess;
    /** Report a textarea composer, where the reference-chip CSS still applies. */
    onLegacyComposer: () => void;
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
/**
 * One draft attachment, as the seat hands it over.
 *
 * Restated structurally rather than imported from the conversation package:
 * the union gained a `kind` and a file member with no `previewUrl` over the
 * trains, and naming one train's type would pin the component to that train.
 */
export interface SeatAttachment {
    /** Draft identity, for the owner's remove and retry verbs. */
    id: string;
    /** `image` or `file` from 0.1.2; absent on the image-only trains. */
    kind?: string | undefined;
    /** The browser `File` behind the draft. */
    file: File;
    /** Object URL for drafts that have pixels; absent for generic files. */
    previewUrl?: string | undefined;
}
/** One file draft's upload, as the seat reports it (0.1.3 onward). */
export type SeatUpload = {
    readonly status: 'uploading';
    readonly loaded: number;
    readonly total?: number | undefined;
} | {
    readonly status: 'ready';
} | {
    readonly status: 'error';
    readonly message: string;
};
/**
 * The seat's owner share plus the session-kit members this rail reads.
 *
 * Restated rather than imported, because the seat's props moved between
 * trains: `onAddImages` → `onAddFiles`, `onRemoveImage` →
 * `onRemoveAttachment`, and 0.1.3 added `uploads` / `onRetryFile` /
 * `dropLimits`. Every train-dependent member is optional and the rail calls
 * whichever the running harness supplies — one registration, every train.
 */
export interface SeatProps {
    /** Browser-owned draft attachments in input order. */
    attachments: readonly SeatAttachment[];
    /** Whether the composer takes a drop now; absent means it always does. */
    canAcceptDrop?: boolean | undefined;
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
    /** Upload state per file draft (0.1.3 onward). */
    uploads?: Readonly<Record<string, SeatUpload>> | undefined;
    /** Restart one failed file upload (0.1.3 onward). */
    onRetryFile?(id: string): void;
    /** Display-ready image limits for the drop invitation. */
    dropLimits?: DropLimits | undefined;
    /**
     * Session facts from the standard kit (0.1.2 onward), read for `running`
     * only: while a turn runs, the composer's primary control is Stop.
     */
    useSession?: (<S>(selector: (session: {
        running?: boolean;
    }) => S) => S | undefined) | undefined;
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
 * Renders only a hidden anchor while nothing is attached, the same posture the
 * shipped entry takes: an absent strip costs no layout inside the composer
 * card. The anchor is what places this mount inside its composer card, so the
 * listeners can tell which composer a gesture landed on.
 * @param props - attachment owner share, injected preview face, locale seat.
 * @returns the rail.
 */
export declare function DropRail(props: DropRailProps): ReactNode;
