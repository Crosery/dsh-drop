# @crosery/dsh-drop

A two-sided dsh plugin. Host routes acquire paths; the browser owns previews and pending references. Shared wire rules live in `src/contract.ts`.

## Always-on boundaries

- Compile Host and client separately: both augment Cordis Context with incompatible service shapes. Keep shared modules DOM-free and schema-free; tests have their own program.
- Browser values may come from React, React DOM, the loader's UI-primitives baseline, or relative repo files. Other DSH imports are type-only. The distribution gate executes the lazy-CJS factory with an allowlisted module table.
- Optional services use nested `ctx.inject`. A required service missing from a composition can prevent startup; a headless profile must not require Web services.
- The attachment slot is single: replacing it also replaces its image listeners. Every claimed file transfer must route native images through the seat's own file intake (`onAddFiles`, or `onAddImages` on 0.1.1). File references stay outside the draft until submit, and submit goes through the composer, never directly to the model.
- Treat dragged bytes as untrusted. Keep HTML as text, SVG in image elements, PDFs typed as PDF; never navigate an untrusted blob as a top-level document. Publish staged files without replacing existing paths.

## Read when changing

| Change | Reference |
| --- | --- |
| Transfer, rail, preview, submit, settings or tests | [Development](docs/development.md) · [中文](docs/development.zh.md) |
| Commit, PR or failed CI | [Pull requests](docs/pull-requests.md) · [中文](docs/pull-requests.zh.md) |
| Version, release asset or market listing | [Releasing](docs/releasing.md) · [中文](docs/releasing.zh.md) |
| Upstream API or peer versions | [Harness compatibility](docs/harness-compatibility.md) · [中文](docs/harness-compatibility.zh.md) |

The published dependency declarations and real runtime take precedence over older prose. Update both language versions when user-facing behavior changes. Keep machine paths and credentials out of source, manifests, screenshots and release assets.
