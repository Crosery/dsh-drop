/**
 * The admission gates in front of both Host routes, over real node:http.
 *
 * From 0.1.2 the harness authenticates each Web route it is asked to
 * (`connection.requestRejection`); the routes must put every request through
 * that check before doing anything, refuse while the check is unavailable,
 * and still refuse cross-site callers on trains without one. The resolve
 * route used to have no gate at all.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { mkdtemp, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { Context, Service } from '@deepseek-ai/cordis'
import { NAME_HEADER, type StageErr } from '../src/contract.ts'
import { stageHandler } from '../src/stage-route.ts'
import { resolveHandler } from '../src/resolve-route.ts'
import { hostAdmission } from '../src/index.ts'

/** A Host admission check that admits only requests carrying the test cookie. */
const reject = (req: IncomingMessage): number | undefined =>
  req.headers.cookie === 'dsh-auth=ok' ? undefined : 401

describe('route admission', () => {
  let root: string
  let file: string
  let server: Server
  let origin: string

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-drop-auth-'))
    file = join(root, 'real.md')
    await writeFile(file, 'hello')
    const stage = stageHandler({ root: () => join(root, 'drops'), maxBytes: () => 1024, reject })
    const resolve = resolveHandler({ reject })
    server = createServer((req, res) => {
      void (req.url === '/stage' ? stage(req, res) : resolve(req, res))
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(async () => {
    await new Promise<void>((done) => server.close(() => done()))
  })

  const claim = async () => {
    const entry = await stat(file)
    return JSON.stringify({ path: file, size: entry.size, lastModified: entry.mtimeMs })
  }

  it('refuses an unauthenticated upload before writing anything', async () => {
    const response = await fetch(`${origin}/stage`, {
      method: 'POST', headers: { [NAME_HEADER]: 'x.txt' }, body: 'bytes',
    })
    assert.equal(response.status, 401)
    assert.equal(((await response.json()) as StageErr).error, 'unauthorized')
    await assert.rejects(readdir(join(root, 'drops')), 'no staging directory was even created')
  })

  it('refuses an unauthenticated resolve before stat-ing the path', async () => {
    const response = await fetch(`${origin}/resolve`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: await claim(),
    })
    assert.equal(response.status, 401)
  })

  it('refuses unauthenticated callers regardless of method', async () => {
    assert.equal((await fetch(`${origin}/resolve`)).status, 401)
    assert.equal((await fetch(`${origin}/stage`)).status, 401)
  })

  it('admits authenticated requests on both routes', async () => {
    const staged = await fetch(`${origin}/stage`, {
      method: 'POST', headers: { [NAME_HEADER]: 'x.txt', cookie: 'dsh-auth=ok' }, body: 'bytes',
    })
    assert.equal(staged.status, 200)
    const resolved = await fetch(`${origin}/resolve`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: 'dsh-auth=ok' }, body: await claim(),
    })
    assert.equal(resolved.status, 200)
  })

  it('refuses a cross-site resolve even when authenticated', async () => {
    const response = await fetch(`${origin}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'dsh-auth=ok', 'sec-fetch-site': 'cross-site' },
      body: await claim(),
    })
    assert.equal(response.status, 403)
  })

  it('refuses a resolve not declared as JSON, which a form post could send', async () => {
    const response = await fetch(`${origin}/resolve`, {
      method: 'POST', headers: { 'content-type': 'text/plain', cookie: 'dsh-auth=ok' }, body: await claim(),
    })
    assert.equal(response.status, 403)
  })

  it('treats a throwing admission check as a refusal', async () => {
    const guarded = resolveHandler({ reject: () => { throw new Error('boom') } })
    const local = createServer((req, res) => { void guarded(req, res) })
    await new Promise<void>((done) => local.listen(0, '127.0.0.1', done))
    try {
      const port = (local.address() as AddressInfo).port
      assert.equal((await fetch(`http://127.0.0.1:${port}/resolve`)).status, 403)
    } finally {
      await new Promise<void>((done) => local.close(() => done()))
    }
  })
})

