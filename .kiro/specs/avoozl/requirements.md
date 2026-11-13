---
category: Planning
---
# Requirements: Avoozl as a Kiro Crew-native, GitHub-native product

## Introduction

This spec assesses Avoozl's future and defines the smallest useful product that
runs inside Kiro Crew, works fully offline from GitHub, and uses GitHub for
shared plans and delivery. It is a planning and product-design spec. Nothing in
it changes code, GitHub repositories, app settings, or local databases.

The three documents together form the recommendation:

| Document | Holds |
|---|---|
| `requirements.md` | Evidence baseline, product question, scope, and the behavior the product must have, with acceptance criteria |
| `design.md` | Product thesis, non-goals, state ownership, architecture, workflows, Kiro Crew integration map, app UX, code disposition, moving an existing workspace, release gates, kill criteria, and the final product statement |
| `tasks.md` | The ordered proof sequence and phased roadmap as checkable tasks |

**Autopilot** is the name people read for delivery: the tick starting ready
leaves on its own. Only the name changes (owner decision, 2026-11-13). The
`delivery` key in `.avoozl.json`, the `delivery.*` operations, the CLI and the
`plans_*` MCP names stay as they are, and so do the requirements below that
say delivery.

Every conclusion carries one label:

- **Verified**: confirmed by reading current code, documentation, or data, with the source named.
- **Inferred**: follows from verified facts, but was not directly observed.
- **Proposed**: a recommendation this spec makes.

### Sources inspected

- Avoozl source, branch
  `feature/kirocrew-github-delivery`, commits `df6778a`, `d262ce0`, `8a64fee`,
  and `e54ebf5`, compared with `main`.
- The prior direction draft (a local note, not published).
- `docs/evidence/github-projection-2026-11-11.md` (live projection proof).
- The Nupp planning workspace and its database
  `.avoozl/local/workspace.sqlite`, opened read-only.
- Kiro Crew documentation and shipped app sources in the installed
  `KiroCrew.app` bundle (`kiro_crew/docs`, `kiro_crew/apps`,
  `kiro_crew/apps/builtins/*`), plus installed app manifests under
  `~/.kiro/crew/apps`.
- GitHub documentation and changelog pages for sub-issues, issue
  dependencies, issue types, milestones, Projects, iteration fields, closing
  keywords, and `gh project`. Design facts F37–F48 cite each page.
