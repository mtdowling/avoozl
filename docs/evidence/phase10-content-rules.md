# Phase 10 content rules: tasks 10.1–10.7 and proof P28

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 10
(Requirement 40, design §4.9).

- Commits: `40a2601` (matcher, policy, boundaries), `9680c2e` (app page),
  `c0bb2e4` (tests and P28), `6eb818c` (badge variants), this receipt
- Base: `kirocrew-native` at `1db37dd`
- Recorded: 2026-11-12, Node v26.13.0, macOS

## Checks

| Check | Result |
|---|---|
| `npm test` (build, all tests) | exit 0; 619 tests, 619 pass (606 before) |
| `node --test kirocrew-app/ui/test` | 112 tests, 111 pass, 1 skipped, 0 fail |
| `git diff --check` | clean |
| `node scripts/release-scan.mjs` with the local terms file | 0 findings in both packages and the plugin fixtures |
| Settings > Content rules, Conflicts and Delivery rendered to PNG (dark, light, 600 px) and looked at | badges: green available, grey action, yellow only for unavailable |

## Proof P28

`src/app/test/proof-p28.test.mjs` (4 tests) and the P28 (4) test in
`src/app/test/github-project.test.mjs`. Fake terms only.

| Action | Result |
|---|---|
| (1) planner saves a draft naming the codename | refused in-call, 422, names `fake-terms`, `codename`, `p28/design.md`, line 3; no decision; `content.refused` event |
| (2) person approves with the line in tasks.md | `content.match` diagnostic, approval refused, one decision; matched line shown on demand from disk; a session's allow gets 403; person's allow records who, why, SHA-256; next approval passes and uses it; a changed line is blocked again |
| (3) issue title `zorbl&#97;t` | projection writes nothing for that issue, opens a decision, projects the other issue |
| (4) Release "Project X launch" | no Release write for that item, decision names `fake-plugin-set` with version `1.0.0`; other items sync |
| (5) worker adds the fake host | `done` refused in-call; the pre-push hook stops the push; the amended commit is accepted and integrates; a base file holding the host never blocks; main checkout hooks untouched |
| (6) PR body names the codename | completion held, decision opens, reason names set, rule, field and line only |
| (7) replies | today's reply-screen tests pass unchanged; a reply naming a fake term is refused in-call with no decision |
| (8) brief matches the report set | brief sent; Delivery shows one `fake-paths` finding; one notification |
| (9) terms file deleted / tracked / plugin crash / slow rule | one unavailable decision, tick finishes, settled when restored; tracked file refused; crash makes only `fake-plugin-set` unavailable; `(a+)+$` times out in about 2 s and fails closed |
| (10) `terms` key in `.avoozl.json`; MCP allow | policy invalid, every boundary fails closed; MCP `plans_content_allow` refused |
| (11) grep for each blocking term, plain and encoded | zero hits in decisions, allowances, reports, notifications, receipts, sessions, deliveries, events and tasks, and in the landed history; release scan prints `codename` and line 2, not the line |

## Design notes settled

- Pre-push hook per worktree (the Inferred note in §4.9): Git runs hooks from
  the common folder unless `core.hooksPath` is set. Avoozl turns on
  `extensions.worktreeConfig` and sets `core.hooksPath` with
  `git config --worktree`, so only that worktree uses the hook. Tested: a push
  from the worktree runs it; a push from the main checkout does not.
- Matching runs in a `worker_threads` worker; the caller waits with
  `Atomics.wait`, so every boundary keeps a synchronous check with a real
  time limit.
