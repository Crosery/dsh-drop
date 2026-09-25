/**
 * The CI harness scripts' pure decisions: which versions a cell list expands
 * to, what the peer ranges admit under each semver rule, how a train is
 * repointed, how a desktop feed is read, how the boot smoke tells this
 * plugin's diagnostics from the train's, which seed-module members a bundle
 * reads that a train no longer exports, and how a cell's stages add up to a
 * verdict. The npm-backed and network parts are exercised by running the
 * scripts, not here.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import {
  FLOOR, REQUIRED, TRAIN_EXTRAS,
  describeRefusals, harnessPeers, parseFeed, planCells, planRepoint, refusals, sweepStart, tupleHeads,
} from '../scripts/harness-lib.mjs'
import {
  NAME_HEADER, ROUTES,
  classifyDiagnostics, exportedNames, inert, maskTokens, membersRead, missingMembers, moduleTableOf, strictModule,
} from '../scripts/smoke-lib.mjs'
import { BATCH_ROUTE, NAME_HEADER as CONTRACT_NAME_HEADER, RESOLVE_ROUTE, STAGE_ROUTE } from '../src/contract.ts'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  peerDependencies: Record<string, string>
  devDependencies: Record<string, string>
}
const peers = harnessPeers(pkg) as [string, string][]
const { judge } = createRequire(import.meta.url)('../scripts/harness-verdict.cjs') as {
  judge: (env: Record<string, string>) => { failed: string[], incomplete: boolean, green: boolean }
}

/** Harness versions in publication order, which is also semver order. */
const PUBLISHED = [
  '0.0.1-rc.1', '0.0.1-rc.2', '0.0.1-rc.5',
  '0.1.0-rc.2', '0.1.0-rc.3', '0.1.0-rc.6', '0.1.0-rc.7', '0.1.0-rc.8',
  '0.1.1-rc.1', '0.1.1-rc.2',
  '0.1.2-alpha.2', '0.1.2-alpha.3', '0.1.2-alpha.4', '0.1.2-alpha.5', '0.1.2-rc.1',
  '0.1.3-alpha.2',
  '0.1.5-alpha.1', '0.1.5-alpha.2', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.5-rc.3',
  '0.1.6-alpha.1', '0.1.6-alpha.2',
  '0.1.7-alpha.1', '0.1.7-alpha.2', '0.1.7-rc.1', '0.1.7-rc.2',
]

test('the sweep starts at the lowest version every harness peer admits', () => {
  assert.equal(sweepStart(peers), '0.1.0-rc.8')
  assert.deepEqual(sweepStart([['a', '>=0.1.1-rc.0 <0.1.2-0'], ['b', '>=0.1.0-rc.8 <0.1.2-0']]), '0.1.1-rc.0')
})

test('admission applies both semver rules and names the one that refused', () => {
  for (const version of ['0.1.1-rc.2', '0.1.5-rc.3', '0.1.7-rc.2', '0.1.7-alpha.2']) assert.deepEqual(refusals(version, peers), [], version)
  // A wildcard admits a prerelease only when prereleases are included.
  const wide = refusals('0.1.7-rc.2', [['@deepseek-ai/dsh-x', '0.1.x']])
  assert.deepEqual(wide, [{ name: '@deepseek-ai/dsh-x', runtime: true, installer: false }])
  assert.match(describeRefusals(wide)[0]!, /npm\/pnpm peer check fails/)
  assert.doesNotMatch(describeRefusals(wide)[0]!, /refuses to install or load/)
  // The released v0.1.3 ranges stopped at 0.1.6: the 0.1.7 runtime refuses it.
  const old = refusals('0.1.7-rc.2', [['@deepseek-ai/dsh-settings', '>=0.1.1-rc.0 <0.1.2-0 || >=0.1.5-alpha.0 <0.1.6-0']])
  assert.deepEqual(old, [{ name: '@deepseek-ai/dsh-settings', runtime: false, installer: false }])
  // The next tuple is admitted only after a sweep verified it.
  assert.equal(refusals('0.1.8-alpha.0', peers).length, peers.length)
})

