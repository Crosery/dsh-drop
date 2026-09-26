import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import semver from 'semver'
import { en, zh } from '../src/client/locales.ts'
import { FLOOR, harnessPeers, sweepStart } from './harness-lib.mjs'
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
    assert.ok(!semver.satisfies(train, range), `${name} admits ${train} under the default rule, which is outside the documented support`)
    assert.ok(!semver.satisfies(train, range, { includePrerelease: true }), `${name} admits ${train} under includePrerelease (dsh ≥0.1.7 would load it), which is outside the documented support`)
  }
}
// The CI floor cell and the sweep's start are derived from the same facts.
assert.ok(VERIFIED_TRAINS.includes(FLOOR), `the CI floor ${FLOOR} is not a verified train`)
assert.equal(sweepStart(harnessPeers(pkg)), VERIFIED_TRAINS[0], 'the sweep must start at the oldest verified train')

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
// README facts a user acts on: limits, the supported span and the CI floor,
// the desktop runtime, the settings namespace and entry, the stable asset and
// the desktop install path, and a pinned install of THIS version.
for (const file of ['README.md','README.zh.md']) {
  const text = read(file)
  const claims = ['512', '64 KiB', VERIFIED_TRAINS[0], FLOOR, VERIFIED_TRAINS.at(-1), 'crosery-drop', '`drop`',
    'releases/latest/download/dsh-drop.tgz', `download/v${pkg.version}`, 'folderMaxFiles']
  for (const claim of claims) assert.ok(text.includes(claim), file + ' omits ' + claim)
  assert.ok(file.endsWith('.zh.md') ? text.includes('插件 → 添加插件') : text.includes('Plugins → Add plugin'), file + ' omits the desktop install path')
  for (const stale of text.matchAll(/download\/v(\d+\.\d+\.\d+)/g)) assert.equal(stale[1], pkg.version, file + ' pins a stale release: v' + stale[1])
}
for (const file of ['docs/releasing.md','docs/releasing.zh.md']) {
  for (const stale of read(file).matchAll(/download\/v(\d+\.\d+\.\d+)/g)) assert.equal(stale[1], pkg.version, file + ' pins a stale release: v' + stale[1])
}
for (const file of ['CHANGELOG.md','CHANGELOG.zh.md']) {
  assert.equal(/^## (\S+)/m.exec(read(file))?.[1], pkg.version, file + ' has no entry for ' + pkg.version)
}

// CI wiring the compatibility claims rest on: pull requests gate on the pinned
// train and the floor, the desktop cell runs beside them, and a release is
// gated on those plus the desktop bytes and the full sweep — smoking the very
// tarball it then attaches. The committed dist is compared with a scratch
// build before anything rebuilds lib/ in place.
const ci = read('.github/workflows/ci.yml')
const release = read('.github/workflows/release.yml')
const compat = read('.github/workflows/harness-compat.yml')
assert.match(ci, /uses: \.\/\.github\/workflows\/harness-compat\.yml\s+with:\s+cells: pinned,floor/, 'ci.yml must gate on the pinned and floor cells')
assert.match(ci, /cells: desktop\b/, 'ci.yml must run the desktop cell')
for (const [file, text] of [['ci.yml', ci], ['release.yml', release]]) {
  const command = (name) => new RegExp(`^\\s*(?:- run: )?npm run ${name}\\s*$`, 'm').exec(text)?.index ?? -1
  const dist = command('check:dist')
  const build = command('build')
  assert.ok(dist >= 0 && build > dist, `${file} must run check:dist before npm run build rewrites lib/`)
  assert.match(text.slice(build), /git status --porcelain/, `${file} must refuse a build that changes the committed tree`)
}
assert.match(release, /gate:\s+needs: pack\b/, 'release.yml must pack before its gate')
assert.match(release, /needs: \[pack, gate\]/, 'release.yml must wait for its gate')
assert.match(release, /cells: pinned,floor,desktop,sweep/, 'the release gate must cover pinned, floor, desktop and the sweep')
assert.match(release, /desktop-bytes: true/, 'the release gate must smoke the desktop bytes')
assert.match(release, /tarball: release-asset/, 'the release gate must smoke the packed asset, not a fresh pack of the tree')
assert.match(release, /r\.sha256 !== asset/, 'the release must refuse an asset whose bytes the gate did not smoke')
assert.match(release, /dsh-drop\.tgz SHA256SUMS/, 'a release attaches dsh-drop.tgz and SHA256SUMS')
assert.match(compat, /--tarball "\$TARBALL"/, 'harness-compat.yml must smoke the tarball it is given')
for (const stage of ['smoke-boot.mjs', 'check-dist.mjs --bundle-only', '--admits', 'harness-verdict.cjs', 'desktop-bytes']) assert.ok(compat.includes(stage), 'harness-compat.yml lost ' + stage)
const shots = JSON.parse(read('screenshots.json'))
assert.ok(Array.isArray(shots) && shots.length >= 1 && shots.length <= 8)
for (const rel of shots) {
  assert.ok(typeof rel === 'string' && !rel.startsWith('/') && !rel.includes('..'))
  assert.ok(existsSync(rel), 'missing screenshot: ' + rel)
}
assert.ok(!read('src/client/DropLightbox.tsx').includes('target="_blank"'), 'untrusted preview navigation')
assert.ok(!/link:|\/Users\//.test(read('package-lock.json')), 'lockfile contains machine-local dependency')
console.log('Invariants OK: locales, peers (both semver rules), CI floor and sweep start, public dependencies, bundle purity, manifests, README facts, changelog, CI wiring, docs, screenshots and preview navigation')
