---
category: Delivery
---

# Requirements: stalled workers

## Introduction

In flight shows what Avoozl observed about each worker, how long it has been
in that state, and what Avoozl does next. A worker whose turn ended, whose
session is gone, that waits on something outside the repository, or that hit
its provider's quota recovers in its own worktree with one active worker per
task.

### Done when

- A terminated turn, a timed wait and a quota failure each show a distinct
  cause and next action in In flight.
- Recovery from each of them keeps the task's worktree, commits and last
  report, and never runs a second active worker for the task.

### Related specs

`.kiro/specs/avoozl/` is the product spec. This spec builds on its
Requirement 88.4 (one resume of a vanished chat), Requirement 96 (one way to
finish) and Requirement 114 (git owns state, SQLite is a cache), on the lanes
of `.kiro/specs/simplify/` Requirement SM20, and on
[Workflow v1](../../../docs/github-workflow.md#15-claims) section 15 (claims
and leases).

### Dependency

Timed waits (SW6) need the lease commit of rule 15.1 and the lease renewal of
rule 15.6 on main. Today `takeLease` (`src/app/workers/claims.ts`) points the
lease at the claim head and never renews it. That work is built outside this
spec. Phase 4 starts only after it lands.

### Scope

- The worker role's sessions on the `kirocrew` and `process` executors.
- The In flight view, Needs you rows and the settings these states read.

### Out of scope

- Review roles, the responder and plugin decide calls. They keep the retry
  path they have.
- Time boxes (`delivery.timeboxMinutes`). They stay as they are.
- Waking on events Avoozl does not observe itself, such as a third-party
  webhook. A script reaches the task through `avoozl wake TASK`.

### Words

| Word | Meaning |
| --- | --- |
| Attempt | One worker session on a task, numbered in `task_deliveries.attempts` |
| Active worker | A worker session whose executor has not confirmed that it ended |
| Turn ended | The executor confirms the session stopped working and can take another message: a Kiro Crew chat reads `idle`, a `process` child exited and its definition has `resume` |
| Gone | The executor confirms it does not hold the session: Kiro Crew lists no such chat for `GONE_GRACE_MS`, or the supervisor reads `gone` |
| Continue | A message Avoozl sends to a session whose turn ended, asking it to go on |
| Progress | A new report from the attempt, or a new commit on the task's worktree since the last continue |
| Checkpoint | The worktree's head commit and the attempt's last report, with its time |
| Timed wait | A worker's `wait` report: a reason and a wake time |
| Quota limit | The harness's own signal that its provider refused more work for now |
| Fallback harness | The harness named in `roles.worker.fallback` |

## Requirements

### Requirement SW1: Each worker state reads plainly

**User story:** As the owner, I want In flight to say what Avoozl saw, for
how long, and what it does next, so that I can tell a recovering worker from
a running one without opening it.

#### Acceptance criteria

1. Each worker row in In flight SHALL show one state from the table in
   design §D3: its label, its cause, the elapsed time since the state began,
   and its next action with a time when one is scheduled. The strings SHALL
   be exactly those of §D3.
2. "Session gone" and "No recent progress" SHALL never share a label, a
   cause or a next action.
3. The state SHALL come from one backend function, `workerState`, that the
   page, `avoozl lanes` and Needs you all read.
4. Times SHALL show in the viewer's local time as `HH:MM` on a 24-hour
   clock, with the short month and day before them when the time is not
   today.
5. At 320px width the row SHALL wrap with no horizontal scroll and no text
   cut off. The state chip SHALL take its colors from theme variables
   (`TONE`), and nothing in the row SHALL animate.
6. A task in a timed wait or a quota wait, which has no live session, SHALL
   still show one row in In flight.

### Requirement SW2: One active worker per task

**User story:** As the owner, I want a task to have one worker at a time, so
that two sessions never write the same worktree.

#### Acceptance criteria

1. Avoozl SHALL start a new attempt for a task only after its executor
   confirmed the previous attempt ended: the session reads `closed` or
   `lost`, reads `gone` for `GONE_GRACE_MS`, or reads `idle` after a final
   report (`done`, `blocked` or `wait`) that Avoozl answers with no message.
