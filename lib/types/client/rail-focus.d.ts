/**
 * Where keyboard focus goes when a card is removed.
 *
 * A card's remove control is inside the card, so removing the card removes
 * the focused element and the browser drops focus to `<body>`: a keyboard
 * user is thrown back to the top of the page. Focus moves instead to the
 * neighbouring card — the next one, else the previous one — or, when the
 * rail empties, back to the composer's input.
 *
 * The card leaves when its owner says so (the composer's store, or this
 * plugin's staged list), a render or more after the press. So the target is
 * planned at the press and settled after each render. DOM-free: the rail
 * hands in what it sees, so the decision is testable.
 * @module @crosery/dsh-drop/client/rail-focus
 */
/** A removal whose focus has yet to be placed. */
export interface PendingFocus {
    /** The removed card's key. */
    readonly removed: string;
    /** The card to focus instead; undefined when it was the only card. */
    readonly next: string | undefined;
}
/**
 * Plan focus for removing one card, before it goes.
 * @param keys - the cards' keys, in rail order.
 * @param removed - the key being removed.
 * @returns the pending placement.
 */
export declare function planRemovalFocus(keys: readonly string[], removed: string): PendingFocus;
/**
 * What to do with a pending placement once the rail has rendered.
 *
 * - `wait`: the card is still there; its owner has not removed it yet.
 * - `drop`: focus went somewhere on purpose in the meantime (or the removal
 *   was refused and focus moved on); leave it where it is.
 * - `{ card }`: focus that card's remove control.
 * - `composer`: the rail is empty (or the neighbour left too); focus the
 *   composer's input.
 * @param pending - the plan.
 * @param keys - the cards' keys now.
 * @param focus - where focus is now: lost to `<body>`, inside the rail, or elsewhere.
 * @returns the decision.
 */
export declare function settleRemovalFocus(pending: PendingFocus, keys: readonly string[], focus: 'lost' | 'rail' | 'elsewhere'): 'wait' | 'drop' | 'composer' | {
    card: string;
};
