# Harness compatibility

> **English** · [中文](harness-compatibility.zh.md) · [Index](README.md)

The reproducible baseline is the published 0.1.1-rc.2 DSH package train with Cordis 4.0.2. Host peers admit that prerelease tuple explicitly. A wildcard or an apparently broad stable range excludes prereleases under node-semver; the invariant checker verifies each pinned dev version against its peer range. Keep official runtime service packages as peers and mirror their exact tested versions in devDependencies. No local link:, file: or workspace: dependencies belong in a release checkout.

For drift, read the public declarations from the proposed package version, update all affected DSH pins together, regenerate package-lock.json, then typecheck both halves and tests, build, check the loader module table, and exercise the actual Web composer. Widen compatibility only after verification. The single attachment slot, input phase/actions, capture-phase submit selectors and UI-primitives baseline are especially sensitive. The test matrix covers Node 22.19 and 24; the harness supports even Node majors.

The scheduled harness-compat workflow probes next and alpha tags and opens/updates an upstream-drift issue on failure. It does not publish or widen peer ranges automatically. Missing tags are reported rather than treated as compatible. Check installation errors separately from API/type failures.

Reference: package.json, package-lock.json, scripts/check-invariants.mjs, and the installed public dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts.
