# P64 recheck: steady CI waste on mtdowling/avoozl, three days later

A second read-only check for proof P64 (Requirement 100, design §4.30), run
on 2026-11-19 at 09:34 UTC against the real `mtdowling/avoozl`, with
`scripts/proof-p64-live.mjs` from `main` at `84367233`. The first check is
`p64-steady-ci-waste.md` (2026-11-16). Same settings: an empty scratch
workspace, no tasks, `flow.retro.everyTasks` 4, `flow.ci.docsOnlyMinutes` 1.

**Verdict: still partial. P64 stays unticked.** The CI fix the first retro
proposed (#280) holds on real data. The proof's own PDCA step still cannot
run read only.

## Results

| Check | 2026-11-16 | 2026-11-19 |
| --- | --- | --- |
| Runs read (one page) | 100, 00:07–08:10 UTC | 100, 03:42–09:27 UTC |
| Pull request rows | 52 (2 open) | 50 (0 open) |
| Docs-only CI minutes, 7 days | 452.2 | 3.5 |
| `spec` class, CI minutes per pull request | 50.2 (9) | 1.75 (2) |
| Repeat-run commits | 22 | 0 |
| CI wait share of lead time | 6% | 6% |
| Retro triggers | `waste-docs`, `repeat` | `waste-docs` only |
| Pull requests in the brief | all `other` | all `other` |
| GitHub calls | 1 GraphQL + 1 REST | 1 GraphQL + 1 REST, 0 refused, 0 writes |

Spec CI minutes per pull request fell 96% and no commit ran the workflow
twice. Both numbers come from two separate scratch workspaces read by hand,
not from the PDCA function on one workspace.

## Why P64 stays open

- Steps (3) and (4) approve the retro's CI proposal, land its task, and
  open 4 new spec-only pull requests. Those are GitHub writes, and this
  check was read only.
- The PDCA function (`ciMinutesPerPullRequest`, class `spec`, n = 4) needs
  4 spec pull requests closed after the change in one workspace. The newest
  50 closed pull requests hold 2: most work now lands on `main` without a
  pull request.

To finish it as written: a scratch repository whose workflow runs on both
`push` and `pull_request`, 8 spec-only pull requests, and a tick that
watches them open and close.

## Files

- `p64-steady-ci-waste/check-2026-11-19.json`: this check (rows, triggers,
  brief, request log, rate counters).
