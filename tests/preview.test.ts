/**
 * The preview rail's decisions. Every rule the rail applies — which card a file
 * gets, what type its preview loads under, and what its badge and size read as
 * — is one call into `src/preview.ts`, which is what makes them testable
 * without a DOM.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  dropKindOf, extensionOf, formatDropBytes, kindBadge, looksBinary, mediaTypeFor,
} from '../src/preview.ts'

describe('extensionOf', () => {
  it('reads the last extension, lowercased', () => {
    assert.equal(extensionOf('Report.PDF'), 'pdf')
    assert.equal(extensionOf('archive.tar.gz'), 'gz')
  })

  it('reads through a path', () => {
    assert.equal(extensionOf('/tmp/drops/notes.md'), 'md')
    assert.equal(extensionOf('C:\\Users\\me\\notes.md'), 'md')
  })

  it('treats a leading dot as part of the name, not an extension marker', () => {
    assert.equal(extensionOf('.gitignore'), '')
  })

  it('answers empty for a name with no extension or a trailing dot', () => {
    assert.equal(extensionOf('Makefile'), '')
    assert.equal(extensionOf('weird.'), '')
  })
})

describe('dropKindOf', () => {
  it('classifies the media a browser can render', () => {
    assert.equal(dropKindOf('clip.mp4', 'video/mp4'), 'video')
    assert.equal(dropKindOf('loop.gif', 'image/gif'), 'image')
    assert.equal(dropKindOf('theme.mp3', 'audio/mpeg'), 'audio')
    assert.equal(dropKindOf('spec.pdf', 'application/pdf'), 'pdf')
  })

  it('classifies the office formats no browser renders', () => {
    for (const name of ['plan.docx', 'deck.pptx', 'budget.xlsx', 'notes.pages']) {
      assert.equal(dropKindOf(name, ''), 'document', name)
    }
  })

  it('prefers the extension over an unhelpful declared type', () => {
    // The whole reason the extension is consulted first: a Markdown file
    // arrives typed as text/plain, as text/markdown, or as nothing at all
    // depending on the platform, and only one of those is `text` by prefix.
    assert.equal(dropKindOf('README.md', ''), 'text')
    assert.equal(dropKindOf('README.md', 'application/octet-stream'), 'text')
    assert.equal(dropKindOf('data.json', 'application/octet-stream'), 'text')
  })

  it('falls back to the declared type when the name carries no extension', () => {
    assert.equal(dropKindOf('screenshot', 'image/png'), 'image')
    assert.equal(dropKindOf('recording', 'video/webm'), 'video')
    assert.equal(dropKindOf('bundle', 'application/zip'), 'archive')
  })

  it('answers file when neither source says anything', () => {
    assert.equal(dropKindOf('blob', ''), 'file')
    assert.equal(dropKindOf('data.bin', 'application/octet-stream'), 'file')
  })

  it('does not resolve an extension colliding with an Object.prototype key', () => {
    assert.equal(dropKindOf('report.constructor', ''), 'file')
    assert.equal(dropKindOf('report.toString', ''), 'file')
  })
})

describe('kindBadge', () => {
  it('uppercases the extension', () => {
    assert.equal(kindBadge('plan.docx'), 'DOCX')
    assert.equal(kindBadge('a.pdf'), 'PDF')
  })

  it('answers empty when there is no short extension to show', () => {
    assert.equal(kindBadge('Makefile'), '')
    assert.equal(kindBadge('backup.superlongext'), '')
  })
})

describe('formatDropBytes', () => {
  it('scales to the largest unit that keeps the number small', () => {
    assert.equal(formatDropBytes(512), '512 B')
    assert.equal(formatDropBytes(2048), '2.0 KB')
    assert.equal(formatDropBytes(5 * 1024 * 1024), '5.0 MB')
  })

  it('drops the decimal above ten units so a rail of cards keeps one width', () => {
    assert.equal(formatDropBytes(104 * 1024 * 1024), '104 MB')
  })

  it('answers empty for a size worth no line at all', () => {
    assert.equal(formatDropBytes(0), '')
    assert.equal(formatDropBytes(Number.NaN), '')
    assert.equal(formatDropBytes(-1), '')
  })
})

describe('looksBinary', () => {
  it('recognizes a NUL byte and a failed decode', () => {
    assert.equal(looksBinary('PK\u0003\u0004\u0000\u0000'), true)
    assert.equal(looksBinary('caf\uFFFD'), true)
  })

  it('accepts ordinary text, including non-Latin scripts', () => {
    assert.equal(looksBinary('# Title\n\nbody'), false)
    assert.equal(looksBinary('中文内容'), false)
  })
})

describe('mediaTypeFor', () => {
  it('keeps a type the browser declared', () => {
    // The browser saw the drag; this function did not.
    assert.equal(mediaTypeFor('spec.pdf', 'application/pdf'), 'application/pdf')
    assert.equal(mediaTypeFor('clip.bin', 'video/mp4'), 'video/mp4')
  })

  it('fills a missing type from the extension for renderable formats', () => {
    // A blob URL with no type makes the frame render a PDF as its own source
    // text instead of handing it to the viewer.
    assert.equal(mediaTypeFor('spec.pdf', ''), 'application/pdf')
    assert.equal(mediaTypeFor('clip.mp4', ''), 'video/mp4')
    assert.equal(mediaTypeFor('loop.gif', ''), 'image/gif')
    assert.equal(mediaTypeFor('tone.mp3', ''), 'audio/mpeg')
  })

  it('answers empty when nothing can render the format anyway', () => {
    assert.equal(mediaTypeFor('plan.docx', ''), '')
    assert.equal(mediaTypeFor('bundle.zip', ''), '')
    assert.equal(mediaTypeFor('Makefile', ''), '')
  })
})
