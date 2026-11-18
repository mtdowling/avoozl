# Tasks: one way to run a worker

Status: Approved

Explicit `after` lists and the manifest's `requires` govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`WP1` to `WP9`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

Phase 1 adds and removes nothing. Every removal is after `wp-p1`, so no
route goes before both executors cover every kind of task.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, real git with a bare remote, and fake
executors; run `npm test` and `git diff --check` before landing, and `npm
run test:ui` for UI changes; no real workspace data, machine configuration,
credentials or personal plans in the repository (AGENTS.md). A task that
deletes a test file first lists, in its pull request, each behavior that
file covered and the test that covers it afterward (D7). Screen changes need
phone and desktop, light and dark screenshots for owner approval before
merge (R92.12). Screenshots are shown to the owner and never committed
(AGENTS.md).

Approving this spec, creating issues and starting agents are separate
acts, and no task here has started. Task IDs start with `wp-` so they never collide with the IDs
of the other specs.

## Phase 1: Every kind of task on both executors

- [ ] wp-1.1 The pair table, and briefs chosen by executor [WP3.1, WP3.4, WP3.5] (§D3)
  - `src/app/worker-briefs.mjs` holds one frozen table from executor and task kind to a brief builder or a stated reason; delivery, `flow-batch.mjs` and `remote-runner.mjs` ask it; a `process` child on a worker machine gets `processSteps`.
  - Done when: A test fails when a pair of executor and kind is missing from the table; every cell's brief runs through a fake executor of its kind to a recorded result; no `process` brief holds "commit", "push" or "runner report"; the existing delivery, batch and worker-mode tests pass with their assertions unchanged.
- [ ] wp-1.2 Findings by the command line and by the result file, after wp-1.1 [WP3.2, WP4.2] (§D4)
  - `avoozl runner report TASK findings --file PATH --token T` checked by the validator the MCP tool uses; `investigateLines` takes the executor; the result file's `findings` state; Go ahead, Investigate again and Stop reach a child through `resume`; investigate first is declined, with the reason on the task, for a definition with no `resume`.
  - Done when: Tests with fake executors: a chat's findings by the command line and a child's findings by the result file open the same falsifier request and the same gate; Go ahead resumes the same child session and its done result lands; a findings file over the size limit is refused; a done result before Go ahead is still refused; a definition with no `resume` codes the task without the step and shows why.
- [ ] wp-1.3 A batch on `process` runs as single tasks, after wp-1.1 [WP3.3] (§D3)
  - The batch rules gain "the worker's executor makes commits"; a group that fails it runs as single tasks with the stated reason, where a group that breaks a rule is shown today.
  - Done when: Tests: a three-task group on `process` starts three sessions and lands three commits, and the page and `avoozl show` give the reason; the same group on `kirocrew` still runs in one chat with one commit per task.
- [ ] wp-1.4 A report command that needs no `PATH`, and no MCP tool in a worker's brief, after wp-1.1, wp-1.2 [WP4.1, WP4.3, WP4.5] (§D5)
  - One helper gives the brief the Node binary and the running CLI's path, quoted for a shell; the batch brief and the investigate lines use the command-line report; the README says a worker needs no MCP sharing.
  - Done when: A test runs the report command taken from a built brief in a shell with an empty `PATH`, against the source checkout and against the built app package, and both record the report; a search of every `kirocrew` worker brief in the pair table finds no `plans_`; `plans_report` from a verifier and from an MCP client Avoozl did not start still works.

- [ ] wp-p1 Proof: every pair of executor and task kind reaches a result, after wp-1.1, wp-1.2, wp-1.3, wp-1.4 [WP3, WP4] (§D3, §D4, §D5)
  - Setup: an isolated workspace and a scratch repository with a bare remote; one single task, one task with investigate first, one three-task batch and one task whose first landing fails, each run once with every role on `kirocrew` and once on `process` with an approved Claude Code definition. The owner runs the `process` half from his own terminal, as in P57.
  - Action: (1) run the tick until every task lands or waits; (2) press Go ahead on each investigated task; (3) read each session's brief from its record.
  - Expected: (1) every task lands on both executors, the batch as one chat on `kirocrew` and as three children on `process`; (2) each investigated task codes only after Go ahead, in the same session it investigated in; (3) no brief names an MCP tool or a bare `avoozl`, and no `process` brief asks for a commit; MCP sharing for `avoozl:avoozl` is off for the whole `kirocrew` run.
  - Failure means: `process` is still not a full choice, or a worker still needs MCP sharing.
  - Next decision: whether investigate first stays on by default for `process`.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 2: The manual path without Crew Mode

