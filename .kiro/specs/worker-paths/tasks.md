---
repo: avoozl
---
# Tasks: one way to run a worker

Explicit `after` lists and each task's `after` fact govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`WP1` to `WP8`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, real git with a bare remote, and fake
executors; Avoozl runs the repository's checks; no real workspace data,
machine configuration, credentials or personal plans in the repository
(AGENTS.md). A task that deletes a test file first lists, in its pull
request, each behavior that file covered and the test that covers it
afterward (D7). Screen changes need phone and desktop, light and dark
screenshots for owner approval before merge (R92.12). Screenshots are shown
to the owner and never committed (AGENTS.md).

Task IDs start with `wp-` so they never collide with the IDs of the other
specs.

## Phase 1: Every kind of task on both executors

- [x] wp-1.1 The pair table, and briefs chosen by executor [WP3.1, WP3.4, WP3.5] (§D3)
  - $done: A test fails when a pair of executor and kind is missing from the table; every cell's brief runs through a fake executor of its kind to a recorded result; no `process` brief holds "commit", "push" or "runner report"; the existing delivery, batch and worker-mode tests pass with their assertions unchanged.
  - `src/app/workers/worker-briefs.mjs` holds one frozen table from executor and task kind to a brief builder or a stated reason; delivery, `flow-batch.mjs` and `remote-runner.mjs` ask it; a `process` child on a worker machine gets `processSteps`.
- [x] wp-1.2 Findings by the command line and by the result file, after wp-1.1 [WP3.2, WP4.2] (§D4)
  - $done: Tests with fake executors: a chat's findings by the command line and a child's findings by the result file open the same falsifier request and the same gate; Go ahead resumes the same child session and its done result lands; a findings file over the size limit is refused; a done result before Go ahead is still refused; a definition with no `resume` codes the task without the step and shows why.
  - $after: wp-1.1
  - `avoozl runner report TASK findings --file PATH --token T` checked by the validator the MCP tool uses; `investigateLines` takes the executor; the result file's `findings` state; Go ahead, Investigate again and Stop reach a child through `resume`; investigate first is declined, with the reason on the task, for a definition with no `resume`.
- [x] wp-1.3 A batch on `process` runs as single tasks, after wp-1.1 [WP3.3] (§D3)
  - $done: Tests: a three-task group on `process` starts three sessions and lands three commits, and the page and `avoozl show` give the reason; the same group on `kirocrew` still runs in one chat with one commit per task.
  - $after: wp-1.1
  - The batch rules gain "the worker's executor makes commits"; a group that fails it runs as single tasks with the stated reason, where a group that breaks a rule is shown today.
- [x] wp-1.4 A report command that needs no `PATH`, and no MCP tool in a worker's brief, after wp-1.1, wp-1.2 [WP4.1, WP4.3, WP4.5] (§D5)
  - $done: A test runs the report command taken from a built brief in a shell with an empty `PATH`, against the source checkout and against the built app package, and both record the report; a search of every `kirocrew` worker brief in the pair table finds no `plans_`; `plans_report` from a verifier and from an MCP client Avoozl did not start still works.
  - $after: wp-1.1, wp-1.2
  - One helper gives the brief the Node binary and the running CLI's path, quoted for a shell; the batch brief and the investigate lines use the command-line report; the README says a worker needs no MCP sharing.

- [x] wp-p1 Proof: every pair of executor and task kind reaches a result, after wp-1.1, wp-1.2, wp-1.3, wp-1.4 [WP3, WP4] (§D3, §D4, §D5)
  - $done: Expected: (1) every task lands on both executors, the batch as one chat on `kirocrew` and as three children on `process`; (2) each investigated task codes only after Go ahead, in the same session it investigated in; (3) no brief names an MCP tool or a bare `avoozl`, and no `process` brief asks for a commit; MCP sharing for `avoozl:avoozl` is off for the whole `kirocrew` run.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $manual: true
  - $after: wp-1.1, wp-1.2, wp-1.3, wp-1.4
  - Setup: an isolated workspace and a scratch repository with a bare remote; one single task, one task with investigate first, one three-task batch and one task whose first landing fails, each run once with every role on `kirocrew` and once on `process` with an approved Claude Code definition. The owner runs the `process` half from his own terminal, as in P57.
  - Action: (1) run the tick until every task lands or waits; (2) press Go ahead on each investigated task; (3) read each session's brief from its record.
  - Expected: (1) every task lands on both executors, the batch as one chat on `kirocrew` and as three children on `process`; (2) each investigated task codes only after Go ahead, in the same session it investigated in; (3) no brief names an MCP tool or a bare `avoozl`, and no `process` brief asks for a commit; MCP sharing for `avoozl:avoozl` is off for the whole `kirocrew` run.
  - Failure means: `process` is still not a full choice, or a worker still needs MCP sharing.
  - Next decision: whether investigate first stays on by default for `process`.

## Phase 2: The manual path without Crew Mode