- Kiro documentation for specs: [Specs](https://kiro.dev/docs/specs) and
  [Best practices](https://kiro.dev/docs/specs/best-practices).

### Owner decisions of 2026-11-11 (update)

The owner made GitHub issues and Projects the default record for shared work,
defined two GitHub modes (plans-repo and single-repo), kept local tasks as an
opt-in that never syncs, and required every plan to be a Kiro spec folder.
Requirements 28–31 hold these decisions; design.md lists them under
"Decisions already made". Where an older criterion below conflicts, the
criterion says which mode it applies to. Requirement 32 (2026-11-12) adds a
GitHub setup wizard, so nobody sets up GitHub by hand. Requirement 33
(2026-11-12) moves Project Status, the blocked signal, and leaf-issue closing
to GitHub's own features; the criteria it changed say "changed 2026-11-12".
Its criteria 8–10 (2026-11-12) make a close without merged code by an
allowed actor an order that releases dependents.

## Evidence baseline

### Facts the brief asked to preserve

| # | Claim | Result | Evidence and correction |
|---|---|---|---|
| F1 | Issue Radar can edit GitHub labels. | **Verified** | `issue_radar/backend/github_client_writes.py` adds and removes issue labels. Crews may write only their claim label and the configured needs-human label (`crew_brief.md`). |
| F2 | Issue Radar's Investigate action opens one session. | **Verified, refined** | `http_routes/investigation.py`: the frontend opens one Kiro Crew chat through core chat routes, files it in an `Issue Radar - <repo>` folder, and stores a local record so a repeat click resumes the same session. It writes nothing to GitHub. |
| F3 | Issue Radar does not break issues into GitHub sub-issues. | **Verified** | No sub-issue code exists in the Issue Radar backend. It reads dependency edges (native and inferred from timeline cross-references) for display and wake signals only. |
| F4 | Issue Radar crews do not enforce blockers before claiming. | **Verified, refined** | `crew_brief.md` selection keeps open issues that carry *any* scope label (OR semantics; an empty scope means every open issue), drops skipped and `crew:`-labeled issues, then picks at random. Blockers feed only a `dependency-unblocked` wake for items a crew already holds (`crew_runtime.py`), from a dependency cache with a 600-second TTL (`store_deps.py`). |
| F5 | Task Runner decomposes one task into internal execution steps. | **Verified, refined** | `docs/task-runner.md`. The app id is `projects`, display name Task Runner, API `/api/taskrunner`. Step verification uses one gateway-wide `taskrunner.test_command`, not a per-run command. Headless runs are deny-by-default for tools. |
| F6 | Task Runner steps do not become GitHub issues. | **Verified** | The Task Runner manifest declares only `/api/taskrunner` and a `refine` event; its documentation describes no forge writes. |
| F7 | Spec Builder writes requirements, design, and task Markdown. | **Verified, refined** | `spec_builder/backend/parsers.py`: `requirements.md`, `design.md`, `tasks.md`, plus `.spec-state.json`. Only requirements and design are approvable; approving the task list *is* the handoff into one autonomous execution session. There is no fourth phase for another app. |
| F8 | Crew Mode supervises independent worker sessions. | **Verified, refined** | `docs/agents.md`, `docs/work-ledger.md`. Crew Mode is a feature preview behind Settings → Developer. A conductor (`kirocrew-conductor`) dispatches one `kirocrew-worker` session per item. Items must be independent: an item that consumes another item's output is not a valid item. |
| F9 | Crew Mode work items are not GitHub tasks. | **Verified** | Work-ledger items hold title, acceptance, state, status, summary, artifacts, and an optional `pr` number. They have no issue identity and no dependency edges. |
| F10 | Code Review Sage owns deep pull-request review. | **Verified** | Code Review Sage manifest and skills `sage-review` and `learn-from-sage`: one isolated session per pull request, findings staged as a draft GitHub review on publish or automatic posting. |
| F11 | GitHub projection supports native cross-repository dependencies. | **Verified, with limits** | `src/app/github-sync.mjs` `projectPlanIssues` and the live proof. Limits: every target repository must be registered and private; a dependency outside the plan must already be projected; drift detection applies to edges only. |
| F12 | Fresh Avoozl workspaces can recover projected issues from markers. | **Corrected** | Recovery reuses existing issues only when the *same approved plan ID* is projected again: issues are matched by the hidden marker's `taskId` and `planId` under the managed label. It does not rebuild local tasks, status, or edges from GitHub. `syncGitHubIssues` fails when a marker names a task that is not present locally. A closed projected issue makes re-projection fail with 409. |
| F13 | Avoozl verifies exact pull-request completion and required checks. | **Corrected** | `src/app/github-completion.mjs` implements the check correctly and was proved live. It is called only by `scripts/github-completion-live.mjs`. No operation, CLI command, MCP tool, or dependent-release path uses it. It also requires the closing pull request to live in the issue's repository. |
| F14 | The current Kiro Crew Avoozl app is only a proof shell. | **Verified** | `kirocrew-app/app.json` declares one page and one skill, no backend, no MCP server, and no crons. `ui/src/App.tsx` renders four static cards and one button that opens a draft chat. |

### Additional facts that change the plan

| # | Fact | Label | Evidence |
|---|---|---|---|
| F15 | Trigger labels and managed state labels are the same label today. One `label` (default `avoozl:ready`) authorizes intake *and* is the readiness label projection adds. Intake supports one label, one assignee, an actor allowlist, and a minimum permission. There are no AND, OR, or exclusion rules. | **Verified** | `github-sync.mjs` `syncGitHubIssues`, `prepareGitHubRepository`; `repository-settings.mjs`. |
| F16 | Avoozl refuses public repositories for intake and projection with HTTP 403. This was a lockdown for testing, not a product rule; the product must support public repositories. | **Verified** (code); owner decision 2026-11-11 | `prepareGitHubRepository` and `requirePrivateRepository` in `github-sync.mjs`. |
| F17 | Managed-field conflict detection covers dependency edges only. Titles and the managed body section are overwritten without comparing to the last applied value. | **Verified** | `projectPlanIssues` compares `managedBlockerIssueIds`; title and body go straight to `updateIssue`. |
| F18 | GitHub task dispatch and all local execution use Avoozl's own agent host and providers (`codex`, `claude`, `openhands`), not Kiro Crew. | **Verified** | `startAuthorizedIssue` calls `ops.manager.start`; `src/app/providers/`. |
| F19 | The feature branch is 6 commits ahead and 31 commits behind `main`. `main` adds design-prose extraction, durable andon safety controls, a team coordination control plane, and remote execution targets. The Nupp database already contains `main`-only tables (`extractions`, `plan_facts`, `execution_jobs`, `safety_*`, `team_checkpoints`). | **Verified** | `git rev-list --left-right --count main...feature/kirocrew-github-delivery`; Nupp `.tables`. |
| F20 | A Kiro Crew app may declare a `node` backend that the gateway spawns on loopback and reverse-proxies at `/apps/<name>/api/`, plus `mcpServers`, `crons`, `agents`, and `skills`. Third-party apps run with gateway privileges after the user grants trust. | **Verified** | `apps/manifest_sections.py` `BackendConfig`; `apps/routes_proxy.py`; `docs/apps.md`. The current Avoozl app is installed and trusted (`~/.kiro/crew/apps/avoozl/installed.json`). |
| F21 | No supported API lets an app backend create a *visible, project-bound* Kiro Crew session. The app spawn SDK starts background agent turns with no project or working-directory argument. `session_create` has no project argument; a session inherits a project only from a folder whose `project_dir` a person set. | **Verified** | `apps/spawn_sdk.py`; `docs/session-control.md` (`session_create`, `chat_folder_update`). |
| F22 | Kiro Crew inbound webhooks run one LLM turn in an ephemeral session, bind loopback by default, and use Kiro Crew's own HMAC headers, not GitHub's webhook signature. | **Verified** | `docs/inbound-webhooks.md`. |
| F23 | Issue Radar crew configuration lives in Issue Radar's private app data and routes (`/api/apps/issue-radar/crews`). No public contract lets another app read or write a crew's label scope. | **Verified** | `crew_ledger_spec.md`, `crew_routes.py`. |
| F24 | Issue Radar crews can merge and re-arm auto-merge, and hold at most one item per crew in the dirty-worktree phases (Implement, Addressing review). | **Verified** | `http_routes/pr_actions.py`; `docs/issue-radar-pipeline.md`; `crew_brief.md`. |
| F25 | Avoozl readiness treats `requires` and `sequence` edges as blocking and `supports` edges as advisory. | **Verified** | `src/query.mjs`. |
| F26 | Avoozl runs its own runtime machinery today: `host-scheduler.mjs` (host-wide admission with default limits of 4 per host and 2 per workspace), the agent host with activity leases, the GitHub intake webhook callback with its own capability tokens (`github-intake.mjs`), and GitHub sync and queue polling driven by Avoozl's server. | **Verified** | `src/app/host-scheduler.mjs`, `src/app/agent-host.mjs`, `src/app/github-intake.mjs`, `src/app/github-queue.mjs`. |
| F27 | Kiro Crew crons can run a shell command with no LLM call (`command` jobs), on an interval, cron expression, or one-shot time. Commands are vetted when added and on every fire; command substitution, loops, and compound commands are refused. The default subprocess limit is 300 seconds and the default wake budget is 30 minutes. An app manifest can declare crons that register on enable and are removed on disable. | **Verified** | `docs/cron-and-scheduling.md`; `apps/manifest.py` `crons`; `docs/apps.md`. |
| F28 | Kiro Crew monitor loops wake one conversation on an interval and run an agent turn each cycle in that same conversation. | **Verified** | `docs/monitor-loops.md`. |
| F29 | No documented Kiro Crew event pushes a session's completion to an app backend. Apps can declare permitted event names (Task Runner declares `refine`; Workflows declares `workflow_run_event`), but no session-lifecycle event for third-party apps was found. | **Verified** (absence in docs and manifests searched); push support **Inferred** missing | `~/.kiro/crew/apps/*/app.json`; `docs/session-control.md`. |
| F30 | Apps can declare notification channels in their manifest. | **Verified** | Issue Radar manifest `notifications.channels`. |

### Example workspace facts

The first existing workspace moved was Nupp's. All counts come from a
read-only query of its `.avoozl/local/workspace.sqlite` on 2026-11-11.

| Fact | Value | Label |
|---|---|---|
| W1–W7 epics | 7, stored in the workspace snapshot | **Verified** |
| Tasks in W1–W7 | 141 (W1 33, W2 27, W3 22, W4 9, W5 12, W6 21, W7 17) | **Verified** |
| Finished W tasks | 61 (58 implemented, 3 accepted) | **Verified** |
| Unfinished W tasks | 80 (41 partial, 30 planned, 6 deferred, 2 blocked, 1 review) | **Verified** |
| Edges among W tasks | 130 (80 `requires`, 21 `sequence`, 29 `supports`); 101 of them block readiness | **Verified** |
| Milestones | 3 (`compiler-on-core`, `runtime-flip`, `six-workload-execution`) | **Verified** |
| Document-derived entries from `todo/nupp-compiler-runtime-rewrite.md` | 94, all `planned`, generated `plan-<hash>` IDs, zero edges | **Verified** |
| Those 94 entries duplicate W task scope | Likely | **Inferred** |
| Whole database | 4,075 tasks; 3,888 are document-derived across many documents (2,036 recorded, 1,576 planned, 276 archived) | **Verified** |
| Other native-runtime documents | 357 more document-derived entries (`nupp-native-runtime-handoff.md`, `native-runtime-plan-before-consolidation-2026-10-28.md`, `nupp-native-runtime-ledger.md`) | **Verified** |
| Prior deduplication receipts | 149 `task-merge` evidence rows | **Verified** |
| Runs | 12 (6 completed, 5 observing, 1 interrupted) | **Verified** |
| GitHub projection | 0 projected issues, 0 registered intake repositories; the read-only GitHub queue tracks public repositories such as `nupp-lang/nupp` | **Verified** |
| Integration branch | `codex/native-core-first-programs` recorded in the snapshot | **Verified** |

## Product question

> What job does Avoozl own that Kiro Crew and GitHub do not already own?

**Verified gaps.** No current Kiro Crew feature or GitHub feature does all of
the following together:

1. holds a durable, multi-level task graph with stable IDs and blocking edges
   across repositories (Crew Mode items must be independent; Task Runner steps
   are internal; Spec Builder hands one checklist to one session);
2. computes readiness from those edges *before* work is claimed (Issue Radar
   claims by label and random pick, F4);
3. turns one broad goal or issue into many tracked GitHub issues with native
   edges (Issue Radar creates no sub-issues, F3);
4. releases dependents only from exact completion facts (F13).

**Proposed answer.** The brief's statement is close. It is refined in three ways:

- "assigned GitHub issues" becomes "issues selected by repository trigger
  rules", because assignment is one rule among several;
- "launches bounded work through Kiro Crew" becomes "dispatches only ready,
  bounded leaves through Kiro Crew sessions and Issue Radar", because Avoozl
  must not run agents itself;
- "keeps dependencies moving until completion" becomes "releases dependents
  only from verified completion facts", which is the testable part.

Refined statement (**Proposed**):

> Avoozl turns local goals, reviewed designs, and GitHub issues selected by
> repository rules into durable work graphs. It computes readiness from
> dependencies, dispatches only ready, bounded leaves through Kiro Crew, projects
> shared work into GitHub issues and native dependencies, and releases each
> dependent only after verified completion.

## Scope

### In scope

- One Avoozl Kiro Crew app with a real backend, page, skill, and MCP surface.
- Kiro spec folders (`.kiro/specs/<name>/`) as the only plan layout.
- Local planning and delivery with no GitHub dependency, as an opt-in.
- GitHub as the default record: issues, sub-issues, issue dependencies, and a
  GitHub Project, in plans-repo mode or single-repo mode.
- GitHub intake, projection, Project field sync, completion, and dependent
  release.
- Use of Issue Radar, Task Runner, Spec Builder, Crew Mode, Workflows, Code
  Review Sage, chat, sessions, and cron through supported interfaces only.
- A plugin seam for delivery routes and task trackers, with plugin loading
  and consent (Requirements 22, 34, 35). The public repository ships only
  test-only fake plugins; real integrations are separate packages.
- Moving an existing workspace (Nupp's) as the large proof.
- An open-source release.

### Non-goals

- An agent runtime, chat, terminal, file browser, model picker, or memory system.
- A pull-request browser or code-review agent.
- A scheduler, background poller, process supervisor, admission controller,
  webhook receiver, or notification system of Avoozl's own.
- A second writable task store for GitHub-backed work.
- Any private or company-internal integration in the public repository, by
  name or by implementation. Such integrations live in their own packages and
  plug in through the seam (Requirement 34.10).
- Reading or writing another Kiro Crew app's private data or routes.
- New GitHub Apps, hosted services, or shared databases in the first release.

## Requirements

### Requirement 1: Kiro Crew is the only agent and session experience

**User story:** As a developer, I want every planning, implementation, and review
session to be a Kiro Crew session, so that I use one place to watch and steer work.

#### Acceptance criteria

1. WHEN Avoozl starts planning or implementation work THEN the work SHALL run in
   a Kiro Crew session, Task Runner run, Crew Mode worker, workflow, or Issue
   Radar crew, and in no Avoozl-owned agent process.
2. WHEN a task has a worker THEN Avoozl SHALL show a link that opens that exact
   Kiro Crew session or run.
3. WHEN the Avoozl app is enabled THEN no separate Avoozl website, Canvas page,
   or editor extension SHALL be required for any workflow in this spec.
4. IF a needed Kiro Crew capability has no supported interface THEN the design
   SHALL name it as a missing handoff contract and SHALL NOT call a private route.

### Requirement 2: Local work without GitHub

**User story:** As a developer without GitHub access, I want to plan and deliver
work in a local repository, so that Avoozl is useful offline and for private work.

#### Acceptance criteria

1. WHEN no GitHub repository is configured THEN planning, readiness, dispatch,
   verification, local integration, and dependent release SHALL all work.
2. WHEN local delivery finishes a task THEN the result SHALL be a verified local
   commit on a local branch, and nothing SHALL be pushed unless a publication
   rule allows it.
3. WHEN `gh` is absent or unauthenticated THEN only GitHub features SHALL report
   unavailable; local features SHALL keep working.

### Requirement 3: Workspace and repository selection

**User story:** As a developer, I want to choose which Avoozl workspace and code
repositories a plan uses, so that each task runs in the right checkout.

#### Acceptance criteria

1. WHEN the app opens THEN it SHALL list known Avoozl workspaces and load the
   selected workspace's real SQLite data through the app backend.
2. WHEN a user adds a workspace THEN Avoozl SHALL accept an existing directory
   containing `.avoozl.json` or initialize an empty one, and SHALL NOT install
   example data unless asked.
3. WHEN a task names a target repository THEN Avoozl SHALL resolve it to a
   registered local checkout and SHALL refuse dispatch if none exists.
4. WHEN Avoozl creates a worker session THEN the session SHALL work in that
   task's repository or worktree, and the binding SHALL be recorded.

### Requirement 4: Goals become durable task graphs

**User story:** As a developer, I want to turn one large goal into a reviewed
graph of epics, work packages, and bounded leaves, so that work can proceed in
safe pieces.

#### Acceptance criteria

1. WHEN a user submits a goal THEN a Kiro Crew planning session SHALL draft a
   graph, and an independent critique SHALL review it before approval.
2. Every task SHALL have a stable ID that never changes after approval.
3. Every task SHALL be classified as an epic, a work package, or a leaf.
   (Changed 2026-11-13: a task is a package or a leaf; epics span plans,
   Requirement 59.7.)
4. Only leaves SHALL be dispatchable; epics and work packages SHALL complete
   only from their children.
5. A leaf SHALL be bounded: one target repository, observable acceptance
   criteria, and a completion condition.
6. Dependency edges SHALL be explicit and typed; blocking and advisory edges
   SHALL be distinguished.
7. WHEN the graph has a cycle, an unknown reference, a duplicate ID, or a leaf
   without acceptance criteria THEN deterministic validation SHALL reject it.
8. No task SHALL become executable until a person approves the exact graph
   revision.

### Requirement 5: Design-first manifests

**User story:** As a developer who wrote requirements and design in Spec Builder,
I want Avoozl to derive a machine task manifest from them, so that I can
deliver the design without retyping it.

#### Acceptance criteria

1. WHEN a Kiro spec folder (Requirement 30), including one Spec Builder wrote,
   has approved requirements (or bugfix analysis) and design THEN Avoozl SHALL
   read its files from disk and SHALL NOT call Spec Builder routes.
2. Avoozl SHALL generate `avoozl/manifest.json` in that folder, mapping each
   `tasks.md` task ID to repository, dependencies, completion condition, and
   source references in the prose.
3. A critique SHALL compare the manifest with the prose and report every
   uncovered requirement and every task with no prose source.
4. Deterministic validation SHALL check structure and references and SHALL be
   repeatable: the same inputs produce the same result.
5. The manifest and validation result SHALL be pinned to the exact Git commit of
   the prose they came from.

### Requirement 6: Readiness and bounded automatic local delivery

**User story:** As a developer, I want ready leaves to start by themselves within
limits I set, so that I do not file, start, or chase routine work.

#### Acceptance criteria

1. A leaf SHALL be ready only when it is approved, every blocking dependency has
   met its completion condition, and no conflict or human decision is open.
2. WHEN a leaf becomes ready and capacity allows THEN Avoozl SHALL dispatch it
   without a manual step.
3. Concurrency SHALL be bounded per workspace and per repository.
4. WHEN a leaf needs several internal steps THEN Avoozl MAY run it through Task
   Runner, and those steps SHALL NOT become Avoozl tasks.
5. WHEN several independent ready leaves exist and Crew Mode is enabled THEN
   Avoozl MAY dispatch them as one Crew Mode goal; leaves with edges between
   them SHALL NOT share one Crew Mode goal.
6. Each worker SHALL use an isolated worktree.

### Requirement 7: Verification, integration, and dependent release

**User story:** As a developer, I want finished work verified and integrated
before dependents start, so that later tasks build on accepted code.

#### Acceptance criteria

1. WHEN a worker reports done THEN Avoozl SHALL run the leaf's declared checks
   against the exact commit and record the result. Avoozl SHALL run them
   itself, with no model call: in a clean detached worktree at that commit,
   each check as an argument list with no shell, each with its own time
   limit, recording the exit code and a short redacted output tail, and
   removing the worktree afterwards. The runs SHALL be queued off the tick,
   one at a time per repository, and SHALL NOT start while all agents are
   stopped or while a stopped line holds the commit. A check that is not
   run, cannot start (exit 126 or 127), or times out SHALL fail the
   checking, not the writer's attempt. A verifier session SHALL open only
   for a bar that needs judgment: a prose acceptance with no declared
   check, or `verify: agent` on the task.
2. WHEN checks pass THEN Avoozl SHALL integrate the commit into the configured
   local integration branch and record the integrated commit.
3. WHEN integration succeeds THEN Avoozl SHALL recompute readiness and dispatch
   newly ready leaves.
4. Plan approval, implementation, integration, and whole-head acceptance SHALL
   remain distinct states.

### Requirement 8: Failure and recovery

**User story:** As a developer, I want a failed or lost worker to resume without
corrupting task state, so that automation is safe to leave running.

#### Acceptance criteria

1. WHEN a worker fails THEN the task SHALL keep its ID, edges, and evidence, and
   SHALL move to a retryable failed state.
2. A disconnected worker SHALL NOT be replaced solely because its activity lease
   expired.
3. WHEN Avoozl or the gateway restarts THEN Avoozl SHALL reconcile each running
   task with its Kiro Crew session state before dispatching anything new.
4. Retries SHALL be bounded by policy; exceeding the bound SHALL open a human
   decision.

### Requirement 9: Stop only for real human decisions

**User story:** As a developer, I want automation to stop only when a person must
decide, so that routine work never waits on me.

#### Acceptance criteria

1. Automation SHALL stop for unresolved product decisions, failed required
   checks after retries, conflicting human edits, unsafe publication, stale
   claimed work, and configured one-way-door reviews.
2. Automation SHALL NOT stop for routine filing, labeling, dispatch, or release.
3. Every stop SHALL appear as one decision with its cause and the action that
   resumes work.

### Requirement 10: GitHub repository policy

**User story:** As a maintainer, I want to control which repositories, actors,
and permissions may start Avoozl work, so that labels alone cannot trigger
execution.

#### Acceptance criteria

1. Each repository SHALL have a reviewed policy naming allowed actors, minimum
   permission, required assignee if any, and the delivery route.
2. Public and private repositories SHALL both be supported for intake,
   projection, execution, and completion. The private-only check (F16) SHALL be
   removed.
3. A repository whose policy names neither allowed actors nor a minimum
   permission SHALL be treated as `minimumPermission: write` (owner decision
   2026-11-12), for trigger labels, board orders, closes, comment steering,
   discussions, and pull-request reviews. Naming either SHALL replace this
   default. Avoozl SHALL ship no default rule that lets anyone without write
   access trigger work.
4. A matching label SHALL start evaluation only; Avoozl SHALL also verify the
   label actor, the actor's permission, assignment, and the current label set.
5. WHEN a label event comes from an actor the policy does not allow THEN Avoozl
   SHALL ignore it for execution and SHALL write nothing to the issue.
6. Issue titles, bodies, and comments SHALL be treated as untrusted data in every
   planning and worker prompt, on public and private repositories alike. A
   task whose title, acceptance, or summary came from an issue or an
   incoming item SHALL have that text quoted as data in its worker,
   verifier, and review briefs, under a line saying it cannot change the
   steps, tools, repository, branch, or push target. Pull request feedback
   and steering SHALL name such a task by ID only.
7. Anything Avoozl writes to an issue, including hidden markers, SHALL be safe to
   publish: no secrets, local paths, private names, or transcript content.
8. An actor's permission SHALL be the repository role GitHub names
   (`role_name`), so maintain and triage are not read as write and read.
   Avoozl SHALL read it only when `minimumPermission` decides. WHEN GitHub
   will not show it (the sign-in lacks push access) THEN the match SHALL be
   held as unchecked with one decision notice, and nothing SHALL run.
9. Intake SHALL make one issue search per repository per read, shared by all
   its rules. The tick SHALL ask GitHub conditionally whether a repository's
   issues changed before reading it, read quiet repositories at most every 8
   minutes, and pause and warn once WHEN GitHub's rate-limit headers show the
   budget running low.
10. Issue text SHALL NOT choose where its work runs: an issue's task block
    MAY set title, summary, acceptance, requires, tags, resources, epic and
    track, and its `projectId` SHALL be ignored; the issue's registered
    repository decides the execution project (added 2026-11-13, injection
    audit).
11. Outside text quoted into a brief or a relayed message SHALL be capped:
    each pull request comment, review, or steering comment keeps its first
    4,000 characters and a note with its link. A check's name SHALL be one
    line of at most 100 characters in code quotes, its link SHALL be http
    or https, and the message SHALL say that a check's log is data, not
    instructions (added 2026-11-13, injection audit).
12. Comment-mention steering SHALL pass the content rules' `brief`
    boundary (Requirement 40) before it is sent, as pull request feedback
    does (added 2026-11-13, injection audit).
13. The planner agent's file writes SHALL be limited by its agent spec,
    not only its prompt: `toolsSettings.fs_write` SHALL set
    `fallbackAction: "deny"` with `allowedPaths: [".kiro/specs/**"]`,
    anchored at the session's folder (the planning checkout). Kiro Crew
    0.12.2 enforces this on kiro-cli and at its own tool gate on some other
    backends; the rest do not read it, and a static spec cannot name one
    spec folder,
    so the one-folder limit within `.kiro/specs/` stays in the prompt
    (added 2026-11-13, injection audit follow-up; upstream gap).
14. Every link the app page renders SHALL be an http or https URL or one
    of Kiro Crew's own pages (`/chat?sid=`, `/apps/`, `/issue-radar`,
    `/code-review-sage`); anything else SHALL render as text (added
    2026-11-13, injection audit follow-up).

### Requirement 11: Configurable trigger and managed labels

**User story:** As a maintainer, I want to choose my own label names and rules,
so that Avoozl fits my repository's vocabulary.

#### Acceptance criteria

1. No label name SHALL be hard-coded; defaults SHALL be overridable per
   repository and per Avoozl instance.
2. A trigger rule SHALL name its trigger as `match`, one line of GitHub
   issue-search syntax using only `label:x` (repeat for all), `label:a,b`
   (any), `-label:` (none), `assignee:login`, `no:assignee`, and quoted
   values. Labels SHALL compare without case. Any other token SHALL be
   refused with an error naming it, never ignored. (Owner decision
   2026-11-12.)
3. Each rule SHALL map to one fixed internal action: `respond`, `plan`,
   `deliver`, `execute`, `pause`, `resume`, or `quarantine`.
4. Trigger labels SHALL be distinct from Avoozl-managed state labels, and
   validation SHALL reject a configuration where they overlap.
5. Avoozl SHALL add or remove only its configured managed labels and SHALL
   preserve every other label.
6. Rules written with the legacy keys `labelsAll`, `labelsAny`, `labelsNone`,
   and `assignee` SHALL keep working unchanged. A rule with both `match` and
   a legacy key SHALL be refused as ambiguous. Settings SHALL write `match`,
   show the parsed terms, refuse a bad token inline, and preview the open
   issues the line matches now.

### Requirement 12: Issue-first GitHub work

**User story:** As a maintainer, I want to label an issue and have Avoozl either
deliver it or break it down, so that one gesture starts the right amount of work.

#### Acceptance criteria

1. WHEN a trigger rule matches THEN Avoozl SHALL freeze the issue snapshot
   (body hash, label event, actor) and plan only from that snapshot.
2. WHEN the issue body or title changes after the snapshot THEN Avoozl SHALL
   quarantine the issue until a new trigger event or explicit confirmation,
   and the task SHALL keep the snapshot's title (title added 2026-11-13).
3. A planning session SHALL classify the issue as bounded or broad.
4. WHEN the issue is bounded THEN it SHALL remain its own leaf, and Avoozl SHALL
   create no duplicate issue.
5. WHEN the issue is broad THEN Avoozl SHALL create a child graph, publish
   children only after approval, and keep the source issue as their parent.
6. WHEN every required child completes THEN Avoozl SHALL close the parent issue
   as completed. No pull request closes a parent, so this is the one issue
   close Avoozl makes besides "take back local" (Requirement 33.3).

### Requirement 13: Projection into GitHub

**User story:** As a maintainer, I want approved tasks to appear as GitHub issues
with native dependencies, so that collaborators see the same graph.

#### Acceptance criteria

1. WHEN a graph is approved for GitHub THEN Avoozl SHALL show a preview of every
   issue create, update, label change, and edge change before the first write.
2. Projection SHALL create native GitHub dependencies within one repository and
   across repositories.
3. Projection SHALL withdraw readiness first, reconcile issues and edges, read
   GitHub again, and add readiness labels last.
4. Repeated projection of the same approved revision SHALL change nothing.
5. Only one writer SHALL project a task namespace at a time.
6. Issues SHALL be identified internally by GitHub node ID and shown as
   `owner/repo#number`.
7. Epics and packages SHALL project as parent issues and their children as
   sub-issues. An epic SHALL get the owner's `Epic` issue type when the owner
   has one, and no type otherwise. (Changed 2026-11-13: epic, plan issue,
   then tasks, Requirement 59.8.)
8. Blocking edges (`requires`, `sequence`) SHALL project as GitHub issue
   dependencies (blocked by). Avoozl-only detail, such as a `requires`
   completion level and advisory `supports` edges, SHALL live only in the
   hidden marker.

### Requirement 14: Identity and fresh-workspace recovery

**User story:** As a developer on a new machine, I want Avoozl to find issues it
already created, so that I never get duplicates.

#### Acceptance criteria

1. Each managed issue SHALL carry a hidden marker with task ID, plan ID, source
   commit, and content hash, and no secret or private path.
2. WHEN a fresh workspace projects an approved revision THEN Avoozl SHALL reuse
   every issue whose marker matches, open or closed.
3. WHEN a fresh workspace connects to a repository THEN Avoozl SHALL be able to
   rebuild the GitHub task graph, its edges, and completion state from markers
   and native dependencies alone.
4. WHEN two issues carry one task ID THEN Avoozl SHALL report a conflict and
   write nothing for that task.

### Requirement 15: Managed-field conflicts

**User story:** As a collaborator, I want my edits to an Avoozl issue respected,
so that automation never silently overwrites me.

#### Acceptance criteria

1. Avoozl SHALL record the last applied value of every managed field: title,
   managed body section, managed labels, and dependency edges.
2. WHEN the current value equals the last applied value THEN Avoozl SHALL apply
   the new desired value.
3. WHEN the current value differs from both the last applied and the desired
   value THEN Avoozl SHALL report a conflict and leave that field unchanged.
4. Avoozl SHALL never edit assignees (unless policy says so), comments, human
   labels, claim labels, pull requests, or check results.
5. A GitHub Project field edit SHALL never be a conflict. Avoozl acts only on
   the edits Requirement 29 names (a Deferred order, a Release change, a Wave
   edit) and leaves every other Status value alone (Requirement 29.14,
   changed 2026-11-12). Edits to the issue itself stay under criteria 1–3.

### Requirement 16: Exact pull-request completion

**User story:** As a maintainer, I want a GitHub task to count as done only when
its exact change merged and passed, so that dependents never start early.

#### Acceptance criteria

1. A code task SHALL complete only when GitHub reports its issue closed as
   completed with exactly one merged pull request as the closer, that pull
   request is in the leaf's code repository and targets the configured base
   branch, and every check in the policy's `requiredChecks` succeeded on its
   exact head commit (the list may be empty where branch protection is the
   gate). The link is `Closes #N` in single-repo mode (a linked branch is
   also allowed) and the linked branch `avoozl/<task-id>` in plans-repo mode
   (Requirements 28, 33). Changed 2026-11-12: Avoozl no longer matches pull
   requests by head branch name.
2. WHEN several candidate pull requests exist THEN Avoozl SHALL report a conflict.
3. Completion SHALL be derived from GitHub facts and SHALL feed dependent release
   automatically.
4. A manually closed issue SHALL NOT count as a verified completion. WHEN an
   allowed actor closed it THEN it is an order that releases dependents
   (Requirement 33.8); otherwise it holds them. (Changed 2026-11-12: a
   manually closed issue satisfied nothing.)
5. GitHub SHALL close the leaf issue on merge in both modes; Avoozl SHALL NOT
   close a leaf issue. GitHub closes only from merges into the default
   branch, so validation SHALL refuse a `baseBranch` that is not the code
   repository's default for a github task. WHEN a pull request that should
   close a leaf merged and passed but the issue is still open THEN Avoozl
   SHALL open a decision. (Changed 2026-11-12, Requirement 33.)

### Requirement 17: Issue Radar executes ready GitHub leaves

**User story:** As a maintainer, I want Issue Radar to implement ready Avoozl
leaves, so that GitHub delivery uses the crew I already run.

This requirement applies in single-repo mode. Issue Radar crews read one
repository's issues and open pull requests in that same repository, so they
cannot code a planning-repo issue whose code lands elsewhere (Requirement 28).

#### Acceptance criteria

1. Avoozl SHALL expose ready leaves to Issue Radar only through one configured
   managed readiness label per delivery route.
2. Because Issue Radar does not gate blockers (F4), Avoozl SHALL add the
   readiness label only to leaves whose blockers are complete, and SHALL remove
   it before any change that could block them.
3. WHEN a claimed issue loses readiness THEN Avoozl SHALL report stale claimed
   work and SHALL NOT cancel the crew itself.
4. Avoozl SHALL show the crew label scope a user must configure, and SHALL NOT
   read or write Issue Radar's crew records (F23).

### Requirement 18: Automatic pull-request merge

**User story:** As a maintainer, I want approved routine changes to merge by
themselves once checks pass, so that delivery continues overnight.

#### Acceptance criteria

1. Merging SHALL use GitHub auto-merge or Issue Radar's merge actions, gated by
   the repository's required reviews and checks. In plans-repo mode the
   worker session enables auto-merge on the pull request it opened.
2. Avoozl SHALL NOT merge pull requests itself.
3. WHEN merge completes THEN Requirement 16 SHALL decide completion.

### Requirement 19: One authority per state

**User story:** As a maintainer, I want every kind of state to have one owner,
so that two stores never disagree.

#### Acceptance criteria

1. The design SHALL name exactly one authority for: reviewed design, local task
   graph, local task status, GitHub issue graph, Kiro Crew sessions, worktrees
   and branches, pull requests, test results, completion, activity and
   evidence, and tracker plugin state (Requirement 35).
2. Avoozl SQLite SHALL be authoritative for local-only tasks and SHALL be only a
   cache and receipt store for GitHub-backed tasks and for the records a
   tracker plugin owns.
3. No task SHALL be writable in two stores.
4. GitHub Project Status SHALL be owned by GitHub's built-in workflows and
   by people; Avoozl SHALL NOT write it. Avoozl SHALL set Release at
   projection (people may change it) and keep Wave current from edges. An
   allowed actor's move into Deferred SHALL be an order Avoozl reads.
   SQLite SHALL cache the values (Requirements 29, 33; changed 2026-11-12).

### Requirement 20: The Avoozl app

**User story:** As a developer, I want one Avoozl page in Kiro Crew with clear
views, so that I see my graph and its delivery without leaving Kiro Crew.

#### Acceptance criteria

1. The app SHALL provide Workspace, Plans, Graph, Delivery, Conflicts, and
   Settings views.
2. For each view the design SHALL name its data, primary actions, canonical
   source, links to existing Kiro Crew surfaces, and what it must not duplicate.
3. The app SHALL NOT duplicate Issue Radar triage, pipeline, or crew views, or
   Code Review Sage findings; it SHALL link to them.
4. All app data SHALL come from the Avoozl app backend, which uses the same
   operations as the CLI and MCP interface.

### Requirement 21: Activity and evidence

**User story:** As a reviewer, I want each task to show what happened and why,
so that I can trust automatic delivery.

#### Acceptance criteria

1. Each task SHALL record dispatches, session bindings, commits, check results,
   integrations, conflicts, and decisions as append-only events.
2. Evidence SHALL point to its real source (session, commit, check, pull
   request) rather than copy it.

### Requirement 22: Delivery route plugins

**User story:** As a future contributor, I want a small seam for other delivery
systems, so that one can be added later without changing task identity.

#### Acceptance criteria

1. Settings SHALL list delivery routes per workspace or repository. Local and
   GitHub SHALL be the only routes built into Avoozl; any other route SHALL
   come from a plugin loaded under Requirement 34 (changed 2026-11-12).
2. A route contract SHALL cover submit, status, completion, and cancel.
3. No private delivery integration SHALL be named, documented, or tested in
   the public repository. Tests SHALL use only fake route plugins in the test
   tree (Requirement 34.10; changed 2026-11-12).
4. The seam SHALL NOT be built beyond a schema and interface until every proof
   in Phases 0–7 of `tasks.md` (P1–P25) passes. It SHALL also wait until a
   second real route exists. A private code-review route, in its own private
   package, SHALL count as that second real route; a test fake SHALL NOT
   (clarified 2026-11-12).
5. A task in the delivery manifest MAY name a `route`, which overrides the
   workspace or repository route for that task only, so one graph can mix
   local and remote leaves (for example local -> remote -> local).
6. WHEN a ready leaf's route is not local THEN dispatch SHALL call that
   route's `submit` and SHALL NOT open a worker session for it.
7. WHILE a remote leaf is not done THE SYSTEM SHALL read its route's `status`
   on each tick. A status of waiting on a person SHALL show as "needs you" in
   `plans_graph` and the app page, with the link the route gives.
8. A remote leaf SHALL be done only when its route's `completion` says so. A
   GitHub issue closer SHALL NOT be required, because a remote route writes
   its own pull request text and cannot be relied on to close the issue.
9. A route's `completion` SHALL return a result: a pull request link, an
   answer, or both. Each dependent released by that leaf SHALL get the result
   in its brief, quoted as untrusted data.
10. A route plugin SHALL declare the kind `route` in its manifest
    (Requirement 34.3). Route names `local` and `github` SHALL stay reserved;
    a plugin route SHALL be named `plugin:<id>`. (Added 2026-11-12.)

### Requirement 23: Move an existing workspace

**User story:** As the owner of an existing Avoozl workspace, I want my real
workspace moved onto the new model without losing work or creating
duplicates, so that a large live workspace is the proof. (The first workspace
moved was Nupp's; its counts are in "Example workspace facts".)

#### Acceptance criteria

1. Every task in the workspace's epics and every edge among them SHALL keep
   its ID and edge kind.
2. Finished tasks SHALL be recorded in one migration baseline.
3. Partial tasks SHALL be reconciled against branches, commits, and evidence
   before any becomes ready.
4. Blocked, deferred, and review states SHALL be preserved: deferred as the
   Deferred Status, set once at cutover as the owner's recorded order;
   blocked as issue dependencies, or as an open decision when the blocker is
   not a task; review as the open pull request on the task's branch.
   (Changed 2026-11-12: Avoozl writes no other Status, Requirement 33.)
5. Document-derived entries that overlap epic scope SHALL become context or
   acceptance clauses on existing tasks, not new tasks; every unmatched entry
   SHALL be reported.
6. Broad tasks SHALL remain work packages; only bounded leaves become ready.
7. Automatic delivery SHALL begin only after a reviewed cutover and with active
   runs drained.
8. The migration SHALL read the old database without writing it until cutover.
9. The workspace SHALL use the GitHub mode its owner picks. In plans-repo mode
   the unfinished work SHALL become issues in the private planning
   repository, epics as parent issues and their tasks as sub-issues, with
   blocking edges as issue dependencies.
   (Changed 2026-11-13: the old work groups become phases, Requirement 59.13.)
10. The workspace's milestones SHALL become values of the Project's Release
    field, and each issue's Release SHALL come from its milestone.
11. Until cutover, the migration SHALL read the old database and fenced plan
    files only through the migration read path (Requirement 30.8).
12. In plans-repo mode, no public pull request SHALL name the private
    planning repository.
13. After cutover, Avoozl SHALL list plan files in the planning repository
    that are stale or no longer current, with one evidence-based reason per
    file: every task it holds is done or migrated, and the file is superseded
    or has no live references. Files SHALL be deleted only in one reviewed
    commit after the owner approves that list.
14. After cutover, each current plan SHALL move to a Kiro spec folder
    (Requirement 30) with task IDs and issue links unchanged, and validation
    SHALL pass on every spec.
15. Neither step 13 nor step 14 SHALL change any issue-to-task mapping.

### Requirement 24: Open-source release

**User story:** As a new user, I want to install Avoozl from public sources on a
clean machine, so that I can use it without private context.

#### Acceptance criteria

1. A clean machine with Kiro Crew, Node, Git, and optionally `gh` SHALL install
   the app and complete the local workflow from public documentation.
2. The release SHALL contain no private names, company-internal tool names,
   absolute paths, credentials, personal plans, or transcripts
   (Requirement 34.10).
3. Execution in any repository, public or private, SHALL require an explicit
   repository rule; installing Avoozl SHALL enable no trigger rule.
4. Third-party licenses SHALL be audited and noticed.
5. Existing compatibility surfaces (`plans_*` MCP names, `AICOMMANDER_*` and
   `NUPP_WORKSPACE_*` variables, the `aicommander` command) SHALL keep working.

### Requirement 25: Assessment deliverable quality

**User story:** As the decision maker, I want the recommendation to be precise and
checkable, so that I can approve or reject each part.

#### Acceptance criteria

1. Every conclusion SHALL be labeled Verified, Inferred, or Proposed.
2. Every fact from the brief SHALL be confirmed or corrected with evidence.
3. The design SHALL classify each major code area as Keep, Adapt, Replace,
   Delete, or Defer, with a reason, covering `main`-only modules as well (F19).
4. Each proof SHALL state setup, action, expected result, failure meaning, and
   next design decision.
5. The design SHALL list every missing handoff contract with Kiro Crew.
6. The design SHALL include kill criteria for unnecessary features.
7. The recommendation SHALL end with one product statement.

### Requirement 26: Lean on Kiro Crew for scheduling, watching, and runtime

**User story:** As a maintainer, I want Avoozl to use Kiro Crew's schedules,
watchers, sessions, and notifications instead of its own, so that Avoozl stays a
small graph-and-policy app and Kiro Crew remains the one runtime.

#### Acceptance criteria

1. Avoozl SHALL NOT run its own scheduler, background poller, process
   supervisor, worker lease system, or webhook receiver (F26 lists what exists
   today and must go).
2. All routine automation SHALL run as one deterministic Avoozl command, here
   called the tick, that syncs GitHub, recomputes readiness, dispatches ready
   leaves, checks completion, and releases dependents.
3. The tick SHALL be triggered by a Kiro Crew `command` cron declared in the
   Avoozl app manifest (F27), with no LLM call per tick.
4. The tick SHALL be idempotent: running it twice in a row with no outside
   change SHALL write nothing.
5. Overlapping ticks SHALL be safe: a workspace lock SHALL make any concurrent
   tick exit without writing.
6. One tick SHALL finish within the cron subprocess limit, or SHALL stop at a
   safe point and leave the rest for the next tick.
7. Concurrency SHALL be enforced by Avoozl policy limits checked inside the tick
   together with Kiro Crew's own session and subagent limits; Avoozl SHALL NOT
   keep a separate admission queue.
8. Worker liveness SHALL come from Kiro Crew session or run status, read during
   the tick; Avoozl SHALL NOT keep its own process or lease state.
9. Monitor loops (F28) and inbound webhooks (F22) MAY be used to make a tick run
   sooner, but no workflow SHALL depend on them, and Avoozl SHALL NOT use a
   monitor loop for routine polling.
10. Human decisions and failures SHALL reach the user through Kiro Crew
    notifications declared by the app (F30) and links to the relevant session.
11. WHEN Kiro Crew lacks a needed event, such as a push on session completion
    (F29), the design SHALL list it as a missing handoff contract, and the tick
    SHALL poll for it until Kiro Crew provides one.
12. WHEN the gateway is stopped THEN no Avoozl automation SHALL run, and the next
    tick after restart SHALL reconcile state before any new dispatch.

### Requirement 27: Label-driven GitHub loop on Kiro Crew

**User story:** As a maintainer, I want to drive work from GitHub labels and
assignees alone, so that tagging an issue gets it answered, broken into
sub-issues, fanned out, and delivered in dependency order without me filing or
starting anything.

The idea is similar to the public glorp project (watch issues, dispatch agents,
track to merge). Avoozl reuses none of its code, skills, or text; it builds the
idea on Kiro Crew and Issue Radar. (**Proposed**)

#### Acceptance criteria

1. Selection SHALL be configurable per repository by a `match` search line
   (labels all, any, and none; assignee; Requirement 11.2), issue author, and the
   actor who applied the trigger label. The default rule SHALL select only
   issues the configured maintainer both authored and is assigned to.
2. WHEN a `respond` rule matches THEN Avoozl SHALL add its configured
   in-progress label, start one Kiro Crew session that reads the frozen issue
   snapshot and the repository read-only, post at most one reply on the issue,
   and remove the in-progress label when the session ends.
3. A `respond` session SHALL NOT change code, open branches or pull requests,
   or edit labels other than through Avoozl.
4. WHEN a `deliver` rule matches a bounded issue THEN Avoozl SHALL add the
   configured ready label once its blockers are complete. In single-repo mode
   an Issue Radar crew scoped to that label SHALL claim it, open the pull
   request, repair CI, answer review, and merge under the repository's gates.
   In plans-repo mode an Avoozl worker session SHALL do the same work in the
   code repository (criterion 14).
5. WHEN a `deliver` rule matches a broad issue THEN Avoozl SHALL plan child
   issues with native sub-issue links to the parent and native dependency edges
   between children, show the preview, and publish them only after approval
   (or automatically when the rule allows it, per Requirement 9).
6. Fan-out SHALL be automatic: every child whose blockers are complete SHALL
   receive the ready label in the same tick, up to the repository's concurrency
   limit.
7. WHEN slots are scarce THEN Avoozl SHALL release ready children in a
   configurable priority order by label (for example `critical`, then `high`),
   then by graph order.
8. Dependencies SHALL come from native GitHub dependency edges, and from
   `depends on #N` text only when the repository rule enables it. Text-derived
   edges SHALL be written back as native edges after approval.
9. Pull requests for GitHub leaves SHALL be written by Issue Radar in
   single-repo mode and by Avoozl worker sessions in plans-repo mode. The
   Avoozl process itself SHALL NOT open, push to, or merge pull requests.
10. Concurrency on GitHub SHALL be bounded by how many leaves Avoozl labels ready
    at once and by the number of crews configured per route, since each crew
    holds at most one item in its editing phases (F24). In plans-repo mode it
    SHALL be bounded by the repository's worker concurrency.
11. WHEN a crew labels an issue as needing a human THEN Avoozl SHALL show it as a
    decision and SHALL withhold readiness from that issue's dependents.
12. The parent issue SHALL close as completed only after every required child
    meets Requirement 16.
13. Deferred until the core loop is proved: stacked pull requests on an open
    blocker, Discussions answering, and steering a running crew from comment
    mentions. Each SHALL appear in `tasks.md` only as a later phase. GitHub
    Projects are not deferred; Requirement 29 covers them.
14. In plans-repo mode Avoozl's own worker sessions SHALL code the leaves in
    the code repository, dispatched by the Phase 2 runner (Crew Mode, with
    the script cron as fallback), because Issue Radar crews are tied to one
    repository and open pull requests only there (F23, F24). IF the Issue
    Radar handoff cannot meet criteria 4, 9, and 10 in single-repo mode THEN
    the design SHALL use worker sessions there too, and SHALL record why.
15. A reply on a public repository, or one GitHub cannot read, SHALL quote
    only that repository. Avoozl SHALL refuse a reply (posting nothing)
    any of whose lines, of at least 20 characters with quote and list marks
    dropped, appears in a file of another registered checkout, a plans
    repository included, and not in the target's own checkout. The refusal
    SHALL name the line, never the text. Content rules still run. A reply
    on a private repository is not checked this way (added 2026-11-13,
    injection audit follow-up).

### Requirement 28: GitHub modes and task authority

**User story:** As a maintainer, I want GitHub issues to be the default record
of shared work, kept either in a separate planning repository or in the code
repository, so that collaborators see one graph and public pull requests never
reveal a private plan.

#### Acceptance criteria

1. Each workspace SHALL configure at most one GitHub mode: `plans-repo` or
   `single-repo`. With no mode, every task is local.
2. WHEN a GitHub mode is configured THEN the default authority of a new task
   SHALL be `github`: approving its plan SHALL lead to an issue through an
   approved projection.
3. Local tasks SHALL be opt-in, set per task or per workspace as
   `authority: local`, and SHALL never sync to GitHub.
4. A task SHALL move from local to github only through an approved
   projection. Nothing SHALL sync it implicitly.
5. A person SHALL be able to tell the two apart: a github task has an issue
   link (`owner/repo#number`) in every view; a local task has none and shows
   the word "local".
6. In plans-repo mode the issues, sub-issues, and dependencies SHALL live in
   one planning repository, and code pull requests SHALL land in the code
   repositories the leaves name.
7. In plans-repo mode no pull request, commit message, branch name, or marker
   in a code repository SHALL name the planning repository, so closing
   keywords SHALL NOT be used. At dispatch Avoozl SHALL create a linked
   branch `avoozl/<task-id>` for the planning issue in the leaf's code
   repository (GraphQL `createLinkedBranch`), and GitHub SHALL close the
   planning issue when that branch's pull request merges into the default
   branch (Requirement 33.4; changed 2026-11-12).
8. WHEN the pull request title, body, or a commit message names the planning
   repository THEN Avoozl SHALL open a decision and SHALL NOT complete the
   task until it is fixed.
9. In single-repo mode the issues SHALL live in the code repository, pull
   requests SHALL say `Closes #N` (a linked branch is also allowed), GitHub
   SHALL close the issue on merge, and
   Avoozl SHALL still verify completion (Requirement 16).
10. Both modes SHALL work when the planning repository is private and the code
    repository is public, and when the two repositories belong to different
    organizations.
11. Marker v2 SHALL never name the planning repository, its owner, or its path.

### Requirement 29: GitHub Projects as the default view

**User story:** As a maintainer, I want every managed issue on one GitHub
Project with current fields, so that I can see a release across repositories
on GitHub.

#### Acceptance criteria

1. WHEN a GitHub mode has a configured Project (v2, organization or user)
   THEN Avoozl SHALL add each managed issue to it on projection.
2. Avoozl SHALL NOT write the Project's Status field. GitHub's built-in
   workflows and people own it (Requirement 33; changed 2026-11-12, replacing
   "Avoozl SHALL keep the Project's Status field current from task state").
3. Avoozl SHALL set a single-select Release field from the plan's milestones.
   Avoozl SHALL NOT use GitHub milestones, which belong to one repository.
4. Avoozl SHALL set an Iteration field only when the policy names one.
5. Avoozl SHALL write only the fields the policy names, and never Status. It
   SHALL read Project changes on its 60-second tick, with no webhooks, and
   judge each Deferred, Release, and Wave change after this tick's completion
   and state changes. WHEN a move into or out of Deferred comes from an
   editor the repository policy's `allowedActors` or `minimumPermission`
   check (Requirement 10) does not allow, or whose actor cannot be read,
   THEN Avoozl SHALL ignore it as an order and SHALL NOT revert the card.
   (Changed 2026-11-12: disallowed edits were reverted.)
6. Field sync SHALL be idempotent: a second sync with no change SHALL write
   nothing.
7. WHEN the token lacks the `project` scope THEN Project sync SHALL report
   unavailable and issue projection SHALL keep working.
8. Avoozl SHALL compute and write a number field, Wave, on each managed
   item. A task that waits on nothing SHALL be wave 1; any other task SHALL be
   1 plus the highest wave among the tasks it waits on. Only blocking edges
   (`requires`, `sequence`) SHALL count, not `supports` edges. Done tasks
   SHALL keep their wave.
9. Avoozl SHALL recompute Wave on every tick and write it only when it
   changes. Projection SHALL use the same rule, so a second pass writes
   nothing.
10. Wave SHALL describe order, not time: the earliest round a task could
    run, which capacity may delay. Avoozl SHALL NOT turn a wave into a date.
11. A Wave edit by anyone SHALL be refused: Avoozl SHALL write the computed
    wave back and send a Kiro Crew notification.
12. WHEN an allowed actor moves Status to Deferred (the option
    `statusValues.deferred` names) THEN Avoozl SHALL dispatch nothing new for
    the task, SHALL leave a running session alone, and SHALL notify the owner
    in Kiro Crew.
13. WHEN an allowed actor moves Status out of Deferred THEN Avoozl SHALL
    resume the task and SHALL write no Status: the column the person picked
    stays. (Changed 2026-11-12: Avoozl wrote the computed Status.)
14. Every other Status value, including a drag to Done, In progress, or
    Todo, SHALL be the board's own: Avoozl SHALL neither revert nor act on
    it, and SHALL show it beside Avoozl's own state in the Delivery view when
    the two disagree. Only an issue closed as completed by a merged pull
    request completes a task (Requirement 16). A drag to Done closes the
    issue through the Auto-close issue workflow; that close is judged like
    any close without a merged pull request (Requirement 33.8). (Changed
    2026-11-12: drags to Done, Running, Review, and a not-ready Ready were
    reverted; later the same day, a drag to Done became a close.)
15. Avoozl SHALL set Release when it adds the item, from the plan's
    milestones. WHEN someone changes Release THEN Avoozl SHALL keep the
    value and SHALL draft a manifest change for review, so the plan catches
    up. Avoozl SHALL write Release again only when an approved manifest moves
    the task and the field still holds the value Avoozl last wrote.
    (Changed 2026-11-12: the actor check no longer applies to Release.)
16. Built-in Project workflows (`@github-project-automation`) SHALL write
    Status; Avoozl SHALL record no Status baseline and revert nothing they
    write. (Changed 2026-11-12.)
17. The setup wizard SHALL make sure the Status field has the options the
    recommended workflows set (Todo, In progress, Done) and a Deferred
    option, map them through `statusValues`, and SHALL never remove or rename
    an existing option (Requirement 32). Avoozl SHALL NOT require other
    Status options. (Changed 2026-11-12.)
18. Avoozl SHALL fill an optional single-select Project field, Avoozl state,
    with the task's Delivery lane: Ready, Running, Reviewing, Needs you,
    Blocked or waiting, Done, or Deferred. The lane SHALL come from the one
    rule the Delivery tab uses, and Avoozl SHALL write the field only when
    its value changes. A blank `project.fields.avoozlState` SHALL turn it
    off. Avoozl SHALL still never write Status. (Added 2026-11-13.)
19. WHEN anyone else changes Avoozl state THEN Avoozl SHALL write its own
    value back on the next tick, once, notify the owner, and record a GitHub
    edit in Conflicts that stays until the state next moves. Avoozl state
    SHALL NOT name the Status field.
20. The setup wizard SHALL create Avoozl state with those options and a
    "Board by Avoozl state" board view with a column per Avoozl state, each
    shown as create, change, or keep. WHEN the API cannot set the view's
    columns THEN the checklist SHALL name the one click, marked Inferred
    until a live call confirms the API cannot.
21. The wizard SHALL name Status's first option Ready, renaming GitHub's
    default Todo only on a Project it just created, and SHALL keep an
    existing Todo through `statusValues.todo`, so older boards keep working.
    (Changes the Todo in criterion 17, 2026-11-13.)

### Requirement 30: Every plan is a Kiro spec folder

**User story:** As a developer, I want every Avoozl plan to use Kiro's spec
layout, so that Kiro, Spec Builder, and Avoozl read the same files.

#### Acceptance criteria

1. Every Avoozl plan SHALL be one Kiro spec folder, `.kiro/specs/<name>/`,
   holding `requirements.md` or `bugfix.md` (exactly one), `design.md`, and
   `tasks.md`, with `avoozl/manifest.json` beside them.
2. Bugfix specs SHALL be supported the same way as feature specs.
3. In plans-repo mode spec folders SHALL live in the planning repository; in
   single-repo mode, in the code repository; with no GitHub mode, in the
   workspace's planning repository.
4. Deterministic validation SHALL refuse a plan whose folder is missing, that
   lacks any of the three files, or that has both `requirements.md` and
   `bugfix.md`.
5. Every checklist item in `tasks.md` SHALL start with a task ID. Validation
   SHALL refuse an item with no ID and any ID used twice in the namespace.
6. Avoozl SHALL map `tasks.md` items to tasks and issues only by these IDs.
   Edges SHALL come from the manifest. Kiro's own task waves inside
   `tasks.md` SHALL NOT be Avoozl's graph.
7. Avoozl's planner SHALL write plans into this layout.
8. Free-form plan files with fenced task blocks (`extractPlan`) SHALL remain
   only as a read path for migrating old workspaces, such as Nupp. Avoozl
   SHALL NOT write them.
9. A plan's category SHALL come only from a `category:` key in YAML
   front-matter at the top of the spec's `requirements.md` or `bugfix.md`
   (for a plan with no spec folder, from front-matter at the top of its own
   text, or from metadata a person set). Avoozl SHALL read it and SHALL NOT
   write it, SHALL NOT keep it in the manifest, and SHALL NOT infer one from a
   title or path: a plan without one is shown as Uncategorized. Malformed
   front-matter SHALL produce a warning diagnostic with its file and line and
   SHALL NOT block approval. The Plans view SHALL group plans by category.

### Requirement 31: Proof of both modes and Project sync

**User story:** As the decision maker, I want each GitHub mode proved on real
repositories before Nupp moves, so that the default is safe.

#### Acceptance criteria

1. The proofs SHALL cover single-repo mode, plans-repo mode in one
   organization, and plans-repo mode across two organizations.
2. One proof SHALL use a private planning repository with a public code
   repository and SHALL show GitHub closing the planning issue through the
   linked branch while the public pull request names no planning repository.
3. One proof SHALL show Project fields (Release, Wave, Iteration) set and
   kept current, and Status following the built-in workflows, for issues
   from more than one repository.
4. One proof SHALL show local tasks and github tasks in one workspace, with
   the local task never synced and a later projection moving it.
5. Before Phase 6, one proof SHALL repeat the linked-branch close and the
   logged-out leak check inside one organization, with a private planning
   repository and a public code repository, as Nupp will use.

### Requirement 32: GitHub setup wizard

**User story:** As a maintainer, I want Avoozl to set up GitHub for me from
its Settings view, so that I never configure repositories, Projects, fields,
issue types, or labels by hand.

#### Acceptance criteria

1. The Settings view SHALL offer a **Set up GitHub** flow that runs these
   steps in order:
   1. check the token and report each missing scope (`repo`, `read:org`,
      `project`) with the exact command that adds it, for example
      `gh auth refresh -s project`;
   2. ask for the mode, plans-repo or single-repo, then pick or create the
      planning repository (plans-repo mode), private by default;
   3. turn on issues in each repository the mode needs;
   4. pick or create an organization or user Project, private by default;
   5. create missing fields: Status options mapped through
      `project.statusValues` (Todo, In progress, Done, Deferred only),
      Release (single-select) seeded from the plan's
      milestones, Wave (number), and an optional Iteration field, then a
      Board view with a column per Status, grouped by Release, and, if the
      person asks, a Table view grouped by Wave. WHEN the API cannot set a
      view's grouping THEN the wizard SHALL still create the view and SHALL
      put the grouping click on the checklist. The wizard SHALL NOT create a
      Roadmap view, which is date-based; a person may add one later;
   5a. read the Project's built-in workflows and compare them with the
      recommended settings (Requirement 33.6). GitHub's API can read a
      workflow's name and whether it is on, but cannot turn one on or off or
      read its column or filter, so every difference and every setting it
      cannot read SHALL go on the checklist;
   6. create the `Epic` issue type when the organization allows it and has
      none;
   7. create the managed labels;
   8. write the result into `.avoozl.json` through a reviewed change.
2. The wizard SHALL preview every GitHub write before applying any, and the
   person SHALL confirm once for the whole set.
3. The wizard SHALL be idempotent: it SHALL reuse what exists and add only
   what is missing. A second run on a finished setup SHALL write nothing.
4. The wizard SHALL NOT delete or rename any repository, Project, field,
   option, issue type, or label.
5. WHEN a step fails for lack of permission or scope THEN the wizard SHALL
   report that step with the reason and the fix, and SHALL keep every other
   step. WHEN the token lacks the `project` scope THEN the wizard SHALL make
   no Project write.
6. The wizard SHALL end with a short checklist of the steps GitHub's API
   cannot do, each with a link to the place to do it.
7. The design SHALL mark each GitHub API limit the wizard relies on as
   Verified or Inferred and cite GitHub's documentation.
8. One proof SHALL run the wizard twice on a fresh test organization, user,
   or repository: the first run creates everything, the second changes
   nothing, and a token without the `project` scope gets the fix command and
   no Project writes.

### Requirement 33: Lean on GitHub-native state

Added 2026-11-12 (owner-approved direction). Evidence: the linked-branch probe,
`docs/evidence/github-linked-branch-probe.md` in the Avoozl repository
(commit `31adf4e`), and design F51–F55.

**User story:** As a maintainer, I want GitHub to own the state it already
tracks, so that the board behaves like any GitHub Project and Avoozl writes
only what GitHub cannot work out.

#### Acceptance criteria

1. Ownership SHALL be split this way:

   | Owner | State |
   |---|---|
   | GitHub | Project Status (built-in workflows); the Blocked signal (open blocked-by dependencies); closing leaf issues in both modes |
   | Avoozl | Issues, sub-issues, blocked-by links, the linked branch; Release at projection; Wave; picking ready work; starting coding sessions; the completion verdict that releases dependents |
   | People | Assignees, board drags, Deferred; closing a leaf without merged code, as an order when the policy allows the closer (criterion 8) |

2. Avoozl SHALL NOT write a Blocked Status or a blocked label. The blocked
   signal SHALL be GitHub's own: the Blocked icon on boards and issue lists,
   and `is:blocked` in issue search.
3. Avoozl SHALL NOT close a leaf issue. It SHALL close only a parent issue
   whose required children are done (Requirement 12.6) and an issue a person
   takes back local (as `not_planned`).
4. In plans-repo mode, before it sends a leaf's brief, Avoozl SHALL create
   one linked branch `avoozl/<task-id>` for the planning issue in the leaf's
   code repository, from the head of `baseBranch`, with GraphQL
   `createLinkedBranch` (`repositoryId` = the code repository). It SHALL
   reuse a branch of that name that is already linked. The worker SHALL push
   to that branch, and its pull request SHALL carry no planning-repository
   name and no closing keyword.
5. Avoozl SHALL take candidate ready leaves from GitHub's own blocked
   state: open issues with no open blocker, the set issue search
   `is:open -is:blocked` returns. Because search can lag, the tick MAY read
   each issue's blockers directly instead of searching. Avoozl SHALL then
   apply its own gates:
   policy, Deferred, claims, open decisions, completion levels from the
   marker, and concurrency. A blocker closed with no merged closing pull
   request SHALL follow criterion 8: released when the policy allows the
   closer, otherwise held with a decision. (Changed 2026-11-12: every such
   blocker was held.)
6. The setup wizard SHALL recommend these built-in workflow settings:
   Auto-add sub-issues on; Auto-add on, filtered to the managed label; Item
   added → Todo on; Pull request linked → In progress on; Item closed →
   Done on; Pull request merged → Done on; Auto-close issue on; Auto-archive
   off. Auto-close issue on means a drag to Done closes the issue as done,
   which criterion 8 then judges. (Changed 2026-11-12: Auto-close issue was
   off.)
7. The completion verdict (Requirement 16) SHALL stay Avoozl's, so dependent
   release never rests on a Status value.
8. WHEN a leaf issue closes with no merged closing pull request (by hand, or
   by the Auto-close issue workflow after a drag to Done, where the closer
   is the person who dragged) THEN Avoozl SHALL check the closer with the
   same `allowedActors` or `minimumPermission` check used for trigger labels
   and Deferred (Requirement 10). For a plans-repo leaf, the policy of its
   code repository decides.
   - WHEN the policy allows the closer THEN the close SHALL be an order,
     whether its reason is completed or not planned. On the next tick Avoozl
     SHALL mark the task done by order and release its dependents. It SHALL
     record the order (closer, close reason, close time) in the SQLite
     receipt and the issue marker, and SHALL NOT count it as a verified
     completion. Avoozl SHALL start no new session for the closed task and
     SHALL leave a running session alone.
   - The order SHALL satisfy every `requires` edge on the task, at any
     completion level, including `merged-pr` and `integrated`. Dependents
     can start on code that never merged; the owner accepts that risk.
   - WHEN the policy does not allow the closer, or the closer cannot be read,
     THEN Avoozl SHALL hold the dependents and open a decision. It SHALL NOT
     reopen the issue.
   (Added 2026-11-12.) (Changed 2026-11-13 by Requirement 52.8: a close
   on an issue that carries Issue Radar's claim label is never an order;
   it holds and opens a decision unless a closing pull request merged.)
9. WHEN a released dependent starts THEN its worker brief SHALL say that its
   blocker closed without merged code, by whom and when, and SHALL tell the
   worker to check for the missing code first. The brief SHALL name the
   blocker by its issue link, except in plans-repo mode, where it SHALL name
   the blocker by task ID and title only (Requirement 28.7). For a leaf
   Issue Radar codes (no Avoozl brief), the same note SHALL go in the
   dependent issue's managed body section. (Added 2026-11-12.)
10. WHEN a closed leaf issue is reopened THEN Avoozl SHALL withdraw its done
    state, verified or by order, on the next tick. Its dependents that have
    not started SHALL wait again; a running session SHALL be left alone, and
    a dependent already done SHALL stay done. (Added 2026-11-12.)

### Requirement 34: Plugin loading and trust

Added 2026-11-12 (owner request). Design §4.8.

**User story:** As a maintainer, I want outside packages to add delivery routes
and task trackers to Avoozl, loaded only with my consent and unable to break
the tick, so that private integrations stay out of the public repository.

#### Acceptance criteria

1. A plugin SHALL be a package, local folder, or pinned git commit outside
   the Avoozl source tree.
   Avoozl SHALL load a plugin only when a `plugins` entry declares it, either
   in `.avoozl.json` (shared, reviewed in Git) or in the machine-local Avoozl
   settings (this machine only, never committed).
2. A `plugins` entry SHALL name the plugin `id`, exactly one of `package` (an
   installed package name), `path` (a local folder), or `git` (34.12), the contract version
   it expects, and an optional non-secret `config`. It SHALL NOT hold a
   credential; a plugin SHALL read credentials from the environment or Kiro
   Crew's secret store by a name `config` gives.
3. Each plugin SHALL ship a manifest, `avoozl-plugin.json`, naming its `id`,
   `version`, `contract` version, `kinds` (`route`, `tracker`, or both), the
   capabilities it supports for each kind, and its entry module. The ids
   `local` and `github` SHALL be refused.
4. Before a plugin's first load, and again whenever its version or content
   hash changes, Avoozl SHALL show its id, version, kinds, capabilities,
   location, and content hash, and SHALL load it only after a person approves
   in Settings. The approval SHALL be stored on this machine, not in Git.
   Neither the tick nor example installation SHALL approve a plugin.
5. Avoozl SHALL run each plugin in its own local child process that talks to
   Avoozl only over stdio. Avoozl SHALL give it no port. A plugin SHALL NOT
   open a network listener; one that does SHALL be stopped and marked broken.
   Outbound calls to the plugin's own system are allowed.
6. Avoozl SHALL validate every plugin reply against the contract schema and
   SHALL treat reply text as untrusted data in every brief and view.
7. WHEN a plugin is missing, unapproved, crashes, times out, returns an
   invalid reply, or expects an unsupported contract version THEN Avoozl
   SHALL mark that plugin unavailable, SHALL park each of its tasks as "needs
   you" with the reason, SHALL write nothing for those tasks, and SHALL finish
   the tick for every other task. The next tick SHALL try again.
8. The plugin contract SHALL be versioned by one integer. Avoozl SHALL list
   the contract versions it supports and SHALL refuse to load a plugin whose
   version it does not support. Changes inside one version SHALL be additive.
9. Settings SHALL list every declared plugin with its kinds, version,
   approval state, and health, and SHALL offer approve, disable, and remove.
   Removing a plugin SHALL NOT delete its tasks; they park as "needs you".
10. Private and company-internal integrations, such as a route for an
    internal code review system or a tracker for an internal tracker, SHALL
    live outside the public Avoozl repository and plug in only through this
    seam. Public Avoozl files (code, tests, fixtures, docs, and this spec)
    SHALL NOT name any company-internal tool. The release leak scan
    (Requirement 24.2) SHALL cover plugin docs and test fixtures.
11. Tests SHALL use only fake route and tracker plugins kept in the test tree.
12. A `plugins` entry MAY name a git source instead of `package` or `path`:
    `git` (a repository URL or local repository path), `ref` (a tag, branch,
    or full commit), and an optional `subdir` (the plugin's folder inside the
    repository). Exactly one of `package`, `path`, or `git` SHALL be given.
    Added 2026-11-12 (owner request).
13. A person's Add or Update action in Settings or the CLI SHALL resolve
    `ref` to a full commit and store that commit on this machine. Avoozl
    SHALL fetch only that commit, shallow, with the person's own git and
    credentials, with git hooks off, without submodules, and without running
    any package install or install script. The tick SHALL never fetch,
    clone, or resolve a ref.
14. The approval of a git plugin SHALL bind to its commit as well as its
    version and content hash. WHEN Update resolves `ref` to a different
    commit THEN the plugin SHALL need a new approval before it loads.
15. Avoozl SHALL refuse a git source whose URL carries credentials, whose
    `subdir` leaves the repository, whose commit has no plugin manifest, or
    whose plugin declares dependencies it does not ship. Refusals, logs, and
    views SHALL NOT show a credential.
16. (Added 2026-11-13, owner request.) Settings > Plugins SHALL offer
    Design a plugin, which opens a chat seeded with the shipped
    `avoozl-plugin` skill to plan a plugin and write its files, and Plugin
    guide, which shows the plugin guide in the full-file reader. The chat
    SHALL NOT approve a plugin or import a pack.

### Requirement 35: Tracker plugins

Added 2026-11-12 (owner request). Design §3.2, §4.8.

**User story:** As a maintainer whose team tracks work outside GitHub, I want a
plugin to hold Avoozl's task records in that tracker, so that the team sees the
work where it already looks and Avoozl keeps the graph moving.

#### Acceptance criteria

1. A task MAY have `authority: plugin:<id>`, naming a loaded plugin whose
   manifest declares the kind `tracker`. One task SHALL have exactly one
   authority (Requirement 19.3).
2. A tracker contract SHALL cover the jobs GitHub authority does: `project`
   (create or update a task's record, idempotent by task ID), `read` (each
   record's state, managed field values, link, and the actor of its last
   close or pause), `list` (every record carrying this workspace's namespace,
   for rebuild), and `close` (close a record with a reason).
3. Each record SHALL carry the workspace namespace, the task ID, and the last
   applied managed values, stored by the plugin where its tracker allows (a
   hidden field or a managed description section). A plugin that cannot store
   them SHALL be refused for the kind `tracker`.
4. WHEN the tracker has no native blocked-by links THEN the graph SHALL stay
   in Avoozl: edges SHALL come from the approved manifest in Git and be cached
   in SQLite, and the tracker SHALL hold only records. Edge changes SHALL go
   through a plan change. WHEN the plugin declares the `edges` capability THEN
   Avoozl SHALL project blocking edges as the tracker's own links, and those
   links SHALL be managed fields.
5. Avoozl SQLite SHALL be only a cache for plugin-owned records. Operations
   SHALL refuse direct edits to a plugin-owned row with 409 and route the
   change through `project` (as Requirement 19.3 and task 2.2 do for GitHub).
6. Managed fields SHALL be the title, the managed description section,
   managed tags, and (with `edges`) blocking links. Conflicts SHALL follow
   Requirement 15.1–15.3. Avoozl SHALL never edit any other field.
7. Rebuild SHALL hold for a workspace of plugin tasks: delete SQLite, run
   `avoozl rebuild`, then `avoozl tick`, and every task, edge, status,
   completion verdict, and managed-field baseline SHALL match, from `list`,
   `read`, and the approved manifest alone.
8. The completion verdict SHALL stay Avoozl's, from the task's route
   (Requirement 7 for local, Requirement 22.8 for a route plugin). After the
   verdict, Avoozl SHALL call `close` with reason `completed`.
9. WHEN a record is closed or paused in the tracker by someone else THEN
   Avoozl SHALL apply Requirement 33.8–33.10 with the actor from `read`,
   checked against the plugin entry's `allowedActors` or the tracker's own
   permission the plugin reports. WHEN the actor cannot be read THEN Avoozl
   SHALL hold the dependents and open a decision.
10. A task SHALL move from local to `plugin:<id>` only through an approved
    projection, and back only through an explicit "take back local" that
    closes the record as not planned.
11. The tracker contract SHALL NOT be built beyond a schema until the gate of
    Requirement 22.4 holds and a real tracker plugin is being written.

### Requirement 36: Review gates on a local delivery

Added 2026-11-12 (owner handoff on review verdicts). Design §5.2. Written
against the Avoozl branch `kirocrew-native` at `dd8b28b` (design F56–F66).

**User story:** As a maintainer running a multi-step rewrite flow in another
repository, I want every writer's exact commit reviewed by fresh agents
before it merges or anything builds on it, so that no unreviewed change
reaches the integration branch or a dependent task.

#### Acceptance criteria

1. One writer per repository at a time SHALL be expressed by setting that
   repository's delivery concurrency to 1 (Requirement 6.3), because two
   writers in one repository would conflict. Review and check sessions only
   read, so they SHALL NOT count against that limit. Avoozl SHALL add no
   second writer limit.
2. A repository's delivery policy MAY name review roles. Each role SHALL have
   a unique `id`, a `focus` (for example "conventions", or "correctness and
   performance"), the agent that runs it, and a `distinctFrom` rule. Two
   roles split the review, so that each reviewer looks hard at one thing
   instead of skimming everything.
3. Each review SHALL run in a new session that did not write the commit and
   saw no other reviewer's session, so that its judgment is its own.
   `distinctFrom` SHALL be `model` by default: the reviewer's model SHALL
   differ from the model of the writer session whose commit it reviews,
   because a model tends to approve its own mistakes. `distinctFrom:
   session` SHALL relax this to a new session only.
4. WHEN Avoozl cannot prove the rule `distinctFrom` names (the writer's or
   the reviewer's model is unknown or `auto`) THEN Avoozl SHALL NOT dispatch
   that review and SHALL open a decision. Policy validation SHALL refuse a
   `distinctFrom: model` role whose model equals the writer's declared model.
5. Every review SHALL judge the exact commit the writer reported, in a clean
   read-only worktree at that commit, before integration, so that what was
   reviewed is what merges.
6. A review SHALL end with a verdict: `approved` or `changes-requested`, the
   subject commit, and its findings. Avoozl SHALL refuse a verdict whose
   subject is not the delivery's current commit. A reviewer that cannot judge
   SHALL report `blocked`, which retries that review and never counts as
   approval.
7. A verdict SHALL be stale once the delivery's commit moves (a new writer
   attempt, or a rebase at integration). A stale verdict SHALL count for
   nothing, and every role SHALL review the new commit.
8. Avoozl SHALL integrate a commit only when the checks role and every
   required review role have approved that same commit. Dependents SHALL
   start only after integration, so they start only when every review
   approved (Requirement 7.3).
9. WHEN integration would change the reviewed commit (the base moved and a
   rebase is needed) THEN Avoozl SHALL NOT merge it; it SHALL record the
   rebased commit as the delivery's new commit and review it again, because
   a rebase can change behavior the reviewers never saw.
10. WHEN any review returns `changes-requested` THEN that writer attempt
    SHALL fail and the retry path (Requirement 8) SHALL start a new writer
    attempt on the same worktree, whose brief quotes the findings as data.
    Its commit SHALL get new reviews from every role. Earlier attempts and
    verdicts SHALL be kept as history.
11. A leaf whose repository has review roles SHALL NOT reach `integrated`
    any other way: `task.update` SHALL refuse a typed `integration` receipt
    and a complete status for it, so that no caller skips the reviews.
12. The Delivery view SHALL show, per delivery, each role's verdict, its
    subject commit, the model it ran on, whether it is stale, and its
    findings with their closure state.
13. Review roles SHALL apply to leaves on the local route. For leaves on the
    GitHub route, GitHub's own required reviews and checks gate the merge
    (Requirement 33). Avoozl SHALL follow the code repository's base-branch
    rules on GitHub (rulesets and branch protection), read only: WHEN they
    require approving reviews THEN Avoozl SHALL count pull-request reviews on
    the head SHA from reviewers the repository policy allows and SHALL hold
    the leaf until that many approve; WHEN they require none THEN Avoozl's
    reviewer sessions SHALL be the review gate and pull-request reviews SHALL
    NOT be read. Avoozl SHALL NOT keep its own approval count; an old
    `pullRequestReviews` key SHALL still be read, as deprecated, when GitHub's
    rules cannot be read or name no count (owner decision 2026-11-12).
    WHEN classic protection is on but GitHub hides it from a non-admin THEN
    the rule SHALL show as unknown with that reason; only a count GitHub
    showed SHALL apply, and Avoozl SHALL invent none.

### Requirement 37: Every finding is closed

Added 2026-11-12 (owner handoff). Design §5.2.

**User story:** As a maintainer, I want every finding from a review to be
answered by the next review, so that a defect cannot drop out of sight
between attempts.

#### Acceptance criteria

1. A finding SHALL have an `id`, a `kind` (`defect` or `observation`), one or
   more repository paths, and text. Paths are required so that closure can
   be checked against what changed.
2. Avoozl SHALL refuse `approved` while the verdict lists, or leaves open,
   any defect, and SHALL refuse `changes-requested` with no defect, so that
   the verdict and its findings agree.
3. A review of a later commit SHALL close every finding still open from
   earlier verdicts of the same role on the same delivery, each as `fixed`
   or `unchanged`, because a finding nobody answers is a finding lost.
4. Avoozl SHALL check each closure against the changed files: `fixed` needs
   at least one of the finding's paths to have changed in the task's own
   diff between the two subject commits; `unchanged` needs none of them to
   have changed. A closure that fails the check SHALL be refused.
5. An `observation` closed either way SHALL be closed. A `defect` closed as
   `unchanged` SHALL stay open, so `approved` stays refused while it does.
6. Only a person SHALL dismiss an open finding, when retrying a delivery
   that stopped for a decision; the dismissal SHALL be recorded with who and
   why.
7. Rules about a domain's own artifacts (for example, what a multi-step
   rewrite flow in another repository must leave in its run folder) SHALL
   stay in that repository's validation script, run as one of the leaf's
   declared checks. Avoozl SHALL NOT encode them.

### Requirement 38: Checks that cannot run keep the gate shut

Added 2026-11-12 (owner handoff). Design §5.2.

**User story:** As a maintainer, I want a check that could not run to block
acceptance, so that a broken tool never reads as a pass.

#### Acceptance criteria

1. A check SHALL have one of three results: passed (exit 0), failed (any
   other exit), or not run (the command could not start, timed out, or was
   not reported). Exit codes 126 and 127 SHALL read as not run.
2. WHEN any declared check is not run THEN the gate SHALL stay shut: the
   commit SHALL NOT be verified, accepted, or integrated.
3. A not-run check SHALL fail the checking session, not the writer's
   attempt, because the writer did nothing wrong; the check SHALL be retried
   within the retry bound and then open a decision.
4. A leaf MAY set `acceptFrom: "validation"`. Such a leaf SHALL be accepted
   only from validation evidence Avoozl recorded itself: every declared check
   passed at the leaf's integrated commit. `task.accept` SHALL refuse typed
   evidence and `componentOnly` for it, and `task.update` SHALL refuse a
   typed `integration` receipt, a complete status, and a change to its
   `checks` or `acceptFrom`, which change only through plan approval. This
   closes the path where a caller types evidence instead of running checks.
5. Validation evidence used for acceptance SHALL be for the task's current
   commit and SHALL cover every declared check, not the earliest validation
   on record or a subset of checks.

### Requirement 39: Replacing a task by hand

Added 2026-11-12 (owner handoff). Design §5.2.

**User story:** As a maintainer, I want to replace a task with a new one and
have its dependents follow, so that a wrong task does not have to be bent
into the right one.

#### Acceptance criteria

1. A person MAY supersede a local-authority task with a new task in one
   operation. The new task SHALL record `supersedes`, the old task
   `supersededBy`, and the old task SHALL take status `superseded`, which is
   not complete and never ready. Its sessions, deliveries, verdicts, and
   evidence SHALL be kept as history; a running session SHALL be left alone.
2. Readiness SHALL follow the `supersededBy` chain on read: an edge from the
   old task SHALL be judged by the newest task in the chain. Edges SHALL NOT
   be rewritten, because plan approval rebuilds a task's plan edges and would
   undo a rewrite.
3. Plan approval SHALL NOT change `supersedes`, `supersededBy`, or the
   `superseded` status.
4. A chain with a cycle SHALL be refused. Superseding a task whose authority
   is GitHub or a plugin SHALL be refused with 409 (Requirement 19.3); such a
   task is replaced in the plan or in its tracker.
5. Supersede SHALL NOT be used for review rework, which stays inside one
   delivery as new attempts (Requirement 36.10).

### Requirement 40: Content rules

Added 2026-11-12 (owner request). Design §4.9. Written against the Avoozl
branch `kirocrew-native` at `dbf001b` (design F67–F74).

**User story:** As a maintainer at a company that uses Avoozl, I want to ban
private terms, internal system names, private repository names, hostnames,
and file locations from everything Avoozl writes or approves, without the
banned list itself ever landing in a repository, so that using Avoozl on
public or shared repositories cannot leak what the company keeps private.

#### Acceptance criteria

1. Content rules SHALL have two layers. `.avoozl.json` (public, reviewed in
   Git) SHALL name which rule sets apply, to which repositories and
   boundaries, and with which action. The rules of a rule set (its banned
   terms) SHALL come only from a private terms file outside Git or from an
   approved plugin (criterion 9), never from `.avoozl.json`, SQLite, or any
   tracked file, so that the list itself never lands in a repository.
2. A private terms file SHALL use the release scan's format (one
   `rule: regex` per line, `#` comments, matched per line and ignoring
   case). Avoozl SHALL refuse a terms file that Git tracks, or that sits
   inside a repository and is not ignored, and SHALL then treat its rule set
   as unavailable.
3. Avoozl SHALL check content at every boundary where it writes or approves
   content: the planner's drafted spec files before they are proposed; plan
   approval (every spec file and `avoozl/manifest.json`); issue and pull
   request titles and bodies; comments and replies; Project field values;
   worker, verifier, and reviewer briefs; and each worker's diff before it
   merges, added lines only. A rule set MAY narrow the boundaries and
   repositories it applies to; by default it applies to all of them.
   (Changed 2026-11-13: a task's links and notes when saved, the `notes`
   boundary, Requirement 61.18.)
4. Text SHALL be decoded before matching the way the plans-repo leak screen
   decodes it today (percent escapes, HTML character references, zero-width
   characters, backslashes), so that an encoded term still matches.
5. WHEN content matches a rule whose action is `block` (the default) THEN
   Avoozl SHALL NOT write or approve it, SHALL NOT redact or rewrite it, and
   SHALL open a decision for the owner that names the rule set, the rule id,
   the boundary, the target (file or field), and the line. WHEN the write
   comes from an agent's own tool call (a planner saving a draft, a
   responder posting a reply, a worker reporting `done`) THEN Avoozl SHALL
   refuse that call with the same names, so the agent can fix it in the same
   session, and SHALL record the refusal without opening a decision.
6. A rule set MAY use action `report`, which writes the content and records
   the finding in the Delivery view and a Kiro Crew notification. Built-in
   rule sets SHALL always block.
7. The owner SHALL be able to allow a blocked write once, with a reason.
   The allowance SHALL be recorded with who, why, and when, SHALL cover only
   that rule, that target, and that exact content (by hash), and SHALL be
   used up by the one write. Only a person SHALL allow, from the app page or
   the CLI; the tick, example installation, and agent sessions SHALL NOT.
8. Receipts, events, decisions, notifications, logs, and the GitHub text
   Avoozl writes SHALL NOT contain a matched private term in clear text;
   they SHALL show the rule set, the rule id, and the location. The app page
   MAY show the matched line on demand by reading it again from its source,
   and SHALL NOT store it.
9. A private plugin SHALL be able to supply rule sets through the plugin
   system (Requirement 34): a plugin kind `rules`, loaded only after a person
   approves its exact version and hash, whose rules stay in memory and are
   never written to SQLite, receipts, or Git. A company SHALL be able to ship
   its rules this way without them entering public Avoozl.
10. WHEN a rule set that `.avoozl.json` names is unavailable (terms file
    missing or refused, plugin missing, unapproved, or broken, or a rule that
    does not compile) THEN every boundary it covers SHALL fail closed: Avoozl
    SHALL write nothing there and SHALL open one decision naming the rule
    set and why it is unavailable. The tick SHALL finish everything the rule
    set does not cover.
11. Matching SHALL run within a time limit per check. A check that runs past
    it SHALL count as unavailable (criterion 10), so that a slow pattern can
    neither stop the tick nor let content through.
12. The plans-repo leak screen (Requirement 28.7, 28.8), the reply screen
    (Requirement 27.3, design §4.7), and the secret screen on markers,
    workspace publications, and broad-issue previews SHALL become built-in
    rule sets of this feature, applied at the same boundaries with the same
    patterns, decoding, and refusals as today. Their existing tests SHALL
    pass unchanged. Configuration SHALL NOT turn a built-in rule set off.
13. The release leak scan (Requirement 24.2) SHALL use the same terms file
    parser and matcher, and SHALL keep its public rules and its terms file
    location. For private-term findings it SHALL print the rule id and the
    file and line, not the matched line.
14. Public Avoozl files SHALL name no company-internal tool, term, or rule
    (Requirement 34.10). Tests SHALL use only fake terms files and a fake
    rules plugin kept in the test tree.
15. (Added 2026-11-13, owner decision.) A terms file MAY hold allow lines
    that cancel false positives. `allow: regex` SHALL cancel a match of any
    rule in that file on the same line; `allow <rule>: regex` SHALL cancel a
    match of only that rule. A match SHALL be dropped only when an allow
    pattern matches the same line the rule matched (an added line, for
    diffs). Allow patterns SHALL use the terms' case and regex rules and
    limits, and SHALL be kept and never echoed like terms: a cancelled match
    SHALL NOT be recorded as a finding, though a count of allowed matches
    per rule MAY be reported. A bad allow pattern, or `allow <rule>` naming
    a rule the file does not have, SHALL be a line-numbered error that does
    not repeat the line. Allow lines SHALL apply only to the owner's terms
    files: built-in rule sets SHALL be unchanged and keep only Allow once,
    and a rules plugin's set SHALL be refused if it returns allow patterns.
    The release scan SHALL accept allow lines in its terms file, applying
    them to that file's rules only, never to its public rules.
16. (Added 2026-11-13, owner request.) Settings > Content rules SHALL offer
    Design a rule set, which opens a chat seeded with the shipped
    `avoozl-rules` skill. The chat SHALL suggest rule and allow lines and
    SHALL NOT write a terms file; the person saves terms in the editor. The
    button and the skill SHALL warn that terms typed into a chat stay in its
    transcript.
17. Residual risk (named 2026-11-13, injection audit): text a worker
    writes to GitHub itself, such as pull request titles and bodies and
    `gh` comments, does not pass through Avoozl and is not checked by
    content rules. The pre-push hook checks the diff, and quoted outside
    text in briefs (Requirement 10.6, 10.11) narrows what can steer it.

### Requirement 41: Crew placement

Added 2026-11-12 (owner request). Design §4.10. Written against the Avoozl
branch `kirocrew-native` at `0a7ef2d` and Kiro Crew 0.12.2 (design F75–F84).
"Placement" is the choice of which crew runs a session. It is separate from
the route (Requirement 22), which chooses what does the work.

Changed 2026-11-12 (owner answers): remote workers push their task branches
to public and private repositories alike (criterion 5); router instructions
are machine-local only (criterion 7); Kiro Crew's MC-10 is a required
upstream ask, and every chat Avoozl opens must be attachable (criterion 14);
chat limits and the stale limit are configurable defaults (criteria 1 and 6).
These are decided, not defaults.

Changed 2026-11-13 (owner decision: routing went overboard). The rule
builder, presets, scorer and smart pick are removed. Routing is one opt-in
routing prompt: when it is on, one routing agent call per tick picks a crew
and a model for every ready worker, among the options that passed hard
checks (criteria 2, 4, 6, 7). Off, every session runs on `local` as before.
Providers fold into the same settings (Requirement 72).

**User story:** As an owner who runs several Kiro Crew instances (this
machine plus remote crews on other machines and operating systems), I want
Avoozl to run each task's sessions on the right crew, so that work spreads
by load, tests run on the operating system they need, and compliance and
user-facing work never leaves this machine.

#### Acceptance criteria

1. Avoozl SHALL keep a crew registry. Each crew SHALL have an id, a display
   name, tags (`os`, `arch`, `tools`, `trust` of `local` or `remote`, and
   the git hosts it can reach), and a chat limit. The list of crews SHALL
   come from Kiro Crew's connected instances plus this machine; tags, limits,
   and git hosts SHALL come from machine-local settings and SHALL NOT be
   written to any tracked file. This machine SHALL always be the crew
   `local` with trust `local`. The chat limit SHALL be configurable per
   crew; when a crew sets none, it SHALL default to 3 for `local` and 2 for
   each remote crew.
2. Routing SHALL be off by default and SHALL be turned on in this
   machine's settings only (`routing.enabled` and `routing.prompt` in
   `~/.config/avoozl/config.json`). A manifest task MAY declare `needs`,
   the crew tags its work requires (such as `os:windows` or
   `tools:docker`), and MAY pin `session.crew`, `session.model` or
   `session.agent`. A pin SHALL win over the routing prompt.
