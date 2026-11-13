# Phase 4 crew scope, crew-label holds and priority order: tasks 4.1, 4.2, 4.5

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 4.

- Implementation commit: `d37e395` ("Show Issue Radar crew scope, hold crew labels, order ready slots by priority")
- Base: `kirocrew-native` at `bf49f0d`, fast-forwarded under both landing locks
- Recorded: 2026-11-12, macOS

## Checks

| Check                                                 | Result                                            |
| ----------------------------------------------------- | ------------------------------------------------- |
| `npm test` at `d37e395` (typecheck, build, all tests) | exit 0; 807 tests, 807 pass, 0 fail               |
| `src/app/test/github-crew.test.mjs` (new)             | 8 of 8 pass                                       |
| New projection test in `src/app/test/github.test.mjs` | pass                                              |
| `git diff --check`                                    | clean                                             |
| `kirocrew-app/ui/dist/index.mjs`                      | rebuilt by `npm test`; matches the committed file |

`npm test` rebuilds `canvas-app/extension.js` with machine paths in its
comments. That file was restored and is not part of the change. No live
GitHub check was run; every case uses a fake GitHub.

## What landed

| Task                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 [R17.4]         | `settings.get` returns `crews`: one line per single-repo repository coded by Issue Radar, with the policy's `managedLabels.ready` exactly and a link to Issue Radar's page route `/issue-radar` (from its `app.json`). Settings shows only that line and the link. A repository with no ready label says so.                                                                                                                                                                                                                                                                                                                                                      |
| 4.2 [R17.3, R27.11] | `src/app/github-crew.mjs` runs in the cron tick. It reads Issue Radar's claim and needs-human labels (defaults `crew: in progress` and `crew: needs human`, from Kiro Crew's Issue Radar source; both configurable per repository as `crewLabels`). A claim without the ready label, or a needs-human label, sets one `crew-…` decision on the task and one notice. Later ticks write nothing. `ready:true` now also holds a dependent whose blocker has an open decision, so a closed blocker with needs-human still holds its dependents. Avoozl never writes the crew's labels; it adds and later removes the managed `stale` label when the policy names one. |
| 4.5 [R27.7]         | Projection fills free ready slots by the repository's `priority` list (best listed label wins, without case; unlisted labels sort last), then graph order. A leaf already holding the ready label keeps its slot. The cap still bounds the count. Projection now recomputes its own `blocked`/`conflict` verdicts instead of reading them back, so a leaf left out once can take a freed slot later.                                                                                                                                                                                                                                                              |

## Cases tested

| Case                                                                                                                                                     | Test                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Shown label equals the configured ready label; custom name; no ready label; worker and plans-repo repositories show nothing                              | `each Issue Radar crew scope is exactly…`, `settings.get shows the crew scope…` |
| Crew labels default, configurable, must differ, cannot reuse a managed label                                                                             | `crew labels default to Issue Radar's own…`                                     |
| Claim with ready label: no decision. Claim without it: one decision over five ticks, stale added once, then settled and stale removed when ready returns | `a claim without the ready label opens one decision…`                           |
| Needs-human on a closed blocker holds its dependent; removed releases it; re-added opens a new decision                                                  | `needs-human opens one decision…`                                               |
| Needs-human and stale claim on one issue: needs-human wins; shows in Conflicts                                                                           | `needs-human wins over a stale claim…`                                          |
| Configured crew label names are read; a worker-coded repository is not read                                                                              | `configured crew labels are the ones read…`                                     |
| Two priority labels on one issue, mixed case, unknown label, no list                                                                                     | `priority rank takes the best listed label…`                                    |
| Cap of 1: holder keeps its slot; freed slot goes to `critical`; tie on `high` goes by graph order; never more than one ready                             | `free ready slots go by priority label, then graph order, under the cap`        |
