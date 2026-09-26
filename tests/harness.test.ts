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
  describeRefusals, gapEvidence, harnessPeers, missingVerdict, npmErrorCode, parseFeed, planCells, planRepoint, refusals, sweepStart, tupleHeads, upstreamGap,
} from '../scripts/harness-lib.mjs'
import {
  NAME_HEADER, ROUTES,
  absentInjects, classifyDiagnostics, exportedNames, inert, maskTokens, membersRead, missingMembers, moduleTableOf, noOpenArgs, onTrain, strictModule,
} from '../scripts/smoke-lib.mjs'
import { BATCH_ROUTE, NAME_HEADER as CONTRACT_NAME_HEADER, RESOLVE_ROUTE, STAGE_ROUTE } from '../src/contract.ts'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  peerDependencies: Record<string, string>
  devDependencies: Record<string, string>
}
const peers = harnessPeers(pkg) as [string, string][]
type Verdict = { failed: string[], incomplete: boolean, green: boolean }
type Issue = { number: number, title: string, state: string, comments: string[] }
type Job = { name: string, conclusion: string | null, steps?: { name: string, conclusion: string | null }[] }
const verdict = createRequire(import.meta.url)('../scripts/harness-verdict.cjs') as {
  (options: { github: unknown, context: unknown, core: unknown, env: Record<string, string> }): Promise<Verdict>
  judge: (env: Record<string, string>) => Verdict
  cellOf: (jobName: string) => string | undefined
  unreported: (options: { github: unknown, context: unknown, core: unknown }) => Promise<{ filed: string[] }>
}
const { judge } = verdict

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
  assert.equal(sweepStart(peers), '0.0.1-rc.0')
  assert.deepEqual(sweepStart([['a', '>=0.1.1-rc.0 <0.1.2-0'], ['b', '>=0.1.0-rc.8 <0.1.2-0']]), '0.1.1-rc.0')
})

test('admission applies both semver rules and names the one that refused', () => {
  // Every published harness version is admitted: CI installs the plugin into each one and runs it.
  for (const version of PUBLISHED) assert.deepEqual(refusals(version, peers), [], version)
  // A wildcard admits a prerelease only when prereleases are included.
  const wide = refusals('0.1.7-rc.2', [['@deepseek-ai/dsh-x', '0.1.x']])
  assert.deepEqual(wide, [{ name: '@deepseek-ai/dsh-x', runtime: true, installer: false }])
  assert.match(describeRefusals(wide)[0]!, /npm\/pnpm peer check fails/)
  assert.doesNotMatch(describeRefusals(wide)[0]!, /refuses to install or load/)
  // The released v0.1.3 ranges stopped at 0.1.6: the 0.1.7 runtime refuses it.
  const old = refusals('0.1.7-rc.2', [['@deepseek-ai/dsh-settings', '>=0.1.1-rc.0 <0.1.2-0 || >=0.1.5-alpha.0 <0.1.6-0']])
  assert.deepEqual(old, [{ name: '@deepseek-ai/dsh-settings', runtime: false, installer: false }])
  // The next tuple is admitted only after a sweep verified it; so is 0.1.4, never published.
  for (const version of ['0.1.8-alpha.0', '0.1.4-alpha.0', '0.0.2-alpha.0']) assert.equal(refusals(version, peers).length, peers.length, version)
})

test('each tuple head is its newest prerelease', () => {
  assert.deepEqual([...tupleHeads(PUBLISHED)].sort(), [
    '0.0.1-rc.5', '0.1.0-rc.8', '0.1.1-rc.2', '0.1.2-rc.1', '0.1.3-alpha.2', '0.1.5-rc.3', '0.1.6-alpha.2', '0.1.7-rc.2',
  ])
})

