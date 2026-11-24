---
repo: avoozl
---

# Tasks: stalled workers

Tasks run in list order, and each phase waits for the one above it.
Requirement numbers are in brackets (`SW1` to `SW9`, in `requirements.md`);
`§D` sections are in this spec's `design.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, real git with a bare remote, and fake
executors; Avoozl runs the repository's checks; no real workspace data,
machine configuration, credentials, transcripts or personal plans in the
repository (AGENTS.md). A task that changes the page shows the owner
screenshots at 320px and desktop width, light and dark, in chat before it
merges, and keeps them out of git.

Task IDs start with `stall-` so they never collide with the IDs of the other
specs.

## Phase 1: One guard, one state, the settings

- [ ] `stall-1.1` Guard every new worker attempt [SW2] (§D2)
  - `previousAttemptEnded` in `src/app/delivery/delivery.ts` returns true only for `closed`, `lost`, a settled `gone`, or `idle` after a final report
  - The planner's retry start and the vanished resume call it before they open an attempt
  - A table test drives each path with a fake executor that reads `working`, then `idle` with no report, then a failed read, and no path opens an attempt in any of the three
- [ ] `stall-1.2` Derive each worker's state and its words [SW1.1, SW1.2, SW1.3, SW1.4] (§D3)
  - `workerState` in `src/app/delivery/worker-state.ts` returns the state, `since` and `nextAt` for every row of the §D3 table
  - `workerStateText` in `src/app/delivery/worker-state-text.ts` returns each row's label, cause and next action exactly as §D3 writes them, with `{time}` and `{age}` formatted as §D3 says
  - A test fails when any two states share a label, cause and next action, and when "Session gone" and "No recent progress" share any of the three
- [ ] `stall-1.3` Add the recovery settings [SW8.1, SW8.2, SW8.4] (§D11)
  - `DELIVERY_LIMITS`, `DELIVERY_DEFAULTS` and `src/avoozl-config.schema.json` hold `continueMinutes`, `continueMaxMinutes`, `continueAttempts`, `stallMinutes`, `waitMaxHours` and `quotaRetryMinutes` with the defaults and bounds of SW8.1
  - A file with `checkInMinutes` or `missedCheckIns` is refused, naming the key and its replacement
  - A `continueMaxMinutes` below `continueMinutes` is refused by name
  - **Settings › Autopilot › Run limits** edits the six settings

## Phase 2: Turns that end, sessions that go, workers that go quiet

- [ ] `stall-2.1` Continue a worker whose turn ended [SW3] (§D4)
  - An `idle` chat with no final report gets the §D4 chat message after `continueMinutes`, then after doubling delays capped at `continueMaxMinutes`
  - A `process` child that exits with no result file under a definition with `resume` is recorded `idle` after `commitChildWork`, and gets the §D4 resume prompt through `executor.send`
  - A new report or a new worktree `HEAD` resets the delay and the count
  - After `continueAttempts` continues with no progress, the delivery goes to `decision` with stage `turns` and a stored checkpoint, and no further continue is sent
  - A child under a definition with no `resume` takes the retry path and counts against `retries`
  - `checkInStep` and `unansweredCheckIns` are gone, replaced by `continueStep` and `unansweredContinues`
- [ ] `stall-2.2` Show not listed and gone, and name the checkpoint [SW4] (§D5, §D9.4)
  - Before `GONE_GRACE_MS` passes the state is `not-listed` with `nextAt` at the end of the grace, and nothing starts
  - The first settled `gone` still records one `vanished` attempt with its last report and opens one attempt in the same worktree, which `failuresSince` and the continue count skip
  - A second settled `gone` opens a decision whose Needs you row shows the checkpoint's commit, report and time
- [ ] `stall-2.3` Show a running worker with no progress [SW5] (§D6)
  - A `working` attempt with no progress for `stallMinutes` reads `stalled`
  - A test runs the tick ten times over a `stalled` attempt and finds no message sent, no stop and no attempt opened
