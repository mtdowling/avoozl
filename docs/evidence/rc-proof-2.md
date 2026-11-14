# Radar-coder Proof 2: spec to issues in both modes

Receipt for task `rc-p2` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-2.test.mjs`
- Run with: `node --test src/app/test/radar-proof-2.test.mjs`
- Recorded: 2026-11-14, Node 24.22.3 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

Two runs of one test, `single-repo` and `plans-repo` (a second repository holds the plans). `coder: issue-radar`. An approved spec with 8 tasks: package `1` and leaves `1.1` to `1.7`. Leaves `1.1`, `1.2`, `1.3` are small and ready in one phase. `1.4` needs `1.1`. The merged approval is recorded at a fixed commit.

## Action

1. Preview the issues (`plan.issues.preview`).
2. Confirm with the suggested batch of three (`github.project`).
3. Merge a fake pull request that closes the batch issue, then tick.
4. Edit two tasks in the spec, save, approve again, with one of the two issues already claimed by a crew.
5. Preview and apply Spec changed.

## Observation

- The preview suggests exactly the batch `1.1`, `1.2`, `1.3` and writes nothing.
- All issues are written in the code repository in both modes: the spec's own issue, the package, one batch issue and four task issues (7 in all).
- Five task issues are sub-issues of the package.
- Task `1.4` is blocked by the batch issue.
- One merge closes all three batched tasks; each ends `verified` with its own task ID.
- Spec changed: the preview writes nothing. The unclaimed edited issue is updated. The claimed one gets one comment and its body is not edited. An unedited task's issue changes only in the spec revision line it names.
- No task ID was lost in the batch.

## What this does not show

Project fields are not checked: the fake GitHub has no Project board. The `Create and release` path and the preview modal are not driven.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. Make two scratch repositories: `code-scratch` (single-repo run) and, for the second run, `plans-scratch` plus `code-scratch-2`.
2. Write a spec with 8 tasks under `.kiro/specs/<name>/`. Make three small, ready and in the same phase. Make one task depend on the first.
3. Approve it in Avoozl and merge the approval pull request.
4. Open Project to GitHub. Look for: a batch suggestion of the three small tasks. Click nothing yet and check GitHub: no issues exist.
5. Click **Create issues (held)**. Look for: issues only in the code repository, sub-issues under the package, blocked-by links, and one issue titled `Batch of 3`.
6. Open the Project board. Look for: the Project fields (Status, Wave, Release) filled.
7. Open a pull request that says `Closes #<batch issue>` and merge it. After one tick, look for: all three tasks done in the Graph.
8. Edit the acceptance text of two tasks. Add the `crew: in progress` label to one of their issues. Approve the spec again.
9. Open Spec changed, then apply. Look for: the unclaimed issue edited, the claimed issue untouched with one new comment, other issues unchanged.
10. If a task ID is missing from the batch marker, the proof fails; the next decision is to cap batches at 1.
