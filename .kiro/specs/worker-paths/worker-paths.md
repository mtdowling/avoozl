---
repo: avoozl
category: Planning
---

# One way to run a worker

## Requirements

### Introduction

A ready task reaches an agent through one dispatcher, two executors and one
way to finish per executor, and every kind of task works on both executors.
Every session runs on the machine that drives its spec.

#### What this builds on

`.kiro/specs/avoozl/` is the product spec. This spec builds on its
Requirement 93 (one executor seam) and Requirement 96 (one way to finish).

#### Scope

- How a ready task is started, run and reported on this machine.

#### Out of scope

- The roles that are not the worker (`.kiro/specs/without-kirocrew/`).
- The page without Kiro Crew (`.kiro/specs/standalone-web/`).
- How many tasks run at once (avoozl Requirement 6.3).

#### Words

| Word | Meaning |
| --- | --- |
| Dispatcher | The code that decides a ready task starts now and writes its session request |
| Executor | What runs the agent: `kirocrew` (a Kiro Crew chat) or `process` (a child the supervisor pass starts) |
| Manual take | A person taking a ready task with `avoozl take` and finishing it by hand |


#### Requirement WP1: One dispatcher

**User story:** As the owner, I want one piece of code to decide that a task
starts, so that I can say why a task is or is not running by reading one
place.

##### Acceptance criteria

1. The tick SHALL be the only dispatcher. It SHALL run only in
   `avoozl tick`, from whatever timer runs it (the Kiro Crew cron, launchd,
   systemd, cron or a driver chat), with the same code and the same result
   for the same workspace state.
2. `delivery.runner` SHALL accept only `tick` and `crew-mode`. A file that
   holds `"runner": "tick"` SHALL load and the key SHALL be ignored. Any
   other value SHALL be refused, naming the key.
3. A file that holds `"runner": "crew-mode"` SHALL load, the tick SHALL
   start no task in that workspace, and one Needs you item SHALL say the
   setting is not supported and offer **Let the tick run it**. Only a
   person SHALL be able to choose it; choosing it SHALL remove the key.
4. A source test SHALL fail when any module other than the tick's planner
   writes a session request with role `worker` for a ready task, apart from
   the manual take of WP2.

#### Requirement WP2: A person can take a task by hand

**User story:** As a person, I want to take one ready task and finish it
myself, so that I am never blocked on an agent.

##### Acceptance criteria

1. `avoozl take TASK` from the local command line SHALL work with the tick
   as the dispatcher. It SHALL bind the task to a manual take, prepare its
   worktree, and print the worktree path and the report command. The tick
   SHALL NOT start a session for a task that has a manual take.
2. `avoozl take` SHALL refuse a task that is not ready, a task with a
   running session, and a task held by Stop the line, each with the reason.
3. `avoozl runner report TASK done|blocked`, run from the task's worktree
   with no token, SHALL finish a manual take (`matchTakeReport`,
   `src/app/workers/report-match.ts`). Avoozl SHALL read the commit from
   the worktree and SHALL run the checks itself.
4. `avoozl take TASK --release` SHALL give the task back, and SHALL refuse
   when the worktree has uncommitted changes unless `--discard` is given.
5. `avoozl next` SHALL stay as a read of the ready, running, waiting, Needs
   you and done lists.
7. A take over MCP, or from an agent session, SHALL be refused. A manual
   take is a person's.

#### Requirement WP3: Every kind of task runs on both executors

**User story:** As the owner, I want to pick an executor without learning
which kinds of task it cannot run, so that `process` is a full choice.

##### Acceptance criteria

1. For every pair of executor (`kirocrew`, `process`) and task kind (single
   task, landing or feedback round), Avoozl SHALL either give the session a
   brief it can follow to the end or decline that pair in code with a
   stated reason. No pair SHALL give a brief that names a tool or a command
   the session cannot use.
5. One table in code SHALL hold, for each pair of WP3.1, the brief it gets
   or the reason it is declined. A test SHALL fail when a pair is missing
   from the table, and SHALL run each brief through a fake executor of its
   kind to a recorded result.

#### Requirement WP4: One way to finish per executor

**User story:** As the owner, I want a worker's report to arrive the same
way whatever the task, so that setting up Kiro Crew for a worker needs no
extra step.

##### Acceptance criteria

1. A worker on `kirocrew` SHALL finish, and report a block or a question,
   only with `avoozl runner report` and the token in its brief. A worker on
   `process` SHALL do so only with the result file. No worker brief SHALL
   name `plans_report` or any other MCP tool as the way to finish.
