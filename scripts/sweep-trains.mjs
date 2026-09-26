#!/usr/bin/env node
/**
 * Typecheck and test this repository against every published harness train.
 *
 * For each version of `@deepseek-ai/dsh`, a scratch copy of the working tree
 * is put on that train by the same command a CI cell runs —
 * `node scripts/harness-target.mjs <version> --repoint --install` (see
 * `scripts/harness-lib.mjs` for the rules: every `@deepseek-ai/dsh-*`
 * devDependency the train published moves to it, one it never published keeps
 * this repository's pin unless the plugin needs it, `dsh-client-runtime` rides
 * along where the train has it, cordis follows the train, every other
 * devDependency stays at its package-lock.json version, and a peer graph
 * that hits ERESOLVE is reinstalled in legacy peer mode with the train's own
 * harness peers) — and then runs `npm run typecheck` (all three programs), the
 * bundle check against that train's own shell table and exports
 * (`check-dist.mjs --bundle-only --train <version>`) and `npm test`.
 *
 * Each row also records whether the peer ranges admit the train under both
 * node-semver rules (default, and `includePrerelease` as dsh ≥0.1.7 enforces
 * at install and boot), and with `--resolve-dsh` whether the train's own
 * `@deepseek-ai/dsh` tree resolves at all, so an upstream publish gap is told
 * apart from a plugin bug.
 *
 * Usage:
 *   node scripts/sweep-trains.mjs [--work <dir>] [--jobs <n>] [--resolve-dsh] [version …]
 *
 * With no versions, every published `@deepseek-ai/dsh` version is swept. The
 * scratch copies live under `--work` (a temporary directory by default) and are
 * left in place for inspection; nothing in the repository is modified.
 */

import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { HARNESS, harnessPeers, refusals, versionsOf } from './harness-lib.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * Tracked sources a scratch copy needs. The lockfile only supplies the
 * versions the repoint pins non-harness devDependencies at; the install
 * itself starts without it.
 */