- [x] wp-2.1 A person claims a task with the tick on [WP2.1, WP2.2, WP2.3, WP2.4, WP2.5, WP2.7] (§D6)
  - $done: Tests with the tick on: a claimed task stays unstarted across three ticks; `runner report` from its worktree with no token finishes it and Avoozl runs the checks; a claim is refused for a task that is not ready, has a running session or is held by Stop the line, each with its reason; a claim over MCP and from a child of the supervisor is refused; release refuses a dirty worktree without `--discard`.
  - `src/app/workers/manual-take.mjs` from `claimTask` (now `manualTake`), with no Crew Mode test and no conductor branch; a test that the ready query's existing rule keeps the tick off a claimed task; `avoozl take TASK --release` and `--discard`.
- [x] wp-2.2 Remove Crew Mode dispatch, and hold the workspaces that used it, after wp-2.1, wp-p1 [WP1.1, WP1.2, WP1.3, WP1.4, WP2.6] (§D7)
  - $done: Tests: a `crew-mode` workspace starts nothing across three ticks and shows one Needs you item; the operation is refused from MCP and from an agent session, and from a person it removes the key and the next tick starts work; `"runner": "tick"` loads and is ignored; the source test of WP1.4 passes and fails on a planted second dispatcher; the pull request lists what each moved or deleted test covered and where it is covered now; the schema parity test passes.
  - $after: wp-2.1, wp-p1
  - `delivery.runner` leaves the validators and the schema; a file with `crew-mode` reads as held with one Needs you item and the person-only **Let the tick run it**; `runner.mjs` keeps `nextView`; the hook file, the runner prompt, the relay branches and the `--slot` forms go; the app entry point lists the commands it still runs; the seven test files that name `crew-mode` move to the manual take or the tick.

- [x] wp-p2 Proof: a person finishes a task by hand while the tick runs the rest, after wp-2.2 [WP1, WP2] (§D6, §D7)
  - $done: Expected: (1) the claim prints the worktree and the report command; (2) the tick starts the other task only; (3) Avoozl runs the checks on the commit and lands it; (4) the released task is ready again and the next tick starts it.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $after: wp-2.2
  - Setup: as P62, in an isolated workspace with a scratch clone, without `delivery.runner`, with two ready tasks and a fake `kirocrew` executor.
  - Action: (1) claim one task from the command line; (2) run three ticks; (3) commit in the claimed worktree and run `avoozl runner report TASK done`; (4) claim a third task and release it.
  - Expected: (1) the claim prints the worktree and the report command; (2) the tick starts the other task only; (3) Avoozl runs the checks on the commit and lands it; (4) the released task is ready again and the next tick starts it.
  - Failure means: the manual path still needs a setting, or a claim and the tick can both start one task.
  - Next decision: none.

## Phase 3: No remote route

- [x] wp-3.3 Remove runner mode over SSH [WP5.1, WP5.2] (§D8)
  - $done: Tests: a file with `runner.role: "runner"` or `"driver"` is refused naming the key; a search of `src/` finds no `ssh` argv outside the plugin and mirror code; the pull request lists what the deleted tests covered and where it is covered now.
  - The roles `runner` and `driver`, the SSH transport and `driverTick` go; `remote.accept`, `remote.handoff` and `remote.pull` are deleted and refused as unknown; the worker cases of `remote-runner.test.mjs` move to `worker-mode.test.mjs`.

## Phase 4: Sessions run on this machine

- [x] wp-4.1 Remove remote crews and the hand-back, after wp-p1 [WP6.1, WP6.2, WP6.6] (§D9)
  - $done: Remove remote crews and the hand-back
  - $done: The remote steps, `handback.mjs`, `kirocrewRemoteSession` and the `crew` argument of the executor are gone. The crew snapshot stays.
  - $after: wp-p1
  - The remote steps, `handback.mjs`, `kirocrewRemoteSession` and the `crew` argument of the executor are gone. The crew snapshot stays.
- [x] wp-4.2 Delivery shows what holds a task, after wp-4.1 [WP6.3] (§D9)
  - $done: Delivery shows what holds a task
  - $done: Delivery shows the lane limit and each provider check that holds a task.
  - $after: wp-4.1
  - Delivery shows the lane limit and each provider check that holds a task.

## Phase 5: Names

- [x] wp-5.2 One meaning for each word [WP8] (§D1)
  - $done: The word test passes and fails on a planted "Crew Mode"; `node scripts/check/spec-lint.mjs` reports 0 errors.
  - The word test over the page's strings, the help table, `README.md` and `docs/*.md`.

- [x] wp-p4 Proof: one dispatcher, two executors, no remote route, after wp-p1, wp-p2, wp-4.2, wp-5.2 [WP1 to WP8] (§D1)
  - $done: Expected: (1) both pass; (2) the list is the tick's planner and the manual take; (3) nothing is found; (4) the receipt records the two counts and the modules that went.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $after: wp-p1, wp-p2, wp-4.2, wp-5.2
  - Setup: the repository at the commit that lands wp-5.2.
  - Action: (1) run the source test of WP1.4 and the pair table's test; (2) list every operation that writes a session request with role `worker`; (3) search every worker brief the pair table builds for "push", "pull request" and "auto-merge"; (4) count the lines of `src/app` before Phase 2 and now.
  - Expected: (1) both pass; (2) the list is the tick's planner and the manual take; (3) nothing is found; (4) the receipt records the two counts and the modules that went.
  - Failure means: a second route to an agent is still in the code.
  - Next decision: whether the settings that pick a worker's executor become one table (simplification audit, F7).
