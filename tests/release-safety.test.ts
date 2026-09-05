import assert from 'node:assert/strict'
import { it } from 'node:test'
import { safeStageName } from '../src/contract.ts'
import { mediaTypeFor } from '../src/preview.ts'
it('types a PDF as PDF even if the transfer declares active HTML', () => {
  assert.equal(mediaTypeFor('report.pdf', 'text/html'), 'application/pdf')
  assert.equal(mediaTypeFor('report.pdf', 'image/svg+xml'), 'application/pdf')
})
it('bounds multibyte names and extensions in UTF-8 bytes', () => {
  const name = safeStageName('报告'.repeat(90) + '.' + '文'.repeat(40))
  assert.ok(Buffer.byteLength(name) <= 132)
  assert.ok(!name.includes('�'))
})
