/**
 * The rail on the trains without an attachment seat.
 *
 * 0.0.1-rc.5 and 0.1.0-rc.2 through rc.7 (as released) declare no
 * `conversation.input.attachments`; their composer keeps its own image strip
 * inside the card. This entry puts the same rail in `conversation.input.dock`,
 * the row directly above the card, and gives it what the seat would have
 * handed over (see `early-composer.ts`): an image intake that feeds the
 * composer's own draft images, the composer's drop rule, and its limits for
 * the drop invitation. Draft images stay in the composer's strip, where the
 * composer renders them; this rail holds the staged references.
 *
 * The entry is registered wherever the dock exists, which is every train, and
 * renders nothing while some composer declares the seat (`rail-seats.ts`):
 * from 0.1.0-rc.8 the seat's rail is the one, and a dock rail beside it would
 * be the second.
 * @module @crosery/dsh-drop/client/DockRail
 */

import type { ReactNode } from 'react'
// Type-only, for the dock's SlotMap declaration and the standard-kit merges.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DropRail, type DropRailInjected, type DropRailProps, type SeatAttachment } from './DropRail.tsx'
import {
  acceptsDrop, addToDraft, draftImageIds, dropLimitsOf, imageLimitsOf, intakeImages,
  type DraftImages, type ImageLimits, type ImageRefusal,
} from './early-composer.ts'
import type { DROP_NS } from './locales.ts'

/** Business face this plugin injects into the dock entry. */
export interface DockRailInjected extends Omit<DropRailInjected, 'hooks'> {
  /** The conversation service's draft-image members. */
  images: DraftImages<File>
  /** Say why dropped images were refused, in the session's composer. */
  refuseImages: (sessionId: string, reason: ImageRefusal, limits: ImageLimits | undefined) => void
  hooks: DropRailInjected['hooks'] & {
    /** Whether some composer declares the attachment seat. */
    seated: {
      getSnapshot: () => boolean
      subscribe: (fn: () => void) => () => void
    }
  }
}

/**
 * The dock's owner share and the session-kit members this entry reads.
 *
 * Restated rather than taken from the SlotMap: the dock is typed from the
 * current train's packages, and the members that matter here are the early
 * trains' — `useProjection` is not in the current kit's type at all.
 */
interface DockShare {
  /** Session snapshot (owner share). */
  session?: unknown
  /** Input-state snapshot (owner share). */
  input?: unknown
  /** Session projection hook, for `imageLimits`. */
  useProjection?: ((key: string) => unknown) | undefined
  /** The session's input action face. */
  inputActions?: unknown
}

/** Full dock-entry props. */
export type DockRailProps =
  Omit<PropsRuntime<'conversation.input.dock'>, keyof DockShare>
  & DockShare
  & InjectFace<DockRailInjected>
  & PropsLocale<typeof DROP_NS>

/** The dock rail has no seat drafts to show: the composer draws its own. */
const NO_DRAFTS: readonly SeatAttachment[] = Object.freeze([])

/**
 * The dock entry: the rail, unless the attachment seat holds it.
 * @param props - dock share, injected face, locale seat.
 * @returns the rail, or nothing.
 */
export function DockRail(props: DockRailProps): ReactNode {
  const seated = props.useSeated((declared) => declared)
  return seated ? null : <EarlyRail {...props} />
}

/**
 * The rail over an early composer.
 * @param props - dock share, injected face, locale seat.
 * @returns the rail.
 */
function EarlyRail(props: DockRailProps): ReactNode {
  const { session, input, useProjection, inputActions, sessionId, images, refuseImages, access } = props
  const limits = imageLimitsOf(useProjection?.('imageLimits'))

  const onAddImages = (files: readonly File[]): void => {
    // The session's own store answers the draft as of this instant; the owner
    // share trails it by a render.
    const live = sessionId === undefined ? undefined : access.inputOf(sessionId)?.state?.getSnapshot?.()
    const result = intakeImages({
      limits,
      held: () => images.held(draftImageIds(live ?? input)).map((image) => image.file),
      create: (fresh) => images.create(fresh),
      add: (ids) => addToDraft(inputActions, ids),
      release: (created) => { images.release(created) },
    }, files)
    if ('refused' in result && sessionId !== undefined) refuseImages(sessionId, result.refused, limits)
  }

  // The session kit carries the same members in both scopes; only the seat's
  // and the dock's declared types differ, so the props cross as one shape.
  const rail = {
    ...props,
    placement: 'dock',
    attachments: NO_DRAFTS,
    canAcceptDrop: acceptsDrop(session, input),
    onAddImages,
    dropLimits: dropLimitsOf(limits),
  } as unknown as DropRailProps
  return <DropRail {...rail} />
}
