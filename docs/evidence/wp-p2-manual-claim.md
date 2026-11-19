# wp-p2 receipt: a person finishes a task by hand while the tick runs the rest

Run 2026-11-19 on linux with node v24.22.3 and git 2.50.1. Code: `task/wp-2-2` at `9f94e92c` (wp-2.2, #657). Script: `node scripts/proof-wp-p2.mjs --root DIR`. Result: **PASS**. No image.

## Setup

- Under one scratch root: a bare remote, its checkout with `check.mjs`, and a workspace made with `avoozl init`. The run has its own `XDG_CONFIG_HOME` and `XDG_STATE_HOME`. No real workspace, Avoozl home, Kiro Crew home or GitHub was read or written.
- `.avoozl.json` sets `delivery.concurrency` 3 and has no `delivery.runner`.
- Three ready tasks: `hand`, `tick` and `back`. Each writes one note, with the check `node check.mjs`.
- The person's steps are the plain CLI, run with no `AVOOZL_*`, `KIROCREW_*` or `KIRO_SESSION_ID` in the environment.
- What Kiro Crew runs each minute is called by the script, as P62 did: one `workspace.tick` with `cron: true`, then one pass of `drainCheckRuns`.
- The `kirocrew` executor is a fake. A chat the tick asks for is bound as opened and reads as working, and never codes.

## Run

| Step | What                                                                              | Observed                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `avoozl claim hand`                                                               | binding `manual-hand-1` (`conductor: cli`); worktree `wt/avoozl-hand`; report command printed                                                |
| 2    | `avoozl claim back`, then `avoozl claim back --release`                           | both exit 0                                                                                                                                  |
| 3    | three ticks                                                                       | tick 1 starts `tick` and `back`; ticks 2 and 3 start nothing                                                                                 |
| 4    | commit `notes/hand.txt` in the worktree, `avoozl runner report hand done` from it | exit 0; report `done` on `6e6b798b`, read from HEAD                                                                                          |
| 5    | ticks until `hand` lands                                                          | one check run on `6e6b798b`, finished and passed; `hand` integrated at `6e6b798b`, which is on the checkout's `main`; no tick started `hand` |

The claim printed this report command, which needs no `avoozl` on `PATH`:
`'<node>' '<checkout>/cli.mjs' runner report hand done --workspace "<root>/ws"`.

## Expected and observed

- EXPECTED (1): the claim prints the worktree and the report command. OBSERVED: yes, both.
- EXPECTED (2): the tick starts the other task only. OBSERVED: across every tick in the run, the tick never started `hand`. It started `tick`, and `back` once `back` was released.
- EXPECTED (3): Avoozl runs the checks on the commit and lands it. OBSERVED: one check run on `6e6b798b` passed, and `hand` integrated at that commit.
- EXPECTED (4): the released task is ready again and the next tick starts it. OBSERVED: the first tick after the release started `back`.

## Order

The task lists the claim and release of a third task last. Here it runs before the ticks. Run last, the third task would already be started: it is ready from the start, and with three lanes the first tick starts it. Whatever the order, each step is checked against the tick that follows it.
