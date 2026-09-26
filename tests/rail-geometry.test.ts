/**
 * The rail's overflow arrows: what they are computed from, and when.
 *
 * The arrow that says "more cards this way" went missing when a card grew
 * after it mounted: a folder card widens once its file count arrives, the
 * rail's own box stays the same size, the card count stays the same, and
 * nothing scrolls — so nothing re-measured.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { overflowEdges, watchRail, type RailObservers } from '../src/client/rail-geometry.ts'

describe('overflowEdges', () => {
  it('reads a rail that fits exactly as having no hidden content', () => {
    assert.deepEqual(overflowEdges(0, 688, 688), { start: false, end: false })
  })

  it('shows the end arrow once content is wider than the rail', () => {
    assert.deepEqual(overflowEdges(0, 735, 688), { start: false, end: true })
  })

  it('shows the start arrow once scrolled, and tolerates a sub-pixel short end', () => {
    assert.deepEqual(overflowEdges(47, 735, 688), { start: true, end: false })
    assert.deepEqual(overflowEdges(46.5, 735, 688), { start: true, end: false })
  })
})

/** A node the observers can be told about. */
interface FakeNode {
  readonly nodeType: number
  readonly name: string
}

/** Observer doubles that let the test fire what the browser would. */
function observers() {
  const resized = new Set<FakeNode>()
  let onResize: (() => void) | undefined
  let onMutation: ((records: { addedNodes: FakeNode[], removedNodes: FakeNode[] }[]) => void) | undefined
  let disconnected = 0
  class Resize {
    constructor(callback: () => void) { onResize = callback }
    observe(node: FakeNode) { resized.add(node) }
    unobserve(node: FakeNode) { resized.delete(node) }
    disconnect() { resized.clear(); disconnected += 1 }
  }
  class Mutation {
    constructor(callback: typeof onMutation) { onMutation = callback }
    observe() {}
    disconnect() { disconnected += 1 }
  }
  return {
    classes: { ResizeObserver: Resize, MutationObserver: Mutation } as unknown as RailObservers,
    resized,
    /** The browser reports a size change of an observed box. */
    resize: (node: FakeNode) => { if (resized.has(node)) onResize?.() },
    mutate: (added: FakeNode[], removed: FakeNode[] = []) => { onMutation?.([{ addedNodes: added, removedNodes: removed }]) },
    disconnected: () => disconnected,
  }
}

/** A rail element with cards, as far as the watcher reads it. */
function rail(cards: FakeNode[]) {
  const listeners = new Map<string, () => void>()
  const element = {
    children: cards,
    addEventListener: (type: string, fn: () => void) => { listeners.set(type, fn) },
    removeEventListener: (type: string, fn: () => void) => { if (listeners.get(type) === fn) listeners.delete(type) },
  }
  return { element: element as unknown as HTMLElement, listeners }
}

const card = (name: string): FakeNode => ({ nodeType: 1, name })

describe('watchRail', () => {
  it('re-measures when a card grows, though the rail and the card count stay put', () => {
    const cards = [card('a'), card('b'), card('folder')]
    const { element } = rail(cards)
    const fake = observers()
    let measured = 0
    const stop = watchRail(element, () => { measured += 1 }, fake.classes)
    fake.resize(cards[2]!)
    assert.equal(measured, 1, 'the folder card widening re-measures')
    stop()
  })

  it('watches a card added later, and stops watching one removed', () => {
    const { element } = rail([card('a')])
    const fake = observers()
    let measured = 0
    const stop = watchRail(element, () => { measured += 1 }, fake.classes)
    const later = card('later')
    fake.mutate([later, { nodeType: 3, name: 'text' }])
    assert.equal(measured, 1, 'a card coming re-measures')
    assert.ok(fake.resized.has(later))
    assert.equal([...fake.resized].some((node) => node.nodeType === 3), false, 'only elements are observed')
    fake.resize(later)
    assert.equal(measured, 2)
    fake.mutate([], [later])
    assert.equal(fake.resized.has(later), false)
    stop()
  })

  it('re-measures on scroll and lets everything go on dispose', () => {
    const { element, listeners } = rail([card('a')])
    const fake = observers()
    let measured = 0
    const stop = watchRail(element, () => { measured += 1 }, fake.classes)
    listeners.get('scroll')?.()
    assert.equal(measured, 1)
    stop()
    assert.equal(listeners.size, 0)
    assert.equal(fake.disconnected(), 2)
  })

  it('still re-measures on scroll where the page has no observers', () => {
    const { element, listeners } = rail([card('a')])
    let measured = 0
    const stop = watchRail(element, () => { measured += 1 }, {})
    listeners.get('scroll')?.()
    assert.equal(measured, 1)
    stop()
  })
})
