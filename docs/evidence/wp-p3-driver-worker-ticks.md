# wp-p3 receipt: two workspaces, one driver and one worker, with only ticks

Run 2026-11-19 on linux with node v24.22.3 and git 2.50.1, on `task/wp-p3`. Script: `node scripts/proof-wp-p3.mjs --root DIR`. Result: **PASS**. No image.

## What this needed

Before this branch, only a person could offer a task to a worker machine (`avoozl spec offer`) or answer a claim (`avoozl spec claims`). A worker's checked result also stopped on the spec's working branch. This branch adds:

- `workers.offerTo`, a list of GitHub logins in the driver's `.avoozl.json`. With it set, the driver's tick does three things for each spec it drives:
  - offers each ready task to each named login once, at the base branch's head;
  - stops starting those tasks itself;
  - answers pending claim requests as `spec claims` does.
- After the driver's tick checks a worker's result into the working branch, it lands that branch on the base branch in the driver's checkout. This is a fast-forward, after merging a moved base in first. It never rebases.

`spec offer` and `spec claims` stay person-only for people and agents.

## Setup

- One scratch root holds a bare remote and the driver's and worker's clones of it.
- It also holds two workspaces made with `avoozl init`, each with its own `XDG_CONFIG_HOME` and `XDG_STATE_HOME`, and one fake GitHub: a JSON file holding the spec issue's comments and the claim branches.
- No real workspace, Avoozl home, Kiro Crew home or GitHub was read or written.
- The driver (`owner`):
  - three tasks in spec `wpp3`, each writing one note with the check `node check.mjs`;
  - the spec's journal on fake issue `example/plans#1`;
  - `workers.offerTo: ["worker-a"]` and `flow.verify.protectedPaths: ["protected/**"]`.
- The worker (`worker-a`): `runner.role: "worker"` on the spec's pool, `executor: "process"`, three lanes.
- Each tick runs in its own process with that machine's environment.
- The worker's harness is a fake. For each child the tick starts, it writes the task's note in the child's worktree, commits, and finishes the session as done through `finishProcessSession`, the function the supervisor calls.
- Task `t3`'s note is `protected/t3.txt`.
- The plan was put in the driver's store as approved, with its approval, as `scripts/proof-wp-p1-live.mjs` does. Then the spec was taken over. No other step ran by hand.

## Run

Seven rounds, each one driver tick then one worker tick, stopping after three rounds with no change.

| Round | Driver                                                 | Worker                                                |
| ----- | ------------------------------------------------------ | ----------------------------------------------------- |
| 1     | offers `t1`, `t2`, `t3` to `worker-a`; starts nothing here | pulls the three offers and asks for all three       |
| 2     | acknowledges the three claims (three claim branches)  | starts three children; the fake commits each note     |
| 3     | nothing new                                            | runs the checks and pushes each task's checkpoint branch |
| 4     | fetches and checks each result: `t1` and `t2` land on `main`; `t3` is refused | nothing new                    |
| 5-7   | no change                                              | no change                                             |

On the fake spec issue: 1 generation, 3 offers, 3 claim requests by `worker-a`, and 3 claim acknowledgments.

The driver's `main` after the run:

```
82d404f Integrate task t2 at 292ef5445e46
6a12c6b Integrate task t1 at 0ebccec2c2b7
292ef54 Write notes/t2.txt   (the worker's commit)
0ebccec Write notes/t1.txt   (the worker's commit)
88081b4 Start the scratch repository
```

## Expected and observed

- EXPECTED (1) and (2): both tasks land on the driver's base branch, and no `worker` command was run by hand. OBSERVED:
  - `t1` and `t2` are integrated on `main` with their notes.
  - No tick of the driver started a task here.
  - Only ticks ran: no `worker`, `spec offer` or `spec claims` command.
- EXPECTED (3): the driver refuses the protected-path result as a failed attempt, and nothing lands. OBSERVED: `t3` is in `decision` with the cause "the worker's result def2b6435796 was protected: protected-paths". `protected/t3.txt` is not on `main`.

## Known limit

A worker task that lands writes no outcome record to the journal yet. Its claim therefore stays open on the journal. The driver passes no claim cap: a worker asks only for its free lanes. This is marked `shortcut:` in `src/app/worker-offer-step.mjs`.
