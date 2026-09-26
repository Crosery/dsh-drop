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