test('the sweep boots the plugin on every published version by default, from 0.0.1-rc.1', () => {
  const resolved = { desktop: '0.1.7-rc.2', latest: '0.1.5-rc.3', next: '0.1.7-rc.2', alpha: '0.1.7-alpha.2' }
  const rows = planCells(['pinned', 'floor', 'desktop', 'sweep'], { published: PUBLISHED, sweepFrom: sweepStart(peers)!, pinned: '0.1.7-rc.2', resolved })
  // Every published version is a row, once: the three named cells cover 0.1.7-rc.2 and the floor.
  assert.deepEqual(rows.map((r) => r.cell), ['pinned', 'floor', 'desktop', ...PUBLISHED.filter((v) => v !== '0.1.7-rc.2' && v !== FLOOR)])
  assert.ok(rows.every((r) => r.smoke), 'smoke: all is the default, for the weekly sweep and the release gate')
  // The PR gate plans no sweep, so the smoke policy cannot widen it.
  assert.deepEqual(planCells(['pinned', 'floor'], { published: PUBLISHED, sweepFrom: '0.0.1-rc.0' }, 'all'), [
    { cell: 'pinned', smoke: true }, { cell: 'floor', smoke: true },
  ])
})

test('named cells always smoke; the sweep expands to every published version from the start, once', () => {
  const resolved = { desktop: '0.1.7-rc.2', latest: '0.1.5-rc.3', next: '0.1.7-rc.2', alpha: '0.1.7-alpha.2' }
  assert.deepEqual(planCells(['pinned', 'floor'], { published: [], sweepFrom: '0.1.0-rc.8' }), [
    { cell: 'pinned', smoke: true }, { cell: 'floor', smoke: true },
  ])
  const rows = planCells(['pinned', 'floor', 'desktop', 'sweep'], { published: PUBLISHED, sweepFrom: '0.1.0-rc.8', pinned: '0.1.7-rc.2', resolved }, 'heads')
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
  const tomorrow = planCells(['sweep'], { published: [...PUBLISHED, '0.1.8-alpha.1'], sweepFrom: '0.1.0-rc.8' }, 'heads')
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
  // The train ships a cordis range; the pin becomes the exact version it installs.
  const published = (absent: string[]) => ({
    publishedAt: (name: string) => !absent.includes(name),
    shipped: { '@deepseek-ai/cordis': '^4.0.1' },
    exact: (name: string, range: string) => (name === '@deepseek-ai/cordis' && range === '^4.0.1' ? '4.0.4' : undefined),
  })
  const floor = planRepoint(fixture, FLOOR, published(['@deepseek-ai/dsh-client-store'])) as Plan
  assert.deepEqual(floor.missing, [])
  assert.deepEqual(floor.kept, ['@deepseek-ai/dsh-client-store'])
  assert.deepEqual(floor.manifest.devDependencies, {
    '@deepseek-ai/cordis': '4.0.4', '@deepseek-ai/dsh-client-store': '0.1.7-rc.2', '@deepseek-ai/dsh-client-ui-renderer': FLOOR,
    '@deepseek-ai/dsh-settings': FLOOR, typescript: '^5.9.0',
    // The slot registry's 0.1.0–0.1.1 declaration home rides along at the train's version.
    [TRAIN_EXTRAS[0]!]: FLOOR,
  })
  assert.deepEqual(floor.added, TRAIN_EXTRAS)
  // The input manifest is untouched.
  assert.equal(fixture.devDependencies['@deepseek-ai/dsh-settings'], '0.1.7-rc.2')

  // The renderer is not required: a train without it keeps the pin. A peer is.
  const noRenderer = planRepoint(fixture, '0.1.0-rc.7', published(['@deepseek-ai/dsh-client-ui-renderer', ...TRAIN_EXTRAS]))
  assert.deepEqual([noRenderer.missing, noRenderer.kept], [[], ['@deepseek-ai/dsh-client-ui-renderer']])
  const noPeer = planRepoint(fixture, '0.1.9-rc.1', published(['@deepseek-ai/dsh-settings', ...TRAIN_EXTRAS]))
  assert.deepEqual([noPeer.missing, noPeer.added], [['@deepseek-ai/dsh-settings'], []])
  // An exact cordis is taken as is; one that cannot be resolved keeps the pin.
  const exactShipped = planRepoint(fixture, FLOOR, { publishedAt: () => true, shipped: { '@deepseek-ai/cordis': '4.0.2' } }) as Plan
  assert.equal(exactShipped.manifest.devDependencies['@deepseek-ai/cordis'], '4.0.2')
  const unresolved = planRepoint(fixture, FLOOR, { publishedAt: () => true, shipped: { '@deepseek-ai/cordis': '^9.0.0' }, exact: () => undefined }) as Plan
  assert.equal(unresolved.manifest.devDependencies['@deepseek-ai/cordis'], '4.0.4')
})

