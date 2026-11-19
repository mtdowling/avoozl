# Radar-coder Proof 4, live: release honors N, scopes, phases and the stop

Live run for task `rc-p4`. The fake-GitHub receipt is `rc-proof-4.md`.

- Recorded: 2026-11-15, Linux, a throwaway Kiro Crew gateway (`scripts/live-harness/harness.sh`), two real Issue Radar crews on agent `avoozl-crew`, real GitHub (private scratch repositories).
- Script: `scripts/live-proofs/p4.mjs`
- Verdict: **PASS** on the second run. The first run found a bug: one capacity-1 scope held two ready issues for one tick. Fixed in PR #217; the second run, with the fix, had no breach.

## Setup

- Spec `files`: phase 1 has `code-a`, `code-b`, `docs-a`, `docs-b`; phase 2 has `code-c`, `docs-c`. Each task adds one text file. The `docs-*` tasks have `scope: docs-ready`. Phase 2 has no `requires` edges, so only the phase gate holds it.
- `.avoozl.json`: `coder: issue-radar`, `release: { capacity: 1, scopes: [{ label: docs-ready, capacity: 1 }] }`.
- Two crews, both with the one-line Avoozl prompt:

```
harness.sh connect-repo https://github.com/OWNER/REPO
harness.sh crew-create code-crew '{"labels":["ready"],"extra_prompt":"<CREW_PROMPT>","max_open":3,"auto_merge":false,"enabled":true,"unattended":true}'
harness.sh crew-create docs-crew '{"labels":["docs-ready"],"extra_prompt":"<CREW_PROMPT>","max_open":3,"auto_merge":false,"enabled":true,"unattended":true}'
node scripts/live-proofs/p4.mjs OWNER/REPO CODE_CREW_ID DOCS_CREW_ID --confirm
```

Every minute the script ticks Avoozl (`workspace.tick`, then `github.project`), counts open issues with each label on GitHub, and merges open crew pull requests as the owner. When phase 2 is released it pauses the docs crew, waits for the code crew to claim `code-c`, pauses that crew, and pulls Stop the line. Then it resumes, reopens `code-a` on GitHub, waits 70 seconds (GitHub answers are cached 60 seconds) and ticks.

## What happened

| Check                                            | Run 1 (before #217)                      | Run 2 (with #217)  |
| ------------------------------------------------ | ---------------------------------------- | ------------------ |
| Never more than 1 open `ready`                   | held                                     | held               |
| Never more than 1 open `docs-ready`              | **broken once** (see below)              | held, 35 snapshots |
| Phase 2 labeled only after all of phase 1 closed | yes                                      | yes                |
| Stop: unclaimed `docs-c` loses `docs-ready`      | yes                                      | yes                |
| Stop: claimed `code-c` keeps its labels          | yes                                      | yes                |
| Stop: one comment on `code-c`, none on `docs-c`  | yes                                      | yes                |
| Resume: `docs-c` gets `docs-ready` again         | yes                                      | yes                |
| Reopen `code-a`: `docs-c` loses it again         | yes, on the tick after the cache expired | yes                |
| Reopen: `code-c` keeps its labels                | yes                                      | yes                |

Each crew built its issues: it verified, claimed, opened a pull request, and left it for the script to merge.

## Bug found: a claimed issue gave its slot away (PR #217)

Run 1: docs-crew claimed `docs-a` and opened its pull request. On the next tick `docs-a`'s task was no longer a release candidate (it had left the ready queue), and the count of other holders skipped it because it belongs to the plan. So the slot looked free, and `docs-b` got `docs-ready` six seconds before `docs-a`'s pull request merged. Two open issues held a capacity-1 label.

The fix counts every open issue that holds the label and is not a candidate this tick. A test that fails without it is in `src/app/test/radar-coder-release.test.mjs`.

## Found on the way

- In run 2, code-crew-2 read "advance ONE item" as "work only one issue ever" and stopped after its first pull request, asking whether to take the next issue. The script's owner answered it once through the harness gateway (`harness.sh api POST /api/chat` with the crew's slot and "Take issue #4 now..."). It then worked normally. This is the crew's reading of Issue Radar's brief, not Avoozl.
- Release reads GitHub through the 60-second cache, so a reopen is seen up to a minute late.

## Not run

- The Kiro Crew page (Release queue, Stop the line button) was not clicked; the same operations were run.
