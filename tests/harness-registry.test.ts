/**
 * The CI scripts against registries that fail: none of npm's silences may
 * pass as a fact about a train. Each case points npm at a local stand-in —
 * a closed port, a server that answers 404 or 500, one that never answers,
 * or one that lists a single harness version — and runs the real scripts in
 * a child process (npm is driven synchronously, so the stand-in must keep
 * this process's event loop free). `harness-target.mjs` runs in a scratch
 * copy, so no case can rewrite this checkout's manifest.
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { run, upstreamGap } from '../scripts/harness-lib.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'dsh-drop-registry-'))
const userconfig = join(scratch, 'npmrc')
writeFileSync(userconfig, '')

/** A closed port: every request is refused at once. */
const CLOSED = 'http://127.0.0.1:9/'

type Mode = 'not-found' | 'fault' | 'silent' | 'one-train'
const servers: Server[] = []
const registries = {} as Record<Mode, string>

/**
 * Serve `mode`: 404 for everything, 500 for everything, never answer, or one
 * train — the harness and every `dsh-*` package at 0.1.7-rc.2 only, the harness
 * shipping cordis 4.0.4, and `dsh-client-runtime` (gone after 0.1.1) absent.
 */
async function standIn(mode: Mode) {
  const server = createServer((req, res) => {
    if (mode === 'silent') return
    if (mode === 'fault') { res.statusCode = 500; res.end('{"error":"boom"}'); return }
    const name = decodeURIComponent(req.url ?? '').slice(1)
    if (mode === 'one-train' && (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) && name !== '@deepseek-ai/dsh-client-runtime') {
      const version = '0.1.7-rc.2'
      const dependencies = name === '@deepseek-ai/dsh' ? { '@deepseek-ai/cordis': '4.0.4' } : {}
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        name, 'dist-tags': { latest: version },
        versions: { [version]: { name, version, dependencies, dist: { tarball: `http://127.0.0.1/${version}.tgz` } } },
      }))
      return
    }
    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    res.end('{"error":"Not found"}')
  })
  servers.push(server)
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
}

before(async () => {
  for (const mode of ['not-found', 'fault', 'silent', 'one-train'] as const) registries[mode] = await standIn(mode)
})
after(() => {
  for (const server of servers) server.closeAllConnections()
  for (const server of servers) server.close()
  rmSync(scratch, { recursive: true, force: true })
})

/** Run a command against `registry` without blocking this process. */
function exec(registry: string, cwd: string, argv: string[], extra: Record<string, string> = {}) {
  return new Promise<{ code: number | null, stdout: string, stderr: string }>((ok) => {
    const child = spawn(process.execPath, argv, {
      cwd,
      env: {
        ...process.env,
        npm_config_registry: registry,
        npm_config_userconfig: userconfig,
        npm_config_cache: join(scratch, 'cache'),
        npm_config_fetch_retries: '0',
        npm_config_update_notifier: 'false',
        HARNESS_NPM_VIEW_TIMEOUT_MS: '20000',
        // A CI run's own outputs must not receive this suite's answers.
        GITHUB_OUTPUT: '',
        GITHUB_STEP_SUMMARY: '',
        SMOKE_RESULT: '',
        ...extra,
      },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (s: string) => { stdout += s })
    child.stderr.setEncoding('utf8').on('data', (s: string) => { stderr += s })
    child.once('close', (code) => ok({ code, stdout, stderr }))
  })
}

/** `harness-lib.mjs`'s answer to one expression, as `{ value }` or `{ error, message }`. */
async function lib(registry: string, expression: string, extra: Record<string, string> = {}) {
  const code = `import * as lib from ${JSON.stringify(join(root, 'scripts/harness-lib.mjs'))}
try { console.log(JSON.stringify({ value: ${expression} })) }
catch (e) { console.log(JSON.stringify({ error: e.constructor.name, message: e.message })) }`
  const result = await exec(registry, scratch, ['--input-type=module', '-e', code], extra)
  assert.equal(result.code, 0, result.stderr)
  return JSON.parse(result.stdout) as { value?: unknown, error?: string, message?: string }
}

/** A copy of the scripts and manifests that `harness-target.mjs` may rewrite. */
function copy(name: string) {
  const dir = join(scratch, name)
  mkdirSync(join(dir, 'node_modules'), { recursive: true })
  for (const entry of ['scripts', 'package.json', 'package-lock.json']) cpSync(join(root, entry), join(dir, entry), { recursive: true })
  symlinkSync(join(root, 'node_modules', 'semver'), join(dir, 'node_modules', 'semver'), 'dir')
  return dir
}

test('npm view throws a RegistryError for anything but E404', async () => {
  for (const [registry, pattern] of [[CLOSED, /ECONNREFUSED/], [registries.fault, /E500/]] as const) {
    const answer = await lib(registry, "lib.view('@deepseek-ai/dsh', 'versions')")
    assert.equal(answer.error, 'RegistryError', JSON.stringify(answer))
    assert.match(answer.message!, pattern)
  }
  const silent = await lib(registries.silent, "lib.view('@deepseek-ai/dsh', 'versions')", { HARNESS_NPM_VIEW_TIMEOUT_MS: '1500' })
  assert.deepEqual([silent.error, /no answer within 1\.5 s/.test(silent.message!)], ['RegistryError', true], JSON.stringify(silent))
})

test('E404 is the only answer that means "not published", and never for the harness itself', async () => {
  assert.deepEqual(await lib(registries['not-found'], "lib.view('@deepseek-ai/dsh-nonexistent', 'versions') ?? 'absent'"), { value: 'absent' })
  assert.deepEqual(await lib(registries['not-found'], "lib.versionsOf('@deepseek-ai/dsh-nonexistent')"), { value: [] })
  const harness = await lib(registries['not-found'], "lib.versionsOf('@deepseek-ai/dsh')")
  assert.equal(harness.error, 'RegistryError', JSON.stringify(harness))
  // A registry that does not answer is never "never published".
  assert.equal((await lib(CLOSED, "lib.absence('@deepseek-ai/dsh-client-ui-renderer', '0.1.1-rc.2')")).error, 'RegistryError')
})

test('harness-target fails a cell whose registry does not answer instead of calling it incomplete', async () => {
  const dir = copy('target-closed')
  const manifest = readFileSync(join(dir, 'package.json'), 'utf8')
  for (const argv of [['latest'], ['0.1.7-rc.2', '--repoint'], ['floor', '--repoint', '--install']]) {
    const result = await exec(CLOSED, dir, ['scripts/harness-target.mjs', ...argv])
    assert.equal(result.code, 1, `${argv.join(' ')}: ${result.stdout}${result.stderr}`)
    assert.doesNotMatch(result.stdout, /incomplete=true/, argv.join(' '))
    assert.match(result.stderr, /::error::.*ECONNREFUSED/, argv.join(' '))
  }
  assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), manifest, 'a failed resolve left the manifest alone')
  // Admission is semver over the version: it needs no registry.
  const admits = await exec(CLOSED, dir, ['scripts/harness-target.mjs', '0.1.7-rc.2', '--admits'])
  assert.equal(admits.code, 0, admits.stdout + admits.stderr)
  assert.match(admits.stdout, /admitted by all \d+ harness peers/)
})