test('the trains before 0.1.0-rc.8 keep the renderer pin for types, and gain dsh-client-runtime', () => {
  // The real manifest's shape, as the repoint sees it on 0.1.0-rc.2 and 0.0.1-rc.5,
  // with the packages npm answers for there.
  const early = {
    peerDependencies: { '@deepseek-ai/cordis': '^4.0.0', '@deepseek-ai/dsh-home-paths': '*', '@deepseek-ai/dsh-host-webserver': '*', '@deepseek-ai/dsh-settings': '*' },
    devDependencies: Object.fromEntries([
      'api-remotes', 'client-locale', 'client-store', 'client-ui-conversation', 'client-ui-input-trigger', 'client-ui-primitives',
      'client-ui-renderer', 'client-ui-slots', 'home-paths', 'host-webserver', 'settings',
    ].map((name) => [`@deepseek-ai/dsh-${name}`, '0.1.7-rc.2'])),
  }
  // Absent before 0.1.2 (store) and before 0.1.0-rc.8 (renderer); everything else, runtime included, is published.
  const facts = { publishedAt: (name: string) => !['@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-renderer'].includes(name) }
  for (const version of ['0.0.1-rc.5', '0.1.0-rc.2', '0.1.0-rc.7']) {
    const plan = planRepoint(early, version, facts) as { manifest: typeof early, missing: string[], kept: string[], added: string[] }
    assert.deepEqual(plan.missing, [], version)
    assert.deepEqual(plan.kept, ['@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-renderer'], version)
    assert.deepEqual(plan.added, ['@deepseek-ai/dsh-client-runtime'], version)
    assert.equal(plan.manifest.devDependencies['@deepseek-ai/dsh-client-ui-conversation'], version)
    assert.equal(plan.manifest.devDependencies['@deepseek-ai/dsh-client-ui-renderer'], '0.1.7-rc.2')
  }
  // 0.0.1-rc.1 and rc.2 never published dsh-home-paths (first 0.0.1-rc.3), a peer the Host imports: missing.
  const first = planRepoint(early, '0.0.1-rc.1', { publishedAt: (name: string) => !['@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-input-trigger', '@deepseek-ai/dsh-home-paths'].includes(name) })
  assert.deepEqual([first.missing, first.kept], [['@deepseek-ai/dsh-home-paths'], ['@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-input-trigger', '@deepseek-ai/dsh-client-ui-renderer']])
  assert.deepEqual(REQUIRED, ['@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-slots'])
})

