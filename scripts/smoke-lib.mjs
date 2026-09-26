/**
 * The pure parts of `smoke-boot.mjs` and of the module-table check in
 * `check-dist.mjs`, kept free of dependencies: the smoke also runs under the
 * desktop app's own Electron binary against a checkout with no `node_modules`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * The Host routes this plugin registers, and the header a single-file stage
 * carries. A wire contract: `tests/harness.test.ts` holds these equal to
 * `src/contract.ts`, which the smoke cannot import (it runs without a build
 * step, under whatever Node the harness brings).
 */
export const ROUTES = {
  stage: '/crosery/dsh-drop/stage',
  resolve: '/crosery/dsh-drop/resolve',
  batch: '/crosery/dsh-drop/batch',
}
export const NAME_HEADER = 'x-dsh-drop-name'

/**
 * Harness seed modules a client bundle may require, with the binding name
 * esbuild gives each (`import_<binding>N`). Their members are checked against
 * the export names the train actually publishes: a read of a renamed export
 * is `undefined` at render, not an error at load.
 */
export const SEED_MODULES = [
  ['dsh_client_ui_primitives', '@deepseek-ai/dsh-client-ui-primitives'],
  ['dsh_client_ui_slots', '@deepseek-ai/dsh-client-ui-slots'],
  ['dsh_client_store', '@deepseek-ai/dsh-client-store'],
  ['dsh_client_ui_dockkit', '@deepseek-ai/dsh-client-ui-dockkit'],
  ['cordis', '@deepseek-ai/cordis'],
]

/**
 * The flag that keeps `dsh web` from opening a browser, where this train's
 * `dsh --profile web --help` lists it. The early trains (0.0.1-rc.5 to
 * 0.1.0-rc.7) never open one and refuse the flag as unknown.
 * @param {string} help - the help text, stdout and stderr joined.
 */
export function noOpenArgs(help) {
  return /--no-open\b/.test(String(help)) ? ['--no-open'] : []
}

/**
 * The `dsh.client.inject` targets a boot graph does not carry. Reported, never
 * a failure: the client module system documents these edges as informational
 * graph metadata — a fiber waits on the services its entry injects, not on
 * package names — and `dsh-client-ui-renderer` is absent before 0.1.0-rc.8.
 * Whether the plugin still loads is for the later stages to show.
 * @param {string[] | undefined} inject
 * @param {{ has: (id: string) => boolean }} entries - the graph's entry ids.
 */
export function absentInjects(inject, entries) {
  return (inject ?? []).filter((name) => !entries.has(name))
}

/**
 * The `--before` that installs a harness train as released, from the `time`
 * map `npm view @deepseek-ai/dsh time --json` answers: one second after the
 * train's own `@deepseek-ai/dsh` went out, or `undefined` for the newest
 * version, which a user installs today.
 *
 * Not the next harness's publication: `@deepseek-ai/dsh` lists its packages
 * with caret ranges (`^0.1.6-alpha.1`), which accept the next prerelease of
 * the same tuple, and a train's packages go out minutes before its own
 * `@deepseek-ai/dsh`. A cutoff at the next harness therefore took the next
 * train's packages — 0.1.6-alpha.1 got 0.1.6-alpha.2's `dsh-app-boot` and
 * could not start. A package of this train published after the cutoff is
 * refused by npm and moves it later (`laterCutoff` in smoke-boot.mjs).
 * @param {Record<string, string>} times
 * @param {string} version
 */
export function releaseCutoff(times, version) {
  const own = times[version]
  if (own === undefined) throw new Error(`@deepseek-ai/dsh@${version} is not on npm`)
  if (laterHarnessVersions(times, version).size === 0) return undefined
  return new Date(Date.parse(own) + 1000).toISOString()
}

/** The `@deepseek-ai/dsh` versions published after `version`, from the same `time` map. */
export function laterHarnessVersions(times, version) {
  const own = times[version]
  return new Set(Object.entries(times).filter(([key, at]) => key !== 'created' && key !== 'modified' && at > own).map(([key]) => key))
}

