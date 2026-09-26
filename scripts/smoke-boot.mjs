/**
 * Boot smoke: does the packed plugin install into a real dsh profile, activate
 * its Host half, answer on its routes, and get its browser half served by the
 * running Web server?
 *
 * Typecheck and unit tests answer "does the source still compile against the
 * train's types". They cannot see the things that actually stop a user:
 *
 * - dsh ≥0.1.7 refuses a plugin whose `@deepseek-ai/dsh*` peer ranges do not
 *   admit the running version (`evaluatePluginCompatibility` in dsh-app-boot,
 *   prerelease-inclusive). `dsh plugin add` rolls the install back; an
 *   already-installed plugin is skipped at boot with one stderr line while the
 *   Web UI comes up fine — the plugin is simply absent. That is how v0.1.3 of
 *   this plugin was absent from the 0.1.7 desktop app.
 * - a Host entry that throws or waits on a service the composition lacks is
 *   reported by the startup audit as "did not activate" (fatal on 0.1.1, a
 *   warning on 0.1.7 — the server still starts).
 * - Host routes that are not mounted, not gated by the harness's own
 *   authentication where it has one, or cannot write into the profile's home.
 * - a browser half that is not in `window.__DSH_BOOT__`, is not served, or
 *   requires a specifier the shell's module table cannot answer, or reads a
 *   named export a harness seed module no longer has (v0.1.3's rail read four
 *   icons 0.1.7 renamed: it loaded, and crashed at the first card).
 * - a browser half that loads and still breaks the page: v0.2.0 on the trains
 *   before 0.1.0-rc.8 passed every stage above, and in a browser its document
 *   drop listeners swallowed every file dropped on the composer with "Open a
 *   session before dropping files". The last two stages run the page in
 *   headless Google Chrome (playwright-core, a devDependency; `channel:
 *   'chrome'`, or `--browser` / CHROME_PATH) with a profile inside this run.
 *
 * Stages, in order: harness → pnpm → install → boot → host-activation →
 * client-graph → host-routes → client-load → client-exports → client-boot →
 * client-drop.
 *
 * Everything runs in a throwaway DSH_HOME under the OS temp directory; the
 * script refuses any other home, so running it on a workstation cannot touch a
 * real profile. The session token `dsh` prints is masked in Actions and never
 * logged.
 *
 * Usage:
 *   node scripts/smoke-boot.mjs --dsh <exact version>          # installs @deepseek-ai/dsh from npm
 *   node scripts/smoke-boot.mjs --harness-dir <dir>            # <dir>/node_modules/@deepseek-ai/dsh, e.g. the
 *                                                              # desktop app's Contents/Resources/app.asar/dsh,
 *                                                              # run with that app's binary and ELECTRON_RUN_AS_NODE=1
 *   [--tarball <path>]      install this tarball instead of packing the checkout
 *   [--pnpm-version <v>]    pnpm `dsh plugin` drives (default: the desktop runtime's, else 11.7.0)
 *   [--timeout-ms <n>]      how long `dsh web` may take to announce its URL (default 240 s)
 *   [--install-timeout-ms <n>]  how long the plain `npm install` of the harness may take
 *                           before legacy peer mode is used instead (default 120 s)
 *   [--command-timeout-ms <n>]  how long any other command may run before it is
 *                           killed and its stage fails (default 600 s); every
 *                           request to the booted server gets 30 s
 *   [--graph released|today]  with --dsh: resolve the harness's floating
 *                           dependencies as of its release — just after its
 *                           own @deepseek-ai/dsh went out, with no package of a
 *                           later train in the tree (default) — or as of
 *                           today. The cordis family floats under every
 *                           train: a fresh install of 0.1.1-rc.2 today (e.g.
 *                           cordis-plugin-hmr 1.0.19) stops at boot with "user
 *                           patch-layer watching requires the Cordis HMR
 *                           service", plugin or not; and the harness's own
 *                           caret ranges take the next prerelease of the same
 *                           tuple.
 *   [--browser <path>]      the Chrome the browser stages drive (default CHROME_PATH,
 *                           else the installed Google Chrome)
 *   [--screenshots <dir>]   keep the browser stages' screenshots there (also
 *                           SMOKE_SCREENSHOTS): of a browser stage that fails, and
 *                           of the composer after the drop
 *   [--keep]
 *   [--accept-risk]         diagnostic only: grant the exact-version exemption
 *                           first, to separate "peer range too narrow" from
 *                           "code broken". Never a gate.
 *
 * Appends one JSON line to $SMOKE_RESULT (with the installed tarball's sha256)
 * and a section to $GITHUB_STEP_SUMMARY.
 * Exit 0 passed, 1 failed.
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import vm from 'node:vm'
import {
  NAME_HEADER, ROUTES,
  FIRST_RUN_DISMISS, absentInjects, blamesPlugin, bootState, classifyDiagnostics, dropVerdict, inert, installedExports, laterHarnessVersions, maskTokens as mask,
  missingMembers, moduleLines, moduleTableOf, modulesServedBy, noOpenArgs, refusedAsUnpublished, releaseCutoff, strayPackages,
} from './smoke-lib.mjs'

const { values } = parseArgs({
  options: {
    dsh: { type: 'string' },
    'harness-dir': { type: 'string' },
    tarball: { type: 'string' },
    'pnpm-version': { type: 'string' },
    'accept-risk': { type: 'boolean', default: false },
    'timeout-ms': { type: 'string', default: '240000' },
    'install-timeout-ms': { type: 'string', default: '120000' },
    'command-timeout-ms': { type: 'string', default: '600000' },
    graph: { type: 'string', default: 'released' },
    keep: { type: 'boolean', default: false },
    browser: { type: 'string' },
    screenshots: { type: 'string' },
  },
})
const root = fileURLToPath(new URL('..', import.meta.url))
/** The plugin under test: the checkout, or the manifest inside `--tarball`. */
let pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const timeoutMs = Number(values['timeout-ms'])
const commandTimeoutMs = Number(values['command-timeout-ms'])
/** A server that accepts a request and never answers must fail its stage, not hang the job. */
const FETCH_TIMEOUT_MS = 30_000
/** pnpm 10 answers `dsh plugin add` with ERR_PNPM_ADDING_TO_ROOT; the desktop runtime ships 11.7.0. */
const DEFAULT_PNPM = '11.7.0'

