# Development

> **English** · [中文](development.zh.md) · [Index](README.md)

## Change the boundary, not the host

The Host registers POST /crosery/dsh-drop/resolve (stat-only path matching) and POST /crosery/dsh-drop/stage (bounded streaming upload). The browser owns a per-session AttachedFiles list and a page-local PreviewStore. The rail occupies the single conversation.input.attachments slot at priority -1; removing it restores the shipped occupant. It must own image intake as well as file intake.

Keep transfer planning, filename reduction, mention spelling and preview classification in DOM-free helpers. The client reads the seat's props structurally (see DropRail: the owner verbs and the attachment shape are restated, because 0.1.2 renamed both) and reaches `sessions` by name; composer writes go through `inputActions` only. Capture-phase submission is a compatibility seam, not a new sending implementation. Test Enter, IME, Shift+Enter, disabled/read-only controls, mention menus, failure and file-only submission when changing it.

## State and lifecycle

Paths stay outside the draft until submission; user text precedes mentions so titles remain readable. Native PNG/JPEG/WebP/GIF go through the seat's own file intake (`onAddFiles`, or `onAddImages` on 0.1.1) and the host's existing validation. Pending non-image references and preview bytes are page-local: refresh or unload loses unsent entries. A failed submission retains the rewritten draft; clear the pending list to avoid duplicate mentions on retry.

Keep state in apply/effect scope. Abort uploads and remove document listeners at disposal. Object URLs are revoked at plugin disposal; retained bytes can consume memory during long sessions. Text previews decode at most 64 KiB. Office and archives have identity cards, not document renderers.

## Security and storage

Uploaded names collapse to one path segment with UTF-8 byte budgets, then receive collision suffixes. Completed temporary files publish through an atomic no-replace hard link; concurrent drops must not change an earlier returned path. Stage requires the non-safelisted name header, rejects non-same-origin Fetch Metadata, and grants no CORS permission. This is CSRF hardening, not authentication. Keep DSH loopback-only or behind authenticated access; same-origin plugins and trusted local clients retain host authority.

Never navigate dropped blob URLs in a new tab: SVG is safe in an image element but not as a top-level document. HTML/XML render as escaped text. PDF blobs always use application/pdf even when the browser declares HTML. Browser codec/PDF support is not guaranteed. No file is automatically executed or extracted. Retention prunes date-named directories under DSH_HOME/drops, including anything manually placed inside them.

## Test the change

Use npm run typecheck, npm test, npm run build, npm run check and npm run check:dist. Host tests use real node:http servers and temporary directories. Keep client and host TypeScript programs separate; tests may include DOM types without importing host/client Context augmentations together. New runtime behavior needs a regression that fails on the previous behavior. For UI changes, verify a refreshed existing DSH URL with synthetic files: pure images, mixed batch, paste, removal, text/PDF preview, lightbox keyboard focus, narrow rail and file-only Enter. Do not send real documents or expose session history in screenshots. Record what actually ran; old README claims are not evidence.

Any client change must typecheck against every verified train, not just the baseline: copy the tree, repoint the `@deepseek-ai/dsh-*` devDependencies at one published version, then install and typecheck (see docs/harness-compatibility.md). `lib/` is committed, so run npm run build and commit the regenerated dist with the source change — check:dist fails otherwise.

Sources: src/index.ts, src/contract.ts, src/stage-route.ts, src/resolve-route.ts, src/client/rail-entry.ts and the pinned dsh-client-ui-conversation public slot declarations.
