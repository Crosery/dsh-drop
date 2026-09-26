# Harness compatibility

> **English** · [中文](harness-compatibility.zh.md) · [Index](README.md)

The development pin is the **0.1.7-rc.2** package train with Cordis 4.0.4 — the runtime the desktop app ships and npm `next`. Support covers **every published train from 0.1.0-rc.8 through 0.1.7-rc.2** on the Web and **0.1.7-rc.2** in the desktop app. Every train in that span is typechecked, tested and admitted by the peer ranges; the packed plugin is also booted — installed with `dsh plugin add`, activated, its routes exercised and its browser half served — on the trains listed under [Verified trains](#verified-trains).

## The peer gate

Host peers carry one prerelease comparator per supported tuple: `>=0.1.0-rc.8 <0.1.1-0 || >=0.1.1-rc.0 <0.1.2-0 || >=0.1.2-alpha.0 <0.1.3-0 || … || >=0.1.7-alpha.0 <0.1.8-0`. Two traps shape that. A wildcard or an apparently broad stable range excludes every prerelease under default node-semver. And a comparator that starts at `-rc` excludes the same tuple's alphas, because `alpha` sorts below `rc`; starting each tuple at `-alpha.0` (or at the first supported build) admits both.

From 0.1.7 the harness itself enforces the ranges. `evaluatePluginCompatibility` in `@deepseek-ai/dsh-app-boot` checks every `@deepseek-ai/dsh*` peer with `semver.satisfies(version, range, { includePrerelease: true })`: `dsh plugin add` refuses such a plugin and rolls the profile back ("installation rejected … is incompatible with dsh"), and at boot an installed one is skipped with a single stderr line ("skipping profile bundle") while the Web UI comes up without it. The desktop app runs the same code. A range that misses the running train therefore means the plugin never loads — v0.1.3, whose ranges stopped at `<0.1.6-0`, was absent from 0.1.7. npm and pnpm still apply the default rule to peers, so a range has to admit a train under both.

`scripts/check-invariants.mjs` asserts every verified train under both rules and rejects every train outside the support, 0.1.8 included, under both: a new train is admitted only after it has been verified. Keep official runtime service packages as peers and mirror their exact tested versions in devDependencies. No local link:, file: or workspace: dependencies belong in a release checkout.

## CI cells

`scripts/harness-target.mjs` resolves each cell to one exact `@deepseek-ai/dsh` version; `.github/workflows/harness-compat.yml` runs it.

| Cell | Version | Runs | Gates |
| --- | --- | --- | --- |
| `pinned` | the devDependency pin (0.1.7-rc.2), installed from the lockfile | every PR, every release | PR merge, release |
| `floor` | 0.1.1-rc.2, the oldest train with live evidence | every PR, every release | PR merge, release |
| `desktop` | the version both desktop update feeds ship — `nightly` is the only channel, mac-arm64 and win-x64 the only platforms, and they must agree — provided npm has `@deepseek-ai/dsh` at that version, which is the Web app the desktop boots | every PR (informational), daily | release |
| `latest`, `next`, `alpha` | the npm dist-tags of `@deepseek-ai/dsh` | daily | — |
| `sweep` | every published `@deepseek-ai/dsh` version from the lowest the peer ranges admit, read from npm at run time | weekly; a release | release (types, tests, admission) |
| `desktop-bytes` | the desktop zip itself, on macOS | daily, weekly, a release | release |

Each cell runs four stages:

- **types**: the Host, client and test programs against that train's declarations, and `check-dist.mjs --bundle-only` — every harness module member the client bundle reads must be exported by that train;
- **tests**: the suite against that train's packages;
- **admission**: every harness peer admits the version under both semver rules;
- **smoke**: `scripts/smoke-boot.mjs` — pack the checkout, install `@deepseek-ai/dsh` at the exact version into a throwaway `DSH_HOME` under the OS temp directory, add the tarball with `dsh plugin add` (no exemption), boot `dsh --profile web`, and require: no "skipping profile bundle" and no "did not activate" line naming the plugin; the three routes mounted, answering 401 without the login cookie where the harness has `connection.requestRejection` (from 0.1.2) and working with it — a real stage lands in the home and resolves; the plugin and its `dsh.client.inject` targets in `__DSH_BOOT__`; the served bundle evaluating against the shell's own module table; and every seed member it reads present in the train's installed packages. Sweep rows smoke the newest build of each tuple and whatever the named cells resolve to (`smoke: heads`), or all rows on request.

`desktop-bytes` downloads the mac-arm64 zip the feed names, requires its sha512 to match the feed, requires the bundled `desktop-runtime.json` and `@deepseek-ai/dsh` to be the feed's version, and runs the same smoke with the app's Electron binary as Node (`ELECTRON_RUN_AS_NODE=1`) against `Contents/Resources/app.asar/dsh`, with the app's bundled pnpm on PATH. The app's window, its preload bridge (`__DSH_HOST_PATHS__`) and native drag-and-drop are outside CI.

A train published without a package this plugin needs, or not yet on npm, is **incomplete**: the cell is neutral and neither opens nor closes an issue. On a schedule or a dispatch a failing cell opens, or comments on, the `upstream-drift` issue "Harness compatibility broken against @<cell>", and a cell whose every stage passes comments on that issue and closes it. Nothing in CI widens a range or publishes.

How a train is installed, in both the cells and the sweep (`scripts/harness-lib.mjs`):

- **devDependencies (types, tests).** Every `@deepseek-ai/dsh-*` devDependency the train published moves to that exact version. One it never published keeps this repository's pin — `@deepseek-ai/dsh-client-store` on 0.1.0 and 0.1.1, whose declarations do not import it — unless the plugin cannot work without it (`dsh-client-ui-renderer`, `-conversation`, `-slots` or a peer): then the train is out of scope. `@deepseek-ai/dsh-client-runtime`, which declares the slot registry on 0.1.0–0.1.1 and stopped publishing after, is added at the train's version. Cordis follows what the train's `@deepseek-ai/dsh` ships, pinned at the exact version that range installs. Peers are installed; a peer graph that hits ERESOLVE (0.1.1-rc.1 and the 0.1.5 line) is reinstalled in legacy peer mode with every harness peer of the pinned packages pinned at the train's version.
- **The harness (smoke).** `@deepseek-ai/dsh@<version>` is installed as released: `--before` the next harness publication, because the cordis family floats under every train — a fresh 0.1.1-rc.2 install today stops at boot with "user patch-layer watching requires the Cordis HMR service", with or without any plugin. When npm does not settle the peer graph within 90 s (0.1.1-rc.2 under npm 11 takes about ten minutes of CPU), it is installed in legacy peer mode and every required peer it leaves unmet is added at its declared range.

## Verified trains

Produced on 2026-09-26 by `node scripts/sweep-trains.mjs` (every row: install, the three typechecks, the bundle's seed reads and the 279 tests) and `node scripts/smoke-boot.mjs` (`--dsh <version>`, the harness as released; `--harness-dir` on the desktop app's own `app.asar`). Every row is admitted by every harness peer under both semver rules.

| Train | Types, bundle reads, tests | Boot smoke |
| --- | --- | --- |
| 0.1.0-rc.8 | pass (keeps the `dsh-client-store` pin) | pass; routes open to anonymous callers (no login check before 0.1.2) |
| 0.1.1-rc.1 | pass (keeps the pin; legacy peers) | — |
| **0.1.1-rc.2** — floor | pass (keeps the pin) | pass; routes open to anonymous callers |
| 0.1.2-alpha.2, alpha.3, alpha.4, alpha.5 | pass | — |
| 0.1.2-rc.1 | pass | pass; anonymous callers get 401 |
| 0.1.3-alpha.2 | pass | pass; 401 |
| 0.1.5-alpha.1, alpha.2, rc.1, rc.2 | pass (legacy peers) | — |
| 0.1.5-rc.3 — npm `latest` | pass (legacy peers) | pass; 401 |
| 0.1.6-alpha.1 | pass | — |
| 0.1.6-alpha.2 | pass | pass; 401 |
| 0.1.7-alpha.1, rc.1 | pass | — |
| 0.1.7-alpha.2 — npm `alpha` | pass | pass; 401 |
| **0.1.7-rc.2** — pinned, npm `next`, desktop app | pass; build, `check`, `check:dist` | pass on npm and on the desktop app's runtime (Electron Node 24.18.1, bundled pnpm 11.7.0); 401. Live end-to-end drops of files and folders on an isolated Web instance run by the app's runtime, with the desktop path bridge simulated |

The released v0.1.3 tarball, smoked the same way on the desktop app's runtime, fails at install ("installation rejected … incompatible with dsh 0.1.7-rc.2"); with `--accept-risk` it installs and then fails `host-routes` (no authentication, no batch route) and `client-exports` (`IconCloseOutline16`, `IconPlayOutline16`, `IconChevronLeftOutline14`, `IconChevronRightOutline14` are not exported by 0.1.7-rc.2's primitives).

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
7. **Route authentication.** `connection.requestRejection(req)` lets a raw Web route use the harness's own authentication — it has existed since 0.1.2-alpha.2, and the boot smoke sees anonymous callers refused on every train from 0.1.2 on; all three routes (stage, resolve and the folder batch route) call it when it exists, and answer 503 while no `connection` service is up (it is provided asynchronously, and restarts on a config edit). Client requests are document-relative, because the desktop page is `dsh-app://app/` and its forwarder strips `Origin` and `Sec-Fetch-Site`.
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

The daily and weekly cells find upstream drift; fixing it still needs a human. Read the public declarations of the new version, run `node scripts/smoke-boot.mjs --dsh <version> --accept-risk` (a diagnostic run that grants an exact-version exemption first, to tell "range too narrow" from "code broken"), update all affected DSH pins together if the pin moves, regenerate package-lock.json, run the sweep, build, check the dist, and exercise the actual composer — Web and desktop. Widen a range only after types, tests and that smoke pass, and add the version to `VERIFIED_TRAINS` in `scripts/check-invariants.mjs` and to the table above.

Reference: package.json, package-lock.json, scripts/harness-lib.mjs, scripts/harness-target.mjs, scripts/smoke-boot.mjs, scripts/check-invariants.mjs, scripts/check-dist.mjs, .github/workflows/harness-compat.yml, and the installed public `dsh-client-ui-conversation` / `dsh-client-ui-slots` / `dsh-settings` declarations.