3. WHILE routing is off THEN every session SHALL run on `local`, as before;
   only a pin or `needs` in a manifest, or a local chat limit, changes
   that. WHILE Kiro Crew's remote dispatch switch is off THEN no remote
   crew SHALL be eligible. Installing or upgrading Avoozl SHALL NOT change
   where any session runs.
4. Hard checks SHALL run before any choice and SHALL only remove options:
   a crew SHALL be online (a fresh reading, reachable, under its chat
   limit), ready (it approves tools on its own, so a chat would not stall
   on an approval; a crew that does not say so SHALL NOT be offered), able
   to reach the repository (criterion 5, remote dispatch on, content rules
   allow it, and MC-10 or the Remote relay can open it), and SHALL have
   every tag the task `needs`; a model whose provider or itself is `out`
   (Requirement 72) SHALL NOT be offered. The routing prompt SHALL NOT be
   able to add an option the checks removed.
5. A session SHALL be placed on a remote crew only when its base commit and
   its task branch can be fetched by that crew: the repository's remote is a
   git host the crew lists, and the base commit is on that remote. Avoozl
   itself SHALL still never push; a task whose base exists only on this
   machine SHALL stay local. Code MAY come from any git host, GitHub or a
   private git host. A remote worker SHALL push its own task branch to that
   remote, and this SHALL be allowed on public and private repositories
   alike. Repository visibility SHALL NOT change placement or the push. What
   gets pushed SHALL still pass the content rules (criterion 11,
   Requirement 40) and the repository's policy (Requirement 10).
