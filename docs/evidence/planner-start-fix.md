# Planner start fix: the tick starts the planner for matched issues

Date: 2026-11-12. Gap found by proof P12 (docs/evidence/p12-p13-issue-radar-auto-merge.md,
"Observed outside the expectations"): the tick took in an issue a deliver rule
matched but never started a planner, so the P12 driver classified the issue,
wrote the spec folder, drafted it and wrote the critique by hand. Requirement
areas: R12.3-12.6, R27.5 (tasks 4.4 and 4.6, design §6.2).

## Change

- `src/app/github-planner.mjs` (new): the tick's planner step. For each
  authorized issue a `deliver` or `execute` rule matched, with no Avoozl
  marker (a projected plan issue is already a leaf), no classification, and
  a registered local checkout, it records one `breakdown` planner start per
  trigger event on the issue row, then returns a dispatch on agent
  `avoozl-planner` (the declared name a dashboard session resolves, as the
  verifier fix abdc905 did), role `planner`. When the draft waits for a
  critique (`awaiting-critique`), it records one `critique` start for that
  exact revision hash, at most two per trigger event; a third revision opens
  one decision instead. A start is dispatched again only until its session is
  bound; Kiro Crew returns the existing session for the same title. A
  breakdown session that closes or is lost without classifying opens one
  decision and keeps the issue held; a new trigger event plans it again.
- `src/app/github-breakdown.mjs`: `breakdownHold` holds an unclassified issue
  with a planner as `classifying`, so neither readiness dispatch nor Issue
  Radar can take it before the planner answers. `plans_classify_issue` and
  `plans_draft_children` refuse a bound planner session that names another
  issue (403); callers that are not planner sessions are unchanged.
- `src/app/tick.mjs`: runs the planner step after intake and respond, under
  the same unobserved-session hold, and adds its dispatches to `dispatch`.
  The cron script `kirocrew-app/crons/tick.py` needed no change: it opens,
  binds (with role and attempt) and briefs every dispatch the same way.
- `kirocrew-app/agents/avoozl-planner.json`: a breakdown mode, and the two
  tools `plans_classify_issue` and `plans_draft_children`. The planner test
  still requires every other Avoozl tool it has to be read-only.
- `kirocrew-app/skills/avoozl/SKILL.md`: the broad-issue section says the
  tick now starts these sessions itself.

## Tests

`src/app/test/github-planner.test.mjs`, with FakeGitHub and a fake Kiro Crew
that does what `tick.py` does (open by title, bind, send the brief):

| Test | Shows |
|---|---|
| one planner, then one critique, then publishes | Tick 1 dispatches one `avoozl-planner` session with a breakdown brief naming `example/code#7` and its spec folder; the issue is held `classifying`. Tick 2 starts nothing. After the planner session classifies broad and drafts, one critique session starts for that revision hash; the next tick starts nothing. After the critique, the tick publishes two sub-issues. A trigger label on a published child (a leaf with a marker) starts no planner. |
| bounded answer | A planner answering bounded starts no critique; the issue becomes ready as its own leaf. |
| already classified | An issue classified before the tick gets no planner session. |
| restart | The cron dies after the tick returns; after a restart the same title is dispatched, giving one session. After it is bound, a second restart dispatches nothing. |
| own issue only | A planner session bound to one issue cannot classify another (403). |
| ends without classifying | One decision notice, the issue stays held, no second session; a new trigger event starts one new session. |

`src/app/test/github-breakdown.test.mjs` (the P12-style tick test) now expects
tick 1 to dispatch one planner and hold the issue `classifying`.

`npm test` (which rebuilds the app package) passed 485 of 485 on the rebased
branch, and `git diff --check` was clean.

## Not covered

- No live Kiro Crew or GitHub run: no live session opened on `avoozl-planner`.
  Whether a dashboard session given breakdown mode makes good calls is up to
  a future proof run.
- A critique with findings is not sent back to a new draft round
  automatically. With `autoPublishChildren` the issue waits; without it, the
  preview shows the finding count.
- A repository with no local checkout still gets no planner, and its matched
  issue keeps the old unclassified path.
