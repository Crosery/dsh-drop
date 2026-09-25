import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { SEED_MODULES, inert, installedExports, missingMembers, strictModule } from './smoke-lib.mjs'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))

const args = process.argv.slice(2)
/** Only the browser half against the installed train: no rebuild, no pack. */
const bundleOnly = args.includes('--bundle-only')
/** Another bundle to judge, e.g. an old release's `lib/client.js`. */
const bundlePath = args.includes('--bundle') ? args[args.indexOf('--bundle') + 1] : 'lib/client.js'

/**
 * Judge one client bundle against the loader's module table and the installed
 * seed modules' export names.
 * @param {string} path
 */
function checkBundle(path) {
  const allowed = new Set(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives'])
  const bundle = readFileSync(path, 'utf8')
  for (const m of bundle.matchAll(/require\(["']([^"']+)["']\)/g)) assert.ok(allowed.has(m[1]), 'foreign browser require: ' + m[1])
  assert.ok(!/\bnode:/.test(bundle), 'Node builtin in browser')

  const exportsOf = (name) => installedExports(join(process.cwd(), 'package.json'), name)
  const members = missingMembers(bundle, exportsOf)
  assert.deepEqual(members.unchecked, [], `the bundle reads seed modules whose exports cannot be read here; add them as devDependencies: ${members.unchecked.join(', ')}`)
  assert.deepEqual(members.missing, {}, `the bundle reads members this train does not export: ${JSON.stringify(members.missing)}`)

  const seeds = new Map(SEED_MODULES.map(([, name]) => [name, exportsOf(name)]))
  const misses = []
  let loaded
  vm.runInNewContext(bundle, { window: { __ModuleLoader__: { load({ id, factory }) {
    assert.equal(id, '@crosery/dsh-drop')
    loaded = factory((name) => {
      assert.ok(allowed.has(name), name)
      const seed = seeds.get(name)
      if (seed === undefined) return inert()
      assert.ok(seed.names, `cannot read the exports of ${name}: ${seed.why}`)
      return strictModule(seed.names, inert, misses, name)
    })
  } } } })
  assert.deepEqual(misses, [], `the factory read members this train does not export: ${misses.join(', ')}`)
  assert.equal(typeof loaded.apply, 'function')
  const versions = [...seeds].filter(([, s]) => s.version !== undefined).map(([n, s]) => `${n.replace('@deepseek-ai/', '')}@${s.version}`)
  console.log(`Distribution OK: ${path} requires only module-table specifiers and reads ${members.checked.length === 0 ? 'no seed member' : `only exported members of ${members.checked.join(', ')}`} (${versions.join(', ')})`)
}

// 1. The committed dist is exactly what src/ builds.
//
// The dist is committed on purpose — the official install command is the git
// channel, and pnpm refuses to run a git-hosted package's build scripts unless
// the user pre-approves them in their profile. Shipping the built halves inside
// the repository is what makes that install work with no approval, and this
// check is the price of doing it: a committed artifact that silently disagrees
// with its source is worse than no artifact at all.
//
// The build is byte-deterministic (esbuild and tsc both are, for one input set),
// so a recursive comparison is the honest check. Building into a scratch
// directory rather than in place means a stale tree is reported, not rewritten.
const scratch = bundleOnly ? undefined : mkdtempSync(join(tmpdir(), 'dsh-drop-dist-'))

/** Every file under `dir`, as paths relative to it. */
function filesUnder(dir) {
  const found = []
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry)
      if (statSync(path).isDirectory()) walk(path)
      else found.push(relative(dir, path))
    }
  }
  walk(dir)
  return found.sort()
}

if (scratch !== undefined) try {
  execFileSync(process.execPath, ['scripts/build.mjs', '--outdir', scratch], { stdio: 'inherit' })

  const committed = 'lib'
  assert.ok(existsSync(committed), 'lib/ is not committed — the git install path depends on it')

  const expected = filesUnder(scratch)
  const actual = filesUnder(committed)
  const missing = expected.filter((path) => !actual.includes(path))
  const extra = actual.filter((path) => !expected.includes(path))
  assert.deepEqual(missing, [], `committed lib/ is missing: ${missing.join(', ')}`)
  assert.deepEqual(extra, [], `committed lib/ has files a build does not produce: ${extra.join(', ')}`)

  const stale = expected.filter((path) => !readFileSync(join(scratch, path)).equals(readFileSync(join(committed, path))))
  assert.deepEqual(stale, [], `committed lib/ differs from a fresh build: ${stale.join(', ')} — run \`npm run build\` and commit the result`)

  console.log(`Distribution OK: ${expected.length} committed files match a fresh build`)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

// 2. The browser half only requires specifiers the loader's module table
//    answers, and reads only members the train's seed modules really export.
//
// Accepting any property from a Proxy — what this check used to do — passed
// v0.1.3, whose rail read four icons 0.1.7 renamed: the bundle loaded, and the
// first card rendered `undefined`. Member reads are lazy (`import_x.Name`
// inside components), so the static scan is what catches them; the factory
// run additionally answers every seed module with only its real names. "The
// train" is whatever node_modules holds: the pinned devDependencies here, a
// repointed install in a harness cell (`--bundle-only`).
checkBundle(bundlePath)
if (bundleOnly) process.exit(0)

const folder = mkdtempSync(join(tmpdir(),'dsh-drop-pack-'))
try {
  const result = JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',folder],{encoding:'utf8'}))[0]
  const paths = result.files.map(f => f.path)
  for (const path of ['package.json','cordis.patch.yml','lib/index.js','lib/client.js','lib/types/index.d.ts','lib/types/client/index.d.ts','README.md','README.zh.md','LICENSE','screenshots.json','assets/logo.png']) assert.ok(paths.includes(path), 'missing from pack: ' + path)
  const shots = JSON.parse(readFileSync('screenshots.json','utf8'))
  for (const shot of shots) assert.ok(paths.includes(shot), 'unpacked screenshot: ' + shot)
  assert.ok(!paths.some(p => p.startsWith('src/') || p.includes('node_modules/') || p.endsWith('.map') || p.startsWith('.env')), 'private/development file in pack')
  console.log('Distribution OK: ' + paths.length + ' packed files')
} finally { rmSync(folder,{recursive:true,force:true}) }
