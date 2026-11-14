# Radar-coder Proof 16: a rewrite on an integration branch

Receipt for task `rc-p16` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-16.test.mjs`
- Run with: `node --test src/app/test/radar-proof-16.test.mjs`
- Recorded: 2026-11-14, Node 24 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

One fake GitHub that models a protected branch `rewrite/x`, its checks, its head, and the one write it allows: merging main into the branch. It has no call that merges the branch into main. A four-task approved epic names the branch.

## Action

1. Check the branch (unprotected, then protected).
2. Run `verify-issue` for a task pull request into the branch and into main.
3. Merge three of four tasks; tick (sync and head checks).
4. Main moves and the sync conflicts; tick.
5. The head check fails; tick.
6. Fix both (main merged into the branch, a green head); tick.
7. Approve landing for an old head, then for the current head; the head moves.

## Observation

- An unprotected branch is not ready; a protected one is.
- A pull request into the branch passes; one into main fails.
- Three tasks merged of four; the green head is accepted and no stop is open.
- The conflict leaves the branch unchanged, raises one row, and opens one stop. No landing row shows.
- The red head keeps one stop. Approving landing is refused ("not green").
- After the fix both clear. One landing row shows. An approval for the old head is refused ("Review it again"). The approval for the current head is recorded. When the head moves, the approval no longer counts and the row asks again.
- Every merge the fake saw was main into the branch. Nothing merged the branch into main.

## What this does not show

Real branch protection, real check runs and the real merge call are not used. Sync scheduling is driven by the clock value given to the tick.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. On a scratch repository make a branch `rewrite/x` and protect it. Name it in an approved four-task epic.
2. Create issues and release. Look for: each task issue names `rewrite/x` as its base.
3. Open a pull request for a task into `main`. Run verify-issue on it. Look for: a refusal naming both branches.
4. Merge three task pull requests into the branch. Look for: Trace shows 3 of 4 merged and the head's check state.
5. Push a change to `main` and one to the branch that touch the same lines. Wait for the sync. Look for: one Needs you row naming the files, the branch unchanged, no release.
6. Make a check on the branch fail. Look for: one stop that says red check.
7. Resolve the conflict by merging `main` into the branch yourself. Fix the check. Look for: both clear.
8. Look for: one landing row. Approve it. Look for: Avoozl records you and the head, and does not merge anything.
9. Push one more commit to the branch. Look for: the approval no longer counts.
10. If Avoozl merges the branch into main by itself, the proof fails; the next decision is to block the branch feature.