2. A stop Avoozl sends counts as ended only once a later status read
   confirms it. A refused or failed status read SHALL count as not ended.
3. Avoozl SHALL NOT replace a worker because it went quiet, missed a
   continue or its activity lease expired.
4. Every recovery path in this spec (continue, vanished resume, wake, quota
   retry and fallback) SHALL pass the same guard, `previousAttemptEnded`.

### Requirement SW3: A turn that ends before done continues

**User story:** As the owner, I want a worker whose turn ended early to keep
going in its own session, so that I do not lose its context.

#### Acceptance criteria

1. WHEN the executor confirms a worker's turn ended with no final report
   and no quota limit THEN Avoozl SHALL send the same session a continue
   after a delay of `delivery.continueMinutes`, doubling after each continue
   without progress, up to `delivery.continueMaxMinutes`.
2. A `process` child that exits with no result file, under a definition
   with `resume`, SHALL count as a turn ended, not as a closed session.
   Avoozl SHALL commit its changes first, as it does today.
3. Progress SHALL reset the delay and the count.
4. WHEN `delivery.continueAttempts` continues pass with no progress THEN
   Avoozl SHALL stop sending them and open one Needs you row naming the
   cause and the checkpoint.
5. A `process` child under a definition with no `resume` SHALL take
   today's retry path, which counts against `delivery.retries`.

### Requirement SW4: A gone session resumes once in its worktree

**User story:** As the owner, I want a worker whose session disappeared to
pick up where it stopped, so that a gateway restart costs me nothing.

#### Acceptance criteria

1. WHILE the executor reports a worker `gone` for less than `GONE_GRACE_MS`
   Avoozl SHALL start nothing and SHALL show the time it reads again.
2. WHEN the gone status settles THEN Avoozl SHALL keep today's rule (avoozl
   Requirement 88.4): one new attempt in the same worktree with the same
   brief and the last report quoted as data, on a free worker lane.
3. That resume SHALL NOT count against `delivery.retries` or
   `delivery.continueAttempts`.
4. A second vanish since the last person's retry SHALL open one Needs you
   row naming the cause and the checkpoint.

### Requirement SW5: A running worker with no progress is shown, not replaced

**User story:** As the owner, I want to see a worker that runs but reports
nothing, so that I can look at it or steer it myself.

#### Acceptance criteria

1. WHEN a worker's executor reads `working` and the attempt has no
   progress for `delivery.stallMinutes` THEN In flight SHALL show it as "No
   recent progress" with the time of the last report.
2. Avoozl SHALL start, stop and message nothing for that state.
3. The row SHALL offer **Open session** and, for a session that accepts
   messages, **Send message**.

### Requirement SW6: A worker can wait on something outside the repository

**User story:** As the owner, I want a worker that waits for a test rig or a
person outside the repository to give its lane back and come back later, so
that a lane does not sit idle for hours.

#### Acceptance criteria

1. A worker SHALL report a timed wait with a reason and a wake time:
   `avoozl runner report TASK wait --until TIME --text REASON` from a chat,
   or `{"state": "waiting", "text": ..., "until": ...}` in a `process`
   child's result file. `TIME` SHALL be an ISO 8601 time with a zone, in the
   future, and at most `delivery.waitMaxHours` ahead. Avoozl SHALL refuse
   any other with the reason.
2. A wait report SHALL end the attempt as `waiting`. It SHALL count against
   no bound.
3. The task SHALL keep its claim branch and lease. Avoozl SHALL write the
   reason and wake time into the lease commit as `Wait:` and `Reason:` lines
   and keep them through every renewal. SQLite SHALL hold only a copy that
   `avoozl rebuild` remakes from the lease commit.
4. The lane SHALL be free for another task once the executor confirms the
   waiting session ended (SW2).
5. WHEN the wake time passes, or a person presses **Wake now** or runs
   `avoozl wake TASK` THEN the tick SHALL start one new attempt in the same
   worktree with the approved brief, the wait reason and the last report
   quoted as data, on a free worker lane.
