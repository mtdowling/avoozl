---
repo: avoozl
---
# Tasks: Avoozl

Tasks run in list order, and each phase waits for the one above it.
Manual proofs describe their setup, actions and expected results.
Requirement numbers are in brackets; section numbers refer to `design.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces; Avoozl runs the repository's checks; no real workspace data,
credentials, or personal plans in the repository (AGENTS.md).

A task only a person does ends its title with `(**MANUAL**)`: proofs that
need scratch organizations, publishing, and tasks waiting on Kiro Crew. It
waits in Needs you for a person.

Each task's plain sub-bullets say what done means.

## Phase 1: App shell inside Kiro Crew

- [x] `1.1` Add `avoozl app-backend`: HTTP on `127.0.0.1` only, health route, every other route requires a valid gateway-signed principal and returns 401 otherwise. [R1, R20.4] (§4.1, §4.7)
  - Add `avoozl app-backend`: HTTP on `127.0.0.1` only, health route, every other route requires a valid gateway-signed principal and returns 401 otherwise.
- [x] `1.2` Add `avoozl mcp` as the app's stdio MCP server. [R24.5] (§4.1)
  - `avoozl mcp` serves the grouped `plans_*` tools over stdio.
- [x] `1.3` Replace `hosts/kirocrew/app.json` with the manifest in §4.2: node backend with `signedPrincipal`, `mcpServers`, script cron, notification channels, agents, skill, optional `gh`. [R1, R26.3]
  - Replace `hosts/kirocrew/app.json` with the manifest in §4.2: node backend with `signedPrincipal`, `mcpServers`, script cron, notification channels, agents, skill, optional `gh`.
- [x] `1.4` Ship `crons/tick.py:run` that calls `plans_maintain` action `tick`, opens and messages sessions from the returned intents, and raises `Skip` when there is nothing to do. [R26.2–26.5] (§4.6)
  - `crons/tick.py:run` calls `plans_maintain` action `tick`, opens and messages sessions from the returned intents, and raises `Skip` when there is nothing to do.
- [x] `1.5` Implement `workspace.tick` with the lock, policy load, and an empty intent list; prove two ticks in a row write nothing. [R26.4, R26.5] (§4.5)
  - Implement `workspace.tick` with the lock, policy load, and an empty intent list; prove two ticks in a row write nothing.
- [x] `1.6` Build the Workspace view: workspace list from the machine catalog, add or initialize workspace, repository registration, tick health. [R3, R20] (§8)
  - Build the Workspace view: workspace list from the machine catalog, add or initialize workspace, repository registration, tick health.
- [x] `1.7` Session binding and session-title rediscovery (`avoozl:<task-id> …`). [R1.2] (§3.3, §8)
  - `plans_session` actions `bind` and `rediscover` bind a slot to a task and rebuild lost bindings from session titles.
- [x] `avoozl-p1` P1 Proof: real Avoozl backend inside Kiro Crew [R1, R20.4]
  - Expected: the page loads data through `useAppApi`; the direct call gets 401; the only Avoozl listener is on `127.0.0.1`.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: clean Kiro Crew profile; install the app from a local build with `kirocrew app install`; grant trust.
  - Action: open the Avoozl page; call a backend route directly on its loopback port without the gateway; list listening sockets.
  - Failure means: the node backend or signed-principal contract does not work for third-party apps.
  - Next decision: if it fails, move the page's API onto the MCP server and decide whether a backend is needed at all.
- [x] `avoozl-p2` P2 Proof: tick script cron opens, messages, and observes sessions [R26, R1.2]
  - Expected: one session titled `avoozl:<task-id>` opens in that folder on the named agent, receives one brief, is bound before the brief is sent, and its closed status is read on the next tick.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: one registered repository with a Kiro Crew folder whose project directory the user set; a stub task that requests one dispatch.
  - Action: let the cron fire twice; close the opened session; let it fire again.
  - Failure means: script crons cannot open sessions in folders or cannot call `session_status` (MC-2).
  - Next decision: if status is unreadable, decide between asking Kiro Crew for MC-2 and having workers report liveness through `plans_report` only.
- [x] `avoozl-p3` P3 Proof: workspace picker loads real SQLite data [R3.1]
  - Expected: 141 W tasks across 7 epics, 130 edges, and the 3 milestones appear; the source file is unchanged byte for byte.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: a read-only copy of the Nupp database and its `.avoozl.json`.
  - Action: add the copy in the Workspace view; open Graph.
  - Failure means: the rebased schema or catalog cannot read real data.
  - Next decision: fix migration before any Phase 2 work.

## Phase 2: Local delivery

- [x] `2.1` Extend the work model with `kind`, `authority`, `route`, `completion`, and edge completion conditions [R4.3–4.6, R19.2] (§4.3)
  - Extend the work model with `kind`, `authority`, `route`, `completion`, and edge completion conditions
  - Readiness per §4.3. A row linked to an issue reads as `github`; any other row reads as `local`.
- [x] `2.4` Extend deterministic validation [R4.5, R30.4, R30.5] (§5, §6.8)
  - Leaf boundedness (one repository, acceptance, checks, completion), cycles, unknown references and duplicate IDs; a spec-folder reader turns `tasks.md` into the task list `lintPlan` checks, and refuses a missing folder, a missing task list, an item with no ID and a duplicate ID.
- [x] `2.3` Ship the `avoozl-spec` and `avoozl-spec-review` skills for goal capture [R4.1, R30.7] (§5, §6.8)
  - `avoozl-spec` drafts one Kiro spec folder (`requirements.md` or `bugfix.md`, `design.md`, `tasks.md` with an ID on every item); `avoozl-spec-review` reviews it in a separate session.
- [x] `2.5` Build the Plans view: Kiro spec folders (feature and bugfix), diagnostics, approve the exact revision (hash of the folder's files). [R20, R30] (§8)
  - The Plans view lists Kiro spec folders (feature and bugfix) with their diagnostics and approves the exact revision (hash of the folder's files).
- [x] `2.6` Add `plans_prepare_worktree` (branch `avoozl/<task-id>`, isolated worktree) and `plans_report` (`progress`, `done` with commit SHA, `blocked`, `question`). (§4.6, §5)
  - Add `plans_prepare_worktree` (branch `avoozl/<task-id>`, isolated worktree) and `plans_report` (`progress`, `done` with commit SHA, `blocked`, `question`).
- [x] `2.7` Dispatch ready local leaves in the tick by priority and graph order within per-repository and per-workspace limits. [R6.1–6.3, R26.7] (§4.5)
  - Dispatch ready local leaves in the tick by priority and graph order within per-repository and per-workspace limits.
- [x] `2.8` Verify each `done` report; accept only a matching SHA and passing declared checks. [R7.1] (§5)
  - Avoozl verifies each `done` report and accepts only a matching SHA and passing declared checks.
- [x] `2.9` Integrate verified commits with `integrateRun`; support an optional `integrationBranch`; record the integrated commit. [R7.2, R2.2] (§5)
  - Integrate verified commits with `integrateRun`; support an optional `integrationBranch`; record the integrated commit.
- [x] `2.10` Release dependents in the same tick; complete packages and epics from children; keep whole-head acceptance a separate action. [R7.3, R7.4] (§5)
  - Release dependents in the same tick; complete packages and epics from children; keep whole-head acceptance a separate action.
- [x] `2.11` Failure handling: retry with a resume brief on the same worktree up to the bound, nudge quiet sessions, never replace on elapsed time alone, open a decision past the bound. [R8] (§5)
  - Failure handling: retry with a resume brief on the same worktree up to the bound, nudge quiet sessions, never replace on elapsed time alone, open a decision past the bound.
- [x] `2.12` Decisions and notifications through the app's channels with a link to the session. [R9, R26.10] (§4.2)
  - Decisions and notifications through the app's channels with a link to the session.
- [x] `2.13` Build the Graph, Delivery, and Conflicts views for local tasks. [R20, R21] (§8)
  - Build the Graph, Delivery, and Conflicts views for local tasks.
- [x] `2.15` Plans table grouped by category [R30.9, R20] (§6.8, §8)
  - One row per plan with status, a progress bar (done over total leaves; "no tasks" when there are none), ready, running and needs-you counts, epics, last change, and a Change spec button. Category comes only from `category:` in the spec's front-matter.
- [x] `avoozl-p4` P4 Proof: one local parent decomposes into dependent leaves [R4]
  - Expected: one Kiro spec folder that passes validation; one epic and at least three leaves with stable IDs, `requires` edges loader → validator → flag, a critique record from a separate session, validation passing; the second and third ticks write nothing until something changes.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: an empty workspace and a small sample repository with a test command.
  - Action: in Kiro Crew chat, ask Avoozl to plan "add a config file loader, a validator that uses it, and a CLI flag that uses both"; approve the reviewed graph; run the tick three times.
  - Failure means: planning output is not bounded or the tick is not idempotent.
  - Next decision: tighten the planner brief and validator, or reconsider tick boundaries.
- [x] `avoozl-p5` P5 Proof: automatic Kiro Crew execution of ready leaves [R6, R7]
  - Expected: only the loader dispatches first; after its checks pass and it integrates, the validator dispatches, then the flag; every task links to its worker session and check run; the integration branch has three verified commits.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: the approved graph from P4; concurrency 2.
  - Action: leave the tick running with no human input.
  - Failure means: readiness, verification, or release ordering is wrong.
  - Next decision: decide whether verification must move into the worker session to cut latency.
- [x] `avoozl-p6` P6 Proof: worker failure and recovery [R8]
  - Expected: the first leaf retries once with a resume brief and then succeeds; the closed session marks its leaf failed and retryable; after restart the first tick observes every bound session before any new dispatch; no task loses its ID, edges, or evidence.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: a leaf whose first attempt is told to fail its checks; a second leaf running.
  - Action: let the first attempt fail; close the second leaf's session by hand; restart the gateway mid-run.
  - Failure means: task truth depends on process state.
  - Next decision: move any missing state into SQLite receipts or GitHub.

## Phase 3: GitHub core

- [x] `3.1` Remove the private-only check; allow public and private repositories. [R10.2]
  - Remove the private-only check; allow public and private repositories.
- [x] `3.2` Implement the `.avoozl.json` repository policy schema and validation in §4.4. [R10] (§4.4)
  - The `.avoozl.json` repository policy schema and its validation follow §4.4.
- [x] `3.4` Keep snapshot freeze and quarantine on body change for every incoming item. (§4.12)
  - An incoming item's snapshot is frozen when a task starts from it, and a later body change quarantines the task.
- [x] `3.5` Implement marker version 2 with an opaque namespace ID (generated by `avoozl init`, stored in `.avoozl.json`), hash-only source pins, and `applied` hashes [R10.7] (§3.4)
  - Implement marker version 2 with an opaque namespace ID (generated by `avoozl init`, stored in `.avoozl.json`), hash-only source pins, and `applied` hashes
  - Reject markers containing paths, repository names of the planning workspace, or credential patterns. Add the `order` field (closer, close reason, close time) for a close without code by an allowed actor, removed on reopen.
- [x] `3.10` Implement `avoozl rebuild` from GitHub markers, sub-issues, dependencies, labels, and Project fields. (§3.3)
  - Implement `avoozl rebuild` from GitHub markers, sub-issues, dependencies, labels, and Project fields.
- [x] `3.13` Settings view for `.avoozl.json` [R20, R28] (§4.4, §8)
  - The Settings view edits `.avoozl.json` with validation. GitHub objects (labels, Project, fields) are created by the wizard in 3.18, not here.
- [x] `3.16` Read plans only from Kiro spec folders in the mode's repository (planning repository, code repository, or the workspace's planning repository) [R30] (§6.8)
  - Read plans only from Kiro spec folders in the mode's repository (planning repository, code repository, or the workspace's planning repository)
  - Map `tasks.md` IDs to issues; ignore Kiro's task waves and checkbox marks; refuse an approved ID whose item text changed without approval.
- [x] `3.17` Marker and leak rules for plans-repo mode: the marker never names the planning repository; Avoozl writes links only between planning issues and adds only planning issues to the Project. [R28.7] (§3.4, §6.6)
  - Marker and leak rules for plans-repo mode: the marker never names the planning repository; Avoozl writes links only between planning issues and adds only planning issues to the Project.
- [x] `avoozl-p9` P9 Proof: cross-repository dependencies and fresh-workspace recovery [R19]
  - Expected: GitHub shows the cross-repository blocker; only the first leaf is ready; after rebuild every task, edge, status, and managed baseline matches the earlier state and no issue is duplicated.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: single-repo mode with two repositories, one public and one private; a leaf in the second requires a leaf in the first.
  - Action: apply; then delete the workspace's SQLite file, run `avoozl rebuild`, then the tick, then apply again.
  - Failure means: some truth still lives only in SQLite.
  - Next decision: move that state into the marker or GitHub.
- [x] `avoozl-p20` P20 Proof: local and github tasks in one workspace
  - Expected: two issues exist and the local leaf has none and shows "local" in every view; it never appears in a projection preview while marked local; after the plan change it gets one issue, keeps its task ID, and now shows its issue link; no task ever has two writable rows.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: a workspace with a GitHub mode; an approved plan with three leaves, one marked `authority: local`.
  - Action: apply; run the tick five times; then remove `authority: local` from that entry, approve, and apply.
  - Failure means: authority defaults or the local-to-github path are wrong.
  - Next decision: decide whether workspace-level `defaultAuthority: local` needs its own proof.
- [x] `avoozl-p21` P21 Proof: Kiro spec folder validation [R30]
  - Expected: each broken copy is refused with the file and line; the two good specs project, the bugfix spec's unchanged-behavior clauses appear as acceptance; Kiro's waves never change Avoozl's edges.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: one feature spec and one bugfix spec written by Kiro, plus broken copies: a missing `design.md`; both `requirements.md` and `bugfix.md`; an item with no ID; a duplicate ID; a manifest entry with no item; a renumbered approved item.
  - Action: validate each; approve and project the two good specs.
  - Failure means: the layout rules are not deterministic or miss a case.
  - Next decision: decide whether IDs need an explicit token beyond Kiro's numbering.

## Phase 4: Delivery loops

- [x] `4.3` Ship the `avoozl-responder` agent (read-only tools) and `plans_post_reply` with secret and path screening; responding label added and removed by Avoozl. (§4.7)
  - Ship the `avoozl-responder` agent (read-only tools) and `plans_post_reply` with secret and path screening; responding label added and removed by Avoozl.
- [x] `4.5` Priority order by configured labels, then graph order, under the concurrency cap. (§4.5)
  - Priority order by configured labels, then graph order, under the concurrency cap.
- [x] `4.8` Leak screen [R28.7, R28.8] (§6.6)
  - Leak screen
  - Each tick searches candidate pull request titles, bodies, and commit messages for the planning repository's `owner/name`, URL, and `owner/name#`; a hit opens a decision, blocks completion, and asks the worker to edit.

