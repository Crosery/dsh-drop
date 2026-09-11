# Harness compatibility

> **English** · [中文](harness-compatibility.zh.md) · [Index](README.md)

The reproducible baseline is the published 0.1.1-rc.2 DSH package train with Cordis 4.0.2, and this plugin is verified end to end against every train from there through 0.1.5. Host peers admit each of those prerelease tuples explicitly, alpha lines included. Two separate traps live here, and the peer range has to defeat both. A wildcard or an apparently broad stable range excludes every prerelease under node-semver. And a range whose only prerelease comparators sit on the `-rc` side of a tuple excludes that tuple's alphas outright — `>=0.1.5-rc.0` does not match `0.1.5-alpha.2`, because `alpha` sorts below `rc`. Each verified tuple therefore carries both an alpha and an rc branch; the invariant checker verifies each pinned dev version against the range, and the marketplace guidelines call this out by name. Keep official runtime service packages as peers and mirror their exact tested versions in devDependencies. No local link:, file: or workspace: dependencies belong in a release checkout.

## Verified trains

| Train | Result |
| --- | --- |
| 0.1.1-rc.2 | typecheck, build, 110 tests |
| 0.1.2-rc.1 | typecheck, build, 110 tests |
| 0.1.5-rc.1 | typecheck, build, 110 tests |
| 0.1.5-rc.2 | typecheck, build, 110 tests |
| 0.1.5-alpha.2 | typecheck, build, 110 tests |
| 0.1.2-alpha.5 | typecheck, 110 tests |
| 0.1.3-alpha.2 | typecheck, 110 tests |
| 0.1.5-alpha.1 | typecheck, 110 tests |

Each row is a scratch copy with every `@deepseek-ai/dsh-*` devDependency repointed at that exact published version, then `npm install --ignore-scripts`, `npm run typecheck` and `npm test`. The scheduled harness-compat workflow probes next and alpha tags and opens or updates an upstream-drift issue on failure. It does not publish or widen peer ranges automatically. Missing tags are reported rather than treated as compatible.

## What the 0.1.2 train changed

Two upstream moves broke a plugin that imported one train's surface statically. Both are handled by reading the running harness instead of a package name.

1. **Settings mount moved.** `installSettingsSection(ctx, ns, schema, entry, hooks)` — a package export in 0.1.1 — became `ctx.settings.installSection(owner, ns, schema, entry, hooks)`, and `settingsNamespace()` was deleted with it. `src/index.ts` exports `mountSettingsSection` for exactly this: it drives `installSection` when the service has it, falls back to the older `register` API when it does not, and otherwise leaves the composition entry as the source. A static import of the removed export is fatal rather than degrading: ESM resolves named exports before any code runs, so the whole host entry fails to load on 0.1.2 and later.
2. **Client services moved.** `ctx.slots` is declared by `@deepseek-ai/dsh-client-runtime` up to 0.1.1 and by `@deepseek-ai/dsh-client-ui-renderer` from 0.1.2; `ctx.sessions` moved to `@deepseek-ai/dsh-api-session-controller`, and 0.1.1's owner stopped publishing. The client half therefore reads `sessions` by name through `ctx.get` and declares the slice it calls structurally, so neither train's package tree is named in an import.

Three smaller renames ride along, all absorbed by the same posture: draft attachments grew a file member with no `previewUrl` (`DropRail` renders an identity row for it), the seat's owner verbs became `onAddFiles` / `onRemoveAttachment` (the rail calls whichever name pair arrives), and `sessionId` stopped arriving as a standard prop (the registration's `inject` factory now supplies it).

## Type resolution depends on `@deepseek-ai/dsh-client-store`

From the 0.1.2 train, `@deepseek-ai/dsh-client-ui-slots` re-exports `SnapshotSelectorHook`, `PropsStore`, `StoreDecl`, `BoundActions` and `HandleOf` from the separate `@deepseek-ai/dsh-client-store` package instead of its own `store.ts`. That package is not published on the 0.1.1 trains, and nothing used to pull it in.

Without it installed the import inside ui-slots resolves to `any`, `skipLibCheck` hides the failure, and every selector hook silently loses its parameter type — `useInput((state) => ...)` and the synthesized `useAttached` both report `TS7006: Parameter implicitly has an 'any' type` while the rest of the build looks healthy. It is a devDependency pinned at the newest verified train; the older trains simply do not import it.

## Dist is committed

`lib/` is committed and `.gitignore` keeps it that way. The git install channel is what a marketplace falls back to when a repository has no npm package, and pnpm refuses to run a git-hosted package's build scripts unless the user pre-approves them in their profile's `allowBuilds` — so a repository that builds on install is a repository many users cannot install at all. `npm run check:dist` rebuilds into a scratch directory and refuses a committed dist that disagrees with `src/`; CI runs it on both Node majors.

Upstream drift still needs a human: read the public declarations from the proposed package version, update all affected DSH pins together, regenerate package-lock.json, then typecheck both halves, run the tests, build, check the dist, check the loader module table, and exercise the actual Web composer. Widen compatibility only after verification.

Reference: package.json, package-lock.json, scripts/check-invariants.mjs, scripts/check-dist.mjs, and the installed public `dsh-client-ui-conversation` / `dsh-client-ui-slots` / `dsh-settings` declarations.