const work = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-smoke-')))
const home = join(work, 'home')
assert.ok(home.startsWith(realpathSync(tmpdir())) && !home.startsWith(join(homedir(), '.dsh')), 'refusing a non-temporary DSH_HOME')
const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1', FORCE_COLOR: '0' }
const result = { plugin: `${pkg.name}@${pkg.version}`, dsh: undefined, runtime: undefined, strict: !values['accept-risk'], stages: {} }

/** `--no-open` where this train's `dsh web` has it; see {@link noOpenArgs}. */
function noOpenFlag(dshBin, childEnv) {
  const help = spawnSync(process.execPath, [dshBin, '--profile', 'web', '--help'], { env: childEnv, encoding: 'utf8', timeout: 60_000 })
  return noOpenArgs(`${help.stdout ?? ''}${help.stderr ?? ''}`)
}

function stage(name, outcome, detail) {
  result.stages[name] = { outcome, ...(detail === undefined ? {} : { detail }) }
  const shown = detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
  console.log(`${outcome === 'passed' ? 'ok' : outcome.toUpperCase()}  ${name}${mask(shown)}`)
}

class StageFailed extends Error {}
function fail(name, detail) {
  stage(name, 'failed', detail)
  throw new StageFailed(name)
}

/** Run a command to completion; one still running after its timeout is killed and reported as such. */
function run(command, args, options = {}) {
  const r = spawnSync(command, args, { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024, timeout: commandTimeoutMs, killSignal: 'SIGKILL', ...options })
  if (r.error?.code === 'ETIMEDOUT') r.stderr = `${r.stderr ?? ''}\n${command} ${args[0] ?? ''}: killed after ${Math.round((options.timeout ?? commandTimeoutMs) / 1000)} s`
  if (r.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} ${r.error?.code === 'ETIMEDOUT' ? 'timed out' : `exited ${r.status ?? r.signal}`}\n${mask((r.stderr || r.stdout || r.error?.message || '').slice(-4000))}`)
  }
  return r
}

/** `fetch` with a deadline that covers the body as well. */
async function request(url, init = {}) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (error) {
    throw new Error(`${init.method ?? 'GET'} ${new URL(url).pathname} failed: ${error?.name === 'TimeoutError' ? `no answer within ${FETCH_TIMEOUT_MS / 1000} s` : error?.message ?? error}`)
  }
}

async function freePort() {
  return new Promise((ok, reject) => {
    const server = createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => ok(port))
    })
  })
}

const diagnostics = (stderr) => classifyDiagnostics(stderr, pkg.name)

/** Resolve after `ms`; an unref'd sleep does not keep the process alive. */
function sleep(ms, unref = false) {
  return new Promise((ok) => {
    const timer = setTimeout(ok, ms)
    if (unref) timer.unref()
  })
}

/**
 * Whether this harness gates raw Web routes with its own authentication:
 * `connection.requestRejection(req)` in dsh-client-connection, which exists
 * from 0.1.2-alpha.2. The plugin feature-detects the same service at request
 * time.
 */
function hasAdmissionCheck(from) {
  const lookup = createRequire(from)
  const name = '@deepseek-ai/dsh-client-connection'
  const dir = (lookup.resolve.paths(name) ?? []).map((base) => join(base, name)).find((d) => existsSync(join(d, 'package.json')))
  if (dir === undefined) return false
  const main = join(dir, 'lib/index.js')
  return existsSync(main) && /\brequestRejection\s*\(/.test(readFileSync(main, 'utf8'))
}

/** When each `@deepseek-ai/dsh` version was published, as npm records it. */
function harnessTimes() {
  return JSON.parse(run('npm', ['view', '@deepseek-ai/dsh', 'time', '--json']).stdout)
}

/**
 * A directory of shims that answer "where is Documents" with this run's home.
 * 0.1.7 asks `osascript` on macOS and `xdg-user-dir` on Linux rather than
 * reading HOME, so without them the smoke would create
 * `~/Documents/deepseek-harness/default-workspace` in the real account. Any
 * other use goes through to the real command.
 * @returns the directory to put first on the boot's PATH.
 */
function documentsShims(userHome) {
  const bin = join(work, 'shims')
  mkdirSync(bin, { recursive: true })
  const real = (name) => spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8', env }).stdout.trim()
  const shim = (name, test, fallback) => writeFileSync(join(bin, name), [
    '#!/bin/sh',
    `case "$*" in ${test}) printf '%s\\n' ${JSON.stringify(join(userHome, 'Documents'))}; exit 0 ;; esac`,
    fallback === '' ? 'exit 1' : `exec ${JSON.stringify(fallback)} "$@"`,
    '',
  ].join('\n'), { mode: 0o755 })
  shim('osascript', '*"path to documents folder"*', real('osascript'))
  shim('xdg-user-dir', 'DOCUMENTS', real('xdg-user-dir'))
  return bin
}

/** An empty project to install the harness into. */
function freshProject(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'harness', version: '0.0.0', private: true }))
}

/**
 * A `--before` later than `before` when npm refused one of the train's own
 * packages as not yet published then ({@link refusedAsUnpublished}): a train
 * can be published out of order — `@deepseek-ai/dsh@0.1.5-rc.3` went out seven
 * hours before its `dsh-client-ui-sidebar-documentpreview@0.1.5-rc.3`. The
 * cutoff moves to that version's publication; when npm names no version, to
 * the package's version at this train, or else its first one.
 */
function laterCutoff(output, before) {
  const refused = refusedAsUnpublished(output)
  if (refused === undefined) return undefined
  const times = JSON.parse(run('npm', ['view', refused.name, 'time', '--json'], { allowFailure: true }).stdout || '{}')
  const at = times[refused.version ?? (times[values.dsh] === undefined ? 'created' : values.dsh)]
  if (typeof at !== 'string' || at <= before) return undefined
  return new Date(Date.parse(at) + 1000).toISOString()
}

/**
 * Install `spec` into `dir` the way a user gets it, and say how.
 *
 * As released (`--graph released`, the default): `--before` one second after
 * the train's own `@deepseek-ai/dsh` went out ({@link releaseCutoff}), moved
 * later whenever npm refuses one of the train's own packages as not yet
 * published then; the installed tree must then hold no package of a later
 * harness train. Install scripts run, as for a user: 0.1.3's session store
 * needs its native addon built. The plain peer graph first; early prereleases
 * carry caret peers, and npm then either answers ERESOLVE or — 0.1.1-rc.2
 * under npm 11 — takes minutes of CPU to settle. @deepseek-ai/dsh lists every
 * package it composes as a dependency, so legacy peer mode plus the peers it
 * leaves unmet, each at its declared range, is the same harness.
 */
function installHarness(spec, dir) {
  let before
  let later = new Set()
  if (values.graph === 'released') {
    const times = harnessTimes()
    if (times[values.dsh] === undefined) fail('harness', `@deepseek-ai/dsh@${values.dsh} is not on npm`)
    before = releaseCutoff(times, values.dsh)
    later = laterHarnessVersions(times, values.dsh)
  } else if (values.graph !== 'today') fail('harness', `--graph must be released or today, not ${values.graph}`)
  const common = () => ['install', '--prefix', dir, '--no-audit', '--no-fund', ...(before === undefined ? [] : ['--before', before])]
  const describe = (how) => `npm install${before === undefined ? '' : ` --before ${before} (as released)`}${how}`
  const limit = Number(values['install-timeout-ms'])
  /** Run one install; a refusal of the train's own package as unpublished moves the cutoff instead of failing. */
  const install = (argv, options) => {
    const r = run('npm', argv, { ...options, allowFailure: true })
    if (r.status === 0) return { ok: true }
    const output = `${r.stdout}${r.stderr}`
    const moved = before === undefined ? undefined : laterCutoff(output, before)
    if (moved !== undefined) { before = moved; return { ok: false, retry: true } }
    return { ok: false, retry: false, output, settled: r.error?.code !== 'ETIMEDOUT' && r.signal === null }
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    freshProject(dir)
    const first = install([...common(), spec], { timeout: limit, killSignal: 'SIGKILL' })
    if (first.retry) continue
    let how = ''
    if (!first.ok) {
      if (first.settled && !/ERESOLVE/.test(first.output)) fail('harness', `npm install ${spec} failed: ${mask(first.output.slice(-2000))}`)
      freshProject(dir)
      const legacy = install([...common(), '--legacy-peer-deps', spec])
      if (legacy.retry) continue
      if (!legacy.ok) fail('harness', `npm install --legacy-peer-deps ${spec} failed: ${mask(legacy.output.slice(-2000))}`)
      let added = 0
      let moved = false
      for (let round = 0; round < 8; round += 1) {
        const unmet = unmetPeers(join(dir, 'node_modules'))
        if (unmet.size === 0) break
        added += unmet.size
        const more = install([...common(), '--legacy-peer-deps', ...[...unmet].map(([name, range]) => `${name}@${range}`)])
        if (more.retry) { moved = true; break }
        if (!more.ok) fail('harness', `adding unmet peers failed: ${mask(more.output.slice(-2000))}`)
      }
      if (moved) continue
      const left = unmetPeers(join(dir, 'node_modules'))
      if (left.size > 0) fail('harness', `peers still unmet after legacy install: ${[...left.keys()].join(', ')}`)
      how = ` --legacy-peer-deps + ${added} unmet peers at their ranges (the peer graph ${first.settled ? 'hit ERESOLVE' : `did not settle within ${Math.round(limit / 1000)} s`})`
    }
    const strays = strayPackages(installedPackages(join(dir, 'node_modules')).map((p) => [p.manifest.name, p.manifest.version]), later)
    if (strays.length > 0) {
      fail('harness', `the graph installed with --before ${before} is not ${spec} as released: ${strays.length} package(s) of later harness trains, e.g. ${strays.slice(0, 5).map(([n, v]) => `${n}@${v}`).join(', ')}`)
    }
    return describe(how)
  }
  fail('harness', `npm install ${spec} kept refusing its own packages as unpublished before ${before}`)
}

/** Every package installed under `modules`, nested ones included, with its manifest. */
function installedPackages(modules) {
  const installed = []
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue
      const path = join(dir, entry)
      if (entry.startsWith('@')) { walk(path); continue }
      if (!existsSync(join(path, 'package.json'))) continue
      installed.push({ path, manifest: JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) })
      walk(join(path, 'node_modules'))
    }
  }
  walk(modules)
  return installed
}

/** Required peers no installed package can resolve, as `name → first declared range`. */
function unmetPeers(modules) {
  const unmet = new Map()
  for (const { path, manifest } of installedPackages(modules)) {
    for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
      if (manifest.peerDependenciesMeta?.[name]?.optional) continue
      // Node resolution: this package's own node_modules, then each ancestor's.
      let dir = path
      let found = false
      while (dir.startsWith(modules)) {
        if (existsSync(join(dir, 'node_modules', name, 'package.json'))) { found = true; break }
        dir = dirname(dir)
      }
      if (!found && !existsSync(join(modules, name, 'package.json')) && !unmet.has(name)) unmet.set(name, range)
    }
  }
  return unmet
}

/**
 * The browser stages. Everything they touch lives in this run's directory: the
 * browser profile, the dropped file, the screenshots unless `--screenshots`
 * (or SMOKE_SCREENSHOTS) names a directory to keep them in.
 *
 * - client-boot: the index, with the login cookie the token exchange above
 *   gave where the harness has one, settles into the app — no "Failed to load
 *   plugins", no boot page left after 90 s ({@link bootState}); this plugin's
 *   module was served to the page; and in a 3 s quiet window after, no page
 *   error, console error or failed request that is this plugin's
 *   ({@link blamesPlugin}). Others are noted, not held against it.
 * - client-drop: whatever the train needs to give the composer a session —
 *   dismissing first-run dialogs, and on trains with no default workspace
 *   choosing this run's home in the in-page picker — then a file dropped on
 *   the composer through the DevTools protocol, as the OS would, must appear as
 *   a settled card in this plugin's rail, with no "open a session first"
 *   notice ({@link dropVerdict}).
 */
async function inBrowser(base, cookie) {
  let playwright
  try {
    playwright = await import('playwright-core')
  } catch (error) {
    fail('client-boot', `playwright-core is not installed (npm ci installs it as a devDependency): ${error?.message ?? error}`)
  }
  const chromium = playwright.chromium ?? playwright.default?.chromium
  const profile = join(work, 'browser-profile')
  assert.ok(profile.startsWith(work), 'refusing a browser profile outside this run')
  const executablePath = values.browser ?? process.env.CHROME_PATH
  const shots = values.screenshots ?? process.env.SMOKE_SCREENSHOTS
  const moduleId = pkg.name
  let context
  let page
  const shoot = async (name) => {
    if (shots === undefined || page === undefined) return
    try {
      mkdirSync(shots, { recursive: true })
      await page.screenshot({ path: join(shots, `${result.dsh ?? 'dsh'}-${name}.png`), timeout: 15_000 })
    } catch {}
  }
  try {
    try {
      context = await chromium.launchPersistentContext(profile, {
        headless: true, locale: 'en-US', viewport: { width: 1400, height: 900 }, timeout: 60_000,
        ...(executablePath ? { executablePath } : { channel: 'chrome' }),
      })
    } catch (error) {
      fail('client-boot', `could not start ${executablePath ?? 'Google Chrome (channel chrome)'}: ${String(error?.message ?? error).split('\n')[0]} — set CHROME_PATH or --browser`)
    }
    if (cookie) {
      const at = cookie.indexOf('=')
      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: base.href }])
    }
    page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(30_000)

    // Every report the page makes, and every script that carried this module.
    const reports = []
    const served = []
    const combos = new Map()
    page.on('pageerror', (error) => reports.push({ kind: 'page error', text: String(error?.stack ?? error) }))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const location = message.location()
      reports.push({ kind: 'console error', text: message.text(), location: { url: location.url, line: location.lineNumber + 1 } })
    })
    page.on('requestfailed', (request) => reports.push({ kind: 'failed request', text: `${request.url()} ${request.failure()?.errorText ?? ''}`, request: request.url() }))
    page.on('response', (response) => {
      const ids = modulesServedBy(response.url())
      if (!ids.includes(moduleId)) return
      served.push(`${response.status()} ${ids.length > 1 ? `combo of ${ids.length}` : 'alone'}`)
      if (response.status() >= 400) reports.push({ kind: `HTTP ${response.status()}`, text: response.url(), request: response.url() })
      else if (ids.length > 1) combos.set(response.url(), response.text().then((text) => moduleLines(text, moduleId), () => undefined))
    })
    const linesOf = (() => {
      const known = new Map()
      return { settle: async () => { for (const [u, p] of combos) known.set(u, await p) }, of: (u) => known.get(u) }
    })()
    const judge = async () => {
      await linesOf.settle()
      const ours = []
      const others = []
      for (const report of reports) (blamesPlugin(report, moduleId, linesOf.of) ? ours : others).push(`${report.kind}: ${mask(report.text).slice(0, 400)}`)
      return { ours, others }
    }

    // client-boot
    try {
      await page.goto(base.href, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    } catch (error) {
      await shoot('client-boot')
      fail('client-boot', `the page did not load: ${String(error?.message ?? error).split('\n')[0]}`)
    }
    const snapshot = () => page.evaluate(() => {
      const root = document.querySelector('#root')
      return { rootChildren: root?.childElementCount ?? 0, rootText: root instanceof HTMLElement ? root.innerText.slice(0, 2000) : '', splash: document.querySelector('[data-dsh-boot]') !== null }
    }).catch(() => ({ rootChildren: 0, rootText: '', splash: true }))
    let state = 'loading'
    let last
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      last = await snapshot()
      state = bootState(last)
      if (state !== 'loading') break
      await sleep(250)
    }
    if (state !== 'settled') {
      await shoot('client-boot')
      fail('client-boot', state === 'failed' ? `the shell reports: ${mask(last.rootText).slice(0, 800)}` : `still on the boot page after 90 s: ${mask(last?.rootText ?? '').slice(0, 300)}`)
    }
    await sleep(3000)
    if (!served.some((s) => s.startsWith('2'))) fail('client-boot', `the page never loaded this plugin's module (${served.join(', ') || 'no request for it'})`)
    const booted = await judge()
    if (booted.ours.length > 0) {
      await shoot('client-boot')
      fail('client-boot', booted.ours)
    }
    if (booted.others.length > 0) console.log(`note: the page reported, not about this plugin:\n  ${booted.others.join('\n  ')}`)
    stage('client-boot', 'passed', `the app settled in Chrome with this plugin active (module served: ${served.join(', ')}); nothing on the page is this plugin's error${booted.others.length > 0 ? `; ${booted.others.length} other report(s), see log` : ''}`)

    // client-drop
    const steps = []
    // First-run notices, dialogs or full pages (FIRST_RUN_DISMISS); a dialog
    // with none of those buttons is closed with Escape.
    const dismissDialogs = async () => {
      for (let round = 0; round < 6; round += 1) {
        const dialogs = page.locator('[role=dialog]:visible, [role=alertdialog]:visible')
        const scope = await dialogs.count() > 0 ? dialogs.first() : page.locator('body')
        const button = scope.locator('button:visible').filter({ hasText: FIRST_RUN_DISMISS })
        if (await button.count() === 0) {
          if (await dialogs.count() === 0) return
          steps.push(`dismissed "${((await dialogs.first().getAttribute('aria-label')) ?? '').slice(0, 60)}" with Escape`)
          await page.keyboard.press('Escape')
        } else {
          const heading = (await scope.locator('h1:visible, h2:visible, h3:visible').first().innerText({ timeout: 2000 }).catch(() => '')).trim()
          steps.push(`dismissed "${heading.slice(0, 60)}" with ${(await button.first().innerText()).trim()}`)
          await button.first().click({ timeout: 10_000 })
        }
        await sleep(800)
      }
    }
    const composerPoint = () => page.evaluate(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
      const el = [...document.querySelectorAll('[data-composer-card] [data-composer-input], [data-composer-card] textarea, [data-composer-input], textarea')].find(visible)
      if (el === undefined) return undefined
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    try {
      await dismissDialogs()
      // Trains without a default workspace start with no session, and their
      // workspace control reads "Choose workspace" (later ones name the
      // workspace there): choose this run's home in the in-page picker, which
      // opens a session in it.
      const choose = page.getByRole('button', { name: /^Choose workspace$/ }).filter({ hasText: /^\s*Choose workspace\s*$/ })
      if (await choose.count() > 0 && await choose.first().isVisible()) {
        await choose.first().click({ timeout: 10_000 })
        const picker = page.getByRole('dialog', { name: /Select Workspace Directory/i })
        await picker.waitFor({ timeout: 20_000 })
        await picker.getByRole('button', { name: /^Open$/ }).click({ timeout: 10_000 })
        await picker.waitFor({ state: 'hidden', timeout: 20_000 })
        steps.push('chose a workspace in the picker')
        await sleep(1500)
        await dismissDialogs()
      }
    } catch (error) {
      await shoot('client-drop')
      fail('client-drop', { reason: `could not give the composer a session: ${String(error?.message ?? error).split('\n')[0]}`, steps })
    }
    const point = await composerPoint()
    if (point === undefined) {
      await shoot('client-drop')
      fail('client-drop', { reason: 'no composer input on the page', steps })
    }
    const fileName = 'dsh-drop-smoke.txt'
    const fixture = join(work, 'drop-fixture', fileName)
    mkdirSync(dirname(fixture), { recursive: true })
    writeFileSync(fixture, `dropped by the dsh-drop boot smoke ${Date.now()}\n`)
    const cdp = await context.newCDPSession(page)
    const data = { items: [], files: [fixture], dragOperationsMask: 1 }
    for (const type of ['dragEnter', 'dragOver', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: point.x, y: point.y, data })
    // The card appears once the Host has staged the copy; watch notices meanwhile.
    const seen = { cards: [], notices: [] }
    const until = Date.now() + 30_000
    while (Date.now() < until) {
      const now = await page.evaluate(() => ({
        cards: [...document.querySelectorAll('[data-dshdrop-key]')].map((c) => ({ text: c.textContent ?? '', state: c.getAttribute('data-state') })),
        notices: [...document.querySelectorAll('.dsh-drop-toast, [role=status], [role=alert]')].map((n) => (n.textContent ?? '').trim()).filter(Boolean),
      })).catch(() => ({ cards: [], notices: [] }))
      seen.cards = now.cards
      for (const notice of now.notices) if (!seen.notices.includes(notice)) seen.notices.push(notice)
      const verdict = dropVerdict(seen, fileName)
      if (verdict.ok || verdict.why.startsWith('the drop was refused')) break
      await sleep(250)
    }
    const verdict = dropVerdict(seen, fileName)
    const dropped = await judge()
    if (!verdict.ok || dropped.ours.length > 0) {
      await shoot('client-drop')
      fail('client-drop', { reason: verdict.ok ? 'the drop worked, but the page reported this plugin\'s errors' : verdict.why, errors: dropped.ours, steps })
    }
    await shoot('client-drop')
    stage('client-drop', 'passed', `${steps.length > 0 ? `${steps.join('; ')}; ` : ''}a file dropped on the composer became a settled card in this plugin's rail: ${seen.cards.find((c) => c.text.includes(fileName))?.text}`)
  } finally {
    await Promise.race([context?.close().catch(() => {}), sleep(20_000, true)])
  }
}