/**
 * The package, and the version when npm names one, that an install with
 * `--before` refused as not yet published then: `No matching version found for
 * <name>@<range> with a date before …` (ETARGET), or `No versions available for
 * <name>` (ENOVERSIONS) when the package had no version at all by then —
 * 0.0.1-rc.5's `dsh-shell`, first published 96 s after its `@deepseek-ai/dsh`.
 * `undefined` for any other failure.
 * @param {string} output
 * @returns {{ name: string, version?: string } | undefined}
 */
export function refusedAsUnpublished(output) {
  const matching = /No matching version found for (@?[^@\s]+)@(\S+?) with a date before/.exec(output)
  if (matching !== null) return { name: matching[1], version: matching[2].replace(/^[\^~=v]+/, '') }
  const none = /No versions available for (@?[^@\s]+?)\.?(?:\s|$)/.exec(output)
  return none === null ? undefined : { name: none[1] }
}

/**
 * Installed harness packages (`[name, version]`) at a version of a later
 * harness train: what a caret range let into a graph meant to be the train as
 * released. Such a graph is not that train, and a smoke on it proves nothing
 * about it.
 * @param {[string, string][]} installed
 * @param {Set<string>} later - from {@link laterHarnessVersions}.
 */
export function strayPackages(installed, later) {
  return installed.filter(([name, version]) => (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) && later.has(version))
}

/** A `dsh web` URL carries a one-time session token; nothing this repo prints may. */
export function maskTokens(text) {
  return String(text).replace(/token=[\w.~%-]+/g, 'token=***')
}

/**
 * Split a harness's stderr into what is this plugin's problem and what is not.
 *
 * - `skipping profile bundle "<name>"` (dsh ≥0.1.7 boot), `installation
 *   rejected` / `incompatible with dsh` (dsh ≥0.1.7 `plugin add`): in a home
 *   that holds only this plugin these can only be about it.
 * - the startup audit, `N entries did not activate` followed by one line per
 *   entry — `<name>: …` up to 0.1.1, `<id> (<name>): …` from 0.1.7: a line
 *   naming this package is ours; any other is the train's own entry, reported
 *   but not held against the plugin.
 */
export function classifyDiagnostics(stderr, packageName) {
  const ours = []
  const others = []
  let inAudit = false
  for (const raw of String(stderr).split('\n')) {
    const line = maskTokens(raw).slice(0, 600)
    if (/skipping profile bundle|installation rejected|incompatible with dsh/.test(line)) { ours.push(line); continue }
    if (/did not activate/.test(line)) {
      inAudit = true
      if (line.includes(packageName)) ours.push(line)
      continue
    }
    if (!inAudit) continue
    if (line.trim() === '') { inAudit = false; continue }
    ;(line.includes(packageName) ? ours : others).push(line)
  }
  return { ours, others }
}

/**
 * Specifiers a Web shell answers without a graph row, read from the shell's
 * own bundle: the loader's static module table is an object literal whose keys
 * are the specifiers (`{react:…,"react/jsx-runtime":…,…}` — `Jd()` in 0.1.1,
 * `WS()` in 0.1.7). `undefined` when no such literal is found.
 */
export function moduleTableOf(source) {
  const literal = /\{((?:react|"react"):[^{}]*?"react\/jsx-runtime":[^{}]*)\}/.exec(source)
  if (literal === null) return undefined
  return [...literal[1].matchAll(/(?:^|,)\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/g)].map((m) => m[1] ?? m[2])
}

/** Named members a CommonJS bundle reads off one required module (`import_<binding>N.Member`). */
export function membersRead(source, binding) {
  return new Set([...source.matchAll(new RegExp(`\\bimport_${binding}\\d*\\.([A-Za-z_$][\\w$]*)`, 'g'))].map((m) => m[1]))
}

/** Names an ES module's `export { … }` clauses publish; `undefined` when it re-exports `*`. */
export function exportedNames(text) {
  if (/export\s*\*/.test(text)) return undefined
  return new Set([...text.matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean)))
}

