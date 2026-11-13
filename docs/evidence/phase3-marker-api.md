# Phase 3 marker v2, GitHub graph API, and plans-repo leak rules: tasks 3.5, 3.6, 3.17

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 3.

- Implementation commit: `22ae436` ("Add marker v2, GitHub graph endpoints, and plans-repo leak rules")
- Base: `kirocrew-native` at `88570d3`
- Recorded: 2026-11-12, macOS. Tests use temporary workspaces and fake GitHub; no live GitHub calls.

## Checks

| Check | Result |
|---|---|
| `npm test` at `22ae436` | exit 0; 686 tests, 686 pass, 0 fail |
| New tests | `github-marker.test.mjs` 6, `github-client-graph.test.mjs` 4, `github.test.mjs` 4 more (14 total) |
| `git diff --check` | clean |

`npm test` rebuilds `canvas-app/extension.js`; that file was restored and is not part of the change.

## What landed

| Task | Change | Files |
|---|---|---|
| 3.5 | Marker version 2 (§3.4): `version`, `taskId`, `namespace`, `kind`, `parent`, `source` (`commit` 40-hex or null, `manifest` sha256), optional `compiler`, `edges` (`conditions`, `supports`), `applied` (`title`/`body` hashes, `labels`, `blockers` node IDs, `project`), `order` (`actor`, `reason` COMPLETED or NOT_PLANNED, `closedAt`). Strict field shapes; any string with a path, a credential (`secretReason` reused from workspace publication), or the planning repository's `owner/name` is refused. `withOrder` / `withoutOrder` for 3.11. Version 1 markers stay readable | `src/app/github-marker.mjs` |
| 3.5 | `avoozl init` writes `"namespace": "avz_" + 16 base32 chars` (80 random bits) to `.avoozl.json`; the schema accepts it | `src/app/workspace.mjs`, `src/avoozl-config.schema.json` |
| 3.5 | Projection writes v2 markers, matches issues by namespace and task ID (v1 still by plan ID), and after the re-read records `applied.labels` and `applied.blockers`. Without a namespace it refuses with a generated value to add | `src/app/github-sync.mjs`, `src/app/operations.mjs` |
| 3.6 | REST: `listSubIssues`, `removeSubIssue`, `parentIssue`, `listIssueBlocking`, `listIssueTypes`, `createIssueType`, `setIssueType`. GraphQL: `createLinkedBranch`, `issueLinks` (`linkedBranches`, open `blockedBy` count from `issueDependenciesSummary`). GraphQL field names checked against live schema introspection | `src/app/github.mjs` |
| 3.6 | Projection links a task under its `parent` as a sub-issue, across repositories; adds only missing links and re-reads to verify | `src/app/github-sync.mjs` |
| 3.17 | Plans-repo mode (`github.mode`, `github.planningRepository` in `.avoozl.json`): markers are screened for the planning repository name; issues, dependencies, and sub-issue links outside the planning repository are refused; `assertPlanningProjectItem` refuses code issues and pull requests for the Project (for 3.15) | `src/app/github-marker.mjs`, `src/app/github-sync.mjs` |

## Not done here

- Sub-issue links a person removed are not re-added on drift detection, and stale ones are not removed (3.7, 3.9).
- Epic issue type is not yet set during projection (3.7); the endpoints exist.
- Closed-issue reuse and `order` wiring are left to 3.7 and 3.11.
