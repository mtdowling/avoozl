# Proof P30: flow with fake workers and scripted timings

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 12,
proof P30 (tasks.md; design §4.11, §8.4; R43–R48).

- Base: `kirocrew-native` at `872c62f` (Phase 12: `156ae8e`, `736fbd6`, `07a7d4c`)
- Recorded: 2026-11-13, macOS
- Result: **pass**

## What ran

`src/app/test/proof-p30.test.mjs`, part of `npm test`.

- Workspace: a temporary directory with its own SQLite store and a real
  `.avoozl.json` (`delivery.concurrency` 3, `flow.batch.max` 3).
- Repository: a sample git repository with one declared check,
  `node test/check.mjs`. The check fails while a file `broken` exists; fails
  only in a scratch worktree (that is, on the branch, not in a task's
  worktree) while `breaks-main` exists; and fails one run when the flaky file
  says so.
- Tasks: epic `e1` with `a1`–`a4` (all `size: "small"`), `b1`, `c1`, `c2`,
  `d1` (requires `a1`), a plans-repo leaf `g1`, and 20 filler leaves.
- Fake sessions: worker, verifier and review sessions are bound the way the
  tick cron binds them and report through `session.report` as their slot.
  `Date` is mocked; every time below is minutes after 09:00.
- Fake check-run feed: one verdict for `g1` through `recordGitHubTiming`.
- Fake retro model: replies written straight into `recordRetroReply`.

## Results

| # | Action | Observed |
|---|---|---|
| 1 | `c1`: tool rows edit 1, edit 3, `npm install` 5, the check 8; done 10; verified 11; integrated 13 | Worker spans from tool calls only: coding 5 m, commands 3 m (`npm install`), tests 2 m (detail `node test/check.mjs`). Merge 2 m. Lead 13 m, active 12 m, flow efficiency 92%. No row output stored. |
| 2 | `b1` as a Crew Mode worker with one `tests` marker | Spans `coding` (events) then `tests` (markers); the bar is coarse. |
| 3 | `a1`–`a4` ready, max 3 | One batch `a1+a2+a3` by epic, one session; `a4` not dispatched. |
| 4 | `a2`'s commit adds `broken`; head check fails | Checks ran once, on `a3` (the head). The batch split; no task counts a failed attempt. |
| 5 | `a1` retried alone adds `breaks-main`, integrates; `c2` running | The line stopped on `a1` (one task commit in range), check `node test/check.mjs`, branch `main`. `d1` not dispatched; `c2` untouched. `c2`'s failing check is `held` (not judged), 0 failed attempts. Fix task `a1.fix-1` first in line. Banner: paused 1, Needs you false. |
| 7 | `a1.fix-1` removes `breaks-main` and integrates at 62 | Stop closed, time to fix 17 m, one "Line green" notice. `d1` no longer paused (waits for a slot). `a1` stays integrated. |
| 6 | Flaky run armed, a person's commit on `main` | One flaky record, no stop. (Run after 7: while a stop is open a failure is still red.) |
| 8 | Second stop; Run anyway by the owner, then by a session | Owner: recorded `by: dashboard`, paused 0, stop still shown. Session: 403. |
| 9 | `g1` push and done without a local pass; then with one; CI fails | Hook refused "no recorded local pass"; done refused "Local checks first". After `runLocalChecks`, both accepted. CI failure recorded as CI only (`build`), `ci-wait` span 70–85. |
| 10 | 10 more finished tasks; retro; model proposes `flow.batch.max` 3 → 5 and a `contentRules.sets` change | Retro dispatched on `avoozl-retro`. Bottleneck `queued` with numbers. Content-rules proposal dropped ("guards safety"). Approve wrote `flow.batch.max` 5 with the expected hash; no other key changed. |
| 11 | 10 more tasks, lead time unchanged | PDCA `no change`; next retro carries `flow.batch.max` 5 → 3. |
| 12 | Store reopened with a `waiting` span open | It closed at the next report (minute +150), not at the reopen (+140). |
| 13 | `flow.retro.instructions` in `projects.app.flow` / via Settings | Refused, naming the key. |

Flow tab numbers for the 24 finished tasks, checked by hand in the test:
time to fix 9 m (median of 17 m and 1 m); first-pass rate 23/24 (only `a1`
reworked); lead time 40 m (20 of 24 are 40 m); change failure rate 1/24 (`a1`).

## What this does not show

- Kiro Crew's app slot read was not called live (task 12.2): the tool-row
  shape and the incremental cursor are taken from the Kiro Crew source
  (F90, F91) and stay **Inferred**. MC-13 is drafted, not filed.
- Stop the line watches the local landing branch. In GitHub modes it does
  not yet read the base branch's required checks (design §4.11 "Where checks
  come from"); `ci-wait` and CI-only records come from the completion read.
- The UI was checked from screenshots of a page harness with fake data
  (Flow tab, Dashboard banner, Timing fold, Settings > Flow; wide, medium,
  narrow; light and dark), not inside a running Kiro Crew.
