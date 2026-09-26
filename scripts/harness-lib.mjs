/**
 * What the harness trains are, and how to put this repository on one of them.
 *
 * Shared by `harness-target.mjs` (one CI cell at a time) and
 * `sweep-trains.mjs` (every published train, locally). The pure functions at
 * the top take their facts as arguments so `tests/harness.test.ts` can pin
 * them without a network; the npm-backed helpers below them are thin.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import semver from 'semver'
import { moduleTableOf } from './smoke-lib.mjs'

/** The Web app package. The desktop app boots this same package at the same version. */
export const HARNESS = '@deepseek-ai/dsh'

/**
 * The oldest train with live evidence, and the one the owner runs every day.
 * It gates pull requests next to the pinned train; the sweep reaches further
 * back, down to the lowest version the peer ranges admit.
 */
export const FLOOR = '0.1.1-rc.2'

/**
 * Every update feed the desktop app has. The channel is hard-coded to
 * `nightly` (`updater.channel = "nightly"` in the app's main.js) and only
 * these two platforms are built; every other path answers 404.
 */
export const DESKTOP_FEEDS = {
  'mac-arm64': 'https://download.deepseek.com/dsh-desk/feeds/mac-arm64/nightly-mac.yml',
  'win-x64': 'https://download.deepseek.com/dsh-desk/feeds/win-x64/nightly.yml',
}

/** The npm dist-tags a cell may name. */
export const DIST_TAGS = ['latest', 'next', 'alpha']

/** Cells with a fixed meaning; anything else must be an exact version. */
export const NAMED_CELLS = ['pinned', 'floor', 'desktop', ...DIST_TAGS]

/**
 * Harness packages without which this plugin has no surface on a train: the
 * slot registry's declaration home from 0.1.0-rc.8, the composer contract and
 * the slot primitives. A train that never published one of them is out of
 * scope (`predates`) or published incomplete, never a failure of this plugin.
 * Every harness peer is required as well — without it the Host half has
 * nothing to run on.
 */
export const REQUIRED = [
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-slots',
]

/**
 * Harness packages a train declares this plugin's services in without this
 * repository pinning them, because later trains stopped publishing them: on
 * 0.1.0–0.1.1 `ctx.slots` is declared by `dsh-client-runtime`. Added at the
 * train's version when it published one.
 */
export const TRAIN_EXTRAS = ['@deepseek-ai/dsh-client-runtime']

export const isHarnessPeer = (name) => name === HARNESS || name.startsWith('@deepseek-ai/dsh-')

/** `[name, range]` for every harness peer — the ones dsh ≥0.1.7 checks. */
export function harnessPeers(pkg) {
  return Object.entries(pkg.peerDependencies ?? {}).filter(([name]) => isHarnessPeer(name))
}

/**
 * The peers that refuse a version, under each of the two rules that matter:
 * the one dsh ≥0.1.7 applies at install and at boot
 * (`semver.satisfies(v, range, { includePrerelease: true })` in dsh-app-boot's
 * `evaluatePluginCompatibility`), and node-semver's default, which npm and
 * pnpm apply to peers. A prerelease passes the default rule only when a
 * comparator on its own major.minor.patch tuple carries a prerelease tag.
 */
export function refusals(version, peers) {
  const refused = []
  for (const [name, range] of peers) {
    const runtime = semver.satisfies(version, range, { includePrerelease: true })
    const installer = semver.satisfies(version, range)
    if (!runtime || !installer) refused.push({ name, runtime, installer })
  }
  return refused
}

/** One line per refusing peer, naming which rule refused it. */
export function describeRefusals(refused) {
  return refused.map(({ name, runtime, installer }) => {
    const rules = [!runtime && 'dsh ≥0.1.7 refuses to install or load it', !installer && 'npm/pnpm peer check fails'].filter(Boolean)
    return `${name} (${rules.join('; ')})`
  })
}

