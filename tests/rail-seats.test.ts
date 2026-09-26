/**
 * One rail per composer on every train, whichever slots it declares and in
 * whatever order.
 *
 * The model below stands in for the slot service's declaration hook: a
 * callback registered for a slot runs when the slot is declared (at once if it
 * already is), and its disposer runs when the declaration goes. The trains
 * differ only in what they declare and when — the early ones never declare the
 * attachment seat, 0.1.0-rc.8 declares the dock before the seat, and a
 * composer bar that re-registers retracts and re-declares the seat.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DOCK_SLOT, SEAT_SLOT, SeatWatch, wireRailSeats, type SlotDeclarations } from '../src/client/rail-seats.ts'

type Key = typeof SEAT_SLOT | typeof DOCK_SLOT

/** The slot service's `inject`, over explicit declarations. */
class DeclarationModel implements SlotDeclarations {
  private readonly waiting = new Map<Key, (() => () => void)[]>()
  private readonly live = new Map<Key, (() => void)[]>()

  inject(key: Key, callback: () => () => void): () => void {
    const list = this.waiting.get(key) ?? []
    list.push(callback)
    this.waiting.set(key, list)
    if (this.live.has(key)) this.live.get(key)!.push(callback())
    return () => {}
  }

  declare(key: Key): void {
    assert.ok(!this.live.has(key), `${key} declared twice`)
    this.live.set(key, (this.waiting.get(key) ?? []).map((callback) => callback()))
  }

  retract(key: Key): void {
    for (const dispose of this.live.get(key) ?? []) dispose()
    this.live.delete(key)
  }
}

/** A plugin wired against the model, counting its live registrations. */
function wired(slots: DeclarationModel) {
  const watch = new SeatWatch()
  const registered = { seat: 0, dock: 0 }
  wireRailSeats(slots, watch, {
    seat: () => {
      registered.seat += 1
      return () => { registered.seat -= 1 }
    },
    dock: () => {
      registered.dock += 1
      return () => { registered.dock -= 1 }
    },
  })
  return {
    watch,
    registered,
    /** Rails a composer would draw: the seat's, plus the dock's while no seat is declared. */
    rails: () => registered.seat + (registered.dock > 0 && !watch.declared() ? 1 : 0),
  }
}

describe('SeatWatch', () => {
  it('counts declarations and retracts each exactly once', () => {
    const watch = new SeatWatch()
    let changes = 0
    watch.subscribe(() => { changes += 1 })
    assert.equal(watch.declared(), false)
    const first = watch.mark()
    const second = watch.mark()
    first()
    first()
    assert.equal(watch.declared(), true, 'an older disposer must not clear a newer declaration')
    second()
    assert.equal(watch.declared(), false)
    assert.equal(changes, 4)
  })

  it('stops notifying an unsubscribed listener', () => {
    const watch = new SeatWatch()
    let changes = 0
    const off = watch.subscribe(() => { changes += 1 })
    off()
    watch.mark()
    assert.equal(changes, 0)
  })
})

describe('wireRailSeats', () => {
  it('puts the rail in the dock on a train that never declares the seat (0.0.1-rc.5 – 0.1.0-rc.7)', () => {
    const slots = new DeclarationModel()
    const plugin = wired(slots)
    assert.equal(plugin.rails(), 0, 'nothing renders before the conversation declares its slots')
    slots.declare(DOCK_SLOT)
    assert.deepEqual(plugin.registered, { seat: 0, dock: 1 })
    assert.equal(plugin.watch.declared(), false)
    assert.equal(plugin.rails(), 1)
  })

  it('keeps the dock empty when the seat is declared after it (0.1.0-rc.8)', () => {
    const slots = new DeclarationModel()
    const plugin = wired(slots)
    slots.declare(DOCK_SLOT)
    assert.equal(plugin.rails(), 1)
    slots.declare(SEAT_SLOT)
    assert.deepEqual(plugin.registered, { seat: 1, dock: 1 })
    assert.equal(plugin.rails(), 1, 'the seat rail alone')
  })

  it('keeps the dock empty when the seat is declared first', () => {
    const slots = new DeclarationModel()
    const plugin = wired(slots)
    slots.declare(SEAT_SLOT)
    slots.declare(DOCK_SLOT)
    assert.equal(plugin.watch.declared(), true)
    assert.equal(plugin.rails(), 1)
  })

  it('reads slots declared before the plugin wired itself', () => {
    const slots = new DeclarationModel()
    slots.declare(SEAT_SLOT)
    slots.declare(DOCK_SLOT)
    const plugin = wired(slots)
    assert.deepEqual(plugin.registered, { seat: 1, dock: 1 })
    assert.equal(plugin.rails(), 1)
  })

  it('follows a composer bar that goes and comes back', () => {
    const slots = new DeclarationModel()
    const plugin = wired(slots)
    slots.declare(DOCK_SLOT)
    slots.declare(SEAT_SLOT)
    slots.retract(SEAT_SLOT)
    assert.deepEqual(plugin.registered, { seat: 0, dock: 1 })
    assert.equal(plugin.watch.declared(), false)
    assert.equal(plugin.rails(), 1, 'the dock takes over while no seat exists')
    slots.declare(SEAT_SLOT)
    assert.equal(plugin.rails(), 1)
    assert.equal(plugin.registered.seat, 1)
  })

  it('removes both registrations when their slots go', () => {
    const slots = new DeclarationModel()
    const plugin = wired(slots)
    slots.declare(DOCK_SLOT)
    slots.declare(SEAT_SLOT)
    slots.retract(SEAT_SLOT)
    slots.retract(DOCK_SLOT)
    assert.deepEqual(plugin.registered, { seat: 0, dock: 0 })
    assert.equal(plugin.rails(), 0)
  })
})