test('each tuple head is its newest prerelease', () => {
  assert.deepEqual([...tupleHeads(PUBLISHED)].sort(), [
    '0.0.1-rc.5', '0.1.0-rc.8', '0.1.1-rc.2', '0.1.2-rc.1', '0.1.3-alpha.2', '0.1.5-rc.3', '0.1.6-alpha.2', '0.1.7-rc.2',
  ])
})

test('named cells always smoke; the sweep expands to every published version from the start, once', () => {
  const resolved = { desktop: '0.1.7-rc.2', latest: '0.1.5-rc.3', next: '0.1.7-rc.2', alpha: '0.1.7-alpha.2' }
  assert.deepEqual(planCells(['pinned', 'floor'], { published: [], sweepFrom: '0.1.0-rc.8' }), [
    { cell: 'pinned', smoke: true }, { cell: 'floor', smoke: true },
  ])
  const rows = planCells(['pinned', 'floor', 'desktop', 'sweep'], { published: PUBLISHED, sweepFrom: '0.1.0-rc.8', pinned: '0.1.7-rc.2', resolved })
  const exact = (cell: string) => /^\d/.test(cell)
  const swept = rows.filter((r) => exact(r.cell)).map((r) => r.cell)
  // Versions below the start are not swept; ones a named cell covers are not repeated.
  assert.ok(!swept.includes('0.1.0-rc.7') && !swept.includes('0.0.1-rc.5'))
  assert.ok(!swept.includes('0.1.7-rc.2') && !swept.includes(FLOOR))
  assert.equal(swept.length, PUBLISHED.slice(PUBLISHED.indexOf('0.1.0-rc.8')).length - 2)
  const smoked = rows.filter((r) => r.smoke && exact(r.cell)).map((r) => r.cell)
  // Heads of each tuple, plus what latest and alpha resolve to.
  assert.deepEqual(smoked, ['0.1.0-rc.8', '0.1.2-rc.1', '0.1.3-alpha.2', '0.1.5-rc.3', '0.1.6-alpha.2', '0.1.7-alpha.2'])
  // A tuple published tomorrow is swept today without editing anything.
  const tomorrow = planCells(['sweep'], { published: [...PUBLISHED, '0.1.8-alpha.1'], sweepFrom: '0.1.0-rc.8' })
  assert.deepEqual(tomorrow.at(-1), { cell: '0.1.8-alpha.1', smoke: true })
  assert.ok(planCells(['sweep'], { published: PUBLISHED, sweepFrom: '0.1.0-rc.8' }, 'none').every((r) => !r.smoke))
  assert.ok(planCells(['sweep'], { published: PUBLISHED, sweepFrom: '0.1.0-rc.8' }, 'all').every((r) => r.smoke))
  assert.throws(() => planCells(['nightly'], { published: [], sweepFrom: '0.1.0-rc.8' }), /unknown cell/)
  assert.throws(() => planCells(['sweep'], { published: [], sweepFrom: '0.1.0-rc.8' }, 'some' as 'all'), /unknown smoke policy/)
})

