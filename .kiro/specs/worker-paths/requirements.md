---
category: Planning
---

# Requirements: one way to run a worker

Status: Approved

Approved 2026-11-18, with the five defaults of design D10. The owner
granted approval delegation to Claude, which recorded the approval on the
owner's behalf against this revision in the workspace that holds this
repository's specs (Requirement 109).

## Introduction

A ready task can reach an agent by eight routes today. This spec cuts that to
one dispatcher, two executors, one remote route and one way to finish per
executor, and makes every kind of task work on both executors.

Approving it, creating issues and starting agents are separate acts.
Nothing here changes code, GitHub repositories or settings until its tasks
run.

Every claim about today's code carries one label: **V**, read in the file
cited at `deca253`; or **A**, assumed and not checked, with the reason.

### Why

The routes, counted at `deca253`:

| #   | Route                                | Selected by                                       |
| --- | ------------------------------------ | ------------------------------------------------- |
| 1   | Tick, Kiro Crew chat, local task     | default                                           |
| 2   | Tick, `process` child                | `harnesses.worker`, `projects.*.executor`, a pin  |
| 3   | Tick, batch of tasks in one chat     | the manifest's `batches`                          |
| 4   | Tick, worker pushes and opens the PR | the task's GitHub route                           |
| 5   | Crew Mode conductor claims and relays | `delivery.runner: "crew-mode"`                   |
| 6   | A person claims and reports          | `avoozl claim`, only under route 5's setting      |
| 7   | Runner mode over SSH                 | `runner.role: "runner"` or `"driver"`             |
| 8   | Worker machine pulls                 | `runner.role: "worker"`, by hand-run commands     |

What that costs:

- The manual path of Requirement 96.5 works only when Crew Mode is on.
  `claimTask` refuses unless `delivery.runner` is `crew-mode` (V:
  `src/app/runner.mjs:293`), and the tick starts no task while it is on (V:
  `src/app/tick.mjs:1325`).
- A `process` worker is given briefs that name what it cannot use.
  Investigate first is on by default (V: `src/app/investigate.mjs:24`) and
  is added to a worker's brief whatever the executor (V:
  `src/app/delivery.mjs:2427`). Its lines say "call plans_session" (action report) with the
  findings and then "wait" for a message (V: `investigateLines`,
  `src/app/investigate.mjs:158`). A child has no MCP tool, and the `process`
  executor rewrites the report step only for the verifier, the reviewers,
  the retro and the planner, not for a worker (V: `processFinish`,
  `src/app/executors/process.mjs:137`). `flow-batch.mjs` has no `process`
  branch either (V), and a child makes no commit (Requirement 96.1), so it
  cannot make a batch's one commit per task. What a child does with such a
  brief was not run (A); proof P57 ran with investigate first off.
- A `process` child on a worker machine gets the chat's brief: "Commit your
  work there" and "run … runner report" (V: `src/app/remote-runner.mjs:531`
  names the executor and `:538` still passes `workerBrief`). Its result is
  read from the result file (V: `finishProcessSession`,
  `src/app/executors/process.mjs:277`), which that brief never mentions.
  Requirement 90.8 says a headless `process` worker works without Kiro
  Crew.
- Worker pull does not run by itself. On a worker machine the tick runs
  only the tasks it already holds (V: `runnerTick`,
  `src/app/remote-runner.mjs:487`, called from `workspace.tick` in
  `src/app/operations.mjs:3369`). Pulling and claiming are reached only by
  the `worker.pull` and `worker.claim` operations, which the commands of
  the same names call (V: `src/app/operations.mjs:3180` and `:3188`).
  `src/app/worker-results.mjs` is imported only by its own test (V).
- Work on another Kiro Crew instance was wired into the tick, delivery, plans
  and settings. Nothing records a crew that can take work.
- A finished worker's report depends on which route it took: an MCP tool, a
  command with a token, a command with no token, a relay through a
  conductor, or a result file.

### What this builds on

