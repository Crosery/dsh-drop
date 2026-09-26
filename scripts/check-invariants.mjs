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
// claim, and only one of them is executable. Every published @deepseek-ai/dsh
// version is admitted by each host peer range — under BOTH node-semver rules,
// because dsh ≥0.1.7 checks peers with `includePrerelease` at install and at
// boot while npm and pnpm use the default — because CI installs the plugin into
// every one of them and runs it (docs/harness-compatibility.md; the sweep and
// the smoke produce the evidence). Nothing unpublished may be admitted: an
// unverified combination that resolves is the failure this catches, and it is
// invisible to `npm install`.
const PUBLISHED_TRAINS = [
  '0.0.1-rc.1', '0.0.1-rc.2', '0.0.1-rc.5',
  '0.1.0-rc.2', '0.1.0-rc.3', '0.1.0-rc.6', '0.1.0-rc.7', '0.1.0-rc.8',
  '0.1.1-rc.1', '0.1.1-rc.2',
  '0.1.2-alpha.2', '0.1.2-alpha.3', '0.1.2-alpha.4', '0.1.2-alpha.5', '0.1.2-rc.1',
  '0.1.3-alpha.2',
  '0.1.5-alpha.1', '0.1.5-alpha.2', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.5-rc.3',
  '0.1.6-alpha.1', '0.1.6-alpha.2',
  '0.1.7-alpha.1', '0.1.7-alpha.2', '0.1.7-rc.1', '0.1.7-rc.2',
]
/**
 * Admitted, but `@deepseek-ai/dsh` itself cannot be installed: it depends on
 * `@deepseek-ai/dsh-agent-tool-mode`, which npm answers E404 for. CI reports
 * them as incomplete upstream; every other published train is installed and run.
 */
const UNINSTALLABLE = ['0.0.1-rc.1', '0.0.1-rc.2']
const INSTALLABLE = PUBLISHED_TRAINS.filter((train) => !UNINSTALLABLE.includes(train))
/**
 * Versions nobody has published, each of which must stay out: the next
 * tuples are admitted only once a sweep has installed and run them, and 0.1.4
 * was never published at all.
 */
const OUTSIDE = [
  '0.0.1-alpha.1', '0.0.2-alpha.0', '0.0.2', '0.1.4-alpha.0', '0.1.4-rc.1', '0.1.4',
  '0.1.8-alpha.0', '0.1.8-rc.0', '0.1.8', '0.2.0-alpha.0', '0.2.0', '1.0.0',
]
for (const [name, range] of Object.entries(pkg.peerDependencies)) {
  if (name === '@deepseek-ai/cordis') continue
  for (const train of PUBLISHED_TRAINS) {
    assert.ok(semver.satisfies(train, range), `${name} rejects the published train ${train}`)
    assert.ok(semver.satisfies(train, range, { includePrerelease: true }), `${name} rejects ${train} under includePrerelease (dsh ≥0.1.7 install/boot check)`)
  }
  for (const train of OUTSIDE) {
    assert.ok(!semver.satisfies(train, range), `${name} admits ${train} under the default rule, which nobody has published or verified`)
    assert.ok(!semver.satisfies(train, range, { includePrerelease: true }), `${name} admits ${train} under includePrerelease (dsh ≥0.1.7 would load it), which nobody has published or verified`)
  }
  // One comparator pair per tuple, closed at the next patch: `>=X <M.m.(p+1)-0`.
  // An open or multi-tuple comparator would admit trains nobody has run.
  for (const set of new semver.Range(range).set) {
    const [low, high] = set
    assert.ok(set.length === 2 && low.operator === '>=' && high.operator === '<', `${name}: ${set.map(String).join(' ')} is not a closed >= … < … pair`)
    const next = `${low.semver.major}.${low.semver.minor}.${low.semver.patch + 1}-0`
    assert.equal(high.semver.version, next, `${name}: ${set.map(String).join(' ')} spans more than the ${low.semver.major}.${low.semver.minor}.${low.semver.patch} tuple`)
  }
}
// The CI floor cell and the sweep's start are derived from the same facts.
assert.ok(INSTALLABLE.includes(FLOOR), `the CI floor ${FLOOR} is not an installable train`)
const start = sweepStart(harnessPeers(pkg))
assert.ok(semver.lte(start, PUBLISHED_TRAINS[0]), `the sweep must start at or below the oldest published train ${PUBLISHED_TRAINS[0]}, not ${start}`)

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
  const claims = ['512', '64 KiB', INSTALLABLE[0], FLOOR, INSTALLABLE.at(-1), 'crosery-drop', '`drop`',
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
for (const stage of ['smoke-boot.mjs', 'check-dist.mjs --bundle-only --train "$VERSION"', '--admits', 'harness-verdict.cjs', 'desktop-bytes', "harness-verdict.cjs').unreported("]) assert.ok(compat.includes(stage), 'harness-compat.yml lost ' + stage)
// The catch-all needs the run's job list; a caller cannot grant a called workflow less than it declares.
assert.match(compat, /unreported:\s+needs: \[plan, against, desktop-bytes\][\s\S]*?actions: read/, 'the unreported job must follow every job and read the run\'s jobs')
for (const [file, text] of [['ci.yml', ci], ['release.yml', release]]) {
  for (const call of text.split(/\n(?=  \S)/).filter((job) => job.includes('uses: ./.github/workflows/harness-compat.yml'))) {
    assert.match(call, /actions: read/, `${file} must grant actions: read to every harness-compat call`)
  }
}
const shots = JSON.parse(read('screenshots.json'))
assert.ok(Array.isArray(shots) && shots.length >= 1 && shots.length <= 8)
for (const rel of shots) {
  assert.ok(typeof rel === 'string' && !rel.startsWith('/') && !rel.includes('..'))
  assert.ok(existsSync(rel), 'missing screenshot: ' + rel)
}
assert.ok(!read('src/client/DropLightbox.tsx').includes('target="_blank"'), 'untrusted preview navigation')
assert.ok(!/link:|\/Users\//.test(read('package-lock.json')), 'lockfile contains machine-local dependency')
console.log('Invariants OK: locales, peers (both semver rules), CI floor and sweep start, public dependencies, bundle purity, manifests, README facts, changelog, CI wiring, docs, screenshots and preview navigation')
