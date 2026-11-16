# Task 45.1: Radar leaf audit

Audited source commit: `8972caf5d8056cdc1a9d2342ff5c00bff25435f8`.

Result: **no production module or test deleted**. Every candidate below still
has an active production importer. This completes the audit acceptance approved
in PR #281; it does not complete the remaining Radar removal or proof P55.

## Scope and method

- Inspected tracked JavaScript, TypeScript, and Python under `src/`, `scripts/`,
  and `kirocrew-app/`, excluding tests and generated `bin/` and `dist/` output.
- Resolved relative static imports, re-exports, side-effect imports, and literal
  dynamic imports/require calls to their source files. Extensionless UI imports
  were resolved against `.mjs`, `.js`, `.ts`, `.tsx`, and `.py`.
- Audited all `src/app/radar-*.mjs` files, Radar demo and crew support, the
  provenance/verification modules deferred to 45.2, and the related UI components
  and API modules listed below. Shared modules are included to document why they
  must remain, rather than treating every related file as Radar-only.
- An existing production import is sufficient to retain a module. No test-only
  reference was counted as a production importer. No source change, real
  workspace tick, gateway call, agent session, or Nupp operation was performed
  for this audit.

## Retained backend modules and importers

Paths in this table are relative to `src/app/`, except explicitly prefixed
`scripts/` paths. These are direct source importers, not transitive callers.

| Module | Production importers |
| --- | --- |
| `coder-adapter.mjs` | `github-projection.mjs`, `radar-arm.mjs`, `radar-conflict-fix.mjs`, `radar-merge.mjs` |
| `crew-agent.mjs` | `radar-values.mjs` |
| `demo-radar.mjs` | `demo.mjs` |
| `github-crew.mjs` | `tick.mjs` |
| `github-provenance.mjs` | `demo-radar.mjs`, `radar-arm.mjs`, `radar-conflict-fix.mjs`, `radar-events.mjs`, `radar-provenance.mjs`, `review-draft.mjs`, `verify-issue.mjs` |
| `radar-agents-pr.mjs` | `radar-setup.mjs` |
| `radar-arm.mjs` | `operations.mjs`, `tick.mjs` |
| `radar-claims.mjs` | `approval-label.mjs`, `operations.mjs`, `radar-conflict-fix.mjs`, `radar-events.mjs`, `radar-merge.mjs`, `radar-plan-me.mjs`, `radar-values.mjs`, `review-draft.mjs` |
| `radar-coder-batch.mjs` | `github-projection.mjs`, `operations.mjs` |
| `radar-coder-queue.mjs` | `operations.mjs`, `tick.mjs` |
| `radar-coder-release.mjs` | `github-projection.mjs`, `operations.mjs`, `radar-coder-queue.mjs`, `release-ranking-step.mjs` |
| `radar-conflict-fix.mjs` | `operations.mjs`, `radar-merge.mjs`, `tick.mjs` |
| `radar-crew-prompt.mjs` | `plugin-pack.mjs`, `radar-agents-pr.mjs`, `radar-values.mjs` |
| `radar-crews.mjs` | `operations.mjs` |
| `radar-events.mjs` | `panel-view.mjs`, `radar-flow.mjs`, `trace-done.mjs`, `trace.mjs` |
| `radar-flow.mjs` | `operations.mjs` |
| `radar-handoff.mjs` | `app-backend.mjs`, `operations.mjs`, `radar-crews.mjs` |
| `radar-merge-method.mjs` | `radar-arm.mjs`, `radar-conflict-fix.mjs` |
| `radar-merge-path.mjs` | `operations.mjs`, `radar-arm.mjs`, `radar-conflict-fix.mjs`, `radar-merge.mjs`, `radar-preflight.mjs`, `radar-setup.mjs` |
| `radar-merge.mjs` | `scripts/live-proofs/p5.mjs`, `scripts/live-proofs/tick.mjs`, `integration-head.mjs`, `operations.mjs`, `tick.mjs` |
| `radar-plan-me.mjs` | `operations.mjs`, `tick.mjs`, `untriaged.mjs` |
| `radar-preflight.mjs` | `operations.mjs` |
| `radar-provenance.mjs` | `github-projection.mjs` |
| `radar-retro-rules.mjs` | `operations.mjs`, `verify-issue.mjs` |
| `radar-setup.mjs` | `mirror-setup.mjs`, `operations.mjs` |
| `radar-source.mjs` | `approval-label.mjs`, `github-projection.mjs`, `operations.mjs`, `untriaged.mjs` |
| `radar-values.mjs` | `operations.mjs` |
| `verify-issue.mjs` | `cli.mjs`, `operations.mjs`, `radar-arm.mjs`, `radar-conflict-fix.mjs` |

