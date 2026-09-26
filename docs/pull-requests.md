# Pull requests

> **English** · [中文](pull-requests.zh.md) · [Index](README.md)

Use English imperative commit subjects: type: summary (feat, fix, docs, test, ci, chore, refactor). Explain the constraint that made the change necessary, not a prose copy of the diff. One PR carries one reviewable claim; rebase to main without rewriting other contributors' work.

Before review, run the validation commands in package.json. Include reproduction, behavior change, tests, compatibility and known limits. User-facing documentation changes update both language versions. AGENTS.md and CLAUDE.md remain single-language agent routes.

Required gates: separate typechecks, tests, build, client module-table purity and seed-member reads against the pinned train's real exports, packed patch/entries/types/assets, matching locale keys, public dependency pins with admitting prerelease peer ranges, valid screenshot paths and paired docs. Prove a new invariant can fail by deliberately breaking a disposable fixture.

## CI on a pull request

| Check | Required | What it runs |
| --- | --- | --- |
| `node 22.19`, `node 24` | yes | `npm ci`, typecheck, tests, `check:dist` (the committed `lib/` against a scratch build), build (which must leave the tree unchanged), `check` |
| `harness / harness@pinned` | yes | the four harness stages on the pinned train (0.1.7-rc.2) |
| `harness / harness@floor` | yes | the same on the 0.1.1-rc.2 floor, with every `@deepseek-ai/dsh-*` devDependency repointed |
| `desktop / harness@desktop` | no | the same on the version the desktop app's update feeds ship today; the feed moves under open PRs, so the scheduled run owns that signal |
| `invariants` (PR review) | yes | `check` and `check:dist` |

The four harness stages are **types** (all three programs plus `check-dist.mjs --bundle-only`), **tests**, **admission** (every harness peer admits the version under node-semver's default rule and under `includePrerelease`, which dsh ≥0.1.7 enforces at install and boot) and **smoke** (`scripts/smoke-boot.mjs`: `dsh plugin add` of the packed plugin in a throwaway home, boot, activation, the three Host routes, the served bundle against the shell's module table and the train's exports). The step summary names the failing stage and the exact versions. To reproduce a cell locally:

~~~sh
node scripts/harness-target.mjs floor --repoint --install   # rewrites package.json and node_modules; restore with git checkout + npm ci
npm run typecheck && node scripts/check-dist.mjs --bundle-only && npm test
node scripts/harness-target.mjs 0.1.1-rc.2 --admits
git checkout -- package.json package-lock.json && node scripts/smoke-boot.mjs --dsh 0.1.1-rc.2
~~~

Never widen a peer range to make admission pass: widen only for a version whose types, tests and `smoke-boot.mjs --dsh <version> --accept-risk` already pass, and add it to the verified list in `scripts/check-invariants.mjs` and [Harness compatibility](harness-compatibility.md).

CI and PR review run with read-only contents permissions on pull_request, including forks; no privileged pull_request_target execution of contributor code. The harness jobs declare `issues: write` only because the reusable workflow's verdict step can report drift; on a pull request `report` is off, and a fork's token is read-only regardless. The deterministic reviewer is always available and needs no paid API key. Human review still checks whether the description matches code and whether previews or HTTP changes weaken the security boundary.