/** The lowest version every harness peer range admits: where the sweep starts. */
export function sweepStart(peers) {
  let start
  for (const [, range] of peers) {
    const min = semver.minVersion(range)
    if (min !== null && (start === undefined || semver.gt(min, start))) start = min.version
  }
  return start
}

/** The newest published version on each `major.minor.patch` tuple. */
export function tupleHeads(versions) {
  const heads = new Map()
  for (const version of versions) {
    if (!semver.valid(version)) continue
    const tuple = `${semver.major(version)}.${semver.minor(version)}.${semver.patch(version)}`
    const current = heads.get(tuple)
    if (current === undefined || semver.gt(version, current)) heads.set(tuple, version)
  }
  return new Set(heads.values())
}

/**
 * Expand a cell list into matrix rows.
 *
 * `sweep` becomes one row per published `@deepseek-ai/dsh` version from
 * `facts.sweepFrom` up, read at run time — so a release published yesterday is
 * in today's rows, and a new tuple the peer ranges do not cover arrives as an
 * admission failure rather than as silence. A version already covered by a
 * named cell in the same plan is not repeated.
 *
 * Named cells always run the boot smoke. Sweep rows run it per `smoke`:
 * `heads` (default) — the floor, the newest version of each tuple and whatever
 * desktop / latest / next / alpha resolve to; `all`; or `none`.
 *
 * @param {string[]} cells
 * @param {{ published: string[], sweepFrom: string, pinned?: string, resolved?: Record<string, string | undefined> }} facts
 * @param {'heads' | 'all' | 'none'} smoke
 * @returns {{ cell: string, smoke: boolean }[]}
 */
export function planCells(cells, facts, smoke = 'heads') {
  if (!['heads', 'all', 'none'].includes(smoke)) throw new Error(`unknown smoke policy ${JSON.stringify(smoke)}`)
  const rows = []
  const seen = new Set()
  const resolved = { pinned: facts.pinned, floor: FLOOR, ...(facts.resolved ?? {}) }
  const push = (cell, runSmoke) => {
    if (seen.has(cell)) return
    seen.add(cell)
    rows.push({ cell, smoke: runSmoke })
  }
  for (const cell of cells) {
    if (cell === 'sweep') continue
    if (!NAMED_CELLS.includes(cell) && !semver.valid(cell)) throw new Error(`unknown cell ${JSON.stringify(cell)}`)
    push(cell, true)
  }
  if (!cells.includes('sweep')) return rows

  const covered = new Set(cells.filter((c) => c !== 'sweep').map((c) => (semver.valid(c) ? c : resolved[c])).filter(Boolean))
  const versions = facts.published.filter((v) => semver.valid(v) && semver.gte(v, facts.sweepFrom)).sort(semver.compare)
  const heads = tupleHeads(versions)
  const notable = new Set([FLOOR, ...Object.values(resolved).filter(Boolean)])
  for (const version of versions) {
    if (covered.has(version)) continue
    push(version, smoke === 'all' || (smoke === 'heads' && (heads.has(version) || notable.has(version))))
  }
  return rows
}

/**
 * The fields of an electron-builder update feed this pipeline reads. The feed
 * folds long scalars (`path: >-` and the value on the next line), which a
 * line-oriented `key: value` read would miss.
 */
export function parseFeed(text) {
  const field = (key) => {
    const match = new RegExp(`^${key}:[ \\t]*(?:>-?[ \\t]*\\r?\\n[ \\t]+)?(\\S+)[ \\t]*$`, 'm').exec(text)
    return match?.[1].replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1')
  }
  const size = /^[ \t]+size:[ \t]*(\d+)/m.exec(text)?.[1]
  return { version: field('version'), path: field('path'), sha512: field('sha512'), releaseDate: field('releaseDate'), size: size === undefined ? undefined : Number(size) }
}

