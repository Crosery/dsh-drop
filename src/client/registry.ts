/**
 * Every mounted attachment rail, and which one a gesture belongs to.
 *
 * The page can hold more than one composer: the subagent sidebar embeds a
 * second conversation, with its own composer and its own attachment seat. A
 * single "the current rail" holder is taken by whichever rail mounted last
 * and emptied by whichever unmounts first, so a drop could land in the wrong
 * session or in none. Each rail registers here instead, by identity, and
 * leaves by identity.
 *
 * Kept free of the DOM: a rail answers `contains(target)` itself, so the
 * routing rules can be pinned by a test with plain objects.
 * @module @crosery/dsh-drop/client/registry
 */

/** What the registry needs from one mounted rail. */
export interface RailRecord {
  /** The session this rail's composer writes to; undefined on a blank composer. */
  readonly sessionId: string | undefined
  /** Whether an event target sits inside this rail's composer card. */
  contains(target: unknown): boolean
  /** Whether the composer takes a drop now (the seat's `canAcceptDrop`). */
  canAcceptDrop(): boolean
}

/** Where a gesture goes, and whether that composer refuses it. */
export interface RailRoute<R extends RailRecord> {
  readonly rail: R
  /** The composer is mounted but not accepting files right now. */
  readonly blocked: boolean
}

/** The mounted rails, in mount order. */
export class RailRegistry<R extends RailRecord> {
  private readonly rails: R[] = []
  private readonly listeners = new Set<() => void>()

  /**
   * Add one mounted rail.
   * @param rail - the rail; its identity is its registration.
   * @returns the disposer, which removes exactly this registration.
   */
  register(rail: R): () => void {
    this.rails.push(rail)
    this.changed()
    return () => {
      const at = this.rails.indexOf(rail)
      if (at < 0) return
      this.rails.splice(at, 1)
      this.changed()
    }
  }

  /** The rails, oldest first. */
  list(): readonly R[] {
    return this.rails
  }

  /**
   * The rail whose composer card contains a target.
   * @param target - an event target.
   * @returns the latest-mounted matching rail, or undefined.
   */
  at(target: unknown): R | undefined {
    for (let i = this.rails.length - 1; i >= 0; i -= 1) {
      const rail = this.rails[i]!
      if (rail.contains(target)) return rail
    }
    return undefined
  }

  /**
   * The rail a gesture outside every composer card belongs to.
   *
   * The latest-mounted rail with a session that accepts a drop. A subagent's
   * composer refuses drops, so this is the main conversation's composer in
   * practice; a blank composer has no session to hold references against.
   * @returns the rail, or undefined when none accepts.
   */
  primary(): R | undefined {
    for (let i = this.rails.length - 1; i >= 0; i -= 1) {
      const rail = this.rails[i]!
      if (rail.sessionId !== undefined && rail.canAcceptDrop()) return rail
    }
    return undefined
  }

  /**
   * Route one gesture.
   *
   * The composer under the pointer wins, accepting or not — a drop onto a
   * busy composer must say so rather than land in another one. Anywhere else
   * goes to the primary rail; with none accepting, to the latest rail at all,
   * marked blocked, so the user still hears why nothing happened.
   * @param target - the event target.
   * @returns the route, or undefined when no rail is mounted.
   */
  route(target: unknown): RailRoute<R> | undefined {
    const inside = this.at(target)
    if (inside !== undefined) return { rail: inside, blocked: !accepts(inside) }
    const primary = this.primary()
    if (primary !== undefined) return { rail: primary, blocked: false }
    const last = this.rails[this.rails.length - 1]
    return last === undefined ? undefined : { rail: last, blocked: true }
  }

  /**
   * The latest-mounted rail for one session.
   * @param sessionId - the session.
   * @returns the rail, or undefined.
   */
  forSession(sessionId: string): R | undefined {
    for (let i = this.rails.length - 1; i >= 0; i -= 1) {
      const rail = this.rails[i]!
      if (rail.sessionId === sessionId) return rail
    }
    return undefined
  }

  /**
   * Follow registrations.
   * @param listener - called after every register and unregister.
   * @returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private changed(): void {
    for (const listener of this.listeners) listener()
  }
}

/** A rail accepts a gesture only with a session to hold it and an open seat. */
function accepts(rail: RailRecord): boolean {
  return rail.sessionId !== undefined && rail.canAcceptDrop()
}
