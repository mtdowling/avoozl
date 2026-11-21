# Simplify proof 6.2, live: two machines, one spec

Receipt for task `sim-6.2`.

- Recorded: 2026-11-21 04:34 to 04:45 UTC, macOS, Node v26.13.1, Avoozl from
  the `task/simplify` worktree with the fixes below (the base was `main` at
  `17fe16f5d`).
- GitHub: private scratch repository `mtdowling/avoozl-scratch-sim62`, with
  no CI workflow and no branch rules.
- Machines: two Avoozl workspaces on one computer, `sim62-a` and `sim62-b`,
  each with its own `XDG_CONFIG_HOME` and `XDG_STATE_HOME`, its own clone of
  the repository and its own worktree folder. Both have `loop.run` set to
  `["specs"]`, `lanes.local` 1, `lanes.reviewers` 1 and the check
  `node check.mjs`. Machine A lands `direct`; machine B lands `pr` with
  `pr: draft`.
- Harness: a process harness script on both machines that writes the note the
  brief names and commits it, so every run is the same.
- Verdict: **PASS** for the four claims and the draft merge, after three fixes
  the run found. One lint error remains on the scratch repository's `main`;
  see Open finding.

## The spec

`pair`, approved by merging pull request #5 (merge commit `9047f94`, merged
by `mtdowling`). Its `tasks.md`:

```markdown
- [ ] `p-1` Write the fifth note [R1] (§D1)
- [ ] `p-2` Write two notes side by side (**PARALLEL**)
  - [ ] `p-2.1` Write the sixth note [R1] (§D1)
  - [ ] `p-2.2` Write the seventh note [R1] (§D1)
- [ ] `p-3` Write the eighth note [R1] (§D1)
```

Lint before the run: no diagnostics, tasks `p-1 p-2 p-2.1 p-2.2 p-3`.

## Steps

1. Approve `pair` by merging pull request #5 as `mtdowling`.
2. Run rounds of one tick on A, then one tick on B, until both machines show
   every task done.
3. When B's draft pull request #6 appeared, mark it ready with
   `gh pr ready 6` and merge it with `gh pr merge 6 --merge`, both as
   `mtdowling`, the owner's own gh login. The repository has no CI, so there
   were no checks to wait for.

## Observations

| Task | Claimed by | Claim | Landed as | Tick in the same commit |
| --- | --- | --- | --- | --- |
| `p-1` | A | `avoozl/pair/p-1`, lease 1 | `c450065` Land p-1 (direct) | yes: `tasks.md` and `notes/five.txt` |
| `p-2.1` | B | `avoozl/pair/p-2.1`, lease 1 | PR #6, merge commit `9f20a2c`, by `mtdowling` | yes: the PR head `608c078` Tick p-2.1 sits on the work commit, and the merge brings both |
| `p-2.2` | A | `avoozl/pair/p-2.2`, lease 1 | `fbddcd0` Land p-2.2 (direct) | yes: `tasks.md` and `notes/seven.txt` |
| `p-3` | A | `avoozl/pair/p-3`, lease 1 | `8942378` Land p-3 (direct) | yes: `tasks.md` and `notes/eight.txt` |

- The two parallel tasks were claimed by different workspaces: `p-2.1` by B
  and `p-2.2` by A, both while the other's claim branch was on origin.
- Each task was claimed once: every lease ref is generation 1, and each
  machine's database holds a delivery only for the tasks it claimed (A:
  `p-1`, `p-2.2`, `p-3`; B: `p-2.1`).
- Each claim branch and lease ref was gone from origin after its task landed.
- B opened pull request #6 as a draft at 04:42:30. It was merged at 04:44:00
  by `mtdowling`.
- The graph block in `tasks.md` is byte-identical before and after: the
  landings changed only box marks.
- B's own landing record for `p-2.1` refused the pull request with
  `no required check`, as the `pr` landing does on a repository with no
  required check, and sent the attempt back to its worker. The task still
  reads done on both machines, because `main` carries its tick.
- Lint after the run reports one error, `group.box`: "Every task of group
  "p-2" is ticked. Tick the group too; its box follows its tasks."

## Fixes the run found

Each fix is in the same commit as this receipt, with a test.

1. **An approval through a merge commit was never adopted.**
   `approvalCommits` (`src/app/git/git-approvals.mjs`) read `git log
   --name-only`, which lists no files for a merge commit, so merging a spec's
   pull request approved nothing. It now reads the first-parent history with
   `--diff-merges=first-parent`.
2. **The loop pass started tasks without claiming them.** A loop start made a
   worktree on `avoozl/<task>` and created no claim branch, so a second
   machine started the same task. `claimDispatches`
   (`src/app/workers/runner.mjs`) now creates each worker start's claim branch
   and lease on origin first, as `avoozl next --claim` does, and drops a start
   whose claim another runner made first. The worktree is made on the claim
   branch.
3. **A process lane paused after every task.** A process child's exit marks
   its session closed, and `observeLanes`
   (`src/app/sessions/lane-sessions.mjs`) read that as a person closing the
   lane, so each lane paused after one task. Only a chat's close pauses a lane
   now. The run's lanes were resumed once with `avoozl lane resume`, which
   also read the wrong argument: it took `resume` as the lane name
   (`src/app/commands/delivery.mjs`).

## Open finding

The `p-2` group's box stays open on `main`. B ticked `p-2.1` on its pull
request at 04:42:25, when `main` did not yet have `p-2.2` ticked, so its tick
commit could not tick the group. A then landed `p-2.2` at 04:43:26, when
`main` did not yet have `p-2.1` ticked. The merge at 04:44:00 brought both
ticks, and nothing ticked the group. Avoozl requirement 113.9 allows a parent's
tick only as the result of a child's tick, so no later landing repairs it.
This needs a decision on the rule before a fix.
