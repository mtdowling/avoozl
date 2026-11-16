# Proof P56: the executor seam is named and nothing else changed

Date: 2026-11-16. Requirements: R93, R97 (design §4.28). Result: **PASS**,
after one repair found by the live run.

## Setup

- Code before the seam: `8972caf5` (last main commit before Phase 46).
  Code after: `4a574220` (handoff base) and `1865ffae` (main with PR #315).
- Live run: an isolated Kiro Crew 0.12.2.3 gateway on port 5696 with its own
  home under `/private/tmp/avoozl-p56-live/harness`, started with
  `scripts/live-harness/harness.sh`. The real gateway was not read, written or
  restarted.
- Isolated Avoozl workspace `/private/tmp/avoozl-p56-live/ws` with one project,
  `scratch`, whose checkout clones the private scratch repo
  `mtdowling/avoozl-scratch-p56`. Nothing was pushed to it.
- One task, `p56-hello`: write `hello.txt` holding `hello from P56` and commit.
- Kiro Crew agent `kirocrew-worker`; session keys below are redacted.

## Suite and boundary test

| Code | Tests | Fail | Timed out under load |
|---|---|---|---|
| `8972caf5` (before) | 1860 | 0 | 4 |
| `4a574220` (after) | 1993 | 0 | 4 |
| `1865ffae` (main, with #315) | 2010 | 0 | 2 |

Every timed-out test passed when its file ran alone. Behavior coverage was
kept (R93.6): the after suite is a superset of the before suite.

`src/app/test/executor-boundary.test.mjs` fails on any source path outside
`src/app/executors/kirocrew.mjs` that names a Kiro Crew folder, project or
agent file. It passes on `1865ffae`. Run alone with the executor request tests and the
two timed-out files, 29 of 29 pass.

## Live run

| Time (UTC) | Observed |
|---|---|
| Before 17:16 | Every tick failed: `MCP tool error: Only the native executor cron may consume session requests.` A script cron's own MCP server gets no caller block; Kiro Crew names the job only in `KIROCREW_SESSION_KEY=cron:<job>`. The same error was in the real gateway's security log from 07:06Z. |
| 17:16 | With the repair patched into the harness copy, the tick queued a `start` request; the native executor cron (`cron:2275c7ac`) took it and opened `avoozl:p56-hello Add hello.txt` in folder `Avoozl › scratch`. Binding: `executor: "kirocrew"`, `permissionClass: "write"`, `prompts: brief.worker@6eeac1b4`. |
| 17:16-17:35 | The worker's `plans_prepare_worktree` and `plans_report` calls waited for approval and were declined after 180 s (unattended chat). |
| 17:47 | After the chat was trusted, an executor `send` reached it. `plans_prepare_worktree` made `avoozl/p56-hello`. The chat had no shell or file tool and reported `blocked` through `plans_report`; the binding stored the report. |
| 17:48 | The tick opened attempt 2 through the executor. It reported `blocked` for the same reason. |
| 19:30 | After the harness agent fix below, the tick opened attempt 3 through the executor. It committed `b6d4406f` (`hello.txt`, 1 line) in the worktree and called `plans_report` with `kind: done` and the full SHA at 19:31:08. |
| After | `avoozl show p56-hello`: status `implemented`, commit `b6d4406f` with source `Integrated`. `cat hello.txt` prints `hello from P56`. |

The worker opened and reported as before, three times, each through the
`kirocrew` executor's start and send paths.

## Repair

The cron caller defect is fixed on main by PR #315 (`withCronCaller` in
`src/app/app-mcp.mjs`): a request with no caller block takes the caller
`cron:<job>` from `KIROCREW_SESSION_KEY`, and only a `cron:` key is taken.
The live run used an equivalent patch in the executor's consumer lookup
(same guards: no caller block, `cron:` key only), which was then dropped in
favor of #315. The harness ran the bundled app from before #315, so #315's
exact code was proven by its launcher test, not by this live run.

## Harness-only setup found on the way

These are fixes to the throwaway harness, not to Avoozl:

- `agent.approval_mode auto`, to match the real Mac.
- The harness home's `kirocrew.json` had no built-in tools (`execute_bash`,
  `fs_write`, ...), because installing the app wrote that file before setup.
  Running `kirocrew setup --agent-only` after adding the shipped built-ins
  fixed it, and the derived `kirocrew-worker` picked them up. An open chat does
  not reload its tools, so attempts 1 and 2 stayed without them.
- `@avoozl:avoozl/plans_prepare_worktree` and `plans_report` were allowed
  without a prompt in the harness agent, as the real home allows its own
  Avoozl server.
- The owner trusted attempts 1-3 from his terminal; the harness refuses a
  dashboard token to an agent chat (`member_owner_token_refused`).

Risk noted: on a fresh Kiro Crew home, a worker chat stalls on approval unless
its tools are allowed or the chat is trusted.
