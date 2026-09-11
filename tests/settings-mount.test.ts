/**
 * The settings mount over both published settings APIs.
 *
 * 0.1.2 moved the mount from a package export (`installSettingsSection`) to a
 * service method (`ctx.settings.installSection`) and deleted the
 * `settingsNamespace` brand constructor with it. The plugin must work on both
 * trains from one build, so the adapter is what these cases pin: installing a
 * static import of the removed export is what made the entire host entry fail
 * to load, so an unrecognized API must degrade to the composition entry rather
 * than throw during activation.
 *
 * The service doubles below model only what the adapter touches — the real
 * methods are exercised against the published packages by the harness
 * compatibility job, which installs a train's actual `dsh-settings`.
 */

import { deepEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'
import { mountSettingsSection, DROP_NAMESPACE, type SettingsHooks } from '../src/index.ts'
import { DropSettingsSchema } from '../src/settings.ts'
import { DEFAULT_KEEP_DAYS, DEFAULT_MAX_BYTES, type DropSettings } from '../src/contract.ts'

const ENTRY: DropSettings = { maxBytes: DEFAULT_MAX_BYTES, keepDays: DEFAULT_KEEP_DAYS }

/** Hooks that record what the adapter did, standing in for the plugin body. */
function recorder(): { hooks: SettingsHooks; changes: () => number; value: () => DropSettings } {
  let current = (): DropSettings => ENTRY
  let changes = 0
  return {
    hooks: {
      setSource: (next) => { current = next },
      onChange: () => { changes += 1 },
      validate: () => {},
    },
    changes: () => changes,
    value: () => current(),
  }
}

/**
 * A context that injects a settings service shaped like one train's.
 * @param service - the `settings` value the injection scope exposes.
 */
function ctxWith(service: unknown): { ctx: never; cleanups: (() => void)[]; fiber: { state: number } } {
  const cleanups: (() => void)[] = []
  const fiber = { state: 2 }
  const scoped = {
    settings: service,
    effect: (body: () => () => void) => { cleanups.push(body()) },
  }
  const ctx = {
    fiber,
    inject: (_names: string[], callback: (scope: unknown) => void) => { callback(scoped) },
  } as never
  return { ctx, cleanups, fiber }
}

test('the settings mount names the namespace it owns', () => {
  equal(DROP_NAMESPACE, 'crosery-drop')
})

test('on the 0.1.2 API the mount hands the service the schema, the entry config and the hooks', () => {
  const calls: unknown[][] = []
  const { ctx } = ctxWith({
    installSection: (...args: unknown[]) => { calls.push(args) },
  })
  const { hooks } = recorder()
  mountSettingsSection(ctx, ENTRY, hooks)
  equal(calls.length, 1, 'installSection must be called exactly once')
  const [owner, ns, schema, entry, passed] = calls[0] as unknown[]
  equal(ns, DROP_NAMESPACE)
  equal(schema, DropSettingsSchema)
  equal(entry, ENTRY)
  equal(passed, hooks, 'the caller owns the hooks; the service must not receive a copy')
  ok(owner !== undefined, 'the owner context rides along, so unload can suppress fallback work')
})

test('on the pre-0.1.2 API the mount still reaches the resolved section and follows writes', () => {
  let scopeValue: DropSettings = { ...ENTRY, keepDays: 7 }
  let watched: (() => void) | undefined
  let registeredNs: string | undefined
  let registeredValidate: ((value: DropSettings) => void) | undefined
  const { ctx } = ctxWith({
    register: (ns: string, _schema: unknown, options: { validate?: (value: DropSettings) => void }) => {
      registeredNs = ns
      registeredValidate = options.validate
      return {
        get: () => scopeValue,
        watch: (callback: () => void) => { watched = callback; return () => { watched = undefined } },
      }
    },
  })
  const r = recorder()
  mountSettingsSection(ctx, ENTRY, r.hooks)

  equal(registeredNs, DROP_NAMESPACE)
  ok(registeredValidate !== undefined, 'the cross-field validator rides the registration on this train')
  equal(r.value().keepDays, 7, 'the live section, not the entry config, is the source')
  equal(r.changes(), 1, 'activation reconciles once')

  scopeValue = { ...ENTRY, keepDays: 1 }
  watched?.()
  equal(r.changes(), 2, 'a committed write re-reconciles')
})

test('detaching the settings service returns the source to the composition entry', () => {
  const { ctx, cleanups } = ctxWith({
    register: () => ({
      get: () => ({ ...ENTRY, keepDays: 7 }),
      watch: () => () => {},
    }),
  })
  const r = recorder()
  mountSettingsSection(ctx, ENTRY, r.hooks)
  equal(r.value().keepDays, 7)

  for (const cleanup of cleanups) cleanup()
  deepEqual(r.value(), ENTRY, 'with no provider the entry config is authoritative again')
  equal(r.changes(), 2, 'the fallback is announced, so derived state is re-judged')
})

test('a settings service offering neither API leaves the composition entry in charge', () => {
  const { ctx } = ctxWith({})
  const r = recorder()
  mountSettingsSection(ctx, ENTRY, r.hooks)
  deepEqual(r.value(), ENTRY)
  equal(r.changes(), 0, 'the plugin body reconciles on its own; the mount adds no second pass')
})

test('unloading the owner does not fall back, and does not re-prune', () => {
  // The distinction the cleanup has to make: losing the settings service means
  // hand the still-running plugin back its entry config, while the plugin's own
  // fiber going down means there is nothing to fall back to — re-running the
  // retention pass there would walk the stage directory for a fiber that is
  // already disposing.
  const { ctx, cleanups, fiber } = ctxWith({
    register: () => ({ get: () => ({ ...ENTRY, keepDays: 7 }), watch: () => () => {} }),
  })
  const r = recorder()
  mountSettingsSection(ctx, ENTRY, r.hooks)
  equal(r.changes(), 1, 'activation reconciles once')

  fiber.state = 5 // FiberState.UNLOADING
  for (const cleanup of cleanups) cleanup()
  equal(r.changes(), 1, 'no fallback pass during unload')
  equal(r.value().keepDays, 7, 'and the source is left as it was')

  fiber.state = 4 // FiberState.DISPOSED
  for (const cleanup of cleanups) cleanup()
  equal(r.changes(), 1, 'a second teardown pass changes nothing either')
})

test('a committed write during unload is not re-judged', () => {
  let watched: (() => void) | undefined
  const { ctx, fiber } = ctxWith({
    register: () => ({ get: () => ENTRY, watch: (cb: () => void) => { watched = cb; return () => {} } }),
  })
  const r = recorder()
  mountSettingsSection(ctx, ENTRY, r.hooks)
  equal(r.changes(), 1)

  watched?.()
  equal(r.changes(), 2, 'while active, a write re-reconciles')

  fiber.state = 5 // UNLOADING
  watched?.()
  equal(r.changes(), 2, 'once unloading, a queued write is skipped')
})