`.kiro/specs/avoozl/` stays the product spec. This spec keeps Requirement 93
(one executor seam), Requirement 96.1 to 96.4 (one way to finish) and
Requirement 90.1 to 90.6, 90.8 and 90.9 (worker machines pull). It changes
Requirement 96.5 (WP2), retires Requirement 84 and Requirement 90.7 (WP5),
and retires what is left of Requirement 41 (WP6). WP9 lists every edit to
that spec.

### Scope

- How a ready task is started, run and reported, on this machine and on a
  worker machine.
- The settings, commands, hook and modules of the routes that go.

### Out of scope

- The roles that are not the worker (verifier, reviewers, planner, plan
  reviewer, falsifier, responder, review drafts, retro, task summary).
  Requirement 97.3 already says each runs on either executor; moving the
  ones that still need a Kiro Crew chat is separate work.
- The page without Kiro Crew (`.kiro/specs/standalone-web/`).
- The GitHub-route steps in which a worker pushes and opens its own pull
  request (route 4). Requirement 86.3 already forbids them, and task 45.4 of
  the avoozl spec removes them. WP4.4 names the dependency.
- Issue Radar. None of its modules imports a module this spec removes.
- How many tasks run at once. The simplification audit's F1 covers it.

### Words

| Word           | Meaning                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------- |
| Dispatcher     | The code that decides a ready task starts now and writes its session request                |
| Executor       | What runs the agent: `kirocrew` (a Kiro Crew chat) or `process` (a child of the supervisor) |
| Worker machine | A second machine that pulls offers, runs the task and pushes a branch (Requirement 90)      |
| Manual claim   | A person taking a ready task with `avoozl claim` and finishing it by hand                   |
| Crew           | An Issue Radar crew, and nothing else, once this spec is done                               |

## Requirements

### Requirement WP1: One dispatcher

**User story:** As the owner, I want one piece of code to decide that a task
starts, so that I can say why a task is or is not running by reading one
place.

#### Acceptance criteria

1. The tick SHALL be the only dispatcher. It SHALL run from the Kiro Crew
   cron or from `avoozl supervisor --tick-seconds N`, with the same code and
   the same result for the same workspace state.
2. `delivery.runner` SHALL be removed. A file that holds
   `"runner": "tick"` SHALL load and the key SHALL be ignored.
3. A file that holds `"runner": "crew-mode"` SHALL load, the tick SHALL
   start no task in that workspace, and one Needs you item SHALL say that
   Crew Mode dispatch is gone and offer **Let the tick run it**. Only a
   person SHALL be able to choose it; choosing it SHALL remove the key.
   Avoozl SHALL NOT start work in a workspace that a conductor used to drive
   until a person says so.
4. A source test SHALL fail when any module other than the tick's planner
   writes a session request with role `worker` for a ready task, apart from
   the manual claim of WP2.

### Requirement WP2: A person can still take a task by hand

**User story:** As a person, I want to take one ready task and finish it
myself, so that I am never blocked on an agent.

#### Acceptance criteria

1. `avoozl claim TASK` from the local command line SHALL work with the tick
   as the dispatcher. It SHALL bind the task to a manual claim, prepare its
   worktree, and print the worktree path and the report command. The tick
   SHALL NOT start a session for a task that has a manual claim.
2. `avoozl claim` SHALL refuse a task that is not ready, a task with a
   running session, and a task held by Stop the line, each with the reason.
3. `avoozl runner report TASK done|blocked`, run from the task's worktree
   with no token, SHALL finish a manual claim, as it does today (V:
   `matchClaimReport`, `src/app/report-match.mjs:75`). Avoozl SHALL read the
   commit from the worktree and SHALL run the checks itself.
4. `avoozl claim TASK --release` SHALL give the task back, and SHALL refuse
   when the worktree has uncommitted changes unless `--discard` is given.
5. `avoozl next` SHALL stay as a read of the ready, running, waiting, Needs
   you and done lists.
6. The `--slot` forms of `claim` and `report`, the `next --hook` form and
   the conductor relay SHALL be removed. A call to one SHALL answer with one
   line naming `avoozl claim TASK` and `avoozl runner report`.
