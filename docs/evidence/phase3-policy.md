# Phase 3 policy and intake: tasks 3.1, 3.2, 3.3, 3.4, 3.14

Recorded 2026-11-12 on branch `kirocrew-native`, code commit `9054021`.

## What changed

- **3.1** Intake, projection and dispatch accept public repositories. The
  private-only refusals in `github-sync.mjs`, `github-intake.mjs` and the
  intake paths in `operations.mjs` are gone. `requirePrivateRepository`
  stays only for the private planning workspace repository.
- **3.2** `src/app/github-policy.mjs` validates the `github` block of
  `.avoozl.json` per design §4.4: `mode`, `planningRepository`,
  `defaultAuthority`, `project` (`fields`, `statusValues`), `epicIssueType`,
  and `repositories` with `rules`, actors, `managedLabels`, `priority`,
  `baseBranch`, `coder`. `repository-settings.mjs` runs it on every reload.
  `src/avoozl-config.schema.json` describes the same shape. No label name is
  built in. A registered repository the policy does not name keeps its one
  ready label as a single `deliver` rule.
- **3.3** `matchingRules` and `evaluateRules` check `labelsAll`, `labelsAny`,
  `labelsNone`, assignee, author, and the actor of the newest event that made
  the rule true. `syncGitHubIssues` uses them. An issue matched only by a
  disallowed actor lands in `ignored`: no receipt, no task, no GitHub write.
- **3.4** Every matched rule freezes a snapshot (`snapshotHash`). A body edit
  under the same trigger event quarantines the issue on every later sync and
  keeps the task's planned content. A new trigger event, a fresh `resume`
  rule match, or explicit confirmation lifts it. `pause` and `quarantine`
  rules stop dispatch.
- **3.14** `github.mode` validation; `coder: issue-radar` refused in
  plans-repo mode; a `baseBranch` other than the repository's default branch
  is refused at sync; only `todo`, `inProgress`, `done`, `deferred` in
  `statusValues`. With a mode set, plan approval marks new tasks
  `authority: github`. They read as pending projection (`pendingProjection`
  in `src/work-model.mjs`), do not dispatch, and show "pending projection" in
  the Graph view. `authority: local` on a manifest entry is accepted and never
  projected; `authority: github` there is still refused.

## Files

`src/app/github-policy.mjs` (new), `src/app/test/github-policy.test.mjs`
(new), `src/app/github-sync.mjs`, `src/app/github-intake.mjs`,
`src/app/operations.mjs`, `src/app/plans.mjs`, `src/app/delivery.mjs`,
`src/app/repository-settings.mjs`, `src/work-model.mjs`,
`src/avoozl-config.schema.json`, `kirocrew-app/ui/src/GraphView.tsx`,
`kirocrew-app/ui/dist/index.mjs`, `src/app/test/github.test.mjs`,
`src/app/test/work-model.test.mjs`.

## Checks

- `npm test`: 693 of 693 passed (typecheck and build included).
- `kirocrew-app/ui` tests: 12 of 12 passed.
- `git diff --check`: clean.
- All GitHub calls in the tests go to fake clients in temp workspaces.

## Not done here

- The Project field type check against GitHub (§4.4, Requirement 29) needs
  Projects API calls; it belongs with 3.13 and 3.15.
- `respond` and `plan` matches are recorded (`matched`) but start nothing;
  Phase 4 builds those loops.
- The GitHub Queue's `labelBehaviors` stay until the Queue is deleted in 5.5.
- No default rule ships (R10.3). R27.1's default author-and-assignee rule is
  left to the setup wizard (3.18).
