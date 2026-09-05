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
assert.equal(read('CLAUDE.md').trim(), '@AGENTS.md')
for (const file of readdirSync('docs').filter(f => f.endsWith('.md') && !f.endsWith('.zh.md'))) {
  assert.ok(existsSync('docs/' + file.replace('.md','.zh.md')), 'unpaired doc: ' + file)
}
for (const file of ['README.md','README.zh.md']) {
  const text = read(file)
  for (const claim of ['512','64 KiB','0.1.1-rc.2','crosery-drop']) assert.ok(text.includes(claim), file + ' omits ' + claim)
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