6. A wake SHALL wait while the task is held: its spec stopped (Workflow
   v1 10.1), Stop the line, Autopilot off, the spec text not approved (7.3)
   or changed since the lease (15.10), or the spec issue not assigned to
   this runner (8.3). In flight SHALL name the hold.
7. `avoozl wake TASK` and **Wake now** SHALL be a person's. A call from MCP
   or from an agent session SHALL be refused.

### Requirement SW7: A quota limit falls back or waits

**User story:** As the owner, I want a worker that hits its provider's limit
to go on under another harness I approved, or to wait for the limit with a
time I can see.

#### Acceptance criteria

1. Avoozl SHALL detect a quota limit only from the harness's own exit and
   output, by the definition's `quota` key (design §D7). A harness with no
   `quota` key, and the `kirocrew` executor, SHALL have no quota state, and
   In flight SHALL say so in its settings line.
2. `roles.worker.fallback` SHALL name a harness. Avoozl SHALL use it only
   when its definition is approved on this machine by its current hash.
3. A fallback SHALL NOT loosen permissions. Avoozl SHALL refuse it when it
   runs with a wider permission class, a write root, an allowed command or
   an unconfined mark the primary does not have, or when it is `kirocrew`
   and the primary is a `process` harness. Its own sandbox rules SHALL
   apply.
4. WHEN a quota limit ends an attempt and a usable fallback exists THEN
   the tick SHALL start one fallback attempt in the same worktree with the
   approved brief, the last report and the worktree's head commit, after
   SW2's guard. In flight SHALL name the fallback harness, the primary, and
   the cause.
5. WHEN no usable fallback exists THEN In flight SHALL show when Avoozl
   retries: the reset time the harness gave, or `delivery.quotaRetryMinutes`
   after the exit. A retry SHALL resume the primary's own session when its
   definition has `resume`. When the fallback is set but refused, the row
   SHALL say why and what the owner must do.
6. A quota retry or fallback SHALL NOT count against `delivery.retries`. It
   SHALL count against `delivery.continueAttempts` when it makes no
   progress.
7. A harness that reports a quota limit while it still runs SHALL stay
   running. In flight SHALL show the limit and offer **Stop and fall back**,
   which stops the session and falls back once the stop is confirmed.

### Requirement SW8: Recovery settings

**User story:** As the owner, I want to set how fast and how often Avoozl
recovers a worker, so that I can trade lane time for patience.

#### Acceptance criteria

1. `.avoozl.json` `delivery` SHALL accept these whole-number settings with
   these defaults and bounds, refusing a value out of bounds by name:

   | Setting | Default | Bounds |
   | --- | --- | --- |
   | `continueMinutes` | 2 | 1-1440 |
   | `continueMaxMinutes` | 30 | 1-1440 |
   | `continueAttempts` | 3 | 0-10 |
   | `stallMinutes` | 30 | 5-1440 |
   | `waitMaxHours` | 72 | 1-720 |
   | `quotaRetryMinutes` | 60 | 5-1440 |

2. `checkInMinutes` and `missedCheckIns` SHALL be removed; the continue
   settings replace them. A file that holds either SHALL be refused, naming
   the key and its replacement.
3. `roles.worker.fallback` SHALL be a field of the worker's row in
   Settings › Models.
4. **Settings › Autopilot › Run limits** SHALL edit the `delivery` settings
   above.

### Requirement SW9: Every state is tested and proved

**User story:** As the owner, I want each state checked by tests and seen
once live, so that a regression shows before I meet it.

#### Acceptance criteria

1. Each state in design §D3 SHALL have a test with fake executors and an
   isolated workspace that reaches it, reads its strings, and asserts the
   next action happens or does not.
2. A workflow kit case SHALL check that a lease carrying a timed wait and
   renewed on time is not stale, and that another runner does not take the
   claim over.
3. A manual live proof SHALL reach a turn ended, a timed wait and a quota
   limit with real harnesses and record a receipt under `docs/evidence/`.
