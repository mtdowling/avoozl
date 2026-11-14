# Radar-coder Proof 1: Avoozl lists only what it was asked to plan

Receipt for task `rc-p1` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-1.test.mjs`
- Run with: `node --test src/app/test/radar-proof-1.test.mjs`
- Recorded: 2026-11-14, Node 24.22.3 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

A fake GitHub with six open issues in one repository set to `coder: issue-radar`, `minimumPermission: write`:

| Issue | State |
|---|---|
| 1, 2, 3 | plain, no label |
| 4 | planning label `to plan`, added by an allowed person |
| 5 | planning label, added by a stranger (read permission) |
| 6 | `plan me` label, no planning label |

The fake records every query and every write.

## Action

Run the Untriaged read and the hand-off read (`untriaged.view`, `conflicts.view`). Start **Plan this** (`untriaged.plan`) on issue 4. Try it on issues 1, 5 and 6.

## Observation

- Intake lists only issue 4.
- Issues 1, 2 and 3 never appear. No query asked for plain open issues; every search named a label.
- Issue 5 (the stranger's label) appears nowhere and nothing is written to it.
- Issue 6 sits under With Issue Radar and gives one Needs you row.
- **Plan this** on issue 4 opens a planner chat with the issue as source. On 1, 5 and 6 it is refused with "not in Intake".
- The fake saw zero writes.

## What this does not show

The real GitHub search syntax and label-event history are not exercised; the fake answers `label:` terms the way the query is written.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. In a scratch repository, create three plain issues: `plain one`, `plain two`, `plain three`. Add no labels.
2. Create issue `from owner`. Add the label `to plan` while signed in as an allowed person.
3. Create issue `from stranger`. Add `to plan` from a second GitHub account that has only read access.
4. Create issue `plan me` with the `plan me` label, as the owner.
5. In `.avoozl.json` set `coder` to `issue-radar` for the repository. Restart or wait one tick (about a minute).
6. Open Avoozl, then Intake. Look for: only `from owner` listed; the three plain issues absent; `from stranger` absent.
7. Open Needs you. Look for: one row for `plan me`.
8. On `from owner`, click **Plan this**. Look for: a planner chat opens and quotes the issue body.
9. On GitHub, check the issues. Look for: no new labels or comments written by Avoozl on any of the six.
10. If the plain issues appear, the proof fails; the next decision is to drop the Intake list for Radar-coded repositories.
