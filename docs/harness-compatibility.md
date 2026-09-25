# Harness compatibility

> **English** · [中文](harness-compatibility.zh.md) · [Index](README.md)

The development pin is the **0.1.7-rc.2** package train with Cordis 4.0.4 — the runtime the desktop app ships and npm `next`. Support covers **every published train from 0.1.0-rc.8 through 0.1.7-rc.2**; each one is typechecked and tested below, and the 0.1.1-rc.2 floor additionally passes build, `check` and `check:dist`.

Host peers carry one prerelease comparator per supported tuple: `>=0.1.0-rc.8 <0.1.1-0 || >=0.1.1-rc.0 <0.1.2-0 || >=0.1.2-alpha.0 <0.1.3-0 || … || >=0.1.7-alpha.0 <0.1.8-0`. Two traps shape that. A wildcard or an apparently broad stable range excludes every prerelease under default node-semver. And a comparator that starts at `-rc` excludes the same tuple's alphas, because `alpha` sorts below `rc`; starting each tuple at `-alpha.0` (or at the first supported build) admits both. From 0.1.7 the harness itself enforces the ranges — it checks every `@deepseek-ai/dsh*` peer with `includePrerelease` before installing a plugin and again at boot, and skips the bundle with "incompatible" otherwise — so a range that misses the running train means the plugin never loads. `scripts/check-invariants.mjs` asserts every verified train under both rules and rejects every train outside the support, 0.1.8 included: a new train is admitted only after a sweep has verified it. Keep official runtime service packages as peers and mirror their exact tested versions in devDependencies. No local link:, file: or workspace: dependencies belong in a release checkout.

## Verified trains

`node scripts/sweep-trains.mjs` produces this table: for each published `@deepseek-ai/dsh` version, a scratch copy of the tree with every `@deepseek-ai/dsh-*` devDependency repointed at that exact version, `npm install --ignore-scripts`, `npm run typecheck` (all three programs) and `npm test`.

| Train | Result |
| --- | --- |
| 0.1.0-rc.8 | typecheck, 201 tests |
| 0.1.1-rc.1 | typecheck, 201 tests |
| 0.1.1-rc.2 | typecheck, 201 tests; build, check, check:dist |
| 0.1.2-alpha.2, alpha.3, alpha.4, alpha.5 | typecheck, 201 tests |
| 0.1.2-rc.1 | typecheck, 201 tests |
| 0.1.3-alpha.2 | typecheck, 201 tests |
| 0.1.5-alpha.1, alpha.2 | typecheck, 201 tests |
| 0.1.5-rc.1, rc.2, rc.3 | typecheck, 201 tests |
| 0.1.6-alpha.1, alpha.2 | typecheck, 201 tests |
| 0.1.7-alpha.1, alpha.2, rc.1 | typecheck, 201 tests |
| 0.1.7-rc.2 | typecheck, 201 tests; build, check, check:dist; live end-to-end on an isolated Web instance run by the desktop app's runtime |

Rules the sweep applies. A dev pin the train never published keeps this repository's version: `@deepseek-ai/dsh-client-store` on 0.1.0 and 0.1.1, whose declarations do not import it. `@deepseek-ai/dsh-client-runtime`, which declares the slot registry on 0.1.0–0.1.1 and stopped publishing after, is added at the train's version. Peers are installed; where a train's own peer graph does not resolve under npm (0.1.1-rc.1, the 0.1.5 line), the install falls back to `--legacy-peer-deps` and the table in the sweep output says so. The scheduled harness-compat workflow probes the next and alpha tags and opens an upstream-drift issue on failure; it never publishes or widens a peer range.

## Out of scope

| Trains | Why |
| --- | --- |
| 0.0.1-rc.1, rc.2 | Incomplete upstream: `@deepseek-ai/dsh` itself depends on packages that were never published (`dsh-pty`, `dsh-environment`, `dsh-skill-local`, …), so the harness cannot be installed at all. |
| 0.0.1-rc.5, 0.1.0-rc.2 – rc.7 | The plugin loader exists (`dsh.bundle.patch`, `dsh.client` Web modules), but the composer has no `conversation.input.attachments` seat — its input bar owns the drop listener and attachment strip itself — and `@deepseek-ai/dsh-client-ui-renderer` is not published before 0.1.0-rc.8. There is no seat for the rail to take. |

## What the 0.1.7 train changed

