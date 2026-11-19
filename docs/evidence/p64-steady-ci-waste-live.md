# P64 live: the retro catches steady CI waste, on a scratch repository

Proof P64 (Requirement 100, design §4.30), run on 2026-11-19 from 10:20 to
10:51 UTC against a new private scratch repository,
`mtdowling/avoozl-scratch-p64`, with Avoozl from `main` at `f7cbe40c` plus
the fix below. The two read-only checks on `mtdowling/avoozl` are
`p64-steady-ci-waste.md` and `p64-steady-ci-waste-2026-11-19.md`.

**Verdict: pass. P64 is ticked.** One bug found and fixed in the same
change: a retro could propose a CI change for a class with no pull
requests, whose PDCA check could then never compare.

## Setup

- `mtdowling/avoozl-scratch-p64` (private, kept): `.github/workflows/test.yml`
  runs on every `push` and every `pull_request`, a matrix of 3 shards each
  time, about 1 minute per shard.
- Scratch workspaces in `/private/tmp/p64-live` (an empty snapshot, no
  tasks), `.avoozl.json` = `{"flow":{"retro":{"everyTasks":4},"ci":{"docsOnlyMinutes":1}}}`,
  GitHub policy naming only the scratch repository. No real workspace.
- Each tick's CI step is `scripts/proof-p64-live.mjs` (`ciStep` with a real
  `GitHubClient` on the owner's `gh` login, behind a guard that allows only
  GraphQL queries and GET requests on the scratch repository). The retro
  start, reply and PDCA check are `retroStep` and `recordRetroReply` on the
  scratch store.
- The retro model: one chat with the default agent on the throwaway test
  Kiro Crew (port 5698), given the retro role prompt (`prompts/retro.md`)
  and the brief, using no tools.
- Every GitHub write went to the scratch repository: creating it, 9
  branches, 9 pull requests and 9 merges, made by the proof chat as the
  person. Nothing was written to any other repository.

## Steps and what was seen

| Step | Seen |
| --- | --- |
| (1) Open 4 spec-only pull requests (#1–#4, one `.kiro/specs/p64-aN/` file each) | CI ran twice per head commit (`push` and `pull_request`), 3 shards each |
| (2a) Tick while open (workspace A) | 4 rows, all `spec`, all `other`; 21.8 CI min from check runs; triggers `waste-docs` (21.8 min, limit 1) and `repeat` (test.yml twice on 4 commits, 10.8 extra min). Calls: 1 GraphQL + 1 REST |
| (2b) Merge #1–#4; tick (workspace A) | 4 closed, exact close times; the same two triggers; the brief lists each pull request as `kind`, `number`, `author`, `classes` only. Calls: 1 GraphQL + 1 REST |
| Retro (workspace A) | The chat proposed a `plan` change naming `.github/workflows/test.yml` with class `docs`, though every pull request was `spec`. Its PDCA check could never compare. See the bug below. The person rejected it. The next two retros did not propose it again, because it had been rejected |
| (2c) A new workspace B, fresh store, one tick | The same 4 closed pull requests from the open query's closed alias, minutes from run wall times (7.9 min, an estimate); the same two triggers |
| Retro (workspace B, with the fix) | Two `plan` proposals, both naming `.github/workflows/test.yml`, class `spec`, metric `CI minutes per pull request`, direction down: run `push` only on the default branch, and skip spec- or docs-only pull requests with `paths-ignore`. Both kept, none dropped |
| (3) Approve both (`flow.retro.decide`) | PDCA baseline 1.975 min per spec pull request (last 4 before approval). Each opened a planner draft: "One new task in mtdowling/avoozl-scratch-p64 that changes .github/workflows/test.yml." The proof chat did that task as #5 (one `ci` pull request) and merged it at 10:44:25 UTC |
| (4a) Open 4 more spec-only pull requests (#6–#9); tick while open (B) | No CI run on any of them |
| (4b) Merge #6–#9; tick (B), then the retro step | PDCA for both proposals: before 1.975, after 0, result `helped`, no revert owed. After the fix: 5 runs, all `push` on `main`, 0 repeat runs (4 before) |

`ws-b-split.json` holds the split at 10:44:25 UTC: 14 runs before and 5
after, repeat runs 4 and 0, spec CI minutes per pull request 1.975 and 0.

## GitHub reads

Each tick made exactly the budgeted reads: one GraphQL query (open pull
requests plus the 50 most recent closed ones) and one REST runs read, with
0 refused. Five ticks, 5 + 5 calls. The proof chat's own reads: 2 batched
`gh run list` calls, 1 `gh pr checks`, and 3 setup reads (repository list
and the shape of an existing scratch repository).

## Bug found and fixed in this change

| Bug | Fix |
| --- | --- |
| A CI proposal's `class` was checked only against the list of names, so `docs` was kept for a repository with only `spec` pull requests. Its PDCA comparison would stay "pending" forever, and the person could not tell | `proposalProblem` drops a CI proposal whose class has no recorded pull request in that repository (`seenClasses` in `flow-ci.mjs`), with a test. `prompts/retro.md` says the class must be one the brief lists, and that a spec-only pull request is `spec` |

## Limits

- The task the approval drafted was written and merged by the proof chat,
  not by an Avoozl worker. Delivery is proved elsewhere. Here the subject
  is the retro and its PDCA check.
- Workspace B never saw #1–#4 open, so their minutes are run wall-time
  estimates. #6–#9 ran no CI, so the after value is 0 either way.
- A rejected proposal is shown to later retros without its reason, so the
  model did not propose the corrected version again. A fresh workspace was
  the way around it here.

## Files

`p64-steady-ci-waste-live/`: `ws-a-check-1-open.json`,
`ws-a-check-2-closed.json`, `ws-a-retro-1-reply.txt` (the reply with class
`docs`), `ws-b-check-1-closed.json`, `ws-b-retro-1-brief.txt`,
`ws-b-retro-1-reply.txt`, `ws-b-check-2-open.json`,
`ws-b-check-3-closed.json`, `ws-b-split.json`.
