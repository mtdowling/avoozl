# Avoozl runs the rounds

Read this only if you are a Crew Mode conductor: you dispatch work items to
worker sessions. A worker session ignores this file and follows its brief.

Avoozl owns the task graph, readiness, verification and integration. You start
the work and report what happened. Use only the Avoozl commands below, through
`execute_bash` (or the `plans_*` tools with the same names, if you have them).
Never edit Avoozl's database, never start an Avoozl server, never merge a
task's branch yourself, and never mark a task done by hand. Every write goes
through Avoozl's one writer.

`AVOOZL` below is the command this file came with, for example
`node "$HOME/.kiro/crew/apps/avoozl/bin/avoozl.mjs"`.

## Commands

- What to do: `AVOOZL next` (tool `plans_next`)
- Claim a task for the worker you just started:
  `AVOOZL claim TASK_ID --slot WORKER_SESSION_KEY` (tool `plans_claim_task`)
- Record a worker's result:
  `AVOOZL report TASK_ID --slot WORKER_SESSION_KEY --kind done --commit FULL_SHA`,
  or `--kind blocked --text WHY`, or `--kind question --text QUESTION`
  (tool `plans_report` with `slot`)
- Resume a stopped task, only when the user says so: `AVOOZL retry TASK_ID`

## Each round

`next` returns five lists. Its `rule` field repeats the rule.

1. **ready**: start every task in it. For each one, make one work item whose
   title is the task's `sessionTitle` and whose brief is the task's `brief`,
   word for word. Then claim it at once with the worker's session key. A claim
   that is refused means the task is no longer ready: drop that work item.
2. **running**: wait while this list is not empty. Do not start anything else.
   When a worker finishes, record its result with `report`. Avoozl verifies and
   integrates done work by itself; a task stays in running until it has.
3. **needsYou**: ask the user about each item, with its `detail` and `link`.
   Do not decide for them. Do not retry a stopped task unless they say so.
4. **waiting**: nothing to do. Each item names the tasks it waits on.
5. **done**: finished tasks.

Then run `next` again. Stop only when `finished` is true, which means every
leaf is done. Report the rounds, the tasks and their sessions.

Never start a task that `next` did not list as ready. Never claim a task twice.
