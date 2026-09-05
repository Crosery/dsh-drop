# Pull requests

> **English** · [中文](pull-requests.zh.md) · [Index](README.md)

Use English imperative commit subjects: type: summary (feat, fix, docs, test, ci, chore, refactor). Explain the constraint that made the change necessary, not a prose copy of the diff. One PR carries one reviewable claim; rebase to main without rewriting other contributors' work.

Before review, run the validation commands in package.json. Include reproduction, behavior change, tests, compatibility and known limits. User-facing documentation changes update both language versions. AGENTS.md and CLAUDE.md remain single-language agent routes.

Required gates: separate typechecks, tests, build, client module-table purity, packed patch/entries/types/assets, matching locale keys, public dependency pins with admitting prerelease peer ranges, valid screenshot paths and paired docs. Prove a new invariant can fail by deliberately breaking a disposable fixture.

CI and PR review run with read-only contents permissions on pull_request, including forks; no privileged pull_request_target execution of contributor code. The deterministic reviewer is always available and needs no paid API key. Human review still checks whether the description matches code and whether previews or HTTP changes weaken the security boundary.
