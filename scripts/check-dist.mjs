import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { SEED_MODULES, inert, installedExports, missingMembers, onTrain, strictModule } from './smoke-lib.mjs'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))

const args = process.argv.slice(2)
/** Only the browser half against the installed train: no rebuild, no pack. */
const bundleOnly = args.includes('--bundle-only')
/** Another bundle to judge, e.g. an old release's `lib/client.js`. */
const bundlePath = args.includes('--bundle') ? args[args.indexOf('--bundle') + 1] : 'lib/client.js'
/**
 * The exact harness version node_modules was put on (a CI cell, a sweep row).
 * The bundle is then judged by that train's own shell and packages: the
 * module table its `dsh-web-frontend` serves, and only seeds installed at that
 * version. Without it, the pinned checkout is judged by the pinned table.
 */
const train = args.includes('--train') ? args[args.indexOf('--train') + 1] : undefined
if (args.includes('--train') && !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(train ?? '')) throw new Error(`--train needs an exact harness version, not ${JSON.stringify(train)}`)

/** The pinned train's module table, less the dockkit this plugin never requires. */
const PINNED_TABLE = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives']

/**
 * Judge one client bundle against the loader's module table and the installed
 * seed modules' export names.
 * @param {string} path
 */
async function checkBundle(path) {
  let shell = 'the pinned module table'
  let table = PINNED_TABLE
  if (train !== undefined) {
    const { shellModuleTable, SHELL } = await import('./harness-lib.mjs')
    const found = shellModuleTable(train)
    table = found.table
    shell = `the ${table.length}-specifier module table of ${SHELL.replace('@deepseek-ai/', '')}@${train} (${found.asset})`
  }
  const allowed = new Set(table)
  const bundle = readFileSync(path, 'utf8')
  for (const m of bundle.matchAll(/require\(["']([^"']+)["']\)/g)) assert.ok(allowed.has(m[1]), `foreign browser require: ${m[1]} is not in ${shell}`)
  assert.ok(!/\bnode:/.test(bundle), 'Node builtin in browser')

  const exportsOf = (name) => onTrain(installedExports(join(process.cwd(), 'package.json'), name), name, train)
  const members = missingMembers(bundle, exportsOf)
  assert.deepEqual(members.unchecked, [], `the bundle reads seed modules whose exports cannot be read${train === undefined ? '' : ` for ${train}`}: ${members.unchecked.join(', ')} — install them at that train (a devDependency the repoint moves), or stop reading them`)
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
  console.log(`Distribution OK: ${path} requires only specifiers in ${shell} and reads ${members.checked.length === 0 ? 'no seed member' : `only exported members of ${members.checked.join(', ')}`} (${versions.join(', ')})`)
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
// train" is the pinned devDependencies here; a harness cell or sweep row names
// its version (`--bundle-only --train <version>`), and is judged by that
// train's own shell table and by seeds installed at exactly that version.
await checkBundle(bundlePath)
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