- [ ] wp-2.1 A person claims a task with the tick on [WP2.1, WP2.2, WP2.3, WP2.4, WP2.5, WP2.7] (§D6)
  - `src/app/manual-claim.mjs` from `claimTask`, with no Crew Mode test and no conductor branch; a test that the ready query's existing rule keeps the tick off a claimed task; `avoozl claim TASK --release` and `--discard`.
  - Done when: Tests with the tick on: a claimed task stays unstarted across three ticks; `runner report` from its worktree with no token finishes it and Avoozl runs the checks; a claim is refused for a task that is not ready, has a running session or is held by Stop the line, each with its reason; a claim over MCP and from a child of the supervisor is refused; release refuses a dirty worktree without `--discard`.
- [ ] wp-2.2 Remove Crew Mode dispatch, and hold the workspaces that used it, after wp-2.1, wp-p1 [WP1.1, WP1.2, WP1.3, WP1.4, WP2.6, WP7.4, WP7.5] (§D7)
  - `delivery.runner` leaves the validators and the schema; a file with `crew-mode` reads as held with one Needs you item and the person-only **Let the tick run it**; `runner.mjs` keeps `nextView`; the hook file, the runner prompt, the relay branches and the `--slot` forms go; the app entry point lists the commands it still runs; the seven test files that name `crew-mode` move to the manual claim or the tick.
  - Done when: Tests: a `crew-mode` workspace starts nothing across three ticks and shows one Needs you item; the operation is refused from MCP and from an agent session, and from a person it removes the key and the next tick starts work; `"runner": "tick"` loads and is ignored; the source test of WP1.4 passes and fails on a planted second dispatcher; the pull request lists what each moved or deleted test covered and where it is covered now; the schema parity test passes.

- [ ] wp-p2 Proof: a person finishes a task by hand while the tick runs the rest, after wp-2.2 [WP1, WP2] (§D6, §D7)
  - Setup: as P62, in an isolated workspace with a scratch clone, without `delivery.runner`, with two ready tasks and a fake `kirocrew` executor.
  - Action: (1) claim one task from the command line; (2) run three ticks; (3) commit in the claimed worktree and run `avoozl runner report TASK done`; (4) claim a third task and release it.
  - Expected: (1) the claim prints the worktree and the report command; (2) the tick starts the other task only; (3) Avoozl runs the checks on the commit and lands it; (4) the released task is ready again and the next tick starts it.
  - Failure means: the manual path still needs a setting, or a claim and the tick can both start one task.
  - Next decision: none.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 3: One remote route

- [ ] wp-3.1 A worker machine pulls and claims on its own tick, after wp-1.1 [WP5.2] (§D8)
  - On `runner.role: "worker"` the tick pulls offers, requests claims for its free lanes and starts acknowledged tasks, before `runnerTick`; `avoozl worker pull` and `avoozl worker claim` call the same functions.
  - Done when: Tests with a fake GitHub and a fake driver: a worker with two free lanes and three offers claims two and starts two with no command run by hand; a request with no acknowledgment starts nothing; a tick with no GitHub records one line and starts nothing; the hand-run commands give the same result as one tick.
- [ ] wp-3.2 The driver checks a pulled result on its tick, after wp-3.1 [WP5.3] (§D8)
  - The tick calls `worker-results.mjs` for each acknowledged claim: fetch the ref, check the diff against declared and protected paths, run the checks on that head, queue it to land.
  - Done when: Tests: a pushed result lands with no command run by hand; a result that touches a protected path, and one whose checks fail on the driver, each become a failed attempt on the driver with the reason; a result for a claim the driver did not acknowledge is ignored; `worker-results.mjs` has an importer that is not a test.
- [ ] wp-3.3 Remove runner mode over SSH, after wp-3.2 [WP5.1, WP5.4, WP5.5] (§D8)
  - The roles `runner` and `driver`, the SSH transport and `driverTick` go; `remote.accept`, `remote.handoff` and `remote.pull` answer with their replacement; the worker cases of `remote-runner.test.mjs` move to `worker-mode.test.mjs`.
  - Done when: Tests: a file with `runner.role: "runner"` or `"driver"` is refused naming the key and worker pull; an envelope is taken only from an acknowledged claim; a search of `src/` finds no `ssh` argv outside the plugin and mirror code; the pull request lists what the deleted tests covered and where it is covered now.

