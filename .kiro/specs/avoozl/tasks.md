---
repo: avoozl
---
# Tasks: Avoozl

Grouped by phase. Explicit `after` lists and each task's `after` fact govern
execution; phase numbers alone do not impose a dependency. Each phase
ends with its named proofs. Every proof lists setup, action, expected result,
failure meaning, and the next design decision. Requirement numbers are in
brackets; section numbers refer to `design.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces; Avoozl runs the repository's checks; no real workspace data,
credentials, or personal plans in the repository (AGENTS.md).

Person-only tasks. Tasks whose facts say `manual: true` are tasks an agent
should not start: proofs that need scratch organizations, publishing, and
tasks waiting on Kiro Crew. They wait in Needs you for a person.

Each item's `$` fact bullets hold its kind, repository, edges, checks, and
acceptance (design §4.40). A `Built:` line names the commit or pull request
that landed the task.

## Phase 1: App shell inside Kiro Crew

- [x] 1.1 Add `avoozl app-backend`: HTTP on `127.0.0.1` only, health route, every other route requires a valid gateway-signed principal and returns 401 otherwise. [R1, R20.4] (§4.1, §4.7)
  - $done: Add `avoozl app-backend`: HTTP on `127.0.0.1` only, health route, every other route requires a valid gateway-signed principal and returns 401 otherwise.
  - Built: `d22f2b9` (receipt `docs/evidence/phase1-core-runtime.md`, `5202d53`).
- [x] 1.2 Add `avoozl mcp` as the app's stdio MCP server, keeping every `plans_*` tool name. [R24.5] (§4.1)
  - $done: Add `avoozl mcp` as the app's stdio MCP server, keeping every `plans_*` tool name.
  - Built: `d22f2b9` (receipt `docs/evidence/phase1-core-runtime.md`, `5202d53`).
- [x] 1.3 Replace `kirocrew-app/app.json` with the manifest in §4.2: node backend with `signedPrincipal`, `mcpServers`, script cron, notification channels, agents, skill, optional `gh`. [R1, R26.3]
  - $done: Replace `kirocrew-app/app.json` with the manifest in §4.2: node backend with `signedPrincipal`, `mcpServers`, script cron, notification channels, agents, skill, optional `gh`.
  - $after: 1.1, 1.2
  - Built: `e5c0f58` (receipt `docs/evidence/phase1-app-package.md`, `d3ac3d1`).
- [x] 1.4 Ship `crons/tick.py:run` that calls `plans_tick`, opens and messages sessions from the returned intents, and raises `Skip` when there is nothing to do. [R26.2–26.5] (§4.6)
  - $done: Ship `crons/tick.py:run` that calls `plans_tick`, opens and messages sessions from the returned intents, and raises `Skip` when there is nothing to do.
  - Built: `e5c0f58` (receipt `docs/evidence/phase1-app-package.md`, `d3ac3d1`).
- [x] 1.5 Implement `workspace.tick` with the lock, policy load, and an empty intent list; prove two ticks in a row write nothing. [R26.4, R26.5] (§4.5)
  - $done: Implement `workspace.tick` with the lock, policy load, and an empty intent list; prove two ticks in a row write nothing.
  - Built: `d22f2b9` (receipt `docs/evidence/phase1-core-runtime.md`, `5202d53`).
- [x] 1.6 Build the Workspace view: workspace list from the machine catalog, add or initialize workspace, repository registration, tick health. [R3, R20] (§8)
  - $done: Build the Workspace view: workspace list from the machine catalog, add or initialize workspace, repository registration, tick health.
  - Built: `31f14f0` (receipt `docs/evidence/phase1-workspace-view.md`, `40907fe`).
- [x] 1.7 Add `plans_bind_session` and session-title rediscovery (`avoozl:<task-id> …`). [R1.2] (§3.3, §8)
  - $done: Add `plans_bind_session` and session-title rediscovery (`avoozl:<task-id> …`).
  - Built: `d22f2b9` (receipt `docs/evidence/phase1-core-runtime.md`, `5202d53`).

- [x] avoozl-p1 P1 Proof: real Avoozl backend inside Kiro Crew [R1, R20.4]
  - $done: Expected: the page loads data through `useAppApi`; the direct call gets 401; the only Avoozl listener is on `127.0.0.1`.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
  - Setup: clean Kiro Crew profile; install the app from a local build with `kirocrew app install`; grant trust.
  - Action: open the Avoozl page; call a backend route directly on its loopback port without the gateway; list listening sockets.
  - Expected: the page loads data through `useAppApi`; the direct call gets 401; the only Avoozl listener is on `127.0.0.1`.
  - Failure means: the node backend or signed-principal contract does not work for third-party apps.
  - Next decision: if it fails, move the page's API onto the MCP server and decide whether a backend is needed at all.
  - Built: pass, receipt `docs/evidence/proof-p1.md`, `9310ab9`.
- [x] avoozl-p2 P2 Proof: tick script cron opens, messages, and observes sessions [R26, R1.2]
  - $done: Expected: one session titled `avoozl:<task-id>` opens in that folder on the named agent, receives one brief, is bound before the brief is sent, and its closed status is read on the next tick.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
  - Setup: one registered repository with a Kiro Crew folder whose project directory the user set; a stub task that requests one dispatch.
  - Action: let the cron fire twice; close the opened session; let it fire again.
  - Expected: one session titled `avoozl:<task-id>` opens in that folder on the named agent, receives one brief, is bound before the brief is sent, and its closed status is read on the next tick.
  - Failure means: script crons cannot open sessions in folders or cannot call `session_status` (MC-2).
  - Next decision: if status is unreadable, decide between asking Kiro Crew for MC-2 and having workers report liveness through `plans_report` only.
  - Built: pass, receipt `docs/evidence/proof-p2.md`, `dcb8a8a`.
- [x] avoozl-p3 P3 Proof: workspace picker loads real SQLite data [R3.1]
  - $done: Expected: 141 W tasks across 7 epics, 130 edges, and the 3 milestones appear; the source file is unchanged byte for byte.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
  - Setup: a read-only copy of the Nupp database and its `.avoozl.json`.
  - Action: add the copy in the Workspace view; open Graph.
  - Expected: 141 W tasks across 7 epics, 130 edges, and the 3 milestones appear; the source file is unchanged byte for byte.
  - Failure means: the rebased schema or catalog cannot read real data.
  - Next decision: fix migration before any Phase 2 work.
  - Built: pass after one fix, receipt `docs/evidence/proof-p3.md`, `445a519`.

## Phase 2: Local delivery

- [x] 2.1 Extend the work model with `kind`, `authority`, `route`, `completion`, and edge completion conditions [R4.3–4.6, R19.2] (§4.3)
  - $done: Extend the work model with `kind`, `authority`, `route`, `completion`, and edge completion conditions
  - $done: Readiness per §4.3. A row linked to an issue reads as `github`; any other row reads as `local` (§3.2).
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Readiness per §4.3. A row linked to an issue reads as `github`; any other row reads as `local` (§3.2).
  - Built: `0d18b94` (receipt `docs/evidence/phase2-model-validation.md`, `aadf2fc`).
- [x] 2.3 Ship the `avoozl-planner` agent and update the `avoozl` skill for goal capture [R4.1, R30.7] (§5, §6.8)
  - $done: Ship the `avoozl-planner` agent and update the `avoozl` skill for goal capture
  - $done: Drafting one Kiro spec folder (`requirements.md` or `bugfix.md`, `design.md`, `tasks.md` with an ID on every item, `avoozl/manifest.json`), and critique into `avoozl/critique.md` in a second, isolated session.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3, 2.4
  - Drafting one Kiro spec folder (`requirements.md` or `bugfix.md`, `design.md`, `tasks.md` with an ID on every item, `avoozl/manifest.json`), and critique into `avoozl/critique.md` in a second, isolated session.
  - Built: `85f5ea3` (receipt `docs/evidence/phase2-planner.md`, `1aac5b2`); rework `068789d` and `315d8b8` (receipt `docs/evidence/phase2-spec-plans.md`, `61f9c64`).
- [x] 2.4 Extend deterministic validation [R4.5, R4.7, R30.4, R30.5] (§5, §6.8)
  - $done: Extend deterministic validation
  - $done: Leaf boundedness (one repository, acceptance, checks, completion), cycles, unknown references, duplicate IDs. Add a spec-folder reader that turns `tasks.md` plus `avoozl/manifest.json` into the task list `lintPlan` checks, and refuse a missing folder, a missing file, neither or both of `requirements.md` and `bugfix.md`, an item with no ID, a duplicate ID, and a manifest entry with no item or an item with no entry. `extractPlan` stays a read path for migration only.
  - $done: Impact (R30): `lintPlan` and the work-model checks stay; they gain a second input. `extractPlan` keeps parsing old plan files and is called only by migration and legacy reads. Its current callers (`plan.save`, `plan.lint`, `plan.propose`, extraction in `operations.mjs`) move to the spec reader for new plans. `plan.propose` must stop appending fenced blocks to a plan and add a `tasks.md` item and manifest entry instead.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Leaf boundedness (one repository, acceptance, checks, completion), cycles, unknown references, duplicate IDs. Add a spec-folder reader that turns `tasks.md` plus `avoozl/manifest.json` into the task list `lintPlan` checks, and refuse a missing folder, a missing file, neither or both of `requirements.md` and `bugfix.md`, an item with no ID, a duplicate ID, and a manifest entry with no item or an item with no entry. `extractPlan` stays a read path for migration only.
  - Impact (R30): `lintPlan` and the work-model checks stay; they gain a second input. `extractPlan` keeps parsing old plan files and is called only by migration and legacy reads. Its current callers (`plan.save`, `plan.lint`, `plan.propose`, extraction in `operations.mjs`) move to the spec reader for new plans. `plan.propose` must stop appending fenced blocks to a plan and add a `tasks.md` item and manifest entry instead.
  - Built: `0d18b94` (receipt `docs/evidence/phase2-model-validation.md`, `aadf2fc`); spec reader `b79bbdd` (receipt `docs/evidence/phase2-spec-plans.md`, `61f9c64`).
- [x] 2.5 Build the Plans view: Kiro spec folders (feature and bugfix), manifest, critique findings, diagnostics, approve the exact revision (hash of the folder's files), draft-chat launcher. [R4.8, R20, R30] (§8)
  - $done: Build the Plans view: Kiro spec folders (feature and bugfix), manifest, critique findings, diagnostics, approve the exact revision (hash of the folder's files), draft-chat launcher.
  - $done: Impact (R30): `plan.create` and `plan.save` hold one Markdown text per plan today; for spec folders they take the folder's files and one folder hash as `expectedHash`.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Impact (R30): `plan.create` and `plan.save` hold one Markdown text per plan today; for spec folders they take the folder's files and one folder hash as `expectedHash`.
  - Built: `9d9c7d4` (receipt `docs/evidence/phase2-spec-plans.md`, `61f9c64`).
- [x] 2.6 Add `plans_prepare_worktree` (branch `avoozl/<task-id>`, isolated worktree) and `plans_report` (`progress`, `done` with commit SHA, `blocked`, `question`). [R6.6] (§4.6, §5)
  - $done: Add `plans_prepare_worktree` (branch `avoozl/<task-id>`, isolated worktree) and `plans_report` (`progress`, `done` with commit SHA, `blocked`, `question`).
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Built: `4f0732e` (receipt `docs/evidence/phase2-dispatch-recovery.md`, `0307b04`).
- [x] 2.7 Dispatch ready local leaves in the tick by priority and graph order within per-repository and per-workspace limits. [R6.1–6.3, R26.7] (§4.5)
  - $done: Dispatch ready local leaves in the tick by priority and graph order within per-repository and per-workspace limits.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Built: `4f0732e` (receipt `docs/evidence/phase2-dispatch-recovery.md`, `0307b04`).
- [x] 2.8 Ship the `avoozl-verifier` agent; open a verifier session per `done` report; accept only matching SHA and passing declared checks. [R7.1] (§5)
  - $done: Ship the `avoozl-verifier` agent; open a verifier session per `done` report; accept only matching SHA and passing declared checks.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Built: `e5e77ad` (receipt `docs/evidence/phase2-verify-integrate.md`, `7c686da`).
- [x] 2.9 Integrate verified commits with `integrateRun`; support an optional `integrationBranch`; record the integrated commit. [R7.2, R2.2] (§5)
  - $done: Integrate verified commits with `integrateRun`; support an optional `integrationBranch`; record the integrated commit.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Built: `e5e77ad` (receipt `docs/evidence/phase2-verify-integrate.md`, `7c686da`).
- [x] 2.10 Release dependents in the same tick; complete packages and epics from children; keep whole-head acceptance a separate action. [R7.3, R7.4] (§5)
  - $done: Release dependents in the same tick; complete packages and epics from children; keep whole-head acceptance a separate action.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Built: `e5e77ad` (receipt `docs/evidence/phase2-verify-integrate.md`, `7c686da`).
- [x] 2.11 Failure handling: retry with a resume brief on the same worktree up to the bound, nudge quiet sessions, never replace on elapsed time alone, open a decision past the bound. [R8] (§5)
  - $done: Failure handling: retry with a resume brief on the same worktree up to the bound, nudge quiet sessions, never replace on elapsed time alone, open a decision past the bound.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Built: `4f0732e` (receipt `docs/evidence/phase2-dispatch-recovery.md`, `0307b04`).
- [x] 2.12 Decisions and notifications through the app's channels with a link to the session. [R9, R26.10] (§4.2)
  - $done: Decisions and notifications through the app's channels with a link to the session.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Built: `819db47` (receipt `docs/evidence/phase2-runner-notices.md`, `7ace224`).
- [x] 2.13 Build the Graph, Delivery, and Conflicts views for local tasks. [R20, R21] (§8)
  - $done: Build the Graph, Delivery, and Conflicts views for local tasks.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - Built: `92edf4e` (receipt `docs/evidence/phase2-views.md`, `1a2d120`).
- [x] 2.15 Plans table grouped by category [R30.9, R20] (§6.8, §8)
  - $done: Plans table grouped by category
  - $done: One row per plan with status, a progress bar (done over total leaves; "no tasks" when there are none), ready, running and needs-you counts, epics, last change, and Open docs, Graph, Delivery, Review, and Plan a change buttons. Category comes only from `category:` in the spec's front-matter; remove the title-based guess.
  - $after: avoozl-p1, avoozl-p2, avoozl-p3
  - One row per plan with status, a progress bar (done over total leaves; "no tasks" when there are none), ready, running and needs-you counts, epics, last change, and Open docs, Graph, Delivery, Review, and Plan a change buttons. Category comes only from `category:` in the spec's front-matter; remove the title-based guess.
  - Built: `3c6ca43` and `bf2cc01`; npm test 606 of 606 pass.

- [x] avoozl-p4 P4 Proof: one local parent decomposes into dependent leaves [R4]
  - $done: Expected: one Kiro spec folder that passes validation; one epic and at least three leaves with stable IDs, `requires` edges loader → validator → flag, a critique record from a separate session, validation passing; the second and third ticks write nothing until something changes.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.15
  - Setup: an empty workspace and a small sample repository with a test command.
  - Action: in Kiro Crew chat, ask Avoozl to plan "add a config file loader, a validator that uses it, and a CLI flag that uses both"; approve the reviewed graph; run the tick three times.
  - Expected: one Kiro spec folder that passes validation; one epic and at least three leaves with stable IDs, `requires` edges loader → validator → flag, a critique record from a separate session, validation passing; the second and third ticks write nothing until something changes.
  - Failure means: planning output is not bounded or the tick is not idempotent.
  - Next decision: tighten the planner brief and validator, or reconsider tick boundaries.
  - Built: pass on the retry, receipt `docs/evidence/proof-p4.md`, `a0b808e`.
- [x] avoozl-p5 P5 Proof: automatic Kiro Crew execution of ready leaves [R6, R7]
  - $done: Expected: only the loader dispatches first; after its verifier passes and it integrates, the validator dispatches, then the flag; every task links to its worker and verifier sessions; the integration branch has three verified commits.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 2.1
  - $after: 2.3
  - $after: 2.4
  - $after: 2.5
  - $after: 2.6
  - $after: 2.7
  - $after: 2.8
  - $after: 2.9
  - $after: 2.10
  - $after: 2.11
  - $after: 2.12
  - $after: 2.13
  - $after: 2.15
  - $after: avoozl-p4
  - Setup: the approved graph from P4; concurrency 2.
  - Action: leave the tick running with no human input.
  - Expected: only the loader dispatches first; after its verifier passes and it integrates, the validator dispatches, then the flag; every task links to its worker and verifier sessions; the integration branch has three verified commits.
  - Failure means: readiness, verification, or release ordering is wrong.
  - Next decision: decide whether verification must move into the worker session to cut latency.
  - Built: pass, receipt `docs/evidence/proof-p5.md`, `6613970`.
- [x] avoozl-p6 P6 Proof: worker failure and recovery [R8]
  - $done: Expected: the first leaf retries once with a resume brief and then succeeds; the closed session marks its leaf failed and retryable; after restart the first tick observes every bound session before any new dispatch; no task loses its ID, edges, or evidence.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.15
  - Setup: a leaf whose first attempt is told to fail its checks; a second leaf running.
  - Action: let the first attempt fail; close the second leaf's session by hand; restart the gateway mid-run.
  - Expected: the first leaf retries once with a resume brief and then succeeds; the closed session marks its leaf failed and retryable; after restart the first tick observes every bound session before any new dispatch; no task loses its ID, edges, or evidence.
  - Failure means: task truth depends on process state.
  - Next decision: move any missing state into SQLite receipts or GitHub.
  - Built: pass, receipt `docs/evidence/proof-p6.md`, `072a9a7`.

## Phase 3: GitHub core

- [x] 3.1 Remove the private-only check; allow public and private repositories. [R10.2]
  - $done: Remove the private-only check; allow public and private repositories.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Built: `9054021` (receipt `docs/evidence/phase3-policy.md`, `a84eb34`).
- [x] 3.2 Implement the `.avoozl.json` repository policy schema and validation in §4.4, replacing single-label intake and label behaviors. [R10, R11] (§4.4)
  - $done: Implement the `.avoozl.json` repository policy schema and validation in §4.4, replacing single-label intake and label behaviors.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Built: `9054021` (receipt `docs/evidence/phase3-policy.md`, `a84eb34`).
- [x] 3.3 Generalize the rule matcher: `labelsAll`, `labelsAny`, `labelsNone`, assignee, author, newest triggering event's actor and permission; ignore and do not write for disallowed actors. [R10.4, R10.5, R11.2]
  - $done: Generalize the rule matcher: `labelsAll`, `labelsAny`, `labelsNone`, assignee, author, newest triggering event's actor and permission; ignore and do not write for disallowed actors.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Built: `9054021` (receipt `docs/evidence/phase3-policy.md`, `a84eb34`).
- [x] 3.4 Keep snapshot freeze and quarantine on body change for every matched rule. [R12.1, R12.2]
  - $done: Keep snapshot freeze and quarantine on body change for every matched rule.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Built: `9054021` (receipt `docs/evidence/phase3-policy.md`, `a84eb34`).
- [x] 3.5 Implement marker version 2 with an opaque namespace ID (generated by `avoozl init`, stored in `.avoozl.json`), hash-only source pins, and `applied` hashes [R10.7] (§3.4)
  - $done: Implement marker version 2 with an opaque namespace ID (generated by `avoozl init`, stored in `.avoozl.json`), hash-only source pins, and `applied` hashes
  - $done: Reject markers containing paths, repository names of the planning workspace, or credential patterns. Add the `order` field (closer, close reason, close time) for a close without code by an allowed actor, removed on reopen.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Reject markers containing paths, repository names of the planning workspace, or credential patterns. Add the `order` field (closer, close reason, close time) for a close without code by an allowed actor, removed on reopen.
  - Built: `22ae436` (receipt `docs/evidence/phase3-marker-api.md`, `0d8ce5f`).
- [x] 3.10 Implement `avoozl rebuild` from GitHub markers, sub-issues, dependencies, labels, and Project fields. (§3.3)
  - $done: Implement `avoozl rebuild` from GitHub markers, sub-issues, dependencies, labels, and Project fields.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Built: `14b477f` (receipt `docs/evidence/phase3-rebuild.md`, `c7af204`); gaps `b043d1a` and `6c2460d` (receipt `docs/evidence/phase3-rebuild-gaps.md`, `c853d2b`).
- [x] 3.13 Settings view for `.avoozl.json` [R11, R20, R28] (§4.4, §8)
  - $done: Settings view for `.avoozl.json`
  - $done: Mode, planning repository, default authority, Project and fields, epic issue type, repository policy, with validation. GitHub objects (labels, Project, fields) are created by the wizard in 3.18, not here.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Mode, planning repository, default authority, Project and fields, epic issue type, repository policy, with validation. GitHub objects (labels, Project, fields) are created by the wizard in 3.18, not here.
  - Built: `40f7f41` and `315ccf0` (receipt `docs/evidence/phase3-settings.md`, `dc39267`).
- [x] 3.16 Read plans only from Kiro spec folders in the mode's repository (planning repository, code repository, or the workspace's planning repository) [R30] (§6.8)
  - $done: Read plans only from Kiro spec folders in the mode's repository (planning repository, code repository, or the workspace's planning repository)
  - $done: Map `tasks.md` IDs to issues; ignore Kiro's task waves and checkbox marks; refuse an approved ID whose item text changed without approval.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Map `tasks.md` IDs to issues; ignore Kiro's task waves and checkbox marks; refuse an approved ID whose item text changed without approval.
  - Built: `7c98d4e` (receipt `docs/evidence/phase3-spec-reading.md`, `88570d3`).
- [x] 3.17 Marker and leak rules for plans-repo mode: the marker never names the planning repository; Avoozl writes links only between planning issues and adds only planning issues to the Project. [R28.7] (§3.4, §6.6)
  - $done: Marker and leak rules for plans-repo mode: the marker never names the planning repository; Avoozl writes links only between planning issues and adds only planning issues to the Project.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Built: `22ae436` (receipt `docs/evidence/phase3-marker-api.md`, `0d8ce5f`).
- [x] 3.18 **Set up GitHub** wizard in Settings (`github.setup`, `avoozl github setup`, `plans_github_setup`), after 3.13–3.15 [R32] (§4.4, §8.2)
  - $done: Set up GitHub wizard in Settings (`github.setup`, `avoozl github setup`, `plans_github_setup`), after 3.13–3.15
  - $done: Check token scopes and show the fix command; choose mode and pick or create the private planning repository; turn on issues; create the `Epic` issue type when allowed; propose the `.avoozl.json` diff for review. One preview of every write, one confirmation, idempotent by name, no delete or rename, per-step permission failures reported while the rest runs; end with the checklist of what only a person can do.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 3.13
  - Check token scopes and show the fix command; choose mode and pick or create the private planning repository; turn on issues; create the `Epic` issue type when allowed; propose the `.avoozl.json` diff for review. One preview of every write, one confirmation, idempotent by name, no delete or rename, per-step permission failures reported while the rest runs; end with the checklist of what only a person can do.
  - Built: `daabf20` and `ff10c5c` (receipt `docs/evidence/phase3-wizard.md`, `9ee39d8`).

- [x] avoozl-p7 P7 Proof: configurable GitHub label intake on a public repository [R10, R11]
  - $done: Expected: only the combinations the rules describe match; the disallowed account's labels cause no match and no write; the edited issue is quarantined; trigger and managed labels never overlap.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 3.1
  - $after: 3.2
  - $after: 3.3
  - $after: 3.4
  - $after: 3.5
  - $after: 3.10
  - $after: 3.13
  - $after: 3.16
  - $after: 3.17
  - $after: 3.18
  - $manual: true
  - Setup: a new public test repository; policy with one `deliver` rule (`labelsAll` two labels, `labelsNone` a pause label, assignee filter) and one `respond` rule; an allowed actor and a second account without permission.
  - Action: apply labels in eight combinations, including from the disallowed account, then edit one matched issue's body.
  - Expected: only the combinations the rules describe match; the disallowed account's labels cause no match and no write; the edited issue is quarantined; trigger and managed labels never overlap.
  - Failure means: the rules engine or actor check is wrong.
  - Next decision: decide whether a GitHub search query form is needed beyond structured rules.
  - Built: pass, receipt `docs/evidence/proof-p7.md`.
- [x] avoozl-p9 P9 Proof: cross-repository dependencies and fresh-workspace recovery [R19]
  - $done: Expected: GitHub shows the cross-repository blocker; only the first leaf is ready; after rebuild every task, edge, status, and managed baseline matches the earlier state and no issue is duplicated.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 3.1
  - $after: 3.2
  - $after: 3.3
  - $after: 3.4
  - $after: 3.5
  - $after: 3.10
  - $after: 3.13
  - $after: 3.16
  - $after: 3.17
  - $after: 3.18
  - Setup: single-repo mode with two repositories, one public and one private; a leaf in the second requires a leaf in the first.
  - Action: apply; then delete the workspace's SQLite file, run `avoozl rebuild`, then the tick, then apply again.
  - Expected: GitHub shows the cross-repository blocker; only the first leaf is ready; after rebuild every task, edge, status, and managed baseline matches the earlier state and no issue is duplicated.
  - Failure means: some truth still lives only in SQLite.
  - Next decision: move that state into the marker or GitHub.
  - Built: pass on the retry, receipt `docs/evidence/p9-cross-repo-rebuild.md`, `d85c379`.
- [x] avoozl-p20 P20 Proof: local and github tasks in one workspace
  - $done: Expected: two issues exist and the local leaf has none and shows "local" in every view; it never appears in a projection preview while marked local; after the plan change it gets one issue, keeps its task ID, and now shows its issue link; no task ever has two writable rows.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 3.1
  - $after: 3.2
  - $after: 3.3
  - $after: 3.4
  - $after: 3.5
  - $after: 3.10
  - $after: 3.13
  - $after: 3.16
  - $after: 3.17
  - $after: 3.18
  - Setup: a workspace with a GitHub mode; an approved plan with three leaves, one marked `authority: local`.
  - Action: apply; run the tick five times; then remove `authority: local` from that entry, approve, and apply.
  - Expected: two issues exist and the local leaf has none and shows "local" in every view; it never appears in a projection preview while marked local; after the plan change it gets one issue, keeps its task ID, and now shows its issue link; no task ever has two writable rows.
  - Failure means: authority defaults or the local-to-github path are wrong.
  - Next decision: decide whether workspace-level `defaultAuthority: local` needs its own proof.
  - Built: pass on the retry, receipt `docs/evidence/p20-local-and-github.md`, `93edbaa`.
- [x] avoozl-p21 P21 Proof: Kiro spec folder validation [R30]
  - $done: Expected: each broken copy is refused with the file and line; the two good specs project, the bugfix spec's unchanged-behavior clauses appear as acceptance; Kiro's waves never change Avoozl's edges.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 3.1
  - $after: 3.2
  - $after: 3.3
  - $after: 3.4
  - $after: 3.5
  - $after: 3.10
  - $after: 3.13
  - $after: 3.16
  - $after: 3.17
  - $after: 3.18
  - Setup: one feature spec and one bugfix spec written by Kiro, plus broken copies: a missing `design.md`; both `requirements.md` and `bugfix.md`; an item with no ID; a duplicate ID; a manifest entry with no item; a renumbered approved item.
  - Action: validate each; approve and project the two good specs.
  - Expected: each broken copy is refused with the file and line; the two good specs project, the bugfix spec's unchanged-behavior clauses appear as acceptance; Kiro's waves never change Avoozl's edges.
  - Failure means: the layout rules are not deterministic or miss a case.
  - Next decision: decide whether IDs need an explicit token beyond Kiro's numbering.
  - Built: pass on the retry, receipt `docs/evidence/p21-spec-validation.md`, `82200b4`.

## Phase 4: Delivery loops

- [x] 4.3 Ship the `avoozl-responder` agent (read-only tools) and `plans_post_reply` with secret and path screening; responding label added and removed by Avoozl. (§4.7)
  - $done: Ship the `avoozl-responder` agent (read-only tools) and `plans_post_reply` with secret and path screening; responding label added and removed by Avoozl.
  - $after: avoozl-p7
  - $after: avoozl-p9
  - $after: avoozl-p20
  - $after: avoozl-p21
  - Built: `dd80c99` (receipt `docs/evidence/phase4-responder.md`, `fec95fc`).
- [x] 4.5 Priority order by configured labels, then graph order, under the concurrency cap. (§4.5)
  - $done: Priority order by configured labels, then graph order, under the concurrency cap.
  - $after: avoozl-p7
  - $after: avoozl-p9
  - $after: avoozl-p20
  - $after: avoozl-p21
  - Built: `d37e395` (receipt `docs/evidence/phase4-crew-labels-priority.md`, `bdb1e83`).
- [x] 4.6 Optional `dependencyText` parsing of `depends on #N`, written back as native edges after approval.
  - $done: Optional `dependencyText` parsing of `depends on #N`, written back as native edges after approval.
  - $after: avoozl-p7
  - $after: avoozl-p9
  - $after: avoozl-p20
  - $after: avoozl-p21
  - Built: `fafda83` (receipt `docs/evidence/phase4-broad-issue.md`, `c708d77`).
- [x] 4.8 Leak screen [R28.7, R28.8] (§6.6)
  - $done: Leak screen
  - $done: Each tick searches candidate pull request titles, bodies, and commit messages for the planning repository's `owner/name`, URL, and `owner/name#`; a hit opens a decision, blocks completion, and asks the worker to edit.
  - $after: avoozl-p7
  - $after: avoozl-p9
  - $after: avoozl-p20
  - $after: avoozl-p21
  - Each tick searches candidate pull request titles, bodies, and commit messages for the planning repository's `owner/name`, URL, and `owner/name#`; a hit opens a decision, blocks completion, and asks the worker to edit.
  - Built: `f44bf0e` (receipt `docs/evidence/phase4-plans-repo-delivery.md`, `bf49f0d`).


## Phase 7: Open-source release

- [x] 7.1 Rewrite README and docs around installing the Kiro Crew app; no host-era instructions. [R24.1] (§13)
  - $done: Rewrite README and docs around installing the Kiro Crew app; no host-era instructions.
  - Built: `52d1ce9` (receipt `docs/evidence/phase7-release-prep.md`, `a356449`).
- [x] 7.2 Ship no default trigger rule; document example policies. [R24.3] (§13)
  - $done: Ship no default trigger rule; document example policies.
  - Built: `d962108` (receipt `docs/evidence/phase7-release-prep.md`, `a356449`).
- [x] 7.3 License audit of bundled third-party code with notices. [R24.4] (§13)
  - $done: License audit of bundled third-party code with notices.
  - Built: `7dac03f` (receipt `docs/evidence/phase7-release-prep.md`, `a356449`).
- [x] 7.4 Secret, private-name, company-internal-tool-name, and absolute-path scans over the tree and history [R24.2, R34.10] (§13)
  - $done: Secret, private-name, company-internal-tool-name, and absolute-path scans over the tree and history
  - $done: Keep specs and research with machine-local paths out of the release or rewrite them; regenerate receipts instead of editing them.
  - Keep specs and research with machine-local paths out of the release or rewrite them; regenerate receipts instead of editing them.
  - Built: `caa64e0` (receipt `docs/evidence/phase7-release-prep.md`, `a356449`).
- [x] 7.5 Verify compatibility surfaces: `plans_*`, `AVOOZL_*`, `AICOMMANDER_*`, `NUPP_WORKSPACE_*`, and the `aicommander` command. [R24.5]
  - $done: Verify compatibility surfaces: `plans_*`, `AVOOZL_*`, `AICOMMANDER_*`, `NUPP_WORKSPACE_*`, and the `aicommander` command.
  - Built: `9051f35` (receipt `docs/evidence/phase7-release-prep.md`, `a356449`).
- [ ] 7.6 Publish the npm package, the app package, and a signed GitHub release. (§13)
  - $done: Publish the npm package, the app package, and a signed GitHub release.
  - $done: The report names what was done and where the result is.
  - $manual: true
  - Publishes packages and a release; spends no code change in this repository.
  - Open: Not done; nothing is published.

- [x] avoozl-p15 P15 Proof: open-source installation on a clean machine [R24]
  - $done: Expected: local delivery completes with no GitHub; GitHub features report unavailable until `gh` or a token exists, then work; no step needs private context.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
  - $manual: true
  - Setup: a fresh machine or user account with Kiro Crew, Node, and Git only; no `gh`.
  - Action: follow the public README to install the app, create a workspace, and run P4 and P5's flow; then install `gh` and run P7 on a public repository.
  - Expected: local delivery completes with no GitHub; GitHub features report unavailable until `gh` or a token exists, then work; no step needs private context.
  - Failure means: the release depends on this machine's setup.
  - Next decision: fix the docs or packaging before publishing.
  - Proved: `docs/evidence/p15-clean-install-2026-11-19.md` (2026-11-19): the packed tarball installed in a clean home with no `gh`, local delivery landed on the remote with a stand-in agent, and GitHub read unavailable until a token was set; a clean home on the owner's Mac, not a fresh machine. README fixes in the same change: loading a spec folder from the CLI, and taking over a spec before it lands.

## Phase 8: Later, only after P1–P25 pass