## Retained UI modules and importers

All paths in this table are relative to `kirocrew-app/ui/src/`.

| Module | Production importers |
| --- | --- |
| `ArmedPulls.tsx` | `DashboardView.tsx` |
| `CoderPicker.tsx` | `SettingsView.tsx` |
| `ConflictFixActions.tsx` | `ConflictsView.tsx` |
| `ConflictsView.tsx` | `TaskDrawer.tsx`, `WaitingView.tsx` |
| `CrewsRulesSettings.tsx` | `SettingsView.tsx` |
| `IntegrationBranches.tsx` | `DashboardView.tsx` |
| `RadarFlightGroups.tsx` | `DashboardView.tsx` |
| `RadarValues.tsx` | `SettingsView.tsx` |
| `ReleaseMode.tsx` | `SettingsView.tsx` |
| `ReleaseQueue.tsx` | `DashboardView.tsx` |
| `SendToRadar.tsx` | `UntriagedView.tsx` |
| `conflicts-api.ts` | `ConflictsView.tsx`, `TaskDrawer.tsx` |
| `radar-flow-api.ts` | `GithubFlow.tsx` |
| `radar-values-api.ts` | `RadarValues.tsx` |
| `release-api.ts` | `ArmedPulls.tsx`, `ConflictsView.tsx`, `IntegrationBranches.tsx`, `Panel.tsx`, `ReleaseMode.tsx`, `ReleaseQueue.tsx`, `ReviewDrafts.tsx`, `TrackerGates.tsx`, `panel-api.ts` |

## Work remaining for 45.2 and 45.4

- `radar-agents-pr.mjs` serves the retained `radar-setup.mjs`; it cannot simply
  be removed while setup calls it. Setup itself serves `operations.mjs` and
  `mirror-setup.mjs`. Preserve the shared GitHub setup behavior.
- `radar-arm.mjs`, `radar-merge.mjs`, `radar-merge-method.mjs`, and
  `radar-merge-path.mjs` supply the PR landing path that the plan retains and
  renames. `integration-head.mjs` also uses the merge helpers.
- `radar-coder-release.mjs` supplies `release-ranking-step.mjs`. Keep release
  ranking while detaching the Radar-specific dispatch path.
- `verify-issue.mjs`, `github-provenance.mjs`, `crew-agent.mjs`, and the Radar
  grant remain for the deferred 45.2 task. Removing the verification/provenance
  gate waits for replacement PR landing proof P52.
- The remaining modules depend on shared operations, tick, projection, approval,
  trace, plugin, demo, Dashboard, Settings, and task views. Detach or replace their
  callers during 45.4, after its prerequisite proofs, then remove obsolete
  modules and their tests. Do not remove tests while their behavior is active.
- Task 45.3 has already removed `remote-coder.mjs`, `relay.mjs`, `router.mjs`,
  and their relay/router agents. This audit leaves SSH remote-runner, Crew Mode,
  compatibility aliases, and historical research/evidence unchanged.

## Validation

- `npm test`: passed; 1,860 tests, 0 failures, 0 skipped. The pretest build
  passed, and generated output had no tracked changes.
- `git diff --check`: passed.
- UI source unchanged; no separate UI test run required.