/**
 * Plan the repointing of a manifest at one train, from facts alone.
 *
 * Every `@deepseek-ai/dsh-*` devDependency the train published moves to that
 * exact version. One it never published keeps this repository's pin — the
 * rule the compatibility table has always used for `dsh-client-store` on
 * 0.1.0/0.1.1, whose declarations do not import it — unless the plugin cannot
 * work without it ({@link REQUIRED}, or a harness peer): then it is `missing`,
 * and the train is out of scope. {@link TRAIN_EXTRAS} are added at the train's
 * version when it published them. `@deepseek-ai/cordis` follows what the
 * train's own `@deepseek-ai/dsh` ships, resolved to the exact version that
 * range installs today (`facts.exact`), so a train that moved it is compiled
 * against what it runs and every pin stays exact; `schemastery` is this
 * plugin's own runtime dependency and stays as declared.
 *
 * A repointed copy is installed without the lockfile, so every other
 * devDependency (TypeScript, `@types/*`, esbuild, semver) is pinned at the
 * version `facts.locked` reads from package-lock.json: a TypeScript or
 * `@types/node` released overnight must not turn a train red and have it
 * blamed on the harness. One the lockfile lacks, or holds outside the
 * declared range, is an out-of-date lockfile and throws.
 *
 * @param {object} pkg - the repository manifest.
 * @param {string} version - the exact harness version.
 * @param {{ publishedAt: (name: string) => boolean, shipped?: Record<string, string>, exact?: (name: string, range: string) => string | undefined, locked?: (name: string) => string | undefined }} facts
 * @returns {{ manifest: object, missing: string[], kept: string[], added: string[], locked: string[] }}
 */
export function planRepoint(pkg, version, facts) {
  const manifest = structuredClone(pkg)
  const required = new Set([...REQUIRED, ...harnessPeers(pkg).map(([name]) => name)])
  const missing = []
  const kept = []
  const added = []
  const locked = []
  for (const name of Object.keys(manifest.devDependencies).filter((n) => n.startsWith('@deepseek-ai/dsh-'))) {
    if (facts.publishedAt(name)) manifest.devDependencies[name] = version
    else if (required.has(name)) missing.push(name)
    else kept.push(name)
  }
  if (facts.locked !== undefined) {
    for (const [name, declared] of Object.entries(manifest.devDependencies).filter(([n]) => !n.startsWith('@deepseek-ai/'))) {
      const at = facts.locked(name)
      if (!semver.valid(at) || !semver.satisfies(at, declared)) {
        throw new Error(`package-lock.json ${at === undefined ? 'has no version' : `holds ${at}`} for ${name}@${declared}: run npm install and commit the lockfile`)
      }
      manifest.devDependencies[name] = at
      locked.push(`${name}@${at}`)
    }
  }
  for (const name of TRAIN_EXTRAS) {
    if (!(name in manifest.devDependencies) && facts.publishedAt(name)) {
      manifest.devDependencies[name] = version
      added.push(name)
    }
  }
  const cordis = facts.shipped?.['@deepseek-ai/cordis']
  if (typeof cordis === 'string' && '@deepseek-ai/cordis' in manifest.devDependencies) {
    const exact = semver.valid(cordis) ?? facts.exact?.('@deepseek-ai/cordis', cordis)
    if (semver.valid(exact)) manifest.devDependencies['@deepseek-ai/cordis'] = exact
  }
  return { manifest, missing, kept, added, locked }
}

/**
 * The npm error code a failed npm command reports: the `npm error code X`
 * line (`npm ERR! code X` before npm 9), or the `--json` error object.
 */
export function npmErrorCode(output) {
  const text = String(output)
  return /^npm (?:error|ERR!) code (\S+)/m.exec(text)?.[1] ?? /"code":\s*"([A-Za-z0-9_]+)"/.exec(text)?.[1]
}

/**
 * npm answers that say something about a train's packages: a version it does
 * not have (ETARGET), a package or version it does not have (E404), or a graph
 * that cannot be put together (ERESOLVE). Only these make a train incomplete.
 */
export const UPSTREAM_GAPS = ['ETARGET', 'E404', 'ERESOLVE']

