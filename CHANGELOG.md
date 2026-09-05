# Changelog

> **English** · [中文](CHANGELOG.zh.md)

## 0.1.0

- Extract the existing DSH Drop plugin into a self-contained MIT repository with public dependency pins.
- Keep native image delivery and file references in one preview rail; splice references at send time.
- Restore pure-image intake after replacing the attachment slot.
- Prevent top-level untrusted blob navigation and PDF MIME confusion.
- Publish concurrent same-name uploads without replacement; reject simple cross-site writes and bound Unicode filenames in UTF-8 bytes.
- Add bilingual contributor docs, CI/release gates, original icon and synthetic screenshots.

Known limits, including page-local unsent references and send-key behavior, are documented in README.