## Phase 7: Release preparation

- [x] `7.1` Rewrite README and docs around installing the Kiro Crew app; no host-era instructions. [R24.1] (§13)
  - Rewrite README and docs around installing the Kiro Crew app; no host-era instructions.
- [x] `7.3` License audit of bundled third-party code with notices. [R24.4] (§13)
  - License audit of bundled third-party code with notices.
- [x] `7.4` Secret, private-name, company-internal-tool-name, and absolute-path scans over the tree and history [R24.2, R34.10] (§13)
  - Secret, private-name, company-internal-tool-name, and absolute-path scans over the tree and history
  - Keep specs and research with machine-local paths out of the release or rewrite them; regenerate receipts instead of editing them.
- [x] `7.5` Verify compatibility surfaces: `plans_*`, `AVOOZL_*`, `AICOMMANDER_*`, `NUPP_WORKSPACE_*`, and the `aicommander` command. [R24.5]
  - Verify compatibility surfaces: `plans_*`, `AVOOZL_*`, `AICOMMANDER_*`, `NUPP_WORKSPACE_*`, and the `aicommander` command.
- [x] `avoozl-p15` P15 Proof: open-source installation on a clean machine [R24] (**MANUAL**)
  - Expected: local delivery completes with no GitHub; GitHub features report unavailable until `gh` or a token exists, then work; no step needs private context.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: a fresh machine or user account with Kiro Crew, Node, and Git only; no `gh`.
  - Action: follow the public README to install the app, create a workspace, and run P4 and P5's flow; then install `gh` and run P7 on a public repository.
  - Failure means: the release depends on this machine's setup.
  - Next decision: fix the docs or packaging before publishing.

## Phase 8: Plugins

- [x] `8.6` Plugin loading [R34.1–R34.9, R34.11] (§4.4, §4.7, §4.8)
  - Plugin loading, after 8.1
  - `plugins` entries in `.avoozl.json` and in machine-local settings (`id`, one of `package` or `path`, `contract`, non-secret `config`); validation per §4.4; `avoozl-plugin.json` manifest (`id`, `version`, `contract`, `kinds`, capabilities, `entry`), reserved ids `local` and `github`; Settings **Add plugin**, approve, disable, remove; approval per id, version, and content hash, stored on this machine only, never by the tick or example installation; a warning before saving a `plugins` entry into a public repository's `.avoozl.json`; one Node child process per plugin over stdio, no port, a listening-socket check that stops a plugin that listens; reply schema validation, replies quoted as untrusted data; per-call time limit inside the tick budget; a missing, unapproved, crashed, timed-out, invalid, or wrong-contract plugin parks its tasks as "needs you" and the tick finishes everything else; supported contract versions listed and others refused. Move 8.1's fake route behind the loader.
  - Git sources: an entry with `git`, `ref`, and optional `subdir` (exactly one of `package`, `path`, or `git`); Add and Update resolve `ref` to a full commit, store the pin on this machine, and fetch only that commit shallow into `<plugins>/git/<id>/<commit>/` with the person's git, hooks off, no submodules, no install; approval binds to the commit, version, and hash, and a new commit needs a new approval; refuse credentialed URLs, a `subdir` that escapes, a missing manifest, and unshipped dependencies; the tick never fetches. Settings **Add from git** shows the resolved commit before approval. Tests use local `file://` repositories only. [R34.12–R34.15] (§4.8)
- [x] `8.8` Private integration boundary, with 8.6 [R34.10, R34.11, R24.2] (§4.8, §13)
  - Private integration boundary, with 8.6
  - A public guide to writing a route or tracker plugin that uses only the fake plugins as examples; the fake route and fake tracker live under `test/fixtures/plugins/`; extend the 7.4 scan to plugin docs and fixtures so no company-internal tool name lands in the public tree.
- [x] `8.9` Plugin update checks, after 8.6 [R34.17] (§4.8)
  - Plugin update checks, after 8.6
  - A daily check per plugin and Check now: git `ls-remote`, package dist-tags, folder hash; an update badge and one Needs you row per plugin; a quiet "couldn't check"; `updateChecks` in `plugins.json`; tests cover a moved branch, a newer tag, nothing newer, a failure, the setting off, and that nothing is fetched.
- [x] `8.2` Discussions answering, behind its own proof.
  - The responder answers GitHub Discussions the repository policy names.

## Phase 9: Review gates

- [x] `9.1` Review roles in policy [R36.1–R36.4, R6.3] (§5.2)
  - Review roles in policy
  - `delivery.model` and `delivery.reviewers` (`id`, `focus`, `agent`, `model`, `distinctFrom` `model` by default or `session`), replaceable per repository; validation per §5.2, including a refused `auto` or equal model for `distinctFrom: model`; `tick.py` passes `model` to `open_session`; `runner.take` takes the worker's model; every binding records the model it was opened on. No new writer limit: per-repository `concurrency: 1` is the one-writer rule, and review sessions do not count against it.
