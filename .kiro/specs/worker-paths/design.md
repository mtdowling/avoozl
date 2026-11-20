# Design: one way to run a worker

`WP` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`.

## D1. The shape

| Part       | What it is                                                               |
| ---------- | ------------------------------------------------------------------------ |
| Dispatcher | The tick. A person may claim one task (WP2)                              |
| Executor   | `kirocrew`, `process`                                                    |
| Remote     | None                                                                     |
| Finish     | CLI with token (chat); result file (child); CLI without token (a person) |

A task runs one of two ways, on this machine:

1. The tick starts a Kiro Crew chat. The chat edits and commits in its
   worktree and runs `avoozl runner report` with its token.
2. The tick starts a `process` child. The child edits and writes
   `.avoozl/result.json`. Avoozl commits.

Verification, landing and acceptance stay with Avoozl (R86.2).

## D3. The pair table (WP3)

One frozen table in `src/app/workers/worker-briefs.mjs` maps executor and task kind
to the function that builds the brief, or to a reason. Delivery asks the
table; it picks no steps with its own conditionals.

| Kind                     | `kirocrew`                                   | `process`                                        |
| ------------------------ | -------------------------------------------- | ------------------------------------------------ |
| Single task              | `localSteps` with the CLI report             | `processSteps`                                   |
| Investigate first        | Findings by `runner report … findings`       | Findings in the result file; Go ahead resumes    |
| Member of a batch        | `batchBrief` with the CLI report             | Declined: runs as single tasks (WP3.3)           |
| Landing or feedback round | A message to the same chat                  | `resume` with the message (V: `roundFinish`)     |

The table's test builds every cell's brief and searches it for `plans_`,
for a bare `avoozl ` and, in the `process` column, for "commit", "push" and
"runner report". A cell marked declined must name its reason and the kind it
falls back to.

## D4. Findings without MCP (WP3.2, WP4.2)

`investigateLines` (V: `src/app/delivery/investigate.mjs:158`) takes the executor.

- `kirocrew`: "write your findings to a file as this JSON, then run
  `<command> runner report TASK findings --file PATH --token T`".
- `process`: "write `.avoozl/result.json` as `{"state": "findings",
  "report": {…}}` and exit". The supervisor's reader of the result file
  accepts the new state, and `finishProcessSession` (V:
  `src/app/executors/process.mjs:277`) passes
  the report to the same operation the MCP tool calls, so the falsifier and
  the gate of R75.3 see no difference.

Go ahead, Investigate again and Stop already reach a chat as a message. For
a child they use the definition's `resume` command, as a landing round does
(V: proof P57, item 2). A harness definition with no `resume` cannot be
resumed: the pair table declines investigate first for it and the task is
coded without that step, with the reason on the task. That choice is the
owner's (D10, decision 4).

`avoozl runner report` checks the findings file with the validator the MCP
tool uses, so there is one definition of a valid finding.

The falsifier chat reports the same way (WP3.6): its brief gives
`<command> runner report TASK done --role falsifier --file PATH --token T`,
with a token issued for the falsifier role and the attempt. The verdict file goes
through the validator `plans_report` uses (V: `src/app/workers/report-match.mjs`,
`src/app/delivery/investigate.mjs` `falsifierBrief`).
shortcut: the verifier and review roles still report by `plans_report`;
give them role tokens when one of them runs as a chat without sharing.

## D5. The report command (WP4.3)

`src/app/delivery/delivery.mjs:488` already holds the absolute path of the running
CLI (V). The brief's report line becomes `<node> <cli> runner report …`,
with the Node binary from `process.execPath`, both quoted for a shell. The
installed app's copy of the CLI is under `kirocrew-app/bin/lib` and resolves
the same way, so a chat needs no `avoozl` on its `PATH`.

## D6. Manual take (WP2)

`manualTake` in `src/app/workers/manual-take.mjs` is called only from the
local command line, so the binding's `conductor` is always `cli`, which
`matchTakeReport` requires (`src/app/workers/report-match.mjs`).

The tick leaves a claimed task alone: the ready query is given every task
that has a session binding and leaves those out (`busyTaskIds` in
`readyCandidates`, `src/app/delivery/delivery.mjs`). A test claims a task and
runs three ticks.

Release (`--release`) closes the binding and leaves the worktree. It does
not delete a worktree with changes; `--discard` is the person saying so.

## D7. The held workspace (WP1.3)

A workspace whose file says `runner: "crew-mode"` would otherwise start
chats nobody asked for. While it says so, delivery reads as held and Needs
you has one item. **Let the tick run it** is a person-only operation that
removes the key through the settings writer with the file's hash, as other
settings saves do. `nextView` serves `avoozl next`.

## D8. No remote route (WP5)

There is no SSH transport and no `remote.*` operation. The runner role
`worker` keeps its name.

## D9. Sessions run on this machine (WP6)

The `agent`, `model` and `harness` pins are in `src/app/sessions/session-pins.mjs`,
and the provider checks in `provider-health.mjs`. The crew snapshot
(`crews.mjs`) serves the In flight view. The no-fit decision covers a pin
that names a harness or a model this machine does not have.