6. Each crew's readings SHALL name their source and time; a reading older
   than the stale limit, or missing, SHALL make that crew not online. The
   stale limit SHALL be one machine-local setting, 120 seconds when unset.
   Minimum free memory and disk SHALL be read from Kiro Crew's own remote
   dispatch settings, not duplicated in Avoozl.
7. WHEN routing is on THEN, each tick, ONE routing agent call (the
   tool-less `avoozl-router` agent) SHALL rank every ready worker that has
   more than one option, and SHALL pick a crew and a model for each. Its
   brief SHALL hold the person's prompt, the facts Avoozl checked that tick
   (each crew's load and check results, each provider's health and usage,
   such as "claude: 85% used, low"), and each task with its own options.
   Task text in the brief SHALL be marked and fenced as untrusted data. The
   reply SHALL be validated against each task's options. An answer SHALL be
   used in the one tick that reads it, after the checks run again on that
   tick's facts, and SHALL NOT be cached across ticks. A bad, missing or
   late reply (90 seconds), or a pick outside a task's options, SHALL fall
   back to `local` and SHALL be logged in Activity. The prompt SHALL live
   only in machine-local settings; validation SHALL refuse it, and the old
   `routing.rules`, `routing.pick` and `routing.router` keys, in a tracked
   `.avoozl.json`. A task with one option SHALL take it without a call, and
   Avoozl SHALL record "only one choice" in the Activity log; a tick whose
   ready tasks all have one option SHALL make no routing call.
8. WHEN no crew can ever pass a task's hard checks THEN the task SHALL wait
   and Avoozl SHALL open one decision naming the check that ruled each crew
   out. WHEN crews pass but none has room THEN the task SHALL wait without
   a decision. Avoozl SHALL NOT run a session on a crew that failed the
   checks, in either case.
9. Every placement SHALL be recorded on the session binding: crew id, the
   reason (pinned, the only option, the routing agent's reason, or the
   fallback and why), the reading, the crews and models ruled out with why,
   and the time. The Delivery view SHALL show the crew for each running
   session.
10. WHEN a crew becomes unreachable while one of its sessions runs THEN
    Avoozl SHALL treat the session as a lost worker under Requirement 8: it
    SHALL keep the binding, SHALL NOT place the task elsewhere only because
    a lease or timeout expired, and SHALL reconcile with that crew's session
    state when it returns. Moving the task to another crew SHALL need a
    person's retry or the bounded retry policy after a reported failure.
11. Briefs sent to any crew SHALL pass the content rules (Requirement 40)
    and the plans-repo leak screen (Requirement 28.7) before they are sent.
    A content-rule set MAY forbid remote crews; a set that covers the `diff`
    boundary SHALL forbid remote crews unless the set allows them, because
    the pre-push hook Avoozl installs (Requirement 40, task 10.4) cannot be
    installed on another machine.
12. Planner, critic, and responder sessions, and any session that waits on
    the owner in chat, SHALL stay local. Placement SHALL apply to worker,
    checks, and reviewer sessions only.
13. A remote session's work SHALL come back the way a local one does: the
    worker reports `done` with a commit on its task branch, Avoozl fetches
    that branch into the local checkout, and verification, review, and
    integration run as for a local worker. Public tests SHALL use only fake
    crews.
14. The owner SHALL be able to attach to every chat Avoozl opens, local or
    remote: open it and type into it from the app's **In flight** card.
    Opening remote sessions from Avoozl's tick and app SHALL require Kiro
    Crew's MC-10 (design §7.1), a required upstream ask. Until MC-10 ships,
    remote crews SHALL fail the reach check, every session runs on `local`,
    and Settings › Routing SHALL say that remote crews wait on Kiro Crew. Avoozl SHALL NOT work
    around Kiro Crew's owner-only check.
15. (Added 2026-11-13, owner decision.) Each remote crew SHALL have a
    machine-local `delivery` of `handback` (the default) or `push`. Under
    `handback` the remote worker SHALL commit on its task branch in a folder
    under the crew's `worktreeRoot` and SHALL make no GitHub write; this
    machine SHALL fetch that branch over SSH from the crew's `sshHost`,
    SHALL pin the host key on first use, and SHALL refuse a fetch whose host
    key changed. Content rules, local checks, verification, review, and
    integration SHALL then run on this machine as for a local worker, and a
    local Kiro Crew chat SHALL push. The Avoozl process itself SHALL never
    push. Under `push` the worker SHALL push its task branch as criterion 5
    says. Public tests SHALL use a fake SSH command and SHALL never connect
    to a real host.

### Requirement 42: Routing page

Added 2026-11-12 (owner request). Design §8.3. Changed 2026-11-13 (owner
decision): Routing moves into Settings, and the rule builder, presets,
scorer, smart pick, the separate Providers page and its thresholds form are
removed.

**User story:** As the owner, I want one settings tab that turns routing
on, holds my one routing prompt, and shows what the checks see, so that I
can steer where work runs without writing rules.

#### Acceptance criteria

1. Settings SHALL have one tab named **Routing**. There SHALL be no
   top-level Routing page and no Settings › Providers tab.
2. The tab SHALL have four sections in this order: **Routing prompt**,
   **Providers**, **Crews**, and **Preview**. Each section SHALL have a
   heading and one short line under it, and an empty section SHALL say what
   to do.
3. **Routing prompt** SHALL hold the on/off switch (off by default), the
   prompt box (saved on this machine only, at most 4000 characters), the
   routing agent's model, and canned examples the person inserts and
   edits: at least "Tests go remote", "Private repos stay local", "Spread
   the load", "Prefer Kiro models when Claude is low", and "70% Claude, 30%
   Kiro". It SHALL show the last call's outcome, including a fallback and
   why.
4. **Providers** SHALL show each provider's health, its usage in the last
   5 hours (percent of its limit when one is set), an optional credits
   limit per provider, and one **Low at** setting (80% when unset, shown as
   a placeholder).
5. **Crews** SHALL list each crew with tags, trust, chats, load, free
   memory, and each check's result (online, ready, reaches repos) with why.
   Each crew's chat limit and tags SHALL be editable in a side form, and
   the section SHALL hold one stale limit field; both SHALL show their
   default (3 for `local`, 2 for a remote crew, 120 seconds) as a
   placeholder. While MC-10 is missing, the section SHALL say remote crews
   wait on Kiro Crew.
6. **Preview** SHALL be a dry run on the current ready tasks: each task's
   options, what ruled the rest out, what would happen, and the brief one
   routing call would get. Preview SHALL be read-only: it SHALL NOT open
   sessions, call an agent, or write state.
7. Removing a crew's settings SHALL ask for confirmation first. Yellow SHALL
   mark only things that need the owner, such as a task with no fitting
   crew or a provider that is out.
8. Edits SHALL go through the same validated operations as the CLI and MCP
   tools (Requirement 20.4), with the machine file's hash, and SHALL be
   person-only.

### Requirement 43: Flow timing

Added 2026-11-12 (owner request). Design §4.11. Background: a long
multi-phase rewrite run through agents took weeks, and finding where the
time went needed a person to ask for an analysis each time (design §4.11,
"Why this exists").

**User story:** As the owner, I want Avoozl to record where each task's time
goes, so that I can see what slows delivery without asking an agent to
reconstruct it.

#### Acceptance criteria

1. Avoozl SHALL record timing for every delivery attempt, always, with no
   setting to turn it off. Timing SHALL be stored in the workspace's SQLite
   file and SHALL NOT be written to any tracked file or sent to GitHub.
2. Each attempt's wall-clock time SHALL be split into these stages:
   `queued`, `coding`, `tests`, `commands`, `ci-wait`, `review`, `rework`,
   `merge`, and `waiting` (on a person or on another task's answer). Each
   span SHALL record its stage, start, end, task, attempt, session role, and
   the source it came from.
3. Spans SHALL come from events Avoozl already sees: readiness, dispatch,
   session status, `plans_report` reports, verifier and review results,
   GitHub check-run and review times, retries, and integration or merge.
   Avoozl SHALL NOT add a poller, webhook, or listener for timing
   (Requirement 26).
4. WHERE Kiro Crew lets the app read a session's tool calls (design F90,
   F91) THEN Avoozl SHALL split worker time into `coding`, `tests`, and
   `commands` from them: a shell call that runs one of the repository's
   declared checks SHALL count as `tests`, any other shell call as
   `commands`, and the rest as `coding`.
5. WHERE tool calls cannot be read (a Crew Mode worker, a remote session, or
   a Kiro Crew without that read) THEN Avoozl SHALL use the phase markers a
   worker sends with `plans_report` `progress` (`phase`: `coding`, `tests`,
   `commands`, or `ci-wait`), and SHALL count unmarked worker time as
   `coding`. Every span SHALL name which of the three sources (tool calls,
   phase markers, or events) it came from, so a coarse number never reads
   as an exact one.
6. Timing SHALL hold durations, stage names, check names, and command names
   only. It SHALL NOT hold prompts, transcript text, tool output, tokens, or
   cost. A command name SHALL pass the content rules (Requirement 40) before
   it is stored.
7. Avoozl SHALL compute, per task and per window of finished tasks: lead
   time (ready to integrated or merged), flow efficiency (active time over
   lead time, where active is `coding`, `tests`, `commands`, `rework`, and
   `merge`), first-pass rate (share of tasks accepted on their first
   attempt with no rework), time to fix (line stopped to line green,
   Requirement 44), and change failure rate (share of integrated tasks
   later named as a culprit, Requirement 44).
8. Timing SHALL survive a gateway restart and a backend restart. A span open
   when the backend stopped SHALL be closed at the next event that ends it,
   not at the restart.

### Requirement 44: Stop the line

Added 2026-11-12 (owner request). Design §4.11.

**User story:** As the owner, I want new work to stop when a change breaks
something that worked, so that a failure is fixed while it is fresh instead
of every later task building on it.

#### Acceptance criteria

1. Avoozl SHALL stop the line WHEN a declared check that passed on a
   repository's landing branch (the integration branch in local delivery,
   the base branch in GitHub modes) fails on a later commit of that branch,
   and it still fails when Avoozl runs it once more on the same commit.
2. Avoozl SHALL stop the line WHEN a task breaks its dependents: a
   dependent's verification fails on a check that also fails when Avoozl
   runs it once on the dependent's unchanged base commit, or a dependent's
   worker reports `blocked` naming the task as the cause. A failure that
   also fails on the base SHALL NOT cost the dependent's writer an attempt.
3. A check that fails and then passes on the same commit SHALL NOT stop the
   line. Avoozl SHALL record it as flaky with the check name and commit.
4. Avoozl SHALL find the culprit between the last green commit and the
   first red one. With one integrated task commit in that range, that task
   SHALL be the culprit. With more, Avoozl SHALL bisect in a separate
   worktree, never in the landing checkout, up to 8 check runs; past that
   bound the culprit SHALL be "unknown" and the range SHALL be recorded.
5. WHILE the line is stopped THEN Avoozl SHALL NOT dispatch new work in the
   stop's scope. The scope SHALL be the setting `flow.stopTheLine.scope`:
   `dependents` (the culprit's transitive dependents; with an unknown
   culprit, every task in the repository), `repo` (every task in the
   repository), or `all` (every task in the workspace). The default SHALL
   be `dependents`.
6. WHILE the line is stopped THEN running sessions SHALL be left alone, and a
   failure of the stopped check on another task's commit SHALL count as not
   judged (Requirement 38): it SHALL keep that task's gate shut and SHALL
   NOT cost its writer an attempt.
7. Avoozl SHALL create one fix task for each stop, first in line for the
   next free slot in that repository. Its brief SHALL name the check, the
   culprit commit or range, and the failing output's last lines after the
   content rules (Requirement 40), and SHALL allow either a fix or a revert
   of the culprit commit. A second stop for the same check SHALL reuse the
   open fix task.
8. WHEN the stopped check passes on the landing branch head THEN Avoozl SHALL
   resume dispatch in the scope, close the stop with its time to fix, and
   notify the owner once.
9. The Dashboard SHALL show a red **Line stopped** banner naming the check,
   the branch, the culprit, the fix task and its state, and how many tasks
   are paused. The stop SHALL enter **Needs you** only when the fix task
   reports a `question`, reports `blocked` with a reason only a person can
   act on, or fails past its retry bound.
10. The owner MAY press **Run anyway**, which SHALL ask for confirmation,
    resume dispatch in the scope while the stop stays open, and record who
    pressed it and when. Only a person SHALL be able to run anyway; agent
    and plugin callers SHALL be refused.
11. The culprit task SHALL stay integrated and accepted. Avoozl SHALL NOT
    reopen, revert, or supersede it by itself.

### Requirement 45: Local checks first

Added 2026-11-12 (owner request). Design §4.11.

**User story:** As the owner, I want every pushed commit to have passed the
repository's checks on the machine that made it, so that CI only confirms
and nobody waits on CI to learn about a failure.

#### Acceptance criteria

1. The setting `flow.localChecksFirst` SHALL default to `true`.
2. WHILE it is on THEN every brief for a session that may push SHALL tell
   the worker to run the repository's declared checks in its worktree
   before each push, and a `done` report for a pushed commit SHALL list
   each check's command, exit code, and duration for that commit.
3. WHILE it is on THEN Avoozl SHALL refuse a `done` report for a pushed
   commit whose check list is missing, names another commit, or has a
   failed check. A not-run check SHALL keep the gate shut as in
   Requirement 38.
4. WHILE it is on THEN the pre-push hook Avoozl installs in its worktrees
   (task 10.4) SHALL refuse a push whose commit has no recorded local pass
   of every declared check. It SHALL NOT run the checks a second time.
5. WHEN CI fails on a commit that passed locally THEN Avoozl SHALL record a
   "CI only" failure with the check names, so that a difference between the
   two environments shows in the Flow tab.
6. Local delivery, where nothing is pushed, SHALL be unchanged: the
   checks already run on this machine (Requirement 7.1).
7. Avoozl SHALL NOT enforce this on sessions it does not open (for example
   Issue Radar's); the Flow tab SHALL show their CI wait like any other.

### Requirement 46: Batching small tasks

Added 2026-11-12 (owner request). Design §4.11.

**User story:** As the owner, I want small related tasks to share one run,
so that the fixed cost of a session, a worktree, checks, and review is paid
once instead of once per tiny task.

#### Acceptance criteria

1. A leaf SHALL be batchable only when its manifest entry sets
   `size: "small"`. Leaves without it SHALL never be batched.
2. Avoozl SHALL group ready batchable leaves into one run when they share
   the key `flow.batch.by` names: `epic` (the same parent) or `files`
   (overlapping manifest `paths`). The default SHALL be `epic`. (Changed
   2026-11-13: `epic` is now named `phase`, and `epic` is refused,
   Requirement 59.11.)
3. A batch SHALL hold at most `flow.batch.max` leaves, default 3. A value of
   1 SHALL turn batching off.
4. A batch SHALL hold only leaves with the same repository, route, crew,
   and review roles, no edge between them, and local authority. Leaves with
   GitHub authority SHALL NOT be batched in this phase, because their
   closing links are one per issue (design §4.11).
5. A batch SHALL run in one worker session and one worktree. The worker
   SHALL make one commit per task, in order, and report `done` per task.
   Checks and review SHALL run once on the batch head, and the batch SHALL
   integrate as one rebase.
6. WHEN a batch's checks or review fail THEN Avoozl SHALL split the batch and
   retry each task alone, never batched again in that delivery. A split
   SHALL NOT cost any task an attempt.
7. Every task in a batch SHALL keep its own ID, acceptance, commit, timing,
   and evidence. The Graph and Delivery views SHALL show the batch it ran
   in.

### Requirement 47: Retrospectives

Added 2026-11-12 (owner request). Design §4.11.

**User story:** As the owner, I want Avoozl to stop now and then, look at
where time went, and propose one change to how work runs, so that the
process improves without my asking and without changing on its own.

#### Acceptance criteria

1. Avoozl SHALL start a retrospective WHEN `flow.retro.everyTasks` tasks
   (default 10) have finished since the last one, WHEN a task's lead time
   passes `flow.retro.slowFactor` (default 3) times the median lead time of
   that repository's last 20 finished tasks (with at least 5 of them), WHEN
   a task starts its third attempt, or WHEN one CI wait passes
   `flow.retro.slowFactor` times that repository's median CI wait (with at
   least 5 samples; 30 minutes without them).
2. At most one retrospective SHALL run per workspace at a time. Triggers
   during a running one SHALL fold into the next one, and a slow-task, retry,
   or CI trigger within an hour of the last retrospective SHALL wait for the
   next count trigger.
