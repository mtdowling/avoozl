---
category: Planning
---

# Requirements: one way to run a worker

## Introduction

A ready task reaches an agent through one dispatcher, two executors and one
way to finish per executor, and every kind of task works on both executors.
Every session runs on the machine that drives its spec.

### What this builds on

`.kiro/specs/avoozl/` is the product spec. This spec builds on its
Requirement 93 (one executor seam) and Requirement 96 (one way to finish).

### Scope

- How a ready task is started, run and reported on this machine.

### Out of scope

- The roles that are not the worker (`.kiro/specs/without-kirocrew/`).
- The page without Kiro Crew (`.kiro/specs/standalone-web/`).
- How many tasks run at once (avoozl Requirement 6.3).

### Words

| Word | Meaning |
| --- | --- |
| Dispatcher | The code that decides a ready task starts now and writes its session request |
| Executor | What runs the agent: `kirocrew` (a Kiro Crew chat) or `process` (a child the supervisor pass starts) |
| Manual take | A person taking a ready task with `avoozl take` and finishing it by hand |

## Requirements

### Requirement WP1: One dispatcher

**User story:** As the owner, I want one piece of code to decide that a task
starts, so that I can say why a task is or is not running by reading one
place.

#### Acceptance criteria

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

### Requirement WP2: A person can take a task by hand

**User story:** As a person, I want to take one ready task and finish it
myself, so that I am never blocked on an agent.

#### Acceptance criteria

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

### Requirement WP3: Every kind of task runs on both executors

**User story:** As the owner, I want to pick an executor without learning
which kinds of task it cannot run, so that `process` is a full choice.

#### Acceptance criteria

1. For every pair of executor (`kirocrew`, `process`) and task kind (single
   task, landing or feedback round), Avoozl SHALL either give the session a
   brief it can follow to the end or decline that pair in code with a
   stated reason. No pair SHALL give a brief that names a tool or a command
   the session cannot use.
5. One table in code SHALL hold, for each pair of WP3.1, the brief it gets
   or the reason it is declined. A test SHALL fail when a pair is missing
   from the table, and SHALL run each brief through a fake executor of its
   kind to a recorded result.

### Requirement WP4: One way to finish per executor

**User story:** As the owner, I want a worker's report to arrive the same
way whatever the task, so that setting up Kiro Crew for a worker needs no
extra step.

#### Acceptance criteria

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

### Requirement WP5: No remote route

**User story:** As the owner, I want every task to run on the machine that
drives its spec, so that there is one set of rules about what runs where.

#### Acceptance criteria

1. Every task SHALL run on the driver's own machine, on its own executors.
2. Avoozl SHALL hand no task to another machine.

### Requirement WP6: Every session runs on this machine

**User story:** As the owner, I want every session Avoozl starts to run on
the machine that started it, so that "where is this running" has one
answer.

#### Acceptance criteria

1. Avoozl SHALL start a session only on its own machine. No setting, pin,
   command or operation SHALL start, send to or stop a session on another
   Kiro Crew instance. A read-only link that opens an existing chat on
   another Crew may name that Crew (direct-links D2).
2. Avoozl SHALL NOT wait on a session binding whose Kiro Crew stopped
   answering (the crew snapshot, design D9).
3. The roles table's agent, model and harness (Requirement 53) and this
   machine's lane limit SHALL apply to every worker session.

### Requirement WP8: One meaning for each word

**User story:** As a reader of the page, the help and the docs, I want
"crew" and "runner" to mean one thing each, so that I do not have to learn
which one a sentence means.

#### Acceptance criteria

1. On the page, in the CLI help and in `README.md` and `docs/*.md`, "Crew
   Mode" SHALL NOT appear.
2. "Runner" SHALL NOT name a mode or a machine. `avoozl runner report`
   keeps its name.
3. A test over the page's strings, the help table and those documents SHALL
   fail on "Crew Mode", "runner mode", "remote crew" and "conductor".
   Records under `docs/research/` and `docs/evidence/` are not checked.
