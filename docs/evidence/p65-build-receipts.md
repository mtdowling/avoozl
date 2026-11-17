# P65 live: every build receipt kept, on a real repository

Proof P65 (Requirement 101, design §4.31), run 2026-11-17 14:10 UTC
against the real `mtdowling/avoozl` repository, read only, on `main` at
`1abb1792` (after #390). Its CI uploads `build-receipt-<os>` from Linux,
macOS and Windows (#324).

**Verdict: partial. P65 stays unticked.** Reading every receipt, the call
budget and the retro brief's costliest phase pass on real data. The failed
attempt, the 6-observation pull request and the breakdown comparison cannot
be shown read only on this repository. Details under "Not shown".

## Setup

- A scratch workspace in the temporary folder: an empty snapshot, no tasks,
  `.avoozl.json` = `{}`, GitHub policy naming only `mtdowling/avoozl` with
  `buildReceipts: true`. No real workspace was opened or ticked.
- `scripts/proof-p65-live.mjs` runs the tick's CI step (`ciStep`) twice
  with a real `GitHubClient` on the owner's `gh` login. A fetch guard allows
  only GraphQL queries with no mutation for this repository, GET requests
  under `/repos/mtdowling/avoozl/`, and the signed address an allowed
  artifact download redirected to, sent with no token. It refused nothing.
- No `receipts.report`: this repository's CI writes no build report.
- No GitHub writes. The only write is this pull request.

Raw output: `p65-build-receipts/live.json`.

## Results

| Check                            | Value                                 |
| -------------------------------- | ------------------------------------- |
| Merged pull requests in the read | 50                                    |
| Merged heads with receipts read  | 12 (#367 to #390)                     |
| Receipt artifacts read           | 32, 32 lines, 0 skipped               |
| Observations stored              | 32, one per artifact, 0 failed        |
| Observations per pull request    | 3 (one per OS) on 10; 1 on #378, #381 |
| Heads stored as `none`           | 23 (no artifact on the listed page)   |
| Breakdowns                       | 0 (no report)                         |

Calls per check:

| Read               | Check 1 | Check 2 |
| ------------------ | ------- | ------- |
| GraphQL pull reqs  | 1       | 1       |
| Workflow runs      | 1       | 1       |
| Artifact list      | 1 (200) | 1 (304) |
| Artifact downloads | 32      | 0       |
| Signed file reads  | 32      | 0       |

One list per check, one download per artifact, and 0 downloads on the second
check: as the call budget says.

Flow's build view (`buildView`, over the stored observations of the 12
pull requests):

| Target         | Phase      | Count | Median  |
| -------------- | ---------- | ----- | ------- |
| ubuntu-latest  | `npm test` | 11    | 2.2 min |
| macos-latest   | `npm test` | 10    | 4.0 min |
| windows-latest | `npm test` | 11    | 6.3 min |

Each pull request's costliest phase is `npm test` (#390: 11.8 min over 3
targets). The retro brief (`buildBrief`) holds the same: per pull request,
`kind` `other`, `costliestPhase` `npm test` and its minutes. It has no
breakdowns and `unmatched` 0.

## Not shown

- **Failed attempt marked.** No pull request in the window had a failed or
  re-run CI job (no run with `run_attempt` above 1, no non-zero exit). The
  proof's step 1 fails a job on purpose; that is a write, so it was not done.
- **6 or more observations for one pull request.** The CI wraps one
  command (`npm test`), so each pull request has at most 3 lines (3 targets).
  6 needs a second phase (a build step through `bin/build-receipt`) or a
  re-run.
- **Breakdown in the retro, other cache mode never compared.** The CI
  writes no build report, so there are no breakdowns or keys. Steps 3 and 4
  (merging 5 pull requests with report keys) are writes.
- **Flow's page.** The Flow page's build card is filled by `radar.flow`
  (`radar-flow.mjs`), which reads only repositories whose coder is
  `issue-radar`. This repository is not, so its stored observations reach
  Trace and the retro brief but not the Flow page. The numbers above come
  from Flow's own `buildView` on the stored rows, not from the page.

## Finding: the one-page artifact list loses receipts on a first read

#378 and #381 kept 1 observation each, not 3. Their runs uploaded 3
artifacts, but only the newest fell inside the 100 artifacts the list
returns. The head then counts as `done`, so the other 2 are never read. With
a check every few minutes fewer than 100 artifacts appear between checks,
so this hits the first read of a busy repository and any long gap. It is the
§4.31 shortcut, and P65's own next decision: **read a second page of
artifacts**. Not fixed here, since it changes the call budget.

## To pass P65

On a scratch repository (writes allowed): add a build step through
`bin/build-receipt --phase build`, set `receipts.report` to a field a test
script fills, fail one test job and re-run it, merge 4 pull requests with
one report key and 1 with another cache mode, then run this script and a
retrospective.

Remake the read:

```sh
node scripts/proof-p65-live.mjs --root "$(mktemp -d)" \
  --repository mtdowling/avoozl --out live.json
```