test('only a train npm really lacks is incomplete, and pinned and floor never are', async () => {
  const dir = copy('target-one-train')
  const unpublished = await exec(registries['one-train'], dir, ['scripts/harness-target.mjs', '0.1.9-rc.1', '--repoint'])
  assert.equal(unpublished.code, 3, unpublished.stdout + unpublished.stderr)
  assert.match(unpublished.stdout, /incomplete=true/)
  assert.match(unpublished.stdout, /@deepseek-ai\/dsh@0\.1\.9-rc\.1 is not on npm yet/)
  for (const cell of ['floor', '0.1.1-rc.2']) {
    const floor = await exec(registries['one-train'], dir, ['scripts/harness-target.mjs', cell, '--repoint'])
    assert.equal(floor.code, 1, `${cell}: ${floor.stdout}${floor.stderr}`)
    assert.doesNotMatch(floor.stdout, /incomplete=true/, cell)
    assert.match(floor.stderr, /published in full/, cell)
  }
  // The one train npm has is repointed, with every other devDependency held at the lockfile.
  const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version: string }> }
  const repointed = await exec(registries['one-train'], dir, ['scripts/harness-target.mjs', '0.1.7-rc.2', '--repoint'])
  assert.equal(repointed.code, 0, repointed.stdout + repointed.stderr)
  const { devDependencies } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> }
  for (const [name, spec] of Object.entries(devDependencies)) {
    assert.equal(spec, name.startsWith('@deepseek-ai/dsh-') ? '0.1.7-rc.2' : lock.packages[`node_modules/${name}`]!.version, name)
  }
  rmSync(join(dir, 'package-lock.json'))
  const unlocked = await exec(registries['one-train'], dir, ['scripts/harness-target.mjs', '0.1.7-rc.2', '--repoint'])
  assert.equal(unlocked.code, 1, unlocked.stdout + unlocked.stderr)
  assert.match(unlocked.stderr, /package-lock\.json is missing/)
  // A registry that 404s the harness itself is broken, not a train that is not out yet.
  const blank = await exec(registries['not-found'], dir, ['scripts/harness-target.mjs', '0.1.9-rc.1', '--repoint'])
  assert.equal(blank.code, 1, blank.stdout + blank.stderr)
  assert.match(blank.stderr, /registry fault/)
})

test('the sweep reports a registry that does not answer as a failure, never as out of scope', async () => {
  const work = join(scratch, 'sweep')
  const row = await exec(CLOSED, root, ['scripts/sweep-trains.mjs', '--work', work, '--jobs', '1', '0.1.7-rc.2'])
  assert.equal(row.code, 1, row.stdout + row.stderr)
  const [swept] = JSON.parse(readFileSync(join(work, 'sweep.json'), 'utf8')) as { install: string, note: string }[]
  assert.equal(swept!.install, 'fail')
  assert.doesNotMatch(swept!.note, /out of scope|incomplete/)
  const all = await exec(CLOSED, root, ['scripts/sweep-trains.mjs', '--work', join(scratch, 'sweep-all')])
  assert.equal(all.code, 1, all.stdout + all.stderr)
  assert.match(all.stderr, /cannot list the trains to sweep: .*ECONNREFUSED/)
})

test('a command that hangs is killed, and its timeout proves nothing about a train', () => {
  const hung = run(scratch, process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], { timeout: 500 })
  assert.deepEqual([hung.ok, hung.timedOut], [false, true])
  assert.match(hung.output, /killed after 0\.5 s/)
  assert.equal(upstreamGap(hung), undefined)
})

test('the boot smoke gives up on a registry that never answers', async () => {
  const smoke = await exec(registries.silent, root, ['scripts/smoke-boot.mjs', '--dsh', '0.1.7-rc.2', '--command-timeout-ms', '1500'])
  assert.equal(smoke.code, 1, smoke.stdout + smoke.stderr)
  assert.match(smoke.stdout, /FAILED {2}smoke — npm view @deepseek-ai\/dsh time --json timed out/)
  assert.match(smoke.stdout, /boot smoke: @crosery\/dsh-drop@\S+ on dsh \? — failed/)
})
