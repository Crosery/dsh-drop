# Releasing

> **English** · [中文](releasing.zh.md) · [Index](README.md)

1. Update package.json version, lockfile and CHANGELOG (both languages); keep both READMEs accurate, including the pinned-install example (`npm run check` holds it to the version).
2. Run the full CI locally (`npm ci`, `npm run typecheck`, `npm test`, `npm run check:dist`, `npm run build` — after which `git status` must be clean — and `npm run check`) and merge to main only after GitHub CI is green — the node matrix and both required harness cells, `harness@pinned` and `harness@floor`.
3. Push a matching v-prefixed tag. The Release workflow's `pack` job checks tag/version equality, runs typecheck and tests, compares the committed `lib/` with a scratch build (`check:dist`) before anything rebuilds it, requires `npm run build` to leave the tree as committed, runs `check`, and packs `dsh-drop.tgz` with `SHA256SUMS` — once. Its `gate` then publishes nothing unless every part passes:
   - the **pinned**, **floor** and **desktop** cells of `harness-compat.yml` against the tag's own tree: typecheck (with the bundle's seed reads), tests, peer admission under both semver rules, and the boot smoke of that packed `dsh-drop.tgz` on `@deepseek-ai/dsh` at that exact version — `desktop` is the version both desktop update feeds ship, and the npm Web app at that version;
   - **desktop-bytes**: the same smoke of the same file on macOS, on the desktop app's own runtime, after the downloaded zip matched its feed's sha512 and the bundled runtime matched the feed's version;
   - the **sweep**: typecheck, tests, peer admission and the boot smoke of that same `dsh-drop.tgz` on every published `@deepseek-ai/dsh` version from the lowest the peer ranges admit (0.0.1-rc.1), read from npm at run time. A version whose `@deepseek-ai/dsh` does not install on its own (0.0.1-rc.1 and rc.2) is neutral and its summary quotes npm's answer (its peer admission still counts); any other failure — a registry that does not answer included — blocks the release.
   Then the release job checks `SHA256SUMS`, refuses the asset if any smoke record the gate left names other bytes, and creates the release with that same file and the verified harness versions prepended to the generated notes.
4. Verify the public asset downloads, contains cordis.patch.yml plus both bundles, and installs without building source — on the Web with `dsh plugin --profile web add <url>`, and in the desktop app through **Plugins → Add plugin**.

The stable asset is dsh-drop.tgz: https://github.com/Crosery/dsh-drop/releases/latest/download/dsh-drop.tgz. Keep the filename version-free: latest is resolved dynamically but the asset name is literal. Pin releases/download/v0.2.1/dsh-drop.tgz for reproducible installations. SHA256SUMS accompanies each release. npm publishing is not configured; do not advertise npm add as an available channel. The repository ships the built halves and no prepare script, so a git source installation needs no allowBuilds approval; the tarball remains the reproducible channel.

A gate that fails on a cell the release did not change — the desktop feed moved, or a new harness was published overnight — is still a real answer: the tag's tree does not work there. Fix forward (widen or adapt, verified per [Harness compatibility](harness-compatibility.md)) and tag again; do not re-run until green.

## Market

Submit only data/plugins/Crosery__dsh-drop.yml to https://github.com/awesome-dsh-plugin/awesome-dsh-plugin. Include exact repository URL/name, category ui, factual en/zh descriptions and the tarball URL. Screenshots live here in screenshots.json; do not edit generated market READMEs or another entry. Add the dsh-plugin topic.

The contributing rules checked on 2026-09-05 require the repository to be at least one day old; the old ten-commit bar has been removed. Recheck their contributing.md before submission. A new-repo PR may fail the age gate: disclose it, request a rerun after the actual eligibility time, and never fabricate timestamps or empty history. Submitted is not merged.

Source: the market contributing.md and this repository's .github/workflows/release.yml and harness-compat.yml.
