# P64 live: the retro catches steady CI waste on a real repository

Proof P64 (Requirement 100, design §4.30), run 2026-11-16 08:10–08:14 UTC
against the real `mtdowling/avoozl` repository, read only, on `main` at
`db46202d` (after #308).

**Verdict: partial. P64 stays unticked.** Detection, the brief and the CI
plan proposals pass on real data within the call budget. P64's PDCA step
cannot run read only, and the history version of it does not show the drop.
Details under "Not shown".

## Setup

- A scratch workspace in the temporary folder: an empty snapshot, no
  tasks, `.avoozl.json` = `{"flow":{"retro":{"everyTasks":4},"ci":{"docsOnlyMinutes":1}}}`,
  GitHub policy naming only `mtdowling/avoozl`. No real workspace was opened.
- `scripts/proof-p64-live.mjs` runs the tick's CI step (`ciStep`) once with a
  real `GitHubClient` on the owner's `gh` login. A fetch guard allows only
  GraphQL queries with no mutation for this repository and GET requests
  under `/repos/mtdowling/avoozl/`. It refused nothing.
- `scripts/proof-p64-retro.mjs` starts the retro (`retroStep`) and records
  the reply (`recordRetroReply`) on the scratch store. No GitHub call.
- The retro chat: one `claude -p` run with the repository's retro role
  prompt (`prompts/retro.md`) as its system prompt, the brief as its message,
  and no tools. Cost $0.58, 1 turn.
- No GitHub writes: no comments, labels, issues or pull requests.

## Bug found first: #308

The first live read (on `main` at `4a574220`) saw 1 pull request and 100
runs, and linked 1 of the runs to a pull request. The CI counts read only
pull requests listed open. A pull request opened and merged between two
checks, or closed before a workspace's first check, never got a row, so
docs-only waste could not fire. #308 adds the 50 most recently updated
closed pull requests to the same GraphQL query (no new call). It also
links runs to pull requests by head branch, because GitHub empties a run's
pull request numbers after merge. Merged after Linux, macOS and Windows
passed.

## Results

| Check                          | Value                                          |
| ------------------------------ | ---------------------------------------------- |
| Pull request rows              | 52 (2 open, 50 closed), all `other`            |
| Docs-only pull requests        | 11                                             |
| Runs read (one page)           | 100, 00:07–08:10 UTC; 52 push, 48 pull_request |
| Runs linked to a pull request  | 68                                             |
| Docs-only CI minutes, 7 days   | 452.2 (limit 1)                                |
| Repeat-run commits             | 22, 459.7 extra CI min                         |
| CI wait share of lead time     | 6% (limit 40%), so no wait trigger             |
| Retro triggers                 | `waste-docs`, `repeat`                         |
| Brief, per pull request        | `kind`, `number`, `author`, `classes` only     |
| Retro proposals kept / dropped | 2 / 0                                          |
| Second check                   | no new retro (keys already seen)               |

Triggers (`check-1.json`, `retro-recorded.json`):

- `waste:docs:mtdowling/avoozl:2026-11-12`: 452.2 CI min on spec- or
  docs-only pull requests in 7 days.
- `repeat:mtdowling/avoozl:.github/workflows/test.yml:2026-11-12`: test.yml
  ran twice on 6bd16b0 (push, pull_request) and repeated on 21 more
  commits.

The retro chat proposed two `plan` changes. Both name
`.github/workflows/test.yml` and the metric `CI minutes per pull request`,
and both passed validation:

1. Class `all`: limit `push` to `main` and keep `pull_request`, plus a
   concurrency group.
2. Class `spec`: skip the full suite for spec- and docs-only changes.

These are the two changes #280 made (push only on `main`, docs-only changes
skip the heavy steps).

## Before and after #280

#280 merged at 03:17:31 UTC. From the same rows:

| Measure                                    | Before #280 | After #280                  |
| ------------------------------------------ | ----------- | --------------------------- |
| Docs-only CI min, by pull request creation | 450.0 (8)   | 2.2 (#285, #293, #302)      |
| Repeat-run commits, by run start           | 14          | 8, the last at 04:23:11 UTC |
| Repeats on pull requests #291–#308         | –           | 0 over 21 runs              |

The 8 after #280: a99720e on #281's branch, which did not have the fix
yet, and one commit each on #284–#290. #284–#290 were made after #280 and
still ran twice. Each ran
`pull_request` on its branch, then `push` on `main` for the same commit,
because `main` moved to the pull request's head commit when it landed. The
retro counts these correctly. After 04:23 UTC, landings make a new merge
commit and no repeat shows up. The task's "quiet after #280" expectation
therefore holds from #291, not from #281.

## Not shown

- P64 steps (3) and (4), approving the proposal and landing it, then 4 new
  spec-only pull requests, need GitHub writes. This run was read only.
- The PDCA function on history (`ciMinutesPerPullRequest`, class `spec`,
  n = 4, at 03:17:31) gives 50.6 min before and 47.4 min after, a 6% drop.
  That reads as "no change" under the 10% rule. #281 opened before the fix
  and closed after it, and its 187 min of pre-fix CI falls in the "after"
  set. Spec-only pull requests created after the fix used 2.2 min in total.
- CI minutes for closed pull requests are run wall times marked estimates
  (no check run times for closed heads), so they undercount the three
  parallel jobs.

## GitHub calls

| Read                               | Calls                                        |
| ---------------------------------- | -------------------------------------------- |
| Each proof check                   | 1 GraphQL (open + 50 closed) + 1 REST (runs) |
| Receipt run (2 checks)             | 2 GraphQL + 2 REST, 0 refused                |
| Earlier proof runs (baseline, dev) | 3 GraphQL + 3 REST (one runs read was a 304) |
| Manual checks while investigating  | about 3 GraphQL + 3 REST                     |
| Writes                             | 0                                            |

## Files

- `p64-steady-ci-waste/check-1.json`, `check-2.json`: the two checks
  (rows, triggers, brief, before/after split, request log).
- `p64-steady-ci-waste/retro-brief.txt`: the brief the retro chat got.
- `p64-steady-ci-waste/retro-chat.json`: the chat's reply and usage.
- `p64-steady-ci-waste/retro-recorded.json`: proposals as recorded.

Re-run: `node scripts/proof-p64-live.mjs --root <temp dir> --repository mtdowling/avoozl --fixed-at 2026-11-16T03:17:31Z --out <temp dir>/check-1.json`,
then `node scripts/proof-p64-retro.mjs <temp dir> start`, the chat, then `reply`.
The runs read keeps only the newest 100 runs, so a later re-run sees a
later window.
