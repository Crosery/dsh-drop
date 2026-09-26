/**
 * The dock rail's side of an early composer (0.0.1-rc.5 – 0.1.0-rc.7): the
 * image intake that stands in for the missing seat, run against the composer's
 * own limits, and the composer's rule for when a drop may land.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  acceptsDrop, addToDraft, draftImageIds, dropLimitsOf, imageLimitsOf, intakeImages,
  type DraftImage, type ImageFile, type ImageIntake, type ImageLimits,
} from '../src/client/early-composer.ts'

/** The limits the early trains' Host publishes by default. */
const LIMITS: ImageLimits = {
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  maxImagesPerMessage: 3,
  maxImageBytes: 5 * 1024 * 1024,
  maxMessageImageBytes: 8 * 1024 * 1024,
}

const MB = 1024 * 1024

function png(name: string, size = 1000, lastModified = 1): ImageFile {
  return { name, size, lastModified, type: 'image/png' }
}

/** The composer's draft images and action face, as the intake reaches them. */
class ComposerModel {
  held: ImageFile[] = []
  created: DraftImage<ImageFile>[] = []
  released: DraftImage<ImageFile>[] = []
  added: string[][] = []
  busy = false
  refuseType = false
  private next = 0

  /** The intake; `null` for a composer whose limits are not published yet. */
  intake(limits: ImageLimits | null = LIMITS): ImageIntake<ImageFile> {
    return {
      limits: limits ?? undefined,
      held: () => this.held,
      create: (files) => {
        if (this.refuseType) throw new Error('unsupported image media type')
        const images = files.map((file) => ({ id: `draft-${this.next++}`, file }))
        this.created.push(...images)
        return images
      },
      add: (ids) => {
        if (this.busy) return false
        this.added.push([...ids])
        this.held.push(...this.created.filter((image) => ids.includes(image.id)).map((image) => image.file))
        return true
      },
      release: (images) => { this.released.push(...images) },
    }
  }
}

describe('imageLimitsOf', () => {
  it('reads the imageLimits projection', () => {
    assert.deepEqual(imageLimitsOf({ ...LIMITS, extra: true }), LIMITS)
  })

  it('answers undefined for anything else', () => {
    assert.equal(imageLimitsOf(undefined), undefined)
    assert.equal(imageLimitsOf({ ...LIMITS, mediaTypes: 'image/png' }), undefined)
    assert.equal(imageLimitsOf({ ...LIMITS, maxImageBytes: '5MB' }), undefined)
  })
})

describe('dropLimitsOf', () => {
  it('puts the count and the per-image size on the invitation', () => {
    assert.deepEqual(dropLimitsOf(LIMITS), { count: 3, size: '5.0 MB' })
    assert.equal(dropLimitsOf(undefined), undefined)
  })
})