7. A claim over MCP, or from an agent session the supervisor started, SHALL
   be refused. A manual claim is a person's.

### Requirement WP3: Every kind of task runs on both executors

**User story:** As the owner, I want to pick an executor without learning
which kinds of task it cannot run, so that `process` is a full choice.

#### Acceptance criteria

1. For every pair of executor (`kirocrew`, `process`) and task kind (single
   task, task with investigate first, member of a batch, landing or feedback
   round, task on a worker machine), Avoozl SHALL either give the session a
   brief it can follow to the end or decline that pair in code with a stated
   reason. No pair SHALL give a brief that names a tool or a command the
   session cannot use.
2. Investigate first on `process`: the child SHALL write its findings to
   `.avoozl/result.json` with `state` `findings` and exit. Avoozl SHALL
   record them as it records findings reported by a chat. **Go ahead** SHALL
   resume the same session with the definition's `resume` command. The size
   limit of Requirement 96.1 SHALL apply.
3. A batch whose worker runs on `process` SHALL run as single tasks, with
   the reason "a process child makes no commits, so one session cannot make
   one commit per task" shown where a batch that breaks a rule is shown
   today.
4. A task on a worker machine SHALL get the brief of that machine's
   executor: the `process` steps of Requirement 96.1 on `process`, the
   commit-and-report steps on `kirocrew`.
5. One table in code SHALL hold, for each pair of WP3.1, the brief it gets
   or the reason it is declined. A test SHALL fail when a pair is missing
   from the table, and SHALL run each brief through a fake executor of its
   kind to a recorded result.

### Requirement WP4: One way to finish per executor

**User story:** As the owner, I want a worker's report to arrive the same
way whatever the task, so that setting up Kiro Crew for a worker needs no
extra step.

#### Acceptance criteria

1. A worker on `kirocrew` SHALL finish, and report findings, a block or a
   question, only with `avoozl runner report` and the token in its brief. A
   worker on `process` SHALL do so only with the result file. No worker
   brief SHALL name `plans_session {action: "report"}` or any other MCP tool as the way to
   finish.
2. `avoozl runner report` SHALL accept `findings` with `--file PATH`, beside
   `done` and `blocked`. It SHALL refuse a file over the size limit of
   Requirement 96.1 and SHALL treat its text as data.
3. The report command in a brief SHALL run on that machine without `avoozl`
   on the session's `PATH`. The brief SHALL give the command the running
   Avoozl resolves for itself (V: the worker-machine brief already takes
   one, `src/app/remote-runner.mjs:388`; the local brief names bare
   `avoozl`, `src/app/delivery.mjs:1802`). A test SHALL run the command from
   a brief in a shell with an empty `PATH`.
4. A worker's brief SHALL NOT tell it to push, open or edit a pull request,
   or turn on auto-merge (Requirement 86.3). This criterion is met by task
   45.4 of the avoozl spec; this spec's last proof SHALL check it.
5. `plans_session {action: "report"}` SHALL stay for the roles that are not the worker, and for
   an MCP client Avoozl did not start. The README SHALL say that a worker
   needs no MCP sharing.

### Requirement WP5: One remote route

**User story:** As the owner, I want one way to add a second machine, so
that there is one set of rules about what that machine is trusted to do.

#### Acceptance criteria

1. Worker pull (Requirement 90) SHALL be the only way a task runs on
   another machine.
2. On a worker machine the tick SHALL pull offers, request claims and start
   the acknowledged tasks by itself, within its free lanes. `avoozl worker
   pull` and `avoozl worker claim` SHALL stay as the same steps run once by
   hand.
3. On the driver the tick SHALL fetch a worker machine's pushed result,
   check its diff and run its checks again before it lands (Requirement
   90.2), with no command run by hand. `src/app/worker-results.mjs` SHALL be
   called from the tick or removed.