- [ ] `stall-2.4` Test the turn ended, not listed, gone and no recent progress states [SW9.1] (§D12)
  - `src/app/delivery/test/worker-state.test.ts` reaches `working`, `stalled`, `turn-ended`, `not-listed`, `gone` on both executors, and both `needs-you` rows through the tick
  - Each test reads the state's text and asserts the tick's action: the continue sent, the one attempt opened, or nothing

## Phase 3: Quota limits

- [ ] `stall-3.1` Detect a quota limit from the harness's own output [SW7.1] (§D7)
  - `parseHarnessDefinition` accepts the `quota` key of §D7 and refuses a pattern over 200 characters, one that does not compile, and any other field, naming the key
  - `quotaOf` reads the bounded log tail when a child exits non-zero or with no result file, and while it reads `working`; an exit 0 with a `done` result is never a quota limit
  - The four shipped definitions under `examples/harnesses/` carry the `quota` values of the §D7 table
  - Synthetic fixtures under `src/app/executors/test/fixtures/quota/` match each definition, and a plain failure fixture for each matches none
  - A definition with no `quota` key, and the `kirocrew` executor, never read a quota state
- [ ] `stall-3.2` Choose a fallback that keeps the sandbox [SW7.2, SW7.3, SW8.3] (§D8)
  - `roles.worker.fallback` is a field of the worker row only, and **Settings › Models** edits it
  - `fallbackFor` refuses a fallback whose definition is not approved on this machine or changed since approval
  - `fallbackFor` refuses a fallback that differs from the primary in any field of the §D8 table, naming the field
  - A test passes the Bedrock `claude-code` definition, installed as `claude-code-bedrock`, as a fallback for `claude-code`, and refuses `codex` for its missing `allow` argv
- [ ] `stall-3.3` Fall back or retry after a quota limit [SW7.4, SW7.5, SW7.6, SW7.7] (§D8, §D2)
  - An attempt that hit a quota limit records `outcome: "quota"`, which `failuresSince` skips
  - With a usable fallback, the next tick after the guard opens one fallback attempt in the same worktree with the approved brief, the last report and the worktree's `HEAD`, and its binding carries `fallback`
  - A fallback that hits its own limit retries the primary and does not fall back again
  - With no usable fallback, the primary's session gets a continue at the reset time or `quotaRetryMinutes` after the exit when its definition has `resume`, else one new attempt after the guard
  - A quota retry or fallback with no progress counts against `continueAttempts`
  - **Stop and fall back** stops a `quota-running` child and opens the fallback only after a later status read passes the guard
- [ ] `stall-3.4` Test the quota states [SW9.1] (§D12)
  - `worker-state.test.ts` reaches `quota-fallback`, `quota-retry`, each `quota-refused` refusal, and `quota-running` with and without a fallback
  - Each test reads the state's text and asserts the tick's action, and one test finds exactly one active worker through a fallback

## Phase 4: The view and the docs

- [ ] `stall-4.1` Show each state in In flight [SW1.1, SW1.5, SW1.6] (§D3, §D10)
  - `deliveryView` sends `workerState` on each session, and a row for each task in `quota` with no live session
  - `InFlightRow` shows the chip, `{label} · {elapsed}`, and the cause and next action, with the fallback line on a row that ran on a fallback
  - **Stop and fall back** shows on `quota-running` rows with a usable fallback
  - A phone-width test in `hosts/kirocrew/ui/test/` renders one row per state at 320px with no horizontal scroll and no cut-off text
  - A test finds the chip's colors only in `TONE` and no animation or transition in the row's styles
- [ ] `stall-4.2` Use the same words in `avoozl lanes` and Needs you [SW1.3] (§D10)
  - `avoozl lanes` prints each lane's state as `{label} · {elapsed} · {cause} {next}`
  - Needs you rows of stage `turns`, a second vanish and a refused fallback show the text of `workerStateText`
