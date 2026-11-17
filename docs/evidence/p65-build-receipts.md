# P65 live: every build receipt kept, and a build breakdown in a retro

Proof P65 (Requirement 101, design §4.31), run with
`scripts/proof-p65-live.mjs` in scratch Avoozl workspaces in the temporary
folder. No real workspace was opened or ticked.

| Run | When (UTC)       | Repository                               | Report form | Result           |
| --- | ---------------- | ---------------------------------------- | ----------- | ---------------- |
| 1   | 2026-11-17 14:10 | `mtdowling/avoozl`, read only            | none        | partial (#391)   |
| 2   | 2026-11-17 15:21 | `mtdowling/avoozl-scratch-p65` (private) | field       | pass, every part |
| 3   | 2026-11-17 15:02 | `mtdowling/avoozl-scratch-p65` (private) | artifact    | pass, every part |

**Verdict: pass. P65 is ticked.** Run 2 follows the proof's setup exactly
(`receipts.report` set to a field). Run 3 shows the same with the artifact
form.

## Bugs found by run 1, fixed first

| Pull request | Bug                                                                                                               | Fix                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| #401         | Only the newest 100 artifacts were read. #378 and #381 kept 1 of 3 receipts and were then marked done.            | The reader pages the list until a page is short or older than every run it still needs (at most 10 pages). |
| #402         | Flow's Builds block came only from Issue Radar rows, so a repository with receipts and no Radar crew showed none. | `radar.flow` adds every merged pull request with stored observations; the card shows builds alone.         |

Each was merged after Linux, macOS and Windows passed. Runs 2 and 3 ran on
code with both fixes.

## The scratch repository

`mtdowling/avoozl-scratch-p65` (private) runs a copy of `mtdowling/avoozl`'s
receipt steps on Linux, macOS and Windows: `bin/build-receipt --phase build
-- npm run build` and `--phase test -- npm test`, each job uploading
`build-receipt-<os>` (`if: always()`). A test script (`scripts/report.mjs`)
then writes one R101 v1 build report per job, with made-up workload and
engine names (`recipe-index`, `quill`), the target, the toolchain, the cache
mode from a `cache-mode` file, the costs and two parts. It fills the
`report` field of the job's last receipt line (run 2) and also writes it as
a `build-report-<os>` artifact (run 3).

The workspace: GitHub policy naming only the scratch repository with
`buildReceipts: true`; `receipts.report` = `{"field": "report"}` (run 2) or
`{"artifact": "build-report"}` (run 3).

The script's fetch guard allows only GraphQL queries with no mutation for
the repository, GET requests under `/repos/mtdowling/avoozl-scratch-p65/`,
and the signed address an allowed artifact download redirected to, with no
token. It refused nothing. GitHub writes went only to the scratch
repository: its pull requests and two re-runs.

## Run 2: the field form (the proof's setup)

| Step | What was done                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 1    | PR 7: a `fail-once` file fails the Linux test on run attempt 1. Re-ran the failed job; it passed. Merged. |
| 2    | Two checks (`ciStep` twice).                                                                              |
| 3    | PRs 8–11 merged with the same report key; PR 12 merged with `cache-mode` = `cold`.                        |
| 4    | A retrospective started by hand (the trigger `flow.retro.start` queues), then `retroStep`.                |

The workspace reads all 12 merged scratch pull requests; PRs 1–6 (run 3's)
carry no `report` field, so only PRs 7–12 give breakdowns.

| Expected                                | Seen                                                                                                   | Pass |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---- |
| 6 or more observations for the first PR | PR 7: 8, build and test on 3 targets plus the Linux re-run's build and test (attempts 1 and 2)         | yes  |
| The failed attempt marked               | PR 7, `ubuntu-latest`, attempt 1, `test`, exit 1, failed; Flow shows 1.6 s failed                      | yes  |
| The costliest phase in Flow             | `radar.flow`'s builds name each PR's costliest phase (PR 7 `build`, failed ms apart; PRs 8–12 `test`)  | yes  |
| One artifact list per check             | Check 1: one list, read in 2 pages (more than 100 artifacts, #401). Check 2: none (every head settled) | yes  |
| One download per artifact               | 38 receipt artifacts, 38 downloads; no artifact read twice                                             | yes  |
| The second check: 0 downloads           | 0                                                                                                      | yes  |
| The brief holds the breakdown           | `builds` per key: count, latest and median of each cost and part, and the costliest part               | yes  |
| The other cache mode never compared     | 6 keys: `warm` Linux 6, macOS 5, Windows 5; `cold` 1 each (PR 12 only); `unmatched` 0                  | yes  |

Linux `warm` holds PR 7's two attempts and PRs 8–11. PR 12 is only in its
three `cold` keys.

Stored: 76 observations from 38 receipt artifacts (0 lines skipped), 2
failed (PR 1 and PR 7, each Linux attempt 1), 19 breakdowns.

Calls, check 1: 1 GraphQL, 1 workflow runs, 2 artifact list pages, 38
downloads (and 38 signed file reads). Check 2: 1 GraphQL, 1 workflow runs,
nothing else.

## Run 3: the artifact form

PRs 1–6, the same steps (PR 1 failed once and re-ran; PRs 2–5 one key; PR 6
`cold`), with `receipts.report` = `{"artifact": "build-report"}`. Before
PRs 7–12 existed.

| Measure                 | Seen                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| First PR's observations | 8, 1 failed (Linux attempt 1, `test`)                            |
| Calls, check 1          | 1 list, 38 downloads (19 receipts, 19 reports)                   |
| Calls, check 2          | no list, 0 downloads                                             |
| Brief keys              | `warm` Linux 6, macOS 5, Windows 5; `cold` 1 each; `unmatched` 0 |

Re-running a failed job kept both Linux artifacts: GitHub gave the second
upload of `build-receipt-ubuntu-latest` its own artifact ID, so the workflow
needs no name change.

## Seen, not asked

- The brief's per pull request costliest phase counts failed observations;
  Flow leaves them apart. For PR 7 the brief says `test`, Flow `build`.
- A failed attempt's breakdown is in its key's medians (PR 7, Linux
  `warm`).

Neither changes a verdict above. Both are recorded for the next change to
build retrospectives.

## Files

- `p65-build-receipts/live.json`: run 1 (`mtdowling/avoozl`).
- `p65-build-receipts/scratch-field-live.json`,
  `scratch-field-retro-brief.txt`: run 2.
- `p65-build-receipts/scratch-artifact-live.json`,
  `scratch-artifact-retro-brief.txt`: run 3.

Remake run 2 (the scratch repository is private to its owner):

```sh
node scripts/proof-p65-live.mjs --root "$(mktemp -d)" \
  --repository mtdowling/avoozl-scratch-p65 \
  --report-field report --out live.json
```