test("a train missing what the plugin needs is incomplete only when npm refuses the harness itself, and says why", () => {
  const missing = [{ name: '@deepseek-ai/dsh-home-paths', why: 'predates' }]
  // What npm answers for a bare `npm install @deepseek-ai/dsh@0.0.1-rc.1` today.
  const e404 = [
    'npm error code E404',
    'npm error 404 Not Found - GET https://registry.npmjs.org/@deepseek-ai%2fdsh-agent-tool-mode - Not found',
    'npm error 404',
    "npm error 404  The requested resource '@deepseek-ai/dsh-agent-tool-mode@^0.0.1-rc.1' could not be found or you do not have permission to access it.",
  ].join('\n')
  assert.equal(gapEvidence(e404), 'E404: npm has no @deepseek-ai/dsh-agent-tool-mode@^0.0.1-rc.1')
  assert.equal(gapEvidence(e404.split('\n').slice(0, 2).join('\n')), 'E404: npm has no @deepseek-ai/dsh-agent-tool-mode')
  assert.equal(gapEvidence('npm error code ETARGET\nnpm error notarget No matching version found for @deepseek-ai/dsh-x@0.1.9-rc.1.'), 'ETARGET: @deepseek-ai/dsh-x@0.1.9-rc.1 is not on npm')
  assert.equal(gapEvidence('npm error code ECONNRESET'), undefined)

  const upstream = missingVerdict('0.0.1-rc.1', missing, { ok: false, output: e404 })
  assert.equal(upstream.incomplete, true)
  // The first line is what CI's notice and the sweep's note show: it carries npm's evidence.
  assert.match(upstream.message.split('\n')[0]!, /^@deepseek-ai\/dsh@0\.0\.1-rc\.1 does not install on its own \(E404: npm has no @deepseek-ai\/dsh-agent-tool-mode@\^0\.0\.1-rc\.1\): published incomplete upstream; also not published at 0\.0\.1-rc\.1, and this plugin needs it: @deepseek-ai\/dsh-home-paths \(predates\)$/)
  // A harness that installs while lacking what the plugin needs is drift: the ranges admit it.
  const runnable = missingVerdict('0.1.9-rc.1', missing, { ok: true, output: 'added 900 packages' })
  assert.equal(runnable.incomplete, false)
  assert.match(runnable.message, /installs, yet this train lacks what the plugin needs/)
  // A registry that did not answer proves nothing: a failure, not a neutral cell.
  for (const bare of [{ ok: false, output: 'npm error code ECONNRESET' }, { ok: false, timedOut: true, output: 'npm error code E404' }]) {
    const unknown = missingVerdict('0.0.1-rc.1', missing, bare)
    assert.equal(unknown.incomplete, false)
    assert.match(unknown.message, /did not answer \((ECONNRESET|timed out)\), which proves nothing/)
  }
})

test("only npm's answers about the packages count as an upstream gap", () => {
  const failed = (output: string, timedOut = false) => ({ ok: false, timedOut, output })
  assert.equal(npmErrorCode('npm error code ETARGET\nnpm error notarget No matching version'), 'ETARGET')
  assert.equal(npmErrorCode('npm ERR! code ERESOLVE'), 'ERESOLVE')
  assert.equal(npmErrorCode('{\n  "error": {\n    "code": "E404",\n    "summary": "Not Found"\n  }\n}'), 'E404')
  assert.equal(npmErrorCode('added 12 packages'), undefined)
  for (const code of ['ETARGET', 'E404', 'ERESOLVE']) assert.equal(upstreamGap(failed(`npm error code ${code}`)), code)
  // A registry that does not answer, or answers with a fault, says nothing about a train.
  for (const code of ['ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET', 'E500', 'E503']) assert.equal(upstreamGap(failed(`npm error code ${code}`)), undefined, code)
  assert.equal(upstreamGap(failed('npm error code ETARGET', true)), undefined, 'a timed-out install proves nothing, whatever it printed')
  assert.equal(upstreamGap(failed('npm warn ERESOLVE overriding peer dependency\nnpm error code ECONNRESET')), undefined, 'a peer warning is not the error')
  assert.equal(upstreamGap({ ok: true, output: 'npm error code E404' }), undefined)
})

