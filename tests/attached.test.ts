/**
 * Staging files outside the draft, and the text that carries them out.
 *
 * This is the half of the design that replaced draft-resident references: the
 * list lives here, the composer's text stays the user's own, and the paths are
 * spliced in only as the message is sent.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AttachedFiles, composeSubmission } from '../src/client/attached.ts'

describe('AttachedFiles', () => {
  it('keeps each session\'s list separate', () => {
    // Drafts are per session, so attachments have to be: sending in one
    // session must not empty another's.
    const files = new AttachedFiles()
    files.add('a', '/tmp/one.md')
    files.add('b', '/tmp/two.pdf')
    assert.deepEqual(files.list('a').map((f) => f.path), ['/tmp/one.md'])
    assert.deepEqual(files.list('b').map((f) => f.path), ['/tmp/two.pdf'])
  })

  it('preserves attachment order', () => {
    const files = new AttachedFiles()
    for (const path of ['/a', '/b', '/c']) files.add('s', path)
    assert.deepEqual(files.list('s').map((f) => f.path), ['/a', '/b', '/c'])
  })

  it('stages one path once per session', () => {
    // Dropping the same file twice used to make two cards and two mentions of
    // one path; the second drop now answers the existing entry.
    const files = new AttachedFiles()
    const first = files.add('s', '/same.md')
    const second = files.add('s', '/same.md')
    assert.equal(second, first)
    assert.equal(files.list('s').length, 1)
    files.add('t', '/same.md')
    assert.equal(files.list('t').length, 1, 'another session stages it separately')
  })

  it('removes one entry by id and leaves the others', () => {
    const files = new AttachedFiles()
    const first = files.add('s', '/one.md')
    const second = files.add('s', '/two.md')
    files.remove('s', first.id)
    assert.deepEqual(files.list('s').map((f) => f.id), [second.id])
  })

  it('holds a pending entry until its path arrives, then dedupes by path', () => {
    const files = new AttachedFiles()
    const ready = files.add('s', '/a/report.pdf')
    const pending = files.add('s', { kind: 'file', status: 'pending', name: 'report.pdf', size: 3 })
    assert.equal(pending.status, 'pending')
    assert.equal(pending.path, undefined)
    assert.equal(files.list('s').length, 2, 'a pending entry is never merged: it has no path yet')
    const settled = files.update('s', pending.id, { status: 'ready', path: '/a/report.pdf', how: 'in-place' })
    assert.equal(settled, ready, 'becoming ready onto a staged path folds into the existing entry')
    assert.deepEqual(files.list('s').map((f) => f.id), [ready.id])
  })

  it('updates a pending entry in place when its path is new', () => {
    const files = new AttachedFiles()
    const pending = files.add('s', { kind: 'file', status: 'pending', name: 'notes.md' })
    const settled = files.update('s', pending.id, { status: 'ready', path: '/drops/notes.md', how: 'copied' })
    assert.equal(settled?.id, pending.id)
    assert.equal(settled?.key, pending.key, 'the preview key survives the update')
    assert.deepEqual(files.withStatus('s', 'ready').map((f) => f.path), ['/drops/notes.md'])
    assert.equal(files.update('s', 999, { status: 'ready' }), undefined)
  })

  it('clears only the entries a send carried out', () => {
    // A file dropped while the send was being judged must survive the clear.
    const files = new AttachedFiles()
    const sent = files.add('s', '/sent.md')
    const late = files.add('s', { kind: 'file', status: 'pending', name: 'late.md' })
    files.clear('s', [sent.id])
    assert.deepEqual(files.list('s').map((f) => f.id), [late.id])
  })

  it('reports every entry that leaves, once, so its preview can be released', () => {
    const released: string[] = []
    const files = new AttachedFiles((entry) => { released.push(entry.key) })
    const a = files.add('s', '/a')
    const b = files.add('s', '/b')
    const c = files.add('s', '/c')
    files.remove('s', a.id)
    files.clear('s', [b.id])
    files.clear('s')
    files.clear('s')
    assert.deepEqual(released, [a.key, b.key, c.key])
  })

  it('clears one session on send without touching another', () => {
    const files = new AttachedFiles()
    files.add('a', '/one')
    files.add('b', '/two')
    files.clear('a')
    assert.deepEqual(files.list('a'), [])
    assert.equal(files.list('b').length, 1)
  })

  it('returns a reference-stable snapshot between mutations', () => {
    // useSyncExternalStore compares snapshots by identity and loops forever if
    // a fresh array comes back on every read.
    const files = new AttachedFiles()
    assert.equal(files.list('s'), files.list('s'))
    files.add('s', '/one')
    const snapshot = files.list('s')
    assert.equal(files.list('s'), snapshot)
    files.add('s', '/two')
    assert.notEqual(files.list('s'), snapshot)
  })

  it('notifies subscribers on every real mutation and no others', () => {
    const files = new AttachedFiles()
    let beats = 0
    const off = files.subscribe(() => { beats += 1 })
    files.add('s', '/one')
    assert.equal(beats, 1)
    files.remove('s', 999)
    assert.equal(beats, 1, 'removing an unknown id is not a change')
    files.clear('empty')
    assert.equal(beats, 1, 'clearing an empty session is not a change')
    files.clear('s')
    assert.equal(beats, 2)
    off()
    files.add('s', '/two')
    assert.equal(beats, 2, 'unsubscribed')
  })
})

describe('composeSubmission', () => {
  it('leads with the typed words and trails the mentions', () => {
    // Order is chosen for the session title, taken from the head of the first
    // message: mentions first made every dropped-into session read as
    // `@/Users/…/drops/…` in the sidebar.
    assert.equal(
      composeSubmission('看看这个', ['@/tmp/a.md']),
      '看看这个\n\n@/tmp/a.md',
    )
  })

  it('sends the mentions alone when nothing was typed', () => {
    // The draft-resident design could not do this at all: the composer refuses
    // an empty draft, so a file with no words had nothing to ride on.
    assert.equal(composeSubmission('', ['@/tmp/a.md', '@/tmp/b.pdf']), '@/tmp/a.md\n@/tmp/b.pdf')
    assert.equal(composeSubmission('   ', ['@/tmp/a.md']), '@/tmp/a.md')
  })

  it('returns the draft untouched when nothing is staged', () => {
    assert.equal(composeSubmission('just text', []), 'just text')
    assert.equal(composeSubmission('', []), '')
  })

  it('keeps the typed text verbatim apart from its outer whitespace', () => {
    assert.equal(
      composeSubmission('  line one\nline two  ', ['@/a']),
      'line one\nline two\n\n@/a',
    )
  })
})
