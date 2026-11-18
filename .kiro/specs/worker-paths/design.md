# Design: one way to run a worker

Status: Draft

`WP` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`. Labels are as in the
requirements: **V** read in the file cited at `deca253`, **A** assumed.

## D1. What is left when this is done

| Part       | Today                                                               | After                                    |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------- |
| Dispatcher | Tick; Crew Mode conductor; a person (under Crew Mode); SSH driver   | Tick. A person may claim one task (WP2)  |
| Executor   | `kirocrew`, `process`, a remote Kiro Crew                           | `kirocrew`, `process`                    |
| Remote     | Runner over SSH; worker pull by hand; remote Kiro Crew              | Worker pull, on the tick                 |
| Finish     | MCP tool; CLI with token; CLI without; conductor relay; result file | CLI with token (chat); result file (child); CLI without token (a person) |

A task then runs one of two ways, on this machine or on a worker machine:

1. The tick starts a Kiro Crew chat. The chat edits and commits in its
   worktree and runs `avoozl runner report` with its token.
2. The tick starts a `process` child. The child edits and writes
   `.avoozl/result.json`. Avoozl commits.

Verification, landing and acceptance are unchanged and stay with Avoozl
(R86.2).

## D2. Order of work

Parity first, removal second. Phase 1 makes `process` and the command-line
report cover every kind of task, and removes nothing. Each later phase
removes one route and is safe to stop after. No phase leaves a task kind
that worked before the phase without a route after it.

| Phase | Adds                                                | Removes                                  |
| ----- | --------------------------------------------------- | ---------------------------------------- |
| 1     | The pair table; findings on both executors; briefs by executor | Nothing                       |
| 2     | Manual claim under the tick                         | Crew Mode dispatch and relay             |
| 3     | Worker pull on the tick; results on the driver      | Runner mode over SSH                     |
| 4     | One local placement module                          | Remote crews, hand-back, routing         |
| 5     | The word test; spec edits                           | Dead commands; old words in docs         |

## D3. The pair table (WP3)

One frozen table in `src/app/worker-briefs.mjs` maps executor and task kind
to the function that builds the brief, or to a reason. Delivery asks the
table; it no longer picks steps with its own conditionals (V: today the
choice is spread over the brief builder at `src/app/delivery.mjs:2282`,
`batchBrief` in `src/app/flow-batch.mjs:192` and `workerBrief`
in `src/app/remote-runner.mjs:388`).

| Kind                     | `kirocrew`                                   | `process`                                        |
| ------------------------ | -------------------------------------------- | ------------------------------------------------ |
| Single task              | `localSteps` with the CLI report             | `processSteps`                                   |
| Investigate first        | Findings by `runner report … findings`       | Findings in the result file; Go ahead resumes    |
| Member of a batch        | `batchBrief` with the CLI report             | Declined: runs as single tasks (WP3.3)           |
| Landing or feedback round | A message to the same chat                  | `resume` with the message (V: `roundFinish`)     |
| On a worker machine      | Commit and `runner report`                   | `processSteps`; the machine's tick reads the file |

The table's test builds every cell's brief and searches it for `plans_`,
for a bare `avoozl ` and, in the `process` column, for "commit", "push" and
"runner report". A cell marked declined must name its reason and the kind it
falls back to.

## D4. Findings without MCP (WP3.2, WP4.2)

`investigateLines` (V: `src/app/investigate.mjs:158`) takes the executor.

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

## D5. The report command (WP4.3)

`src/app/delivery.mjs:488` already holds the absolute path of the running
CLI (V). The brief's report line becomes `<node> <cli> runner report …`,
with the Node binary from `process.execPath`, both quoted for a shell. The
installed app's copy of the CLI is under `kirocrew-app/bin/lib` and resolves
the same way. The worker-machine brief already takes a `command`, which the tick
builds from the running CLI's path (V: `src/app/remote-runner.mjs:388` and
`src/app/operations.mjs:3369`); both use one helper.

Whether a Kiro Crew chat has `avoozl` on its `PATH` today was not tested
(A). The change makes the answer not matter.

## D6. Manual claim (WP2)

`claimTask` (V: `src/app/runner.mjs:282`) moves to
`src/app/manual-claim.mjs` and loses its Crew Mode test (`:293`) and its
conductor branch: the only caller left is the local command line, so the
binding's `conductor` is always `cli`, which `matchClaimReport` already
requires (V: `src/app/report-match.mjs:81`).

The tick must then leave a claimed task alone. It already does: the
ready query is given every task that has a session binding and leaves those
out (V: `claimed: claimedTaskIds(store, bindings)` in `readyCandidates`,
`src/app/delivery.mjs:2132`). No test shows it for a manual claim with the
tick on, because the tick starts nothing under Crew Mode today (V:
`src/app/tick.mjs:1325`). A test claims a task and runs three ticks.

Release (`--release`) closes the binding and leaves the worktree. It does
not delete a worktree with changes; `--discard` is the person saying so.

## D7. Crew Mode's removal and the held workspace (WP1.3)

A workspace that ran under a conductor has tasks a person expected a
conductor to start. Reading its file as tick dispatch would start chats
nobody asked for. So the key is read once more, for one purpose: while it
says `crew-mode`, delivery reads as held and Needs you has one item.
**Let the tick run it** is a person-only operation that removes the key
through the settings writer with the file's hash, as other settings saves
do.

Removed with it: `src/app/runner.mjs` (425 lines) apart from `nextView`,
`src/app/runner/avoozl-runner.md`, `kirocrew-app/hooks/avoozl-runner.json`, the
relay branches of `localSteps` and the GitHub-route steps, and
`conductorFeedback` (`src/app/github-feedback.mjs:280`). `nextView` stays
behind `avoozl next`.

Seven test files name `crew-mode` (V: `kirocrew-runner`, `manual-path`,
`plans-repo-delivery`, `pr-landing`, `proof-p27`, `proof-p34`,
`proof-stacked-prs`). `kirocrew-runner.test.mjs` goes. The others use Crew
Mode as a way to drive a task by hand in a test; they move to the manual
claim or to the tick with a fake executor, and keep what they assert about
delivery, landing and stacking.

## D8. Worker pull on the tick (WP5)

The worker side reuses the plan-less runner role, which stays (V:
`src/app/remote-runner.mjs` is imported by `executors/process.mjs`,
`session-bindings.mjs` and `session-request-eligibility.mjs`). On a machine
whose `runner.role` is `worker`, the tick runs, in order: pull offers,
request claims for free lanes, start acknowledged tasks, report finished
ones. These are the bodies of `avoozl worker pull` and `avoozl worker claim`
today; the commands call the same functions.

On the driver, the tick calls `worker-results.mjs` for each task whose claim
is acknowledged: fetch the pushed ref, check the diff against declared and
protected paths, run the checks on that head, and hand it to the landing
queue (R90.2). A fetched result that fails is a failed attempt on the
driver, not on the worker machine.

Removed: the driver half of `remote-runner.mjs` (V: `commandFor`,
`transportFor`, `handoff`, `pullStatus`, `remoteView` and `driverTick`,
about 210 lines from `:619`), the `remote.accept`, `remote.handoff` and
`remote.pull` operations, and
`src/app/test/remote-runner.test.mjs` apart from the cases that cover the
worker role, which move to `worker-mode.test.mjs`.

## D9. Placement on one machine (WP6)

What stays of `routing.mjs`, `placement.mjs` and `crews.mjs` moves to
`src/app/lanes.mjs`: `validateSession` for the `agent`, `model` and
`harness` pins, the local reading and lane limit, and the provider checks'
entry point (`provider-health.mjs` is unchanged). The tick imports
`validateTrackedRouting`, `crewSnapshot`, `closeNoFit`, `fetchAll`,
`openNoFit`, `routingContext` and `routingFacts` today (V:
`src/app/tick.mjs:29` to `:37`); after, it imports the lane limit and the
pin check.

Removed: the remote crew registry and snapshot (`crews.mjs` apart from
`LOCAL` and the local reading), `crew-reader.mjs`, `handback.mjs`,
`remoteSteps` and `remoteTarget` in `delivery.mjs`, `kirocrewRemoteSession`,
the `crew` argument in `kirocrew-app/executors/kirocrew.py` (V: `:256` to
`:259`), `routing-health.mjs`'s routing marks, and the `routing.*` and
`crews.update` operations.

The no-fit decision stays for the one case left: a pin names a harness or a
model this machine does not have.

## D10. Decisions for the owner

Each has a default that the requirements already assume. Approving the spec
approves the defaults.

| #   | Decision                                             | Default                                                                 | The other choice                                                              |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | A machine with no GitHub access (R90.7)              | Not a worker machine. Runner mode over SSH goes                         | Keep the SSH transport and its three commands, which is one more route        |
| 2   | The manual path (R96.5)                              | Keep `claim`, `next` and the report, without Crew Mode                  | Drop the manual path too; a person edits in any checkout and Avoozl never sees it |
| 3   | A workspace with `runner: "crew-mode"`               | Held until a person chooses Let the tick run it                         | Switch to the tick at once, which may start chats the same minute             |
| 4   | Investigate first on a harness with no `resume`      | Skip that step for the task and say why                                 | Refuse to start the task until the definition has `resume`                    |
| 5   | A batch on `process`                                 | Run its tasks singly                                                    | Have the child mark each task's files and Avoozl make the commits, a new protocol |

## D11. What does not change

- The executor interface of R93.1 and the two executors.
- Avoozl running the checks on the exact commit, and landing (R86, R87).
- `plans_report` for the roles that are not the worker.
- Issue Radar intake and its views. A search of every `radar-*`, intake,
  public-crews, review-draft and mirror module finds no import of `runner`,
  `remote-runner`, `routing`, `placement`, `crews` or `handback` (A: from
  one search, not rerun for this spec).
- The `plans_*` tool names and the environment aliases (AGENTS.md).

## D12. Risks

| Risk                                                                   | Guard                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A test that used Crew Mode loses what it covered                       | D7: each moved file keeps its assertions; the task lists them before deleting anything |
| A chat cannot run the report command                                   | D5 and the empty-`PATH` test; the token still matches the report to the attempt        |
| A resumed child is not the same session                                | The proof checks the session ID across Go ahead, as P57 did for a landing round        |
| A worker machine's tick claims more than its lanes                     | R90.3's one task per free lane, tested with a fake driver                              |
| Old files stop loading                                                 | WP1.2, WP6.6 and WP7.1: every removed key loads or is refused with its replacement     |
| The avoozl spec's task 45.4 has not landed when the last proof runs    | WP4.4 is checked by that proof; it fails with the reason until 45.4 lands              |