/**
 * The export names of an installed harness package, resolved the way `from`
 * (a file path) would resolve it: `{ names }`, or `{ why }` when they cannot be
 * read — not installed with this harness (up to 0.1.1 the shell bundles some
 * seeds instead of installing them), or an entry that re-exports `*`.
 * @param {string} from
 * @param {string} name
 */
export function installedExports(from, name) {
  const lookup = createRequire(from)
  const dir = (lookup.resolve.paths(name) ?? []).map((base) => join(base, name)).find((d) => existsSync(join(d, 'package.json')))
  if (dir === undefined) return { why: 'not installed with this harness' }
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const main = manifest.exports?.['.']?.browser ?? manifest.exports?.['.']?.default ?? manifest.exports?.['.'] ?? manifest.main
  const names = exportedNames(readFileSync(join(dir, typeof main === 'string' ? main : 'lib/index.js'), 'utf8'))
  return names === undefined ? { why: 're-exports *' } : { names, version: manifest.version }
}

/**
 * Hold a seed module's installed exports to one train. A harness package
 * (`@deepseek-ai/dsh-*`) installed at another version — a pin kept because the
 * train never published it, or a checkout not put on that train — cannot vouch
 * for what the train serves, so it is unchecked rather than trusted. Cordis
 * follows the train under its own version numbers and is taken as installed.
 * @param {{ names?: Set<string>, why?: string, version?: string }} found
 * @param {string} name
 * @param {string | undefined} train - the exact harness version, or none for the pinned checkout.
 */
export function onTrain(found, name, train) {
  if (train === undefined || found.names === undefined || !name.startsWith('@deepseek-ai/dsh-') || found.version === train) return found
  return { why: `installed at ${found.version}, not at ${train}, so it cannot vouch for that train` }
}

/**
 * Every harness seed member a bundle reads that the train does not export.
 * @param {string} source - the CommonJS client bundle.
 * @param {(name: string) => { names?: Set<string>, why?: string }} exportsOf
 * @returns {{ missing: Record<string, string[]>, unchecked: string[], checked: string[] }}
 */
export function missingMembers(source, exportsOf) {
  const missing = {}
  const unchecked = []
  const checked = []
  for (const [binding, name] of SEED_MODULES) {
    const used = membersRead(source, binding)
    if (used.size === 0) continue
    const found = exportsOf(name)
    if (found.names === undefined) { unchecked.push(`${name} (${found.why ?? 'unknown'})`); continue }
    checked.push(name)
    const absent = [...used].filter((member) => !found.names.has(member))
    if (absent.length > 0) missing[name] = absent
  }
  return { missing, unchecked, checked }
}

/**
 * A module object for a factory run that answers only the names a module
 * really exports. Anything else is recorded in `misses` and reads as
 * `undefined` — what the browser would hand the bundle. `inert` stands in for
 * an existing member's value.
 * @param {Set<string>} names
 * @param {() => unknown} inert
 * @param {string[]} misses
 * @param {string} name - module name, for the record.
 */
export function strictModule(names, inert, misses, name) {
  return new Proxy({}, {
    get(_target, key) {
      if (typeof key === 'symbol' || key === '__esModule') return key === '__esModule' ? true : undefined
      if (names.has(key)) return inert()
      if (key === 'then' || key === 'default') return undefined
      misses.push(`${name}.${key}`)
      return undefined
    },
    has: (_target, key) => typeof key === 'string' && names.has(key),
    // esbuild's `__toESM` copies own properties; answer with the real names.
    ownKeys: () => [...names],
    getOwnPropertyDescriptor: (_target, key) => (typeof key === 'string' && names.has(key)
      ? { configurable: true, enumerable: true, writable: false, value: inert() }
      : undefined),
  })
}

/** A value that answers every use without doing anything: react, react-dom and unchecked seeds. */
export function inert() {
  return new Proxy(function () {}, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => '' : key === '__esModule' ? true : inert()),
    apply: () => inert(),
    construct: () => inert(),
  })
}