- [ ] wp-p3 Proof: two workspaces, one driver and one worker, with only ticks, after wp-3.3 [WP5] (§D8)
  - Setup: two isolated workspaces on one machine with separate config and state homes, one fake GitHub between them, a scratch repository with a bare remote; the worker runs `process` with a fake harness.
  - Action: (1) approve a two-task spec on the driver; (2) run ticks on both until nothing changes; (3) make the worker push a result that touches a protected path.
  - Expected: (1) and (2) both tasks land on the driver's base branch and no `worker` command was run by hand; (3) the driver refuses it as a failed attempt and nothing lands.
  - Failure means: worker pull still needs a person at each step, or the driver trusts a worker machine's result.
  - Next decision: when to run `avoozl-p53`, the live two-machine proof in the avoozl spec.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 4: Placement on one machine

- [ ] wp-4.1 Remove remote crews and the hand-back, after wp-p1 [WP6.1, WP6.2, WP6.5, WP6.6] (§D9)
  - The crew registry and snapshot, `crew-reader.mjs`, `handback.mjs`, `remoteSteps`, `remoteTarget`, `kirocrewRemoteSession`, the `crew` argument of the executor and `avoozl crews set` go; a `session.crew` other than `local` is a lint error on a draft and one Needs you item with the person-only **Run here** on an approved revision.
  - Done when: Tests: a draft with `session.crew: "big-mac"` fails lint naming the key; the same pin on an approved revision starts nothing across three ticks and shows one Needs you item, and Run here from a person starts it on this machine; machine files with `crews` and `crewStaleSeconds` load; a search of `src/` and `kirocrew-app/` finds no `crew=` and no importer of the removed modules.
- [ ] wp-4.2 One local placement module, and Delivery shows what holds a task, after wp-4.1 [WP6.3, WP6.4] (§D9)
  - `src/app/lanes.mjs` holds the pin check, the lane limit and the provider checks' entry point; `routing.mjs`, `placement.mjs` and what is left of `crews.mjs` go; `avoozl routing set` goes and `avoozl routing` names Dashboards › Delivery; that page shows the lane limit and each provider check that holds a task.
  - Done when: Tests: pins for `agent`, `model` and `harness` behave as the pin tests assert today; a task held by the lane limit and one held by a provider check each show their reason on Delivery; the no-fit decision still opens for a harness this machine lacks; machine files with `routing` load; screenshots of Delivery at 390 and 1280 px, light and dark, go to the owner.

## Phase 5: Names

- [ ] wp-5.1 Removed commands answer with their replacement, after wp-2.2, wp-3.3, wp-4.2 [WP7.1, WP7.2, WP7.3] (§D7, §D8, §D9)
  - Every command and operation this spec removes, and `register-session` and `session-hook`, answers through `moved-operations.mjs`; the help table drops them.
  - Done when: A test calls each removed command and operation and gets one line naming its replacement and no change to the workspace; the help test passes; the `plans_*` tool names, the environment aliases and the `aicommander` command pass their existing tests.
- [ ] wp-5.2 One meaning for each word, and the product spec says the same, after wp-5.1 [WP8, WP9] (§D1)
  - The word test over the page's strings, the help table, `README.md` and `docs/*.md`; the edits to Requirements 41, 84, 90.7 and 96.5, to design §4.10, §5.1 and §6.13, and to tasks 11.1, 11.10, 16.7 and `avoozl-p29` of the avoozl spec.
  - Done when: The word test passes and fails on a planted "Crew Mode"; `node scripts/spec-lint.mjs` reports 0 errors; each retired requirement keeps its text under a dated line naming this spec.

- [ ] wp-p4 Proof: one dispatcher, two executors, one remote route, after wp-p1, wp-p2, wp-p3, wp-4.2, wp-5.2 [WP1 to WP9] (§D1)
  - Setup: the repository at the commit that lands wp-5.2.
  - Action: (1) run the source test of WP1.4 and the pair table's test; (2) list every operation that writes a session request with role `worker`; (3) search every worker brief the pair table builds for "push", "pull request" and "auto-merge"; (4) count the lines of `src/app` before Phase 2 and now.
  - Expected: (1) both pass; (2) the list is the tick's planner and the manual claim; (3) nothing is found, which holds only once task 45.4 of the avoozl spec has landed; (4) the receipt records the two counts and the modules that went.
  - Failure means: a second route to an agent is still in the code.
  - Next decision: whether the settings that pick a worker's executor become one table (simplification audit, F7).
  - Done when: Expected result observed; receipt under `docs/evidence/`.
