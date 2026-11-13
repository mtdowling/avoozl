# Phase 2 work model, authority guard, and validation: tasks 2.1, 2.2, 2.4

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 2.

- Implementation commit: `0d18b94` ("Add work model, GitHub authority guard and leaf validation")
- Base: `kirocrew-native` at `1aac5b2`, fast-forwarded under `$TMPDIR/avoozl-kirocrew-native-land.lock`
- Recorded: 2026-11-12, Node v26.13.0, macOS

## Checks

| Check | Result |
|---|---|
| `npm test` at `0d18b94` (typecheck, build, all tests) | exit 0; 609 tests, 609 pass, 0 fail |
| New tests, `src/app/test/work-model.test.mjs` | 13 of 13 pass |
| `npm run build:kirocrew-app` in the `kirocrew-native` worktree | exit 0; `kirocrew-app/bin/lib/src/work-model.mjs` present |
| `git diff --check` | clean |
| `prettier --check` on changed files | clean |

`npm test` rebuilds `canvas-app/extension.js` with different output. That file
was restored and is not part of the change.

## What landed

| Task | Change | Test |
|---|---|---|
| 2.1 fields | `src/work-model.mjs`: `kind` (`epic`, `package`, `leaf`), `authority` and `route` (`local`, `github`, `plugin:<id>`), `completion` (`merged-pr`, `integrated`, `released`, `answered`), `repository` (falls back to `projectId`). Defaults are derived on read; no row is rewritten | legacy rows read with work-model defaults and are not rewritten |
| 2.1 migration | Legacy kinds `task` and `milestone` read as `leaf`. A row with a GitHub issue reads as `authority: github`. `validate` rejects only explicit unknown values | validation rejects unknown work-model values and edge conditions |
| 2.1 edges | A `requires` edge may carry `condition` (a completion level). Without one, the dependency's complete status applies, as before. `task.update` and plan blocks accept `{task, condition}` | a requires condition waits for its completion level; plan blocks carry work-model fields and edge conditions into approval |
| 2.1 readiness | `ready:` in `src/query.mjs` adds: leaf only, not `draft`, no open `decision`, every blocking edge's condition holds, and, when the caller passes `repositories`, a named repository is registered. The `queue` operation passes the registered repositories | only leaves are ready; an open decision blocks readiness; a leaf on an unregistered repository is not ready |
| 2.1 writes | `task.update` writes `kind`, `route`, `completion`, `repository`, `checks`; refuses `authority`. Plan blocks may set `kind`, `route`, `completion`, `repository`, `checks`; `authority` is refused; epics and packages may omit acceptance | task.update writes work-model fields but never authority |
| 2.2 | Operations refuses `task.update`, `task.archive`, `task.unarchive`, `task.accept`, `task.merge` on `authority: github` rows with 409, `code: authority-github`, `route: projection`, naming the issue and the projection path (amend and approve the plan for design-origin issues; edit on GitHub and sync otherwise). Nothing is written | direct edits of GitHub-owned rows are refused and routed to projection |
| 2.4 | `lintPlan` adds `task.duplicate-id` (line of the repeat and of the first use), `leaf.repository` (two named, or none with several registered), `leaf.checks` (none on the leaf or its repository, unless `answered`), `leaf.completion` (level the route cannot observe). Cycles, unknown references, self-dependencies and leaf acceptance were already enforced and are unchanged. `plan.approve` already refuses any error diagnostic | validation reports a repeated task ID at its line; a leaf names exactly one repository; a leaf needs checks unless it is answered; a leaf's completion must be observable on its route |

Existing tests whose plans had no checks now name `"checks"` in their blocks
or register a repository with checks: `fixtures.mjs`, `design-extraction`,
`github`, `plan-quality`, `proposals`, `task-dedup`.

## Nearby inputs checked

| Input | Result |
|---|---|
| Nupp copy (P3 input): `.avoozl.json`, `.avoozl/config.json`, `workspace.sqlite`, `workspace.sqlite-wal` copied to a temporary root, files `0444` | Read with the old (`1aac5b2`) and new code. Both: 4,075 tasks, 142 edges, revision 2010; 141 W tasks across 7 epics; 130 W edges; 3 milestones (`six-workload-execution`, `compiler-on-core`, `runtime-flip`); `validate` 0 errors; 1,436 ready tasks, same set length. Copy hashes unchanged after both reads |
| Nupp stored values | Kinds `task` (4,072) and `milestone` (3); no `authority`, `route`, `completion` or edge `condition`; no GitHub-linked rows |
| `kirocrew-app/skills/avoozl/SKILL.md` example plan (from the planner task) | Lints with no errors with one registered repository; with two, only the existing `task.project-ambiguous` warning on the epic. Not edited |
| Workspace fixtures `local`, `github`, `mixed` | Load unchanged; GitHub rows read as `authority: github` |
| MCP `plans_*` input schema | Open object, so new `task.update` fields pass through. Not edited |

## Security checks

| Check | Result |
|---|---|
| Listeners | No listener, route, bind or auth change. The change narrows writes (new 409 refusals) |
| Sweep | `0.0.0.0` and `[::]` in `src`, `kirocrew-app`, `scripts`: unchanged from `phase1-workspace-view.md` |

No credential, workspace data, or machine path was added.

## Not done

- `answered` is not yet tied to a `respond` action; tasks have no action field.
- Route capacity in readiness belongs to dispatch (task 2.7).
- Quarantine and pause in readiness: no such task fields exist yet.
- Epics and packages are not checked for having children.