test('a repointed manifest pins every other devDependency at its lockfile version', () => {
  const fixture = {
    peerDependencies: {},
    devDependencies: { '@deepseek-ai/cordis': '4.0.4', '@deepseek-ai/dsh-client-ui-slots': '0.1.7-rc.2', '@types/node': '^24.0.0', typescript: '^5.9.0' },
  }
  const lock: Record<string, string> = { '@types/node': '24.13.6', typescript: '5.9.3' }
  const facts = (locked: Record<string, string | undefined>) => ({ publishedAt: (name: string) => !TRAIN_EXTRAS.includes(name), locked: (name: string) => locked[name] })
  const plan = planRepoint(fixture, FLOOR, facts(lock)) as { manifest: typeof fixture, locked: string[] }
  // A TypeScript or @types/node published overnight cannot reach the cell.
  assert.deepEqual(plan.manifest.devDependencies, {
    '@deepseek-ai/cordis': '4.0.4', '@deepseek-ai/dsh-client-ui-slots': FLOOR, '@types/node': '24.13.6', typescript: '5.9.3',
  })
  assert.deepEqual(plan.locked, ['@types/node@24.13.6', 'typescript@5.9.3'])
  // An out-of-date lockfile is refused rather than guessed around.
  assert.throws(() => planRepoint(fixture, FLOOR, facts({ ...lock, typescript: undefined })), /has no version for typescript@\^5\.9\.0/)
  assert.throws(() => planRepoint(fixture, FLOOR, facts({ ...lock, typescript: '6.0.3' })), /holds 6\.0\.3 for typescript@\^5\.9\.0/)
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
  assert.equal(moduleTableOf('function f(){return{a:1}}'), undefined)  // The literal in dsh-web-frontend 0.0.1-rc.5 to 0.1.0-rc.7 (index-DYtepzMn.js at 0.0.1-rc.5): ten specifiers.
  const early = 'const F={react:B6,"react/jsx-runtime":Y5,"react-dom":T8,"react-dom/client":E6,"@deepseek-ai/cordis":h6,"@deepseek-ai/dsh-client-ui-slots":D6,'
    + '"@deepseek-ai/dsh-client-web-react":g8,"@deepseek-ai/dsh-client-ui-primitives":im,"@deepseek-ai/dsh-client-ui-attachment":Im,"@deepseek-ai/dsh-client-schema-form":Zm};'
  assert.deepEqual(moduleTableOf(early), [
    'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-web-react', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-attachment', '@deepseek-ai/dsh-client-schema-form',
  ])
})

