# Phase 3: re-approval keeps unchanged tasks ready

Date: 2026-11-12. Code commit: c7c2f2d. Source finding: proof P20
(`docs/evidence/p20-local-and-github.md`, receipt 93edbaa), "Seen, not part
of P20".

## Finding

Re-approving a plan after one entry changed set `needsReview` on every task
of the plan. The next GitHub apply removed the ready label from the
unchanged tasks, and Conflicts listed them as "Task needs review". Cause:
`approvePlan` in `src/app/plans.mjs` ran
`Object.assign(existing, design, { needsReview: true })` for every existing
task of the plan.

## What the spec says

The spec is silent. Searched `requirements.md` and `design.md` in
`<plans repo>/.kiro/specs/assess-avoozls-future-as-a/` for re-approval,
needsReview, approval pin, plan change, amendment, R28, R30 and §6.1–§6.3.
No clause says what happens to an unchanged task when its plan is approved
again. The nearest clauses:

- R4.8: no task becomes executable until a person approves the exact graph.
- §6.1 step 6: approval is the reviewed commit, pinned with the policy
  commit and compiler digest.
- R29.15: a Release change drafts a manifest change for review.

None of these require re-reviewing unchanged entries. Per the brief, the
default is changed-only review, which matches fully automatic delivery.

**Spec gap:** the spec should state that re-approval re-reviews only tasks
whose entry or incoming edges changed. Not edited here; the plan repo is
owned by the conductor.

## Behavior now

| Moment | Changed task | Unchanged task |
|---|---|---|
| Draft saved (`writeRevision`) | needs review | needs review (held) |
| Re-approved (`approvePlan`) | needs review | state before the draft |
| Next apply | ready label removed | ready label kept |

- A task is "changed" when any of its reviewed fields (title, summary,
  acceptance, nextAction, epic, track, tags, resources, projectId, kind,
  route, completion, repository, checks, milestone, iteration, authority),
  its source text hash, or its incoming plan edges differ. Line numbers are
  ignored, since editing another entry shifts them.
- The draft still holds every task of the plan until approval, as before.
  `writeRevision` records the tasks it held in `plan.reviewHeld`.
- On approval an unchanged task is released only if this draft held it. A
  task that needed review for another reason keeps needing review.

## Checks

- New test `re-approval marks only the changed entry for review`
  (`src/app/test/spec-plans.test.mjs`): changes only the manifest summary of
  `1.2`, saves, approves; `1` and `1.1` end with `needsReview: false` and
  `1.1` stays in `ready:true`; `1.2` needs review. It fails on the old code.
- `npm test`: 765 of 765 passed.
- `git diff --check`: clean.
- Fake GitHub only. Projection's ready set is `queryTasks(... "ready:true")`
  (`src/app/github-projection.mjs`), so the ready label follows this flag.
  Not run against a real repository; nupp-lang was not touched.
