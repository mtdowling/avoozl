# Radar-coder Proof 28, live: one check costs one GitHub call

Receipt for task `rc-p28`.

- Recorded: 2026-11-15 20:20 to 20:48 UTC, Linux, `main` at `0e27646` plus
  the two fixes below, real GitHub login (token from `gh auth token`).
- GitHub: private scratch repository `mtdowling/avoozl-scratch-p28` with seven
  open pull requests. PRs #1 to #6 (`feat/p1` to `feat/p6`) are plain. PR #8
  is on the task branch `avoozl/p28-1` and closes issue #7.
- Workspace: single-repo mode, the repository's `coder` is `worker`, and
  `delivery.runner` is `tick`. Task `p28-1` is a leaf on issue #7 with its
  linked branch `avoozl/p28-1` and a working worker binding. The task, the
  linked-branch row and the binding were written into the store directly,
  in the shape projection and dispatch write. No real worker chat ran.
- Method: one Node process runs the real `Operations` class and logs every
  HTTP request it sends to GitHub. The usage counter is read through
  `github.settings.get`, the data behind Settings > GitHub. Each run is
  `workspace.tick` (`cron: true`), then `graph.view`, `github.repositories`
  (Home) and `graph.view` again.
- Verdict: **PASS with the fixes.** Once PR #8 settled, one tick cost one
  GraphQL call for all seven open pull requests. Graph and Home cost none.

## Observation

| Run (UTC)                      | Tick calls | Graph, Home, Graph | Notes                                                       |
| ------------------------------ | ---------- | ------------------ | ----------------------------------------------------------- |
| 20:20, no task                 | 1          | 0                  | `untriaged.view` with `refresh: true` (the Check button)    |
| 20:33, first read of PR #8     | 3          | 0                  | review-label search, open-PR query, feedback detail for #8  |
| 20:35, before fix 1            | 3          | 0                  | counter showed 1 of the 3 (**defect 1**)                    |
| 20:44, #8 settled, after fix 1 | 2          | 0                  | review-label search and open-PR query (**defect 2**)        |
| 20:47, after fix 2             | **1**      | **0**              | open-PR query only; the feedback heads read was a cache hit |

The 20:47 counter change: source `tick` gained one cache hit and no call.
Source `review` gained one call, which was the open-PR query. A tick's first
reader names the source.

The feedback detail read (checks, reviews, threads for changed pull requests)
runs while a pull request has no checks for its first 10 minutes, and after
any change. That read is by design and batches every changed pull request
into one query. The 10-minute untriaged search is separate and ran at 20:43.

## Fixes

1. **The counter dropped calls.** `RateState.flush` wrote at most every 2
   seconds. A tick's last calls stayed in memory. A short process (a CLI
   tick) lost them, and in a long one Settings lagged until the next call.
   Now each call is written when it returns. The usage test no longer calls
   `flush` by hand.
2. **Review drafts searched on their own.** `review-draft.mjs` ran a search
   for open pull requests with the review label on every tick. Now it filters
   the one open-pull-request query, which the feedback step reads from the
   cache in the same tick.

## Not shown

- The Settings > GitHub page itself. The numbers come from the data it shows.
- A real worker chat on the task branch. The binding was written by hand.
- A pull request with the review label going through the draft flow live.
  The unit tests cover it.