3. The report command in a brief SHALL run on that machine without `node`
   or `avoozl` on the session's `PATH`. The brief SHALL give the command
   the running Avoozl resolves for itself. A test SHALL run the command
   from a brief in a shell with an empty `PATH`.
4. A worker's brief SHALL NOT tell it to push, open or edit a pull request,
   or turn on auto-merge (Requirement 86.3).
5. `plans_report` SHALL stay for the roles that are not the worker, and for
   an MCP client Avoozl did not start.

#### Requirement WP5: No remote route

**User story:** As the owner, I want every task to run on the machine that
drives its spec, so that there is one set of rules about what runs where.

##### Acceptance criteria

1. Every task SHALL run on the driver's own machine, on its own executors.
2. Avoozl SHALL hand no task to another machine.

#### Requirement WP6: Every session runs on this machine

**User story:** As the owner, I want every session Avoozl starts to run on
the machine that started it, so that "where is this running" has one
answer.

##### Acceptance criteria

1. Avoozl SHALL start a session only on its own machine. No setting, pin,
   command or operation SHALL start, send to or stop a session on another
   Kiro Crew instance. A read-only link that opens an existing chat on
   another Crew may name that Crew (direct-links D2).
2. Avoozl SHALL NOT wait on a session binding whose Kiro Crew stopped
   answering (the crew snapshot, design D9).
3. The roles table's agent, model and harness (Requirement 53) and this
   machine's lane limit SHALL apply to every worker session.

#### Requirement WP8: One meaning for each word

**User story:** As a reader of the page, the help and the docs, I want
"crew" and "runner" to mean one thing each, so that I do not have to learn
which one a sentence means.

##### Acceptance criteria

1. On the page, in the CLI help and in `README.md` and `docs/*.md`, "Crew
   Mode" SHALL NOT appear.
2. "Runner" SHALL NOT name a mode or a machine. `avoozl runner report`
   keeps its name.
3. A test over the page's strings, the help table and those documents SHALL
   fail on "Crew Mode", "runner mode", "remote crew" and "conductor".
   Records under `docs/research/` and `docs/evidence/` are not checked.

## Design

