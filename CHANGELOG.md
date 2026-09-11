# Changelog

> **English** · [中文](CHANGELOG.zh.md)

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
- Admit the alpha lines explicitly. Each verified tuple now carries both an alpha and an `-rc` branch: a range with only `-rc` comparators excludes that tuple's alphas outright, so the previous range rejected every alpha build of the harness.

## 0.1.0

- Extract the existing DSH Drop plugin into a self-contained MIT repository with public dependency pins.
- Keep native image delivery and file references in one preview rail; splice references at send time.
- Restore pure-image intake after replacing the attachment slot.
- Prevent top-level untrusted blob navigation and PDF MIME confusion.
- Publish concurrent same-name uploads without replacement; reject simple cross-site writes and bound Unicode filenames in UTF-8 bytes.
- Add bilingual contributor docs, CI/release gates, original icon and synthetic screenshots.

Known limits, including page-local unsent references and send-key behavior, are documented in README.
