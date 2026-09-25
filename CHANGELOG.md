# Changelog

> **English** · [中文](CHANGELOG.zh.md)

## 0.2.0

DeepSeek Harness 0.1.7 — the desktop app's runtime and npm `next` — on the Web and in the desktop app.

- **Loads on 0.1.7.** The peer ranges now admit every published train from 0.1.0-rc.8 through 0.1.7-rc.2, one prerelease comparator per tuple. From 0.1.7 the harness itself refuses to install, and silently skips at boot, a plugin whose ranges do not admit it: v0.1.3 stopped at `<0.1.6-0`, so on 0.1.7 it was simply absent. 0.1.8 is admitted only after a sweep verifies it.
- **The rail no longer crashes on 0.1.7.** 0.1.7 renamed the primitive icons the rail imported (`IconCloseOutline16` and three others), so the first card rendered `undefined`. The rail draws its glyphs inline, and its bundle requires only React and React DOM.
- **Desktop app.** Dropped files and folders are referenced where they lie, through the path the desktop app gives the page (`__DSH_HOST_PATHS__`); nothing is copied. Requests are document-relative, so they work from the app's `dsh-app://` page. Install it from **Plugins → Add plugin** with the release URL; the `dsh plugin` CLI refuses the desktop profile.
- **Folder drag-and-drop.** A dropped folder is one rail card and, when sent, one `@/path/folder/` reference. It is referenced in place when its path is known (desktop, or a Web path hint the Host confirms against the folder's files), otherwise copied into `$DSH_HOME/drops/` with its structure through a new batch route, under file-count, size and depth limits (`folderMaxFiles`, `folderMaxBytes`, `folderMaxDepth`, `folderIgnore`). An over-limit folder is refused whole; removing a pending card cancels the upload and deletes what arrived.
- **Send guard for the Lexical composer.** Since 0.1.2 the composer is a `contenteditable`, not a `<textarea>`, and Enter sent messages without their staged files. The guard now appends the references at the moment you send (`insertText` on 0.1.7, the scoped insert event on 0.1.2–0.1.6) and lets the composer's own Enter or Send deliver them; a refused send takes them back out. File-only messages send with Enter or the grey Send button. Shift+Enter, IME composition, a highlighted completion menu and Stop never carry files.
- **Per-composer routing.** 0.1.7 removed the "current session" the drop handler read, so non-image drops were discarded. Each rail registers itself; a drop goes to the composer under the pointer, or the conversation's composer. A composer that is not taking files says so.
- **Authenticated routes.** On 0.1.7 the stage, resolve and batch routes first ask the harness's own login check (`connection.requestRejection`); an unauthenticated local caller gets 401. Resolve gained the stage route's cross-site gate. Paths with C1 control characters are refused, as upstream's mention formatter does.
- **The rail shows the composer's own file drafts** (the **+** picker) with upload progress, error and retry, honours `canAcceptDrop`, and adds the same file only once. Paste keeps genuine text and ignores pastes aimed at other plugins' fields.
- **Settings on 0.1.7** are set on the `drop` entry in the profile's `cordis.patch.yml`; 0.1.7's one-time `settings.yaml` import does not carry the old `crosery-drop` section over.
- **CI covers the desktop app and every published train.** Each cell — the pinned train, the 0.1.1-rc.2 floor, the version the desktop app's update feeds ship, npm `latest` / `next` / `alpha`, and a weekly sweep of every published version — runs types, tests, peer admission under both semver rules and a boot smoke: the packed plugin is installed with `dsh plugin add`, activates, answers on its routes and is served. A macOS job runs the same smoke on the desktop app's own runtime. Releases are gated on the pinned, floor and desktop cells, the desktop bytes and the full sweep. `check:dist` now checks the bundle's reads of harness modules against the export names the train really publishes.
- Development pins move to the 0.1.7-rc.2 train with Cordis 4.0.4.

## 0.1.3

- Fix the rail's `useMemo` dependency list: the image rows close over the resolved remove verb, so a train that supplies only `onRemoveAttachment` (0.1.2 and later, where `onRemoveImage` is always absent) could keep a stale handler across renders.
- Drop the `>=0.1.0-rc.1 <0.1.1-0` peer branch. It was inherited rather than verified and admitted the 0.1.0-rc trains this repository documents as unsupported; the range now starts at the 0.1.1 floor the README states.
- `npm run check` now asserts every documented train against the peer ranges and that nothing below the floor is admitted, so the prose and the manifest cannot drift apart again.
- Point the pinned-install examples at the current release.

## 0.1.2

- Peer ranges admit the alpha lines. Every tuple previously carried only `-rc` comparators, and `alpha` sorts below `rc` under semver, so `>=0.1.5-rc.0` did not match `0.1.5-alpha.2` — every alpha harness build was rejected, a trap the marketplace guidelines call out by name. Eight verified trains (including 0.1.2-alpha.5, 0.1.3-alpha.2 and 0.1.5-alpha.1/2) are now covered by explicit branches.

## 0.1.1

- Support every harness train from 0.1.1 through 0.1.5, including the current `latest`, `next` and `alpha` tags. Verified by typechecking and testing against 0.1.1-rc.2, 0.1.2-rc.1, 0.1.5-rc.1, 0.1.5-rc.2 and 0.1.5-alpha.2.
- Mount settings through whichever API the running harness publishes. `installSettingsSection` and `settingsNamespace` were removed in 0.1.2 in favour of `ctx.settings.installSection`; importing the removed pair statically made the whole host entry fail to load there, which is what a 0.1.2 user saw as a broken plugin.
- Read the client `sessions` service by name and declare the slice structurally, and restate the attachment seat's renamed owner verbs (`onAddFiles`, `onRemoveAttachment`) and widened draft shape. `@deepseek-ai/dsh-client-runtime` stopped publishing after 0.1.1, so naming it pinned this plugin to one train.
- Take `sessionId` from the registration's `inject` factory, where 0.1.2 moved it, instead of the standard prop.
- Ship the built halves in the repository and drop the `prepare` script: a git install no longer needs an `allowBuilds` approval, which is what made the plugin marketplace's install fail with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`. `npm run check:dist` keeps the committed dist honest.
- Add `@deepseek-ai/dsh-client-store` as a dev pin: from 0.1.2 `dsh-client-ui-slots` re-exports its selector-hook types from there, and without it every hook silently lost its parameter type.
- Widen peer ranges to the verified trains only, and fail the compatibility job's drift issue with which packages a train is missing.

## 0.1.0

- Extract the existing DSH Drop plugin into a self-contained MIT repository with public dependency pins.
- Keep native image delivery and file references in one preview rail; splice references at send time.
- Restore pure-image intake after replacing the attachment slot.
- Prevent top-level untrusted blob navigation and PDF MIME confusion.
- Publish concurrent same-name uploads without replacement; reject simple cross-site writes and bound Unicode filenames in UTF-8 bytes.
- Add bilingual contributor docs, CI/release gates, original icon and synthetic screenshots.

Known limits, including page-local unsent references and send-key behavior, are documented in README.
