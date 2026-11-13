# Tasks: Avoozl as a Kiro Crew-native, GitHub-native product

Ordered by phase. Each phase ends with its proofs; a phase starts only after the
previous phase's proofs pass. Every proof lists setup, action, expected result,
failure meaning, and the next design decision (Requirement 25.4). Requirement
numbers are in brackets; section numbers refer to `design.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces; run `npm test` and `git diff --check` before landing; no real
workspace data, credentials, or personal plans in the repository (AGENTS.md).

Person-only tasks. Entries marked `"manual": true` in the manifest are
tasks an agent should not start: proofs the owner skipped or that need scratch
organizations, the existing-workspace move, publishing, and tasks waiting on
Kiro Crew requests (MC-10, MC-13, and the asks not yet filed). The tick reads
`manual` only once 22.1 is built; until then, move their cards to Deferred on
the Project before turning on Autopilot. Added 2026-11-13.

Commit names. A `Built:` line written before the publish names a commit from
the private history; that code is in the publish commit `ac3825f`. Later lines
name commits and pull requests on `main`.

Who drives each phase (design §12.1): Phase 0 runs as one background subagent;
Phases 1–2 run from one Crew Mode chat; Phase 3 onward is delivered by Avoozl
itself from this spec.

Change note (2026-11-11 owner decisions, Requirements 28–31). Phase 2 stays
the local option and the runner for plans-repo leaves. Phase 2 wording changed
in 2.1, 2.2, 2.3, 2.4, 2.5, 2.14, and P4. Code impact: 2.3 needs rework
(the planner writes fenced plan files today); 2.4 and 2.5 gain a spec-folder
input and `extractPlan` becomes migration-only; the in-flight 2.1 and 2.2 code
already meets the new wording. The opt-in `authority: local` change to the
plan lint is in 3.14, and the `merged-pr` shortcut in `completionReached` is
replaced in 3.11, so neither reworks Phase 2.

Change note (2026-11-12, GitHub-native split, Requirement 33). GitHub owns
Project Status (built-in workflows), the blocked signal (open blocked-by
dependencies, `is:blocked`), and closing leaf issues in both modes; plans-repo
leaves close through a linked branch Avoozl creates at dispatch (design F51).
Changed tasks, marked "Changed 2026-11-12": 3.6, 3.9, 3.11, 3.14, 3.15, 3.18,
4.7, 4.9, 6.8, 6.9, and proofs P10, P11, P14, P16, P17, P18, P19, P24. New proof:
P25. No task is renumbered or removed. Phase 2 needs no rework: its code
writes no GitHub state, and the `merged-pr` shortcut it ships was already
replaced in 3.11.

Change note (2026-11-12, review gates, Requirements 36–39). New Phase 9 holds
the owner's review-verdict handoff. It changes no earlier task. It starts
after Phase 2's proofs (P4, P5, P6, P2b) pass, not after Phase 8, because it
extends local delivery only; 9.10 also waits for 3.11.

Change note (2026-11-12, content rules, Requirement 40). New Phase 10 makes
today's leak, reply, and secret screens one feature and adds banned terms
at every write and approval boundary. It changes no earlier task: tasks
4.3 and 4.8 keep their behavior, and their screens move behind the matcher
in 10.3. Like Phase 9 it starts after Phase 2's proofs pass; 10.6 and 10.7
also wait for the tasks that built their boundaries.

Change note (2026-11-12, crew placement, Requirements 41–42). New Phase 11
picks the crew for each worker, checks, and reviewer session and adds the
Routing page. It changes no earlier task. With no rules every session runs
on this machine, as today.

Change note (2026-11-12, Avoozl manages this spec). Avoozl's spec reader
needs an ID token on every item, and `P1` is not one, so each proof item
now starts with `avoozl-p<N>` and keeps its P number in the title. Avoozl
titles hold at most 240 characters, so a longer item keeps its first clause
as the title and its remaining text, unchanged, moves to the first line
under it. No task
or proof is renumbered or removed. `avoozl/manifest.json` holds each item's
kind, repository, edges, checks, and acceptance. Its edges follow the phase
rule above and in design §12 (a task waits for the previous phase's proofs,
or its tasks when it has none; a proof waits for its phase's tasks), the
Phase 8–11 start rules, and the dependencies items state ("after 3.11",
"from P4"). A checked box and its "Built:" line record work already landed
on `kirocrew-native`; Avoozl does not read checkbox marks.

Change note (2026-11-12, flow, Requirements 43–48). New Phase 12 records
where each task's time goes, stops new dependent work when a change breaks a
check that passed, runs checks locally before any push, batches small tasks,
and runs retrospectives that propose changes for the owner to approve. It
changes no earlier task. Like Phases 9–11 it starts after Phase 2's proofs;
tasks that read GitHub or push also wait for 3.11, 4.7, and 10.4. Design
§4.11 gives the background and the reason for each rule.

Change note (2026-11-12, incoming items, Requirement 50). New Phase 14
brings work in from every source as one incoming-item record, through a
tracker plugin's optional `poll` or the MCP tool `plans_intake_submit`,
and lists it in Untriaged. It changes no earlier task's behavior: GitHub
intake (3.2–3.4) and the Untriaged read (13.2, 13.3) move onto the record
in 14.7 and 14.8 with their results unchanged, and R49.1 now also shows
the tab in Local only mode when a non-GitHub source is declared. Like
Phases 9–13 it starts after Phase 2's proofs; its tasks also wait for the
tasks they extend.

Change note (2026-11-13, agent and model per task, Requirement 53). Phase
11 gains 11.11, 11.12, and P33: a routing rule or manifest task may set the
writer's agent and model, or weighted choices among several. It changes no
earlier task. With no `session` set, every session opens as today.

Change note (2026-11-13, pull request feedback, Requirement 54). New Phase
15 sends failed checks, review, conflicts, and auto-merge state on an
Avoozl worker's pull request back to that worker, with a round bound. It
changes 4.7's behavior only by adding the relay; the brief is unchanged.
Like Phases 9–14 it starts after Phase 2's proofs, and also waits for 4.7
and 10.4.

Change note (2026-11-13, plugin bundles, Requirement 55). New Phase 16
lets one plugin bundle a settings pack, content rules, a tracker, and an
intake source, and replaces the separate config-pack idea. It changes no
earlier task's behavior: a manifest without `provides` loads as before.
14.6 keeps the tick's polling and cursor; 16.4 built only the `poll`
contract it calls. It starts after 8.6–8.8 and does not wait for Phases
9–15; 16.7 waits for 11.2.

Change note (2026-11-13, Intake, Requirements 50.23, 55.11, 55.12). The
Untriaged tab is now **Intake**, with Untriaged as its default filter;
setting keys and the `untriaged` channel keep their names. Packs and
repository entries gain optional `waitingLabels` and `priorityLabels`.
Under Requirement 56 the MCP side of 14.3 is `plans_intake` actions, not
new `plans_intake_*` tools. No earlier task changes.

## Phase 0: Baseline

- [x] 0.1 Rebase `feature/kirocrew-github-delivery` onto `main` and resolve conflicts in `github-sync.mjs`, `operations.mjs`, `store.mjs`, `cli.mjs`, and `mcp.mjs`. [R25.3] (§9)
  - Done when the rebased branch passes `npm test` and opens a copy of the Nupp database without schema errors.
  - Built: `965f7c4`, the branch rebased onto `main` (`fa57279`); tests pass at `d22f2b9`, and P3 (`445a519`) opened a Nupp copy without schema errors.
- [x] 0.2 Tag the last host-era release (OpenHands, website, extension) so removed surfaces stay recoverable. (§9)
  - Built: tag `host-era-final` at `fa57279`.
- [x] 0.3 Add a test fixture workspace generator that produces local, GitHub-cache, and mixed workspaces in a temporary directory. [R25]
  - Built: `0747a53`.

## Phase 1: App shell inside Kiro Crew

- [x] 1.1 Add `avoozl app-backend`: HTTP on `127.0.0.1` only, health route, every other route requires a valid gateway-signed principal and returns 401 otherwise. [R1, R20.4] (§4.1, §4.7)
  - Built: `d22f2b9` (receipt `docs/evidence/phase1-core-runtime.md`, `5202d53`).
- [x] 1.2 Add `avoozl mcp` as the app's stdio MCP server, keeping every `plans_*` tool name. [R24.5] (§4.1)
  - Built: `d22f2b9` (receipt `docs/evidence/phase1-core-runtime.md`, `5202d53`).
- [x] 1.3 Replace `kirocrew-app/app.json` with the manifest in §4.2: node backend with `signedPrincipal`, `mcpServers`, script cron, notification channels, agents, skill, optional `gh`. [R1, R26.3]
  - Built: `e5c0f58` (receipt `docs/evidence/phase1-app-package.md`, `d3ac3d1`).
- [x] 1.4 Ship `crons/tick.py:run` that calls `plans_tick`, opens and messages sessions from the returned intents, and raises `Skip` when there is nothing to do. [R26.2–26.5] (§4.6)
  - Built: `e5c0f58` (receipt `docs/evidence/phase1-app-package.md`, `d3ac3d1`).
- [x] 1.5 Implement `workspace.tick` with the lock, policy load, and an empty intent list; prove two ticks in a row write nothing. [R26.4, R26.5] (§4.5)
  - Built: `d22f2b9` (receipt `docs/evidence/phase1-core-runtime.md`, `5202d53`).
- [x] 1.6 Build the Workspace view: workspace list from the machine catalog, add or initialize workspace, repository registration, tick health. [R3, R20] (§8)
  - Built: `31f14f0` (receipt `docs/evidence/phase1-workspace-view.md`, `40907fe`).
- [x] 1.7 Add `plans_bind_session` and session-title rediscovery (`avoozl:<task-id> …`). [R1.2] (§3.3, §8)
  - Built: `d22f2b9` (receipt `docs/evidence/phase1-core-runtime.md`, `5202d53`).

- [x] avoozl-p1 P1 Proof: real Avoozl backend inside Kiro Crew [R1, R20.4]
  - Setup: clean Kiro Crew profile; install the app from a local build with `kirocrew app install`; grant trust.
  - Action: open the Avoozl page; call a backend route directly on its loopback port without the gateway; list listening sockets.
  - Expected: the page loads data through `useAppApi`; the direct call gets 401; the only Avoozl listener is on `127.0.0.1`.
  - Failure means: the node backend or signed-principal contract does not work for third-party apps.
  - Next decision: if it fails, move the page's API onto the MCP server and decide whether a backend is needed at all.
  - Built: pass, receipt `docs/evidence/proof-p1.md`, `9310ab9`.
- [x] avoozl-p2 P2 Proof: tick script cron opens, messages, and observes sessions [R26, R1.2]
  - Setup: one registered repository with a Kiro Crew folder whose project directory the user set; a stub task that requests one dispatch.
  - Action: let the cron fire twice; close the opened session; let it fire again.
  - Expected: one session titled `avoozl:<task-id>` opens in that folder on the named agent, receives one brief, is bound before the brief is sent, and its closed status is read on the next tick.
  - Failure means: script crons cannot open sessions in folders or cannot call `session_status` (MC-2).
  - Next decision: if status is unreadable, decide between asking Kiro Crew for MC-2 and having workers report liveness through `plans_report` only.
  - Built: pass, receipt `docs/evidence/proof-p2.md`, `dcb8a8a`.
- [x] avoozl-p3 P3 Proof: workspace picker loads real SQLite data [R3.1]
  - Setup: a read-only copy of the Nupp database and its `.avoozl.json`.
  - Action: add the copy in the Workspace view; open Graph.
  - Expected: 141 W tasks across 7 epics, 130 edges, and the 3 milestones appear; the source file is unchanged byte for byte.
  - Failure means: the rebased schema or catalog cannot read real data.
  - Next decision: fix migration before any Phase 2 work.
  - Built: pass after one fix, receipt `docs/evidence/proof-p3.md`, `445a519`.

## Phase 2: Local delivery

- [x] 2.1 Extend the work model with `kind`, `authority`, `route`, `completion`, and edge completion conditions [R4.3–4.6, R19.2, R28.5] (§3.2, §4.3)
  - Readiness per §4.3. A row linked to an issue reads as `github`; any other row reads as `local` (§3.2).
  - Built: `0d18b94` (receipt `docs/evidence/phase2-model-validation.md`, `aadf2fc`).
- [x] 2.2 Refuse direct edits of `authority: github` rows in operations; route them to projection. Authority changes only through an approved projection or "take back local". [R19.3, R28.4] (§3.2)
  - Built: `0d18b94` (receipt `docs/evidence/phase2-model-validation.md`, `aadf2fc`).
- [x] 2.3 Ship the `avoozl-planner` agent and update the `avoozl` skill for goal capture [R4.1, R30.7] (§5, §6.8)
  - Drafting one Kiro spec folder (`requirements.md` or `bugfix.md`, `design.md`, `tasks.md` with an ID on every item, `avoozl/manifest.json`), and critique into `avoozl/critique.md` in a second, isolated session.
  - Rework (2026-11-11, R30): the shipped agent prompt and skill write `plans/<plan-id>.md` with fenced `task` blocks and `plans/<plan-id>.critique.md`, and `kirocrew-planner.test.mjs` checks the skill's examples with `extractPlan`. Change the prompt, the skill's draft and critique sections and briefs (paths, hash line, file list), and the test, which must parse the examples with the spec reader from 2.4.
  - Built: `85f5ea3` (receipt `docs/evidence/phase2-planner.md`, `1aac5b2`); rework `068789d` and `315d8b8` (receipt `docs/evidence/phase2-spec-plans.md`, `61f9c64`).
- [x] 2.4 Extend deterministic validation [R4.5, R4.7, R30.4, R30.5, R30.8] (§5, §6.8)
  - Leaf boundedness (one repository, acceptance, checks, completion), cycles, unknown references, duplicate IDs. Add a spec-folder reader that turns `tasks.md` plus `avoozl/manifest.json` into the task list `lintPlan` checks, and refuse a missing folder, a missing file, neither or both of `requirements.md` and `bugfix.md`, an item with no ID, a duplicate ID, and a manifest entry with no item or an item with no entry. `extractPlan` stays a read path for migration only.
  - Impact (R30): `lintPlan` and the work-model checks stay; they gain a second input. `extractPlan` keeps parsing old plan files and is called only by migration and legacy reads. Its current callers (`plan.save`, `plan.lint`, `plan.propose`, extraction in `operations.mjs`) move to the spec reader for new plans. `plan.propose` must stop appending fenced blocks to a plan and add a `tasks.md` item and manifest entry instead.
  - Built: `0d18b94` (receipt `docs/evidence/phase2-model-validation.md`, `aadf2fc`); spec reader `b79bbdd` (receipt `docs/evidence/phase2-spec-plans.md`, `61f9c64`).
- [x] 2.5 Build the Plans view: Kiro spec folders (feature and bugfix), manifest, critique findings, diagnostics, approve the exact revision (hash of the folder's files), draft-chat launcher. [R4.8, R20, R30] (§8)
  - Impact (R30): `plan.create` and `plan.save` hold one Markdown text per plan today; for spec folders they take the folder's files and one folder hash as `expectedHash`.
  - Built: `9d9c7d4` (receipt `docs/evidence/phase2-spec-plans.md`, `61f9c64`).
- [x] 2.6 Add `plans_prepare_worktree` (branch `avoozl/<task-id>`, isolated worktree) and `plans_report` (`progress`, `done` with commit SHA, `blocked`, `question`). [R6.6] (§4.6, §5)
  - Built: `4f0732e` (receipt `docs/evidence/phase2-dispatch-recovery.md`, `0307b04`).
- [x] 2.7 Dispatch ready local leaves in the tick by priority and graph order within per-repository and per-workspace limits. [R6.1–6.3, R26.7] (§4.5)
  - Built: `4f0732e` (receipt `docs/evidence/phase2-dispatch-recovery.md`, `0307b04`).
- [x] 2.8 Ship the `avoozl-verifier` agent; open a verifier session per `done` report; accept only matching SHA and passing declared checks. [R7.1] (§5)
  - Built: `e5e77ad` (receipt `docs/evidence/phase2-verify-integrate.md`, `7c686da`).
- [x] 2.9 Integrate verified commits with `integrateRun`; support an optional `integrationBranch`; record the integrated commit. [R7.2, R2.2] (§5)
  - Built: `e5e77ad` (receipt `docs/evidence/phase2-verify-integrate.md`, `7c686da`).
- [x] 2.10 Release dependents in the same tick; complete packages and epics from children; keep whole-head acceptance a separate action. [R7.3, R7.4] (§5)
  - Built: `e5e77ad` (receipt `docs/evidence/phase2-verify-integrate.md`, `7c686da`).
- [x] 2.11 Failure handling: retry with a resume brief on the same worktree up to the bound, nudge quiet sessions, never replace on elapsed time alone, open a decision past the bound. [R8] (§5)
  - Built: `4f0732e` (receipt `docs/evidence/phase2-dispatch-recovery.md`, `0307b04`).
- [x] 2.12 Decisions and notifications through the app's channels with a link to the session. [R9, R26.10] (§4.2)
  - Built: `819db47` (receipt `docs/evidence/phase2-runner-notices.md`, `7ace224`).
- [x] 2.13 Build the Graph, Delivery, and Conflicts views for local tasks. [R20, R21] (§8)
  - Built: `92edf4e` (receipt `docs/evidence/phase2-views.md`, `1a2d120`).
- [x] 2.14 Crew Mode runner support [R6.5, R26, R27.14] (§5.1, §6.6)
  - Exclude claimed tasks from readiness (or add a claim operation), add a structured session binding the conductor reports, add one `avoozl next` command (and `plans_next` tool) that returns `ready`, `running`, `waiting` (with the blockers each waits on), `needsYou` (blocked, review, open decisions), and `done`, and ship a steering file and `AgentSpawn` hook that drive rounds from it through one writer. Rule: start `ready`; wait while `running` is not empty; ask the user for `needsYou`; stop only when all are `done`. Keep the worker brief builder route-neutral: task 4.7 reuses this runner for plans-repo leaves.
  - Built: `819db47` (receipt `docs/evidence/phase2-runner-notices.md`, `7ace224`).
- [x] 2.15 Plans table grouped by category [R30.9, R20] (§6.8, §8)
  - One row per plan with status, a progress bar (done over total leaves; "no tasks" when there are none), ready, running and needs-you counts, epics, last change, and Open docs, Graph, Delivery, Review, and Plan a change buttons. Category comes only from `category:` in the spec's front-matter; remove the title-based guess.
  - Built: `3c6ca43` and `bf2cc01`; npm test 606 of 606 pass.

- [x] avoozl-p4 P4 Proof: one local parent decomposes into dependent leaves [R4]
  - Setup: an empty workspace and a small sample repository with a test command.
  - Action: in Kiro Crew chat, ask Avoozl to plan "add a config file loader, a validator that uses it, and a CLI flag that uses both"; approve the reviewed graph; run the tick three times.
  - Expected: one Kiro spec folder that passes validation; one epic and at least three leaves with stable IDs, `requires` edges loader → validator → flag, a critique record from a separate session, validation passing; the second and third ticks write nothing until something changes.
  - Failure means: planning output is not bounded or the tick is not idempotent.
  - Next decision: tighten the planner brief and validator, or reconsider tick boundaries.
  - Built: pass on the retry, receipt `docs/evidence/proof-p4.md`, `a0b808e`.
- [x] avoozl-p5 P5 Proof: automatic Kiro Crew execution of ready leaves [R6, R7]
  - Setup: the approved graph from P4; concurrency 2.
  - Action: leave the tick running with no human input.
  - Expected: only the loader dispatches first; after its verifier passes and it integrates, the validator dispatches, then the flag; every task links to its worker and verifier sessions; the integration branch has three verified commits.
  - Failure means: readiness, verification, or release ordering is wrong.
  - Next decision: decide whether verification must move into the worker session to cut latency.
  - Built: pass, receipt `docs/evidence/proof-p5.md`, `6613970`.
- [x] avoozl-p6 P6 Proof: worker failure and recovery [R8]
  - Setup: a leaf whose first attempt is told to fail its checks; a second leaf running.
  - Action: let the first attempt fail; close the second leaf's session by hand; restart the gateway mid-run.
  - Expected: the first leaf retries once with a resume brief and then succeeds; the closed session marks its leaf failed and retryable; after restart the first tick observes every bound session before any new dispatch; no task loses its ID, edges, or evidence.
  - Failure means: task truth depends on process state.
  - Next decision: move any missing state into SQLite receipts or GitHub.
  - Built: pass, receipt `docs/evidence/proof-p6.md`, `072a9a7`.
- [x] avoozl-p2b P2b Proof: Crew Mode conductor runs the local graph through Avoozl [R6, R8] (§5.1)
  - Setup: the approved graph from P4 in the real app backend; task 2.14 shipped; a Crew Mode chat whose project is the sample repository.
  - Action: ask the conductor to deliver the workspace; fail one leaf once on purpose.
  - Expected: rounds match readiness; a claimed task never appears ready twice; every task carries a structured session binding; the failed leaf retries and passes; all writes go through one writer.
  - Failure means: Crew Mode cannot be the local runner without enforcement Avoozl cannot provide.
  - Next decision: keep Crew Mode as the local runner, or fall back to the script cron of §4.6.
  - Built: pass, receipt `docs/evidence/proof-p2b.md`, `734754d`.

## Phase 3: GitHub core

- [x] 3.1 Remove the private-only check; allow public and private repositories. [R10.2] (§9)
  - Built: `9054021` (receipt `docs/evidence/phase3-policy.md`, `a84eb34`).
- [x] 3.2 Implement the `.avoozl.json` repository policy schema and validation in §4.4, replacing single-label intake and label behaviors. [R10, R11] (§4.4)
  - Built: `9054021` (receipt `docs/evidence/phase3-policy.md`, `a84eb34`).
- [x] 3.3 Generalize the rule matcher: `labelsAll`, `labelsAny`, `labelsNone`, assignee, author, newest triggering event's actor and permission; ignore and do not write for disallowed actors. [R10.4, R10.5, R11.2, R27.1]
  - Built: `9054021` (receipt `docs/evidence/phase3-policy.md`, `a84eb34`).
- [x] 3.4 Keep snapshot freeze and quarantine on body change for every matched rule. [R12.1, R12.2]
  - Built: `9054021` (receipt `docs/evidence/phase3-policy.md`, `a84eb34`).
- [x] 3.5 Implement marker version 2 with an opaque namespace ID (generated by `avoozl init`, stored in `.avoozl.json`), hash-only source pins, and `applied` hashes [R14.1, R10.7, R33.8] (§3.4)
  - Reject markers containing paths, repository names of the planning workspace, or credential patterns. Changed 2026-11-12: add the `order` field (closer, close reason, close time) for a close without code by an allowed actor, removed on reopen.
  - Built: `22ae436` (receipt `docs/evidence/phase3-marker-api.md`, `0d8ce5f`).
- [x] 3.6 Add GitHub sub-issue, issue dependency, and issue type endpoints to `github.mjs` (F37–F39, F44) [R12.5, R13.7, R27.5, R33.4, R33.5] (§6.3, §6.6)
  - Project parent–child links, including across repositories and organizations. Changed 2026-11-12: also add GraphQL `createLinkedBranch` and a read of an issue's `linkedBranches` and open `blockedBy` count (F51, F53, L13).
  - Built: `22ae436` (receipt `docs/evidence/phase3-marker-api.md`, `0d8ce5f`).
- [x] 3.7 Update projection per §6.3 [R13, R14.2, R27.6, R33.8] (§3.4, §6.3, §6.4)
  - Reuse open and closed marked issues, a closed issue for an unfinished task judged by the 3.11 close-without-code rule (changed 2026-11-12: was always a conflict), epic issue type when present, links then dependencies for `requires` and `sequence`, completion levels and `supports` edges in the marker only, re-read, ready labels last and capped by concurrency.
  - Built: `121042c` (receipt `docs/evidence/phase3-projection.md`, `e1db9c3`).
- [x] 3.8 Enforce one writer per namespace inside the tick lock; other workspaces preview only. [R13.5] (§6.3)
  - Built: `121042c` (receipt `docs/evidence/phase3-projection.md`, `e1db9c3`).
- [x] 3.9 Managed-field conflicts for title, managed body section, managed labels, and blocked-by links (edges) using marker baselines [R15] (§3.4)
  - Project field edits are never conflicts: 3.15 handles Deferred, Release, and Wave, and every other Status value is left alone (§6.7). Changed 2026-11-12.
  - Built: `121042c` (receipt `docs/evidence/phase3-projection.md`, `e1db9c3`).
- [x] 3.10 Implement `avoozl rebuild` from GitHub markers, sub-issues, dependencies, labels, and Project fields. [R14.3] (§3.3)
  - Built: `14b477f` (receipt `docs/evidence/phase3-rebuild.md`, `c7af204`); gaps `b043d1a` and `6c2460d` (receipt `docs/evidence/phase3-rebuild-gaps.md`, `c853d2b`).
- [x] 3.11 Wire `inspectGitHubTaskCompletion` into the tick with cached verdicts for leaves GitHub closed [R16, R12.6, R28.7, R33.3, R33.7–R33.10] (§6.5)
  - Closed as `COMPLETED`, exactly one `closedByPullRequestsReferences` closer, merged, in the leaf's registered code repository (drop the same-repository limit; read its checks there), on `baseBranch`, with `requiredChecks` passing on its head SHA; release dependents; close parents. Avoozl closes no leaf issue and matches no pull request by branch name. A merged, passing pull request on the task's linked branch (or naming `Closes #N`) whose issue is still open opens a decision. A leaf closed with no merged closing pull request (by hand, or by Auto-close issue after a drag to Done), as `COMPLETED` or `NOT_PLANNED`: read the latest `ClosedEvent` actor (fall back to the Status change's actor when it names `@github-project-automation`) and run the trigger-label actor check (the code repository's policy for a plans-repo leaf); an allowed closer is an order: mark the task done by order (never a verified completion), write the SQLite receipt and the marker `order` field, release dependents at every completion level including `merged-pr` and `integrated`, start no new session for the task, and leave a running one alone; a disallowed or unreadable closer holds the dependents and opens a decision, and Avoozl does not reopen the issue. A reopened leaf loses done (verified or by order) on the next tick and its `order` is removed: dependents not yet started wait again, running sessions are left alone, done dependents stay done. Each released dependent's brief says its blocker closed without merged code (closer, reason, time) and to check for the missing code first, with the blocker's issue link, or task ID and title only in plans-repo mode; for an Issue Radar leaf the note goes in the managed body section. Parents count children done by order. Replace the Phase 2 `merged-pr` shortcut in `completionReached` (any merged pull request counts) with the cached verdict or the order. Changed 2026-11-12: was head-branch matching plus Avoozl closing plans-repo and non-default-base issues; later the same day, a hand-closed blocker always held its dependents.
  - Built: `aab92f0` (receipt `docs/evidence/phase3-completion.md`, `dba0c0d`).
