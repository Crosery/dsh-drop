import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
const allowed = new Set(['react','react/jsx-runtime','react-dom','react-dom/client','@deepseek-ai/cordis','@deepseek-ai/dsh-client-store','@deepseek-ai/dsh-client-ui-slots','@deepseek-ai/dsh-client-ui-primitives'])
const bundle = readFileSync('lib/client.js','utf8')
for (const m of bundle.matchAll(/require\(["']([^"']+)["']\)/g)) assert.ok(allowed.has(m[1]), 'foreign browser require: ' + m[1])
assert.ok(!/\bnode:/.test(bundle), 'Node builtin in browser')
let loaded
const stub = new Proxy(function(){}, {get: () => stub})
vm.runInNewContext(bundle, {window:{__ModuleLoader__:{load({id,factory}){
  assert.equal(id, '@crosery/dsh-drop')
  loaded = factory(name => { assert.ok(allowed.has(name), name); return stub })
}}}})
assert.equal(typeof loaded.apply,'function')
const folder = mkdtempSync(join(tmpdir(),'dsh-drop-pack-'))
try {
  const result = JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',folder],{encoding:'utf8'}))[0]
  const paths = result.files.map(f => f.path)
  for (const path of ['package.json','cordis.patch.yml','lib/index.js','lib/client.js','lib/types/index.d.ts','lib/types/client/index.d.ts','README.md','README.zh.md','LICENSE','screenshots.json','assets/logo.png']) assert.ok(paths.includes(path), 'missing from pack: ' + path)
  const shots = JSON.parse(readFileSync('screenshots.json','utf8'))
  for (const shot of shots) assert.ok(paths.includes(shot), 'unpacked screenshot: ' + shot)
  assert.ok(!paths.some(p => p.startsWith('src/') || p.includes('node_modules/') || p.endsWith('.map') || p.startsWith('.env')), 'private/development file in pack')
  console.log('Distribution OK: lazy-CJS activation and ' + paths.length + ' packed files')
} finally { rmSync(folder,{recursive:true,force:true}) }