- [ ] `stall-4.3` Document continues, gone sessions and quota limits (§D11)
  - `docs/delivery.md` has "Time boxes and continues" and a "Quota limits" section with the fallback rule and the §D7 table
  - `docs/glossary.md` defines turn ended, continue, checkpoint and fallback harness

## Phase 5: Timed waits

- [ ] `stall-5.0` Confirm lease commits and lease renewal are on main (**MANUAL**)
  - Main's lease commit records the rule 15.1 lines, and a held lease is renewed at least once per half of the stale hours (rule 15.6)
- [ ] `stall-5.1` Take a wait report [SW6.1, SW6.2] (§D9.1)
  - `avoozl runner report TASK wait --until TIME --text REASON` and a `waiting` result file each end the attempt as `waiting`, which counts against no bound
  - A wait with no `until`, no zone, a past time, a time more than `waitMaxHours` ahead, or a reason that is empty or over 300 characters is refused with the reason
  - The worker brief in `src/app/workers/worker-briefs.ts` names the wait report on both executors
- [ ] `stall-5.2` Keep the wait in the lease [SW6.3, SW6.4] (§D9.2)
  - The lease commit carries `Wait:` in UTC and `Reason:` after the rule 15.1 lines, and every renewal until the wake copies them
  - The pre-push content rule checks the `Reason:` line
  - `avoozl rebuild` restores the delivery's `wait` from the newest lease commit
  - The lane takes another task once the waiting session passes the guard
- [ ] `stall-5.3` Wake a waiting task [SW6.5, SW6.6, SW6.7] (§D9.3)
  - At the wake time the tick opens one attempt in the same worktree with the approved brief, the wait reason and the last report quoted as data, after the guard
  - Each hold of §D3 keeps the task waiting and the row names it
  - `avoozl wake TASK` and **Wake now** wake the task on the next tick, and the same operation over MCP or from a session caller is refused
  - The renewal that starts the woken attempt drops the `Wait:` and `Reason:` lines
- [ ] `stall-5.4` Check waiting leases in the workflow kit [SW9.2] (§D12)
  - `workflow-kit/cases/claim-wait-renewed` passes: a renewed lease with a `Wait:` line is not stale and a second runner's resume stops
  - `workflow-kit/cases/claim-wait-stale` passes: the same lease left past the stale hours is taken over with a takeover commit
  - `docs/github-workflow.md` section 15 says a runner may add lines after `Done` and other runners ignore them, and the scenarios page is regenerated
- [ ] `stall-5.5` Show and test the waiting states [SW1.6, SW9.1] (§D10, §D12)
  - In flight shows one row for a waiting task with no live session, with **Wake now** on `waiting` and `wait-held` rows
  - `worker-state.test.ts` reaches `waiting` and `wait-held` for each hold, reads their text, and asserts the tick wakes the task only when no hold applies
  - `docs/delivery.md` has a "Timed waits" section with the report command and the lease lines

## Phase 6: Proof

- [ ] `stall-p1` Proof: a turn ends, a worker waits, a quota limit falls back [SW3, SW6, SW7] (**MANUAL**)
  - Expected: (1) each of the three shows its own state in In flight with the §D3 words; (2) each recovers in its own worktree with its commits and last report; (3) the supervisor and Kiro Crew never list two live worker sessions for one task
  - Expected result observed; receipt under `docs/evidence/`, screenshots checked and not kept in git
  - Setup: an isolated workspace and a scratch repository with a bare remote; the worker on `claude-code` with the Bedrock definition approved as `claude-code-bedrock` and set as `roles.worker.fallback`; one Kiro Crew lane and one `process` lane
  - Action: (1) end a chat worker's turn by hand before it reports; (2) have a worker report a wait 15 minutes ahead, then let it wake; (3) run a worker on a plan login with its usage limit spent, and record the harness's real output beside the §D7 pattern
  - Failure means: a state's words are wrong or shared, a recovery loses work, or two workers ran at once
  - Next decision: correct any §D7 pattern the real output does not match