- [x] 3.12 Build `plans_project_preview` and the Plans preview of every create, update, link, edge, label, and Project field change. [R13.1, R29] (§6.1)
  - Built: `17c8234` (receipt `docs/evidence/phase3-preview.md`, `629572e`).
- [x] 3.13 Settings view for `.avoozl.json` [R11, R20, R28, R29] (§4.4, §8)
  - Mode, planning repository, default authority, Project and fields, epic issue type, repository policy, with validation. GitHub objects (labels, Project, fields) are created by the wizard in 3.18, not here.
  - Built: `40f7f41` and `315ccf0` (receipt `docs/evidence/phase3-settings.md`, `dc39267`).
- [x] 3.14 GitHub modes and authority [R28.1–R28.5, R16.5] (§3.2, §4.4)
  - `github.mode` (`plans-repo`, `single-repo`, absent), `planningRepository`, `defaultAuthority`, per-repository `coder`; validation per §4.4; new tasks default to `github` when a mode is set; accept `authority: local` on a manifest entry as opt-in and keep refusing `github` there (the Phase 2 lint refuses any `authority` on planned items today); show "pending projection" until the first issue exists. Changed 2026-11-12: validation also refuses a `baseBranch` other than the code repository's default for github tasks, and a `statusValues` key other than `todo`, `inProgress`, `done`, and `deferred`.
  - Built: `9054021` (receipt `docs/evidence/phase3-policy.md`, `a84eb34`).
- [x] 3.15 Project sync per §6.7 [R29, R33] (§6.7)
  - Add managed issues to the configured Project; set Release from manifest milestones when the item is added, and again only when an approved manifest moves the task and the field still holds Avoozl's last value; Wave computed from blocking edges (one function shared with projection; done tasks keep their wave; write only on change), optional Iteration; record `applied.project` (no Status); never write Status. On each 60-second tick, after completion: Deferred by an allowed actor (same `allowedActors`/`minimumPermission` check as trigger labels) pauses dispatch and linked-branch creation without touching a running session and notifies the owner; leaving Deferred resumes and writes nothing; Deferred by a disallowed or unreadable actor is ignored and shown in Delivery, not reverted; a drag to Done is left to Auto-close issue and judged as a close by 3.11 (changed 2026-11-12); every other Status value is left alone, and a mismatch with Avoozl's state shows in Delivery; a Release value Avoozl did not write is kept, used for the parent rule, and drafts a manifest change for review; a Wave edit is reverted and recomputed with a Kiro Crew notification; report unavailable without the `project` scope. Changed 2026-11-12: Avoozl wrote Status and reverted drags to Done, Running, Review, and a not-ready Ready, disallowed edits, and non-matching automation values.
  - Built: `f2d9b46` (receipt `docs/evidence/phase3-project-sync.md`, `0ba58b8`).
- [x] 3.16 Read plans only from Kiro spec folders in the mode's repository (planning repository, code repository, or the workspace's planning repository) [R30] (§6.8)
  - Map `tasks.md` IDs to issues; ignore Kiro's task waves and checkbox marks; refuse an approved ID whose item text changed without approval.
  - Built: `7c98d4e` (receipt `docs/evidence/phase3-spec-reading.md`, `88570d3`).
- [x] 3.17 Marker and leak rules for plans-repo mode: the marker never names the planning repository; Avoozl writes links only between planning issues and adds only planning issues to the Project. [R28.7, R28.11] (§3.4, §6.6)
  - Built: `22ae436` (receipt `docs/evidence/phase3-marker-api.md`, `0d8ce5f`).
- [x] 3.18 **Set up GitHub** wizard in Settings (`github.setup`, `avoozl github setup`, `plans_github_setup`), after 3.13–3.15 [R32, R33.6] (§4.4, §6.7, §8.2)
  - Check token scopes and show the fix command; choose mode and pick or create the private planning repository; turn on issues; pick or create a private org or user Project; make sure Status has Todo, In progress, Done, and Deferred (a template Project usually lacks only Deferred), map them through `statusValues` in the proposed `.avoozl.json` diff, never remove or rename an option, and keep every existing option `id`; read the Project's built-in workflows (`workflows { name enabled }`) and put on the checklist every one whose `enabled` differs from the recommendation (Auto-add sub-issues on; Auto-add on with a managed-label filter; Item added → Todo on; Pull request linked → In progress on; Item closed → Done on; Pull request merged → Done on; Auto-close issue on; Auto-archive off), plus the columns and filter it cannot read; never delete a workflow (L12); Release from spec milestones, Wave (number), optional Iteration, a Board view `Board by release` with a column per Status and grouped by Release, and an optional `Table by wave` grouped by Wave (no Roadmap view). Views: REST views with `group_by` first; on failure, GraphQL `createProjectV2View` and a "Group by …, then Save" checklist item; create the `Epic` issue type when allowed; create managed labels; propose the `.avoozl.json` diff for review. One preview of every write, one confirmation, idempotent by name, no delete or rename, per-step permission failures reported while the rest runs; end with the checklist of what the API cannot do (limits L1–L13). Changed 2026-11-12: no Ready, In review, or Blocked options; workflow check added; Auto-close issue now recommended on (a drag to Done closes as done, judged by 3.11).
  - Built: `daabf20` and `ff10c5c` (receipt `docs/evidence/phase3-wizard.md`, `9ee39d8`).

- [ ] avoozl-p7 P7 Proof: configurable GitHub label intake on a public repository [R10, R11, R27.1]
  - Setup: a new public test repository; policy with one `deliver` rule (`labelsAll` two labels, `labelsNone` a pause label, assignee filter) and one `respond` rule; an allowed actor and a second account without permission.
  - Action: apply labels in eight combinations, including from the disallowed account, then edit one matched issue's body.
  - Expected: only the combinations the rules describe match; the disallowed account's labels cause no match and no write; the edited issue is quarantined; trigger and managed labels never overlap.
  - Failure means: the rules engine or actor check is wrong.
  - Next decision: decide whether a GitHub search query form is needed beyond structured rules.
  - Open: Skipped by the owner; not run.
- [ ] avoozl-p8 P8 Proof: single-repo projection with sub-issues and dependencies [R13]
  - Setup: single-repo mode; an approved three-leaf graph with a parent epic targeting one repository, in a spec folder in that repository; the owner has an `Epic` issue type.
  - Action: preview, apply, then apply again.
  - Expected: one parent issue of type Epic with three sub-issues, issue dependencies matching the `requires` and `sequence` edges, a `supports` edge present only in the marker, the ready label only on the unblocked leaf; the second apply changes nothing.
  - Failure means: projection order or idempotence is broken.
  - Next decision: fix before cross-repository work.
  - Open: Skipped by the owner; not run.
- [x] avoozl-p9 P9 Proof: cross-repository dependencies and fresh-workspace recovery [R13.2, R14, R19]
  - Setup: single-repo mode with two repositories, one public and one private; a leaf in the second requires a leaf in the first.
  - Action: apply; then delete the workspace's SQLite file, run `avoozl rebuild`, then the tick, then apply again.
  - Expected: GitHub shows the cross-repository blocker; only the first leaf is ready; after rebuild every task, edge, status, and managed baseline matches the earlier state and no issue is duplicated.
  - Failure means: some truth still lives only in SQLite.
  - Next decision: move that state into the marker or GitHub.
  - Built: pass on the retry, receipt `docs/evidence/p9-cross-repo-rebuild.md`, `d85c379`.
- [ ] avoozl-p10 P10 Proof: managed-field conflict handling [R15]
  - Setup: projected issues from P8.
  - Action: a person edits one title, one managed body section, removes one managed label, and adds one blocked-by link by hand; an allowed actor drags one issue's Project Status to Deferred, drags another to Done, and changes a third's Release; the design changes all four issue fields; apply.
  - Expected: each human-edited issue field is reported as a conflict and left unchanged; untouched fields update; resolving in Conflicts applies the chosen value; no Project edit opens a conflict; the Done drag closes its issue through Auto-close issue and is judged as an order (P11 proves its effects), not a conflict; Deferred and Release are handled per §6.7 (P16 proves their effects). Changed 2026-11-12.
  - Failure means: conflict detection misses a field or overwrites silently.
  - Next decision: decide whether any field should be human-owned outright.
  - Open: Skipped by the owner; not run.
- [ ] avoozl-p11 P11 Proof: exact pull-request completion [R16, R33]
  - Setup: three projected leaves A, B, C with a required check, and a dependent leaf D that requires B. Changed 2026-11-12: also leaves F and H, with E requiring C at level `merged-pr`, G requiring F at level `integrated`, and J requiring H; E's card is in Deferred so it does not start; Auto-close issue on; a policy with one allowed actor and a second account with write access that it does not allow. Run once in single-repo mode and once in plans-repo mode (Avoozl creates the linked branch `avoozl/<task-id>` in the code repository at dispatch).
  - Action: for A, open two pull requests that both say `Closes #N` (single-repo) or open one from a fork branch with the same name plus the linked one (plans-repo); close one and merge the other with a failing check (branch protection off for this step). Merge B's pull request with passing checks. As the allowed actor, close C's issue by hand as not planned, and drag F's card to Done. As the disallowed account, close H's issue. Tick until G's session is running, then reopen C and F and tick. Merge a passing pull request with `Closes #N` into a non-default branch in a scratch repository whose policy was edited by hand past validation.
  - Expected: A's closed issue is a decision, not done; B completes and releases D in the same tick; in plans-repo mode GitHub closes B's planning issue with the pull request as closer, and the fork pull request closes nothing and counts for nothing; Avoozl closes no leaf issue in either mode; C and F are done by order, not verified: their dependents E and G are released in the next tick (both levels count; E shows as ready but paused), G's brief says the blocker closed without merged code (closer, reason, time) and to check for the missing code first, with the issue link in single-repo mode and task ID and title only in plans-repo mode, and the receipt and marker hold the order; F's close event names the person who dragged (record which source named the closer); H's dependent J stays held with a decision while GitHub shows it unblocked, and H stays closed; after the reopens, E is waiting again and gets no session, G's running session is left alone, and both orders are gone from the markers; the non-default-base merge leaves its issue open and opens a decision.
  - Failure means: completion logic or its wiring is wrong, or the closer of a close cannot be read.
  - Next decision: decide whether release levels need a `released` check before Phase 4; if Auto-close names no person, require hand closes for orders. Changed 2026-11-12 (twice: native closing, then close-without-code orders).
  - Open: Skipped by the owner; not run.
- [ ] avoozl-p16 P16 Proof: GitHub Project sync [R29, R31.3, R33]
  - Setup: an org Project with Status (Todo, In progress, Done, Deferred) and Release single-select fields, a Wave number field, and an Iteration field; the recommended built-in workflows set by hand from the wizard's checklist (Auto-close issue on); an approved plan with leaves in two repositories, two milestones, and one iteration named in the manifest; a token with the `project` scope; a policy with one allowed actor and a second account with write access that the policy does not allow. For Wave, a 5-task graph across 2 epics: epic A holds a1 and a2, epic B holds b1, b2, and b3; a2 requires a1; b2 requires a2 and b1; b3 follows b2 by `sequence`; a1 `supports` b3.
  - Action: apply; let one leaf run until its pull request opens, then merge it with passing checks; sync twice. Board drags, each followed by a tick: as the allowed actor, drag a ready leaf to Deferred and tick twice; drag it back to Todo; drag an open leaf to Done; drag a leaf with a running session to Deferred; change one leaf's Release to the other milestone; as the disallowed account, drag a ready leaf to Deferred. For Wave: apply; mark a1 done and tick; set b3's Wave by hand to 9 and tick; remove the a2-requires-a1 edge, approve, and tick twice. Then remove the `project` scope and sync.
  - Expected: every managed issue from both repositories is on the Project, at Todo from the Item added workflow; Avoozl makes no Status write at any point (no Status change by the token's account in any item's history); the running leaf moves to In progress when its pull request opens and to Done when GitHub closes the issue, by `@github-project-automation`; blocked leaves show GitHub's Blocked icon; Release matches each issue's milestone and parents take their children's latest; Iteration is set only where the manifest names one; the second sync writes nothing. Board drags: the Deferred leaf gets no new session, no linked branch, and no ready label over both ticks, and the owner gets one Kiro Crew notification; dragged back, it resumes and dispatches, and its card stays at Todo; the drag to Done closes the issue through Auto-close issue and the task becomes done by order (P11 proves the release and brief note), with no GitHub comment; the running session under a Deferred card keeps running; the Release change is kept on later ticks, the parent's Release follows it, a manifest change moving that task is drafted for review, and nothing is committed; the disallowed account's Deferred drag is not reverted, does not pause dispatch, and shows in Delivery; no board edit opens a conflict. The report says which writer source (timeline, item change record, or value only) was readable. Wave reads a1 1, b1 1, a2 2, b2 3, b3 4 (the `supports` edge adds nothing); a1 stays 1 after it is done and no other wave moves; b3's hand-set 9 is reverted to 4 in the next tick with a Kiro Crew notification; after the edge removal the next tick writes a2 1, b2 2, b3 3 and nothing else, and the tick after it writes nothing; without the scope, Settings reports Project sync unavailable and issue projection still works.
  - Failure means: Project fields cannot be kept current from the tick, the built-in workflows do not move Status as expected, or Deferred cannot be read reliably on a 60-second poll.
  - Next decision: drop Iteration, move field writes from REST to GraphQL, or replace the Deferred order with a pause label. Changed 2026-11-12.
  - Open: Skipped by the owner; not run.
- [x] avoozl-p20 P20 Proof: local and github tasks in one workspace [R28.2–R28.5, R31.4]
  - Setup: a workspace with a GitHub mode; an approved plan with three leaves, one marked `authority: local`.
  - Action: apply; run the tick five times; then remove `authority: local` from that entry, approve, and apply.
  - Expected: two issues exist and the local leaf has none and shows "local" in every view; it never appears in a projection preview while marked local; after the plan change it gets one issue, keeps its task ID, and now shows its issue link; no task ever has two writable rows.
  - Failure means: authority defaults or the local-to-github path are wrong.
  - Next decision: decide whether workspace-level `defaultAuthority: local` needs its own proof.
  - Built: pass on the retry, receipt `docs/evidence/p20-local-and-github.md`, `93edbaa`.
- [x] avoozl-p21 P21 Proof: Kiro spec folder validation [R30]
  - Setup: one feature spec and one bugfix spec written by Kiro, plus broken copies: a missing `design.md`; both `requirements.md` and `bugfix.md`; an item with no ID; a duplicate ID; a manifest entry with no item; a renumbered approved item.
  - Action: validate each; approve and project the two good specs.
  - Expected: each broken copy is refused with the file and line; the two good specs project, the bugfix spec's unchanged-behavior clauses appear as acceptance; Kiro's waves never change Avoozl's edges.
  - Failure means: the layout rules are not deterministic or miss a case.
  - Next decision: decide whether IDs need an explicit token beyond Kiro's numbering.
  - Built: pass on the retry, receipt `docs/evidence/p21-spec-validation.md`, `82200b4`.
