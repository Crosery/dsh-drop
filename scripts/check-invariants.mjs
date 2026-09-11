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
// peer range, and nothing below the 0.1.1 floor the README states may be: an
// unverified combination that resolves is the failure this catches, and it is
// invisible to `npm install`.
const VERIFIED_TRAINS = [
  '0.1.1-rc.2', '0.1.2-rc.1', '0.1.2-alpha.5', '0.1.3-alpha.2',
  '0.1.5-rc.1', '0.1.5-rc.2', '0.1.5-alpha.1', '0.1.5-alpha.2',
]
/** Published builds under the documented floor; each must stay out. */
const BELOW_FLOOR = ['0.1.0-rc.2', '0.1.0-rc.6', '0.1.0-rc.8']
for (const [name, range] of Object.entries(pkg.peerDependencies)) {
  if (name === '@deepseek-ai/cordis') continue
  for (const train of VERIFIED_TRAINS) {
    assert.ok(semver.satisfies(train, range), `${name} rejects the verified train ${train}`)
  }
  for (const train of BELOW_FLOOR) {
    assert.ok(!semver.satisfies(train, range), `${name} admits ${train}, which is below the documented floor`)
  }
}
assert.equal(read('CLAUDE.md').trim(), '@AGENTS.md')
for (const file of readdirSync('docs').filter(f => f.endsWith('.md') && !f.endsWith('.zh.md'))) {
  assert.ok(existsSync('docs/' + file.replace('.md','.zh.md')), 'unpaired doc: ' + file)
}
for (const file of ['README.md','README.zh.md']) {
  const text = read(file)
  for (const claim of ['512','64 KiB','0.1.1-rc.2','0.1.5-rc.2','crosery-drop']) assert.ok(text.includes(claim), file + ' omits ' + claim)
}
const shots = JSON.parse(read('screenshots.json'))
assert.ok(Array.isArray(shots) && shots.length >= 1 && shots.length <= 8)
for (const rel of shots) {
  assert.ok(typeof rel === 'string' && !rel.startsWith('/') && !rel.includes('..'))
  assert.ok(existsSync(rel), 'missing screenshot: ' + rel)
}
assert.ok(!read('src/client/DropLightbox.tsx').includes('target="_blank"'), 'untrusted preview navigation')
assert.ok(!/link:|\/Users\//.test(read('package-lock.json')), 'lockfile contains machine-local dependency')
console.log('Invariants OK: locales, peers, public dependencies, manifests, docs, screenshots and preview navigation')
