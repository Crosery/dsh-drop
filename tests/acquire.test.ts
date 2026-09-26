/**
 * The acquisition ladder: the desktop bridge's path first, a verified drag
 * hint second, a copy last — and each request document-relative, because the
 * desktop app serves the page from `dsh-app://app/` and forwards the rest.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { acquire, bridgePath, hintFor, hostPathBridge, type Fetcher } from '../src/client/acquire.ts'
import { NAME_HEADER } from '../src/contract.ts'

const file = { name: 'spec.pdf', size: 42, lastModified: 1_700_000_000_000 }
const signal = new AbortController().signal

/** A fetch double that records calls and answers per URL. */
function recorder(answers: Record<string, () => Response>): { http: Fetcher, calls: { url: string, init: RequestInit }[] } {
  const calls: { url: string, init: RequestInit }[] = []
  return {
    calls,
    http: async (url, init) => {
      calls.push({ url, init })
      const answer = answers[url]
      if (answer === undefined) throw new Error(`unexpected request to ${url}`)
      return answer()
    },
  }
}

const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status })

describe('hostPathBridge and bridgePath', () => {
  it('finds the desktop bridge only when it has pathFor', () => {
    const bridge = { pathFor: () => '/a' }
    assert.equal(hostPathBridge({ __DSH_HOST_PATHS__: bridge }), bridge)
    assert.equal(hostPathBridge({ __DSH_HOST_PATHS__: {} }), undefined)
    assert.equal(hostPathBridge({}), undefined)
  })

  it('reads an empty answer, a throw, or no bridge as no path', () => {
    assert.equal(bridgePath(file, { pathFor: () => '/Users/a/spec.pdf' }), '/Users/a/spec.pdf')
    assert.equal(bridgePath(file, { pathFor: () => '' }), undefined, 'not backed by disk')
    assert.equal(bridgePath(file, { pathFor: () => { throw new TypeError('not a File') } }), undefined)
    assert.equal(bridgePath(file, undefined), undefined)
  })
})

describe('acquire', () => {
  it('references a bridged path in place without any request', async () => {
    const { http, calls } = recorder({})
    assert.deepEqual(await acquire(file, '/Users/a/spec.pdf', [], signal, http), { path: '/Users/a/spec.pdf', how: 'in-place' })
    assert.equal(calls.length, 0, 'nothing is uploaded or checked: the app vouches for the path')
  })

  it('copies a bridged path that cannot be written as a mention', async () => {
    const { http, calls } = recorder({ 'crosery/dsh-drop/stage': json(200, { path: '/home/.dsh/drops/d/spec.pdf' }) })
    const result = await acquire(file, '/Users/a/say "hi"/spec.pdf', [], signal, http)
    assert.deepEqual(result, { path: '/home/.dsh/drops/d/spec.pdf', how: 'copied' })
    assert.equal(calls.length, 1)
  })

  it('confirms a drag hint with the Host before referencing it, document-relative', async () => {
    const { http, calls } = recorder({ 'crosery/dsh-drop/resolve': json(200, { path: '/Users/a/spec.pdf' }) })
    const result = await acquire(file, undefined, ['/Users/a/other.md', '/Users/a/spec.pdf'], signal, http)
    assert.deepEqual(result, { path: '/Users/a/spec.pdf', how: 'in-place' })
    assert.equal(calls[0]?.url, 'crosery/dsh-drop/resolve')
    assert.equal(new Headers(calls[0]?.init.headers).get('content-type'), 'application/json')
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { path: '/Users/a/spec.pdf', size: 42, lastModified: file.lastModified })
  })

  it('copies when the hint does not match', async () => {
    const { http, calls } = recorder({
      'crosery/dsh-drop/resolve': json(404, { error: 'no-match' }),
      'crosery/dsh-drop/stage': json(200, { path: '/drops/spec.pdf' }),
    })
    assert.deepEqual(await acquire(file, undefined, ['/Users/a/spec.pdf'], signal, http), { path: '/drops/spec.pdf', how: 'copied' })
    assert.deepEqual(calls.map((call) => call.url), ['crosery/dsh-drop/resolve', 'crosery/dsh-drop/stage'])
    assert.equal(new Headers(calls[1]?.init.headers).get(NAME_HEADER), 'spec.pdf')
  })

  it('fails loudly when the copy is refused', async () => {
    const { http } = recorder({ 'crosery/dsh-drop/stage': json(413, { error: 'too-large' }) })
    await assert.rejects(acquire(file, undefined, [], signal, http), /413/)
  })

  it('pairs hints by name, not by position', () => {
    assert.equal(hintFor({ name: 'b.md' }, ['/x/a.md', '/x/b.md']), '/x/b.md')
    assert.equal(hintFor({ name: 'c.md' }, ['/x/a.md']), undefined)
  })
})