1. **The peer gate.** See above: without a range admitting 0.1.7 the plugin is refused at install and skipped at boot, on the Web and in the desktop app alike.
2. **No "current session".** `sessions.list.getSnapshot()` became `{ids, byId, phase, projectionsBySession}`; the selection is private. Each rail takes its session from the slot's `inject(sessionId)` factory and registers itself, per mount (the subagent sidebar mounts a second composer). Gestures are routed to the rail whose composer card contains the target.
3. **Icons renamed.** `IconCloseOutline16` and the other size-suffixed primitives became `…Regular` / `…Medium` / bare names; a missing export is `undefined` and React throws on the first card. The rail now draws inline SVG and its bundle requires nothing from the primitives module (`check` enforces it).
4. **Composer.** From 0.1.2 the composer is a Lexical `contenteditable`, not a `<textarea>`, so an Enter guard keyed on the textarea never fired and messages left without their staged files. 0.1.7 adds `inputActions.captureInsertion()` / `insertText(text, span)`; the send guard appends the mentions through it (the scoped `slash/input-insert-text` event on 0.1.2–0.1.6) and lets the composer's own handler submit. The same class names differ between the Web bundle and the desktop app (`uV2eYG_primary` / `QJwAZG_primary`), so the Send and Stop controls are identified by structure.
5. **Seat props.** `attachments` is a union of `image` and `file` drafts, with `uploads`, `onRetryFile`, `canAcceptDrop` and `dropLimits` beside it (most since 0.1.3). The rail renders all of them and honours `canAcceptDrop`.
6. **Desktop paths.** The desktop preload publishes `globalThis.__DSH_HOST_PATHS__.pathFor(file)`; it has no declaration file, so it is feature-detected.
7. **Route authentication.** `connection.requestRejection(req)` lets a raw Web route use the harness's own authentication; all three routes (stage, resolve and the folder batch route) call it when it exists. Client requests are document-relative, because the desktop page is `dsh-app://app/` and its forwarder strips `Origin` and `Sec-Fetch-Site`.
8. **Settings.** `ctx.settings` is `SettingsForms`: `installSection` and `register` are gone, forms are built from the exported `Config` for the profile entry (`drop`) and only for fields marked volatile, and the one-time `settings.yaml` import maps sections to entry ids — `crosery-drop` is not migrated.
9. **Reference chips.** `data-decoration="chip"` and `data-ref-chip` exist only on the textarea trains; the reference-fit stylesheet is installed only when a rail finds a textarea composer.

## What the 0.1.2 train changed

Two upstream moves broke a plugin that imported one train's surface statically. Both are handled by reading the running harness instead of a package name.

1. **Settings mount moved.** `installSettingsSection(ctx, ns, schema, entry, hooks)` — a package export in 0.1.1 — became `ctx.settings.installSection(owner, ns, schema, entry, hooks)`, and `settingsNamespace()` was deleted with it. `src/index.ts` exports `mountSettingsSection` for exactly this: it drives `installSection` when the service has it, falls back to the older `register` API when it does not, and otherwise leaves the composition entry as the source. A static import of the removed export is fatal rather than degrading: ESM resolves named exports before any code runs, so the whole host entry fails to load on 0.1.2 and later.
2. **Client services moved.** `ctx.slots` is declared by `@deepseek-ai/dsh-client-runtime` up to 0.1.1 and by `@deepseek-ai/dsh-client-ui-renderer` from 0.1.2; `ctx.sessions` moved to `@deepseek-ai/dsh-api-session-controller`, and 0.1.1's owner stopped publishing. The client half therefore reads `sessions` by name through `ctx.get` and declares the slice it calls structurally, so neither train's package tree is named in an import.

Three smaller renames ride along, all absorbed by the same posture: draft attachments grew a file member with no `previewUrl` (`DropRail` renders an identity row for it), the seat's owner verbs became `onAddFiles` / `onRemoveAttachment` (the rail calls whichever name pair arrives), and `sessionId` stopped arriving as a standard prop (the registration's `inject` factory now supplies it).

## Type resolution depends on `@deepseek-ai/dsh-client-store`

From the 0.1.2 train, `@deepseek-ai/dsh-client-ui-slots` re-exports `SnapshotSelectorHook`, `PropsStore`, `StoreDecl`, `BoundActions` and `HandleOf` from the separate `@deepseek-ai/dsh-client-store` package instead of its own `store.ts`. That package is not published on the 0.1.1 trains, and nothing used to pull it in.

Without it installed the import inside ui-slots resolves to `any`, `skipLibCheck` hides the failure, and every selector hook silently loses its parameter type — `useInput((state) => ...)` and the synthesized `useAttached` both report `TS7006: Parameter implicitly has an 'any' type` while the rest of the build looks healthy. It is a devDependency pinned at the development train; the 0.1.0 and 0.1.1 trains simply do not import it.

## Dist is committed

`lib/` is committed and `.gitignore` keeps it that way. The git install channel is what a marketplace falls back to when a repository has no npm package, and pnpm refuses to run a git-hosted package's build scripts unless the user pre-approves them in their profile's `allowBuilds` — so a repository that builds on install is a repository many users cannot install at all. `npm run check:dist` rebuilds into a scratch directory and refuses a committed dist that disagrees with `src/`; CI runs it on both Node majors.

Upstream drift still needs a human: read the public declarations from the proposed package version, update all affected DSH pins together, regenerate package-lock.json, run the sweep, build, check the dist and the loader module table, and exercise the actual composer — Web and desktop. Widen compatibility only after verification.

Reference: package.json, package-lock.json, scripts/check-invariants.mjs, scripts/check-dist.mjs, and the installed public `dsh-client-ui-conversation` / `dsh-client-ui-slots` / `dsh-settings` declarations.
