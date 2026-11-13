# Phase 3 Project sync and Wave: task 3.15

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 3.

- Implementation commit: `f2d9b46` ("Sync managed issues to the GitHub Project")
- Base: `kirocrew-native` at `dba0c0d`
- Recorded: 2026-11-12, macOS. Tests use temporary workspaces and a fake GitHub.
  The only live GitHub calls were read-only GETs and one GraphQL query against
  `nupp-lang` Project #2, to check response shapes.

## Checks

| Check | Result |
|---|---|
| `npm test` at `f2d9b46` | exit 0; 717 tests, 717 pass, 0 fail |
| New tests | `src/app/test/github-project.test.mjs`, 9 tests |
| `kirocrew-app/ui` tests | 12 of 12 pass |
| `git diff --check` | clean |

`npm test` rebuilds `canvas-app/extension.js`; that file was restored and is
not part of the change.

## What landed

| Rule (§6.7, R29, R33) | Where | Test |
|---|---|---|
| Add each managed github task's issue to the configured Project; plans-repo mode refuses non-planning items (`assertPlanningProjectItem`) | `syncProject` in `src/app/github-project.mjs` | "sync adds items…" |
| Release from the manifest `milestone` when Avoozl first writes it; a parent takes the latest of its children by Release option order | same | same |
| Release rewritten only when the field still holds Avoozl's last value (`applied.Release`) and the approved manifest moved the task | same | "a person's Release is kept…" |
| A Release value Avoozl did not write is kept, drives the parent rule, and records a draft (`releaseDraft`: spec key, from, to) shown in Delivery; an approved manifest that agrees closes it | same, `src/app/page-views.mjs` | same |
| Wave = 1 + highest wave of `requires`/`sequence` blockers, `supports` ignored, independent of done state; one exported `computeWaves` | `computeWaves` | "Wave is 1 plus…" (the P16 graph: a1 1, b1 1, a2 2, b2 3, b3 4; after the edge removal a2 1, b2 2, b3 3) |
| Wave written only on change; a hand edit is written back with a Kiro Crew notification; Avoozl's own recompute notifies nobody | `syncProject` | "a Wave edit is written back…" |
| Iteration only when `fields.iteration` names a field and the manifest names an `iteration`; a person's value is kept | same | "sync adds items…" |
| Status is never written | same | every `updateProjectItem` call checked for the Status field ID |
| `applied.project` (`Release`, `Wave`, `Iteration`) written to the issue marker when it changes; the stored body hashes follow so 3.9 does not see a person's edit | `writeMarker` | "sync adds items…" |
| A second pass writes nothing: no GitHub call that writes, no SQLite revision, no receipt change | `syncProject` | same |
| Deferred by an allowed actor (`actorAllowed` from `github-policy.mjs`, the leaf's code repository in plans-repo mode) pauses: no dispatch (`readyLeaves`, `startAuthorizedIssue`), no ready label at projection, running sessions untouched, one owner notification | `pausedTaskIds`, `src/app/delivery.mjs`, `src/app/github-sync.mjs`, `src/app/github-projection.mjs` | "Deferred by an allowed actor…" |
| Leaving Deferred by an allowed actor resumes and writes nothing; the person's column stays | `syncProject` | same |
| Deferred in or out by a disallowed, automation, or unreadable actor is ignored as an order, not reverted, and shown in Delivery | same, `projectNotes` in `page-views.mjs`, `DeliveryView.tsx` | same |
| Any other Status is left alone; a mismatch with Avoozl's state shows in Delivery | `mismatch` on the receipt | same |
| Without the `project` scope (classic token scope header, or the Project read fails) sync reports `unavailable` with `gh auth refresh -s project`; projection still works | `syncProject`, `withProjectSync` in `operations.mjs` | "without the project scope…" |
| The tick runs Project sync after completion and before dispatch, cron ticks only, under the workspace lock; the result is in the tick result and `tick-health.json` | `projectStep` in `src/app/tick.mjs` | "the tick runs Project sync…" |
| Projection runs the same sync after it lands its issues, under the same lock; a busy lock reports `locked` and the next tick syncs | `withProjectSync` in `operations.mjs` | full suite |

New GitHub client calls in `src/app/github.mjs`: `projectV2` (organization,
then user), `projectFields`, `projectItems` (cursor pages from the Link
header), `addProjectItem`, `updateProjectItem`, `projectStatusChanges`
(GraphQL). Test: "the client finds a user Project…".

The manifest accepts `milestone` and `iteration` text on each task entry
(`validateProposal`), and approval copies them onto the task.

## Live read-only findings (2026-11-12, `nupp-lang` Project #2)

- REST `GET /orgs/{org}/projectsV2/{n}/items?fields=…` returns each field as
  `{id, name, data_type, value}`; a single-select value is
  `{id, name: {raw}}`. Pages use `after` in the Link header. **Verified.**
- REST issue timeline `project_v2_item_status_changed` events carry the actor
  but not the new status or the Project. GraphQL
  `ProjectV2ItemStatusChangedEvent` carries `actor`, `status`,
  `previousStatus`, and `project { id }`; the automation's login there is
  `github-project-automation`. **Verified**, so the Deferred actor is read
  from GraphQL (the P16 question "which writer source is readable": the
  timeline event).
- The number-field value shape was not seen live (the Project has no Wave
  field yet). The reader accepts a number or `{raw}`. **Inferred** until P16.

## Not done here

- The Release draft is a record shown in Delivery, not a file change to
  `avoozl/manifest.json`; turning it into a reviewable manifest edit belongs
  with the Plans view.
- Missing Release or Iteration options are reported, not created: the
  policy has no setting that allows creating them.
- Linked-branch creation for GitHub leaves does not exist yet; when it lands
  it must skip `pausedTaskIds`.
- Settings shows nothing yet; `projectSyncStatus(store)` and the tick health
  file hold the status for 3.13.
- Wave edits notify on the `decision` channel, the closest of the two app
  channels.
