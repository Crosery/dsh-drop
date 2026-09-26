/**
 * Which composer a gesture belongs to, with more than one on the page.
 *
 * The subagent sidebar mounts a second composer with its own attachment seat.
 * These cases pin that a drop lands in the composer under the pointer, that a
 * drop anywhere else lands in the composer that accepts files, and that one
 * composer unmounting never takes another's registration with it.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RailRegistry, type RailRecord } from '../src/client/registry.ts'

/** A rail whose card "contains" exactly the targets listed. */
function rail(sessionId: string | undefined, targets: unknown[], accepts = true): RailRecord & { name: string } {
  return {
    name: `${sessionId ?? 'blank'}:${String(accepts)}`,
    sessionId,
    contains: (target) => targets.includes(target),
    canAcceptDrop: () => accepts,
  }
}

describe('RailRegistry', () => {
  it('routes to the composer whose card contains the target', () => {
    const registry = new RailRegistry()
    const main = rail('main', ['main-card'])
    const side = rail('sub', ['side-card'])
    registry.register(main)
    registry.register(side)
    assert.equal(registry.route('main-card')?.rail, main)
    assert.equal(registry.route('side-card')?.rail, side)
  })

  it('marks a refusing composer under the pointer as blocked rather than rerouting', () => {
    // A subagent's composer refuses drops; landing the file in the main
    // composer instead would put it in a session the user did not aim at.
    const registry = new RailRegistry()
    registry.register(rail('main', ['main-card']))
    const side = rail('sub', ['side-card'], false)
    registry.register(side)
    assert.deepEqual(registry.route('side-card'), { rail: side, blocked: true })
  })

  it('sends a drop outside every card to the accepting composer', () => {
    const registry = new RailRegistry()
    const main = rail('main', ['main-card'])
    registry.register(main)
    registry.register(rail('sub', ['side-card'], false))
    assert.deepEqual(registry.route('page-body'), { rail: main, blocked: false })
  })

  it('reports a blank composer as blocked: there is no session to hold files', () => {
    const registry = new RailRegistry()
    const hero = rail(undefined, ['hero-card'])
    registry.register(hero)
    assert.deepEqual(registry.route('hero-card'), { rail: hero, blocked: true })
    assert.deepEqual(registry.route('page-body'), { rail: hero, blocked: true })
    assert.equal(registry.primary(), undefined)
  })

  it('answers nothing with no composer mounted', () => {
    assert.equal(new RailRegistry().route('anything'), undefined)
  })

  it('unregisters by identity, leaving another rail of the same session', () => {
    const registry = new RailRegistry()
    const first = rail('s', ['a'])
    const second = rail('s', ['b'])
    const offFirst = registry.register(first)
    registry.register(second)
    offFirst()
    offFirst()
    assert.deepEqual(registry.list(), [second])
    assert.equal(registry.forSession('s'), second)
    assert.equal(registry.route('b')?.rail, second)
  })

  it('prefers the latest mount among accepting composers and notifies on change', () => {
    const registry = new RailRegistry()
    let beats = 0
    const off = registry.subscribe(() => { beats += 1 })
    const older = rail('a', [])
    const newer = rail('b', [])
    registry.register(older)
    const offNewer = registry.register(newer)
    assert.equal(registry.primary(), newer)
    offNewer()
    assert.equal(registry.primary(), older)
    assert.equal(beats, 3)
    off()
  })
})
