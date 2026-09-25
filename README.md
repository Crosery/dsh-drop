<p align="center"><img src="assets/logo.png" width="128" alt="DSH Drop icon" /></p>

# DSH Drop

> **English** · [中文](README.zh.md)

Drag or paste files into **DeepSeek Harness** — the Web app and the desktop app. Images and files share one preview rail; your draft stays clean. File paths are appended only when you send.

[![CI](https://github.com/Crosery/dsh-drop/actions/workflows/ci.yml/badge.svg)](https://github.com/Crosery/dsh-drop/actions/workflows/ci.yml) [![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![Files in one attachment rail](assets/screenshot-rail.png)

## Install

Requires DeepSeek Harness from **0.1.0-rc.8 through 0.1.7** — every published train in that span is typechecked and tested, including 0.1.1-rc.2, 0.1.5-rc.2 (npm `latest` is 0.1.5-rc.3) and 0.1.7-rc.2, the desktop app's runtime; the per-version table is in [Harness compatibility](docs/harness-compatibility.md). DSH 0.1.7 refuses to install or load a plugin whose peer ranges do not admit it, so older releases of this plugin do not load there.

**Web:** pnpm on PATH and an even Node major supported by DSH (CI: 22.19 / 24). Install the prebuilt release, then **restart the profile**:

~~~sh
dsh plugin --profile web add https://github.com/Crosery/dsh-drop/releases/latest/download/dsh-drop.tgz
~~~

The tarball includes both compiled halves, so installation does not run a plugin build. For a pinned install, replace latest/download with download/v0.1.3. The repository also ships the built halves, so `dsh plugin --profile web add github:crosery/dsh-drop` installs with no build approval; prefer the tag-pinned tarball for reproducibility. Do not install a second copy if your local patch already mounts @crosery/dsh-drop.

~~~sh
dsh plugin --profile web remove @crosery/dsh-drop
~~~

Restart after removal too. [Source builds and release procedure](docs/releasing.md).

**Desktop app:** the `dsh plugin` CLI refuses the desktop profile. Open **Plugins → Add plugin** in the app and paste the release URL above; upgrading an installed plugin needs an app restart.

## What happens to a file?

| Input | Delivery | Preview |
| --- | --- | --- |
| PNG / JPEG / WebP / GIF | Native image attachment; existing model, size and count validation | Thumbnail and image lightbox |
| Files the composer's own **+** picker added | Native file attachment (0.1.3 onward), uploaded by DSH | Card with upload progress, failure and retry |
| Other images | File reference | Image element, if the browser supports it |
| Video / audio | File reference | Native browser playback, codec-dependent |
| PDF | File reference | Browser PDF viewer, when available |
| Markdown / code / logs / CSV / HTML | File reference | Escaped text, first 64 KiB; HTML is not executed |
| Office / iWork / archives / unknown files | File reference | Filename, size and format badge; no in-page document renderer |
| Folders | Skipped with a notice (folder support is planned) | No recursive upload |

A non-image file becomes an **@path**, not a new model content block. The model must explicitly use a file tool to read it; a large log costs only a path until then. This plugin adds no model tool. It complements [DSH Viewer](https://github.com/Crosery/dsh-viewer), which displays files from the model back to you.

1. Drop or paste files into the page with a session open. A drop lands in the composer under the pointer, or in the conversation's composer when dropped elsewhere; a composer that is not taking files (a subagent's, one mid-send) says so instead. A mixed batch keeps images on the native image path.
2. Inspect the shared rail. A card reads "Preparing…" until its path is ready; click it to preview; remove individual entries without changing your words. Dropping the same file twice adds it once.
3. Type your request and send with Enter or the Send button. The model receives your words first, followed by file references. **File-only messages can be sent with Enter, or by pressing the grey Send button.**

![Text preview](assets/screenshot-preview.png)

## Original path first, copy otherwise

**Desktop app:** the app tells the page each dropped file's real path, so the reference points at your file where it lies — nothing is copied, and later edits are visible when the model reads it.

**Web:** a browser File does not expose its OS path. If the transfer also carries a local file:// hint, the Host compares size and modification time (2-second tolerance) and reuses a matching regular file. Metadata matching is a heuristic, not byte identity or a permission check. A path containing a double quote or a control character cannot be written as a reference and falls back to staging.

Otherwise bytes stream into **$DSH_HOME/drops/YYYY-MM-DD/**. Completed copies publish without overwriting another drop, including concurrent uploads. Edits to a copied file do not update the original. For a dependable workspace reference, use the composer's @ completion. A remote agent must be able to read the Host path; this plugin does not synchronize files to remote workspaces.

## Configuration

On **0.1.0–0.1.6**: namespace **crosery-drop** in $DSH_HOME/settings.yaml; changes apply live.

On **0.1.7**: settings.yaml is gone. Set the values on the plugin's profile entry, id `drop`, in the profile's `cordis.patch.yml` (restate the whole `config` block — a patch replaces a row's config). The 0.1.7 one-time import does **not** carry a `crosery-drop` section over: it looks for an entry named after the section, and this entry is `drop`; the old values stay in `settings.yaml.imported`. The 0.1.7 Settings page shows no form for these two fields.

| Key | Default | Meaning |
| --- | ---: | --- |
| maxBytes | 536870912 (512 MiB) | Maximum bytes per staged file; must be positive. |
| keepDays | 30 | Retention by date directory; 0 disables pruning. |

Cleanup runs at activation and when retention changes. It deletes expired date-named directories, including manually added contents inside them; other names and loose files are untouched. Removing a card does **not** delete the staged copy.

## Important limits

- **Unsent non-image entries are page-local. Refresh or plugin unload loses the pending references and previews.** Drop again before sending. Copies may still exist on disk; that does not restore the pending list.
- There is no byte-level progress for copies and no aggregate disk quota. A send while a card still reads "Preparing…" is held back with a notice. Files that could not be staged are reported with a count.
- On the 0.1.2+ composer the references are appended to the message at the moment you send, and the composer's own Enter or Send delivers it — Cmd/Ctrl+Enter steer or queue, the upload check and slash commands behave as usual. If the composer refuses the send (its own uploads still running, for example) the references are taken back out and stay staged. Shift+Enter, IME composition and a highlighted completion menu are never taken as a send; the Stop control never carries files. On the 0.1.0–0.1.1 textarea composer the plugin rewrites the draft and submits itself, as before.
- If a sent message fails later, the composer restores it with the references in its text for retry, rather than returning them to the rail. The plugin cannot create a generic file content block.
- Preview bytes stay in memory while an attachment is in the rail and are released when it is sent or removed. A preview shows the bytes as they were dropped; the model reads the actual file. Browser media/HEIC/PDF support varies.
- The single attachment slot is replaced, not added alongside other replacements. Another plugin taking that same priority can conflict. Unloading restores the shipped rail.

## Security

No third-party upload service, analytics, automatic execution or archive extraction. Staging is a Host write endpoint: names are reduced to one segment, size is bounded, simple cross-site POSTs are refused, and no CORS access is granted. On **0.1.7** both routes also require the harness's own login authentication (its connection check), so another local process without the login cookie is refused. **On earlier trains the routes have no authentication of their own**: keep DSH loopback-only or behind authenticated access; do not expose its host authority to untrusted users. Same-origin plugins can act with the page's authority.

SVG remains inside an image element, HTML is escaped text, and PDF blobs are forced to application/pdf. Preview UI does not offer top-level blob navigation. The default retention is not secure erasure. See [development and security boundaries](docs/development.md).

## Develop

~~~sh
npm ci
npm run typecheck
npm test
npm run build
npm run check
npm run check:dist
~~~

This repository is self-contained and uses public pinned dependencies, not a sibling checkout. [AGENTS.md](AGENTS.md) routes contributors to the [paired development, PR, release and compatibility docs](docs/README.md). Four workflows cover CI, deterministic PR review, gated Release and scheduled upstream drift detection.

## License

[MIT](LICENSE), including the original project icon and synthetic demo assets. Source originated in Crosery's plugin workspace; this is its standalone distribution repository.
