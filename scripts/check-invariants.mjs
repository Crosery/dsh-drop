import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import semver from 'semver'
import { en, zh } from '../src/client/locales.ts'
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
const read = p => readFileSync(p, 'utf8')
const pkg = JSON.parse(read('package.json'))
assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), 'locale keys disagree')
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.ok(read('cordis.patch.yml').includes(pkg.name), 'patch must name this package')
assert.equal(pkg.dsh.client.platform, 'web')
for (const [name, spec] of Object.entries({...pkg.dependencies,...pkg.devDependencies,...pkg.peerDependencies})) {
  assert.ok(!/^(link:|file:|workspace:|\/)/.test(spec), 'non-public dependency: ' + name)
}
for (const [name, range] of Object.entries(pkg.peerDependencies)) {
  assert.ok(semver.valid(pkg.devDependencies[name]), 'peer needs an exact tested pin: ' + name)
  assert.ok(semver.satisfies(pkg.devDependencies[name], range), 'peer rejects tested pin: ' + name)
}

// The compatibility table and the manifests are two statements of the same
// claim, and only one of them is executable. Every train
// docs/harness-compatibility.md lists as verified must be admitted by each host
// peer range — under BOTH node-semver rules, because dsh ≥0.1.7 checks peers
// with `includePrerelease` at install and at boot while npm and pnpm use the
// default — and nothing outside the documented support may be: an unverified
// combination that resolves is the failure this catches, and it is invisible
// to `npm install`. `scripts/sweep-trains.mjs` produces the verified list.
const VERIFIED_TRAINS = [
  '0.1.0-rc.8',
  '0.1.1-rc.1', '0.1.1-rc.2',
  '0.1.2-alpha.2', '0.1.2-alpha.3', '0.1.2-alpha.4', '0.1.2-alpha.5', '0.1.2-rc.1',
  '0.1.3-alpha.2',
  '0.1.5-alpha.1', '0.1.5-alpha.2', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.5-rc.3',
  '0.1.6-alpha.1', '0.1.6-alpha.2',
  '0.1.7-alpha.1', '0.1.7-alpha.2', '0.1.7-rc.1', '0.1.7-rc.2',
]
/**
 * Published builds outside the support; each must stay out. 0.0.1 and
 * 0.1.0-rc.2–rc.7 predate the composer's attachment seat, and 0.1.8 is
 * admitted only once a sweep has verified it.
 */
const OUTSIDE = [
  '0.0.1-rc.1', '0.0.1-rc.2', '0.0.1-rc.5',
  '0.1.0-rc.2', '0.1.0-rc.3', '0.1.0-rc.6', '0.1.0-rc.7',
  '0.1.8-alpha.0', '0.1.8-rc.0', '0.1.8', '0.2.0',
]
for (const [name, range] of Object.entries(pkg.peerDependencies)) {
  if (name === '@deepseek-ai/cordis') continue
  for (const train of VERIFIED_TRAINS) {
    assert.ok(semver.satisfies(train, range), `${name} rejects the verified train ${train}`)
    assert.ok(semver.satisfies(train, range, { includePrerelease: true }), `${name} rejects ${train} under includePrerelease (dsh ≥0.1.7 install/boot check)`)
  }
  for (const train of OUTSIDE) {
    assert.ok(!semver.satisfies(train, range, { includePrerelease: true }), `${name} admits ${train}, which is outside the documented support`)
  }
}

// The browser bundle must not reach into the UI-primitives module: its icon
// exports were renamed between trains (`IconCloseOutline16` → `…Regular`), and
// a missing export is `undefined` at runtime, which React refuses the moment a
// card renders. The rail draws its glyphs inline instead.
assert.ok(!/require\(["']@deepseek-ai\/dsh-client-ui-primitives["']\)/.test(read('lib/client.js')), 'lib/client.js requires dsh-client-ui-primitives')
for (const file of readdirSync('src/client')) {
  assert.ok(!/from ['"]@deepseek-ai\/dsh-client-ui-primitives['"]/.test(read('src/client/' + file).replace(/import type[^\n]*\n/g, '')), 'value import of primitives in src/client/' + file)
}
assert.equal(read('CLAUDE.md').trim(), '@AGENTS.md')
for (const file of readdirSync('docs').filter(f => f.endsWith('.md') && !f.endsWith('.zh.md'))) {
  assert.ok(existsSync('docs/' + file.replace('.md','.zh.md')), 'unpaired doc: ' + file)
}
for (const file of ['README.md','README.zh.md']) {
  const text = read(file)
  for (const claim of ['512','64 KiB','0.1.1-rc.2','0.1.5-rc.2','0.1.7-rc.2','crosery-drop']) assert.ok(text.includes(claim), file + ' omits ' + claim)
}
const shots = JSON.parse(read('screenshots.json'))
assert.ok(Array.isArray(shots) && shots.length >= 1 && shots.length <= 8)
for (const rel of shots) {
  assert.ok(typeof rel === 'string' && !rel.startsWith('/') && !rel.includes('..'))
  assert.ok(existsSync(rel), 'missing screenshot: ' + rel)
}
assert.ok(!read('src/client/DropLightbox.tsx').includes('target="_blank"'), 'untrusted preview navigation')
assert.ok(!/link:|\/Users\//.test(read('package-lock.json')), 'lockfile contains machine-local dependency')
console.log('Invariants OK: locales, peers (both semver rules), public dependencies, bundle purity, manifests, docs, screenshots and preview navigation')
