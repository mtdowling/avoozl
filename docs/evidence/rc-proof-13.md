# Radar-coder Proof 13: the work split

Receipt for task `rc-p13` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-13.test.mjs`
- Run with: `node --test src/app/test/radar-proof-13.test.mjs`
- Recorded: 2026-11-14, Node 24 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

A fake planner and a fake GitHub. One goal proposes one task. Another proposes five tasks in two levels: one first, four after it. The README, Set up and the quick goal modal are read from the source.

## Action

1. Read the README, `SetupWizard.tsx` and `QuickGoalModal.tsx` for the scope statement.
2. Propose the one-task goal and the five-task goal (`quickgoal.propose`).
3. Approve each (`quickgoal.approve`).

## Observation

- The README holds the statement word for word. Set up and the quick goal modal both import the statement and the rule from `src/work-split.mjs` and repeat no text of their own.
- The one-task goal carries the hint, with the action **Plan it anyway**. The five-task goal carries no hint.
- Both goals still plan: each opens one approval pull request. The hint refused nothing.

## What this does not show

The modal and Set up are checked in source, not drawn in a browser. The three places showing the same words on screen is a live check.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. Open Avoozl on a scratch workspace and open Set up. Look for: the scope statement and the rule of thumb.
2. Open the quick goal modal. Look for: the same two sentences.
3. Open the README. Look for: the same words again.
4. In the modal, ask for a goal that needs one change. Look for: the hint "This fits one pull request" and a **Plan it anyway** action.
5. Click **Plan it anyway**. Look for: it plans as normal.
6. Ask for a goal with five tasks in order. Look for: no hint.
7. If the hint blocks the one-task goal, or shows on the five-task goal, the proof fails; the next decision is to remove the hint.