3. A retrospective SHALL run as one local session of the tool-less
   `avoozl-retro` agent on the model `flow.retro.model` (default `auto`,
   Kiro Crew's default). Its brief SHALL hold the timing summary, line
   stops, flaky checks, CI-only failures, and the results of earlier
   proposals, and SHALL pass the content rules at the `brief` boundary
   before it is sent.
4. Its reply SHALL name the biggest bottleneck (the stage with the most
   waiting or the most rework across the window) with its numbers, and up
   to 3 proposals. Each proposal SHALL be typed as a settings change (file,
   key, current value, new value) or a plan change (spec and the change in
   words), and SHALL name the metric it should move, the expected
   direction, and its evidence. Avoozl SHALL check the reply against a
   schema and SHALL drop a proposal that fails it, recording why.
   (Changed 2026-11-13: a proposal MAY also be typed `prompt` or
   `skill`, Requirement 68.)
5. A settings proposal SHALL be limited to keys the Settings page can edit.
   Avoozl SHALL refuse proposals to change content rules, plugin trust or
   approvals, trigger actors or minimum permission, crew trust, and tokens.
   A proposal that removes a review role or a declared check SHALL be marked
   "removes a check" and SHALL need a second confirmation.
6. A retrospective SHALL never apply anything. Each proposal SHALL wait for
   the owner's **Approve** or **Reject**. Approving a settings change SHALL
   write it through the same validated operation as Settings, with an
   expected revision. Approving a plan change SHALL open a planner draft for
   it, which then needs plan approval like any other (Requirement 4.8).
7. After an approved proposal, Avoozl SHALL record its metric over the last
   `flow.retro.everyTasks` finished tasks, and again after that many more
   (plan, do, check, act). WHEN the metric did not move at least 10% in the
   expected direction THEN the next retrospective SHALL include a typed
   proposal to revert the change, which the owner approves or rejects like
   any other.
8. The retrospective instructions (`flow.retro.instructions`, free text)
   SHALL live only in machine-local settings. Validation SHALL refuse them
   in `.avoozl.json`, as with the routing prompt (Requirement 41.7).
9. A retrospective that fails, times out (default 10 minutes), or replies
   with nothing valid SHALL be recorded as failed with its reason and SHALL
   NOT stop the tick or delivery.

### Requirement 48: Flow tab and Flow settings

Added 2026-11-12 (owner request). Design §4.11, §8.4.

**User story:** As the owner, I want one tab that shows how delivery flows
and what to change, and one settings group for the flow rules.

#### Acceptance criteria

1. The app SHALL have a top-level **Flow** tab with an icon before its name,
   the same icon on its nav tab.
2. The Flow tab SHALL show metric cards for lead time, flow efficiency,
   first-pass rate, and time to fix over a chosen window, each beside the
   previous window's value; a stacked time bar per task by stage; one
   biggest-bottleneck callout; and the list of retrospectives with their
   proposals, **Approve** and **Reject** buttons, and PDCA results.
3. The Flow tab SHALL use the shared boxed filter panel (repository, epic,
   window, stage) and SHALL be read-only except for Approve, Reject, and
   starting a retrospective by hand.
4. The task drawer SHALL have a **Timing** section with the task's stacked
   bar, each span's stage, length, and source, and the batch it ran in.
5. The Dashboard SHALL show the **Line stopped** banner of Requirement 44.9
   above every other section while a stop is open.
6. Settings SHALL have one **Flow** group with sub-groups **Timing**
   (read-only explanation, no fields), **Stop the line** (scope), **Local
   checks first** (on or off), **Batching** (max, by), and **Retro**
   (every N tasks, slow factor, model, instructions). Each SHALL have a
   heading and one short line, plain labels with the raw key shown small,
   "(required)" or "(optional)" in plain text, and defaults as placeholders.
   The instructions box SHALL say it is saved on this machine only.
7. The `flow` settings SHALL live in `.avoozl.json` per workspace and MAY be
   overridden per repository, except `flow.retro.instructions`, which is
   machine-local only. A missing key SHALL mean its default.
8. Edits SHALL go through the same validated operations as the CLI and MCP
   tools (Requirement 20.4), with expected revisions, and each setting SHALL
   live in one place only.

### Requirement 49: Untriaged list

Added 2026-11-12 (owner request). Design §8.5.

**User story:** As the owner, I want one list of the open issues and pull
requests no trigger rule or triage label covers, so that nobody misses new
GitHub work, and I want each item to hand off to Issue Radar or Code Review
Sage for the actual work.

Avoozl acts only on issues a trigger rule matches and reads only the pull
requests tied to its own tasks; Issue Radar notifies only on CI failures for
the owner's own pull requests. Only Avoozl knows which items no rule will
pick up. The list is a triage list, not a second issue browser
(§2, Requirement 20).

#### Acceptance criteria

1. The list SHALL exist only in the GitHub modes. In Local only mode the tab
   SHALL be hidden and Avoozl SHALL read nothing for it. (Changed
   2026-11-12 by Requirement 50.16: GitHub items stay GitHub-mode only,
   and the tab also shows in Local only mode when a non-GitHub source is
   declared.)
2. An item SHALL be **untriaged** in a repository of `github.repositories`
   when it is an open issue or pull request that matches the repository's
   untriaged filter, carries none of its triage labels and none of its
   managed labels, is not tied to an Avoozl task, and, for an issue, matches
   no trigger rule's labels, assignee, and author. A pull request is tied to
   a task when a task records it or it closes a task's issue; an issue is
   tied when it is a task's issue. Labels SHALL compare without case.
3. Settings › Repositories › Triggers and labels SHALL have an **Untriaged**
   group with **Untriaged filter** (optional, `untriaged.filter`): one line
   in the trigger rules' search grammar and parser (§4.4), shown with its
   parsed terms as chips and a count of what it matches now. Unlike a rule's
   `match`, it SHALL NOT need a `label:` term. Blank SHALL mean
   `-label:<each triage label>`, shown as the placeholder.
4. The same group SHALL have **Triage labels** (optional,
   `untriaged.triageLabels`) as one checkbox per label the repository has on
   GitHub; a saved name GitHub no longer has SHALL stay and be marked. A
   triage label SHALL NOT be a managed label.
5. The same group SHALL have **Ignore older than** (optional,
   `untriaged.ignoreOlderThanDays`, a whole number of days from 1 to 3650;
   blank shows every age) and **Notify me** (optional, `untriaged.notify`,
   off by default).
6. Only the tick cron SHALL read GitHub for the list: at most one search per
   repository per 10 minutes, read only, cached beside the workspace
   database with the time it was checked and any error. A failed read SHALL
   keep the last cached items and show the error. A changed filter, label
   list, or age SHALL be read again on the next tick. Avoozl SHALL NOT write
   GitHub for this list.
7. The read-only operation `untriaged.view` SHALL return each repository's
   untriaged items, its checked time, its error, and whether the list was
   cut short, applying criterion 2 at read time so a rule or task change
   shows at once. With `refresh: true` it SHALL read GitHub again first,
   still read only. The read SHALL take every page GitHub search returns;
   past GitHub's 1,000-result cap the list SHALL show the true total and how
   many were read, and say to narrow the filter.
8. Each item SHALL link out: its number and title to GitHub in a new tab
   with `rel="noopener noreferrer"`, **Open in Issue Radar** to that item,
   and for a pull request **Code review** to Code Review Sage's review of it.
   WHERE Kiro Crew offers no link to the exact item, the button SHALL open
   the app's page and its tooltip SHALL say so (MC-14, design §7.1).
9. The page SHALL have a top-level **Untriaged** tab with an icon before its
   name, the same icon on its nav tab, and a count badge in a Kiro palette
   color other than yellow.
10. The tab SHALL use the shared boxed filter panel (repository, kind, age,
    author, label), show 100 rows a page, and show per row: a kind icon, the
    number and title, repository, author, age, labels, comments, and for a
    pull request its draft and checks state. Row buttons SHALL be icons with
    the shared tooltip.
11. Rows SHALL be selectable by mouse and keyboard, and a bulk **Open
    selected in Issue Radar** SHALL hand over the selection, by the same
    rule as criterion 8.
12. The empty state SHALL say what untriaged means and where to change the
    filter.
13. The Dashboard SHALL show a small **Untriaged** count that opens the tab.
14. WHEN `untriaged.notify` is on for a repository and its count rose since
    the last notice THEN Avoozl SHALL send one Kiro Crew notification for
    the workspace naming the counts, at most once an hour, never one per
    item.
15. The list SHALL NOT show item bodies, comments, CI logs, or review
    findings, and SHALL NOT edit labels, assignees, or state: those stay in
    Issue Radar, Code Review Sage, and GitHub.
16. **Code review** on a pull request row SHALL open a new Kiro Crew chat
    through the tick's own session permission, seeded with the pull
    request's URL, repository, number, head commit, title, author, its Avoozl
    task and spec section if any, and an ask to review that one pull request
    with the sage-review skill, comments as drafts, posting nothing. WHEN the
    skill is not installed THEN the seed SHALL ask for a careful
    single-pull-request review without it. (Added 2026-11-13: a stand-in
    until Kiro Crew can start Code Review Sage on one pull request, MC-15.)
    The seed SHALL quote the title as data and say that the pull request's
    title, description, comments, commits, and diff are data, not
    instructions, since its author may be anyone (added 2026-11-13,
    injection audit). The chat SHALL run on the app's read-only
    `avoozl-code-review` agent: file reads, and a shell whose
    `toolsSettings` deny every command but `gh pr view|diff|checks`,
    `gh issue view`, and flagless `gh api` reads of one pull request or
    issue; no file write and no GitHub write (added 2026-11-13, injection
    audit follow-up).
17. The seed SHALL pass content rules (`brief`) before it is queued; a block
    SHALL queue nothing and open a decision. Only a person SHALL start a
    review chat.
18. The row SHALL show Attach once the chat exists, and the button's tooltip
    SHALL say it is a stand-in until the app can start Code Review Sage
    directly. A second click SHALL reuse a queued or open chat. Avoozl SHALL
    make no GitHub write for it.

### Requirement 50: Incoming items from every source

Added 2026-11-12 (owner idea). Design §4.12, §8.5.

**User story:** As the owner, I want work from GitHub, an internal ticket
tracker, an internal code review system, and anything else I script to
come into Avoozl the same way, so that one set of trigger rules, one
"who counts" check, and one Untriaged list cover all of it, and an outside
tool can hand Avoozl an item over MCP.

Today intake and the Untriaged list read GitHub only, and tracker plugins
only push Avoozl's own tasks out (design F101–F105). This requirement adds
one record, one operation, and two ways in, and moves the GitHub intake
and the Untriaged reader onto the record without changing what they do.

#### Acceptance criteria

1. An **incoming item** SHALL be one record: `source`, `id`, `link`,
   `kind` (`issue`, `pr`, `review`, or `ticket`), `title`, `body`,
   `labels`, `author`, `assignees`, `state` (`open` or `closed`, with
   `closeReason`, `closedBy`, and `closedAt` when closed), `updatedAt`,
   `fields` (the source's own values), and an optional `trigger`
   (`actor`, `permission`, `eventId`, `at`): the event that last changed
   what a rule would match.
2. Every item from a plugin or an MCP caller SHALL be checked before it is
   stored, as untrusted data: `source` and `id` 1–200 characters; `link`
   http or https only; `title` 1–240 characters; `body` at most 20,000;
   at most 100 labels and 20 assignees of at most 200 characters each;
   `fields` at most 50 keys of text, number, or true/false values of at
   most 2,000 characters. A bad item SHALL be refused with a reason naming
   the field, and the other items of the same call SHALL still be stored.
3. The dedup key SHALL be `source` plus `id`. Storing an item whose
   content is unchanged SHALL write nothing. An item whose `updatedAt` is
   older than the stored one SHALL be ignored as stale and reported so.
4. Incoming items and each source's read state (cursor, last read time,
   error) SHALL be stored in the workspace SQLite database. The GitHub
   intake (`syncGitHubIssues`) SHALL write the issues it lists as items
   with `source: "github"`, and the Untriaged reader SHALL keep its search
   results as items, so `untriaged.json` is no longer written. Both SHALL
   keep their current listing, interval, actor check, snapshot freeze,
   exclusions, and results (Requirements 10–12, 49).
5. The operations `intake.submit`, `intake.list`, and `intake.view` SHALL
   live in `operations.mjs` and be shared by the page, the CLI
   (`avoozl intake submit|list|view`), and MCP (the grouped `plans_intake`
   tool of Requirement 56, actions `submit_items`, `items`, and `item`).
   Existing `plans_*` names SHALL NOT change. `intake.list` and `intake.view` SHALL only read.
6. Sources other than GitHub SHALL be declared under `intake.sources` in
   `.avoozl.json` or in the machine-local Avoozl settings, like `plugins`
   entries (Requirement 34.1): an id (`github` and `local` reserved),
   `via` (`plugin:<id>` or `mcp`), the registered workspace `repository`
   its work lands in, and optional `labelFields`, `assigneeField`,
   `allowedActors`, and `minimumPermission`. Settings SHALL warn before
   saving a source into a `.avoozl.json` in a public repository.
7. A tracker plugin MAY declare the `poll` capability and implement
   `poll({cursor, limit})`, returning `{items, cursor, more}`. The tick
   cron SHALL call it at most once per source per tick with the stored
   cursor, and SHALL store the new cursor only after every item of the
   reply is handled. A failed or invalid poll SHALL keep the cursor and
   the stored items, show the error on the source, and leave the rest of
   the tick running (design §4.8 failure isolation). A plugin with
   `poll` that no task names as authority SHALL never be asked to
   `project`, `read`, `list`, or `close`.
8. `intake.submit` SHALL take `{source, items}` with 1–100 items for a
   source whose `via` is `mcp`, and return a result per item (`created`,
   `updated`, `unchanged`, `stale`, or `refused`, with a reason) and
   where it went. A submit to `github`, to a plugin source, or to an
   undeclared source SHALL be refused. Both ways in SHALL produce the
   same record and run the same pipeline.
9. Each stored or changed item SHALL go through, in order: dedup, content
   rules, trigger match, then the matched action (`deliver`, `execute`,
   `plan`, `respond`, `pause`, `resume`, `quarantine`, by the precedence
   GitHub intake uses today), or the Untriaged list when no rule matches.
10. Content rules SHALL gain an `intake` boundary (Requirement 40.3) that
    screens an item's title, body, labels, and fields. A `block` finding
    SHALL quarantine the item and open a decision that names the set and
    rule but never the matched text; a `report` finding SHALL be recorded
    and the item SHALL continue. No built-in set SHALL run at `intake`, so
    GitHub intake behaves as before unless a set names the boundary.
11. A rule's `match` SHALL accept one `source:<id>` term. A rule without
    one SHALL match only GitHub items, as today. `source:` SHALL be
    refused in an Untriaged filter, which GitHub search reads. For a
    non-GitHub source, each `labelFields` entry SHALL add a label
    `<field>:<value>` from the item's `fields`, and `assigneeField` SHALL
    add an assignee, before matching.
12. For GitHub items, who counts SHALL stay as it is: the newest
    triggering event's actor, checked against the repository's
    `allowedActors` and `minimumPermission` (Requirement 10.4, 10.5).
13. For a plugin source, the plugin SHALL state the actor and that
    actor's standing (`trigger.permission`, one of `none`, `read`,
    `triage`, `write`, `maintain`, `admin`, mapped by the plugin from its
    own system's roles), and Avoozl SHALL apply the same check against
    the source's `allowedActors` and `minimumPermission` (default
    `write`). A plugin without the `actor` capability SHALL have no
    allowed actor.
14. An MCP caller SHALL count as the local owner, with no verifiable
    outside actor: whatever `author` or `trigger` it sends is recorded as
    its claim. Its items SHALL be listed, MAY meet `pause` and
    `quarantine` rules, and SHALL NOT meet a `deliver`, `execute`,
    `plan`, `respond`, or `resume` rule. A close it reports SHALL be
    treated as a close by an actor who is not allowed (criterion 18).
15. The Intake tab SHALL offer a person **Plan this** (an inbox task
    tied to the item, through `task.capture`) and **Deliver this** (one
    leaf in the source's repository, pinned to the item's snapshot) on a
    non-GitHub item. Both SHALL be refused with 403 from an agent session
    or MCP, like `content.allow`.
16. The Intake tab SHALL list untriaged items from every source, with
    a **Source** filter and the source on each row. GitHub items SHALL
    keep Requirement 49 unchanged. The tab SHALL also show in Local only
    mode when a non-GitHub source is declared, with only those sources.
    A non-GitHub row SHALL link to its item's `link` and SHALL NOT show
    Issue Radar buttons. (The tab was named Untriaged until 2026-11-13;
    see criterion 23.)
17. WHEN a source changes an item tied to a task THEN Avoozl SHALL update
    the record and the task's cached title and labels, re-run the trigger
    match, and withdraw the task's authorization when no allowed match is
    left. A body or title changed after the trigger snapshot SHALL
    quarantine the task, which keeps the snapshot's title, until an allowed
    actor re-triggers it or a person confirms the new snapshot
    (Requirement 12.1, 12.2). A person confirms with `intake.confirm`
    {source, id, hash}, where `hash` is the `snapshotHash` (title and
    body) that `intake.view` showed; a changed item SHALL be refused. The
    confirm SHALL move the task's snapshot to that text, record
    `confirmedHash` and when, and let the task run again. Sessions and MCP
    callers SHALL be refused (added 2026-11-13, injection audit follow-up).
18. WHEN a source closes an item tied to a task THEN the allowed-close
    rule SHALL apply (Requirement 33.8–33.10): an allowed actor's close is
    an order that releases dependents, is recorded, and never counts as a
    verified completion; any other close, or one whose actor is unknown,
    holds the dependents and opens a decision. Avoozl SHALL NOT reopen the
    item. A reopened item withdraws the order; dependents wait again for
    new dispatch only, and running sessions are left alone.
19. An item of kind `review` SHALL go to the review flow, never to
    delivery: no `deliver`, `execute`, `plan`, or `respond` rule SHALL
    match it. It SHALL be listed in Untriaged with a **Code review**
    hand-off to Code Review Sage, by the fallback of Requirement 49.8.
    WHERE Kiro Crew offers an app call that starts a Code Review Sage
    review of one item (MC-15), a `review` rule action SHALL start one
    review per item snapshot.
20. Avoozl SHALL write nothing to a non-GitHub source in this phase. A
    `respond` rule with a non-GitHub `source:` SHALL be refused at
    validation.
21. A closed item tied to no task SHALL be deleted from SQLite 30 days
    after it closed. An item tied to a task SHALL be kept while the task
    exists.
22. Public Avoozl code, docs, fixtures, and tests SHALL name sources only
    generically ("internal ticket tracker", "internal code review
    system", the fake plugin, the fake MCP caller), and the release leak
    scan (task 7.4) SHALL cover them.
23. The tab of Requirement 49 SHALL be named **Intake** in the page,
    docs, and spec (owner decision 2026-11-13), and **Untriaged** SHALL
    stay as its default filter. The `untriaged` setting keys and the
    `untriaged` notification channel id SHALL keep working; `intake`
    SHALL be accepted as the channel's other name.

### Requirement 51: Archiving a plan, and review state shown plainly

Added 2026-11-13 (owner request and owner report).

**User story:** As the owner, I want to put a plan away and bring it back
later without losing anything, and I want a task marked "review" with no
review behind it to say so, so that I never look for a review chat that does
not exist.

Delete (`plan.delete`) is the one-way path: it archives the plan's open task
rows and keeps the plan only as history, and an approved plan cannot be
restored. Archive is the reversible one. There is no separate "retire"
action: retiring is what Delete does to a plan with an approved revision.

#### Acceptance criteria

1. Replaced by Requirement 56.4: a session may archive and unarchive a
   plan too.
2. WHEN a plan is archived THEN its open and running tasks SHALL be held
   (no new dispatch: the ready rule SHALL leave them out), a running chat
   SHALL be left alone, and each task outside the plan that waits on one of
   them and has no open decision SHALL get a decision for the owner.
   Nothing SHALL be deleted, task statuses SHALL NOT change, and the spec
   folder SHALL NOT be touched. An archived plan SHALL NOT be approved
   until it is unarchived.
3. WHEN a plan is unarchived THEN Avoozl SHALL remove exactly the holds
   archive added, and close only the decisions archive wrote that nobody
   changed since. A task the person deferred by hand SHALL stay deferred.
4. Avoozl SHALL record who archived or unarchived the plan and when, apart
   from the plan's revision history, and the plan view SHALL show it.
5. Archived plans and their tasks SHALL be hidden by default on Plans,
   Graph, Delivery and the Dashboard counts. A Show archived filter SHALL
   bring them back, each with an Archived badge; a filter that names the
   plan SHALL show it too. A live chat under an archived plan SHALL stay in
   the Dashboard's In flight list. Untriaged is unchanged: an archived
   plan's tasks still cover their issues.
6. The archive confirm SHALL say what happens and that Unarchive undoes it,
   and its button SHALL NOT be red. An archived plan's page SHALL show a
   banner with an Unarchive button.
7. A task with status `review` and no session, run, delivery, review request
   or pull-request review SHALL NOT be shown as in progress. Every view
   SHALL label it "Waiting on your decision (set by hand, no review
   running)", show its next action, and offer Discuss, Mark done and Back to
   planned through `task.update` for a local task. It SHALL count as needing
   the owner, as the runner already counts status `review`, with one item
   per task when the task also has a decision. Avoozl SHALL NOT change the
   task's status on its own.
8. WHEN a review run exists THEN the drawer, the Delivery card and the
   In flight card SHALL show the reviewer role, the model asked for and the
   model used, the round, the verdict, and an Attach link to the reviewer
   chat.

### Requirement 52: Send to Issue Radar, and working beside crews

Added 2026-11-13 (owner decision). Design §8.5 "Send to Issue Radar" and
§6.4.

**User story:** As the owner, I want to hand untriaged issues to an Issue
Radar crew from Avoozl, and I want Avoozl and crews to work on one
repository without stepping on each other.

Facts checked in Kiro Crew's Issue Radar source (2026-11-13): a crew runs
continuously on one repository. Each turn it lists open issues and keeps
those with a label in its label scope; an empty scope means every open
issue. It drops any issue that already carries a label starting `crew:`,
picks one at random, and adds the fixed claim label `crew: in progress`.
When it needs a person it adds the repository's `needs_human_label`
(default `crew: needs human`). Those are the only two labels a crew
writes, and it writes them with the owner's `gh` login, so the actor of a
crew's label or close is the owner. Code Review Sage starts no review on
its own. An app token reaches Issue Radar's `GET /crews` only through a
`permissions.api` grant, and a grant has no method, so it also admits
`POST /crews` and `PUT /crews/settings`.

#### Acceptance criteria

1. The Untriaged tab SHALL offer **Send to Issue Radar** for one issue or a
   selection of issues. Pull requests SHALL NOT be sent: a crew works
   issues. It SHALL be an operation only a person calls from the page
   (`untriaged.handoff`); an agent, app token or MCP caller SHALL be
   refused.
2. The person SHALL pick a crew. WHERE Kiro Crew lets Avoozl read the
   repository's crews and their label scopes, the dialog SHALL list each
   crew with its scope labels and Avoozl SHALL use the crew's first scope
   label. WHERE it does not, the person SHALL type the label, the dialog
   SHALL say Avoozl could not read the crews and why, and the upstream ask
   for a read-only crew list SHALL be drafted.
3. WHEN the chosen crew's scope is empty THEN the dialog SHALL warn that the
   crew takes every open issue in the repository, labeled or not, and no
   label SHALL be needed to hand it work.
4. The label SHALL be refused when it is empty, longer than 50 characters,
   starts with `crew:` (a crew skips any issue carrying one), is a managed
   label, is a crew label, or is a positive label of any trigger rule of
   that repository (sending would also start Avoozl).
5. A confirm dialog SHALL show the exact label and every item it goes on,
   and Cancel SHALL write nothing. On confirm Avoozl SHALL check the
   person's `gh` login with the repository's Who counts rule
   (`allowedActors` or `minimumPermission`), pass the label through content
   rules at the `github` boundary, add it to each item, and record a
   receipt per item (repository, number, label, crew, actor, time). A
   failure on one item SHALL NOT stop the others, and the reply SHALL say
   which failed and why.
6. An untriaged-candidate issue that has a hand-off receipt, or carries the
   crew claim or needs-human label, SHALL show under **With Issue Radar**,
   not under Untriaged. Each row SHALL say whether a crew has claimed it
   and whether it needs a person.
7. (a) For a leaf whose repository's coder is Issue Radar, the crew's label
   is the repository's `ready` label: Avoozl SHALL add it only when the
   leaf is ready, and SHALL remove it when the leaf is blocked again,
   including when a blocker's done state is withdrawn by a reopen
   (Requirement 33.10). A crew's claim is never removed.
8. (b) WHEN an issue that carries the crew claim label closes with no
   merged closing pull request THEN the close SHALL NOT be an order, even
   by an allowed actor: Avoozl SHALL hold the dependents and open a
   decision naming the claim. This overrides Requirement 33.8 for claimed
   issues, because a crew closes with the owner's login and its close
   cannot be told from the owner's. A close with a merged closing pull
   request is judged as before.
9. (c) A `labeled` or `unlabeled` event for a crew label (claim or
   needs-human) SHALL NOT be the event that makes a trigger rule true, and
   Settings SHALL refuse a rule whose positive labels name a crew label.
10. (d) WHEN a With Issue Radar issue or a GitHub leaf carries the
    needs-human label THEN it SHALL show under **Needs you** on the
    Dashboard and in Conflicts, in plain words, with a link to the issue.
11. The tab's help text and the docs SHALL say what Send to Issue Radar
    writes, that crews act with the owner's login, and rules 7–10.

### Requirement 53: Agent and model per task

Added 2026-11-13 (owner request). Design §4.10 "Agent and model per
session". Extends Requirements 41 and 42.

**User story:** As the owner, I want to choose which Kiro Crew agent and
model write each task, and to spread tasks across several, so that hard
work gets a strong model, routine work gets a cheap one, and no single
model's quota stalls delivery.

Facts (2026-11-13): the tick already opens every session with
`open_session(title, folder_id=, agent=, model=)` (design F75). Today one
writer model is set per workspace or repository (`delivery.model`), and
each review role names its own `agent` and `model` (design §5.2). Routing
rules (Requirement 41.2) choose only a crew.

Changed 2026-11-13 (owner decision): rules and weighted `choices` are
removed. The routing prompt (Requirement 41.7) picks the model; a manifest
may still pin one.

#### Acceptance criteria

1. A manifest task MAY carry `session`: `{agent, model, crew}`, every field
   optional. A pinned field SHALL win over the routing prompt. Validation
   SHALL refuse `choices`, an empty agent or model string, and any other
   key.
2. The checks role and review roles SHALL keep their own `agent` and
   `model` (design §5.2) and SHALL run on `local`.
3. The writer's session SHALL come from, in order: the manifest task's
   `session`, the routing agent's pick (when routing is on), the
   repository's `delivery` settings, the workspace's `delivery` settings,
   and then Kiro Crew's default agent and `auto`.
4. WHEN routing is on THEN the models offered SHALL be the default model
   and the models Kiro Crew lists (`GET /api/models`, read on every backend
   pass), minus every `out` model and every model criterion 7 removes. A
   person's Switch model replacement for an `out` model (Requirement 72.13)
   SHALL be offered in its place.