test('repointing keeps the pin of a package the train never published, unless the plugin needs it', () => {
  // A fixture, not package.json: the sweep runs this suite inside copies whose
  // manifest is already repointed.
  const range = '>=0.1.0-rc.8 <0.1.8-0'
  const fixture = {
    peerDependencies: { '@deepseek-ai/cordis': '^4.0.0', '@deepseek-ai/dsh-settings': range },
    devDependencies: {
      '@deepseek-ai/cordis': '4.0.4', '@deepseek-ai/dsh-client-store': '0.1.7-rc.2', '@deepseek-ai/dsh-client-ui-renderer': '0.1.7-rc.2',
      '@deepseek-ai/dsh-settings': '0.1.7-rc.2', typescript: '^5.9.0',
    },
  }
  type Plan = { manifest: typeof fixture, missing: string[], kept: string[], added: string[] }
  const published = (absent: string[]) => ({ publishedAt: (name: string) => !absent.includes(name), shipped: { '@deepseek-ai/cordis': '^4.0.1' } })
  const floor = planRepoint(fixture, FLOOR, published(['@deepseek-ai/dsh-client-store'])) as Plan
  assert.deepEqual(floor.missing, [])
  assert.deepEqual(floor.kept, ['@deepseek-ai/dsh-client-store'])
  assert.deepEqual(floor.manifest.devDependencies, {
    '@deepseek-ai/cordis': '^4.0.1', '@deepseek-ai/dsh-client-store': '0.1.7-rc.2', '@deepseek-ai/dsh-client-ui-renderer': FLOOR,
    '@deepseek-ai/dsh-settings': FLOOR, typescript: '^5.9.0',
    // The slot registry's 0.1.0–0.1.1 declaration home rides along at the train's version.
    [TRAIN_EXTRAS[0]!]: FLOOR,
  })
  assert.deepEqual(floor.added, TRAIN_EXTRAS)
  // The input manifest is untouched.
  assert.equal(fixture.devDependencies['@deepseek-ai/dsh-settings'], '0.1.7-rc.2')

  assert.deepEqual(planRepoint(fixture, '0.1.0-rc.7', published([REQUIRED[0]!, ...TRAIN_EXTRAS])).missing, [REQUIRED[0]])
  const noPeer = planRepoint(fixture, '0.1.9-rc.1', published(['@deepseek-ai/dsh-settings', ...TRAIN_EXTRAS]))
  assert.deepEqual([noPeer.missing, noPeer.added], [['@deepseek-ai/dsh-settings'], []])
})

test('a desktop feed is read with its folded path and sha512', () => {
  const sha512 = `${'A'.repeat(86)}==`
  const feed = parseFeed([
    'version: 0.1.7-rc.2',
    'files:',
    '  - url: DeepSeek-Harness-0.1.7-rc.2-arm64-mac.zip',
    `    sha512: ${sha512}`,
    '    size: 372794444',
    'path: >-',
    '  https://download.deepseek.com/dsh-desk/0.1.7-rc.2/DeepSeek-Harness-0.1.7-rc.2-arm64-mac.zip',
    `sha512: ${sha512}`,
    "releaseDate: '2026-09-24T14:10:00.562Z'",
  ].join('\n'))
  assert.deepEqual(feed, {
    version: '0.1.7-rc.2',
    path: 'https://download.deepseek.com/dsh-desk/0.1.7-rc.2/DeepSeek-Harness-0.1.7-rc.2-arm64-mac.zip',
    sha512,
    releaseDate: '2026-09-24T14:10:00.562Z',
    size: 372794444,
  })
})

test('the smoke holds only this plugin to account for boot diagnostics, and masks tokens', () => {
  const stderr = [
    'dsh: skipping profile bundle "@crosery/dsh-drop": incompatible with dsh 0.1.7-rc.2',
    'dsh: warning: 2 entries did not activate',
    '  drop (@crosery/dsh-drop): TypeError: boom',
    '  lsp (@deepseek-ai/dsh-lsp): missing binary',
    '',
    'dsh web: http://127.0.0.1:1/?token=abc.DEF-123',
  ].join('\n')
  const found = classifyDiagnostics(stderr, '@crosery/dsh-drop')
  assert.equal(found.ours.length, 2)
  assert.deepEqual(found.others, ['  lsp (@deepseek-ai/dsh-lsp): missing binary'])
  assert.equal(maskTokens('dsh web: http://h/?token=abc.DEF-123&x=1'), 'dsh web: http://h/?token=***&x=1')
  // 0.1.1 audits by package name alone.
  assert.deepEqual(classifyDiagnostics('1 entries did not activate\n@crosery/dsh-drop: nope\n', '@crosery/dsh-drop').ours, ['@crosery/dsh-drop: nope'])
})

