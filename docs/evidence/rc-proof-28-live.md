# Radar-coder Proof 28, live: one check costs one GitHub call

Receipt for task `rc-p28`.

- Recorded: 2026-11-15 20:40 to 20:55 UTC, Linux, `main` at `0e27646`, real
  GitHub login (token from `gh auth token`).
- GitHub: private scratch repository `mtdowling/avoozl-scratch-p28` with six
  open pull requests (`feat/p1` to `feat/p6`, one file each).
- Method: one Node process runs the real `Operations` class on a fresh
  workspace that names the scratch repository. It reads the usage counter
  through `github.settings.get` (the data behind Settings > GitHub) before and
  after. No Kiro Crew gateway was needed.
- Verdict: **PARTIAL.** The pull-request read costs one call and later reads
  come from the cache. The tick and Graph views were not shown to read pull
  requests, because the scratch workspace has no task with a worker branch.

## Observation

| Step | GraphQL calls added | Counter source |
| --- | --- | --- |
| `untriaged.view` with `refresh: true` (the Check button) | 1 | `view` |
| `pullRequestHeads` for six branches, twice, then `openPullRequests` | 1 | `other` |
| Same reads again in a second process inside the cache window | 0 | cached |
| `conflicts.view`, `delivery.view`, `graph.view`, `activity.recent`, `workspace.tick`, twice | 0 | none (they read stored data, not GitHub) |

The six heads came back for all six branches on both reads. The query returns
`closingIssuesReferences` for each pull request, so closing issues need no
second call.

## Not shown

- The tick's own pull-request read, which needs a task with a worker branch.
  It uses the same `pullRequestHeads` call measured above.
- The Settings > GitHub page itself. The numbers are from the data it shows.
- The `other` source label on the heads read: the probe ran outside a tick,
  so the call had no named source.
