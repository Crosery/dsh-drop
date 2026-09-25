#!/usr/bin/env node
/**
 * Typecheck and test this repository against every published harness train.
 *
 * For each version of `@deepseek-ai/dsh`, a scratch copy of the working tree
 * gets every `@deepseek-ai/dsh-*` devDependency repointed at that exact
 * version, installs, and runs `npm run typecheck` and `npm test`. A package
 * the train never published keeps this repository's pin — the rule the
 * compatibility table has always used for `dsh-client-store` on 0.1.0/0.1.1,
 * which those trains do not import. The one exception is a package the plugin
 * cannot work without: a train missing one of those is out of scope, and the
 * row says which.
 *
 * Each row also records whether the peer ranges admit the train under both
 * node-semver rules (default, and `includePrerelease` as dsh ≥0.1.7 enforces
 * at install and boot), and whether the train's own `@deepseek-ai/dsh` tree
 * resolves at all, so an upstream publish gap is told apart from a plugin bug.
 *
 * Usage:
 *   node scripts/sweep-trains.mjs [--work <dir>] [--jobs <n>] [--resolve-dsh] [version …]
 *
 * With no versions, every published `@deepseek-ai/dsh` version is swept. The
 * scratch copies live under `--work` (a temporary directory by default) and are
 * left in place for inspection; nothing in the repository is modified.
 */

import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import semver from 'semver'

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * Packages without which the plugin has no surface on a train: the slot
 * registry's declaration home from 0.1.0-rc.8, and the composer contract.
 */
const REQUIRED = ['@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-slots']

/**
 * Packages a train declares the plugin's services in without this repository
 * pinning them, because later trains stopped publishing them: on 0.1.0–0.1.1
 * `ctx.slots` is declared by `dsh-client-runtime`, which otherwise arrives only
 * as a peer — and peers are exactly what a `--legacy-peer-deps` install drops.
 * Added to the scratch copy at the train's version when it published one.
 */
const TRAIN_EXTRAS = ['@deepseek-ai/dsh-client-runtime']

/** Tracked sources a scratch copy needs; the lockfile is deliberately absent. */
const COPY = ['src', 'tests', 'scripts', 'package.json', 'tsconfig.json', 'tsconfig.client.json', 'tsconfig.test.json']

const args = process.argv.slice(2)
const flag = (name) => {
  const at = args.indexOf(name)
  if (at < 0) return undefined
  const [, value] = args.splice(at, 2)
  return value
}
const resolveDsh = args.includes('--resolve-dsh')
if (resolveDsh) args.splice(args.indexOf('--resolve-dsh'), 1)
const work = flag('--work') ?? await mkdtemp(join(tmpdir(), 'dsh-drop-sweep-'))
const jobs = Number(flag('--jobs') ?? 4)

