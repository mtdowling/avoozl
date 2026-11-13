# Phase 3 rebuild from GitHub: task 3.10

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 3.

- Implementation commit: `14b477f` ("Rebuild GitHub tasks from markers, dependencies, labels and the Project")
- Base: `kirocrew-native` at `dc39267` (after 3.15 Project sync and 3.13 Settings landed)
- Recorded: 2026-11-12, macOS. Tests use temporary workspaces and a fake
  GitHub. No live GitHub call was made.

## Checks

| Check | Result |
|---|---|
| `npm test` at `14b477f` | exit 0; 742 tests, 742 pass, 0 fail |
| New tests | `src/app/test/github-rebuild.test.mjs`, 3 tests |
| `git diff --check` | clean |

`npm test` rebuilds `canvas-app/extension.js`; that file was restored and is
not part of the change.

## What landed

| Surface | Name |
|---|---|
| Operation (one write path) | `github.rebuild` `{repository?}` in `src/app/operations.mjs`, classified `execute` in `src/app/safety.mjs` |
| CLI | `avoozl rebuild [--repository OWNER/REPO]` |
| MCP | `plans_rebuild` |
| Module | `src/app/github-rebuild.mjs` (`rebuildFromGitHub`, `parseManagedSection`) |

Rebuild takes the workspace tick lock, reads GitHub only, and writes SQLite in
one transaction.

| Restored | From |
|---|---|
| Task ID, kind, namespace match | marker v2 (`taskId`, `kind`, `namespace`); other namespaces and v1 markers are ignored |
| Title | issue title |
| Plan ID, summary, acceptance | managed section (`projected from approved design \`<plan>\``, body text, `## Acceptance criteria`) |
| Plan hash | marker `source.manifest` |
| Parent | marker `parent`, else the parent issue's sub-issue list |
| `requires` / `sequence` edges | blocked-by dependencies; `requires` when the blocker is in marker `edges.conditions` or the section's `## Dependencies`, else `sequence`; the condition from `edges.conditions` |
| `supports` edges | marker `edges.supports` |
| Readiness | ready label on an open issue (label names from `.avoozl.json` policy, else the registered repository) |
| Release, Iteration | marker `applied.project` (what Avoozl last wrote = the manifest value); a parent's Release only when no child has one |
| Close orders | marker `order` on a closed issue: `githubVerdict` `order` with the issue's verdict key, the complete status, and the `github-order:<task>` receipt |
| Closed parents | `githubClosedAt` from the issue |
| Issue receipts | `github_issues` row per issue, with `managedBlockerIssueIds` |
| Project board | Status, Release, Wave, Iteration read per item through 3.15's `projectV2`, `projectFields`, `projectItems`, and `projectFieldValue`; a board Wave that differs from the rebuilt edges' `computeWaves` is a note (a lost dependency) |

Rules:

- A row whose ID belongs to a local-authority task is skipped and reported; it
  is never changed. Edges between two rebuilt tasks are replaced; every other
  edge stays.
- Two issues with one task ID are a conflict and nothing is written for that
  task (R14.4).
- A second run writes nothing: no SQLite revision, no receipt change.
- Verdicts other than orders, session bindings, and 3.15's `project-item`
  receipts are left to the next tick, as design §3.3 says.
- The order's verdict key is the issue's own, so the tick keeps the order even
  after the policy stops allowing its actor (§3.4).

## Test evidence

`rebuild restores tasks, edges, epics, fields and orders from GitHub alone`:
projects an epic with four leaves (`requires` at `integrated`, plain
`requires`, `sequence`, `supports`; Releases `one` and `two`) through the real
projection and Project sync, closes one leaf by an allowed actor and runs the
tick (order). Then a new SQLite database with the same configuration plus one
local task, `github.rebuild`, and:

- tasks, edges, parents, milestones, orders, order receipts and issue receipts
  equal the original workspace's; stored body hashes equal GitHub's bodies;
- the local task is byte-for-byte unchanged; GitHub got no write;
- the board read reports Release `two` and Wave `2` for the dependent leaf,
  and no Wave note;
- a second rebuild writes nothing;
- after changing `allowedActors` and running the tick, the whole state
  (including the tick's open verdicts) equals the original, and the order is
  kept. With the verdict key removed this assertion fails.

`rebuild never touches a local task that shares an ID and skips duplicate
issues`: the local row keeps its title, the duplicated task is not created,
and no edge is invented for either.

## Limits

- Issues are found by the managed label, as projection finds them; an issue
  whose label a person removed is missed until the label is back.
- The plan row and design prose are not on GitHub; `github.project` needs the
  plan re-read from its spec folder (3.16) before it projects again.
- In plans-repo mode the leaf's code repository is not on GitHub (the marker
  never names repositories), so a fresh row takes the planning repository's
  project.
- The tick's order write (3.11) does not update the stored body hash; rebuild
  stores the current hash.