4. Runner mode over SSH SHALL be removed: `runner.role` values `runner` and
   `driver`, the SSH transport, `avoozl runner accept`, `avoozl runner
   handoff` and `avoozl runner pull`. `runner.role: "worker"` and `avoozl
   runner report` SHALL stay. The envelope SHALL stay as the record of a
   pulled task and SHALL be taken only from an acknowledged claim (V: worker
   pull already stores one, `src/app/remote-runner.mjs:340`, and a worker
   refuses one that was not pulled, `:243`). A file with a removed role
   SHALL be refused when it loads, naming the key and worker pull.
5. A machine with no GitHub access SHALL NOT be a worker machine. It can
   run its own workspace. Requirement 90.7 is retired (WP9).
6. Proof P53 of the avoozl spec SHALL stay the live proof of worker pull.

### Requirement WP6: Every session runs on this machine

**User story:** As the owner, I want every session Avoozl starts to run on
the machine that started it, so that "where is this running" has one
answer.

#### Acceptance criteria

1. Avoozl SHALL start a session only on its own machine. No setting, pin,
   command or operation SHALL name another Kiro Crew instance.
2. The remote steps, the `crew` argument of the `kirocrew` executor and the
   hand-back over SSH SHALL be removed. The crew snapshot stays for the In
   flight view's unreachable-crew flag.
3. The agent, model and harness pins of a task's `session` (Requirement 53),
   this machine's lane limit, and the provider checks (Requirement 72) SHALL
   stay.
4. Retired.
5. Retired.
6. Unknown keys in a machine file SHALL be dropped, and SHALL NOT stop a
   workspace from loading.

### Requirement WP7: Old names answer, and say where the work went

**User story:** As a person with an old script or an old chat, I want a
removed command to tell me what replaced it, so that nothing fails without
a reason.

#### Acceptance criteria

1. Each removed command and operation SHALL answer through the table in
   `src/app/moved-operations.mjs` with one line that names its replacement,
   and SHALL change nothing.
2. `avoozl register-session` and `avoozl session-hook` SHALL be removed the
   same way. Their operation already only answers with a pointer (V:
   `src/app/moved-operations.mjs:46`).
3. The `plans_*` MCP tool names, the `AVOOZL_*`, `AICOMMANDER_*` and
   `NUPP_WORKSPACE_*` variables and the `aicommander` command SHALL keep
   working (AGENTS.md).
4. The installed app's entry point (`kirocrew-app/bin/avoozl.mjs`) SHALL
   list only the commands the app still runs.
5. `kirocrew-app/hooks/avoozl-runner.json` SHALL be removed, and the app's
   README SHALL no longer tell a person to copy it.

### Requirement WP8: One meaning for each word

**User story:** As a reader of the page, the help and the docs, I want
"crew" and "runner" to mean one thing each, so that I do not have to learn
which one a sentence means.

#### Acceptance criteria

1. On the page, in the CLI help and in `README.md` and `docs/*.md`, "crew"
   SHALL mean an Issue Radar crew only, and "Crew Mode" SHALL NOT appear.
2. "Runner" SHALL NOT name a mode or a machine. `avoozl runner report` and
   `runner.role: "worker"` keep their names as compatibility interfaces.
3. A test over the page's strings, the help table and those documents SHALL
   fail on "Crew Mode", "runner mode", "remote crew" and
   "conductor". Dated records under `docs/research/`, `docs/evidence/` and
   `docs/proposals/` are not checked.

### Requirement WP9: The product spec says the same thing

**User story:** As the maintainer, I want the avoozl spec to describe what
is built, so that a later reader does not rebuild a retired route.

#### Acceptance criteria

1. Requirement 96.5 of the avoozl spec SHALL be changed to: "`avoozl claim`,
   `avoozl next` and `avoozl runner report` SHALL stay as the manual path
   for a person."
2. Requirement 84 and Requirement 90.7 SHALL be marked retired by WP5, and
   Requirement 41 retired by WP6, each with the date and this spec's name.
   Their text stays as the record.
3. Tasks 11.1, 11.10, 16.7 and proof `avoozl-p29` of the avoozl spec SHALL
   be marked superseded by this spec and not run.
4. Design §4.10, §5.1 and §6.13 of the avoozl spec SHALL each open with one
   line naming what replaced it.
