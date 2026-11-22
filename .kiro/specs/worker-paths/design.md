# Design: one way to run a worker

`WP` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`.

## D1. The shape

| Part | What it is |
| --- | --- |
| Dispatcher | The tick. A person may take one task (WP2) |
| Executor | `kirocrew`, `process` |
| Remote | None |
| Finish | CLI with token (chat); result file (child); CLI without token (a person) |

A task runs one of two ways, on this machine:

1. The tick starts a Kiro Crew chat. The chat edits and commits in its
   worktree and runs `avoozl runner report` with its token.
2. The tick starts a `process` child. The child edits and writes
   `.avoozl/result.json`. Avoozl commits.

Verification, landing and acceptance stay with Avoozl (R86.2).

## D3. The pair table (WP3)

One frozen table, `WORKER_BRIEFS` in `src/app/workers/worker-briefs.ts`,
maps executor and task kind to the function that builds the brief, or to a
reason and the kind that runs instead. Delivery asks the table through
`briefCell`; it picks no steps with its own conditionals.

| Kind | `kirocrew` | `process` |
| --- | --- | --- |
| Single task | `localSteps` with the CLI report | `processSteps` |
| Landing or feedback round | A message to the same chat: commit and report done again | `resume` with the message: write the result file, Avoozl commits |

The table's test builds every cell's brief, runs it through a fake executor
of its kind, and searches the `process` column for "commit", "push" and
"runner report". A cell marked declined must name its reason and the kind it
falls back to.

## D5. The report command (WP4.3)

The brief's report line is `<node> <cli> runner report …`, with the Node
binary from `process.execPath` and the running CLI's path, both quoted for a
shell. The installed app's copy of the CLI is under `hosts/kirocrew/bin/lib`
and resolves the same way, so a chat needs no `avoozl` on its `PATH`.
`src/app/workers/test/report-command.test.ts` runs the command from a built
brief in a shell with an empty `PATH`.

## D6. Manual take (WP2)

`manualTake` in `src/app/workers/manual-take.ts` is called only from the
`runner.take` operation, which refuses any caller but the person at this
machine's command line. The binding's `conductor` is therefore always
`cli`, which `matchTakeReport` requires (`src/app/workers/report-match.ts`).

The tick leaves a taken task alone: the ready query leaves out every task
that has a live worker session (`busyTaskIds`,
`src/app/delivery/delivery.ts`), and a take is one. A test takes a task and
runs three ticks.

Release (`--release`) closes the binding and leaves the worktree. It does
not delete a worktree with changes; `--discard` is the person saying so.

## D7. The held workspace (WP1.3)

A workspace whose file says `runner: "crew-mode"` would otherwise start
chats nobody asked for. While it says so, delivery reads as held
(`crewModeHeld`) and Needs you has one item. **Let the tick run it** is a
person-only operation that removes the key through the settings writer with
the file's hash, as other settings saves do. `nextView`
(`src/app/workers/runner.ts`) serves `avoozl next`.

## D9. Sessions run on this machine (WP6)

The crew snapshot (`src/app/tick/crews.ts`) holds `local` and the Kiro Crew
instances the app backend last read, so a binding on a crew that stopped
answering is not waited on. The `agent`, `model` and `harness` of the roles
table resolve through `roleRun` (`src/app/agents/role-table.ts`).