- [ ] avoozl-p24 P24 Proof: Set up GitHub wizard [R32, R33.6]
  - Setup: a fresh test organization with one code repository whose issues are off, no Project, no `Epic` type, and no managed labels; a fresh test user account with one repository that holds a spec folder with two milestones and already has one label named like a managed label, with its own color; token T1 with `repo`, `read:org`, `project`, and `admin:org` as an organization admin; token T2 like T1 but without `project`; in the organization, a second Project made from a built-in template whose Status has only Todo, In progress, and Done, with one item set to In progress.
  - Action: with T1 on the organization, run the wizard in plans-repo mode, let it create the planning repository and an org Project, name the first release, confirm once, and approve the `.avoozl.json` diff; run it again. With T1, run it on the template Project. With T2 on the user account, run it in single-repo mode; then run the fix command it shows and run it again.
  - Expected: the preview lists every write before any is made. Run 1 creates a private planning repository with issues on, a private org Project with Status options Todo, In progress, Done, and Deferred, Release with the named release, a Wave number field, a Board view with Status columns and the `Table by wave` view the person asked for, no Roadmap view, the `Epic` type, and the managed labels, and the `.avoozl.json` change validates. Run 2 shows "Nothing to change" and writes nothing (no object's `updated_at` moves). The T2 run turns on issues and adds the missing labels, leaves the existing label's color as it was, reports the missing `project` scope with `gh auth refresh -s project`, and makes no Project call that writes. The run after the fix creates a private user Project with Release holding both milestones, and reports the `Epic` step as not available on a user account. The template-Project run adds only Deferred, keeps Todo, In progress, and Done with their option `id`s, leaves the item at In progress, and its `.avoozl.json` diff maps `todo`, `inProgress`, `done`, and `deferred` to those four options. Every run reads the built-in workflows and writes none: its checklist lists each workflow whose `enabled` differs from the recommendation (a Project with Auto-close issue off gets "turn on Auto-close issue"; `nupp-lang` Project #2, already on, gets no Auto-close item) and the column and filter lines it cannot read. No run deletes or renames anything. Each run ends with the checklist and its links, and the checklist has no date-field item. The report records whether REST views worked on each account (settling L7b): if REST grouped the views, they are grouped by Release and by Wave and the checklist has no grouping item; if it fell back to GraphQL, the checklist says "Group by Release, then Save" (and the same for Wave) and following it gives the grouped views.
  - Failure means: GitHub setup still needs hand steps, or the wizard is not idempotent or not safe to rerun.
  - Next decision: move the failing step to the checklist with a link, or drop it from the wizard. Changed 2026-11-12.
  - Open: Skipped by the owner; not run.
- [ ] avoozl-p25 P25 Proof: linked-branch close and leak check inside an organization [R31.5, R33.4] (§6.6, F51, F52)
  - Setup: a scratch organization shaped like `nupp-lang`: a private planning repository with issues on, a public code repository with a branch ruleset or protection on its default branch (one required check), auto-merge allowed, and the org's default member visibility; an org Project with the recommended workflows; a second org member with write access to the code repository and no access to the planning repository. Repeat the script behind `docs/evidence/github-linked-branch-probe.md` (Avoozl commit `31adf4e`).
  - Action: create a planning issue; `createLinkedBranch` with `repositoryId` of the code repository and name `avoozl/<task-id>`; push one commit; open a pull request with no closing keyword and no planning-repository text; read `closingIssuesReferences` right away; let auto-merge merge it under the required check; repeat once with the second member as the merger. Logged out, fetch the pull request page and its partials, the commit and branch pages, and REST pull request, issue, timeline, and events, and grep each for the planning repository's name and node IDs. Also check the watcher notification email of a code-repository watcher.
  - Expected: both planning issues close as `COMPLETED` with the pull request as closer within one tick; the Project item moves to Done by `@github-project-automation`; no logged-out fetch and no notification to a code-repository-only watcher names the planning repository; the result for the merger without planning access is recorded either way. Write the receipt under `docs/evidence/` in the Avoozl repository.
  - Failure means: inside an organization GitHub does not close the private issue through a linked branch, or leaks its name.
  - Next decision: if it does not close, fall back to Avoozl closing plans-repo issues after its own verdict (the pre-2026-11-12 rule) for that organization; if it leaks, require a private code repository for plans-repo mode. Must pass before Phase 4 builds on it (4.7) and before Phase 6.
  - Open: Skipped by the owner; not run.

## Phase 4: Delivery loops

Single-repo leaves go to Issue Radar (4.1, 4.2, P12). Plans-repo leaves go to
Avoozl worker sessions from the Phase 2 runner (4.7–4.9, P17, P18). The rest
applies to both.

- [x] 4.1 Settings shows the exact ready label each Issue Radar crew must scope to, with a link to Issue Radar (single-repo mode). [R17.4] (§6.4)
  - Built: `d37e395` (receipt `docs/evidence/phase4-crew-labels-priority.md`, `bdb1e83`).
- [x] 4.2 Stale-claim detection: crew claim label without the ready label; needs-human label opens a decision and blocks dependents. [R17.3, R27.11] (§6.4)
  - Built: `d37e395` (receipt `docs/evidence/phase4-crew-labels-priority.md`, `bdb1e83`).
- [x] 4.3 Ship the `avoozl-responder` agent (read-only tools) and `plans_post_reply` with secret and path screening; responding label added and removed by Avoozl. [R27.2, R27.3] (§4.7, §6.2)
  - Built: `dd80c99` (receipt `docs/evidence/phase4-responder.md`, `fec95fc`).
- [x] 4.4 Broad-issue flow: classify, draft child graph, critique, preview comment, approval by re-labeling or `autoPublishChildren`, sub-issues and edges. [R12.3–12.6, R27.5] (§6.2)
  - Built: `fafda83` (receipt `docs/evidence/phase4-broad-issue.md`, `c708d77`).
- [x] 4.5 Priority order by configured labels, then graph order, under the concurrency cap. [R27.7] (§4.5)
  - Built: `d37e395` (receipt `docs/evidence/phase4-crew-labels-priority.md`, `bdb1e83`).
- [x] 4.6 Optional `dependencyText` parsing of `depends on #N`, written back as native edges after approval. [R27.8]
  - Built: `fafda83` (receipt `docs/evidence/phase4-broad-issue.md`, `c708d77`).
- [x] 4.7 Plans-repo delivery [R27.4, R27.9, R27.14, R28.6, R18, R33.4] (§6.6)
  - The Crew Mode runner from 2.14 (script cron fallback) opens one worker session per ready plans-repo leaf in the code repository's folder; before the brief is sent, the tick creates (or reuses) the leaf's linked branch `avoozl/<task-id>` in the code repository from the head of `baseBranch` with `createLinkedBranch` (3.6); the brief carries only the task's own title and acceptance, and tells the worker to fetch that branch, push to it, open one pull request against `baseBranch` with no closing keyword, enable auto-merge, and fix CI and review until merge. Changed 2026-11-12: the worker used to create the branch.
  - Built: `f44bf0e` (receipt `docs/evidence/phase4-plans-repo-delivery.md`, `bf49f0d`).
- [x] 4.8 Leak screen [R28.7, R28.8] (§6.6)
  - Each tick searches candidate pull request titles, bodies, and commit messages for the planning repository's `owner/name`, URL, and `owner/name#`; a hit opens a decision, blocks completion, and asks the worker to edit.
  - Built: `f44bf0e` (receipt `docs/evidence/phase4-plans-repo-delivery.md`, `bf49f0d`).
- [x] 4.9 Plans-repo completion [R16.5, R29.2, R33.3, R33.8, R33.9] (§6.5)
  - Once GitHub closes the planning issue through the linked branch and the 3.11 verdict holds, release dependents in the same tick; Avoozl closes nothing and writes no Status. A merged, passing pull request whose planning issue stayed open opens a decision. A planning issue closed without merged code follows 3.11: an order by an actor the code repository's policy allows releases dependents with the brief note (task ID and title, no planning link); any other closer holds them with a decision. Changed 2026-11-12: Avoozl used to close the planning issue and update Status; later the same day, the close-without-code order was added.
  - Built: `f44bf0e` (receipt `docs/evidence/phase4-plans-repo-delivery.md`, `bf49f0d`).

- [x] avoozl-p12 P12 Proof: automatic Issue Radar execution [R17, R27.4]
  - Setup: single-repo mode; test repository with one Issue Radar crew scoped to the ready label; a broad issue labeled with the `deliver` trigger by the allowed actor; `autoPublishChildren: true`.
  - Action: no further human action.
  - Expected: children appear as sub-issues with edges; only unblocked children get the ready label; the crew claims one, opens a pull request that closes it, and Avoozl never writes the PR; blocked children receive the ready label only after their blocker completes.
  - Failure means: the label handoff cannot drive Issue Radar reliably.
  - Next decision: Requirement 27.14 — use worker sessions in single-repo mode too, and record why.
  - Built: pass on the retry, receipt `docs/evidence/p12-p13-issue-radar-auto-merge.md`, `9f62a7a`.
- [ ] avoozl-p13 P13 Proof: automatic pull-request merge [R18]
  - Setup: P12 repository and the P17 code repository, each with required checks and auto-merge allowed.
  - Action: let the crew's pull request and the worker's pull request pass checks.
  - Expected: each merges through Issue Radar or GitHub auto-merge under required checks; Avoozl's completion check accepts it; the parent closes after the last child.
  - Failure means: merge needs a human step in this configuration.
  - Next decision: document the repository settings required, or keep merge manual by policy.
  - Open: Only the single-repo half ran and passed (`9f62a7a`); the plans-repo half needs P17.
- [ ] avoozl-p17 P17 Proof: plans-repo mode in one organization, public code repository [R28.6–R28.11, R31.2]
  - Setup: one organization with a private planning repository and a public code repository with required checks and auto-merge allowed; an org Project; an approved spec folder in the planning repository with an epic and two dependent leaves in the code repository; Crew Mode runner on.
  - Action: no human action until both leaves are done. Then, on a third leaf, make the worker put the planning repository's name in the pull request body.
  - Expected: issues, sub-issues, and the dependency exist only in the planning repository; Avoozl creates the first leaf's linked branch `avoozl/<task-id>` before its brief, and the worker opens a pull request from it with no closing keyword; after merge with passing checks, GitHub closes the planning issue as completed with the pull request as closer, the Item closed workflow sets Status to Done, Avoozl closes nothing and writes no Status, and the second leaf is released in the same tick; neither public pull request, its commits, nor its branch names the planning repository, and the public repository shows no Project event or link into it to a logged-out viewer; the third leaf's leak opens a decision and does not complete until the text is fixed. Changed 2026-11-12.
  - Failure means: plans-repo mode leaks the private repository or cannot complete without a closing keyword.
  - Next decision: tighten the brief and leak screen, or require a private code repository for plans-repo mode.
  - Open: Not run; it needs a scratch organization.
- [ ] avoozl-p18 P18 Proof: plans-repo mode across two organizations [R28.10, R31.1]
  - Setup: planning repository and Project in organization A; code repository in organization B; the token can read B and push branches there; one more repository in B with an issue, for the cross-organization dependency check.
  - Action: run the P17 flow; then, in single-repo style, add a dependency from a B issue on an A issue and a sub-issue across A and B.
  - Expected: the P17 results hold across organizations, including GitHub closing the A planning issue through a linked branch in B (changed 2026-11-12); the pull request lookup in B works with read access; the cross-organization sub-issue is accepted (F38); the cross-organization dependency is accepted or refused, and the result is recorded in design F39.
  - Failure means: some part of the loop needs both repositories in one organization.
  - Next decision: if dependencies fail across organizations, refuse cross-organization edges in validation.
  - Open: Not run; it needs two scratch organizations.
- [x] avoozl-p19 P19 Proof: single-repo mode end to end [R28.9, R16, R31.1]
  - Setup: single-repo mode in a public repository with a spec folder in it; one leaf on the default branch, coded by Issue Radar with `Closes #N`; one leaf coded by a worker session on an Avoozl linked branch; a policy edit that sets a non-default `baseBranch`.
  - Action: let both pull requests merge with passing checks; validate the policy edit.
  - Expected: GitHub closes both issues and Avoozl's verdict agrees; both release dependents; Avoozl closes neither; validation refuses the non-default `baseBranch` with the file and field.
  - Failure means: single-repo completion depends on Avoozl closing the issue.
  - Next decision: allow non-default bases again with an Avoozl close, if a real repository needs one. Changed 2026-11-12.
  - Built: pass, receipt `docs/evidence/p19-single-repo.md`, `8626647`.

## Phase 5: Removal

- [x] 5.1 Delete the agent host, scheduler, providers, routing, approvals, run capabilities, external sessions, and telemetry; keep old tables read-only. [R1.1, R26.1] (§9)
  - Built: `c594e39` (receipt `docs/evidence/phase5-agent-host-targets-removal.md`, `6561d9f`).
- [x] 5.2 Delete OpenHands integration, Canvas app and backend, and their docs. [R1.3] (§9)
  - Built: `f31f057` (receipt `docs/evidence/phase5-openhands-vscode-removal.md`, `c7a1a81`).
- [x] 5.3 Replace the website with the app page; delete `server.mjs` host modes, `src/web`, `ui`, `ui-dist`, compat server, and unused page modules, keeping pure models. [R1.3] (§9)
  - Built: `4da8705` (receipt `docs/evidence/phase5-website-intake-queue-removal.md`, `1657244`).
- [x] 5.4 Delete the VS Code extension and Agent Host Protocol facade. [R1.3] (§9)
  - Built: `f31f057` (receipt `docs/evidence/phase5-openhands-vscode-removal.md`, `c7a1a81`).
- [x] 5.5 Delete the GitHub intake callback and the GitHub queue browser. [R26.1] (§9)
  - Built: `4da8705` (receipt `docs/evidence/phase5-website-intake-queue-removal.md`, `1657244`).
- [x] 5.6 Remove team coordination, execution targets, and the target listener from the public tree; delete safety and restart control after moving pause and resume into rule actions. (§9)
  - Built: `c594e39` (receipt `docs/evidence/phase5-agent-host-targets-removal.md`, `6561d9f`).
- [x] 5.7 Map run-era `plans_*` MCP tools to dispatch or to a pointer to the Kiro Crew session; keep every name. [R24.5] (§9)
  - Built: `c594e39` (receipt `docs/evidence/phase5-agent-host-targets-removal.md`, `6561d9f`).
- [x] 5.8 Search the whole project for `listen(`, `0.0.0.0`, `[::]`, and `--host`; every hit is the loopback app backend or removed. [R24] (§4.7)
  - Built: `3484fc5` (receipt `docs/evidence/phase5-listener-scan.md`, `9691367`).

## Phase 6: Move an existing workspace

These steps move an existing workspace (its SQLite database and plan files)
onto the new model. The first workspace moved was Nupp's; the counts in its
receipts are that workspace's.

- [x] 6.1 Freeze a copy of the workspace database and record the plans repository commit. [R23.8] (§10.2)
  - Built: receipt `docs/evidence/phase6-prep.md`.
- [x] 6.2 Assign kinds to the epics, their tasks, and the milestones without changing IDs or edge kinds. [R23.1, R23.6] (§10.2)
  - Built: receipt `docs/evidence/phase6-prep.md`.
- [x] 6.3 Record the finished tasks as the migration baseline with evidence. [R23.2]
  - Built: receipt `docs/evidence/phase6-prep.md`.
- [x] 6.4 Map document-derived checklist entries to tasks as acceptance or context; commit a mapping report with every unmatched entry. [R23.5] (§10.2)
  - Built: receipt `docs/evidence/phase6-prep.md`.
- [x] 6.5 Reconcile the partial tasks against evidence, branches, commits, and runs; create remaining leaves as `<task-id>.<slug>`. [R23.3] (§10.2)
  - Built: proposals for owner review at 6.8, receipt `docs/evidence/phase6-reconcile.md`.
- [x] 6.6 Decompose broad planned tasks into packages and bounded leaves. [R23.6]
  - Built: proposals for owner review at 6.8, receipt `docs/evidence/phase6-reconcile.md`.
- [x] 6.7 Drain the observing and interrupted runs in the old host and import their evidence. [R23.7]
  - Built: receipt `docs/evidence/phase6-reconcile.md`.
- [ ] 6.8 Prepare one cutover change in the planning repository with manifest, mapping report, reconciliation report, and finished-task baseline for owner approval [R23.7, R23.9, R33.6] (§10.1, §10.2)
  - Run the Set up GitHub wizard (3.18) in the chosen mode for the setup in §10.1 (issues on in the planning repository, Project with Status and Release, optional `Epic` type) and follow its workflow checklist; Auto-close issue stays on (F55) (changed 2026-11-12: was to turn it off); set each code repository's `baseBranch` to its default branch. Changed 2026-11-12.
  - Open: Not done; the cutover change is not prepared.
- [ ] 6.9 Project the cutover into the chosen GitHub mode [R23.4, R23.9, R23.10, R29, R33] (§10.2 step 8)
  - Epics as parent issues, unfinished tasks as sub-issues, blocking edges as issue dependencies, every issue on the Project with Release from the milestones; deferred tasks get Status Deferred once, as the owner's recorded order, and Avoozl writes no other Status; the SQLite database becomes a read-only archive. Changed 2026-11-12.
  - Open: Not done; nothing is projected into issues.
- [x] 6.10 Stale-plan cleanup [R23.13, R23.15] (§10.2 step 10)
  - List plan files in the planning repository that are stale or no longer current, each with one evidence line (every task done or migrated; superseded or no live reference); after owner approval of the list, delete them in one reviewed commit that changes nothing else.
  - Built: one owner-approved deletion commit in the planning repository.
- [x] 6.11 Move each current plan to `.kiro/specs/<name>/` with `requirements.md` (or `bugfix.md`), `design.md`, `tasks.md`, and `avoozl/manifest.json`, using existing task IDs as item tokens so markers and issue links stay
  - Stop using the migration read path for the workspace. [R23.14, R23.15, R30] (§10.2 step 11)
  - Built: one commit in the planning repository; every spec folder imported, 0 refused.

- [ ] avoozl-p14 P14 Proof: existing workspace graph migration [R23]
  - Setup: the frozen copy, the rebased code, and a scratch private planning repository and Project standing in for the real planning repository.
  - Action: run the migration end to end on the copy and project it into the scratch repository, then run the tick with Autopilot (delivery) off, twice.
  - Expected: every task and edge keeps its ID and kind across the baseline and the issues; finished tasks are in the baseline with no issues; one issue per epic and one sub-issue per unfinished task, with deferred tasks at Status Deferred, blocked tasks held by issue dependencies or a decision, review tasks pointing at their open pull request, and no other Status written by Avoozl (changed 2026-11-12); blocking edges as issue dependencies and `supports` edges in markers; each issue's Release matches its milestone; zero new tasks from document-derived entries; every unmatched entry listed; no leaf ready under an unreconciled partial task; the second tick writes nothing; the original database unchanged.
  - Failure means: identity, dedup, reconciliation, or projection loses or duplicates work.
  - Next decision: approve cutover into the planning repository and turn on Autopilot (delivery) for one epic at concurrency 1, or revise the mapping.
  - Open: Not run.
- [ ] avoozl-p22 P22 Proof: stale-plan cleanup [R23.13, R23.15]
  - Setup: the planning repository after cutover, with every task as an issue or in the baseline.
  - Action: run the stale-plan listing; review the list; approve it; let Avoozl make the deletion commit; run projection preview and the tick; revert the commit on a scratch branch.
  - Expected: each listed file has one reason naming its evidence, and no listed file holds an unfinished task without an issue or is linked from an open issue, manifest, current plan, or steering file; the commit deletes only the listed files; the preview and tick show no issue or marker change; the revert restores every file byte for byte.
  - Failure means: the evidence rules list a live plan, or deletion touches the mapping.
  - Next decision: tighten the rules, or keep cleanup manual.
  - Open: Not run; 6.10's deletion was reviewed by the owner instead.
- [ ] avoozl-p23 P23 Proof: move to the Kiro spec layout [R23.14, R23.15, R30]
  - Setup: the planning repository after P22.
  - Action: run the move; validate every spec; run projection preview; then apply and run the tick twice.
  - Expected: every current plan is a spec folder that passes validation; every task ID and issue link is unchanged; the preview shows no issue created, closed, re-parented, or re-linked, and only marker source pins change; the second tick writes nothing; nothing reads the workspace through the migration read path afterward.
  - Failure means: the move changes the issue-to-task mapping or old plans do not fit the layout.
  - Next decision: fix the mapping and repeat, or keep the unfit plans on the read path and list them.
  - Open: Not run; 6.11's move validated every folder with 0 refused.

## Phase 7: Open-source release

- [x] 7.1 Rewrite README and docs around installing the Kiro Crew app; no host-era instructions. [R24.1] (§13)
  - Built: `52d1ce9` (receipt `docs/evidence/phase7-release-prep.md`, `a356449`).
- [x] 7.2 Ship no default trigger rule; document example policies. [R24.3] (§13)
  - Built: `d962108` (receipt `docs/evidence/phase7-release-prep.md`, `a356449`).
- [x] 7.3 License audit of bundled third-party code with notices. [R24.4] (§13)
  - Built: `7dac03f` (receipt `docs/evidence/phase7-release-prep.md`, `a356449`).
- [x] 7.4 Secret, private-name, company-internal-tool-name, and absolute-path scans over the tree and history [R24.2, R34.10] (§13)
  - Keep specs and research with machine-local paths out of the release or rewrite them; regenerate receipts instead of editing them.
  - Built: `caa64e0` (receipt `docs/evidence/phase7-release-prep.md`, `a356449`).
- [x] 7.5 Verify compatibility surfaces: `plans_*`, `AVOOZL_*`, `AICOMMANDER_*`, `NUPP_WORKSPACE_*`, and the `aicommander` command. [R24.5]
  - Built: `9051f35` (receipt `docs/evidence/phase7-release-prep.md`, `a356449`).
- [ ] 7.6 Publish the npm package, the app package, and a signed GitHub release; dogfood the GitHub loop on Avoozl's own repository. (§13)
  - Open: Not done; nothing is published.

- [ ] avoozl-p15 P15 Proof: open-source installation on a clean machine [R24]
  - Setup: a fresh machine or user account with Kiro Crew, Node, and Git only; no `gh`.
  - Action: follow the public README to install the app, create a workspace, and run P4 and P5's flow; then install `gh` and run P7 on a public repository.
  - Expected: local delivery completes with no GitHub; GitHub features report unavailable until `gh` or a token exists, then work; no step needs private context.
  - Failure means: the release depends on this machine's setup.
  - Next decision: fix the docs or packaging before publishing.
  - Open: Approximate pass only (`dd8b28b`): a clean home on the owner's Mac, not a fresh machine.

## Phase 8: Later, only after P1–P25 pass

- [x] 8.1 Delivery plugin seam [R22] (§4.8, §12, §14)
  - Route schema with submit, status, completion, and cancel; Settings lists routes; local and GitHub remain the only built-in routes, and any other route comes from a plugin (8.6). Starts only when the R22.4 gate holds: P1–P25 pass and a second real route exists (a private code-review route counts; fakes do not).
  - Optional per-task `route` in the delivery manifest, overriding the workspace or repository route. [R22.5]
  - Dispatch calls `submit` for a non-local ready leaf and opens no session. [R22.6]
  - The tick reads `status` for each remote leaf not done; waiting on a person shows as "needs you" with the route's link. [R22.7]
  - A remote leaf is done only on the route's `completion`, never from a GitHub issue closer. [R22.8]
  - `completion` returns a result (pull request link, answer, or both), quoted as data in each released dependent's brief. [R22.9]
  - Verify with a test-only fake route in the test tree: a local -> fake -> local chain dispatches, waits, shows "needs you", completes, and the third leaf's brief carries the result. [R22.3, R22.4]
  - Built: `8bc3b04`.
- [x] 8.6 Plugin loading, after 8.1 [R22.10, R34.1–R34.9, R34.11] (§4.4, §4.7, §4.8)
  - `plugins` entries in `.avoozl.json` and in machine-local settings (`id`, one of `package` or `path`, `contract`, non-secret `config`); validation per §4.4; `avoozl-plugin.json` manifest (`id`, `version`, `contract`, `kinds`, capabilities, `entry`), reserved ids `local` and `github`; Settings **Add plugin**, approve, disable, remove; approval per id, version, and content hash, stored on this machine only, never by the tick or example installation; a warning before saving a `plugins` entry into a public repository's `.avoozl.json`; one Node child process per plugin over stdio, no port, a listening-socket check that stops a plugin that listens; reply schema validation, replies quoted as untrusted data; per-call time limit inside the tick budget; a missing, unapproved, crashed, timed-out, invalid, or wrong-contract plugin parks its tasks as "needs you" and the tick finishes everything else; supported contract versions listed and others refused. Move 8.1's fake route behind the loader.
  - Git sources: an entry with `git`, `ref`, and optional `subdir` (exactly one of `package`, `path`, or `git`); Add and Update resolve `ref` to a full commit, store the pin on this machine, and fetch only that commit shallow into `<plugins>/git/<id>/<commit>/` with the person's git, hooks off, no submodules, no install; approval binds to the commit, version, and hash, and a new commit needs a new approval; refuse credentialed URLs, a `subdir` that escapes, a missing manifest, and unshipped dependencies; the tick never fetches. Settings **Add from git** shows the resolved commit before approval. Tests use local `file://` repositories only. [R34.12–R34.15] (§4.8)
  - Built: `8662302` and `773b2f2`; git sources `be12bc0` and `91f3b6a`.
- [x] 8.7 Tracker plugin contract, after 8.6, and only when a real tracker plugin is being written (§14) [R19, R35] (§3.1, §3.2, §3.3, §4.8)
  - `authority: plugin:<id>` for tasks whose plugin declares `tracker`; `project`, `read`, `list`, `close`; the stored marker (namespace, task ID, last applied values) and refusal of a tracker that cannot store it; edges from the approved manifest cached in SQLite when the plugin lacks `edges`, the tracker's own links as managed fields when it has `edges`; 409 on direct edits of plugin rows, as 2.2 does for github rows; three-way conflicts on managed fields; Avoozl's completion verdict then `close(id, "completed")`; outside closes and pauses judged as orders with the plugin-reported actor, held with a decision when the actor is unknown; local -> `plugin:<id>` only through an approved projection, and "take back local" back; rebuild from `list`, `read`, and the manifest.
  - Built: `2699722`.
- [x] 8.8 Private integration boundary, with 8.6 [R34.10, R34.11, R24.2] (§4.8, §13)
  - A public guide to writing a route or tracker plugin that uses only the fake plugins as examples; the fake route and fake tracker live under `test/fixtures/plugins/`; extend the 7.4 scan to plugin docs and fixtures so no company-internal tool name lands in the public tree.
  - Built: `e13890b`.
- [x] avoozl-p26 P26 Proof: fake tracker and fake route plugins end to end [R22.5–R22.10, R34, R35] (§4.8)
  - Setup: an isolated temporary workspace; the fake tracker plugin (records kept in a JSON file in the temp folder, no `edges` capability, `actor` capability on, `allowedActors` of one name) and the fake route plugin from `test/fixtures/plugins/`, declared in machine-local settings; an approved spec with chain `a -> b -> c` and pair `x -> y`, all with `authority: plugin:fake-tracker`; `b` has `route: plugin:fake-route`, the rest are local.
  - Action: (1) tick before approving either plugin; (2) approve both and tick until `b` is submitted; (3) make the fake route crash on `status` and tick; then make it open a listening socket and tick; restore it; (4) close `x`'s record as an actor not in `allowedActors`; (5) tick until `c` is done; (6) edit `a`'s title in the fake tracker by hand, and try a direct title edit of `c` through operations; (7) change the fake tracker's version and tick, then re-approve; (8) delete the SQLite file, run `avoozl rebuild`, then `avoozl tick`.
  - Expected: (1) nothing loads and every task shows "needs you"; (2) the tracker holds five records with markers and no edges, `a` runs in a local worker, and `b` goes through `submit` with no worker session; (3) the crash and then the listener each mark the route plugin broken and park only `b`, while the tick finishes and `x` keeps advancing; no plugin child process is left listening; (4) `y` is held and a decision opens, and `x`'s record is not reopened; (5) `b` shows "needs you" with the fake link, then `completion`; `c`'s brief quotes `b`'s result as data; `a`, `b`, and `c` close as `completed` only after Avoozl's verdict; (6) the hand edit is a conflict and is left alone, and the direct edit is refused with 409; (7) the version change stops loading until re-approval and parks the tracker's tasks meanwhile; (8) rebuild matches every task, edge, status, verdict, and baseline from the fake tracker and the manifest; the public tree still passes the 7.4 scan.
  - Failure means: the seam cannot hold a non-GitHub tracker, or a plugin can stop the tick or run without consent.
  - Next decision: narrow the tracker contract to the jobs that passed, or keep trackers out and ship routes only.
  - Built: pass, receipt `docs/evidence/p26-fake-plugins.md`, `64bd862`.
- [x] 8.2 Deferred GitHub features, each behind its own proof: stacked pull requests on an open blocker, Discussions answering, comment-mention steering. [R27.13]
  - Built: `51622d0` (receipt `docs/evidence/phase8-deferred-github.md`, `13301d4`).
- [x] 8.3 Crew Mode dispatch if Kiro Crew provides MC-5; otherwise apply its kill criterion. (§7.1, §14)
  - Built: `6339f3b`, the kill criterion applied (receipt `docs/evidence/phase8-crew-mode-mc5.md`, `6339f3b`).
- [x] 8.4 Review every kill criterion in §14 and remove features that meet one. [R25.6]
  - Built: receipt `docs/evidence/phase8-kill-review.md`, `b712742`.
- [ ] 8.5 Add MCP App views (`ui://` resources) to `plans_graph`, `plans_preview`, `plans_project_preview`, and `plans_decision`
  - Buttons call the same operations with expected revisions. [R20] (§8.1) Optional: only for small focused views; the app page stays the main view. Proof below.
  - Open: Skipped by the owner; not run.
- [ ] avoozl-p8b P8b Proof: Avoozl views render and act inside chat [R20] (§8.1)
  - Setup: the Avoozl app installed with its MCP server; the server routed in MCP Management; the P4 draft plan.
  - Action: in an ordinary chat, ask to preview the plan; press Approve in the view; edit the plan in another window and press Approve again.
  - Expected: the preview renders in the chat; the first Approve records the exact revision; the second is refused as stale; the chat shows the result.
  - Failure means: app-shipped servers cannot render views, or view writes bypass revision checks.
  - Next decision: ask users to add the server in Connections, or keep approval in the app page only.
  - Open: Skipped by the owner; not run.

## Phase 9: Review gates

Starts when Phase 2's proofs pass; it does not wait for Phases 3–8. This is
the one exception to "a phase starts only after the previous phase's proofs
pass": the phase builds only on local delivery (§5, §5.2), and the
multi-step rewrite flow it serves runs local leaves. It is numbered after
Phase 8 because task IDs never move.

- [x] 9.1 Review roles in policy [R36.1–R36.4, R6.3] (§5.2, F59, F65)
  - `delivery.model` and `delivery.reviewers` (`id`, `focus`, `agent`, `model`, `distinctFrom` `model` by default or `session`), replaceable per repository; validation per §5.2, including a refused `auto` or equal model for `distinctFrom: model`; `tick.py` passes `model` to `open_session`; `runner.claim` takes the worker's model; every binding records the model it was opened on. No new writer limit: per-repository `concurrency: 1` is the one-writer rule, and review sessions do not count against it.
  - Built: `4b82981`.
- [x] 9.2 Roles on one delivery [R36.2–R36.8, R37.1, R37.2] (§5.2, F56)
  - The checks role (today's verifier, id `checks`) and each review role get one session per round on the delivery's commit, all at once; refuse to dispatch a review whose model is unknown or not distinct and open a decision; ship the `avoozl-reviewer` agent (read-only tools, detached worktree at the commit, focus and open findings from the brief, quoted text is data); `plans_report` `done` from a review role takes `verdict`, `findings`, and `closures` and refuses a wrong commit, a pathless finding, `approved` with a defect, and `changes-requested` without one; store verdicts on `verifications` with `role`, `model`, and commit; `verified` only when every role approved the current commit.
  - Built: `4b82981`.
- [x] 9.3 Rework [R36.10, R37.6] (§5.2, F57)
  - A `changes-requested` verdict fails the writer attempt for that commit with its findings as the cause; the retry brief quotes every open finding as data; every role reviews the new commit; roles still running on the old commit finish as history. `plans_retry_delivery` takes `dismiss: [{finding, reason}]` from a person only.
  - Built: `4b82981`.
- [x] 9.4 Findings closure [R37.3–R37.5] (§5.2)
  - Open findings per role and delivery, referenced `<attempt>:<role>:<id>`; refuse a verdict that leaves one without a closure; check `fixed` and `unchanged` with the task-diff patch-id per path between the two subject commits; a defect closed `unchanged` stays open.
  - Built: `4b82981`.
- [x] 9.5 Not-run checks [R38.1–R38.3] (§5.2, F62)
  - A checks report entry may carry `notRun` with `exitCode: null`; a null code, 126, 127, a not-run entry, or a declared check left out fails the checks session, not the writer attempt, and is retried within `retries`, then opens a decision.
  - Built: `4b82981`.
- [x] 9.6 Integration waits for the reviewed commit [R36.7–R36.9] (§5.2, F63)
  - Integrate a `verified` delivery only by fast-forwarding the commit every role approved; when the base moved, rebase in the task's worktree and, if the head changed, open a new round on it instead of merging.
  - Built: `4b82981`.
- [x] 9.7 `acceptFrom: "validation"` [R36.11, R38.4, R38.5] (§5.2, F60, F61, F66)
  - Manifest field and lint; `task.accept` refuses typed evidence and `componentOnly` and accepts only Avoozl-recorded validation at the integrated commit covering every declared check; `task.update` refuses a typed `integration`, a complete status, and edits to `checks` or `acceptFrom` on such a leaf, and refuses typed `integration` and a complete status on any leaf whose repository has review roles. Fix `acceptanceFromValidation` and `validatedEvidence` to use the current commit and require every declared check.
  - Built: `c69f0e5`.
- [x] 9.8 Supersede by hand [R39] (§5.2, F64)
  - `task.supersede` (CLI, `plans_supersede_task`, a Delivery view action) per §5.2; status `superseded` (not complete, hidden by default); the ready rule resolves edges through `supersededBy`; plan approval leaves the chain and status alone; refuse cycles and GitHub or plugin authority with 409; no new dispatch for a superseded task, and a running session is left alone.
  - Built: `c69f0e5`.
- [x] 9.9 Delivery view: per round, each role's verdict, model, subject commit, stale mark, and findings with closure state; links to each session. Graph-specific only; no pull-request or CI view (§8). [R36.12] (§5.2, §8)
  - Built: `87bdd70`.
- [x] 9.10 Optional, later, after 3.11 [R36.13, R33] (§5.2)
  - For GitHub-route leaves, read pull-request reviews on the head SHA as verdicts from reviewers the repository policy allows (`APPROVED`, `CHANGES_REQUESTED`), stale when the head moves, shown in the Delivery view. Not needed for P27.
  - Changed 2026-11-12 (owner decision): the approval count comes from the base branch's GitHub rules (rulesets' `pull_request` rule, classic protection's `required_pull_request_reviews`), the stricter when both exist; no rule means no pull-request review gate. Settings shows the rule read only, with a link to GitHub's settings page; the `pullRequestReviews` key is deprecated.
  - Built: `fe043ea`; branch rules `b4c46d7` and `7f24590`.

- [x] avoozl-p27 P27 Proof: review gates with fake writers and reviewers [R36, R37, R38, R39] (§5.2)
  - Setup: an isolated temporary workspace and sample repository in the test tree; delivery policy with `concurrency: 1`, writer model `fake-a`, and two review roles (`conventions` on `fake-b`, `correctness` on `fake-c`); a test-only fake session driver that plays worker, checks, and reviewer sessions from scripts; an approved spec with leaves `w1 -> d1` and an independent `w2 -> d2`, all in that repository, with `acceptFrom: "validation"` on `w1` and a declared check `scripts/validate.sh` standing in for that repository's validation script.
  - Action: (1) tick until `w1` reports commit C1; (2) `conventions` approves C1, `correctness` requests changes with defect F1 on `src/a.txt`; (3) the next attempt reports C2 that changes `src/a.txt`; both roles review C2, `correctness` first tries `approved` closing F1 `unchanged`, then closes it `fixed` and approves; the checks role first reports `scripts/validate.sh` as not run, then passes; (4) move the base branch by hand before integration; (5) try `task.update` with a typed `integration` on `d1`, and `task.accept` with typed evidence on `w1`; (6) set a reviewer's model to `fake-a`, and separately to `auto`; (7) supersede `w2` by `w2b`, then re-approve the unchanged plan.
  - Expected: (1) `w2` does not start while `w1`'s writer is live; three role sessions open on C1 with three different models; (2) `d1` stays waiting, the attempt fails, and the retry brief quotes F1; (3) the `unchanged` approval is refused in-session; the not-run check fails only the checks session and is retried, and no writer attempt is spent; (4) the rebase produces C3, nothing merges, and all three roles review C3, with F1 still closed; after they approve, C3 fast-forwards and `d1` dispatches; (5) both calls are refused, and `w1` is accepted only from validation recorded at its integrated commit; (6) policy validation refuses `fake-a`, and `auto` opens a decision instead of a review; (7) `d2` waits on `w2b`, not `w2`, `w2` stays `superseded` after re-approval, and its history is intact. Every earlier verdict stays on the delivery.
  - Failure means: reviews cannot be gates on one delivery without breaking retry, integration, or readiness.
  - Next decision: model reviews as separate graph tasks with integration-free acceptance (the handoff's first design), or drop rebase re-review and gate on the pre-rebase commit.
  - Built: pass, receipt `docs/evidence/phase9-p27-review-gates.md`, `a9f4c24`.

## Phase 10: Content rules

Starts when Phase 2's proofs pass, like Phase 9, and does not wait for
Phases 3–9. The matcher and the local boundaries (plan drafts, approval,
briefs, worker diffs) need only local delivery. A company needs the feature
before its first real use, not at the open-source release, and one phase
keeps the matcher in one place instead of spreading it over Phases 2, 3, 4,
and 8. Everything builds against fakes: a fake GitHub client, fake terms
files, and a fake rules plugin. 10.6 also waits for 3.7, 3.15, 4.3, 4.4, and
4.8, and 10.7 for 8.6; on `kirocrew-native` those modules already exist
(design F68–F73), so in practice they can start with the rest. It is
numbered after Phase 9 because task IDs never move.

- [x] 10.1 Matcher [R40.2, R40.4, R40.11, R40.13] (§4.9, F67, F68)
  - New `src/app/content-rules.mjs` with the terms parser moved from `scripts/release-scan.mjs` (`rule: regex`, `#` comments, per line, ignoring case), the decoder moved from `github-plans-repo.mjs`, and `check({boundary, repository, target, text, added})` returning `{set, rule, boundary, target, line}` and never the matched text; run each check in a `worker_threads` worker with a time limit (default 2 seconds) and treat a timeout or a rule that does not compile as unavailable; the release scan imports the parser and matcher, keeps its public rules and terms file location, and prints only rule id, file, and line for private-term findings.
  - Built: in the publish commit `ac3825f` (`src/app/content-rules.mjs`; `src/app/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.2 Policy [R40.1, R40.2, R40.10] (§4.4, §4.9, F74)
  - `contentRules.sets` in `.avoozl.json` (`id`, `action` `block` by default or `report`, optional `boundaries` from `plan`, `github`, `brief`, `diff`, optional `repositories`, optional `plugin`) with validation per §4.4 and §4.9; terms from machine-local `contentRules.terms.<id>`, else `.avoozl/local/content-rules/<id>.txt`; refuse a terms file Git tracks or would track (`git ls-files`, `git check-ignore`); an unavailable set fails closed at every boundary it covers and opens one decision naming the set and the reason, and the tick finishes the rest; Settings lists each set with its source kind and availability, never its rules.
  - Built: in the publish commit `ac3825f` (`src/app/content-rules.mjs`; `src/app/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.3 Built-in sets [R40.12] (§4.9, F68–F71)
  - Put `findPlanningLeak` (`builtin:planning-repository`), `screenReply` (`builtin:reply-safety`), and `secretReason` with `validateMarker`'s path and planning-repository checks (`builtin:published-secrets`) behind `check`, at today's boundaries with today's patterns, decoding, and refusal messages; configuration cannot turn them off; every existing test for these screens passes unchanged.
  - Built: in the publish commit `ac3825f` (`src/app/content-rules.mjs`; `src/app/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.4 Local boundaries [R40.3, R40.5] (§4.9)
  - `plan.create`, `plan.save`, and `plan.propose` refuse a planner draft in-call with set, rule, file, and line and record the refusal; `lintSpec` adds `content.match` diagnostics over every spec file and `avoozl/manifest.json` so approval is refused and a decision opens; worker, verifier, and reviewer briefs are checked before they are sent; `plans_report` `done` refuses a commit whose added lines match; `plans_prepare_worktree` installs a `pre-push` hook (`avoozl content check --push`) in that worktree only, not the main checkout's hooks (settle the Inferred note in §4.9); local integration holds a matching diff with a decision; lines already in the base never match.
  - Built: in the publish commit `ac3825f` (`src/app/content-rules.mjs`; `src/app/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.5 Decisions and allow once [R40.5–R40.8] (§4.9)
  - One decision per set and target; **Allow once** with a reason from the app page or CLI only (the MCP tools sessions call get 403; the tick and example installation cannot), recording who, why, when, rule, target, and the SHA-256 of the exact content, used up by one write; the decision view reads the matched line again from its source on demand and stores nothing; `report` sets write and record the finding in the Delivery view with one Kiro Crew notification; a test greps SQLite, events, decisions, and notification payloads for each fake term, plain and encoded, and finds none.
  - Built: in the publish commit `ac3825f` (`src/app/content-rules.mjs`; `src/app/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.6 GitHub boundaries, after 3.7, 3.15, 4.3, 4.4, and 4.8 [R40.3, R40.5] (§4.9, §6.3, §6.7)
  - Issue titles and whole bodies before each create or update in projection; Release and Iteration values before each Project field write; every comment Avoozl writes (breakdown previews, published summaries, steering replies) and responder replies; candidate pull request titles, bodies, commit messages, and added diff lines each tick, which block completion and open a decision as 4.8 does. A match writes nothing for that issue, item, or comment and the tick goes on.
  - Built: in the publish commit `ac3825f` (`src/app/content-rules.mjs`; `src/app/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.7 Rules plugins, after 8.6 [R40.9, R40.14, R34] (§4.8, §4.9, F73)
  - Plugin kind `rules` beside `route` and `tracker`; contract call `ruleSets()` returning `[{id, version, rules: [{id, pattern}]}]`, schema-checked; the usual consent, child process, and time limit; rules kept in memory only, never in SQLite, receipts, or Git, and findings record the set `version`; a fake rules plugin under `test/fixtures/plugins/`, covered by the 7.4 and 8.8 scans.
  - Built: in the publish commit `ac3825f` (`src/app/content-rules.mjs`; `src/app/test/content-rules.test.mjs`, `content-terms.test.mjs`).
- [x] 10.8 Allowed patterns [R40.15, R40.13] (§4.9 Allowed patterns)
  - `allow: regex` and `allow <rule>: regex` lines in terms files, parsed by `parseTerms` and `checkTermsText` with line-numbered errors that never repeat the line; the worker drops a match when an allow pattern matches the same line and returns only counts; built-in sets unchanged; `checkRuleSets` refuses a set with `allow`; the release scan applies a file's allow lines to that file's rules only; the Rule builder gets an Allow row with an optional rule picker, the File view reads allow lines, Try it strikes through allowed matches; How rules work and `docs/plugins.md` updated; tests for allow-all, allow-one-rule, a non-matching line still blocking, built-ins unaffected, no echo, the release scan, and builder and File view round trip.
  - Built: in the publish commit `ac3825f` (`src/app/content-rules.mjs`; `src/app/test/content-rules.test.mjs`, `content-terms.test.mjs`).

- [x] avoozl-p28 P28 Proof: content rules with fake terms and a fake rules plugin [R40] (§4.9)
  - Setup: an isolated temporary workspace in plans-repo mode with a sample code repository in the test tree and a fake GitHub client that records every write; terms file `.avoozl/local/content-rules/fake-terms.txt` with `codename: \bzorblat\b` and `host: \bbuild\d+\.corp\.example\b`; a second set `fake-paths` (action `report`, rule `share: \bfileshare/teams\b`) whose terms file sits outside the workspace and is named in machine-local settings; the fake rules plugin `fake-rules` from `test/fixtures/plugins/`, approved, supplying set `fake-plugin-set` with `project: \bproject-?x\b`; `.avoozl.json` naming all three; an approved spec with leaves `a -> b` and one milestone.
  - Action: (1) the planner saves a draft whose `design.md` says "zorblat"; (2) a person puts the same line in `tasks.md` and approves, allows once with a reason, approves again, then changes that line to another "zorblat" sentence and approves; (3) project with one issue title holding `zorbl&#97;t`; (4) rename the milestone to "Project X launch" and sync; (5) worker `a` adds a line naming `build7.corp.example`, reports `done`, then pushes; it removes the line and reports again; a base file already holding the hostname stays untouched; (6) leaf `b`'s pull request body names "zorblat"; (7) the responder posts a reply holding a GitHub-token-shaped string, then one naming the planning repository; (8) a brief quotes an issue line matching `fake-paths`; (9) delete `fake-terms.txt` and tick; restore it and `git add -f` it; make `fake-rules` crash; add a rule `(a+)+$` and check a 40-character run of `a` ending in `!`; (10) add a `terms` key to `.avoozl.json`; call allow once through the MCP tool a session uses; (11) grep SQLite, events, decisions, notification payloads, the fake GitHub writes, and Git history for each fake term, plain and encoded; run the release scan with `fake-terms.txt` as `$AVOOZL_RELEASE_TERMS` over a fixture that names "zorblat".
  - Expected: (1) the save is refused in-call naming `fake-terms`, `codename`, `design.md`, and the line, and no decision opens; (2) approval is refused with a `content.match` diagnostic and a decision; allow once records who, why, and the hash and the next approval passes; the changed line is blocked again; (3) that issue is not written and a decision opens, and the other issue is projected; (4) no Release write and a decision naming `fake-plugin-set`; (5) `done` is refused in-call, the hook stops the push, and the fixed commit is accepted and integrates; the base file never blocks; (6) `b` does not complete and a decision opens; (7) both refusals match today's messages and the existing screen tests pass unchanged; (8) the brief is sent, and the Delivery view shows one `fake-paths` finding with one notification; (9) the missing file blocks every boundary `fake-terms` covers with one decision while uncovered work goes on; the tracked file is refused; the crashed plugin makes only `fake-plugin-set` unavailable; the slow rule times out in about 2 seconds, its set fails closed, and the tick finishes; (10) validation refuses the `terms` key, and the MCP allow gets 403; (11) zero hits anywhere, and the release scan prints `codename` with file and line but not the line.
  - Failure means: content rules leak the terms they guard, let a match through, or stop the tick.
  - Next decision: narrow the boundaries to GitHub writes and diffs only, or move matching into a plugin child process instead of a worker thread.
  - Built: pass, `src/app/test/proof-p28.test.mjs`, in the publish commit `ac3825f`.

## Phase 11: Crew placement

Starts when Phase 2's proofs pass and 10.4 (brief checks) has landed, like
Phases 9 and 10, and does not wait for Phases 3–8. Everything except opening
real remote sessions builds and proves against fake crews: a test-only crew
driver that plays the instance list, headroom readings, and remote sessions.
Opening sessions on a real remote crew waits for Kiro Crew's MC-10 (design
§7.1), a required upstream ask (11.10); until then 11.5 ships behind the
inert path in §4.10, the Routing page says so, and the rest works on `local`
and in Preview. Changed 2026-11-12 (owner answers, design §4.10): remote
pushes on public and private repositories alike, router instructions
machine-local only, MC-10 required with attach to every chat, and
configurable chat and stale limits. It is numbered after Phase 10 because task
IDs never move.

- [ ] 11.1 Crew registry [R41.1, R41.3, R41.6] (§4.10, F77–F82)
  - New `src/app/crews.mjs` lists crews from Kiro Crew's `GET /api/instances` plus `local`; tags (`os`, `arch`, `tools`, `trust`), `gitHosts`, and `chatLimit` from machine-local settings only (`crews.<id>`), `chatLimit` per crew with 3 for `local` and 2 for a remote crew when unset; a crew without settings is `trust:remote` with no git hosts; readings for `local` from `os.freemem`, `os.loadavg`, and `fs.statfs`, for a remote from its headroom snapshot (F80), each with source and `measured_at`; stale after `crewStaleSeconds` (machine-local, 120 when unset); minimum memory and disk read from Kiro Crew's `remote_dispatch_memory_gb` and `_disk_gb`, never stored in Avoozl. First, call `session_create` with `crew` from the tick script cron and from the app backend against one connected crew and record the refusal codes in the receipt, settling F78.
  - Built (registry only): `src/app/crews.mjs` (`listCrews`, `localReading`, `recordCrewSnapshot`, machine-local `crews.<id>` and `crewStaleSeconds`), `3068954`. Not checked off: the live `session_create` call with `crew` waits on MC-10, so F78 stays Inferred, and the app backend is not granted `GET /api/instances` or headroom yet; only `local` shows on a real install.
- [x] 11.2 Routing rules [R41.2–R41.5, R41.8, R41.12, R22.5] (§4.10)
  - `routing.rules`, `routing.pick`, and `routing.router` in `.avoozl.json` (workspace and repository) and machine-local settings; validation per §4.4 and §4.10 (refuse a crew id or router instructions in a tracked file, an unknown tag key, a missing plugin route, a rule without `id`); `evaluatePlacement(task, role, crews, readings)` per §4.10 steps 1–4, returning the allowed set, the removed crews each with the rule or check that removed it, and the route; route precedence manifest task, first matching rule, repository, workspace; categories from front-matter only.
  - Built: `src/app/placement.mjs` (`validateRouting`, `validateTrackedRouting`, `evaluatePlacement`, `routingConfig`), `3068954`. Repository rules live under `projects.<id>.routing`. `kinds` match the manifest `type`. A rule's `route` shows in Preview and on the page; the tick still delivers by each task's own route. Plugin routes are checked when saved through the page or CLI.
- [x] 11.3 Scorer and presets [R41.6] (§4.10)
  - The §4.10 formula with `balanced` (default), `keep local`, and `spread out`, editable weights shown as Custom; per-tick slot reservation so one batch spreads; ties to `local`, then crew id; unavailable crews per §4.10; all allowed crews unavailable means the task waits with no decision.
  - Built: `scoreCrew`, `pickCrew`, presets and custom weights in `src/app/placement.mjs`; per-tick reservation in `src/app/routing.mjs` `placeOne`, `3068954`. With no rule only an owner-set local chat limit applies.
- [x] 11.4 Model router, off by default [R41.7] (§4.10)
  - The tool-less `avoozl-router` agent in `kirocrew-app/agents/`, one local session per tick batch on the owner's model, brief checked at the `brief` boundary, instructions from machine-local settings only (`routing.router.instructions`), never a tracked file; reply `[{session, crew, reason}]` schema-checked; a crew outside the allowed set ignored; timeout (default 90 seconds), malformed reply, or refused model falls back to the scorer and records why; the tick never waits on the router.
  - Built: `kirocrew-app/agents/avoozl-router.json`, `src/app/router.mjs` (one batch session, reply read by `observeRouterReplies`, fallback on time limit, malformed reply, or ended session), `f34fc7a`. P29 action 4.
- [x] 11.5 Dispatch and fetch-back [R41.5, R41.11, R41.13, R40.3] (§4.10, §4.9, F83)
  - `plans_tick` intents carry `crew`; `tick.py` opens on `local` as today and, only when MC-10 exists, on the chosen remote crew; fetchability check (repository remote host in the crew's `gitHosts`, base commit on that remote, earlier attempt branch for a retry); remote briefs carry clone URL, base commit, and task branch instead of a checkout path, pass content rules and the leak screen, and tell the worker to push its task branch before `done`, on public and private repositories alike (visibility plays no part; repository policy and content rules still apply); Avoozl fetches the branch, checks the reported commit, then verifies, reviews, and integrates as for a local worker; content-rule sets gain `remote` (`forbid` by default for sets covering `diff`, else `allow`; built-in sets `allow`).
  - Built: dispatch carries `crew` only when MC-10 is reported (`src/app/delivery.mjs` `planReadyDispatches`, `kirocrew-app/crons/tick.py`); fetchability in `src/app/routing.mjs` `fetchInfo`/`fetchableWhy`; remote briefs `remoteSteps`; fetch-back at `done` (`fetchBack`, `src/app/handback.mjs`); content-rule sets gain `remote`, `3068954`. Inert until MC-10: every session runs on `local`. Checks and review sessions always run here.
- [x] 11.6 Recording and recovery [R41.9, R41.10, R41.14, R8] (§4.10, F79, F81)
  - Bindings store `crew`, remote slot key, applied rules, readings or router reason, and time; the Delivery view shows the crew; an unreachable crew's sessions show "crew unreachable" and stay bound; no timer re-places them; the tick reconciles with the crew's session state when it answers again before new dispatch there; Retry and the bounded retry policy place afresh; no use of Kiro Crew's own `work_item` placement; the In flight card's Attach opens every Avoozl chat, local (`/chat?sid=<slot>`) or remote (through MC-10, from the binding's crew and slot key).
  - Built: bindings store `crew`, `placement` (rules, reading or router reason, time), `agent`, `sessionReason`; unreachable crews keep their bindings and do not hold the tick; Delivery shows the crew and "crew unreachable"; Attach links remote chats only from MC-10's link pattern (Inferred), `3068954`, `6a9cf83`.
- [x] 11.7 No-fit decisions [R41.8] (§4.10, §8.3)
  - One decision per task naming each crew and the rule or check that removed it, in yellow on the Routing page and in Conflicts; it closes by itself when a rule or crew change makes the task fit; never run the session elsewhere.
  - Built: `placement_decisions`, `openNoFit`/`closeNoFit` in `src/app/routing.mjs`, `no-fit` items in Conflicts, `3068954`.
- [x] 11.8 Routing page per §8.3 [R42, R20.4, R41.14] (§8.3)
  - Sections Crews, Rules, Smart pick, Model router, Preview, each with a heading and one short line and an empty-state line; rule rows "When <match> -> <route> on <crews>" with drag to reorder and a side form with Required and Optional markers and placeholders; checkbox pickers for labels, roles, routes, and tags; per-crew Chat limit (placeholder 3 for `local`, 2 remote) and one Stale after field (placeholder 120 s), both saved on this machine; the router instructions box marked as saved on this machine only; until MC-10 ships, one neutral line saying remote placement waits on Kiro Crew; red, confirmed delete and remove on the right; Preview read-only with route, crew, reason, and "why not"; Settings links here and stops listing delivery routes; every edit through the shared operations with expected revisions (CLI `avoozl routing …` and MCP `plans_routing_*`); yellow only for no fit and unavailable content-rule sets. Check the page by drawing it and looking at it.
  - Built: `kirocrew-app/ui/src/RoutingView.tsx`, `routing-api.ts`, operations `routing.view`, `routing.preview`, `routing.update`, `crews.update`, CLI `avoozl routing` and `avoozl crews set`, MCP `plans_view` actions `routing` and `routing_preview` (edits are person-only), `6a9cf83`. Drawn at three widths in light and dark.
- [x] 11.9 Fake crew driver and docs [R41.13, R24.2] (§4.10)
  - A test-only driver under `test/fixtures/crews/` playing the instance list, headroom snapshots, remote sessions, and an unreachable crew; public docs use only fake crew names and "a private git host"; extend the 7.4 scan to the crew fixtures.
  - Built: `src/app/test/fixtures/crews/` (driver, workspace, fake ssh), fake names and `.example.test` hosts only; the release scan covers the fixtures, `f34fc7a`, `13c365c`.
- [x] 11.13 Hand-back over SSH [R41.15] (§4.10 Hand-back over SSH)
  - Per-crew machine-local `delivery: handback | push` (default `handback`), `sshHost`, and `worktreeRoot`; the hand-back brief names the folder and forbids a push or GitHub write; at `done` fetch the task branch over SSH with Avoozl's own `known_hosts` (accept-new on first use, yes after), check the reported commit, fast-forward the local task branch, then the `diff` boundary, checks, review, and integration run here; a crew missing either setting is "work not fetchable"; tests use a fake ssh command and a local repository, never a real host.
  - Built: `src/app/handback.mjs`, crew `delivery`/`sshHost`/`worktreeRoot`, `src/app/test/handback.test.mjs` with a fake ssh command, `3068954`, `13c365c`. A pull-request leaf on a hand-back crew needs a local chat that pushes; that chat is not built.
- [ ] 11.10 MC-10 upstream ask [R41.14] (§4.10, §7.1, F77–F79)
  - File the standalone request with Kiro Crew (an owner grant letting the Avoozl app and its tick cron open, message, read, and close remote sessions it opened, with a binding that survives a hub restart, and attach to each from the In flight card); change no Kiro Crew code; when it ships, record its contract in §7.1, switch 11.5's remote path on, and run P29 case 13 against one real crew.
  - Open: filed as kirodotdev/KiroCrew#36335 (open); waits on Kiro Crew.

- [ ] avoozl-p29 P29 Proof: crew placement with fake crews [R41, R42] (§4.10, §8.3). Changed 2026-11-12 (owner answers): cases 10–14.
  - Setup: an isolated temporary workspace with a sample repository in the test tree and a bare git remote on host `git.example.test`; the fake crew driver with `local` (`os:macos`, `trust:local`, limit 2), `fake-linux` (`os:linux`, `trust:remote`, `gitHosts: ["git.example.test"]`, limit 2), and `fake-windows` (`os:windows`, `trust:remote`, same host, limit 1); a fake terms file set `fake-diff` covering `diff`; an approved spec with leaves `c1` (label `compliance`), `t1` (kind `test`, paths `src/win/**`), `w1`–`w4` (plain), and `u1` (kind `test`, label `needs-arm-linux`).
  - Action: (1) tick with no `routing` key; (2) add rules `compliance` (keepLocal, placed last), `windows-tests` (`on: any`, requireTags `os:windows`), `spread-work` (`on: any`), `arm-linux` (when label `needs-arm-linux`, requireTags `os:linux`, `arch:arm64`), and preview, then tick; (3) let `fake-windows`'s reading go 3 minutes stale, have `t1` report a failure, and tick; (4) turn on the router with a fake model that answers `fake-windows` for `w1`, then one that never answers, then one that answers malformed JSON; (5) commit a new base only locally and add `w5`; (6) put a crew id in the repository's `.avoozl.json`; (7) make `fake-linux` unreachable while `w2` runs for 31 minutes, then bring it back; press Retry on `w3` after a reported failure; (8) turn on `fake-diff` for the repository; (9) turn Kiro Crew's remote dispatch switch off in the driver; (10) set `fake-linux`'s chat limit to 1 and `crewStaleSeconds` to 60, then clear both; (11) put router instructions in the repository's `.avoozl.json`; (12) make the sample repository's remote report public and run a remote leaf on `fake-linux`; (13) press Attach in In flight on a local and on a remote session, and type into each; (14) run with the driver reporting no MC-10.
  - Expected: (1) every session opens on `local`, at most 2 at once, and nothing else changes; (2) Preview opens nothing and shows each task's route, crew, reason, and why-not; `c1` runs on `local` though its rule is last; `t1` runs on `fake-windows`; `w1`–`w4` spread across `local` and `fake-linux` by reservation, never past a chat limit, and the rest wait; `u1` waits with one yellow no-fit decision naming every crew and the rule that removed it; (3) `fake-windows` is unavailable and `t1`'s retry waits without a decision; (4) the router's `fake-windows` pick for `w1` is ignored when the rules do not allow it, and recorded with its reason when they do; the silent model falls back to the scorer after about 90 seconds and the malformed one at once, each recorded; (5) `w5` stays local with "work not fetchable"; (6) validation refuses the file; (7) `w2` keeps its binding and shows "crew unreachable"; nothing re-places it; when `fake-linux` returns the tick reconciles first; `w3`'s retry is placed afresh; a remote leaf's pushed branch is fetched, its commit checked, and it integrates like a local one; (8) no new session in that repository goes remote; (9) every new session runs on `local`; (10) `fake-linux` takes at most 1 session and a 70-second reading counts as stale, and after clearing both the limit is 2 and the stale limit 120 s again, each shown as a placeholder; (11) validation refuses the file and names the key; (12) placement is the same as for a private remote, the worker pushes its branch, and the `diff` boundary checks it at `done` and at integration; (13) each chat opens and takes the typed message; (14) every session runs on `local`, Preview still shows remote picks, and the Routing page shows the waits-on-Kiro-Crew line. The live check in 11.1 records whether a real tick may open a remote session.
  - Failure means: placement cannot keep hard rules exact while spreading work, or it re-places lost work on a timer.
  - Next decision: drop the scorer and router and keep only rule-chosen pins. MC-10 is required either way (owner, 2026-11-12).
  - Built: pass with fake crews, `src/app/test/proof-p29.test.mjs`, receipt `docs/evidence/phase11-p29-crew-placement.md`. Not checked off: action 13's typing into a remote chat and the live check wait on MC-10.
- [x] 11.11 Agent and model per session, after 11.2 and 11.3 [R53.1–R53.10, R53.12, R53.13] (§4.10)
  - `session` (`{agent, model}` or `choices` of 1–10 `{agent, model, weight}`) on routing rules and manifest tasks, validated per R53.8; `chooseSession(task, role, rules, policy, running)` with the R53.3 order and the R53.4 weighted pick reserved per tick; the router may rank choices with fallback; crews without the agent ruled out as "agent not installed"; `distinctFrom: model` skips colliding writer choices, else one decision; retries keep the last agent and model, **Pick again** clears it; `tick.py` passes `agent` and `model` to `open_session`; bindings gain `agent`, `model`, `modelUsed`, `sessionReason`; Issue Radar and plugin routes ignore `session`; no `session` anywhere means no change.
  - Built: `chooseSession` in `src/app/placement.mjs`, manifest `session`, `labels`, `paths`, and `type` carried onto tasks, Pick again (`delivery.pickAgain`), `3068954`, `f34fc7a`. The router ranking choices is built in `chooseSession` but the tick does not ask for it yet.
- [x] 11.12 Session fields on the Routing page, after 11.8 and 11.11 [R53.11] (§4.10, §8.3)
  - Rule rows read "... as <agent / model>" or "as <N> choices"; a **Session** group in the side form with Optional markers, default placeholders, and an add-choice row with weight; Preview shows each task's agent, model, and how they were chosen; the Delivery view and In flight card show agent and model and offer **Pick again**; a note on Issue Radar and plugin route rules that `session` does not apply. Check the page by drawing it and looking at it.
  - Built: rule rows "as <agent / model>" or "as N choices", a Session group with choices and weights, Preview agent, model, and reason, Pick again on the In flight card and the Delivery card, the does-not-apply note, `6a9cf83`. Settings > Delivery holds the writer's agent and model and Phase 15's `delivery.prFeedback` and `delivery.feedbackRounds`.

- [x] avoozl-p33 P33 Proof: agent and model per task with fake crews and fake agents [R53] (§4.10)
  - Setup: the P29 workspace and fake crew driver, with every chat limit set to 10, where `fake-linux` lacks agent `alt-worker`; a review role `correctness` on `model-r` with `distinctFrom: model`; leaves `h1` (label `hard`), `r1`–`r6` (plain), `m1` (manifest `session: {model: "model-m"}`), and `q1` (label `hard`, Issue Radar route).
  - Action: (1) tick with no `session`; (2) add rule `hard-parts` (`hard` -> `model-a`) and rule `routine` with choices `model-b` weight 2 and `model-c` weight 1, then preview and tick; (3) fail `r1` and let it retry, then press **Pick again** on `r2` after a failure; (4) change `routine` to choices `model-r` and `model-c`; (5) set `hard-parts` to agent `alt-worker` and release `h1` with only `fake-linux` allowed; (6) put weight 0 and 11 choices in `.avoozl.json`.
  - Expected: (1) every session opens as before with Kiro Crew's default agent and `auto`; (2) `h1` runs on `model-a`, `m1` on `model-m` though `routine` matches it, `r1`–`r6` split 4 to 2 between `model-b` and `model-c`, `q1` opens no session and its rule shows the does-not-apply note, and Preview shows each reason; (3) `r1`'s retry keeps its model and `r2` is picked afresh; (4) no writer runs on `model-r`; (5) `h1` waits with one no-fit decision naming "agent not installed"; (6) validation refuses the file and names each key. Every binding records agent, model, and reason.
  - Failure means: one rule set cannot pick crew and model together and stay deterministic.
  - Next decision: keep one model per repository and drop `choices`.
  - Built: pass, `src/app/test/proof-p33.test.mjs`, receipt `docs/evidence/phase11-p33-agent-model.md`.

## Phase 12: Flow

Starts when Phase 2's proofs pass, like Phases 9–11, and does not wait for
Phases 3–8, because timing, stop the line, batching, and retrospectives
work on local delivery. Tasks that read GitHub or push wait for the tasks
that built those paths, as each item says. Everything proves with fake
workers and scripted timings. Per-call tool timing for Crew Mode and remote
sessions waits on Kiro Crew's MC-13 (design §7.1); until then the phase
markers in 12.3 fill in. It is numbered after Phase 11 because task IDs
never move.

- [x] 12.1 Timing store and event spans [R43.1–R43.3, R43.6–R43.8] (§4.11, F96)
  - New `flow_spans` table (`task_id`, `attempt`, `batch_id`, `role`, `stage`, `started_at`, `ended_at`, `source`, `detail`) and `src/app/flow.mjs`; spans for `queued`, `review`, `rework`, `merge`, and `waiting` from readiness, bindings, reports, verdicts, retries, and integration; no setting; open spans close at the next ending event after a restart; `detail` passes the content rules; no prompts, output, tokens, or cost; old `usage_samples` and `provider_events` untouched.
  - Built: `156ae8e` (flow.mjs, `flow_spans`).
- [x] 12.2 Tool-call reader, after 12.1 [R43.4] (§4.11, F90–F94)
  - First read one live tick-opened worker slot with `GET /api/chat/slots/<slot>?cursor=1` and record in the receipt whether tool rows carry `meta.kind` and `meta.input`, settling F91 live; then read each live tick-opened worker once per tick beside the status read, keep only `kind`, the command's first words, and `ts`; a shell call running a declared check is `tests`, other shell calls `commands`, the rest `coding`; source `tool-calls`.
  - Built: `156ae8e` (reader; live slot read not done, row shape Inferred, see P30 receipt).
- [x] 12.3 Phase markers and check durations, after 12.1 [R43.5, R45.2] (§4.11)
  - `plans_report` `progress` takes optional `phase` (`coding`, `tests`, `commands`, `ci-wait`), stamped on receipt; the brief asks for markers only when Avoozl cannot read the session's tool calls (Crew Mode, remote, or no read); verifier entries and `done` check lists gain `durationMs`; unmarked worker time is `coding`; source `markers`.
  - Built: `156ae8e`.
- [x] 12.4 GitHub timing, after 12.1 and 3.11 [R43.3] (§4.11, F95)
  - `ci-wait` from the first check run requested to the last required check completed on each pushed head, and GitHub `review` spans from request to `submitted_at`, through the reads completion already makes (§6.5); no new poller; "CI only" failures recorded when CI fails on a commit with a local pass.
  - Built: `156ae8e` (ci-wait and CI only from the completion read; GitHub review spans not built).
- [x] 12.5 Metrics, after 12.1 [R43.7] (§4.11)
  - Lead time, flow efficiency, first-pass rate, time to fix, change failure rate, and integrations per day, per task and per window, computed on read; `flow.view` observe operation for the UI, CLI `avoozl flow`, and MCP `plans_flow`.
  - Built: `156ae8e` (`flow.view`, `avoozl flow`, `plans_flow`); charts over time `fc2db02`.
- [x] 12.6 Stop the line, after 12.1 and 9.5 [R44] (§4.11)
  - Trigger on a passed check failing on the landing branch after one rerun, and on a failed verification that also fails on the task's base; flaky record; culprit by range, bisect in a scratch worktree up to 8 runs, else unknown; pause by `flow.stopTheLine.scope` (default `dependents`); stopped check not judged on other commits; one fix task `<culprit-id>.fix-<n>` first in line, revert allowed; resume on green with time to fix and one notification.
  - Needs you only for the fix task's question, person-only block, or retry bound; **Run anyway** person-only, confirmed, recorded; agents and plugins get 403; the culprit stays accepted.
  - Built: `156ae8e` (flow-line.mjs); local landing branch only.
- [x] 12.7 Local checks first, after 12.3, 4.7, and 10.4 [R45] (§4.11)
  - `flow.localChecksFirst` (default `true`); briefs for pushing sessions say to run the declared checks before each push; `done` for a pushed commit refused without a passing check list for that commit; the 10.4 pre-push hook also refuses a push with no recorded local pass and does not rerun checks; local delivery unchanged.
  - Built: `156ae8e` (flow-checks.mjs, `plans_run_checks`, `avoozl checks run`).
- [x] 12.8 Batching, after 12.1, 9.2, and 9.6 [R46] (§4.11)
  - Manifest `size: "small"`; group ready local-authority leaves by `flow.batch.by` (`epic` default, or `files`) up to `flow.batch.max` (default 3, 1 is off), same repository, route, crew, and review roles, no edges; one session and worktree, one commit and `done` per task, checks and review once on the batch head, one rebase; on failure split and retry alone with no attempt cost; Graph and Delivery show the batch.
  - Built: `736fbd6` (flow-batch.mjs); split worktree retired `2f2de0c`.
- [x] 12.9 Retrospectives, after 12.5 and 10.4 [R47.1–R47.6, R47.8, R47.9] (§4.11)
  - Tool-less `avoozl-retro` agent in `kirocrew-app/agents/`; triggers with the defaults in §4.11, one at a time per workspace, folded triggers, one-hour spike gap; brief through the `brief` content-rule boundary; reply schema-checked, at most 3 typed proposals, refused safety keys, "removes a check" marked; Approve writes settings through the validated operation or opens a planner draft; Reject records why; 10-minute timeout.
  - Built: `736fbd6` (flow-retro.mjs, `avoozl-retro` agent).
- [x] 12.10 PDCA check, after 12.9 [R47.7] (§4.11)
  - On Approve record the proposal's metric over the last `everyTasks` finished tasks; after that many more record it again and mark helped, no change, or worse (10% threshold in the expected direction); a change that did not help puts a typed revert proposal in the next retrospective.
  - Built: `736fbd6`.
- [x] 12.11 Flow tab, Timing fold, and Line stopped banner per §8.4, after 12.5, 12.6, and 12.9 [R48.1–R48.5] (§8.4)
  - Top-level Flow tab with the `Gauge` icon (or `Timer` if the host lacks it) on heading and nav; metric cards with the previous window; stacked bars marked coarse when not from tool calls; bottleneck callout; retros with Approve, Reject, PDCA, and Run a retro now; shared filter panel; drawer Timing fold after Delivery; red Dashboard banner with Open fix task and confirmed Run anyway. Check the page by drawing it and looking at it.
  - Built: `07a7d4c`; charts, tokens and credits `fc2db02`; checked from screenshots, light and dark, wide to 320 px.
- [x] 12.12 Settings Flow group and validation, after 12.6, 12.7, 12.8, and 12.9 [R48.6–R48.8, R47.8] (§4.11, §8.4)
  - `flow` in `.avoozl.json` per workspace and per repository (`projects.<id>.flow`); validation of every key and value; `flow.retro.instructions` machine-local only and refused in tracked files; Settings sub-groups Timing, Stop the line, Local checks first, Batching, Retro, each with a heading and one line, raw keys small, "(optional)" markers, defaults as placeholders; edits through the shared operations with expected revisions.
  - Built: `07a7d4c`; model dropdown and built-in prompt part `fc2db02`.
- [ ] 12.13 MC-13 upstream ask [R43.4, R43.5] (§4.11, §7.1, F90–F94)
  - File the standalone request with Kiro Crew for an app-scoped tool-call read with end time and exit code, covering sessions bound to the app's tasks, local and remote; change no Kiro Crew code; when it ships, record its contract in §7.1 and switch 12.2 to it, keeping markers for older hosts.
  - Drafted, not filed: the request is ready for the owner to file (2026-11-13). Usage needs no ask: `GET /api/usage/turns` already serves an app its own sessions' tokens and credits (Verified from source).
  - Open: filed as kirodotdev/KiroCrew#36743 (open); waits on Kiro Crew.

- [x] avoozl-p30 P30 Proof: flow with fake workers and scripted timings [R43–R48] (§4.11, §8.4)
  - Setup: an isolated temporary workspace with a sample repository in the test tree, integration branch `main`, one declared check `node test/check.mjs`, an approved spec with epic `e1` holding leaves `a1`, `a2`, `a3`, `a4` (all `size: "small"`), and `b1`, `c1`, `c2` (independent), and `d1` (requires `a1`); fake workers that follow a script of tool rows, phase markers, reports, and sleeps on a fake clock; a fake GitHub check-run feed for one plans-repo leaf `g1`; the fake retro model.
  - Action: (1) run `c1` as a tick-opened worker whose script has 2 edits, `npm install`, and the check, then `done`; (2) run `b1` as a Crew Mode worker that sends phase markers only; (3) let the batcher see `a1`–`a4` ready with `flow.batch.max` 3; (4) script `a2`'s commit to make the check fail on the batch head; (5) integrate `a1`'s retried commit, which breaks the check on `main`, with `c2` running and `d1` ready; (6) script a one-time failure of the check on a later commit; (7) let the fix task revert the break; (8) open a second stop and press Run anyway as the owner, then call Run anyway from an agent session; (9) push `g1` once without a local pass and once with one, and have CI fail on the passing commit; (10) finish 10 tasks so a retro starts, and have the fake model propose `flow.batch.max` 3 → 5 and a forbidden content-rules change; approve the first; (11) finish 10 more tasks with lead time unchanged; (12) restart the backend with a span open; (13) put `flow.retro.instructions` in the repository's `.avoozl.json`.
  - Expected: (1) `c1` shows `coding`, `commands`, and `tests` spans from tool calls, the check counted as `tests`, and no output stored; (2) `b1`'s spans come from markers and show as coarse; (3) one batch of 3 by epic, one session, one commit and one `done` per task, checks once on the head; `a4` waits; (4) the batch splits, each task retries alone, no attempt counts; (5) the culprit is `a1`, the line stops, `d1` is not dispatched, `c2` keeps running, `c2`'s result for that check after its rebase is not judged and costs no attempt, a fix task is first in line, and the red banner names the check, `main`, `a1`, the fix task, and the paused count; Needs you stays empty; (6) a flaky record and no stop; (7) green on `main` resumes `d1`, records time to fix, and notifies once; `a1` stays accepted; (8) dispatch resumes with the stop still shown and who pressed it; the agent call gets 403; (9) the push without a pass is refused by the hook and the `done` is refused; the CI failure is recorded as "CI only" with a `ci-wait` span from the feed; (10) the retro names the biggest bottleneck with numbers; the content-rules proposal is dropped with a reason; Approve writes `flow.batch.max` 5 with an expected revision and nothing else changes; (11) PDCA marks "did not help" and the next retro carries a revert proposal; (12) the open span closes at its next ending event, not at the restart; (13) validation refuses the file and names the key. The Flow tab and drawer show each of these, and lead time, flow efficiency, first-pass rate, and time to fix match values computed by hand from the script.
  - Failure means: timing cannot be trusted to show where time went, or stop the line and batching cost writers attempts or lose work.
  - Next decision: keep timing and stop the line and drop batching and retrospectives, or move retrospectives to a by-hand button only.
  - Built: `2f2de0c` (`src/app/test/proof-p30.test.mjs`, receipt `docs/evidence/proof-p30.md`).

## Phase 13: Untriaged

Starts when Phase 2's proofs pass, like Phases 9–12, and after 3.13 (the
Settings view) and 3.14 (GitHub modes), which it extends. It reads GitHub
only from the tick cron and writes nothing there. Exact hand-off links wait
on Kiro Crew's MC-14 (design §7.1); until then each button opens the app's
page and says so. It is numbered after Phase 12 because task IDs never move.

- [x] 13.1 Untriaged settings and filter, after 3.13 and 3.14 [R49.3–R49.5] (§8.5, §4.4)
  - `untriaged` per repository in `github.repositories` (`filter`, `triageLabels`, `ignoreOlderThanDays`, `notify`), validated in `github-policy.mjs`; the filter parsed by `parseMatch` without the `label:` requirement; blank means `-label:<triage labels>`; triage labels refused when managed; Settings group with the filter's chips and count, checkboxes from the repository's labels (read only) with missing names kept and marked, and plain "(optional)" markers.
  - Built: `c551205` (policy, filter); Settings group `58ac891`.
- [x] 13.2 Cached read in the tick, after 13.1 [R49.1, R49.6] (§8.5, F12)
  - One GraphQL search per repository at most every 10 minutes from the cron's tick, up to 3 pages of 100; `untriaged.json` beside the database with `checkedAt`, the query, and any error; a failed read keeps the last items; a changed query reads on the next tick; nothing in Local only mode; no GitHub writes.
  - Built: `c551205`; a changed age alone reads again `f60cd3f` (found by P31).
- [x] 13.3 `untriaged.view` and hand-off links, after 13.2 [R49.2, R49.7, R49.8, R49.15] (§8.5, F98–F100)
  - Observe operation that applies the exclusions at read time (triage and managed labels, rule matches without the actor check, task issues, recorded pull requests, pull requests that close a task's issue); `refresh: true` reads first; per-item GitHub, Issue Radar, and Code review links with the fallback and its tooltip; the bulk selection link.
  - Built: `c551205`.
- [x] 13.4 Untriaged tab and Dashboard count, after 13.3 and 2.13 [R49.9–R49.13] (§8.5)
  - Top-level tab with the `Inbox` icon and an accent count badge; shared filter panel (repository, kind, age, author, label); 100-row pages; rows with kind icon, number and title, repository, author, age, labels, comments, draft and checks; icon buttons with the shared tooltip; keyboard multi-select and the bulk button; checked time and Check now; the empty state; hidden in Local only; the Dashboard count. Check the page by drawing it at three widths in light and dark and looking at it.
  - Built: `58ac891`, page `43f2744`.
- [x] 13.5 Untriaged notice, after 13.2 [R49.14] (§8.5)
  - New `untriaged` notification channel; one notice per workspace when a notifying repository's count rose since the last notice and an hour has passed; counts per repository, never one per item.
  - Built: `c551205`.
- [x] 13.6 MC-14 upstream ask [R49.8] (§8.5, §7.1, F98, F99)
  - File the standalone request with Kiro Crew for page links into Issue Radar (repository, filter, selected numbers, one item) and Code Review Sage (one pull request's review); change no Kiro Crew code; when it ships, record the contract in §7.1 and switch 13.3's links to it.
  - Built: filed as kirodotdev/KiroCrew#36431; the links stay on the fallback until it ships.
- [x] 13.7 Send to Issue Radar, after 13.3 and 13.4 [R52.1–R52.6, R52.10, R52.11] (§8.5)
  - `untriaged.crews` (observe) reads a repository's crews through the gateway client and degrades to a typed label with the reason; `untriaged.handoff` (owner session only) refuses bad labels, checks Who counts for the `gh` login, passes content rules, adds the label per issue, and stores `radar-handoff` receipts; `untriaged.view` gains `withRadar`; the crew picker and confirm dialogs with the empty-scope warning; the With Issue Radar list; needs-human rows under Needs you; help text and docs; the draft upstream ask for a read-only crew list. Check the page by drawing it at three widths in light and dark and looking at it.
  - Built: in the publish commit `ac3825f`: `untriaged.crews`, `untriaged.handoff`, `radar-handoff` receipts, `withRadar`, `SendToRadar.tsx`; tests `src/app/test/radar-handoff.test.mjs`.
- [x] 13.8 Crew composition rules, after 3.15 and 13.7 [R52.7–R52.9] (§6.4, §6.5)
  - A claimed issue's close without a merged closing pull request holds and opens a decision, never an order; crew label events never trigger a rule, and a rule naming one as a positive label is refused; a test that the ready label leaves a leaf blocked again by a reopened blocker.
  - Built: in the publish commit `ac3825f`: a claimed issue's close holds (`src/app/test/github-close.test.mjs`), crew label events never trigger and a rule naming one is refused (`radar-handoff.test.mjs`), a reopened blocker removes the ready label (`single-repo-delivery.test.mjs`).
- [ ] 13.9 Read-only crew list upstream ask [R52.2] (§8.5, §7.1)
  - File the standalone request with Kiro Crew for an app-reachable, read-only crew list (names, state, scope labels, needs-human label) that does not also grant crew writes; change no Kiro Crew code; when it ships, switch 13.7's reader to it.
  - Open: not filed yet; filing upstream is the owner's.

- [x] avoozl-p31 P31 Proof: the Untriaged list with a fake GitHub, then a live read-only count [R49] (§8.5)
  - Setup: an isolated temporary workspace in single-repo mode with repository `o/app`, one `deliver` rule `label:go`, managed labels `avoozl:managed` and `avoozl:ready`, triage label `triaged`, and a fake GitHub with open items: issue 1 (no labels), issue 2 (`go`), issue 3 (`triaged`), issue 4 (`avoozl:managed`, a task's issue), issue 5 (100 days old), pull request 6 (draft, checks failing), pull request 7 (closes issue 4), pull request 8 (recorded on a task).
  - Action: (1) tick twice within 10 minutes; (2) open the tab; (3) set `ignoreOlderThanDays` 30 and tick; (4) make the fake GitHub fail and tick after 10 minutes; (5) turn on `notify`, add issue 9, and tick twice an hour apart; (6) select 1 and 6 and read the bulk link; (7) switch the workspace to Local only; (8) with the owner's `gh` login, run `untriaged.view` with `refresh: true` on the owner's real repositories.
  - Expected: (1) one search; (2) items 1, 5, and 6 only, 6 showing draft and failing checks, with GitHub, Issue Radar, and Code review links and the fallback tooltips; (3) item 5 leaves; (4) items stay and the error shows with the checked time; (5) one notice naming the count, no second within the hour; (6) the bulk link opens Issue Radar and its tooltip names #1 and #6; (7) the tab and Dashboard count are hidden and nothing is read; (8) counts per repository, and no GitHub write.
  - Failure means: the list misses an item no rule covers, or shows one Avoozl already handles.
  - Next decision: drop pull requests from the list, or replace the search with the tick's own label listing.
  - Built: pass, receipt `docs/evidence/proof-p31.md`, `46ef5f0`; repair `f60cd3f`.

## Phase 14: Incoming items

Starts when Phase 2's proofs pass, like Phases 9–13, and each task also
waits for the task it extends: 8.7 (tracker contract), 10.6 (content
boundaries), 3.13 (Settings), and 13.3 and 13.4 (Untriaged). Avoozl writes
nothing to a non-GitHub source in this phase. Starting a code review waits
on Kiro Crew's MC-15 (design §7.1). Public code, docs, and fixtures name
sources only generically. It is numbered after Phase 13 because task IDs
never move.

- [x] 14.1 Incoming-item record and storage [R50.1–R50.3] (§4.12, F112)
  - `incoming_items` and `intake_sources` store tables; the record shape with the trust-boundary checks of R50.2 (bad items refused alone, with the field named); dedup on source plus ID by content hash; stale `updatedAt` ignored and reported; a quiet pass writes nothing.
  - Built: `3040bef`: `incoming_items` and `intake_sources` tables (`src/app/store.mjs`), the record and checks (`incomingItem` gains `trigger`, `src/app/plugin-contract.mjs`; first part in 16.4), dedup, stale and quiet writes in `takeItem` (`src/app/intake.mjs`).
- [x] 14.2 Source settings, after 3.13 [R50.6, R50.11, R50.20] (§4.12, §4.4)
  - `intake.sources` in `.avoozl.json` and in machine-local settings, validated like `plugins` entries: reserved `github` and `local`, `via` naming a `plugins` entry with `poll` or `mcp`, a registered `repository`, `labelFields`, `assigneeField`, `allowedActors`, `minimumPermission` (default `write`); one Settings group with the public-repository warning and plain "(optional)" markers; a `respond` rule with a non-GitHub `source:` refused.
  - Built: `3040bef`, `dbcf1b9`: `validateSource`, `declaredSources`, `editSource` (`src/app/intake.mjs`); `intake` in the tick's policy check and the schema; Settings › Plugins › Intake sources (`IntakeSources.tsx`) with the shared-repo confirm; respond with `source:` refused (`github-policy.mjs`).
- [x] 14.3 `intake.submit`, `intake.list`, `intake.view`, after 14.1 and 14.2 [R50.5, R50.8] (§4.12)
  - Operations in `operations.mjs`; CLI `avoozl intake submit|list|view`; MCP `plans_intake_submit`, `plans_intake_list`, `plans_intake_view` with no existing `plans_*` name changed; submit only to an `mcp` source, 1–100 items, per-item results; run under the workspace tick lock.
  - Built: `3040bef`: `intake.submit`, `intake.list`, `intake.view` (and `intake.sources`) in `operations.mjs`, under the tick lock; CLI `avoozl intake`; MCP as `plans_intake` actions `submit_items`, `items`, `item`, `sources` (R56 grouping, not new names).
- [x] 14.4 Pipeline, after 14.3 and 10.6 [R50.9–R50.11, R50.19] (§4.12, §4.9, F107, F109, F110)
  - The `intake` content boundary (block quarantines with a decision that never names the text; report records), off unless a set names it; `source:` in `parseMatch` (one per rule; absent means GitHub; refused in an Untriaged filter); `labelFields` and `assigneeField` mapping; actions by today's precedence; `deliver`/`execute` make a pinned local leaf in the source's repository and `plan` an inbox task through `task.capture`; `review` items skipped by deliver, execute, plan, and respond rules.
  - Built: `3040bef`: the opt-in `intake` boundary (`content-rules.mjs`); `source:` in `parseMatch` and `sourceRules` in the normalized policy so GitHub code never sees them; `matchView` for `labelFields` and `assigneeField`; leaves and inbox tasks from `takeItem`; reviews skip starting rules.
- [x] 14.5 Who counts per source, after 14.4 [R50.12–R50.14] (§4.12, F106–F108)
  - GitHub unchanged; a plugin source's `trigger.actor` and `trigger.permission` checked by `actorAllowed` against the source's settings; no `actor` capability means no allowed actor; an MCP caller's items meet only `pause` and `quarantine` rules, and its claimed author and trigger are stored as claims.
  - Built: `3040bef`: `judgeItem` (`src/app/intake.mjs`): plugin `trigger` through `actorAllowed` against the source's settings, no `actor` capability means nobody, MCP items meet only pause and quarantine and keep author and trigger as `claims`.
- [x] 14.6 Plugin `poll`, after 8.7 and 14.4 [R50.7] (§4.8, §4.12, F104, F105)
  - New tracker capability `poll` and reply check (`items`, `cursor` of at most 2,000 characters, `more`, at most 500 items); the tick opens every plugin a declared source names; one poll per source per tick; the cursor stored after every item is handled; a failed or invalid poll keeps the cursor and items and shows the error; a poll-only plugin is never asked to project, read, list, or close; the fake tracker plugin gains `poll`.
  - Part built in 16.4: the `poll` capability and its reply check. This task still owns calling it from the tick and storing the cursor and items.
  - Built: `3040bef`: `pollSources` and the tick's `pollStep` (`src/app/tick.mjs`): one poll per source, cursor stored after the page, a failed poll keeps cursor and items and shows the error; the fake tracker gains `poll` (changed-since cursor). The `poll` contract itself is from 16.4 (`837497b`).
- [x] 14.7 GitHub intake on the record, after 14.4 [R50.4] (§4.12, F101)
  - `syncGitHubIssues` writes each listed issue as a `github` item and points its `github_issues` row at it; listing by label, events, permissions, snapshot freeze, and results unchanged; the existing GitHub intake tests pass unchanged.
  - Built: `3040bef`: `mirrorGitHubIssue`; each `github_issues` row points at its item through `item`; GitHub intake tests pass unchanged.
- [x] 14.8 Untriaged read on the record, after 14.1 and 13.3 [R50.4] (§4.12, §8.5, F102)
  - The search results become `github` items and each repository's read state an `intake_sources` row (query, checked time, error, truncated, the keys the last search returned); `untriaged.json` no longer written, and the first tick after upgrade reads once; `untriaged.view` returns the same items and repository rows as before for GitHub, plus `source` on each.
  - Built: `3040bef`: `readCache` and `writeCache` (`src/app/untriaged.mjs`) read and write `github` items and `github:<repo>` source rows; `untriaged.json` is not written and an upgraded workspace reads once; `untriaged.view` is unchanged for GitHub (P31 passes as is).
- [x] 14.9 Updates and closes, after 14.5 [R50.17, R50.18, R50.21] (§4.12, §6.5)
  - Title and labels follow to the tied task and rules run again, with withdrawal when no allowed match is left; a body change after the snapshot quarantines; closes follow the allowed-close rule (order, brief note, never verified; otherwise hold and a decision; never reopen); a reopen withdraws the order and leaves running sessions alone; untied closed items deleted after 30 days.
  - Built: `3040bef`: title, labels and rules follow to the tied task with withdrawal; body change after the snapshot quarantines; `judgeClose` with `intakeVerdict` (order) or `intakeHold` (decision), reopen lifts both; `purgeClosed` after 30 days. `completionReached` and `blockerNotes` read `intakeVerdict`.
- [x] 14.10 Untriaged for every source, after 14.8, 14.5, and 13.4 [R50.15, R50.16, R50.19] (§8.5)
  - Source filter and source on each row; non-GitHub rows link to the item, show no Issue Radar button, show **Code review** for reviews, and offer person-only **Plan this** and **Deliver this** (403 from a session caller or MCP, with a confirm dialog naming the item); the tab in Local only mode when a non-GitHub source is declared; **Check now** polls a plugin source once. Check the page by drawing it at three widths in light and dark and looking at it.
  - Built: `3040bef`, `dbcf1b9`, `2c932c0`: `intakeTab` adds every source's items with `source`; the Intake tab (renamed, R50.23) has a Source column and filter, item links, no Issue Radar on other sources, Code review for reviews, Plan this and Deliver this behind a confirm (403 for sessions and MCP), shows in Local only with a source, and Check now polls. Drawn at 1440, 1000 and 600 in light and dark with a harness and looked at.
- [ ] 14.11 MC-15 upstream ask [R50.19] (§4.12, §7.1, F99)
  - File the standalone request with Kiro Crew for an app call that starts a Code Review Sage review of one item and returns its run ID; change no Kiro Crew code; when it ships, record the contract in §7.1 and add the `review` rule action.
  - Open: not filed yet; filing upstream is the owner's.
- [x] 14.12 Docs and leak scan, after 14.3 and 14.6 [R50.22] (§4.8, §13)
  - The plugin guide gains `poll` with the fake plugin as its example; a short guide to `plans_intake_submit` from a Kiro Crew cron job using a fake source; sources named only generically; the 7.4 scan covers the new docs and fixtures.
  - Built: `3040bef`: Intake part and source settings in `docs/plugins.md` with the fake tracker; `docs/policies.md` "Bring in work from other trackers and scripts" (MCP submit from a cron job); `avoozl-rules` skill lists `intake`; the release scan passes over docs and fixtures.

- [x] avoozl-p32 P32 Proof: incoming items from a fake plugin source and a fake MCP caller [R50] (§4.12, §8.5)
  - Setup: an isolated temporary workspace in single-repo mode with repository `o/app`, managed labels `avoozl:managed` and `avoozl:ready`, and rules `deliver` `label:go source:tickets`, `pause` `label:hold source:script`, `deliver` `label:go source:script`, and `deliver` `label:go` (GitHub); a fake GitHub with issue 1 (`go`, labeled by an allowed actor) and issue 2 (no labels); the fake tracker plugin from `test/fixtures/plugins/` with `poll` and `actor`, declared as source `tickets` (`labelFields: ["component"]`, `minimumPermission: write`), with items `T1` (`go`, trigger actor `bob`, permission `write`), `T2` (`go`, trigger actor `eve`, permission `read`), `T3` (no labels), `T5` and `T6` (`go`, trigger `bob`, `write`, each with a local task `d5` or `d6` that requires its leaf), and `R1` (kind `review`, `go`, trigger `bob`, `write`); source `script` with `via: mcp`; a content rule set naming the `intake` boundary with one fake term in `T4`'s body; the same GitHub fixtures and expected results as P31.
  - Action: (1) tick; (2) tick again with no change; (3) make `poll` fail and tick, then restore it and tick; (4) through MCP, `plans_intake_submit` to `script` items `S1` (`go`, author `alice`, trigger actor `alice`, permission `admin`), `S2` (`hold`), and one item with a `javascript:` link, then submit `S1` again unchanged, then once with an older `updatedAt`; (5) submit to `tickets` and to `github` through MCP; (6) add `T4` to the fake source and tick; (7) open the Untriaged tab; press **Deliver this** on `S1` from the page, then call the same operation from MCP; (8) change `T1`'s body and tick; (9) before either leaf finishes, close `T5` as `bob`, close `T6` as `eve`, then reopen `T6`; (10) wait past 30 days on the fake clock for a closed untied item; (11) run the P31 actions against the GitHub fixtures.
  - Expected: (1) `T1`, `T5`, and `T6` each become one pinned local leaf in `o/app`; `T2` is untriaged (eve lacks `write`); `T3` untriaged; `R1` untriaged with **Code review** and no leaf; issue 1 delivers and issue 2 is untriaged, as before; (2) nothing written; (3) the cursor and items stay, the error shows on the source, and the rest of the tick runs; after restore the next page is read and no item is duplicated; (4) `S1` is listed, not delivered (an MCP claim meets no starting rule); `S2` is paused; the bad link is refused with the field named while the others are stored; the replay is `unchanged` and the older one `stale`; (5) both refused; (6) `T4` is quarantined with a decision naming the set and rule and not the term; (7) the tab lists items from `github`, `tickets`, and `script` with a Source filter, non-GitHub rows link to their items and show no Issue Radar button; the page press makes one pinned leaf, and the MCP call gets 403; (8) `T1`'s task is quarantined until re-triggered or confirmed; (9) `T5`'s close is an order: `d5` is released with the brief note, and `T5`'s leaf has no verified completion; `T6`'s close holds `d6` and opens a decision, Avoozl does not reopen it, and the reopen lifts the hold with running sessions untouched; (10) the closed untied item is gone and tied ones stay; (11) every P31 expectation holds, and `untriaged.json` is not written.
  - Failure means: one record cannot carry every source without changing GitHub behavior, or an unverifiable caller can start work.
  - Next decision: keep MCP submit list-only and drop plugin-source rules, or keep plugin sources and drop the MCP way in.
  - Built: pass, receipt `docs/evidence/proof-p32.md` (`798b554`), test `src/app/test/proof-p32.test.mjs`. MCP calls use `plans_intake` action `submit_items`; GitHub issue 1 is authorized and goes to the planner as before.

## Phase 15: Pull request feedback

Starts when Phase 2's proofs pass, like Phases 9–14, and after 4.7
(plans-repo delivery) and 10.4 (brief checks). Everything builds and
proves against a fake GitHub and fake workers. It is numbered after Phase
14 because task IDs never move.

- [x] 15.1 Pull request read [R54.1, R54.2] (§4.13, F114)
  - For each covered leaf (plans-repo, or single-repo `coder: worker`) with an open pull request on its branch, one GraphQL read per repository per tick: head SHA, check runs and statuses on the head, reviews, unresolved review threads with comments, `mergeable`, and `autoMergeRequest`; skipped when `updatedAt` is unchanged; a failed read keeps the last state and shows the error.
  - Built: `5147ccc` (`pullRequestHeads`, `pullRequestFeedback`, `feedbackOf` in `src/app/github.mjs`); read stage in `src/app/github-feedback.mjs`, `d192dfb`. An unchanged pull request is read again only while a check runs, a required check is missing, mergeability is unknown, or a new head has no checks for 10 minutes.
- [x] 15.2 Feedback events and receipts, after 15.1 [R54.3–R54.5, R54.11, R54.12] (§4.13, F116)
  - Events per R54.3; reviews and comments filtered by `actorAllowed` with the repository's policy, others counted only; receipt key pull request, head SHA, and GitHub event ID; a comment that is also a steering mention sent once; a CI failure after a local pass still records "CI only".
  - Built: `d192dfb`, `5a5eb19`. Reviews and comments hold their own commit in the receipt key, so a force-push does not resend them.
- [x] 15.3 Relay, after 15.2 [R54.6, R54.7, R54.9, R54.10] (§4.13, F115)
  - One message per pull request per tick, quoted with `fence()`, failed checks with conclusion and details link and the `gh run view --log-failed` hint, task ID and title only in plans-repo mode, through the `brief` content boundary and the leak screen; to `intents.messages` for a live tick-opened worker, to `next` for a Crew Mode worker, else a new attempt on the same branch with a resume brief, the kept agent and model (R53.6), counted against the R8 retry bound; an unreachable crew waits; Avoozl writes nothing to GitHub.
  - Built: `d192dfb`. The new attempt keeps the last worker's model; R53's per-task agent and model is not built yet. R41.10 (unreachable crew) is not built, so nothing waits on it.
- [x] 15.4 Bounds and decisions, after 15.3 [R54.8, R54.14] (§4.13)
  - `delivery.feedbackRounds` (default 5) and `delivery.prFeedback` (default on) per repository and workspace, validated; a round counted on send or attempt; stop and one **Needs you** decision on the bound, on the same check failing on 3 head commits in a row, or on `blocked`.
  - Built: `d192dfb`. Settings are `delivery.prFeedback` and `delivery.feedbackRounds` (1–20), also under `delivery.repositories.<project>`. Settling the decision resumes with a fresh bound.
- [x] 15.5 Delivery view, after 15.4 [R54.4, R54.13] (§4.13, §8)
  - Each covered leaf shows its latest event, rounds used out of the bound, the session the last round went to, and a count with links for comments not relayed. Check the page by drawing it and looking at it.
  - Built: `6919afb` (PR feedback line in the Delivery card and drawer).

- [x] avoozl-p34 P34 Proof: pull request feedback with a fake GitHub and fake workers [R54] (§4.13)
  - Setup: an isolated temporary workspace in plans-repo mode with code repository `o/app` (allowed actor `alice`) and one single-repo repository `o/lib` with `coder: worker`; a fake GitHub; leaves `a` and `b` in `o/app`, `c` in `o/lib`, and `d` on the Issue Radar route; fake workers that push a new head when messaged.
  - Action: (1) open pull requests for `a`, `b`, `c`, and `d`, all green; tick; (2) fail checks `test` and `lint` on `a`'s head, and add a changes-requested review by `alice` and a comment by `mallory` on `b`; tick twice; (3) make `c` conflict with its base and turn its auto-merge off; end `c`'s worker session; tick; (4) fail `test` on `a` for three heads in a row; (5) on `b`, use up 5 rounds; (6) fail a check on `d`; (7) set `delivery.prFeedback: false` on `o/lib` and fail a check on `c`.
  - Expected: (1) nothing is sent; (2) `a`'s worker gets one message naming both checks with links, `b`'s worker gets `alice`'s review quoted as data, `mallory`'s comment is not sent and is counted in the Delivery view, and the second tick sends nothing new; (3) a new attempt opens on `c`'s branch with the same agent and model and a resume brief naming the conflict and auto-merge; (4) after the third head, one decision opens and nothing more is sent for `a`; (5) one decision opens for `b`; (6) nothing is sent for `d`; (7) nothing is sent for `c`. No message names the planning repository; the fake GitHub records no write by Avoozl.
  - Failure means: the tick cannot keep a worker on its pull request without spamming it or trusting outside text.
  - Next decision: send only failed checks and drop review relay.
  - Built: pass, `src/app/test/proof-p34.test.mjs`, `d192dfb`, `5a5eb19`. Run as two workspaces, plans-repo (`a`, `b`) and single-repo (`c`, `d`), because a workspace has one GitHub mode.

## Phase 16: Plugin bundles

Starts after 8.6–8.8 (plugin loading, tracker contract, private boundary);
it does not wait for Phases 9–15. Public code, docs, and the sample bundle
name no private system or company. It is numbered after Phase 15 because
task IDs never move.

- [x] 16.1 Bundle manifest, after 8.6 [R55.1–R55.3] (§4.14, F117)
  - `provides` with parts `pack`, `rules`, `tracker`, `intake`, `route`; kinds derived and checked against `kinds` when both are given; `intake` needs `capabilities.tracker` to list `poll`; a pack-only plugin has no `entry`, is refused if it names one, and never starts a process; the approval stores the parts.
  - Built: `837497b` (docs and skill `a675b9a`).
- [x] 16.2 Pack file and checks, after 16.1 [R55.3, R55.4] (§4.14, F118)
  - `avoozl-pack.json` (or the manifest's `pack`) with `description` and `settings`; one whitelist per group, then the Settings validators; unknown, credential-like, and rule-like keys refused by name; an invalid pack makes the plugin invalid.
  - Built: `837497b` (docs and skill `a675b9a`).
- [x] 16.3 Preview and import, after 16.2 [R55.5–R55.7, R55.9] (§4.14, F119)
  - `plugin.pack.preview` (read only, before approval allowed) and `plugin.pack.import` (person only, approved plugin, exact preview hash, `acceptLowered` for a who-counts widening, `confirmPublic` for a machine-only plugin); create, change, keep, skip; `packs` provenance in `.avoozl.json`; a newer version offers its preview again; CLI `plugins pack-preview` and `pack-import`.
  - Built: `837497b` (docs and skill `a675b9a`).
- [x] 16.4 Intake contract hook, after 8.7 [R55.8, R50.2, R50.7] (§4.8, §4.14)
  - Tracker capability `poll` and its reply check (`items` at most 500, `cursor` at most 2,000 characters, `more`); each item checked per R50.2 and refused by field while the rest are kept; tracker rebuild asks only plugins that provide `tracker`.
  - Built: `837497b` (docs and skill `a675b9a`).
- [x] 16.5 Settings > Plugins parts and Import, after 16.3 [R55.2, R55.5–R55.7] (§4.14, §8)
  - Each card lists its parts in plain words and what was imported; **Preview and import pack** opens a dialog with the create/change/keep/skip table, the who-counts line and its checkbox, and Import; Add plugin's What and review steps list the parts and the pack preview. Checked by drawing the page and looking at it.
  - Built: `837497b` (docs and skill `a675b9a`).
- [x] 16.6 Docs and plugin skill, after 16.5 [R55.10] (§4.14)
  - `docs/plugins.md` covers bundles, the pack, and intake; the app ships an `avoozl-plugin` skill; the sample `sdk-team` bundle under the test fixtures uses the generic triage labels needs-triage, p0–p3, and response-requested.
  - Built: `837497b` (docs and skill `a675b9a`).
- [ ] 16.7 Crew placement defaults in packs, after 11.2 and 16.3 [R55.4] (§4.10, §4.14)
  - Add the routing rules of §4.10 as a pack key once they exist, with the same allowlist, validator, and preview.

- [x] avoozl-p35 P35 Proof: one bundle plugin with a pack, rules, a tracker, and an intake source [R55] (§4.14)
  - Setup: an isolated temporary workspace in single-repo mode with one repository `o/sdk` and a Project; the sample `sdk-team` plugin from the test tree; a fake intake file, terms file, and record file outside the repository, named by environment variables.
  - Action: (1) preview the folder in Add plugin and add it shared with the repo; (2) preview the pack; (3) import before approval, and as an agent session; (4) approve; import with a stale hash, then with the shown hash; (5) preview again; (6) call `ruleSets` and poll twice with limit 2; (7) bump the version and lower `minimumPermission` to triage; (8) give the pack an unknown key, and make it pack-only.
  - Expected: (1) parts pack, rules, tracker, intake and the entry in `.avoozl.json`, unapproved; (2) every setting `create`, no warning, nothing written; (3) refused, and 403; (4) the stale one refused; the settings land with `packs.sdk-team` version 1.0.0 and no rule text; (5) every setting `keep`; (6) the team's set; T1 kept, T2 refused for its link, cursor 2 and more, then T3 closed by bob; (7) state changed, nothing runs or imports until approved again; the preview shows the change and the who-counts line, and the import is refused until accepted; (8) the plugin is invalid naming `settings.repositories.autoMerge`; pack-only has no kinds and starts no process.
  - Failure means: one install cannot carry a team's setup without running unreviewed code or changing who counts silently.
  - Next decision: ship packs alone and keep code parts as separate plugins.
  - Built: pass, `src/app/test/proof-p35.test.mjs`, `837497b` (docs and skill `a675b9a`).

## Phase 17: MCP tool groups

Numbered after Phase 16 because task IDs never move.

- [x] 17.1 Group MCP tools by object, after 2.3 [R56] (§8)
  - 15 tools with an `action` enum, each action one existing operation; person-only operations refused for any MCP call in `Operations.perform`; old `plans_*` names listed and marked deprecated; a session may archive a plan.
  - Built: `e729e08`, `src/app/test/mcp-tools.test.mjs`.

## Phase 18: Avoozl state on the board, and a code review chat

Owner requests 2026-11-13. Numbered after Phase 17 because task IDs never
move.

- [x] 18.1 Avoozl state Project field and board view [R29.18–R29.21] (§6.7, §8.2)
  - One lane rule in `src/delivery-lanes.mjs` for the Delivery tab and Project sync; sync writes Avoozl state only on change, writes a person's edit back once and records it in Conflicts; setup creates the field and Board by Avoozl state, names Status's first option Ready and keeps an existing Todo.
  - Built: `4e49f4c`, `src/app/test/github-project.test.mjs`, `src/app/test/github-setup.test.mjs`.
- [x] 18.2 Code review chat, until MC-15 [R49.16–R49.18] (§8.5)
  - `review.chat` queues one seeded sage-review chat per pull request; the tick opens it as role `pr-review`; the row shows Attach; content rules run on the seed; no GitHub write.
  - Built: `25f3132`, `src/app/test/pr-review.test.mjs`.

## Phase 19: New plan

Owner request 2026-11-13. Numbered after Phase 18 because task IDs never
move.

- [x] 19.1 New plan drawer and Plans button icons, after 2.5 [R57] (§8.6)
  - `plan.new` checks fields and content rules and records the request; the drawer opens an `avoozl-planner` chat; the tick imports a clean folder as a draft and approves nothing.
  - Built: see the commit that adds `src/app/new-plan.mjs`.

## Phase 20: Onboard a repository

Owner request 2026-11-13. Numbered after Phase 19 because task IDs never
move.

- [x] 20.1 Onboard reads, after 3.18 [R58.2, R58.6, R58.7] (§4.15)
  - `onboarding.inspect`, `onboarding.scan` and `plan.issues.preview`, all `observe`; the public secret and path rules move beside the content-rules matcher so the release scan and the leak scan share them.
  - Built: see the commit that adds `src/app/onboarding.mjs`.
- [x] 20.2 Onboard dialog, after 20.1 and 16.5 [R58] (§4.15, §8)
  - Eight steps with Cancel on each; steps that do not apply are left out and satisfied ones show done; one confirm per GitHub write; nothing written before Set up; never approves, starts or pushes.
  - Built: see the commit that adds `kirocrew-app/ui/src/Onboard.tsx`.

## Phase 21: Epics and phases

Owner decision 2026-11-13 (Requirement 59, design §6.9). An epic spans
plans; a phase groups tasks inside one plan; no group is made up from a
file path. Numbered after Phase 20 because task IDs never move. It starts
after Phase 3's proofs and 19.1. It changes earlier tasks' behavior only as
Requirement 59 states: 2.1's `kind: "epic"` becomes an error, 3.7 projects
epic and plan issues, 12.8's batch key `epic` is renamed `phase` and the
old value is refused, and 19.1's drawer gets separate Epic and Phases
fields. Old plan forms are errors with no loading path; task 21.7 rewrites
the owner's own plans once, after P36 passes.

- [x] 21.1 Epic folders and the `epic:` key, after Phase 3's proofs [R59.1–R59.4, R59.7] (§6.9)
  - The spec reader knows an epic folder by its manifest's top-level `"kind": "epic"`, reads members from `plan`, reads `epic:` front-matter like `category:`, and reports the §6.9 validation codes; `kind: "epic"`, per-entry `epic`, a plan's `epics` list and `memberPlan` are errors, never loaded under another name.
  - Built: 9535b47 Read epic folders, plan epics and phases; refuse the old epic forms
- [x] 21.2 Phases from the manifest and `tasks.md` headings, after 21.1 [R59.5, R59.6] (§6.9)
  - Each task gets a phase from its `phase` value, else its nearest level-2-or-lower heading, else No phase; the store keeps cross-plan epics only and tasks lose `epic`; capture and catalog paths stop making `doc:` epics, and `specOf` reads the plan or source reference.
  - Built: 9535b47 (phases, no `doc:` or Inbox groups, tasks lose `epic`)
- [x] 21.3 Epic and phase reads on the page, CLI, and MCP, after 21.2 [R59.4, R59.10] (§6.9, §8)
  - An epic read gives goal, what done means, member plans with status and progress, and open decisions; plan and task reads carry epic and phase; progress is computed, never stored; reads join the grouped MCP tools (R56).
  - Built: 9535b47 (`epic.list`, `epic.get`, plan and task reads, CLI `epics`/`epic`, MCP `plans_plan`)
- [x] 21.4 Epic and plan issues on GitHub, after 21.2 [R59.8, R59.9, R59.15] (§6.9, §6.3)
  - Projection creates the epic issue with `epicIssueType`, one plan issue per plan as its sub-issue, and task issues under the plan issue or package; writes the phase line and the optional `phase` Project field; the tick closes plan and epic issues from children; `github.subIssues.maxPerParent` (default 100) is read, validated, shown in Settings > GitHub setup in GitHub modes only, and checked against each parent's `subIssuesSummary.total`; children past the cap and refused links show in the preview and Delivery.
  - Built: a5871a4 Project epic and plan issues, cap sub-issues per parent, and add P36
- [x] 21.5 Views use epic and phase, after 21.3 [R59.6, R59.10] (§6.9, §8)
  - Graph levels All > Epic > Plan > Phase > task with the back stack; separate Epic and Phase filters in Graph, Delivery, Flow, and Plans; Dashboard Progress by epic across member plans; the plan left column shows its epic link and phases; the epic page; no `doc:` ID or path shown anywhere.
  - Built: bae8870 Show epics, plans and phases in the views; batch by phase; add Epic and Phases to New plan
- [x] 21.6 Batch by phase and the New plan fields, after 21.2 and 19.1 [R59.11, R59.14] (§6.9, §8.6)
  - `flow.batch.by` accepts `phase` (default) and `files`, and refuses `epic` naming `phase`; the New plan drawer has Epic (pick) and Phases; the planner agent and skill write epic folders, the `epic:` key, and phase headings.
  - Built: bae8870 (batch by phase, New plan Epic and Phases, planner agent and skill); 9535b47 planner prompt
- [x] 21.7 Rewrite the owner's plans once, after avoozl-p36 [R59.12, R59.13] (§6.9)
  - A script kept in the task's report, not in `src/`, run through existing operations: first on a copy of the database and spec repositories, then live after a sha256 backup; per-plan epics to phases, `doc:` epics to their `tasks.md` section or No phase, orphaned tasks archived with `task.archive` reason "plan removed", old manifest forms rewritten in Nupp's plans (the rewrite epic folder and the native runtime plan) and checked in Avoozl's own spec, `flow.batch.by: "epic"` set to `phase`; every plan lints with 0 errors; a second run changes nothing; spec edits are local commits; nothing is approved, started, written to GitHub or pushed.
  - Built: Rewrite run once live on the owner's Nupp and Avoozl workspaces; script and receipts kept in the task report. Nupp plans: one local commit; Avoozl's own spec needed no change. 7cc538a and 334c7e8 let the existing operations do it.

- [x] avoozl-p36 P36 Proof: one epic over two member plans, and old forms refused [R59] (§6.9)
  - Setup: an isolated temporary workspace in plans-repo mode with a fake GitHub; an epic folder `rewrite` listing plans `alpha` and `beta`; `alpha` has `epic: rewrite` and two `## ` headings, one task under none; `beta` has `epic: rewrite`, manifest `phase` values and a `phases` title; a third plan `gamma` says `epic: rewrite` but is not listed; `github.subIssues.maxPerParent` set to 2, and `beta` has three tasks outside packages. A fourth folder `old` has an entry with `kind: "epic"`, per-entry `epic` values and an `epics` list; a fifth, `old-epic`, is an epic folder with `memberPlan` entries.
  - Action: (1) lint and approve `rewrite`, `alpha`, `beta` and `gamma`; (2) list `beta` as a member while it names no epic, then restore; (3) read the epic, the Graph levels, Delivery, Flow, and Plans with each filter, and the Dashboard; (4) preview projection, apply it, preview again; (5) close every `alpha` and `beta` task issue; (6) lint `old` and `old-epic`; (7) save `flow.batch.by: "epic"`; (8) open Settings in Local only, then in plans-repo mode.
  - Expected: (1) 0 errors; `gamma` gets `spec.epic-unknown` and shows under No epic; (2) `spec.epic-member-unconfirmed` blocks only the epic's approval; (3) the epic lists `alpha` then `beta` with computed progress; phases come from headings or manifest values; the headless task is under No phase; no response contains `doc:` or a file path as a group name; (4) one epic issue with the epic type, two plan issues as its sub-issues, task issues under them, the phase line in each body; `beta`'s third task is unlinked, names its plan issue in the marker, and shows "Over the sub-issue limit"; the second preview writes nothing; (5) the tick closes both plan issues, then the epic issue; (6) `spec.kind-epic`, `spec.entry-epic` and `spec.epic-task-fields` errors naming each entry, and neither folder can be approved; (7) refused naming `phase`; (8) the sub-issue cap shows only in plans-repo mode.
  - Failure means: one word still means two things, a group is still made up from a path, or an old form still loads.
  - Next decision: keep phases as Avoozl-only groups and project only epics and tasks.
  - Built: a5871a4 `src/app/test/proof-p36.test.mjs`; bae8870 `kirocrew-app/ui/test/epics.test.mjs`

## Phase 22: Templates, manual tasks, and links and notes

Owner approval 2026-11-13 (Requirement 61, design §4.16). Numbered after
Phase 21 because task IDs never move. It starts after 21.1, 16.3, 17.1 and
P28; its proof runs after P36.

- [ ] 22.1 Manual leaves in lint and the tick, after 21.1 [R61.9–R61.11, R61.13, R61.15] (§4.16, §4.3)
  - `manual: true` with completion `person`; `spec.manual-field` and `spec.person-completion`; left out of ready, batching, verification, review and integration; every edge condition met when done; Blocked or waiting, then Needs you tagged Manual; `task.manual.complete` (Done or Skipped, outcome) and `task.manual.reopen` person only, refused over MCP; Flow counts waiting on a person and skips first-pass rate and time to fix.
- [ ] 22.2 Manual leaves on GitHub, after 22.1 and 18.1 [R61.14] (§4.16, §6.3, §6.7)
  - Issue projected under its plan issue or package, never a ready or trigger label, never sent to Issue Radar, the manual line in the managed body; Mark done closes as the person's login after Who counts; an allowed close completes it with its reason; any other close holds dependents and opens a decision without reopening; a reopen makes it open again and leaves running sessions alone.
- [ ] 22.3 Links and notes store, operations, CLI, and MCP, after 17.1 and avoozl-p28 [R61.16–R61.18, R61.20–R61.22] (§4.16, §4.9)
  - `task_notes` table; field limits refused by name; `notes` content-rule boundary on by default with Allow once for a person; `task.notes.list` observe, `task.notes.add` for a session's bound task only, `edit`, `remove` and `show` person only; CLI `avoozl task notes`; briefs get the newest 20 entries within 8,000 characters as data, and dependents get blockers' outcome entries; adding an entry changes no plan revision.
- [ ] 22.4 Task drawer Links and notes and the Mark done dialog, after 22.1 and 22.3 [R61.12, R61.19] (§4.16, §8)
  - Drawer section newest first with author and time, Add link and Add note, edit, and remove after a confirm; a manual leaf shows its acceptance and Mark done with outcome note, links, and Done or Skipped; checked by drawing the page and looking at it.
- [ ] 22.5 Links and notes on the issue, after 22.2 and 22.3 [R61.23] (§4.16, §3.3)
  - Show on the issue, person only and off by default, lists the entry in the managed body under Links and notes after the `github` boundary; others' edits there are conflicts; rebuild restores shown entries and the rebuild test allows unshown ones to be missing.
- [ ] 22.6 Template plugin part and checks, after 16.3 and 21.2 [R61.1–R61.6] (§4.16, §4.14)
  - `template` in `provides`, running as nothing; `avoozl-template.json` keys, inputs, `{{input}}` placeholders replaced as text, unknown keys and names refused; the starter lints with sample values; `phases` match headings or `phase` values; `pack` and `flow` pass their validators; an invalid template makes its plugin invalid; `template.list` and `template.preview` read approved templates only.
- [ ] 22.7 From template in the New plan drawer, after 22.6, 21.6 and 19.1 [R61.6–R61.8] (§4.16, §8.6)
  - Blank or From template as radio fold-outs; template inputs as fields beside Name, Category and Epic; `plan.new` takes `template` and `inputs`, checks required inputs, reads a file input in the page up to 200 KB, and runs content rules on the seed; the pack preview with Import these settings unticked; the draft records the template; a picked epic gets its own draft revision; nothing approved, started or pushed.
- [ ] 22.8 Sample SDK rewrite template, docs, and skills, after 22.7 and 22.4 [R61.24] (§4.16)
  - A template-only sample plugin in the test tree with the §4.16 SDK rewrite template, its six phases, the manual Review with team leaf that cutover requires, two proof kinds and the flow defaults, naming no private system or company; `docs/plugins.md`, the plugin skill and the planner skill cover templates, manual leaves and links and notes.

- [ ] avoozl-p37 P37 Proof: an SDK rewrite plan from a template, gated by a manual team review, with links and notes [R61] (§4.16)
  - Setup: an isolated temporary workspace in single-repo mode with one repository `o/sdk`, a fake GitHub with an allowed actor `alice` and a reader `bob`, a fake terms file banning `secretword`, an epic folder `sdk-target`, and the sample template plugin from the test tree.
  - Action: (1) add and approve the plugin; open New plan, From template, SDK rewrite; submit with no SDK name, then with `sdk: widgets`, the target repository, a gap list file and epic `sdk-target`, leaving Import these settings unticked; let a fake planner write the folder; (2) lint and approve the plan and the epic's new revision; project; (3) finish every task before the review; (4) as a session, mark the review done, add a note to the review, add a note to another task, and edit the person's note; (5) as a person, save a note with `secretword`, a link `javascript:x`, a link with a user name, then a valid outcome note and link, and Mark done with Done; (6) read the first cutover task's brief; (7) tick Show on the issue on the outcome link and run the tick; rebuild; (8) reopen the review in Avoozl; have `bob` close its issue, then `alice`.
  - Expected: (1) refused naming `sdk`, nothing recorded; then a draft plan with six phases and the template recorded, the epic's own draft revision, no setting imported, nothing approved or started; (2) 0 errors; the review issue says a person closes it and never gets a ready or trigger label; (3) the review is in Needs you tagged Manual and no session opens for it; cutover tasks wait; (4) the mark done and the edit refused, the note on the review saved with the session's ID, the other task's note refused; (5) the first three refused naming the rule or field, the last saved; the issue closes as completed and cutover tasks become ready; (6) the brief carries the outcome note and link as data; (7) only the shown link is in the managed body, and it is back after the rebuild; (8) dependents wait again; `bob`'s close opens a decision and is not reopened; `alice`'s close completes it.
  - Failure means: a repeated workflow cannot start from one install, a person's step cannot gate agent work, or what a review decided does not reach the next task.
  - Next decision: keep templates as starter folders in a planning repository and drop the plugin part.

## Phase 23: Specs and ideas

Owner approval 2026-11-13 (Requirements 62 and 63, design §8.7 and §8.8).
Numbered after Phase 22 because task IDs never move. It renames only what
people read, and it builds on the incoming-item record of Phase 14.

- [x] 23.1 Say spec on the page, in docs and in skills, after 19.1 [R62] (§8.7)
  - Every user-facing plan word becomes spec; Plan a change becomes Change spec; `plans_*`, `plan.*`, CLI, `.avoozl.json` keys, SQLite, the Plans repo mode and `avoozl-planner` are unchanged; a page-source test fails on any `plan` or `plans` word outside its allowlist.
  - Built: `e179407`, `46ed4da` (page-source test `kirocrew-app/ui/test/specs-name.test.mjs`); the Specs tab, Change spec in `PlansView.tsx`.
- [x] 23.2 Idea record and operations, after 14.10 and 17.1 [R63.1, R63.3–R63.6, R63.10] (§8.8, §4.12)
  - `local` items of kind `idea` with notes and links and their limits; `idea.capture`, `idea.append`, `idea.archive`, `idea.restore`; the `intake` boundary refuses blocked text; no trigger match, no task, no Untriaged count, no purge; `plans_intake` actions `capture_idea` and `add_idea_note`; CLI `avoozl intake idea`.
  - Built: `f254b8f` (`src/app/ideas.mjs`, `idea.capture`, `idea.append`, `idea.archive`, `idea.restore`, `plans_intake` actions `capture_idea` and `add_idea_note`, CLI `avoozl intake idea`; `src/app/test/ideas.test.mjs`).
- [x] 23.3 Ideas on the page, after 23.1 and 23.2 [R63.2, R63.7, R63.10] (§8.8)
  - + New idea on Specs and Intake; Ideas (N) on Specs; the Idea kind filter; the idea drawer with notes, links, Add note, Add link, Archive and Restore; checked by drawing the page at 375 and 1280 px in light and dark.
  - Built: `f254b8f` (`Ideas.tsx`, + New idea, Ideas (N), the idea drawer; `kirocrew-app/ui/test/ideas.test.mjs`).
- [x] 23.4 Riff on this and Make it a spec, after 23.3 [R63.8, R63.9] (§8.8, §8.6)
  - `chat.context` purpose `riff-idea` seeds a chat that only appends; Make it a spec prefills the New spec entry point with the idea key, and recording the request graduates the idea; a cancel leaves it unchanged.
  - Built: `f254b8f` (`chat.context` purpose `riff-idea`, Make it a spec into `NewPlanDrawer.tsx`).

- [ ] avoozl-p38 P38 Proof: the Specs name and ideas [R62, R63] (§8.7, §8.8)
  - Setup: an isolated temporary workspace with one repository, a trigger rule with no `source:` term and one with `source:local`, a fake terms file banning `secretword`, a fake chat opener and the New spec entry point.
  - Action: (1) run the page-source test; list MCP tools and CLI commands; (2) as a person, add an idea with a title, a note and a link; over MCP, capture one with no title, one with a `javascript:` link, one with `secretword`, then a valid one; as a session, capture one and append a note to it; (3) tick; read the Intake tab and its Untriaged count; call Plan this and Deliver this on an idea; (4) as a session, archive an idea and graduate one; (5) Riff on this, and from the riff chat append a link; (6) Make it a spec, cancel, then submit; (7) archive and restore; move the clock 31 days and run the purge.
  - Expected: (1) no plan word outside the allowlist; every `plans_*` tool and CLI command still answers; (2) the bad three refused by field or rule with nothing recorded; the session idea and note name the session; (3) no task, no rule match and an unchanged Untriaged count; both actions refused; (4) refused with 403; (5) the seed holds the idea as data and asks for no edits; only the link is added; (6) the cancel changes nothing; the submit prefills New spec and the idea shows Graduated with the spec name; (7) the archived and graduated ideas are still there.
  - Failure means: an idea can start work, or the page still says plan.
  - Next decision: keep ideas as a separate local list instead of intake items.
  - Open: no named proof run; the parts are covered by `src/app/test/ideas.test.mjs`, `kirocrew-app/ui/test/ideas.test.mjs` and `specs-name.test.mjs`.

## Phase 24: Pull the Andon cord

Owner approval 2026-11-13 (Requirement 64, design §4.11). Numbered after
Phase 23 because task IDs never move. It adds a pulled stop beside the
automatic stops of 12.6.

- [x] 24.1 Pulled stops in the backend, CLI and MCP, after 12.6 [R64.2–R64.5, R64.7–R64.11] (§4.11)
  - `flow.stop` {scope, repository?, spec?, taskId?, reason} records a `manual` row in `flow_stops` after the `brief` content rules; `flow.resume` {stopId} is person only and records who resumed; dispatch skips every task in scope, fix tasks included; the line watch never closes a pulled stop; Resume refuses an automatic stop and Run anyway a pulled one; `plans_session` action `stop_line`; `avoozl flow stop` and `avoozl flow resume`; Flow and the retro carry the pull.
  - Built: `79e5fa7` (`flow.stop`, `flow.resume`, `plans_session` action `stop_line`, `avoozl flow stop|resume`; `src/app/test/flow-andon.test.mjs`).
- [x] 24.2 Stop the line on the Dashboard, after 24.1 [R64.1, R64.6, R64.7] (§4.11)
  - A red Stop the line button in the Dashboard header opens a dialog with a scope, its target and a required reason; the Line stopped banner shows who, when, scope, reason and the paused count, with a Resume button that asks first; checked by drawing the page at 375 and 1280 px in light and dark.
  - Built: `79e5fa7` (`StopLine.tsx`, the Line stopped banner in `DashboardView.tsx`; `kirocrew-app/ui/test/stop-line.test.mjs`).

- [ ] avoozl-p39 P39 Proof: pull the Andon cord [R64] (§4.11)
  - Setup: an isolated temporary workspace with repositories `r1` and `r2`, an approved spec `s1` with leaves `a1` and `a2` (`a2` requires `a1`) in `r1` and `b1` in `r2`, a fake terms file banning `secretword`, and fake workers.
  - Action: (1) as a person, pull with scope `task` on `a1` and reason `bad base`; tick; (2) pull with no reason, a two-line reason, scope `repo` naming `r9`, and reason `secretword here`; (3) from an agent session, pull with scope `repo` on `r2`; (4) let the stopped check pass and the fix task integrate; tick; (5) call Resume from an agent session and from the app token; (6) press Run anyway on the pulled stop; press Resume on an automatic stop; (7) press Resume as the owner on both pulled stops; tick; (8) read Flow and the retro payload; run `avoozl flow stop` and `avoozl flow resume` from the CLI.
  - Expected: (1) `a1` and `a2` are not dispatched, `b1` is, a running session is untouched, and the banner shows the owner, the time, the scope and `bad base`; (2) each refused by field, the unknown repository named, the content rule named without the matched text, nothing recorded; (3) the stop names the session, `b1` waits, the owner is notified once; (4) both pulled stops stay open; (5) both refused with 403; (6) both refused; (7) dispatch resumes in each scope and each stop records who resumed it; (8) both pulls are listed and counted with a time to fix, the retro sees their scope and reason, and the CLI pulls and resumes the same way.
  - Failure means: a person cannot stop new work by hand, or a pulled stop resumes without a person.
  - Next decision: keep the pull as a person-only button and drop the MCP action.
  - Open: no named proof run; the parts are covered by `src/app/test/flow-andon.test.mjs` and `kirocrew-app/ui/test/stop-line.test.mjs`.

## Phase 25: New plan hands off to Spec Builder

Owner approval 2026-11-13 (Requirement 65, design §8.6). Numbered after
Phase 24 because task IDs never move.

- [x] 25.1 Spec Builder hand-off, steering file and manifest from tasks.md, after 19.1 [R65] (§8.6)
  - The `/api/apps/spec-builder/specs` grant and a source scan test; `.kiro/steering/avoozl-specs.md` written only after the drawer asks; `plan.new` `preview` and `handoff: "spec-builder"`; the page posts the create call and opens Spec Builder; Plan a goal opens the drawer; the tick writes the manifest from a still `tasks.md` and imports a draft; plain refusals with the planner chat as fallback.
  - Built: 3cfd93d Hand New plan and Plan a goal to Spec Builder

## Phase 26: Driver handoff

Owner request 2026-11-13 (Requirement 66, design §6.10). Numbered after
Phase 25 because task IDs never move. It makes the one-writer rule of 3.8
hold across machines. The driver is the plan issue's assignee plus a
machine claim in its marker.

- [x] 26.1 Driver lock and read-only ticks, after 3.8 and 21.4 [R66.1–R66.9] (§6.10)
  - Machine ID and label in machine-local settings; read the plan issue's assignees (else the epic issue's) and the marker `claim` in sync, and again before each dispatch, projection and integrate; drive only with exactly one assignee equal to the `gh` login and a claim naming this machine; zero or several opens one decision and reads only everywhere; heartbeat edits of the claim, left out of `applied`; approval creates the plan issue assigned with the claim before any task issue; Take over writes the claim and reads it back; Avoozl changes no assignee; the Local only `driver` row; `driver.status` on the page, CLI and MCP.
  - Built: `e213632`, `f31d6ba`, PR #22. The driver reads the plan issue that 21.4 projects (`upsertParent` in `github-projection.mjs`); machine settings are in `driver.json` beside `plugins.json`. Tested against fakes only.
- [x] 26.2 Hand off and take over from an export, after 26.1 and 12.1 [R66.10–R66.12, R66.15, R66.16] (§6.10)
  - Person-only `driver.handoff` with drain, Export with N unfinished and Cancel; the one-spec export file with no machine-local contents, its sha256 in the claim, and the reassign link; person-only `driver.takeover --file` with the checks and a one-transaction import; away tasks complete from GitHub facts or get one decision, never restarted by lease; the re-approve list; 403 for agent, MCP, app-token and plugin callers.
  - Built: e213632, 24c78bb Carry the activity log in driver exports. Live session bindings, worktrees and in-flight deliveries do not move; their tasks come over as away. The raw lessons store moves with the export through `lessonsHook` (`f31d6ba`). Tested against fakes only.
- [x] 26.3 Rebuild and force take over, after 26.1 and 3.10 [R66.11, R66.13–R66.15] (§6.10)
  - `driver.takeover --rebuild` runs the spec's rebuild and shows the loss list first; open decisions re-raised by the next tick; person-only `driver.forceTakeover` with the named old driver and typed spec name sets the plan issue's assignees to this login, reads them back and stops when GitHub kept the old ones, writes a forced claim and sends one notice; a returning old driver reads only and never takes the role back.
  - Built: e213632. A take-over projects the spec once more on the next tick, which raises open decisions again from GitHub. Rebuild runs for the plan issue's repository. Tested against fakes only.
- [x] 26.4 Driver in the header, banner, dialogs and Settings, after 26.2 and 26.3 [R66.17] (§6.10)
  - The header driver chip, the read-only banner with its reason and Take over or Force take over, the stepped Hand off dialog, the loss list and confirm dialogs, and Settings › General › This computer; checked by drawing the page at 375 and 1280 px in light and dark.
  - Built: ca89ea2 Show the spec driver in the header, banner, dialogs and Settings. This computer sits in Settings › Where tasks live, which holds the General settings. Checked by typecheck and source tests only: the page was not drawn at 375 and 1280 px, because this machine has no browser.

- [x] avoozl-p40 P40 Proof: driver handoff [R66] (§6.10)
  - Setup: isolated temporary workspaces `A1` and `A2` (login `alice`, two machine IDs) and `B` (login `bob`) on one fake GitHub in plans-repo mode; an epic issue and an approved spec `s1` with leaves `a1` and `a2` (`a2` requires `a1`) and a local-authority leaf `l1`; a fake plugin and a fake terms file on `A1` only; fake workers. The fake GitHub ignores assignee changes from a token without push access, as GitHub does.
  - Action: (1) approve on `A1`; tick all three; (2) on `A2` press Take over; tick; (3) add `bob` as a second assignee; tick; remove him; (4) clear the plan issue's assignee and assign `alice` on the epic issue; tick; (5) stop `A1`'s heartbeat for 2 hours of fake time; tick `A2`; (6) reassign the plan issue to `bob` between `A1`'s sync read and its dispatch step; (7) assign `alice` again; start `a1` on `A1`, press Hand off driver, tick, let `a1` finish, write the export, reassign to `bob`; (8) change one byte of the file and take over on `B`; then take over with the real file; tick; (9) from an agent session, MCP and the app token, call hand off, take over and force take over; (10) start `a2` on `B`, stop `B` with no hand off, and force take over with rebuild on `A1`, once with a token without push access and once with one; (11) start `B` again and tick it; (12) copy a Local only workspace's SQLite to another machine ID and open it.
  - Expected: (1) `A1` drives and dispatches `a1`; `A2` and `B` write nothing and show why; (2) `A2` drives and `A1` reads only, with no assignee change; (3) every workspace reads only and one decision opens, then closes; (4) the epic's assignee stands in and `A2` still drives; (5) `A2` shows "not seen since" and nothing moves; (6) `A1` dispatches nothing; (7) nothing new dispatches, `a1` is never ended and its report applies, the export has no terms or instructions, its sha256 is in the claim, and Avoozl never changes the assignee; (8) the changed file is refused by name with nothing changed; with the real file `B` drives with `l1`, Flow spans and notes, and lists the plugin and terms file to set up while their boundaries stay closed; (9) every call refused with 403; (10) without push access GitHub keeps `bob`, Avoozl says so and changes nothing else; with it the loss list shows first, `alice` is the only assignee, `a2` is away and gets one decision instead of a restart, open decisions come back from GitHub, and the claim is forced and names `B`; (11) `B` reads only, names `A1` and says forced; (12) the copy reads only until Take over.
  - Failure means: two machines can write for one spec, or the role moves without a person.
  - Next decision: put the claim in a comment instead of the marker, or drop the epic default.
  - Passed against fakes only: src/app/test/proof-p40.test.mjs, one fake GitHub, three temporary workspaces, fake time and rosters. Actions 5 and 6 need A1 to drive, so A1 takes the role back with Take over after action 4. Not run against real GitHub.

## Phase 27: Budgets and receipts

Owner decisions 2026-11-13 (Requirement 67, design §4.17). Numbered after
Phase 26 because task IDs never move. It prices the turns `flow_usage`
already holds (12.11) and caps each task in dollars.

- [x] 27.1 Price table and budget levels, after 12.12 [R67.1–R67.5] (§4.17)
  - Machine-local `prices` with `version`, `creditUsd` and per-model `inputPerMTokUsd` and `outputPerMTokUsd`, empty by default; person-only `prices.save` bumps the version, hashes the canonical JSON and writes `price_versions`; validation refuses `prices` in `.avoozl.json`, packs and manifests; `budget {usd, tokens, credits}` at workspace, `projects.<id>`, manifest top level and leaf, most specific key wins; fallback defaults 2,000,000 tokens and 200 credits; the driver export leaves prices out.
  - Built: dbdad6c Add per-task budgets, usage receipts and Settings Prices (`src/app/budget.mjs`; caps in Settings › Budgets, not the repository Edit modal; the driver export is not built yet, so it is not wired).
- [x] 27.2 Spend and receipts, after 27.1 and 12.9 [R67.4, R67.7, R67.11–R67.14] (§4.17)
  - Price each `flow_usage` turn on read (credits first, then tokens); `budget.view` and `budget.receipt` with totals by stage, model and attempt, priced flags, cap and level, raises, stops, price version and hash, `complete` and `missing` reasons for Crew Mode, remote, Issue Radar and failed reads; batch turns shared evenly and marked; `avoozl budget receipt TASK [--json]`; `plans_view` action `receipt`; the retro payload's `receipts`; no prompts or text.
  - Built: dbdad6c Add per-task budgets, usage receipts and Settings Prices (`budget.view`, `budget.receipt`, `avoozl budget receipt TASK --json`, `plans_view` action `receipt`, retro `receipts`).
- [x] 27.3 Stop at the cap, Raise budget and Stop, after 27.2, 12.8 and 15.4 [R67.6–R67.9, R67.14–R67.18, R67.21] (§4.17)
  - Check after each usage read and before each dispatch for the task (attempts, verifier, review roles, responders, batch); at a cap record a `budget` stop, dispatch nothing for the task, queue one stop message per live bound session, and answer its Avoozl MCP calls except `plans_report` with `budget_reached`; never stop, interrupt or close a session; one Needs you decision with person-only `budget.raise` (writes `budget_raises`, messages a live session) and `budget.stop` (the Deferred pause); 403 for other callers; no attempt cost; unpriced turns warn once per task and model; unknown spend warns once and never stops; no gate reads the budget.
  - Built: dbdad6c Add per-task budgets, usage receipts and Settings Prices (stop and warn modes, 80% warning, `budget_holds`, `budget.raise|stop|acknowledge|switchToStop`); 1112e0e Name the task when a budget call has none.
- [x] 27.4 Spend on the page and Settings › Prices, after 27.3 and 12.11 [R67.2, R67.10, R67.11, R67.19, R67.20] (§4.17)
  - The drawer's Budget fold after Timing with spend against cap, receipt tables and Export JSON; the `$spent / $cap` chip on the Delivery and In flight cards (muted, red at the cap, "spend unknown"); Settings › Prices marked this computer only, with models from `GET /api/models` and `flow_usage`, the credit price, the version and the unpriced-model notes; budget fields in Settings › General and the repository Edit modal; checked by drawing the page at 375 and 1280 px in light and dark.
  - Built: dbdad6c Add per-task budgets, usage receipts and Settings Prices (Budget fold, spend chip, Dashboard over-budget count, Flow marks, Settings › Budgets and › Prices; drawn at 375 and 1280 px, light and dark, in a screenshot harness).

- [x] avoozl-p41 P41 Proof: budgets and receipts [R67] (§4.17)
  - Setup: an isolated temporary workspace with repositories `r1` and `r2`; `.avoozl.json` `budget.usd` 10 and `projects.r2.budget.usd` 4; an approved spec `s1` with manifest `budget.usd` 6, leaves `a1` (leaf `budget.usd` 2), `a2`, `a3`, `a4` and `a5` in `r1`, `b1` in `r2`, `c1` and `c2` (`size: "small"`, leaf `budget.usd` 4 each, one batch), and `d1` (requires `a1`); a machine-local price table version 1 pricing `model-a` at $1 and $2 per million input and output tokens and credits at $0.01; fake workers and a fake usage feed that serves scripted turn rows per slot; a fake Kiro Crew that queues a message sent to a busy session until its turn ends.
  - Action: (1) tick; read the caps of `a1`, `a2` and `b1`; (2) feed `a1` turns on `model-a` worth $1.50, then a turn worth $0.80 while a tool call is running; tick; (3) from the `a1` session call `plans_run_checks` and `plans_report`; (4) call Raise budget and Stop from an agent session, MCP and the app token; then as the owner press Raise budget to $4; (5) fail `a2` twice so it retries, run its verifier and two review rounds, all on one $6 cap that the second review round crosses; (6) feed `a3` turns from `model-z`, which has no price, past 2,000,000 tokens; feed `a4` credit turns past 200 credits after removing `creditUsd`; (7) run `c1` and `c2` as one batch whose turns total $9; (8) bind `a5` to a Crew Mode session and make one usage read for `b1` fail; tick; (9) save a new price table version with `model-a` at double; read the receipt of `a1`; (10) export `a1`'s receipt as JSON and from the CLI, and read `plans_view` action `receipt`; run a retro; (11) on `a2` press Stop; (12) put `prices` in `.avoozl.json`; give `b1` a $100 budget with a content-rule block on its brief and an unpassed proof; (13) give `w1` a $2 cap in `warn` mode and feed $2.50.
  - Expected: (1) caps are $2, $6 and $4 with their levels; (2) after the read `a1` gets no new session, its session gets one stop message delivered only after the running turn, no stop, interrupt or close call is made, and the receipt shows $2.30 and an overrun of $0.30; (3) `plans_run_checks` answers `budget_reached` and `plans_report` is accepted; `a1` is in Needs you with Raise budget and Stop and has not lost an attempt; (4) the three callers get 403; the owner's raise is recorded with who, from, to and the price version, `a1`'s live session gets one go-on message, and `d1` waits for `a1` as before; (5) the retries, verifier and reviews add up on one receipt, and no third review round is dispatched; (6) `a3` and `a4` each warn once, stop at their token or credit cap, and show unpriced lines; (7) the batch stops at its $8 sum cap and each task's receipt shows half of the shared turns; (8) `a5` and `b1` show spend unknown with their reasons, keep running, and `b1` keeps its last known spend with its time; (9) the receipt shows dollars from the newest version and names it, and the stop and raise keep their version-1 dollars; (10) the export, CLI and MCP give the same object, it holds no prompt or transcript text, and the retro payload has `a1`'s totals by stage and model; (11) `a2` pauses like Deferred, its session and worktree are untouched, and its dependents wait; (12) validation refuses the file and names the key, and `b1`'s budget does not open its content gate or skip its proof; (13) `w1` is never stopped or messaged, shows Over budget $2.50 of $2.00 on its card and one Needs you item, appears on Flow as over budget, and counts on the Dashboard.
  - Failure means: a task can spend past its cap without a person, a stop ends a running turn, or a budget opens a gate.
  - Next decision: stop by closing the session instead of by message, or cap by tokens instead of dollars.
  - Built: dbdad6c `src/app/test/proof-p41.test.mjs` passes (steps 1-12 plus 13, warn mode).

## Phase 28: Retro prompt and skill proposals, and lessons

Owner approval 2026-11-13 (Requirements 68–70, design §4.18). Numbered
after Phase 27 because task IDs never move. It widens the retro of 12.9 and
the PDCA check of 12.10; everything proves with fake workers and a fake
retro model.

- [x] 28.1 Prompt registry and override store, after 12.9 [R68.2, R68.5, R68.8, R68.9] (§4.18, F121–F123)
  - The five built-in prompts as named sections with shipped sha256 values and the locked sections; the per-workspace override file under `~/.config/avoozl/prompts/` with versions, shipped text, diff, hashes, proposal, who and when; person-only `prompt.override.revert`; briefs composed from overrides; agent-prompt overrides as labeled seed sections (F125); the steering template from the override; the outrank line in every brief.
  - Built: `a0a0771` (`src/app/prompts.mjs`, overrides under `~/.config/avoozl/prompts/`; agent prompts split into named sections with Person only and Untrusted data locked).
- [x] 28.2 Prompt and skill proposals in the retro, after 28.1 [R68.1, R68.3–R68.6] (§4.18, F124)
  - Retro brief gains unlocked sections with hashes and up to 3 skill texts of 8,000 characters; reply schema adds `prompt` and `skill` with `base`, `diff`, structured `evidence` (3 or more runs) and `lessons`; drop a diff that does not apply, a stale base, missing evidence, or a locked section, each with its reason; the `proposal` content-rule boundary.
  - Built: `a0a0771` (`flow-retro.mjs` `memoryBrief`, `changeProblem`; `proposal` and `lesson` content-rule boundaries).
- [x] 28.3 Approve and where each change lands, after 28.2 and 14.10 [R68.7–R68.11] (§4.18)
  - Person-only approve (403 for sessions, MCP, app token and plugins); prompt writes override version N; repository skill makes an intake item with source `retro` and one leaf through `intake.deliver`; external skill writes a Suggested change note on the plugin card with Copy; nothing edits a shipped file or a pinned plugin.
  - Built: `a0a0771` (`decideProposal` hooks; repository skill leaf via `deliverRetroSkill` in `intake.mjs`, source `retro`). Tested against fakes in Local only; the GitHub-mode pull request path is not run.
- [x] 28.4 Prompt and skill versions on attempts and PDCA, after 28.3 and 12.10 [R68.12, R68.13] (§4.18)
  - Attempts record `prompts` and `skills` (tool calls first, then the report's optional `skills`); receipt and Timing fold show them; PDCA per version with the "mixed" mark; revert proposals for prompt and skill changes.
  - Built: `a0a0771` (prompt version stamped at bind, skills from `plans_report` `skills`; Timing fold `versions`). Skills from tool-call reads are not wired: only report-listed skills are recorded.
- [x] 28.5 Lessons store, write and read, after 28.2 and 12.10 [R69.1–R69.6, R69.9, R70.1] (§4.18)
  - `~/.config/avoozl/lessons.sqlite` with the fields and `context`; written on approve as `untested`, updated by PDCA; summary-only validation and the `lesson` boundary on write and use; fixed trait list; the brief's 10 ranked lessons and the "did not work" list; cited IDs checked; `flow.lessons.share` and `read` per workspace; untested expiry; the raw store never in a repository or GitHub.
  - Built: `a0a0771` (`src/app/lessons.mjs`, `~/.config/avoozl/lessons.sqlite`).
- [x] 28.6 Lessons packs and export, after 28.5 and 16.3 [R69.7, R69.8, R70.6] (§4.18, §4.14)
  - Bundle part `lessons` with `avoozl-lessons.json`; `plugin.lessons.preview` and person-only `plugin.lessons.import {previewHash}`; read-only imported lessons named by plugin and version; a new pack version marks changed lessons and retires removed ones; person-only `lessons.export` through the content rules.
  - Built: `a0a0771` (bundle part `lessons`, `plugin.lessons.preview`, `plugin.lessons.import`, `lessons.export`).
- [x] 28.7 Healing, after 28.5 and 28.4 [R70.2–R70.5] (§4.18)
  - Drift checks at each retro and on read; confidence steps; `stale` and `needs re-check` marks that clear on confirmation, all in `history`; marked lessons left out of the citable list; the lessons review every `reviewEvery` retros with `lessonEdits` for a person; no delete; override drift at backend start with the three-way diff, a merged rebase proposal, the override kept with a warning, and locked sections always from the new text.
  - Built: `a0a0771` (`healLessons`, `confirmLesson`, lessons review, override drift computed on read with `merge3`). The model list comes from the `kirocrew.models` cache, which nothing fills yet, so the model trigger is tested against fakes only.
- [x] 28.8 Proposals and Lessons views and Settings, after 28.7, 28.6, 12.11 and 12.12 [R68.14, R69.10, R70.7] (§4.18, §8.4)
  - Flow views Overview, Proposals (diffs, evidence, cited lessons, Approve and Reject, prompt versions with Revert, the three-way diff) and Lessons (filters for pattern, outcome, source and state; confidence, last confirmed, stale reason, History); Settings › Flow › Lessons with the two switches and three numbers; checked by drawing the page at 375 and 1280 px in light and dark.
  - Built: `b6ea704`, `a66ce80` (`FlowMemory.tsx`, Settings › Flow › Lessons, plugin card pack and notes); drawn at 375 and 1280 px, light and dark, in a harness with fake data.

- [ ] 28.9 Share chosen lessons, after 28.8 [R69.1, R69.11–R69.15] (§4.18)
  - Share candidates in the Lessons view (kept, unmarked, own; evidence, fit, confidence) with why; person-only `lessons.share.preview` and `lessons.share {ids, previewHash}`; summaries-only pack file `.avoozl/lessons.json` merged by ID, content rules at `lesson` and `github`; a branch, commit and pull request to the plans repository (plans-repo) or code repository (single-repo), a commit only when GitHub cannot be reached; Local only shares nowhere; `lessons.export {raw: true}` for the driver export of 26.2.
  - Open: in flight in PR #17 on mtdowling/avoozl; not merged.

- [ ] avoozl-p42 P42 Proof: prompt and skill proposals, and lessons [R68, R69, R70] (§4.18)
  - Setup: isolated temporary workspaces `W1` and `W2` with a fake config directory, each with one repository (`W1`'s with `.kiro/skills/tests/SKILL.md`), declared check `npm test`, and an approved spec with leaves `a1`–`a12`; a fake plugin `p1` whose folder has a skill file and a lessons pack version 1; a fake terms file banning `secretword`; fake workers whose reports name the skills they loaded; the fake retro model and a fake model list.
  - Action: (1) finish 10 tasks in `W1` with a scripted low first-pass rate; let the retro propose a `brief.worker` diff, a diff to the `untrusted-data` section, a repository skill diff, a `p1` skill diff, a diff with a stale base, and one with `secretword`; (2) approve all that stand from an agent session, then as the owner; (3) finish 10 more tasks with first-pass rate up; then 10 in which a second override also takes effect; (4) press Revert on `brief.worker`; (5) set `W2`'s traits to match and finish 10 tasks; read `W2`'s retro brief; (6) set `flow.lessons.read` false in `W2` and run its retro; (7) give a lesson's finding a path and an issue number; (8) drop `npm test` from `W1`'s checks, remove a model from the list, and age a kept lesson past 180 days; then confirm it with fresh runs; (9) run the fifth retro and approve a merge of two lessons; (10) change the shipped `brief.worker` steps section under the override, then a locked section; restart the backend; (11) import `p1`'s pack, then pin version 2 with one lesson changed and one removed; (12) export lessons as the owner and from MCP.
  - Expected: (1) the locked, stale and blocked proposals are dropped with their reasons and no matched text; (2) the agent gets 403; the owner's approval writes override version 1 outside the app's files, makes one leaf in `W1`'s repository that integrates the skill change, and puts a note on `p1`'s card with nothing sent; sessions after approval show the override's version, running ones keep theirs; (3) PDCA marks the prompt change helped and its lesson `kept`, and the second window "mixed"; (4) the shipped text returns and the revert is recorded; (5) `W2`'s brief holds `W1`'s kept lesson first with no task ID, path or repository name from `W1`, and the undone one under "did not work"; (6) `W2`'s brief has only its own lessons; (7) the lesson is refused and the proposal still stands; (8) the lesson goes `stale` or `needs re-check` with each reason, leaves the citable list, and clears when confirmed, each step in its history; (9) the merge appears as a diff for a person and the merged-away lesson stays as history; (10) the override is flagged with a three-way diff and a rebase proposal while sessions keep it with a warning, and the locked section's new text is used at once; (11) import shows a preview first and needs the owner; version 2 marks the changed lesson and retires the removed one; (12) the owner's export passes the content rules and MCP gets 403.
  - Failure means: a retro can change what agents are told without a person, or one workspace's text reaches another through lessons.
  - Share (28.9): (13) in `W1` (plans-repo mode with a fake GitHub) preview a share of the kept lesson and an untested one, share from MCP, then as the owner; (14) set `W2` to Local only and open its Lessons view.
  - Share expected: (13) only the kept lesson is a candidate; MCP gets 403; the owner's share opens one pull request to the plans repository with `.avoozl/lessons.json` holding summaries only (no context, history, workspace ID, task ID or repository name); (14) Share is off and says lessons share nowhere.
  - Next decision: keep prompt proposals and drop shared lessons, or share lessons only through packs.
  - Built: `a0a0771`, `src/app/test/proof-p42.test.mjs`, steps 1–12 with fake workers, a fake retro model, a fake model list and a fake plugin; W1 uses leaves a1–a70 because the steps finish more than 12 tasks. Not run live.

## Phase 29: Activity log

Owner request 2026-11-13 (Requirement 71, design §4.19). Numbered after
Phase 28 because task IDs never move. Tests use isolated temporary
workspaces, a fake GitHub and a fake plugin.

- [x] 29.1 Activity table, helper and screening, after 10.4 [R71.1, R71.4, R71.5, R71.8] (§4.19)
  - `activity_log` with a unique `key` for derived rows; `recordActivity` in `src/app/activity-log.mjs` validates source and kind, trims the summary to 200 characters, keeps only plain target IDs and `https:` links, screens with the built-in secret and path screens and the `activity` content boundary, and saves a matched or unchecked row redacted; a test fails if a secret-shaped value is saved.
  - Built: `84b92b4`, PR #12 (`src/app/activity-log.mjs` `recordActivity`; `src/app/test/activity-log.test.mjs`).
- [x] 29.2 Local actions and tick events, after 29.1 and 14.10 [R71.2, R71.3] (§4.19)
  - `execute` records the listed operations with source `local` or `mcp` and the actor; the tick diffs a snapshot of verdicts, Project item orders, label events, incoming items and conflicts and records each change once by key; the Wave write-back is recorded where it is written; recording never fails the action.
  - Built: `84b92b4`, PR #12.
- [x] 29.3 Retention, `activity.list` and MCP, after 29.2 [R71.6, R71.9] (§4.19)
  - `activity.retentionDays` (default 30, 1–365) with `activity.settings.get` and person-only `activity.settings.update`; `pruneActivity` on every `workspace.tick`; `activity.list` with filters, 100-row pages and its facets; `plans_view` action `activity` reads it and `recent` keeps the Dashboard timeline.
  - Built: `84b92b4`, `e8c84e7`, PR #12 (`activity.list`, `activity.settings.update`, `pruneActivity`, `plans_view` action `activity`).
- [x] 29.4 Activity tab and the retention setting, after 29.3 and 12.11 [R71.7] (§4.19)
  - The Activity tab with the `History` icon, `ViewHeading`, the shared filter panel (Source, Kind, Actor), 100 rows per page with Show more, task targets that open the drawer and GitHub links with `target="_blank" rel="noopener noreferrer"`; the Keep activity (days) field on the tab, saved by a person.
  - Built: `84b92b4`, `e8c84e7`, PR #12 (`ActivityView.tsx`, Keep activity (days) on the tab; `kirocrew-app/ui/test/activity.test.mjs`).

- [ ] avoozl-p43 P43 Proof: activity log [R71] (§4.19)
  - Setup: an isolated temporary workspace with one repository, a fake GitHub in single-repo mode with a Project, an approved spec with leaves `a1` and `a2` (`a2` requires `a1`), a fake tracker plugin, and a fake terms file banning `secretword` for every boundary.
  - Action: (1) from the page press Start now on `a1`, pull the Andon cord, resume it, set `a2` to Deferred, save Flow settings, approve the plugin and change the writer model; (2) do one dispatch through MCP; (3) on the fake GitHub merge `a1`'s closing pull request, move `a2` to Deferred as an allowed actor and as another actor, set Wave by hand, apply a trigger label, and edit a managed title; tick twice; (4) add a tracker conflict and a new plugin incoming item; tick; (5) record a row whose summary holds `ghp_` plus 36 letters, and one holding `secretword`; (6) set retention to 1 day, age a row 2 days, and tick; (7) read the Activity tab and `plans_view` action `activity`, filtered by source `github`.
  - Expected: (1) one `local` row each, with the person as actor; (2) one `mcp` row naming the session; (3) one row each for the merge, the order, the ignored move, the revert, the label and the conflict, the same after the second tick; (4) one `plugin` row each; (5) both saved redacted, and no row holds either value; (6) the old row is gone; (7) the tab and MCP show the same rows newest first, a task row opens the drawer and a GitHub row opens a new tab.
  - Failure means: something that changed the workspace leaves no row, or the log can hold a secret or a private term.
  - Next decision: record from each step instead of a snapshot diff, or keep redacted rows out of the log.
  - Open: no named proof run; the parts are covered by `src/app/test/activity-log.test.mjs`.

## Phase 30: Provider health and switching models

Owner request 2026-11-13 (Requirement 72, design §4.20). Numbered after
Phase 29 because task IDs never move. It reads health from the usage and
row reads Avoozl already makes and moves running chats with Kiro Crew's own
per-chat model change (F126); everything proves with fakes for Kiro Crew.

- [x] 30.1 Provider health from usage and errors, after 12.12 [R72.1–R72.4, R72.17, R72.18] (§4.20, F127, F128)
  - Machine-local `providers` settings (`lowPercent`, `cooldownMinutes`, `windowHours`, `limits`, `groups`, `fallback`) with validation, refused in `.avoozl.json`; `provider_health` rows; usage marks after each usage read; error marks from the timing row read (kind first, then words, kind stored only); recovery by a later turn or the cooldown; person marks until undone; `providers.view` and person-only `providers.settings.update` and `provider.health.clear`.
  - Built: `bd54c3e`, PR #13 (`src/app/provider-health.mjs`, `providers.view`, `providers.settings.update`, `provider.health.clear`).
- [x] 30.2 Routing skips low and out, after 30.1 and 11.11 [R72.5–R72.7] (§4.20)
  - `chooseSession` drops `out` and then `low` choices; the replacement, then `fallback`, for no rule or nothing left; never a review role's model; wait with a reason when nothing is healthy; retries keep a model until it is out; the dispatch path without rules does the same; Preview shows it.
  - Built: `bd54c3e`, PR #13 (`chooseSession` in `src/app/placement.mjs`).
- [x] 30.3 Switch running chats, after 30.1 [R72.8–R72.11] (§4.20, F126)
  - The backend's pass over live tick sessions on an `out` model; target choice; `POST /api/chat/slots/<slot>/model`; `deferred` read as switching at the next turn; binding `model` and `switches`; `provider_switches` records and the `onSwitchRecorded` activity hook writing one `model.switch` row per record; a refusal not retried; the served-model gate across switches.
  - Built: `bd54c3e`, PR #13 (the backend pass, `provider_switches`, `onSwitchRecorded`).
- [x] 30.4 Manual Switch model, after 30.3 [R72.12–R72.15] (§4.20)
  - `provider.switch.preview` with its hash; person-only `provider.switch` with `alsoNewTasks` marks and the replacement; MCP refusal and app-backend owner-only; pending switches applied by the backend pass.
  - Built: `bd54c3e`, PR #13 (`provider.switch.preview`, `provider.switch`).
- [x] 30.5 Switch model dialog, Needs you, and Settings › Providers, after 30.4 [R72.12, R72.13, R72.16, R72.17] (§4.20, §8)
  - The Switch model button in the Dashboard header and on In flight; the dialog with From, To from `GET /api/models`, Also new tasks, the preview and marks with Undo; `conflicts.view` kind `provider-out` in Needs you; the Providers settings tab.
  - Built: `9a92b96`, PR #13 (`ProvidersSettings.tsx`, the Switch model dialog, `provider-out` in Needs you). Follow-ups in flight: PR #26 and PR #27.

- [x] avoozl-p44 P44 Proof: provider health and switching [R72] (§4.20)
  - Setup: an isolated temporary workspace with one repository and fake crews; machine `providers` with `limits` `alpha-1` 100 credits, `fallback` `gamma-1`, `cooldownMinutes` 30; a routing rule giving routine leaves weighted choices `alpha-1` (weight 2) and `beta-1`; a review role on `delta-1` with `distinctFrom: model`; a fake usage feed, fake session rows, and a fake Kiro Crew model change that answers `deferred` for a busy chat and 404 for one slot.
  - Action: (1) with no `providers`, tick and preview; (2) feed `alpha-1` 85 credits; tick; (3) feed 20 more; read health; tick; (4) feed a session row of kind `usage_limit` from a `beta-1` chat, then a 429 row twice from an `alpha-2` chat; (5) let 31 minutes pass, and feed a later `beta-1` turn; (6) retry a task whose kept model is `alpha-1` while it is low, then while it is out; (7) run the backend pass with `alpha-1` out and chats on it, one busy and one whose slot answers 404; (8) review a switched writer; (9) preview and confirm Switch model from provider `alpha` to `gamma-1` with Also new tasks, then confirm with a stale hash; (10) call the switch, undo and settings save from MCP, an app token and an agent tool; (11) read Needs you; undo the mark.
  - Expected: (1) picks match the earlier ticks exactly; (2) `alpha-1` is low and new tasks take `beta-1`; (3) `alpha-1` is out, no new session opens on it, and Preview says why; (4) provider `beta` is out and `alpha-2` goes low then out, with no row text stored; (5) both clear; (6) the retry keeps `alpha-1` while low and moves off it when out, saying so; (7) both chats are asked to switch to a healthy model not on the review role's model, the busy one is recorded `deferred`, the refused one `refused` once and never retried, the sessions and worktrees are untouched, and each switch reaches the activity hook; (8) the verdict counts and is refused only when a reviewer model equals one of the writer's; (9) preview writes nothing, the confirm queues one switch per chat and marks the provider out with `gamma-1` for new tasks, and the stale hash gets 409; (10) every call is refused, MCP with the person-only refusal; (11) one `provider-out` item per out mark shows the switched count, and Undo clears the person's mark.
  - Failure means: a task can open on an out provider, a switch loses a chat's work, or a non-person can switch models.
  - Next decision: switch by opening a new session on the same branch instead, or mark health only from errors.
  - Built: pass, `src/app/test/proof-p44.test.mjs` (`e56ddc8`, `bd54c3e`), PR #13.

## Phase 31: Stop all agents and searchable pickers

Owner approval 2026-11-13 (Requirements 64.12–64.16 and 73, design §4.11
and §8.9). Numbered after Phase 30 because task IDs never move.

- [x] 31.1 Stop all agents in the backend and CLI, after 24.1 [R64.12, R64.14–R64.16] (§4.11)
  - `flow.stop {full: true}` is person only (MCP refused), needs the app backend's session stopper, records a full `all` stop with the sessions it stopped, stops each live tick-opened session, marks stopped bindings and attempts "Interrupted by stop" without spending a retry, holds checks and review sessions while open; Resume turns interrupted deliveries back to `failed` so the next tick re-dispatches on the same worktree, agent and model with a brief that says so; `avoozl flow stop --full`.
  - Built: `75a61e3`, PR #11 (`flow.stop {full: true}`, Interrupted by stop in `src/app/delivery.mjs`, `avoozl flow stop --full`; `src/app/test/flow-full-stop.test.mjs`).
- [x] 31.2 Stop all agents in the dialog, after 31.1 and 24.2 [R64.12, R64.13] (§4.11)
  - The dialog's two choices, the full stop's confirm warning that replies in progress are lost and saved files are kept, and the banner's count of stopped chats.
  - Built: `2456191`, PR #11 (`StopLine.tsx`).
- [x] 31.3 One searchable picker for tasks and specs, after 24.2 [R73] (§8.9)
  - `Picker.tsx` combobox with ID, title and spec matching, state badges, the keys and ARIA of §8.9, and at most 50 rendered results; used in the Stop the line target, the filter panels and Start now; a test filters 5,000 tasks.
  - Built: `2456191`, PR #11 (`Picker.tsx`, `picker.ts`; `kirocrew-app/ui/test/picker.test.mjs`).

## Phase 33: Only open tasks get issues

Owner decision 2026-11-13 (Requirement 74, design §6.3). Numbered after
Phase 32, which the remote relay holds, because task IDs never move.

- [x] 33.1 Skip done tasks in projection, after 3.7 [R74] (§6.3)
  - `github.issues.includeDone` (default `false`) in the policy, the planning identity and the GitHub settings page; projection leaves out a done task with no issue, drops edges from it, keeps the plan issue, puts an open task of a skipped package under the plan issue, and the preview returns `skippedDone`; `src/app/test/github-include-done.test.mjs`.
  - Built: `da8a2b4`, PR #34.

## Phase 34: Investigate first, evidence, staying current, rules, fix share, ship mode

Owner decisions 2026-11-13 (Requirements 75–80, design §4.11 and
§4.21–§4.25). Numbered after Phase 33 because task IDs never move. Tests use
isolated temporary workspaces, a fake GitHub and fake workers.

- [ ] 34.1 Findings, falsifier and the confidence gate, after 11.11 and 12.9 [R75] (§4.21)
  - `plans_report` kind `findings`; the `falsifier` role and session; the gate; the Needs you item with Go ahead, Investigate again and Stop; `delivery.investigate` settings and manifest `investigate`; Flow spans and budget.
- [ ] 34.2 Evidence bundle, after 34.1 and 22.3 [R76] (§4.22)
  - The local bundle, `plans_report` field `evidence`, screening, `task.evidence`, the drawer section, the pull request comment, and the driver export.
- [ ] 34.3 Bring pull requests up to date, after 15.4 [R77] (§4.23)
  - Base head tracking, the `base-moved` feedback message, the force-push refusal, and the local merge-forward.
- [ ] 34.4 Corrections and rules, after 28.3 [R78] (§4.24)
  - The `corrections` table and its four sources, the retro grouping and rule proposal, the steering leaf, and corrections in Flow and PDCA.
- [ ] 34.5 Fix-work share, after 12.11 [R79] (§4.11)
  - The fix-work rule, the Flow card and charts, and the retro payload.
- [ ] 34.6 Ship mode, after 15.4 [R80] (§4.25)
  - `delivery.ship` in workspace and repository settings, the briefs, the Ready to merge item, and Integrate in Local only; Settings > Delivery shows it.

- [ ] avoozl-p45 P45 Proof: investigate first, evidence, staying current, rules, fix share and ship mode [R75–R80] (§4.21–§4.25)
  - Setup: an isolated temporary workspace in single-repo mode on a fake GitHub with leaves `a1` (plain), `a2` (`size: "small"`) and `a3` (plain), a bugfix spec with leaf `f1`, fake workers and a fake falsifier.
  - Action: (1) dispatch `a1` with findings at `high` and a `stands` reply; (2) dispatch `a3` with a `refuted` reply; press Investigate again, then Go ahead; (3) dispatch `a2`; (4) attach a screenshot and a 30 MB file to `a1`; (5) move the base branch so `a1`'s pull request conflicts; (6) request changes with the same point on `a1` and `a3`; run the retro; approve its rule; (7) finish `f1`; read Flow; (8) set `delivery.ship` to `manual` and let `a3`'s checks pass.
  - Expected: (1) no file changes before the gate, then coding; (2) the task waits in Needs you, one new round, then coding; (3) no investigation; (4) the screenshot is in the drawer and the comment, the large file refused; (5) one `base-moved` message, a merge commit and no force push; (6) one rule proposal naming both corrections and one steering leaf; (7) fix-work share 1 of 3; (8) no auto-merge, one Ready to merge item, and completion after the person merges.
  - Failure means: coding starts on refuted findings, a writer force pushes, or a manual ship merges without a person.
  - Next decision: keep the falsifier only for large tasks, or drop the PR comment and keep evidence local.