/**
 * The upstream gap a failed install shows, or `undefined` when it shows none:
 * a timeout, a network error (ECONNREFUSED, ETIMEDOUT, EAI_AGAIN, …), a
 * registry fault (E5xx) or anything unrecognised proves nothing about the
 * train.
 * @param {{ ok: boolean, timedOut?: boolean, output: string }} attempt
 */
export function upstreamGap(attempt) {
  if (attempt.ok || attempt.timedOut) return undefined
  const code = npmErrorCode(attempt.output)
  return UPSTREAM_GAPS.includes(code) ? code : undefined
}

// ---------------------------------------------------------------------------
// npm-backed helpers

/**
 * npm could not answer — the registry was unreachable, too slow, or failed.
 * Never evidence about a train: whoever meets one fails loudly rather than
 * reading the silence as "not published".
 */
export class RegistryError extends Error {}

/** How long one `npm view` may take; tests shorten it. */
const VIEW_TIMEOUT_MS = Number(process.env.HARNESS_NPM_VIEW_TIMEOUT_MS || 90_000)

/**
 * `npm view <spec> <field> --json`. `undefined` when npm has the package but
 * not the field, or answers E404 (no such package, or no version matching
 * `spec`). Anything else throws a {@link RegistryError}.
 */
export function view(spec, field) {
  const what = `npm view ${spec} ${field}`
  const r = spawnSync('npm', ['view', spec, field, '--json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: VIEW_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error?.code === 'ETIMEDOUT') throw new RegistryError(`${what}: no answer within ${VIEW_TIMEOUT_MS / 1000} s`)
  if (r.error) throw new RegistryError(`${what} could not run: ${r.error.message}`)
  if (r.status === 0) {
    const out = r.stdout.trim()
    try {
      return out === '' ? undefined : JSON.parse(out)
    } catch {
      throw new RegistryError(`${what} answered something that is not JSON: ${out.slice(0, 200)}`)
    }
  }
  const output = `${r.stdout}${r.stderr}`
  const code = npmErrorCode(output)
  if (code === 'E404') return undefined
  const summary = /"summary":\s*"([^"]*)"/.exec(output)?.[1] ?? tail(output, 1)
  throw new RegistryError(`${what} failed (${code ?? (r.signal ? `killed by ${r.signal}` : `exit ${r.status}`)}): ${summary}`)
}

const published = new Map()
/**
 * Every published version of one package; `[]` only when npm answers E404
 * for the package itself. npm always has the harness, so an empty answer for
 * it is a registry fault and throws.
 */
export function versionsOf(name) {
  if (!published.has(name)) {
    const list = view(name, 'versions')
    const versions = Array.isArray(list) ? list : typeof list === 'string' ? [list] : []
    if (name === HARNESS && versions.length === 0) throw new RegistryError(`npm lists no version of ${HARNESS} — a registry fault, not a fact about any train`)
    published.set(name, versions)
  }
  return published.get(name)
}

/** Why a package is absent at a version: it did not exist yet, or upstream skipped it. */
export function absence(name, version) {
  const all = versionsOf(name)
  if (all.length === 0) return 'never published'
  return all.some((v) => semver.valid(v) && semver.lt(v, version)) ? 'skipped by upstream' : 'predates'
}

/**
 * How long one install may take: npm 11 needs about ten minutes of CPU to
 * settle the slowest peer graph (0.1.1-rc.2's), so this is not tight. Tests
 * shorten it.
 */
export const INSTALL_TIMEOUT_MS = Number(process.env.HARNESS_NPM_INSTALL_TIMEOUT_MS || 15 * 60_000)

/**
 * Run one command; returns `{ ok, timedOut, output }` with stdout and stderr
 * joined. A command still running after `timeout` ms is killed.
 */