let child
try {
  // 1. The harness under test.
  let dshBin
  let harnessRoot
  if (values['harness-dir'] !== undefined) {
    harnessRoot = resolve(values['harness-dir'])
    dshBin = join(harnessRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
    const runtimeFile = join(harnessRoot, 'desktop-runtime.json')
    if (existsSync(runtimeFile)) {
      const runtime = JSON.parse(readFileSync(runtimeFile, 'utf8'))
      result.runtime = { release: runtime.release?.version, node: runtime.release?.nodeVersion, pnpm: runtime.release?.pnpmVersion, executingNode: process.versions.node }
    }
  } else {
    assert.ok(values.dsh, '--dsh <exact version> or --harness-dir is required')
    harnessRoot = join(work, 'harness')
    result.install = installHarness(`@deepseek-ai/dsh@${values.dsh}`, harnessRoot)
    dshBin = join(harnessRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  }
  if (!existsSync(dshBin)) fail('harness', `no dsh entry at ${dshBin}`)
  const dshManifest = join(dshBin, '../../package.json')
  result.dsh = JSON.parse(readFileSync(dshManifest, 'utf8')).version
  if (values.dsh !== undefined && result.dsh !== values.dsh) fail('harness', `asked for ${values.dsh}, installed ${result.dsh}`)
  if (result.runtime?.release !== undefined && result.runtime.release !== result.dsh) {
    fail('harness', `desktop-runtime.json says ${result.runtime.release} but the bundled @deepseek-ai/dsh is ${result.dsh}`)
  }
  stage('harness', 'passed', `@deepseek-ai/dsh@${result.dsh} on node ${process.versions.node}${result.runtime ? ` (desktop runtime ${result.runtime.release})` : ''}${result.install ? `, ${result.install}` : ''}`)
  const dsh = (args, options) => run(process.execPath, [dshBin, ...args], options)

  // 2. pnpm — `dsh plugin` forwards to whatever `pnpm` is on PATH.
  const wantedPnpm = values['pnpm-version'] ?? result.runtime?.pnpm ?? DEFAULT_PNPM
  const pnpmVersion = () => {
    const r = spawnSync('pnpm', ['--version'], { encoding: 'utf8', env })
    return r.status === 0 ? r.stdout.trim() : undefined
  }
  let pnpm = pnpmVersion()
  if (pnpm !== wantedPnpm) {
    const prefix = join(work, 'pnpm')
    run('npm', ['install', '--prefix', prefix, '--no-audit', '--no-fund', '--no-save', `pnpm@${wantedPnpm}`])
    env.PATH = `${join(prefix, 'node_modules/.bin')}${delimiter}${env.PATH}`
    pnpm = pnpmVersion()
  }
  if (pnpm !== wantedPnpm) fail('pnpm', `wanted pnpm ${wantedPnpm}, PATH answers ${pnpm ?? 'nothing'}`)
  stage('pnpm', 'passed', pnpm)

  // 3. The artifact a user installs: the committed dist, packed.
  let tarball = values.tarball && resolve(values.tarball)
  if (tarball === undefined) {
    const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', work], { cwd: root }).stdout)[0]
    tarball = join(work, packed.filename)
  }
  result.tarball = tarball.startsWith(work) ? 'packed from the checkout' : tarball
  // What was installed, byte for byte: a release attaches only the file its gate smoked.
  result.sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex')
  if (values.tarball !== undefined) {
    // Another build of the plugin (an old release, say): name, version and
    // inject list come from it, so an --accept-risk exemption names it.
    pkg = JSON.parse(run('tar', ['-xzOf', tarball, 'package/package.json']).stdout)
    result.plugin = `${pkg.name}@${pkg.version}`
  }

  // 4. Install through the official command, so the version gate runs.
  if (values['accept-risk']) {
    const allow = dsh(['plugin', '--profile', 'web', 'allow-version', `${pkg.name}@${pkg.version}`, '--dsh-version', result.dsh, '--accept-risk'], { allowFailure: true })
    console.log(allow.status === 0 ? 'diagnostic run: granted an exact-version exemption' : 'diagnostic run: this harness has no version gate to exempt from')
  }
  const add = dsh(['plugin', '--profile', 'web', 'add', tarball], { allowFailure: true })
  if (add.status !== 0) {
    const found = diagnostics(add.stderr)
    fail('install', found.ours.length > 0 ? found.ours : mask(`${add.stderr}${add.stdout}`.slice(-2000)))
  }
  stage('install', 'passed', values['accept-risk'] ? 'with an exact-version exemption (diagnostic run, not a gate)' : 'strict: no exemption')

  // 5. Boot the Web profile and wait for the URL line — printed only after the
  //    loader settled and the startup audit ran.
  //    Its home is a directory of this run: 0.1.7 creates its default
  //    workspace under the account's Documents on first page load, and the
  //    workspace picker of the trains without one opens at home.
  //    SSH_CONNECTION makes that picker the in-page one (a native dialog
  //    would need a desktop session).
  const port = await freePort()
  const userHome = join(work, 'user-home')
  mkdirSync(join(userHome, 'Documents'), { recursive: true })
  const bootEnv = { ...env, HOME: userHome, SSH_CONNECTION: '127.0.0.1 0 127.0.0.1 0', PATH: `${documentsShims(userHome)}${delimiter}${env.PATH}` }
  child = spawn(process.execPath, [dshBin, '--profile', 'web', ...noOpenFlag(dshBin, env), '--host', '127.0.0.1', '--port', String(port)], {
    env: bootEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (s) => { stdout += s })
  child.stderr.setEncoding('utf8').on('data', (s) => { stderr += s })
  const exited = new Promise((ok) => child.once('exit', (code, signal) => ok({ code, signal })))
  // Timers are unref'd and the poll stops once the race is decided: a pending
  // timer would otherwise hold this process open for the whole timeout after
  // a pass, and forever after a boot that exited.
  let decided = false
  const announced = await Promise.race([
    (async () => { while (!decided && !/^dsh web: https?:\/\//m.test(stdout)) await sleep(250); return 'url' })(),
    exited.then(() => 'exit'),
    sleep(timeoutMs, true).then(() => 'timeout'),
  ])
  decided = true
  const url = /^dsh web: (https?:\/\/\S+)/m.exec(stdout)?.[1]
  const token = url === undefined ? null : new URL(url).searchParams.get('token')
  if (token && process.env.GITHUB_ACTIONS) console.log(`::add-mask::${token}`)
  await sleep(1500) // let the audit's stderr land
  const booted = diagnostics(stderr)
  if (announced !== 'url') {
    fail('boot', { reason: announced, diagnostics: booted.ours, stderrTail: mask(stderr).slice(-3000) })
  }
  stage('boot', 'passed', `port ${port}`)
  if (booted.ours.length > 0) fail('host-activation', booted.ours)
  if (booted.others.length > 0) console.log(`note: entries outside this plugin did not activate on this train:\n  ${booted.others.join('\n  ')}`)
  stage('host-activation', 'passed', booted.others.length > 0 ? `other entries did not activate: ${booted.others.length} line(s), see log` : undefined)

  // 6. Browser half: authenticated index, boot graph.
  const first = await request(url, { redirect: 'manual' })
  const cookie = (first.headers.get('set-cookie') ?? '').split(';')[0]
  const headers = cookie ? { cookie } : {}
  const base = new URL('/', url)
  const index = first.status === 200 ? first : await request(base, { headers })
  if (index.status !== 200) fail('client-graph', `the index answered ${index.status} after the token exchange (${first.status})`)
  const html = await index.text()
  // `globalThis["__DSH_BOOT__"] = …` from 0.1.1, `window.__DSH_BOOT__ = …` on 0.1.0.
  const wire = /(?:globalThis\["__DSH_BOOT__"\]|window\.__DSH_BOOT__)\s*=\s*(.*?)<\/script>/s.exec(html)
  if (wire === null) fail('client-graph', 'the index carries no __DSH_BOOT__ graph')
  const graph = JSON.parse(wire[1])
  const entries = new Map(graph.entries.map((e) => [e.id, e]))
  const entry = entries.get(pkg.name)
  if (entry === undefined) fail('client-graph', `${pkg.name} is not in __DSH_BOOT__ (${graph.entries.length} entries)`)
  const absent = absentInjects(pkg.dsh?.client?.inject, entries)
  stage('client-graph', 'passed', `${graph.entries.length} entries; this plugin present${absent.length > 0 ? `; inject targets this train does not ship: ${absent.join(', ')}` : ' with its inject targets'}`)

  // 7. Host routes, as a page and as a stranger. Each is mounted (an unmounted
  //    path would not answer 405), the harness's own authentication gates
  //    them where the harness has one, and a real stage lands in this home.
  const gated = hasAdmissionCheck(dshManifest)
  const call = (path, init = {}, authed = true) => request(new URL(path, base), {
    redirect: 'manual', ...init, headers: { ...(authed ? headers : {}), ...(init.headers ?? {}) },
  })
  const wrong = []
  const expect = async (label, response, status) => {
    const body = await response.text()
    if (response.status !== status) wrong.push(`${label}: wanted ${status}, got ${response.status} ${body.slice(0, 120)}`)
    return body
  }
  await expect('anonymous GET stage', await call(ROUTES.stage, {}, false), gated ? 401 : 405)
  await expect('anonymous POST batch limits', await call(ROUTES.batch, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"op":"limits"}' }, false), gated ? 401 : 200)
  for (const [name, path] of Object.entries(ROUTES)) await expect(`GET ${name}`, await call(path), 405)
  const limits = JSON.parse(await expect('POST batch limits', await call(ROUTES.batch, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"op":"limits"}' }), 200) || '{}')
  if (typeof limits.limits?.maxFiles !== 'number') wrong.push(`batch limits answered no limits: ${JSON.stringify(limits).slice(0, 200)}`)
  await expect('POST stage without its name header', await call(ROUTES.stage, { method: 'POST', body: 'x' }), 403)
  const payload = `dsh-drop smoke ${Date.now()}\n`
  const staged = JSON.parse(await expect('POST stage', await call(ROUTES.stage, {
    method: 'POST', headers: { [NAME_HEADER]: encodeURIComponent('smoke note.txt'), 'content-type': 'application/octet-stream' }, body: payload,
  }), 200) || '{}')
  if (typeof staged.path !== 'string' || !staged.path.startsWith(`${join(home, 'drops')}${sep}`)) {
    wrong.push(`the staged copy is not under this home's drops/: ${JSON.stringify(staged).slice(0, 200)}`)
  } else if (readFileSync(staged.path, 'utf8') !== payload) {
    wrong.push('the staged copy does not hold the uploaded bytes')
  } else {
    const { size, mtimeMs } = statSync(staged.path)
    const claim = JSON.stringify({ path: staged.path, size, lastModified: Math.round(mtimeMs) })
    const resolved = JSON.parse(await expect('POST resolve of the staged copy', await call(ROUTES.resolve, { method: 'POST', headers: { 'content-type': 'application/json' }, body: claim }), 200) || '{}')
    if (resolved.path !== staged.path) wrong.push(`resolve echoed ${JSON.stringify(resolved.path)}, not the staged path`)
    await expect('POST resolve of a missing path', await call(ROUTES.resolve, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: join(home, 'absent.txt'), size: 1, lastModified: 0 }) }), 404)
  }
  // Not fatal: the browser half is checked either way, so one run names every
  // broken stage.
  if (wrong.length > 0) stage('host-routes', 'failed', wrong)
  else stage('host-routes', 'passed', `stage, resolve and batch mounted; ${gated ? "anonymous callers refused by the harness's login check (401)" : 'this train has no login check for plugin routes (before 0.1.2): anonymous callers reach them'}; a staged copy landed in this home and resolved`)

  // 8. Browser half: the served bundle, evaluated against the shell's own
  //    module table — the specifiers a client bundle may require without a
  //    graph row. Read from the served shell, never assumed: 0.0.1-rc.5 to
  //    0.1.0-rc.7 answer 10, 0.1.0-rc.8 and 0.1.1 answer 7, 0.1.7 answers 9.
  const assets = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+\.js(?:\?[^"]*)?)"/g)].map((m) => m[1])
  let table
  for (const asset of assets) {
    const res = await request(new URL(asset, base), { headers })
    if (!res.ok) continue
    table = moduleTableOf(await res.text())
    if (table !== undefined) { result.moduleTable = { asset: asset.replace(/\?.*$/, '').replace(/^.*\//, ''), specifiers: table }; break }
  }
  if (table === undefined) fail('client-load', `no static module table found in the shell's scripts (${assets.join(', ') || 'none'}); smoke-boot.mjs needs to learn this train's shell`)

  const bundle = await request(new URL(entry.url, base), { headers })
  if (bundle.status !== 200) fail('client-load', `the bundle answered ${bundle.status}`)
  const source = await bundle.text()
  const factories = new Map()
  const window = { __ModuleLoader__: { load: (row) => factories.set(row.id, row.factory) } }
  vm.runInNewContext(source, { window, globalThis: window, console })
  if (factories.size !== 1 || !factories.has(pkg.name)) fail('client-load', `the served script registered ${JSON.stringify([...factories.keys()])}, not exactly ${pkg.name}`)
  const requested = new Set()
  const misses = []
  let exported
  try {
    exported = factories.get(pkg.name)((spec) => {
      requested.add(spec)
      const id = spec.endsWith('/client') ? spec.slice(0, -'/client'.length) : spec
      if (table.includes(spec) || entries.has(id)) return inert()
      misses.push(spec)
      throw new Error(`require("${spec}") misses the module table`)
    })
  } catch (error) {
    fail('client-load', misses.length > 0 ? `requires specifiers this shell cannot answer: ${misses.join(', ')}` : `the factory threw: ${String(error?.message ?? error).slice(0, 500)}`)
  }
  const plugin = exported?.default ?? exported
  if (typeof plugin?.apply !== 'function' && typeof plugin !== 'function') fail('client-load', 'the factory exported no cordis plugin (no apply)')
  stage('client-load', 'passed', `factory evaluated against a ${table.length}-specifier module table; requires ${[...requested].join(', ')}`)

  // 9. Named members the bundle reads off harness seed modules must exist in
  //    this train. esbuild keeps `import_<pkg>N.Member` reads lazy, so a
  //    renamed export materializes fine and only crashes at render — as
  //    `undefined` handed to React, which removes the slot entry.
  const members = missingMembers(source, (name) => installedExports(dshManifest, name))
  if (Object.keys(members.missing).length > 0) fail('client-exports', members.missing)
  stage('client-exports', 'passed', [
    members.checked.length > 0 ? `checked against this train: ${members.checked.join(', ')}` : 'the bundle reads no harness seed member',
    members.unchecked.length > 0 ? `unchecked: ${members.unchecked.join(', ')}` : '',
  ].filter(Boolean).join('; '))

  // 10. The same page in a real browser: the app settles with this plugin
  //     active, and a file dropped on the composer lands in this plugin's rail.
  await inBrowser(base, cookie)
} catch (error) {
  if (!(error instanceof StageFailed)) stage('smoke', 'failed', mask(String(error?.message ?? error)).slice(0, 2000))
} finally {
  if (child !== undefined && child.exitCode === null && child.signalCode === null) {
    try { process.kill(-child.pid, 'SIGINT') } catch {}
    const stopped = await Promise.race([new Promise((r) => child.once('exit', () => r(true))), sleep(15000, true).then(() => false)])
    if (!stopped) try { process.kill(-child.pid, 'SIGKILL') } catch {}
  }
  if (!values.keep) rmSync(work, { recursive: true, force: true })
  else console.log(`kept ${work} (holds a session secret under home/; delete it when done)`)
  const failed = Object.values(result.stages).some((s) => s.outcome === 'failed')
  result.outcome = failed ? 'failed' : 'passed'
  console.log(`boot smoke: ${result.plugin} on dsh ${result.dsh ?? '?'} — ${result.outcome}`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      `### Boot smoke: ${result.plugin} on dsh ${result.dsh ?? '?'} — ${result.outcome}${result.strict ? '' : ' (diagnostic, --accept-risk)'}`, '',
      ...Object.entries(result.stages).map(([name, s]) => `- **${name}**: ${s.outcome}${s.detail === undefined ? '' : ` — \`${mask(JSON.stringify(s.detail)).slice(0, 800).replace(/`/g, "'")}\``}`), '',
    ].join('\n'))
  }
  if (process.env.SMOKE_RESULT) appendFileSync(process.env.SMOKE_RESULT, JSON.stringify(result) + '\n')
  process.exitCode = failed ? 1 : 0
}
