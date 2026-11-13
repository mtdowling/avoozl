# Phase 5: agent host, execution targets, and andon removal

Tasks 5.1 (R1.1, R26.1), 5.6, and 5.7 (R24.5), design §9.

- Base: `kirocrew-native` at `73c8304`, after tasks 5.2 to 5.5 landed.
- Code commit: `c594e39` Remove the agent host, targets and andon; point run tools to Kiro Crew

## What was deleted

Agent host, scheduler, providers, routing, approvals, run capabilities,
external sessions, and telemetry (5.1):

| File                                 | Lines |
| ------------------------------------ | ----: |
| `src/app/manager.mjs`                |  1942 |
| `src/app/providers/openhands.mjs`    |  1263 |
| `src/app/workspace-host-server.mjs`  |  1027 |
| `src/app/workspace-manager.mjs`      |   584 |
| `src/app/providers/claude.mjs`       |   469 |
| `src/app/telemetry.mjs`              |   463 |
| `src/app/providers/codex.mjs`        |   346 |
| `src/app/external-sessions.mjs`      |   330 |
| `src/app/agent-routing.mjs`          |   282 |
| `src/app/batches.mjs`                |   274 |
| `src/app/agent-host.mjs`             |   247 |
| `src/app/host-scheduler.mjs`         |   229 |
| `src/app/run-capabilities.mjs`       |   165 |
| `src/app/remote-manager.mjs`         |   149 |
| `src/app/task-review.mjs`            |   125 |
| `src/app/providers/executor.mjs`     |   104 |
| `src/app/providers/cancellation.mjs` |   102 |
| `src/app/conversation-settings.mjs`  |    85 |
| `src/app/approvals.mjs`              |    25 |
| `src/app/host-main.mjs`              |    22 |

Team coordination, execution targets, target listener, safety, and restart
control (5.6):

| File                            | Lines |
| ------------------------------- | ----: |
| `src/app/safety.mjs`            |  1435 |
| `src/app/team-coordination.mjs` |   951 |
| `src/app/target-listener.mjs`   |   395 |
| `src/app/safety-policy.mjs`     |   314 |
| `src/app/openhands-target.mjs`  |   250 |
| `src/app/restart-control.mjs`   |   169 |
| `src/app/target-heartbeats.mjs` |    43 |
| `src/app/target-auth.mjs`       |    36 |

Source files deleted: 11,826 lines. Test files deleted, each testing only
deleted code: `openhands`, `team-coordination`, `driver`, `safety`,
`workspace-host-server`, `cancellation`, `workspace-manager`,
`external-sessions`, `approvals`, `providers`, `agent-routing`, `telemetry`,
`conversation-settings`, `batches`, `restart-control`, `remote-driver-fallback`,
`task-review`, `host-scheduler`, and `agent-host-drain` (7,054 lines). Whole
change: 79 files, 992 insertions, 22,867 deletions (1,508 of them in
`package-lock.json`).

Also removed:

- Operations code for runs, Driver, batches, prompt search, review and
  extraction pipelines, models, usage, metrics, concurrency, routing preview,
  OpenHands profiles, andon, restart, targets, jobs, review requests,
  checkpoints, and primary handover (`operations.mjs`, 1,217 lines out).
- `startAuthorizedIssue` in `github-sync.mjs`, which started a provider run.
  `github.sync` still accepts `autoStart` and returns `starts: []`.
- CLI: `target pair`, `target serve`, `host`, the machine-host `serve`, and the
  `andon` subcommands. `avoozl andon` now prints where pause and resume went.
- npm dependencies `@anthropic-ai/claude-agent-sdk` and
  `@openhands/typescript-client` (the Claude and OpenHands provider SDKs).
- The README routing and Driver paragraphs, the `host drain` steps, and the
  agent host lines in `AGENTS.md` and the exported workflow skill.

## Pause and resume moved into rule actions

The andon gate stopped runs Avoozl owned. Kiro Crew owns sessions now, so the
gate had nothing left to stop. Pause and resume already exist as repository
rule actions in `.avoozl.json` (R11.3, design §4.4), and `github-sync.mjs`
applies them: a `pause` rule match marks the issue `paused`, and a `resume`
match confirms it again. A card moved to the Deferred column is also a pause
(`pausedTaskIds` in `github-project.mjs`), which holds dispatch in
`delivery.mjs` and `github-sync.mjs`. The `plans_andon_*` tools now answer
with that pointer. Old `safety_incidents` rows stay readable and are still
published to the planning repository as history; an incoming
`incidents/andon-*.json` file is not imported.

## What was kept on purpose

- `src/app/host-config.mjs`. §9 lists it under the agent host, but its
  `WorkspaceRegistry` and `loadHostConfig` are the machine workspace registry
  the app backend (`workspaces.list`, `workspaces.add`, `workspaces.init`), the
  stdio MCP server, the packaged launcher, and `avoozl workspace` use. Only the
  registry is left in it.
- `conversations.autoArchiveCompleted` in `.avoozl.json`, now read by
  `repository-settings.mjs`. Accepting a task still archives the task and its
  finished runs. `conversations.driver` and `conversations.routing` still load
  and are ignored. `conversations.settings.get` and `.update` handle only that
  key.
- The old tables (`runs`, `events`, `deliveries`, `requests`,
  `run_capabilities`, `safety_*`, `execution_*`, `team_checkpoints`,
  `review_requests`). Nothing writes them. `run.get`, `run.list`,
  `run.archive`, `run.unarchive`, `run.event`, `run.changes`, `handoff`,
  `search.result`, `task.get` (its `team` block), and `workspace` read them.