export function run(cwd, command, argv, { timeout = INSTALL_TIMEOUT_MS } = {}) {
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout, killSignal: 'SIGKILL' })
  const timedOut = result.error?.code === 'ETIMEDOUT'
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${timedOut ? `\n${command} ${argv[0] ?? ''}: killed after ${timeout / 1000} s` : ''}`
  return { ok: result.status === 0, timedOut, output }
}

/** Last lines of a command's combined output, for a report. */
export function tail(text, lines = 6) {
  return text.trim().split('\n').slice(-lines).join('\n')
}

/**
 * {@link planRepoint} with npm's answers and the lockfile's versions (`lock`,
 * the parsed package-lock.json). `missing` names each absent required package
 * with why it is absent.
 * @returns {{ manifest: object, missing: { name: string, why: string }[], kept: string[], added: string[], locked: string[] }}
 */
export function repointManifest(pkg, version, lock) {
  const plan = planRepoint(pkg, version, {
    locked: (name) => lock.packages?.[`node_modules/${name}`]?.version,
    publishedAt: (name) => versionsOf(name).includes(version),
    shipped: view(`${HARNESS}@${version}`, 'dependencies') ?? {},
    exact: (name, range) => {
      const found = view(`${name}@${range}`, 'version')
      return Array.isArray(found) ? found.filter((v) => semver.valid(v)).sort(semver.compare).at(-1) : found
    },
  })
  return { ...plan, missing: plan.missing.map((name) => ({ name, why: absence(name, version) })) }
}

/** The package whose built assets are the Web shell `dsh web` serves, on every train from 0.0.1-rc.5. */
export const SHELL = '@deepseek-ai/dsh-web-frontend'

/**
 * The specifiers a train's Web shell answers without a graph row: the static
 * module table in {@link SHELL}'s built assets at exactly that version, as
 * the train was released. 0.1.0 and 0.1.1 answer seven specifiers and no
 * `@deepseek-ai/dsh-client-store`; 0.1.5 on answer nine.
 * @returns {{ table: string[], asset: string }}
 */
export function shellModuleTable(version) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-shell-'))
  try {
    const packed = run(dir, 'npm', ['pack', `${SHELL}@${version}`, '--pack-destination', dir, '--no-audit', '--no-fund'], { timeout: 5 * 60_000 })
    const tarball = readdirSync(dir).find((f) => f.endsWith('.tgz'))
    if (!packed.ok || tarball === undefined) {
      const gap = upstreamGap(packed)
      if (gap === 'E404' || gap === 'ETARGET') throw new Error(`${SHELL}@${version} is not on npm (${gap}): there is no shell to read the module table from`)
      throw new RegistryError(`npm pack ${SHELL}@${version} failed (${packed.timedOut ? 'timed out' : npmErrorCode(packed.output) ?? 'no npm error code'}): ${tail(packed.output, 3)}`)
    }
    const unpacked = run(dir, 'tar', ['-xzf', tarball], { timeout: 60_000 })
    if (!unpacked.ok) throw new Error(`cannot unpack ${tarball}: ${tail(unpacked.output, 3)}`)
    const assets = join(dir, 'package', 'dist', 'assets')
    for (const asset of readdirSync(assets).filter((f) => f.endsWith('.js')).sort()) {
      const table = moduleTableOf(readFileSync(join(assets, asset), 'utf8'))
      if (table !== undefined) return { table, asset }
    }
    throw new Error(`no static module table in ${SHELL}@${version}'s dist/assets; this check needs to learn that shell`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Whether `@deepseek-ai/dsh` itself resolves at a version, with nothing of ours involved. */
