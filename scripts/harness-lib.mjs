/**
 * What the harness trains are, and how to put this repository on one of them.
 *
 * Shared by `harness-target.mjs` (one CI cell at a time) and
 * `sweep-trains.mjs` (every published train, locally). The pure functions at
 * the top take their facts as arguments so `tests/harness.test.ts` can pin
 * them without a network; the npm-backed helpers below them are thin.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import semver from 'semver'

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
 * @param {object} pkg - the repository manifest.
 * @param {string} version - the exact harness version.
 * @param {{ publishedAt: (name: string) => boolean, shipped?: Record<string, string>, exact?: (name: string, range: string) => string | undefined }} facts
 * @returns {{ manifest: object, missing: string[], kept: string[], added: string[] }}
 */
export function planRepoint(pkg, version, facts) {
  const manifest = structuredClone(pkg)
  const required = new Set([...REQUIRED, ...harnessPeers(pkg).map(([name]) => name)])
  const missing = []
  const kept = []
  const added = []
  for (const name of Object.keys(manifest.devDependencies).filter((n) => n.startsWith('@deepseek-ai/dsh-'))) {
    if (facts.publishedAt(name)) manifest.devDependencies[name] = version
    else if (required.has(name)) missing.push(name)
    else kept.push(name)
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
  return { manifest, missing, kept, added }
}

// ---------------------------------------------------------------------------
// npm-backed helpers

/** `npm view <spec> <field> --json`, or `undefined` when npm has nothing. */
export function view(spec, field) {
  try {
    const out = execFileSync('npm', ['view', spec, field, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out.trim() === '' ? undefined : JSON.parse(out)
  } catch {
    return undefined
  }
}

const published = new Map()
/** Every published version of one package. */
export function versionsOf(name) {
  if (!published.has(name)) {
    const list = view(name, 'versions')
    published.set(name, Array.isArray(list) ? list : typeof list === 'string' ? [list] : [])
  }
  return published.get(name)
}

/** Why a package is absent at a version: it did not exist yet, or upstream skipped it. */
export function absence(name, version) {
  const all = versionsOf(name)
  if (all.length === 0) return 'never published'
  return all.some((v) => semver.valid(v) && semver.lt(v, version)) ? 'skipped by upstream' : 'predates'
}

/** Run one command; returns `{ ok, output }` with stdout and stderr joined. */
export function run(cwd, command, argv, extraEnv = {}) {
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', env: { ...process.env, ...extraEnv }, maxBuffer: 64 * 1024 * 1024 })
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

/** Last lines of a command's combined output, for a report. */
export function tail(text, lines = 6) {
  return text.trim().split('\n').slice(-lines).join('\n')
}

/**
 * {@link planRepoint} with npm's answers. `missing` names each absent required
 * package with why it is absent.
 * @returns {{ manifest: object, missing: { name: string, why: string }[], kept: string[], added: string[] }}
 */
export function repointManifest(pkg, version) {
  const plan = planRepoint(pkg, version, {
    publishedAt: (name) => versionsOf(name).includes(version),
    shipped: view(`${HARNESS}@${version}`, 'dependencies') ?? {},
    exact: (name, range) => {
      const found = view(`${name}@${range}`, 'version')
      return Array.isArray(found) ? found.filter((v) => semver.valid(v)).sort(semver.compare).at(-1) : found
    },
  })
  return { ...plan, missing: plan.missing.map((name) => ({ name, why: absence(name, version) })) }
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
 * which is the graph a user runs. Only when a bare install of
 * `@deepseek-ai/dsh` at that version fails as well is the train reported as
 * published incomplete; a conflict this repository causes stays a failure.
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
  if (!/ERESOLVE/.test(first.output)) return { ok: false, incomplete: false, via: 'peer graph', output: first.output, manifest }

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
  const bare = bareHarnessInstalls(version)
  return {
    ok: false,
    incomplete: !bare.ok,
    via,
    output: `${first.output}\n--- retry in legacy peer mode:\n${second.output}\n--- bare ${HARNESS}@${version} ${bare.ok ? 'installs' : 'fails too'}:\n${tail(bare.output, 12)}`,
    manifest: pinned,
  }
}
