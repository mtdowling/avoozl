---
repo: avoozl
---
# Tasks: one way to run a worker

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`WP1` to `WP8`, in `requirements.md`); `D` sections
refer to this spec's `design.md`, `R` numbers to
`.kiro/specs/avoozl/requirements.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, real git with a bare remote, and fake
executors; Avoozl runs the repository's checks; no real workspace data,
machine configuration, credentials or personal plans in the repository
(AGENTS.md).

Task IDs start with `wp-` so they never collide with the IDs of the other
specs.

## Phase 1: Every kind of task on both executors

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

## Phase 2: The manual path

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

## Phase 3: Names

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
