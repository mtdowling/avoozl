# Radar-coder Proof 18: approve on the issue

Receipt for task `rc-p18` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-18.test.mjs`
- Run with: `node --test src/app/test/radar-proof-18.test.mjs`
- Recorded: 2026-11-14, Node 24 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

A fake GitHub with three source issues (7, 8, 9), each with its own drafted plan. Only `owner` is an allowed actor.

## Action

1. `owner` adds the `plan approved` label to issue 7.
2. Plan 2 is approved in Avoozl (issue 8).
3. `stranger` adds the label to issue 9.
4. Tick three times.

## Observation

- Two approval records exist, for plans 1 and 2. Plan 3 has none.
- Issue 7 keeps the person's label and gets no comment from Avoozl.
- Issue 8 gets the label and exactly one hidden marker comment with the approver, the spec path and a time, and no spec text.
- Issue 9 loses the stranger's label and shows one Needs you row naming the stranger.
- For all three issues, the label is on the issue exactly when a record exists.

## What this does not show

The write-back after a failed comment and the unreadable labeler are in `src/app/test/radar-coder-approval.test.mjs`.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. On a scratch repository make three issues and ask Avoozl for a plan on each.
2. As an allowed person, add the `plan approved` label to the first. Wait one tick. Look for: the plan approved, no new comment.
3. Approve the second plan inside Avoozl. Look for: the label and one comment with a hidden `avoozl-approval` marker on its issue.
4. Add the label to the third from an account with no write access. Wait one tick. Look for: the label removed and one Needs you row naming that account.
5. If the issue and the record ever disagree, the proof fails; the next decision is to make the record the only source and drop the label path.