/** Run npm, capturing output; never throws. */
async function npm(cwd, ...argv) {
  try {
    const { stdout, stderr } = await run('npm', argv, { cwd, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, npm_config_update_notifier: 'false' } })
    return { ok: true, out: stdout + stderr }
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}` || String(error) }
  }
}

/** Published versions of one package, memoized. */
const published = new Map()
async function versionsOf(name) {
  if (!published.has(name)) {
    published.set(name, npm(root, 'view', name, 'versions', '--json').then(({ ok, out }) => {
      if (!ok) return []
      const parsed = JSON.parse(out.slice(out.indexOf('[')))
      return Array.isArray(parsed) ? parsed : [parsed]
    }))
  }
  return published.get(name)
}

const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const dshDev = Object.keys(manifest.devDependencies).filter((name) => name.startsWith('@deepseek-ai/dsh-'))
const peers = Object.entries(manifest.peerDependencies).filter(([name]) => name !== '@deepseek-ai/cordis')

/** Sweep one train. */
async function sweep(version) {
  const row = { version, admitted: '', repointed: 0, kept: [], install: '', typecheck: '', test: '', tests: '', dsh: '', note: '' }
  const loose = peers.every(([, range]) => semver.satisfies(version, range))
  const strict = peers.every(([, range]) => semver.satisfies(version, range, { includePrerelease: true }))
  row.admitted = loose && strict ? 'yes' : loose || strict ? 'partial' : 'no'

  const missingRequired = []
  const next = structuredClone(manifest)
  for (const name of dshDev) {
    if ((await versionsOf(name)).includes(version)) {
      next.devDependencies[name] = version
      row.repointed += 1
    } else {
      row.kept.push(name.replace('@deepseek-ai/', ''))
      if (REQUIRED.includes(name)) missingRequired.push(name.replace('@deepseek-ai/', ''))
    }
  }
  for (const name of TRAIN_EXTRAS) {
    if ((await versionsOf(name)).includes(version)) next.devDependencies[name] = version
  }
  if (resolveDsh) {
    const probe = join(work, `dsh-${version}`)
    await mkdir(probe, { recursive: true })
    await writeFile(join(probe, 'package.json'), JSON.stringify({ name: 'probe', private: true }))
    const { ok, out } = await npm(probe, 'install', '--dry-run', '--ignore-scripts', '--no-audit', '--no-fund', `@deepseek-ai/dsh@${version}`)
    row.dsh = ok ? 'resolves' : `fails: ${(/(ETARGET|ERESOLVE|E404)[^\n]*/.exec(out)?.[0] ?? out.split('\n').find((line) => /ERR!/.test(line)) ?? 'unknown').slice(0, 120)}`
  }
  if (missingRequired.length > 0) {
    row.install = 'skipped'
    row.note = `out of scope: ${missingRequired.join(', ')} not published`
    return row
  }

  const dir = join(work, version)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  for (const entry of COPY) await cp(join(root, entry), join(dir, entry), { recursive: true })
  await writeFile(join(dir, 'package.json'), `${JSON.stringify(next, null, 2)}\n`)

  // Peers are installed on purpose: on 0.1.0–0.1.1 the slot registry is
  // declared by `dsh-client-runtime`, which arrives only as a peer of
  // `dsh-client-ui-renderer`. `--legacy-peer-deps` is the fallback for a
  // train whose own peer graph does not resolve, and the row says so.
  let install = await npm(dir, 'install', '--ignore-scripts', '--no-audit', '--no-fund')
  row.install = 'ok'
  if (!install.ok && /ERESOLVE/.test(install.out)) {
    install = await npm(dir, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--legacy-peer-deps')
    row.install = 'ok (legacy peers)'
  }
  if (!install.ok) {
    row.install = 'fail'
    row.note = (/(ETARGET|ERESOLVE|E404)[^\n]*/.exec(install.out)?.[0] ?? 'install failed').slice(0, 160)
    return row
  }
  const typecheck = await npm(dir, 'run', 'typecheck')
  row.typecheck = typecheck.ok ? 'pass' : 'FAIL'
  if (!typecheck.ok) row.note = (typecheck.out.split('\n').find((line) => /error TS/.test(line)) ?? '').trim().slice(0, 200)
  const test = await npm(dir, 'test')
  row.test = test.ok ? 'pass' : 'FAIL'
  const pass = /ℹ pass (\d+)/.exec(test.out)?.[1]
  const fail = /ℹ fail (\d+)/.exec(test.out)?.[1]
  row.tests = pass === undefined ? '' : `${pass}/${Number(pass) + Number(fail ?? 0)}`
  await writeFile(join(dir, 'sweep.log'), [install.out, typecheck.out, test.out].join('\n\n'))
  return row
}

const requested = args.length > 0 ? args : (await versionsOf('@deepseek-ai/dsh'))
const rows = []
const queue = [...requested]
await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
  for (let version = queue.shift(); version !== undefined; version = queue.shift()) {
    const row = await sweep(version)
    rows.push(row)
    console.error(`${version}: install=${row.install} typecheck=${row.typecheck} test=${row.test} ${row.note}`)
  }
}))
rows.sort((a, b) => semver.compare(a.version, b.version))

const header = ['Train', 'Peers admit', 'Repointed', 'Kept pin', 'Install', 'Typecheck', 'Tests', ...(resolveDsh ? ['dsh tree'] : []), 'Note']
const lines = [
  `| ${header.join(' | ')} |`,
  `| ${header.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${[
    row.version, row.admitted, String(row.repointed), row.kept.join(', ') || '—', row.install, row.typecheck || '—',
    row.tests || row.test || '—', ...(resolveDsh ? [row.dsh] : []), row.note || '',
  ].join(' | ')} |`),
]
await writeFile(join(work, 'sweep.json'), `${JSON.stringify(rows, null, 2)}\n`)
await writeFile(join(work, 'sweep.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
console.error(`scratch copies and sweep.json/sweep.md: ${work}`)
const failed = rows.filter((row) => row.typecheck === 'FAIL' || row.test === 'FAIL' || (row.install === 'fail'))
process.exitCode = failed.length > 0 ? 1 : 0
