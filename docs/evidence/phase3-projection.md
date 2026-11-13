# Phase 3 projection, one writer, and managed-field conflicts: tasks 3.7, 3.8, 3.9

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 3.

- Implementation commit: `121042c` ("Project with conflicts, epic types, capped readiness, and one writer")
- Base: `kirocrew-native` at `a84eb34` (policy work 9054021 rebased in; its projection changes, local-authority filter and the private-check removal, were carried into the new module)
- Recorded: 2026-11-12, macOS. Tests use temporary workspaces and fake GitHub; no live GitHub calls.

## Checks

| Check | Result |
|---|---|
| `npm test` at `121042c` | exit 0; 699 tests, 699 pass, 0 fail |
| New tests in `src/app/test/github.test.mjs` | 6 (epic type and edges, capped readiness, closed issue, duplicate task ID, field conflicts and resolution, one writer) |
| `git diff --check` | clean |

`npm test` rebuilds `canvas-app/extension.js`; that file was restored and is not part of the change.

## What landed

| Task | Change | Files |
|---|---|---|
| 3.7 | Projection moved to its own module and follows §6.3: match issues by marker (open or closed), withdraw readiness from blocked, conflicted, capped or changing leaves, create or update, sub-issue links, then `requires` and `sequence` dependencies, re-read, ready labels last, then record `applied` in the marker. Epics get `github.epicIssueType` when the owner has it, else a note. Completion levels and `supports` stay in the marker. Ready labels only on leaves, capped by `github.repositories[repo].concurrency`, counting ready issues outside the plan. Label names come from `managedLabels` in policy, else the registered repository. Repeating the same revision writes nothing | `src/app/github-projection.mjs` |
| 3.7 | A closed issue for an unfinished task calls `closeWithoutCode` once; the stub returns a decision (3.11 fills in the rule). Two issues with one task ID are an `identity` conflict and nothing is written for that task | `src/app/github-close.mjs`, `src/app/github-projection.mjs` |
| 3.8 | Projection runs inside the workspace tick lock (`WORKSPACE_LOCK`, exported from `tick.mjs`); a held lock returns contention. Issues of another namespace are never matched or written. A repository whose `activeMachine` is another machine is preview-only and refused before any write | `src/app/github-projection.mjs`, `src/app/tick.mjs` |
| 3.9 | Title, managed body section, managed labels and blocked-by edges compare current, last applied (marker v2 baseline; SQLite receipt for edges on older markers) and desired. A field changed on GitHub is a conflict: left unchanged, baseline kept, leaf not ready; other fields still update. Project fields are never read as conflicts. `github.conflict.resolve` (`desired` reapplies once; `github` keeps GitHub's value until the design changes the field). Conflicts show in `conflicts.view` as `github-conflict` | `src/app/github-projection.mjs`, `src/app/operations.mjs`, `src/app/safety.mjs`, `src/app/page-views.mjs` |

## Not done here

- `github.conflict.resolve` is not wired into the Conflicts view's buttons or the app operation list yet.
- A sub-issue link a person removed is re-added only when missing on the parent; stale links are not removed.
- A conflicted issue whose managed label was removed is found again only through the local issue link, not by a fresh workspace's label search.