5. The routing prompt MAY ask for a split across models ("70% Claude, 30%
   Kiro"); the routing agent reads the running chats' models as facts. It
   SHALL NOT pick a model outside a task's options.
6. A retry or resume of the same task SHALL keep the model of its last
   attempt unless that model is `out`, so that one task's work stays on one
   model. A person MAY press **Pick again**, and the next attempt SHALL be
   picked afresh.
7. For a review role with `distinctFrom: model` (Requirement 36), Avoozl
   SHALL NOT offer the writer that role's model. IF no model is left THEN
   the task SHALL wait and Avoozl SHALL open one decision. Avoozl SHALL
   never run a review on the writer's model under `distinctFrom: model`.
8. WHEN a named agent is not installed in a crew THEN that crew SHALL fail
   its checks with the reason "agent not installed".
9. Agent, model and crew names MAY appear in a manifest, because a crew id
   is the owner's own and a task pin is a deliberate choice. The routing
   prompt stays machine-local (Requirement 41.7).
10. Every session binding SHALL record the agent and the model asked for,
    how they were chosen (pinned, kept, the only option, the routing
    agent's reason, or the fallback), and the model Kiro Crew reports it
    ran on, when Kiro Crew reports one (design F65).
11. Preview (Requirement 42.6) SHALL show each ready task's crew and model
    options. The Delivery view SHALL show the agent and model of each
    running session.
12. A leaf on the Issue Radar route or a `plugin:<id>` route SHALL ignore
    `session`, because Avoozl opens no session for it.
13. WHEN routing is off and no `session` is set anywhere THEN every session
    SHALL open as it does today. Installing or upgrading Avoozl SHALL NOT
    change which agent or model any session uses.

### Requirement 54: Pull request feedback goes back to its writer

Added 2026-11-13 (owner request). Design §4.13.

**User story:** As the owner, I want failed checks, review comments, and
merge conflicts on an Avoozl worker's pull request sent back to that
worker, so that the pull request gets fixed and merges without me.

Facts (2026-11-13, Avoozl `kirocrew-native`): the plans-repo brief tells
the worker to "fix failing checks and answer review on that pull request
until it merges" (`src/app/delivery.mjs`). Nothing wakes the worker when a
check fails or a review lands, so a worker whose turn has ended never
hears of it. The tick already relays two kinds of message to a bound
worker: the leak screen's edit request (`src/app/github-close.mjs`) and
comment-mention steering (`src/app/github-steering.mjs`). Issue Radar
already fixes CI and review for the leaves it codes.

#### Acceptance criteria

1. This requirement SHALL cover each GitHub leaf whose pull request an
   Avoozl worker session writes: every plans-repo leaf, and single-repo
   leaves whose repository's coder is `worker`. It SHALL NOT cover leaves
   Issue Radar codes.
2. Each tick SHALL read, for each covered leaf with an open pull request
   from its branch: each check run and status on the head commit, the
   reviews and unresolved review threads, the mergeable state, and
   whether auto-merge is on. Reads SHALL be batched per repository, and
   an unchanged pull request SHALL cost no further read that tick.
3. These SHALL be feedback events:
   a. a check that finished as failed, timed out, or cancelled on the
      current head commit (a check still running is not an event);
   b. a review that requests changes, or a new review comment or review
      thread, by an actor the repository's policy allows (Who counts,
      `allowedActors` or `minimumPermission`);
   c. the pull request conflicting with its base branch;
   d. auto-merge off on an open pull request whose merge has not happened.
4. A review or comment by an actor the policy does not allow SHALL NOT be
   relayed. The Delivery view SHALL count such comments on the leaf and
   link to them. Avoozl SHALL write nothing for them.
5. All new events for one pull request in one tick SHALL go out as one
   message, each event sent once. The receipt key SHALL be the pull
   request, its head commit, and the event's GitHub ID.
6. The message SHALL quote comment and review text as data, fenced as
   steering does. It SHALL name each failed check with its conclusion and
   its details link, and tell the worker to read the failed log with
   `gh run view --log-failed` where the check is an Actions run. In
   plans-repo mode it SHALL name the task by ID and title only and SHALL
   NOT name the planning repository. It SHALL pass the content rules'
   `brief` boundary (Requirement 40) before it is sent.
7. WHEN the leaf's worker session is live and the tick opened it THEN the
   message SHALL go to that session. WHEN a Crew Mode conductor opened it
   THEN the events SHALL go into the conductor's `next`, as the leak
   screen does today. WHEN no worker session is live (it ended, failed,
   or was closed) THEN Avoozl SHALL open a new attempt on the same branch
   with a resume brief that carries the events (Requirement 8), with the
   agent and model kept per Requirement 53.6. WHILE the worker's crew is
   unreachable THEN Requirement 41.10 SHALL apply and nothing SHALL be
   re-placed.
8. A feedback round SHALL be one message or new attempt. Each leaf SHALL
   get at most `delivery.feedbackRounds` rounds (default 5, per
   repository or workspace). WHEN the bound is reached, or the same check
   name fails on 3 head commits in a row, or the worker reports `blocked`
   THEN Avoozl SHALL stop relaying for that leaf and open one decision
   under **Needs you** that says which.
9. A new attempt opened for feedback SHALL count against the retry bound
   of Requirement 8 as well as the round bound.
10. Avoozl SHALL NOT push, comment, re-run checks, turn on auto-merge, or
    merge. Only the worker acts on the pull request. Avoozl SHALL write
    nothing to GitHub for this requirement.
11. A check that failed in CI after passing locally SHALL still be
    recorded as "CI only" (Requirement 45.5), in addition to being
    relayed.
12. A comment that is both a review comment and a steering mention
    (Requirement 27.13) SHALL be sent once.
13. The Delivery view SHALL show, for each covered leaf, its latest event,
    rounds used out of the bound, and the session the last round went to.
14. A repository MAY set `delivery.prFeedback: false` to turn this off.
    It SHALL be on by default, because delivery is meant to run without
    a person (Requirement 18).

### Requirement 55: Plugin bundles and settings packs

Added 2026-11-13 (owner request). Design §4.14. Replaces the separate
config-pack idea of 2026-11-13: a pack is now one part of a plugin, and a
plugin may also ship a pack alone.

**User story:** As a team lead, I want one shared plugin to carry our
settings, our content rules, our tracker, and our intake source, so that
each repository mostly installs one plugin, and nothing in it changes a
setting or runs until someone on that computer has seen it and approved it.

#### Acceptance criteria

1. A plugin manifest MAY list `provides`: any of `pack`, `rules`,
   `tracker`, `intake`, and `route`, each once. Each part SHALL run as a
   code kind (Requirement 34.3): `rules` as `rules`, `tracker` and
   `intake` as `tracker`, `route` as `route`; `pack` SHALL run as nothing.
   A manifest without `provides` SHALL keep working, each of its `kinds`
   being one part. A manifest with both SHALL have `kinds` equal to the
   kinds its parts need, or be refused naming the mismatch. (Changed
   2026-11-13: `template` is a sixth part that runs as nothing,
   Requirement 61.1.)
2. One plugin SHALL be one install, pinned to one version, content hash,
   and, for git, commit (Requirements 34.4, 34.13). Its approval SHALL list
   every part, and Settings and the Add plugin review step SHALL show each
   part in plain words.
3. A pack SHALL hold settings only and SHALL never run code. A manifest
   whose parts are only `pack` SHALL have no `entry` and SHALL be refused
   if it names one; Avoozl SHALL start no process for it.
4. The pack file (`avoozl-pack.json`, or the file the manifest names) SHALL
   hold `description` and `settings`, and `settings` MAY set only:
   per-repository `rules` (trigger `match` lines), `untriaged` (filter and
   triage labels), `allowedActors` and `minimumPermission` (who counts),
   `requiredChecks`, `priority`, `managedLabels`, and `concurrency`;
   `project` `fields` and `statusValues`; `epicIssueType`; `contentRules`
   `sets` as references only; `delivery` `reviewers` (review roles),
   `agent`, `model`, `runner`, and `concurrency`; and `flow`. Every value
   SHALL pass the validator Settings uses for that key. Any other key, a
   credential-like key, or anything that could hold a content rule SHALL
   be refused with an error naming the key, and the plugin SHALL show as
   invalid and cannot be approved.
5. Importing a pack SHALL be import mode only: no follow mode and no org
   minimums. Avoozl SHALL first preview, against this repository's
   `.avoozl.json`, each setting as create, change, keep, or skip (with the
   reason it cannot apply here), with the old and new values, and write
   nothing. Per-repository settings SHALL apply to the repositories the
   person picks, all configured ones by default. Import SHALL then copy
   the settings once, only for an approved plugin, and only for the exact
   preview shown: a preview hash that no longer matches SHALL be refused.
   The result SHALL still be a valid `.avoozl.json`.
6. WHEN an import would let more people give orders than before on a
   repository (a lower `minimumPermission` than the effective one, or
   names added to `allowedActors`) THEN the preview SHALL say so on that
   setting and above the list, and the import SHALL be refused unless the
   person accepts that change.
7. `.avoozl.json` `packs` SHALL record, per plugin, the version imported,
   when and by whom, and the settings that came from it; a setting a later
   pack sets SHALL move to that pack. WHEN the installed version differs
   from the imported one THEN Settings SHALL offer the new version's
   preview again; only a person imports it.
8. The `rules` part SHALL supply rule sets at run time (Requirement 40.9),
   so private terms are never stored in a public repository. The `intake`
   part SHALL be the tracker kind's `poll` (Requirement 50.7) and SHALL
   need the `poll` capability. Each polled item SHALL be checked as in
   Requirement 50.2: a bad item refused naming its field, the others kept.
   A plugin that provides `intake` but not `tracker` SHALL never be asked
   to `project`, `read`, `list`, or `close`. Storing items and the
   pipeline stay with Requirement 50.
9. A plugin **shared with the repo** SHALL put its entry in `.avoozl.json`
   (Requirement 34.1) and SHALL still be approved on each computer.
   Importing the pack of a plugin declared on this computer only SHALL
   need the person to confirm that its id and settings go into
   `.avoozl.json`.
10. The plugin guide and the app's plugin skill SHALL describe bundles,
    packs, and intake, with a sample bundle in the test tree that names no
    private system or company.
11. A pack and a repository entry MAY set `waitingLabels` (owner request
    2026-11-13): labels meaning the item waits on someone outside. A task
    whose item carries one SHALL wait in **Blocked or waiting** with the
    reason "Waiting on the author". Absent, nothing changes.
12. A pack and a repository entry MAY set `priorityLabels`, an ordered
    list, the newer name for `priority`; setting both SHALL be refused. A
    task's best priority label SHALL set its order inside Ready and Up
    next, after a set rank, and SHALL never change its lane. Absent,
    nothing changes. The sample pack sets `waitingLabels:
    ["response-requested"]` and `priorityLabels: ["p0", "p1", "p2",
    "p3"]`.

### Requirement 56: Fewer MCP tools, every safe action

Added 2026-11-13 (owner decision).

**User story:** As the owner, I want a session to reach every safe Avoozl
action through a few MCP tools, so that its tool list stays short and
nothing a person must decide can be done from a chat.

#### Acceptance criteria

1. MCP SHALL offer one tool per thing a session acts on (about 12 to 15),
   each with an `action` field whose values are listed in its schema. Each
   action SHALL call one existing operation, with that operation's
   authority class unchanged.
2. Approving a plan or plugin, Allow once, choosing a conflict winner,
   content-rule terms, Who counts and other settings, adding or removing
   repositories, GitHub setup writes, handing items to Issue Radar, flow
   settings and Run anyway, and deletes SHALL be person only. An MCP call
   that reaches one, under any tool name, old or new, SHALL be refused
   before anything runs, saying to do it in the app. A test SHALL fail
   when an operation has neither an MCP route nor a written reason it has
   none, and a test SHALL check that each person-only operation is refused.
   (Changed 2026-11-13: marking a manual task done or reopening it, and
   editing, removing or showing a task's links and notes on its issue, are
   person only too, Requirement 61.13 and 61.22.)
3. The older `plans_*` names SHALL stay listed and working, each
   description starting with `Deprecated:` and naming its replacement.
   They stay listed because a session's client calls only the tools it was
   shown, although the gateway forwards a call to an unlisted name.
4. A session MAY archive and unarchive a plan, and the record SHALL name
   the session. This replaces Requirement 51.1.
5. A grouped tool that keeps an old read-only name SHALL stay read only, so
   an agent allowed that name gains nothing.

### Requirement 57: New plan from the Plans page

Added 2026-11-13 (owner request).

**User story:** As the owner, I want to start a plan from a few fields on
the Plans page, so that a planner drafts its spec folder by Avoozl's rules
without my writing a prompt.

#### Acceptance criteria

1. The Plans page SHALL have a **New plan** button that opens a right
   drawer with Name (the spec folder name), Category (pick or type),
   Epics or phases (optional), Repositories (checkboxes of registered code
   repositories), What you want (required) and Links and context
   (optional). Cancel SHALL ask first when anything was typed. (Changed
   2026-11-13: Epic and Phases are separate fields, Requirement 59.11, and
   the drawer offers Blank or From template, Requirement 61.7.; the button is
   New spec, Requirement 62.1, and an idea can prefill it, Requirement
   63.9.)
2. Avoozl SHALL refuse a name that is not a spec folder name, or that a
   plan or spec folder already uses; a request with no registered
   repository, no picked repository or no goal; and a seed that a content
   rule blocks. A refused request SHALL record nothing.
3. Submit SHALL open a planner chat seeded with the fields and Avoozl's
   spec rules: the `.kiro/specs/<name>/` layout with requirements.md,
   design.md, tasks.md and avoozl/manifest.json, the `category:`
   front-matter, unique task IDs, the folder and the repositories.
   (Changed 2026-11-13: Submit hands the request to Spec Builder,
   Requirement 65; the planner chat is the fallback.)
4. The tick SHALL import the folder as a draft plan once it lints clean.
   New plan SHALL never approve a plan, turn on Autopilot (delivery) or push.
5. Every top button on the Plans page SHALL show an icon.

### Requirement 58: Onboard a repository

Added 2026-11-13 (owner request).

**User story:** As the owner, I want adding a repository to offer a guided
Onboard flow, so that a repository goes from nothing to plans ready to
approve without my running setup steps by hand.

#### Acceptance criteria

1. Settings > Repositories SHALL offer **Onboard**, a stepped dialog with
   Cancel on every step: pick folder, pick mode, check GitHub, set up,
   import specs, leak scan, preview issues, finish. A step that does not
   apply SHALL be left out; a step already satisfied SHALL show as done and
   MAY be skipped.
2. Pick folder SHALL show the checkout, its remote, default branch,
   `.avoozl.json`, `.kiro/specs` folders, and whether the workspace already
   has it. No remote and a non-GitHub remote SHALL allow Local only only.
3. Check GitHub SHALL be the read-only Set up GitHub preview, listing each
   item as create, change or keep.
4. WHEN the person cancels before Set up THEN nothing SHALL have been
   written. In Set up each GitHub write SHALL ask first.
5. Import specs SHALL list spec folders with their lint results and import
   them as drafts only.
6. WHEN the repository that would hold the issues is public THEN the leak
   scan SHALL check the specs against the content rules and the public
   secret and machine-path rules, name each finding by file and line only,
   and hold the next step while any finding remains.
7. Preview issues SHALL show the issues approval would make, without making
   them or approving the plan.
8. The flow SHALL never approve a plan, start an agent, or push.

### Requirement 59: Epics span plans, phases sit inside plans

Added 2026-11-13 (owner decision). Design §6.9. This replaces Requirement
4.3 and changes 4.4, 13.7, 23.9, 46.2, 48.3 and 57.1 as stated below. It
drops the separate Initiative level that was discussed: no Initiative field
or front-matter key exists. Changed 2026-11-13 (owner): no old plan form
keeps loading. The owner is Avoozl's only user, so the old forms become
validation errors, and task 21.7 rewrites the owner's existing plans once,
with a script that is not part of the product.

**User story:** As the owner, I want an epic to be a goal that spans
several plans, and the groups of tasks inside one plan to be its phases, so
that a large goal such as a rewrite shows its member plans and their
progress, and no grouping is made up from a file path.

#### Acceptance criteria

1. An **epic** SHALL be a goal that spans plans. Each epic SHALL be its own
   Kiro spec folder, `.kiro/specs/<epic>/`, in the same place plans live
   (Requirement 30.3), holding `requirements.md` (the goal and what done
   means), `design.md` (the approach across plans), `tasks.md` (one
   checklist item per member plan, with a task ID as Requirement 30.5
   requires) and `avoozl/manifest.json` with `"kind": "epic"`. Each manifest
   entry, keyed by its `tasks.md` ID, SHALL name one member plan in `plan`
   and SHALL hold no task fields (`repository`, `acceptance`, `checks`,
   `completion`, edges). An epic folder SHALL NOT be a `bugfix.md` spec.
2. A member plan SHALL name its epic with a top-level `epic: <epic>` key in
   the YAML front-matter of its `requirements.md` or `bugfix.md`, read the
   same way as `category:` (Requirement 30.9): Avoozl SHALL read it, SHALL
   NOT write it, and SHALL NOT infer it. A plan SHALL belong to at most one
   epic, and an epic SHALL NOT list an epic.
3. Deterministic validation SHALL refuse an epic folder whose entry names a
   plan with no spec folder in the namespace, names the same plan twice,
   names a plan whose front-matter names a different epic or none, names an
   epic, or holds task fields. A plan whose `epic:` names no epic folder, or
   an epic that does not list it, SHALL get a warning diagnostic with its
   file and line and SHALL show under **No epic**; it SHALL NOT block the
   plan's approval.
4. An epic SHALL never be dispatched and SHALL have no repository. It SHALL
   be done when every member plan is done, and a plan SHALL be done when
   each of its tasks is done or archived with a reason. Approving an epic
   revision SHALL approve only its member list and prose, never a member
   plan or a task.
5. A **phase** SHALL be a group of tasks inside one plan. A task's phase
   SHALL come from its manifest entry's `phase` value when it has one, and
   otherwise from the nearest heading of level 2 or lower above its item in
   `tasks.md`. The manifest MAY hold a `phases` object that gives each
   phase ID a title. A task under no heading and with no `phase` value SHALL
   sit under its plan as **No phase**. Phases SHALL group and filter only:
   they SHALL NOT add edges, readiness or completion.
6. Avoozl SHALL NOT invent an epic or a phase. It SHALL NOT create
   `doc:<path>` epics or any other grouping named after a file. A task with
   no plan SHALL show under **No plan**. No view, list, filter, export or
   brief SHALL show a raw `doc:` ID or a file path as an epic or phase name.
7. Inside a plan, the manifest `kind` values SHALL be `package` and `leaf`
   (this replaces Requirement 4.3; Requirement 4.4 reads "packages complete
   only from their children"). An entry with `"kind": "epic"`, a per-entry
   `epic` value, a top-level `epics` list in a plan's manifest, and an
   epic entry's `memberPlan` key SHALL each be a validation error naming
   the file, the entry and the edit that fixes it. Avoozl SHALL NOT load
   any of them under another name.
8. In a GitHub mode Avoozl SHALL project three levels of sub-issues: each
   epic as one issue with the configured `epicIssueType` (no type when the
   owner has none), each plan as one **plan issue** that is a sub-issue of
   its epic's issue when it has an epic, and each task as a sub-issue of
   its plan issue, or of its package when it has one (this changes
   Requirement 13.7). Epic and plan issues SHALL live in the repository
   that holds the plan's tasks' issues, SHALL never be ready or get a ready
   label, and SHALL be closed by Avoozl when their children are complete.
   A phase SHALL NOT be an issue: Avoozl SHALL write it in the managed body
   section and, when the Project names a `phase` field, to that field,
   which Avoozl owns like Wave.
9. When GitHub cannot link a plan issue under its epic's issue, Avoozl
   SHALL keep both issues, record the epic in the marker, and show the
   reason in the Delivery view. It SHALL NOT move issues to make the link.
   GitHub refuses a sub-issue whose repository has another owner than the
   parent's, and allows at most 100 sub-issues per parent, closed ones
   included, and eight levels of nesting (design §6.9).
10. The Graph SHALL open at epics (and **No epic**), drill into an epic's
    member plans, then a plan's phases, then a phase's tasks, with the
    back navigation it already has. The Graph, Delivery, Flow and Plans
    filters SHALL offer Epic (across plans) and Phase (inside the picked
    plan) as separate filters. The Dashboard's **Progress by epic** SHALL
    show one row per epic counting the tasks of all its member plans, plus
    **No epic**. The plan view's left column SHALL show the plan's epic as
    a link and its phases with progress. An **epic page** (or Graph
    drill-in) SHALL show the epic's goal, what done means, each member
    plan with its status and progress, and open decisions.
11. Flow batching (Requirement 46.2) SHALL name the grouping `phase`: the
    same parent package, otherwise the same phase. The value `epic` SHALL
    be refused by the Settings validator, naming `phase`. The New plan drawer (Requirement
    57.1) SHALL offer **Epic** (pick an existing epic, optional) and
    **Phases** (optional) instead of "Epics or phases"; the planner writes
    the `epic:` front-matter and the phase headings.
12. No operation, CLI command or MCP action SHALL migrate a workspace.
    The owner's existing workspace and plans SHALL be rewritten once,
    inside task 21.7, by a script that runs only in that task and is not
    added to the product. It SHALL use existing operations only, back up
    the database with its sha256 first, and run on a copy before the live
    run. It SHALL turn each per-plan epic into a phase of its plan with the
    same ID and title, move each task in a `doc:` epic to its `tasks.md`
    section or **No phase**, archive each task whose plan is gone with
    `task.archive` and the reason "plan removed", rewrite each old manifest
    form of criterion 7 into the new one, and set `flow.batch.by` to
    `phase` where it was `epic`. A second run SHALL change nothing. It
    SHALL NOT approve a plan, start or stop a session, touch GitHub or
    push; spec changes SHALL be local commits.
13. The owner's Nupp plans SHALL be rewritten this way: the W1–W7 groups
    SHALL become phases of their plan, not epics (this changes
    Requirement 23.9), and the rewrite epic folder SHALL list the member
    plans whose front-matter names it, with `"kind": "epic"` and only
    `plan` and `summary` in each entry. Avoozl's own spec SHALL be checked
    the same way and rewritten if it uses an old form.
14. Avoozl's planner agent and skill SHALL write epic folders and the
    `epic:` key in this layout, and SHALL write phases as `tasks.md`
    headings.
15. `.avoozl.json` `github.subIssues.maxPerParent` SHALL set how many
    sub-issues Avoozl links under one parent issue: an integer of at least
    1, default 100 (GitHub's limit). Avoozl SHALL count a parent's existing
    sub-issues, open and closed, from GitHub before it links more. Children
    past the cap SHALL stay unlinked in `tasks.md` order, keep the parent
    in their marker, and show in the projection preview and Delivery with
    "Over the sub-issue limit; group these tasks in packages". Settings >
    GitHub setup SHALL show the value in GitHub modes only, with one line
    saying what it does and that GitHub's own limit is 100.

### Requirement 60: One Back history for the app page

**User Story:** As a user, I want Back to work everywhere on the Avoozl
page, so that I can retrace tabs, sections, drill-ins and dialogs without
leaving the page.

#### Acceptance Criteria

1. The page SHALL keep one Back history. A step SHALL be a top tab, an
   inner tab (a Settings section, a repository sub-tab, other in-view
   tabs), an opened plan, a Graph drill-in level (the Graph's own stack,
   not a copy), or an open drawer (task drawer, New plan) or modal (file
   viewer, repository Edit, Add plugin, Set up GitHub, Onboard, confirm).
2. The mouse back button, Alt+Left and Cmd+[ SHALL take one step. Esc
   SHALL close the topmost drawer or modal. Alt+Left in a text field
   SHALL stay with the field.
3. Going back SHALL restore the view's scroll position and selection
   (the opened plan, the Graph level, zoom and selected task). Focus SHALL
   return to the control that opened a drawer or modal.
4. Back on a dialog with unsaved changes SHALL ask first, the same way
   Cancel does.
5. Kiro Crew gives an app page no history API: its route is the bare app
   route, and `history.pushState` would move the host page. Avoozl SHALL
   keep its own history and claim the button and keys only when the press
   comes from its page and it has a step to take; at the root they SHALL
   fall through to Kiro Crew.
6. Settings SHALL open on Workspaces each visit. Restores SHALL be
   instant, so reduced motion needs nothing more.

### Requirement 61: Workflow templates, manual tasks, and task links and notes

Added 2026-11-13 (owner approval). Design §4.16. This adds the `template`
part to Requirement 55.1, **From template** to the New plan drawer of
Requirement 57.1, the `manual` leaf and the `person` completion to
Requirement 4 and design §4.3, the `notes` content-rule boundary to
Requirement 40.3, and the actions of criteria 13 and 22 to the person-only
list of Requirement 56.2.

**User story:** As the owner, I want to start a plan from a reusable
workflow, such as an SDK rewrite, with its phases, proofs, settings and
flow habits already in it; to put steps in a plan that only people do,
such as a team review; and to keep links and notes on any task, so that a
repeated kind of work starts the same way each time, a person's step gates
the work after it, and what was decided stays with the task.

#### Acceptance criteria

Workflow templates

1. A **workflow template** SHALL be one folder in a plugin, listed by the
   manifest part `template` (Requirement 55.1). A plugin MAY ship only
   templates; such a plugin SHALL have no `entry` and Avoozl SHALL start
   no process for it. A template SHALL be installed, pinned and approved
   as its plugin is (Requirement 34), and SHALL be offered only while its
   plugin is approved on this computer.
2. A template folder SHALL hold `avoozl-template.json` with `id`, `title`,
   `description`, `inputs`, `prompt` (a Markdown file: the planner
   prompt, also used for Spec Builder once MC-16 allows it), `starter`
   (a folder with `requirements.md`, `design.md`, `tasks.md` and
   `avoozl/manifest.json` in the layout of Requirement 30), and MAY hold
   `phases`, `proofKinds`, `pack` and `flow`. Any other key SHALL make the
   template invalid, naming the key, and its plugin SHALL show as invalid.
3. Each input SHALL have an `id`, a `label`, a `type` (`text`, `choice`
   with its `options`, `file`, `repositories` or `epic`) and `required`.
   The prompt and starter files MAY use `{{<input id>}}`; Avoozl SHALL
   replace each with the input's text, unchanged and never run, and SHALL
   refuse a template that uses an unknown input ID. A `file` input SHALL
   be read as text in the page, at most 200 KB, and passed in the seed;
   Avoozl SHALL NOT read a path the person typed.
4. The starter SHALL lint as a spec folder with its placeholders filled
   with sample values, and an invalid starter SHALL make the template
   invalid. Starter tasks MAY include `manual` leaves (criterion 9) and
   proof tasks.
5. `phases` SHALL list the starter's phase IDs and titles in order, and
   SHALL match the starter's `tasks.md` headings or manifest `phase`
   values (Requirement 59.5). `proofKinds` SHALL list named proof outlines
   (title, setup, action, expected, what failure means, next decision)
   that the prompt tells the planner to fill in for this plan.
6. `pack` SHALL be a settings pack under Requirement 55.3–55.7, and
   `flow` SHALL set only `flow` keys that pass the Flow settings
   validator: batching small tasks, stop the line, local checks first,
   and the retrospective cadence. Neither SHALL be applied by picking the
   template. The New plan drawer SHALL show them as the pack preview of
   Requirement 55.5 with an **Import these settings** checkbox, off by
   default; only a person ticking it and submitting SHALL import them,
   through the same preview hash and person-only import.
7. The New plan drawer (Requirement 57.1) SHALL offer **Blank** or **From
   template**. From template SHALL list the approved templates by title
   and description, then show the picked template's inputs as fields,
   with the drawer's own Name, Category and Epic fields. Required inputs
   SHALL be filled before Submit. Submit SHALL check the inputs and run
   content rules on the seed (`brief` boundary), then open the planner
   chat seeded with the prompt, the filled starter, the inputs and
   Avoozl's spec rules. A refused request SHALL record nothing.
8. The result SHALL come back as a draft plan under Requirement 57.4,
   recording the template ID and version. WHEN an epic was picked THEN the
   planner SHALL write the plan's `epic:` front-matter and add the plan to
   that epic folder, and the epic's change SHALL come back as its own
   draft revision. Nothing SHALL be approved, started or pushed.

Manual tasks

9. A leaf MAY set `"manual": true` in its manifest entry: a step only a
   person does. A manual leaf SHALL have `acceptance` (what the person
   checks), `repository` (where its issue lives in a GitHub mode) and
   completion `person`, the only completion it may have. It SHALL NOT
   hold `checks`, `agent`, `model`, `size`, `paths` or `route`; lint SHALL
   refuse each, naming the key. A non-manual leaf SHALL NOT use completion
   `person`.
10. A manual leaf SHALL never be dispatched, batched, verified, reviewed or
    integrated, and SHALL never appear in the ready leaves a conductor or
    the tick reads. Edges into and out of it SHALL work as for any task;
    every edge condition on it SHALL be met when it is done.
11. Before its blocking edges hold, a manual leaf SHALL sit in **Blocked or
    waiting**. Once they hold, it SHALL sit in **Needs you** with the tag
    **Manual** and the reason "Waiting for a person: <title>", in every
    view and in the Avoozl state Project field. No new lane SHALL be added.
12. The task drawer SHALL show a manual leaf's acceptance and a **Mark
    done** button. Mark done SHALL open a dialog with an optional outcome
    note and links (criterion 16) and a choice of **Done** or **Skipped**,
    and SHALL record who, when, the choice and the outcome. Dependents
    SHALL be released by either choice; Skipped SHALL show on the task.
13. Marking a manual leaf done or reopening it SHALL be person only (page
    and CLI). An MCP call SHALL be refused under Requirement 56.2.
14. In a GitHub mode a manual leaf SHALL get an issue like any task, a
    sub-issue of its plan issue or package. It SHALL never get a ready or
    trigger label, SHALL never be sent to Issue Radar, and its managed
    body section SHALL say that a person closes it and that no agent works
    on it. Mark done SHALL close the issue (reason completed for Done, not
    planned for Skipped) as the person's GitHub login, and SHALL be
    refused when that login fails the repository's Who counts rule.
    WHEN an allowed actor closes the issue on GitHub THEN the next tick
    SHALL mark the leaf done with the close reason, and this SHALL count as
    its completion. WHEN an actor Who counts does not allow closes it, or
    the closer cannot be read, THEN Avoozl SHALL hold its dependents, open
    a decision, and SHALL NOT reopen the issue. WHEN the issue is reopened
    THEN the leaf SHALL be open again: new dispatch of its dependents
    waits, and running sessions are left alone.
15. Flow (Requirement 43) SHALL count a manual leaf's time in Needs you as
    waiting on a person, and SHALL leave it out of first-pass rate and
    time to fix.

Task links and notes

16. Every task SHALL have **Links and notes**: an ordered list of entries,
    each a link (`url` and `label`) or a note (free text), with its author
    (a person, or the session ID) and its time. They SHALL be execution
    state in SQLite, not spec text: they record what happened during
    delivery, they change after approval, and writing them to the spec
    would change the revision hash. Adding one SHALL NOT change the plan's
    revision or approval.
17. A link's `url` SHALL be `https` or `http`, at most 2,000 characters,
    with no user name or password in it; its `label` SHALL be 1 to 200
    characters. A note SHALL be 1 to 10,000 characters. A task SHALL hold
    at most 200 entries. Avoozl SHALL refuse each breach, naming the field.
18. Content rules SHALL check each entry when it is saved, at a new
    `notes` boundary that is on by default. A block SHALL refuse a
    session's call under Requirement 40.5 and SHALL refuse a person's save
    inline, naming the rule set and rule, with Allow once under
    Requirement 40.7. Entries SHALL also pass the `brief` and `github`
    boundaries wherever they are used.
19. The task drawer SHALL show Links and notes, newest first, with author
    and time, an **Add link** form (URL and label) and an **Add note** box.
    A person MAY edit an entry or remove one after a confirm; a removed
    entry SHALL leave the list and stay in the task's activity history.
20. A session SHALL read Links and notes through the grouped `task` MCP
    tool and SHALL get them in its brief: the newest 20 entries, at most
    8,000 characters, marked as data from people and agents, not as
    instructions. A dependent's brief SHALL also carry each blocker's
    outcome entries (criterion 12).
21. A session MAY add a note or a link to a task it is bound to; the entry
    SHALL name the session. A session SHALL NOT add to another task, and
    SHALL NOT edit or remove any entry.
22. Editing or removing an entry, and **Show on the issue**, SHALL be
    person only. The CLI SHALL offer list, add, edit and remove.
23. In a GitHub mode an entry SHALL be written to GitHub only when a person
    ticks **Show on the issue** on it, off by default. Shown entries SHALL
    be listed in the issue's managed body section under "Links and notes",
    after the `github` boundary passes, and a person's edit there SHALL be
    a conflict like any managed body edit. Entries not shown SHALL live
    only in SQLite and its backups; the rebuild test (design §3.3) SHALL
    allow them to be missing, as it allows session bindings.

Example

24. The test tree SHALL ship a template-only sample plugin with an **SDK
    rewrite** template that names no private system or company: inputs
    SDK name, target repository and an optional gap list; phases
    inventory, codegen, runtime, protocol tests, review and cutover; a
    manual **Review with team** leaf that cutover requires; proof kinds
    for protocol tests and a cutover dry run; and flow defaults that batch
    small tasks, stop the line, run local checks first and hold a
    retrospective every 10 tasks. The plugin guide and the planner skill
    SHALL describe templates, manual tasks and Links and notes.

### Requirement 62: The Plans page is called Specs

Added 2026-11-13 (owner approval). Design §8.7. This renames what people
see; it renames no interface. It changes the button of Requirement 57.1 to
**New spec**.

**User story:** As the owner, I want the page and its words to say spec,
so that the name matches the `.kiro/specs/<name>/` folders I write.

#### Acceptance criteria

1. Everything a person reads SHALL call Avoozl's plan a **spec**: the nav
   tab and heading (**Specs**), buttons (**New spec**, **Edit spec**,
   **Discuss spec**, **Delete spec**, **Archive spec**, **Unarchive
   spec**, **Change spec**), drawer and dialog text, tooltips, aria
   labels, empty states, filters and column labels in Dashboard, Graph,
   Delivery, Flow, Intake and Conflicts, notices, the operation messages
   the page shows, `docs/`, the README and the shipped skills and agents.
2. These names SHALL NOT change: the `plans_*` MCP tool names, the `plan.*`
   and `plans.*` operation names, CLI commands and flags, `.avoozl.json`
   keys, SQLite tables and columns, receipt and marker fields, the
   **Plans repo** mode and the plans repository it names, and the
   `avoozl-planner` agent. Old text under `docs/research/` and
   `docs/evidence/` SHALL stay as written.
3. A test SHALL read the page's source and fail on any user-facing
   `plan` or `plans` word outside an allowlist. The allowlist SHALL name
   each kept name of criterion 2 and each use of plan as a verb (for
   example **Plan this**), one entry per string.

### Requirement 63: Ideas

Added 2026-11-13 (owner approval). Design §8.8. This adds the kind `idea`
to the incoming item of Requirement 50.1 and the reserved built-in source
`local` of Requirement 50.6.

**User story:** As the owner, I want to jot a rough idea down, riff on it,
and later turn it into a spec, so that half-formed thoughts have a home
that never starts work.

#### Acceptance criteria

1. An **idea** SHALL be an incoming item with `source: "local"` and
   `kind: "idea"`: an `id` Avoozl makes, a `title` (1–240 characters),
   `notes` (at most 100 entries of 1–4,000 characters, each with its
   author and time), `links` (at most 50, http or https only, each at most
   2,000 characters with an optional label of at most 200), `state`
   (`open`, `archived`, or `graduated`) and, when graduated, the spec it
   became. A bad field SHALL be refused by name and SHALL record nothing.
2. A person SHALL create an idea from **+ New idea** on the Specs page
   and on the Intake tab: Title (required), Notes (optional) and Links
   (optional, one per line).
3. An idea SHALL also be captured over MCP (`plans_intake` action
   `capture_idea`) and the CLI (`avoozl intake idea add`). Agent sessions
   MAY capture ideas; the idea SHALL name the session as its author.
4. Notes and links SHALL be added through `idea.append` (MCP action
   `add_idea_note`, CLI `avoozl intake idea note`). A session MAY append to
   an open idea and the entry SHALL name it; a session SHALL NOT edit or
   remove an entry, archive, restore, or graduate an idea.
5. Captured and appended text SHALL pass the `intake` content-rule
   boundary (Requirement 50.10). A `block` finding SHALL refuse the write
   and name the set and rule, never the matched text.
6. An idea SHALL never run work: the pipeline SHALL skip trigger match for
   it, no rule SHALL match it, it SHALL never be tied to a task, and
   **Plan this** and **Deliver this** SHALL refuse it. Ideas SHALL NOT
   count toward the Untriaged count, its badge or its notice, and SHALL
   never be written to GitHub or a plugin.
7. The Intake tab SHALL list ideas under its **Kind** filter value
   **Idea**, newest first, with title, note and link counts, age and
   state. Opening one SHALL show its notes and links and the actions of
   criteria 8–10.
8. **Riff on this** SHALL open a Kiro Crew chat seeded with the idea's
   title, notes and links, marked as data, and told to make no edits
   except appending notes and links to this idea through `add_idea_note`.
9. **Make it a spec** (person only) SHALL open the New spec flow of
   Requirement 57 through its one entry point, prefilled with a name from
   the title, the title and notes as What you want, and the links as Links
   and context, and SHALL pass the idea's key. When that request is
   recorded the idea SHALL become `graduated`, naming the spec. A
   cancelled or refused request SHALL leave the idea unchanged.
10. **Archive** and **Restore** SHALL be person only. Archived and
    graduated ideas SHALL leave the default list, show under the state
    filter, and never be deleted by the 30-day purge of Requirement 50.21.

### Requirement 64: Pull the Andon cord

Added 2026-11-13 (owner approval). Design §4.11. This adds a stop that a
person or an agent pulls by hand to the automatic stops of Requirement 44.

**User story:** As the owner, I want to stop new work myself when I see
something wrong, so that nothing new builds on it while it is looked at.

#### Acceptance criteria

1. The Dashboard header SHALL show a red **Stop the line** button. It SHALL
   open a dialog with a scope and a reason, and Cancel SHALL change nothing.
2. The scope SHALL be one of: everything in the workspace (`all`), one
   repository (`repo`), one spec (`spec`), or one task and its transitive
   dependents (`task`). The dialog SHALL list the repositories, specs and
   tasks to choose from. A missing or unknown repository, spec or task
   SHALL be refused by name, and nothing SHALL be recorded.
3. The reason SHALL be required: one line of 1–200 characters. An empty
   reason, a longer one, or one with a line break SHALL be refused.
4. The reason SHALL pass the `brief` content-rule boundary (Requirement 40).
   A `block` finding SHALL refuse the pull, name the set and rule and never
   the matched text, and record nothing.
5. WHILE a pulled stop is open THEN Avoozl SHALL NOT dispatch new work in
   its scope, fix tasks included. Running sessions SHALL be left alone.
6. The **Line stopped** banner (Requirement 44.9) SHALL show each pulled
   stop with who pulled it, when, its scope and its reason, and how many
   tasks it pauses.
7. A pulled stop SHALL close only through **Resume**. Resume SHALL be one
   button on the banner and one CLI command, SHALL be a person's only, and
   SHALL record who resumed it and when. Agent, app-token and plugin
   callers SHALL be refused with 403.
8. A pulled stop SHALL never resume by itself: no passing check, integrated
   fix or tick SHALL close it. An automatic stop (Requirement 44) SHALL
   keep its own rules: Resume and the pull SHALL NOT change it, and Run
   anyway SHALL NOT apply to a pulled stop.
9. Agent sessions SHALL be able to pull the cord over MCP (`plans_session`
   action `stop_line`) with a reason, for example when a worker finds a
   broken base. The stop SHALL name the session as who pulled it, and the
   owner SHALL be notified once.
10. The CLI SHALL offer `avoozl flow stop` with a scope and a reason, and
    `avoozl flow resume` with the stop ID.
11. Each pull SHALL be a stop in Flow (Requirement 43): listed with the
    automatic stops, counted in the charts over time, its open-to-resume
    time counted as time to fix, and sent to the retro with its scope and
    reason.
12. Added 2026-11-13 (owner approval). The Stop the line dialog SHALL offer
    two choices: **Stop the line**, which stops new work only (criteria
    1–11), and **Stop all agents**, a full stop. A full stop SHALL pause
    everything in the workspace like scope `all`, and SHALL also stop every
    running session Avoozl opened (Kiro Crew session stop) at once. It
    SHALL keep each worktree and branch, and SHALL mark each stopped attempt
    "Interrupted by stop". An interrupted attempt SHALL NOT count as a
    failure toward the retry limit, and SHALL NOT be nudged.
13. The confirm for **Stop all agents** SHALL warn that replies in progress
    are lost, and that committed and saved files are kept.
14. Only a person SHALL pull or resume a full stop. An MCP call SHALL be
    refused with the usual person-only refusal, and nothing SHALL be
    recorded. A pull that cannot reach Kiro Crew to stop sessions (the CLI
    without the app backend) SHALL be refused with nothing recorded. A
    session Kiro Crew refuses to stop SHALL be named on the stop and left
    running, and its attempt SHALL NOT be marked.
15. WHEN a full stop is resumed THEN Avoozl SHALL re-dispatch each
    interrupted task on the same worktree and branch, with the same agent
    and model its interrupted attempt ran on. The new brief SHALL say the
    attempt was interrupted by a stop and the worktree's files were kept.
16. Each full stop SHALL be a stop in Flow like other pulls (criterion 11),
    marked full, with the sessions it stopped.

### Requirement 65: New plan hands off to Spec Builder

Added 2026-11-13 (owner approval, including the Spec Builder grant).
Design §8.6. This changes Requirement 57.3.

**User story:** As the owner, I want New plan and Plan a goal to open
Kiro Crew's Spec Builder on a new spec with Avoozl's rules, so that I
review requirements, design and tasks phase by phase there, and Avoozl
still gets a spec folder it can deliver.

#### Acceptance criteria

1. The app manifest SHALL grant `/api/apps/spec-builder/specs`. The grant
   is a path prefix, so it also reaches Spec Builder's approve, handoff,
   execute, task, stop and delete routes; the owner accepts that. Avoozl
   SHALL call only the create route, and a test SHALL fail when any source
   file names another Spec Builder route or builds one from the create
   path.
2. Avoozl SHALL ship a steering file, `.kiro/steering/avoozl-specs.md`,
   that states the spec layout, the `category:` and `epic:` front-matter,
   task ID format and uniqueness, phases as `##` headings, the bullet lines
   Avoozl reads under each task (`_Repository:_`, `_Requires:_`,
   `_Checks:_`, `_Manual_`), and that Avoozl writes
   `avoozl/manifest.json` itself. Spec Builder's chat runs the default
   agent in the spec's repository, which loads `.kiro/steering/**/*.md`.
3. Before the hand-off, New plan SHALL check whether that file is in the
   spec's repository. When it is missing, the drawer SHALL show its full
   text and ask; it SHALL be written only on **Add the file**, and never
   over an existing or changed copy. When the person skips it, the rules
   SHALL go in the create call's description instead.
4. Name, Category, Epic, Phases, Repositories, What you want and Links and
   context SHALL go into the create call's description, after content
   rules at the `brief` boundary. The create call SHALL use the spec's
   repository as its working folder and the feature type. Avoozl SHALL then
   open Spec Builder's page on that spec. A spec Spec Builder places
   outside the folder Avoozl reads SHALL be named in the notice.
5. **Plan a goal** in the header SHALL open the same drawer on the Plans
   page.
6. Once the prose files are there and `tasks.md` reads the same on two
   ticks, the tick SHALL write `avoozl/manifest.json` from `tasks.md`, then
   lint the folder and import it as a draft plan once it lints clean. A
   changed `tasks.md` SHALL rewrite the manifest until the plan's first
   approval. A manifest Avoozl did not write, or one a person edited since,
   SHALL never be replaced. Nothing SHALL approve, start an agent or push.
7. WHEN Spec Builder is turned off, the grant is not yet approved, or Spec
   Builder is missing THEN the drawer SHALL say so in plain words, with how
   to turn it on or approve the grant, and SHALL offer an Avoozl planner
   chat with the same fields.

### Requirement 66: One driver per spec, and handing it off

Added 2026-11-13 (owner request; lock changed the same day to the plan
issue's assignee). Design §6.10. This makes Requirement 13.5 hold across
machines: today two machines with the same planning repository both pass
the namespace check and can both tick one spec.

**User story:** As the owner, I want exactly one Avoozl to drive each spec
at a time, named the way GitHub already names who owns an issue, and a
safe way to move that role, so that two machines never dispatch, write
GitHub or merge for the same spec, and the work survives the old machine
going away.

#### Acceptance criteria

1. Each approved spec SHALL have at most one **driver**: one Avoozl
   workspace on one machine. In a GitHub mode the driver SHALL be named by
   two facts on the spec's plan issue (Requirement 59.8): its **assignee**
   says which person, and a **machine claim** in Avoozl's managed marker
   says which of that person's machines.
2. A workspace SHALL drive a spec only WHEN the plan issue has exactly one
   assignee, that assignee is this machine's `gh` login, and the claim
   names this machine. WHEN the plan issue has no assignee THEN the epic
   issue's assignee SHALL stand in, by the same rule; a plan issue with
   several assignees SHALL NOT fall back to the epic. WHEN the result is
   zero or several assignees THEN every workspace SHALL read only for that
   spec, and Avoozl SHALL open one decision naming the issue and what it
   found. Task-issue assignees SHALL keep their meaning (intake, Issue
   Radar) and SHALL NOT affect the driver.
3. The machine ID SHALL be `mch_` plus 16 lowercase base32 characters,
   made once and kept in machine-local settings. A person MAY add a
   machine label; it SHALL pass the `github` content-rule boundary
   (Requirement 40), and Avoozl SHALL never fill it from the host name.
   The claim SHALL hold the machine ID, the label, the login that wrote it,
   when it was taken, a heartbeat time, the previous driver and whether
   the take-over was forced, and SHALL be left out of the `applied`
   hashes (Requirement 15). It SHALL hold no path, host name or token.
4. The driver SHALL update the claim's heartbeat at most once per
   `driver.heartbeatMinutes` (machine-local; default 15, allowed 5–60). A
   heartbeat older than three intervals SHALL show the driver as "not
   seen since" that time. Nothing SHALL move the driver role because a
   heartbeat, lease or session is old; only a person SHALL.
5. Avoozl SHALL never change an assignee by itself. The only assignee
   change Avoozl makes SHALL be a person's Force take over from the page
   or CLI (Criterion 14).
6. The tick SHALL read each plan issue's assignees and claim in its sync
   step, and SHALL read them again right before each dispatch, before
   projection, and before each integrate or merge for that spec. WHILE
   this workspace is not the driver THEN the spec SHALL be read-only here:
   the tick MAY refresh its own cache and views, and SHALL NOT dispatch,
   message a session, write an issue, label, link, marker, Project field
   or linked branch, close or reopen an issue, revert an edit, integrate,
   merge, or write the spec folder. Other specs SHALL tick as usual.
7. Assignment is not atomic, so the docs SHALL say that a short overlap is
   possible: work the old driver started after its last check and before
   it saw the change. The dispatch-time check SHALL bound it to what one
   tick started after its last read (at most one tick's time budget), and
   each session started in it SHALL be away on the new driver
   (Criterion 11).
8. WHEN a spec is approved in a GitHub mode THEN projection SHALL create
   the plan issue assigned to the approving person and with this
   machine's claim, unless the epic issue's assignee already decides, and
   SHALL create no task issue until both read back. A plan issue from
   before this requirement with no claim SHALL be read-only on every
   workspace until a person presses **Take over** on one. **Take over**
   SHALL write this machine's claim when the assignee rule already names
   this login, read the issue again at least 10 seconds later, and drive
   only if its claim is still there. WHEN two machines with one login
   take over at once THEN the claim that reads back SHALL win on both, and
   the other SHALL read only and say which machine won.
9. In Local only mode the lock SHALL be a row in the workspace's SQLite
   naming the machine ID, label, state and heartbeat, and hand-off SHALL be
   export and import only. A workspace opened from a copy whose row names
   another machine SHALL read only until a person presses Take over. The
   docs and Settings SHALL say its limits: it guards only instances that
   open that file or a copy, it cannot see another machine, and it has no
   forced take-over between machines.
10. **Hand off driver** SHALL drain the spec: no new work is dispatched for
    it, running chats keep running and are never ended, and their reports
    are still applied. The page SHALL list the running chats. When none is
    left, Avoozl SHALL write the export and record its sha256 in the
    claim; the person MAY export sooner with **Export with N unfinished**,
    which records those tasks as unfinished. **Cancel** before the export
    SHALL resume dispatch. After the export the spec SHALL be read-only
    here, and the page SHALL show a link to the plan issue to reassign it.
    Avoozl SHALL NOT reassign it.
11. Avoozl SHALL never start a task again on the new driver only because
    its old session's lease expired or its machine is gone (repository
    rule). A task the export lists as unfinished, bound to a session on
    another machine, or with an open linked branch or pull request and no
    session here SHALL be **away**: it SHALL complete from GitHub facts
    when they show it done (a merged closing pull request or an allowed
    close), and otherwise SHALL get one decision asking a person whether
    to start it here.
12. The export SHALL be one JSON file for one spec: namespace, spec, the
    approved commit and hash, task rows and receipts, local-authority
    tasks, open and answered decisions, Flow timing and stops, retros and
    proposals, task links and notes, the activity log, token usage,
    session bindings marked as the old machine's, the raw lessons store
    (Requirement 69.15; added 2026-11-13, owner decision), and a list of
    the machine-local items in use (Criterion 16) without their contents. It
    SHALL NOT hold a terms file, router or retro instructions, a token, a
    crew host or a host key. Avoozl SHALL write it to a folder the person
    picks and SHALL never upload, commit or push it. The dialog SHALL say
    it may hold private notes. **Take over** with an export SHALL check the
    namespace, the spec, the sha256 against the claim, and that the
    approved commit is in this workspace's spec checkout; a mismatch SHALL
    be refused by name and change nothing. Otherwise the import SHALL run
    in one transaction before the claim is written.
13. **Take over** with **Rebuild from GitHub** SHALL run `avoozl rebuild`
    (Requirement 14.3) for the spec from its markers, issues, links,
    Project fields and spec commit, then write the claim. Before it runs,
    the dialog SHALL list what is lost: Flow timing and stop history,
    retros and proposals, notes and links not shown on GitHub, the spec's
    local-authority tasks, answered decisions' local records, token usage
    and the activity log. The next tick SHALL re-raise open decisions from
    GitHub facts and the spec.
14. **Force take over** SHALL be offered on a read-only spec. Its confirm
    dialog SHALL name the current assignee, the claim's machine label and
    ID and its last heartbeat, say that machine may still be running chats
    for the spec, and require the spec name typed. It SHALL set the plan
    issue's assignees to exactly this login (when that is not already so),
    read them back, rebuild from GitHub unless an export is given, write a
    claim marked forced and naming the old driver, and notify the owner
    once. WHEN GitHub keeps the old assignees (it silently ignores the
    change for a token without push access) THEN Avoozl SHALL say so and
    change nothing else. WHEN the old driver ticks again THEN it SHALL go
    read-only for the spec, show who took over, when and that it was
    forced, and never take the role back by itself.
15. Hand off, Take over and Force take over SHALL be person-only: agent
    sessions, MCP, the app token and plugins SHALL be refused with 403.
    The driver's status SHALL be readable on the page, in the CLI and over
    MCP. The CLI SHALL offer `avoozl driver status`, `avoozl driver
    handoff`, `avoozl driver takeover --file <path>` or `--rebuild`, and
    `--force`, which also needs `--confirm <spec>`.
16. Machine-local items SHALL never move with the driver: plugin
    approvals, the private content-rule terms file, the routing prompt,
    retro instructions, the crew registry and SSH host keys. After a
    take-over the page SHALL list what to re-approve or re-add, from the
    export's list or, after a rebuild, from the plugins and rule sets named
    in `.avoozl.json`. Until then the existing fail-closed rules SHALL
    hold: an unapproved plugin's tasks park (Requirement 34) and a missing
    terms file blocks its boundary (Requirement 40).
17. The page header SHALL show the selected spec's driver: "Driver: you",
    or the login, machine label and when it was last seen. A workspace
    that is not a spec's driver SHALL show a read-only banner on that
    spec's pages saying why (assigned to someone else, another machine of
    yours, no assignee or several), with **Take over** when this login is
    the assignee and **Force take over** otherwise. Settings › General
    SHALL have a **This computer** group with Machine label (optional) and
    Heartbeat minutes (optional, placeholder 15), and the machine ID shown
    small.

### Requirement 67: Per-task budgets and usage receipts

Added 2026-11-13 (owner decisions). Design §4.17. This builds on the usage
read of Requirement 43 (design §4.11, owner additions 2026-11-13), which
already stores each turn's tokens and credits per task, attempt, stage and
model. It changes nothing in timing: Requirement 43.6 still keeps tokens and
cost out of `flow_spans`.

**User story:** As the owner, I want each task to have a spending cap in
dollars and a receipt of what it used, so that a stuck or looping task
cannot spend without limit and I can see where the money went.

#### Acceptance criteria

1. A budget SHALL be a cap in US dollars per task. Dollars SHALL be the
   only budget unit except the fallback of criterion 6, because they are
   the only unit that compares across models.
2. Dollars SHALL come from a **price table** that lives only on this
   machine, in machine-local settings (`~/.config/avoozl/config.json` key
   `prices`). It SHALL hold, per model ID, a dollar price per million input
   tokens and per million output tokens, and one dollar price per Kiro
   credit. Validation SHALL refuse a `prices` key in `.avoozl.json`, a
   plugin pack, or a spec. The owner SHALL be able to edit it in Settings.
   Avoozl SHALL ship no prices: a new table is empty.
3. Each save of the price table SHALL get the next version number and a
   sha256 of its contents, and Avoozl SHALL keep every saved version in
   SQLite so an old receipt can name the one it used.
4. Avoozl SHALL store raw counts only: each turn's input tokens, output
   tokens and credits, as Requirement 43 already does. Dollars SHALL be
   computed on read from the raw counts and a price table version. A turn
   with credits SHALL be priced by the credit price; a turn with only
   tokens by its model's token prices.
5. A budget SHALL be set at four levels, the most specific winning: the
   workspace default (`budget` in `.avoozl.json`), the repository
   (`projects.<id>.budget`), the spec (top-level `budget` in
   `avoozl/manifest.json`), and the task (a leaf's `budget` in the
   manifest). Each level SHALL take `usd`, `mode` and, for criterion 6,
   `tokens` and `credits`. `mode` is `"stop"` (the default) or `"warn"`
   and resolves like a cap: the most specific level that sets it wins.
   With no level set, a task SHALL have no cap, and its receipt SHALL
   still be kept. There SHALL be no spec-wide total cap (owner decision
   2026-11-13).
6. WHEN a turn cannot be priced (its model has no price, or it has credits
   and there is no credit price) THEN the dollar cap SHALL NOT be enforced
   for that turn. Avoozl SHALL warn once per task and model on the task and
   in Settings › Prices, and SHALL count unpriced turns against the token
   cap (input plus output) and the credit cap instead. Where no level sets
   them, these caps SHALL default to 2,000,000 tokens and 200 credits per
   task. The defaults SHALL be settings: the workspace `budget.tokens` and
   `budget.credits` replace them.
7. A task's spend SHALL include every session bound to it: each attempt
   and retry, the verifier, each review round, and pull request feedback
   rounds (Requirement 54). A fix task (Requirement 44.7) SHALL have its
   own cap. A batch session (Requirement 46) SHALL have the sum of its
   tasks' caps, and each task's receipt SHALL show an equal share of the
   batch's turns, marked shared.
8. Avoozl SHALL check spend after each usage read and before it dispatches
   any session for the task. WHEN spend reaches the cap THEN Avoozl SHALL
   NOT dispatch a new session for the task, and SHALL ask each live session
   bound to it to stop at its next turn boundary. Avoozl SHALL NOT
   interrupt a turn, end a tool call, or close or stop a session. Spend is
   known only after each usage read (about once a minute), so a task CAN
   pass its cap by the turns that ran between two reads; the receipt SHALL
   show by how much. This criterion and criterion 9 apply in `stop` mode;
   criterion 18 covers `warn` mode.
9. A task stopped by its budget (`stop` mode) SHALL go to **Needs you** with two
   actions, both a person's only: **Raise budget**, which takes a new cap,
   records who raised it, from what, to what, and when, and lets the task
   go on (the same session if it is still live, else the next attempt);
   and **Stop**, which pauses the task the way Deferred does (Requirement
   29), leaves its session and worktree alone, and holds its dependents.
   Agent, MCP, app-token and plugin callers SHALL be refused with 403. A
   budget stop SHALL NOT cost the task an attempt.
10. The task drawer, the Delivery card and the In flight card SHALL show
    spend so far against the cap (for example `$1.20 / $5.00`), the token
    and credit totals, and the time of the last usage read.
11. Each task SHALL have a **receipt**: its turns totaled by Flow stage, by
    model and by attempt, each line with input tokens, output tokens,
    credits, dollars, and whether it was priced; the cap and its level;
    every raise; and the price table version and hash used. The drawer
    SHALL show it and SHALL export it as JSON. The receipt SHALL be read
    through `budget.receipt` on the page, `avoozl budget receipt TASK
    --json` on the CLI, and `plans_view` action `receipt` on MCP. It SHALL
    hold counts, dollars, model IDs, stage names and times only: no
    prompts, transcript text or tool output.
12. A receipt SHALL show dollars from the current price table and, for a
    budget stop or raise, the dollars and version that applied then. WHEN
    the price table changes THEN receipts SHALL recompute from the raw
    counts on the next read.
13. The retro (Requirement 47) SHALL receive each finished task's receipt
    totals by stage and model in its payload.
14. WHERE usage cannot be read THEN spend is unknown, and Avoozl SHALL say
    so on the task: a Crew Mode worker (Avoozl reads only sessions its tick
    opened), a remote chat (no usage read reaches another crew), an Issue
    Radar route (Avoozl opens no session), or a usage read that fails. The
    receipt SHALL be marked incomplete with the reason. Avoozl SHALL warn
    once per task, SHALL NOT stop the task for unknown spend, and SHALL keep
    the last known spend with its time. Known spend SHALL still count
    against the cap.
15. A budget SHALL be a cap and never a permission. Raising or having a
    budget SHALL NOT change who counts, content rules (Requirement 40),
    checks, reviews, approval, or proofs, and SHALL NOT start, approve or
    finish any task.
16. An incoming item (Requirement 50) MAY carry a budget later, from a
    plugin source with an owner-approved budget capability. This is a hook
    only: payments, escrow and refunds are out of scope. A grant SHALL
    only set a dollar cap where no level sets one, and SHALL never raise a
    cap a person set. A cap set by a grant SHALL always be in `stop` mode,
    because it is someone else's money.
17. WHEN spend reaches 80% of any cap THEN the task and its receipt SHALL
    show a warning, in both modes. Nothing else changes at 80%.
18. WHERE a task's mode is `warn` THEN reaching the cap SHALL stop and
    pause nothing and SHALL send no stop message. The task SHALL get an
    **Over budget** badge (spend / cap) on the drawer, the Delivery card
    and In flight, and one Needs you item, "Over budget: $X of $Y", with
    **Acknowledge**, **Raise budget** and **Switch to stop**, a person's
    only. Acknowledge SHALL clear the item until spend passes the next
    step, each further 50% of the cap, so it cannot nag every tick. A
    Kiro Crew notification for it SHALL be optional (workspace
    `budget.notify`), off by default.
19. The Dashboard SHALL show a count of open over-budget tasks; the Flow
    tab and receipts SHALL mark over-budget and budget-stopped runs; the
    retro payload SHALL say which receipts went over budget.
20. Settings SHALL show the mode next to each cap with one plain line on
    what each mode does, in Settings › Budgets (the workspace and each
    repository); prices are in Settings › Prices.
21. A remote chat's spend is unknown (criterion 14) and SHALL warn, never
    stop. No upstream Kiro Crew ask is filed for remote usage yet (owner
    decision 2026-11-13).

### Requirement 68: Retros propose prompt and skill changes

Added 2026-11-13 (owner approval). Design §4.18. It widens the proposal
types of Requirement 47.4 and changes no other rule there: a retrospective
still applies nothing.

**User story:** As the owner, I want a retrospective to propose changes to
the prompts and skills my workers run on, with the evidence for each, so that
the way agents are told to work improves the same way settings do, and only
when I say so.

#### Acceptance criteria

1. A retrospective proposal MAY also be typed `prompt` or `skill`. The
   limit of 3 proposals per retrospective SHALL cover all types together.
2. A `prompt` proposal SHALL target one built-in prompt: the worker brief
   template (`brief.worker`), the reviewer role brief (`brief.review`), the
   planner prompt (`agent.planner`), the retro prompt (`agent.retro`), or
   the Spec Builder steering file text (`steering.specs`). Avoozl SHALL
   keep each built-in prompt as named sections, each with a sha256 of its
   shipped text.
3. A `skill` proposal SHALL target one skill file a worker session loaded:
   a repository skill (a file in a registered repository) or an external
   skill (one shipped in a plugin or anywhere else outside a registered
   repository).
4. Every `prompt` and `skill` proposal SHALL be a unified diff against the
   exact text the retrospective saw, with that text's sha256, and SHALL
   carry evidence: the task IDs and attempts it is based on (at least 3),
   the metric (one of Requirement 47.4's), its current value, and the
   expected direction and effect. Avoozl SHALL drop a proposal whose diff
   does not apply to that text, whose base hash is not the current one, or
   whose evidence is missing, and SHALL record why.
5. A proposal SHALL be refused, with the section named, WHEN its diff
   touches a locked section of a built-in prompt. The locked sections SHALL
   be: the untrusted-data framing, the content rules text, Who counts, proof
   and acceptance wording, and person-only rules. Every brief SHALL say
   that its locked sections outrank any skill a session loads.
6. The content rules (Requirement 40) SHALL run on every proposal, its diff
   and its evidence, at a new `proposal` boundary, before it is stored or
   shown. A blocked proposal SHALL be dropped with the rule named and
   without the matched text.
7. A `prompt` or `skill` proposal SHALL never be applied by Avoozl or an
   agent. A person SHALL approve each one; agent sessions, MCP, the app
   token and plugins SHALL get 403 on approve and on revert.
8. Approving a `prompt` proposal SHALL write a new version of a local
   override for that prompt in the workspace's override file on this Mac,
   under the Avoozl config directory, and SHALL NOT edit any file Avoozl
   ships. Sessions started after approval SHALL use it; running sessions
   SHALL be left alone.
9. Each override version SHALL record its number, the shipped section text
   and its sha256 it was made from, the diff, the result's sha256, the
   proposal, and who approved it and when. **Revert** SHALL restore the
   previous version (or the shipped text) in one click, SHALL be recorded
   the same way, and SHALL itself be revertible.
10. Approving a repository skill proposal SHALL create one leaf in that
    repository through the same path as **Deliver this** (Requirement
    50.15), with the diff as data in its brief and the repository's checks.
    In a GitHub mode it SHALL open a pull request; in Local only it SHALL
    integrate like any local leaf. The skill's new version SHALL count from
    the commit that lands it.
11. Approving an external skill proposal SHALL record a note for the
    skill's owner on the plugin card (or in Flow when no plugin owns it),
    with the diff, the evidence summary and **Copy**. Avoozl SHALL NOT edit
    a pinned plugin or send the note anywhere.
12. Each delivery attempt SHALL record which version of each built-in
    prompt it used and the sha256 of each skill file it loaded (from tool
    calls where Avoozl can read them, else from the worker's report). The
    receipt and the Timing section SHALL show them.
13. The PDCA check (Requirement 47.7) SHALL compare a `prompt` or `skill`
    change's metric over the last `flow.retro.everyTasks` finished tasks
    that used the previous version with the same number that used the new
    one, and SHALL mark a window "mixed" when another change took effect in
    it. WHEN it did not help THEN the next retrospective SHALL include a
    typed proposal to revert it.
14. The Flow tab SHALL have a **Proposals** view listing every proposal
    with its type, target, base version, diff, evidence, cited lessons
    (Requirement 69), **Approve** and **Reject**, and per prompt the
    versions in use with **Revert**.

### Requirement 69: Retro memory across workspaces

Added 2026-11-13 (owner approval). Design §4.18.

**User story:** As the owner, I want what one workspace's retrospectives
learned to inform retrospectives in my other workspaces on this Mac, so
that a fix proven once is suggested again where it fits, and a change that
failed is not tried again.

#### Acceptance criteria

1. Avoozl SHALL keep one lessons store on this Mac, under the Avoozl
   config directory. The raw store (contexts, histories, source
   workspace IDs) SHALL stay local: Avoozl SHALL NOT write it to any
   repository, tracked file or GitHub. The only ways lessons leave this
   Mac SHALL be a person's **Share** of chosen proven lessons (criteria
   11–15), a person's export to a pack file (criterion 8), and the driver
   handoff export (Requirement 66.12). (Changed 2026-11-13, owner
   decision: share chosen proven lessons.)
2. A lesson SHALL hold: a pattern (stage, check kind, tool, and
   repository traits such as languages and build files), a finding, the
   change made (type, target, and a summary), the PDCA outcome (`kept`,
   `undone`, or `untested`), evidence counts (tasks and runs, metric before
   and after), the source workspace's random ID, and the date.
3. Approving a proposal SHALL write a lesson with outcome `untested`. The
   PDCA result SHALL set it to `kept` (helped) or `undone` (a revert was
   approved after it did not help).
4. A lesson SHALL hold summaries only. Validation SHALL refuse a lesson
   whose text holds a task ID, file path, issue or pull request number,
   repository name, URL, or more than 300 characters per field, and the
   content rules SHALL run at a new `lesson` boundary when a lesson is
   written and again, with the reading workspace's rules, when it is used.
5. A retrospective's brief SHALL hold up to 10 lessons whose pattern
   matches its workspace's traits and stage, ranked `kept` first, then by
   confidence (Requirement 70), then by evidence count, then by date, and
   SHALL list `undone` and retired lessons as "did not work" so they are
   not proposed again. A proposal MAY cite lesson IDs, and Avoozl SHALL
   drop a cited ID that was not in the brief.
6. Each workspace SHALL have `flow.lessons.share` (write its lessons to the
   store) and `flow.lessons.read` (use other workspaces' lessons), both
   default `true`. A workspace always reads its own lessons.
7. A plugin bundle MAY ship a lessons pack. Import SHALL show a preview
   first and SHALL be a person's act with the preview hash, like a
   settings pack (Requirement 55). Imported lessons SHALL be read-only and
   name the plugin and its version as their source.
8. Exporting lessons to a pack file SHALL be person-only; other callers
   SHALL get 403. The export SHALL pass the content rules.
9. An `untested` lesson SHALL expire after `flow.lessons.untestedDays`
   (default 90) and no longer be used. An `undone` lesson SHALL be kept as
   "did not work" with no expiry.
10. The Flow tab SHALL have a **Lessons** view with filters for pattern,
    outcome, source, and state, and Settings › Flow SHALL have a
    **Lessons** sub-group with the two sharing switches and the ages.
11. The Lessons view SHALL rank **share candidates**: this workspace's own
    lessons that are `kept` after the PDCA check, not marked and not
    read-only, ordered by evidence count, then by fit (how many other
    workspaces on this Mac share at least one of the lesson's traits),
    then by confidence. Each candidate SHALL show why it ranks there.
12. **Share** SHALL be a person's act on lessons the person picks. It
    SHALL first show a preview: the target repository, the file, the exact
    text and its hash; sharing SHALL name that hash. Agent sessions, MCP,
    the app token and plugins SHALL get 403 on preview-to-share and share.
    Only candidates (criterion 11) MAY be shared.
13. A shared file SHALL hold summaries only, in the lessons pack shape
    (criterion 7): pattern, finding, change summary, outcome and evidence
    counts, with no context, history, source workspace ID, task ID, path,
    repository name or URL. The content rules SHALL run on it at the
    `lesson` and `github` boundaries before anything is written; a block
    SHALL write nothing and name the rule without the matched text.
14. WHERE the mode is plans-repo THEN Share SHALL write
    `.avoozl/lessons.json` in the planning repository on a new branch and
    open a pull request to its base branch (a commit on that branch when
    GitHub cannot be reached, shown with the branch name). WHERE the mode
    is single-repo THEN Share SHALL do the same in the code repository.
    WHERE the mode is Local only THEN Share SHALL be off and the view SHALL
    say lessons share nowhere in this mode. Share SHALL merge with the
    file already there by lesson ID and SHALL never push to a protected
    branch directly.
15. `lessons.export` SHALL also offer the raw store (`raw: true`, person
    only) for the driver handoff export to include (Requirement 66.12).

### Requirement 70: Lessons and overrides heal as things change

Added 2026-11-13 (owner steer). Design §4.18.

**User story:** As the owner, I want stored lessons and local prompt
overrides to notice when the things they were learned on change, so that
stale advice stops being used without my clearing it by hand.

#### Acceptance criteria

1. Each lesson SHALL record the context it was learned in: Avoozl version,
   model IDs, the prompt and skill versions in use, check and tool names,
   repository traits, and the metric's baseline.
2. Avoozl SHALL re-check a lesson WHEN a model it names is retired (no
   longer listed by Kiro Crew) or replaced in that stage, a prompt or skill
   version it relies on changed, a check or tool it names was renamed or
   removed, the matching repositories' traits changed, a newer PDCA result
   for the same pattern and change contradicts it, or it was not confirmed
   within `flow.lessons.confirmDays` (default 180).
3. Without approval, Avoozl SHALL re-score a lesson's confidence from fresh
   runs, mark it `stale` or `needs re-check` with the reason, and stop
   offering it in briefs for proposals until fresh runs confirm it. Each of
   these marks SHALL be undone by itself when its cause clears, and SHALL
   be recorded in the lesson's history.
4. Rewriting a lesson's text, merging duplicates, and retiring a lesson
   SHALL need a person. A lessons review SHALL run inside every
   `flow.lessons.reviewEvery` retrospectives (default 5) and propose these
   as diffs with evidence in the Proposals view. Avoozl SHALL NOT delete a
   lesson; a retired one SHALL stay as history and count as "did not work".
5. WHEN an Avoozl update changes a built-in prompt section under a local
   override THEN Avoozl SHALL flag the override, show a three-way diff (old
   built-in, new built-in, override), and propose a rebased override. Until
   a person approves it, sessions SHALL keep using the override and the
   Flow tab and Settings SHALL warn. A locked section SHALL always use the
   new built-in text.
6. WHEN a plugin's lessons pack changes version THEN Avoozl SHALL re-check
   its imported lessons: changed ones become `needs re-check` until the new
   pack is imported, and removed ones are retired with that reason. Rules
   1–4 SHALL apply to pack lessons as to local ones.
7. The Lessons view SHALL show each lesson's confidence, last confirmed
   date, state and stale reason, and its history.

### Requirement 71: Activity log and Activity tab

Added 2026-11-13 (owner request). Design §4.19.

**User story:** As the owner, I want one list of what people, sessions,
GitHub and plugins did in this workspace, so that I can see who changed
what and when without reading chats, the tick log or GitHub.

#### Acceptance criteria

1. Avoozl SHALL keep an `activity_log` table in the workspace's SQLite.
   Each row SHALL hold its time, source (`local`, `github`, `plugin` or
   `mcp`), actor, kind, a short summary, a target ID and a link. `plugin`
   covers plugin sync: tracker and intake plugins.
2. Avoozl SHALL record these local actions when they succeed: dispatch
   (Start now and dispatch requests), stop (a task set to Deferred),
   pulling and resuming the Andon cord, merge, plan approval, archive and
   unarchive, delete, a settings save, plugin approval, and a model
   switch. A call through MCP or an agent session SHALL be recorded with
   source `mcp` and the session as actor.
3. The tick SHALL record what it sees from GitHub and plugin sync: closes
   (an allowed close, a held close, and a merged closing pull request),
   Project board orders (Deferred and back, ignored moves, and a Release
   change), label orders, incoming items, conflicts, and reverts (a Wave
   value written back). A change seen twice SHALL be recorded once.
4. A row SHALL hold only IDs and a short summary Avoozl writes. It SHALL
   NOT hold a prompt, a content-rule term, a token, file contents, or an
   issue or pull request title or body. A summary SHALL be at most 200
   characters.
5. Before a row is saved, Avoozl SHALL screen its actor, summary, target
   and link with the built-in secret and path screens and the content-rule
   sets that cover the `activity` boundary. A set with no `boundaries`
   list SHALL cover it. A row that matches, or that a set cannot check,
   SHALL be saved as redacted: its time, source and kind, the summary
   "Redacted by content rules", and no actor, target or link. A test
   SHALL fail if a secret-shaped value is saved.
6. Rows SHALL be kept 30 days by default. `activity.retentionDays` in
   `.avoozl.json` (1–365) SHALL change it, from the Activity tab's Keep
   activity field. Each tick SHALL delete older rows.
7. The page SHALL have an Activity tab: the shared heading, the shared
   filter panel with Source, Kind and Actor, 100 rows per page with the
   shared Show more, newest first. A row whose target is a task SHALL open
   the task drawer. A row with a GitHub link SHALL open it in a new tab
   with `target="_blank"` and `rel="noopener noreferrer"`.
8. Avoozl SHALL expose one helper, `recordActivity`, that any part of
   Avoozl calls to add a row. It SHALL validate and screen the row as in
   criteria 4 and 5, and SHALL never make the action that called it
   fail.
9. `activity.list` SHALL read the log with `source`, `kind`, `actor`,
   `limit` (at most 100) and `offset`, and SHALL be the `activity` action
   of the `plans_view` MCP tool. The Dashboard's recent task events SHALL
   stay reachable as `plans_view` action `recent`.
   `activity.settings.update` SHALL be a person's only.

### Requirement 72: Provider health and switching models

Added 2026-11-13 (owner request). Design §4.20. It builds on the usage read
of Requirement 43 (`flow_usage`), the session tool-row read (design §4.11),
the agent and model choices of Requirement 53, and Kiro Crew's per-chat
model change (design F126).

Changed 2026-11-13 (owner decision): providers fold into Settings › Routing.
Out is a hard check; low is a fact the routing prompt weighs for new tasks
only. The thresholds form, groups, fallback list, cooldown and window
settings are removed (criteria 1, 2, 4, 5, 9, 17).

**User story:** As the owner, I want Avoozl to notice when a model provider
runs low or runs out, keep new work off it, and move running chats to
another model without losing their work, so that a rate limit or an empty
credit balance does not stall delivery, and I can make the same switch by
hand.

#### Acceptance criteria

1. Avoozl SHALL keep a **health level** for each provider and each model:
   `ok`, `low`, or `out`. A model's level SHALL be the worse of its own and
   its provider's. A model's provider SHALL be its ID up to its first `-`,
   `/`, `.` or `:`. `auto` and an unnamed model SHALL have no provider and
   SHALL always read `ok`.
2. Avoozl SHALL mark health from usage reads: after each read it SHALL sum
   the credits and the input plus output tokens of every turn in the last 5
   hours per provider and per model, and compare each sum with that key's
   `providers.limits` entry (`credits`, `tokens`). At or above 100% of a
   limit the key SHALL be `out`; at or above `providers.lowPercent`
   (default 80) it SHALL be `low`. A key with no limit SHALL never be
   marked from usage. A usage mark SHALL clear by itself when a later read
   finds the sum below the low line.
3. Avoozl SHALL mark health from provider errors in the session rows it
   already reads: a row of kind `usage_limit`, or text naming out of
   credits, insufficient credits, a usage limit or a quota, SHALL mark the
   model's provider `out`; a row of kind `model_unavailable`, or text
   naming 429, a rate limit, too many requests or throttling, SHALL mark
   the model `low`, and a second such row for a model already `low` from an
   error inside its cooldown SHALL mark it `out`. Avoozl SHALL store the
   kind and when, never the row's text.
4. An error mark SHALL clear on a later success (a usage turn on that model
   after the mark) or 30 minutes after its last error. A mark a person set SHALL clear only when a person
   undoes it.
5. A new task's worker SHALL never be offered an `out` model: it is a hard
   check (Requirement 41.4). A `low` model SHALL stay an option, and its
   level and usage SHALL be a fact in the routing brief (for example
   "claude: 85% used, low"), so the routing prompt decides. For a model a
   person marked out, the model the person switched it to SHALL be offered
   instead. With no model left the task SHALL wait and say why; it SHALL
   NOT open on an `out` model. A writer SHALL never be given a review
   role's model this way (Requirement 53.7).
6. A retry SHALL keep its last model unless that model is `out`; then it
   SHALL pick as a new task does and say that the kept model is out.
7. Routing Preview SHALL show the same options and what ruled the rest out,
   and SHALL write nothing.
8. WHEN a running chat Avoozl opened is on an `out` model THEN Avoozl SHALL
   switch that chat to a healthy model through Kiro Crew's per-chat model
   change, in the same session, so the chat keeps its branch, worktree and
   committed work. A chat with a turn running SHALL switch at the end of
   that turn (Kiro Crew defers it). Avoozl SHALL NOT stop, restart or close
   the chat.
9. Only `out` SHALL switch a running chat; `low` SHALL affect new tasks only.
   The new model SHALL be the person's replacement, else the first healthy
   one among the task's pinned model and then the models Kiro Crew lists,
   never on the same provider when
   the provider is `out`, never the writer's model for a review role whose
   `distinctFrom` is `model`, and never a review role's model for a writer.
   WHEN no model qualifies THEN Avoozl SHALL leave the chat on its model and
   say so in Needs you.
10. Avoozl SHALL record each switch: when, the chat, task, role, from and
    to, who (`auto` or the person), the reason, and the result (`switched`,
    `deferred`, `refused` with Kiro Crew's status, or `no target`). It SHALL
    write each finished record to the activity log (Requirement 71) once,
    as kind `model.switch`. A refused switch
    SHALL NOT be retried for the same model of that chat.
11. A review verdict's served-model check (Requirement 36.3) SHALL count
    every model a switched chat ran on: a writer or reviewer that Avoozl
    switched SHALL NOT be refused only because its model changed mid-session,
    and a reviewer SHALL be refused when any of its models equals any of
    the writer's.
12. The Dashboard header and the In flight card SHALL have a **Switch
    model** button. It SHALL open a dialog to pick From (a provider, a
    model, or tasks chosen from the running ones) and To (the models Kiro
    Crew lists in `GET /api/models`), then preview the running chats it
    would switch, read only, before the person confirms.
13. The dialog SHALL have an optional **Also new tasks** setting. With it
    on, the From provider or model (for chosen tasks, each model their chats
    run on) SHALL be marked `out` by the person, with the To model as its
    replacement for new tasks, until a person undoes it.
14. A manual switch SHALL go through the same switch path and record as
    criterion 8 and 10, with `by` the person. Its confirm SHALL carry the
    preview's hash and SHALL be refused when the running chats changed.
15. Switching, undoing a mark and saving provider settings SHALL be
    person-only: MCP SHALL refuse them with the person-only refusal
    (Requirement 56.2), and the app backend SHALL refuse app tokens and
    agent tools. The provider view and the switch preview SHALL be readable
    by MCP.
16. WHEN a provider or model is `out` THEN Needs you SHALL show one item for
    it with the reason, how many chats were switched and to what, and any
    chat left on it because no model qualified. The item SHALL go away when
    the mark clears.
17. Settings › Routing (Requirement 42.4) SHALL show provider health and
    usage, and SHALL edit this machine's `providers` settings
    (`~/.config/avoozl/config.json`): `lowPercent` and a credits `limits`
    entry per provider. Validation SHALL refuse a `providers` key in
    `.avoozl.json`, and the removed `cooldownMinutes`, `windowHours`,
    `groups` and `fallback` keys. The Switch model dialog SHALL list current
    marks with Undo for a person's marks.
18. With no `providers` settings, no error rows and no manual marks,
    routing and dispatch SHALL behave exactly as before.

### Requirement 73: Searchable task and spec pickers

Added 2026-11-13 (owner approval). Design §8.9.

**User story:** As the owner, I want to type to find a task or spec
wherever I pick one, so that I never scroll a long dropdown.

#### Acceptance criteria

1. Every place the page picks one task or one spec SHALL use one shared
   combobox: the Stop the line scope, the filter panels, Start now, and
   any other task or spec choice.
2. Typing SHALL match on the ID, the title and the spec, ignoring case.
   Each result SHALL show its state beside it.
3. The picker SHALL work from the keyboard: Down and Up move through the
   results, Enter picks the highlighted one, and Esc closes the list
   (a second Esc clears the text). Home and End move to the first and
   last result.
4. The picker SHALL be a WAI-ARIA combobox with a listbox popup:
   `role="combobox"`, `aria-expanded`, `aria-controls`,
   `aria-activedescendant`, and `role="option"` with `aria-selected` on
   each result.
5. With 5,000 tasks, filtering on each key press SHALL stay fast: the
   list SHALL show at most 50 results with a count of the rest, and a
   test SHALL filter 5,000 tasks within the time a 1,000-task filter took
   times 10.

### Requirement 74: Only open tasks get issues

Added 2026-11-13 (owner decision). Design §6.3.

**User story:** As the owner, I want approving a spec to make issues only for
work that is still open, so that GitHub does not fill with issues for tasks
that are already done.

#### Acceptance criteria

1. WHEN a spec is approved or projected THEN a task that is already done and
   has no issue SHALL get no issue, no Project card and no sub-issue link,
   unless `github.issues.includeDone` is `true`.
2. `github.issues.includeDone` SHALL be `true` or `false`, default `false`.
   Settings SHALL refuse any other value or key under `github.issues`, and
   the GitHub settings page SHALL show it as a checkbox.
3. An edge from a skipped done task SHALL count as met and SHALL make no
   blocked-by link.
4. The plan issue and the epic issue SHALL still be made, even when every
   task in the spec is done. An open task whose package was skipped SHALL
   sit under the plan issue.
5. A task that already has an issue SHALL keep it. WHEN a skipped task is
   no longer done THEN the next projection SHALL make its issue.
6. The issue preview SHALL list the skipped tasks (`skippedDone`), and a
   test SHALL show that a done task gets no issue by default and gets one
   with `includeDone: true`.

### Requirement 75: Investigate before coding

Added 2026-11-13 (owner decision). Design §4.21.

**User story:** As the owner, I want a worker to show what it found before
it writes code, and a second chat to try to prove it wrong, so that agents
do not build on a wrong reading of the task.

#### Acceptance criteria

1. WHEN a leaf is dispatched and investigation applies THEN its worker SHALL
   first report findings through `plans_report` kind `findings`: what it
   read, the cause or approach it believes, the change it plans, how it will
   check it, and a confidence of `low`, `medium` or `high`. It SHALL NOT
   change files in this step.
2. Avoozl SHALL then open one falsifier session for the findings. Its brief
   SHALL hold the task and the findings as data and SHALL ask it to find
   evidence that the findings are wrong. It SHALL be read-only, SHALL use a
   model other than the writer's when one is allowed, and SHALL reply
   `stands` or `refuted` with its evidence and its own confidence.
3. Coding SHALL start only WHEN the worker's confidence and the falsifier's
   confidence are both at least `delivery.investigate.minConfidence`
   (default `high`) and the reply is `stands`. Avoozl SHALL then tell the
   same worker to go ahead.
4. Otherwise the task SHALL wait in **Needs you** with the findings and the
   falsifier's reply, offering **Go ahead**, **Investigate again** (one new
   round, with the reply as data), and **Stop**. These SHALL be person only.
5. `delivery.investigate.mode` SHALL be `all`, `not-small` (default) or
   `off`. `not-small` skips leaves marked `size: "small"`. A manifest task
   MAY set `investigate: false` or `true` to override the mode.
6. Investigation and the falsifier SHALL be Flow spans of their own and
   SHALL count toward the task's budget (Requirement 67).
7. With `mode: off`, dispatch SHALL behave exactly as before.

### Requirement 76: Evidence bundle per task

Added 2026-11-13 (owner decision). Design §4.22.

**User story:** As a reviewer, I want one place that shows what a task
found, decided and checked, so that I can review the change without
reading the chat.

#### Acceptance criteria

1. Each task SHALL have one evidence bundle that Avoozl adds to as the task
   runs: findings and the falsifier's reply (Requirement 75), decisions and
   who answered them, review verdicts, check results with the tail of each
   failing log, and files the worker attaches (screenshots or video) through
   `plans_report` field `evidence`.
2. The bundle SHALL be stored locally under the workspace's `.avoozl/local/`
   folder, never in a tracked file, and SHALL pass the content rules and the
   secret screen before it is saved. An attached file SHALL be at most 20 MB
   and of an image or video type.
3. The task drawer SHALL show the bundle as an Evidence section, newest
   first.
4. WHEN the task has a pull request THEN Avoozl SHALL keep one comment on it
   with the bundle's text summary (no attached files unless
   `github.evidence.attach` is true for the repository), checked at the
   `github` boundary. Comments people leave on the pull request SHALL go to
   the writer as pull request feedback does today (Requirement 54).
5. The driver export (Requirement 66) SHALL carry the bundles.

### Requirement 77: Bring open pull requests up to date when main moves

Added 2026-11-13 (owner decision). Design §4.23.

**User story:** As the owner, I want open agent pull requests to keep up
with the base branch, so that they do not sit in conflict.

#### Acceptance criteria

1. WHEN a repository's base branch head changes THEN on that tick Avoozl
   SHALL read every open pull request its writers opened in that
   repository, and its mergeable state.
2. WHEN a pull request conflicts with the base branch, or the repository
   requires branches to be up to date and it is behind, THEN Avoozl SHALL
   send its writer one message to merge the base branch into the task
   branch, fix the conflicts, run the checks and push.
3. The writer SHALL merge, never rebase a pushed branch, and SHALL NEVER
   force push. Avoozl SHALL refuse to send a brief or feedback message that
   asks for a force push.
4. A gone writer SHALL get the resume attempt of pull request feedback, and
   each update SHALL count as one feedback round (Requirement 54).
5. For local delivery, a task branch whose worktree is behind the
   integration branch SHALL be merged forward the same way before its
   checks run.

### Requirement 78: Rules from repeated corrections

Added 2026-11-13 (owner decision). Design §4.24.

**User story:** As the owner, I want the same correction I keep giving to
become a written rule, so that I do not give it a third time.

#### Acceptance criteria

1. Avoozl SHALL record a **correction** when a person requests changes on
   an agent's pull request, answers a decision by sending work back, reverts
   an integrated agent commit, or presses **Pick again** with a reason. It
   SHALL store the person, the task, the time and a summary of at most 300
   characters, after the content rules.
2. The retro SHALL receive the corrections since the last retro. WHEN it
   finds the same correction on two or more different tasks THEN it MAY
   propose a rule: a short text with the corrections it rests on.
3. An approved rule SHALL land as one leaf through `intake.deliver` (source
   `retro`) that adds or edits `.kiro/steering/avoozl-rules.md` in the
   repository, so it arrives as a pull request (or an integrated commit in
   Local only mode). Approval SHALL be person only.
4. A proposed rule SHALL never name another repository, a task ID, a path
   outside the repository, or a person.
5. Flow SHALL show corrections per week, and the PDCA check (Requirement
   68.12) SHALL report whether the corrected thing happened again.

### Requirement 79: Fix-work share in Flow

Added 2026-11-13 (owner decision). Design §4.11.

**User story:** As the owner, I want to see how much finished work was bug
fixes, so that I can tell whether delivery is getting cleaner.

#### Acceptance criteria

1. A finished task SHALL count as fix work WHEN its spec is a bugfix spec
   (`bugfix.md`), its manifest `type` is `fix`, it is a stop-the-line fix
   task, or its GitHub issue type is `Bug`.
2. Flow SHALL show the fix-work share, fix tasks over finished tasks, as a
   card and in the charts by day and by week, with the same filters as the
   other metrics.
3. The retro payload SHALL carry the share and its count.

### Requirement 80: Ship mode

Added 2026-11-13 (owner decision). Design §4.25.

**User story:** As the owner, I want to choose whether finished pull
requests merge by themselves or wait for me, so that I can keep the last
step by hand when I want it.

#### Acceptance criteria

1. `delivery.ship` SHALL be `auto-merge` (default, today's behavior) or
   `manual`, per workspace and per repository; the repository's value wins.
2. With `auto-merge`, Requirement 18 SHALL apply unchanged.
3. With `manual`, briefs SHALL tell writers not to enable auto-merge, and
   Avoozl SHALL say so on Settings > Delivery. WHEN a pull request's
   required checks pass and its reviews are met THEN Needs you SHALL show
   one **Ready to merge** item with a link to it; the person merges on
   GitHub, and Requirement 16 decides completion as before.
4. With `manual` in Local only mode, integration SHALL wait for a person's
   **Integrate** on the Ready to merge item.
5. Avoozl SHALL still never merge a pull request itself.