test("the shell's module table is read from its bundle", () => {
  const shell = 'var x=1;function WS(){return{react:a,"react/jsx-runtime":b,"react-dom":c,"@deepseek-ai/cordis":d,"@deepseek-ai/dsh-client-ui-dockkit":e}}'
  assert.deepEqual(moduleTableOf(shell), ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-dockkit'])
  assert.equal(moduleTableOf('function f(){return{a:1}}'), undefined)
})

test("a bundle's reads of a renamed seed export are caught, statically and when the factory runs", () => {
  // What v0.1.3's rail read, against what 0.1.7-rc.2's primitives export.
  const bundle = 'var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");\n'
    + 'const a = import_dsh_client_ui_primitives.IconCloseOutline16; const b = import_dsh_client_ui_primitives2.Button;'
    + 'var import_react = require("react"); import_react.useState;'
  assert.deepEqual([...membersRead(bundle, 'dsh_client_ui_primitives')], ['IconCloseOutline16', 'Button'])
  const names = exportedNames('export { Button, IconCloseRegular as IconCloseRegular, x as IconPlayRegular };')!
  assert.deepEqual([...names], ['Button', 'IconCloseRegular', 'IconPlayRegular'])
  assert.equal(exportedNames('export * from "./a.js"'), undefined)
  const found = missingMembers(bundle, (name) => (name.endsWith('primitives') ? { names } : { why: 'not installed' }))
  assert.deepEqual(found.missing, { '@deepseek-ai/dsh-client-ui-primitives': ['IconCloseOutline16'] })
  assert.deepEqual(found.checked, ['@deepseek-ai/dsh-client-ui-primitives'])
  assert.deepEqual(missingMembers('var import_react = require("react");', () => ({ why: 'x' })).unchecked, [])

  const misses: string[] = []
  const module = strictModule(names, inert, misses, 'primitives') as Record<string, unknown>
  assert.equal(typeof module.Button, 'function')
  assert.equal(module.IconCloseOutline16, undefined)
  assert.deepEqual(misses, ['primitives.IconCloseOutline16'])
  assert.deepEqual(Object.keys(module).sort(), [...names].sort())
})

test('the smoke checks the routes the Host registers', () => {
  assert.deepEqual(ROUTES, { stage: STAGE_ROUTE, resolve: RESOLVE_ROUTE, batch: BATCH_ROUTE })
  assert.equal(NAME_HEADER, CONTRACT_NAME_HEADER)
})

test('a cell is green only when every expected stage succeeded; incomplete is neutral', () => {
  const stages = { STAGE_resolve: 'success', STAGE_install: 'success', STAGE_types: 'success', STAGE_tests: 'success', STAGE_admission: 'success', STAGE_smoke: 'success' }
  const expected = 'types,tests,admission,smoke'
  const ok = judge({ ...stages, EXPECTED: expected })
  assert.deepEqual([ok.failed, ok.green, ok.incomplete], [[], true, false])
  const refused = judge({ ...stages, STAGE_admission: 'failure', EXPECTED: expected })
  assert.deepEqual([refused.failed, refused.green], [['admission'], false])
  // A sweep row without a smoke is green on three stages.
  assert.equal(judge({ ...stages, STAGE_smoke: '', EXPECTED: 'types,tests,admission' }).green, true)
  // A skipped expected stage is not green, and not a failure either.
  assert.deepEqual([judge({ ...stages, STAGE_smoke: 'skipped', EXPECTED: expected }).green, judge({ ...stages, STAGE_smoke: 'skipped', EXPECTED: expected }).failed], [false, []])
  const incomplete = judge({ STAGE_resolve: 'success', STAGE_install: 'success', INCOMPLETE: 'true', EXPECTED: expected })
  assert.deepEqual([incomplete.incomplete, incomplete.green, incomplete.failed], [true, false, []])
})
