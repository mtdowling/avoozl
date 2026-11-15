# Radar-coder Proof 6, live: a crew on avoozl-crew verifies and builds

Receipt for task `rc-p6` in `.kiro/specs/radar-coder/tasks.md`. The fake-GitHub
run is `docs/evidence/radar-coder-proof-6-fake-github.md`.

- Recorded: 2026-11-15, Linux, Kiro Crew 0.12.2.4, Avoozl from `main` at
  `30f9cbd` plus the fixes in PR #220.
- Kiro Crew: the throwaway harness (`scripts/live-harness/harness.sh`) with its
  own home and port 5692. No other gateway was touched.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-6`.
- Verdict: **PASS.**

## Setup

1. `harness.sh start`, `connect-repo https://github.com/mtdowling/avoozl-scratch-6`.
2. `harness.sh crew-create p6-crew '{"labels":["ready"],"max_open":1}'`, then
   `crew-edit <id> '{"enabled":true,"unattended":true}'`. The crew's agent is
   `avoozl-crew`.
3. An Avoozl workspace in single-repo mode for the scratch repository, with
   plan `alpha` approved and projected (`avoozl github project alpha`). Issue
   #10 (`alpha.1.1`) carries the `<!-- avoozl ... approved-by=mtdowling -->`
   marker and was released with `ready`.
4. Issue #12 was opened by hand with the same marker shape but
   `approved-by=octocat` (no write access) and the `ready` label.

`avoozl verify-issue` on each before the crew ran: #10 every check ok; #12
`FAIL approver: octocat has no write permission`.

## Observation

From the crew's chat (cycle 4, 05:28 UTC):

| Step | Result |
| --- | --- |
| Candidates | "Candidates with `ready` and no claim: #10 and #12" |
| `plans_verify_issue` | called twice, once per issue |
| #12 | comment "Not building this issue. `plans_verify_issue` failed the **approver** check", label `crew: needs human`, no branch |
| #10 | claimed, test first, then `src/config.js`; PR #13 "Read the config file (alpha.1.1)" with `Fixes #10` |
| Set up | `radar.values` with Radar's crew list read from the harness: `agent ok avoozl-crew` |

The crew ran on `avoozl-crew` (the chat's metadata names it), not the default
agent.

## Found on the way

- The harness pointed `KIRO_HOME` at `<dir>/kiro`. Kiro Crew refuses to write
  app agent files there for a second home, so the first crew turn failed with
  "The app agent 'avoozl-crew' isn't loaded yet". Fixed in this PR:
  `KIRO_HOME` is now `<home>/kiro`.
- Set up's agent check was read through a script that calls the harness's
  Radar crews route with the harness token, because the app backend accepts
  only a gateway-signed page request. The data is the same; the auth hop is
  not.