describe('intakeImages', () => {
  it('appends new images to the draft, in order, through the action face', () => {
    const composer = new ComposerModel()
    const result = intakeImages(composer.intake(), [png('a.png'), png('b.png')])
    assert.deepEqual(result, { added: 2 })
    assert.deepEqual(composer.added, [['draft-0', 'draft-1']])
  })

  it('skips images the draft already holds, and repeats within the batch', () => {
    const composer = new ComposerModel()
    composer.held = [png('a.png')]
    const result = intakeImages(composer.intake(), [png('a.png'), png('b.png'), png('b.png')])
    assert.deepEqual(result, { added: 1 })
    assert.deepEqual(composer.created.map((image) => image.file.name), ['b.png'])
  })

  it('answers nothing added when every image is already held', () => {
    const composer = new ComposerModel()
    composer.held = [png('a.png')]
    assert.deepEqual(intakeImages(composer.intake(), [png('a.png')]), { added: 0 })
    assert.equal(composer.created.length, 0)
  })

  it('runs the composer checks in its order: type, count, size, total', () => {
    const composer = new ComposerModel()
    const svg = { name: 'x.svg', size: 10, lastModified: 1, type: 'image/svg+xml' }
    assert.deepEqual(intakeImages(composer.intake(), [svg, png('a.png', 9 * MB)]), { refused: 'type' })
    composer.held = [png('h1.png'), png('h2.png')]
    assert.deepEqual(intakeImages(composer.intake(), [png('a.png', 9 * MB), png('b.png')]), { refused: 'count' })
    assert.deepEqual(intakeImages(composer.intake(), [png('a.png', 6 * MB)]), { refused: 'size' })
    composer.held = [png('h1.png', 4 * MB)]
    assert.deepEqual(intakeImages(composer.intake(), [png('a.png', 4.5 * MB)]), { refused: 'total' })
    assert.equal(composer.created.length, 0, 'a refused batch registers nothing')
  })

  it('refuses the whole batch, never a part of it', () => {
    const composer = new ComposerModel()
    const result = intakeImages(composer.intake(), [png('a.png'), png('b.png', 6 * MB)])
    assert.deepEqual(result, { refused: 'size' })
    assert.equal(composer.added.length, 0)
  })

  it('leaves the checks to the service while the limits are unknown', () => {
    const composer = new ComposerModel()
    assert.deepEqual(intakeImages(composer.intake(null), [png('a.png', 50 * MB)]), { added: 1 })
  })

  it('reports a type the service refuses', () => {
    const composer = new ComposerModel()
    composer.refuseType = true
    assert.deepEqual(intakeImages(composer.intake(), [png('a.png')]), { refused: 'type' })
  })

  it('releases the images a busy composer would not take', () => {
    const composer = new ComposerModel()
    composer.busy = true
    const result = intakeImages(composer.intake(), [png('a.png')])
    assert.deepEqual(result, { refused: 'busy' })
    assert.deepEqual(composer.released.map((image) => image.id), ['draft-0'])
  })

  it('reports busy when the service offers no draft images', () => {
    const intake: ImageIntake<ImageFile> = {
      limits: LIMITS, held: () => [], create: () => undefined, add: () => true, release: () => {},
    }
    assert.deepEqual(intakeImages(intake, [png('a.png')]), { refused: 'busy' })
  })
})

describe('acceptsDrop', () => {
  const session = { removed: false, subagent: null }

  it('takes a drop on an idle composer', () => {
    assert.equal(acceptsDrop(session, { phase: 'plain' }), true)
    assert.equal(acceptsDrop(session, { phase: 'claimed' }), true)
    assert.equal(acceptsDrop(undefined, { phase: 'plain' }), true)
  })

  it('refuses while a submission is adjudicated or sent', () => {
    assert.equal(acceptsDrop(session, { phase: 'adjudicating' }), false)
    assert.equal(acceptsDrop(session, { phase: 'submitting' }), false)
  })

  it('refuses without an input state, and on a removed session', () => {
    assert.equal(acceptsDrop(session, undefined), false)
    assert.equal(acceptsDrop({ removed: true }, { phase: 'plain' }), false)
  })

  it('refuses on a continuable subagent only while its parent is offline', () => {
    const offline = { subagent: { address: { mode: 'continuable' }, parentAvailable: false } }
    const online = { subagent: { address: { mode: 'continuable' }, parentAvailable: true } }
    const detached = { subagent: { address: { mode: 'detached' }, parentAvailable: false } }
    assert.equal(acceptsDrop(offline, { phase: 'plain' }), false)
    assert.equal(acceptsDrop(online, { phase: 'plain' }), true)
    assert.equal(acceptsDrop(detached, { phase: 'plain' }), true)
  })
})

describe('draftImageIds', () => {
  it('reads the draft image ids off the input state', () => {
    assert.deepEqual(draftImageIds({ draft: '', imageIds: ['a', 7, 'b'] }), ['a', 'b'])
    assert.deepEqual(draftImageIds({ draft: '' }), [])
    assert.deepEqual(draftImageIds(undefined), [])
  })
})

describe('addToDraft', () => {
  it('calls the action face as a method', () => {
    const face = {
      ids: [] as string[],
      addImages(ids: readonly string[]) {
        this.ids.push(...ids)
        return true
      },
    }
    assert.equal(addToDraft(face, ['a']), true)
    assert.deepEqual(face.ids, ['a'])
  })

  it('answers false without the verb, or when the composer refuses', () => {
    assert.equal(addToDraft(undefined, ['a']), false)
    assert.equal(addToDraft({ setDraft: () => {} }, ['a']), false)
    assert.equal(addToDraft({ addImages: () => false }, ['a']), false)
  })
})
