# Radar-coder Proof 4: release honors N, scopes, phases and the stop

Receipt for task `rc-p4` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-4.test.mjs`
- Run with: `node --test src/app/test/radar-proof-4.test.mjs`
- Recorded: 2026-11-14, Node 24.22.3 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

One repository, `coder: issue-radar`, capacity 1 for the `ready` scope and 1 for the `docs-ready` scope. Six tasks. Phase 1: `code-a`, `code-b`, `docs-a`, `docs-b`. Phase 2: `code-c`, `docs-c`. Docs tasks use the `docs-ready` scope.

## Action

Tick while the crews claim and merge. Then pull **Stop the line**. Then resume and reopen a closed issue.

## Observation

- After every tick, at most one open issue holds each scope's label.
- Tick 1 labels `code-a` and `docs-a` only. Phase 2 gets nothing.
- Claimed issues keep their slots; three more ticks release nothing.
- After both merge, `code-b` and `docs-b` are released; phase 2 still waits.
- After phase 1 is whole, `code-c` and `docs-c` are released.
- Stop the line with `code-c` claimed and `docs-c` unclaimed: `docs-c` loses its ready label; `code-c`'s labels are unchanged and it gets one comment across three ticks.
- Resume releases `docs-c` again. Reopening a closed phase 1 issue holds `docs-c` again and leaves the claimed issue alone.

## What this does not show

The reopen is simulated by resetting the task's verdict, not by a GitHub reopen event. Real crew timing and the 60-second tick are not exercised.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. Make a scratch repository. Create two Issue Radar crews, one for the `ready` label and one for `docs-ready`.
2. In Settings set release capacity 1 and a `docs-ready` scope with capacity 1.
3. Write and approve a spec with two phases: four tasks in phase 1 (two code, two docs) and two in phase 2. Project it with **Create and release**.
4. Open the Release queue. Look for: one `ready` issue and one `docs-ready` issue; phase 2 shown as held with a reason.
5. Let the crews build and merge. At every point, count open issues with `ready` and with `docs-ready` on GitHub. Look for: never more than 1 each.
6. After the last phase 1 pull request merges, wait one tick. Look for: phase 2 issues get their labels.
7. Claim one phase 2 issue (the crew does it) and click **Stop the line**. Look for: the unclaimed issue loses `ready`; the claimed one keeps its labels and has one new comment.
8. Resume. Reopen a closed phase 1 issue on GitHub. Look for: phase 2's unclaimed issue loses its label again.
9. If more than N are ready at any point, or phase 2 starts early, the proof fails; the next decision is to add a lower N default.