test('the smoke passes --no-open only where dsh web lists it, and reports an inject target a train lacks', () => {
  // `dsh --profile web --help` on 0.0.1-rc.5 (also 0.1.0-rc.2 to rc.7): no --no-open, which it refuses as unknown.
  const early = [
    'Usage: dsh --profile web [options]', '', 'Serve the DeepSeek Harness browser UI.', '', 'Options:',
    '  --host <host>                  bind host; pass 0.0.0.0 to reach it from', '  --port <port>                  listen port; pass 0 to let the OS pick a free',
    '  -h, --help                     show this help',
  ].join('\n')
  assert.deepEqual(noOpenArgs(early), [])
  // 0.1.7-rc.2's help.
  assert.deepEqual(noOpenArgs(`${early}\n  --no-open                      do not open the Web UI in the default browser`), ['--no-open'])
  assert.deepEqual(noOpenArgs('  --no-opener  something else'), [])

  const inject = ['@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-input-trigger', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-renderer']
  // 0.1.0-rc.2's boot graph: every target but the renderer, first shipped in 0.1.0-rc.8.
  const early010 = new Set(inject.slice(0, 3))
  assert.deepEqual(absentInjects(inject, early010), ['@deepseek-ai/dsh-client-ui-renderer'])
  assert.deepEqual(absentInjects(inject, new Set(inject)), [])
  assert.deepEqual(absentInjects(undefined, new Set()), [])
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

test("a seed installed at another version cannot vouch for a train's exports", () => {
  const names = new Set(['Button'])
  const at = (version: string) => ({ names, version })
  // The pinned checkout judges itself; a cell judges only packages installed at its own version.
  assert.equal(onTrain(at('0.1.7-rc.2'), '@deepseek-ai/dsh-client-ui-primitives', undefined).names, names)
  assert.equal(onTrain(at('0.1.1-rc.2'), '@deepseek-ai/dsh-client-ui-primitives', '0.1.1-rc.2').names, names)
  // dsh-client-store keeps its 0.1.7-rc.2 pin on 0.1.1-rc.2, which never published it.
  const kept = onTrain(at('0.1.7-rc.2'), '@deepseek-ai/dsh-client-store', '0.1.1-rc.2')
  assert.equal(kept.names, undefined)
  assert.match(kept.why!, /installed at 0\.1\.7-rc\.2, not at 0\.1\.1-rc\.2/)
  // Cordis follows the train under its own version numbers.
  assert.equal(onTrain(at('4.0.4'), '@deepseek-ai/cordis', '0.1.1-rc.2').names, names)
  assert.deepEqual(onTrain({ why: 'not installed with this harness' }, '@deepseek-ai/dsh-client-ui-dockkit', '0.1.1-rc.2'), { why: 'not installed with this harness' })
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
  // A stage cut off while the run went on failed; the workflow skips the verdict when the run was cancelled.
  assert.deepEqual(judge({ ...stages, STAGE_smoke: 'cancelled', EXPECTED: expected }).failed, ['smoke'])
  // A step outside the stages (checkout, npm ci, …) failed the job: that is a failure too, named `job`.
  const setup = judge({ STAGE_resolve: '', STAGE_install: '', JOB_STATUS: 'failure', EXPECTED: expected })
  assert.deepEqual([setup.failed, setup.green], [['job'], false])
  assert.deepEqual(judge({ ...stages, STAGE_tests: 'failure', JOB_STATUS: 'failure', EXPECTED: expected }).failed, ['tests'])
  assert.equal(judge({ ...stages, JOB_STATUS: 'success', EXPECTED: expected }).green, true)
  // Admission runs on an incomplete train too, and a refusal there is drift.
  const refusedEarly = judge({ STAGE_resolve: 'success', STAGE_install: 'skipped', STAGE_admission: 'failure', INCOMPLETE: 'true', EXPECTED: expected })
  assert.deepEqual([refusedEarly.failed, refusedEarly.green], [['admission'], false])
})

/** GitHub's REST client as the verdict uses it: issues with their comment bodies, and this run's jobs. */
function fakeGithub(issues: Issue[], jobs: Job[] = []) {
  const calls: string[] = []
  const github = {
    paginate: async (fn: unknown, args: { issue_number?: number }) => {
      if (fn === github.rest.actions.listJobsForWorkflowRun) return jobs
      if (fn === github.rest.issues.listComments) return issues.find((i) => i.number === args.issue_number)!.comments.map((body) => ({ body }))
      return issues.filter((i) => i.state === 'open')
    },
    rest: {
      actions: { listJobsForWorkflowRun: () => undefined },
      issues: {
        listForRepo: () => undefined,
        listComments: () => undefined,
        getLabel: async () => ({}),
        createLabel: async () => { calls.push('createLabel') },
        create: async ({ title, body }: { title: string, body: string }) => { calls.push(`create ${title}`); issues.push({ number: issues.length + 1, title, state: 'open', comments: [body] }) },
        createComment: async ({ issue_number, body }: { issue_number: number, body: string }) => { calls.push(`comment #${issue_number}`); issues.find((i) => i.number === issue_number)!.comments.push(body) },
        update: async ({ issue_number, state }: { issue_number: number, state: string }) => { calls.push(`${state} #${issue_number}`); issues.find((i) => i.number === issue_number)!.state = state },
      },
    },
  }
  return { github, calls }
}
const context = { serverUrl: 'https://github.com', repo: { owner: 'Crosery', repo: 'dsh-drop' }, runId: 1 }
const RUN = 'https://github.com/Crosery/dsh-drop/actions/runs/1'
function fakeCore() {
  const state = { failed: '' }
  const summary = { addHeading: () => summary, addList: () => summary, write: async () => undefined }
  return { core: { summary, setFailed: (m: string) => { state.failed = m } }, state }
}

test('a failing verdict files its cell once per run, naming the run, and a green one closes it', async () => {
  const issues: Issue[] = []
  const { github, calls } = fakeGithub(issues)
  const env = { CELL: 'desktop', VERSION: '0.1.8-rc.1', REPORT: 'true', INCOMPLETE: 'false', EXPECTED: 'types,tests,admission,smoke', STAGE_types: 'success', STAGE_tests: 'success', STAGE_admission: 'failure', STAGE_smoke: 'cancelled' }
  const { core, state } = fakeCore()
  await verdict({ github, context, core, env })
  await verdict({ github, context, core: fakeCore().core, env })
  assert.deepEqual(calls, ['create Harness compatibility broken against @desktop', 'comment #1'])
  assert.match(issues[0]!.comments[0]!, new RegExp(`Run: ${RUN}`))
  assert.match(issues[0]!.comments[0]!, /\*\*smoke\*\* \(cancelled, which counts as failed\)/)
  assert.match(state.failed, /admission, smoke/)
  const green = { ...env, STAGE_admission: 'success', STAGE_smoke: 'success' }
  assert.equal((await verdict({ github, context, core: fakeCore().core, env: green })).green, true)
  assert.deepEqual(calls.slice(2), ['comment #1', 'closed #1'])
  // Not reporting: the job fails, nothing is filed.
  const quiet = fakeGithub([])
  await verdict({ github: quiet.github, context, core: fakeCore().core, env: { ...env, REPORT: 'false' } })
  assert.deepEqual(quiet.calls, [])
})

test('the catch-all knows which jobs are cells', () => {
  assert.equal(verdict.cellOf('harness@floor'), 'floor')
  assert.equal(verdict.cellOf('harness / harness@0.1.2-rc.1'), '0.1.2-rc.1')
  assert.equal(verdict.cellOf('gate / plan'), 'plan')
  assert.equal(verdict.cellOf('harness@desktop-bytes'), 'desktop-bytes')
  for (const other of ['node 24', 'unreported', 'invariants', 'pack']) assert.equal(verdict.cellOf(other), undefined, other)
})

test('the catch-all files every job that ended without a verdict on record, and nothing twice', async () => {
  const issues: Issue[] = [
    // @alpha's verdict ran and filed this run: left alone.
    { number: 4, title: 'Harness compatibility broken against @alpha', state: 'open', comments: ['old', `failed: types\n\nRun: ${RUN}`] },
    // @next is open from an earlier run only: this run's timeout is commented there.
    { number: 5, title: 'Harness compatibility broken against @next', state: 'open', comments: ['from an earlier run'] },
    // The plan works again: its issue closes.
    { number: 6, title: 'Harness compatibility run could not plan its cells', state: 'open', comments: ['earlier'] },
  ]
  const jobs: Job[] = [
    { name: 'plan', conclusion: 'success' },
    { name: 'harness@alpha', conclusion: 'failure' },
    { name: 'harness@next', conclusion: 'cancelled', steps: [{ name: 'Install that train', conclusion: 'cancelled' }] },
    { name: 'harness@desktop-bytes', conclusion: 'failure', steps: [{ name: 'Run actions/checkout@v4', conclusion: 'failure' }] },
    { name: 'harness@0.1.5-rc.3', conclusion: 'timed_out' },
    { name: 'harness@latest', conclusion: 'success' },
    { name: 'harness@0.1.6-alpha.2', conclusion: 'skipped' },
    { name: 'unreported', conclusion: null },
  ]
  const { github, calls } = fakeGithub(issues, jobs)
  const { filed } = await verdict.unreported({ github, context, core: fakeCore().core })
  assert.deepEqual(filed, ['next', 'desktop-bytes', '0.1.5-rc.3'])
  assert.deepEqual(calls, [
    'comment #6', 'closed #6', 'comment #5',
    'create Harness compatibility broken against @desktop-bytes', 'create Harness compatibility broken against @0.1.5-rc.3',
  ])
  assert.match(issues[1]!.comments.at(-1)!, /ended cancelled before its verdict could report[\s\S]*Run: https:[\s\S]*`Install that train` \(cancelled\)/)
  // Run again, the same run: everything is on record now, nothing is filed twice.
  const again = await verdict.unreported({ github, context, core: fakeCore().core })
  assert.deepEqual(again.filed, [])

  const planFailed = fakeGithub([], [{ name: 'plan', conclusion: 'failure' }])
  await verdict.unreported({ github: planFailed.github, context, core: fakeCore().core })
  assert.deepEqual(planFailed.calls, ['create Harness compatibility run could not plan its cells'])
})