`WP` numbers are in [Requirements](#requirements); `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`.

### D1. The shape

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

### D3. The pair table (WP3)

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

### D5. The report command (WP4.3)

The brief's report line is `<node> <cli> runner report …`, with the Node
binary from `process.execPath` and the running CLI's path, both quoted for a
shell. The installed app's copy of the CLI is under `hosts/kirocrew/bin/lib`
and resolves the same way, so a chat needs no `avoozl` on its `PATH`.
`src/app/workers/test/report-command.test.ts` runs the command from a built
brief in a shell with an empty `PATH`.

### D6. Manual take (WP2)

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

### D7. The held workspace (WP1.3)

A workspace whose file says `runner: "crew-mode"` would otherwise start
chats nobody asked for. While it says so, delivery reads as held
(`crewModeHeld`) and Needs you has one item. **Let the tick run it** is a
person-only operation that removes the key through the settings writer with
the file's hash, as other settings saves do. `nextView`
(`src/app/workers/runner.ts`) serves `avoozl next`.

### D9. Sessions run on this machine (WP6)

The crew snapshot (`src/app/tick/crews.ts`) holds `local` and the Kiro Crew
instances the app backend last read, so a binding on a crew that stopped
answering is not waited on. The `agent`, `model` and `harness` of the roles
table resolve through `roleRun` (`src/app/agents/role-table.ts`).

## Tasks

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`WP1` to `WP8`, in [Requirements](#requirements)); `D` sections
refer to [Design](#design), `R` numbers to
`.kiro/specs/avoozl/avoozl.md#requirements`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, real git with a bare remote, and fake
executors; Avoozl runs the repository's checks; no real workspace data,
machine configuration, credentials or personal plans in the repository
(AGENTS.md).

Task IDs start with `wp-` so they never collide with the IDs of the other
specs.

### Phase 1: Every kind of task on both executors

- [x] `wp-1.1` The pair table, and briefs chosen by executor [WP3.1, WP3.5] (§D3)
  - A test fails when a pair of executor and kind is missing from the table; every cell's brief runs through a fake executor of its kind to a recorded result; no `process` brief holds "commit", "push" or "runner report".
  - `src/app/workers/worker-briefs.ts` holds one frozen table from executor and task kind to a brief builder or a stated reason; delivery asks it through `briefCell`.
- [x] `wp-1.4` A report command that needs no `PATH`, and no MCP tool in a worker's brief, after wp-1.1 [WP4.1, WP4.3, WP4.5] (§D5)
  - A test runs the report command taken from a built brief in a shell with an empty `PATH`, against the source checkout and against the built app package, and both record the report; a search of every `kirocrew` worker brief in the pair table finds no `plans_`; `plans_report` from an MCP client Avoozl did not start still works.
  - One helper gives the brief the Node binary and the running CLI's path, quoted for a shell.

- [x] `wp-p1` Proof: every pair of executor and task kind reaches a result, after wp-1.1, wp-1.4 [WP3, WP4] (§D3, §D5) (**MANUAL**)
  - Expected: (1) every task lands on both executors; (2) no brief names an MCP tool or a bare `avoozl`, and no `process` brief asks for a commit; MCP sharing for `avoozl:avoozl` is off for the whole `kirocrew` run.
  - Expected result observed; receipt under `docs/evidence/`.
  - Setup: an isolated workspace and a scratch repository with a bare remote; one single task and one task whose first landing fails, each run once with every role on `kirocrew` and once on `process` with an approved Claude Code definition. The owner runs the `process` half from his own terminal.
  - Action: (1) run the tick until every task lands or waits; (2) read each session's brief from its record.
  - Failure means: `process` is not a full choice, or a worker needs MCP sharing.
  - Next decision: none.

### Phase 2: The manual path

- [x] `wp-2.1` A person takes a task with the tick on [WP2.1, WP2.2, WP2.3, WP2.4, WP2.5, WP2.7] (§D6)
  - Tests with the tick on: a taken task stays unstarted across three ticks; `runner report` from its worktree with no token finishes it and Avoozl runs the checks; a take is refused for a task that is not ready, has a running session or is held by Stop the line, each with its reason; a take over MCP and from an agent session is refused; release refuses a dirty worktree without `--discard`.
  - `manualTake` in `src/app/workers/manual-take.ts`; a test that the ready query keeps the tick off a taken task; `avoozl take TASK --release` and `--discard`.
- [x] `wp-2.2` One dispatcher, and the workspaces that set `crew-mode` held, after wp-2.1, wp-p1 [WP1.1, WP1.2, WP1.3, WP1.4] (§D7)
  - Tests: a `crew-mode` workspace starts nothing across three ticks and shows one Needs you item; the operation is refused from MCP and from an agent session, and from a person it removes the key and the next tick starts work; a stale hash is refused; `"runner": "tick"` loads and is ignored and any other value is refused; the source test of WP1.4 passes and fails on a planted second dispatcher; the schema parity test passes.
  - `delivery.runner` in the validators and the schema takes only `tick` and `crew-mode`; a file with `crew-mode` reads as held with one Needs you item and the person-only **Let the tick run it**; `src/app/workers/runner.ts` serves `nextView`.

- [x] `wp-p2` Proof: a person finishes a task by hand while the tick runs the rest, after wp-2.2 [WP1, WP2] (§D6, §D7)
  - Expected: (1) the take prints the worktree and the report command; (2) the tick starts the other task only; (3) Avoozl runs the checks on the commit and lands it; (4) the released task is ready again and the next tick starts it.
  - Expected result observed; receipt under `docs/evidence/`.
  - Setup: an isolated workspace with a scratch clone, without `delivery.runner`, with two ready tasks and a fake `kirocrew` executor.
  - Action: (1) take one task from the command line; (2) run three ticks; (3) commit in the taken worktree and run `avoozl runner report TASK done`; (4) take a third task and release it.
  - Failure means: the manual path needs a setting, or a take and the tick can both start one task.
  - Next decision: none.

### Phase 3: Names

- [x] `wp-5.2` One meaning for each word [WP8] (§D1)
  - The word test passes and fails on a planted "Crew Mode"; `node scripts/check/spec-lint.ts` reports 0 errors.
  - The word test over the page's strings, the help table, `README.md` and `docs/*.md`.

- [x] `wp-p4` Proof: one dispatcher, two executors, no remote route, after wp-p1, wp-p2, wp-5.2 [WP1 to WP8] (§D1)
  - Expected: (1) both pass; (2) the list is the tick's planner and the manual take; (3) nothing is found.
  - Expected result observed; receipt under `docs/evidence/`.
  - Setup: the repository at the commit that lands wp-5.2.
  - Action: (1) run the source test of WP1.4 and the pair table's test; (2) list every operation that writes a session request with role `worker`; (3) search every worker brief the pair table builds for "push", "pull request" and "auto-merge".
  - Failure means: a second route to an agent is in the code.
  - Next decision: none.
