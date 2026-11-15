# Radar-coder Proof 9, live: Make tests faster

Receipt for task `rc-p9`. The fake-GitHub run is
`docs/evidence/radar-coder-proof-9-fake-github.md`.

The first live attempt (2026-11-15, earlier) did not run: it had no page
session. This run drove the page with headless Chrome.

- Recorded: 2026-11-15 07:34 UTC, Linux, Kiro Crew 0.12.2.4 harness (own home
  `/tmp/avoozl-live-p7-10`, port 5697), Avoozl from `main` at `67c1267`.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-7`, with a slow
  suite (`test/slow.test.js`, six cases of 2 s each; `npm test` takes 12 s).
- Page: the harness dashboard, driven and captured with a headless Chromium
  shell through `playwright-cli`.
- Verdict: **FAIL.** Quick goal cannot start a planner chat in the app.

## Steps

1. Specs > Quick goal. Goal "Make tests faster", repository
   `mtdowling/avoozl-scratch-7`, depth Measure, budget 20 turns and 15 minutes
   (`rc-proof-9-live-01-quick-goal.png`).
2. Investigate.

## Observation

The modal answered "No planner chat is available here, so nothing was
started." (`rc-proof-9-live-02-no-planner.png`). Nothing was written to
GitHub.

## Cause

`quickgoal.propose` (`src/app/quick-goal-ops.mjs`) needs `ops.plannerAgent`,
a function that returns a planner chat with a `turn()` method. Only tests pass
one (`proof-rc-p9.test.mjs`, `quick-goal-flow.test.mjs`,
`radar-proof-13.test.mjs`). The app backend (`src/app/app-backend.mjs`)
builds `Operations` without it, and so do the CLI and MCP. So the live app
never has a planner, and every quick goal stops here.

The rest of the proof (measured evidence, one approval, a crew building the
mini-spec issues, Promote on a second goal) could not be reached.

## What a fix needs

Not a small change, so not made here. The planner chat must be opened by the
tick cron like other chats (a `dispatch` intent with the `avoozl-planner`
agent), and its proposal must come back as the chat's reply, the way a retro
reply does (`flow-retro.mjs`), since the tick-opened chats get no caller
identity for a report tool (`docs/evidence/rc-proof-20-live.md`).
`quickgoal.propose` then becomes "queued", and the modal waits for the
proposal instead of holding one request open for up to 15 minutes.
