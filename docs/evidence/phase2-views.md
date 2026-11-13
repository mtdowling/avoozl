# Phase 2 Graph, Delivery and Conflicts views: task 2.13

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 2.

- Implementation commit: `92edf4e` ("Add Graph, Delivery and Conflicts views")
- Base: `kirocrew-native` at `aadf2fc`, fast-forwarded under `$TMPDIR/avoozl-kirocrew-native-land.lock`
- Recorded: 2026-11-12, Node v26.13.0, macOS

## Checks

| Check | Result |
|---|---|
| `npm test` at `92edf4e` (typecheck, build, all tests) | exit 0; 615 tests, 615 pass, 0 fail |
| New backend tests, `src/app/test/page-views.test.mjs` | 6 of 6 pass |
| `npm test` in `kirocrew-app/ui` (`node --test test/`) | 7 of 7 pass (4 new in `views-api.test.mjs`) |
| `npm run build:kirocrew-app` (UI `tsc`, Vite, CLI bundle) in the task worktree and again in the `kirocrew-native` worktree | exit 0; `kirocrew-app/ui/dist/index.mjs` 28.43 kB; `kirocrew-app/bin/lib/src/app/page-views.mjs` present |
| `git diff --check` | clean |
| `prettier --check` on changed `src/app` files | clean |

`npm test` rebuilds `canvas-app/extension.js` with different output. That file
was restored and is not part of the change.

## What landed

| Part | Change | Tests |
|---|---|---|
| Read operations | `src/app/page-views.mjs` adds `graph.view`, `delivery.view`, `conflicts.view`, run through `Operations.execute`. All three classify as `observe` in `safety.mjs` and write nothing. No existing operation returned readiness with the work-model fields or the session bindings, so `state` and `queue` were not enough | views compare entity rows before and after |
| Graph data | Every task with `kind`, `authority`, `route`, `completion`, `repository`, `status`, `complete`, `decision`, issue link, and `ready` from the same `ready:true` query `queue` uses (registered repositories passed). Edges with `blocking` (`requires`, `sequence`) and `satisfied` (via `completionReached`, so edge conditions count). Filters: `epic`, `repository`, `status` (string or list); edges kept only when both ends are shown. Epics and statuses always come back whole, with per-epic counts | kind, authority, ready set, edge state, filters |
| Delivery data | Leaves with a session binding, run, evidence record, integration, pull request, evidence link, or status `running`/`review`/`failed`. Each lists bindings (slot, role, attempt, status), runs, evidence (links and command records), integration commit, pull requests. `task_deliveries` and `task_worktrees` rows are passed through when those tables exist; this change does not add them | binding with status; evidence link |
| Conflicts data | Open `decision` on a task, `blocked` or `needsReview` tasks (needs you), a `closed`/`lost` session under an unfinished task, and active runs sharing a resource | decision, blocked, lost session |
| Old databases | Missing tables read as empty, so a read-only database that predates `session_bindings` still renders all three views | `0444` database without `session_bindings`; bytes unchanged |
| UI | `GraphView.tsx` (epic, status, repository filters; Ready only; grouped by epic, epics then packages then leaves; per row kind, authority or issue link, status, Ready, Decision, "waits on" and "blocks"), `DeliveryView.tsx` (running and finished), `ConflictsView.tsx`. All load through `useAppApi()` via `views-api.ts` and `useRead.ts`. `WorkspaceView` reports its selected workspace to `App.tsx`, which passes it to the three views. Colors come from host tokens (`text-muted`, `text-danger`, `Badge` variants, `var(--border)`, `var(--text)`) | client call shapes; grouping and blocking edges; summary; labels |
| Link safety | Evidence and PR text is agent or GitHub data. Only `http:`/`https:` values become links (`safeHref`); anything else renders as text. React escapes all text | `javascript:`, `file:`, paths refused |
| Backend | `app-backend.mjs` adds the three names to the page's operation set | owner, app token, agent tool allowed; `none` refused |

The Graph draws at most 400 rows at once and says how many it hid; filters
narrow the rest.

## Nupp read-only copy (P3 input)

The P3 copy at a temporary root (files `0444`), added to an isolated machine
catalog and read through the real backend's `/api/command` with a signed owner
claim, then fed to the page's own `graphGroups` helper.

| Expected | Observed | Result |
|---|---|---|
| 141 W tasks | `graph.view {epic: W1–W7}`: 141 tasks; groups W1 33, W2 27, W3 22, W4 9, W5 12, W6 21, W7 17; 141 rows rendered | pass |
| 130 edges | 130 edges (101 blocking, 64 of them unmet); 38 ready leaves | pass |
| Other views | `delivery.view` 200, 214 items; `conflicts.view` 200, 184 items (all `needs-human`) | pass |
| Copy unchanged | SHA-256 of `.avoozl.json`, `.avoozl/config.json`, `workspace.sqlite`, `workspace.sqlite-wal` identical before and after | pass |

The copy has no `session_bindings` table, so its Delivery items come from
evidence links and runs. Its three milestones have legacy kind `milestone` and
read as leaves (task 2.1 rule).

## Security checks

| Check | Result |
|---|---|
| Bind | Unchanged: `server.listen(port, "127.0.0.1")`. Live: the check backend reported `127.0.0.1` |
| Unsigned calls | Live: unsigned `graph.view`, `delivery.view`, `conflicts.view` all 401 |
| Authorization | The new operations are `observe`; app tokens and agent tools may read them, as with `workspace.tick.health`. No write was added |
| Sweep | `0.0.0.0` and `[::]` in `src`, `kirocrew-app`, `scripts`: only `team-coordination.mjs` (refuses them) and two tests that check refusal. Unchanged from `phase2-model-validation.md` |

No credential, workspace data, or machine path was added.

## Changed files

- `src/app/page-views.mjs` (new), `src/app/test/page-views.test.mjs` (new)
- `src/app/operations.mjs`, `src/app/safety.mjs`, `src/app/app-backend.mjs`: three read operations
- `kirocrew-app/ui/src/GraphView.tsx`, `DeliveryView.tsx`, `ConflictsView.tsx`, `views-api.ts`, `useRead.ts` (new)
- `kirocrew-app/ui/src/App.tsx`, `WorkspaceView.tsx`: selected workspace shared
- `kirocrew-app/ui/tsconfig.json`: `allowImportingTsExtensions`, so UI modules import each other with the `.ts` suffix node's test runner needs
- `kirocrew-app/ui/test/views-api.test.mjs` (new), `kirocrew-app/ui/dist/index.mjs` (rebuilt)

## Not done

- Not checked: the page inside a real Kiro Crew install or in both color schemes. The views were checked through the backend and the UI helpers only.
- No actions: open a session, pause or resume a subtree, retry, nudge, accept or dismiss a conflict. The app SDK typings here have no chat navigation, and the actions belong to tasks that own those writes.
- Not shown: verifier verdicts, per-repository capacity, critique failures, quarantine, GitHub field conflicts. They have no stored data yet; Delivery shows `task_deliveries` and `task_worktrees` rows generically once task 2.6–2.11 add them.
- Duplicate task IDs are refused at validation, so Conflicts does not list them.
- Plan-file parsing, the Plans view, the tick, sessions, worktrees and reports were not changed.