- [x] 8.6 Plugin loading [R34.1–R34.9, R34.11] (§4.4, §4.7, §4.8)
  - $done: Plugin loading, after 8.1
  - $done: `plugins` entries in `.avoozl.json` and in machine-local settings (`id`, one of `package` or `path`, `contract`, non-secret `config`); validation per §4.4; `avoozl-plugin.json` manifest (`id`, `version`, `contract`, `kinds`, capabilities, `entry`), reserved ids `local` and `github`; Settings **Add plugin**, approve, disable, remove; approval per id, version, and content hash, stored on this machine only, never by the tick or example installation; a warning before saving a `plugins` entry into a public repository's `.avoozl.json`; one Node child process per plugin over stdio, no port, a listening-socket check that stops a plugin that listens; reply schema validation, replies quoted as untrusted data; per-call time limit inside the tick budget; a missing, unapproved, crashed, timed-out, invalid, or wrong-contract plugin parks its tasks as "needs you" and the tick finishes everything else; supported contract versions listed and others refused. Move 8.1's fake route behind the loader.
  - $done: Git sources: an entry with `git`, `ref`, and optional `subdir` (exactly one of `package`, `path`, or `git`); Add and Update resolve `ref` to a full commit, store the pin on this machine, and fetch only that commit shallow into `<plugins>/git/<id>/<commit>/` with the person's git, hooks off, no submodules, no install; approval binds to the commit, version, and hash, and a new commit needs a new approval; refuse credentialed URLs, a `subdir` that escapes, a missing manifest, and unshipped dependencies; the tick never fetches. Settings **Add from git** shows the resolved commit before approval. Tests use local `file://` repositories only. [R34.12–R34.15] (§4.8)
  - $after: avoozl-p1
  - $after: avoozl-p2
  - $after: avoozl-p3
  - $after: avoozl-p4
  - $after: avoozl-p5
  - $after: avoozl-p6
  - $after: avoozl-p7
  - $after: avoozl-p9
  - $after: avoozl-p20
  - $after: avoozl-p21
  - $after: avoozl-p15
  - `plugins` entries in `.avoozl.json` and in machine-local settings (`id`, one of `package` or `path`, `contract`, non-secret `config`); validation per §4.4; `avoozl-plugin.json` manifest (`id`, `version`, `contract`, `kinds`, capabilities, `entry`), reserved ids `local` and `github`; Settings **Add plugin**, approve, disable, remove; approval per id, version, and content hash, stored on this machine only, never by the tick or example installation; a warning before saving a `plugins` entry into a public repository's `.avoozl.json`; one Node child process per plugin over stdio, no port, a listening-socket check that stops a plugin that listens; reply schema validation, replies quoted as untrusted data; per-call time limit inside the tick budget; a missing, unapproved, crashed, timed-out, invalid, or wrong-contract plugin parks its tasks as "needs you" and the tick finishes everything else; supported contract versions listed and others refused. Move 8.1's fake route behind the loader.
  - Git sources: an entry with `git`, `ref`, and optional `subdir` (exactly one of `package`, `path`, or `git`); Add and Update resolve `ref` to a full commit, store the pin on this machine, and fetch only that commit shallow into `<plugins>/git/<id>/<commit>/` with the person's git, hooks off, no submodules, no install; approval binds to the commit, version, and hash, and a new commit needs a new approval; refuse credentialed URLs, a `subdir` that escapes, a missing manifest, and unshipped dependencies; the tick never fetches. Settings **Add from git** shows the resolved commit before approval. Tests use local `file://` repositories only. [R34.12–R34.15] (§4.8)
  - Built: `8662302` and `773b2f2`; git sources `be12bc0` and `91f3b6a`.
- [x] 8.8 Private integration boundary, with 8.6 [R34.10, R34.11, R24.2] (§4.8, §13)
  - $done: Private integration boundary, with 8.6
  - $done: A public guide to writing a route or tracker plugin that uses only the fake plugins as examples; the fake route and fake tracker live under `test/fixtures/plugins/`; extend the 7.4 scan to plugin docs and fixtures so no company-internal tool name lands in the public tree.
  - $after: avoozl-p1
  - $after: avoozl-p2
  - $after: avoozl-p3
  - $after: avoozl-p4
  - $after: avoozl-p5
  - $after: avoozl-p6
  - $after: avoozl-p7
  - $after: avoozl-p9
  - $after: avoozl-p20
  - $after: avoozl-p21
  - $after: avoozl-p15
  - A public guide to writing a route or tracker plugin that uses only the fake plugins as examples; the fake route and fake tracker live under `test/fixtures/plugins/`; extend the 7.4 scan to plugin docs and fixtures so no company-internal tool name lands in the public tree.
  - Built: `e13890b`.
- [x] 8.2 Deferred GitHub features, each behind its own proof: stacked pull requests on an open blocker, Discussions answering, comment-mention steering.
  - $done: Deferred GitHub features, each behind its own proof: stacked pull requests on an open blocker, Discussions answering, comment-mention steering.
  - $after: avoozl-p1
  - $after: avoozl-p2
  - $after: avoozl-p3
  - $after: avoozl-p4
  - $after: avoozl-p5
  - $after: avoozl-p6
  - $after: avoozl-p7
  - $after: avoozl-p9
  - $after: avoozl-p20
  - $after: avoozl-p21
  - $after: avoozl-p15
  - Built: `51622d0` (receipt `docs/evidence/phase8-deferred-github.md`, `13301d4`).
- [x] 8.5 Add MCP App views (`ui://` resources) to `plans_graph`, `plans_preview`, `plans_project_preview`, and `plans_decision`
  - $done: Add MCP App views (`ui://` resources) to `plans_graph`, `plans_preview`, `plans_project_preview`, and `plans_decision`
  - $done: Buttons call the same operations with expected revisions. [R20] (§8.1) Optional: only for small focused views; the app page stays the main view. Proof below.
  - $after: avoozl-p1
  - $after: avoozl-p2
  - $after: avoozl-p3
  - $after: avoozl-p4
  - $after: avoozl-p5
  - $after: avoozl-p6
  - $after: avoozl-p7
  - $after: avoozl-p9
  - $after: avoozl-p20
  - $after: avoozl-p21
  - $after: avoozl-p15
  - $manual: true
  - Buttons call the same operations with expected revisions. [R20] (§8.1) Optional: only for small focused views; the app page stays the main view. Proof below.
  - Built: `src/app/mcp/mcp-views.mjs` (four `ui://avoozl/*` views; Refresh, Project with a plan-hash check, and Settle with the expected revision). There is no Approve button: approval is person-only over MCP. Not run live in a Kiro Crew chat (proof P8b).
- [x] avoozl-p8b P8b Proof: Avoozl views render and act inside chat [R20] (§8.1)
  - $done: Expected: the preview renders in the chat; the first Approve records the exact revision; the second is refused as stale; the chat shows the result.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 8.5, avoozl-p4
  - $manual: true
  - Setup: the Avoozl app installed with its MCP server; the server routed in MCP Management; the P4 draft plan.
  - Action: in an ordinary chat, ask to preview the plan; press Approve in the view; edit the plan in another window and press Approve again.
  - Expected: the preview renders in the chat; the first Approve records the exact revision; the second is refused as stale; the chat shows the result.
  - Failure means: app-shipped servers cannot render views, or view writes bypass revision checks.
  - Next decision: ask users to add the server in Connections, or keep approval in the app page only.
  - Proved: `docs/evidence/p8b-views-in-chat.md` (2026-11-19, live on a throwaway Kiro Crew): the preview and decision views render in an ordinary chat, a Settle from a stale view is refused and writes nothing, and a Settle after Refresh records.

## Phase 9: Review gates

- [x] 9.1 Review roles in policy [R36.1–R36.4, R6.3] (§5.2, F59, F65)
  - $done: Review roles in policy
  - $done: `delivery.model` and `delivery.reviewers` (`id`, `focus`, `agent`, `model`, `distinctFrom` `model` by default or `session`), replaceable per repository; validation per §5.2, including a refused `auto` or equal model for `distinctFrom: model`; `tick.py` passes `model` to `open_session`; `runner.take` takes the worker's model; every binding records the model it was opened on. No new writer limit: per-repository `concurrency: 1` is the one-writer rule, and review sessions do not count against it.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - `delivery.model` and `delivery.reviewers` (`id`, `focus`, `agent`, `model`, `distinctFrom` `model` by default or `session`), replaceable per repository; validation per §5.2, including a refused `auto` or equal model for `distinctFrom: model`; `tick.py` passes `model` to `open_session`; `runner.take` takes the worker's model; every binding records the model it was opened on. No new writer limit: per-repository `concurrency: 1` is the one-writer rule, and review sessions do not count against it.
  - Built: `4b82981`.
