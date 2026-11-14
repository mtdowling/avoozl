# Design: rewrite

Status: Draft

The work happens on a long-lived integration branch named in
`avoozl/manifest.json` (`integrationBranch`, `rewrite/my-epic` here; rename it). Avoozl creates no branch: create
it on GitHub and protect it first. Every task opens its pull request against
that branch. The default branch is merged into it on the schedule in
`integrationSync` (weekly, daily or off) as a merge commit, never a rebase.

The whole-head checks run on the branch head. A task merge does not accept the
epic; a green head does. When the head is green and level with the default
branch, one person approves landing it and merges it on GitHub.
