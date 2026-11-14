# Radar-coder Proof 5: auto-merge on the right pull requests only

Receipt for task `rc-p5` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-5.test.mjs`
- Run with: `node --test src/app/test/radar-proof-5.test.mjs`
- Recorded: 2026-11-14, Node 24.22.3 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

A fake repository with required check `build`, auto-merge allowed and `ship: auto-merge`. A second workspace runs `ship: manual`. The fake merges a pull request only when auto-merge is armed on it, `build` is green and it has no conflict. Pull requests:

| PR  | Kind                                                    |
| --- | ------------------------------------------------------- |
| 21  | the crew's, closes a marked issue                       |
| 22  | a stranger's fork                                       |
| 23  | a stranger's branch in the repository                   |
| 24  | a crew pull request that closes no marked issue         |
| 25  | the crew's, closes a marked issue, has a merge conflict |

## Action

Tick three times with `build` red, then three times with it green. Then run the manual-mode workspace with pull requests 21 and 22.

## Observation

- With `build` red, PR 21 is armed and nothing merges.
- With `build` green, only PR 21 merges. PR 21 is armed exactly once.
- PRs 22, 23 and 24 are never armed. PR 25 is armed (GitHub waits for the fix) and stays open. It gets the `merge conflict` label and one Needs you row.
- In manual mode nothing is armed or merged, and PR 21 shows as one Ready to merge row. PR 22 shows none.

## What this does not show

The fake models GitHub's merge rule (armed, green, no conflict); real branch rules and merge queues are not exercised.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. Make a scratch repository. Allow auto-merge. Add a branch rule that requires the check `build`, with a CI workflow that can pass and fail on demand.
2. In Avoozl set `delivery.ship` to `auto-merge` and run Set up. Look for: the three merge-path items ready.
3. Project a spec so a marked issue exists. Let one crew open a pull request for it.
4. From a fork (second account), open a pull request. Open another from a stranger's branch.
5. Make the crew's pull request conflict with `main` on a second marked issue.
6. Make `build` fail on the crew's pull request first.
7. Wait two ticks. Look for: auto-merge shown as enabled on the crew's pull request only; none on the fork or the stranger's.
8. Make `build` pass. Look for: the crew's pull request merges by itself, and nothing else does.
9. Look at the conflicted pull request. Look for: the `merge conflict` label and one Needs you row. Resolve it; look for the label gone.
10. Set `delivery.ship` to `manual`, open another crew pull request, and let `build` pass. Look for: a Ready to merge row, auto-merge off.
11. If any pull request merges that should not, the proof fails; the next decision is to arm only on an explicit label.