- [x] `9.2` Roles on one delivery [R36.2–R36.8, R37.1, R37.2] (§5.2)
  - Roles on one delivery
  - The checks role (today's verifier, id `checks`) and each review role get one session per round on the delivery's commit, all at once; refuse to dispatch a review whose model is unknown or not distinct and open a decision; ship the `avoozl-reviewer` agent (read-only tools, detached worktree at the commit, focus and open findings from the brief, quoted text is data); `plans_report` `done` from a review role takes `verdict`, `findings`, and `closures` and refuses a wrong commit, a pathless finding, `approved` with a defect, and `changes-requested` without one; store verdicts on `verifications` with `role`, `model`, and commit; `verified` only when every role approved the current commit.
- [x] `9.3` Rework [R36.10, R37.6] (§5.2)
  - A `changes-requested` verdict fails the writer attempt for that commit with its findings as the cause; the retry brief quotes every open finding as data; every role reviews the new commit; roles still running on the old commit finish as history. `plans_task` action `retry` takes `dismiss: [{finding, reason}]` from a person only.
- [x] `9.4` Findings closure [R37.3–R37.5] (§5.2)
  - Findings closure
  - Open findings per role and delivery, referenced `<attempt>:<role>:<id>`; refuse a verdict that leaves one without a closure; check `fixed` and `unchanged` with the task-diff patch-id per path between the two subject commits; a defect closed `unchanged` stays open.
- [x] `9.5` Not-run checks [R38.1–R38.3] (§5.2)
  - Not-run checks
  - A checks report entry may carry `notRun` with `exitCode: null`; a null code, 126, 127, a not-run entry, or a declared check left out fails the checks session, not the writer attempt, and is retried within `retries`, then opens a decision.
- [x] `9.6` Integration waits for the reviewed commit [R36.7–R36.9] (§5.2)
  - Integration waits for the reviewed commit
  - Integrate a `verified` delivery only by fast-forwarding the commit every role approved; when the base moved, rebase in the task's worktree and, if the head changed, open a new round on it instead of merging.
- [x] `9.9` Delivery view: per round, each role's verdict, model, subject commit, stale mark, and findings with closure state; links to each session. Graph-specific only; no pull-request or CI view (§8). [R36.12] (§5.2, §8)
  - Delivery view: per round, each role's verdict, model, subject commit, stale mark, and findings with closure state; links to each session. Graph-specific only; no pull-request or CI view.
- [x] `9.10` Optional, later [R36.13] (§5.2)
  - Optional, later, after 3.11
  - For GitHub-route leaves, read pull-request reviews on the head SHA as verdicts from reviewers the repository policy allows (`APPROVED`, `CHANGES_REQUESTED`), stale when the head moves, shown in the Delivery view. Not needed for P27.
- [x] `avoozl-p27` P27 Proof: review gates with fake writers and reviewers [R36, R37, R38] (§5.2)
  - Expected: (1) `w2` does not start while `w1`'s writer is live; three role sessions open on C1 with three different models; (2) `d1` stays waiting, the attempt fails, and the retry brief quotes F1; (3) the `unchanged` approval is refused in-session; the not-run check fails only the checks session and is retried, and no writer attempt is spent; (4) the rebase produces C3, nothing merges, and all three roles review C3, with F1 still closed; after they approve, C3 fast-forwards and `d1` dispatches; (5) both calls are refused, and `w1` is accepted only from validation recorded at its integrated commit; (6) policy validation refuses `fake-a`, and `auto` opens a decision instead of a review. Every earlier verdict stays on the delivery.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: an isolated temporary workspace and sample repository in the test tree; delivery policy with `concurrency: 1`, writer model `fake-a`, and two review roles (`conventions` on `fake-b`, `correctness` on `fake-c`); a test-only fake session driver that plays worker, checks, and reviewer sessions from scripts; an approved spec with leaves `w1 -> d1` and an independent `w2 -> d2`, all in that repository; a declared check `scripts/validate.sh` standing in for that repository's validation script.
  - Action: (1) tick until `w1` reports commit C1; (2) `conventions` approves C1, `correctness` requests changes with defect F1 on `src/a.txt`; (3) the next attempt reports C2 that changes `src/a.txt`; both roles review C2, `correctness` first tries `approved` closing F1 `unchanged`, then closes it `fixed` and approves; the checks role first reports `scripts/validate.sh` as not run, then passes; (4) move the base branch by hand before integration; (5) try `task.update` with a typed `integration` on `d1`, and `task.accept` with typed evidence on `w1`; (6) set a reviewer's model to `fake-a`, and separately to `auto`.
  - Failure means: reviews cannot be gates on one delivery without breaking retry, integration, or readiness.
  - Next decision: model reviews as separate graph tasks with integration-free acceptance (the handoff's first design), or drop rebase re-review and gate on the pre-rebase commit.

## Phase 10: Content rules

- [x] `10.1` Matcher [R40.2, R40.4, R40.11, R40.13] (§4.9, F67, F68)
  - `src/app/content/content-rules.ts` holds the terms parser (`rule: regex`, `#` comments, per line, ignoring case), the decoder, and `check({boundary, repository, target, text, added})` returning `{set, rule, boundary, target, line}` and never the matched text; each check runs in a `worker_threads` worker with a time limit (default 2 seconds), and a timeout or a rule that does not compile is unavailable; `scripts/check/release-scan.ts` imports the parser and matcher, keeps its public rules and terms file location, and prints only rule id, file, and line for private-term findings.
- [x] `10.2` Policy [R40.1, R40.2, R40.10] (§4.4, §4.9, F74)
  - Policy
  - `contentRules.sets` in `.avoozl.json` (`id`, `action` `block` by default or `report`, optional `boundaries` from `plan`, `github`, `brief`, `diff`, optional `repositories`, optional `plugin`) with validation per §4.4 and §4.9; terms from machine-local `contentRules.terms.<id>`, else `.avoozl/local/content-rules/<id>.txt`; refuse a terms file Git tracks or would track (`git ls-files`, `git check-ignore`); an unavailable set fails closed at every boundary it covers and opens one decision naming the set and the reason, and the tick finishes the rest; Settings lists each set with its source kind and availability, never its rules.
- [x] `10.3` Built-in sets [R40.12] (§4.9, F68–F71)
  - Built-in sets
  - Put `findPlanningLeak` (`builtin:planning-repository`), `screenReply` (`builtin:reply-safety`), and `secretReason` with `validateMarker`'s path and planning-repository checks (`builtin:published-secrets`) behind `check`, at today's boundaries with today's patterns, decoding, and refusal messages; configuration cannot turn them off; every existing test for these screens passes unchanged.
- [x] `10.4` Local boundaries [R40.3, R40.5] (§4.9)
  - Local boundaries
  - `plan.create`, `plan.save`, and `plan.propose` refuse a planner draft in-call with set, rule, file, and line and record the refusal; `lintSpec` adds `content.match` diagnostics over every spec file and `avoozl/manifest.json` so approval is refused and a decision opens; worker, verifier, and reviewer briefs are checked before they are sent; `plans_report` `done` refuses a commit whose added lines match; `plans_prepare_worktree` installs a `pre-push` hook (`avoozl content check --push`) in that worktree only, not the main checkout's hooks; local integration holds a matching diff with a decision; lines already in the base never match.
- [x] `10.5` Decisions and allow once [R40.5–R40.8] (§4.9)
  - Decisions and allow once
  - One decision per set and target; **Allow once** with a reason from the app page or CLI only (the MCP tools sessions call get 403; the tick and example installation cannot), recording who, why, when, rule, target, and the SHA-256 of the exact content, used up by one write; the decision view reads the matched line again from its source on demand and stores nothing; `report` sets write and record the finding in the Delivery view with one Kiro Crew notification; a test greps SQLite, events, decisions, and notification payloads for each fake term, plain and encoded, and finds none.
- [x] `10.6` GitHub boundaries, after 4.3, 4.8 [R40.3, R40.5] (§4.9)
  - GitHub boundaries, after 3.7, 3.15, 4.3, 4.4, 4.8
  - Issue titles and whole bodies before each create or update in projection; Release and Iteration values before each Project field write; every comment Avoozl writes (breakdown previews, published summaries, steering replies) and responder replies; candidate pull request titles, bodies, commit messages, and added diff lines each tick, which block completion and open a decision as 4.8 does. A match writes nothing for that issue, item, or comment and the tick goes on.
- [x] `10.7` Rules plugins, after 8.6 [R40.9, R40.14, R34] (§4.8, §4.9)
  - Rules plugins, after 8.6
  - Plugin kind `rules` beside `route` and `tracker`; contract call `ruleSets()` returning `[{id, version, rules: [{id, pattern}]}]`, schema-checked; the usual consent, child process, and time limit; rules kept in memory only, never in SQLite, receipts, or Git, and findings record the set `version`; a fake rules plugin under `test/fixtures/plugins/`, covered by the 7.4 and 8.8 scans.
- [x] `10.8` Allowed patterns [R40.15, R40.13] (§4.9)
  - Allowed patterns
  - `allow: regex` and `allow <rule>: regex` lines in terms files, parsed by `parseTerms` and `checkTermsText` with line-numbered errors that never repeat the line; the worker drops a match when an allow pattern matches the same line and returns only counts; built-in sets unchanged; `checkRuleSets` refuses a set with `allow`; the release scan applies a file's allow lines to that file's rules only; the Rule builder gets an Allow row with an optional rule picker, the File view reads allow lines, Try it strikes through allowed matches; How rules work and `docs/plugins.md` updated; tests for allow-all, allow-one-rule, a non-matching line still blocking, built-ins unaffected, no echo, the release scan, and builder and File view round trip.
- [x] `avoozl-p28` P28 Proof: content rules with fake terms and a fake rules plugin [R40] (§4.9)
  - Expected: (1) the save is refused in-call naming `fake-terms`, `codename`, `design.md`, and the line, and no decision opens; (2) approval is refused with a `content.match` diagnostic and a decision; allow once records who, why, and the hash and the next approval passes; the changed line is blocked again; (3) that issue is not written and a decision opens, and the other issue is projected; (4) no Release write and a decision naming `fake-plugin-set`; (5) `done` is refused in-call, the hook stops the push, and the fixed commit is accepted and integrates; the base file never blocks; (6) `b` does not complete and a decision opens; (7) both refusals match today's messages and the existing screen tests pass unchanged; (8) the brief is sent, and the Delivery view shows one `fake-paths` finding with one notification; (9) the missing file blocks every boundary `fake-terms` covers with one decision while uncovered work goes on; the tracked file is refused; the crashed plugin makes only `fake-plugin-set` unavailable; the slow rule times out in about 2 seconds, its set fails closed, and the tick finishes; (10) validation refuses the `terms` key, and the MCP allow gets 403; (11) zero hits anywhere, and the release scan prints `codename` with file and line but not the line.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: an isolated temporary workspace in plans-repo mode with a sample code repository in the test tree and a fake GitHub client that records every write; terms file `.avoozl/local/content-rules/fake-terms.txt` with `codename: \bzorblat\b` and `host: \bbuild\d+\.corp\.example\b`; a second set `fake-paths` (action `report`, rule `share: \bfileshare/teams\b`) whose terms file sits outside the workspace and is named in machine-local settings; the fake rules plugin `fake-rules` from `test/fixtures/plugins/`, approved, supplying set `fake-plugin-set` with `project: \bproject-?x\b`; `.avoozl.json` naming all three; an approved spec with leaves `a -> b` and one milestone.
  - Action: (1) the planner saves a draft whose `design.md` says "zorblat"; (2) a person puts the same line in `tasks.md` and approves, allows once with a reason, approves again, then changes that line to another "zorblat" sentence and approves; (3) project with one issue title holding `zorbl&#97;t`; (4) rename the milestone to "Project X launch" and sync; (5) worker `a` adds a line naming `build7.corp.example`, reports `done`, then pushes; it removes the line and reports again; a base file already holding the hostname stays untouched; (6) leaf `b`'s pull request body names "zorblat"; (7) the responder posts a reply holding a GitHub-token-shaped string, then one naming the planning repository; (8) a brief quotes an issue line matching `fake-paths`; (9) delete `fake-terms.txt` and tick; restore it and `git add -f` it; make `fake-rules` crash; add a rule `(a+)+$` and check a 40-character run of `a` ending in `!`; (10) add a `terms` key to `.avoozl.json`; call allow once through the MCP tool a session uses; (11) grep SQLite, events, decisions, notification payloads, the fake GitHub writes, and Git history for each fake term, plain and encoded; run the release scan with `fake-terms.txt` as `$AVOOZL_RELEASE_TERMS` over a fixture that names "zorblat".
  - Failure means: content rules leak the terms they guard, let a match through, or stop the tick.
  - Next decision: narrow the boundaries to GitHub writes and diffs only, or move matching into a plugin child process instead of a worker thread.

## Phase 12: Flow

- [x] `12.1` Timing store and event spans [R43.1–R43.3, R43.6–R43.8] (§4.11, F96)
  - A `flow_spans` table (`task_id`, `attempt`, `role`, `stage`, `started_at`, `ended_at`, `source`, `detail`) and `src/app/flow/flow.ts`; spans for `queued`, `review`, `rework`, `merge`, and `waiting` from readiness, bindings, reports, verdicts, retries, and integration; no setting; open spans close at the next ending event after a restart; `detail` passes the content rules; no prompts, output, tokens, or cost.
- [x] `12.2` Tool-call reader, after 12.1 [R43.4] (§4.11, F90–F94)
  - Tool-call reader, after 12.1
  - First read one live tick-opened worker slot with `GET /api/chat/slots/<slot>?cursor=1` and record in the receipt whether tool rows carry `meta.kind` and `meta.input`, settling F91 live; then read each live tick-opened worker once per tick beside the status read, keep only `kind`, the command's first words, and `ts`; a shell call running a declared check is `tests`, other shell calls `commands`, the rest `coding`; source `tool-calls`.
- [x] `12.3` Phase markers and check durations, after 12.1 [R43.5, R45.2] (§4.11)
  - Phase markers and check durations, after 12.1
  - `plans_report` `progress` takes optional `phase` (`coding`, `tests`, `commands`, `ci-wait`), stamped on receipt; the brief asks for markers only when Avoozl cannot read the session's tool calls (Crew Mode, remote, or no read); verifier entries and `done` check lists gain `durationMs`; unmarked worker time is `coding`; source `markers`.
- [x] `12.4` GitHub timing, after 12.1 [R43.3] (§4.11, F95)
  - GitHub timing, after 12.1, 3.11
  - `ci-wait` from the first check run requested to the last required check completed on each pushed head, and GitHub `review` spans from request to `submitted_at`, through the reads completion already makes; no new poller; "CI only" failures recorded when CI fails on a commit with a local pass.
- [x] `12.5` Metrics, after 12.1 [R43.7] (§4.11)
  - Lead time, flow efficiency, first-pass rate, time to fix, change failure rate, and integrations per day, per task and per window, computed on read by the `flow.view` operation, CLI `avoozl flow`, and MCP `plans_view` action `flow`.
- [x] `12.6` Stop the line, after 12.1, 9.5 [R44] (§4.11)
  - Stop the line, after 12.1, 9.5
  - Trigger on a passed check failing on the landing branch after one rerun, and on a failed verification that also fails on the task's base; flaky record; culprit by range, bisect in a scratch worktree up to 8 runs, else unknown; pause by `flow.stopTheLine.scope` (default `dependents`); stopped check not judged on other commits; one fix task `<culprit-id>.fix-<n>` first in line, revert allowed; resume on green with time to fix and one notification.
  - Needs you only for the fix task's question, person-only block, or retry bound; **Run anyway** person-only, confirmed, recorded; agents and plugins get 403; the culprit stays accepted.
- [x] `12.7` Local checks first, after 12.3, 10.4 [R45] (§4.11)
  - Local checks first, after 12.3, 4.7, 10.4
  - `flow.localChecksFirst` (default `true`); briefs for pushing sessions say to run the declared checks before each push; `done` for a pushed commit refused without a passing check list for that commit; the 10.4 pre-push hook also refuses a push with no recorded local pass and does not rerun checks; local delivery unchanged.
- [x] `avoozl-p30` P30 Proof: flow with fake workers and scripted timings [R43–R46] (§4.11)
  - Expected: (1) `c1` shows `coding`, `commands`, and `tests` spans from tool calls, the check counted as `tests`, and no output stored; (2) `b1`'s spans come from markers and show as coarse; (5) the culprit is `a1`, the line stops, `d1` is not dispatched, `c2` keeps running, `c2`'s result for that check after its rebase is not judged and costs no attempt, a fix task is first in line, and the red banner names the check, `main`, `a1`, the fix task, and the paused count; Needs you stays empty; (6) a flaky record and no stop; (7) green on `main` resumes `d1`, records time to fix, and notifies once; `a1` stays accepted; (8) dispatch resumes with the stop still shown and who pressed it; the agent call gets 403; (9) the push without a pass is refused by the hook and the `done` is refused; the CI failure is recorded as "CI only" with a `ci-wait` span from the feed; (12) the open span closes at its next ending event, not at the restart. Lead time, flow efficiency, first-pass rate, and time to fix from `flow.view` match values computed by hand from the script.
  - A receipt under docs/evidence/ records the setup, the action, what was observed, and the verdict.
  - Setup: an isolated temporary workspace with a sample repository in the test tree, integration branch `main`, one declared check `node test/check.mjs`, an approved spec with epic `e1` holding leaves `a1`, `a2`, `a3`, `a4`, and `b1`, `c1`, `c2` (independent), and `d1` (requires `a1`); fake workers that follow a script of tool rows, phase markers, reports, and sleeps on a fake clock; a fake GitHub check-run feed for one plans-repo leaf `g1`.
  - Action: (1) run `c1` as a tick-opened worker whose script has 2 edits, `npm install`, and the check, then `done`; (2) run `b1` as a Crew Mode worker that sends phase markers only; (5) integrate `a1`'s retried commit, which breaks the check on `main`, with `c2` running and `d1` ready; (6) script a one-time failure of the check on a later commit; (7) let the fix task revert the break; (8) open a second stop and press Run anyway as the owner, then call Run anyway from an agent session; (9) push `g1` once without a local pass and once with one, and have CI fail on the passing commit; (12) restart the backend with a span open.
  - Failure means: timing cannot be trusted to show where time went, or stop the line costs writers attempts or loses work.
  - Next decision: keep timing and stop the line, or drop the tool-call reader and keep markers only.

## Phase 14: Incoming items

- [x] `14.1` Incoming-item record and storage [R50.1–R50.3] (§4.12, F112)
  - Incoming-item record and storage
  - `incoming_items` and `intake_sources` store tables; the record shape with the trust-boundary checks of R50.2 (bad items refused alone, with the field named); dedup on source plus ID by content hash; stale `updatedAt` ignored and reported; a quiet pass writes nothing.
- [x] `14.2` Source settings, after 3.13 [R50.6, R50.20] (§4.12, §4.4)
  - `intake.sources` in `.avoozl.json` and in machine-local settings, validated like `plugins` entries: reserved `github` and `local`, `via` naming a `plugins` entry with `poll` or `mcp`, a registered `repository`, `labelFields`, `assigneeField`, `allowedActors`, `minimumPermission` (default `write`); one Settings group with the public-repository warning and plain "(optional)" markers.
- [x] `14.3` `intake.submit`, `intake.list`, `intake.view`, after 14.1, 14.2 [R50.5, R50.8] (§4.12)
  - Operations in `operations.ts`; CLI `avoozl intake submit|list|view`; MCP `plans_intake` actions `submit_items`, `items` and `item`; submit only to an `mcp` source, 1–100 items, per-item results; run under the workspace tick lock.
- [x] `14.4` Pipeline, after 14.3, 10.6 [R50.9, R50.10] (§4.12, §4.9)
  - The `intake` content boundary (block quarantines with a decision that never names the text; report records), off unless a set names it; `labelFields` and `assigneeField` mapping; no label or rule starts work: a person starts a task from an item with Plan this (an inbox task through `task.capture`) or Deliver this (a pinned local leaf in the source's repository); `review` items are never delivered or planned.
- [x] `14.5` Who counts for an MCP source, after 14.4 [R50.14] (§4.12, F108)
  - An MCP caller's claimed author and trigger are stored as claims, and a close it reports holds the dependents with a decision.
- [x] `14.7` GitHub intake on the record, after 14.4 [R50.4] (§4.12)
  - The open items read (`refreshOpenItems` in `src/app/github/github-open-read.ts`) stores each listed issue as a `github` item in `incoming_items`.
- [x] `14.9` Updates and closes, after 14.5 [R50.17, R50.18, R50.21] (§4.12)
  - Title and labels follow to the tied task; a body change after the snapshot quarantines; closes follow the allowed-close rule (order, brief note, never verified; otherwise hold and a decision; never reopen); a reopen withdraws the order and leaves running sessions alone; untied closed items deleted after 30 days.
- [x] `14.12` Docs and leak scan, after 14.3 [R50.22] (§13)
  - A short guide to `plans_intake` action `submit_items` from a Kiro Crew cron job using a fake source; sources named only generically; the 7.4 scan covers the docs and fixtures.

## Phase 17: MCP tool groups

- [x] `17.1` Group MCP tools by object, after 2.3 [R56] (§8)
  - Group MCP tools by object, after 2.3
  - About 12 to 15 tools with an action field cover every safe operation; no MCP call performs a person-only operation by any name; old plans_* names keep working.
  - 15 tools with an `action` enum, each action one existing operation; person-only operations refused for any MCP call in `Operations.perform`; old `plans_*` names listed and marked deprecated; a session may archive a plan.

## Phase 21: Epics and phases

Requirement 59, design §6.9.

- [x] `21.1` Parent specs link their member specs, after Phase 3's proofs [R59.1–R59.3] (§6.9)
  - A task title's Markdown link to `<specs.path>/<name>/tasks.md` makes that task a spec group (`specGroupOf` in `src/app/specs/spec-plans.ts`); lint refuses a link to a missing folder, a spec linked twice and a spec group with sub-items, and refuses the `kind` and `epic` front-matter keys.
- [x] `21.2` Phases from the manifest and `tasks.md` headings, after 21.1 [R59.5, R59.6] (§6.9)
  - Phases from the manifest and `tasks.md` headings, after 21.1
  - Every task has a phase from its manifest value, else its heading, else No phase; the store keeps only cross-plan epics; no `doc:` epic is created anywhere.
  - Each task gets a phase from its `phase` value, else its nearest level-2-or-lower heading, else No phase; the store keeps cross-plan epics only and tasks lose `epic`; capture and catalog paths stop making `doc:` epics, and `specOf` reads the plan or source reference.
- [x] `21.3` Epic and phase reads on the page, CLI, and MCP, after 21.2 [R59.10] (§6.9, §8)
  - Epic and phase reads on the page, CLI, and MCP, after 21.2
  - An epic read lists member plans with computed status and progress and open decisions; plan and task reads carry epic and phase; the reads are reachable through the grouped MCP tools.
  - An epic read gives goal, what done means, member plans with status and progress, and open decisions; plan and task reads carry epic and phase; progress is computed, never stored; reads join the grouped MCP tools (R56).
- [x] `21.5` Views use epic and phase, after 21.3 [R59.6, R59.10] (§6.9, §8)
  - Graph levels All > Epic > Plan > Phase > task with the back stack; separate Epic and Phase filters in Graph, Delivery, and Plans; the plan left column shows its epic link and phases; the epic page; no `doc:` ID or path shown anywhere.

## Phase 22: Manual tasks

Requirement 61, design §4.16.

- [x] `22.1` Manual leaves in lint and the tick, after 21.1 [R61.9–R61.11, R61.13, R61.15] (§4.16, §4.3)
  - Manual leaves in lint and the tick, after 21.1
  - A manual leaf lints only with no run fields; it is never dispatched; it shows in Blocked or waiting, then Needs you tagged Manual; only a person marks it Done or Skipped or reopens it, and either releases its dependents; MCP calls are refused.
  - `manual: true`; `spec.manual-field`; left out of ready, verification, review and integration; dependents wait until it is done; Blocked or waiting, then Needs you tagged Manual; `task.manual.complete` (Done or Skipped, outcome) and `task.manual.reopen` person only, refused over MCP; Flow counts waiting on a person and skips first-pass rate and time to fix.
- [x] `22.4` The Mark done dialog for a manual leaf, after 22.1 [R61.12] (§4.16, §8)
  - The task drawer shows a manual leaf's acceptance and Mark done, a dialog that saves an outcome note and Done, Skipped or Refused; checked by drawing the page and looking at it.

## Phase 23: Specs name

Requirement 62, design §8.7.

- [x] `23.1` Say spec on the page, in docs and in skills [R62] (§8.7)
  - Say spec on the page, in docs and in skills
  - The page, docs and skills use spec for an approved work definition.
  - The page-source test checks user-facing uses of `plan` and `plans`
    against its allowlist.

## Phase 24: Pull the Andon cord

Requirement 64, design §4.11.

- [x] `24.1` Pulled stops in the backend, CLI and MCP, after 12.6 [R64.2–R64.5, R64.7–R64.11] (§4.11)
  - `flow.stop` {scope, repository?, spec?, taskId?, reason} records a `manual` row in `flow_stops` after the `brief` content rules; `flow.resume` {stopId} is person only and records who resumed; dispatch skips every task in scope, fix tasks included; the line watch never closes a pulled stop; Resume refuses an automatic stop and Run anyway a pulled one; `plans_session` action `stop_line`; `avoozl flow stop` and `avoozl flow resume`; `flow.view` carries the pull.
- [x] `24.2` Stop the line in the In flight heading, after 24.1 [R64.1, R64.6, R64.7] (§4.11)
  - `StopLine.tsx`: a Stop the line button in the In flight heading opens a dialog with a scope, its target and a required reason; the Line stopped banner in the app shell shows who, when, scope, reason and the paused count, with a Resume button that asks first; checked by drawing the page at 375 and 1280 px in light and dark.
- [x] `avoozl-p39` P39 Proof: pull the Andon cord [R64] (§4.11)
  - Proof: pull the Andon cord
  - Expected: a pulled stop pauses its scope and leaves running sessions alone; bad pulls are refused with nothing recorded; only a person resumes; nothing else closes a pulled stop; `flow.view` and the CLI see each pull.
  - Setup: an isolated temporary workspace with repositories `r1` and `r2`, an approved spec `s1` with leaves `a1` and `a2` (`a2` requires `a1`) in `r1` and `b1` in `r2`, a fake terms file banning `secretword`, and fake workers.
  - Action: (1) as a person, pull with scope `task` on `a1` and reason `bad base`; tick; (2) pull with no reason, a two-line reason, scope `repo` naming `r9`, and reason `secretword here`; (3) from an agent session, pull with scope `repo` on `r2`; (4) let the stopped check pass and the fix task integrate; tick; (5) call Resume from an agent session and from the app token; (6) press Run anyway on the pulled stop; press Resume on an automatic stop; (7) press Resume as the owner on both pulled stops; tick; (8) read `flow.view`; run `avoozl flow stop` and `avoozl flow resume` from the CLI.
  - Expected: (1) `a1` and `a2` are not dispatched, `b1` is, a running session is untouched, and the banner shows the owner, the time, the scope and `bad base`; (2) each refused by field, the unknown repository named, the content rule named without the matched text, nothing recorded; (3) the stop names the session, `b1` waits, the owner is notified once; (4) both pulled stops stay open; (5) both refused with 403; (6) both refused; (7) dispatch resumes in each scope and each stop records who resumed it; (8) both pulls are listed and counted with a time to fix, and the CLI pulls and resumes the same way.
  - Failure means: a person cannot stop new work by hand, or a pulled stop resumes without a person.
  - Next decision: keep the pull as a person-only button and drop the MCP action.

## Phase 29: Activity log

Requirement 71, design §4.19.

- [x] `29.1` Activity table, helper and screening, after 10.4 [R71.1, R71.4, R71.5, R71.8] (§4.19)
  - Activity table, helper and screening, after 10.4
  - An activity_log table and one recordActivity helper validate, trim and screen each row with the built-in secret and path screens and the activity content boundary; a matched or unchecked row is saved redacted; a test fails if a secret-shaped value is saved.
  - `activity_log` with a unique `key` for derived rows; `recordActivity` in `src/app/store/activity-log.ts` validates source and kind, trims the summary to 200 characters, keeps only plain target IDs and `https:` links, screens with the built-in secret and path screens and the `activity` content boundary, and saves a matched or unchecked row redacted; a test fails if a secret-shaped value is saved.
- [x] `29.2` Local actions and tick events, after 29.1 [R71.2, R71.3] (§4.19)
  - `execute` records each listed operation once with its actor and source
    (`local` or `mcp`). The tick records changes to verdicts, label events,
    incoming items and conflicts once per event key. The operation can
    finish if recording fails.
- [x] `29.3` Retention, `activity.list` and MCP, after 29.2 [R71.6, R71.9] (§4.19)
  - Retention, activity.list and MCP, after 29.2
  - activity.retentionDays defaults to 30 and is saved by a person only; each tick prunes older rows; activity.list filters and pages 100 rows; plans_view action activity reads it and recent keeps the recent-events timeline.
  - `activity.retentionDays` (default 30, 1–365) with `activity.settings.get` and person-only `activity.settings.update`; `pruneActivity` on every `workspace.tick`; `activity.list` with filters, 100-row pages and its facets; `plans_view` action `activity` reads it and `recent` keeps the recent-events timeline.
- [x] `29.4` Activity tab and the retention setting [R71.7] (§4.19)
  - Activity tab and the retention setting
  - The Activity tab uses the shared heading, filter panel and 100-row pages; task rows open the drawer and GitHub links open in a new tab with noopener noreferrer; the tab's Keep activity field sets the retention.
  - The Activity tab with the `History` icon, `ViewHeading`, the shared filter panel (Source, Kind, Actor), 100 rows per page with Show more, task targets that open the drawer and GitHub links with `target="_blank" rel="noopener noreferrer"`; the Keep activity (days) field on the tab, saved by a person.
- [x] `avoozl-p43` P43 Proof: activity log [R71] (§4.19)
  - Proof: activity log
  - Expected: every listed local action and tick event makes one row, a change seen twice makes one, secret-shaped and rule-matched values are saved redacted, old rows are pruned on the tick, and the tab and plans_view read the same rows.
  - Setup: an isolated temporary workspace with one repository, a fake GitHub in single-repo mode with a Project, an approved spec with leaves `a1` and `a2` (`a2` requires `a1`), a fake tracker plugin, and a fake terms file banning `secretword` for every boundary.
  - Action: (1) from the page press Start now on `a1`, pull the Andon cord, resume it, set `a2` to Deferred, save Flow settings, approve the plugin and change the writer model; (2) do one dispatch through MCP; (3) on the fake GitHub merge `a1`'s closing pull request, move `a2` to Deferred as an allowed actor and as another actor, set Wave by hand, and edit a managed title; tick twice; (4) add a tracker conflict and a new plugin incoming item; tick; (5) record a row whose summary holds `ghp_` plus 36 letters, and one holding `secretword`; (6) set retention to 1 day, age a row 2 days, and tick; (7) read the Activity tab and `plans_view` action `activity`, filtered by source `github`.
  - Expected: (1) one `local` row each, with the person as actor; (2) one `mcp` row naming the session; (3) one row each for the merge, the order, the ignored move, the revert and the conflict, the same after the second tick; (4) one `plugin` row each; (5) both saved redacted, and no row holds either value; (6) the old row is gone; (7) the tab and MCP show the same rows newest first, a task row opens the drawer and a GitHub row opens a new tab.
  - Failure means: something that changed the workspace leaves no row, or the log can hold a secret or a private term.
  - Next decision: record from each step instead of a snapshot diff, or keep redacted rows out of the log.

## Phase 31: Stop all agents and searchable pickers

Requirements 64.12–64.16 and 73, design §4.11 and §8.9.

- [x] `31.1` Stop all agents in the backend and CLI, after 24.1 [R64.12, R64.14–R64.16] (§4.11)
  - Stop all agents in the backend and CLI, after 24.1
  - A person-only full stop stops every running session Avoozl opened, keeps worktrees, marks attempts Interrupted by stop without spending a retry, and Resume re-dispatches each on the same branch, agent and model.
  - `flow.stop {full: true}` is person only (MCP refused), needs the app backend's session stopper, records a full `all` stop with the sessions it stopped, stops each live tick-opened session, marks stopped bindings and attempts "Interrupted by stop" without spending a retry, holds checks and review sessions while open; Resume turns interrupted deliveries back to `failed` so the next tick re-dispatches on the same worktree, agent and model with a brief that says so; `avoozl flow stop --full`.
- [x] `31.2` Stop all agents in the dialog, after 31.1, 24.2 [R64.12, R64.13] (§4.11)
  - Stop all agents in the dialog, after 31.1, 24.2
  - The dialog offers Stop the line and Stop all agents, and the full stop's confirm warns that replies in progress are lost and saved files are kept.
  - The dialog's two choices, the full stop's confirm warning that replies in progress are lost and saved files are kept, and the banner's count of stopped chats.
- [x] `31.3` One searchable picker for tasks and specs, after 24.2 [R73] (§8.9)
  - One searchable picker for tasks and specs, after 24.2
  - Every task and spec choice uses one keyboard-accessible combobox that matches ID, title and spec, shows state, and stays fast with 5,000 tasks.
  - `Picker.tsx` combobox with ID, title and spec matching, state badges, the keys and ARIA of §8.9, and at most 50 rendered results; used in the Stop the line target, the filter panels and Start now; a test filters 5,000 tasks.

## Phase 34: Staying current and who merges

Requirements 77 and 80, design §4.23 and §4.25.

- [x] `34.3` Bring pull requests up to date [R77] (§4.23)
  - When the base branch moves, each conflicting or behind pull request's writer gets one `base-moved` message to merge it in, and no brief can ask for a force push.
- [x] `34.6` Who merges a pull request (`landing.pr`) [R80] (§4.25)
  - `landing.pr` (draft, ready, auto) is the one merge setting, for the workspace with a per-repository override; a draft waits for Ready for review or Approve and is never merged; with draft or ready a person merges on GitHub or with Merge for the exact head; with auto Avoozl merges after exact-head checks; Approve and Merge are person only; every `createPullRequest` call site says whether it opens a draft.
  - `landing-config.ts`, `landing-pulls.ts`, `landing-view.ts`, `landing.ready` and `landing.merge` in `ops/delivery.ts`, `markPullRequestReadyForReview` in `github.ts`, `PullAction` in `ConflictsView.tsx`, `LandingFields.tsx`, `DeliverySettings.tsx`.
- [x] `avoozl-p45` P45 Proof: staying current [R77] (§4.23)
  - Setup: an isolated temporary workspace in single-repo mode on a fake GitHub with leaf `a1` and a fake worker.
  - Action: dispatch `a1`, then move the base branch so `a1`'s pull request conflicts.
  - Expected: one `base-moved` message, a merge commit and no force push.
  - Failure means: a writer force pushes or is never told the base moved.
  - Next decision: merge the base in from the tick instead of the writer.

## Phase 37: Security follow-ups

Requirement 83, design §6.12.

- [x] `37.1` CLI refuses person-only operations in an agent session [R83.1, R83.2] (§6.12)
  - CLI refuses person-only operations in an agent session
  - The CLI refuses person-only operations in an agent session unless --as-person is given.
  - `agentSession`, `cliRefusal`, `--as-person`; `src/app/cli/test/cli-person-only.test.ts`.
- [x] `37.2` Private folder, database, backups and exports [R83.3] (§6.12)
  - Private folder, database, backups and exports
  - The folder, database, backups and exports are private files.
  - `Store`, `privateFile`; `src/app/test/security-audit.test.ts`.
- [x] `37.3` Name repository-owned code; approve the worktree helper's hash [R83.4] (§6.12)
  - Name repository-owned code; approve the worktree helper's hash
  - Repository-owned code is named in docs/checks.md, and the worktree helper runs only at its approved hash.
  - `docs/checks.md`; `worktreeHelper` in `git.ts` and repository settings; same test file.
- [x] `37.4` Hash a local plugin again before it starts [R83.6] (§6.12)
  - Hash a local plugin again before it starts
  - A local plugin is hashed again before it starts.
  - `pluginHost`; `src/app/plugins/test/plugins.test.ts`.
- [x] `37.5` Opt-in `checksEnv` allowlist [R83.5] (§6.12)
  - Opt-in `checksEnv` allowlist
  - Checks see only the environment variables the opt-in checksEnv allowlist names.
  - `repositoryEnvironment`, `commandEvidence`, repository settings; same test file as 37.2.

## Phase 46: Name the executor seam

Requirements 93, 97, design §4.28.

- [x] `46.1` Executor interface: start, send, status, optional stop and usage [R93.1, R93.4] (§4.28)
  - Executor interface: start, send, status, optional stop and usage
  - Contract tests cover the calls and allowed status values; the interface carries no Kiro Crew folder, project or agent-file detail. The comprehensive boundary test runs at P56 after 46.2–46.4 move the existing references.
- [x] `46.2` The `kirocrew` executor holds today's session calls from `tick.py`, after 46.1 [R93.2] (§4.28)
  - The `kirocrew` executor holds today's session calls from `tick.py`
  - All Kiro Crew folder and project handling becomes the executor's private detail, including callers outside `tick.py`. Preserve existing behavior coverage; the tests keep covering the same behavior.
- [x] `46.3` The tick writes session requests that name an executor; each executor takes only its own, after 46.2 [R93.3, R93.4] (§4.28)
  - The tick writes session requests that name an executor; each executor takes only its own
  - Planner requests carry no Kiro Crew folder, project or agent-file details.
- [x] `46.4` Role prompts in `prompts/<role>.md`; agent files built from them, after 46.1 [R97.1, R97.2] (§4.28)
  - Role prompts in `prompts/<role>.md`; agent files built from them
  - Runtime prompt readers use the prompt files, not generated agent JSON. A test fails when a built agent differs from its prompt.
- [x] `avoozl-p56` P56 Proof: the seam is named and nothing else changed, after 46.1, 46.2, 46.3, 46.4 [R93, R97] (§4.28)
  - Proof: the seam is named and nothing else changed
  - Expected: the suite passes with its behavior coverage kept; the worker opens and reports as before; no code outside the executor names a Kiro Crew folder or agent file.
  - A boundary test fails on any code path outside the `kirocrew` executor naming a Kiro Crew folder, project or agent file.
  - Setup: main before and after the change.
  - Action: run the existing suite and a boundary test that fails on any code path outside the `kirocrew` executor naming a Kiro Crew folder, project or agent file; open one worker through the executor on a scratch repository.
  - Failure means: the seam leaks Kiro Crew details or changed behavior.
  - Next decision: start Phase 40 on the seam.
- [x] `40.7` Lanes: 3 on this Mac by default, after avoozl-p56 [R88.5] (§4.26)
  - Lanes: 3 on this Mac by default
  - `lanes.local` default 3; a fourth ready task waits.
- [x] `40.4` Prepare with the worktree helper and clean up after landing, after avoozl-p56 [R88.6] (§4.26)
  - Prepare with the worktree helper and clean up after landing
  - First caller of `createWorktree` in `src/app/git/git.ts`; worktree and local branch removed after landing, kept otherwise.
- [x] `40.3` Trust mode set at open and again every tick, after avoozl-p56 [R88.1] (§4.26)
  - Trust mode set at open and again every tick
  - A fake Kiro Crew that drops trust on restart; the next tick sets it again, once per chat.
- [x] `40.2` Report by CLI, matched by worktree and token, after avoozl-p56 [R88.2, R88.3, R96.4] (§4.26)
  - Report by CLI, matched by worktree and token
  - Use `avoozl runner report TASK done|blocked` for chats and people. Carry the worktree path and token in the brief; local chats use project: false. Test wrong tokens/worktrees and reporting without MCP sharing.
- [x] `40.6` One automatic resume for a vanished chat, after 40.2 [R88.4] (§4.26)
  - One automatic resume for a vanished chat
  - Only Kiro Crew's "gone" answer resumes; quiet and an expired lease do nothing; a second vanish opens Needs you.
- [x] `40.1` Worker brief edits and reports only, after avoozl-p56 [R86.3, R96] (§4.26)
  - Worker brief edits and reports only
  - The brief drops push, PR, auto-merge, merge and comment steps. Avoozl commits sandboxed process results; chats/people may commit locally. Read HEAD from the worktree, never from a report. A prompt test enforces this boundary.
- [x] `40.5` Verify: warm checks off the tick, per-check timeouts, declared and protected paths, after 40.1 [R86.6, R86.7] (§4.26)
  - Verify: warm checks off the tick, per-check timeouts, declared and protected paths
  - Checks run as their own job in the task worktree; a timeout fails with its reason; a file outside declared paths is refused; a protected path goes to Needs you.
- [x] `41.2` Per-base landing queue with brief integration locks, after 40.5 [R87.5] (§4.32)
  - Per-base landing queue with brief integration locks
  - Preserve order on Stop the line; perform checks outside the integration lock, guard only ref movement and push. Test a concurrent base move cannot land an unchecked candidate.
- [x] `41.3` Direct portions and bounded landing trains, after 41.2 [R87.1, R87.2, R87.4, R87.9, R102.8] (§4.32)
  - Direct portions and bounded landing trains
  - Select exact verified portions, merge/check the current base and guard the fast-forward. Up to four tasks per train; bisect failures. Merge declared append-only union paths only in the landing worktree. Check outgoing data before every push; never force push.
- [x] `41.6` The In flight page for the loop, after 41.3 (§4.26)
  - In flight lists the running sessions and their tasks; screenshots for the owner.
- [x] `41.5` Prepare from spec working heads and merge landed bases back, after 41.3 [R102.4] (§4.32)
  - Prepare from spec working heads and merge landed bases back
  - Generalize RC16 from epic-only integration; Prepare and qualified-ref resolution agree on the exact spec base. Merge the landed target back with a merge commit; preserve verified but unlanded portions and unfinished task refs.
- [x] `41.4` Conflicts go back to the same chat, bounded, after 41.3 [R87.6] (§4.26)
  - The conflicted file list in the brief; `conflicts.maxAttempts` rounds (default 2), then Needs you.
- [x] `41.1` Schedule spec drivers with repository-wide path holds, after 40.5 [R86.2, R86.5, R102.3] (§4.32)
  - Schedule spec drivers with repository-wide path holds
  - Use unblock ranking, current spec authority, and repository-wide path holds. A dependency releases its successors once its tick reaches the base branch.

## Phase 47: Supervisor and the process executor with Claude Code

Requirements 93.5, 94, 95, 96 (design §4.28). Exit: a 3-task chain on a
scratch repository with one feedback round by resume, a killed child that
recovers, and a backend restart mid-run.

- [x] `47.1` Harness definition files: argv lists, placeholders, hash approval, after avoozl-p56 [R94.1, R94.2, R94.3] (§4.28)
  - Harness definition files: argv lists, placeholders, hash approval
  - Loading refuses a shell string, an unknown placeholder and an unapproved hash.
- [x] `47.2` Permission classes, write roots and the skip-flag refusal, after 47.1 [R94.4, R94.4b, R94.5] (§4.28)
  - Permission classes, write roots and the skip-flag refusal
  - Definitions with bypassPermissions, danger-full-access or a --dangerously-* flag are refused at load in a test; write roots are the task folder, temp and repository cache dirs.
  - Write roots: task folder, temp, repository cache dirs; read-only roles read-only; a test loads definitions with `bypassPermissions`, `danger-full-access` and a `--dangerously-*` flag and sees each refused; the per-machine opt-in is person-only.
- [x] `47.11` Avoozl's worker commit never stages a path under `.avoozl/`, and landing refuses a worker commit that holds one [R94.4a, R96.1, R96.3] (§4.28)
  - Avoozl's worker commit never stages a path under `.avoozl/`, and landing refuses a worker commit that holds one
  - Whatever the repository's .gitignore says. 47.7 commits through `commitWorkerChanges` (`src/app/git/git.ts`); `integrateRun` refuses a branch whose commits touch `.avoozl/` with the paths named; tests in `src/app/test/worker-commit.test.ts`.
- [x] `47.8` Per-repository command allow-list; `git push` never allowed, after 47.2 [R94.4c] (§4.28)
  - Per-repository command allow-list; `git push` never allowed
  - Unattended children run the repository's build and test commands without a prompt; adding git push is refused.
- [x] `47.10` Sandbox keeps the database, credentials and Kiro Crew home out of reach, network off or restricted, after 47.2 [R95.6, R95.7] (§4.28)
  - Sandbox keeps the database, credentials and Kiro Crew home out of reach, network off or restricted
  - A child cannot read the workspace database or credentials; docs and Settings call the chat refusal a speed bump.
  - Kiro Crew chats: the docs and Settings say the person-only refusal is a speed bump.
- [x] `47.3` `avoozl supervisor`: one per machine, owns pid, exit code and log; started by the app backend, after 47.1 [R95.1, R95.2, R95.3, R95.4] (§4.28)
  - `avoozl supervisor`: one per machine, owns pid, exit code and log; started by the app backend
  - Finds its children again after a restart; a missing one is `gone`.
- [x] `47.4` The `process` executor and the Claude Code definition, after 47.2, 47.3 [R93.2, R93.5] (§4.28)
  - The `process` executor starts a Claude Code child from its approved definition file.
- [x] `47.7` Avoozl commits after the child exits, after 47.4 [R94.4a] (§4.28)
  - Avoozl commits after the child exits
  - The child only edits; Avoozl commits in the worktree from the changed files and checks the diff.
- [x] `47.5` Child marker; the CLI refuses person-only commands in a child, after 47.3 [R95.5] (§4.28)
  - Child marker; the CLI refuses person-only commands in a child
  - Refused even with `--as-person`.
- [x] `47.6` Finish: exit code plus `.avoozl/result.json` read by the supervisor; `runner report` for chats, after 47.4 [R96.1, R96.2, R96.3, R96.4] (§4.28)
  - Finish: exit code plus `.avoozl/result.json` read by the supervisor; `runner report` for chats
  - A missing or bad result file, or done with a non-zero exit, takes the retry path.
  - A missing or bad result file, or `done` with a non-zero exit, takes the retry path.
- [x] `avoozl-p57` P57 Proof: a Claude Code chain runs under the supervisor and survives faults, after 47.1, 47.2, 47.3, 47.4, 47.5, 47.6, 47.7, 47.8, 47.10, 47.11 [R93, R94, R95, R96] (§4.28)
  - Proof: a Claude Code chain runs under the supervisor and survives faults
  - Expected: (1) all 3 tasks finish with an exit code and a result file, and Avoozl commits each one; (2) the resume argv delivers the feedback and the task passes; (3) the killed child is `exited` or `gone` and its task recovers on the retry path; (4) the supervisor keeps or finds its children and nothing runs twice; (5) refused.
  - Setup: a scratch repository with a bare remote, a 3-task chain, the Claude Code definition approved, the `process` executor.
  - Action: (1) run the chain; (2) fail one check so the task gets one feedback round by resume; (3) kill one child mid-task; (4) restart the app backend mid-run; (5) run a person-only command from a child with `--as-person`.
  - Also record (not verified before): the permission and sandbox values Claude Code accepts; that writes outside the write roots, the git directory included, are refused; that the database and credentials cannot be read; whether `--max-budget-usd` binds on a plan login; and whether the app backend may keep a detached long-lived child.
  - Failure means: a child escapes the worktree, a restart loses or doubles a child, or a person-only command runs in a child.
  - Next decision: make `process` the default for Avoozl's own repository, or keep `kirocrew`.

## Phase 48: A second harness by definition file only

Requirement 94.7 (design §4.28). Exit: Codex runs a task with no code change.

- [x] `48.1` A Codex definition file, after avoozl-p57 [R94.1, R94.4] (§4.28)
  - A Codex definition file
  - Its start and resume argv, permission values and cost source.
- [x] `48.2` Inner sandbox off only under Avoozl's sandbox, after 48.1 [R94.4b, R94.4d] (§4.28)
  - Inner sandbox off only under Avoozl's sandbox
  - `permission.write` may be exactly `danger-full-access`; the child then starts only inside Avoozl's sandbox with the task write roots, and is refused with no Avoozl sandbox, opt-in or not. Tests: refused without the Avoozl sandbox, allowed with it, every other bypass value still refused.
  - `permission.write` may be exactly `danger-full-access`; the child then starts only inside Avoozl's sandbox with the task write roots, and is refused with no Avoozl sandbox, opt-in or not. `examples/harnesses/codex.json` uses it.
  - Tests: refused without the Avoozl sandbox, allowed with it, every other bypass value still refused.
- [x] `avoozl-p58` P58 Proof: Codex runs a task from its definition file alone, after 48.1, 48.2 [R94.7] (§4.28)
  - Proof: Codex runs a task from its definition file alone
  - Expected: the child exits with a valid `.avoozl/result.json`, Avoozl commits its changes and the task finishes; `git diff --stat` of every source file against the recorded commit is empty, and the proof fails if any source file changed.
  - Setup: the Phase 47 scratch repository; the Codex definition approved by hash; the source tree at a recorded commit.
  - Action: run one task and one feedback round on Codex.
  - Also record (not verified before): the permission and sandbox values Codex accepts, and that its writes stay in the worktree.
  - Failure means: the seam still needs code per harness.
  - Next decision: fix the seam so the next harness needs no code.

## Phase 49: Every role on any executor

Requirement 97.3 (design §4.28).

- [x] `49.1` Every role runs on `process`, after avoozl-p57 [R97.3, R94.4] (§4.28)
  - Read-only roles get the read-only class.
- [x] `avoozl-p59` P59 Proof: each role runs on either executor, after 49.1 [R97] (§4.28)
  - Proof: each role runs on either executor
  - Expected: the same result kinds from both; a read-only role cannot write.
  - Setup: a scratch workspace; each role pinned once to `kirocrew` and once to `process`.
  - Action: run each role once per executor.
  - Failure means: a role still depends on Kiro Crew.
  - Next decision: move that role's Kiro Crew detail into the executor.

## Phase 50: One page for every session

- [x] `50.1` In flight for `process` sessions: status, log tail, cost, copyable attach command, after avoozl-p57 [R98.1] (§4.28)
  - In flight for `process` sessions: status, log tail, cost, copyable attach command
- [x] `50.2` Send message queues a `send`, after 50.1 [R98.2] (§4.28)
  - Send message queues a `send`
- [x] `50.3` Settings › Models picks harness and model per role, after avoozl-p57 [R98.3] (§4.28)
  - Settings › Models picks harness and model per role
- [x] `50.4` One `roles` table for harness, agent and model; Settings › Models is the only place to pick them, after 50.3 [R98.5, R98.6, R98.8] (§4.28)
  - `resolveRoles` in `repository-settings.ts` reads the `roles` table; `roles` is in the config schema; Settings › Models picks each role's harness, agent and model.
- [x] `avoozl-p60` P60 Proof: a process session is watched and steered from the Avoozl page, after 50.1, 50.2, 50.3 [R98] (§4.28)
  - Proof: a process session is watched and steered from the Avoozl page
  - Expected: status, log tail and cost show; the message reaches the child through `send`; the next task of that role uses the new harness; screenshots at 390 and 1280 px, light and dark.
  - Setup: one `process` session on a scratch repository.
  - Action: open In flight, copy the attach command, send a message, change the role's harness.
  - Failure means: a process session needs another UI.
  - Next decision: approve the screenshots.

## Phase 51: Headless workers

Requirements 95.3, 98.4 (design §4.28). The base for the pull-based worker
mode of Phase 43.

- [x] `51.1` The supervisor under launchd or systemd, running the tick too, after avoozl-p57 [R95.3] (§4.28)
  - The supervisor under launchd or systemd, running the tick too
- [x] `51.2` CLI only: `avoozl status` and `avoozl runner status --json`, after 51.1 [R98.4] (§4.28)
  - CLI only: `avoozl status` and `avoozl runner status --json`
- [x] `avoozl-p61` P61 Proof: a headless machine runs tasks with the CLI only, after 51.1, 51.2 [R95, R98.4] (§4.28)
  - Proof: a headless machine runs tasks with the CLI only
  - Expected: both tasks finish; the supervisor comes back and finds its state; `runner status --json` reports both.
  - Setup: a machine without Kiro Crew's page, the supervisor under launchd.
  - Action: run two tasks; reboot the supervisor; read status.
  - Failure means: a headless worker needs the page or a person.
  - Next decision: build Phase 43 on it.

## Phase 52: The manual path stays

Requirement 96.4 (design §4.28).

- [x] `52.1` `next`, `take` and `runner report` keep working for a person, after avoozl-p56 [R96.4] (§4.28)
  - `next`, `take` and `runner report` keep working for a person
  - One test per command from a plain shell.
- [x] `avoozl-p62` P62 Proof: a person finishes a task by hand, after 52.1 [R96.4] (§4.28)
  - Proof: a person finishes a task by hand
  - Expected: the task lands as if a worker did it.
  - Setup: a scratch workspace with one ready task.
  - Action: `avoozl next`, `avoozl take`, edit and commit, `avoozl runner report TASK done`.
  - Failure means: the manual path broke.
  - Next decision: fix it before removing anything else.

## Phase 56: Working branches and spec issues

Requirement 102, design §4.32.

- [x] `56.1` Task outcomes, legacy values and branch-progress semantics [R102.3] (§4.32)
  - Task outcomes, legacy values and branch-progress semantics
  - Define the task-definition digest and latest valid outcome reducer; done/skipped/landed complete, refused/reopened/unverified/stale hold. Explicitly carry forward unchanged evidence only on new approval.
  - Accept route: github and merged-pr without rewriting approved files. Branch checkmarks remain outside the revision hash and only verified in-spec dependencies may advance; cross-spec dependencies wait for accepted outcomes. Tests cover every outcome and unchanged source hashes.
- [x] `56.2` Publish spec issues, after 56.1 [R102.1, R102.2] (§4.32)
  - Publish spec issues
  - Implement explicit per-spec publication, one issue per spec/epic. Approval alone makes no GitHub write. Keep epic links and existing issue ownership. Spec, epic and sub-issues carry crew:avoozl in their create call.
- [x] `56.6` Independent refresh and held reconstruction [R102.7, R102.10, R102.11] (§4.32)
  - Independent refresh and held reconstruction
  - Cache repository hashes separately from assignee/review/check reads. Use conditional reads; unchanged definitions are not reparsed. Reassignment is observed with no branch commit.
  - Rebuild from the spec folders, approvals, ticks and landing commits; unknown spend is never zero. Tests cover a lost database and an unavailable fork.
- [x] `42.1` PR portions from target repositories or forks, after 41.3 [R87.3, R87.4, R102.6] (§4.32)
  - PR portions from target repositories or forks
  - Open/reuse the PR from an exact verified source head without an upstream copy. Update only the queue head and writable source. Enforce that PR head's required checks and standing reviews; record actual approvers and merger. Without target merge permission, observe an authorized maintainer's merge. No protected-review trains.
- [x] `42.6` The tick lands `pr` portions through the landing queue [R87.3, R87.4, R87.5, R87.6] (§4.26)
  - The tick lands `pr` portions through the landing queue
  - A verified task in a repository with landing `pr` is pushed to its task branch (`pushHead`, never forced) and queued as one portion. Each tick runs `landNext` with `pullSteps` per base. Landed marks the task integrated at the merge commit; failed checks send the task back to its chat; a conflict uses `sendConflictBack`. `direct` and `off` keep today's path. Fake GitHub and git test; no live write.
- [x] `41.9` The tick lands `direct` portions through the landing queue, after 41.3, 42.6 [R87.1, R87.2, R88.6] (§4.26)
  - The tick lands `direct` portions through the landing queue
  - A verified task in a repository with landing `direct` is queued as one portion. Each tick runs `landNext` with `directSteps` per base: checks on the merged candidate, then a guarded fast-forward push, never forced. Landed marks the task integrated at the candidate, fast-forwards the local base and removes the task worktree and branch; failed checks go back to the chat. Real git test with a bare remote; no live write.
  - A verified task in a repository with landing `direct` is queued as one portion; each tick runs `landNext` with `directSteps` per base (checks on the merged candidate, then a guarded fast-forward push, never forced). Landed marks the task integrated at the candidate, fast-forwards the local base and removes the task worktree and branch; failed checks go back to the chat.
- [x] `avoozl-p50` P50 Proof: a three-task chain survives a gateway restart unattended, after 40.1, 40.2, 40.3, 40.4, 40.5, 40.6, 40.7, 41.1, 41.2, 41.3, 41.5, 41.9 [R86, R87.10, R88] (§4.26)
  - Proof: a three-task chain survives a gateway restart unattended
  - Expected: (1) each task lands in order with its checks recorded; (2) trust is set again, task 2 goes on in the same worktree, no second chat unless Kiro Crew says it is gone; (3) the tick push goes through Kiro Crew's push policy; worktrees removed after landing.
  - Setup: an isolated Kiro Crew home, a scratch repository with a bare remote, a three-task chain, landing `direct`.
  - Action: (1) start the chain and leave it; (2) restart the gateway while task 2 works; (3) let the tick push the base.
  - Failure means: the loop still needs a person, or the push policy blocks the tick.
  - Next decision: if the policy blocks the tick, land with `pr` only until Kiro Crew allows it.
- [x] `avoozl-p52` P52 Proof: ten tasks land through pull requests on a repository with a required check [R87] (§4.26)
  - Proof: ten tasks land through pull requests on a repository with a required check
  - Expected: ten pull requests merge one at a time after the check passes on each head; the moved base is merged in and checked again; the failed task goes back to its chat; no force push; setup run again changes nothing.
  - Setup: a scratch GitHub repository set up by `avoozl setup` with one required check.
  - Action: release ten tasks; move the base during one; make one check fail.
  - Failure means: a merge on an unchecked head, a second ruleset rule, or a force push.
  - Next decision: keep `pr` as the default for repositories with required checks.
- [x] `42.4` Review Avoozl repository settings against owner policy (§4.26) (**MANUAL**)
  - Review Avoozl repository settings against owner policy
  - Owner-only: preview and report the current landing/check policy. Preserve the owner's disabled required-CI gate; do not restore three required checks automatically. Apply a real settings change only if explicitly authorized.
- [x] `56.11` Privacy enforcement for checkpoints and public metadata, after 56.2 [R87.9, R102.7, R102.16, R102.17, R102.18] (§4.32)
  - Privacy enforcement for checkpoints and public metadata
  - Reuse existing content scanning in process before every outgoing push range and every externally visible intake/PR/status write. Check ref names, commit messages, added lines and public metadata, without raw logs, commands, paths or private identifiers.
  - Tests insert made-up private names into branch names, commit messages, PR bodies, check summaries, records and artifacts and refuse publication before the first write. Preserve useful opaque IDs and public commit/check references. Private-plan mappings and sensitive controls remain private; hidden HTML grants no secrecy.
  - No internal information on public writes: refuse hostname and IP literals, *.corp/*.internal/*.local/*.lan and the owner's private machine-local internal-domain list, home paths, and this machine's own hostname and username before the first write. Public writes name a machine only by its public label (machine config; never the hostname). Tests insert a made-up hostname and username into every public field and expect refusal with nothing written.
- [x] `56.3` Qualified working heads, fork checkpoints and verified integration, after 56.2, 56.11, 40.5 [R102.4, R102.5, R102.6] (§4.32)
  - Qualified working heads, fork checkpoints and verified integration
  - Generalize spec homes and integration branches to source repository/ref/SHA and target/base. Discover PR fork heads; accept trusted owner-published pre-PR refs. Fetch only registered sources, validate relationships and exact commits; no arbitrary issue URLs or commands.
  - Driver creates one spec working branch per affected repository, integrates checked task refs serially, and keeps unfinished checkpoints separate. A fork needs no upstream branch copy. Content checks apply to all checkpoints; acceptance gates apply to verified integrations. Test recovery after database loss, fork deletion/rewrites, two identical branch names and absent upstream push access; sandboxed agents never receive push credentials.
- [x] `44.1` One link set per spec and task from stored records, after 40.4, 41.2, 42.6, 56.2, 56.3 [R92.1, R92.2, R92.3] (§4.27)
  - One link set per spec and task from stored records
  - Pure read model over the spec issue, spec working branch, task branch and worktree, task PR and check state from landing, landed commit from delivery records, and intake/escalation issues. URLs come from validated repository, number, ref and SHA fields only.
  - Missing records show as none; check state carries head SHA and age, and a non-current head is never shown as current. A counting-client test asserts the GitHub call count is unchanged with link sets on.
- [x] `44.4` PR and branch chips on In flight rows, after 44.1 [R92.6, R92.9] (§4.27)
  - PR and branch chips on In flight rows
  - `PR #N` with a check dot, and the branch. Chips fit a 390 px row.
- [x] `44.3` Links box in the task details view and the Graph modal, after 44.1 [R92.5, R92.9, R92.10] (§4.27)
  - Links box in the task details view and the Graph modal
  - Branch, PR, checks, landed commit and issue; the Graph modal reuses the same view. A worktree path shows as local text only.
- [x] `44.2` Links box in the spec details panel, after 44.1 [R92.4, R92.9, R92.10] (§4.27)
  - Links box in the spec details panel
  - Spec issue, working branch, open PRs with a check dot each, Radar issues it came from. Links open with target=_blank rel="noopener noreferrer"; a private spec issue renders only locally.
- [x] `avoozl-p54` P54 Proof: links on real GitHub, after 44.1, 44.2, 44.3, 44.4 [R92, R102.5, R102.7] (§4.27)
  - Setup: isolated scratch workspace with two registered targets, one PR from a fork, one landed and one held task; no real workspace tick.
  - Action: open the spec details panel, a task's details and its Graph modal, and In flight at 390 and 1280 px, light and dark; follow each link; count GitHub calls before and after.
  - Expected: every link reaches the right GitHub item in a new tab; opening and refreshing the views adds zero calls. Private spec references, host names, usernames and paths never render on a public surface.
  - Also record: screenshots, exact source and target SHAs, call counts and owner screenshot approval. Live receipt under docs/evidence/; wait for owner approval before ticking.
  - Failure means: a wrong or stale link shown as current, a leaked private reference, an extra GitHub call or an unusable mobile layout.
  - Next decision: owner approves the screenshots, or names the link detail to change.
- [x] `avoozl-p67` P67 Proof: fork source and upstream permissions [R102.5, R102.6, R102.7] (§4.32) (**MANUAL**)
  - P67 Proof: fork source and upstream permissions
  - Setup: isolated scratch upstream and authorized fork, a contributor login without upstream push/merge rights and an authorized maintainer login, plus public and private scratch spec homes. Owner supplies needed accounts; use no real repository settings.
  - Action: register a pre-PR fork head, checkpoint there, then discover
    a fork PR head. Land from both. Move the base and require fresh checks
    and review before the maintainer merges. Try an unregistered source
    and a private-plan reference on every public surface.
  - Expected: fork work stays on its source branch. The maintainer merges
    the exact checked and approved head. Avoozl refuses an unregistered
    source and holds any write that exposes private planning information.
  - Record the source and target refs and commits, both logins' permissions,
    the PR head and merge SHA, the checks and reviews, and sanitized
    discovery records.
  - Write a live docs/evidence/ receipt; do not tick from tests or unavailable second-account behavior. Failure means a permission bypass, assumed upstream source branch, stale head or private disclosure.
  - Next decision: enable fork heads by default, or fix source resolution and permissions first.

## Phase 58: A role per repository

Design §4.34.

- [x] `58.1` A role per repository in Repository setup [R28.1] (§4.34)
  - Repository setup shows each repository's role (local, code, planning, both), derived from `github.mode` and `github.planningRepository` in `hosts/kirocrew/ui/src/settings-api.ts`; choosing `planning` for one repository turns the old planning repository into `code`.

## Phase 59: Task Timeline

Requirement 106, design §4.35.

- [x] `59.1` Task details get a Timeline of Avoozl's task steps [R106.1, R106.2] (§4.35)
  - The task drawer's Timeline tab lists the task row's last change, each session's start and status, evidence, delivery states and the integration commit, each with its time; `taskTimeline` in `src/app/api/page-views.ts` builds it from stored records and makes no GitHub call.

## Phase 63: One intake list

Requirement 110, design §4.39.

- [x] `63.1` GitHub sources in `intake.sources`, after 14.2 [R110.1, R110.2, R110.3, R110.6, R50.6] (§4.39)
  - `github-sources.ts` reads and writes `via: github` entries; `validateSource` takes the GitHub kind and refuses the wrong keys per kind; `sourceMap` leaves it out; `github configure` and Repository setup write a source; `github.queue` is ignored. Intake sources lists each GitHub source in the shared box with a link to Repository setup. Tests cover each case.

## Phase 65: A tick on the base branch completes the task

Requirement 113, design §4.41.

- [x] `65.1` A tick on the base branch marks the task done, no re-approval [R113.1, R113.2, R113.3, R113.4, R113.5, R113.6, R113.8] (§4.41)
  - A tick on the base branch marks the task done, no re-approval
  - Each workspace tick reads tasks.md from the base branch; a `[x]` item completes its task with the tick's commit, releases its worker session, and keeps the hash; an untick waits in Needs you with Reopen and Keep done; a ticked item with no ID is a lint error; tests cover each.
  - `spec-ticks.ts` and `applyBaseTicks` in `operations.ts`; `conflicts.settle` takes `reopen` and `keep`; the Conflicts page shows the `untick` item.
- [x] `65.2` Landing ticks its task in the landing commit, ticks are the shared state, after 65.1 [R113.8, R113.9, R113.10, R113.11, R113.12] (§4.41)
  - A direct landing's merge commit carries the task's `[x]` and changes no other byte; a parent ticks after its last child; a spec in a plans repository gets its own guarded commit with retry; the landing machine records no duplicate; a second machine reading origin marks the task done; tests cover each.
  - `tickEntry` in `stackMembers`, `tickPlansRepo` after the push, `baseTasks` reads `origin/<base>`.
- [x] `65.4` The tick commit is a task's landing commit, after 65.2 [R113.8, R113.14] (§4.41)
  - A landing makes one commit that ticks; each ticked task keeps the base-branch commit that ticked it, found by first-parent blame and kept in SQLite; receipts look its CI up by it; a person's `Built:` line is still read; tests cover a direct push, a squash merge and a rebuild from git.
  - `tickCommits` in `spec-ticks.ts` blames `tasks.md`; `applyTicks` keeps `task.tickCommit`.

## Phase 66: Git is the source of truth

Requirement 114, design §4.42.

- [x] `66.1` Verify approval evidence on the specs branch, after 65.2 [R114.1, R114.2, R114.3, R114.4, R114.5] (§4.42)
  - A commit on the specs branch approves the exact spec text when the
    repository's trust mode accepts its approver evidence.
  - **Approve** writes and pushes the person's commit using the checkout's
    git identity. The commit supplies the approval record.
  - `git-approvals.ts`, `approveInGit` in `operations.ts`, `spec-approval.ts`.
- [x] `66.2` Recoverable intake and `avoozl rebuild`, after 66.1 [R114.7, R114.8] (§4.42)
  - Intake tasks name their item with `source:`; dismissed items carry `avoozl:dismissed`; MCP pushes become GitHub issues; a deleted database rebuilds to the same plans, approvals and tasks.
  - `submitItems` in `intake.ts`, `workspace.rebuild`, `src/app/git/test/git-approvals.test.ts`.
- [x] `66.4` Adopt approvals from the specs branch on each tick, after 66.2 [R114.12] (§4.42)
  - A qualifying spec commit on the specs branch is adopted on the next tick as rebuild would; a later edit needs its own approval; a click adds no second Activity row.
  - `applyMainApprovals` and `adoptApprovals` in `operations.ts`, `src/app/git/test/git-approvals.test.ts`.

## Phase 67: Task IDs and refs in tasks.md

Requirement 115, design §4.43.

- [x] `67.1` Check task IDs and link requirement and design references [R115] (§4.43)
  - A ref the spec does not define is a lint error naming the ref, file and line; a task ID must be in a code span; refs are left out of the title and shown as chips that open their section; every spec under `.kiro/specs/` lints clean.
  - `spec-refs.ts`, `specItems` and `parseSpec` in `spec-plans.ts`, `PhaseTasks` in `PlansView.tsx`.

## Phase FS: Flexible spec folders

Requirement FS1, design §FS1.

- [x] `fs-1` specs.path, only tasks.md required, other Markdown as spec text [FS1] (§FS1)
  - `specs.path` in `.avoozl.json` names the specs folder (default `.kiro/specs`) and is refused when absolute, with `.` or `..`, or through a symlink out of the checkout; only `tasks.md` is required; every other `.md` file in a spec folder is part of the revision hash and named to workers; a requirement or design ref is checked only when its file exists and otherwise names the missing file; Kiro's three-file layout hashes and lints as before.
  - `specs-path.ts`, `readSpecFolder` and `revisionFiles` in `spec-plans.ts`, `resolveRefs` in `spec-refs.ts`, `git-approvals.ts`, `src/app/specs/test/flexible-specs.test.ts`.
- [x] `fs-2` A spec in one file, its tasks under ## Tasks [FS1.3, FS1.8, FS1.9] (§FS1)
  - A folder with no `tasks.md` reads the `## Tasks` section of its one `.md` file as its task list, with `###` phases and the file's own line numbers; a folder with both is a lint error naming both files; a tick in the section changes no spec text and the prose does; the parser, lint, hash, ticks, landing, rebuild and the page find the task file through `spec-tasks.ts`; `docs/github-workflow.md` rule 1.2 and the workflow kit cover both layouts.
  - `spec-tasks.ts`, `src/app/specs/test/single-file-spec.test.ts`, `workflow-kit/cases/single-file-spec`.

## Phase 68: The spec issue's assignee says who works on a spec

Requirement 116, design §4.44.

- [x] `68.1` The spec issue's assignee drives, after 66.4 [R116.1, R116.2, R116.5, R116.6] (§4.44)
  - A spec runs on this runner only when its spec issue, and the spec issue of every parent spec, is assigned to this runner's login alone; otherwise its tasks are held with the reason; a GitHub-backed spec waits for its issue, and a local-only spec can run here. Results are cached per pass.
  - `assignedTo`, `readSpecAssignees` and `assigneeHolds` in `spec-assignee.ts`, `src/app/specs/test/spec-assignee.test.ts`.

## Phase 69: The specs branch

Requirement 117, design §4.45.

- [x] `69.1` A repository names its specs branch, after 66.1 [R117.1, R117.2, R117.3, R117.4, R117.5, R117.6] (§4.45)
  - `specs.branch` decides where specs, approvals and ticks are read and written; tests cover plans-repo mode on a specs branch.
  - `specs-branch.ts`, `approvalBase` in `operations.ts`, `tickPlansRepo` in `spec-ticks.ts`, `spec-ticks-landing.test.ts`, `git-approvals.test.ts`.

## Phase 70: Avoozl reads git and GitHub

Requirement 118, design §4.46.

- [x] `70.1` Read qualifying approvals on each tick [R118.1, R118.2] (§4.46)
  - One commit approves every spec it changes; Approve and chat approval are the person's own commit; tests cover an epic commit approving three specs and the epic.
  - `adoptCommitted` and `applyMainApprovals` in `operations.ts`, `src/app/git/test/git-approvals.test.ts`.
- [x] `70.2` Adopt qualifying spec pull request merges [R118.3] (§4.46)
  - A qualifying merge by an approver approves the spec text on the specs branch.
  - `git-approvals.ts`.
- [x] `70.3` The driver is the spec issue's assignee, after 70.1 [R118.4] (§4.46)
  - The assignee rule reads the spec issue's assignee and never writes it.
  - `spec-assignee.ts`.
- [x] `70.4` Landing is a guarded push, after 70.3 [R118.5] (§4.46)
  - Landing is a guarded push, after 70.3
  - Landing pushes or merges through `guarded-push.ts`; tests cover a guarded fast-forward refusing a moved base and a head-guarded merge.
  - `guarded-push.ts`, `merge-batch.ts`, `landing-pulls.ts`, `direct-landing.ts`, `pr-landing.ts`.
- [x] `70.5` Work runs on the driver's own machine, after 70.4 [R118.6] (§4.46)
  - The tick dispatches only to this machine's own executors; process workers here run as before.
- [x] `70.6` Make the GitHub issues after approval, after 70.1 (§4.46)
  - The tick publishes an approved spec's issue and its epic's issue; `avoozl spec publish` is a person's retry, and publishing again writes nothing.
  - `src/app/specs/spec-publication.ts`, `spec.publish` in `src/app/api/command-dispatch.ts`.

## Release publication

- [ ] `7.6` Publish the npm package, the app package and a signed GitHub release (§13) (**MANUAL**)
  - The report links to both published packages and the signed release.