describe('hostAdmission', () => {
  const request = { headers: {} } as IncomingMessage

  it('refuses while no connection service is up, on every train', () => {
    assert.equal(hostAdmission({ get: () => undefined })(request), 503)
    assert.equal(hostAdmission({ get: () => null })(request), 503)
  })

  it('admits where the connection service has no login check (0.1.0–0.1.1)', () => {
    assert.equal(hostAdmission({ get: () => ({}) })(request), undefined)
  })

  it('asks the connection service per request (0.1.2 onward)', () => {
    let asked = 0
    const connection = { requestRejection: () => { asked += 1; return 401 as const } }
    const check = hostAdmission({ get: (name: string) => (name === 'connection' ? connection : undefined) })
    assert.equal(check(request), 401)
    assert.equal(check(request), 401)
    assert.equal(asked, 2, 'read at request time, never cached at activation')
  })
})

/**
 * The connection service as a real Cordis plugin provides it. From 0.1.2 its
 * `apply` awaits the browser-auth store before providing, so the service is
 * absent for a while after the Web server is already up.
 */
class Connection extends Service {
  constructor(ctx: Context) {
    super(ctx, 'connection')
  }

  requestRejection(req: { headers: IncomingMessage['headers'] }): number | undefined {
    return req.headers.cookie === 'dsh-auth=ok' ? undefined : 401
  }
}

/** The 0.1.0–0.1.1 service: the same transport, no login check. */
class LegacyConnection extends Service {
  constructor(ctx: Context) {
    super(ctx, 'connection')
  }
}

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 10))

describe('hostAdmission over the connection lifecycle', () => {
  const anonymous = { headers: {} } as IncomingMessage
  const signedIn = { headers: { cookie: 'dsh-auth=ok' } } as IncomingMessage

  it('never admits an anonymous caller while the 0.1.2+ service starts, runs, restarts or is gone', async () => {
    const root = new Context()
    const check = hostAdmission(root)
    assert.equal(check(anonymous), 503, 'not in the composition yet')

    let open!: () => void
    const gate = new Promise<void>((done) => { open = done })
    const plugin = {
      name: 'client-connection',
      async apply(ctx: Context) {
        await gate
        new Connection(ctx)
      },
    }
    const fiber = root.plugin(plugin)
    await settle()
    assert.equal(check(anonymous), 503, 'apply pending')
    assert.equal(check(signedIn), 503, 'nothing to authenticate against yet')

    open()
    await settle()
    assert.equal(check(anonymous), 401, 'active: the login check answers')
    assert.equal(check(signedIn), undefined)

    await fiber.dispose()
    assert.equal(check(anonymous), 503, 'disposed, as during a restart on a config edit')
  })

  it('keeps 0.1.0–0.1.1 working: their service is up with the Web server and has no check', async () => {
    const root = new Context()
    const check = hostAdmission(root)
    root.plugin({ name: 'client-connection', apply: (ctx: Context) => { new LegacyConnection(ctx) } })
    await settle()
    assert.equal(check(anonymous), undefined)
  })

  it('answers 503 on the wire and writes nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-drop-auth-down-'))
    const check = hostAdmission({ get: () => undefined })
    const stage = stageHandler({ root: () => join(dir, 'drops'), maxBytes: () => 1024, reject: check })
    const local = createServer((req, res) => { void stage(req, res) })
    await new Promise<void>((done) => local.listen(0, '127.0.0.1', done))
    try {
      const port = (local.address() as AddressInfo).port
      const response = await fetch(`http://127.0.0.1:${port}/stage`, {
        method: 'POST', headers: { [NAME_HEADER]: 'x.txt', cookie: 'dsh-auth=ok' }, body: 'bytes',
      })
      assert.equal(response.status, 503)
      assert.equal(((await response.json()) as StageErr).error, 'unavailable')
      await assert.rejects(readdir(join(dir, 'drops')), 'no staging directory was even created')
    } finally {
      await new Promise<void>((done) => local.close(() => done()))
    }
  })
})