export function bareHarnessInstalls(version, work) {
  const dir = work ?? mkdtempSync(join(tmpdir(), 'dsh-bare-'))
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'bare', version: '0.0.0', private: true }))
    return run(dir, 'npm', ['install', '--dry-run', '--ignore-scripts', '--no-audit', '--no-fund', `${HARNESS}@${version}`])
  } finally {
    if (work === undefined) rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Install a repointed manifest in `dir` from scratch, the way the train is
 * actually run.
 *
 * Peers are installed on purpose: on 0.1.0–0.1.1 the slot registry is declared
 * by `dsh-client-runtime`, which arrives as a peer of `dsh-client-ui-renderer`.
 * Early trains declare caret peers (`^0.1.1-rc.1`), so npm's automatic peer
 * install can drag in a LATER prerelease of the same tuple whose own peers
 * then conflict with the pinned one (ERESOLVE) — 0.1.1-rc.1 and the 0.1.5 line
 * do. The harness never runs that graph: `@deepseek-ai/dsh` pins every package
 * exactly. So on ERESOLVE the copy is reinstalled in legacy peer mode with
 * every harness peer of the pinned packages pinned at the train's own version,
 * which is the graph a user runs.
 *
 * A failed install makes the train incomplete only when npm's answer is about
 * the packages ({@link UPSTREAM_GAPS}) and a bare install of
 * `@deepseek-ai/dsh` at that version fails with such an answer as well. A
 * conflict this repository causes stays a failure, and so does a network
 * error or a timeout anywhere: those prove nothing about the train.
 *
 * @returns {{ ok: boolean, incomplete: boolean, via: string, output: string, manifest: object }}
 */
export function installTrain(dir, manifest, version) {
  const fresh = () => {
    rmSync(join(dir, 'node_modules'), { recursive: true, force: true })
    rmSync(join(dir, 'package-lock.json'), { force: true })
  }
  const flags = ['--ignore-scripts', '--no-audit', '--no-fund']
  fresh()
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  const first = run(dir, 'npm', ['install', ...flags])
  if (first.ok) return { ok: true, incomplete: false, via: 'peer graph', output: first.output, manifest }

  let last = { attempt: first, via: 'peer graph', output: first.output, manifest }
  if (upstreamGap(first) === 'ERESOLVE') {
    fresh()
    const pinned = structuredClone(manifest)
    // Legacy peer mode installs no peers at all, and some harness packages reach
    // others only as peers (renderer → dsh-client-runtime on 0.1.0–0.1.1). Pin
    // every such harness peer the train published at exactly this version.
    for (const name of Object.keys(manifest.devDependencies).filter((n) => n.startsWith('@deepseek-ai/dsh-'))) {
      if (manifest.devDependencies[name] !== version) continue
      for (const peer of Object.keys(view(`${name}@${version}`, 'peerDependencies') ?? {})) {
        if (!isHarnessPeer(peer) || peer === HARNESS || peer in pinned.devDependencies) continue
        if (versionsOf(peer).includes(version)) pinned.devDependencies[peer] = version
      }
    }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pinned, null, 2) + '\n')
    const second = run(dir, 'npm', ['install', ...flags, '--legacy-peer-deps'])
    const via = `legacy peers, harness peers pinned at ${version} (the peer graph hit ERESOLVE)`
    if (second.ok) return { ok: true, incomplete: false, via, output: second.output, manifest: pinned }
    last = { attempt: second, via, output: `${first.output}\n--- retry in legacy peer mode:\n${second.output}`, manifest: pinned }
  }

  const failed = { ok: false, incomplete: false, via: last.via, manifest: last.manifest }
  if (upstreamGap(last.attempt) === undefined) {
    const why = last.attempt.timedOut ? 'timed out' : npmErrorCode(last.attempt.output) ?? 'no npm error code'
    return { ...failed, output: `${last.output}\n--- ${why}: says nothing about what ${HARNESS}@${version} published, so this is a failure, not an incomplete train` }
  }
  const bare = bareHarnessInstalls(version)
  const gap = upstreamGap(bare)
  const verdict = bare.ok ? 'installs, so the failure is this repository\'s'
    : gap !== undefined ? `fails too (${gap}): published incomplete`
      : `did not answer (${bare.timedOut ? 'timed out' : npmErrorCode(bare.output) ?? 'no npm error code'}), which proves nothing`
  return { ...failed, incomplete: gap !== undefined, output: `${last.output}\n--- bare ${HARNESS}@${version} ${verdict}:\n${tail(bare.output, 12)}` }
}
