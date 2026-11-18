---
category: Planning
---

Owner pivot, 2026-11-16: Requirement 102 and design §4.32 govern issues,
working heads, completion and handoff. They supersede conflicting per-task
GitHub projection, task-issue completion, epic-only integration and snapshot
rebuild rules in earlier requirements and the `radar-coder` spec. Historical
completed tasks remain history, not instructions to recreate the retired path.


# Requirements: Avoozl as a Kiro Crew-native, GitHub-native product

Status 2026-11-18 (spec audit against `origin/main`). The built page is no
longer in git (#490), and CI selects tests by changed files (#521).
Scope (2026-11-18, owner decision): Avoozl takes specs of any size, and a
light spec with one task becomes one pull request. The epics-only scope
statement and its one-pull-request rule of thumb (`radar-coder` RC13.1,
RC13.2) are history; `src/work-split.mjs` holds the statement in use.
One way to run a worker (2026-11-18, `.kiro/specs/worker-paths/`, approved
by the owner's delegate): Crew Mode dispatch, runner mode over SSH (Requirement 84,
Requirement 90.7) and Requirement 41 are
to be removed, and Requirement 96.5's manual path stays without Crew Mode.
That spec's task wp-5.2 marks each of these here; until its tasks land, the
code still has them.

## Introduction

This spec assesses Avoozl's future and defines the smallest useful product that
runs inside Kiro Crew, works fully offline from GitHub, and uses GitHub for
shared plans and delivery. It is a planning and product-design spec. Nothing in
it changes code, GitHub repositories, app settings, or local databases.

The three documents together form the recommendation:

| Document          | Holds                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requirements.md` | Evidence baseline, product question, scope, and the behavior the product must have, with acceptance criteria                                                                                                          |
| `design.md`       | Product thesis, non-goals, state ownership, architecture, workflows, Kiro Crew integration map, app UX, code disposition, moving an existing workspace, release gates, kill criteria, and the final product statement |
| `tasks.md`        | The ordered proof sequence and phased roadmap as checkable tasks                                                                                                                                                      |

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

| #   | Claim                                                              | Result                    | Evidence and correction                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Issue Radar can edit GitHub labels.                                | **Verified**              | `issue_radar/backend/github_client_writes.py` adds and removes issue labels. Crews may write only their claim label and the configured needs-human label (`crew_brief.md`).                                                                                                                                                                                                                    |
| F2  | Issue Radar's Investigate action opens one session.                | **Verified, refined**     | `http_routes/investigation.py`: the frontend opens one Kiro Crew chat through core chat routes, files it in an `Issue Radar - <repo>` folder, and stores a local record so a repeat click resumes the same session. It writes nothing to GitHub.                                                                                                                                               |
| F3  | Issue Radar does not break issues into GitHub sub-issues.          | **Verified**              | No sub-issue code exists in the Issue Radar backend. It reads dependency edges (native and inferred from timeline cross-references) for display and wake signals only.                                                                                                                                                                                                                         |
| F4  | Issue Radar crews do not enforce blockers before claiming.         | **Verified, refined**     | `crew_brief.md` selection keeps open issues that carry _any_ scope label (OR semantics; an empty scope means every open issue), drops skipped and `crew:`-labeled issues, then picks at random. Blockers feed only a `dependency-unblocked` wake for items a crew already holds (`crew_runtime.py`), from a dependency cache with a 600-second TTL (`store_deps.py`).                          |
| F5  | Task Runner decomposes one task into internal execution steps.     | **Verified, refined**     | `docs/task-runner.md`. The app id is `projects`, display name Task Runner, API `/api/taskrunner`. Step verification uses one gateway-wide `taskrunner.test_command`, not a per-run command. Headless runs are deny-by-default for tools.                                                                                                                                                       |
| F6  | Task Runner steps do not become GitHub issues.                     | **Verified**              | The Task Runner manifest declares only `/api/taskrunner` and a `refine` event; its documentation describes no forge writes.                                                                                                                                                                                                                                                                    |
| F7  | Spec Builder writes requirements, design, and task Markdown.       | **Verified, refined**     | `spec_builder/backend/parsers.py`: `requirements.md`, `design.md`, `tasks.md`, plus `.spec-state.json`. Only requirements and design are approvable; approving the task list _is_ the handoff into one autonomous execution session. There is no fourth phase for another app.                                                                                                                 |
| F8  | Crew Mode supervises independent worker sessions.                  | **Verified, refined**     | `docs/agents.md`, `docs/work-ledger.md`. Crew Mode is a feature preview behind Settings → Developer. A conductor (`kirocrew-conductor`) dispatches one `kirocrew-worker` session per item. Items must be independent: an item that consumes another item's output is not a valid item.                                                                                                         |
| F9  | Crew Mode work items are not GitHub tasks.                         | **Verified**              | Work-ledger items hold title, acceptance, state, status, summary, artifacts, and an optional `pr` number. They have no issue identity and no dependency edges.                                                                                                                                                                                                                                 |
| F10 | Removed 2026-11-14: the owner dropped the separate review app. | **Removed** | Avoozl's own code review chat stays (Requirement 49.16). |
| F11 | GitHub projection supports native cross-repository dependencies.   | **Verified, with limits** | `src/app/github-sync.mjs` `projectPlanIssues` and the live proof. Limits: every target repository must be registered and private; a dependency outside the plan must already be projected; drift detection applies to edges only.                                                                                                                                                              |
| F12 | Fresh Avoozl workspaces can recover projected issues from markers. | **Corrected**             | Recovery reuses existing issues only when the _same approved plan ID_ is projected again: issues are matched by the hidden marker's `taskId` and `planId` under the managed label. It does not rebuild local tasks, status, or edges from GitHub. `syncGitHubIssues` fails when a marker names a task that is not present locally. A closed projected issue makes re-projection fail with 409. |
| F13 | Avoozl verifies exact pull-request completion and required checks. | **Corrected**             | `src/app/github-completion.mjs` implements the check correctly and was proved live. It was called only by a live proof script that now lives in git history. No operation, CLI command, MCP tool, or dependent-release path uses it. It also requires the closing pull request to live in the issue's repository.                                                                                            |
| F14 | The current Kiro Crew Avoozl app is only a proof shell.            | **Verified**              | `kirocrew-app/app.json` declares one page and one skill, no backend, no MCP server, and no crons. `ui/src/App.tsx` renders four static cards and one button that opens a draft chat.                                                                                                                                                                                                           |

### Additional facts that change the plan

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                         | Label                                                                                    | Evidence                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F15 | Trigger labels and managed state labels are the same label today. One `label` (default `avoozl:ready`) authorizes intake _and_ is the readiness label projection adds. Intake supports one label, one assignee, an actor allowlist, and a minimum permission. There are no AND, OR, or exclusion rules.                                                                                                                      | **Verified**                                                                             | `github-sync.mjs` `syncGitHubIssues`, `prepareGitHubRepository`; `repository-settings.mjs`.                                                                                       |
| F16 | Avoozl refuses public repositories for intake and projection with HTTP 403. This was a lockdown for testing, not a product rule; the product must support public repositories.                                                                                                                                                                                                                                               | **Verified** (code); owner decision 2026-11-11                                           | `prepareGitHubRepository` and `requirePrivateRepository` in `github-sync.mjs`.                                                                                                    |
| F17 | Managed-field conflict detection covers dependency edges only. Titles and the managed body section are overwritten without comparing to the last applied value.                                                                                                                                                                                                                                                              | **Verified**                                                                             | `projectPlanIssues` compares `managedBlockerIssueIds`; title and body go straight to `updateIssue`.                                                                               |
| F18 | GitHub task dispatch and all local execution use Avoozl's own agent host and providers (`codex`, `claude`, `openhands`), not Kiro Crew.                                                                                                                                                                                                                                                                                      | **Verified**                                                                             | `startAuthorizedIssue` calls `ops.manager.start`; `src/app/providers/`.                                                                                                           |
| F19 | The feature branch is 6 commits ahead and 31 commits behind `main`. `main` adds design-prose extraction, durable andon safety controls, a team coordination control plane, and remote execution targets. The Nupp database already contains `main`-only tables (`extractions`, `plan_facts`, `execution_jobs`, `safety_*`, `team_checkpoints`).                                                                              | **Verified**                                                                             | `git rev-list --left-right --count main...feature/kirocrew-github-delivery`; Nupp `.tables`.                                                                                      |
| F20 | A Kiro Crew app may declare a `node` backend that the gateway spawns on loopback and reverse-proxies at `/apps/<name>/api/`, plus `mcpServers`, `crons`, `agents`, and `skills`. Third-party apps run with gateway privileges after the user grants trust.                                                                                                                                                                   | **Verified**                                                                             | `apps/manifest_sections.py` `BackendConfig`; `apps/routes_proxy.py`; `docs/apps.md`. The current Avoozl app is installed and trusted (`~/.kiro/crew/apps/avoozl/installed.json`). |
| F21 | No supported API lets an app backend create a _visible, project-bound_ Kiro Crew session. The app spawn SDK starts background agent turns with no project or working-directory argument. `session_create` has no project argument; a session inherits a project only from a folder whose `project_dir` a person set.                                                                                                         | **Verified**                                                                             | `apps/spawn_sdk.py`; `docs/session-control.md` (`session_create`, `chat_folder_update`).                                                                                          |
| F22 | Kiro Crew inbound webhooks run one LLM turn in an ephemeral session, bind loopback by default, and use Kiro Crew's own HMAC headers, not GitHub's webhook signature.                                                                                                                                                                                                                                                         | **Verified**                                                                             | `docs/inbound-webhooks.md`.                                                                                                                                                       |
| F23 | Issue Radar crew configuration lives in Issue Radar's private app data and routes (`/api/apps/issue-radar/crews`). No public contract lets another app read or write a crew's label scope.                                                                                                                                                                                                                                   | **Verified**                                                                             | `crew_ledger_spec.md`, `crew_routes.py`.                                                                                                                                          |
| F24 | Issue Radar crews can merge and re-arm auto-merge, and hold at most one item per crew in the dirty-worktree phases (Implement, Addressing review).                                                                                                                                                                                                                                                                           | **Verified**                                                                             | `http_routes/pr_actions.py`; `docs/issue-radar-pipeline.md`; `crew_brief.md`.                                                                                                     |
| F25 | Avoozl readiness treats `requires` and `sequence` edges as blocking and `supports` edges as advisory.                                                                                                                                                                                                                                                                                                                        | **Verified**                                                                             | `src/query.mjs`.                                                                                                                                                                  |
| F26 | Avoozl runs its own runtime machinery today: `host-scheduler.mjs` (host-wide admission with default limits of 4 per host and 2 per workspace), the agent host with activity leases, the GitHub intake webhook callback with its own capability tokens (`github-intake.mjs`), and GitHub sync and queue polling driven by Avoozl's server.                                                                                    | **Verified**                                                                             | `src/app/host-scheduler.mjs`, `src/app/agent-host.mjs`, `src/app/github-intake.mjs`, `src/app/github-queue.mjs`.                                                                  |
| F27 | Kiro Crew crons can run a shell command with no LLM call (`command` jobs), on an interval, cron expression, or one-shot time. Commands are vetted when added and on every fire; command substitution, loops, and compound commands are refused. The default subprocess limit is 300 seconds and the default wake budget is 30 minutes. An app manifest can declare crons that register on enable and are removed on disable. | **Verified**                                                                             | `docs/cron-and-scheduling.md`; `apps/manifest.py` `crons`; `docs/apps.md`.                                                                                                        |
| F28 | Kiro Crew monitor loops wake one conversation on an interval and run an agent turn each cycle in that same conversation.                                                                                                                                                                                                                                                                                                     | **Verified**                                                                             | `docs/monitor-loops.md`.                                                                                                                                                          |
| F29 | No documented Kiro Crew event pushes a session's completion to an app backend. Apps can declare permitted event names (Task Runner declares `refine`; Workflows declares `workflow_run_event`), but no session-lifecycle event for third-party apps was found.                                                                                                                                                               | **Verified** (absence in docs and manifests searched); push support **Inferred** missing | `~/.kiro/crew/apps/*/app.json`; `docs/session-control.md`.                                                                                                                        |
| F30 | Apps can declare notification channels in their manifest.                                                                                                                                                                                                                                                                                                                                                                    | **Verified**                                                                             | Issue Radar manifest `notifications.channels`.                                                                                                                                    |

### Example workspace facts

The first existing workspace moved was Nupp's. All counts come from a
read-only query of its `.avoozl/local/workspace.sqlite` on 2026-11-11.

| Fact                                                                  | Value                                                                                                                                                           | Label        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| W1–W7 epics                                                           | 7, stored in the workspace snapshot                                                                                                                             | **Verified** |
| Tasks in W1–W7                                                        | 141 (W1 33, W2 27, W3 22, W4 9, W5 12, W6 21, W7 17)                                                                                                            | **Verified** |
| Finished W tasks                                                      | 61 (58 implemented, 3 accepted)                                                                                                                                 | **Verified** |
| Unfinished W tasks                                                    | 80 (41 partial, 30 planned, 6 deferred, 2 blocked, 1 review)                                                                                                    | **Verified** |
| Edges among W tasks                                                   | 130 (80 `requires`, 21 `sequence`, 29 `supports`); 101 of them block readiness                                                                                  | **Verified** |
| Milestones                                                            | 3 (`compiler-on-core`, `runtime-flip`, `six-workload-execution`)                                                                                                | **Verified** |
| Document-derived entries from `todo/nupp-compiler-runtime-rewrite.md` | 94, all `planned`, generated `plan-<hash>` IDs, zero edges                                                                                                      | **Verified** |
| Those 94 entries duplicate W task scope                               | Likely                                                                                                                                                          | **Inferred** |
| Whole database                                                        | 4,075 tasks; 3,888 are document-derived across many documents (2,036 recorded, 1,576 planned, 276 archived)                                                     | **Verified** |
| Other native-runtime documents                                        | 357 more document-derived entries (`nupp-native-runtime-handoff.md`, `native-runtime-plan-before-consolidation-2026-10-28.md`, `nupp-native-runtime-ledger.md`) | **Verified** |
| Prior deduplication receipts                                          | 149 `task-merge` evidence rows                                                                                                                                  | **Verified** |
| Runs                                                                  | 12 (6 completed, 5 observing, 1 interrupted)                                                                                                                    | **Verified** |
| GitHub projection                                                     | 0 projected issues, 0 registered intake repositories; the read-only GitHub queue tracks public repositories such as `nupp-lang/nupp`                            | **Verified** |
| Integration branch                                                    | `codex/native-core-first-programs` recorded in the snapshot                                                                                                     | **Verified** |

## Product question

> What job does Avoozl own that Kiro Crew and GitHub do not already own?

**Verified gaps.** No current Kiro Crew feature or GitHub feature does all of
the following together:

1. holds a durable, multi-level task graph with stable IDs and blocking edges
   across repositories (Crew Mode items must be independent; Task Runner steps
   are internal; Spec Builder hands one checklist to one session);
2. computes readiness from those edges _before_ work is claimed (Issue Radar
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
- Use of Issue Radar, Task Runner, Spec Builder, Crew Mode, Workflows, chat,
  sessions, and cron through supported interfaces only.
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

### Requirement 5: Design-first task facts

(Changed 2026-11-18, Requirement 111: task facts are `Facts:` bullets in
`tasks.md`; there is no `avoozl/manifest.json`.)

**User story:** As a developer who wrote requirements and design in Spec Builder,
I want Avoozl to read each task's facts beside it in `tasks.md`, so that I can
deliver the design without retyping it.

#### Acceptance criteria

1. WHEN a Kiro spec folder (Requirement 30), including one Spec Builder wrote,
   has approved requirements (or bugfix analysis) and design THEN Avoozl SHALL
   read its files from disk and SHALL NOT call Spec Builder routes.
2. Each `tasks.md` task SHALL carry its repository, dependencies and
   completion condition in its `Facts:` bullet (Requirement 111), with
   source references in the prose.
3. A critique SHALL compare the task facts with the prose and report every
   uncovered requirement and every task with no prose source.
4. Deterministic validation SHALL check structure and references and SHALL be
   repeatable: the same inputs produce the same result.
5. The task facts and validation result SHALL be pinned to the exact Git commit of
   the prose they came from.

### Requirement 6: Readiness and bounded automatic local delivery

**User story:** As a developer, I want ready leaves to start by themselves within
limits I set, so that I do not file, start, or chase routine work.

#### Acceptance criteria

1. A leaf SHALL be ready only when it is approved, every blocking dependency has
   met its completion condition, and no conflict or human decision is open.
2. WHEN a leaf becomes ready and capacity allows THEN Avoozl SHALL dispatch it
   without a manual step.
3. Concurrency SHALL have exactly two settings: `lanes.local` in the machine
   file (`~/.config/avoozl/config.json`), how many worker chats this machine
   runs at once (default 3), and Release N (`release.capacity`), how many
   issues a repository releases at once. (Changed 2026-11-18, simplification
   audit F1 and F2: it was bounded per workspace and per repository.) Older
   keys SHALL be read as old input only and never written:
   `delivery.concurrency`, then `lanes.local` in `.avoozl.json`, count as this
   machine's lanes when the machine file sets none; per-repository
   `delivery.repositories.*.concurrency`, `github.repositories.*.concurrency`,
   and the host and workspace `maxConcurrentRuns` SHALL be ignored. A file
   that sets them SHALL load with no error or warning. Settings › Workspaces
   SHALL NOT show an "Agents at once" field, and `avoozl workspace
   concurrency` SHALL NOT exist, because nothing enforced them.
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
    of Kiro Crew's own pages (`/chat?sid=`, `/apps/`, `/issue-radar`); anything else SHALL render as text (added
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

Changed 2026-11-15 (owner decision): Avoozl pushes and merges, after
checks pass on the updated head (Requirement 87). The old rule that Avoozl
never merges, and that the worker or Issue Radar enables auto-merge, is
reversed.

1. Merging SHALL follow the repository's landing setting (Requirement 87):
   `direct`, `pr` or `off`, gated by the repository's required reviews and
   checks. The worker chat SHALL NOT enable auto-merge or merge.
2. Avoozl SHALL merge only after checks passed on the head it merges, and
   SHALL never force push or bypass a required check or review.
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

**Status 2026-11-18.** The page has seven nav entries, not six views: Dashboards (Home, Graph, Delivery, Landing queue), Specs, Needs you (Decisions, Triage, Issue Radar), Flow, Retros (Retros, Proposals), Activity and Settings (Workspaces, Repository setup, GitHub, Issue Radar, Plugins, Content rules, Flow, Models, Delivery). Criterion 1 is read that way. The Dashboards › CI page is hidden until it is built (owner, 2026-11-18, simplification audit item 10); Flow shows CI, and an old CI link opens Flow.

**User story:** As a developer, I want one Avoozl page in Kiro Crew with clear
views, so that I see my graph and its delivery without leaving Kiro Crew.

#### Acceptance criteria

1. The app SHALL provide Dashboards, Specs, Needs you, Flow, Retros, Activity,
   and Settings views. (Changed 2026-11-18: this replaces Workspace, Plans,
   Graph, Delivery, Conflicts and Settings; those are now pages of these
   entries, and Workspaces is a Settings page.)
2. For each view the design SHALL name its data, primary actions, canonical
   source, links to existing Kiro Crew surfaces, and what it must not duplicate.
3. The app SHALL NOT duplicate Issue Radar triage, pipeline, or crew views; it
   SHALL link to them.
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
5. A task's facts MAY name a `route`, which overrides the
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

The idea is to watch issues, dispatch agents and track to merge. Avoozl builds
it on Kiro Crew and Issue Radar and reuses no outside code, skills, or text.
(**Proposed**)

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
   receive the ready label in the same tick, up to the repository's Release N
   (Requirement 6.3).
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
    SHALL be bounded by this machine's lanes (Requirement 6.3).
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
    value and SHALL draft a change to the task's facts for review, so the plan
    catches up. Avoozl SHALL write Release again only when an approved revision moves
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
   `tasks.md`. (Changed 2026-11-18, Requirement 111: the manifest is gone;
   each task's facts are a `Facts:` bullet in `tasks.md`.)
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
   Edges SHALL come from the task's `Facts:` bullet (Requirement 111). Kiro's own task waves inside
   `tasks.md` SHALL NOT be Avoozl's graph.
7. Avoozl's planner SHALL write plans into this layout.
8. Free-form plan files with fenced task blocks (`extractPlan`) SHALL remain
   only as a read path for migrating old workspaces, such as Nupp. Avoozl
   SHALL NOT write them.
9. A plan's category SHALL come only from a `category:` key in YAML
   front-matter at the top of the spec's `requirements.md` or `bugfix.md`
   (for a plan with no spec folder, from front-matter at the top of its own
   text, or from metadata a person set). Avoozl SHALL read it and SHALL NOT
   write it, SHALL NOT keep it in task facts, and SHALL NOT infer one from a
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

   | Owner  | State                                                                                                                                                                               |
   | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | GitHub | Project Status (built-in workflows); the Blocked signal (open blocked-by dependencies); closing leaf issues in both modes                                                           |
   | Avoozl | Issues, sub-issues, blocked-by links, the linked branch; Release at projection; Wave; picking ready work; starting coding sessions; the completion verdict that releases dependents |
   | People | Assignees, board drags, Deferred; closing a leaf without merged code, as an order when the policy allows the closer (criterion 8)                                                   |

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
   in Avoozl: edges SHALL come from the approved task facts in Git and be cached
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
   `read`, and the approved task facts alone.
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

1. Review and check sessions only read, so they SHALL NOT count against
   this machine's lanes (Requirement 6.3). Avoozl SHALL add no separate
   writer limit. (Changed 2026-11-18: one writer per repository was a
   per-repository concurrency of 1. That key is now ignored, because every
   task writes in its own worktree and landing merges one head at a time;
   `lanes.local: 1` still gives one writer on the machine.)
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
   approval (every spec file); issue and pull
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

### Requirement 41: Retired

Retired 2026-11-18 (owner decision). Nothing here exists. Every session
Avoozl opens runs on this machine, on the executor its harness names
(Requirement 98). The number stays so that other requirements keep their
references.

### Requirement 42: Retired

Retired 2026-11-18 (owner decision). The number stays so that other
requirements keep their references.

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

**Status 2026-11-18.** Stop the line is an icon button in the Dashboards › Delivery heading, not in the top bar or the Dashboard header (#488). The dialog, banner and Resume are unchanged.

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

**Changed 2026-11-18.** Criteria 1 to 4 are replaced by Requirement 108:
the planner decides batches in `tasks.md` (Requirement 111.4), and batching
has no setting.
Criteria 5 to 7 still hold.

**User story:** As the owner, I want small related tasks to share one run,
so that the fixed cost of a session, a worktree, checks, and review is paid
once instead of once per tiny task.

#### Acceptance criteria

1. (Replaced by Requirement 108.) A leaf SHALL be batchable only when its
   facts set `size: "small"`. Leaves without it SHALL never be batched.
2. Avoozl SHALL group ready batchable leaves into one run when they share
   the key `flow.batch.by` names: `epic` (the same parent) or `files`
   (overlapping `paths` facts). The default SHALL be `epic`. (Changed
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
   in `.avoozl.json`.
9. A retrospective that fails, times out (default 10 minutes), or replies
   with nothing valid SHALL be recorded as failed with its reason and SHALL
   NOT stop the tick or delivery.

### Requirement 48: Flow tab and Flow settings

**Status 2026-11-18.** Retrospectives and Proposals are pages of the Retros nav entry (#468), not tabs of Flow. Flow keeps the metrics and its settings group.

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
   checks first** (on or off), ~~**Batching** (max, by),~~ (removed
   2026-11-18, Requirement 108) and **Retro**
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

**Status 2026-11-18.** There is no Untriaged or Intake tab. The list is Needs you › Triage (#464), with its count in the nav. Old `untriaged` and `intake` links open Triage. The per-repository **Untriaged** group is under Settings › Repository setup › Triggers and labels.

Added 2026-11-12 (owner request). Design §8.5.

**User story:** As the owner, I want one list of the open issues and pull
requests no trigger rule or triage label covers, so that nobody misses new
GitHub work, and I want each item to hand off to Issue Radar or its own code
review chat for the actual work.

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
3. Settings › Repository setup › Triggers and labels SHALL have an **Untriaged**
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
   and for a pull request **Code review**, which opens Avoozl's own review
   chat (Requirement 49.16). WHERE Kiro Crew offers no link to the exact
   item, **Open in Issue Radar** SHALL open the app's page and its tooltip
   SHALL say so (MC-14, design §7.1).
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
    Issue Radar and GitHub.
16. **Code review** on a pull request row SHALL open a new Kiro Crew chat
    through the tick's own session permission, seeded with the pull
    request's URL, repository, number, head commit, title, author, its Avoozl
    task and spec section if any, and an ask for a careful
    single-pull-request review, comments as drafts, posting nothing. (The
    separate review app and its skill were dropped 2026-11-14; the seed names
    no skill.)
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
    SHALL say it posts nothing to GitHub. A second click SHALL reuse a queued or open chat. Avoozl SHALL
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
   (Changed 2026-11-18, Requirement 110: GitHub repositories are declared
   here too, as `via: "github"`, and `github.issueIntake` and
   `github.queue` are retired into this list.)
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
    match it. It SHALL be listed in Intake without a **Code review** button.
    (The `review` rule action and the hand-off to a separate review app were
    dropped 2026-11-14.)
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
§6.4. Requirement 103 (2026-11-16) supersedes criterion 7 for task issues
Avoozl projected: Avoozl no longer hands its own issues to a crew.

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
crew's label or close is the owner. An app token reaches Issue Radar's `GET /crews` only through a
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
session".

**User story:** As the owner, I want to choose which Kiro Crew agent and
model write each task, so that hard work gets a strong model and routine
work gets a cheap one.

Facts (2026-11-13): the tick opens every session with
`open_session(title, folder_id=, agent=, model=)` (design F75). One writer
model is set per workspace or repository (`delivery.model`), and each review
role names its own `agent` and `model` (design §5.2).

#### Acceptance criteria

1. A task's facts MAY carry `session`: `{agent, model, harness}`, every
   field optional. Validation SHALL refuse an empty agent or model string
   and any other key.
2. The checks role and review roles SHALL keep their own `agent` and
   `model` (design §5.2).
3. The writer's session SHALL come from, in order: the task's
   `session`, the repository's `delivery` settings, the workspace's
   `delivery` settings, and then Kiro Crew's default agent and `auto`.
4. Retired.
5. Retired.
6. A retry or resume of the same task SHALL keep the model of its last
   attempt unless that model is `out`, so that one task's work stays on one
   model.
7. For a review role with `distinctFrom: model` (Requirement 36), Avoozl
   SHALL NOT give the writer that role's model. IF no model is left THEN
   the task SHALL wait and Avoozl SHALL open one decision. Avoozl SHALL
   never run a review on the writer's model under `distinctFrom: model`.
8. Retired.
9. Retired.
10. Every session binding SHALL record the agent and the model asked for,
    how they were chosen (pinned, kept, or the default), and the model Kiro
    Crew reports it ran on, when Kiro Crew reports one (design F65).
11. The Delivery view SHALL show the agent and model of each running
    session.
12. A leaf on the Issue Radar route or a `plugin:<id>` route SHALL ignore
    `session`, because Avoozl opens no session for it.
13. With no `session` set anywhere, every session SHALL open as it does
    today. Installing or upgrading Avoozl SHALL NOT change which agent or
    model any session uses.

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
10. Changed 2026-11-15 (Requirement 87): Avoozl pushes, updates and merges
    the pull request; the worker chat only edits and commits. Avoozl SHALL
    NOT comment or re-run checks for this requirement.
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
   `agent`, `model`, `runner`, and `concurrency`; and `flow`. Both
   `concurrency` keys SHALL be accepted so an old pack imports, and SHALL
   write nothing (Requirement 6.3; changed 2026-11-18). Every value
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
3. (Changed 2026-11-18, owner decision.) The deprecated one-tool-per-operation
   `plans_*` names that nothing Avoozl ships uses, the moved-operation stubs,
   `plans_relay` and `plans_andon_*` SHALL NOT be listed or answered. A narrow
   tool that a shipped agent, role prompt or brief names (such as
   `plans_report`, `plans_get_plan` or `plans_submit_review`) SHALL stay as a
   current tool, so no agent's allowedTools grows. Agents, prompts and briefs
   SHALL name only registered tools, and a test SHALL fail when one names a
   tool that is not registered or when a read-only role is given a grouped
   tool with write actions.
4. A session MAY archive and unarchive a plan, and the record SHALL name
   the session. This replaces Requirement 51.1.
5. A grouped tool that keeps an old read-only name SHALL stay read only, so
   an agent allowed that name gains nothing.

### Requirement 57: New plan from the Plans page

**Status 2026-11-18.** The button is **New spec** in the Specs heading and opens a centered modal (#228), not a right drawer. Quick goal was removed (#228); New spec starts From a goal. **Plan a goal** is no longer in the top bar (#488), so criterion 5 no longer applies.

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
   design.md and tasks.md with `Facts:` bullets, the `category:`
   front-matter, unique task IDs, the folder and the repositories.
   (Changed 2026-11-13: Submit hands the request to Spec Builder,
   Requirement 65; the planner chat is the fallback.)
4. The tick SHALL import the folder as a draft plan once it lints clean.
   New plan SHALL never approve a plan, turn on Autopilot (delivery) or push.
5. Every top button on the Plans page SHALL show an icon.

### Requirement 58: Onboard a repository

**Status 2026-11-18.** There is no separate **Onboard** button. Settings › Repository setup has one **Add repository** entry that runs the same steps as follow-up setup (#515).

Added 2026-11-13 (owner request).

**User story:** As the owner, I want adding a repository to offer a guided
Onboard flow, so that a repository goes from nothing to plans ready to
approve without my running setup steps by hand.

#### Acceptance criteria

1. Settings › Repository setup SHALL offer **Onboard** (now the **Add repository** entry, #515), a stepped dialog with
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

1. An epic SHALL be its own spec folder with requirements, design, tasks
   whose `tasks.md` front-matter says `kind: epic` (Requirement 111.4).
   Each row's facts SHALL name a member
   `plan`, optional `summary`, and optional `step: design | review | implement`.
   Omitted `step` SHALL mean implement. Rows SHALL have no repository,
   checks, completion rule, acceptance or scheduler edges; lifecycle progress
   SHALL be derived under Requirement 102, not dispatched or hand-ticked.
   An epic SHALL NOT use the bugfix spec form.
2. A member plan SHALL name its epic with a top-level `epic: <epic>` key in
   the YAML front-matter of its `requirements.md` or `bugfix.md`, read the
   same way as `category:` (Requirement 30.9): Avoozl SHALL read it, SHALL
   NOT write it, and SHALL NOT infer it. A plan SHALL belong to at most one
   epic, and an epic SHALL NOT list an epic.
3. Validation SHALL reject missing members, nonmatching `epic:` membership,
   nested epics, task fields and duplicate (plan, step) pairs. Different steps
   MAY reference the same plan. A missing reverse link SHALL keep the existing
   warning and No epic behavior without blocking plan approval; an epic
   approval SHALL NOT approve a member.
4. An epic SHALL never be dispatched and SHALL have no repository. It SHALL
   be done when every member plan is done, and a plan SHALL be done when
   each of its tasks is done or archived with a reason. Approving an epic
   revision SHALL approve only its member list and prose, never a member
   plan or a task.
5. A **phase** SHALL be a group of tasks inside one plan. A task's phase
   SHALL come from its `phase` fact when it has one, and
   otherwise from the nearest heading of level 2 or lower above its item in
   `tasks.md`. The front-matter MAY name a title for each phase ID as
   `phase-<id>: <title>`. A task under no heading and with no `phase` value SHALL
   sit under its plan as **No phase**. Phases SHALL group and filter only:
   they SHALL NOT add edges, readiness or completion.
6. Avoozl SHALL NOT invent an epic or a phase. It SHALL NOT create
   `doc:<path>` epics or any other grouping named after a file. A task with
   no plan SHALL show under **No plan**. No view, list, filter, export or
   brief SHALL show a raw `doc:` ID or a file path as an epic or phase name.
7. Inside a plan, the `kind` fact values SHALL be `package` and `leaf`
   (this replaces Requirement 4.3; Requirement 4.4 reads "packages complete
   only from their children"). A task with `kind: epic`, a task `epic`
   fact, an `epics` key in a plan's front-matter, and an
   epic entry's `memberPlan` key SHALL each be a validation error naming
   the file, the entry and the edit that fixes it. Avoozl SHALL NOT load
   any of them under another name.
8. A published epic SHALL have one issue, with one sub-issue per published
   member spec, in each spec's home repository. Tasks and phases SHALL never
   be issues or GitHub Project state. Cross-repository linking failures SHALL
   keep both issues and show a link, without moving private material or
   manufacturing task issues. Issue closure SHALL NOT determine task completion.
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
11. (Superseded 2026-11-18 by Requirement 108: there is no
    `flow.batch.by`.) Flow batching (Requirement 46.2) SHALL name the grouping `phase`: the
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
    `task.archive` and the reason "plan removed", rewrite each old
    form of criterion 7 into the new one, and set `flow.batch.by` to
    `phase` where it was `epic`. A second run SHALL change nothing. It
    SHALL NOT approve a plan, start or stop a session, touch GitHub or
    push; spec changes SHALL be local commits.
13. The owner's Nupp plans SHALL be rewritten this way: the W1–W7 groups
    SHALL become phases of their plan, not epics (this changes
    Requirement 23.9), and the rewrite epic folder SHALL list the member
    plans whose front-matter names it, with `"kind": "epic"` and `plan`, optional `summary` and optional `step`
    in each entry. Avoozl's own spec SHALL be checked
    the same way and rewritten if it uses an old form.
14. Avoozl's planner agent and skill SHALL write epic folders and the
    `epic:` key in this layout, and SHALL write phases as `tasks.md`
    headings.
15. `.avoozl.json` `github.subIssues.maxPerParent` SHALL set how many
    sub-issues Avoozl links under one parent issue: an integer of at least
    1, default 100 (GitHub's limit). Avoozl SHALL count a parent's existing
    sub-issues, open and closed, from GitHub before it links more. Member spec issues
    past the cap SHALL stay unlinked in member order, keep a visibility-safe
    epic reference, and show in publication preview and Delivery with
    "Over the sub-issue limit; open the member spec directly". Settings >
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
   plugin manifest part `template` (Requirement 55.1). A plugin MAY ship only
   templates; such a plugin SHALL have no `entry` and Avoozl SHALL start
   no process for it. A template SHALL be installed, pinned and approved
   as its plugin is (Requirement 34), and SHALL be offered only while its
   plugin is approved on this computer.
2. A template folder SHALL hold `avoozl-template.json` with `id`, `title`,
   `description`, `inputs`, `prompt` (a Markdown file: the planner
   prompt, also used for Spec Builder once MC-16 allows it), `starter`
   (a folder with `requirements.md`, `design.md` and `tasks.md` in the
   layout of Requirement 30), and MAY hold
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
   SHALL match the starter's `tasks.md` headings or `phase` facts
   (Requirement 59.5). `proofKinds` SHALL list named proof outlines
   (title, setup, action, expected, what failure means, next decision)
   that the prompt tells the planner to fill in for this plan.
6. `pack` SHALL be a settings pack under Requirement 55.3–55.7, and
   `flow` SHALL set only `flow` keys that pass the Flow settings
   validator: stop the line, local checks first,
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

9. A leaf MAY set `manual: true` in its facts: a step only a
   person does. A manual leaf SHALL have `done` (what the person
   checks), `repo` (where its issue lives in a GitHub mode) and
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
    done** button. Mark done SHALL open a dialog with ~~an optional outcome
    note and~~ optional links (criterion 16) and a choice of **Done** or **Skipped**,
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

Removed 2026-11-17 (owner): task notes. Tasks keep links only; the struck
note text below no longer applies. Notes saved before then are ignored, with
no migration and no warning, and a new note is refused. The drawer box is
called **Links**, and its fields open from an **Add link** button for one
link at a time.

16. Every task SHALL have **Links** ~~and notes~~: an ordered list of entries,
    each a link (`url` and `label`) ~~or a note (free text)~~, with its author
    (a person, or the session ID) and its time. They SHALL be execution
    state in SQLite, not spec text: they record what happened during
    delivery, they change after approval, and writing them to the spec
    would change the revision hash. Adding one SHALL NOT change the plan's
    revision or approval.
17. A link's `url` SHALL be `https` or `http`, at most 2,000 characters,
    with no user name or password in it; its `label` SHALL be 1 to 200
    characters. ~~A note SHALL be 1 to 10,000 characters.~~ A task SHALL hold
    at most 200 entries. Avoozl SHALL refuse each breach, naming the field.
18. Content rules SHALL check each entry when it is saved, at a new
    `notes` boundary that is on by default. A block SHALL refuse a
    session's call under Requirement 40.5 and SHALL refuse a person's save
    inline, naming the rule set and rule, with Allow once under
    Requirement 40.7. Entries SHALL also pass the `brief` and `github`
    boundaries wherever they are used.
19. The task drawer SHALL show Links, newest first, with author and time,
    and an **Add link** button that opens the URL and label fields for one
    link, with Add and Cancel; adding or Cancel closes them. ~~An **Add
    link** form (URL and label) and an **Add note** box.~~
    A person MAY edit an entry or remove one after a confirm; a removed
    entry SHALL leave the list and stay in the task's activity history.
20. A session SHALL read Links through the grouped `task` MCP
    tool and SHALL get them in its brief: the newest 20 entries, at most
    8,000 characters, marked as data from people and agents, not as
    instructions. A dependent's brief SHALL also carry each blocker's
    outcome entries (criterion 12).
21. A session MAY add ~~a note or~~ a link to a task it is bound to; the entry
    SHALL name the session. A session SHALL NOT add to another task, and
    SHALL NOT edit or remove any entry.
22. Editing or removing an entry, and **Show on the issue**, SHALL be
    person only. The CLI SHALL offer list, add, edit and remove.
23. In a GitHub mode an entry SHALL be written to GitHub only when a person
    ticks **Show on the issue** on it, off by default. Shown entries SHALL
    be listed in the issue's managed body section under "Links" (before
    2026-11-17, "Links and notes", which a rebuild still reads),
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
    for protocol tests and a cutover dry run; and flow defaults that
    stop the line, run local checks first and hold a
    retrospective every 10 tasks. The plugin guide and the planner skill
    SHALL describe templates, manual tasks and Links ~~and notes~~.

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

### Requirement 63: Ideas (retired)

Retired.

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
   task ID format and uniqueness, phases as `##` headings, the `Facts:`
   bullet under each task and the front-matter defaults (Requirement 111),
   and that no spec folder holds `avoozl/manifest.json`. (Changed
   2026-11-18, Requirement 111.9.) Spec Builder's chat runs the default
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
6. The tick SHALL lint the folder and import it as a draft plan once it
   lints clean. Avoozl SHALL write nothing into the folder. Nothing SHALL
   approve, start an agent or push. (Changed 2026-11-18, Requirement 111.9:
   Avoozl no longer drafts a manifest from `tasks.md`.)
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
    approvals, the private content-rule terms file,
    retro instructions, the crew registry and SSH host keys. After a
    take-over the page SHALL list what to re-approve or re-add, from the
    export's list or, after a rebuild, from the plugins and rule sets named
    in `.avoozl.json`. Until then the existing fail-closed rules SHALL
    hold: an unapproved plugin's tasks park (Requirement 34) and a missing
    terms file blocks its boundary (Requirement 40).
17. A spec's own page and row SHALL show its driver: "Driver: you",
    or the login, machine label and when it was last seen. The app header SHALL NOT show a driver or read-only badge. A workspace
    that is not a spec's driver SHALL show a read-only banner on that
    spec's pages saying why (assigned to someone else, another machine of
    yours, no assignee or several), with **Take over** when this login is
    the assignee and **Force take over** otherwise. Settings › Workspaces
    SHALL have a **This computer** group with Machine label (optional) and
    Heartbeat minutes (optional, placeholder 15), and the machine ID shown
    small.

### Requirement 67: Per-task budgets and usage receipts (retired)

Retired.

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

### Requirement 69: Retro memory across workspaces (retired)

Retired.

### Requirement 70: Lessons and overrides heal as things change (retired)

Retired.

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

**Status 2026-11-18.** Manual **Switch model**, its dialog and Settings › Providers were removed (#228, #153). Settings › Models sets the model of Avoozl's own chats. Provider health reads stay in the backend (`provider-health.mjs`).

Added 2026-11-13 (owner request). Design §4.20. It builds on the usage read
of Requirement 43 (`flow_usage`), the session tool-row read (design §4.11),
the agent and model choices of Requirement 53, and Kiro Crew's per-chat
model change (design F126).

Changed 2026-11-13 (owner decision): out is a hard check. The thresholds form, groups, fallback list, cooldown and window
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
   check. A `low` model SHALL stay an option. For a model a
   person marked out, the model the person switched it to SHALL be offered
   instead. With no model left the task SHALL wait and say why; it SHALL
   NOT open on an `out` model. A writer SHALL never be given a review
   role's model this way (Requirement 53.7).
6. A retry SHALL keep its last model unless that model is `out`; then it
   SHALL pick as a new task does and say that the kept model is out.
7. Retired.
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
17. Avoozl SHALL read this machine's `providers` settings
    (`~/.config/avoozl/config.json`): `lowPercent` and a credits `limits`
    entry per provider. Validation SHALL refuse a `providers` key in
    `.avoozl.json`. Any other `providers` key SHALL be dropped.
18. With no `providers` settings, no error rows and no manual marks,
    dispatch SHALL behave exactly as before.

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
   `off`. `not-small` skips leaves in a planner batch group (Requirement
   108.10; it skipped `size: "small"` before 2026-11-18). A task's facts
   MAY set `investigate: false` or `true` to override the mode.
6. Investigation and the falsifier SHALL be Flow spans of their own and
   SHALL count in Flow's usage.
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
   an agent's pull request, answers a decision by sending work back, or reverts
   an integrated agent commit. It
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
   (`bugfix.md`), its `type` fact is `fix`, it is a stop-the-line fix
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

1. Who merges SHALL be `autoMerge` in the repository's landing block
   (Requirement 87.1): `true` (default, today's behavior) or `false`. A
   spec's `tasks.md` front-matter MAY set `ship` and a task's facts its own
   `ship`, `auto-merge` or `manual`, as a pin. The task's pin wins, then the
   spec's, then the repository's `autoMerge`. A task that came from a GitHub
   issue follows it like any other. (Changed 2026-11-18, simplification
   audit F3: it was `delivery.ship` per workspace and per repository.)
   `delivery.repositories.<id>.ship` SHALL still load as the value of that
   checkout's repository, and `delivery.ship` as the value of every
   repository that sets none, `manual` meaning `false`, with no warning.
   Avoozl SHALL NOT write either key.
2. With auto-merge on, Requirement 18 SHALL apply unchanged.
3. With auto-merge off, briefs SHALL tell writers not to enable auto-merge,
   and Avoozl SHALL say so on the repository's Landing tab. WHEN a pull request's
   required checks pass and its reviews are met THEN Needs you SHALL show
   one **Ready to merge** item with a link to it; the person merges on
   GitHub, and Requirement 16 decides completion as before.
4. With auto-merge off in Local only mode, integration SHALL wait for a
   person's **Integrate** on the Ready to merge item. A Local only
   workspace has no GitHub repository entries, so it keeps reading
   `delivery.ship` and each project's `landing`.
5. Avoozl SHALL still never merge a pull request itself.
6. With auto-merge off, WHEN a writer's pull request closes without merging
   THEN Avoozl SHALL send the writer one message, as one feedback round, to
   read why, fix it and reopen it, or report blocked. Settings › Repository
   setup › Edit › Landing SHALL choose it; Settings › Delivery SHALL NOT.

### Requirement 81: Review a task's changes in the drawer

Added 2026-11-13 (owner request). Design §8.10.

**User story:** As the owner, I want to see what a worker changed from the
task drawer, so that I can review a task without leaving Avoozl.

#### Acceptance criteria

1. The task drawer SHALL have a Files section with a read-only tree of the
   files the task's branch changed against where it left its base, each
   with an added, modified, deleted or renamed badge and its line counts,
   and the totals. A Show all files choice SHALL add every file in the
   worktree or branch. Nothing in it SHALL write.
2. A click on a file SHALL show its unified diff, colored with the page's
   theme variables, with a Split choice that shows it side by side. A
   binary file, a link, or a diff over the size cap SHALL be summarized,
   not drawn.
3. For a task whose worktree is on this machine, the section SHALL offer
   Open in editor for the worktree and for the shown file, as a `kiro://`
   or `vscode://` link. A choice on the page SHALL pick the editor,
   default Kiro. For a task on another crew, or with no worktree, the
   section SHALL link the task's branch on GitHub instead.
4. `task.files` and `task.diff` SHALL be read-only operations that MCP may
   call. They SHALL read with Git only, with fixed arguments, `--` before
   every path, literal pathspecs and no shell, against the task's worktree
   or branch.
5. `task.diff` SHALL refuse a path that is absolute, has a `..`, `.` or
   empty part, a backslash or NUL, or that Git does not list for the
   task; it SHALL never follow a link out of the worktree. A ref from
   settings that could read as an option SHALL never reach Git.
6. File lists and diffs SHALL be capped in size, and tests SHALL show the
   path and argument rules failing without them.

### Requirement 82: Demo mode

**Status 2026-11-18.** The demo tour was removed (#311). The Demo badge, the bar, the Stop the line example and Exit demo stay. **Start demo** is in the empty In flight box on Home.

Added 2026-11-13 (owner request). Design §6.11.

**User story:** As the owner, I want a demo I can show anyone, so that they
see Avoozl working on made-up work while my own work, GitHub and agents
stay untouched.

#### Acceptance criteria

1. WHEN a person presses Start demo THEN Avoozl SHALL open a made-up
   sample workspace: one epic over three approved specs with phases, one
   draft spec, tasks that are done, ready, running, in review, blocked and
   done by a person, Intake items, an idea, Flow history with a closed stop,
   two lessons, receipts and Activity rows. It SHALL hold no real or private
   data. **Start demo** SHALL show only in the Dashboard's empty In flight
   box while the workspace has never run a task (no session, evidence,
   integration or completed task), and on the empty page with no workspace;
   it SHALL NOT be in the page header. While the demo is on, the header keeps
   its Demo badge and Exit demo (owner decision 2026-11-14).
2. The sample SHALL be installed once, in its own temporary folder, built
   in a staging folder and moved into place whole. A failed build SHALL
   leave nothing. A second start SHALL reuse the sample and keep its edits.
   A folder in the way SHALL never be overwritten. Installing SHALL never
   approve a person's draft, start an agent or configure an execution
   repository; the sample's draft stays a draft.
3. In the demo every operation that is not a read SHALL change nothing and
   SHALL answer with one sentence that says what it would do in a real
   workspace. No dispatch, router, retro, responder or reviewer session
   SHALL start, and the page SHALL open no Kiro Crew chat and call no host
   route outside Avoozl's own commands and reads.
4. The demo SHALL use a fake GitHub with an epic issue, sub-issues, a
   Project, pull requests and passing, failing and running checks. It SHALL
   refuse every write, every raw call and every method it does not know.
5. Withdrawn 2026-11-16 (owner request): the guided tour is removed. Demo
   mode keeps the sample, the demo bar and Exit demo, with no tour.
6. A Demo badge SHALL show in the header on every page while the demo is
   on, and Settings SHALL list only the sample, never the machine's own
   workspaces.
7. One Exit demo button SHALL return to the person's own workspace. A test
   SHALL hash the real workspace's database, configuration, the machine
   catalog and settings before and after a demo and find them unchanged.

### Requirement 83: Security follow-ups from the PR 29 audit

Added 2026-11-14 (owner request). Design §6.12. Findings S4 to S8.

**User story:** As the owner, I want repository code, agent sessions and
other local users held to what I approved, so that a public repository or a
chatty agent cannot reach my secrets or my approvals.

#### Acceptance criteria

1. WHEN the CLI is run with `KIROCREW_SPAWNED=1` or `KIRO_SESSION_ID` set
   THEN it SHALL run a person-only operation, SHALL print that it ran in an
   agent session, and an approval without a delegate SHALL record that in
   its receipt's evidence. (Changed 2026-11-18, owner decision: the CLI used
   to refuse here unless `--as-person` was given; the flag is removed and an
   old command that passes it runs as before. The command line is a
   person's tool, and the refusal stopped only well-behaved agents.)
2. The docs SHALL say plainly that person-only stops MCP and app tokens, not
   code running as the user. A draft request to Kiro Crew for passing the
   proxy secret by descriptor or a 0600 file SHALL be kept in
   `docs/kirocrew-requests/`. Nothing SHALL be filed.
3. A new `.avoozl` folder SHALL be 0700 and a new database 0600, set before
   the database opens. Backups and `export --output` files SHALL be 0600. An
   existing workspace SHALL be tightened on open. The docs SHALL say what
   happens on Windows.
4. `docs/policies.md` SHALL name the repository-owned code that runs on its
   own. `scripts/worktree` SHALL run only when the project's `worktreeHelper`
   equals its SHA-256 hash; otherwise the refusal SHALL show the hash.
5. A project MAY set `checksEnv`, a list of variable names. Check processes
   SHALL then get only those, the basics needed to start, and never the
   gateway credentials. Without it, checks SHALL get what they get today.
6. A local-folder plugin SHALL be hashed again just before it starts and
   SHALL be refused if the hash changed since approval.

### Requirement 84: Runner mode over SSH

Added 2026-11-14 (owner request). Design §6.13. Prototype, off by default.

**User story:** As the owner, I want one Avoozl to hand a task to an Avoozl on
another machine over SSH and see that machine's worker, so that work can run
on a bigger or safer machine without a shared database or a shared gateway.

#### Acceptance criteria

1. A workspace SHALL be in runner mode only when `.avoozl.json` has
   `runner.role` set to `runner` or `driver`. Without it every `remote.*`
   operation SHALL be refused and every tick SHALL run as before.
2. A runner SHALL hold no plans. Its tick SHALL run only the tasks it was
   handed.
3. `avoozl runner accept` SHALL take one envelope: `version`, `taskId`, `repo`,
   `baseCommit`, `brief`, `checks`, `agent`, and optionally `model`. It SHALL
   refuse an unknown field, a repo or check the runner does not name in its
   own settings, an agent outside its allowlist, and a base that is not a full
   SHA. Repo paths and check commands SHALL come only from the runner's own
   settings. The driver SHALL send the envelope on stdin, and the remote
   command line SHALL be fixed text.
4. The same envelope again SHALL be a no-op. A different envelope under the
   same task ID SHALL be refused.
5. The runner's own tick SHALL make a worktree at the base commit, open one
   worker session on its own crew, and bind it. A task with a bound worker
   SHALL never be dispatched again, across a restart.
6. A worker SHALL report with `avoozl runner report`. The runner SHALL read
   the commit from the worktree, run the named checks, and push the branch to
   its configured remote with a plain push.
7. `avoozl runner status --json` SHALL give, per task: state, branch, commit,
   each check's exit code, and for the worker its chat key, crew ID and chat
   path. It SHALL carry no token and no absolute URL.
8. The driver SHALL pull status over SSH on its tick and keep the last answer,
   marked stale, when the link fails. It SHALL show each unfinished remote
   worker in In flight with a Remote badge and an Attach link that opens the
   runner crew's dashboard chat in a new tab. The link SHALL be built from the
   driver's own `dashboardUrl` for that host.
9. A runner's `workerMode` SHALL be unset by default. When the owner sets it to
   `trust` or `trust_reads`, the tick SHALL set that mode on the worker
   session. Unset, an unattended worker's tool calls wait for an approval no
   one gives.
10. A worker whose chat ended without a report SHALL raise one decision notice
    and SHALL NOT be replaced.

### Requirement 85: Crews on public repositories

Added 2026-11-14 (owner request). Design §6.14. Facts checked in Kiro Crew
0.12.2.4 and on a scratch repository, written up in `docs/public-crews.md`.

**User story:** As the owner of a machine that holds private names, links and
notes, I want an Issue Radar crew to work a public repository without any of
that reaching GitHub, and I want it to fail safe if something slips, so that
one careless line cannot become a public leak.

Facts. A crew writes its claim comment, labels, commits, pushes, pull request
and pull request body itself, with `gh` and `git` in its own shell. Issue
Radar's backend writes to GitHub only when a person clicks in the dashboard,
and it refuses a crew's session on those routes. The crew's two Kiro Crew
tools touch only its local ledger. A crew's agent comes from its crew record,
so a hook on that agent runs before each of its tool calls. A separate
`KIRO_HOME` hides the owner's global steering and memory from that agent, but
not any file the same operating-system user can read.

#### Acceptance criteria

1. A crew SHALL count as a public crew WHEN its repository is public on
   GitHub. A repository whose visibility cannot be read SHALL count as
   public. The layers below SHALL apply to every public crew and SHALL NOT
   depend on any prompt text.
2. Layer 1, a clean home. Avoozl SHALL document and check a crew home with
   no steering, memory or notes of the owner's, reached through its own
   `KIRO_HOME`. The docs and the checklist SHALL say plainly that this
   removes injected context only: the crew can still read every file its
   operating-system user can read, and use that user's credentials. A crew
   that must not read them SHALL run as another user, in a container, or on
   another machine.
3. Layer 2, scan before send. Avoozl SHALL ship a hook command that a crew's
   agent runs before each shell call. It SHALL read the call from stdin and,
   for these writes, run content rules (Requirement 40) before they run:
   `gh issue` create, comment, edit; `gh pr` create, edit, comment, review,
   merge; `gh api` with a write method or body fields; `git commit`,
   `git tag` and `git push`. It SHALL check the text, the labels, the branch
   name, and, for `git push` and `gh pr create`, the commit messages and
   added lines the call would publish.
4. WHEN a rule matches, or a rule set the repository needs is unavailable,
   THEN the hook SHALL refuse the call (exit code 2) and name the rule set,
   rule id and place, never the matched text (Requirement 40.8). WHEN the
   text cannot be read from the call, because it comes from a shell
   expansion, THEN the hook SHALL refuse it and say why, so the crew can
   write the text to a file and pass the file.
5. The hook SHALL be limited as follows, and the docs SHALL say so: it reads
   the call, not what a script or interpreter does when run, so a write made
   inside a script, `python -c`, or a build tool is not seen; and it covers
   only the tools it is attached to. WHERE a write comes from Kiro Crew's own
   backend instead of the crew's shell, the hook cannot see it either. Those
   gaps SHALL be covered by criterion 6, and the missing upstream
   capabilities SHALL be listed as requests in `docs/public-crews.md`.
   Nothing SHALL be filed.
6. Layer 3, audit on the tick. For each public crew's repository the tick
   SHALL read the comments, pull requests, commits and branch names a crew
   made since the last pass, found by the crew claim marker, the
   `crew/<name>/` branch prefix and the crew labels, and SHALL check them
   with content rules. The audit SHALL keep a cursor per repository and SHALL
   run at the tick's own pace.
7. WHEN the audit finds a match THEN Avoozl SHALL: delete the comment, and
   SHALL NOT edit it, because GitHub keeps the edit history; close a matching
   pull request or issue the crew opened and delete its branch; pull the cord
   (Requirement 64) for the repository; and tell the owner in a Kiro Crew
   notification and in Needs you, naming the rule set, rule id, place and
   link. It SHALL record who, what and when, and a hash instead of the
   text. The page and the docs SHALL say that a pull request body, a commit
   or an edit history can stay reachable on GitHub by its address after
   deletion, and that removing it for good needs a request to GitHub.
8. Layer 4, sign-off. Avoozl SHALL NOT send an issue of a public repository
   to Issue Radar (Requirement 52) until a person has signed off a checklist
   of: the crew home, the hook on the crew's agent (by its hash), the rule
   sets that cover the repository, and the audit being on. The sign-off SHALL
   record who and when, SHALL be refused to an agent, plugin, or app token,
   and SHALL lapse WHEN any of those items changes.
9. Kill switch. The page and the CLI SHALL offer one **Stop public crews**
   action that pulls the cord for every public repository and tells the
   person which crews to pause in Kiro Crew, with a link for each. Pulling
   the cord SHALL NOT stop a running crew, which Avoozl cannot pause today.
   Resuming SHALL be a person only (Requirement 64).
10. Every rule set Requirement 40 names SHALL be usable here. A public
    repository with a public crew and no rule set SHALL show a banner and
    SHALL keep sign-off closed. Public Avoozl files, tests and docs SHALL use
    only fake terms, and SHALL describe the private side as internal names
    and company hosts.

### Requirement 86: Avoozl owns the coding loop

Added 2026-11-15 (owner decision, a change of direction). Design §4.26.
This supersedes the Issue Radar path of the `radar-coder` spec (RC1–RC6,
RC10, RC11, RC14, RC15, RC28) and cancels its Phase 12, the retirement
of Avoozl's workers. The mirror and its forward pull request flow
(RC24–RC26) still stand as the "Private mirror" repository role.

**User story:** As the owner, I want one coder that Avoozl runs end to end,
from picking a task to landing it, so that work lands overnight without a
second system deciding what to claim, push or merge.

#### Acceptance criteria

1. Avoozl SHALL have one coder: its own worker chat. The `coder` setting,
   `issue-radar`, the remote coder, the remote relay and the router chat
   SHALL be removed (Requirement 91; the `coder` setting by 91.6).
2. Avoozl SHALL run one loop per task, in this order, and each step SHALL
   have one owner:

   | Step    | Owner  | What it does                                                                 |
   | ------- | ------ | ---------------------------------------------------------------------------- |
   | Pick    | Avoozl | Ranks ready tasks by how many they unblock; holds a task whose declared paths overlap a running task anywhere in the repository |
   | Prepare | Avoozl | Adds the task worktree with the approved `scripts/worktree` helper or `git worktree add` |
   | Work    | Chat   | Edits in that worktree, then reports; Avoozl commits sandboxed child changes               |
   | Verify  | Avoozl | Runs checks in the task worktree, checks the diff against declared paths    |
   | Land    | Avoozl | Lands through the per-base-branch queue (Requirement 87)                   |
   | Accept  | Avoozl | Stop the line (Requirement 64) watches every head Avoozl landed             |

3. The worker SHALL edit code and report. Avoozl SHALL commit sandboxed
   child changes; a chat or person MAY commit locally as Requirement 96
   permits. Its brief SHALL NOT tell
   it to push, open or edit a pull request, merge, turn on auto-merge, label,
   or comment. Avoozl SHALL read the commit from the worktree and SHALL NOT
   take the commit from the chat's report.
4. GitHub SHALL hold owned spec and epic issues and the compact spec journal
   (Requirement 102), never per-task issues or Project task state. A local-only workspace
   SHALL use the same journal protocol in a local file. External issue labels
   or arbitrary comments SHALL NOT grant authority.
5. Each spec SHALL have one driver, named by its issue's assignee, with
   the epic assignee as fallback only when the spec has none. Ambiguous
   assignment SHALL hold work. A workspace scheduler SHALL coordinate its
   drivers, repository-wide path holds and landing queues. Driver takeover
   SHALL use Requirement 102's generations and intents; Requirement 66's
   private handoff export SHALL stay.
6. Verify SHALL refuse a diff that touches a file outside the task's
   declared paths, and SHALL send a diff that touches a protected path
   (the repository's `protectedPaths`, plus CI workflows and the
   `scripts/worktree` helper by default) to the owner in Needs you before
   it lands.
7. Checks SHALL run in the task worktree, warm (the worktree keeps its
   dependencies and build output between attempts), in their own job off
   the tick, with a timeout per check. A check that times out SHALL fail
   with the reason "timed out after N s".
8. Approval SHALL be the local hash receipt (Requirement 4.8). The approval
   pull request of RC3.6 SHALL be used only for a spec whose home branch is
   protected, so a commit can reach it only by pull request.
9. Release ranking (RC31) and build receipts (RC32) SHALL stay and SHALL feed
   Pick and Verify.

### Requirement 87: Avoozl lands the work

Added 2026-11-15 (owner decision 1). Design §4.26. This reverses the rule
that Avoozl never pushes or merges (Requirements 18, 41.5 and 54.10, and
RC5.5 and RC16.4).

**User story:** As the owner, I want Avoozl to push and merge only after the
checks pass on the exact head it lands, so that main stays green without me
pressing merge.

#### Acceptance criteria

1. Each repository SHALL have one landing block,
   `github.repositories.<owner/name>.landing`, edited in one place,
   Settings › Repository setup › Edit › Landing: `mode` (`direct`, `pr`,
   `train` or `off`; `train` is to be retired into `direct` by the
   `merge-batches` spec, which replaced the deleted `landing-trains` spec on
   2026-11-18), `autoMerge` (Requirement 80, default `true`) and
   `method` (`squash` or `merge`, default `squash`, RC28.7). The default
   mode SHALL be `off` until Set up (Requirement 89) writes another. Under
   `off` Avoozl SHALL push nothing and SHALL list the verified commit in
   Needs you. (Changed 2026-11-18, simplification audit F3: the mode was
   the project's `landing`, the method `merge.method`, and who merges
   `delivery.ship`.) The project's `landing` SHALL still load as the mode,
   and `merge.method` as the method, of a repository whose block sets none,
   with no warning. Avoozl SHALL NOT write them. A key in the block wins
   over its older key. Avoozl's own repository and Nupp SHALL land as they
   did before the change, each covered by a test.
2. `direct` SHALL select an exact verified working-branch portion, or a
   train of up to four tasks across specs of the same driver. A landing
   worktree SHALL merge it with the current base, check that exact candidate,
   and fast-forward from the recorded base. A moved base SHALL require a new
   candidate and checks. A failed train SHALL be bisected to one task.
   Declared append-only `landing.unionPaths` SHALL merge only in that landing
   worktree and SHALL still pass all checks.
3. `pr` SHALL open or reuse one pull request for an exact verified portion,
   including a head on an authorized fork. Each head SHALL have its own
   required checks and standing review; a changed head SHALL obey the
   repository's approval rules. Only the head of the per-base queue MAY be
   updated. Source push permission SHALL NOT imply target merge permission.
   Without merge permission Avoozl SHALL observe an authorized maintainer's
   merge. Protected review SHALL NOT combine unrelated pull requests into a train.
4. Avoozl SHALL land only after checks passed on the updated head. It SHALL
   never force push, never use `--admin`, and never bypass a required
   review or check.
5. Landing SHALL be serialized per base branch through one queue, using the
   work lock (`withWorkLock`, `src/app/git.mjs`). Stop the line SHALL pause
   the queue; a paused queue SHALL keep its order.
6. WHEN a merge of the base into the task branch conflicts THEN Avoozl SHALL
   send the conflict to the same worker chat with the list of conflicted
   files, for at most the repository's `conflicts.maxAttempts` rounds
   (default 2), the same count crew pull requests use (RC28.4). A later
   failure SHALL go to Needs you. (Changed 2026-11-18, simplification audit
   F4: the count was `landing.conflictRounds`, which still loads, with no
   warning, as the count of every repository that sets none.) The separate resolver chat
   (`avoozl-conflict-fix`, RC28) SHALL be removed.
7. A task SHALL start from its spec's recorded working head, generalized
   from RC16's epic integration branch. Only verified integrations SHALL
   advance that head. After landing, Avoozl SHALL merge the new target base
   back into the working branch without force pushing. Progress on that
   branch SHALL NOT be confused with acceptance on the landing branch.
8. Avoozl's own repository SHALL honor its current owner-selected landing
   policy. Setup SHALL NOT restore disabled required checks or change real
   repository settings without the owner's explicit approval. This replaces
   the earlier requirement to impose three required checks here.
9. Every push and merge SHALL pass the pre-push content rule (Requirement 40)
   on the commit messages, the branch name and the added lines first.
10. A push or merge made by the tick SHALL run as the tick's own process,
    not from a chat shell. The proof of Phase 40 SHALL show that a tick push
    goes through under Kiro Crew's push policy, which checks chat shell
    commands.

### Requirement 88: Unattended worker basics

Added 2026-11-15 (owner decisions 2, 3 and 4). Design §4.26.

**User story:** As the owner, I want a chain of tasks to keep moving while I
am away, through a gateway restart, so that I come back to landed work
instead of a stuck chat.

#### Acceptance criteria

1. Avoozl SHALL set the worker chat's trust mode when it opens the chat and
   SHALL set it again on every tick, because a gateway restart loses it.
2. A worker SHALL report by CLI from its worktree. (Changed 2026-11-15:
   the command is `avoozl runner report TASK done|blocked`, Requirement 96.) Avoozl SHALL match the report to the task by the worktree path
   and the task's report token in the brief, so a report needs neither MCP
   sharing nor the gateway's session identity.
3. A local worker chat SHALL open with `project: false` and the worktree path
   in its brief, as runner mode does. The earlier claim that an ordinary
   local worker already skips Kiro Crew's project folder and MCP sharing was
   wrong: only runner mode did (`src/app/remote-runner.mjs`); a local worker
   used `leaf.project` and `plans_report` needed MCP sharing.
4. WHEN Kiro Crew reports a worker chat gone THEN Avoozl SHALL open one new
   chat in the same worktree with the same brief and the last report
   quoted as data. A second vanish of the same task SHALL go to Needs you.
   Avoozl SHALL NOT replace a chat because it went quiet or its activity
   lease expired.
5. More lanes SHALL come from worker machines (Requirement 90). (Changed
   2026-11-18: the owner dropped the 50% CPU rule and the fixed three lanes
   as requirements. `lanes.local`, default 3, is a setting in the machine
   file, Requirement 6.3.)
6. Prepare SHALL use the approved `scripts/worktree` helper
   (`createWorktree`, `src/app/git.mjs`), which today has no caller.
   Avoozl SHALL remove a task's worktree and its local branch after the
   task lands, and SHALL keep them for a task that did not land.
7. The Delivery page and the task drawer's Files and diff view SHALL be
   restored (they were removed in ba04389 and 70c2236).

### Requirement 89: One setup command

Added 2026-11-15. Design §4.26.

**User story:** As the owner, I want one command that shows what it will
change in the project settings and on GitHub and then does it, so that a new
repository is ready to land in minutes.

#### Acceptance criteria

1. `avoozl setup REPO` SHALL preview every change, then apply it only after
   `--yes` or a confirm on the page. A second run with nothing to change
   SHALL say "Nothing to change" and write nothing.
2. It SHALL write the project config: root, base branch, checks, declared
   protected paths, the worktree helper hash after the person read it, and
   the landing setting.
3. For a GitHub repository under `pr` it SHALL: update the branch ruleset to
   require the named checks, adding only what is missing and never a second
   rule of the same kind; set the allowed merge methods; set the CI variable
   that tells CI an Avoozl run is landing; and post a commit status
   `avoozl/verify` on each head Avoozl verified (`createCommitStatus`, which
   today has no caller).
4. Setup SHALL NOT create task labels, a Project, task issue types or task
   issues. Spec issue publication SHALL be an explicit per-spec action,
   separate from approval. Setup SHALL preview trusted source repositories,
   optional forks and their push permissions separately from the target's
   landing permissions, without creating another workflow mode.

### Requirement 90: Worker machines pull work

Added 2026-11-15; changed the same day (owner add-on): worker machines pull
work through GitHub instead of receiving it over SSH. Design §4.26. Builds
on the runner role (Requirement 84) and on
`docs/research/machine-conductors-2026-11-13.md` (an issue with an
assignee as the queue, a pull request as the result), which so far ran only
on local-file stand-ins.

**User story:** As the owner, or one of a team, I want another machine to
take ready work by itself and hand back a branch that the scheduler checks
again before it lands, so that more machines add lanes without a second
plan and without trusting those machines.

#### Acceptance criteria

1. This machine SHALL be host `local`. Another machine SHALL run Avoozl in
   worker mode, which builds on the plan-less runner role
   (`src/app/remote-runner.mjs`): it holds no plans, and an envelope carries
   IDs only. The worker machine SHALL resolve the repository and the checks
   from its own `.avoozl.json`, so nothing it is sent is run as a command.
2. A worker machine SHALL read the commit from its worktree, run its checks
   and push the task branch. The scheduler SHALL then check the diff again
   (declared paths and protected paths, Requirement 86.6), run the checks
   again on the updated head, and land it through the landing queue
   (Requirement 87.5). It SHALL NOT trust the worker machine's result.
3. A worker SHALL pull minimal ready offers for authorized logins from
   the spec journal, then fetch qualified checkpoint refs. The driver SHALL
   derive readiness from the approved task graph and validated outcomes,
   not a second task graph on GitHub. Each offer SHALL carry only opaque IDs,
   digests and authorized references; at most one task per free lane.
4. A spec SHALL name one canonical claim-ref namespace. The driver SHALL
   atomically reserve a task there and acknowledge its selected worker with
   the current generation before work starts. A worker without write access
   SHALL request the reservation, not start optimistically. Creating the same
   named ref in another fork SHALL NOT claim the task; comments SHALL NOT be
   treated as compare-and-swap storage. A losing or over-cap request SHALL
   receive no acknowledgment and SHALL start no agent.
5. The same claim and acknowledgment rule SHALL apply to one person's
   machines and to teams. Fork locations SHALL NOT create separate pools or
   a solo/team mode. High-unblock tasks MAY remain on the driver's lanes.
6. Claim release SHALL be person-only, with generation-aware reconciliation
   of outstanding intents. A completed, verified result MAY settle its claim
   through the driver. Quiet, expired leases, lost connectivity and vanished
   chats SHALL NOT release a claim automatically. After `workers.claimStaleAfter`
   (default 24 h), Needs you SHALL offer person-only Release claim.
7. SSH push of an envelope (the runner mode of Requirement 84) SHALL stay
   only for a machine with no GitHub access.
8. `avoozl worker setup` SHALL preview the worker configuration, check
   login, allowed source/fork pushes and readable target repositories, and
   check the configured executor. Kiro Crew SHALL be required only for the
   `kirocrew` executor; a headless `process` worker SHALL work without it.
9. Host choice for the scheduler's own lanes SHALL be made in code by free
   lanes and load, with no chat in the loop.

### Requirement 91: Remove the Issue Radar path

Added 2026-11-15. Design §4.26.

**User story:** As the maintainer, I want the code for the path we left
removed, so that the app has one way to deliver work.

#### Acceptance criteria

1. Avoozl SHALL delete the code that only serves Issue Radar (about 5,900
   backend, 1,300 UI and 12,000 test lines), `verify-issue`, the provenance
   marker, the `avoozl-crew` agent and the Issue Radar grant, and the remote
   coder, the relay and the router chat with their agents.
2. Avoozl SHALL retain PR landing, release ranking, setup push plumbing,
   build receipts and the executor seam. It SHALL retire per-task projection,
   Project synchronization and task-issue completion only after the ordered
   binding migration and its proof (Requirement 102). Spec issue publication,
   epic links and journals SHALL remain. Export issues SHALL be the sole
   explicit offboarding path allowed to create task issues.
3. Leaf modules MAY be audited and already unreferenced ones deleted at any
   time. Task 45.2 SHALL wait for P52 to prove replacement PR landing.
   Tasks 45.2 and 45.3 MAY edit their shared callers. Remaining
   shared-module edits SHALL be made last, after Phases 40–44 have landed.
   (Changed 2026-11-18: the rule to wait for no other lane editing the same
   files is dropped.)
4. Every compatibility name that RC11.4 tests (the `plans_*` MCP
   names, `AVOOZL_*`, `AICOMMANDER_*` and `NUPP_WORKSPACE*` variables, the
   `aicommander` command and the `aicommander.*` settings) SHALL still
   resolve after the deletion.
5. A public Nupp setup SHALL land `direct` on the public `core-dev` branch
   from the start, with `scripts/worktree` as the helper and
   `scripts/test-changed` as the check. Its plans SHALL stay in a private
   planning workspace. The private mirror, forwarding and the leak scan of
   RC24–RC26 SHALL NOT be used for this setup; the pre-push content rule
   (Requirement 87.9) SHALL be its one leak guard. The freeze on public
   `core-dev` is lifted.
6. Who codes SHALL be removed (owner decision, 2026-11-18). The Avoozl
   worker SHALL be the only coder; the harness each role runs on (a Kiro
   Crew chat, Claude Code or Codex) is chosen in Settings › Models
   (Requirement 97). The repository `coder` setting, its default by mode,
   the Who codes picker and summary, the Radar coding tour, the Workflow
   map's Who codes step and every path that routes a task to an Issue
   Radar crew (the ready-label release and its queue, the crew's merge
   path and conflict fixes, the crew claim reconcile, the Radar source
   issue and its approval label, Radar flow rows) SHALL be removed.
   - A stored `coder` key SHALL be ignored silently: no warning, no
     migration, and the file SHALL still load. A test SHALL load a file
     that sets `coder: issue-radar`.
   - Every repository SHALL use the same Untriaged read; there SHALL be
     no Radar-coded read that lists only Radar labels.
   - Issue Radar SHALL stay an intake source only: GitHub intake (56.8),
     Radar escalations in Triage with Plan this and Deliver this (56.14),
     Radar back-links (44.6), With Issue Radar and Send to Issue Radar
     (Requirement 52), and Settings › Issue Radar with the labels Avoozl
     reads, the handoff labels, crew review rules, conflicts and merge
     method. A test SHALL show that a repository whose file still says
     `coder: issue-radar` feeds Triage and its Radar escalations.
   - The shared task projection and synchronization callers SHALL stay
     for 45.4 (criterion 2), less their coder handling.

### Requirement 92: Links to related GitHub items, and the landing queue

Revised 2026-11-17 (owner decision; design §4.27). Avoozl has no Issues or
Pull requests pages. It links from specs and in-flight work to the related
GitHub items instead, and shows what waits to land. Replaces the 2026-11-16
landing queue panel; task IDs 44.1–44.6 and P54 are reused.

**User story:** As a driver, I want each spec and task to link to its issue,
branch, pull request, checks and landed commit, so that I can reach the
GitHub item in one click without Avoozl copying GitHub's browser.

#### Acceptance criteria

1. Avoozl SHALL build one link set per spec and one per task, only from
   records it already stores: the spec issue and journal (Requirement 102),
   the spec working branch, the task branch and worktree, the task pull
   request and its check state from landing (Requirements 87 and 88), the
   landed commit from delivery records, and the intake issues a spec came
   from (Requirement 103).
2. Building, showing, filtering or refreshing link sets SHALL make no GitHub
   call. A counting-client test SHALL show the call count with link sets on
   equals the count without them.
3. Link targets SHALL be built from validated repository names, numbers,
   ref names and SHAs only, never from a URL read from issue or comment
   content. A missing record SHALL show as missing. Check state SHALL show
   its age, and state from a head that is no longer current SHALL NOT show
   as current.
4. The spec details panel SHALL have a **Links** box: the spec issue, the
   working branch, open pull requests with a check dot each, and the Issue
   Radar issues the spec came from.
5. The task details view, and the Graph modal that reuses it, SHALL have a
   **Links** box: branch, pull request, checks, landed commit and issue.
6. Each In flight row SHALL show small chips: `PR #N` with a check dot, and
   the branch.
7. Dashboards SHALL have a **Landing queue** page next to CI, not its own
   nav pill. It SHALL list what waits to land per target base, in landing
   order, and why each held item is held. It SHALL be usable at 390 and
   1280 px.
8. A spec SHALL show the Issue Radar issues it came from. The Radar issue
   SHALL get a link to its Avoozl spec only through the existing
   `crew:avoozl` intake status comment and the privacy-scanned journal, and
   only where the spec's visibility permits. Avoozl and Issue Radar code
   SHALL stay uncoupled: no Radar API, grant or import.
9. Every link to GitHub SHALL open in a new tab with `target="_blank"` and
   `rel="noopener noreferrer"`.
10. Public text SHALL follow the privacy rule (Requirements 102.12 and
    102.23–102.25):
    no host names, usernames, local paths or private spec references. A
    worktree path SHALL show only in the local app, never in a GitHub write.
11. Avoozl SHALL NOT have an Issues page, a Pull requests page or a
    dedicated SCM links page. Discussion and full browsing stay on GitHub.
12. Before merge, screen changes SHALL have phone and desktop, light and
    dark screenshots for owner approval.

### Requirement 93: Any harness runs the work; one executor seam

Added 2026-11-15 (owner plan: any harness runs the work, Kiro Crew stays the
only UI). Design §4.28. This seam comes before the worker rebuild of
Phases 40–45, so everything rebuilt there is harness-neutral.

**User story:** As the owner, I want Avoozl to start, message and watch a
worker through one small interface, so that I can run a task with any agent
harness without changing the loop.

#### Acceptance criteria

1. Avoozl SHALL start and drive every agent session through one executor
   interface:

   | Call     | Input                                                            | Output                                  |
   | -------- | ---------------------------------------------------------------- | --------------------------------------- |
   | `start`  | role, task, worktree, brief, model, permission class             | session ID                              |
   | `send`   | session ID, text                                                 | accepted or refused                     |
   | `status` | session ID                                                       | `working`, `idle`, `exited <code>`, or `gone` |
   | `stop`   | session ID (optional for an executor)                            | stopped                                 |
   | `usage`  | session ID (optional for an executor)                            | tokens and cost, when the harness has them |

2. Avoozl SHALL ship two executors. `kirocrew` SHALL hold today's
   Kiro Crew session calls from `kirocrew-app/crons/tick.py`; folders and
   project directories SHALL be its private detail, not part of the
   interface. `process` SHALL run an agent CLI as a child process in the
   task worktree (Requirement 95).
3. The tick SHALL stay a pure planner: it SHALL write session requests that
   name an executor, and each executor SHALL take only the requests that
   name it.
4. The interface SHALL carry no Kiro Crew word. A code path outside the
   `kirocrew` executor that names a Kiro Crew folder, project or agent file
   SHALL fail a test.
5. Default executor, settled by the owner: `process` with Claude Code for
   the Nupp compiler repository; `kirocrew` for Avoozl's own repository
   until the proof of Phase 47 passes. On `kirocrew`, the chat's trust mode
   SHALL be set again on every tick (Requirement 88.1), because an ordinary
   worker chat stalls unattended without it.
6. Moving today's calls behind the interface SHALL preserve existing
   behavior and keep the suite passing. Tests that assert the retired
   folder, project or agent fields in planner requests MAY change to assert
   the neutral request and executor behavior instead; their surviving
   behavior coverage SHALL be retained. Other existing assertions SHALL
   remain unchanged.

### Requirement 94: Harness definition files

Added 2026-11-15. Design §4.28.

**User story:** As the owner, I want to add a harness by writing one file
that I approve, so that a new agent CLI needs no code change.

#### Acceptance criteria

1. Each harness SHALL be one JSON file in the machine config (outside any
   repository), holding: its name; `start` and `resume` as argv lists; the
   permission value for write roles and for read-only roles; how to pass the
   model; and where to read cost (a file or an output field) when it has
   one.
2. Every command SHALL be an argv list of strings with named placeholders
   (`{worktree}`, `{brief_file}`, `{model}`, `{session}`). A shell string, a
   placeholder inside a shell operator, or an unknown placeholder SHALL be
   refused when the file is loaded.
3. A definition SHALL be approved by hash, as the worktree helper is
   (R83.4). A changed file SHALL not run until a person approves its new
   hash.
4. Permission for unattended children, settled by the owner: a write role
   SHALL use the harness's workspace-write sandbox, whose write roots are
   the task folder, the temp directory, and the cache directories the
   project config names (`sandbox.writeRoots`, for example a compiler cache
   such as sccache); a read-only role SHALL use its read-only mode.
4a. A task worktree's git directory lives in the main checkout
    (`git rev-parse --git-common-dir`), outside those roots, so a confined
    child cannot commit. The child SHALL only edit. Avoozl SHALL make the
    commit in the worktree after the child exits, from the changed files,
    and SHALL check the diff as Verify does (Requirement 86.6); it never
    trusts a worker's commit (Requirement 90.2).
4b. Loading a definition SHALL refuse any argv value that contains
    `bypassPermissions` or `danger-full-access`, or any flag that starts with
    `--dangerously-`, and SHALL name the value. A test SHALL load one
    definition with each and see it refused. The one exception is 4d.
4d. Inner sandbox under Avoozl's sandbox, settled by the owner on
    2026-11-17: a harness whose own sandbox cannot run inside Avoozl's (on
    macOS a nested `sandbox-exec` fails with `sandbox_apply: Operation not
    permitted`, so Codex can neither edit a file nor run a command) MAY set
    `permission.write` to exactly `danger-full-access`, its value for no
    inner sandbox. Avoozl SHALL then start such a child only inside its own
    sandbox, with the write roots of 4. WHEN no Avoozl sandbox is active
    THEN it SHALL refuse the session, opt-in (5) or not. Every other place
    and value of 4b stays refused, `permission.read` included, and tests
    SHALL show it refused without the Avoozl sandbox, allowed with it, and
    the other bypass values still refused.
4c. Each project SHALL have a command allow-list for unattended children
    (`sandbox.allowCommands`: its build and test commands), passed to the
    harness's allow setting, so a child does not stall on a prompt.
    `git push` SHALL never be allowed, and adding it SHALL be refused.
5. A harness that cannot confine writes to the worktree SHALL be refused for
   write roles, unless the owner opts in for that machine (person-only,
   recorded in Activity).
6. Retired.
6a. Plan quota: WHEN a harness on a plan login reports its quota as low
    (Requirement 72's `low` or `out`) THEN Avoozl SHALL start no new session
    on it; running sessions SHALL finish.
7. Adding a second harness SHALL need only its definition file: the proof of
   Phase 48 SHALL fail if any source file changes.

### Requirement 95: One supervisor per machine

Added 2026-11-15. Design §4.28.

**User story:** As the owner, I want one process per machine to own the
agent children, so that a child outlives a page reload and a backend
restart, and its exit is never lost.

#### Acceptance criteria

1. `avoozl supervisor` SHALL run once per machine and SHALL own every
   `process` child: its pid, exit code and log file. A second supervisor on
   the same machine SHALL exit and name the first.
2. The supervisor SHALL take only session requests for the `process`
   executor, start the child in its worktree with the approved definition,
   and record `status` from the child's state.
3. On a Kiro Crew machine the app backend SHALL start the supervisor. On a
   headless machine launchd or systemd SHALL start it, and it SHALL also run
   the tick there.
4. WHEN the supervisor restarts THEN it SHALL find its children again by
   pid and start time, and SHALL record a child it cannot find as `gone`
   (Requirement 88.4 applies).
5. Every child SHALL get the environment variable `AVOOZL_CHILD=1` with its
   session ID. The CLI SHALL refuse a person-only command in a child. This
   is a speed bump, not a guarantee: the child runs
   as the owner and could unset the marker, write the database or call `gh`.
6. "A child never does a person-only act" SHALL hold only through the
   sandbox: for a `process` child the workspace database, the GitHub and
   other credentials, and the Kiro Crew home SHALL be outside its read and
   write roots, and its network SHALL be off or restricted to what the
   project names. A harness that cannot do this SHALL be refused for
   unattended roles unless the owner opts in for that machine.
7. For a `kirocrew` chat, person-only refusal SHALL stay a speed bump, and
   the docs and Settings SHALL say so plainly.

### Requirement 96: One way to finish

Added 2026-11-15. Design §4.28.

Changed 2026-11-15 (owner correction): a sandboxed child cannot reach the
workspace database, so it cannot run `avoozl runner report`.

**User story:** As the owner, I want every worker, on any harness, to finish
in a way Avoozl reads the same, so that Avoozl reads one kind of result.

#### Acceptance criteria

1. A `process` child SHALL finish by writing a small result file,
   `.avoozl/result.json` in its task folder (`{"state": "done" | "blocked",
   "text": "..."}`, at most 8 KB), and exiting. The supervisor SHALL read the
   exit code and that file, and SHALL record the result. The brief SHALL say
   so as its last step.
2. A `kirocrew` chat and a person SHALL finish with
   `avoozl runner report TASK done|blocked` (with text for `blocked`), the
   CLI report of Requirement 88.2.
3. Avoozl SHALL match a result to its session by the supervisor's record or
   the worktree, SHALL make or read the commit in the worktree itself
   (Requirement 94.4a), and SHALL treat the result text as data.
4. A child that exits with no result file, an unreadable one, or a non-zero
   exit code with `done` SHALL be treated as `exited <code>`, and its task
   SHALL follow the retry path (Requirement 8).
5. `avoozl next`, `avoozl claim` and the report SHALL stay as the manual
   path for a person or a harness Avoozl does not start.

### Requirement 97: Role prompts as files

Added 2026-11-15. Design §4.28.

**User story:** As the maintainer, I want each role's prompt in one file any
harness can read, so that a role behaves the same on every executor.

#### Acceptance criteria

1. Each role's prompt SHALL live in `prompts/<role>.md` (worker, verifier,
   reviewer, planner, retro, watch, and the other roles Avoozl starts).
2. The Kiro Crew agent files SHALL be generated from those prompts at build
   time. A test SHALL fail when a built agent differs from its prompt.
3. Every role SHALL run on either executor.

### Requirement 98: Kiro Crew stays the only UI

Added 2026-11-15. Design §4.28.

Proposed change, 2026-11-18 (draft, not approved):
`.kiro/specs/standalone-web/` would let `avoozl serve` host this same page on
`127.0.0.1` only, for a machine with no Kiro Crew (SW1 to SW11 there). Kiro
Crew's page stays as it is. Until that spec is approved, criterion 5 stands
as written; on approval it changes as SW11.2 says.

**User story:** As the owner, I want to watch and steer every session in the
Avoozl page, whatever harness runs it, so that I never need another UI.

#### Acceptance criteria

1. In flight SHALL show a `process` session's status, the tail of its log,
   its cost when known, and a copyable attach command.
2. **Send message** on a `process` session SHALL queue a `send`.
3. Settings › Models SHALL set a harness and a model per role.
4. A task's `session` pin MAY name a harness.
5. A headless machine SHALL get only the CLI: `avoozl status` and
   `avoozl runner status --json`. Avoozl SHALL host no other UI.

Added 2026-11-18 (owner approval of the simplification audit, item 8 and
F7 in `docs/simplification-audit.md`): one roles table. Today a role's
model is picked in seven places, and the worker's is on Settings ›
Delivery while the others are on Settings › Models.

6. `.avoozl.json` SHALL hold one `roles` table with one row per role:
   `worker`, `falsifier`, `planner`, `planReviewer`, `retro` and
   `reviewDraft`. A row MAY set `harness` and `model`; the `worker` and
   `falsifier` rows MAY also set `agent`. A missing key or `auto` keeps
   that role's default.
7. Settings › Models SHALL be the only page that picks a role's harness,
   agent or model. Settings › Delivery SHALL keep only delivery choices.
8. Avoozl SHALL read the older keys into the table silently, with no
   warning: `models.<role>`, `harnesses.<role>`, `delivery.agent`,
   `delivery.model`, `delivery.investigate.agent`,
   `delivery.investigate.model` and `flow.retro.model`. A `roles` value
   SHALL win over an older key.
9. Saving Settings › Models SHALL write `roles` and remove the older keys
   of criterion 8 from the same file.
10. A task's `session` pin SHALL still win over its role's row. The
    existing checks SHALL hold against the table: a named plan reviewer
    model differs from a named planner model, and a review role with
    `distinctFrom: model` needs a named worker model that differs from its
    own.

### Requirement 99: Cross-model plan review

Added 2026-11-15 (owner request). Design §4.29. This adds to Requirement 4.1
and Requirement 5.3: the planner's critique stays, and this review runs on a
different model beside it. Settings › Models is RC11.9 in
`.kiro/specs/radar-coder/`.

**User story:** As the owner, I want every spec draft read by a second model
before I approve it, with what it found and what the planner did about it
in front of me when I approve, so that one model's blind spots do not reach
the task graph unchecked.

Facts. Spec drafting uses one planner chat. Settings › Models has one model
per role (`planner`, `driver`, `retro`, `reviewDraft`) in
`src/app/chat-models.mjs`; a role left out or `auto` runs on its agent's own
model. The only check on another model today is the falsifier
(Requirement 75), which runs only for Avoozl's own workers. Plan review
threads (`review_threads`, `plan.review.submit`, `plans_submit_review` in
`src/app/plan-reviews.mjs`) are already keyed by plan and revision hash,
and a run bound to a review may submit only for its own plan revision.

#### Acceptance criteria

1. Settings › Models SHALL have a **Plan reviewer** role, saved as
   `models.planReviewer` in `.avoozl.json`. Its value SHALL be a model name;
   `auto` SHALL mean no reviewer model is set. Validation SHALL refuse a
   `planReviewer` equal to a named `planner`.
2. A review SHALL run only WHEN Avoozl can show that the reviewer's model
   differs from the model that wrote the revision. The writer's model SHALL
   be the model Kiro Crew reports for the drafting chat, or, for a revision
   the planner chat made, the planner's reported model. WHEN the reviewer's
   model is not set, the writer's model is unknown, or the two are the same
   THEN Avoozl SHALL NOT start the review, SHALL mark the revision
   **Review skipped** with the reason in plain words, and SHALL NOT run it on
   the same model. A person MAY press **Review anyway** on an unknown writer
   model; the round SHALL then record that the difference was not shown.
3. WHEN a draft revision is stored (a planner chat, a Spec Builder import,
   From a goal, or a reload of an edited folder) and `planReview.mode` is
   `auto` THEN the tick SHALL open one read-only reviewer chat on the
   reviewer's model for that exact revision. The chat SHALL read the spec
   folder at that revision and a clean worktree of each repository the
   task facts name, at the commit Avoozl records. Its only write SHALL be
   its findings for its own plan revision.
4. The reviewer's brief SHALL hold the spec files, the other specs in the
   planning repository, and the code as data, not instructions, and SHALL
   ask for these kinds of finding: `gap` (a need with no criterion or task),
   `untestable` (a criterion no check or proof can show), `wrong-reference`
   (a file, function, route or setting the code does not have, checked
   against the code), `hidden-order` (an order stated in prose with no
   `after` fact), `too-big` (a leaf that will not fit in one pull
   request), and `conflict` (a clash with another spec). The brief SHALL
   pass content rules at the `brief` boundary.
5. Each finding SHALL have a kind, a severity (`blocking`, `important`,
   `suggestion` or `question`), a file of the revision, a line, a claim and
   its evidence. A `wrong-reference` finding SHALL name the path and commit
   it read, or the search that found nothing. Avoozl SHALL refuse a finding
   whose file is not in the revision or whose line is out of range, and
   SHALL refuse findings from a session whose reported model equals the
   writer's.
6. Findings SHALL be stored per plan and revision hash. A revision with a
   new hash SHALL get a fresh review, except a revision the planner made in
   answer to the last round of the same pass. Findings of an older hash
   SHALL stay readable and SHALL be shown as about an older revision.
7. After each round the planner chat SHALL get the findings as data and
   SHALL answer each one as `fixed` (naming the revision hash it wrote) or
   `answered` (with its reason). WHEN `planReview.rounds` (default 1,
   allowed 1 to 3) allows another round and the planner wrote a new
   revision THEN the reviewer SHALL review that revision, with the earlier
   findings and answers as data. A pass SHALL end after its last round.
8. The Approve dialog, for one spec and for a batch, SHALL show for each
   spec: reviewed by which model and at which revision, how many findings
   were found, how many were fixed, and how many are for the person, and
   SHALL list each open finding with its file, line, claim, evidence and
   the planner's answer. It SHALL also show Review skipped, Review running,
   Not reviewed, and Reviewed at an older revision. A person MAY close a
   finding as resolved, accepted, rejected or deferred.
9. A review SHALL NOT approve, SHALL NOT block approval, and SHALL NOT write
   to GitHub. A plan with open findings, a skipped review or a running
   review SHALL approve exactly as it would with none. Approval SHALL stay
   person only.
10. `planReview.mode` SHALL be `auto` (default), `ask` or `off`. With `ask`,
    each new draft revision SHALL get one Needs you item with **Review** and
    **Skip**. With `off`, no reviewer chat SHALL start and nothing else
    SHALL change.
11. `avoozl plan review SPEC` SHALL print the review of the spec's current
    revision; `--start` SHALL start one (a person only, as Review anyway
    does), and `--json` SHALL print it as JSON. The planner SHALL read
    findings through an MCP tool and answer them through another; the
    reviewer SHALL submit through `plans_submit_review`.
12. Each reviewer and planner-answer chat SHALL count in Flow under
    **Planning** for its spec: time and usage by role and model. These
    SHALL NOT count toward any task's flow time.
13. Source and tests SHALL NOT name a model or provider. Tests SHALL use
    fake chats and fake model names.

### Requirement 100: Retrospectives catch steady CI waste

Added 2026-11-15 (owner request). Design §4.30. This adds to Requirement 47
and Requirement 48: the outlier triggers of Requirement 47.1 stay, and these
triggers and findings run beside them.

**User story:** As the owner, I want the retrospective to notice CI time
that is spent the same way on every pull request, such as the full test
matrix on a spec-only change or two runs of one workflow on one commit, so
that waste which is the usual case is caught, not hidden by the median.

Facts. On 2026-11-15 every Avoozl pull request, spec-only ones included, ran
the full test suite on Linux, macOS and Windows, and the test workflow ran on
both `push` and `pull_request`, so each pull request ran it twice. No
retrospective fired. That work ran in chats that were not Avoozl tasks, so
the workspace had no `flow_spans` rows and no `flow_retros` rows. The CI
trigger in `src/app/flow-retro.mjs` (`triggers`) fires only when one CI wait
passes `flow.retro.slowFactor` times the repository's median CI wait (or 30
minutes with fewer than 5 samples), so a cost that every pull request pays
is the median and never fires. The retro brief has no field for what a pull
request changed or for repeat runs. `openPullRequests` in
`src/app/github.mjs` already reads every open pull request of a repository
in one GraphQL query per check.

#### Acceptance criteria

1. For each pull request in a repository the workspace names, Avoozl SHALL
   record its changed files as classes: `code`, `tests`, `spec`, `docs`,
   `ci` and `other`. The paths SHALL come from the existing open pull
   request read with no extra call. Each class SHALL have a default list of
   globs, and `flow.ci.classes` in `.avoozl.json` (workspace or repository,
   the repository's list winning) MAY replace a class's list. A path SHALL
   take the first class that matches in the order `ci`, `spec`, `tests`,
   `docs`, `other`; a path that matches none SHALL be `code`. WHEN GitHub
   lists only part of a pull request's files THEN the pull request SHALL
   also count as `code` and SHALL be marked partial.
2. Avoozl SHALL count workflow runs per head commit per workflow. WHEN a
   workflow has more than one run for the same commit THEN Avoozl SHALL
   record a **repeat run** finding naming the repository, the workflow
   file, the commit, the number of runs, their events (such as `push` and
   `pull_request`) and the CI minutes of the extra runs. A re-run attempt of
   the same run SHALL NOT count as another run.
3. Avoozl SHALL start a retrospective on a **steady waste** trigger over the
   last `flow.ci.windowDays` days (default 7) for a repository, WHEN either
   (a) the CI minutes spent on pull requests whose classes are all `spec` or
   `docs` pass `flow.ci.docsOnlyMinutes` (default 60), or (b) at least
   `flow.ci.minPullRequests` (default 5) pull requests closed in the window
   and their CI wait is more than `flow.ci.waitShare` (default 0.4) of their
   lead time. A repeat run finding SHALL also be a trigger. Each SHALL fire
   at most once per repository, kind and window. These triggers SHALL NOT
   wait for the one-hour spike gap of Requirement 47.2. The outlier triggers
   of Requirement 47.1 SHALL stay unchanged.
4. These counts and triggers SHALL cover every pull request in the
   workspace's repositories, not only Avoozl tasks, because people and other
   chats share the same CI. A retrospective SHALL run on these triggers with
   no finished tasks. The brief SHALL label each pull request `task` (with
   its task ID) or `other` (with its number and author only), and SHALL NOT
   hold the title, body, comments or transcript of an `other` pull request.
   Avoozl SHALL NOT read the transcript of any chat it did not open.
5. The brief SHALL hold, per repository: CI minutes by class, the CI wait
   share of lead time, the repeat run findings, and the workflow file of
   each run. The retrospective MAY propose a CI change as a `plan` proposal
   that names the repository, the workflow file and the change in words.
   Approving it SHALL open a planner draft for one new task, as for any plan
   proposal (Requirement 47.6). The retrospective SHALL still only propose.
   A new metric, **CI minutes per pull request**, SHALL be measured by class;
   its PDCA check (Requirement 47.7) SHALL compare the last
   `flow.retro.everyTasks` closed pull requests of that repository and class
   before the change with the same number after it.
6. Avoozl SHALL make no GitHub call for this beyond the existing open pull
   request read per check and at most one workflow runs read per repository
   per check. The workflow runs read SHALL send the cached ETag, so an
   unchanged answer is a not-modified reply. Each call SHALL go through the
   existing GitHub client and its rate counters.
7. The Flow tab SHALL show CI minutes by class, task and other, and the
   repeat runs with their workflow, commit count and extra minutes. Settings
   › Flow SHALL edit `flow.ci.windowDays`, `flow.ci.docsOnlyMinutes`,
   `flow.ci.waitShare` and `flow.ci.minPullRequests`, and SHALL show the
   class globs read-only. These are screen changes: the task that builds
   them SHALL ship before and after screenshots (phone and desktop, light and
   dark) for the owner's approval before it merges.
8. With no GitHub repository in the workspace, Avoozl SHALL make no read
   for this and SHALL show **No pull requests read** in the Flow tab.

### Requirement 101: Every build receipt, and a build breakdown for retrospectives

Added 2026-11-16 (owner request). Design §4.31. This adds to Requirement
RC32 of the radar-coder spec (kept by Requirement 86.9), Requirement 47 and
Requirement 100. RC32's wrapper, cold or warm check and counters parser stay.

**User story:** As the owner, I want Avoozl to keep every build and test
record a pull request's CI writes, failed attempts included, and to hand the
retrospective a repository's own breakdown of where build time goes, so
that the costliest step is visible and a change is judged only against
builds that did the same work.

Facts. `parseReceipt` in `src/app/build-receipt.mjs` keeps only the last
line of a JSONL file. `receiptReader` in `src/app/build-receipt-read.mjs`
lists artifacts named exactly `build-receipt` and takes the first one whose
run matches the head commit, so one pull request keeps one receipt. The CI
workflow uploads that artifact from the Linux job only, because artifact
names must be unique within a run. The receipts are kept in one metadata
value with one receipt per pull request, and they are read from
`radar-flow.mjs`, only for repositories whose coder is Issue Radar. The
retrospective brief has no build data.

#### Acceptance criteria

1. **Every record.** For each merged pull request in a repository with
   `buildReceipts` on, Avoozl SHALL read every artifact whose name is
   `build-receipt` or starts with `build-receipt-`, from every workflow run
   on the pull request's head commit, failed, cancelled and re-run attempts
   included, and SHALL parse every line of each file. A line that does not
   parse SHALL be skipped and counted; the other lines SHALL be kept.
2. **Observations.** Each line SHALL be stored as its own observation,
   keyed by repository, head commit, workflow run, task, attempt, command,
   target and its order among lines with the same key. A failed attempt (a
   non-zero exit, or a line from a run that failed) SHALL be kept and marked
   failed. A version 1 line without the new fields SHALL still parse.
3. **Wrapper.** `bin/build-receipt` SHALL also record `task` (from `--task`
   or `AVOOZL_TASK`), `attempt` (from `--attempt`, `AVOOZL_ATTEMPT`, or
   `GITHUB_RUN_ATTEMPT`, else 1) and `phase` (from `--phase`, else the
   command). The CI job SHALL upload its file on every platform as
   `build-receipt-<target>`, and the job summary SHALL show every line.
4. **Summaries.** Flow SHALL show, per pull request, the total build time,
   the time per phase summed over targets, and the costliest phase. Medians
   per phase, target and cold or warm SHALL use every successful
   observation. Failed attempts SHALL count in a pull request's total and be
   shown apart, and SHALL NOT enter the success medians. Trace SHALL show
   every observation on the merged step, grouped by phase. A before and
   after comparison (PDCA, Requirement 47.7) SHALL compare one phase,
   target and cold or warm at a time, over every matching observation.
5. **Calls.** Avoozl SHALL make at most one artifact list call per
   repository per check, sent with the cached ETag so an unchanged list is a
   not-modified reply, and one download per artifact it has not read before.
   A read artifact SHALL cost 0 on every later check. A merged pull request
   whose head commit runs are all complete and have no receipt artifact
   SHALL be remembered as having none. Each call SHALL count under `receipt`
   in the GitHub usage counter.
6. **Not tied to Issue Radar.** Receipts SHALL be read in the tick's CI step
   for every repository with `buildReceipts` on, so the
   reader survives the removal of Phase 45.
7. **Report format.** Avoozl SHALL define a documented, versioned build
   report, `avoozl.build-report` version 1, with: `workload`, `engine`,
   `target`, `toolchain` (a toolchain or seed ID), `cache` (the cache mode),
   and a `costs` object of milliseconds for `build`, `provisioning`, `cache`
   and `test`, plus optional `parts` and `counters`. A repository SHALL name
   where its reports are in `receipts.report` of `.avoozl.json`: a field
   inside each receipt line, or an artifact name prefix. A report with an
   unknown version or a missing field SHALL be skipped and counted, never
   guessed.
8. **Repository neutral.** A small adapter SHALL turn a report into a
   breakdown observation. Profiling, budgets and limits SHALL stay in the
   repository that writes the reports; Avoozl SHALL only store, show and
   compare. Avoozl source, tests and fixtures SHALL NOT name any real
   repository's workloads, engines, targets, paths or tasks.
9. **Comparable.** Two breakdowns SHALL be compared only when `workload`,
   `engine`, `target`, `toolchain` and `cache` are all present and all
   equal. A breakdown missing any of them SHALL be compared with nothing.
10. **Retro brief.** The retrospective brief SHALL hold a `builds` field per
    repository: per pull request the costliest phase from receipts, and per
    comparison key the count, the latest and median cost of each cost and
    part, and the costliest part. A retrospective MAY propose a `plan`
    proposal that names the repository, the comparison key and the part.
    The metric **Build part minutes** SHALL compare only breakdowns with the
    proposal's key; with fewer than `flow.retro.everyTasks` on either side,
    PDCA SHALL say **Not enough comparable builds** and give no verdict.
11. A repository with no reports SHALL behave as today: no `builds`
    breakdown, no extra call, and an unchanged brief apart from receipt
    phases. A repository with `buildReceipts` off SHALL make no call for
    this.
12. The Flow and Trace changes are screen changes: the task that builds
    them SHALL ship before and after screenshots (phone and desktop, light
    and dark) for the owner's approval before it merges.
13. **Tests** on a fake GitHub SHALL cover: a pull request with several
    phases on 3 platforms keeps every record; a failed attempt is kept; the
    costliest phase shows in Flow; one list per check and one download per
    new artifact; mismatched keys are never compared; a retro brief includes
    the breakdown; a repository with no reports behaves as today.

### Requirement 102: Working branches and a spec journal

Added 2026-11-16 (owner pivot). Design §4.32. Implementation is pending;
this revision does not approve or start any real workspace or live proof.

**User story:** As a spec owner or contributor, I want pushed work and a
minimal journal to survive handoff, including work on forks, without one
GitHub issue per task or exposing private planning information.

#### Acceptance criteria

1. Git SHALL hold design and implementation; the spec issue SHALL hold
   ownership and durable outcomes; SQLite SHALL cache local execution.
   There SHALL be one issue per published spec and epic, never per task,
   except the explicit, idempotent offboarding export in criterion 19.
2. Publish issue SHALL be an explicit per-spec act in its home repository,
   independent of approval. Approval alone SHALL make no GitHub write.
   A fork checkout SHALL NOT move the registered issue home or require fork issues.
   Local-only use SHALL keep the same journal protocol in a local file.
3. Outcomes SHALL bind spec/task identity, approved revision, task-definition
   digest and exact evidence. Only the latest valid `landed`, `done` or
   `skipped` SHALL complete; `refused`, `reopened`, `landed-unverified` and
   stale outcomes SHALL hold successors. A new approval MAY explicitly carry
   forward unchanged definitions with valid evidence; it SHALL NOT silently
   accept changed definitions. Packages SHALL derive completion from children.
4. Unfinished checkpoints SHALL release nothing. Verified integrations on
   the spec working branch MAY release in-spec successors only with the exact
   prerequisite code available in every repository they need;
   cross-spec successors SHALL require accepted landing or person outcomes.
   Branch checkmarks SHALL be labeled progress, not canonical completion,
   and excluded from the approved definition hash.
5. A trailer SHALL be a pointer, not proof. `landed` SHALL require verified
   intent evidence plus actual landing, or path/check/review re-verification
   at the landing commit. Missing evidence SHALL yield `landed-unverified`
   and person-only disposition; a revert SHALL open Needs you.
6. Each spec SHALL have one active working head per affected repository,
   and task checkpoint refs for unfinished work. Every reference SHALL
   identify source repository, branch and exact commit separately from target
   repository/base. Avoozl's driver SHALL create and serialize verified
   integrations; sandboxed agents SHALL receive no push credentials.
7. Fork heads SHALL work without copying branches upstream or another mode.
   Discovery SHALL use PR head repository/ref/SHA, or an owner-authorized
   pre-PR journal reference. Fetches SHALL use trusted registered repositories,
   verify source/target relationships and exact commits, and never turn issue
   prose into clone URLs, commands or local paths. Local clone/worktree choice
   SHALL NOT affect repository identity or permissions.
8. Source push rights SHALL be separate from target merge rights. Fork
   contributors MAY checkpoint without upstream write access; an authorized
   maintainer MAY merge while Avoozl observes. Reviews, required checks and
   fork CI permissions SHALL remain the target repository's rules.
9. Journal records SHALL be compact significant transitions, batched where
   useful, not poll snapshots. They SHALL cover outcomes, verified handoff
   heads, approvals, controls, generations, claim acknowledgments and intents.
   Stable operation IDs SHALL deduplicate retries; conflicting duplicates
   SHALL hold affected state. Replay SHALL paginate, validate authenticated
   authors/authority, digests and generations, and order by comment ID.
10. Records SHALL link previous comment ID and payload digest. Mutation or
    missing linked records SHALL hold affected state. An unobserved deleted
    tail cannot be detected from comments alone; reconstruction SHALL remain
    held and reconcile git/GitHub facts. Comments SHALL NOT be an immutable
    audit log or compare-and-swap lock.
11. An explicit visibility-aware schema SHALL allow only protocol/event kind,
    opaque identifiers, the acting machine's public alias (criterion 24),
    generations, previous-record links, revision/definition
    digests, authorized public refs, outcome/control flags and minimal check
    references on public surfaces. It SHALL reject private spec/task/repository
    names or URLs, absolute paths, host/workspace/database identifiers, command
    arguments, environment values, transcripts, raw output and private spend.
    Hidden HTML SHALL have the same visibility as the issue.
12. Privacy checks SHALL precede every external journal/intake/PR/status write
    and every checkpoint or landing push, including outgoing messages and refs.
    Private plans and their marks/journal SHALL stay private; a private issue
    MAY name a public PR, never the reverse. Sensitive control detail SHALL
    travel in a private handoff; reconstruction SHALL report unavailable
    budgets as unknown and stay held, never zero them.
13. Driver takeover SHALL be person-only for the authorized issue owner and
    advance a generation. Every landing SHALL write and read back an intent
    naming exact candidate/range, expected base, task definitions and evidence.
    Landing SHALL use a guarded ref update or head-guarded PR merge. A new
    driver SHALL hold outstanding intents until reconciled or safely voided.
    Concurrent ambiguous takeovers SHALL hold dispatch. Preauthorized work
    may still land after takeover on an unchanged base: deduplication SHALL
    promise one effective outcome, not exactly-once execution.
14. Each spec SHALL use one canonical claim namespace across all forks.
    The driver SHALL reserve before acknowledgment and revalidate its current
    authority and controls before dispatch/landing. Fork-local duplicate refs,
    quiet workers and elapsed leases SHALL grant no claim or takeover rights.
15. Landing portions SHALL name exact commits/tasks, not the latest mutable
    branch head. Only verified work SHALL enter the spec working branch.
    Direct trains MAY combine up to four tasks for one driver; protected PRs
    SHALL land separately with checks/reviews for their own heads. Base moves
    SHALL merge back without force push. The integration lock SHALL cover
    only guarded ref movement/push, not checks or agent work.
16. Rebuild SHALL fetch qualified heads, replay validated records and reconcile
    landings and intents, then hold until a person reviews and resumes.
    Unavailable private controls, inaccessible/deleted forks and changed heads
    SHALL remain unresolved rather than completing or redispatching work.
17. Git content/hash refresh and journal/ownership/controls/review/check refresh
    SHALL be independent. Conditional requests or available webhooks SHALL
    avoid full unchanged replay. An unchanged spec SHALL not be reparsed;
    unchanged branch heads SHALL not suppress control or ownership changes.
18. Epic lifecycle rows SHALL derive design (draft submitted for approval),
    review (verified current-revision approval), and implement (all current
    leaves/person outcomes accepted, none stale/refused) from member specs.
    Approval evidence SHALL retain requester, real approving reviewers,
    merger, merge commit and merge time; retain the existing merge-commit
    re-hash. Avoozl SHALL honor repository review policy, adding no universal
    second-reviewer rule. Public PRs SHALL reference the spec issue only when
    visibility permits. Code reviewers SHALL use configured spec reviewers
    or CODEOWNERS and repository policy.
19. Intake SHALL accept GitHub items. A bounded fix MAY use its issue and a
    compact acceptance definition without a full spec; coordinated changes
    SHALL use a proportionate spec. Reuse the input as spec issue only when
    home/visibility match. Initial intake SHALL make at most two idempotent
    writes: an ownership label and a privacy-safe status comment. Deliver this
    alone MAY use same-repository Fixes; input closure SHALL mean withdrawal,
    not task completion. Export issues SHALL preview, create only incomplete
    task issues and their blocked-by links once, then mark the spec Exported
    and cease driving it. Existing bindings SHALL not be duplicated on retry.
20. Migration SHALL hold release and stop ticks, disable task projection/close
    reconciliation, preview and retire issue bindings without status changes,
    run one tick with unchanged readiness and no task-issue reads/writes, then
    and only then allow closing obsolete task issues. Spec issues SHALL remain.
    `route: github` and `merged-pr` SHALL retain their accepted source syntax,
    meaning queue landing and accepted landing, without rewriting approved files.
21. Private mirror sync SHALL import upstream changes by a reviewed PR after
    divergence, rather than stopping forever at the first private commit.
    Forwarding SHALL recognize import ancestry and propose no re-export of it.
22. Scratch-repository proofs SHALL exercise checkpoint recovery, fork PR
    landing without an upstream source branch, privacy rejection, replay,
    mutation/duplicate handling, takeover before push, migration and held
    recovery. Tests or stand-ins SHALL NOT tick live proofs. Real workspace,
    second-machine, screenshot, settings and private pilot approvals SHALL
    remain owner actions; implementing this plan SHALL NOT perform them.
23. No public Avoozl write on GitHub SHALL expose internal information. This
    covers journal records, spec and epic issue bodies, status and intake
    comments, pull request bodies and check summaries. Internal information
    is host, server and machine names, usernames, local and home paths,
    internal URLs and hostnames, IP addresses, crew, instance and session
    IDs, gateway ports and session keys.
24. A record that says which machine or driver acted SHALL use that
    machine's public alias. The owner picks it per machine (for example
    "Draco"); it is stored in machine config, and only the private handoff
    maps it to the machine. The schema SHALL have an alias field and no
    hostname field. An unset alias SHALL default to a neutral generated
    name stored on first use, never derived from the hostname or username.
    Settings SHALL refuse an alias that contains this machine's hostname or
    username.
25. The privacy scan (56.11) SHALL refuse, before the first write: hostname
    and IP literals; internal domains (`*.corp`, `*.internal`, `*.local`,
    `*.lan`, and a private, machine-local list of internal domains the
    owner keeps); home paths (`/Users/<name>`, `/home/<name>`,
    `C:\Users\<name>`, `~/`); and this machine's own hostname and username.
    Tests SHALL insert a made-up hostname and username into every public
    field and expect refusal with nothing written.
26. A held journal SHALL be restored only by a person's reanchor record:
    it names the held record IDs and the reviewed tail (record ID and
    digest), and only a person with write access may write it. Replay
    SHALL ignore the named records' contents and continue from the
    reanchor; a hold on any record it does not name SHALL stay. Reanchor
    SHALL NOT edit or delete any comment, SHALL NOT grant approval or
    completion, and the spec SHALL stay held until a person's Resume.

### Requirement 103: Issue Radar stays off Avoozl's issues

Added 2026-11-16 (owner decision). Design §4.32.11. Planning only. Extends
Requirement 102. Where they conflict it supersedes Requirement 52.7 and,
in `radar-coder`, the hand-over of projected issues (RC1.6, RC2) and the
claim at approval (RC19). Phase 45 is no longer paused: 45.2 landed in #509; 45.4 waits on P53, P54 and P66.

The owner's words: Issue Radar should not take on Avoozl-created issues.
It can take on maintenance and triage, and can punt an issue to Avoozl to
turn it into a spec-driven fix.

Facts checked in Kiro Crew's Issue Radar crew brief (`crew_brief.md`, Kiro
Crew main, 2026-11-16): selection drops any issue that already carries a
label starting `crew:`, and an empty label scope makes every open issue a
candidate. A crew writes only the claim label `crew: in progress` and the
repository's needs-human label (default `crew: needs human`). A scope-gate
pass (`architecture`, `new-feature`, `needs-design`, `breaking-change`)
stays skipped. Removing the needs-human label is how a person hands a
needs-decision or needs-investigation issue back to a crew. A claim counts
as dead only with a claim marker whose version the crew understands. The
skip is a rule in the crew's prompt, not code.

#### Acceptance criteria

1. Every GitHub issue Avoozl creates SHALL carry the `crew:avoozl` label
   in its create call: spec and epic issues at publication, sub-issues
   created under an epic, intake-owned issues, mirror follow-up and
   conflict issues, task issues projected before retirement, and any create
   path added later. Avoozl SHALL NOT add it by a later label edit. The only
   exception is criterion 6.
2. The label SHALL be added in one place, the GitHub client's issue create
   call, for both its REST and GraphQL forms, so a new caller cannot miss
   it. Only the export path SHALL opt out, by name. A test SHALL fail when
   any `createIssue` call in `src/` opts out other than export, and a
   fake-GitHub test SHALL check that each create path's request carries the
   label and that no create is followed by a label edit.
3. `crew:avoozl` SHALL be Avoozl's ownership label, never read as a crew's.
   Untriaged and the plan-me hand-off SHALL leave out issues that carry it.
   Settings SHALL refuse it as the name of any other label: ready, planning,
   claim, needs-human, a trigger rule's label or a Send to Issue Radar label.
4. Until issue-binding retirement (56.5) has run, Avoozl SHALL add no Radar
   ready or scope label to any task issue it projected, and SHALL write no
   Radar claim label or claim marker at approval, in any repository.
   Avoozl's executor SHALL run those tasks as it does elsewhere. Radar
   intake code and settings SHALL stay (Requirement 91.6).
5. Because an empty-scope crew takes any open issue without a `crew:`
   label, Avoozl SHALL add `crew:avoozl` once to each open task issue it
   projected that carries no `crew:` label, after a preview a person
   confirms, through the write pacer, and idempotently on retry. An issue a
   crew already claimed SHALL be left alone and shown once in Needs you.
   Avoozl SHALL NOT remove a crew's claim or needs-human label.
6. Export issues (56.9) SHALL NOT set `crew:avoozl` on any issue they
   create (owner decision, 2026-11-16). Export hands the work away from
   Avoozl, so Issue Radar and people may take those issues. A test SHALL
   check that no export create request carries `crew:avoozl`.
7. Radar SHALL keep maintenance and triage of issues Avoozl did not create.
   Send to Issue Radar (Requirement 52) SHALL stay for those issues and
   SHALL refuse an issue that carries `crew:avoozl`.
8. A crew punts an issue to Avoozl with the repository's needs-human label
   (`crewLabels.needsHuman`), the only escalation it can write. Avoozl
   SHALL keep the plan-me path: the trust check, scope-gate skips to
   Intake, other scopes to Needs you, untrusted issues left alone. It SHALL
   list trusted escalations first in Untriaged with **Plan this** and
   **Deliver this**,
   and the Needs you row for one SHALL offer the same two buttons. Plan this
   SHALL draft a proportionate fix spec or the compact bounded-fix
   acceptance of Requirement 102.19.
9. Only a person SHALL press Plan this or Deliver this for an escalation.
   A per-repository escalation rule, off by default, MAY draft the plan
   when the needs-human label appears. The draft SHALL write nothing to
   GitHub, and approval and dispatch SHALL stay person-only. The rule is
   not a trigger rule, so Requirement 52.9 stands.
10. Taking an escalated issue into Avoozl SHALL apply `crew:avoozl` as one
    of intake's two writes (Requirement 102.19) so crews skip it. Avoozl
    SHALL NOT remove the needs-human label, because removing it hands the
    issue back to a crew; a person MAY clear it afterwards. When the issue
    carries a live crew claim, Plan this SHALL say so and ask the person to
    confirm.
11. None of this SHALL tie Avoozl's code to Radar. Avoozl reads labels,
    comments and the plan-me scope from GitHub only, calls no Radar API and
    needs no Radar grant.
12. Tests SHALL cover: every create path labeled (2); no ready label, claim
    or marker for a projected task (4); backfill preview, pacing, retry and
    the claimed-issue skip (5); unlabeled export (6); escalation order,
    buttons, person-only start, and an auto-draft with zero GitHub writes
    (8, 9); one label write on take-over and no needs-human removal (10).

### Requirement 104: Review findings the owner can read and decide

Added 2026-11-16 (owner request). Design §4.33. Planning only. Extends
Requirement 99. Where they conflict it supersedes Requirement 99.5 (the
four severity values and the single line) and Requirement 99.8 (closing a
finding from the Approve dialog). Requirement 99.9 holds unchanged: a
review never approves, never blocks approval, and never writes to GitHub.

The owner's words, in short: each finding has a severity that sets its
border color (grey, yellow, red) and sits in its own section; clicking a
finding shows the line it refers to; better, a view of the rendered spec
with a right-hand rail listing each finding next to its line; buttons per
finding (resolve, accept, reject, defer); and a link to open the review
chat itself. He also asked whether this is meant to be the review process,
and whether it repeats. It is, and it does (criterion 14).

**User story:** As the owner, I want to read each review finding next to
the spec text it is about, see what the planner did with it, and decide
the rest with one click each, so that a review round ends with every
finding either fixed, answered, or decided by me at a known revision.

Facts. Phase 53 is built (53.1–53.5). Spec findings are `review_threads`
rows with `source: "plan-review"` and `kind`, `severity` (`blocking`,
`important`, `suggestion`, `question`), `file`, `line`, `claim`,
`evidence` and `answer` (`src/app/plan-reviews.mjs`,
`src/app/plan-review-answers.mjs`). `plan.review.dispose` closes a finding
as resolved, accepted, rejected or deferred; it records no revision, does
not reach the planner, and is not person-only in `src/app/mcp-policy.mjs`.
`kirocrew-app/ui/src/PlanReviewSummary.tsx` lists open findings inside
both Approve dialogs. `plansClient.approve` in
`kirocrew-app/ui/src/plans-api.ts` throws "This revision changed. Reload
it before approving." when the hash moves while the dialog is open. Text
plan threads already anchor on an exact quote (`lineFor` in
`plan-reviews.mjs`). Spec files render through `Markdown.tsx` in one card
per file on the spec page.

#### Acceptance criteria

1. Each finding SHALL have a severity of `info`, `warn` or `blocker`,
   shown as a grey, yellow or red border and as a text label, so color is
   never the only sign. Stored Requirement 99 values SHALL read as
   `blocking` → `blocker`, `important` → `warn`, and `suggestion` and
   `question` → `info`. A `blocker` SHALL NOT block or delay approval.
2. Each finding SHALL have a category (one of the six kinds of
   Requirement 99.4), an anchor, a body (its claim and evidence), and the
   planner's response, if any.
3. An anchor SHALL be the file of the reviewed revision, a line range,
   the exact quoted text (at most 500 characters), and a quote hash
   (SHA-256 of the quote with whitespace runs collapsed to one space).
   Avoozl SHALL derive the line range from the quote and SHALL refuse a
   finding whose quote does not occur exactly once in that file at that
   revision.
4. WHEN a finding is shown against a later revision THEN Avoozl SHALL look
   for the same collapsed quote in the same file. Found once, the finding
   SHALL show at the new lines. Found zero or more than once, it SHALL
   show **Moved or removed** with its original file, lines and revision.
   This SHALL be worked out on read and SHALL NOT change the stored
   anchor.
5. A finding's state SHALL be one of: `open` (no response yet), `fixed`
   (the planner named a revision it stored), `answered` (the planner gave
   a reason), `for you` (no round or planner turn is running, it is not
   fixed, and no person has decided it), `accepted`, `rejected`,
   `deferred` or `resolved`. A person's actions SHALL be **Accept** (agree;
   the planner must fix it in its next revision), **Reject** (dismiss, with
   a reason), **Defer** (keep as a follow-up) and **Resolve** (mark done),
   plus **Reopen** to undo the last one. Each action SHALL be appended to
   the finding with who, when, the revision hash on screen, and the note.
   An accepted finding SHALL stay open for the planner until it is fixed.
   Reject, Defer and Resolve SHALL close it.
6. These actions SHALL be person-only: MCP and agent sessions SHALL be
   refused, as for `plan.approve`. `plan.review.dispose` SHALL become
   person-only with the same refusal. Planner answers stay on
   `plans_answer_review`.
7. A person's actions SHALL feed the planner's next turn on that spec, as
   data: every accepted finding (to be answered `fixed` with a revision;
   an `answered` reply keeps it for you), every rejected finding with its
   reason (not to be brought back), and deferred ones as follow-ups. WHEN
   a person accepts a finding and no planner turn is running for that plan
   THEN the tick SHALL send the planner one answer turn with the accepted
   findings, at most one per plan per tick. The next reviewer round SHALL
   get rejected and resolved findings with their reasons, and Avoozl SHALL
   drop a new finding in the same pass whose category and quote hash match
   one of them, counting the drop in the round's note.
8. Defer SHALL store a follow-up (finding, spec, note, who, when,
   revision) in the workspace database and list it under **Follow-ups** on
   the spec. It SHALL NOT create a task or an issue. A follow-up becomes a
   task only through a spec revision a person approves.
9. The spec SHALL have a **Review** view: the rendered requirements, design
   and tasks files as tabs, with a right-hand rail of finding cards. Each
   card SHALL sit level with its anchor's first line; cards that would
   overlap SHALL stack in line order. Clicking a card SHALL scroll to and
   highlight the anchored lines; clicking highlighted text SHALL select its
   card. Moved or removed findings SHALL be listed at the top of the rail.
   Filters by severity and by state SHALL show counts and be kept in the
   page address. On a narrow screen each card SHALL sit inline after its
   anchored block instead of in a rail.
10. Each card SHALL show the severity label and border, category, file and
    lines, body, the planner's response with a link to the fixing
    revision, the history of person actions (who and at which revision),
    and Accept, Reject, Defer and Resolve, or Reopen once decided. Reject
    SHALL require a reason; Defer SHALL offer a note.
11. The view, and each round's header in it, SHALL have **Open review
    chat** (the round's reviewer session) and **Open planner chat** (the
    planner session that answered). A session that is gone SHALL show
    "Chat closed" with no link. These links SHALL only open an existing
    chat, never start one.
12. Both Approve dialogs SHALL show, per spec, counts by severity and by
    state (for example "2 blocker · 3 warn · 1 info · 1 for you") and an
    **Open review** link to the Review view at that revision, in place of
    the inline finding list and its close controls.
13. WHEN the revision changes while an Approve dialog is open THEN the
    dialog SHALL NOT show "This revision changed. Reload it before
    approving." It SHALL update in place to the new revision and say what
    changed: the old and new hash, each file changed with lines added and
    removed, and findings newly fixed or moved. Approve SHALL apply to the
    revision on screen, and after an in-place update it SHALL need a fresh
    click. An approve sent for the old hash SHALL produce this update, not
    an error. In the batch dialog this SHALL apply per spec. The backend's
    refusal of a stale hash SHALL stay.
14. This SHALL be the review loop. A reviewer round reviews one exact
    revision and finds; the planner fixes or answers each finding; the
    person decides the rest. `planReview.rounds` SHALL cap automatic
    reviewer rounds; planner turns started by a person's Accept SHALL NOT
    count. WHEN the cap is reached a person MAY press **Review anyway** to
    start exactly one more round at the current revision, still under the
    different-model rule of Requirement 99.2. Approval SHALL stay the
    person's click at an exact revision; rounds, findings and actions SHALL
    NOT approve or hold approval.
15. This SHALL add no GitHub call. Findings, actions and follow-ups SHALL
    stay in the workspace database.
16. Tests SHALL use fake chats, fake model names and a fake GitHub that
    records zero calls. Source and tests SHALL NOT name a model or
    provider.

### Requirement 105: Where tasks live follows from each repository's role

**Status 2026-11-18.** Criterion 4 changed (#484): Repository setup is a compact list with a read-only role badge and View, Edit and Remove icon buttons, not an in-place picker. The role is chosen in Edit and in Add repository. A fifth choice, `mirror` ("Private mirror of a public repository", a private copy that crews work in), is part of that choice and replaces the separate Mirror box. Criterion 5 and the one "Tasks live in" line are unchanged.

Added 2026-11-17 (owner request). Design §4.34. Extends Requirement 28.
Where they conflict it supersedes the part of Requirement 28.1 that says a
workspace configures the mode: a person now picks a role per repository and
the mode follows from the roles. Requirements 28.2–28.11 hold unchanged.

The owner's words, in short: "Where tasks live" is not its own Settings
page. Each repository gets a role on the Repository setup page, and where
tasks live follows from those roles. Parts that cannot be a per-repository
role stay in the workspace settings.

**User story:** As the owner, I want to say what each repository is for,
so that I never choose a workspace mode on a separate page and then match
my repositories to it.

#### Acceptance criteria

1. Each repository SHALL have one role: `local`, `code`, `planning` or
   `both`. `local` means no GitHub issues: the repository's tasks live in
   the workspace database. `code` means a repository whose pull requests
   land code while its issues live in the planning repository. `planning`
   means the repository that holds issues, sub-issues, dependencies and spec
   folders and receives no code pull requests. `both` means a code
   repository that also holds its own issues and spec folders.
2. The mode SHALL follow from the roles, and nothing else SHALL set it.
   All repositories `local` (or none registered) SHALL mean Local only.
   Exactly one `planning` and every other GitHub repository `code` SHALL
   mean `plans-repo`, with `planningRepository` the `planning` repository.
   A planning repository with no checkout has no repository entry, so it is
   named by the stored `planningRepository` instead of a `planning` role.
   One or more `both` and no other role SHALL mean `single-repo`. Any other
   mix SHALL be refused on save with one line naming the repositories and
   the fix, and nothing SHALL be written.
3. Only a repository with a GitHub remote MAY take a role other than
   `local`. A repository with none SHALL show `local` and say why.
4. Repository setup SHALL show the role of every repository in its list as
   a picker that edits in place, with no Edit button for the role. Above
   the list a single line SHALL say where tasks live as a result (for
   example "Tasks live in acme/plans" or "Tasks live in each repository's
   own issues"), and the picker SHALL show, for the role chosen, the
   one-line meaning, the picture and the facts the old mode panes showed.
5. The planning repository SHALL appear as a row in Repository setup even
   when it has no checkout on this computer, marked "GitHub only". It SHALL
   NOT be added as a checkout by this change.
6. Settings SHALL have no **Where tasks live** page and no `github` tab.
   The settings that belong to the whole workspace (default authority, epic
   issue type, GitHub cache and write limits, sub-issue cap, include-done,
   Project and its field names, the **Set up GitHub** wizard, crews and
   This computer) SHALL move to Settings › Workspaces. An old link to the
   Where tasks live page SHALL open Repository setup.
7. Every existing workspace SHALL keep its behavior. On read, a workspace
   with no `role` keys SHALL get roles from its stored mode: `local` or
   absent gives every repository `local`; `plans-repo` gives the repository
   named by `planningRepository` the role `planning` and every other
   repository with a GitHub remote `code`; `single-repo` gives every such
   repository `both`. Reading SHALL write nothing. The first save of
   Repository setup SHALL write each repository's `role` and the mode and
   `planningRepository` the roles derive, and running it twice SHALL change
   nothing more.
8. The keys `github.mode` and `github.planningRepository` SHALL stay in the
   schema and stay readable. WHEN any repository has a `role` THEN the
   roles SHALL win and the loader SHALL derive both keys from them, so
   every existing reader sees one consistent value. A stored mode that
   disagrees with the roles SHALL be shown once as "The file says X; the
   roles say Y" and replaced on the next save. Keys SHALL NOT be deleted.
9. Switching a role SHALL delete no stored setting, as switching a mode did
   not. Settings that the new mode does not read SHALL show as "Kept, not
   used".
10. The mapping, the migration, the refused mixes and the screens SHALL have
    tests on fake data and a fake GitHub that records no call for a read.

### Requirement 106: Task details hold the task's timeline; Trace is removed

Added 2026-11-17 (owner decision). Design §4.35. Supersedes RC8.2 (Trace
as a drawer and a page) and the Trace (Done) lane in RC8's nav list.
Requirement 101.4 (every build record shown) and
RC32.6 stay, now shown in the task's Timeline box.

The owner's words, in short: Trace was built for one GitHub issue per task
with a Radar claim. The pivot (retire-issues) retired that, so the page
goes. What it showed for a task moves into that task's details.

**User story:** As the owner, I want a task's steps in its own details, so
that I read how it went in one place and the nav has no page that needs a
GitHub issue.

#### Acceptance criteria

1. Task details SHALL have a **Timeline** box, collapsible, in the same
   bordered box style as its other sections. It SHALL list Avoozl's own
   steps for the task, oldest first: Spec approved, Ready, Started
   (attempt N), Checks, Landed (with the commit), Integrated, and Builds.
   Each step SHALL show its time and the wait since the step before it that
   has a time.
2. A step with no time that a later step passed SHALL show as Skipped. The
   first step with no time after the last timed step SHALL show In progress.
   Later steps SHALL show without a time. This is how Trace drew them.
3. Every attempt SHALL show in order. A failed, interrupted or handed-back
   attempt SHALL show its own step with the outcome.
4. The box SHALL read stored records only: the plan's approval, flow spans,
   session bindings, the task's delivery record and integration, evidence,
   and build observations. It SHALL make no GitHub call and need no issue.
5. What only Trace showed for a task SHALL move into the box so nothing is
   lost: the build records grouped by phase, with the one-line summary,
   failed records marked (R101.4, RC32.6). The GitHub-only steps (Issue
   created, Claimed, PR opened, Review, Mirror steps) SHALL NOT be shown,
   because they need an issue or a pull request that tasks no longer have.
6. The earlier history list of task details (row changes, evidence,
   deliveries, runs) SHALL stay in the same box, below the steps.
7. The **Trace** nav entry, page, drawer, and Done work list SHALL be
   removed, and so SHALL the `radar.trace` and `trace.done` operations and
   every "Trace" button on other pages. Delivery and Home's Recently landed
   cover the list.
8. An old link to the Trace page SHALL open Dashboards › Delivery. An old
   `?trace=owner/repo#N` link SHALL open the details of the task whose
   issue is that one, with Timeline open; when no task has that issue it
   SHALL open Delivery.
9. Tests SHALL cover: the steps from stored records (a failed attempt, a
   skipped step, an in-progress step, builds); the redirects; no Trace nav
   entry; and zero GitHub calls. Screenshots of task details in the full app
   shell (phone and desktop, light and dark) SHALL be under
   `docs/evidence/trace-into-task/`. The owner needs no review of them.

### Requirement 107: Spec pull requests are adopted into their spec

Added 2026-11-18 (owner decision). Design §4.36. Extends Requirements 30
(spec folders), 49 (Triage), 99 and 104 (second-model review and findings)
and 102 (approval as a commit).

The owner's words, in short: a draft spec pull request must not sit in
Triage, where no button fits it. Avoozl adopts it into its spec itself, with
no Issue Radar, and there is a real place to see it and act on it.

**User story:** As the owner, I want a pull request that only changes a spec
to show up on that spec, reviewed and ready to approve, so that approving
the spec and merging its pull request is one decision.

#### Acceptance criteria

1. A pull request SHALL count as a spec pull request WHEN it is open, its
   repository has the role `planning` or `both`, and every changed file is
   under `.kiro/specs/` and under exactly one spec folder. The folder name
   SHALL be the spec: an existing spec gets a proposed change, a new folder
   gets a new draft spec. A pull request that also changes any other file,
   changes two spec folders, or lists more files than were read SHALL stay
   in Triage.
2. A spec pull request SHALL be linked to its spec with no click WHEN its
   head branch is the spec's working branch (R102) or its author is the
   owner's GitHub login. An author who is neither SHALL be linked only WHEN
   the same allowed-actor and minimum-permission check that trigger labels
   use (`actorAllowed`) allows that author. Otherwise the pull request SHALL
   stay in Triage with one new button, **Review as spec**, which only a
   person can press and which links it the same way.
3. Adopting SHALL import the pull request head's spec files as a draft
   revision of the spec, with no approval, and SHALL record the pull
   request, its head commit and that revision's hash. The second-model
   review (R99, R104) SHALL run on that revision as for any draft, and its
   AI summary SHALL be stored with the review round. A new head commit SHALL
   import as the next draft revision; an unchanged head SHALL write nothing.
   A planner chat answering a finding SHALL NOT write the local folder for
   such a revision.
4. The spec's **Overview** tab SHALL show a **Proposed change** box while a
   spec pull request is open: the pull request link and number, its author,
   draft or ready, a checks dot (passing, failing, pending), the diff of the
   spec documents against the approved revision (or "New spec"), the counts
   of the review's findings by severity, and the buttons of criterion 6.
5. The Specs list SHALL mark a spec that has an open spec pull request with
   a **PR** chip. Needs you › Decisions SHALL hold one item per adopted spec
   pull request that waits for the person, showing the same evidence inline
   (author, draft or ready, checks, findings counts, a short diff summary)
   and the same buttons. An adopted spec pull request SHALL NOT appear in
   Triage.
6. **Approve** (a person's click, as for any spec) SHALL approve exactly the
   adopted revision: the one hash and head commit the person saw. WHEN the
   head moved since, Approve SHALL refuse and say to reload. A draft pull
   request MAY be reviewed but SHALL NOT be approved until it is marked
   ready. After Approve, Avoozl SHALL merge the pull request WHEN its checks
   on that exact head pass, with the repository's merge method, guarded by
   the head commit, and SHALL never force push. WHEN the merged spec's hash
   differs from the approved hash, nothing SHALL be approved (R102.13).
   **Reject** SHALL, after the person confirms and names a reason, close the
   pull request with a comment that names the reason. **Request changes**
   SHALL post the review's open findings as one comment on the pull request
   and nothing else. All three SHALL be refused for an agent or MCP caller.
7. WHEN the pull request merges or closes, the spec SHALL read from its
   merged home again, the box and chip SHALL go, and the Decisions item SHALL
   clear. A closed pull request SHALL leave the draft revision in place.
8. Detection SHALL add no GitHub call. It SHALL read the Triage search
   result, which gains the pull request's changed file paths, branch names
   and the review state, and SHALL NOT poll. GitHub SHALL be called only to
   read the head's spec files once per new head commit, to check a
   non-owner author's permission once per author, and for the person's
   Approve, merge, Reject and Request changes.
9. Tests SHALL cover: detection (spec-only, code mixed in, two folders,
   wrong role, truncated file list, new folder); the author check (own
   branch, owner, allowed, not allowed, permission unreadable); adoption
   (new head, same head, review started); Triage exclusion (an adopted spec
   pull request never shows in Triage); Approve then merge (head moved,
   draft, checks failing, merged hash differs); Reject; Request changes;
   and the chip, box and Decisions item. Screenshots in the full app shell
   (phone and desktop, light and dark) SHALL be under
   `docs/evidence/spec-pr-adoption/`.

### Requirement 108: The planner decides batches; batching has no setting

Added 2026-11-18 (owner decision). Design §4.37. Replaces Requirement 46.1
to 46.4 and the Batching settings of Requirement 48.6; keeps
46.5 to 46.7.

The owner's words, in short: batching is not configurable. Tasks are handed
off in batches based on what an agent decides is most efficient, with no
setting for it.

**User story:** As the owner, I want the planner to decide which tasks one
worker does together in one chat, so that tiny related edits share one
handoff without my tuning a batch size.

#### Acceptance criteria

1. WHEN the planner writes or revises a spec's tasks THEN it MAY group
   leaves that one worker should do together in one chat: each member's
   facts say `batch: <group ID>`, and `tasks.md` front-matter gives the
   group's one-line reason as `batch-<group ID>: <reason>` (Requirement
   111.4). The
   planner prompt (`prompts/planner.md`) SHALL make grouping the default
   for related leaves in the same repository and area, with no limit on
   the number of tasks, because one medium-sized pull request of related
   work beats many small ones (changed 2026-11-18, owner decision). It
   SHALL split only where the parts can truly run at the same time
   (different files or areas two workers can do without stepping on each
   other), or for a hard reason: one task must land before another, a
   different repository, a manual step, or a task that needs its own
   review or investigation. It SHALL never split just to land tasks one at
   a time. The retro prompt (`prompts/retro.md`) SHALL ask the retro to
   flag a spec whose related tasks landed as many small pull requests.
2. Spec lint SHALL refuse a `batches` value that is not an object of
   entries with a group ID of letters, digits, `.`, `_` or `-`, 2 or more
   task IDs that name leaves in this spec, and a reason of 1 to 200
   characters on one line, and a task listed in two groups. These SHALL be
   `facts.schema` errors in `tasks.md`, like any other facts error.
3. Approval SHALL store the group on each member task as
   `batch: {id, tasks, reason}` with the members' task IDs, from the
   approved revision only. A later draft revision SHALL NOT change a stored
   group until it is approved.
4. The tick SHALL stay a pure planner with no model call. It SHALL
   dispatch a group as one handoff WHEN every open member is ready. Members
   already complete SHALL be left out. Ready members SHALL wait while
   another open member of their group is not ready, unless the group breaks
   a rule of criterion 5 or was split.
5. Avoozl SHALL check these rules in code, never in a setting, each time it
   would dispatch a group: every member is in the same plan and the same
   repository (so the same base branch); no `requires` or `sequence` edge
   joins two members; every member
   carries the same group from the same approved plan hash, and the plan is
   approved at that hash; every member is an automatic leaf with local
   route and authority; no member has an earlier attempt or was split from
   a batch. A group that breaks a rule SHALL be dispatched as single tasks,
   and the task's details and its Delivery card SHALL show **Runs alone**
   with the rule it broke.
6. A batched handoff SHALL keep Requirement 46.5 to 46.7: one worker
   session and one worktree, one commit and one `done` per task in order,
   checks and review once on the last commit, and on failure a split in
   which each task retries alone at no attempt cost and is not batched
   again in that delivery.
7. Batching SHALL add no landing step. Merge batches (the
   `merge-batches` spec) test once on landing and find a culprit there;
   a batch's commits land through the repository's landing like any other.
8. Batching SHALL have no setting. `flow.batch` SHALL NOT be a Flow key,
   Settings > Flow SHALL have no Batching section, the Flow settings
   validator and settings packs SHALL have no batch keys, and `size` SHALL
   NOT be a task field. An old `flow.batch` in `.avoozl.json`, in a repository's `flow`
   or in a pack SHALL be ignored silently and SHALL never fail a load, a
   save, an import or lint. (Changed 2026-11-18, Requirement 111.5: `size`
   in a task's facts is an unknown key, which lint refuses.)
9. Delivery's **In progress** lane SHALL show a batched handoff as one card
   that lists each task (ID and title) and the planner's reason. Each
   task's details SHALL name its batch and link to it, and show the reason.
10. `delivery.investigate.mode: not-small` SHALL skip leaves in a planner
    group instead of leaves marked `size: "small"`. The value keeps its
    name so saved settings still load.
11. Radar coder projection (radar-coder RC2.5) SHALL suggest the planner's
    groups instead of grouping `size: "small"` tasks up to `flow.batch.max`.
12. Tests SHALL cover: a planner group dispatched as one handoff; a group
    that breaks each rule of criterion 5 dispatched as single tasks with its
    reason; a related group of 12 tasks dispatched as one handoff; a failing
    batch split with each task retried alone; no batch key
    in the Flow settings validator or in Settings > Flow; and an old
    `flow.batch` and an old `size` ignored on load. Screenshots of the
    batched card (phone and desktop, light and dark) SHALL be under
    `docs/evidence/agent-batching/`.

### Requirement 109: Approval delegation and exact-set approval

Added 2026-11-18 (owner request). Design §4.38. Keeps Requirement 4.8:
approval stays of an exact revision, and only a person, or a delegate a
person named, gives it.

The owner's words, in short: you approve it for me; Avoozl is not really
operational yet. An agent could not record that, and read the approval
preview as needing every draft spec the named ones depend on.

**User story:** As the owner, I want to let a named agent approve spec
revisions on my behalf, and to approve only the specs I name, so that
approval does not wait on me or drag in specs nobody asked about.

#### Acceptance criteria

1. Approving a set of specs SHALL approve exactly the specs named. A task
   whose dependency belongs to a draft spec outside the set SHALL be created
   with that dependency pending and SHALL NOT be ready, projected or
   dispatched until that spec is approved. Only a task that approval
   creates as done from a `[x]` mark SHALL need its owners approved in the
   same set.
2. The approval preview SHALL name the draft specs the set waits on and
   count the tasks that wait, and SHALL say that approval does not need
   them.
3. A person SHALL be able to grant approval delegation to a named identity
   (`approval.delegate.grant {identity, onBehalfOf?, note?}`), on behalf
   of themselves: their GitHub login when GitHub is in play, else the
   operator. The grant SHALL be stored in the workspace database, not in
   Git. Granting and revoking (`approval.delegate.revoke {identity}`)
   SHALL be person-only over MCP. From the CLI they run as Requirement 83.1
   says. `approval.delegates` SHALL list active grants
   and the history of grants and revocations, and MAY be read by anyone.
4. `plan.approve` and `plan.approveMany` SHALL accept `delegate`. A call
   that names a delegate SHALL pass the person-only refusal and SHALL then
   be refused (403) unless that identity holds an active grant. A call that
   names no delegate SHALL stay person-only.
5. A delegated approval SHALL approve as the person who granted it, and
   SHALL be refused when `approvedBy` names anyone else. Its receipt SHALL
   record `delegation: {delegate, onBehalfOf, grantedAt}` beside the exact
   revision hash, and its evidence SHALL name the delegate when none is
   given.
6. An approval pull request a delegate opens SHALL say so in its body and
   keep the delegation on its stored state, and the receipt recorded when
   it merges SHALL carry it.
7. Revoking SHALL refuse every later delegated approval and approval pull
   request, and SHALL list the delegate's approval pull requests still
   open so the person can close them. It SHALL NOT undo an approval
   already recorded.
8. The CLI SHALL offer `approval delegates`, `approval delegate NAME
   [--on-behalf-of LOGIN] [--note TEXT]`, `approval revoke NAME`, and
   `plan approve ... --delegate NAME`, whose preview prints the approve
   command with `--delegate NAME`.
9. Tests SHALL cover: a delegate refused with no grant, over MCP and in
   process; grant and revoke refused over MCP; a granted delegate
   approving exactly one spec whose owner stays a draft, with the receipt's
   delegation; a mismatched `approvedBy` refused; revocation refusing the
   next approval and keeping history; an approval pull request carrying the
   delegation through its merge; and the CLI flow from an agent session.

### Requirement 110: One intake list

Added 2026-11-18 (owner decision on `docs/simplification-audit.md` item 6
and F5). Design §4.39. Changes Requirement 50.6 and the issue intake part
of Requirement 10; keeps Requirements 49, 52 and 103.8 to 103.11.

The owner's words, in short: one intake list. Five paths turn an issue into
work today. Retire `github.issueIntake` and `github.queue` into
`intake.sources`, so every source is one entry there.

**User story:** As the owner, I want every place work comes in from listed
once under `intake.sources`, so that I read and change intake in one place.

#### Acceptance criteria

1. `intake.sources` SHALL accept `via: "github"` beside `plugin:<id>` and
   `mcp`. A GitHub source names the GitHub `repository` (owner/name) and
   SHALL carry the keys `github.issueIntake` held: `project` (the execution
   project), optional `workspaceRepository` when it differs from `project`,
   `label` (default `avoozl:ready`), optional `managedLabel`, `assignee`,
   `autoStart`, `provider`, `model`, `allowedActors` and
   `minimumPermission` (default `write`). `labelFields` and
   `assigneeField` SHALL be refused on a GitHub source, and the GitHub
   keys SHALL be refused on a plugin or MCP source.
2. A GitHub source SHALL live in `.avoozl.json`, as `github.issueIntake`
   did. One declared in this machine's settings SHALL be listed with the
   reason it is not used. At most one GitHub source SHALL name a GitHub
   repository.
3. `github configure`, `github.project.connect` and Repository setup's
   "issues here" SHALL write a GitHub source and SHALL NOT write
   `github.issueIntake` or `github.queue`. Removing a repository or
   turning its issues off SHALL remove its GitHub source.
4. An old `github.issueIntake` entry SHALL load as the GitHub source it
   describes, with an id `github-<owner>-<name>` (lowercase; other
   characters as `-`; a number added on a clash), and an entry with
   `enabled: false` SHALL load as no source. An old `github.queue` SHALL be
   accepted and ignored: it never let anyone start work, so it SHALL NOT
   become a source that does. Neither SHALL warn, fail a load or a save, or
   mark settings as needing apply.
5. The first time Avoozl's settings writer (Repository setup, Settings and
   Intake sources) writes `.avoozl.json` after loading old keys, it
   SHALL move every `github.issueIntake` entry into `intake.sources` and
   drop `github.issueIntake` and `github.queue`, in the same write. A
   file Avoozl does not write SHALL keep loading as in criterion 4.
6. A GitHub source SHALL be applied as `github.issueIntake` was: the
   `github_repositories` record and `github sync` keep their behavior,
   and the repository's `github.repositories` rules still replace its
   single label (Requirements 10 to 12). GitHub items SHALL keep source
   `github`; a rule's `source:` term SHALL still name only plugin and MCP
   sources (Requirement 50.11).
7. Settings › Plugins › Intake sources SHALL list each GitHub source as one
   entry in the same box as every other source, with its repository,
   label, assignee, who counts and whether it starts on its own, and SHALL
   name the repository's Issue Radar escalation label when it has one. A
   GitHub source is changed in Repository setup, so its entry SHALL link
   there instead of offering Remove. The Add dialog SHALL stay for plugin
   and MCP sources. The built-in GitHub box SHALL stay as the reader of
   Triage: what no source covers.
8. Issue Radar intake (56.8), Radar escalations in Triage (56.14) and Radar
   back-links (44.6) SHALL keep working for a repository whose GitHub
   source came from an old `github.issueIntake` entry and for one written
   as a source.
9. Tests SHALL cover: each kind's keys and refusals; an old
   `github.issueIntake` loaded as a source with no warning and no apply
   flag; an old `github.queue` ignored; the one-time move on the next
   write; `github configure` and Repository setup writing a source; and
   Radar intake, escalations and back-links on a migrated repository.
   Screenshots of Intake sources (phone and desktop, light and dark),
   before and after, SHALL be checked outside git; no image is committed.

### Requirement 111: Task facts live in tasks.md

Added 2026-11-18 (owner decision). Design §4.40. Changes Requirement 30.1
and 30.6, and the manifest rules of Requirements 59, 105 and 108. The
owner's words, in short: remove `avoozl/manifest.json`; every per-task fact
moves into `tasks.md`, one `Facts:` bullet per task.

**User story:** As the owner, I want one file per spec to read and review
the tasks, so that a task's title, its checks and its acceptance sit
together and a Kiro chat, Claude Code or Codex writes them in one place.

#### Acceptance criteria

1. A spec folder SHALL hold `requirements.md` or `bugfix.md`, `design.md`
   and `tasks.md`. It SHALL NOT hold `avoozl/manifest.json`. Avoozl SHALL
   NOT read that file. A leftover one SHALL be a lint error, with its file,
   that says to delete it. No alias, fallback or migration tool SHALL read
   or convert it.
2. Each `tasks.md` item SHALL carry its facts in one bullet, `Facts:`,
   nested under the item as its first child. The bullet's children SHALL be
   one `key: value` bullet per fact, or `key:` with nested bullets for a
   list. Subtasks SHALL follow the `Facts:` bullet. Other plain bullets
   under an item stay free notes.
3. The known keys SHALL cover everything the manifest held: `kind`, `repo`
   (the repository), `summary`, `done` (the acceptance), `completion`,
   `checks`, `after`, `sequence`, `supports`, `manual`, `phase`, `batch`,
   and the other task keys `validateProposal` accepts, plus `plan` and
   `step` on an epic's rows. `after` names the tasks that must finish
   first, each with an optional `:<completion>`. A list SHALL be written
   inline, comma separated, or as nested bullets.
4. `tasks.md` MAY start with front-matter that holds spec-wide values: `repo`,
   `checks` and `completion` as defaults for every leaf; `ship`,
   `integrationBranch`, `integrationSync`, `forwardTarget`, `publicBranch`
   and `kind: epic` for the spec; `phase-<id>: <title>` for a named phase;
   and `batch-<id>: <reason>` for a planner batch group, whose members
   each write `batch: <id>`. A task's own fact SHALL win over a default. A
   package SHALL NOT take a default.
5. Lint SHALL refuse, with the file and line of the bullet: an unknown key
   in `Facts:` or in front-matter; a key written twice; a value of the wrong
   shape; more than one `Facts:` for a task; a `Facts:` that is not the
   first child of a task item; a fact bullet outside `Facts:`; and a task
   with no `Facts:`. Every rule the manifest had, such as acceptance on a
   leaf, SHALL hold with the file named `tasks.md`.
6. The revision hash SHALL cover the spec's prose and its parsed facts, not
   their layout. A spec converted from the manifest to `Facts:` bullets,
   with nothing else changed, SHALL NOT need a person's approval again: it
   keeps its hash where the old manifest's text allows, and otherwise its
   approval is carried to the new hash with `carriedFrom` recorded, no
   approval pull request and no issue change. Any other difference SHALL
   need a normal approval. Checkbox marks and `Status:` SHALL stay outside
   the hash. Tests SHALL prove both on copies. (Changed 2026-11-18: owner
   decision on the carry-over.)
7. Avoozl SHALL parse a spec once, store its revision, and parse again only
   when the revision changes, as it did. Ticks SHALL stay outside the hash.
8. The spec page, the review tabs, the graph, spec pull request adoption,
   proposed work, import and the plan-review view SHALL read facts from
   `tasks.md`. The review tabs SHALL show no manifest tab.
9. The planner prompt, the Spec Builder steering file and any planner skill
   SHALL tell Kiro chats, Claude Code and Codex to write `Facts:` bullets
   and never `avoozl/manifest.json`. Avoozl SHALL NOT write a manifest or
   draft one from marker bullets.
10. Every spec in this repository SHALL be converted once and its
    `manifest.json` deleted in the same change. A test SHALL prove that the
    tasks and proposals parsed before and after are equal. The Nupp plans
    SHALL be converted the same way in one change in their own repository,
    after the build merges, tested on a copy first.
11. Tests SHALL cover: each key and each refusal in 5, the leftover manifest,
    default and package rules, an epic folder, a batch group, the hash in 6,
    proposed work writing a `Facts:` bullet, and the planner text.