- [x] 9.2 Roles on one delivery [R36.2–R36.8, R37.1, R37.2] (§5.2, F56)
  - $done: Roles on one delivery
  - $done: The checks role (today's verifier, id `checks`) and each review role get one session per round on the delivery's commit, all at once; refuse to dispatch a review whose model is unknown or not distinct and open a decision; ship the `avoozl-reviewer` agent (read-only tools, detached worktree at the commit, focus and open findings from the brief, quoted text is data); `plans_report` `done` from a review role takes `verdict`, `findings`, and `closures` and refuses a wrong commit, a pathless finding, `approved` with a defect, and `changes-requested` without one; store verdicts on `verifications` with `role`, `model`, and commit; `verified` only when every role approved the current commit.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - The checks role (today's verifier, id `checks`) and each review role get one session per round on the delivery's commit, all at once; refuse to dispatch a review whose model is unknown or not distinct and open a decision; ship the `avoozl-reviewer` agent (read-only tools, detached worktree at the commit, focus and open findings from the brief, quoted text is data); `plans_report` `done` from a review role takes `verdict`, `findings`, and `closures` and refuses a wrong commit, a pathless finding, `approved` with a defect, and `changes-requested` without one; store verdicts on `verifications` with `role`, `model`, and commit; `verified` only when every role approved the current commit.
  - Built: `4b82981`.
- [x] 9.3 Rework [R36.10, R37.6] (§5.2, F57)
  - $done: Rework
  - $done: A `changes-requested` verdict fails the writer attempt for that commit with its findings as the cause; the retry brief quotes every open finding as data; every role reviews the new commit; roles still running on the old commit finish as history. `plans_retry_delivery` takes `dismiss: [{finding, reason}]` from a person only.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - A `changes-requested` verdict fails the writer attempt for that commit with its findings as the cause; the retry brief quotes every open finding as data; every role reviews the new commit; roles still running on the old commit finish as history. `plans_retry_delivery` takes `dismiss: [{finding, reason}]` from a person only.
  - Built: `4b82981`.
- [x] 9.4 Findings closure [R37.3–R37.5] (§5.2)
  - $done: Findings closure
  - $done: Open findings per role and delivery, referenced `<attempt>:<role>:<id>`; refuse a verdict that leaves one without a closure; check `fixed` and `unchanged` with the task-diff patch-id per path between the two subject commits; a defect closed `unchanged` stays open.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Open findings per role and delivery, referenced `<attempt>:<role>:<id>`; refuse a verdict that leaves one without a closure; check `fixed` and `unchanged` with the task-diff patch-id per path between the two subject commits; a defect closed `unchanged` stays open.
  - Built: `4b82981`.
- [x] 9.5 Not-run checks [R38.1–R38.3] (§5.2, F62)
  - $done: Not-run checks
  - $done: A checks report entry may carry `notRun` with `exitCode: null`; a null code, 126, 127, a not-run entry, or a declared check left out fails the checks session, not the writer attempt, and is retried within `retries`, then opens a decision.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - A checks report entry may carry `notRun` with `exitCode: null`; a null code, 126, 127, a not-run entry, or a declared check left out fails the checks session, not the writer attempt, and is retried within `retries`, then opens a decision.
  - Built: `4b82981`.
- [x] 9.6 Integration waits for the reviewed commit [R36.7–R36.9] (§5.2, F63)
  - $done: Integration waits for the reviewed commit
  - $done: Integrate a `verified` delivery only by fast-forwarding the commit every role approved; when the base moved, rebase in the task's worktree and, if the head changed, open a new round on it instead of merging.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Integrate a `verified` delivery only by fast-forwarding the commit every role approved; when the base moved, rebase in the task's worktree and, if the head changed, open a new round on it instead of merging.
  - Built: `4b82981`.
- [x] 9.8 Supersede by hand [R39] (§5.2, F64)
  - $done: Supersede by hand
  - $done: `task.supersede` (CLI, `plans_supersede_task`, a Delivery view action) per §5.2; status `superseded` (not complete, hidden by default); the ready rule resolves edges through `supersededBy`; plan approval leaves the chain and status alone; refuse cycles and GitHub or plugin authority with 409; no new dispatch for a superseded task, and a running session is left alone.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - `task.supersede` (CLI, `plans_supersede_task`, a Delivery view action) per §5.2; status `superseded` (not complete, hidden by default); the ready rule resolves edges through `supersededBy`; plan approval leaves the chain and status alone; refuse cycles and GitHub or plugin authority with 409; no new dispatch for a superseded task, and a running session is left alone.
  - Built: `c69f0e5`.
- [x] 9.9 Delivery view: per round, each role's verdict, model, subject commit, stale mark, and findings with closure state; links to each session. Graph-specific only; no pull-request or CI view (§8). [R36.12] (§5.2, §8)
  - $done: Delivery view: per round, each role's verdict, model, subject commit, stale mark, and findings with closure state; links to each session. Graph-specific only; no pull-request or CI view.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Built: `87bdd70`.
- [x] 9.10 Optional, later [R36.13] (§5.2)
  - $done: Optional, later, after 3.11
  - $done: For GitHub-route leaves, read pull-request reviews on the head SHA as verdicts from reviewers the repository policy allows (`APPROVED`, `CHANGES_REQUESTED`), stale when the head moves, shown in the Delivery view. Not needed for P27.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - For GitHub-route leaves, read pull-request reviews on the head SHA as verdicts from reviewers the repository policy allows (`APPROVED`, `CHANGES_REQUESTED`), stale when the head moves, shown in the Delivery view. Not needed for P27.
  - Built: `fe043ea`; branch rules `b4c46d7` and `7f24590`.

- [x] avoozl-p27 P27 Proof: review gates with fake writers and reviewers [R36, R37, R38, R39] (§5.2)
  - $done: Expected: (1) `w2` does not start while `w1`'s writer is live; three role sessions open on C1 with three different models; (2) `d1` stays waiting, the attempt fails, and the retry brief quotes F1; (3) the `unchanged` approval is refused in-session; the not-run check fails only the checks session and is retried, and no writer attempt is spent; (4) the rebase produces C3, nothing merges, and all three roles review C3, with F1 still closed; after they approve, C3 fast-forwards and `d1` dispatches; (5) both calls are refused, and `w1` is accepted only from validation recorded at its integrated commit; (6) policy validation refuses `fake-a`, and `auto` opens a decision instead of a review; (7) `d2` waits on `w2b`, not `w2`, `w2` stays `superseded` after re-approval, and its history is intact. Every earlier verdict stays on the delivery.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 9.9
  - Setup: an isolated temporary workspace and sample repository in the test tree; delivery policy with `concurrency: 1`, writer model `fake-a`, and two review roles (`conventions` on `fake-b`, `correctness` on `fake-c`); a test-only fake session driver that plays worker, checks, and reviewer sessions from scripts; an approved spec with leaves `w1 -> d1` and an independent `w2 -> d2`, all in that repository; a declared check `scripts/validate.sh` standing in for that repository's validation script.
  - Action: (1) tick until `w1` reports commit C1; (2) `conventions` approves C1, `correctness` requests changes with defect F1 on `src/a.txt`; (3) the next attempt reports C2 that changes `src/a.txt`; both roles review C2, `correctness` first tries `approved` closing F1 `unchanged`, then closes it `fixed` and approves; the checks role first reports `scripts/validate.sh` as not run, then passes; (4) move the base branch by hand before integration; (5) try `task.update` with a typed `integration` on `d1`, and `task.accept` with typed evidence on `w1`; (6) set a reviewer's model to `fake-a`, and separately to `auto`; (7) supersede `w2` by `w2b`, then re-approve the unchanged plan.
  - Expected: (1) `w2` does not start while `w1`'s writer is live; three role sessions open on C1 with three different models; (2) `d1` stays waiting, the attempt fails, and the retry brief quotes F1; (3) the `unchanged` approval is refused in-session; the not-run check fails only the checks session and is retried, and no writer attempt is spent; (4) the rebase produces C3, nothing merges, and all three roles review C3, with F1 still closed; after they approve, C3 fast-forwards and `d1` dispatches; (5) both calls are refused, and `w1` is accepted only from validation recorded at its integrated commit; (6) policy validation refuses `fake-a`, and `auto` opens a decision instead of a review; (7) `d2` waits on `w2b`, not `w2`, `w2` stays `superseded` after re-approval, and its history is intact. Every earlier verdict stays on the delivery.
  - Failure means: reviews cannot be gates on one delivery without breaking retry, integration, or readiness.
  - Next decision: model reviews as separate graph tasks with integration-free acceptance (the handoff's first design), or drop rebase re-review and gate on the pre-rebase commit.
  - Built: pass, receipt `docs/evidence/phase9-p27-review-gates.md`, `a9f4c24`.

## Phase 10: Content rules

- [x] 10.1 Matcher [R40.2, R40.4, R40.11, R40.13] (§4.9, F67, F68)
  - $done: Matcher
  - $done: New `src/app/content/content-rules.mjs` with the terms parser moved from `scripts/release-scan.mjs` (`rule: regex`, `#` comments, per line, ignoring case), the decoder moved from `github-plans-repo.mjs`, and `check({boundary, repository, target, text, added})` returning `{set, rule, boundary, target, line}` and never the matched text; run each check in a `worker_threads` worker with a time limit (default 2 seconds) and treat a timeout or a rule that does not compile as unavailable; the release scan imports the parser and matcher, keeps its public rules and terms file location, and prints only rule id, file, and line for private-term findings.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - New `src/app/content/content-rules.mjs` with the terms parser moved from `scripts/release-scan.mjs` (`rule: regex`, `#` comments, per line, ignoring case), the decoder moved from `github-plans-repo.mjs`, and `check({boundary, repository, target, text, added})` returning `{set, rule, boundary, target, line}` and never the matched text; run each check in a `worker_threads` worker with a time limit (default 2 seconds) and treat a timeout or a rule that does not compile as unavailable; the release scan imports the parser and matcher, keeps its public rules and terms file location, and prints only rule id, file, and line for private-term findings.
  - Built: in the publish commit `ac3825f` (`src/app/content/content-rules.mjs`; `src/app/content/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.2 Policy [R40.1, R40.2, R40.10] (§4.4, §4.9, F74)
  - $done: Policy
  - $done: `contentRules.sets` in `.avoozl.json` (`id`, `action` `block` by default or `report`, optional `boundaries` from `plan`, `github`, `brief`, `diff`, optional `repositories`, optional `plugin`) with validation per §4.4 and §4.9; terms from machine-local `contentRules.terms.<id>`, else `.avoozl/local/content-rules/<id>.txt`; refuse a terms file Git tracks or would track (`git ls-files`, `git check-ignore`); an unavailable set fails closed at every boundary it covers and opens one decision naming the set and the reason, and the tick finishes the rest; Settings lists each set with its source kind and availability, never its rules.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - `contentRules.sets` in `.avoozl.json` (`id`, `action` `block` by default or `report`, optional `boundaries` from `plan`, `github`, `brief`, `diff`, optional `repositories`, optional `plugin`) with validation per §4.4 and §4.9; terms from machine-local `contentRules.terms.<id>`, else `.avoozl/local/content-rules/<id>.txt`; refuse a terms file Git tracks or would track (`git ls-files`, `git check-ignore`); an unavailable set fails closed at every boundary it covers and opens one decision naming the set and the reason, and the tick finishes the rest; Settings lists each set with its source kind and availability, never its rules.
  - Built: in the publish commit `ac3825f` (`src/app/content/content-rules.mjs`; `src/app/content/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.3 Built-in sets [R40.12] (§4.9, F68–F71)
  - $done: Built-in sets
  - $done: Put `findPlanningLeak` (`builtin:planning-repository`), `screenReply` (`builtin:reply-safety`), and `secretReason` with `validateMarker`'s path and planning-repository checks (`builtin:published-secrets`) behind `check`, at today's boundaries with today's patterns, decoding, and refusal messages; configuration cannot turn them off; every existing test for these screens passes unchanged.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - Put `findPlanningLeak` (`builtin:planning-repository`), `screenReply` (`builtin:reply-safety`), and `secretReason` with `validateMarker`'s path and planning-repository checks (`builtin:published-secrets`) behind `check`, at today's boundaries with today's patterns, decoding, and refusal messages; configuration cannot turn them off; every existing test for these screens passes unchanged.
  - Built: in the publish commit `ac3825f` (`src/app/content/content-rules.mjs`; `src/app/content/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.4 Local boundaries [R40.3, R40.5] (§4.9)
  - $done: Local boundaries
  - $done: `plan.create`, `plan.save`, and `plan.propose` refuse a planner draft in-call with set, rule, file, and line and record the refusal; `lintSpec` adds `content.match` diagnostics over every spec file and `avoozl/manifest.json` so approval is refused and a decision opens; worker, verifier, and reviewer briefs are checked before they are sent; `plans_report` `done` refuses a commit whose added lines match; `plans_prepare_worktree` installs a `pre-push` hook (`avoozl content check --push`) in that worktree only, not the main checkout's hooks (settle the Inferred note in §4.9); local integration holds a matching diff with a decision; lines already in the base never match.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - `plan.create`, `plan.save`, and `plan.propose` refuse a planner draft in-call with set, rule, file, and line and record the refusal; `lintSpec` adds `content.match` diagnostics over every spec file and `avoozl/manifest.json` so approval is refused and a decision opens; worker, verifier, and reviewer briefs are checked before they are sent; `plans_report` `done` refuses a commit whose added lines match; `plans_prepare_worktree` installs a `pre-push` hook (`avoozl content check --push`) in that worktree only, not the main checkout's hooks (settle the Inferred note in §4.9); local integration holds a matching diff with a decision; lines already in the base never match.
  - Built: in the publish commit `ac3825f` (`src/app/content/content-rules.mjs`; `src/app/content/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.5 Decisions and allow once [R40.5–R40.8] (§4.9)
  - $done: Decisions and allow once
  - $done: One decision per set and target; **Allow once** with a reason from the app page or CLI only (the MCP tools sessions call get 403; the tick and example installation cannot), recording who, why, when, rule, target, and the SHA-256 of the exact content, used up by one write; the decision view reads the matched line again from its source on demand and stores nothing; `report` sets write and record the finding in the Delivery view with one Kiro Crew notification; a test greps SQLite, events, decisions, and notification payloads for each fake term, plain and encoded, and finds none.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - One decision per set and target; **Allow once** with a reason from the app page or CLI only (the MCP tools sessions call get 403; the tick and example installation cannot), recording who, why, when, rule, target, and the SHA-256 of the exact content, used up by one write; the decision view reads the matched line again from its source on demand and stores nothing; `report` sets write and record the finding in the Delivery view with one Kiro Crew notification; a test greps SQLite, events, decisions, and notification payloads for each fake term, plain and encoded, and finds none.
  - Built: in the publish commit `ac3825f` (`src/app/content/content-rules.mjs`; `src/app/content/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.6 GitHub boundaries, after 4.3, 4.8 [R40.3, R40.5] (§4.9)
  - $done: GitHub boundaries, after 3.7, 3.15, 4.3, 4.4, 4.8
  - $done: Issue titles and whole bodies before each create or update in projection; Release and Iteration values before each Project field write; every comment Avoozl writes (breakdown previews, published summaries, steering replies) and responder replies; candidate pull request titles, bodies, commit messages, and added diff lines each tick, which block completion and open a decision as 4.8 does. A match writes nothing for that issue, item, or comment and the tick goes on.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 4.3, 4.8
  - Issue titles and whole bodies before each create or update in projection; Release and Iteration values before each Project field write; every comment Avoozl writes (breakdown previews, published summaries, steering replies) and responder replies; candidate pull request titles, bodies, commit messages, and added diff lines each tick, which block completion and open a decision as 4.8 does. A match writes nothing for that issue, item, or comment and the tick goes on.
  - Built: in the publish commit `ac3825f` (`src/app/content/content-rules.mjs`; `src/app/content/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.7 Rules plugins, after 8.6 [R40.9, R40.14, R34] (§4.8, §4.9, F73)
  - $done: Rules plugins, after 8.6
  - $done: Plugin kind `rules` beside `route` and `tracker`; contract call `ruleSets()` returning `[{id, version, rules: [{id, pattern}]}]`, schema-checked; the usual consent, child process, and time limit; rules kept in memory only, never in SQLite, receipts, or Git, and findings record the set `version`; a fake rules plugin under `test/fixtures/plugins/`, covered by the 7.4 and 8.8 scans.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 8.6
  - Plugin kind `rules` beside `route` and `tracker`; contract call `ruleSets()` returning `[{id, version, rules: [{id, pattern}]}]`, schema-checked; the usual consent, child process, and time limit; rules kept in memory only, never in SQLite, receipts, or Git, and findings record the set `version`; a fake rules plugin under `test/fixtures/plugins/`, covered by the 7.4 and 8.8 scans.
  - Built: in the publish commit `ac3825f` (`src/app/content/content-rules.mjs`; `src/app/content/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.8 Allowed patterns [R40.15, R40.13] (§4.9)
  - $done: Allowed patterns
  - $done: `allow: regex` and `allow <rule>: regex` lines in terms files, parsed by `parseTerms` and `checkTermsText` with line-numbered errors that never repeat the line; the worker drops a match when an allow pattern matches the same line and returns only counts; built-in sets unchanged; `checkRuleSets` refuses a set with `allow`; the release scan applies a file's allow lines to that file's rules only; the Rule builder gets an Allow row with an optional rule picker, the File view reads allow lines, Try it strikes through allowed matches; How rules work and `docs/plugins.md` updated; tests for allow-all, allow-one-rule, a non-matching line still blocking, built-ins unaffected, no echo, the release scan, and builder and File view round trip.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 10.1
  - `allow: regex` and `allow <rule>: regex` lines in terms files, parsed by `parseTerms` and `checkTermsText` with line-numbered errors that never repeat the line; the worker drops a match when an allow pattern matches the same line and returns only counts; built-in sets unchanged; `checkRuleSets` refuses a set with `allow`; the release scan applies a file's allow lines to that file's rules only; the Rule builder gets an Allow row with an optional rule picker, the File view reads allow lines, Try it strikes through allowed matches; How rules work and `docs/plugins.md` updated; tests for allow-all, allow-one-rule, a non-matching line still blocking, built-ins unaffected, no echo, the release scan, and builder and File view round trip.
  - Built: in the publish commit `ac3825f` (`src/app/content/content-rules.mjs`; `src/app/content/test/content-rules.test.mjs`, `content-terms.test.mjs`).

- [x] avoozl-p28 P28 Proof: content rules with fake terms and a fake rules plugin [R40] (§4.9)
  - $done: Expected: (1) the save is refused in-call naming `fake-terms`, `codename`, `design.md`, and the line, and no decision opens; (2) approval is refused with a `content.match` diagnostic and a decision; allow once records who, why, and the hash and the next approval passes; the changed line is blocked again; (3) that issue is not written and a decision opens, and the other issue is projected; (4) no Release write and a decision naming `fake-plugin-set`; (5) `done` is refused in-call, the hook stops the push, and the fixed commit is accepted and integrates; the base file never blocks; (6) `b` does not complete and a decision opens; (7) both refusals match today's messages and the existing screen tests pass unchanged; (8) the brief is sent, and the Delivery view shows one `fake-paths` finding with one notification; (9) the missing file blocks every boundary `fake-terms` covers with one decision while uncovered work goes on; the tracked file is refused; the crashed plugin makes only `fake-plugin-set` unavailable; the slow rule times out in about 2 seconds, its set fails closed, and the tick finishes; (10) validation refuses the `terms` key, and the MCP allow gets 403; (11) zero hits anywhere, and the release scan prints `codename` with file and line but not the line.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
  - Setup: an isolated temporary workspace in plans-repo mode with a sample code repository in the test tree and a fake GitHub client that records every write; terms file `.avoozl/local/content-rules/fake-terms.txt` with `codename: \bzorblat\b` and `host: \bbuild\d+\.corp\.example\b`; a second set `fake-paths` (action `report`, rule `share: \bfileshare/teams\b`) whose terms file sits outside the workspace and is named in machine-local settings; the fake rules plugin `fake-rules` from `test/fixtures/plugins/`, approved, supplying set `fake-plugin-set` with `project: \bproject-?x\b`; `.avoozl.json` naming all three; an approved spec with leaves `a -> b` and one milestone.
  - Action: (1) the planner saves a draft whose `design.md` says "zorblat"; (2) a person puts the same line in `tasks.md` and approves, allows once with a reason, approves again, then changes that line to another "zorblat" sentence and approves; (3) project with one issue title holding `zorbl&#97;t`; (4) rename the milestone to "Project X launch" and sync; (5) worker `a` adds a line naming `build7.corp.example`, reports `done`, then pushes; it removes the line and reports again; a base file already holding the hostname stays untouched; (6) leaf `b`'s pull request body names "zorblat"; (7) the responder posts a reply holding a GitHub-token-shaped string, then one naming the planning repository; (8) a brief quotes an issue line matching `fake-paths`; (9) delete `fake-terms.txt` and tick; restore it and `git add -f` it; make `fake-rules` crash; add a rule `(a+)+$` and check a 40-character run of `a` ending in `!`; (10) add a `terms` key to `.avoozl.json`; call allow once through the MCP tool a session uses; (11) grep SQLite, events, decisions, notification payloads, the fake GitHub writes, and Git history for each fake term, plain and encoded; run the release scan with `fake-terms.txt` as `$AVOOZL_RELEASE_TERMS` over a fixture that names "zorblat".
  - Expected: (1) the save is refused in-call naming `fake-terms`, `codename`, `design.md`, and the line, and no decision opens; (2) approval is refused with a `content.match` diagnostic and a decision; allow once records who, why, and the hash and the next approval passes; the changed line is blocked again; (3) that issue is not written and a decision opens, and the other issue is projected; (4) no Release write and a decision naming `fake-plugin-set`; (5) `done` is refused in-call, the hook stops the push, and the fixed commit is accepted and integrates; the base file never blocks; (6) `b` does not complete and a decision opens; (7) both refusals match today's messages and the existing screen tests pass unchanged; (8) the brief is sent, and the Delivery view shows one `fake-paths` finding with one notification; (9) the missing file blocks every boundary `fake-terms` covers with one decision while uncovered work goes on; the tracked file is refused; the crashed plugin makes only `fake-plugin-set` unavailable; the slow rule times out in about 2 seconds, its set fails closed, and the tick finishes; (10) validation refuses the `terms` key, and the MCP allow gets 403; (11) zero hits anywhere, and the release scan prints `codename` with file and line but not the line.
  - Failure means: content rules leak the terms they guard, let a match through, or stop the tick.
  - Next decision: narrow the boundaries to GitHub writes and diffs only, or move matching into a plugin child process instead of a worker thread.
  - Built: pass, `src/app/test/proof-p28.test.mjs`, in the publish commit `ac3825f`.

## Phase 12: Flow

- [x] 12.1 Timing store and event spans [R43.1–R43.3, R43.6–R43.8] (§4.11, F96)
  - $done: Timing store and event spans
  - $done: New `flow_spans` table (`task_id`, `attempt`, `role`, `stage`, `started_at`, `ended_at`, `source`, `detail`) and `src/app/flow/flow.mjs`; spans for `queued`, `review`, `rework`, `merge`, and `waiting` from readiness, bindings, reports, verdicts, retries, and integration; no setting; open spans close at the next ending event after a restart; `detail` passes the content rules; no prompts, output, tokens, or cost; old `usage_samples` and `provider_events` untouched.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - New `flow_spans` table (`task_id`, `attempt`, `role`, `stage`, `started_at`, `ended_at`, `source`, `detail`) and `src/app/flow/flow.mjs`; spans for `queued`, `review`, `rework`, `merge`, and `waiting` from readiness, bindings, reports, verdicts, retries, and integration; no setting; open spans close at the next ending event after a restart; `detail` passes the content rules; no prompts, output, tokens, or cost; old `usage_samples` and `provider_events` untouched.
  - Built: `156ae8e` (flow.mjs, `flow_spans`).
- [x] 12.2 Tool-call reader, after 12.1 [R43.4] (§4.11, F90–F94)
  - $done: Tool-call reader, after 12.1
  - $done: First read one live tick-opened worker slot with `GET /api/chat/slots/<slot>?cursor=1` and record in the receipt whether tool rows carry `meta.kind` and `meta.input`, settling F91 live; then read each live tick-opened worker once per tick beside the status read, keep only `kind`, the command's first words, and `ts`; a shell call running a declared check is `tests`, other shell calls `commands`, the rest `coding`; source `tool-calls`.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 12.1
  - First read one live tick-opened worker slot with `GET /api/chat/slots/<slot>?cursor=1` and record in the receipt whether tool rows carry `meta.kind` and `meta.input`, settling F91 live; then read each live tick-opened worker once per tick beside the status read, keep only `kind`, the command's first words, and `ts`; a shell call running a declared check is `tests`, other shell calls `commands`, the rest `coding`; source `tool-calls`.
  - Built: `156ae8e` (reader; live slot read not done, row shape Inferred, see P30 receipt).
- [x] 12.3 Phase markers and check durations, after 12.1 [R43.5, R45.2] (§4.11)
  - $done: Phase markers and check durations, after 12.1
  - $done: `plans_report` `progress` takes optional `phase` (`coding`, `tests`, `commands`, `ci-wait`), stamped on receipt; the brief asks for markers only when Avoozl cannot read the session's tool calls (Crew Mode, remote, or no read); verifier entries and `done` check lists gain `durationMs`; unmarked worker time is `coding`; source `markers`.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 12.1
  - `plans_report` `progress` takes optional `phase` (`coding`, `tests`, `commands`, `ci-wait`), stamped on receipt; the brief asks for markers only when Avoozl cannot read the session's tool calls (Crew Mode, remote, or no read); verifier entries and `done` check lists gain `durationMs`; unmarked worker time is `coding`; source `markers`.
  - Built: `156ae8e`.
- [x] 12.4 GitHub timing, after 12.1 [R43.3] (§4.11, F95)
  - $done: GitHub timing, after 12.1, 3.11
  - $done: `ci-wait` from the first check run requested to the last required check completed on each pushed head, and GitHub `review` spans from request to `submitted_at`, through the reads completion already makes (§6.5); no new poller; "CI only" failures recorded when CI fails on a commit with a local pass.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 12.1
  - `ci-wait` from the first check run requested to the last required check completed on each pushed head, and GitHub `review` spans from request to `submitted_at`, through the reads completion already makes (§6.5); no new poller; "CI only" failures recorded when CI fails on a commit with a local pass.
  - Built: `156ae8e` (ci-wait and CI only from the completion read; GitHub review spans not built).
- [x] 12.5 Metrics, after 12.1 [R43.7] (§4.11)
  - $done: Metrics, after 12.1
  - $done: Lead time, flow efficiency, first-pass rate, time to fix, change failure rate, and integrations per day, per task and per window, computed on read; `flow.view` observe operation for the UI, CLI `avoozl flow`, and MCP `plans_flow`.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 12.1
  - Lead time, flow efficiency, first-pass rate, time to fix, change failure rate, and integrations per day, per task and per window, computed on read; `flow.view` observe operation for the UI, CLI `avoozl flow`, and MCP `plans_flow`.
  - Built: `156ae8e` (`flow.view`, `avoozl flow`, `plans_flow`); charts over time `fc2db02`.
- [x] 12.6 Stop the line, after 12.1, 9.5 [R44] (§4.11)
  - $done: Stop the line, after 12.1, 9.5
  - $done: Trigger on a passed check failing on the landing branch after one rerun, and on a failed verification that also fails on the task's base; flaky record; culprit by range, bisect in a scratch worktree up to 8 runs, else unknown; pause by `flow.stopTheLine.scope` (default `dependents`); stopped check not judged on other commits; one fix task `<culprit-id>.fix-<n>` first in line, revert allowed; resume on green with time to fix and one notification.
  - $done: Needs you only for the fix task's question, person-only block, or retry bound; **Run anyway** person-only, confirmed, recorded; agents and plugins get 403; the culprit stays accepted.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 12.1, 9.5
  - Trigger on a passed check failing on the landing branch after one rerun, and on a failed verification that also fails on the task's base; flaky record; culprit by range, bisect in a scratch worktree up to 8 runs, else unknown; pause by `flow.stopTheLine.scope` (default `dependents`); stopped check not judged on other commits; one fix task `<culprit-id>.fix-<n>` first in line, revert allowed; resume on green with time to fix and one notification.
  - Needs you only for the fix task's question, person-only block, or retry bound; **Run anyway** person-only, confirmed, recorded; agents and plugins get 403; the culprit stays accepted.
  - Built: `156ae8e` (flow-line.mjs); local landing branch only.
- [x] 12.7 Local checks first, after 12.3, 10.4 [R45] (§4.11)
  - $done: Local checks first, after 12.3, 4.7, 10.4
  - $done: `flow.localChecksFirst` (default `true`); briefs for pushing sessions say to run the declared checks before each push; `done` for a pushed commit refused without a passing check list for that commit; the 10.4 pre-push hook also refuses a push with no recorded local pass and does not rerun checks; local delivery unchanged.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 12.3, 10.4
  - `flow.localChecksFirst` (default `true`); briefs for pushing sessions say to run the declared checks before each push; `done` for a pushed commit refused without a passing check list for that commit; the 10.4 pre-push hook also refuses a push with no recorded local pass and does not rerun checks; local delivery unchanged.
  - Built: `156ae8e` (flow-checks.mjs, `plans_run_checks`, `avoozl checks run`).
- [x] 12.9 Retrospectives, after 12.5, 10.4 [R47.1–R47.6, R47.8, R47.9] (§4.11)
  - $done: Retrospectives, after 12.5, 10.4
  - $done: Tool-less `avoozl-retro` agent in `kirocrew-app/agents/`; triggers with the defaults in §4.11, one at a time per workspace, folded triggers, one-hour spike gap; brief through the `brief` content-rule boundary; reply schema-checked, at most 3 typed proposals, refused safety keys, "removes a check" marked; Approve writes settings through the validated operation or opens a planner draft; Reject records why; 10-minute timeout.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 12.5, 10.4
  - Tool-less `avoozl-retro` agent in `kirocrew-app/agents/`; triggers with the defaults in §4.11, one at a time per workspace, folded triggers, one-hour spike gap; brief through the `brief` content-rule boundary; reply schema-checked, at most 3 typed proposals, refused safety keys, "removes a check" marked; Approve writes settings through the validated operation or opens a planner draft; Reject records why; 10-minute timeout.
  - Built: `736fbd6` (flow-retro.mjs, `avoozl-retro` agent).
- [x] 12.10 PDCA check, after 12.9 [R47.7] (§4.11)
  - $done: PDCA check, after 12.9
  - $done: On Approve record the proposal's metric over the last `everyTasks` finished tasks; after that many more record it again and mark helped, no change, or worse (10% threshold in the expected direction); a change that did not help puts a typed revert proposal in the next retrospective.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 12.9
  - On Approve record the proposal's metric over the last `everyTasks` finished tasks; after that many more record it again and mark helped, no change, or worse (10% threshold in the expected direction); a change that did not help puts a typed revert proposal in the next retrospective.
  - Built: `736fbd6`.
- [x] 12.11 Flow tab, Timing fold, and Line stopped banner per §8.4, after 12.5, 12.6, 12.9 [R48.1–R48.5] (§8.4)
  - $done: Flow tab, Timing fold, and Line stopped banner per §8.4, after 12.5, 12.6, 12.9
  - $done: Top-level Flow tab with the `Gauge` icon (or `Timer` if the host lacks it) on heading and nav; metric cards with the previous window; stacked bars marked coarse when not from tool calls; bottleneck callout; retros with Approve, Reject, PDCA, and Run a retro now; shared filter panel; drawer Timing fold after Delivery; red Dashboard banner with Open fix task and confirmed Run anyway. Check the page by drawing it and looking at it.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 12.5, 12.6, 12.9
  - Top-level Flow tab with the `Gauge` icon (or `Timer` if the host lacks it) on heading and nav; metric cards with the previous window; stacked bars marked coarse when not from tool calls; bottleneck callout; retros with Approve, Reject, PDCA, and Run a retro now; shared filter panel; drawer Timing fold after Delivery; red Dashboard banner with Open fix task and confirmed Run anyway. Check the page by drawing it and looking at it.
  - Built: `07a7d4c`; charts, tokens and credits `fc2db02`; checked from screenshots, light and dark, wide to 320 px.
- [x] 12.12 Settings Flow group and validation, after 12.6, 12.7, 12.9 [R48.6–R48.8, R47.8] (§4.11, §8.4)
  - $done: Settings Flow group and validation, after 12.6, 12.7, 12.9
  - $done: `flow` in `.avoozl.json` per workspace and per repository (`repositories.<id>.flow`); validation of every key and value; `flow.retro.instructions` machine-local only and refused in tracked files; Settings sub-groups Timing, Stop the line, Local checks first, Retro, each with a heading and one line, raw keys small, "(optional)" markers, defaults as placeholders; edits through the shared operations with expected revisions.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 12.6, 12.7, 12.9
  - `flow` in `.avoozl.json` per workspace and per repository (`repositories.<id>.flow`); validation of every key and value; `flow.retro.instructions` machine-local only and refused in tracked files; Settings sub-groups Timing, Stop the line, Local checks first, Retro, each with a heading and one line, raw keys small, "(optional)" markers, defaults as placeholders; edits through the shared operations with expected revisions.
  - Built: `07a7d4c`; model dropdown and built-in prompt part `fc2db02`.

- [x] avoozl-p30 P30 Proof: flow with fake workers and scripted timings [R43–R48] (§4.11, §8.4)
  - $done: Expected: (1) `c1` shows `coding`, `commands`, and `tests` spans from tool calls, the check counted as `tests`, and no output stored; (2) `b1`'s spans come from markers and show as coarse; (5) the culprit is `a1`, the line stops, `d1` is not dispatched, `c2` keeps running, `c2`'s result for that check after its rebase is not judged and costs no attempt, a fix task is first in line, and the red banner names the check, `main`, `a1`, the fix task, and the paused count; Needs you stays empty; (6) a flaky record and no stop; (7) green on `main` resumes `d1`, records time to fix, and notifies once; `a1` stays accepted; (8) dispatch resumes with the stop still shown and who pressed it; the agent call gets 403; (9) the push without a pass is refused by the hook and the `done` is refused; the CI failure is recorded as "CI only" with a `ci-wait` span from the feed; (10) the retro names the biggest bottleneck with numbers; the content-rules proposal is dropped with a reason; Approve writes the proposed setting with an expected revision and nothing else changes; (11) PDCA marks "did not help" and the next retro carries a revert proposal; (12) the open span closes at its next ending event, not at the restart; (13) validation refuses the file and names the key. The Flow tab and drawer show each of these, and lead time, flow efficiency, first-pass rate, and time to fix match values computed by hand from the script.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.9, 12.10, 12.11, 12.12
  - Setup: an isolated temporary workspace with a sample repository in the test tree, integration branch `main`, one declared check `node test/check.mjs`, an approved spec with epic `e1` holding leaves `a1`, `a2`, `a3`, `a4`, and `b1`, `c1`, `c2` (independent), and `d1` (requires `a1`); fake workers that follow a script of tool rows, phase markers, reports, and sleeps on a fake clock; a fake GitHub check-run feed for one plans-repo leaf `g1`; the fake retro model.
  - Action: (1) run `c1` as a tick-opened worker whose script has 2 edits, `npm install`, and the check, then `done`; (2) run `b1` as a Crew Mode worker that sends phase markers only; (5) integrate `a1`'s retried commit, which breaks the check on `main`, with `c2` running and `d1` ready; (6) script a one-time failure of the check on a later commit; (7) let the fix task revert the break; (8) open a second stop and press Run anyway as the owner, then call Run anyway from an agent session; (9) push `g1` once without a local pass and once with one, and have CI fail on the passing commit; (10) finish 10 tasks so a retro starts, and have the fake model propose a Flow setting change and a forbidden content-rules change; approve the first; (11) finish 10 more tasks with lead time unchanged; (12) restart the backend with a span open; (13) put `flow.retro.instructions` in the repository's `.avoozl.json`.
  - Expected: (1) `c1` shows `coding`, `commands`, and `tests` spans from tool calls, the check counted as `tests`, and no output stored; (2) `b1`'s spans come from markers and show as coarse; (5) the culprit is `a1`, the line stops, `d1` is not dispatched, `c2` keeps running, `c2`'s result for that check after its rebase is not judged and costs no attempt, a fix task is first in line, and the red banner names the check, `main`, `a1`, the fix task, and the paused count; Needs you stays empty; (6) a flaky record and no stop; (7) green on `main` resumes `d1`, records time to fix, and notifies once; `a1` stays accepted; (8) dispatch resumes with the stop still shown and who pressed it; the agent call gets 403; (9) the push without a pass is refused by the hook and the `done` is refused; the CI failure is recorded as "CI only" with a `ci-wait` span from the feed; (10) the retro names the biggest bottleneck with numbers; the content-rules proposal is dropped with a reason; Approve writes the proposed setting with an expected revision and nothing else changes; (11) PDCA marks "did not help" and the next retro carries a revert proposal; (12) the open span closes at its next ending event, not at the restart; (13) validation refuses the file and names the key. The Flow tab and drawer show each of these, and lead time, flow efficiency, first-pass rate, and time to fix match values computed by hand from the script.
  - Failure means: timing cannot be trusted to show where time went, or stop the line costs writers attempts or loses work.
  - Next decision: keep timing and stop the line and drop retrospectives, or move retrospectives to a by-hand button only.
  - Built: `2f2de0c` (`src/app/test/proof-p30.test.mjs`, receipt `docs/evidence/proof-p30.md`).

## Phase 14: Incoming items

- [x] 14.1 Incoming-item record and storage [R50.1–R50.3] (§4.12, F112)
  - $done: Incoming-item record and storage
  - $done: `incoming_items` and `intake_sources` store tables; the record shape with the trust-boundary checks of R50.2 (bad items refused alone, with the field named); dedup on source plus ID by content hash; stale `updatedAt` ignored and reported; a quiet pass writes nothing.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6
  - `incoming_items` and `intake_sources` store tables; the record shape with the trust-boundary checks of R50.2 (bad items refused alone, with the field named); dedup on source plus ID by content hash; stale `updatedAt` ignored and reported; a quiet pass writes nothing.
  - Built: `3040bef`: `incoming_items` and `intake_sources` tables (`src/app/store/store.mjs`), the record and checks (`incomingItem` gains `trigger`, `src/app/plugins/plugin-contract.mjs`; first part in 16.4), dedup, stale and quiet writes in `takeItem` (`src/app/intake/intake.mjs`).
- [x] 14.2 Source settings, after 3.13 [R50.6, R50.11, R50.20] (§4.12, §4.4)
  - $done: Source settings, after 3.13
  - $done: `intake.sources` in `.avoozl.json` and in machine-local settings, validated like `plugins` entries: reserved `github` and `local`, `via` naming a `plugins` entry with `poll` or `mcp`, a registered `repository`, `labelFields`, `assigneeField`, `allowedActors`, `minimumPermission` (default `write`); one Settings group with the public-repository warning and plain "(optional)" markers; a `respond` rule with a non-GitHub `source:` refused.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 3.13
  - `intake.sources` in `.avoozl.json` and in machine-local settings, validated like `plugins` entries: reserved `github` and `local`, `via` naming a `plugins` entry with `poll` or `mcp`, a registered `repository`, `labelFields`, `assigneeField`, `allowedActors`, `minimumPermission` (default `write`); one Settings group with the public-repository warning and plain "(optional)" markers; a `respond` rule with a non-GitHub `source:` refused.
  - Built: `3040bef`, `dbcf1b9`: `validateSource`, `declaredSources`, `editSource` (`src/app/intake/intake.mjs`); `intake` in the tick's policy check and the schema; Settings › Plugins › Intake sources (`IntakeSources.tsx`) with the shared-repo confirm; respond with `source:` refused (`github-policy.mjs`).
- [x] 14.3 `intake.submit`, `intake.list`, `intake.view`, after 14.1, 14.2 [R50.5, R50.8] (§4.12)
  - $done: `intake.submit`, `intake.list`, `intake.view`, after 14.1, 14.2
  - $done: Operations in `operations.mjs`; CLI `avoozl intake submit|list|view`; MCP `plans_intake_submit`, `plans_intake_list`, `plans_intake_view` with no existing `plans_*` name changed; submit only to an `mcp` source, 1–100 items, per-item results; run under the workspace tick lock.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 14.1, 14.2
  - Operations in `operations.mjs`; CLI `avoozl intake submit|list|view`; MCP `plans_intake_submit`, `plans_intake_list`, `plans_intake_view` with no existing `plans_*` name changed; submit only to an `mcp` source, 1–100 items, per-item results; run under the workspace tick lock.
  - Built: `3040bef`: `intake.submit`, `intake.list`, `intake.view` (and `intake.sources`) in `operations.mjs`, under the tick lock; CLI `avoozl intake`; MCP as `plans_intake` actions `submit_items`, `items`, `item`, `sources` (R56 grouping, not new names).
- [x] 14.4 Pipeline, after 14.3, 10.6 [R50.9–R50.11, R50.19] (§4.12, §4.9, F107, F109, F110)
  - $done: Pipeline, after 14.3, 10.6
  - $done: The `intake` content boundary (block quarantines with a decision that never names the text; report records), off unless a set names it; `source:` in `parseMatch` (one per rule; absent means GitHub; refused in an Untriaged filter); `labelFields` and `assigneeField` mapping; actions by today's precedence; `deliver`/`execute` make a pinned local leaf in the source's repository and `plan` an inbox task through `task.capture`; `review` items skipped by deliver, execute, plan, and respond rules.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 14.3, 10.6
  - The `intake` content boundary (block quarantines with a decision that never names the text; report records), off unless a set names it; `source:` in `parseMatch` (one per rule; absent means GitHub; refused in an Untriaged filter); `labelFields` and `assigneeField` mapping; actions by today's precedence; `deliver`/`execute` make a pinned local leaf in the source's repository and `plan` an inbox task through `task.capture`; `review` items skipped by deliver, execute, plan, and respond rules.
  - Built: `3040bef`: the opt-in `intake` boundary (`content-rules.mjs`); `source:` in `parseMatch` and `sourceRules` in the normalized policy so GitHub code never sees them; `matchView` for `labelFields` and `assigneeField`; leaves and inbox tasks from `takeItem`; reviews skip starting rules.
- [x] 14.5 Who counts per source, after 14.4 [R50.12–R50.14] (§4.12, F106–F108)
  - $done: Who counts per source, after 14.4
  - $done: GitHub unchanged; a plugin source's `trigger.actor` and `trigger.permission` checked by `actorAllowed` against the source's settings; no `actor` capability means no allowed actor; an MCP caller's items meet only `pause` and `quarantine` rules, and its claimed author and trigger are stored as claims.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 14.4
  - GitHub unchanged; a plugin source's `trigger.actor` and `trigger.permission` checked by `actorAllowed` against the source's settings; no `actor` capability means no allowed actor; an MCP caller's items meet only `pause` and `quarantine` rules, and its claimed author and trigger are stored as claims.
  - Built: `3040bef`: `judgeItem` (`src/app/intake/intake.mjs`): plugin `trigger` through `actorAllowed` against the source's settings, no `actor` capability means nobody, MCP items meet only pause and quarantine and keep author and trigger as `claims`.
- [x] 14.6 Plugin `poll`, after 14.4 [R50.7] (§4.8, §4.12, F104, F105)
  - $done: Plugin `poll`, after 8.7, 14.4
  - $done: New tracker capability `poll` and reply check (`items`, `cursor` of at most 2,000 characters, `more`, at most 500 items); the tick opens every plugin a declared source names; one poll per source per tick; the cursor stored after every item is handled; a failed or invalid poll keeps the cursor and items and shows the error; a poll-only plugin is never asked to project, read, list, or close; the fake tracker plugin gains `poll`.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 14.4
  - New tracker capability `poll` and reply check (`items`, `cursor` of at most 2,000 characters, `more`, at most 500 items); the tick opens every plugin a declared source names; one poll per source per tick; the cursor stored after every item is handled; a failed or invalid poll keeps the cursor and items and shows the error; a poll-only plugin is never asked to project, read, list, or close; the fake tracker plugin gains `poll`.
  - Part built in 16.4: the `poll` capability and its reply check. This task still owns calling it from the tick and storing the cursor and items.
  - Built: `3040bef`: `pollSources` and the tick's `pollStep` (`src/app/tick/tick.mjs`): one poll per source, cursor stored after the page, a failed poll keeps cursor and items and shows the error; the fake tracker gains `poll` (changed-since cursor). The `poll` contract itself is from 16.4 (`837497b`).
- [x] 14.7 GitHub intake on the record, after 14.4 [R50.4] (§4.12, F101)
  - $done: GitHub intake on the record, after 14.4
  - $done: `syncGitHubIssues` writes each listed issue as a `github` item and points its `github_issues` row at it; listing by label, events, permissions, snapshot freeze, and results unchanged; the existing GitHub intake tests pass unchanged.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 14.4
  - `syncGitHubIssues` writes each listed issue as a `github` item and points its `github_issues` row at it; listing by label, events, permissions, snapshot freeze, and results unchanged; the existing GitHub intake tests pass unchanged.
  - Built: `3040bef`: `mirrorGitHubIssue`; each `github_issues` row points at its item through `item`; GitHub intake tests pass unchanged.
- [x] 14.9 Updates and closes, after 14.5 [R50.17, R50.18, R50.21] (§4.12)
  - $done: Updates and closes, after 14.5
  - $done: Title and labels follow to the tied task and rules run again, with withdrawal when no allowed match is left; a body change after the snapshot quarantines; closes follow the allowed-close rule (order, brief note, never verified; otherwise hold and a decision; never reopen); a reopen withdraws the order and leaves running sessions alone; untied closed items deleted after 30 days.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 14.5
  - Title and labels follow to the tied task and rules run again, with withdrawal when no allowed match is left; a body change after the snapshot quarantines; closes follow the allowed-close rule (order, brief note, never verified; otherwise hold and a decision; never reopen); a reopen withdraws the order and leaves running sessions alone; untied closed items deleted after 30 days.
  - Built: `3040bef`: title, labels and rules follow to the tied task with withdrawal; body change after the snapshot quarantines; `judgeClose` with `intakeVerdict` (order) or `intakeHold` (decision), reopen lifts both; `purgeClosed` after 30 days. `completionReached` and `blockerNotes` read `intakeVerdict`.
- [x] 14.12 Docs and leak scan, after 14.3, 14.6 [R50.22] (§4.8, §13)
  - $done: Docs and leak scan, after 14.3, 14.6
  - $done: The plugin guide gains `poll` with the fake plugin as its example; a short guide to `plans_intake_submit` from a Kiro Crew cron job using a fake source; sources named only generically; the 7.4 scan covers the new docs and fixtures.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 14.3, 14.6
  - The plugin guide gains `poll` with the fake plugin as its example; a short guide to `plans_intake_submit` from a Kiro Crew cron job using a fake source; sources named only generically; the 7.4 scan covers the new docs and fixtures.
  - Built: `3040bef`: Intake part and source settings in `docs/plugins.md` with the fake tracker; `docs/policies.md` "Bring in work from other trackers and scripts" (MCP submit from a cron job); `avoozl-rules` skill lists `intake`; the release scan passes over docs and fixtures.

- [x] avoozl-p32 P32 Proof: incoming items from a fake plugin source and a fake MCP caller [R50] (§4.12)
  - $done: Expected: (1) `T1`, `T5`, and `T6` each become one pinned local leaf in `o/app`; `T2` is untriaged (eve lacks `write`); `T3` untriaged; `R1` untriaged with **Code review** and no leaf; issue 1 delivers and issue 2 is untriaged, as before; (2) nothing written; (3) the cursor and items stay, the error shows on the source, and the rest of the tick runs; after restore the next page is read and no item is duplicated; (4) `S1` is listed, not delivered (an MCP claim meets no starting rule); `S2` is paused; the bad link is refused with the field named while the others are stored; the replay is `unchanged` and the older one `stale`; (5) both refused; (6) `T4` is quarantined with a decision naming the set and rule and not the term; (7) the tab lists items from `github`, `tickets`, and `script` with a Source filter, non-GitHub rows link to their items and show no Issue Radar button; the page press makes one pinned leaf, and the MCP call gets 403; (8) `T1`'s task is quarantined until re-triggered or confirmed; (9) `T5`'s close is an order: `d5` is released with the brief note, and `T5`'s leaf has no verified completion; `T6`'s close holds `d6` and opens a decision, Avoozl does not reopen it, and the reopen lifts the hold with running sessions untouched; (10) the closed untied item is gone and tied ones stay; (11) every P31 expectation holds, and `untriaged.json` is not written.
  - $done: A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - $after: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.9, 14.12
  - Setup: an isolated temporary workspace in single-repo mode with repository `o/app`, managed labels `avoozl:managed` and `avoozl:ready`, and rules `deliver` `label:go source:tickets`, `pause` `label:hold source:script`, `deliver` `label:go source:script`, and `deliver` `label:go` (GitHub); a fake GitHub with issue 1 (`go`, labeled by an allowed actor) and issue 2 (no labels); the fake tracker plugin from `test/fixtures/plugins/` with `poll` and `actor`, declared as source `tickets` (`labelFields: ["component"]`, `minimumPermission: write`), with items `T1` (`go`, trigger actor `bob`, permission `write`), `T2` (`go`, trigger actor `eve`, permission `read`), `T3` (no labels), `T5` and `T6` (`go`, trigger `bob`, `write`, each with a local task `d5` or `d6` that requires its leaf), and `R1` (kind `review`, `go`, trigger `bob`, `write`); source `script` with `via: mcp`; a content rule set naming the `intake` boundary with one fake term in `T4`'s body; the same GitHub fixtures and expected results as P31.
  - Action: (1) tick; (2) tick again with no change; (3) make `poll` fail and tick, then restore it and tick; (4) through MCP, `plans_intake_submit` to `script` items `S1` (`go`, author `alice`, trigger actor `alice`, permission `admin`), `S2` (`hold`), and one item with a `javascript:` link, then submit `S1` again unchanged, then once with an older `updatedAt`; (5) submit to `tickets` and to `github` through MCP; (6) add `T4` to the fake source and tick; (7) open the Untriaged tab; press **Deliver this** on `S1` from the page, then call the same operation from MCP; (8) change `T1`'s body and tick; (9) before either leaf finishes, close `T5` as `bob`, close `T6` as `eve`, then reopen `T6`; (10) wait past 30 days on the fake clock for a closed untied item; (11) run the P31 actions against the GitHub fixtures.
  - Expected: (1) `T1`, `T5`, and `T6` each become one pinned local leaf in `o/app`; `T2` is untriaged (eve lacks `write`); `T3` untriaged; `R1` untriaged with **Code review** and no leaf; issue 1 delivers and issue 2 is untriaged, as before; (2) nothing written; (3) the cursor and items stay, the error shows on the source, and the rest of the tick runs; after restore the next page is read and no item is duplicated; (4) `S1` is listed, not delivered (an MCP claim meets no starting rule); `S2` is paused; the bad link is refused with the field named while the others are stored; the replay is `unchanged` and the older one `stale`; (5) both refused; (6) `T4` is quarantined with a decision naming the set and rule and not the term; (7) the tab lists items from `github`, `tickets`, and `script` with a Source filter, non-GitHub rows link to their items and show no Issue Radar button; the page press makes one pinned leaf, and the MCP call gets 403; (8) `T1`'s task is quarantined until re-triggered or confirmed; (9) `T5`'s close is an order: `d5` is released with the brief note, and `T5`'s leaf has no verified completion; `T6`'s close holds `d6` and opens a decision, Avoozl does not reopen it, and the reopen lifts the hold with running sessions untouched; (10) the closed untied item is gone and tied ones stay; (11) every P31 expectation holds, and `untriaged.json` is not written.
  - Failure means: one record cannot carry every source without changing GitHub behavior, or an unverifiable caller can start work.
  - Next decision: keep MCP submit list-only and drop plugin-source rules, or keep plugin sources and drop the MCP way in.
  - Built: pass, receipt `docs/evidence/proof-p32.md` (`798b554`), test `src/app/test/proof-p32.test.mjs`. MCP calls use `plans_intake` action `submit_items`; GitHub issue 1 is authorized and goes to the planner as before.

## Phase 15: Pull request feedback

- [x] 15.1 Pull request read [R54.1, R54.2] (§4.13, F114)
  - $done: Pull request read
  - $done: For each covered leaf (plans-repo, or single-repo `coder: worker`) with an open pull request on its branch, one GraphQL read per repository per tick: head SHA, check runs and statuses on the head, reviews, unresolved review threads with comments, `mergeable`, and `autoMergeRequest`; skipped when `updatedAt` is unchanged; a failed read keeps the last state and shows the error.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 10.4
  - For each covered leaf (plans-repo, or single-repo `coder: worker`) with an open pull request on its branch, one GraphQL read per repository per tick: head SHA, check runs and statuses on the head, reviews, unresolved review threads with comments, `mergeable`, and `autoMergeRequest`; skipped when `updatedAt` is unchanged; a failed read keeps the last state and shows the error.
  - Built: `5147ccc` (`pullRequestHeads`, `pullRequestFeedback`, `feedbackOf` in `src/app/github/github.mjs`); read stage in `src/app/github-feedback.mjs`, `d192dfb`. An unchanged pull request is read again only while a check runs, a required check is missing, mergeability is unknown, or a new head has no checks for 10 minutes.
- [x] 15.2 Feedback events and receipts, after 15.1 [R54.3–R54.5, R54.11, R54.12] (§4.13, F116)
  - $done: Feedback events and receipts
  - $done: Events per R54.3; reviews and comments filtered by `actorAllowed` with the repository's policy, others counted only; receipt key pull request, head SHA, and GitHub event ID; a comment that is also a steering mention sent once; a CI failure after a local pass still records "CI only".
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 10.4, 15.1
  - Events per R54.3; reviews and comments filtered by `actorAllowed` with the repository's policy, others counted only; receipt key pull request, head SHA, and GitHub event ID; a comment that is also a steering mention sent once; a CI failure after a local pass still records "CI only".
  - Built: `d192dfb`, `5a5eb19`. Reviews and comments hold their own commit in the receipt key, so a force-push does not resend them.
- [x] 15.3 Relay, after 15.2 [R54.6, R54.7, R54.9, R54.10] (§4.13, F115)
  - $done: Relay
  - $done: One message per pull request per tick, quoted with `fence()`, failed checks with conclusion and details link and the `gh run view --log-failed` hint, task ID and title only in plans-repo mode, through the `brief` content boundary and the leak screen; to `intents.messages` for a live tick-opened worker, to `next` for a Crew Mode worker, else a new attempt on the same branch with a resume brief, the kept agent and model (R53.6), counted against the R8 retry bound; an unreachable crew waits; Avoozl writes nothing to GitHub.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 10.4, 15.2
  - One message per pull request per tick, quoted with `fence()`, failed checks with conclusion and details link and the `gh run view --log-failed` hint, task ID and title only in plans-repo mode, through the `brief` content boundary and the leak screen; to `intents.messages` for a live tick-opened worker, to `next` for a Crew Mode worker, else a new attempt on the same branch with a resume brief, the kept agent and model (R53.6), counted against the R8 retry bound; an unreachable crew waits; Avoozl writes nothing to GitHub.
  - Built: `d192dfb`. The new attempt keeps the last worker's model.
- [x] 15.4 Bounds and decisions, after 15.3 [R54.8, R54.14] (§4.13)
  - $done: Bounds and decisions
  - $done: `delivery.feedbackRounds` (default 5) and `delivery.prFeedback` (default on) per repository and workspace, validated; a round counted on send or attempt; stop and one **Needs you** decision on the bound, on the same check failing on 3 head commits in a row, or on `blocked`.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 10.4, 15.3
  - `delivery.feedbackRounds` (default 5) and `delivery.prFeedback` (default on) per repository and workspace, validated; a round counted on send or attempt; stop and one **Needs you** decision on the bound, on the same check failing on 3 head commits in a row, or on `blocked`.
  - Built: `d192dfb`. Settings are `delivery.prFeedback` and `delivery.feedbackRounds` (1–20), also under `delivery.repositories.<repository>`. Settling the decision resumes with a fresh bound.
- [x] 15.5 Delivery view, after 15.4 [R54.4, R54.13] (§4.13, §8)
  - $done: Delivery view
  - $done: Each covered leaf shows its latest event, rounds used out of the bound, the session the last round went to, and a count with links for comments not relayed. Check the page by drawing it and looking at it.
  - $after: avoozl-p4, avoozl-p5, avoozl-p6, 10.4, 15.4
  - Each covered leaf shows its latest event, rounds used out of the bound, the session the last round went to, and a count with links for comments not relayed. Check the page by drawing it and looking at it.
  - Built: `6919afb` (PR feedback line in the Delivery card and drawer).

- [x] avoozl-p34 P34 Proof: pull request feedback with a fake GitHub and fake workers [R54] (§4.13)
  - $done: Proof: pull request feedback with a fake GitHub and fake workers
  - $done: Expected: (1) nothing is sent; (2) `a`'s worker gets one message naming both checks with links, `b`'s worker gets `alice`'s review quoted as data, `mallory`'s comment is not sent and is counted in the Delivery view, and the second tick sends nothing new; (3) a new attempt opens on `c`'s branch with the same agent and model and a resume brief naming the conflict and auto-merge; (4) after the third head, one decision opens and nothing more is sent for `a`; (5) one decision opens for `b`; (6) nothing is sent for `d`; (7) nothing is sent for `c`. No message names the planning repository; the fake GitHub records no write by Avoozl.
  - $after: 15.1, 15.2, 15.3, 15.4, 15.5
  - Setup: an isolated temporary workspace in plans-repo mode with code repository `o/app` (allowed actor `alice`) and one single-repo repository `o/lib` with `coder: worker`; a fake GitHub; leaves `a` and `b` in `o/app`, `c` in `o/lib`, and `d` on the Issue Radar route; fake workers that push a new head when messaged.
  - Action: (1) open pull requests for `a`, `b`, `c`, and `d`, all green; tick; (2) fail checks `test` and `lint` on `a`'s head, and add a changes-requested review by `alice` and a comment by `mallory` on `b`; tick twice; (3) make `c` conflict with its base and turn its auto-merge off; end `c`'s worker session; tick; (4) fail `test` on `a` for three heads in a row; (5) on `b`, use up 5 rounds; (6) fail a check on `d`; (7) set `delivery.prFeedback: false` on `o/lib` and fail a check on `c`.
  - Expected: (1) nothing is sent; (2) `a`'s worker gets one message naming both checks with links, `b`'s worker gets `alice`'s review quoted as data, `mallory`'s comment is not sent and is counted in the Delivery view, and the second tick sends nothing new; (3) a new attempt opens on `c`'s branch with the same agent and model and a resume brief naming the conflict and auto-merge; (4) after the third head, one decision opens and nothing more is sent for `a`; (5) one decision opens for `b`; (6) nothing is sent for `d`; (7) nothing is sent for `c`. No message names the planning repository; the fake GitHub records no write by Avoozl.
  - Failure means: the tick cannot keep a worker on its pull request without spamming it or trusting outside text.
  - Next decision: send only failed checks and drop review relay.
  - Built: pass, `src/app/test/proof-p34.test.mjs`, `d192dfb`, `5a5eb19`. Run as two workspaces, plans-repo (`a`, `b`) and single-repo (`c`, `d`), because a workspace has one GitHub mode.

## Phase 16: Plugin bundles

- [x] 16.1 Bundle manifest, after 8.6 [R55.1–R55.3] (§4.14, F117)
  - $done: Bundle manifest, after 8.6
  - $done: `provides` with parts `pack`, `rules`, `tracker`, `intake`, `route`; kinds derived; `intake` needs `poll`; a pack-only plugin has no `entry` and never starts a process; the approval stores the parts.
  - $after: 8.6, 8.8
  - `provides` with parts `pack`, `rules`, `tracker`, `intake`, `route`; kinds derived and checked against `kinds` when both are given; `intake` needs `capabilities.tracker` to list `poll`; a pack-only plugin has no `entry`, is refused if it names one, and never starts a process; the approval stores the parts.
  - Built: `837497b` (docs and skill `a675b9a`).
- [x] 16.2 Pack file and checks, after 16.1 [R55.3, R55.4] (§4.14, F118)
  - $done: Pack file and checks, after 16.1
  - $done: `avoozl-pack.json` with `description` and `settings`; a whitelist per group, then the Settings validators; unknown, credential-like, and rule-like keys refused by name.
  - $after: 8.6, 8.8, 16.1
  - `avoozl-pack.json` (or the manifest's `pack`) with `description` and `settings`; one whitelist per group, then the Settings validators; unknown, credential-like, and rule-like keys refused by name; an invalid pack makes the plugin invalid.
  - Built: `837497b` (docs and skill `a675b9a`).
- [x] 16.3 Preview and import, after 16.2 [R55.5–R55.7, R55.9] (§4.14, F119)
  - $done: Preview and import, after 16.2
  - $done: `plugin.pack.preview` and `plugin.pack.import` (person only, approved plugin, exact preview hash, accepted who-counts widening); create, change, keep, skip; `packs` provenance; CLI.
  - $after: 8.6, 8.8, 16.2
  - `plugin.pack.preview` (read only, before approval allowed) and `plugin.pack.import` (person only, approved plugin, exact preview hash, `acceptLowered` for a who-counts widening, `confirmPublic` for a machine-only plugin); create, change, keep, skip; `packs` provenance in `.avoozl.json`; a newer version offers its preview again; CLI `plugins pack-preview` and `pack-import`.
  - Built: `837497b` (docs and skill `a675b9a`).
- [x] 16.4 Intake contract hook [R55.8, R50.2, R50.7] (§4.8, §4.14)
  - $done: Intake contract hook, after 8.7
  - $done: Tracker capability `poll` and its reply check; each item checked per R50.2; tracker rebuild asks only plugins that provide `tracker`.
  - $after: 8.6, 8.8
  - Tracker capability `poll` and its reply check (`items` at most 500, `cursor` at most 2,000 characters, `more`); each item checked per R50.2 and refused by field while the rest are kept; tracker rebuild asks only plugins that provide `tracker`.
  - Built: `837497b` (docs and skill `a675b9a`).
- [x] 16.5 Settings > Plugins parts and Import, after 16.3 [R55.2, R55.5–R55.7] (§4.14, §8)
  - $done: Settings > Plugins parts and Import, after 16.3
  - $done: Cards list parts and imports; Preview and import pack dialog; Add plugin lists parts and the pack preview. Check the page by drawing it and looking at it.
  - $after: 8.6, 8.8, 16.3
  - Each card lists its parts in plain words and what was imported; **Preview and import pack** opens a dialog with the create/change/keep/skip table, the who-counts line and its checkbox, and Import; Add plugin's What and review steps list the parts and the pack preview. Checked by drawing the page and looking at it.
  - Built: `837497b` (docs and skill `a675b9a`).
- [x] 16.6 Docs and plugin skill, after 16.5 [R55.10] (§4.14)
  - $done: Docs and plugin skill, after 16.5
  - $done: `docs/plugins.md` covers bundles, packs, and intake; the app ships an `avoozl-plugin` skill; a generic sample bundle.
  - $after: 8.6, 8.8, 16.5
  - `docs/plugins.md` covers bundles, the pack, and intake; the app ships an `avoozl-plugin` skill; the sample `sdk-team` bundle under the test fixtures uses the generic triage labels needs-triage, p0–p3, and response-requested.
  - Built: `837497b` (docs and skill `a675b9a`).

- [x] avoozl-p35 P35 Proof: one bundle plugin with a pack, rules, a tracker, and an intake source [R55] (§4.14)
  - $done: Proof: one bundle plugin with a pack, rules, a tracker, and an intake source
  - $done: Expected: it installs shared, previews as create, refuses import before approval and from an agent, imports with provenance after approval, polls a fake intake source with a bad item refused by field, refuses an unknown pack key by name, shows and requires acceptance of a who-counts lowering, and needs a new approval for a new version.
  - $after: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
  - Setup: an isolated temporary workspace in single-repo mode with one repository `o/sdk` and a Project; the sample `sdk-team` plugin from the test tree; a fake intake file, terms file, and record file outside the repository, named by environment variables.
  - Action: (1) preview the folder in Add plugin and add it shared with the repo; (2) preview the pack; (3) import before approval, and as an agent session; (4) approve; import with a stale hash, then with the shown hash; (5) preview again; (6) call `ruleSets` and poll twice with limit 2; (7) bump the version and lower `minimumPermission` to triage; (8) give the pack an unknown key, and make it pack-only.
  - Expected: (1) parts pack, rules, tracker, intake and the entry in `.avoozl.json`, unapproved; (2) every setting `create`, no warning, nothing written; (3) refused, and 403; (4) the stale one refused; the settings land with `packs.sdk-team` version 1.0.0 and no rule text; (5) every setting `keep`; (6) the team's set; T1 kept, T2 refused for its link, cursor 2 and more, then T3 closed by bob; (7) state changed, nothing runs or imports until approved again; the preview shows the change and the who-counts line, and the import is refused until accepted; (8) the plugin is invalid naming `settings.repositories.autoMerge`; pack-only has no kinds and starts no process.
  - Failure means: one install cannot carry a team's setup without running unreviewed code or changing who counts silently.
  - Next decision: ship packs alone and keep code parts as separate plugins.
  - Built: pass, `src/app/test/proof-p35.test.mjs`, `837497b` (docs and skill `a675b9a`).

## Phase 17: MCP tool groups

- [x] 17.1 Group MCP tools by object, after 2.3 [R56] (§8)
  - $done: Group MCP tools by object, after 2.3
  - $done: About 12 to 15 tools with an action field cover every safe operation; no MCP call performs a person-only operation by any name; old plans_* names keep working.
  - $after: 2.3
  - 15 tools with an `action` enum, each action one existing operation; person-only operations refused for any MCP call in `Operations.perform`; old `plans_*` names listed and marked deprecated; a session may archive a plan.
  - Built: `e729e08`, `src/app/mcp/test/mcp-tools.test.mjs`.

## Phase 19: New plan

- [x] 19.1 New plan drawer and Plans button icons, after 2.5 [R57] (§8.6)
  - $done: New plan drawer and Plans button icons, after 2.5
  - $done: New plan opens a seeded planner chat; a clean folder becomes a draft plan; nothing is approved, started or pushed.
  - $after: 2.5
  - `plan.new` checks fields and content rules and records the request; the drawer opens an `avoozl-planner` chat; the tick imports a clean folder as a draft and approves nothing.
  - Built: see the commit that adds `src/app/specs/new-plan.mjs`.

## Phase 20: Onboard a repository

- [x] 20.1 Onboard reads, after 3.18 [R58.2, R58.6, R58.7] (§4.15)
  - $done: Onboard reads, after 3.18
  - $done: Folder inspect, commit authors and leak scan are read-only operations.
  - $after: 3.18
  - `onboarding.inspect`, `onboarding.scan` and `onboarding.authors`, all `observe` (the issue preview was removed with per-task issues); the public secret and path rules move beside the content-rules matcher so the release scan and the leak scan share them.
  - Built: see the commit that adds `src/app/workspace/onboarding.mjs`.
- [x] 20.2 Onboard dialog, after 20.1, 16.5 [R58] (§4.15, §8)
  - $done: Onboard dialog, after 20.1, 16.5
  - $done: Cancel before Set up writes nothing; each GitHub write asks first; the flow never approves, dispatches or pushes.
  - $after: 20.1, 16.5
  - Adopt from git: Pick approvers lists the commit authors, and Import specs calls `onboarding.adopt`, which runs `readFromGit`, the reader `avoozl rebuild` uses. The issue preview step and the per-task issue text are gone.
  - Steps with Cancel on each; steps that do not apply are left out and satisfied ones show done; one confirm per GitHub write; nothing written before Set up; never approves, starts or pushes.
  - Built: see the commit that adds `kirocrew-app/ui/src/Onboard.tsx`.

## Phase 21: Epics and phases

Requirement 59, design §6.9.

- [x] 21.1 Epic folders and the `epic:` key, after Phase 3's proofs [R59.1–R59.4, R59.7] (§6.9)
  - $done: Epic folders and the `epic:` key, after Phase 3's proofs
  - $done: An epic folder is known by its manifest's top-level kind, lists member plans, and is refused with the §6.9 codes; `epic:` front-matter is read like `category:`; `kind: "epic"`, per-entry `epic`, a plan's `epics` list and `memberPlan` are validation errors and never load under another name.
  - $after: avoozl-p7
  - $after: avoozl-p9
  - $after: avoozl-p20
  - $after: avoozl-p21
  - $after: 19.1
  - The spec reader knows an epic folder by its manifest's top-level `"kind": "epic"`, reads members from `plan`, reads `epic:` front-matter like `category:`, and reports the §6.9 validation codes; `kind: "epic"`, per-entry `epic`, a plan's `epics` list and `memberPlan` are errors, never loaded under another name.
  - Built: 9535b47 Read epic folders, plan epics and phases; refuse the old epic forms
- [x] 21.2 Phases from the manifest and `tasks.md` headings, after 21.1 [R59.5, R59.6] (§6.9)
  - $done: Phases from the manifest and `tasks.md` headings, after 21.1
  - $done: Every task has a phase from its manifest value, else its heading, else No phase; the store keeps only cross-plan epics; no `doc:` epic is created anywhere.
  - $after: 21.1
  - Each task gets a phase from its `phase` value, else its nearest level-2-or-lower heading, else No phase; the store keeps cross-plan epics only and tasks lose `epic`; capture and catalog paths stop making `doc:` epics, and `specOf` reads the plan or source reference.
  - Built: 9535b47 (phases, no `doc:` or Inbox groups, tasks lose `epic`)
- [x] 21.3 Epic and phase reads on the page, CLI, and MCP, after 21.2 [R59.4, R59.10] (§6.9, §8)
  - $done: Epic and phase reads on the page, CLI, and MCP, after 21.2
  - $done: An epic read lists member plans with computed status and progress and open decisions; plan and task reads carry epic and phase; the reads are reachable through the grouped MCP tools.
  - $after: 21.2
  - An epic read gives goal, what done means, member plans with status and progress, and open decisions; plan and task reads carry epic and phase; progress is computed, never stored; reads join the grouped MCP tools (R56).
  - Built: 9535b47 (`epic.list`, `epic.get`, plan and task reads, CLI `epics`/`epic`, MCP `plans_plan`)
- [x] 21.4 Epic and plan issues on GitHub, after 21.2 [R59.8, R59.9, R59.15] (§6.9)
  - $done: Epic and plan issues on GitHub, after 21.2
  - $done: Projection makes the epic issue with the epic type, plan issues as its sub-issues and task issues under them; the phase line and optional Project field are written; the tick closes plan then epic issues; a second preview writes nothing; `github.subIssues.maxPerParent` (default 100) is validated, shown in GitHub modes only, and checked against each parent's existing sub-issue total; children past the cap and refused links show in the preview and Delivery.
  - $after: 21.2
  - Projection creates the epic issue with `epicIssueType`, one plan issue per plan as its sub-issue, and task issues under the plan issue or package; writes the phase line and the optional `phase` Project field; the tick closes plan and epic issues from children; `github.subIssues.maxPerParent` (default 100) is read, validated, shown in Settings > GitHub setup in GitHub modes only, and checked against each parent's `subIssuesSummary.total`; children past the cap and refused links show in the preview and Delivery.
  - Built: a5871a4 Project epic and plan issues, cap sub-issues per parent, and add P36
- [x] 21.5 Views use epic and phase, after 21.3 [R59.6, R59.10] (§6.9, §8)
  - $done: Views use epic and phase, after 21.3
  - $done: Graph drills All > Epic > Plan > Phase > task with back navigation; Graph, Delivery, Flow, and Plans have separate Epic and Phase filters; Progress by epic counts all member plans; the plan left column and the epic page show epic and phases; no view shows a `doc:` ID or path.
  - $after: 21.3
  - Graph levels All > Epic > Plan > Phase > task with the back stack; separate Epic and Phase filters in Graph, Delivery, Flow, and Plans; Dashboard Progress by epic across member plans; the plan left column shows its epic link and phases; the epic page; no `doc:` ID or path shown anywhere.
  - Built: bae8870 Show epics, plans and phases in the views; batch by phase; add Epic and Phases to New plan
- [x] 21.6 The New plan fields, after 21.2, 19.1 [R59.11, R59.14] (§6.9, §8.6)
  - $done: New plan has Epic and Phases fields; the planner agent and skill write epic folders, the `epic:` key, and phase headings.
  - $after: 21.2, 19.1
  - The New plan drawer has Epic (pick) and Phases; the planner agent and skill write epic folders, the `epic:` key, and phase headings.
  - Built: bae8870 (New plan Epic and Phases, planner agent and skill); 9535b47 planner prompt
- [x] 21.7 Rewrite the owner's plans once, after avoozl-p36 [R59.12] (§6.9)
  - $done: Rewrite the owner's plans once, after avoozl-p36
  - $done: A one-time script, kept in the task's report and not in `src/`, runs through existing operations on a copy and then live after a sha256 backup; per-plan epics become phases, `doc:` tasks go to their section or No phase, orphaned tasks are archived as "plan removed", old manifest forms are rewritten, every plan lints with 0 errors, a second run changes nothing, spec edits are local commits, and nothing is approved, started, written to GitHub, or pushed.
  - $after: avoozl-p36
  - A script kept in the task's report, not in `src/`, run through existing operations: first on a copy of the database and spec repositories, then live after a sha256 backup; per-plan epics to phases, `doc:` epics to their `tasks.md` section or No phase, orphaned tasks archived with `task.archive` reason "plan removed", old manifest forms rewritten in Nupp's plans (the rewrite epic folder and the native runtime plan) and checked in Avoozl's own spec; every plan lints with 0 errors; a second run changes nothing; spec edits are local commits; nothing is approved, started, written to GitHub or pushed.
  - Built: Rewrite run once live on the owner's Nupp and Avoozl workspaces; script and receipts kept in the task report. Nupp plans: one local commit; Avoozl's own spec needed no change. 7cc538a and 334c7e8 let the existing operations do it.

- [x] avoozl-p36 P36 Proof: one epic over two member plans, and old forms refused [R59] (§6.9)
  - $done: Proof: one epic over two member plans, and old forms refused
  - $done: Expected: membership needs both sides; phases come from headings; no `doc:` group appears; three levels of sub-issues project, children past `github.subIssues.maxPerParent` stay unlinked and are shown, and a second preview writes nothing; plan then epic issues close from children; every old form is a validation error.
  - $after: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6
  - Setup: an isolated temporary workspace in plans-repo mode with a fake GitHub; an epic folder `rewrite` listing plans `alpha` and `beta`; `alpha` has `epic: rewrite` and two `## ` headings, one task under none; `beta` has `epic: rewrite`, manifest `phase` values and a `phases` title; a third plan `gamma` says `epic: rewrite` but is not listed; `github.subIssues.maxPerParent` set to 2, and `beta` has three tasks outside packages. A fourth folder `old` has an entry with `kind: "epic"`, per-entry `epic` values and an `epics` list; a fifth, `old-epic`, is an epic folder with `memberPlan` entries.
  - Action: (1) lint and approve `rewrite`, `alpha`, `beta` and `gamma`; (2) list `beta` as a member while it names no epic, then restore; (3) read the epic, the Graph levels, Delivery, Flow, and Plans with each filter, and the Dashboard; (4) preview projection, apply it, preview again; (5) close every `alpha` and `beta` task issue; (6) lint `old` and `old-epic`; (7) open Settings in Local only, then in plans-repo mode.
  - Expected: (1) 0 errors; `gamma` gets `spec.epic-unknown` and shows under No epic; (2) `spec.epic-member-unconfirmed` blocks only the epic's approval; (3) the epic lists `alpha` then `beta` with computed progress; phases come from headings; the headless task is under No phase; no response contains `doc:` or a file path as a group name; (4) one epic issue with the epic type, two plan issues as its sub-issues, task issues under them, the phase line in each body; `beta`'s third task is unlinked, names its plan issue in the marker, and shows "Over the sub-issue limit"; the second preview writes nothing; (5) the tick closes both plan issues, then the epic issue; (6) `facts.removed-key`, `facts.unknown-key` and `spec.epic-task-fields` errors naming each entry, and neither folder can be approved; (7) the sub-issue cap shows only in plans-repo mode.
  - Failure means: one word still means two things, a group is still made up from a path, or an old form still loads.
  - Next decision: keep phases as Avoozl-only groups and project only epics and tasks.
  - Built: a5871a4 `src/app/test/proof-p36.test.mjs`; bae8870 `kirocrew-app/ui/test/epics.test.mjs`

## Phase 22: Templates, manual tasks, and links and notes

Requirement 61, design §4.16.

- [x] 22.1 Manual leaves in lint and the tick, after 21.1 [R61.9–R61.11, R61.13, R61.15] (§4.16, §4.3)
  - $done: Manual leaves in lint and the tick, after 21.1
  - $done: A manual leaf lints only with no run fields; it is never dispatched; it shows in Blocked or waiting, then Needs you tagged Manual; only a person marks it Done or Skipped or reopens it, and either releases its dependents; MCP calls are refused.
  - $after: 21.1
  - `manual: true`; `spec.manual-field`; left out of ready, verification, review and integration; dependents wait until it is done; Blocked or waiting, then Needs you tagged Manual; `task.manual.complete` (Done or Skipped, outcome) and `task.manual.reopen` person only, refused over MCP; Flow counts waiting on a person and skips first-pass rate and time to fix.
  - Built: `src/work-model.mjs` (`person`, `isManual`), `src/app/specs/plan-quality.mjs` (`spec.manual-field`), `src/query.mjs` (never ready), `src/app/api/page-views.mjs` (Needs you tagged Manual), `src/app/workers/runner.mjs` (`needsYou` reason `manual`), `src/app/tasks/manual-tasks.mjs` (`task.manual.complete`/`reopen`, person only), `src/app/flow/flow.mjs` (waiting on a person; out of first-pass and time to fix); the spec's 25 manual tasks now carry completion `person`. Tests: `src/app/tasks/test/manual-tasks.test.mjs`.
- [x] 22.3 Links and notes store, operations, CLI, and MCP, after 17.1, avoozl-p28 [R61.16–R61.18, R61.20–R61.22] (§4.16, §4.9)
  - $done: Links and notes store, operations, CLI, and MCP, after 17.1, avoozl-p28
  - $done: Links and notes are stored in SQLite with the §4.16 limits; the `notes` boundary blocks a banned term for sessions and persons; a session adds only to its bound task and cannot edit or remove; briefs carry the newest entries and blockers' outcomes as data; the plan revision does not change.
  - $after: 17.1, avoozl-p28
  - `task_notes` table; field limits refused by name; `notes` content-rule boundary on by default with Allow once for a person; `task.notes.list` observe, `task.notes.add` for a session's bound task only, `edit`, `remove` and `show` person only; CLI `avoozl task notes`; briefs get the newest 20 entries within 8,000 characters as data, and dependents get blockers' outcome entries; adding an entry changes no plan revision.
  - Built: `src/app/tasks/task-notes.mjs` (`task_notes` table, limits by name, `notes` boundary with Allow once, bound-task adds, briefs of 20 entries within 8,000 characters plus blockers' outcomes), operations, `avoozl task notes`, `plans_task` `notes`/`add_note`. Tests: `src/app/tasks/test/task-notes.test.mjs`.
- [x] 22.4 Task drawer Links and notes and the Mark done dialog, after 22.1, 22.3 [R61.12, R61.19] (§4.16, §8)
  - $done: Task drawer Links and notes and the Mark done dialog, after 22.1, 22.3
  - $done: The drawer lists links and notes newest first with author and time, adds, edits and removes them after a confirm, and shows a manual leaf's acceptance with a Mark done dialog that saves an outcome and Done or Skipped.
  - $after: 22.1, 22.3
  - Drawer section newest first with author and time, Add link and Add note, edit, and remove after a confirm; a manual leaf shows its acceptance and Mark done with outcome note, links, and Done or Skipped; checked by drawing the page and looking at it.
  - Built: `kirocrew-app/ui/src/TaskNotes.tsx` (Links and notes fold, Mark done dialog on the shared Modal and RadioFold, Allow once in place), Manual badge on Dashboard and Delivery. Tests: `kirocrew-app/ui/test/manual-notes.test.mjs`; drawn at 320, 768 and 1280 in light and dark with the harness and looked at.
- [x] 22.5 Links and notes on the issue, after 22.3 [R61.23] (§4.16, §3.3)
  - $done: Links and notes on the issue, after 22.2, 22.3
  - $done: Only entries a person marks Show on the issue reach the managed body, after the `github` boundary; edits there are conflicts; a rebuild restores shown entries.
  - $after: 22.3
  - Show on the issue, person only and off by default, lists the entry in the managed body under Links and notes after the `github` boundary; others' edits there are conflicts; rebuild restores shown entries and the rebuild test allows unshown ones to be missing.
  - Built: Show on the issue (`task.notes.show`, person only) lists entries under Links and notes in the managed body; the tick projects the plan again; `src/app/github-rebuild.mjs` restores shown entries. Tests: `src/app/test/proof-p37.test.mjs` step 7.
- [x] 22.6 Template plugin part and checks, after 16.3, 21.2 [R61.1–R61.6] (§4.16, §4.14)
  - $done: Template plugin part and checks, after 16.3, 21.2
  - $done: A plugin can provide templates without code; a template with an unknown key, an unknown placeholder, a starter that does not lint, phases that do not match, or an invalid pack or flow makes its plugin invalid; only approved plugins' templates are listed.
  - $after: 16.3, 21.2
  - `template` in `provides`, running as nothing; `avoozl-template.json` keys, inputs, `{{input}}` placeholders replaced as text, unknown keys and names refused; the starter lints with sample values; `phases` match headings or `phase` values; `pack` and `flow` pass their validators; an invalid template makes its plugin invalid; `template.list` and `template.preview` read approved templates only.
  - Built: `src/app/specs/templates.mjs` (keys, inputs, plain-text `{{input}}`, starter lints with sample values, phases match, `pack` and `flow` validators), `template` part in `src/app/plugins/plugins.mjs` (no entry, invalid template makes the plugin invalid), `template.list` and `template.preview` for approved plugins only. Tests: `src/app/specs/test/templates.test.mjs`.
- [x] 22.7 From template in the New plan drawer, after 22.6, 21.6, 19.1 [R61.6–R61.8] (§4.16, §8.6)
  - $done: From template in the New plan drawer, after 22.6, 21.6, 19.1
  - $done: From template lists approved templates, fills their inputs, seeds the planner chat, and returns a draft plan that records the template; settings import only when ticked, through the pack preview hash; a picked epic gets a draft revision; nothing is approved, started or pushed.
  - $after: 22.6, 21.6, 19.1
  - Blank or From template as radio fold-outs; template inputs as fields beside Name, Category and Epic; `plan.new` takes `template` and `inputs`, checks required inputs, reads a file input in the page up to 200 KB, and runs content rules on the seed; the pack preview with Import these settings unticked; the draft records the template; a picked epic gets its own draft revision; nothing approved, started or pushed.
  - Built: `kirocrew-app/ui/src/NewPlanDrawer.tsx` Blank or From template fold-outs, `kirocrew-app/ui/src/TemplateStart.tsx` (inputs, file read in the page up to 200 KB, pack preview with Import these settings unticked); `src/app/specs/new-plan.mjs` takes `template` and `inputs`, records the template on the draft and saves the epic's own draft revision. Tests: `src/app/test/proof-p37.test.mjs`, `kirocrew-app/ui/test/manual-notes.test.mjs`.
- [x] 22.8 Sample SDK rewrite template, docs, and skills, after 22.7, 22.4 [R61.24] (§4.16)
  - $done: Sample SDK rewrite template, docs, and skills, after 22.7, 22.4
  - $done: The sample SDK rewrite template lints and loads; the docs and the plugin and planner skills describe templates, manual leaves, and links and notes; the sample names no private system or company.
  - $after: 22.7, 22.4
  - A template-only sample plugin in the test tree with the §4.16 SDK rewrite template, its six phases, the manual Review with team leaf that cutover requires, two proof kinds and the flow defaults, naming no private system or company; `docs/plugins.md`, the plugin skill and the planner skill cover templates, manual leaves and links and notes.
  - Built: `src/app/test/fixtures/plugins/sdk-templates/` (SDK rewrite: six phases, manual Review with team before cutover, two proof kinds, flow defaults, no private names); `docs/plugins.md` Template part, `docs/policies.md` Manual tasks and links and notes, the plugin skill, the avoozl skill and the planner agent prompt.

- [x] avoozl-p37 P37 Proof: an SDK rewrite plan from a template, gated by a manual team review, with links and notes [R61] (§4.16)
  - $done: Proof: an SDK rewrite plan from a template, gated by a manual team review, with links and notes
  - $done: Expected: the template makes a draft that joins an epic and imports no setting unless ticked; the manual review is never dispatched and gates cutover; only a person in the app or an allowed GitHub closer completes it; links and notes are refused by content rules and field limits, reach the dependent's brief as data, and reach the issue only when shown.
  - $after: 22.1, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, avoozl-p36
  - Setup: an isolated temporary workspace in single-repo mode with one repository `o/sdk`, a fake GitHub with an allowed actor `alice` and a reader `bob`, a fake terms file banning `secretword`, an epic folder `sdk-target`, and the sample template plugin from the test tree.
  - Action: (1) add and approve the plugin; open New plan, From template, SDK rewrite; submit with no SDK name, then with `sdk: widgets`, the target repository, a gap list file and epic `sdk-target`, leaving Import these settings unticked; let a fake planner write the folder; (2) lint and approve the plan and the epic's new revision; project; (3) finish every task before the review; (4) as a session, mark the review done, add a note to the review, add a note to another task, and edit the person's note; (5) as a person, save a note with `secretword`, a link `javascript:x`, a link with a user name, then a valid outcome note and link, and Mark done with Done; (6) read the first cutover task's brief; (7) tick Show on the issue on the outcome link and run the tick; rebuild; (8) reopen the review in Avoozl; have `bob` close its issue, then `alice`.
  - Expected: (1) refused naming `sdk`, nothing recorded; then a draft plan with six phases and the template recorded, the epic's own draft revision, no setting imported, nothing approved or started; (2) 0 errors; the review issue says a person closes it and never gets a ready or trigger label; (3) the review is in Needs you tagged Manual and no session opens for it; cutover tasks wait; (4) the mark done and the edit refused, the note on the review saved with the session's ID, the other task's note refused; (5) the first three refused naming the rule or field, the last saved; the issue closes as completed and cutover tasks become ready; (6) the brief carries the outcome note and link as data; (7) only the shown link is in the managed body, and it is back after the rebuild; (8) dependents wait again; `bob`'s close opens a decision and is not reopened; `alice`'s close completes it.
  - Failure means: a repeated workflow cannot start from one install, a person's step cannot gate agent work, or what a review decided does not reach the next task.
  - Next decision: keep templates as starter folders in a planning repository and drop the plugin part.
  - Built: `src/app/test/proof-p37.test.mjs` runs every step with a fake GitHub and passes; nothing ran live.

## Phase 23: The Specs name

Requirement 62, design §8.7.

- [x] 23.1 Say spec on the page, in docs and in skills, after 19.1 [R62] (§8.7)
  - $done: Say spec on the page, in docs and in skills, after 19.1
  - $done: Every user-facing plan word reads spec; the compatibility names are unchanged; a page-source test fails on any plan word outside its allowlist.
  - $after: 19.1
  - Every user-facing plan word becomes spec; Plan a change becomes Change spec; `plans_*`, `plan.*`, CLI, `.avoozl.json` keys, SQLite, the Plans repo mode and `avoozl-planner` are unchanged; a page-source test fails on any `plan` or `plans` word outside its allowlist.
  - Built: `e179407`, `46ed4da` (page-source test `kirocrew-app/ui/test/specs-name.test.mjs`); the Specs tab, Change spec in `PlansView.tsx`.

- [x] avoozl-p38 P38 Proof: the Specs name and ideas [R62] (§8.7)
  - $done: Proof: the Specs name and ideas
  - $done: Expected: no user-facing plan word outside the allowlist and compat names unchanged; bad idea fields and blocked text refused; ideas never start work or count as untriaged; a session cannot archive or graduate; riff only appends; Make it a spec prefills New spec and graduates the idea; archived ideas survive the purge.
  - $after: 23.1
  - Setup: an isolated temporary workspace with one repository, a trigger rule with no `source:` term and one with `source:local`, a fake terms file banning `secretword`, a fake chat opener and the New spec entry point.
  - Action: (1) run the page-source test; list MCP tools and CLI commands; (2) as a person, add an idea with a title, a note and a link; over MCP, capture one with no title, one with a `javascript:` link, one with `secretword`, then a valid one; as a session, capture one and append a note to it; (3) tick; read the Intake tab and its Untriaged count; call Plan this and Deliver this on an idea; (4) as a session, archive an idea and graduate one; (5) Riff on this, and from the riff chat append a link; (6) Make it a spec, cancel, then submit; (7) archive and restore; move the clock 31 days and run the purge.
  - Expected: (1) no plan word outside the allowlist; every `plans_*` tool and CLI command still answers; (2) the bad three refused by field or rule with nothing recorded; the session idea and note name the session; (3) no task, no rule match and an unchanged Untriaged count; both actions refused; (4) refused with 403; (5) the seed holds the idea as data and asks for no edits; only the link is added; (6) the cancel changes nothing; the submit prefills New spec and the idea shows Graduated with the spec name; (7) the archived and graduated ideas are still there.
  - Failure means: an idea can start work, or the page still says plan.
  - Next decision: keep ideas as a separate local list instead of intake items.

## Phase 24: Pull the Andon cord

Requirement 64, design §4.11.

- [x] 24.1 Pulled stops in the backend, CLI and MCP, after 12.6 [R64.2–R64.5, R64.7–R64.11] (§4.11)
  - $done: Pulled stops in the backend, CLI and MCP, after 12.6
  - $done: `flow.stop` records a pulled stop after the `brief` content rules and pauses dispatch in its scope; `flow.resume` is person only and recorded; a pulled stop never closes by itself; MCP `stop_line`, `avoozl flow stop` and `avoozl flow resume` work; Flow and the retro carry the pull.
  - $after: 12.6
  - `flow.stop` {scope, repository?, spec?, taskId?, reason} records a `manual` row in `flow_stops` after the `brief` content rules; `flow.resume` {stopId} is person only and records who resumed; dispatch skips every task in scope, fix tasks included; the line watch never closes a pulled stop; Resume refuses an automatic stop and Run anyway a pulled one; `plans_session` action `stop_line`; `avoozl flow stop` and `avoozl flow resume`; Flow and the retro carry the pull.
  - Built: `79e5fa7` (`flow.stop`, `flow.resume`, `plans_session` action `stop_line`, `avoozl flow stop|resume`; `src/app/flow/test/flow-andon.test.mjs`).
- [x] 24.2 Stop the line on the Dashboard, after 24.1 [R64.1, R64.6, R64.7] (§4.11)
  - $done: Stop the line on the Dashboard, after 24.1
  - $done: The red header button, its dialog and the banner with Resume work at 375 and 1280 px in light and dark.
  - $after: 24.1
  - A red Stop the line button in the Dashboard header opens a dialog with a scope, its target and a required reason; the Line stopped banner shows who, when, scope, reason and the paused count, with a Resume button that asks first; checked by drawing the page at 375 and 1280 px in light and dark.
  - Built: `79e5fa7` (`StopLine.tsx`, the Line stopped banner in `DashboardView.tsx`; `kirocrew-app/ui/test/stop-line.test.mjs`).

- [x] avoozl-p39 P39 Proof: pull the Andon cord [R64] (§4.11)
  - $done: Proof: pull the Andon cord
  - $done: Expected: a pulled stop pauses its scope and leaves running sessions alone; bad pulls are refused with nothing recorded; only a person resumes; nothing else closes a pulled stop; Flow, the retro and the CLI see each pull.
  - $after: 24.1, 24.2
  - Setup: an isolated temporary workspace with repositories `r1` and `r2`, an approved spec `s1` with leaves `a1` and `a2` (`a2` requires `a1`) in `r1` and `b1` in `r2`, a fake terms file banning `secretword`, and fake workers.
  - Action: (1) as a person, pull with scope `task` on `a1` and reason `bad base`; tick; (2) pull with no reason, a two-line reason, scope `repo` naming `r9`, and reason `secretword here`; (3) from an agent session, pull with scope `repo` on `r2`; (4) let the stopped check pass and the fix task integrate; tick; (5) call Resume from an agent session and from the app token; (6) press Run anyway on the pulled stop; press Resume on an automatic stop; (7) press Resume as the owner on both pulled stops; tick; (8) read Flow and the retro payload; run `avoozl flow stop` and `avoozl flow resume` from the CLI.
  - Expected: (1) `a1` and `a2` are not dispatched, `b1` is, a running session is untouched, and the banner shows the owner, the time, the scope and `bad base`; (2) each refused by field, the unknown repository named, the content rule named without the matched text, nothing recorded; (3) the stop names the session, `b1` waits, the owner is notified once; (4) both pulled stops stay open; (5) both refused with 403; (6) both refused; (7) dispatch resumes in each scope and each stop records who resumed it; (8) both pulls are listed and counted with a time to fix, the retro sees their scope and reason, and the CLI pulls and resumes the same way.
  - Failure means: a person cannot stop new work by hand, or a pulled stop resumes without a person.
  - Next decision: keep the pull as a person-only button and drop the MCP action.
  - Proved: `docs/evidence/p39-andon-live.md` (2026-11-19, live on a throwaway Kiro Crew); fixes in the same change: the stop names the person, the line watch takes a direct landing as its first green head, and a chat that reported done no longer counts as running.

## Phase 25: New plan hands off to Spec Builder

Requirement 65, design §8.6.

- [x] 25.1 Spec Builder hand-off, steering file and manifest from tasks.md, after 19.1 [R65] (§8.6)
  - $done: Spec Builder hand-off, steering file and manifest from tasks.md, after 19.1
  - $done: New plan creates the spec in Spec Builder and opens it; the steering file is written only after asking; the tick writes the manifest and imports a draft; Avoozl calls no Spec Builder route but create.
  - $after: 19.1
  - The `/api/apps/spec-builder/specs` grant and a source scan test; `.kiro/steering/avoozl-specs.md` written only after the drawer asks; `plan.new` `preview` and `handoff: "spec-builder"`; the page posts the create call and opens Spec Builder; Plan a goal opens the drawer; the tick writes the manifest from a still `tasks.md` and imports a draft; plain refusals with the planner chat as fallback.
  - Built: 3cfd93d Hand New plan and Plan a goal to Spec Builder

## Phase 26: One driver per spec

Requirement 66, design §6.10.

- [x] 26.1 Driver lock and read-only ticks, after 21.4 [R66.1–R66.7] (§6.10)
  - $done: Driver lock and read-only ticks, after 3.8, 21.4
  - $done: A spec is driven only where its spec issue (else its epic issue) has exactly one assignee equal to the gh login; several reads only everywhere with one decision; the check runs again before each dispatch, projection and integrate; Avoozl changes no assignee; Local only drives every spec here.
  - $after: 21.4
  - Machine ID and label in machine-local settings; read the spec issue's assignees (else the epic issue's) in sync, and again before each dispatch, projection and integrate; drive only with exactly one assignee equal to the `gh` login; several opens one decision and reads only everywhere; Avoozl changes no assignee; `driver.status` on the page, CLI and MCP.
  - Built: `e213632`, `f31d6ba`, PR #22. The driver reads the plan issue that 21.4 projects (`upsertParent` in `github-projection.mjs`); machine settings are in `driver.json` beside `plugins.json`. Tested against fakes only.
- [x] 26.4 Driver on the spec page, its banner and Settings [R66.9] (§6.10)
  - $done: Driver on the spec page, its banner and Settings
  - $done: The spec's driver chip, the read-only banner with its reason and spec issue link, and Settings › General › This computer work at 375 and 1280 px in light and dark.
  - The spec's driver chip, the read-only banner with its reason and spec issue link, and Settings › General › This computer; checked by drawing the page at 375 and 1280 px in light and dark.
  - Built: ca89ea2 Show the spec driver in the header, banner, dialogs and Settings. This computer sits in Settings › Where tasks live, which holds the General settings. Checked by typecheck and source tests only: the page was not drawn at 375 and 1280 px, because this machine has no browser.

## Phase 28: Retro prompt and skill proposals

Requirement 68, design §4.18.

- [x] 28.1 Prompt registry and override store, after 12.9 [R68.2, R68.5, R68.8, R68.9] (§4.18, F121–F123)
  - $done: Prompt registry and override store, after 12.9
  - $done: The five built-in prompts are named sections with shipped hashes and locked sections; overrides live in the workspace's file under the Avoozl config directory with full version records; person-only revert; briefs, seeds and the steering template use the override; no shipped file changes.
  - $after: 12.9
  - The five built-in prompts as named sections with shipped sha256 values and the locked sections; the per-workspace override file under `~/.config/avoozl/prompts/` with versions, shipped text, diff, hashes, proposal, who and when; person-only `prompt.override.revert`; briefs composed from overrides; agent-prompt overrides as labeled seed sections (F125); the steering template from the override; the outrank line in every brief.
  - Built: `a0a0771` (`src/app/agents/prompts.mjs`, overrides under `~/.config/avoozl/prompts/`; agent prompts split into named sections with Person only and Untrusted data locked).
- [x] 28.2 Prompt and skill proposals in the retro, after 28.1 [R68.1, R68.3–R68.6] (§4.18, F124)
  - $done: Prompt and skill proposals in the retro, after 28.1
  - $done: The retro brief holds unlocked sections and up to 3 skill texts; prompt and skill proposals carry a base hash, a diff and evidence from 3 or more runs; bad diffs, stale bases, missing evidence and locked sections are dropped with reasons; the `proposal` content-rule boundary runs on each.
  - $after: 28.1
  - Retro brief gains unlocked sections with hashes and up to 3 skill texts of 8,000 characters; reply schema adds `prompt` and `skill` with `base`, `diff`, structured `evidence` (3 or more runs) and `lessons`; drop a diff that does not apply, a stale base, missing evidence, or a locked section, each with its reason; the `proposal` content-rule boundary.
  - Built: `a0a0771` (`flow-retro.mjs` `memoryBrief`, `changeProblem`; `proposal` and `lesson` content-rule boundaries).
- [x] 28.3 Approve and where each change lands, after 28.2 [R68.7–R68.11] (§4.18)
  - $done: Approve and where each change lands, after 28.2, 14.10
  - $done: Only a person approves; a prompt change writes an override version, a repository skill change makes one leaf through Deliver this, and an external skill change writes a note on the plugin card; nothing edits a shipped file or a pinned plugin.
  - $after: 28.2
  - Person-only approve (403 for sessions, MCP, app token and plugins); prompt writes override version N; repository skill makes an intake item with source `retro` and one leaf through `intake.deliver`; external skill writes a Suggested change note on the plugin card with Copy; nothing edits a shipped file or a pinned plugin.
  - Built: `a0a0771` (`decideProposal` hooks; repository skill leaf via `deliverRetroSkill` in `intake.mjs`, source `retro`). Tested against fakes in Local only; the GitHub-mode pull request path is not run.
- [x] 28.4 Prompt and skill versions on attempts and PDCA, after 28.3, 12.10 [R68.12, R68.13] (§4.18)
  - $done: Prompt and skill versions on attempts and PDCA, after 28.3, 12.10
  - $done: Each attempt records prompt versions and skill hashes, shown in the receipt and Timing; PDCA compares old and new versions and marks mixed windows; a change that did not help gets a revert proposal.
  - $after: 28.3, 12.10
  - Attempts record `prompts` and `skills` (tool calls first, then the report's optional `skills`); receipt and Timing fold show them; PDCA per version with the "mixed" mark; revert proposals for prompt and skill changes.
  - Built: `a0a0771` (prompt version stamped at bind, skills from `plans_report` `skills`; Timing fold `versions`). Skills from tool-call reads are not wired: only report-listed skills are recorded.


- [x] avoozl-p42 P42 Proof: prompt and skill proposals [R68] (§4.18)
  - $done: Proof: prompt and skill proposals, and lessons
  - $done: Expected: no prompt or skill change applies without a person; locked sections, stale bases and blocked text are refused; overrides stay outside shipped files and revert in one step; repository skill changes land as leaves and external ones as notes; PDCA compares versions; lessons reach another workspace with no source text, honor opt-out, and heal on drift; override drift keeps the override with a rebase proposal; packs and export are person-only.
  - $after: 28.1, 28.2, 28.3, 28.4
  - Setup: isolated temporary workspaces `W1` and `W2` with a fake config directory, each with one repository (`W1`'s with `.kiro/skills/tests/SKILL.md`), declared check `npm test`, and an approved spec with leaves `a1`–`a12`; a fake plugin `p1` whose folder has a skill file and a lessons pack version 1; a fake terms file banning `secretword`; fake workers whose reports name the skills they loaded; the fake retro model and a fake model list.
  - Action: (1) finish 10 tasks in `W1` with a scripted low first-pass rate; let the retro propose a `brief.worker` diff, a diff to the `untrusted-data` section, a repository skill diff, a `p1` skill diff, a diff with a stale base, and one with `secretword`; (2) approve all that stand from an agent session, then as the owner; (3) finish 10 more tasks with first-pass rate up; then 10 in which a second override also takes effect; (4) press Revert on `brief.worker`; (5) set `W2`'s traits to match and finish 10 tasks; read `W2`'s retro brief; (6) set `flow.lessons.read` false in `W2` and run its retro; (7) give a lesson's finding a path and an issue number; (8) drop `npm test` from `W1`'s checks, remove a model from the list, and age a kept lesson past 180 days; then confirm it with fresh runs; (9) run the fifth retro and approve a merge of two lessons; (10) change the shipped `brief.worker` steps section under the override, then a locked section; restart the backend; (11) import `p1`'s pack, then pin version 2 with one lesson changed and one removed; (12) export lessons as the owner and from MCP.
  - Expected: (1) the locked, stale and blocked proposals are dropped with their reasons and no matched text; (2) the agent gets 403; the owner's approval writes override version 1 outside the app's files, makes one leaf in `W1`'s repository that integrates the skill change, and puts a note on `p1`'s card with nothing sent; sessions after approval show the override's version, running ones keep theirs; (3) PDCA marks the prompt change helped and its lesson `kept`, and the second window "mixed"; (4) the shipped text returns and the revert is recorded; (5) `W2`'s brief holds `W1`'s kept lesson first with no task ID, path or repository name from `W1`, and the undone one under "did not work"; (6) `W2`'s brief has only its own lessons; (7) the lesson is refused and the proposal still stands; (8) the lesson goes `stale` or `needs re-check` with each reason, leaves the citable list, and clears when confirmed, each step in its history; (9) the merge appears as a diff for a person and the merged-away lesson stays as history; (10) the override is flagged with a three-way diff and a rebase proposal while sessions keep it with a warning, and the locked section's new text is used at once; (11) import shows a preview first and needs the owner; version 2 marks the changed lesson and retires the removed one; (12) the owner's export passes the content rules and MCP gets 403.
  - Failure means: a retro can change what agents are told without a person, or one workspace's text reaches another through lessons.
  - Share (28.9): (13) in `W1` (plans-repo mode with a fake GitHub) preview a share of the kept lesson and an untested one, share from MCP, then as the owner; (14) set `W2` to Local only and open its Lessons view.
  - Share expected: (13) only the kept lesson is a candidate; MCP gets 403; the owner's share opens one pull request to the plans repository with `.avoozl/lessons.json` holding summaries only (no context, history, workspace ID, task ID or repository name); (14) Share is off and says lessons share nowhere.
  - Next decision: keep prompt proposals and drop shared lessons, or share lessons only through packs.
  - Built: `a0a0771`, `src/app/test/proof-p42.test.mjs`, steps 1–12 with fake workers, a fake retro model, a fake model list and a fake plugin; W1 uses leaves a1–a70 because the steps finish more than 12 tasks. Not run live.
  - Proved: `docs/evidence/p42-retro-live.md` (2026-11-19, steps 1 to 4 and 10 live on a throwaway Kiro Crew); fixes in the same change: the retro prompt says `value` is a number, and an approval names the person.

## Phase 29: Activity log

Requirement 71, design §4.19.

- [x] 29.1 Activity table, helper and screening, after 10.4 [R71.1, R71.4, R71.5, R71.8] (§4.19)
  - $done: Activity table, helper and screening, after 10.4
  - $done: An activity_log table and one recordActivity helper validate, trim and screen each row with the built-in secret and path screens and the activity content boundary; a matched or unchecked row is saved redacted; a test fails if a secret-shaped value is saved.
  - $after: 10.4
  - `activity_log` with a unique `key` for derived rows; `recordActivity` in `src/app/store/activity-log.mjs` validates source and kind, trims the summary to 200 characters, keeps only plain target IDs and `https:` links, screens with the built-in secret and path screens and the `activity` content boundary, and saves a matched or unchecked row redacted; a test fails if a secret-shaped value is saved.
  - Built: `84b92b4`, PR #12 (`src/app/store/activity-log.mjs` `recordActivity`; `src/app/store/test/activity-log.test.mjs`).
- [x] 29.2 Local actions and tick events, after 29.1 [R71.2, R71.3] (§4.19)
  - $done: Local actions and tick events, after 29.1, 14.10
  - $done: The listed local actions record one row each with source local or mcp; the tick records GitHub and plugin closes, board orders, label orders, incoming items, conflicts and reverts once each; recording never fails an action.
  - $after: 29.1
  - `execute` records the listed operations with source `local` or `mcp` and the actor; the tick diffs a snapshot of verdicts, Project item orders, label events, incoming items and conflicts and records each change once by key; the Wave write-back is recorded where it is written; recording never fails the action.
  - Built: `84b92b4`, PR #12.
- [x] 29.3 Retention, `activity.list` and MCP, after 29.2 [R71.6, R71.9] (§4.19)
  - $done: Retention, activity.list and MCP, after 29.2
  - $done: activity.retentionDays defaults to 30 and is saved by a person only; each tick prunes older rows; activity.list filters and pages 100 rows; plans_view action activity reads it and recent keeps the Dashboard timeline.
  - $after: 29.2
  - `activity.retentionDays` (default 30, 1–365) with `activity.settings.get` and person-only `activity.settings.update`; `pruneActivity` on every `workspace.tick`; `activity.list` with filters, 100-row pages and its facets; `plans_view` action `activity` reads it and `recent` keeps the Dashboard timeline.
  - Built: `84b92b4`, `e8c84e7`, PR #12 (`activity.list`, `activity.settings.update`, `pruneActivity`, `plans_view` action `activity`).
- [x] 29.4 Activity tab and the retention setting, after 29.3, 12.11 [R71.7] (§4.19)
  - $done: Activity tab and the retention setting, after 29.3, 12.11
  - $done: The Activity tab uses the shared heading, filter panel and 100-row pages; task rows open the drawer and GitHub links open in a new tab with noopener noreferrer; the tab's Keep activity field sets the retention.
  - $after: 29.3, 12.11
  - The Activity tab with the `History` icon, `ViewHeading`, the shared filter panel (Source, Kind, Actor), 100 rows per page with Show more, task targets that open the drawer and GitHub links with `target="_blank" rel="noopener noreferrer"`; the Keep activity (days) field on the tab, saved by a person.
  - Built: `84b92b4`, `e8c84e7`, PR #12 (`ActivityView.tsx`, Keep activity (days) on the tab; `kirocrew-app/ui/test/activity.test.mjs`).

- [x] avoozl-p43 P43 Proof: activity log [R71] (§4.19)
  - $done: Proof: activity log
  - $done: Expected: every listed local action and tick event makes one row, a change seen twice makes one, secret-shaped and rule-matched values are saved redacted, old rows are pruned on the tick, and the tab and plans_view read the same rows.
  - $after: 29.1, 29.2, 29.3, 29.4
  - Setup: an isolated temporary workspace with one repository, a fake GitHub in single-repo mode with a Project, an approved spec with leaves `a1` and `a2` (`a2` requires `a1`), a fake tracker plugin, and a fake terms file banning `secretword` for every boundary.
  - Action: (1) from the page press Start now on `a1`, pull the Andon cord, resume it, set `a2` to Deferred, save Flow settings, approve the plugin and change the writer model; (2) do one dispatch through MCP; (3) on the fake GitHub merge `a1`'s closing pull request, move `a2` to Deferred as an allowed actor and as another actor, set Wave by hand, apply a trigger label, and edit a managed title; tick twice; (4) add a tracker conflict and a new plugin incoming item; tick; (5) record a row whose summary holds `ghp_` plus 36 letters, and one holding `secretword`; (6) set retention to 1 day, age a row 2 days, and tick; (7) read the Activity tab and `plans_view` action `activity`, filtered by source `github`.
  - Expected: (1) one `local` row each, with the person as actor; (2) one `mcp` row naming the session; (3) one row each for the merge, the order, the ignored move, the revert, the label and the conflict, the same after the second tick; (4) one `plugin` row each; (5) both saved redacted, and no row holds either value; (6) the old row is gone; (7) the tab and MCP show the same rows newest first, a task row opens the drawer and a GitHub row opens a new tab.
  - Failure means: something that changed the workspace leaves no row, or the log can hold a secret or a private term.
  - Next decision: record from each step instead of a snapshot diff, or keep redacted rows out of the log.
  - Proved: `docs/evidence/p43-activity-live.md` (2026-11-19, live on a throwaway Kiro Crew); step 4's tracker conflict is covered by `activity-log.test.mjs`; fixes in the same change: Settings › Models, Delivery and driver saves are recorded, and a repository stop's row names its repository.

## Phase 30: Provider health and switching models

Requirement 72, design §4.20.

- [x] 30.1 Provider health from usage and errors, after 12.12 [R72.1–R72.4, R72.17, R72.18] (§4.20, F127, F128)
  - $done: Provider health from usage and errors, after 12.12
  - $done: Machine-local providers settings are validated and refused in .avoozl.json; usage sums and error rows mark providers and models low or out, storing the kind only; marks clear on a later turn or the cooldown, and a person's only when undone; providers.view reads them; settings save and undo are person-only.
  - $after: 12.12
  - Machine-local `providers` settings (`lowPercent`, `cooldownMinutes`, `windowHours`, `limits`, `groups`, `fallback`) with validation, refused in `.avoozl.json`; `provider_health` rows; usage marks after each usage read; error marks from the timing row read (kind first, then words, kind stored only); recovery by a later turn or the cooldown; person marks until undone; `providers.view` and person-only `providers.settings.update` and `provider.health.clear`.
  - Built: `bd54c3e`, PR #13 (`src/app/flow/provider-health.mjs`, `providers.view`, `providers.settings.update`, `provider.health.clear`).
- [x] 30.2 New work skips out models, after 30.1 [R72.5, R72.6] (§4.20)
  - $done: New work skips out models, after 30.1, 11.11
  - $done: New tasks drop out and then low choices, fall back to the replacement or providers.fallback, never take a review role's model, and wait with a reason when nothing is healthy; retries keep a model until it is out; the path without rules does the same; Preview shows it; with no settings nothing changes.
  - $after: 30.1
  - `chooseSession` drops `out` and then `low` choices; the replacement, then `fallback`, for no rule or nothing left; never a review role's model; wait with a reason when nothing is healthy; retries keep a model until it is out; the dispatch path without rules does the same; Preview shows it.
  - Built: `bd54c3e`, PR #13 (session pins).
- [x] 30.3 Switch running chats, after 30.1 [R72.8–R72.11] (§4.20, F126)
  - $done: Switch running chats, after 30.1
  - $done: Live tick chats on an out model switch through POST /api/chat/slots/<slot>/model in the same session, deferred to the next turn when busy; the binding records the switch; each switch is a provider_switches record passed to the activity hook; a refusal is not retried; the served-model gate counts every model a switched chat ran on.
  - $after: 30.1
  - The backend's pass over live tick sessions on an `out` model; target choice; `POST /api/chat/slots/<slot>/model`; `deferred` read as switching at the next turn; binding `model` and `switches`; `provider_switches` records and the `onSwitchRecorded` activity hook writing one `model.switch` row per record; a refusal not retried; the served-model gate across switches.
  - Built: `bd54c3e`, PR #13 (the backend pass, `provider_switches`, `onSwitchRecorded`).

- [x] avoozl-p44 P44 Proof: provider health and switching [R72] (§4.20)
  - $done: Proof: provider health and switching
  - $done: Expected: no task opens on an out model; low and out choices are skipped and retries keep a model until it is out; running chats on an out model switch in the same session at the next turn and each switch is recorded; the review gate holds across a switch; the manual switch previews, refuses a stale hash and marks new tasks only when asked; only a person can switch, undo or save; Needs you shows out marks; with no settings nothing changes.
  - $after: 30.1, 30.2, 30.3
  - Setup: an isolated temporary workspace with one repository and fake crews; machine `providers` with `limits` `alpha-1` 100 credits, `fallback` `gamma-1`, `cooldownMinutes` 30; a review role on `delta-1` with `distinctFrom: model`; a fake usage feed, fake session rows, and a fake Kiro Crew model change that answers `deferred` for a busy chat and 404 for one slot.
  - Action: (1) with no `providers`, tick and preview; (2) feed `alpha-1` 85 credits; tick; (3) feed 20 more; read health; tick; (4) feed a session row of kind `usage_limit` from a `beta-1` chat, then a 429 row twice from an `alpha-2` chat; (5) let 31 minutes pass, and feed a later `beta-1` turn; (6) retry a task whose kept model is `alpha-1` while it is low, then while it is out; (7) run the backend pass with `alpha-1` out and chats on it, one busy and one whose slot answers 404; (8) review a switched writer; (9) preview and confirm Switch model from provider `alpha` to `gamma-1` with Also new tasks, then confirm with a stale hash; (10) call the switch, undo and settings save from MCP, an app token and an agent tool; (11) read Needs you; undo the mark.
  - Expected: (1) picks match the earlier ticks exactly; (2) `alpha-1` is low and new tasks take `beta-1`; (3) `alpha-1` is out, no new session opens on it, and Preview says why; (4) provider `beta` is out and `alpha-2` goes low then out, with no row text stored; (5) both clear; (6) the retry keeps `alpha-1` while low and moves off it when out, saying so; (7) both chats are asked to switch to a healthy model not on the review role's model, the busy one is recorded `deferred`, the refused one `refused` once and never retried, the sessions and worktrees are untouched, and each switch reaches the activity hook; (8) the verdict counts and is refused only when a reviewer model equals one of the writer's; (9) preview writes nothing, the confirm queues one switch per chat and marks the provider out with `gamma-1` for new tasks, and the stale hash gets 409; (10) every call is refused, MCP with the person-only refusal; (11) one `provider-out` item per out mark shows the switched count, and Undo clears the person's mark.
  - Failure means: a task can open on an out provider, a switch loses a chat's work, or a non-person can switch models.
  - Next decision: switch by opening a new session on the same branch instead, or mark health only from errors.
  - Built: pass, `src/app/test/proof-p44.test.mjs` (`e56ddc8`, `bd54c3e`), PR #13.

## Phase 31: Stop all agents and searchable pickers

Requirements 64.12–64.16 and 73, design §4.11 and §8.9.

- [x] 31.1 Stop all agents in the backend and CLI, after 24.1 [R64.12, R64.14–R64.16] (§4.11)
  - $done: Stop all agents in the backend and CLI, after 24.1
  - $done: A person-only full stop stops every running session Avoozl opened, keeps worktrees, marks attempts Interrupted by stop without spending a retry, and Resume re-dispatches each on the same branch, agent and model.
  - $after: 24.1
  - `flow.stop {full: true}` is person only (MCP refused), needs the app backend's session stopper, records a full `all` stop with the sessions it stopped, stops each live tick-opened session, marks stopped bindings and attempts "Interrupted by stop" without spending a retry, holds checks and review sessions while open; Resume turns interrupted deliveries back to `failed` so the next tick re-dispatches on the same worktree, agent and model with a brief that says so; `avoozl flow stop --full`.
  - Built: `75a61e3`, PR #11 (`flow.stop {full: true}`, Interrupted by stop in `src/app/delivery/delivery.mjs`, `avoozl flow stop --full`; `src/app/flow/test/flow-full-stop.test.mjs`).
- [x] 31.2 Stop all agents in the dialog, after 31.1, 24.2 [R64.12, R64.13] (§4.11)
  - $done: Stop all agents in the dialog, after 31.1, 24.2
  - $done: The dialog offers Stop the line and Stop all agents, and the full stop's confirm warns that replies in progress are lost and saved files are kept.
  - $after: 31.1, 24.2
  - The dialog's two choices, the full stop's confirm warning that replies in progress are lost and saved files are kept, and the banner's count of stopped chats.
  - Built: `2456191`, PR #11 (`StopLine.tsx`).
- [x] 31.3 One searchable picker for tasks and specs, after 24.2 [R73] (§8.9)
  - $done: One searchable picker for tasks and specs, after 24.2
  - $done: Every task and spec choice uses one keyboard-accessible combobox that matches ID, title and spec, shows state, and stays fast with 5,000 tasks.
  - $after: 24.2
  - `Picker.tsx` combobox with ID, title and spec matching, state badges, the keys and ARIA of §8.9, and at most 50 rendered results; used in the Stop the line target, the filter panels and Start now; a test filters 5,000 tasks.
  - Built: `2456191`, PR #11 (`Picker.tsx`, `picker.ts`; `kirocrew-app/ui/test/picker.test.mjs`).

## Phase 34: Investigate first, evidence, staying current, rules, fix share, ship mode

Requirements 75–80, design §4.11 and §4.21–§4.25.

- [x] 34.1 Findings, falsifier and the confidence gate, after 12.9 [R75] (§4.21)
  - $done: Findings, falsifier and the confidence gate
  - $done: A leaf's worker reports findings with no file changes, a read-only falsifier on another model replies, and coding starts only when both reach the confidence gate; otherwise the task waits in Needs you.
  - $after: 12.9
  - `plans_report` kind `findings`; the `falsifier` role and session; the gate; the Needs you item with Go ahead, Investigate again and Stop; `delivery.investigate` settings and manifest `investigate`; Flow spans and budget.
  - Built: PR #42 (`src/app/delivery/investigate.mjs`, agent `avoozl-falsifier`, person-only `investigation.decide`, Flow stages `investigate` and `falsify`; a findings report with a changed worktree and a done before Go ahead are refused 409). The binding carries `investigate`, so a session bound by hand or by a Crew Mode conductor is not gated. The falsifier's usage counts toward the task's budget like any session bound to it.
- [x] 34.2 Evidence bundle, after 34.1, 22.3 [R76] (§4.22)
  - $done: Evidence bundle
  - $done: Each task has one screened local evidence bundle shown in the drawer and summarized in one pull request comment.
  - $after: 34.1, 22.3
  - The local bundle, `plans_report` field `evidence`, screening, `task.evidence`, the drawer section, the pull request comment, and the driver export.
  - Built: PR #42 (`src/app/tasks/evidence.mjs`, content boundary `evidence`, `Evidence.tsx` in the drawer, `evidenceCommentStep` in the tick, `evidence` in the driver export). `github.evidence.attach` is not built: GitHub's API has no comment upload.
- [x] 34.3 Bring pull requests up to date, after 15.4 [R77] (§4.23)
  - $done: Bring pull requests up to date
  - $done: When the base branch moves, each conflicting or behind pull request's writer gets one message to merge it in, and no brief can ask for a force push.
  - $after: 15.4
  - Base head tracking, the `base-moved` feedback message, the force-push refusal, and the local merge-forward.
  - Built: PR #42 (`baseHead`, `mergeState` and `reviewDecision` in the pull request reads; `base-moved` in `src/app/github-feedback.mjs`; `asksForcePush` in `briefAllowed` and the tick; `rebaseForIntegration` merges forward). The stacked pull request brief and the commit-message leak message no longer ask for a force push.
- [x] 34.4 Corrections and rules, after 28.3 [R78] (§4.24)
  - $done: Corrections and rules
  - $done: The same correction on two tasks makes one rule proposal; approval lands it as a steering leaf.
  - $after: 28.3
  - The `corrections` table and its four sources, the retro grouping and rule proposal, the steering leaf, and corrections in Flow and PDCA.
  - Built: PR #42 (`src/app/flow/corrections.mjs`; changes requested from pull request feedback, `delivery.retry` with `reason`, reverts read from the landing branch; retro proposal type `rule` and `deliverRetroRule`). shortcut: PDCA matches later corrections by kind and repository, not by meaning; the next retro reads them and judges.
- [x] 34.5 Fix-work share, after 12.11 [R79] (§4.11)
  - $done: Fix-work share
  - $done: Flow shows fix tasks over finished tasks as a card and in the charts.
  - $after: 12.11
  - The fix-work rule, the Flow card and charts, and the retro payload.
  - Built: PR #42 (`isFixWork`, `metrics.fixWork`, `fixShare` per day and week, `fixWork` in the retro payload; leaves of a bugfix spec carry `specType`, and issue intake keeps the issue type).
- [x] 34.6 Ship mode, after 15.4 [R80] (§4.25)
  - $done: Ship mode
  - $done: With delivery.ship manual, writers do not enable auto-merge and Needs you shows Ready to merge; auto-merge stays the default.
  - $after: 15.4
  - `delivery.ship` in workspace and repository settings, the briefs, the Ready to merge item, and Integrate in Local only; Settings > Delivery shows it.
  - Built: PR #42 (`shipMode` with task, spec, repository and workspace values; `ready-to-merge` in Needs you; person-only `delivery.integrate`; closed without merging goes back to the writer; the radio fold-out in `DeliverySettings.tsx`).

- [x] avoozl-p45 P45 Proof: investigate first, evidence, staying current, rules, fix share and ship mode [R75–R80] (§4.21–§4.25)
  - $done: P45 Proof
  - $done: P45 passes with fake workers, a fake falsifier and a fake GitHub.
  - $after: 34.1, 34.2, 34.3, 34.4, 34.5, 34.6
  - Setup: an isolated temporary workspace in single-repo mode on a fake GitHub with leaves `a1` (plain), `a2` (`investigate: false`) and `a3` (plain), a bugfix spec with leaf `f1`, fake workers and a fake falsifier.
  - Action: (1) dispatch `a1` with findings at `high` and a `stands` reply; (2) dispatch `a3` with a `refuted` reply; press Investigate again, then Go ahead; (3) dispatch `a2`; (4) attach a screenshot and a 30 MB file to `a1`; (5) move the base branch so `a1`'s pull request conflicts; (6) request changes with the same point on `a1` and `a3`; run the retro; approve its rule; (7) finish `f1`; read Flow; (8) set `delivery.ship` to `manual` and let `a3`'s checks pass.
  - Expected: (1) no file changes before the gate, then coding; (2) the task waits in Needs you, one new round, then coding; (3) no investigation; (4) the screenshot is in the drawer and the comment, the large file refused; (5) one `base-moved` message, a merge commit and no force push; (6) one rule proposal naming both corrections and one steering leaf; (7) fix-work share 1 of 3; (8) no auto-merge, one Ready to merge item, and completion after the person merges.
  - Failure means: coding starts on refuted findings, a writer force pushes, or a manual ship merges without a person.
  - Next decision: keep the falsifier only for large tasks, or drop the PR comment and keep evidence local.
  - Built: pass with fakes, `src/app/test/proof-p45.test.mjs` and `src/app/test/phase34.test.mjs`, PR #42. Not run live: no real falsifier chat, GitHub pull request, base move or merge has run yet.

## Phase 35: Review a task's changes in the drawer

Requirement 81, design §8.10.

- [x] 35.1 Read a task's changed files and diffs, after 2.6 [R81.4–R81.6] (§8.10)
  - $done: Read a task's changed files and diffs, after 2.6
  - $done: task.files and task.diff read with Git only, refuse paths outside the task's worktree and option-shaped inputs, cap their output, and MCP may call both.
  - $after: 2.6
  - `task.files` and `task.diff` in `src/app/tasks/task-files.mjs`, observe-classified so MCP and app tokens may call them; path and argument rules; size caps; `src/app/tasks/test/task-files.test.mjs`.
  - Built: `4d0b101`.
- [x] 35.2 Files fold in the task drawer, after 35.1 [R81.1–R81.3] (§8.10)
  - $done: Files fold in the task drawer, after 35.1
  - $done: The drawer's Files fold shows the changed-file tree with badges and counts, Show all files, unified and split diffs with summaries for binaries and large files, Open in editor links (Kiro by default), and the GitHub branch for remote tasks.
  - $after: 35.1
  - `TaskFiles.tsx` and `files-api.ts`: the tree with badges and counts, Show all files, unified and split diffs, summaries, Open in editor with the editor choice, and the GitHub branch link; `kirocrew-app/ui/test/task-files.test.mjs`, `task-files-browser.test.mjs`, screenshots in `docs/evidence/task-files/`.
  - Built: `3505ff3`.

- [x] avoozl-p46 P46 Proof: review a task's changes in the drawer [R81] (§8.10)
  - $done: Proof: review a task's changes in the drawer
  - $done: Expected: each change has its badge and counts; text diffs show and binaries, large files and links are summarized; every path or option-shaped input outside the rules is refused and nothing outside the worktree is read or written; a removed worktree reads the branch; MCP gets both reads; the fold draws unified and split diffs and editor links follow the choice.
  - $after: 35.1, 35.2
  - Setup: an isolated temporary workspace with one repository and task `a`'s worktree with a file added, changed, deleted, renamed, a binary and an untracked file; the harness page for the fold.
  - Action: (1) read `task.files`, with and without `all`; (2) read each file's `task.diff`; (3) ask for paths with `..`, absolute, drive, backslash, `.`, empty, NUL, `.git`, pathspec magic and option shapes, and a link out; set an option-shaped base branch; (4) remove the worktree and read again; call both from MCP; (5) open the fold, click a file, choose Split, switch the editor and Show all files.
  - Expected: (1) each change has its badge and counts; (2) text diffs show, binaries, large files and links are summarized; (3) each is refused and nothing outside is read or written; (4) the branch is read and MCP gets both; (5) the diff draws both ways and every editor link follows the choice.
  - Failure means: a read leaves the worktree or an input reaches Git as an option.
  - Next decision: drop untracked files, or read diffs through a provider instead of local Git.
  - Built: pass, `src/app/tasks/test/task-files.test.mjs`, `kirocrew-app/ui/test/task-files.test.mjs`, `kirocrew-app/ui/test/task-files-browser.test.mjs`.

## Phase 36: Demo mode

Requirement 82, design §6.11.

- [x] 36.1 Demo sample, fake GitHub and preview gate [R82.1–R82.4, R82.7] (§6.11)
  - $done: Demo sample, fake GitHub and preview gate, after 3.7
  - $done: The sample installs once and whole, keeps edits, previews every change, and no GitHub write or agent start is reachable.
  - `src/app/workspace/demo.mjs` staged once-only install, the fake GitHub and the gate; `demo.start`, `demo.exit`, `demo.status` and `@demo` in the app backend; `src/app/workspace/test/demo.test.mjs`.
- [x] 36.2 Demo badge, bar, tour and exit, after 36.1, 31.3 [R82.3] (§6.11)
  - $done: Demo badge, bar, tour and exit, after 36.1, 31.3
  - $done: The tour walks the nine pages with keys and reduced motion, a change shows its preview, and Exit demo returns to the person's workspace.
  - $after: 36.1, 31.3
  - `host.ts`, `demo-api.ts`, `Demo.tsx` and the App wiring; `kirocrew-app/ui/test/demo-tour.test.mjs` with tour, keys, preview, exit and layout at 320, 768 and 1280 px, light and dark.
- [x] 36.3 README and screenshots, after 36.2 [R82] (§6.11)
  - $done: README and screenshots, after 36.2
  - $done: The README says how to start the demo, and screenshots show it at three widths in light and dark.
  - $after: 36.2
  - README says how to start it; `docs/evidence/demo/`.

## Phase 37: Security follow-ups

Requirement 83, design §6.12.

- [x] 37.1 CLI refuses person-only operations in an agent session [R83.1, R83.2] (§6.12)
  - $done: CLI refuses person-only operations in an agent session
  - $done: The CLI refuses person-only operations in an agent session unless --as-person is given.
  - `agentSession`, `cliRefusal`, `--as-person`; `src/app/cli/test/cli-person-only.test.mjs`; request draft in `docs/kirocrew-requests/`.
- [x] 37.2 Private folder, database, backups and exports [R83.3] (§6.12)
  - $done: Private folder, database, backups and exports
  - $done: The folder, database, backups and exports are private files.
  - `Store`, `privateFile`; `src/app/test/security-audit.test.mjs`.
- [x] 37.3 Name repository-owned code; approve the worktree helper's hash [R83.4] (§6.12)
  - $done: Name repository-owned code; approve the worktree helper's hash
  - $done: Repository-owned code is named in docs/policies.md, and the worktree helper runs only at its approved hash.
  - `docs/policies.md`; `worktreeHelper` in `git.mjs` and repository settings; same test file.
- [x] 37.4 Hash a local plugin again before it starts [R83.6] (§6.12)
  - $done: Hash a local plugin again before it starts
  - $done: A local plugin is hashed again before it starts.
  - `pluginHost`; `src/app/plugins/test/plugins.test.mjs`.
- [x] 37.5 Opt-in `checksEnv` allowlist [R83.5] (§6.12)
  - $done: Opt-in `checksEnv` allowlist
  - $done: Checks see only the environment variables the opt-in checksEnv allowlist names.
  - `repositoryEnvironment`, `commandEvidence`, repository settings; same test file as 37.2.

## Phase 40: Unattended basics

Requirements 86, 88, design §4.26.

- [x] 40.1 Worker brief edits and reports only, after avoozl-p56 [R86.3, R96] (§4.26)
  - $done: Worker brief edits and reports only
  - $done: The brief drops push, PR, auto-merge, merge and comment steps. Avoozl commits sandboxed process results; chats/people may commit locally. Read HEAD from the worktree, never from a report. A prompt test enforces this boundary.
  - $after: avoozl-p56
  - The brief drops push, PR, auto-merge, merge and comment steps. Avoozl commits sandboxed process results; chats/people may commit locally. Read HEAD from the worktree, never from a report. A prompt test enforces this boundary.

- [x] 40.2 Report by CLI, matched by worktree and token, after avoozl-p56 [R88.2, R88.3, R96.4] (§4.26)
  - $done: Report by CLI, matched by worktree and token
  - $done: Use `avoozl runner report TASK done|blocked` for chats and people. Carry the worktree path and token in the brief; local chats use project: false. Test wrong tokens/worktrees and reporting without MCP sharing.
  - $after: avoozl-p56
  - Use `avoozl runner report TASK done|blocked` for chats and people. Carry the worktree path and token in the brief; local chats use project: false. Test wrong tokens/worktrees and reporting without MCP sharing.
  - Built: `src/app/workers/report-match.mjs` (token is an HMAC of task and attempt; worktree match resolves symlinks), the worktree path and `avoozl runner report TASK done|blocked --token T` in the local worker brief (`localSteps`), and the CLI branch in `src/app/cli/cli.mjs` (`--token` or `AVOOZL_REPORT_TOKEN`; the old `--state` forms still run). Tests: `src/app/workers/test/report-match.test.mjs`, `report-cli.test.mjs`; 52.1 tests unchanged. The brief carries the CLI report for a tick-opened local worker; a Crew Mode relay brief is unchanged.

- [x] 40.3 Trust mode set at open and again every tick, after avoozl-p56 [R88.1] (§4.26)
  - $done: Trust mode set at open and again every tick
  - $done: A fake Kiro Crew that drops trust on restart; the next tick sets it again, once per chat.
  - $after: avoozl-p56
  - A fake Kiro Crew that drops trust on restart; the next tick sets it again, once per chat.
- [x] 40.4 Prepare with the worktree helper and clean up after landing, after avoozl-p56 [R88.6] (§4.26)
  - $done: Prepare with the worktree helper and clean up after landing
  - $done: First caller of `createWorktree` in `src/app/git/git.mjs`; worktree and local branch removed after landing, kept otherwise.
  - $after: avoozl-p56
  - First caller of `createWorktree` in `src/app/git/git.mjs`; worktree and local branch removed after landing, kept otherwise.
- [x] 40.5 Verify: warm checks off the tick, per-check timeouts, declared and protected paths, after 40.1 [R86.6, R86.7] (§4.26)
  - $done: Verify: warm checks off the tick, per-check timeouts, declared and protected paths
  - $done: Checks run as their own job in the task worktree; a timeout fails with its reason; a file outside declared paths is refused; a protected path goes to Needs you.
  - $after: 40.1
  - Checks run as their own job in the task worktree; a timeout fails with its reason; a file outside declared paths is refused; a protected path goes to Needs you.
- [x] 40.6 One automatic resume for a vanished chat, after 40.2 [R88.4] (§4.26)
  - $done: One automatic resume for a vanished chat
  - $done: Only Kiro Crew's "gone" answer resumes; quiet and an expired lease do nothing; a second vanish opens Needs you.
  - $after: 40.2
  - Only Kiro Crew's "gone" answer resumes; quiet and an expired lease do nothing; a second vanish opens Needs you.
  - Built: `reconcileDeliveries` in `src/app/delivery/delivery.mjs` ends the first gone attempt since the last person retry as `vanished` (outside the retry count) and marks its binding lost, so the next tick opens attempt 2 in the same worktree with the last report quoted; a second vanish, or a gone batch, opens the decision. Test: `src/app/test/stock-kirocrew.test.mjs`.
- [x] 40.7 Lanes: 3 on this Mac by default, after avoozl-p56 [R88.5] (§4.26)
  - $done: Lanes: 3 on this Mac by default
  - $done: `lanes.local` default 3; a fourth ready task waits.
  - $after: avoozl-p56
  - `lanes.local` default 3; a fourth ready task waits.

- [x] avoozl-p50 P50 Proof: a three-task chain survives a gateway restart unattended, after 40.1, 40.2, 40.3, 40.4, 40.5, 40.6, 40.7, 41.1, 41.2, 41.3, 41.5, 41.9 [R86, R87.10, R88] (§4.26)
  - $done: Proof: a three-task chain survives a gateway restart unattended
  - $done: Expected: (1) each task lands in order with its checks recorded; (2) trust is set again, task 2 goes on in the same worktree, no second chat unless Kiro Crew says it is gone; (3) the tick push goes through Kiro Crew's push policy; worktrees removed after landing.
  - $after: 40.1, 40.2, 40.3, 40.4, 40.5, 40.6, 40.7, 41.1, 41.2, 41.3, 41.5, 41.9
  - Setup: an isolated Kiro Crew home, a scratch repository with a bare remote, a three-task chain, landing `direct`.
  - Action: (1) start the chain and leave it; (2) restart the gateway while task 2 works; (3) let the tick push the base.
  - Expected: (1) each task lands in order with its checks recorded; (2) trust is set again, task 2 goes on in the same worktree, no second chat unless Kiro Crew says it is gone; (3) the tick push goes through Kiro Crew's push policy; worktrees removed after landing.
  - Failure means: the loop still needs a person, or the push policy blocks the tick.
  - Next decision: if the policy blocks the tick, land with `pr` only until Kiro Crew allows it.
  - Proved: docs/evidence/proof-p50.md. (run 3, spec relay).

## Phase 41: Scheduler and direct landing

- [x] 41.1 Schedule spec drivers with repository-wide path holds, after 40.5 [R86.2, R86.5, R86.9, R102.3] (§4.32)
  - $done: Schedule spec drivers with repository-wide path holds
  - $done: Use unblock ranking, current spec authority, and repository-wide path holds. A dependency releases its successors once its tick reaches the base branch.
  - $after: 40.5
  - Use unblock ranking, current spec authority, and repository-wide path holds. A dependency releases its successors once its tick reaches the base branch.

- [x] 41.2 Per-base landing queue with brief integration locks, after 40.5 [R87.5, R102.9] (§4.32)
  - $done: Per-base landing queue with brief integration locks
  - $done: Preserve order on Stop the line; perform checks outside the integration lock, guard only ref movement and push. Test a concurrent base move cannot land an unchecked candidate.
  - $after: 40.5
  - Preserve order on Stop the line; perform checks outside the integration lock, guard only ref movement and push. Test a concurrent base move cannot land an unchecked candidate.

- [x] 41.3 Direct portions and bounded landing trains, after 41.2 [R87.1, R87.2, R87.4, R87.9, R102.8, R102.9] (§4.32)
  - $done: Direct portions and bounded landing trains
  - $done: Select exact verified portions, merge/check the current base and guard the fast-forward. Up to four tasks per train; bisect failures. Merge declared append-only union paths only in the landing worktree. Check outgoing data before every push; never force push.
  - $after: 41.2
  - Select exact verified portions, merge/check the current base and guard the fast-forward. Up to four tasks per train; bisect failures. Merge declared append-only union paths only in the landing worktree. Check outgoing data before every push; never force push.

- [x] 41.4 Conflicts go back to the same chat, bounded; remove the resolver chat, after 41.3 [R87.6] (§4.26)
  - $done: Conflicts go back to the same chat, bounded; remove the resolver chat
  - $done: The conflicted file list in the brief; `landing.conflictRounds` default 2; then Needs you; `avoozl-conflict-fix` removed.
  - $after: 41.3
  - The conflicted file list in the brief; `landing.conflictRounds` default 2; then Needs you; `avoozl-conflict-fix` removed.
  - Built: `src/app/landing/landing-conflicts.mjs` (`conflictRounds`, `conflictMessage`, `sendConflictBack`), `landing.conflictRounds` in the config schema and `layered-config.mjs`, tests `src/app/landing/test/landing-conflicts.test.mjs`. Not wired into the tick, which does not call `landNext` yet. `avoozl-conflict-fix` and `radar-conflict-fix.mjs` stay until Phase 45 removes the Radar path, because that code still dispatches the agent.
- [x] 41.5 Prepare from spec working heads and merge landed bases back, after 41.3 [R87.7, R102.4, R102.9] (§4.32)
  - $done: Prepare from spec working heads and merge landed bases back
  - $done: Generalize RC16 from epic-only integration; Prepare and qualified-ref resolution agree on the exact spec base. Merge the landed target back with a merge commit; preserve verified but unlanded portions and unfinished task refs.
  - $after: 41.3
  - Generalize RC16 from epic-only integration; Prepare and qualified-ref resolution agree on the exact spec base. Merge the landed target back with a merge commit; preserve verified but unlanded portions and unfinished task refs.

- [x] 41.6 Restore the Delivery page and the Files and diff view, after 41.3 [R88.7] (§4.26)
  - $done: Restore the Delivery page, Settings › Budgets and the Files and diff view
  - $done: From ba04389 and 70c2236, updated to the new loop; screenshots for the owner.
  - $after: 41.3
  - From ba04389 and 70c2236, updated to the new loop; not Routing; screenshots for the owner.
- [ ] 41.8 Nupp AGENTS.md clause for Avoozl-run work, after 41.3 [R94.4a] (§4.26)
  - $done: Nupp AGENTS.md clause for Avoozl-run work
  - $done: A proposed Nupp AGENTS.md clause, checked against the core-dev copy, says Avoozl-run work edits, commits nothing or only locally, and stops: no merge, push or worktree removal.
  - $after: 41.3
  - Nupp's AGENTS.md tells agents to rebase, fast-forward merge, push and delete the worktree. Propose a clause for work Avoozl runs: edit, commit nothing (or only locally, as the repository config says), and stop; no merge, push or worktree removal. Check the copy on `core-dev`, not only `main`. Proposed as a Nupp change, not made from Avoozl's repository.
- [ ] 41.7 Nupp setup: `direct` on public `core-dev` with the repository's helper and check, after 41.3 (§4.26)
  - $done: Nupp setup: `direct` on public `core-dev` with the repository's helper and check
  - $done: `scripts/worktree` approved by hash, `scripts/test-changed` as the check; plans stay in a private planning workspace; no mirror or forward.
  - $after: 41.3
  - `scripts/worktree` approved by hash, `scripts/test-changed` as the check; plans stay in a private planning workspace; no mirror or forward.

- [x] 41.9 The tick lands `direct` portions through the landing queue, after 41.3, 42.6 [R87.1, R87.2, R88.6] (§4.26)
  - $done: The tick lands `direct` portions through the landing queue
  - $done: A verified task in a repository with landing `direct` is queued as one portion. Each tick runs `landNext` with `directSteps` per base: checks on the merged candidate, then a guarded fast-forward push, never forced. Landed marks the task integrated at the candidate, fast-forwards the local base and removes the task worktree and branch; failed checks go back to the chat. Real git test with a bare remote; no live write.
  - $after: 41.3, 42.6
  - A verified task in a repository with landing `direct` is queued as one portion; each tick runs `landNext` with `directSteps` per base (checks on the merged candidate, then a guarded fast-forward push, never forced). Landed marks the task integrated at the candidate, fast-forwards the local base and removes the task worktree and branch; failed checks go back to the chat.
  - Built: `src/app/landing/direct-landing.mjs` (`queueDirect`, `landDirect`), called from `integrateVerified` and the tick. Test: `src/app/landing/test/direct-landing.test.mjs` (real git, bare remote).

- [ ] avoozl-p51 P51 Proof: the 13 Nupp pilot tasks land direct, after 41.1, 41.2, 41.3, 41.4, 41.5, 41.6, 41.7, 41.8, avoozl-p50 [R86, R87] (§4.26)
  - $done: Proof: the 13 Nupp pilot tasks land direct
  - $done: Expected: each task lands on public `core-dev` after its checks; no private text in any commit message, branch name or added line; a receipt per task with owner minutes, credits and wall-clock.
  - $after: 41.1, 41.2, 41.3, 41.4, 41.5, 41.6, 41.7, 41.8, avoozl-p50
  - Setup: the Nupp compiler checkout, a private planning workspace with the 13 pilot tasks approved, landing `direct` on `core-dev`.
  - Action: release the pilot and leave it running.
  - Expected: each task lands on public `core-dev` after its checks; no private text in any commit message, branch name or added line; a receipt per task with owner minutes, credits and wall-clock.
  - Failure means: the loop needs the owner more than it saves, or something private reached the public branch.
  - Next decision: tune lanes, checks or the brief from the receipts, or stop direct landing for Nupp.

## Phase 42: PR landing and the setup command

- [x] 42.1 PR portions from target repositories or forks, after 41.3, 56.7 [R87.3, R87.4, R102.6, R102.12] (§4.32)
  - $done: PR portions from target repositories or forks
  - $done: Open/reuse the PR from an exact verified source head without an upstream copy. Update only the queue head and writable source. Enforce that PR head's required checks and standing reviews; record actual approvers and merger. Without target merge permission, observe an authorized maintainer's merge. No protected-review trains.
  - $after: 41.3, 56.7
  - Open/reuse the PR from an exact verified source head without an upstream copy. Update only the queue head and writable source. Enforce that PR head's required checks and standing reviews; record actual approvers and merger. Without target merge permission, observe an authorized maintainer's merge. No protected-review trains.

- [x] 42.2 Setup target and source access in one preview, after 42.1 [R89.1, R89.2, R89.4] (§4.32)
  - $done: Setup target and source access in one preview
  - $done: Preview registered code/plan roots, target/base, trusted forks and separate push/merge access. Do not create task labels, Project or issue types. Publish issue is a separate spec action; a no-change retry writes nothing.
  - $after: 42.1
  - Preview registered code/plan roots, target/base, trusted forks and separate push/merge access. Do not create task labels, Project or issue types. Publish issue is a separate spec action; a no-change retry writes nothing.

- [x] 42.3 Setup: ruleset update without duplicates, merge methods, CI variable, commit status, after 42.2 [R89.3] (§4.26)
  - $done: Setup: ruleset update without duplicates, merge methods, CI variable, commit status
  - $done: First caller of `createCommitStatus`; a fake GitHub test that a ruleset with the rule gets no second one.
  - $after: 42.2
  - First caller of `createCommitStatus`; a fake GitHub test that a ruleset with the rule gets no second one.
- [ ] 42.4 Review Avoozl repository settings against owner policy, after 42.3 [R87.8] (§4.26)
  - $done: Review Avoozl repository settings against owner policy
  - $done: Owner-only: preview and report the current landing/check policy. Preserve the owner's disabled required-CI gate; do not restore three required checks automatically. Apply a real settings change only if explicitly authorized.
  - $after: 42.3
  - $manual: true
  - Owner-only: preview and report the current landing/check policy. Preserve the owner's disabled required-CI gate; do not restore three required checks automatically. Apply a real settings change only if explicitly authorized.

- [x] 42.6 The tick lands `pr` portions through the landing queue, after 42.1, 42.3, 41.4 [R87.3, R87.4, R87.5, R87.6, R89.3] (§4.26)
  - $done: The tick lands `pr` portions through the landing queue
  - $done: A verified task in a repository with landing `pr` is pushed to its task branch (`pushHead`, never forced) and queued as one portion. Each tick runs `landNext` with `pullSteps` per base. Landed marks the task integrated at the merge commit; failed checks send the task back to its chat; a conflict uses `sendConflictBack`. `direct` and `off` keep today's path. Fake GitHub and git test; no live write.
  - $after: 42.1, 42.3, 41.4
  - A verified task in a repository with landing `pr` is pushed to its task branch (`pushHead`, never forced) and queued as one portion. Each tick runs `landNext` with `pullSteps` per base. Landed marks the task integrated at the merge commit; failed checks send the task back to its chat; a conflict uses `sendConflictBack`. `direct` and `off` keep today's path. Fake GitHub and git test; no live write.
- [x] 42.7 `avoozl setup REPO`: one preview, `--yes` applies, after 42.2, 42.3 [R89.1, R89.2, R89.3] (§4.26)
  - $done: `avoozl setup REPO`: one preview, `--yes` applies
  - $done: CLI over `previewAccess` and `previewLanding`: prints every change, writes only with `--yes`, and a second run prints "Nothing to change" and writes nothing. Writes the repository's landing setting and checks. The old Radar `github setup` stays as it is.
  - $after: 42.2, 42.3
  - CLI over `previewAccess` and `previewLanding`: prints every change, writes only with `--yes`, and a second run prints "Nothing to change" and writes nothing. Writes the repository's landing setting and checks. The old Radar `github setup` stays as it is.

- [x] avoozl-p52 P52 Proof: ten tasks land through pull requests on a repository with a required check, after 42.1, 42.2, 42.3, 42.6, 42.7 [R87, R89] (§4.26)
  - $done: Proof: ten tasks land through pull requests on a repository with a required check
  - $done: Expected: ten pull requests merge one at a time after the check passes on each head; the moved base is merged in and checked again; the failed task goes back to its chat; no force push; setup run again changes nothing.
  - $after: 42.1, 42.2, 42.3, 42.6, 42.7
  - Setup: a scratch GitHub repository set up by `avoozl setup` with one required check.
  - Action: release ten tasks; move the base during one; make one check fail.
  - Expected: ten pull requests merge one at a time after the check passes on each head; the moved base is merged in and checked again; the failed task goes back to its chat; no force push; setup run again changes nothing.
  - Failure means: a merge on an unchecked head, a second ruleset rule, or a force push.
  - Next decision: keep `pr` as the default for repositories with required checks.

## Phase 44: Links to related GitHub items, and the landing queue

- [x] 44.1 One link set per spec and task from stored records, after 40.4, 41.2, 42.6, 56.2, 56.3, 56.8 [R92.1, R92.2, R92.3] (§4.27)
  - $done: One link set per spec and task from stored records
  - $done: Pure read model over the spec issue, spec working branch, task branch and worktree, task PR and check state from landing, landed commit from delivery records, and intake/escalation issues. URLs come from validated repository, number, ref and SHA fields only.
  - $done: Missing records show as none; check state carries head SHA and age, and a non-current head is never shown as current. A counting-client test asserts the GitHub call count is unchanged with link sets on.
  - $after: 40.4, 41.2, 42.6, 56.2, 56.3, 56.8
  - Pure read model over the spec issue, spec working branch, task branch and worktree, task PR and check state from landing, landed commit from delivery records, and intake/escalation issues. URLs come from validated repository, number, ref and SHA fields only.
  - Missing records show as none; check state carries head SHA and age, and a non-current head is never shown as current. A counting-client test asserts the GitHub call count is unchanged with link sets on.

- [x] 44.2 Links box in the spec details panel, after 44.1 [R92.4, R92.9, R92.10, R92.12] (§4.27)
  - $done: Links box in the spec details panel
  - $done: Spec issue, working branch, open PRs with a check dot each, Radar issues it came from. Links open with target=_blank rel="noopener noreferrer"; a private spec issue renders only locally.
  - $after: 44.1
  - Spec issue, working branch, open PRs with a check dot each, Radar issues it came from. Links open with target=_blank rel="noopener noreferrer"; a private spec issue renders only locally.

- [x] 44.3 Links box in the task details view and the Graph modal, after 44.1 [R92.5, R92.9, R92.10, R92.12] (§4.27)
  - $done: Links box in the task details view and the Graph modal
  - $done: Branch, PR, checks, landed commit and issue; the Graph modal reuses the same view. A worktree path shows as local text only.
  - $after: 44.1
  - Branch, PR, checks, landed commit and issue; the Graph modal reuses the same view. A worktree path shows as local text only.

- [x] 44.4 PR and branch chips on In flight rows, after 44.1 [R92.6, R92.9, R92.12] (§4.27)
  - $done: PR and branch chips on In flight rows
  - $done: `PR #N` with a check dot, and the branch. Chips fit a 390 px row.
  - $after: 44.1
  - `PR #N` with a check dot, and the branch. Chips fit a 390 px row.

- [x] 44.5 Landing queue page under Dashboards, after 44.1 [R92.7, R92.2, R92.12] (§4.27)
  - $done: Landing queue page under Dashboards
  - $done: A Dashboards page next to CI, not a nav pill. Per target base, items in landing order with each hold reason; full-width rows at 390 px. No GitHub call; Refresh redraws.
  - $after: 44.1
  - A Dashboards page next to CI, not a nav pill. Per target base, items in landing order with each hold reason; full-width rows at 390 px. No GitHub call; Refresh redraws.

- [x] 44.6 Radar back-links through intake, after 44.1, 56.11 [R92.10] (§4.27)
  - $done: Radar back-links through intake
  - $done: Spec shows its Radar source issues. The intake status comment names the spec issue where visibility permits, so GitHub shows a cross-reference. Tests: a public Radar issue never names a private spec; no Radar API, grant or import; no new GitHub write.
  - $after: 44.1, 56.11
  - Spec shows its Radar source issues. The intake status comment names the spec issue where visibility permits, so GitHub shows a cross-reference. Tests: a public Radar issue never names a private spec; no Radar API, grant or import; no new GitHub write.

- [x] avoozl-p54 P54 Proof: links and the landing queue on real GitHub, after 44.1, 44.2, 44.3, 44.4, 44.5, 44.6 [R92, R102.5, R102.7] (§4.27)
  - $done: P54 Proof: links and the landing queue on real GitHub
  - $done: Setup: isolated scratch workspace with two registered targets, one PR from a fork, a spec created from a scratch Radar-style issue, one landed and one held task; no real workspace tick.
  - $done: Action: open the spec details panel, a task's details and its Graph modal, In flight and the Landing queue at 390 and 1280 px, light and dark; follow each link; count GitHub calls before and after.
  - $done: Expected: every link reaches the right GitHub item in a new tab; held items show the right reason; opening and refreshing the views adds zero calls; the scratch Radar issue shows the spec link only when the spec is public. Private spec references, host names, usernames and paths never render on a public surface.
  - $done: Also record: screenshots, exact source and target SHAs, call counts and owner screenshot approval. Live receipt under docs/evidence/; wait for owner approval before ticking.
  - $done: Failure means: a wrong or stale link shown as current, a leaked private reference, an extra GitHub call or an unusable mobile layout.
  - $done: Next decision: owner approves the screenshots and remaining shared projection deletion, or names the link or queue detail to change.
  - $after: 44.1, 44.2, 44.3, 44.4, 44.5, 44.6
  - Setup: isolated scratch workspace with two registered targets, one PR from a fork, a spec created from a scratch Radar-style issue, one landed and one held task; no real workspace tick.
  - Action: open the spec details panel, a task's details and its Graph modal, In flight and the Landing queue at 390 and 1280 px, light and dark; follow each link; count GitHub calls before and after.
  - Expected: every link reaches the right GitHub item in a new tab; held items show the right reason; opening and refreshing the views adds zero calls; the scratch Radar issue shows the spec link only when the spec is public. Private spec references, host names, usernames and paths never render on a public surface.
  - Also record: screenshots, exact source and target SHAs, call counts and owner screenshot approval. Live receipt under docs/evidence/; wait for owner approval before ticking.
  - Failure means: a wrong or stale link shown as current, a leaked private reference, an extra GitHub call or an unusable mobile layout.
  - Next decision: owner approves the screenshots and remaining shared projection deletion, or names the link or queue detail to change.

## Phase 46: Name the executor seam

Requirements 93, 97, design §4.28.

- [x] 46.1 Executor interface: start, send, status, optional stop and usage [R93.1, R93.4] (§4.28)
  - $done: Executor interface: start, send, status, optional stop and usage
  - $done: Contract tests cover the calls and allowed status values; the interface carries no Kiro Crew folder, project or agent-file detail. The comprehensive boundary test runs at P56 after 46.2–46.4 move the existing references.
  - Contract tests cover the calls and allowed status values; the interface carries no Kiro Crew folder, project or agent-file detail. The comprehensive boundary test runs at P56 after 46.2–46.4 move the existing references.
- [x] 46.2 The `kirocrew` executor holds today's session calls from `tick.py`, after 46.1 [R93.2] (§4.28)
  - $done: The `kirocrew` executor holds today's session calls from `tick.py`
  - $done: All Kiro Crew folder and project handling becomes the executor's private detail, including callers outside `tick.py`. Preserve existing behavior coverage; only assertions about retired request fields may change (R93.6).
  - $after: 46.1
  - All Kiro Crew folder and project handling becomes the executor's private detail, including callers outside `tick.py`. Preserve existing behavior coverage; only assertions about retired request fields may change (R93.6).
- [x] 46.3 The tick writes session requests that name an executor; each executor takes only its own, after 46.2 [R93.3, R93.4] (§4.28)
  - $done: The tick writes session requests that name an executor; each executor takes only its own
  - $done: Planner requests carry no Kiro Crew folder, project or agent-file details.
  - $after: 46.2
  - Planner requests carry no Kiro Crew folder, project or agent-file details.
- [x] 46.4 Role prompts in `prompts/<role>.md`; agent files built from them, after 46.1 [R97.1, R97.2] (§4.28)
  - $done: Role prompts in `prompts/<role>.md`; agent files built from them
  - $done: Runtime prompt readers use the prompt files, not generated agent JSON. A test fails when a built agent differs from its prompt.
  - $after: 46.1
  - Runtime prompt readers use the prompt files, not generated agent JSON. A test fails when a built agent differs from its prompt.

- [x] avoozl-p56 P56 Proof: the seam is named and nothing else changed, after 46.1, 46.2, 46.3, 46.4 [R93, R97] (§4.28)
  - $done: Proof: the seam is named and nothing else changed
  - $done: Expected: the suite passes with behavior coverage retained under R93.6; the worker opens and reports as before; no code outside the executor names a Kiro Crew folder or agent file.
  - $done: A boundary test fails on any code path outside the `kirocrew` executor naming a Kiro Crew folder, project or agent file.
  - $after: 46.1, 46.2, 46.3, 46.4
  - Setup: main before and after the change.
  - Action: run the existing suite and a boundary test that fails on any code path outside the `kirocrew` executor naming a Kiro Crew folder, project or agent file; open one worker through the executor on a scratch repository.
  - Expected: the suite passes with behavior coverage retained under R93.6; the worker opens and reports as before; no code outside the executor names a Kiro Crew folder or agent file.
  - Failure means: the seam leaks Kiro Crew details or changed behavior.
  - Next decision: start Phase 40 on the seam.

## Phase 47: Supervisor and the process executor with Claude Code

Requirements 93.5, 94, 95, 96 (design §4.28). Exit: a 3-task chain on a
scratch repository with one feedback round by resume, a killed child that
recovers, and a backend restart mid-run.

- [x] 47.1 Harness definition files: argv lists, placeholders, hash approval, after avoozl-p56 [R94.1, R94.2, R94.3] (§4.28)
  - $done: Harness definition files: argv lists, placeholders, hash approval
  - $done: Loading refuses a shell string, an unknown placeholder and an unapproved hash.
  - $after: avoozl-p56
  - Loading refuses a shell string, an unknown placeholder and an unapproved hash.
  - Built: `src/app/executors/harness-definitions.mjs` (machine config `harnesses/<name>.json`, approvals in `harness-approvals.json`); tests in `src/app/executors/test/harness-definitions.test.mjs`.
- [x] 47.2 Permission classes, write roots and the skip-flag refusal, after 47.1 [R94.4, R94.4b, R94.5] (§4.28)
  - $done: Permission classes, write roots and the skip-flag refusal
  - $done: Definitions with bypassPermissions, danger-full-access or a --dangerously-* flag are refused at load in a test; write roots are the task folder, temp and repository cache dirs.
  - $after: 47.1
  - Write roots: task folder, temp, repository cache dirs; read-only roles read-only; a test loads definitions with `bypassPermissions`, `danger-full-access` and a `--dangerously-*` flag and sees each refused; the per-machine opt-in is person-only.
  - Built: `harnessPermission`, `sandboxWriteRoots` and `allowUnconfinedWrites` in `src/app/executors/harness-definitions.mjs`; tests in `src/app/test/harness-permissions.test.mjs`.
- [x] 47.7 Avoozl commits after the child exits, after 47.4 [R94.4a] (§4.28)
  - $done: Avoozl commits after the child exits
  - $done: The child only edits; Avoozl commits in the worktree from the changed files and checks the diff.
  - $after: 47.4
  - The child only edits; Avoozl commits in the worktree from the changed files and checks the diff.
  - Built: `drainProcessRequests` in `src/app/executors/process.mjs` commits a write worker's changes with `commitWorkerChanges` (`.avoozl/` left out) when its child exits, before 47.6 reads the result and HEAD, and only in a linked worktree (`commitChildWork`); the done report's commit then goes through Verify. A failed commit closes the session unreported (retry path). Tests: `src/app/executors/test/process-executor.test.mjs`.
- [x] 47.11 Avoozl's worker commit never stages a path under `.avoozl/`, and landing refuses a worker commit that holds one [R94.4a, R96.1, R96.3] (§4.28)
  - $done: Avoozl's worker commit never stages a path under `.avoozl/`, and landing refuses a worker commit that holds one
  - $done: Whatever the repository's .gitignore says. 47.7 commits through `commitWorkerChanges` (`src/app/git/git.mjs`); `integrateRun` refuses a branch whose commits touch `.avoozl/` with the paths named; tests in `src/app/test/worker-commit.test.mjs`.
  - Whatever the repository's .gitignore says. 47.7 commits through `commitWorkerChanges` (`src/app/git/git.mjs`); `integrateRun` refuses a branch whose commits touch `.avoozl/` with the paths named; tests in `src/app/test/worker-commit.test.mjs`.
- [x] 47.8 Per-repository command allow-list; `git push` never allowed, after 47.2 [R94.4c] (§4.28)
  - $done: Per-repository command allow-list; `git push` never allowed
  - $done: Unattended children run the repository's build and test commands without a prompt; adding git push is refused.
  - $after: 47.2
  - Built: `src/app/executors/harness-allow.mjs` (`sandboxAllowCommands`, `harnessAllow`); tests in `src/app/executors/test/harness-allow.test.mjs`.
- [x] 47.9 Plan-quota stop, after 47.4 [R94.6a] (§4.28)
  - $done: Spend cap from the task budget and the plan-quota stop
  - $done: No new session starts on a harness whose plan quota reads low.
  - $after: 47.4
  - Built: `planQuotaHold` stops new sessions when plan quota runs low.
- [x] 47.10 Sandbox keeps the database, credentials and Kiro Crew home out of reach, network off or restricted, after 47.2 [R95.6, R95.7] (§4.28)
  - $done: Sandbox keeps the database, credentials and Kiro Crew home out of reach, network off or restricted
  - $done: A child cannot read the workspace database or credentials; docs and Settings call the chat refusal a speed bump.
  - $after: 47.2
  - Kiro Crew chats: the docs and Settings say the person-only refusal is a speed bump.
  - Built: `src/app/executors/sandbox.mjs` (`sandbox-exec` on macOS, `bwrap` on Linux, else the per-machine opt-in), wrapped around each child in `src/app/executors/supervisor.mjs`; text in `docs/policies.md` and Settings › Models; tests in `src/app/executors/test/sandbox.test.mjs`.
- [x] 47.3 `avoozl supervisor`: one per machine, owns pid, exit code and log; started by the app backend, after 47.1 [R95.1, R95.2, R95.3, R95.4] (§4.28)
  - $done: `avoozl supervisor`: one per machine, owns pid, exit code and log; started by the app backend
  - $done: Finds its children again after a restart; a missing one is `gone`.
  - $after: 47.1
  - Finds its children again after a restart; a missing one is `gone`.
  - Built: `src/app/executors/supervisor.mjs` (state in the machine state folder's `supervisor/supervisor.sqlite`, lock `supervisor.lock`), entry `src/app/executors/supervisor-main.mjs`, wrapper `src/app/executors/supervisor-child.mjs` that writes each exit code; the app backend launches it under Kiro Crew's gateway; tests in `src/app/executors/test/supervisor.test.mjs`.
- [x] 47.4 The `process` executor and the Claude Code definition, after 47.2, 47.3 [R93.2, R93.5] (§4.28)
  - $done: The `process` executor and the Claude Code definition
  - $done: Default for the Nupp compiler repository.
  - $after: 47.2, 47.3
  - Default for the Nupp compiler repository.
  - Built: `src/app/executors/process.mjs` (start, send by resume, status, stop over the supervisor; `drainProcessRequests` takes `process` requests in the app backend, prepares a worker's task worktree and binds the session); a repository opts in with `executor: "process"`, `harness` and `sandbox` in its settings, which is how the Nupp compiler repository makes it its default; the definition at `examples/harnesses/claude-code.json` (stdin prompt, `--session-id`/`--resume`, `acceptEdits`/`plan`, `--allowedTools Bash(...)`), copied to the machine config and approved by hash; tests in `src/app/executors/test/process-executor.test.mjs`.
- [x] 47.5 Child marker; the CLI refuses person-only commands in a child, after 47.3 [R95.5] (§4.28)
  - $done: Child marker; the CLI refuses person-only commands in a child
  - $done: Refused even with `--as-person`.
  - $after: 47.3
  - Refused even with `--as-person`.
  - Built: the supervisor sets `AVOOZL_CHILD=1` and `AVOOZL_CHILD_SESSION` on each child (`src/app/executors/supervisor.mjs`); `cliRefusal` in `src/app/mcp/mcp-policy.mjs` ignores `--as-person` there; tests in `src/app/cli/test/cli-person-only.test.mjs` and `src/app/executors/test/supervisor.test.mjs`.
- [x] 47.6 Finish: exit code plus `.avoozl/result.json` read by the supervisor; `runner report` for chats, after 47.4 [R96.1, R96.2, R96.3, R96.4] (§4.28)
  - $done: Finish: exit code plus `.avoozl/result.json` read by the supervisor; `runner report` for chats
  - $done: A missing or bad result file, or done with a non-zero exit, takes the retry path.
  - $after: 47.4
  - A missing or bad result file, or `done` with a non-zero exit, takes the retry path.
  - Built: the supervisor clears `.avoozl/result.json` before each run and reads it at exit (`readChildResult`, `childResult` in `src/app/executors/supervisor.mjs`: a regular file of at most 8 KB); `drainProcessRequests` records a good result as the session's report through `session.report` (`finishProcessSession` in `src/app/executors/process.mjs`, commit read from the worktree's HEAD, text as data); a `process` worker's brief ends with the result file (`processSteps`, `src/app/delivery/delivery.mjs`). Chats and people keep `avoozl runner report TASK done|blocked` and the `--state` form (40.2). Tests in `src/app/executors/test/process-executor.test.mjs`.

- [x] avoozl-p57 P57 Proof: a Claude Code chain runs under the supervisor and survives faults, after 47.1, 47.2, 47.3, 47.4, 47.5, 47.6, 47.7, 47.8, 47.9, 47.10, 47.11 [R93, R94, R95, R96] (§4.28)
  - $done: Proof: a Claude Code chain runs under the supervisor and survives faults
  - $done: Expected: (1) all 3 tasks finish with an exit code and a result file, and Avoozl commits each one; (2) the resume argv delivers the feedback and the task passes; (3) the killed child is `exited` or `gone` and its task recovers on the retry path; (4) the supervisor keeps or finds its children and nothing runs twice; (5) refused.
  - $after: 47.1, 47.2, 47.3, 47.4, 47.5, 47.6, 47.7, 47.8, 47.9, 47.10, 47.11
  - Setup: a scratch repository with a bare remote, a 3-task chain, the Claude Code definition approved, the `process` executor.
  - Action: (1) run the chain; (2) fail one check so the task gets one feedback round by resume; (3) kill one child mid-task; (4) restart the app backend mid-run; (5) run a person-only command from a child with `--as-person`.
  - Expected: (1) all 3 tasks finish with an exit code and a result file, and Avoozl commits each one; (2) the resume argv delivers the feedback and the task passes; (3) the killed child is `exited` or `gone` and its task recovers on the retry path; (4) the supervisor keeps or finds its children and nothing runs twice; (5) refused.
  - Also record (not verified before): the permission and sandbox values Claude Code accepts; that writes outside the write roots, the git directory included, are refused; that the database and credentials cannot be read; whether `--max-budget-usd` binds on a plan login; and whether the app backend may keep a detached long-lived child.
  - Failure means: a child escapes the worktree, a restart loses or doubles a child, or a person-only command runs in a child.
  - Next decision: make `process` the default for Avoozl's own repository, or keep `kirocrew`.
  - Proved: `docs/evidence/p57-claude-code-supervisor.md` (run 4, 2026-11-17); fixes #423, #427, #434.

## Phase 48: A second harness by definition file only

Requirement 94.7 (design §4.28). Exit: Codex runs a task with no code change.

- [x] 48.1 A Codex definition file, after avoozl-p57 [R94.1, R94.4] (§4.28)
  - $done: A Codex definition file
  - $done: Its start and resume argv, permission values and cost source.
  - $after: avoozl-p57
  - Its start and resume argv, permission values and cost source.
  - Built: `examples/harnesses/codex.json`: `codex exec --json -C {worktree} --sandbox {permission} -c approval_policy=never`, brief on stdin; resume adds `resume --last -`, since Codex takes no session ID at start and `--last` reads only the worktree's own sessions; `workspace-write` and `read-only`; no allow flag, no spend cap and no cost source (its JSON reports tokens, not dollars). Tests in `src/app/executors/test/codex-definition.test.mjs`. For P58: Codex applies its own `sandbox-exec` per command on macOS, and a nested `sandbox-exec` fails (`sandbox_apply: Operation not permitted`); the repository's `sandbox.writeRoots` must name the Codex home, where it records sessions.

- [x] 48.2 Inner sandbox off only under Avoozl's sandbox, after 48.1 [R94.4b, R94.4d] (§4.28)
  - $done: Inner sandbox off only under Avoozl's sandbox
  - $done: `permission.write` may be exactly `danger-full-access`; the child then starts only inside Avoozl's sandbox with the task write roots, and is refused with no Avoozl sandbox, opt-in or not. Tests: refused without the Avoozl sandbox, allowed with it, every other bypass value still refused.
  - $after: 48.1
  - `permission.write` may be exactly `danger-full-access`; the child then starts only inside Avoozl's sandbox with the task write roots, and is refused with no Avoozl sandbox, opt-in or not. `examples/harnesses/codex.json` uses it.
  - Tests: refused without the Avoozl sandbox, allowed with it, every other bypass value still refused.

- [x] avoozl-p58 P58 Proof: Codex runs a task from its definition file alone, after 48.1, 48.2 [R94.7] (§4.28)
  - $done: Proof: Codex runs a task from its definition file alone
  - $done: Expected: the child exits with a valid `.avoozl/result.json`, Avoozl commits its changes and the task finishes; `git diff --stat` of every source file against the recorded commit is empty, and the proof fails if any source file changed.
  - $after: 48.1, 48.2
  - Setup: the Phase 47 scratch repository; the Codex definition approved by hash; the source tree at a recorded commit.
  - Action: run one task and one feedback round on Codex.
  - Expected: the child exits with a valid `.avoozl/result.json`, Avoozl commits its changes and the task finishes; `git diff --stat` of every source file against the recorded commit is empty, and the proof fails if any source file changed.
  - Also record (not verified before): the permission and sandbox values Codex accepts, and that its writes stay in the worktree.
  - Failure means: the seam still needs code per harness.
  - Next decision: fix the seam so the next harness needs no code.
  - Proved: `docs/evidence/p58-codex-by-definition.md` (2026-11-17, Avoozl `19af828c`); fixes #446, #451, #465, #470; finding #479 (`~/.codex` readable from a child).

## Phase 49: Every role on any executor

Requirement 97.3 (design §4.28).

- [x] 49.1 Verifier, reviewer, planner, retro and watch run on `process`, after avoozl-p57 [R97.3, R94.4] (§4.28)
  - $done: Verifier, reviewer, planner, retro and watch run on `process`
  - $done: Read-only roles get the read-only class.
  - $after: avoozl-p57
  - Read-only roles get the read-only class.
  - Built: a `process` repository's verifier and review roles (`planVerifierDispatches`), retro (`retroStep`) and New plan planner (`newPlanStarts`) request `process`; `drainProcessRequests` adds a verdict role's detached worktree at the commit and removes it after, gives a retro a scratch folder, and gives the planner only its spec folder (`src/app/executors/process.mjs`). `processBrief` puts the role's `prompts/<role>.md` first and says how to finish without Avoozl's tools; a read class writes only its temp folder and `.avoozl/` (`harnessPermission`), and a definition's `resultAllow` lets it write the result file (Claude Code: `dontAsk` plus `Edit(.avoozl/result.json)`, checked on Claude Code 2.1.326, where `plan` refused the file). The result file's `report` carries a verdict or a retro's reply. No watch session exists: the line watch runs in the tick with no agent. The GitHub breakdown planner, plan review and pull request review chats stay on `kirocrew`. Tests in `src/app/executors/test/process-roles.test.mjs`.

- [x] avoozl-p59 P59 Proof: each role runs on either executor, after 49.1 [R97] (§4.28)
  - $done: Proof: each role runs on either executor
  - $done: Expected: the same result kinds from both; a read-only role cannot write.
  - $after: 49.1
  - Setup: a scratch workspace; each role pinned once to `kirocrew` and once to `process`.
  - Action: run each role once per executor.
  - Expected: the same result kinds from both; a read-only role cannot write.
  - Failure means: a role still depends on Kiro Crew.
  - Next decision: move that role's Kiro Crew detail into the executor.
  - Proved: `docs/evidence/p59-roles-on-either-executor.md` (2026-11-18, Claude Code and the P50 test crew); fixes #499, #502, #511. The falsifier still runs on `kirocrew` only.

## Phase 50: One page for every session

- [x] 50.1 In flight for `process` sessions: status, log tail, cost, copyable attach command, after avoozl-p57 [R98.1] (§4.28)
  - $done: In flight for `process` sessions: status, log tail, cost, copyable attach command
  - $after: avoozl-p57
- [x] 50.2 Send message queues a `send`, after 50.1 [R98.2] (§4.28)
  - $done: Send message queues a `send`
  - $after: 50.1
- [x] 50.3 Settings › Models picks harness and model per role, after avoozl-p57 [R98.3] (§4.28)
  - $done: Settings › Models picks harness and model per role
  - $after: avoozl-p57
- [x] 50.4 One `roles` table for harness, agent and model; Settings › Models is the only place to pick them, after 50.3 [R98.5, R98.6, R98.7, R98.8, R98.9] (§4.28)
  - $done: One `roles` table for harness, agent and model; Settings › Models is the only place to pick them
  - $after: 50.3
  - Built: PR #610 (`7e504bc4`).
  - `resolveRoles` in `chat-models.mjs` maps the older keys silently; `chatModel`, `roleHarness` and the delivery policy read through it; `roles` in the config schema; Settings › Models gains the worker's and falsifier's rows; Settings › Delivery loses Writer; screenshots in `docs/evidence/simplify-roles/`.

- [x] avoozl-p60 P60 Proof: a process session is watched and steered from the Avoozl page, after 50.1, 50.2, 50.3 [R98] (§4.28)
  - $done: Proof: a process session is watched and steered from the Avoozl page
  - $done: Expected: status, log tail and cost show; the message reaches the child through `send`; the next task of that role uses the new harness; screenshots at 390 and 1280 px, light and dark.
  - $after: 50.1, 50.2, 50.3
  - Setup: one `process` session on a scratch repository.
  - Action: open In flight, copy the attach command, send a message, change the role's harness.
  - Expected: status, log tail and cost show; the message reaches the child through `send`; the next task of that role uses the new harness; screenshots at 390 and 1280 px, light and dark.
  - Failure means: a process session needs another UI.
  - Next decision: approve the screenshots.
  - Proved: `docs/evidence/p60-process-session-page.md` (2026-11-18); fixes #503, #504, #505.

## Phase 51: Headless workers

Requirements 95.3, 98.4 (design §4.28). The base for the pull-based worker
mode of Phase 43.

- [x] 51.1 The supervisor under launchd or systemd, running the tick too, after avoozl-p57 [R95.3] (§4.28)
  - $done: The supervisor under launchd or systemd, running the tick too
  - $after: avoozl-p57
- [x] 51.2 CLI only: `avoozl status` and `avoozl runner status --json`, after 51.1 [R98.4] (§4.28)
  - $done: CLI only: `avoozl status` and `avoozl runner status --json`
  - $after: 51.1

- [x] avoozl-p61 P61 Proof: a headless machine runs tasks with the CLI only, after 51.1, 51.2 [R95, R98.4] (§4.28)
  - $done: Proof: a headless machine runs tasks with the CLI only
  - $done: Expected: both tasks finish; the supervisor comes back and finds its state; `runner status --json` reports both.
  - $after: 51.1, 51.2
  - Setup: a machine without Kiro Crew's page, the supervisor under launchd.
  - Action: run two tasks; reboot the supervisor; read status.
  - Expected: both tasks finish; the supervisor comes back and finds its state; `runner status --json` reports both.
  - Failure means: a headless worker needs the page or a person.
  - Next decision: build Phase 43 on it.

## Phase 52: The manual path stays

Requirement 96.4 (design §4.28).

- [x] 52.1 `next`, `take` and `runner report` keep working for a person, after avoozl-p56 [R96.4] (§4.28)
  - $done: `next`, `take` and `runner report` keep working for a person
  - $done: One test per command from a plain shell.
  - $after: avoozl-p56
  - One test per command from a plain shell.
  - Built: `src/app/test/manual-path.test.mjs` runs the CLI with no Kiro Crew, gateway or Avoozl variables: `next` lists ready work, `claim --slot` binds as `cli` with a worktree and `report --kind done` finishes it in crew mode, and `runner report TASK --state done` reports a runner task. The positional `runner report TASK done|blocked` and its use outside runner mode are 40.2's.

- [x] avoozl-p62 P62 Proof: a person finishes a task by hand, after 52.1 [R96.4] (§4.28)
  - $done: Proof: a person finishes a task by hand
  - $done: Expected: the task lands as if a worker did it.
  - $after: 52.1
  - Setup: a scratch workspace with one ready task.
  - Action: `avoozl next`, `avoozl take`, edit and commit, `avoozl runner report TASK done`.
  - Expected: the task lands as if a worker did it.
  - Failure means: the manual path broke.
  - Next decision: fix it before removing anything else.

## Phase 53: Cross-model plan review

Requirement 99, design §4.29.

- [x] 53.1 Plan reviewer role and `planReview` settings [R99.1, R99.10, R99.13] (§4.29)
  - $done: Plan reviewer role and `planReview` settings
  - $done: `models.planReviewer` saves from Settings › Models, validation refuses one equal to a named planner, and `planReview.mode` and `planReview.rounds` are checked.
  - `planReviewer` in `MODEL_ROLES`, `plan-review` in `DISPATCH_ROLE`, `validateModels` refuses a reviewer equal to a named planner; `planReview.mode` and `planReview.rounds` validated; the Settings › Models row. Tests use fake model names.
- [x] 53.2 Review rounds and spec findings keyed by hash, after 53.1 [R99.2, R99.5, R99.6] (§4.29)
  - $done: Review rounds and spec findings keyed by hash, after 53.1
  - $done: Spec findings are stored per plan and revision hash; a bad file or line, and a session on the writer's model, are refused; a skipped review records its reason.
  - $after: 53.1
  - `review_rounds` rows per pass and round; `plan.review.submit` takes spec findings (kind, severity, file, line, claim, evidence) and refuses a bad file or line and a same-model session. Tests: the different-model rule; findings keyed by hash.
- [x] 53.3 Tick opens the reviewer, then the planner answers, after 53.2 [R99.3, R99.4, R99.7, R99.10] (§4.29)
  - $done: Tick opens the reviewer, then the planner answers, after 53.2
  - $done: A stored draft revision gets one read-only reviewer chat on the reviewer model, the planner answers each finding fixed or answered, and rounds stop at `planReview.rounds`.
  - $after: 53.2
  - `planReviewStep`: mode, model check, read-only brief with worktrees at recorded commits, content rules at `brief`; `plan.review.findings` and `plan.review.answer`; rounds; `ask` opens one Needs you item. Fake chats only.
- [x] 53.4 Review counts in the Approve dialog, after 53.2 [R99.8, R99.9] (§4.29)
  - $done: Review counts in the Approve dialog, after 53.2
  - $done: The Approve dialog shows reviewer model, found, fixed and for you per spec with each open finding, and approval gives the same result with or without a review.
  - $after: 53.2
  - `plan.reviewSummary` on `approvalChecks`; the dialog shows found, fixed, for you and each open finding. Tests: review never changes approval (and makes no GitHub write).
- [x] 53.5 CLI, MCP tools and Flow planning, after 53.3 [R99.11, R99.12] (§4.29)
  - $done: CLI, MCP tools and Flow planning, after 53.3
  - $done: `avoozl plan review SPEC` prints and starts a review, the planner reads and answers findings over MCP, and Flow shows review time and usage under Planning per spec.
  - $after: 53.3
  - `avoozl plan review SPEC [--start] [--json]`; `plans_plan_review` and `plans_answer_review` with MCP policy (Review anyway and `--start` person only); Planning spans and usage per spec in Flow, kept out of task flow and budgets.

- [x] avoozl-p63 P63 Proof: a draft is reviewed on another model and the person sees it at approval [R99] (§4.29)
  - $done: Proof: a draft is reviewed on another model and the person sees it at approval
  - $done: Expected: no review runs on the writer's model or with no reviewer set; a different model finds the wrong reference and hidden order at the right line; a new hash gets a fresh round; both Approve dialogs show the counts and approval is unchanged, with no GitHub write.
  - $after: 53.1, 53.2, 53.3, 53.4, 53.5
  - Setup: an isolated workspace and Kiro Crew home, a scratch planning repository with one spec draft that names a missing file and hides an order in prose, and real planner and reviewer chats on two different owner-selected models.
  - Action: (1) store the draft with `planReview.mode: auto` and no reviewer model; (2) set the reviewer to the planner's model; (3) set a different model; (4) let the planner answer; (5) edit the spec by hand; (6) open the Approve dialog alone and in a batch, and approve.
  - Expected: (1) and (2) skipped with a note and no chat; (3) one read-only round with a `wrong-reference` and a `hidden-order` finding at the right file and line; (4) one fixed, one answered; (5) a fresh round on the new hash, old findings marked older; (6) both dialogs show the model and counts, approval succeeds the same as with no review, and no GitHub write is made.
  - Failure means: a review runs on the writer's model, findings attach to the wrong revision, or a review changes whether a spec can be approved.
  - Next decision: ask Kiro Crew for the Spec Builder chat's model, or keep skipping those drafts.

## Phase 54: Retrospectives catch steady CI waste

Requirement 100, design §4.30.

- [x] 54.1 File classes from the widened open pull request read [R100.1, R100.4, R100.6] (§4.30)
  - $done: File classes from the widened open pull request read
  - $done: Each pull request in the workspace's repositories, task or other, is stored with its file classes from the existing open pull request read; globs, order, override and partial are tested, and a fake client sees no new GraphQL call.
  - `openPullRequests` adds `createdAt`, `files` and head check runs with times, run id and event; `flow.ci` settings in `flowSection`; class globs with defaults through `globToRegex`; `pr_ci` rows for task and other pull requests. Tests: classes, order, override and partial; a fake client sees no new GraphQL call.
- [x] 54.2 Workflow runs read and repeat runs, after 54.1 [R100.2, R100.6] (§4.30)
  - $done: Workflow runs read and repeat runs, after 54.1
  - $done: At most one cached workflow runs read per repository per check; a test shows two runs of one workflow on one commit record a repeat run, a re-run attempt does not, and a 304 reuses the cache.
  - $after: 54.1
  - At most one `actions/runs` read per repository per check through the HTTP cache; `ci_runs` rows; `job_ms` from check runs or wall time marked an estimate. Tests: a 304 reuses the cache; two runs of one workflow on one commit are a repeat run; attempt 2 of one run is not.
- [x] 54.3 Steady waste triggers, after 54.2 [R100.3, R100.4, R100.8] (§4.30)
  - $done: Steady waste triggers, after 54.2
  - $done: Tests: 10 spec-only pull requests with 25 CI minutes each fire docs-only waste once in the window; a varied but steady repository with no waste fires nothing; the existing outlier trigger tests pass unchanged.
  - $after: 54.2
  - Docs-only waste, CI wait share and repeat run in `triggers`, keyed once per repository, kind and window, outside the spike gap; a retrospective with no finished tasks. Tests: 10 spec-only pull requests with 25 CI minutes fire docs-only waste once; a varied but steady repository fires nothing; the Requirement 47.1 tests pass unchanged.
- [x] 54.4 CI facts in the brief, CI plan proposals and PDCA by class, after 54.3 [R100.4, R100.5] (§4.30)
  - $done: CI facts in the brief, CI plan proposals and PDCA by class, after 54.3
  - $done: The brief holds minutes by class, wait share and repeat runs with other pull requests as number, author and classes only; a test drops a proposal naming an unseen workflow, opens a draft for an approved one, and runs PDCA by class.
  - $after: 54.3
  - Brief per repository: minutes by class, task and other, wait share, repeat runs, workflow files; `other` pull requests as number, author and classes only. `PLAN_FIELDS` adds `repository` and `workflow`; `METRICS` adds `CI minutes per pull request`. Tests: an unseen workflow is dropped; an approved proposal opens a draft; PDCA compares closed pull requests of one class.
- [x] 54.5 Flow CI card and Settings › Flow CI group, after 54.3 [R100.7, R100.8] (§4.30)
  - $done: Flow CI card and Settings › Flow CI group, after 54.3
  - $done: The Flow tab shows CI minutes by class and repeat runs and Settings › Flow edits the CI limits, tested on the view data, with before and after screenshots (phone and desktop, light and dark) approved by the owner before merge.
  - $after: 54.3
  - The CI card (minutes by class, wait share, Repeat runs) and the Settings fields with class globs read-only. Ships before and after screenshots (phone and desktop, light and dark) and waits for the owner's approval before merge. Tests: the view data for the card, and No pull requests read without GitHub.
- [x] 54.6 Closed pull requests from the open pull request query, after 54.2 [R100.1, R100.4, R100.6] (§4.30)
  - $done: Closed pull requests from the open pull request query, after 54.2
  - $done: The open pull request query's first page also reads the 50 most recently updated closed pull requests; one never seen open gets a row, its runs link by branch, a seen one takes its exact close time, and a test shows no extra call.
  - $after: 54.2
  - The first page of `readOpenPullRequests` adds a `recent` alias: the 50 most recently updated closed pull requests with times, head and files; `recentPullRequests` returns it. A pull request never seen open gets a `pr_ci` row; runs link by `headBranch` while it was open; a seen one takes its exact `closedAt`. Tests: a spec-only pull request closed between checks fires docs-only waste; exact close time; one query, the alias on page 1 only.

- [x] avoozl-p64 P64 Proof: the retro catches steady CI waste on a real repository [R100] (§4.30)
  - $done: Proof: the retro catches steady CI waste on a real repository
  - $done: Expected: with no Avoozl tasks, spec-only pull requests on a repository that runs its workflow twice per commit fire docs-only waste and repeat run, the brief labels them other, a CI plan proposal names the workflow, reads stay within the budget, and PDCA shows spec CI minutes per pull request down at least 10%.
  - $after: 54.1, 54.2, 54.3, 54.4, 54.5, 54.6
  - Setup: an isolated workspace naming one scratch GitHub repository whose test workflow runs on both `push` and `pull_request` and runs the full matrix for every change; no Avoozl tasks. Set `flow.retro.everyTasks` to 4 and `flow.ci.docsOnlyMinutes` to 1.
  - Action: (1) open 4 spec-only pull requests by hand and let CI complete; (2) let the tick observe them while still open, then merge them and let it observe their closures; (3) approve the CI plan proposal the retrospective writes and land the task it drafts; (4) open 4 more spec-only pull requests, let CI complete and the tick observe them while still open, then merge them and let it observe their closures.
  - Expected: (2) one retrospective with docs-only waste and repeat run triggers, the pull requests labeled `other`, and a `plan` proposal naming the workflow file; the GitHub rate counters show no call beyond the open pull request read and one runs read per check; (4) PDCA shows CI minutes per pull request for `spec` down at least 10%, and no new repeat run.
  - Failure means: steady waste is still hidden, other pull requests are missed, or the reads cost more than the stated budget.
  - Next decision: read more than one page of runs, or read `closedAt` for exact lead times.
  - Proved: `docs/evidence/p64-steady-ci-waste-live.md` (2026-11-19, live on the private scratch repository `mtdowling/avoozl-scratch-p64`): both triggers, `other` pull requests, CI plan proposals naming the workflow, one GraphQL and one runs read per check, and PDCA spec CI minutes per pull request 1.975 to 0 (helped) with no new repeat run; read-only checks on `mtdowling/avoozl` in `p64-steady-ci-waste.md` and `p64-steady-ci-waste-2026-11-19.md`. Fix in the same change: a CI proposal naming a class with no pull requests is dropped.

## Phase 55: Every build receipt, and a build breakdown for retrospectives

Requirement 101, design §4.31.

- [x] 55.1 Every line of a receipt file, and task, attempt and phase in the wrapper [R101.2, R101.3] (§4.31)
  - $done: Every line of a receipt file, and task, attempt and phase in the wrapper
  - $done: `parseReceipts` keeps every line and counts skipped ones, an old version 1 line parses, and the wrapper records task, attempt and phase with the rc-31.1 tests unchanged.
  - `parseReceipts` returns every record and a skipped count; `bin/build-receipt` takes `--task`, `--attempt` and `--phase` with their fallbacks. Tests: 4 lines keep 4; a bad line is skipped and counted; a version 1 line without the new fields parses; the wrapper tests of rc-31.1 pass unchanged.
  - Built: pass, `src/app/flow/test/build-receipt.test.mjs`.
- [x] 55.2 CI uploads a receipt from every platform, after 55.1 [R101.3] (§4.31)
  - $done: CI uploads a receipt from every platform, after 55.1
  - $done: A CI run uploads `build-receipt-<os>` from each of the 3 platforms and prints every line in the job summary; the workflow diff went to the owner as a protected path.
  - $after: 55.1
  - Each test job uploads `build-receipt-<os>` with `if: always()`; the summary prints every line. A workflow file is a protected path, so the diff goes to the owner before it lands. Done when a CI run shows 3 artifacts and every line in the summary.
- [x] 55.3 Reader: every artifact, every line, stored observations, after 55.1, 54.2, 54.6 [R101.1, R101.2, R101.5, R101.6] (§4.31)
  - $done: Reader: every artifact, every line, stored observations, after 55.1, 54.2, 54.6
  - $done: Tests on a fake GitHub: a pull request with several phases on 3 platforms keeps every record, a failed attempt is kept and marked, one artifact list per check and one download per new artifact, and the next check costs 0.
  - $after: 55.1, 54.2, 54.6
  - Unfiltered artifact list through the HTTP cache from `ciStep`; `receipt_artifacts` and `build_observations`; `pr_ci` gains `head_sha` and `merged_at`; the old metadata value moves once. Tests: several phases on 3 platforms keep every record; a failed attempt is kept and marked; one list per check, a 304 reads nothing, one download per new artifact, the next check costs 0; complete runs with no artifact store none.
  - Built: pass, `src/app/flow/test/build-receipt-read.test.mjs`.
- [x] 55.4 Flow and Trace show every record; PDCA on build minutes, after 55.3 [R101.4, R101.12] (§4.31)
  - $done: Flow and Trace show every record; PDCA on build minutes, after 55.3
  - $done: Flow names the costliest phase and keeps failed attempts out of medians, Trace lists every observation by phase, with before and after screenshots (phone and desktop, light and dark) approved by the owner before merge.
  - $after: 55.3
  - `buildView` replaces `receiptsView`: totals, phases, costliest phase, failed apart, medians per phase, target and start; Trace groups every observation by phase. `METRICS` adds Build minutes per pull request. Tests: the costliest phase shows in Flow; failed attempts stay out of medians. Ships before and after screenshots (phone and desktop, light and dark) and waits for the owner's approval before merge.
- [x] 55.5 Build report format, `receipts.report` and the adapter, after 55.1 [R101.7, R101.8, R101.9] (§4.31)
  - $done: Build report format, `receipts.report` and the adapter, after 55.1
  - $done: `docs/build-report.md` documents version 1; the adapter parses the field and artifact forms, skips and counts an unknown version or a missing field, and its fixtures use made-up names only.
  - $after: 55.1
  - `docs/build-report.md` for version 1; `src/app/flow/build-report.mjs` with `parseBuildReport` and `comparisonKey`; `receipts.report` checked as a field or an artifact prefix. Tests: both forms; an unknown version and a missing field are skipped and counted; fixtures use made-up names only.
  - Built: pass, `src/app/flow/test/build-report.test.mjs`.
- [x] 55.6 Breakdowns stored, in the retro brief, and compared by key only, after 55.3, 55.5, 54.4 [R101.9, R101.10, R101.11] (§4.31)
  - $done: Breakdowns stored, in the retro brief, and compared by key only, after 55.3, 55.5, 54.4
  - $done: Tests: mismatched keys are never compared, a retro brief includes the breakdown, and a repository with no reports gives the same brief and call count as before.
  - $after: 55.3, 55.5, 54.4
  - `build_breakdowns` from the field or report artifacts; `buildBrief` in `retroBrief`; `PLAN_FIELDS` adds `key` and `part`; `METRICS` adds Build part minutes; Not enough comparable builds. Tests: mismatched keys are never compared; a retro brief includes the breakdown; a repository with no reports gives the same brief and call count as before.
  - Built: pass, `src/app/flow/test/build-breakdown.test.mjs`.

- [x] avoozl-p65 P65 Proof: every receipt kept and a breakdown in a retro on a real repository, after 55.1, 55.2, 55.3, 55.4, 55.5, 55.6 [R101] (§4.31)
  - $done: Proof: every receipt kept and a breakdown in a retro on a real repository
  - $done: Expected: on a scratch repository with CI on 3 platforms, a pull request with a failed and re-run test job keeps every observation with the failed attempt marked, Flow names the costliest phase, reads stay within one list per check and one download per artifact, and the retro brief compares only breakdowns with the same key.
  - $after: 55.1, 55.2, 55.3, 55.4, 55.5, 55.6
  - Setup: an isolated workspace naming one scratch GitHub repository with `buildReceipts` on, CI on 3 platforms running build and test through the wrapper, and `receipts.report` set to a field that a test script fills with made-up workload, engine and target names.
  - Action: (1) open a pull request, fail its test job once, re-run it, and merge; (2) let two checks run; (3) merge 4 more pull requests with the same report key and 1 with a different cache mode; (4) start a retrospective.
  - Expected: (2) 6 or more observations for the first pull request, the failed attempt marked, the costliest phase in Flow, one artifact list per check and one download per artifact, the second check 0 downloads; (4) the brief holds the breakdown, and the pull request with the other cache mode is never compared with the rest.
  - Failure means: records are still dropped, artifacts are read again, or builds with different work are compared.
  - Next decision: read a second page of artifacts, or move reports to their own artifact.
  - Built: pass, receipt `docs/evidence/p65-build-receipts.md` (#401 reads every page; #402 Flow builds for any repository).

## Phase 56: Working branches and spec issues

Requirement 102, design §4.32.

- [x] 56.1 Task outcomes, legacy values and branch-progress semantics [R102.3, R102.14] (§4.32)
  - $done: Task outcomes, legacy values and branch-progress semantics
  - $done: Define the task-definition digest and latest valid outcome reducer; done/skipped/landed complete, refused/reopened/unverified/stale hold. Explicitly carry forward unchanged evidence only on new approval.
  - $done: Accept route: github and merged-pr without rewriting approved files. Branch checkmarks remain outside the revision hash and only verified in-spec dependencies may advance; cross-spec dependencies wait for accepted outcomes. Tests cover every outcome and unchanged source hashes.
  - Define the task-definition digest and latest valid outcome reducer; done/skipped/landed complete, refused/reopened/unverified/stale hold. Explicitly carry forward unchanged evidence only on new approval.
  - Accept route: github and merged-pr without rewriting approved files. Branch checkmarks remain outside the revision hash and only verified in-spec dependencies may advance; cross-spec dependencies wait for accepted outcomes. Tests cover every outcome and unchanged source hashes.

- [x] 56.2 Publish spec issues, after 56.1 [R102.1, R102.2] (§4.32)
  - $done: Publish spec issues
  - $done: Implement explicit per-spec publication, one issue per spec/epic. Approval alone makes no GitHub write. Keep epic links and existing issue ownership. Spec, epic and sub-issues carry crew:avoozl in their create call.
  - $after: 56.1
  - Implement explicit per-spec publication, one issue per spec/epic. Approval alone makes no GitHub write. Keep epic links and existing issue ownership. Spec, epic and sub-issues carry crew:avoozl in their create call.

- [x] 56.3 Qualified working heads, fork checkpoints and verified integration, after 56.2, 56.11, 40.5 [R102.4, R102.5, R102.6, R102.9] (§4.32)
  - $done: Qualified working heads, fork checkpoints and verified integration
  - $done: Generalize spec homes and integration branches to source repository/ref/SHA and target/base. Discover PR fork heads; accept trusted owner-published pre-PR refs. Fetch only registered sources, validate relationships and exact commits; no arbitrary issue URLs or commands.
  - $done: Driver creates one spec working branch per affected repository, integrates checked task refs serially, and keeps unfinished checkpoints separate. A fork needs no upstream branch copy. Content checks apply to all checkpoints; acceptance gates apply to verified integrations. Test recovery after database loss, fork deletion/rewrites, two identical branch names and absent upstream push access; sandboxed agents never receive push credentials.
  - $after: 56.2, 56.11, 40.5
  - Generalize spec homes and integration branches to source repository/ref/SHA and target/base. Discover PR fork heads; accept trusted owner-published pre-PR refs. Fetch only registered sources, validate relationships and exact commits; no arbitrary issue URLs or commands.
  - Driver creates one spec working branch per affected repository, integrates checked task refs serially, and keeps unfinished checkpoints separate. A fork needs no upstream branch copy. Content checks apply to all checkpoints; acceptance gates apply to verified integrations. Test recovery after database loss, fork deletion/rewrites, two identical branch names and absent upstream push access; sandboxed agents never receive push credentials.


- [x] 56.6 Independent refresh and held reconstruction [R102.7, R102.10, R102.11] (§4.32)
  - $done: Independent refresh and held reconstruction
  - $done: Cache repository hashes separately from assignee/review/check reads. Use conditional reads; unchanged definitions are not reparsed. Reassignment is observed with no branch commit.
  - $done: Rebuild from the spec folders, approvals, ticks and landing commits; unknown spend is never zero. Tests cover a lost database and an unavailable fork.
  - Cache repository hashes separately from assignee/review/check reads. Use conditional reads; unchanged definitions are not reparsed. Reassignment is observed with no branch commit.
  - Rebuild from the spec folders, approvals, ticks and landing commits; unknown spend is never zero. Tests cover a lost database and an unavailable fork.

- [x] 56.7 Epic design/review/implement rows and approval evidence, after 56.2 [R59, R102.12] (§4.32)
  - $done: Epic design/review/implement rows and approval evidence
  - $done: Extend epic entries with step, default implement. Allow one row per (plan, step), forbid task fields/dispatch, derive design/review/implement from current member state; never hand-tick lifecycle rows.
  - $done: Keep current merge-commit re-hash; persist actual approving reviewers separately from requester/merger/time after merge. Local approval is explicit. Request configured spec reviewers or honor CODEOWNERS/policy; add no universal second-person rule. Public PRs link only public spec issues.
  - $after: 56.2
  - Extend epic entries with step, default implement. Allow one row per (plan, step), forbid task fields/dispatch, derive design/review/implement from current member state; never hand-tick lifecycle rows.
  - Keep current merge-commit re-hash; persist actual approving reviewers separately from requester/merger/time after merge. Local approval is explicit. Request configured spec reviewers or honor CODEOWNERS/policy; add no universal second-person rule. Public PRs link only public spec issues.

- [x] 56.8 GitHub intake with proportionate plans and private-safe status, after 56.2, 56.7 [R102.13] (§4.32)
  - $done: GitHub intake with proportionate plans and private-safe status
  - $done: Accept GitHub starts in plan/deliver. Bounded fixes use a compact versioned acceptance definition and the existing issue, without a full spec; coordinated design uses a proportionate spec. Reuse an issue only when home/visibility match.
  - $done: Initial intake makes at most two idempotent writes: ownership label and safe status comment; never name a private spec on a public input. Only same-repository Deliver this uses Fixes; closure is withdrawal. Validate the ownership label excludes independent issue crews in a scratch proof before unattended rollout. The ownership label is crew:avoozl; intake-created issues carry it at create, and the status comment carries no Radar claim marker.
  - $after: 56.2, 56.7
  - Accept GitHub starts in plan/deliver. Bounded fixes use a compact versioned acceptance definition and the existing issue, without a full spec; coordinated design uses a proportionate spec. Reuse an issue only when home/visibility match.
  - Initial intake makes at most two idempotent writes: ownership label and safe status comment; never name a private spec on a public input. Only same-repository Deliver this uses Fixes; closure is withdrawal. Validate the ownership label excludes independent issue crews in a scratch proof before unattended rollout. The ownership label is crew:avoozl; intake-created issues carry it at create, and the status comment carries no Radar claim marker.



- [x] 56.11 Privacy enforcement for checkpoints and public metadata, after 56.2 [R87.9, R102.7, R102.16, R102.17, R102.18] (§4.32)
  - $done: Privacy enforcement for checkpoints and public metadata
  - $done: Reuse existing content scanning in process before every outgoing push range and every externally visible intake/PR/status write. Check ref names, commit messages, added lines and public metadata, without raw logs, commands, paths or private identifiers.
  - $done: Tests insert made-up private names into branch names, commit messages, PR bodies, check summaries, records and artifacts and refuse publication before the first write. Preserve useful opaque IDs and public commit/check references. Private-plan mappings and sensitive controls remain private; hidden HTML grants no secrecy.
  - $done: No internal information on public writes: refuse hostname and IP literals, *.corp/*.internal/*.local/*.lan and the owner's private machine-local internal-domain list, home paths, and this machine's own hostname and username before the first write. Public writes name a machine only by its public label (machine config; never the hostname). Tests insert a made-up hostname and username into every public field and expect refusal with nothing written.
  - $after: 56.2
  - Reuse existing content scanning in process before every outgoing push range and every externally visible intake/PR/status write. Check ref names, commit messages, added lines and public metadata, without raw logs, commands, paths or private identifiers.
  - Tests insert made-up private names into branch names, commit messages, PR bodies, check summaries, records and artifacts and refuse publication before the first write. Preserve useful opaque IDs and public commit/check references. Private-plan mappings and sensitive controls remain private; hidden HTML grants no secrecy.
  - No internal information on public writes: refuse hostname and IP literals, *.corp/*.internal/*.local/*.lan and the owner's private machine-local internal-domain list, home paths, and this machine's own hostname and username before the first write. Public writes name a machine only by its public label (machine config; never the hostname). Tests insert a made-up hostname and username into every public field and expect refusal with nothing written.




- [x] avoozl-p67 P67 Proof: fork source and upstream permissions, after 42.1, 42.2 [R102.5, R102.6, R102.7, R102.13] (§4.32)
  - $done: P67 Proof: fork source and upstream permissions
  - $done: Setup: isolated scratch upstream and authorized fork, a contributor login without upstream push/merge rights and an authorized maintainer login, plus public and private scratch spec homes. Owner supplies needed accounts; use no real repository settings.
  - $done: Action: register a pre-PR fork head, checkpoint there, then discover a fork PR head. Land from both while keeping the source branch out of upstream. Move the base and require a refreshed check/review; let the maintainer merge. Try an unregistered source and a private-plan reference on every public surface. Export twice; exercise a divergent mirror import.
  - $done: Expected: fork branches work without upstream copies, source push rights never permit target merge, the exact checked/approved head is accepted from the maintainer merge, public/private homes remain separate, untrusted fetches and leaks are refused. Retry export creates nothing new; import is not forwarded upstream.
  - $done: Also record: source and target repository/ref/SHA identities, both logins' permission results, PR head and merge SHA, standing review/check evidence, sanitized discovery records, export issue/link counts and import/forward ancestry. No credentials or private planning data in the receipt.
  - $done: Write a live docs/evidence/ receipt; do not tick from tests or unavailable second-account behavior. Failure means a permission bypass, assumed upstream source branch, stale head or private disclosure.
  - $done: Next decision: enable fork heads by default, or fix source resolution and permissions first.
  - $after: 42.1, 42.2
  - $manual: true
  - Setup: isolated scratch upstream and authorized fork, a contributor login without upstream push/merge rights and an authorized maintainer login, plus public and private scratch spec homes. Owner supplies needed accounts; use no real repository settings.
  - Action: register a pre-PR fork head, checkpoint there, then discover a fork PR head. Land from both while keeping the source branch out of upstream. Move the base and require a refreshed check/review; let the maintainer merge. Try an unregistered source and a private-plan reference on every public surface. Export twice; exercise a divergent mirror import.
  - Expected: fork branches work without upstream copies, source push rights never permit target merge, the exact checked/approved head is accepted from the maintainer merge, public/private homes remain separate, untrusted fetches and leaks are refused. Retry export creates nothing new; import is not forwarded upstream.
  - Also record: source and target repository/ref/SHA identities, both logins' permission results, PR head and merge SHA, standing review/check evidence, sanitized discovery records, export issue/link counts and import/forward ancestry. No credentials or private planning data in the receipt.
  - Write a live docs/evidence/ receipt; do not tick from tests or unavailable second-account behavior. Failure means a permission bypass, assumed upstream source branch, stale head or private disclosure.
  - Next decision: enable fork heads by default, or fix source resolution and permissions first.

## Phase 57: Review findings the owner can read and decide

Requirement 104, design §4.33.

- [x] 57.1 Finding schema, anchors and storage, after 53.2, 53.4 [R104.1, R104.2, R104.3, R104.4, R104.5, R104.8, R104.15] (§4.33)
  - $done: Finding schema, anchors and storage, after 53.2, 53.4
  - $done: Plan-review findings store severity info, warn or blocker (old values mapped on read), a quote-hash anchor and an append-only decision list; follow-ups have their own table; findingState and anchorAt are tested for moved, removed and duplicated text, and the summary counts by severity and state with zero GitHub calls.
  - $after: 53.2, 53.4
  - `review_threads` plan-review rows gain `anchor {file, lineStart, lineEnd, quote, quoteHash}` and append-only `decisions`; `review_followups` table; severity `info`/`warn`/`blocker` with the read mapping for old values; pure `findingState` and `anchorAt`; `plan.reviewSummary` adds `bySeverity` and `byState`. Tests: severity mapping, anchor survives edits, moved or removed, old rows without a quote, zero GitHub calls.
- [x] 57.2 Reviewer and planner briefs, severity and quote parsing, after 57.1 [R104.3, R104.7, R104.14, R104.16] (§4.33)
  - $done: Reviewer and planner briefs, severity and quote parsing, after 57.1
  - $done: Submit derives lines from an exact quote and refuses a missing or ambiguous one; a same-pass repeat of a rejected or resolved finding is dropped and counted; the planner brief carries accepted, rejected and deferred findings; an accepted finding opens one planner turn per plan per tick outside planReview.rounds; Review anyway adds one round at the cap. Fake chats only.
  - $after: 57.1
  - The reviewer brief asks for `info`/`warn`/`blocker` and an exact quote; `plan.review.submit` derives lines from the quote, refuses a missing or ambiguous quote, and drops a same-pass repeat of a rejected or resolved finding with a count in the note. The planner answer brief carries accepted, rejected and deferred lists. `planReviewStep` opens one person-triggered planner turn per plan per tick for an accepted, unfixed finding, outside `planReview.rounds`; Review anyway starts one more round at the cap. Fake chats only.
- [x] 57.3 Person actions: operation, policy, CLI and MCP read, after 57.1 [R104.5, R104.6, R104.8] (§4.33)
  - $done: Person actions: operation, policy, CLI and MCP read, after 57.1
  - $done: plan.review.finding.decide records accept, reject (with reason), defer (with a follow-up row), resolve and reopen with who, when and revision; it and plan.review.dispose are person-only and refused over MCP; the CLI decides and prints severity, state and anchor; defer makes no task and no GitHub call.
  - $after: 57.1
  - `plan.review.finding.decide` (accept, reject with reason, defer with a follow-up row, resolve, reopen) recording who, when and revision; added to `PERSON_ONLY`; `plan.review.dispose` maps onto it and becomes person-only; `avoozl plan finding ID ACTION [--note]`; `avoozl plan review SPEC` and `plans_plan_review` show severity, state and anchor. Tests: MCP and agent refusal for both operations; history order; defer makes no task and no GitHub call.
- [x] 57.4 Review view with tabs, cards, filters and chat links, after 57.1, 57.3 [R104.9, R104.10, R104.11, R104.15] (§4.33)
  - $done: Review view with tabs, cards, filters and chat links, after 57.1, 57.3
  - $done: The spec page's Review mode shows requirements, design and tasks tabs with severity-bordered finding cards, history and person action buttons, severity and state filters kept in the address, and Open review chat and Open planner chat links (or Chat closed), tested on plan.review.view data. Before and after screenshots (phone and desktop, light and dark) are approved by the owner before merge.
  - $after: 57.1, 57.3
  - `plan.review.view`; the spec page's Review mode with requirements, design and tasks tabs; severity borders and labels; card body, history and Accept, Reject, Defer, Resolve and Reopen; severity and state filters with counts in the address; Open review chat and Open planner chat, or Chat closed. Tests on the view data. Owner screenshot approval before merge.
- [x] 57.5 Rail alignment, scroll and highlight, and moved findings, after 57.4 [R104.4, R104.9] (§4.33)
  - $done: Rail alignment, scroll and highlight, and moved findings, after 57.4
  - $done: Rendered blocks carry their source line; each rail card sits level with its anchor with overlaps stacked; clicking a card scrolls and highlights its lines and clicking text selects the card; moved or removed findings list first; narrow screens show cards inline. Before and after screenshots (phone and desktop, light and dark) are approved by the owner before merge.
  - $after: 57.4
  - `data-source-line` on rendered blocks in `Markdown.tsx`; cards level with their anchor, overlaps stacked; card click scrolls and highlights, text click selects the card; Moved or removed group first; inline cards on narrow screens. UI tests for alignment order and selection. Owner screenshot approval before merge.
- [x] 57.6 Approve dialogs: counts, Open review link and in-place revision updates, after 57.1, 57.4 [R104.12, R104.13] (§4.33)
  - $done: Approve dialogs: counts, Open review link and in-place revision updates, after 57.1, 57.4
  - $done: Both Approve dialogs show counts by severity and state with an Open review link and no close controls; a hash change while open updates the dialog in place with changed files and findings and resets Approve, with no thrown changed error; plan.approve still refuses a stale hash. Before and after screenshots (phone and desktop, light and dark) are approved by the owner before merge.
  - $after: 57.1, 57.4
  - `PlanReviewSummary.tsx` shows counts by severity and state and Open review, without close controls; both dialogs re-read on the page refresh, update in place on a hash change with the changed files and findings, and reset Approve; `plansClient.approve` returns the change instead of throwing; `plan.approve` still refuses a stale hash. Tests: no thrown "changed" error, batch per entry. Owner screenshot approval before merge.

- [x] avoozl-p68 P68 Proof: a person reads, decides and approves a reviewed spec, after 57.1, 57.2, 57.3, 57.4, 57.5, 57.6, avoozl-p63 [R104] (§4.33)
  - $done: P68 Proof: a person reads, decides and approves a reviewed spec
  - $done: Setup: an isolated workspace and Kiro Crew home, a scratch planning repository with one draft spec that has a missing file, a hidden order and a vague criterion, and real planner and reviewer chats on two different owner-selected models with planReview.rounds 1.
  - $done: Action: run the round and the planner answer; open the Review view, filter and click each finding; accept one, reject one with a reason, defer one; let the planner's person-triggered turn write a new revision while the Approve dialog is open; press Review anyway once; approve from the dialog.
  - $done: Expected: severities, categories and quote anchors; grey, yellow and red borders with an aligned rail and highlighted lines; history with owner and revision; a follow-up with no task; the dialog updates in place with no error; the extra round does not repeat the rejected finding; approval at the revision on screen with zero GitHub calls. Screenshots at 390 and 1280 px, light and dark, approved by the owner.
  - $done: Write a live docs/evidence/ receipt. Failure means wrong anchor lines, an agent deciding a finding, a blocker changing approval, or a dialog that makes the person reopen it.
  - $done: Next decision: search other files for moved quotes, or keep same-file anchoring.
  - $after: 57.1, 57.2, 57.3, 57.4, 57.5, 57.6, avoozl-p63
  - $manual: true
  - Setup: an isolated workspace and Kiro Crew home, a scratch planning repository with one draft spec that names a missing file, hides an order in prose and has one vague criterion, and real planner and reviewer chats on two different owner-selected models with `planReview.rounds: 1`.
  - Action: (1) let the round run and the planner answer; (2) open the Review view, filter by severity, click each finding; (3) accept one answered finding, reject one with a reason, defer one; (4) let the planner's person-triggered turn write a new revision while the Approve dialog is open; (5) press Review anyway once; (6) approve from the dialog.
  - Expected: (1) findings with severities, categories and quote anchors; (2) borders grey, yellow and red, the rail lines up and each click highlights its lines; (3) history shows the owner and revision, the deferred one is a follow-up with no task; (4) the dialog updates in place with the changed files, no error, and the accepted finding is fixed; (5) one more round that does not repeat the rejected finding; (6) approval at the revision on screen, the same as with no review, with zero GitHub calls. Screenshots at 390 and 1280 px, light and dark, approved by the owner.
  - Failure means: an anchor points at the wrong lines, an agent can decide a finding, a blocker changes approval, or the dialog makes the person reopen it.
  - Next decision: search other files for moved quotes, or keep same-file anchoring.

## Phase 58: A role per repository replaces Where tasks live

Requirement 105, design §4.34.

- [x] 58.1 Repository roles replace Where tasks live, after 20.2 [R105.1, R105.2, R105.3, R105.4, R105.5, R105.6, R105.7, R105.8, R105.9, R105.10, R28.1] (§4.34)
  - $done: Repository roles replace Where tasks live, after 3.14, 20.2
  - $done: Repository setup shows an in-place role picker per repository (local, code, planning, both); the mode and planningRepository derive from roles through one resolver that also reads old files without writing; mixed roles are refused; the Where tasks live page is gone with its link opening Repository setup and workspace-wide settings in Settings › Workspaces. Tests cover the mapping, migration and screens, and screenshots (phone and desktop, light and dark, full app shell) are under docs/evidence/repo-roles/.
  - $after: 20.2
  - One resolver in `github-policy.mjs` maps roles to mode and `planningRepository` and back, refuses mixed roles, and runs in the config loader; the schema gains `role` and keeps `mode` and `planningRepository`. Repository setup shows an in-place role picker per repository, the "Tasks live in" line and a synthesized "GitHub only" planning row; the Where tasks live page and tab are removed, the workspace-wide settings move to Settings › Workspaces, and the old link opens Repository setup. Tests for the mapping, migration, refused mixes and screens; screenshots (phone and desktop, light and dark, in the full app shell) under `docs/evidence/repo-roles/`.

## Phase 59: Trace moves into task details

Requirement 106, design §4.35.

- [x] 59.1 Remove Trace; task details get a Timeline of Avoozl's task steps, after 55.4 [R106.1, R106.2, R106.3, R106.4, R106.5, R106.6, R106.7, R106.8, R106.9] (§4.35)
  - $done: Remove Trace; task details get a Timeline of Avoozl's task steps, after 55.4
  - $done: The Timeline box in task details lists spec approved, ready, started (attempt N), failed attempts, checks, landed, builds and integrated from stored records only, each with its time and the wait before it; the Trace nav entry, page, drawer, Done work list, radar.trace and trace.done are gone; an old trace link opens Delivery or the task's details; tests cover the steps, redirects, nav and zero GitHub calls, and screenshots (phone and desktop, light and dark, full app shell) are under docs/evidence/trace-into-task/.
  - $after: 55.4
  - Built: PR #469 (`ba0d7963`).; `src/app/tasks/task-steps.mjs`, the Timeline box in `TaskDrawer.tsx` and `OldTraceLink.tsx` for old `?trace=` links.
  - `task-steps.mjs` builds the steps from stored records and `taskDetailView` returns them; the Timeline box shows them above the history list, with builds by phase. The Trace nav entry, page, drawer, Done work list, `radar.trace`, `trace.done` and the Trace buttons are removed; old links open Delivery or the task's details. Tests for the steps, redirects, nav and zero GitHub calls; screenshots (phone and desktop, light and dark, full app shell) under `docs/evidence/trace-into-task/`.

## Phase 63: One intake list

Requirement 110, design §4.39.

- [x] 63.1 GitHub sources in `intake.sources` replace `github.issueIntake` and `github.queue`, after 14.2, 56.8, 44.6 [R110.1, R110.2, R110.3, R110.6, R110.7, R110.9, R50.6] (§4.39)
  - $done: GitHub sources in `intake.sources` replace `github.issueIntake` and `github.queue`, after 14.2, 56.8, 56.14, 44.6
  - $done: `intake.sources` takes `via: github` with the old issue intake keys and refuses the wrong keys per kind; an old `github.issueIntake` loads as a source and an old `github.queue` is ignored, with no warning and no apply flag; Avoozl's next write moves old entries into `intake.sources` once; `github configure` and Repository setup write a source; Radar intake, escalations and back-links still work on a migrated repository; Intake sources lists each GitHub source in the shared box with a link to Repository setup; tests cover each case, and screenshots are checked outside git, not kept in it.
  - $after: 14.2, 56.8, 44.6
  - `github-sources.mjs` reads `via: github` entries and old `github.issueIntake` entries as one list and writes sources, moving old keys once on the first write; `validateSource` takes the GitHub kind; `sourceMap` leaves it out; `github configure` and Repository setup write a source. `github.queue` is ignored. Intake sources lists each GitHub source in the shared box with a link to Repository setup. Tests; before and after screenshots checked outside git, not kept in it.

## Phase 64: Task facts move into tasks.md

Requirement 111, design §4.40.

- [x] 64.1 Facts bullets replace `avoozl/manifest.json`, convert this repository's specs [R111.1, R111.2, R111.3, R111.4, R111.5, R111.6, R111.7, R111.8, R111.9, R111.10, R111.11] (§4.40)
  - $done: Facts bullets replace avoozl/manifest.json, convert this repository's specs
  - $done: `spec-facts.mjs` reads `Facts:` bullets and front-matter into the parse; lint refuses each bad shape with its file and line; a leftover manifest is an error; the revision hash is unchanged by a pure conversion; every spec here is converted and its manifest deleted; tests cover each rule and the before and after parse.
  - `spec-facts.mjs` reads `Facts:` bullets and front-matter into the object `parseSpec` read from the manifest, with lint codes and lines; `specHash` stops reading the manifest and hashes prose plus canonical parsed facts, so a converted spec keeps its hash; the manifest readers, `spec-manifest.mjs`, the manifest review tab, the planner prompt and the steering file change; every spec here is converted once and its `manifest.json` deleted; tests cover each rule and the before and after parse.
- [x] 64.2 Convert the Nupp plans to Facts bullets, after 64.1 [R111.10] (§4.40)
  - $done: Convert the Nupp plans to Facts bullets, after 64.1
  - $done: The Nupp plans branch `avoozl-plans` is converted in one pull request, tested on a copy first, merged after its checks, with no Nupp code repository touched.
  - $after: 64.1
  - In the Nupp plans repository, branch `avoozl-plans`, run the converter on a copy, check the parse and the hashes, convert in one pull request and merge it after its checks. Touch no Nupp code repository. Report a question if those specs fall under person-only approval.
  - Built: Nupp plans pull request #42 on `avoozl-plans`.

## Phase 65: A tick on the base branch completes the task

Requirement 113, design §4.41.

- [x] 65.1 A tick on the base branch marks the task done, no re-approval, after 64.1 [R113.1, R113.2, R113.3, R113.4, R113.5, R113.6, R113.7, R113.8] (§4.41)
  - $done: A tick on the base branch marks the task done, no re-approval
  - $done: Each workspace tick reads tasks.md from the base branch; a `[x]` item completes its task with the tick's commit, releases its worker session, and keeps the hash; an untick waits in Needs you with Reopen and Keep done; a ticked item with no ID is a lint error; tests cover each.
  - $after: 64.1
  - `spec-ticks.mjs` and `applyBaseTicks` in `operations.mjs`; `conflicts.settle` takes `reopen` and `keep`; the Conflicts page shows the `untick` item.
- [x] 65.2 Landing ticks its task in the landing commit, ticks are the shared state, after 65.1 [R113.8, R113.9, R113.10, R113.11, R113.12, R113.13] (§4.41)
  - $done: Landing ticks its task in the landing commit, ticks are the shared state, after 65.1
  - $done: A direct landing's merge commit carries the task's `[x]` and changes no other byte; a parent ticks after its last child; a spec in a plans repository gets its own guarded commit with retry; the landing machine records no duplicate; a second machine reading origin marks the task done; tests cover each.
  - $after: 65.1
  - `tickEntry` in `stackMembers`, `tickPlansRepo` after the push, `baseTasks` reads `origin/<base>`.
- [x] 65.3 The tick writes a Built line, and receipts are read by commit, after 65.2 [R101.14, R113.8, R113.14] (§4.31, §4.41)
  - $done: The tick writes a Built line, and receipts are read by commit, after 65.2
  - $done: After a landing's push, one `[skip ci]` commit adds `Built: <main commit>` to the task's Facts block and the hash does not change; every commit reaching the base branch has its push run's receipts read once by that commit; a pull request head's receipts count under the commit it landed as; Flow and the task show one CI time per main commit; tests cover a direct push and a squash-merged pull request.
  - $after: 65.2
  - Built: `07481b845595`.
  - `builtText` and `recordBuilt` write the line, `readFacts` skips it, `applyTicks` keeps `task.built`, `readReceipts` reads base-branch push heads, `pr_ci.mergeCommit` links a head to its main commit, `observationsAtMain` and `buildRows` give one CI time per commit.
- [x] 65.4 The tick commit is a task's landing commit; Avoozl writes no Built line, after 65.3 [R101.14, R113.8, R113.14] (§4.31, §4.41)
  - $done: The tick commit is a task's landing commit; Avoozl writes no Built line, after 65.3
  - $done: A landing makes one commit that ticks; each ticked task keeps the base-branch commit that ticked it, found by first-parent blame and kept in SQLite; receipts and Flow look its CI up by it; a person's Built line is still read; tests cover a direct push, a squash merge and a rebuild from git.
  - $after: 65.3
  - `recordBuilt` and `builtText` are gone; `tickCommits` blames `tasks.md`; `applyTicks` keeps `task.tickCommit`; `observationsForTask` reads it.

## Phase 66: Git is the source of truth

Requirement 114, design §4.42.

- [x] 66.1 Approvals are approvers' authored commits on main, after 65.2 [R114.1, R114.2, R114.3, R114.4, R114.5] (§4.42)
  - $done: A commit on main whose author email is an approver approves the spec as its tree holds it, whatever its committer; Avoozl's and its agents' commits use the checkout's git identity with no Co-authored-by, and spec drafts reach main only through Approve; Approve writes and pushes the person's commit; no Status line, marker or decision record is written.
  - $after: 65.2
  - `git-approvals.mjs`, `approveInGit` in `operations.mjs`, `spec-approval.mjs`.
- [x] 66.2 Landing trailers, recoverable intake and `avoozl rebuild`, after 66.1 [R114.6, R114.7, R114.8, R114.9] (§4.42)
  - $done: Landing commits carry each task's metrics as trailers; intake tasks name their item with `source:`; dismissed items carry `avoozl:dismissed`; MCP pushes become GitHub issues; a deleted database rebuilds to the same plans, approvals and tasks.
  - $after: 66.1
  - `landing-trailers.mjs`, `intake.mjs` `submitItems`, `workspace.rebuild`, `src/app/git/test/git-approvals.test.mjs`.
- [x] 66.3 Flow spans and retros in git, trailers on pull request landings, and Triage's Dismiss button, after 66.2 [R114.9, R114.11] (§4.42)
  - $done: Landing commits carry each task's Flow spans; a pull request landing's merge commit carries the same trailers; finished retros are committed files; a deleted database rebuilds to the same Flow spans and retros; Triage has a Dismiss button that adds avoozl:dismissed.
  - $after: 66.2
  - `landing-trailers.mjs` `landingMessage`, `retro-files.mjs`, `landing-pulls.mjs`, `UntriagedView.tsx`.

- [x] 66.4 The tick adopts approvals that reach main with no click, after 66.3 [R114.12] (§4.42)
  - $done: An approver-authored spec commit on main, such as a GitHub squash merge, approves the spec on the next tick as rebuild would; a non-approver's commit approves nothing; a later non-approver edit needs approval again; a click adds no second Activity row.
  - $after: 66.3
  - `applyMainApprovals` and `adoptApprovals` in `operations.mjs`, `baseHead` in `spec-ticks.mjs`, `src/app/git/test/git-approvals.test.mjs`.

## Phase 67: Task IDs and refs in tasks.md

Requirement 115, design §4.43.

- [x] 67.1 Checked, linked requirement and design refs, and optional backticked task IDs [R115] (§4.43)
  - $done: A ref the spec does not define is a lint error naming the ref, file and line; a task ID reads the same bare or backticked; refs are left out of the title and shown as chips that open their section; every spec under `.kiro/specs/` lints clean.
  - `spec-refs.mjs`, `specItems` and `parseSpec` in `spec-plans.mjs`, `PhaseTasks` in `PlansView.tsx`.

## Phase FS: Flexible spec folders

Requirement FS1, design §FS1.

- [x] `fs-1` specs.path, only tasks.md required, other Markdown as spec text [FS1] (§FS1)
  - $done: `specs.path` in `.avoozl.json` names the specs folder (default `.kiro/specs`) and is refused when absolute, with `.` or `..`, or through a symlink out of the checkout; only `tasks.md` is required; every other `.md` file in a spec folder is part of the revision hash and named to workers; a requirement or design ref is checked only when its file exists and otherwise names the missing file; Kiro's three-file layout hashes and lints as before.
  - `specs-path.mjs`, `readSpecFolder` and `revisionFiles` in `spec-plans.mjs`, `resolveRefs` in `spec-refs.mjs`, `git-approvals.mjs`, `src/app/specs/test/flexible-specs.test.mjs`.

## Phase 68: The spec issue's assignee says who works on a spec

Requirement 116, design §4.44.

- [x] 68.1 The spec issue's assignee drives; a landed spec closes its issue, after 66.3 [R116.1, R116.2, R116.3, R116.4, R116.5, R116.6, R116.8] (§4.44)
  - $done: Tests with a fake GitHub of two logins: the one assignee drives and the other workspace reads only; reassigning moves the driver and unassigning releases it, with no assignee write; two assignees leave both machines read only with one Needs you item; a fully landed spec's issue closes once; a spec with no issue drives as Not shared; the tick adds no read.
  - $after: 66.3
  - `verdictOf` and `closeLanded` in `driver.mjs`, `src/app/workers/test/spec-assignee.test.mjs`.
- [x] 68.2 The Specs list and the spec's chip show the driver from the assignee, after 68.1 [R116.7] (§4.44)
  - $done: Each approved spec's row says You drive, Taken by <login>, Not shared, Nobody drives or N assignees, from the cache; the chip says the same; phone and desktop, light and dark screenshots go to the owner.
  - $after: 68.1
  - `plansTableView` `driver`, `rowDriverText` and `chipText` in `driver-api.ts`, `SpecList`.

## Phase 69: The specs branch

Requirement 117, design §4.45.

- [x] 69.1 Delete the mirror and the plans branch; a repository names its specs branch, after 66.1 [R117.1, R117.2, R117.3, R117.4, R117.5, R117.6] (§4.45)
  - $done: `src/app/mirror/`, `spec-homes.mjs`, `repo-files.mjs`, the instance publish step and the mirror UI are gone; `specs.branch` decides where specs, approvals and ticks are read and written; tests cover plans-repo mode on a specs branch.
  - $after: 66.1
  - `specs-branch.mjs`, `git-approvals.mjs` `approvalBase`, `spec-ticks.mjs` `tickPlansRepo`, `spec-ticks-landing.test.mjs`, `git-approvals.test.mjs`.

## Phase 70: Avoozl reads git and GitHub

Requirement 118, design §4.46.

- [x] 70.1 One approval path, an approver's commit read on the tick, after 66.4 [R118.1, R118.2, R118.8] (§4.46)
  - $done: One approval path, an approver's commit read on the tick, after 66.4
  - $done: One commit approves every spec it changes in $after order; Approve and chat approval are the person's own commit; tests cover an epic commit approving three specs and the epic.
  - $after: 66.4
  - `adoptCommitted` and `applyMainApprovals` in `operations.mjs`, `src/app/git/test/git-approvals.test.mjs`.
- [x] 70.2 Spec pull requests are pull requests, after 70.1 [R118.3] (§4.46)
  - $done: Spec pull requests are pull requests, after 70.1
  - $done: Merging a spec pull request authored by an approver approves it.
  - $after: 70.1
  - `git-approvals.mjs`.
- [x] 70.3 The driver is the spec issue's assignee, after 70.1 [R118.4] (§4.46)
  - $done: The driver is the spec issue's assignee, after 70.1
  - $done: The driver reads the spec issue's assignee and never writes it; the read-only banner links to the spec issue; This computer holds only the label.
  - $after: 70.1
  - `driver.mjs`, `driver-scope.mjs`, `Driver.tsx`, `driver-api.ts`.
- [x] 70.4 Landing is a guarded push, after 70.3 [R118.5, R118.8] (§4.46)
  - $done: Landing is a guarded push, after 70.3
  - $done: Landing pushes or merges through `guarded-push.mjs`; tests cover a guarded fast-forward refusing a moved base and a head-guarded merge.
  - $after: 70.3
  - `guarded-push.mjs`, `merge-batch.mjs`, `landing-pulls.mjs`, `direct-landing.mjs`, `pr-landing.mjs`.
- [x] 70.5 Work runs on the driver's own machine, after 70.4 [R118.6] (§4.46)
  - $done: Work runs on the driver's own machine, after 70.4
  - $done: The tick dispatches only to this machine's own executors; process workers here run as before; tests cover the runner role's envelope and push.
  - $after: 70.4
  - `remote-runner.mjs`, `src/app/test/worker-mode.test.mjs`.
- [x] 70.6 Make the GitHub issues after approval, after 70.1 [R118.7, R118.8] (§4.46)
  - $done: Make the GitHub issues after approval, after 70.1
  - $done: An approved spec with no spec issue in a GitHub workspace shows Make the GitHub issues as its primary action, which runs spec.publish in its home repository; approval never runs it; tests cover the action and the call.
  - $after: 70.1
  - `primaryAction` and `SpecHeader` in `PlansView.tsx`, `plansClient.publish`.