- `run.validate` and `integration.merge` on an old run's worktree: they are the
  `git.mjs` validate and integrate path that local delivery also uses.
- `src/app/operation-kinds.mjs` holds the operation classes that
  `safety.mjs` used to define, unchanged, for the app backend's action-level
  authorization.

## Run-era `plans_*` tools (5.7)

All 77 workspace tool names from before the change still list, plus the 11
shared ones (88 tools). `src/app/moved-operations.mjs` maps each moved
operation to one answer, `{moved: true, operation, message, taskId?,
sessions?}`, where `sessions` lists the task's Kiro Crew session bindings and
links. It writes nothing.

| Tools                                                                                                                                              | Now                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `plans_start_run`                                                                                                                                  | Dispatch: `{taskId, repository, agent, role?}` is a `session.request` the tick opens; without them, a pointer |
| `plans_send_message`, `plans_interrupt_run`, `plans_resume_run`, `plans_set_run_approvals`, `plans_answer_request`, `plans_run_context`            | Pointer to the task's Kiro Crew session                                                                       |
| `plans_start_batch`, `plans_control_batch`, `plans_prompt_search`                                                                                  | Pointer to `plans_next`, `plans_claim_task`, or a pause rule                                                  |
| `plans_extract`                                                                                                                                    | Without provider rounds, opens the extraction record as before; with them, a pointer                          |
| `plans_discover_sessions`, `plans_register_session`                                                                                                | Pointer to `plans_bind_session` and `plans_rediscover_sessions`                                               |
| `plans_metrics`, `plans_usage`, `plans_models`                                                                                                     | Pointer: Kiro Crew owns these                                                                                 |
| `plans_targets`, `plans_target_status`, `plans_jobs`, `plans_review_queue`, `plans_checkpoints`, `plans_checkpoint_publish`, `plans_primary_state` | Pointer: removed                                                                                              |
| `plans_andon_*` (5 tools)                                                                                                                          | Pointer to the pause and resume rule actions                                                                  |
| `plans_task_sessions`                                                                                                                              | Past runs, then the task's Kiro Crew sessions (`provider: "kiro-crew"`)                                       |
| `plans_list_runs`, `plans_get_run`, `plans_archive_run`, `plans_unarchive_run`, `plans_handoff`, `plans_validate_run`, `plans_integrate`           | Unchanged, over old runs                                                                                      |

`intent.submit` with `ask` or `run` answers with the dispatch pointer; `task`
and `draft` work as before.

## Checks

| Check                                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (runs `build:kirocrew-app` first)                | 473 of 473 pass. The base had 618 tests; 153 in deleted or trimmed tests covered only deleted code, and 8 are new                                                                                                                                                                                                                                                                                                          |
| `git diff --check`                                          | clean                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `npm run format:check` on changed files                     | clean. Four files the change does not touch were already unformatted on the base                                                                                                                                                                                                                                                                                                                                           |
| New `src/app/test/moved-operations.test.mjs`                | every old `plans_*` name lists; each moved tool answers `moved: true` and writes nothing; `plans_start_run` dispatches with a repository and agent; `intent.submit` run and ask point; extraction with and without rounds; a database holding rows in every old host table opens, reads its history, and answers moved operations, also when the file is read-only (bytes unchanged); every client operation is classified |
| Rewritten on old run rows (`recordedRun` in `fixtures.mjs`) | `integration-concurrency`, `approval-receipts`, `changes`, and `workflow` validate and integrate a run worktree the old host left                                                                                                                                                                                                                                                                                          |
| Kept app path tests, unchanged                              | `kirocrew-runtime`, `kirocrew-app`, `kirocrew-app-package`, `kirocrew-runner`, `app-mcp`, `single-write-path`, `single-write-path-servers`, `delivery`, `verify-integrate`, `plans-repo-delivery`, `single-repo-delivery`, `github-*` (Phase 3 and 4 loops), `page-views`, `store-migration`                                                                                                                               |

A workspace made by the old code (`9f62a7a`, before Phase 5) with
`$TMPDIR/kc-p5-host/make-old-workspace.mjs`: the product-launch example,
one project, one run started, committed, completed, validated and archived
through the old `RunManager`, two run capabilities, one andon incident raised
through `safety.raise`, and one paired execution target. Opened with the new
code by `$TMPDIR/kc-p5-host/check-old-workspace.mjs`:

| Step                                                                         | Result                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Read-only copy (`0444`)                                                      | opens read-only; `run.get` reads the run and its 9 events; `graph.view` shows 8 tasks; `safety.status` answers moved; file bytes unchanged |
| `tools/list`                                                                 | 88 tools                                                                                                                                   |
| `run.get`, `run.list`, `workspace`                                           | the old run, completed and archived                                                                                                        |
| `graph.view`, `delivery.view`, `conflicts.view`                              | 8 tasks, 1 delivery item, 1 conflict                                                                                                       |
| `runner.next`, `workspace.tick`                                              | buckets and tick intents return                                                                                                            |
| `plans_andon_status`, `plans_send_message`, `plans_targets`, `plans_get_run` | moved, moved with the task ID, moved, the old run                                                                                          |
| Old tables                                                                   | `run_capabilities` 2, `safety_incidents` 1, `execution_targets` 1, untouched                                                               |
| `integration.merge` on the old validated run                                 | `integrated`                                                                                                                               |

Not checked: a live Kiro Crew session through the dashboard. The app backend,
stdio MCP server, and packaged launcher are covered by the package tests above.