const COPY = ['src', 'tests', 'scripts', 'lib', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.client.json', 'tsconfig.test.json']

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

/** One step of one row: long enough for a slow peer graph plus npm's own retries. */
const STEP_TIMEOUT_MS = 45 * 60_000

/** Run a command, capturing output and exit code; never throws. A hung step is killed and fails its row. */
function exec(cwd, command, argv) {
  return new Promise((resolve) => {
    execFile(command, argv, { cwd, maxBuffer: 64 * 1024 * 1024, timeout: STEP_TIMEOUT_MS, killSignal: 'SIGKILL', env: { ...process.env, npm_config_update_notifier: 'false', GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' } }, (error, stdout, stderr) => {
      const killed = error?.killed ? `\n::error::${command} ${argv[0] ?? ''} killed after ${STEP_TIMEOUT_MS / 60_000} min` : ''
      resolve({ ok: !error, code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, out: `${stdout ?? ''}${stderr ?? ''}${killed}` })
    })
  })
}
const output = (text, key) => new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1]

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const peers = harnessPeers(manifest)

/** Sweep one train. */
async function sweep(version) {
  const row = { version, admitted: '', install: '', typecheck: '', bundle: '', test: '', tests: '', dsh: '', note: '' }
  const refused = refusals(version, peers)
  row.admitted = refused.length === 0 ? 'yes' : refused.some((r) => r.runtime) ? 'partial' : 'no'

  if (resolveDsh) {
    const probe = join(work, `dsh-${version}`)
    await mkdir(probe, { recursive: true })
    await writeFile(join(probe, 'package.json'), JSON.stringify({ name: 'probe', private: true }))
    const { ok, out } = await exec(probe, 'npm', ['install', '--dry-run', '--ignore-scripts', '--no-audit', '--no-fund', `${HARNESS}@${version}`])
    row.dsh = ok ? 'resolves' : `fails: ${(/(ETARGET|ERESOLVE|E404)[^\n]*/.exec(out)?.[0] ?? out.split('\n').find((line) => /ERR!/.test(line)) ?? 'unknown').slice(0, 120)}`
  }

  const dir = join(work, version)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  for (const entry of COPY) await cp(join(root, entry), join(dir, entry), { recursive: true })
  // harness-target.mjs needs semver before it has installed anything; CI's
  // `npm ci` provides it, here this checkout's copy does.
  await mkdir(join(dir, 'node_modules'), { recursive: true })
  await symlink(join(root, 'node_modules', 'semver'), join(dir, 'node_modules', 'semver'), 'dir')

  const target = await exec(dir, process.execPath, ['scripts/harness-target.mjs', version, '--repoint', '--install'])
  if (target.code === 3) {
    // Exit 3 is npm's own answer about the train's packages; a registry that
    // did not answer is exit 1 and lands below as a failure. Only a required
    // package that did not exist yet puts a train out of scope.
    row.install = 'skipped'
    const why = /::notice[^:]*::(.*)$/m.exec(target.out)?.[1] ?? 'incomplete'
    row.note = `${/\(predates\)/.test(why) ? 'out of scope' : 'incomplete upstream'}: ${why}`.slice(0, 240)
    return row
  }
  if (!target.ok) {
    row.install = 'fail'
    row.note = (/::error::(.*)$/m.exec(target.out)?.[1] ?? 'install failed').slice(0, 200)
    await writeFile(join(dir, 'sweep.log'), target.out)
    return row
  }
  const via = output(target.out, 'via') ?? ''
  row.install = via === 'peer graph' ? 'ok' : 'ok (legacy peers)'
  const kept = Object.entries(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).devDependencies)
    .filter(([name, spec]) => name.startsWith('@deepseek-ai/dsh-') && spec !== version).map(([name]) => name.replace('@deepseek-ai/', ''))
  if (kept.length > 0) row.note = `kept pin: ${kept.join(', ')}`

  const typecheck = await exec(dir, 'npm', ['run', 'typecheck'])
  row.typecheck = typecheck.ok ? 'pass' : 'FAIL'
  if (!typecheck.ok) row.note = [row.note, (typecheck.out.split('\n').find((line) => /error TS/.test(line)) ?? '').trim().slice(0, 200)].filter(Boolean).join('; ')
  const bundle = await exec(dir, process.execPath, ['scripts/check-dist.mjs', '--bundle-only', '--train', version])
  row.bundle = bundle.ok ? 'pass' : 'FAIL'
  if (!bundle.ok) row.note = [row.note, (/AssertionError[^\n]*/.exec(bundle.out)?.[0] ?? 'bundle check failed').slice(0, 200)].filter(Boolean).join('; ')
  const test = await exec(dir, 'npm', ['test'])
  row.test = test.ok ? 'pass' : 'FAIL'
  const pass = /ℹ pass (\d+)/.exec(test.out)?.[1]
  const fail = /ℹ fail (\d+)/.exec(test.out)?.[1]
  row.tests = pass === undefined ? '' : `${pass}/${Number(pass) + Number(fail ?? 0)}`
  await writeFile(join(dir, 'sweep.log'), [target.out, typecheck.out, bundle.out, test.out].join('\n\n'))
  return row
}

let requested = args
if (requested.length === 0) {
  try {
    requested = versionsOf(HARNESS)
  } catch (error) {
    console.error(`cannot list the trains to sweep: ${error?.message ?? error}`)
    process.exit(1)
  }
}
const rows = []
const queue = [...requested]
await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
  for (let version = queue.shift(); version !== undefined; version = queue.shift()) {
    const row = await sweep(version)
    rows.push(row)
    console.error(`${version}: install=${row.install} typecheck=${row.typecheck} bundle=${row.bundle} test=${row.test} ${row.note}`)
  }
}))
rows.sort((a, b) => semver.compare(a.version, b.version))

const header = ['Train', 'Peers admit', 'Install', 'Typecheck', 'Bundle', 'Tests', ...(resolveDsh ? ['dsh tree'] : []), 'Note']
const lines = [
  `| ${header.join(' | ')} |`,
  `| ${header.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${[
    row.version, row.admitted, row.install, row.typecheck || '—', row.bundle || '—',
    row.tests || row.test || '—', ...(resolveDsh ? [row.dsh] : []), (row.note || '').replace(/\|/g, '\\|'),
  ].join(' | ')} |`),
]
await writeFile(join(work, 'sweep.json'), `${JSON.stringify(rows, null, 2)}\n`)
await writeFile(join(work, 'sweep.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
console.error(`scratch copies and sweep.json/sweep.md: ${work}`)
const failed = rows.filter((row) => row.typecheck === 'FAIL' || row.bundle === 'FAIL' || row.test === 'FAIL' || row.install === 'fail' || (row.install.startsWith('ok') && row.admitted !== 'yes'))
process.exitCode = failed.length > 0 ? 1 : 0
