# Radar-coder Proof 3: each bad issue is refused by name

Receipt for task `rc-p3` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-3.test.mjs`
- Run with: `node --test src/app/test/radar-proof-3.test.mjs`
- Recorded: 2026-11-14, Node 24.22.3 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

Two runs, `single-repo` and `plans-repo`. An approved spec merged through the recorded approval, projected into issues. Six issues are built from one projected issue:

| Case     | Change                                                                  |
| -------- | ----------------------------------------------------------------------- |
| good     | none                                                                    |
| approver | `approved-by` is a login with read permission                           |
| task     | `tasks=` names `config.9.9`, which is not in the spec                   |
| commit   | the compare read says `diverged` (not on the default branch)            |
| author   | the issue author has read permission; the marker names a valid approver |
| marker   | `commit=` edited to another commit after approval                       |

## Action

Run `verifyIssue` on each issue, then apply the one-line crew prompt's rule: build only when it exits 0, otherwise skip with scope `needs-decision` and name the failed check. The rule is applied by the test, not by a crew.

## Observation

- The good issue exits 0 and is built.
- Each bad issue exits non-zero and is skipped as `needs-decision`. Failed checks: approver case `approver`; task case `spec`; commit case `commit`; author case `author`; edited marker `spec` and `commit`. Each names only its own failure, so no bad issue passes by luck.
- No issue text appears in the output.

## What this does not show

A real crew following the one-line prompt is not run. That is the point of the live run.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. Make a scratch repository. In Settings, set the crew Additional prompt to the one line Avoozl ships (copy it from Set up). Create one Issue Radar crew with agent `avoozl-crew`.
2. Approve a spec through the approval pull request and merge it. Project it, so issues carry the marker.
3. Make six issues, each a copy of one projected issue body with one change:
   1. good: no change.
   2. approver: set `approved-by=` to an account with read access only.
   3. task: set `tasks=` to an ID that is not in the spec.
   4. commit: set `commit=` to a commit on an unmerged branch.
   5. author: create the issue from an account with read access only, with a valid owner's login in the marker.
   6. marker: after approval, edit `commit=` to another commit.
4. Add the `ready` label to all six.
5. Wait for the crew. Look for: the good issue gets a pull request; each bad issue is skipped with the `needs-decision` scope and a comment naming its failed check.
6. Run `avoozl verify-issue OWNER/REPO#N` on each. Look for: exit 0 for the good one, exit 1 for each other, and the check name in the output.
7. Repeat once with a plans repository (a second private repo).
8. If the crew builds a bad issue, the proof fails; the next decision is to put the checks in a longer prompt or add a hook.
