# Releasing

> **English** · [中文](releasing.zh.md) · [Index](README.md)

1. Update package.json version, lockfile and CHANGELOG; keep both READMEs accurate.
2. Run the full CI locally and merge to main only after GitHub CI is green.
3. Push a matching v-prefixed tag. The Release workflow checks tag/version equality, validates, builds and packs before publishing.
4. Verify the public asset downloads, contains cordis.patch.yml plus both bundles, and installs without building source.

The stable asset is dsh-drop.tgz: https://github.com/Crosery/dsh-drop/releases/latest/download/dsh-drop.tgz. Keep the filename version-free: latest is resolved dynamically but the asset name is literal. Pin releases/download/v0.1.0/dsh-drop.tgz for reproducible installations. SHA256SUMS accompanies each release. npm publishing is not configured; do not advertise npm add as an available channel. Git source installations require trust in prepare and an explicit profile allowBuilds approval.

## Market

Submit only data/plugins/Crosery__dsh-drop.yml to https://github.com/awesome-dsh-plugin/awesome-dsh-plugin. Include exact repository URL/name, category ui, factual en/zh descriptions and the tarball URL. Screenshots live here in screenshots.json; do not edit generated market READMEs or another entry. Add the dsh-plugin topic.

The contributing rules checked on 2026-09-05 require the repository to be at least one day old; the old ten-commit bar has been removed. Recheck their contributing.md before submission. A new-repo PR may fail the age gate: disclose it, request a rerun after the actual eligibility time, and never fabricate timestamps or empty history. Submitted is not merged.

Source: the market contributing.md and this repository's .github/workflows/release.yml.
