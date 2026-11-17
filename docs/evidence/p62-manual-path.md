# Proof P62: a person finishes a task by hand

Date: 2026-11-17. Requirement: R96.5 (design §4.28). Result: **PASS**, after
one repair the live run found (PR #399).

## Setup

- Code: main at `dd57a975` (with PR #399).
- Private scratch repository `mtdowling/avoozl-scratch-p62`, cloned to
  `/private/tmp/avoozl-p62/final/clone` at `6473ef1c`. Nothing was pushed to it.
- Isolated workspace `/private/tmp/avoozl-p62/final/ws`, made with
  `avoozl init`, with its own `XDG_CONFIG_HOME`, `delivery.runner` set to
  `crew-mode` and concurrency 2. No real workspace, gateway or Kiro Crew home
  was read or written.
- Seeded with a script, as `scripts/live-proofs/lib.mjs` seeds live proofs:
  one project `scratch` over the clone, with one argv check that both files hold
  their text, and two ready leaves.
  - `p62-person`: add `person.txt` holding `by a person`. A person does it.
  - `p62-worker`: add `worker.txt` holding `by a worker`. The control: claimed
    for a worker slot and reported the way a conductor relays a worker chat's
    report (`avoozl report --slot ... --kind done --commit ...`).

## Run

Each person step is the plain CLI.

| Step | Command                                                   | Observed                                                 |
| ---- | --------------------------------------------------------- | -------------------------------------------------------- |
| 1    | `avoozl next`                                             | `ready`: `p62-person`, `p62-worker`, each with its brief |
| 2    | `avoozl claim p62-person --slot person-p62`               | binding as `cli`; worktree `avoozl/p62-person` made      |
| 3    | edit and `git commit` in the worktree                     | `623e949 Add person.txt`                                 |
| 4    | `avoozl runner report p62-person done`, from the worktree | report `done`, commit `623e9492` read from HEAD          |
| 5    | `avoozl next`                                             | both tasks `running`, phase `recording`                  |

Then six rounds of what Kiro Crew runs each minute: one `workspace.tick` with
`cron: true` (as `kirocrew-app/crons/tick.py` calls it), and one pass of
`drainCheckRuns` (as the app backend runs after each tick). These are the same
functions, called from `/private/tmp/avoozl-p62/tick.mjs` and `drain.mjs`,
because a CLI-only machine has no gateway to run them.

| Round | `p62-person`                                                | `p62-worker`                                |
| ----- | ----------------------------------------------------------- | ------------------------------------------- |
| 1     | verifying; check run 1 on `623e9492` passed                 | verifying; check run 1 on `fb287082` passed |
| 2     | main moved: merged main in (`a1492254`), check run 2 passed | done, integrated                            |
| 3     | done, integrated                                            | done                                        |

No tick opened a chat for either task (`dispatch` was empty every round) and
Needs you stayed empty.

## Result

|               | `p62-person` (person)                          | `p62-worker` (control)     |
| ------------- | ---------------------------------------------- | -------------------------- |
| Status        | implemented                                    | implemented                |
| Delivery      | integrated, `a14922546788`                     | integrated, `fb2870822317` |
| Verifications | accepted on `623e9492`, accepted on `a1492254` | accepted on `fb287082`     |
| Commit source | Integrated                                     | Integrated                 |
| Worktree      | removed after landing                          | removed after landing      |

Scratch `main` after the run:

```
a149225 Merge main into avoozl/p62-person
fb28708 Add worker.txt
623e949 Add person.txt
6473ef1 Initial commit
```

The person's task landed on the same path as the worker's. Its second check
run is the normal path for the task that lands second, not a difference
between the two kinds of work.

## Repair

The first live run, on main `1abb1792`, failed at step 4:
`This workspace is not a runner.` A person who runs `avoozl claim` gets no
report token. With no token, `runner report` went only to runner mode
(R84). PR #399 (merge `dd57a975`) changed that. With no token, outside runner
mode, the command now finishes the newest worker claim for the task. It works
only for a claim the command line made (`conductor: "cli"`), and only from
that task's worktree. The commit is read from HEAD. A chat the tick opened
still needs its token. Tests: `src/app/test/manual-path.test.mjs` and
`src/app/test/report-cli.test.mjs`.

## Noted, not fixed

- Round 1 sent a `Spend unknown` notice for each task. Crew mode cannot read
  a person's or a relayed chat's usage. Both tasks got the same notice.
- A task with a prose-only bar and no checks needs a verifier chat. On a
  machine with no Kiro Crew, nothing opens that chat, so this proof used
  command checks. Headless machines are Phase 51.
- Landing here is local integration onto the scratch checkout's `main`. Pushing
  through the landing queue (Phase 41) is not yet called from the tick, for a
  person or for a worker.
