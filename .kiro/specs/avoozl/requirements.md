---
category: Planning
---

# Requirements: Avoozl

## Introduction

Avoozl turns a spec a person approves into landed code. It reads Kiro spec
folders, builds a task graph from each spec's `tasks.md`, starts a coding
agent on each ready task in its own worktree, runs the repository's checks on
the exact commit the agent made, and lands the work by the repository's
`landing` setting. Agents run as Kiro Crew chats or as process harnesses
started by each `avoozl tick`. Avoozl is a local application with a Kiro Crew
app page, a CLI and an MCP server; a timer or the app's cron runs the tick,
and each tick can also keep the page up on its own.

Git and GitHub hold the state that matters: specs, approvals, ticks and what
landed. SQLite is a cache that `avoozl rebuild` makes again. GitHub is
optional: a Local only workspace needs only Git.

| Document          | Holds                                                     |
| ----------------- | --------------------------------------------------------- |
| `requirements.md` | Facts Avoozl relies on, scope, and each requirement with acceptance criteria |
| `design.md`       | State ownership, architecture, workflows and the page     |
| `tasks.md`        | Built and open tasks, and the proofs that check them      |

**Autopilot** is the name people read for delivery: the tick starting ready
tasks on its own. The `delivery` key in `.avoozl.json`, the `delivery.*`
operations, the CLI and the `plans_*` MCP names keep the word delivery.

Facts carry one label:

- **Verified**: confirmed by reading code, documentation, or data, with the source named.
- **Inferred**: follows from verified facts, but was not directly observed.

## Facts

### Kiro Crew facts

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
| F11 | GitHub projection supports native cross-repository dependencies.   | **Verified, with limits** | `src/app/github/github-sync.mjs` `projectPlanIssues` and the live proof. Limits: every target repository must be registered and private; a dependency outside the plan must already be projected; drift detection applies to edges only.                                                                                                                                                              |
| F12 | Fresh Avoozl workspaces can recover projected issues from markers. | **Corrected**             | Recovery reuses existing issues only when the _same approved plan ID_ is projected again: issues are matched by the hidden marker's `taskId` and `planId` under the managed label. It does not rebuild local tasks, status, or edges from GitHub. `syncGitHubIssues` fails when a marker names a task that is not present locally. A closed projected issue makes re-projection fail with 409. |
| F13 | Avoozl verifies exact pull-request completion and required checks. | **Corrected**             | `src/app/github-completion.mjs` implements the check correctly and was proved live. It was called only by a live proof script that now lives in git history. No operation, CLI command, MCP tool, or dependent-release path uses it. It also requires the closing pull request to live in the issue's repository.                                                                                            |

### Facts about Avoozl and Kiro Crew apps

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                         | Label                                                                                    | Evidence                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F15 | Trigger labels and managed state labels are the same label today. One `label` (default `avoozl:ready`) authorizes intake _and_ is the readiness label projection adds. Intake supports one label, one assignee, an actor allowlist, and a minimum permission. There are no AND, OR, or exclusion rules.                                                                                                                      | **Verified**                                                                             | `github-sync.mjs` `syncGitHubIssues`, `prepareGitHubRepository`; `repository-settings.mjs`.                                                                                       |
| F16 | Avoozl supports public and private repositories.                                                                                                                                                                                                                                               | **Verified** (code)                                                              | `prepareGitHubRepository` and `requirePrivateRepository` in `github-sync.mjs`.                                                                                                    |
| F17 | Managed-field conflict detection covers dependency edges only. Titles and the managed body section are overwritten without comparing to the last applied value.                                                                                                                                                                                                                                                              | **Verified**                                                                             | `projectPlanIssues` compares `managedBlockerIssueIds`; title and body go straight to `updateIssue`.                                                                               |
| F18 | GitHub task dispatch and all local execution use Avoozl's own agent host and providers (`codex`, `claude`, `openhands`), not Kiro Crew.                                                                                                                                                                                                                                                                                      | **Verified**                                                                             | `startAuthorizedIssue` calls `ops.manager.start`; `src/app/providers/`.                                                                                                           |
| F20 | A Kiro Crew app may declare a `node` backend that the gateway spawns on loopback and reverse-proxies at `/apps/<name>/api/`, plus `mcpServers`, `crons`, `agents`, and `skills`. Third-party apps run with gateway privileges after the user grants trust.                                                                                                                                                                   | **Verified**                                                                             | `apps/manifest_sections.py` `BackendConfig`; `apps/routes_proxy.py`; `docs/apps.md`. The current Avoozl app is installed and trusted (`~/.kiro/crew/apps/avoozl/installed.json`). |
| F21 | No supported API lets an app backend create a _visible, project-bound_ Kiro Crew session. The app spawn SDK starts background agent turns with no project or working-directory argument. `session_create` has no project argument; a session inherits a project only from a folder whose `project_dir` a person set.                                                                                                         | **Verified**                                                                             | `apps/spawn_sdk.py`; `docs/session-control.md` (`session_create`, `chat_folder_update`).                                                                                          |
| F22 | Kiro Crew inbound webhooks run one LLM turn in an ephemeral session, bind loopback by default, and use Kiro Crew's own HMAC headers, not GitHub's webhook signature.                                                                                                                                                                                                                                                         | **Verified**                                                                             | `docs/inbound-webhooks.md`.                                                                                                                                                       |
| F23 | Issue Radar crew configuration lives in Issue Radar's private app data and routes (`/api/apps/issue-radar/crews`). No public contract lets another app read or write a crew's label scope.                                                                                                                                                                                                                                   | **Verified**                                                                             | `crew_ledger_spec.md`, `crew_routes.py`.                                                                                                                                          |
| F24 | Issue Radar crews can merge and re-arm auto-merge, and hold at most one item per crew in the dirty-worktree phases (Implement, Addressing review).                                                                                                                                                                                                                                                                           | **Verified**                                                                             | `http_routes/pr_actions.py`; `docs/issue-radar-pipeline.md`; `crew_brief.md`.                                                                                                     |
| F25 | Avoozl readiness treats `requires` and `sequence` edges as blocking and `supports` edges as advisory.                                                                                                                                                                                                                                                                                                                        | **Verified**                                                                             | `src/query.mjs`.                                                                                                                                                                  |
| F26 | Avoozl runs its own runtime machinery today: `host-scheduler.mjs` (host-wide admission with default limits of 4 per host and 2 per workspace), the agent host with activity leases, the GitHub intake webhook callback with its own capability tokens (`github-intake.mjs`), and GitHub sync and queue polling driven by Avoozl's server.                                                                                    | **Verified**                                                                             | `src/app/host-scheduler.mjs`, `src/app/agent-host.mjs`, `src/app/github/github-intake.mjs`, `src/app/github-queue.mjs`.                                                                  |
| F27 | Kiro Crew crons can run a shell command with no LLM call (`command` jobs), on an interval, cron expression, or one-shot time. Commands are vetted when added and on every fire; command substitution, loops, and compound commands are refused. The default subprocess limit is 300 seconds and the default wake budget is 30 minutes. An app manifest can declare crons that register on enable and are removed on disable. | **Verified**                                                                             | `docs/cron-and-scheduling.md`; `apps/manifest.py` `crons`; `docs/apps.md`.                                                                                                        |
| F28 | Kiro Crew monitor loops wake one conversation on an interval and run an agent turn each cycle in that same conversation.                                                                                                                                                                                                                                                                                                     | **Verified**                                                                             | `docs/monitor-loops.md`.                                                                                                                                                          |
| F29 | No documented Kiro Crew event pushes a session's completion to an app backend. Apps can declare permitted event names (Task Runner declares `refine`; Workflows declares `workflow_run_event`), but no session-lifecycle event for third-party apps was found.                                                                                                                                                               | **Verified** (absence in docs and manifests searched); push support **Inferred** missing | `~/.kiro/crew/apps/*/app.json`; `docs/session-control.md`.                                                                                                                        |
| F30 | Apps can declare notification channels in their manifest.                                                                                                                                                                                                                                                                                                                                                                    | **Verified**                                                                             | Issue Radar manifest `notifications.channels`.                                                                                                                                    |

## Scope

### In scope

- One Avoozl Kiro Crew app with a backend, page, skill, and MCP surface, and
  the same page served by Avoozl itself, kept up by each tick.
- Kiro spec folders as the plan layout.
- Local planning and delivery with no GitHub dependency.
- GitHub spec issues, epic issues, pull requests and landing.
- Agents on any harness: Kiro Crew chats or process harnesses under the
  supervisor.
- A plugin seam for intake sources, content rules, settings packs, templates,
  credentials and checks, loaded only with consent (Requirements 34, 55).
  The public repository ships only test-only fake plugins; real integrations
  are separate packages.
- An open-source release.

### Non-goals

- A chat, terminal, file browser or memory system.
- A second writable task store beside git.
- Any private or company-internal integration in the public repository, by
  name or by implementation. Such integrations live in their own packages and
  plug in through the seam (Requirement 34.10).
- Reading or writing another Kiro Crew app's private data or routes.
- GitHub Apps, hosted services, or shared databases.

## Requirements

### Requirement 1: Kiro Crew is the only agent and session experience

**User story:** As a developer, I want every planning, implementation, and review
session to be a Kiro Crew session, so that I use one place to watch and steer work.

#### Acceptance criteria

1. WHEN Avoozl starts planning or implementation work THEN the work SHALL run in
   a Kiro Crew chat or a process harness that the supervisor starts
   (Requirements 93 to 95).
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
3. Every task SHALL be a package or a leaf; epics span specs
   (Requirement 59.7).
4. Only leaves SHALL be dispatchable; packages SHALL complete only from
   their children.
5. A leaf SHALL be bounded: one target repository, observable acceptance
   criteria, and a completion condition.
6. Dependency edges SHALL be explicit and typed; blocking and advisory edges
   SHALL be distinguished.
7. WHEN the graph has a cycle, an unknown reference, a duplicate ID, or a leaf
   without acceptance criteria THEN deterministic validation SHALL reject it.
8. No task SHALL become executable until a person approves the exact graph
   revision.

### Requirement 5: Design-first task facts

**User story:** As a developer who wrote requirements and design in Spec Builder,
I want Avoozl to read each task's facts beside it in `tasks.md`, so that I can
deliver the design without retyping it.

#### Acceptance criteria

1. WHEN a Kiro spec folder (Requirement 30), including one Spec Builder wrote,
   has approved requirements (or bugfix analysis) and design THEN Avoozl SHALL
   read its files from disk and SHALL NOT call Spec Builder routes.
2. Each `tasks.md` task SHALL carry its repository, dependencies and
   completion condition in its `$` fact bullets (Requirement 111), with
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
   issues a repository releases at once.
   `lanes.local` in `.avoozl.json` SHALL count as this machine's lanes when
   the machine file sets none. A file that still sets `delivery.concurrency`
   or `delivery.repositories.*.concurrency` SHALL NOT load, and the error
   SHALL name the file and the key; the host and
   workspace `maxConcurrentRuns` SHALL be ignored. Settings › Workspaces
   SHALL NOT show an "Agents at once" field, and `avoozl workspace
   concurrency` SHALL NOT exist, because nothing enforced them.
4. WHEN a leaf needs several internal steps THEN Avoozl MAY run it through Task
   Runner, and those steps SHALL NOT become Avoozl tasks.
6. Each worker SHALL use an isolated worktree.

### Requirement 7: Verification, integration, and dependent release

**User story:** As a developer, I want finished work verified and integrated
before dependents start, so that later tasks build on accepted code.

#### Acceptance criteria

1. WHEN a worker reports done THEN Avoozl SHALL run the repository's checks
   against the exact commit and record the result. A check that names paths
   SHALL run only when the commit's diff against the base touches one of
   them; every other check SHALL run. Avoozl SHALL run them
   itself, with no model call: in a clean detached worktree at that commit,
   each check as an argument list with no shell, each with its own time
   limit, recording the exit code and a short redacted output tail, and
   removing the worktree afterwards. The runs SHALL be queued off the tick,
   one at a time per repository, and SHALL NOT start while all agents are
   stopped or while a stopped line holds the commit. A check that is not
   run, cannot start (exit 126 or 127), or times out SHALL fail the
   checking, not the writer's attempt. A verifier session SHALL open only
   for a bar that needs judgment: a repository with no checks, or
   `verify: agent` on the task. A task declares no checks; every task runs
   its repository's checks, each named in the repository's settings.
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
   execution, and completion.
3. A repository whose policy names neither allowed actors nor a minimum
   permission SHALL be treated as `minimumPermission: write`, for trigger labels, board orders, closes, comment steering,
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
    track, and its `repositoryId` SHALL be ignored; the issue's registered
    repository decides the execution repository.
11. Outside text quoted into a brief or a relayed message SHALL be capped:
    each pull request comment, review, or steering comment keeps its first
    4,000 characters and a note with its link. A check's name SHALL be one
    line of at most 100 characters in code quotes, its link SHALL be http
    or https, and the message SHALL say that a check's log is data, not
    instructions.
12. Comment-mention steering SHALL pass the content rules' `brief`
    boundary (Requirement 40) before it is sent, as pull request feedback
    does.
13. The planner agent's file writes SHALL be limited by its agent spec,
    not only its prompt: `toolsSettings.fs_write` SHALL set
    `fallbackAction: "deny"` with `allowedPaths: [".kiro/specs/**"]`,
    anchored at the session's folder (the planning checkout). Kiro Crew
    0.12.2 enforces this on kiro-cli and at its own tool gate on some other
    backends; the rest do not read it, and a static spec cannot name one
    spec folder,
    so the one-folder limit within `.kiro/specs/` stays in the prompt.
14. Every link the app page renders SHALL be an http or https URL or one
    of Kiro Crew's own pages (`/chat?sid=`, `/apps/`, `/issue-radar`); anything else SHALL render as text.

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
   refused with an error naming it, never ignored.
3. Each rule SHALL map to one fixed internal action: `respond`, `plan`,
   `deliver`, `execute`, `pause`, `resume`, or `quarantine`.
4. Trigger labels SHALL be distinct from Avoozl-managed state labels, and
   validation SHALL reject a configuration where they overlap.
5. Avoozl SHALL add or remove only its configured managed labels and SHALL
   preserve every other label.
6. Settings SHALL write `match`, show the parsed terms, refuse a bad token
   inline, and preview the open issues the line matches now.

### Requirement 12: Issue-first GitHub work

**User story:** As a maintainer, I want to label an issue and have Avoozl either
deliver it or break it down, so that one gesture starts the right amount of work.

#### Acceptance criteria

1. WHEN a trigger rule matches THEN Avoozl SHALL freeze the issue snapshot
   (body hash, label event, actor) and plan only from that snapshot.
2. WHEN the issue body or title changes after the snapshot THEN Avoozl SHALL
   quarantine the issue until a new trigger event or explicit confirmation,
   and the task SHALL keep the snapshot's title.
3. A planning session SHALL classify the issue as bounded or broad.
4. WHEN the issue is bounded THEN it SHALL remain its own leaf, and Avoozl SHALL
   create no duplicate issue.
5. WHEN the issue is broad THEN Avoozl SHALL create a child graph, publish
   children only after approval, and keep the source issue as their parent.

### Requirement 19: One authority per state

**User story:** As a maintainer, I want every kind of state to have one owner,
so that two stores never disagree.

#### Acceptance criteria

1. The design SHALL name exactly one authority for: reviewed design, local task
   graph, local task status, GitHub issue graph, Kiro Crew sessions, worktrees
   and branches, pull requests, test results, completion, activity and
   evidence.
2. Avoozl SQLite SHALL be authoritative for local-only tasks and SHALL be only a
   cache and receipt store for GitHub-backed tasks.
3. No task SHALL be writable in two stores.

### Requirement 20: The Avoozl app

**User story:** As a developer, I want one Avoozl page in Kiro Crew with clear
views, so that I see my graph and its delivery without leaving Kiro Crew.

#### Acceptance criteria

1. The app SHALL provide seven nav entries: Dashboards (Home, Graph,
   Delivery, Landing queue), Specs, Needs you (Decisions), Flow, Retros
   (Retros, Proposals), Activity, and Settings (Workspaces, Repository setup,
   GitHub, Plugins, Content rules, Flow, Models, Delivery).
2. For each view the design SHALL name its data, primary actions, canonical
   source, links to existing Kiro Crew surfaces, and what it must not duplicate.
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
5. Only `AVOOZL_*` variables and the `avoozl` command SHALL
   work; older environment aliases, command names, editor settings and
   settings keys SHALL NOT be read. A configuration file with an unknown
   top-level key SHALL fail to load, naming the file and the key.

### Requirement 26: Lean on Kiro Crew for scheduling, watching, and runtime

**User story:** As a maintainer, I want Avoozl to use Kiro Crew's schedules,
watchers, sessions, and notifications instead of its own, so that Avoozl stays a
small graph-and-policy app and Kiro Crew remains the one runtime.

#### Acceptance criteria

1. Avoozl SHALL NOT run a background poller, worker lease system, or webhook
   receiver of its own. Agent children belong to the supervisor
   (Requirement 95).
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
8. Worker liveness SHALL come from Kiro Crew session status or the
   supervisor's child records, read during the tick; Avoozl SHALL NOT keep a
   lease.
9. Monitor loops (F28) and inbound webhooks (F22) MAY be used to make a tick run
   sooner, but no workflow SHALL depend on them, and Avoozl SHALL NOT use a
   monitor loop for routine polling.
10. Human decisions and failures SHALL reach the user through Kiro Crew
    notifications declared by the app (F30) and links to the relevant session.
11. Kiro Crew has no push on session completion (F29), so the tick SHALL poll
    session status.
12. WHEN the gateway is stopped THEN no Avoozl automation SHALL run, and the next
    tick after restart SHALL reconcile state before any new dispatch.

### Requirement 28: GitHub modes and task authority

**User story:** As a maintainer, I want GitHub issues to be the default record
of shared work, kept either in a separate planning repository or in the code
repository, so that collaborators see one graph and public pull requests never
reveal a private plan.

#### Acceptance criteria

1. Each workspace SHALL configure at most one GitHub mode: `plans-repo` or
   `single-repo`. With no mode, every task is local.
6. In plans-repo mode the spec folders, spec issues and epic issues SHALL
   live in one planning repository, and code SHALL land in the code
   repositories the tasks name.
7. In plans-repo mode no pull request, commit message, branch name, or marker
   in a code repository SHALL name the planning repository.
8. WHEN the pull request title, body, or a commit message names the planning
   repository THEN Avoozl SHALL open a decision and SHALL NOT land the task
   until it is fixed.
10. Both modes SHALL work when the planning repository is private and the code
    repository is public, and when the two repositories belong to different
    organizations.

### Requirement 30: Every plan is a Kiro spec folder

**User story:** As a developer, I want every Avoozl plan to use Kiro's spec
layout, so that Kiro, Spec Builder, and Avoozl read the same files.

#### Acceptance criteria

1. Every Avoozl plan SHALL be one Kiro spec folder, `.kiro/specs/<name>/`,
   holding `requirements.md` or `bugfix.md` (exactly one), `design.md`, and
   `tasks.md`, under the repository's `specs.path`. Only `tasks.md` is
   required (Requirement FS1), and each task's facts are `$` fact bullets
   under it (Requirement 111).
2. Bugfix specs SHALL be supported the same way as feature specs.
3. In plans-repo mode spec folders SHALL live in the planning repository; in
   single-repo mode, in the code repository; with no GitHub mode, in the
   workspace's planning repository.
4. Deterministic validation SHALL refuse a plan whose folder is missing or
   has no `tasks.md`.
5. Every checklist item in `tasks.md` SHALL start with a task ID. Validation
   SHALL refuse an item with no ID and any ID used twice in the namespace.
6. Avoozl SHALL map `tasks.md` items to tasks only by these IDs.
   Edges SHALL come from the task's `$after` facts (Requirement 111). Kiro's own task waves inside
   `tasks.md` SHALL NOT be Avoozl's graph.
7. Avoozl's planner SHALL write plans into this layout.
9. A plan's category SHALL come only from a `category:` key in YAML
   front-matter at the top of the spec's `requirements.md` or `bugfix.md`
   (for a plan with no spec folder, from front-matter at the top of its own
   text, or from metadata a person set). Avoozl SHALL read it and SHALL NOT
   write it, SHALL NOT keep it in task facts, and SHALL NOT infer one from a
   title or path: a plan without one is shown as Uncategorized. Malformed
   front-matter SHALL produce a warning diagnostic with its file and line and
   SHALL NOT block approval. The Plans view SHALL group plans by category.

### Requirement 32: GitHub setup wizard

**User story:** As a maintainer, I want Avoozl to set up GitHub for me from
its Settings view, so that I never configure repositories or issue types by
hand.

#### Acceptance criteria

1. The Settings view SHALL offer a **Set up GitHub** flow that runs these
   steps in order:
   1. check the token and report each missing scope (`repo`, `read:org`)
      with the exact command that adds it;
   2. ask for the mode, plans-repo or single-repo, then pick or create the
      planning repository (plans-repo mode), private by default;
   3. turn on issues in each repository the mode needs;
   6. create the `Epic` issue type when the organization allows it and has
      none;
   8. write the result into `.avoozl.json` through a reviewed change.
2. The wizard SHALL preview every GitHub write before applying any, and the
   person SHALL confirm once for the whole set.
3. The wizard SHALL be idempotent: it SHALL reuse what exists and add only
   what is missing. A second run on a finished setup SHALL write nothing.
4. The wizard SHALL NOT delete or rename any repository or issue type.
5. WHEN a step fails for lack of permission or scope THEN the wizard SHALL
   report that step with the reason and the fix, and SHALL keep every other
   step.
6. The wizard SHALL end with a short checklist of the steps GitHub's API
   cannot do, each with a link to the place to do it.
7. The design SHALL mark each GitHub API limit the wizard relies on as
   Verified or Inferred and cite GitHub's documentation.
8. One proof SHALL run the wizard twice on a fresh test organization, user,
   or repository: the first run creates everything and the second changes
   nothing.

### Requirement 34: Plugin loading and trust

Design §4.8.

**User story:** As a maintainer, I want outside packages to add intake
sources and content rules to Avoozl, loaded only with my consent and unable to break
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
   `version`, `contract` version, `kinds` (`intake`, `rules`, or both), the
   capabilities it supports for each kind, and its entry module. Any other
   kind is refused. The ids
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
   SHALL mark that plugin unavailable, SHALL show the reason on its intake
   sources and rule sets, and SHALL finish the tick for everything else. The next tick SHALL try again.
8. The plugin contract SHALL be versioned by one integer. Avoozl SHALL list
   the contract versions it supports and SHALL refuse to load a plugin whose
   version it does not support. Changes inside one version SHALL be additive.
9. Settings SHALL list every declared plugin with its kinds, version,
   approval state, and health, and SHALL offer approve, disable, and remove.
10. Private and company-internal integrations, such as an intake source for
    an internal tracker, SHALL live outside the public Avoozl repository and plug in only through this
    seam. Public Avoozl files (code, tests, fixtures, docs, and this spec)
    SHALL NOT name any company-internal tool. The release leak scan
    (Requirement 24.2) SHALL cover plugin docs and test fixtures.
11. Tests SHALL use only fake plugins kept in the test tree.
12. A `plugins` entry MAY name a git source instead of `package` or `path`:
    `git` (a repository URL or local repository path), `ref` (a tag, branch,
    or full commit), and an optional `subdir` (the plugin's folder inside the
    repository). Exactly one of `package`, `path`, or `git` SHALL be given.
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
16. Settings > Plugins SHALL offer
    Design a plugin, which opens a chat seeded with the shipped
    `avoozl-plugin` skill to plan a plugin and write its files, and Plugin
    guide, which shows the plugin guide in the full-file reader. The chat
    SHALL NOT approve a plugin or import a pack.

### Requirement 36: Review gates on a local delivery

Design §5.2.

**User story:** As a maintainer running a multi-step rewrite flow in another
repository, I want every writer's exact commit reviewed by fresh agents
before it merges or anything builds on it, so that no unreviewed change
reaches the integration branch or a dependent task.

#### Acceptance criteria

1. Review sessions SHALL run on this machine's reviewer lanes and check runs
   on none, so neither SHALL count against its worker lanes (Requirement
   6.3, and the lane sessions of the simplify spec, SM20). Avoozl SHALL add no separate
   writer limit: every task writes in its own worktree and landing merges
   one head at a time. `lanes.local: 1` gives one writer on the machine.
2. Every repository SHALL get one review role by default: id `review`, agent
   `avoozl-reviewer`, `distinctFrom: session`, prompt `prompts/reviewer.md`.
   `reviewers: []` SHALL turn review off for the workspace or, under
   `delivery.repositories`, for one repository. A repository's delivery
   policy MAY instead name its own review roles. Each role SHALL have
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
    SHALL fail as one review round and a new writer attempt SHALL start on
    the same worktree, whose brief quotes the open findings as data and asks
    the worker to fix each defect or answer it in its done report. Its
    commit SHALL get new reviews from every role, and each review brief
    SHALL quote the worker's done report as an unverified claim and name the
    commit that role last reviewed. A review round SHALL NOT spend
    `retries`. WHEN a task reaches `reviewRounds` rounds (default 3, 1–10,
    set for the workspace or one repository) THEN its delivery SHALL wait
    for a person's decision naming the open findings and SHALL NOT land.
    Earlier attempts and verdicts SHALL be kept as history.
11. A leaf whose repository has review roles SHALL NOT reach `integrated`
    any other way: `task.update` SHALL refuse a typed `integration` receipt
    and a complete status for it, so that no caller skips the reviews.
12. The Delivery view SHALL show, per delivery, each role's verdict, its
    subject commit, the model it ran on, whether it is stale, and its
    findings with their closure state.
13. Review roles SHALL apply to leaves on the local route. For leaves on the
    GitHub route, GitHub's own required reviews and checks gate the merge.
    Avoozl SHALL follow the code repository's base-branch
    rules on GitHub (rulesets and branch protection), read only: WHEN they
    require approving reviews THEN Avoozl SHALL count pull-request reviews on
    the head SHA from reviewers the repository policy allows and SHALL hold
    the leaf until that many approve; WHEN they require none THEN Avoozl's
    reviewer sessions SHALL be the review gate and pull-request reviews SHALL
    NOT be read. Avoozl SHALL NOT keep its own approval count; a file that
    sets `pullRequestReviews` SHALL NOT load.
    WHEN classic protection is on but GitHub hides it from a non-admin THEN
    the rule SHALL show as unknown with that reason; only a count GitHub
    showed SHALL apply, and Avoozl SHALL invent none.
14. A review session SHALL end only through its verdict report. A turn that
    ends without one SHALL be nudged as a quiet session and SHALL NOT count
    as approval.

### Requirement 37: Every finding is closed

Design §5.2.

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
   earlier verdicts of the same role on the same delivery, each as `fixed`,
   `unchanged`, or `withdrawn` when the worker's answer shows it was not a
   defect, because a finding nobody answers is a finding lost.
4. Avoozl SHALL check each closure against the changed files: `fixed` needs
   at least one of the finding's paths to have changed in the task's own
   diff between the two subject commits; `unchanged` needs none of them to
   have changed; `withdrawn` is the reviewer's own word and needs no check.
   A closure that fails the check SHALL be refused.
5. An `observation` closed either way SHALL be closed. A `defect` closed as
   `unchanged` SHALL stay open, so `approved` stays refused while it does.
6. Only a person SHALL dismiss an open finding, when retrying a delivery
   that stopped for a decision; the dismissal SHALL be recorded with who and
   why.
7. Rules about a domain's own artifacts (for example, what a multi-step
   rewrite flow in another repository must leave in its run folder) SHALL
   stay in that repository's validation script, run as one of the
   repository's checks. Avoozl SHALL NOT encode them.

### Requirement 38: Checks that cannot run keep the gate shut

Design §5.2.

**User story:** As a maintainer, I want a check that could not run to block
acceptance, so that a broken tool never reads as a pass.

#### Acceptance criteria

1. A check SHALL have one of three results: passed (exit 0), failed (any
   other exit), or not run (the command could not start, timed out, or was
   not reported). Exit codes 126 and 127 SHALL read as not run.
2. WHEN any of the repository's checks the commit runs is not run THEN the
   gate SHALL stay shut: the commit SHALL NOT be verified, accepted, or
   integrated.
3. A not-run check SHALL fail the checking session, not the writer's
   attempt, because the writer did nothing wrong; the check SHALL be retried
   within the retry bound and then open a decision.
4. `task.accept` SHALL take a person's typed evidence, or derive it from
   validation Avoozl recorded: every repository check passed at the leaf's
   integrated commit.
5. Validation evidence used for acceptance SHALL be for the task's current
   commit and SHALL cover every repository check, not the earliest
   validation on record or a subset of checks.

### Requirement 39: Replacing a task by hand

Design §5.2.

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
4. A chain with a cycle SHALL be refused.
5. Supersede SHALL NOT be used for review rework, which stays inside one
   delivery as new attempts (Requirement 36.10).

### Requirement 40: Content rules

Design §4.9.

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
   request titles and bodies; comments and replies;
   worker, verifier, and reviewer briefs; and each worker's diff before it
   merges, added lines only. A rule set MAY narrow the boundaries and
   repositories it applies to; by default it applies to all of them.

4. Text SHALL be decoded before matching (percent escapes, HTML character
   references, zero-width characters, backslashes), so that an encoded term
   still matches.
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
    (design §4.7), and the secret screen on markers, workspace publications,
    and broad-issue previews SHALL be built-in rule sets of this feature.
    Configuration SHALL NOT turn a built-in rule set off.
13. The release leak scan (Requirement 24.2) SHALL use the same terms file
    parser and matcher, and SHALL keep its public rules and its terms file
    location. For private-term findings it SHALL print the rule id and the
    file and line, not the matched line.
14. Public Avoozl files SHALL name no company-internal tool, term, or rule
    (Requirement 34.10). Tests SHALL use only fake terms files and a fake
    rules plugin kept in the test tree.
15. A terms file MAY hold allow lines
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
16. Settings > Content rules SHALL offer
    Design a rule set, which opens a chat seeded with the shipped
    `avoozl-rules` skill. The chat SHALL suggest rule and allow lines and
    SHALL NOT write a terms file; the person saves terms in the editor. The
    button and the skill SHALL warn that terms typed into a chat stay in its
    transcript.
17. Residual risk: text a worker
    writes to GitHub itself, such as pull request titles and bodies and
    `gh` comments, does not pass through Avoozl and is not checked by
    content rules. The pre-push hook checks the diff, and quoted outside
    text in briefs (Requirement 10.6, 10.11) narrows what can steer it.

### Requirement 43: Flow timing

Design §4.11.

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
   checks SHALL count as `tests`, any other shell call as
   `commands`, and the rest as `coding`.
5. WHERE tool calls cannot be read (a process session, or a Kiro Crew
   without that read) THEN Avoozl SHALL use the phase markers a
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

Design §4.11.

**User story:** As the owner, I want new work to stop when a change breaks
something that worked, so that a failure is fixed while it is fresh instead
of every later task building on it.

#### Acceptance criteria

1. Avoozl SHALL stop the line WHEN a repository check that passed on a
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

Design §4.11.

**User story:** As the owner, I want every pushed commit to have passed the
repository's checks on the machine that made it, so that CI only confirms
and nobody waits on CI to learn about a failure.

#### Acceptance criteria

1. The setting `flow.localChecksFirst` SHALL default to `true`.
2. WHILE it is on THEN every brief for a session that may push SHALL tell
   the worker to run the repository's checks in its worktree before each
   push, and a `done` report for a pushed commit SHALL list each check's
   name, command, exit code, and duration for that commit. The checks are
   the ones the commit's diff picks, as in Requirement 7.1.
3. WHILE it is on THEN Avoozl SHALL refuse a `done` report for a pushed
   commit whose check list is missing, names another commit, or has a
   failed check. A not-run check SHALL keep the gate shut as in
   Requirement 38.
4. WHILE it is on THEN the pre-push hook Avoozl installs in its worktrees
   (task 10.4) SHALL refuse a push whose commit has no recorded local pass
   of every repository check the commit runs. It SHALL NOT run the checks a second time.
5. WHEN CI fails on a commit that passed locally THEN Avoozl SHALL record a
   "CI only" failure with the check names, so that a difference between the
   two environments shows in the Flow tab.
6. Local delivery, where nothing is pushed, SHALL be unchanged: the
   checks already run on this machine (Requirement 7.1).
7. Avoozl SHALL NOT enforce this on sessions it does not open; the Flow tab
   SHALL show their CI wait like any other.

### Requirement 46: One session per task

Design §4.11.

**User story:** As the owner, I want each task to run on its own, so that
every task keeps its own commit, checks, review and timing.

#### Acceptance criteria

1. Avoozl SHALL hand each ready leaf to its own worker session and its own
   worktree. An agent MAY group its own work inside one task.
2. Checks and review SHALL run on the task's own head commit.
3. Every task SHALL keep its own ID, acceptance, commit, timing and
   evidence.

### Requirement 47: Retrospectives

Design §4.11.

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
   `avoozl-retro` agent on the model `roles.retro.model` (default `auto`,
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
   schema and SHALL drop a proposal that fails it, recording why. A
   proposal MAY also be typed `prompt` or `skill` (Requirement 68).
5. A settings proposal SHALL be limited to keys the Settings page can edit.
   Avoozl SHALL refuse proposals to change content rules, plugin trust or
   approvals, trigger actors or minimum permission, crew trust, and tokens.
   A proposal that removes a review role or a repository check SHALL be marked
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

Design §4.11, §8.4.

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
   bar, and each span's stage, length, and source.
5. The Dashboard SHALL show the **Line stopped** banner of Requirement 44.9
   above every other section while a stop is open.
6. Settings SHALL have one **Flow** group with sub-groups **Timing**
   (read-only explanation, no fields), **Stop the line** (scope), **Local
   checks first** (on or off) and **Retro**
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

### Requirement 50: Incoming items from every source

Design §4.12, §8.5.

**User story:** As the owner, I want work from GitHub, an internal ticket
tracker, an internal code review system, and anything else I script to
come into Avoozl the same way, so that one "who counts" check and one
intake list cover all of it, and an outside tool can hand Avoozl an item
over MCP.

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
   intake SHALL write the issues it lists as items with
   `source: "github"`, with the actor check and snapshot freeze of
   Requirements 10 and 12.
5. The operations `intake.submit`, `intake.list`, and `intake.view` SHALL
   live in `operations.mjs` and be shared by the page, the CLI
   (`avoozl intake submit|list|view`), and MCP (the grouped `plans_intake`
   tool of Requirement 56, actions `submit_items`, `items`, and `item`).
   Existing `plans_*` names SHALL NOT change. `intake.list` and `intake.view` SHALL only read.
6. Sources SHALL be declared under `intake.sources` in
   `.avoozl.json` or in the machine-local Avoozl settings, like `plugins`
   entries (Requirement 34.1): an id (`github` and `local` reserved),
   `via` (`plugin:<id>` or `mcp`), the registered workspace `repository`
   its work lands in, and optional `labelFields`, `assigneeField`,
   `allowedActors`, and `minimumPermission`. Settings SHALL warn before
   saving a source into a `.avoozl.json` in a public repository. GitHub
   repositories are declared here too, as `via: "github"`.
7. A plugin MAY provide `intake` and implement
   `poll({cursor, limit})`, returning `{items, cursor, more}`. The tick
   cron SHALL call it at most once per source per tick with the stored
   cursor, and SHALL store the new cursor only after every item of the
   reply is handled. A failed or invalid poll SHALL keep the cursor and
   the stored items, show the error on the source, and leave the rest of
   the tick running (design §4.8 failure isolation).
8. `intake.submit` SHALL take `{source, items}` with 1–100 items for a
   source whose `via` is `mcp`, and return a result per item (`created`,
   `updated`, `unchanged`, `stale`, or `refused`, with a reason) and
   where it went. A submit to `github`, to a plugin source, or to an
   undeclared source SHALL be refused. Both ways in SHALL produce the
   same record and run the same pipeline.
9. Each stored or changed item SHALL go through, in order: dedup, content
   rules, trigger match, then the matched action (`deliver`, `execute`,
   `plan`, `respond`, `pause`, `resume`, `quarantine`), or the intake list,
   where it waits for a person, when no rule matches.
10. Content rules SHALL gain an `intake` boundary (Requirement 40.3) that
    screens an item's title, body, labels, and fields. A `block` finding
    SHALL quarantine the item and open a decision that names the set and
    rule but never the matched text; a `report` finding SHALL be recorded
    and the item SHALL continue. No built-in set SHALL run at `intake`, so
    GitHub intake behaves as before unless a set names the boundary.
11. A rule's `match` SHALL accept one `source:<id>` term. A rule without
    one SHALL match only GitHub items. For a
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
    the source repository's `allowedActors` and `minimumPermission` (default
    `write`). A plugin without the `actor` capability SHALL have no
    allowed actor.
14. An MCP caller SHALL count as the local owner, with no verifiable
    outside actor: whatever `author` or `trigger` it sends is recorded as
    its claim. Its items SHALL be listed, MAY meet `pause` and
    `quarantine` rules, and SHALL NOT meet a `deliver`, `execute`,
    `plan`, `respond`, or `resume` rule. A close it reports SHALL be
    treated as a close by an actor who is not allowed (criterion 18).
15. A person SHALL be offered **Plan this** (an inbox task
    tied to the item, through `task.capture`) and **Deliver this** (one
    leaf in the source's repository, pinned to the item's snapshot) on a
    non-GitHub item. Both SHALL be refused with 403 from an agent session
    or MCP, like `content.allow`.
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
    callers SHALL be refused.
18. WHEN a source closes an item tied to a task THEN an allowed actor's
    close SHALL be an order that releases dependents, is recorded, and never
    counts as a verified completion; any other close, or one whose actor is
    unknown, SHALL hold the dependents and open a decision. Avoozl SHALL NOT reopen the
    item. A reopened item withdraws the order; dependents wait again for
    new dispatch only, and running sessions are left alone.
19. An item of kind `review` SHALL go to the review flow, never to
    delivery: no `deliver`, `execute`, `plan`, or `respond` rule SHALL
    match it.
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

### Requirement 51: Archiving a plan, and review state shown plainly

**User story:** As the owner, I want to put a plan away and bring it back
later without losing anything, and I want a task marked "review" with no
review behind it to say so, so that I never look for a review chat that does
not exist.

Delete (`plan.delete`) is the one-way path: it archives the plan's open task
rows and keeps the plan only as history, and an approved plan cannot be
restored. Archive is the reversible one. There is no separate "retire"
action: retiring is what Delete does to a plan with an approved revision.

#### Acceptance criteria

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
   the Dashboard's In flight list.
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

### Requirement 53: Agent and model per session

Design §4.10 "Agent and model per session".

**User story:** As the owner, I want to choose which agent and model write
the tasks, so that hard work gets a strong model and routine work gets a
cheap one.

#### Acceptance criteria

1. The checks role and review roles SHALL keep their own `agent` and
   `model` (design §5.2).
2. The writer's session SHALL come from the `worker` row of the `roles`
   table (Requirement 98.5), and then Kiro Crew's default agent and `auto`.
3. A retry or resume of the same task SHALL keep the model of its last
   attempt unless that model is `out`, so that one task's work stays on one
   model.
4. For a review role with `distinctFrom: model` (Requirement 36), Avoozl
   SHALL NOT give the writer that role's model. IF no model is left THEN
   the task SHALL wait and Avoozl SHALL open one decision. Avoozl SHALL
   never run a review on the writer's model under `distinctFrom: model`.
5. Every session binding SHALL record the agent and the model asked for,
   how they were chosen (kept or the default), and the model Kiro Crew
   reports it ran on, when Kiro Crew reports one (design F65).
6. The Delivery view SHALL show the agent and model of each running
   session.

### Requirement 54: Pull request feedback goes back to its writer

Design §4.13.

**User story:** As the owner, I want failed checks, review comments, and
merge conflicts on an Avoozl worker's pull request sent back to that
worker, so that the pull request gets fixed and merges without me.


#### Acceptance criteria

1. This requirement SHALL cover each task whose pull request an Avoozl
   worker session writes.
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
   message SHALL go to that session. WHEN no worker session is live (it ended, failed,
   or was closed) THEN Avoozl SHALL open a new attempt on the same branch
   with a resume brief that carries the events (Requirement 8), with the
   agent and model kept per Requirement 53.3.
8. A feedback round SHALL be one message or new attempt. Each leaf SHALL
   get at most `delivery.feedbackRounds` rounds (default 5, per
   repository or workspace). WHEN the bound is reached, or the same check
   name fails on 3 head commits in a row, or the worker reports `blocked`
   THEN Avoozl SHALL stop relaying for that leaf and open one decision
   under **Needs you** that says which.
9. A new attempt opened for feedback SHALL count against the retry bound
   of Requirement 8 as well as the round bound.
10. Avoozl pushes, updates and merges the pull request (Requirement 87); the worker chat only edits and commits. Avoozl SHALL
    NOT comment or re-run checks for this requirement.
11. A check that failed in CI after passing locally SHALL still be
    recorded as "CI only" (Requirement 45.5), in addition to being
    relayed.
12. A comment that is both a review comment and a steering mention SHALL be
    sent once.
13. The Delivery view SHALL show, for each covered leaf, its latest event,
    rounds used out of the bound, and the session the last round went to.
14. A repository MAY set `delivery.prFeedback: false` to turn this off.
    It SHALL be on by default, because delivery is meant to run without
    a person (Requirement 87).

### Requirement 55: Plugin bundles and settings packs

Design §4.14.

**User story:** As a team lead, I want one shared plugin to carry our
settings, our content rules, and our intake source, so that
each repository mostly installs one plugin, and nothing in it changes a
setting or runs until someone on that computer has seen it and approved it.

#### Acceptance criteria

1. A plugin manifest MAY list `provides`: any of `pack`, `rules`, and
   `intake`, each once. Each part SHALL run as a code kind (Requirement
   34.3): `rules` as `rules`, `intake` as `intake`; `pack` SHALL run as
   nothing.
   A manifest without `provides` SHALL keep working, each of its `kinds`
   being one part. A manifest with both SHALL have `kinds` equal to the
   kinds its parts need, or be refused naming the mismatch.
2. One plugin SHALL be one install, pinned to one version, content hash,
   and, for git, commit (Requirements 34.4, 34.13). Its approval SHALL list
   every part, and Settings and the Add plugin review step SHALL show each
   part in plain words.
3. A pack SHALL hold settings only and SHALL never run code. A manifest
   whose parts are only `pack` SHALL have no `entry` and SHALL be refused
   if it names one; Avoozl SHALL start no process for it.
4. The pack file (`avoozl-pack.json`, or the file the manifest names) SHALL
   hold `description` and `settings`, and `settings` MAY set only:
   per-repository `rules` (trigger `match` lines), `allowedActors` and
   `minimumPermission` (who counts), `requiredChecks`, `priorityLabels`, and
   `managedLabels`; `epicIssueType`; `contentRules` `sets` as references
   only; `delivery` `reviewers` (review roles), `agent`, `model` and
   `runner`; and `flow`. Every value
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
   part SHALL answer `poll` (Requirement 50.7). Each polled item SHALL be
   checked as in Requirement 50.2: a bad item refused naming its field, the
   others kept. Storing items and the pipeline stay with Requirement 50.
9. A plugin **shared with the repo** SHALL put its entry in `.avoozl.json`
   (Requirement 34.1) and SHALL still be approved on each computer.
   Importing the pack of a plugin declared on this computer only SHALL
   need the person to confirm that its id and settings go into
   `.avoozl.json`.
10. The plugin guide and the app's plugin skill SHALL describe bundles,
    packs, and intake, with a sample bundle in the test tree that names no
    private system or company.
11. A pack and a repository entry MAY set `waitingLabels`: labels meaning the item waits on someone outside. A task
    whose item carries one SHALL wait in **Blocked or waiting** with the
    reason "Waiting on the author". Absent, nothing changes.
12. A pack and a repository entry MAY set `priorityLabels`, an ordered
    list. A
    task's best priority label SHALL set its order inside Ready and Up
    next, after a set rank, and SHALL never change its lane. Absent,
    nothing changes. The sample pack sets `waitingLabels:
["response-requested"]` and `priorityLabels: ["p0", "p1", "p2",
"p3"]`.

### Requirement 56: Fewer MCP tools, every safe action

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
   repositories, GitHub setup writes, flow
   settings and Run anyway, and deletes SHALL be person only. An MCP call
   that reaches one, under any tool name, SHALL be refused
   before anything runs, saying to do it in the app. A test SHALL fail
   when an operation has neither an MCP route nor a written reason it has
   none, and a test SHALL check that each person-only operation is refused.
   Marking a manual task done or reopening it, and editing or removing a
   task's links, are person only too (Requirement 61.13 and 61.22).
3. Only registered tools SHALL be listed or answered. A narrow
   tool that a shipped agent, role prompt or brief names (such as
   `plans_report`, `plans_get_plan` or `plans_submit_review`) SHALL stay as a
   current tool, so no agent's allowedTools grows. Agents, prompts and briefs
   SHALL name only registered tools, and a test SHALL fail when one names a
   tool that is not registered or when a read-only role is given a grouped
   tool with write actions. The planner's four reads (`plans_query`,
   `plans_get_task`, `plans_documents`, `plans_get_document`) SHALL be
   narrow tools over the `query`, `task.get`, `plan.table` and
   `document.get` operations.
4. A session MAY archive and unarchive a plan, and the record SHALL name
   the session.
5. A grouped tool with a read-only name SHALL stay read only, so an agent
   allowed that name gains nothing.

### Requirement 57: New plan from the Plans page

**User story:** As the owner, I want to start a plan from a few fields on
the Plans page, so that a planner drafts its spec folder by Avoozl's rules
without my writing a prompt.

#### Acceptance criteria

1. The Specs page SHALL have a **New spec** button in its heading that opens
   a centered modal with Name (the spec folder name), Category (pick or
   type), Epic and Phases (Requirement 59.11), Repositories (checkboxes of
   registered code repositories), What you want (required) and Links and
   context (optional), starting Blank or From template (Requirement 61.7).
   Cancel SHALL ask first when anything was typed.
2. Avoozl SHALL refuse a name that is not a spec folder name, or that a
   plan or spec folder already uses; a request with no registered
   repository, no picked repository or no goal; and a seed that a content
   rule blocks. A refused request SHALL record nothing.
3. Submit SHALL open a planner chat seeded with the fields and Avoozl's
   spec rules: the `.kiro/specs/<name>/` layout with requirements.md,
   design.md and tasks.md with `$` fact bullets, the `category:`
   front-matter, unique task IDs, the folder and the repositories. Submit
   hands the request to Spec Builder (Requirement 65); the planner chat is
   the fallback.
4. The tick SHALL import the folder as a draft plan once it lints clean.
   New plan SHALL never approve a plan, turn on Autopilot (delivery) or push.
5. Every top button on the Plans page SHALL show an icon.

### Requirement 58: Onboard a repository

**User story:** As the owner, I want adding a repository to offer a guided
Onboard flow, so that a repository goes from nothing to plans ready to
approve without my running setup steps by hand.

#### Acceptance criteria

1. Settings › Repository setup SHALL offer **Onboard** (now the **Add repository** entry, #515), a stepped dialog with
   Cancel on every step: pick folder, pick mode, check GitHub, set up,
   pick approvers, import specs, leak scan, finish. A step that does not
   apply SHALL be left out; a step already satisfied SHALL show as done and
   MAY be skipped.
2. Pick folder SHALL show the checkout, its remote, default branch,
   `.avoozl.json`, `.kiro/specs` folders, and whether the workspace already
   has it. No remote and a non-GitHub remote SHALL allow Local only only.
3. Check GitHub SHALL be the read-only Set up GitHub preview, listing each
   item as create, change or keep.
4. WHEN the person cancels before Set up THEN nothing SHALL have been
   written. In Set up each GitHub write SHALL ask first.
5. Import specs SHALL list spec folders with their lint results and adopt
   them from git with the reader `avoozl rebuild` uses (Requirement 114,
   design §4.42), and no second reader: a spec whose current text a commit
   on main by an approver touched SHALL come in approved; a task ticked
   `[x]` on main SHALL come in done, with the commit that ticked it as its
   landing commit; and every other spec SHALL come in as a draft. A spec that already has a plan
   SHALL be left alone. An approval is the commit's author email on the
   approvers list; the commit message plays no part.
6. Pick approvers SHALL list the repository's commit authors on its base
   branch, most commits first, leaving out Avoozl's own author. Nothing SHALL
   be approved until the person has confirmed the list; an empty list SHALL
   import every spec as a draft. In a GitHub mode the confirmed emails SHALL
   be added to the repository's `allowedActors`.
7. WHEN the repository that holds the specs is public THEN the leak
   scan SHALL check the specs against the content rules and the public
   secret and machine-path rules, name each finding by file and line only,
   and hold the next step while any finding remains.
8. The flow SHALL approve a plan only through the adopt step above, and for
   no author the person left off the confirmed list. It SHALL never start an
   agent or push. It SHALL make no per-task issue text: Avoozl makes no
   per-task issues.

### Requirement 59: Epics span plans, phases sit inside plans

Design §6.9.

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
   SHALL be the nearest heading of level 2 or lower above its item in
   `tasks.md`, and the heading text SHALL be its title. A task under no
   heading SHALL sit under its plan as **No phase**. Phases SHALL group and filter only:
   they SHALL NOT add edges, readiness or completion.
6. Avoozl SHALL NOT invent an epic or a phase. It SHALL NOT create
   `doc:<path>` epics or any other grouping named after a file. A task with
   no plan SHALL show under **No plan**. No view, list, filter, export or
   brief SHALL show a raw `doc:` ID or a file path as an epic or phase name.
7. Inside a plan, the `kind` fact values SHALL be `package` and `leaf`
   (Requirement 4.3). A task with `kind: epic`, a task `epic`
   fact, an `epics` key in a plan's front-matter, and an
   epic entry's `memberPlan` key SHALL each be a validation error naming
   the file, the entry and the edit that fixes it. Avoozl SHALL NOT load
   any of them under another name.
8. A published epic SHALL have one issue, with one sub-issue per published
   member spec, in each spec's home repository. Tasks and phases SHALL never
   be issues. Cross-repository linking failures SHALL
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
11. The New plan drawer (Requirement 57.1) SHALL offer **Epic** (pick an existing epic, optional) and
    **Phases** (optional) instead of "Epics or phases"; the planner writes
    the `epic:` front-matter and the phase headings.
12. No operation, CLI command or MCP action SHALL migrate a workspace.
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

Design §4.16.

**User story:** As the owner, I want to start a plan from a reusable
workflow, such as an SDK rewrite, with its phases, proofs, settings and
flow habits already in it; to put steps in a plan that only people do,
such as a team review; and to keep links on any task, so that a repeated
kind of work starts the same way each time, a person's step gates the work
after it, and what was decided stays with the task.

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

9. A leaf MAY set `$manual: true` in its facts: a step only a
   person does. A manual leaf SHALL have `done` (what the person
   checks) and `repo` (where its issue lives in a GitHub mode). It SHALL
   NOT hold `paths`; lint SHALL refuse it, naming the key.
10. A manual leaf SHALL never be dispatched, verified, reviewed or
    integrated, and SHALL never appear in the ready leaves a conductor or
    the tick reads. Edges into and out of it SHALL work as for any task;
    its dependents SHALL wait until it is done.
11. Before its blocking edges hold, a manual leaf SHALL sit in **Blocked or
    waiting**. Once they hold, it SHALL sit in **Needs you** with the tag
    **Manual** and the reason "Waiting for a person: <title>", in every
    view. No new lane SHALL be added.
12. The task drawer SHALL show a manual leaf's acceptance and a **Mark
    done** button. Mark done SHALL open a dialog with optional links (criterion 16) and a choice of **Done** or **Skipped**,
    and SHALL record who, when, the choice and the outcome. Dependents
    SHALL be released by either choice; Skipped SHALL show on the task.
13. Marking a manual leaf done or reopening it SHALL be person only (page
    and CLI). An MCP call SHALL be refused under Requirement 56.2.
15. Flow (Requirement 43) SHALL count a manual leaf's time in Needs you as
    waiting on a person, and SHALL leave it out of first-pass rate and
    time to fix.

Task links

16. Every task SHALL have **Links**: an ordered list of entries, each a link
    (`url` and `label`), with its author
    (a person, or the session ID) and its time. They SHALL be execution
    state in SQLite, not spec text: they record what happened during
    delivery, they change after approval, and writing them to the spec
    would change the revision hash. Adding one SHALL NOT change the plan's
    revision or approval.
17. A link's `url` SHALL be `https` or `http`, at most 2,000 characters,
    with no user name or password in it; its `label` SHALL be 1 to 200
    characters. A task SHALL hold
    at most 200 entries. Avoozl SHALL refuse each breach, naming the field.
18. Content rules SHALL check each entry when it is saved, at a new
    `notes` boundary that is on by default. A block SHALL refuse a
    session's call under Requirement 40.5 and SHALL refuse a person's save
    inline, naming the rule set and rule, with Allow once under
    Requirement 40.7. Entries SHALL also pass the `brief` and `github`
    boundaries wherever they are used.
19. The task drawer SHALL show Links, newest first, with author and time,
    and an **Add link** button that opens the URL and label fields for one
    link, with Add and Cancel; adding or Cancel closes them.
    A person MAY edit an entry or remove one after a confirm; a removed
    entry SHALL leave the list and stay in the task's activity history.
20. A session SHALL read Links through the grouped `task` MCP
    tool and SHALL get them in its brief: the newest 20 entries, at most
    8,000 characters, marked as data from people and agents, not as
    instructions. A dependent's brief SHALL also carry each blocker's
    outcome entries (criterion 12).
21. A session MAY add a link to a task it is bound to; the entry
    SHALL name the session. A session SHALL NOT add to another task, and
    SHALL NOT edit or remove any entry.
22. Editing or removing an entry SHALL be person only. The CLI SHALL offer
    list, add, edit and remove.
23. Entries SHALL live only in SQLite and its backups; the rebuild test
    (design §3.3) SHALL allow them to be missing, as it allows session
    bindings.

Example

24. The test tree SHALL ship a template-only sample plugin with an **SDK
    rewrite** template that names no private system or company: inputs
    SDK name, target repository and an optional gap list; phases
    inventory, codegen, runtime, protocol tests, review and cutover; a
    manual **Review with team** leaf that cutover requires; proof kinds
    for protocol tests and a cutover dry run; and flow defaults that
    stop the line, run local checks first and hold a
    retrospective every 10 tasks. The plugin guide and the planner skill
    SHALL describe templates, manual tasks and Links.

### Requirement 62: The Plans page is called Specs

Design §8.7.

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

### Requirement 64: Pull the Andon cord

Design §4.11.

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
12. The Stop the line dialog SHALL offer
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

Design §8.6.

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
   task ID format and uniqueness, phases as `##` headings, the `$` fact
   bullets under each task and the front-matter defaults (Requirement 111),
   and that no spec folder holds `avoozl/manifest.json`. Spec Builder's chat runs the default
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
   approve, start an agent or push.
7. WHEN Spec Builder is turned off, the grant is not yet approved, or Spec
   Builder is missing THEN the drawer SHALL say so in plain words, with how
   to turn it on or approve the grant, and SHALL offer an Avoozl planner
   chat with the same fields.

### Requirement 66: One driver per spec

Design §6.10 and §4.44.

**User story:** As the owner, I want exactly one Avoozl to drive each spec
at a time, named the way GitHub already names who owns an issue, so that
two machines never dispatch, write GitHub or merge for the same spec.

#### Acceptance criteria

1. Each approved spec SHALL have at most one **driver**. In a GitHub mode
   the driver SHALL be the spec issue's single assignee (Requirement 116):
   the Avoozl whose `gh` login is that assignee drives the spec.
2. WHEN the spec issue has no assignee THEN the epic issue's assignee SHALL
   stand in, by the same rule; a spec issue with several assignees SHALL NOT
   fall back to the epic. WHEN the result is several assignees THEN every
   workspace SHALL read only for that spec, and Avoozl SHALL open one
   decision naming the issue and its assignees.
3. Avoozl SHALL never change an assignee. Handing a spec to someone SHALL be
   pushing the branch, mentioning the spec issue in it and reassigning the
   issue on GitHub; unassigning SHALL release the spec.
4. The machine ID SHALL be `mch_` plus 16 lowercase base32 characters, made
   once and kept in machine-local settings. A person MAY add a machine
   label; it SHALL pass the `github` content-rule boundary (Requirement 40),
   and Avoozl SHALL never fill it from the host name.
5. The tick SHALL read each spec issue's assignees in its sync step, and
   SHALL read them again right before each dispatch, before projection, and
   before each integrate or merge for that spec. WHILE this workspace is not
   the driver THEN the spec SHALL be read-only here: the tick MAY refresh
   its own cache and views, and SHALL NOT dispatch, message a session, write
   an issue, label, link or marker, close or
   reopen an issue, revert an edit, integrate, merge, or write the spec
   folder. Other specs SHALL tick as usual.
6. Assignment is not atomic, so the docs SHALL say that a short overlap is
   possible: work the old driver started before its next read of the issue.
   The dispatch-time check SHALL bound it to what one tick started after
   its last read.
7. In Local only mode this workspace SHALL drive every approved spec.
8. The driver's status SHALL be readable on the page, in the CLI
   (`avoozl driver status`) and over MCP. Changing this computer's label
   SHALL be person-only.
9. A spec's own page and row SHALL show its driver: "Driver: you", or who
   the spec issue is assigned to. The app header SHALL NOT show a driver or
   read-only badge. A workspace that is not a spec's driver SHALL show a
   read-only banner on that spec's pages saying why (someone else drives
   it, nobody does, or several assignees) with a link to the spec issue.
   Settings › General SHALL have a **This computer** group with Machine
   label (optional) and the machine ID shown small.

### Requirement 68: Retros propose prompt and skill changes

Design §4.18.

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
    with its type, target, base version, diff, evidence, **Approve** and
    **Reject**, and per prompt the
    versions in use with **Revert**.

### Requirement 71: Activity log and Activity tab

Design §4.19.

**User story:** As the owner, I want one list of what people, sessions,
GitHub and plugins did in this workspace, so that I can see who changed
what and when without reading chats, the tick log or GitHub.

#### Acceptance criteria

1. Avoozl SHALL keep an `activity_log` table in the workspace's SQLite.
   Each row SHALL hold its time, source (`local`, `github`, `plugin` or
   `mcp`), actor, kind, a short summary, a target ID and a link. `plugin`
   covers plugin sync: intake plugins.
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

Design §4.20.

**User story:** As the owner, I want Avoozl to notice when a model provider
runs low or runs out, keep new work off it, and move running chats to
another model without losing their work, so that a rate limit or an empty
credit balance does not stall delivery.

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
   role's model this way (Requirement 53.4).
6. A retry SHALL keep its last model unless that model is `out`; then it
   SHALL pick as a new task does and say that the kept model is out.
8. WHEN a running chat Avoozl opened is on an `out` model THEN Avoozl SHALL
   switch that chat to a healthy model through Kiro Crew's per-chat model
   change, in the same session, so the chat keeps its branch, worktree and
   committed work. A chat with a turn running SHALL switch at the end of
   that turn (Kiro Crew defers it). Avoozl SHALL NOT stop, restart or close
   the chat.
9. Only `out` SHALL switch a running chat; `low` SHALL affect new tasks only.
   The new model SHALL be the person's replacement, else the first healthy
   one among the models Kiro Crew lists,
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

Design §8.9.

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

### Requirement 75: Investigate before coding

Design §4.21.

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
5. `delivery.investigate.mode` SHALL be `all`, `not-small` (the default,
   which investigates every leaf) or `off`. A task's facts MAY set
   `investigate: false` or `true` to override the mode.
6. Investigation and the falsifier SHALL be Flow spans of their own and
   SHALL count in Flow's usage.
7. With `mode: off`, dispatch SHALL behave exactly as before.

### Requirement 76: Evidence bundle per task

Design §4.22.

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

Design §4.23.

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

Design §4.24.

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

Design §4.11.

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

### Requirement 80: Who merges a pull request

Design §4.25.

**User story:** As the owner, I want to choose whether Avoozl's pull
requests open as drafts and who merges them, so that nothing lands before I
want it to.

#### Acceptance criteria

1. `landing.pr` SHALL be the one setting for who merges a `pr` landing's
   pull requests: `draft` (the default), `ready` or `auto`. It MAY be set
   for the workspace at the top level of `.avoozl.json`, shown in
   Settings › Autopilot, and for one repository in its landing block, shown
   on its Landing tab, which wins. A repository that sets none SHALL say it
   uses the workspace's setting. Only a person SHALL change it. Settings
   SHALL show one line per choice.
2. Each pull request Avoozl opens SHALL be a draft exactly when `landing.pr`
   is `draft`, and every `createPullRequest` call SHALL say whether it is a
   draft; a test SHALL check every call site.
3. A draft SHALL wait as **Draft, waiting for you** with one Needs you row.
   It SHALL NOT be merged, auto-merged or put in a merge batch while it is a
   draft, and a required check that fails on it SHALL still go back to the
   worker. A person SHALL release it by clicking Ready for review on GitHub,
   which Avoozl SHALL see on its next read of the pull request with no
   extra GitHub call, or by pressing **Approve** in Avoozl, which SHALL call
   GraphQL `markPullRequestReadyForReview` and only mark it ready. A push to
   a released pull request SHALL NOT make it a draft again. Ready for review
   is the signal because GitHub forbids approving one's own pull request and
   Avoozl opens pull requests as the owner.
4. With `draft` or `ready`, once checks and reviews pass on the exact head
   the pull request SHALL wait as **Ready to merge, waiting for you** with
   one Needs you row. A person SHALL merge it on GitHub, which Avoozl SHALL
   record, or press **Merge** in Avoozl for that exact head; the next tick
   SHALL check that head again and merge it guarded by the head.
5. With `auto`, Avoozl SHALL merge the pull request from the tick once checks
   and reviews pass on the exact head. Avoozl SHALL NOT arm GitHub
   auto-merge.
6. **Approve** and **Merge** SHALL be a person's only: refused for agents,
   MCP and the tick. **Approve** SHALL use the primary button style, since
   it destroys nothing.
7. WHEN a writer's pull request closes without merging THEN Avoozl SHALL
   send the writer one message, as one feedback round, to read why, fix it
   and reopen it, or report blocked.
8. `direct` landing and Local only SHALL have no merge setting: Avoozl lands
   the verified commit itself after its checks pass (Requirement 87).

### Requirement 81: Review a task's changes in the drawer

Design §8.10.

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

Design §6.11.

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
   its Demo badge and Exit demo.
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
4. The demo SHALL use a fake GitHub with an epic issue, sub-issues, pull requests and passing, failing and running checks. It SHALL
   refuse every write, every raw call and every method it does not know.
6. A Demo badge SHALL show in the header on every page while the demo is
   on, and Settings SHALL list only the sample, never the machine's own
   workspaces.
7. One Exit demo button SHALL return to the person's own workspace. A test
   SHALL hash the real workspace's database, configuration, the machine
   catalog and settings before and after a demo and find them unchanged.

### Requirement 83: Security follow-ups from the PR 29 audit

Design §6.12.

**User story:** As the owner, I want repository code, agent sessions and
other local users held to what I approved, so that a public repository or a
chatty agent cannot reach my secrets or my approvals.

#### Acceptance criteria

1. WHEN the CLI is run with `KIROCREW_SPAWNED=1` or `KIRO_SESSION_ID` set
   THEN it SHALL run a person-only operation, SHALL print that it ran in an
   agent session, and an approval SHALL record that in its receipt's
   evidence. The command line is a person's tool, so it does not refuse.
2. The docs SHALL say plainly that person-only stops MCP and app tokens, not
   code running as the user. A draft request to Kiro Crew for passing the
   proxy secret by descriptor or a 0600 file SHALL be kept in
   `docs/kirocrew-requests/`. Nothing SHALL be filed.
3. A new `.avoozl` folder SHALL be 0700 and a new database 0600, set before
   the database opens. Backups and `export --output` files SHALL be 0600. An
   existing workspace SHALL be tightened on open. The docs SHALL say what
   happens on Windows.
4. `docs/checks.md` SHALL name the repository-owned code that runs on its
   own. `scripts/worktree` SHALL run only when the repository's `worktreeHelper`
   equals its SHA-256 hash; otherwise the refusal SHALL show the hash.
5. A repository MAY set `checksEnv`, a list of variable names. Check processes
   SHALL then get only those, the basics needed to start, and never the
   gateway credentials. Without it, checks SHALL get what they get today.
6. A local-folder plugin SHALL be hashed again just before it starts and
   SHALL be refused if the hash changed since approval.

### Requirement 85: The content hook

Design §6.14.. Usage in `docs/content-hook.md`.

**User story:** As the owner of a machine that holds private names, links and
notes, I want any agent that writes to GitHub with my login to have its
writes checked before they run, so that one careless line does not become a
public leak.

#### Acceptance criteria

1. Avoozl SHALL ship a hook command, `avoozl content hook`, that any agent
   can run as a pre-tool-use command before each shell call. It SHALL read
   the call from stdin and, for these writes, run content rules
   (Requirement 40) before they run: `gh issue` create, comment, edit;
   `gh pr` create, edit, comment, review, merge; `gh api` with a write method
   or body fields; `git commit`, `git tag` and `git push`. It SHALL check the
   text, the labels, the branch name, and, for `git push` and
   `gh pr create`, the commit messages and added lines the call would
   publish.
2. WHEN a rule matches, or a rule set the repository needs is unavailable,
   THEN the hook SHALL refuse the call (exit code 2) and name the rule set,
   rule id and place, never the matched text (Requirement 40.8). WHEN the
   text cannot be read from the call, because it comes from a shell
   expansion, THEN the hook SHALL refuse it and say why, so the agent can
   write the text to a file and pass the file.
3. The docs SHALL say the hook's limit: it reads the call, not what a script
   or interpreter does when run, so a write made inside a script,
   `python -c`, or a build tool is not seen, and nothing cleans up such a
   write afterward.
5. Public Avoozl files, tests and docs SHALL use only fake terms, and SHALL
   describe the private side as internal names and company hosts.

### Requirement 86: Avoozl owns the coding loop

Design §4.26.

**User story:** As the owner, I want one coder that Avoozl runs end to end,
from picking a task to landing it, so that work lands overnight without a
second system deciding what to claim, push or merge.

#### Acceptance criteria

1. Avoozl SHALL have one coder: its own worker session, on the harness its
   role names. There is no `coder` setting.
2. Avoozl SHALL run one loop per task, in this order, and each step SHALL
   have one owner:

   | Step    | Owner  | What it does                                                                 |
   | ------- | ------ | ---------------------------------------------------------------------------- |
   | Pick    | Avoozl | Ranks ready tasks by how many they unblock; holds a task whose declared paths overlap a running task anywhere in the repository |
   | Prepare | Avoozl | Adds the task worktree with the approved `scripts/worktree` helper or `git worktree add` |
   | Work    | Chat   | Edits in that worktree, then reports; Avoozl commits sandboxed child changes               |
   | Verify  | Avoozl | Runs the repository's checks in the task worktree, checks the diff against declared paths |
   | Land    | Avoozl | Lands through the per-base-branch queue (Requirement 87)                   |
   | Accept  | Avoozl | Stop the line (Requirement 64) watches every head Avoozl landed             |

3. The worker SHALL edit code and report. Avoozl SHALL commit sandboxed
   child changes; a chat or person MAY commit locally as Requirement 96
   permits. Its brief SHALL NOT tell
   it to push, open or edit a pull request, merge, turn on auto-merge, label,
   or comment. Avoozl SHALL read the commit from the worktree and SHALL NOT
   take the commit from the chat's report.
4. GitHub SHALL hold owned spec and epic issues (Requirement 102), never
   per-task issues or Project task state. External issue labels or
   arbitrary comments SHALL NOT grant authority.
5. Each spec SHALL have one driver, named by its issue's assignee, with
   the epic assignee as fallback only when the spec has none. Ambiguous
   assignment SHALL hold work. A workspace scheduler SHALL coordinate its
   drivers, repository-wide path holds and landing queues.
6. Verify SHALL refuse a diff that touches a file outside the task's
   declared paths, and SHALL send a diff that touches a protected path
   (the repository's `protectedPaths`, plus CI workflows and the
   `scripts/worktree` helper by default) to the owner in Needs you before
   it lands. The same diff SHALL pick which of the repository's checks
   run: a check that names paths runs only when the diff touches one.
7. The repository's checks SHALL run in the task worktree, warm (the
   worktree keeps its dependencies and build output between attempts), in
   their own job off the tick, with a timeout per check, keyed by the
   check's name in `verify.checkTimeouts`. A check SHALL see only the
   environment a process needs to start and the names the repository lists
   in `checksEnv`, and never the push or GitHub credentials, even when
   listed. A check that times out SHALL fail with the reason "timed out
   after N s". Checks are the repository's, named, and picked by the diff;
   a task never names them.
8. Approval SHALL be an approver's commit on the specs branch, cached as
   the hash receipt (Requirement 4.8, Requirement 114).
9. Release ranking and build receipts SHALL feed Pick and Verify.

### Requirement 87: Avoozl lands the work

Design §4.26.

**User story:** As the owner, I want Avoozl to push and merge only after the
checks pass on the exact head it lands, so that main stays green without me
pressing merge.

#### Acceptance criteria

1. Each repository SHALL have one landing block,
   `github.repositories.<owner/name>.landing`, edited in one place,
   Settings › Repository setup › Edit › Landing: `mode`, `pr` (Requirement 80) and
   `method` (`squash` or `merge`, default `squash`). The default
   mode SHALL be `off` until Set up (Requirement 89) writes another. Under
   `off` Avoozl SHALL push nothing and SHALL list the verified commit in
   Needs you. The project's `landing` SHALL still be the mode of a
   repository whose block sets none, and the block's mode wins. A file that
   sets `merge.method` SHALL NOT load.
2. `direct` SHALL select an exact verified working-branch portion, or a
   merge batch of waiting members across specs and drivers, up to the size
   limit of `merge-batches` MB2. A landing worktree SHALL stack them on the
   current base, check that exact candidate, and fast-forward from the
   recorded base. A moved base SHALL require a new candidate and checks. A
   failed merge batch SHALL be narrowed to one culprit (`merge-batches` MB4).
   Declared append-only `landing.unionPaths` SHALL merge only in that landing
   worktree and SHALL still pass all checks.
3. `pr` SHALL open or reuse one pull request for an exact verified portion,
   including a head on an authorized fork. Each head SHALL have its own
   required checks and standing review; a changed head SHALL obey the
   repository's approval rules. Only the head of the per-base queue MAY be
   updated. Source push permission SHALL NOT imply target merge permission.
   Without merge permission Avoozl SHALL observe an authorized maintainer's
   merge. Protected review SHALL NOT combine unrelated pull requests into a merge batch.
4. Avoozl SHALL land only after checks passed on the updated head. It SHALL
   never force push, never use `--admin`, and never bypass a required
   review or check.
5. Landing SHALL be serialized per base branch through one queue, using the
   work lock (`withWorkLock`, `src/app/git/git.mjs`). Stop the line SHALL pause
   the queue; a paused queue SHALL keep its order.
6. WHEN a merge of the base into the task branch conflicts THEN Avoozl SHALL
   send the conflict to the same worker chat with the list of conflicted
   files, for at most the repository's `conflicts.maxAttempts` rounds
   (default 2). A later failure SHALL go to Needs you. A file that sets
   `landing.conflictRounds` SHALL NOT load.
7. A task SHALL start from its spec's recorded working head. Only verified integrations SHALL
   advance that head. After landing, Avoozl SHALL merge the new target base
   back into the working branch without force pushing. Progress on that
   branch SHALL NOT be confused with acceptance on the landing branch.
8. Avoozl's own repository SHALL honor its current owner-selected landing
   policy. Setup SHALL NOT restore disabled required checks or change real
   repository settings without the owner's explicit approval.
9. Every push and merge SHALL pass the pre-push content rule (Requirement 40)
   on the commit messages, the branch name and the added lines first.
10. A push or merge made by the tick SHALL run as the tick's own process,
    not from a chat shell. The proof of Phase 40 SHALL show that a tick push
    goes through under Kiro Crew's push policy, which checks chat shell
    commands.

### Requirement 88: Unattended worker basics

Design §4.26.

**User story:** As the owner, I want a chain of tasks to keep moving while I
am away, through a gateway restart, so that I come back to landed work
instead of a stuck chat.

#### Acceptance criteria

1. Avoozl SHALL set each lane chat's trust mode, worker and reviewer, when
   it opens the chat and SHALL set it again on every tick, because a gateway
   restart loses it.
2. A worker SHALL report by CLI from its worktree. Avoozl SHALL match the report to the task by the worktree path
   and the task's report token in the brief, so a report needs neither MCP
   sharing nor the gateway's session identity.
3. A local worker chat SHALL open with `project: false` and the worktree path
   in its brief.
4. WHEN Kiro Crew reports a worker chat gone THEN Avoozl SHALL start the
   task once more on a free worker lane, in the same worktree with the same
   brief and the last report quoted as data, and the closed lane SHALL wait
   for a person's Resume (simplify SM20.8). A second vanish of the same task
   SHALL go to Needs you.
   Avoozl SHALL NOT replace a chat because it went quiet or its activity
   lease expired.
5. `lanes.local`, default 3, SHALL be a setting in the machine file
   (Requirement 6.3).
6. Prepare SHALL use the approved `scripts/worktree` helper
   (`createWorktree`, `src/app/git/git.mjs`).
   Avoozl SHALL remove a task's worktree and its local branch after the
   task lands, and SHALL keep them for a task that did not land.
7. The page SHALL have a Delivery page and a Files and diff view in the
   task drawer.

### Requirement 89: One setup command

Design §4.26.

**User story:** As the owner, I want one command that shows what it will
change in the repository settings and on GitHub and then does it, so that a new
repository is ready to land in minutes.

#### Acceptance criteria

1. `avoozl setup REPO` SHALL preview every change, then apply it only after
   `--yes` or a confirm on the page. A second run with nothing to change
   SHALL say "Nothing to change" and write nothing.
2. It SHALL write the repository config: root, base branch, checks, declared
   protected paths, the worktree helper hash after the person read it, and
   the landing setting.
3. For a GitHub repository under `pr` it SHALL: update the branch ruleset to
   require the named checks, adding only what is missing and never a second
   rule of the same kind; set the allowed merge methods; set the CI variable
   that tells CI an Avoozl run is landing; and post a commit status
   `avoozl/verify` on each head Avoozl verified (`createCommitStatus`).
4. Setup SHALL NOT create task labels, a Project, task issue types or task
   issues. Spec issue publication SHALL be an explicit per-spec action,
   separate from approval. Setup SHALL preview trusted source repositories,
   optional forks and their push permissions separately from the target's
   landing permissions, without creating another workflow mode.

### Requirement 92: Links to related GitHub items, and the landing queue

**User story:** As a driver, I want each spec and task to link to its issue,
branch, pull request, checks and landed commit, so that I can reach the
GitHub item in one click without Avoozl copying GitHub's browser.

#### Acceptance criteria

1. Avoozl SHALL build one link set per spec and one per task, only from
   records it already stores: the spec issue (Requirement 102),
   the spec working branch, the task branch and worktree, the task pull
   request and its check state from landing (Requirements 87 and 88), the
   landed commit from delivery records, and the intake issues a spec came
   from.
2. Building, showing, filtering or refreshing link sets SHALL make no GitHub
   call. A counting-client test SHALL show the call count with link sets on
   equals the count without them.
3. Link targets SHALL be built from validated repository names, numbers,
   ref names and SHAs only, never from a URL read from issue or comment
   content. A missing record SHALL show as missing. Check state SHALL show
   its age, and state from a head that is no longer current SHALL NOT show
   as current.
4. The spec details panel SHALL have a **Links** box: the spec issue, the
   working branch, and open pull requests with a check dot each.
5. The task details view, and the Graph modal that reuses it, SHALL have a
   **Links** box: branch, pull request, checks, landed commit and issue.
6. Each In flight row SHALL show small chips: `PR #N` with a check dot, and
   the branch.
7. Dashboards SHALL have a **Landing queue** page next to CI, not its own
   nav pill. It SHALL list what waits to land per target base, in landing
   order, and why each held item is held. It SHALL be usable at 390 and
   1280 px.
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

Design §4.28.

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

2. Avoozl SHALL ship two executors. `kirocrew` SHALL hold the Kiro Crew
   session calls; folders and
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

### Requirement 94: Harness definition files

Design §4.28.

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
4. Permission for unattended children: a write role
   SHALL use the harness's workspace-write sandbox, whose write roots are
   the task folder, the temp directory, and the cache directories the
   repository config names (`sandbox.writeRoots`, for example a compiler cache
   such as sccache); a read-only role SHALL use its read-only mode.
4a. A task worktree's git directory lives in the main checkout
    (`git rev-parse --git-common-dir`), outside those roots, so a confined
    child cannot commit. The child SHALL only edit. Avoozl SHALL make the
    commit in the worktree after the child exits, from the changed files,
    and SHALL check the diff as Verify does (Requirement 86.6); it never
    trusts a worker's commit.
4b. Loading a definition SHALL refuse any argv value that contains
    `bypassPermissions` or `danger-full-access`, or any flag that starts with
    `--dangerously-`, and SHALL name the value. A test SHALL load one
    definition with each and see it refused. The one exception is 4d.
4d. Inner sandbox under Avoozl's sandbox: a harness whose own sandbox cannot run inside Avoozl's (on
    macOS a nested `sandbox-exec` fails with `sandbox_apply: Operation not
    permitted`, so Codex can neither edit a file nor run a command) MAY set
    `permission.write` to exactly `danger-full-access`, its value for no
    inner sandbox. Avoozl SHALL then start such a child only inside its own
    sandbox, with the write roots of 4. WHEN no Avoozl sandbox is active
    THEN it SHALL refuse the session, opt-in (5) or not. Every other place
    and value of 4b stays refused, `permission.read` included, and tests
    SHALL show it refused without the Avoozl sandbox, allowed with it, and
    the other bypass values still refused.
4c. Each repository SHALL have a command allow-list for unattended children
    (`sandbox.allowCommands`: its build and test commands), passed to the
    harness's allow setting, so a child does not stall on a prompt.
    `git push` SHALL never be allowed, and adding it SHALL be refused.
5. A harness that cannot confine writes to the worktree SHALL be refused for
   write roles, unless the owner opts in for that machine (person-only,
   recorded in Activity).
6a. Plan quota: WHEN a harness on a plan login reports its quota as low
    (Requirement 72's `low` or `out`) THEN Avoozl SHALL start no new session
    on it; running sessions SHALL finish.
7. Adding a second harness SHALL need only its definition file: the proof of
   Phase 48 SHALL fail if any source file changes.

### Requirement 95: The supervisor pass in each tick

Design §4.28.

**User story:** As the owner, I want each tick to own the agent children it
starts, with no process waiting on them, so that a child outlives the tick, a
page reload and a backend restart, and its exit is never lost.

#### Acceptance criteria

1. Each `avoozl tick` SHALL run the supervisor pass, which owns every
   `process` child: its session id, pid, start time, exit code and log
   file, in the machine state folder. Two passes at once SHALL not both run;
   the second SHALL skip (machine-server MS2.3).
2. The supervisor pass SHALL take only session requests for the `process`
   executor, start the child detached in its worktree with the approved
   definition, and record `status` from the child's state.
3. Whatever runs `avoozl tick` runs the supervisor pass: on a Kiro Crew
   machine the app's cron, elsewhere a launchd, systemd or cron timer or a
   driver chat (machine-server MS4). Nothing else starts children.
4. A later pass SHALL find each child again by pid and start time, read
   its exit file once it has ended, resume it on a queued message with the
   same session id, and record a child it cannot find as `gone`
   (Requirement 88.4 applies).
5. Every child SHALL get the environment variable `AVOOZL_CHILD=1` with its
   session ID. The CLI SHALL refuse a person-only command in a child. This
   is a speed bump, not a guarantee: the child runs
   as the owner and could unset the marker, write the database or call `gh`.
6. "A child never does a person-only act" SHALL hold only through the
   sandbox: for a `process` child the workspace database, the GitHub and
   other credentials, and the Kiro Crew home SHALL be outside its read and
   write roots, and its network SHALL be off or restricted to what the
   repository names. A harness that cannot do this SHALL be refused for
   unattended roles unless the owner opts in for that machine.
7. For a `kirocrew` chat, person-only refusal SHALL stay a speed bump, and
   the docs and Settings SHALL say so plainly.

### Requirement 96: One way to finish

Design §4.28.

**User story:** As the owner, I want every worker, on any harness, to finish
in a way Avoozl reads the same, so that Avoozl reads one kind of result.

#### Acceptance criteria

1. A `process` child SHALL finish by writing a small result file,
   `.avoozl/result.json` in its task folder (`{"state": "done" | "blocked",
   "text": "..."}`, at most 8 KB), and exiting. The supervisor pass SHALL read
   the exit code and that file, and SHALL record the result. The brief SHALL say
   so as its last step.
2. A `kirocrew` chat and a person SHALL finish with
   `avoozl runner report TASK done|blocked` (with text for `blocked`), the
   CLI report of Requirement 88.2.
3. Avoozl SHALL match a result to its session by the supervisor pass's record or
   the worktree, SHALL make or read the commit in the worktree itself
   (Requirement 94.4a), and SHALL treat the result text as data.
4. A child that exits with no result file, an unreadable one, or a non-zero
   exit code with `done` SHALL be treated as `exited <code>`, and its task
   SHALL follow the retry path (Requirement 8).
5. `avoozl take`, `avoozl next` and `avoozl runner report` SHALL stay as
   the manual path for a person.

### Requirement 97: Role prompts as files

Design §4.28.

**User story:** As the maintainer, I want each role's prompt in one file any
harness can read, so that a role behaves the same on every executor.

#### Acceptance criteria

1. Each role's prompt SHALL live in `prompts/<role>.md` (worker, verifier,
   reviewer, planner, retro, watch, and the other roles Avoozl starts).
2. The Kiro Crew agent files SHALL be generated from those prompts at build
   time. A test SHALL fail when a built agent differs from its prompt.
3. Every role SHALL run on either executor.

### Requirement 98: One page, in Kiro Crew or served by Avoozl

Design §4.28.

**User story:** As the owner, I want to watch and steer every session in the
Avoozl page, whatever harness runs it, so that I need no other UI.

Every front end (Kiro Crew, the page, the CLI and the host packages' `avoozl
mcp`) works on the same workspace databases, and every one of them sees what
the last tick did.

#### Acceptance criteria

1. In flight SHALL show a `process` session's status, the tail of its log,
   its cost when known, and a copyable attach command.
2. **Send message** on a `process` session SHALL queue a `send`.
3. Settings › Models SHALL set a harness and a model per role.
4. A headless machine SHALL get the CLI (`avoozl status` and
   `avoozl runner status --json`), and the standalone page that each tick
   keeps up when `serve.enabled` is set (`.kiro/specs/standalone-web/`).
   Avoozl SHALL host no other UI and SHALL serve nothing beyond
   `127.0.0.1`.

5. `.avoozl.json` SHALL hold one `roles` table with one row per role:
   `worker`, `falsifier`, `planner`, `planReviewer`, `retro` and
   `reviewDraft`. A row MAY set `harness` and `model`; the `worker` and
   `falsifier` rows MAY also set `agent`. A missing key or `auto` keeps
   that role's default.
6. Settings › Models SHALL be the only page that picks a role's harness,
   agent or model. Settings › Autopilot SHALL keep only delivery choices:
   a picker of **Off** (you deliver) and **Autopilot** (Avoozl delivers),
   each with its steps, and below it every Autopilot setting, shown and
   saved while Autopilot is off, with this machine's `loop.run` and
   `loop.every`. Autopilot SHALL show as on only when the `delivery` block
   and this machine's `loop` are both set. Picking Autopilot SHALL write
   both; picking Off SHALL remove this machine's `loop` only. Each SHALL ask
   once and SHALL be a person's alone. While tasks are ready and this
   machine has no `loop`, Home and Needs you SHALL show one row saying
   Autopilot is off on this machine and how to turn it on.
7. A file that sets any other key for a role's harness, agent or model
   SHALL NOT load, and the error SHALL name the file and the key: `models.<role>`,
   `harnesses.<role>`, `delivery.agent`, `delivery.model`,
   `delivery.investigate.agent`, `delivery.investigate.model` and
   `flow.retro.model`.
8. Saving Settings › Models SHALL write `roles`.
9. The existing checks SHALL hold against the table: a named plan reviewer
    model differs from a named planner model, and a review role with
    `distinctFrom: model` needs a named worker model that differs from its
    own.

### Requirement 99: Cross-model plan review

Design §4.29.

**User story:** As the owner, I want every spec draft read by a second model
before I approve it, with what it found and what the planner did about it
in front of me when I approve, so that one model's blind spots do not reach
the task graph unchecked.

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

Design §4.30.

**User story:** As the owner, I want the retrospective to notice CI time
that is spent the same way on every pull request, such as the full test
matrix on a spec-only change or two runs of one workflow on one commit, so
that waste which is the usual case is caught, not hidden by the median.

The outlier trigger of Requirement 47.1 fires only when one CI wait passes
`flow.retro.slowFactor` times the median, so a cost that every pull request
pays never fires it. These triggers catch that steady cost.

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

Design §4.31.

**User story:** As the owner, I want Avoozl to keep every build and test
record a pull request's CI writes, failed attempts included, and to hand the
retrospective a repository's own breakdown of where build time goes, so
that the costliest step is visible and a change is judged only against
builds that did the same work.

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
6. Receipts SHALL be read in the tick's CI step for every repository with
   `buildReceipts` on.
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
14. **By commit on the base branch.** Avoozl SHALL read the receipt
    artifacts of every commit that reaches the base branch, however it got
    there (a direct push, a pull request's squash or merge commit, or
    Avoozl's own landing), from that commit's `push` run on the base branch,
    keyed by the commit, under the rules above: the same one artifact list
    per check through the HTTP cache, one download per artifact never read
    before, each call under `receipt`. A pull request head's receipts MAY
    still be read, and SHALL count under the base-branch commit the pull
    request landed as (its `mergeCommit`, from the same closed pull request
    read), so a commit shows one CI time: its own push run's when it has
    one, else its head's. Flow SHALL show one row per such commit, with the
    pull request it landed, if any. A task's CI time SHALL be found from its
    tick commit (Requirement 113.14), or a person's `Built:` line when there
    is one; CI time SHALL NOT be written in `tasks.md`. Tests SHALL show a
    direct push and a squash-merged pull request each with their CI under
    their base-branch commit, a push on another branch not read, no artifact
    read twice, and a task finding its CI by its tick commit.

### Requirement 102: Working branches and spec issues

Design §4.32.

**User story:** As a spec owner or contributor, I want pushed work to
survive a change of driver, including work on forks, without one GitHub
issue per task or exposing private planning information.

#### Acceptance criteria

1. Git SHALL hold design, approvals, ticks and implementation; the spec
   issue SHALL hold ownership (its assignee) and discussion; SQLite SHALL
   cache local execution. There SHALL be one issue per published spec and
   epic, never per task.
2. The tick SHALL publish the spec issue in its home repository for each
   approval this workspace adopts or makes, when this runner acts as the
   approver (workflow v1 rule 8.1, github-native GN3); `avoozl spec
   publish` SHALL stay a person's retry. A fork checkout SHALL NOT move the registered issue home or require fork
   issues.
3. Unfinished checkpoints SHALL release nothing. A successor in any spec
   SHALL start once its prerequisite's tick reaches the base branch. Branch
   checkmarks SHALL be labeled progress, not canonical completion, and
   excluded from the approved definition hash.
4. Each spec SHALL have one active working head per affected repository,
   and task checkpoint refs for unfinished work. Every reference SHALL
   identify source repository, branch and exact commit separately from target
   repository/base. Avoozl's driver SHALL create and serialize verified
   integrations; sandboxed agents SHALL receive no push credentials.
5. Fork heads SHALL work without copying branches upstream or another mode.
   Discovery SHALL use the pull request's head repository, ref and SHA.
   Fetches SHALL use trusted registered repositories, verify source/target
   relationships and exact commits, and never turn issue prose into clone
   URLs, commands or local paths. Local clone/worktree choice SHALL NOT
   affect repository identity or permissions.
6. Source push rights SHALL be separate from target merge rights. Fork
   contributors MAY checkpoint without upstream write access; an authorized
   maintainer MAY merge while Avoozl observes. Reviews, required checks and
   fork CI permissions SHALL remain the target repository's rules.
7. Privacy checks SHALL precede every external intake, pull request or
   status write and every checkpoint or landing push, including outgoing
   messages and refs. Private plans and their marks SHALL stay private; a
   private issue MAY name a public pull request, never the reverse.
8. Landing SHALL use a guarded fast-forward from the recorded base or a
   head-guarded pull request merge, never a force push.
9. Landing portions SHALL name exact commits/tasks, not the latest mutable
   branch head. Only verified work SHALL enter the spec working branch.
   Direct merge batches MAY combine up to the size limit of tasks across
   specs; protected pull requests SHALL land separately with checks and
   reviews for their own heads. Base moves SHALL merge back without force
   push. The integration lock SHALL cover only guarded ref movement and push,
   not checks or agent work.
10. Rebuild SHALL read the spec folders, approvals, ticks and landing
    commits from git; inaccessible or deleted forks and changed heads SHALL
    remain unresolved rather than completing or redispatching work.
11. Git content/hash refresh and ownership/review/check refresh SHALL be
    independent. Conditional requests SHALL avoid full unchanged reads. An
    unchanged spec SHALL not be reparsed; unchanged branch heads SHALL not
    suppress ownership changes.
12. Epic lifecycle rows SHALL derive design (draft submitted for approval),
    review (current-revision approval), and implement (all current leaves
    complete) from member specs. Approval evidence SHALL retain the
    approver and the approval commit. Avoozl SHALL honor repository review
    policy, adding no universal second-reviewer rule. Public pull requests
    SHALL reference the spec issue only when visibility permits. Code
    reviewers SHALL follow CODEOWNERS and repository policy.
13. Intake SHALL accept GitHub items. A bounded fix MAY use its issue and a
    compact acceptance definition without a full spec; coordinated changes
    SHALL use a proportionate spec. Reuse the input as spec issue only when
    home/visibility match. Initial intake SHALL make at most two idempotent
    writes: an ownership label and a privacy-safe status comment. Deliver
    alone MAY use same-repository Fixes; input closure SHALL mean
    withdrawal, not task completion. No path creates task issues.
14. A tick SHALL make no task-issue reads or writes, and an old binding row
    SHALL be ignored. Spec issues SHALL remain. `route: github` and
    `merged-pr` SHALL retain their accepted source syntax, meaning queue
    landing and accepted landing, without rewriting approved files.
15. Scratch-repository proofs SHALL exercise checkpoint recovery, fork pull
    request landing without an upstream source branch, privacy rejection and
    held recovery. Tests or stand-ins SHALL NOT tick live proofs. Real
    workspace, second-machine, screenshot, settings and private pilot
    approvals SHALL remain owner actions.
16. No public Avoozl write on GitHub SHALL expose internal information. This
    covers spec and epic issue bodies, status and intake comments, pull
    request bodies and check summaries. Internal information is host, server
    and machine names, usernames, local and home paths, internal URLs and
    hostnames, IP addresses, crew, instance and session IDs, gateway ports
    and session keys.
17. A machine named on a public surface SHALL be named by its public label.
    The owner picks it per machine (for example "Draco"); it is stored in
    machine config. An unset label SHALL never be derived from the hostname
    or username. Settings SHALL refuse a label that contains this machine's
    hostname or username.
18. The privacy scan (56.11) SHALL refuse, before the first write: hostname
    and IP literals; internal domains (`*.corp`, `*.internal`, `*.local`,
    `*.lan`, and a private, machine-local list of internal domains the
    owner keeps); home paths (`/Users/<name>`, `/home/<name>`,
    `C:\Users\<name>`, `~/`); and this machine's own hostname and username.
    Tests SHALL insert a made-up hostname and username into every public
    field and expect refusal with nothing written.
19. A fix SHALL be one task with no spec files whose definition is its text
    (the issue's title and body as they read when it started, or what the
    owner typed), its repository and two acceptance lines: it does what the
    text asks, and the repository's checks pass on the exact head that
    lands. Its definition hash SHALL be the hash of those. A fix SHALL start
    from **Deliver this** on an incoming issue, from **New fix** beside
    **New spec** on the page, or from `avoozl fix "TEXT" --repo ID`;
    starting it is the approval. A fix from an issue SHALL keep its record
    on that issue, and a fix without one in the workspace database. It SHALL
    run, be checked and land like any task, and **Make this a spec** SHALL
    turn a fix that grew into a spec folder holding its text.

### Requirement 104: Review findings the owner can read and decide

Design §4.33.

**User story:** As the owner, I want to read each review finding next to
the spec text it is about, see what the planner did with it, and decide
the rest with one click each, so that a review round ends with every
finding either fixed, answered, or decided by me at a known revision.

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
9. Each spec document's own tab (requirements, design, tasks and the
   rest) SHALL show its findings inline, as review comments in a pull
   request's diff: each finding card in a thread under the last rendered
   block its anchor touches, in line order. There SHALL be no separate
   Review tab that repeats the documents. Clicking a card SHALL highlight
   the anchored lines; clicking highlighted text SHALL select its card.
   Moved or removed findings SHALL be listed above the text. A toggle
   with the file's finding count SHALL hide and show every inline card,
   and the choice SHALL be kept in the browser. Filters by severity and by
   state SHALL show counts and be kept in the page address.
10. Each card SHALL show the severity label and border, category, file and
    lines, body, the planner's response with a link to the fixing
    revision, the history of person actions (who and at which revision),
    and Accept, Reject, Defer and Resolve, or Reopen once decided. Reject
    SHALL require a reason; Defer SHALL offer a note.
11. The spec's Overview SHALL have a **Review** card: each round with
    **Open review chat** (the round's reviewer session) and **Open planner
    chat** (the planner session that answered), and every finding in one
    list, each a link to its lines on its document's tab. A session that is gone SHALL show
    "Chat closed" with no link. These links SHALL only open an existing
    chat, never start one.
12. Both Approve dialogs SHALL show, per spec, counts by severity and by
    state (for example "2 blocker · 3 warn · 1 info · 1 for you") and an
    **Open review** link to the findings at that revision, in place of
    the inline finding list and its close controls.
13. WHEN the revision changes while an Approve dialog is open THEN the
    dialog SHALL NOT show "This revision changed. Reload it before
    approving." It SHALL update in place to the new revision and say what
    changed: the old and new hash, each file changed with lines added and
    removed, and findings newly fixed or moved. Approve SHALL apply to the
    revision on screen, and after an in-place update it SHALL need a fresh
    click. An approve sent for the old hash SHALL produce this update, not
    an error. The backend's refusal of a stale hash SHALL stay.
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

Design §4.34.

**User story:** As the owner, I want to say what each repository is for,
so that I never choose a workspace mode on a separate page and then match
my repositories to it.

#### Acceptance criteria

1. Each repository SHALL have one role: `local`, `code`, `planning` or
   `both`. `local` means no GitHub issues: the repository's tasks live in
   the workspace database. `code` means a repository whose pull requests
   land code while its issues live in the planning repository. `planning`
   means the repository that holds spec issues, epic issues and spec
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
   The settings that belong to the whole workspace (epic issue type, GitHub
   cache and write limits, sub-issue cap, include-done, the **Set up
   GitHub** wizard and This computer) SHALL be in Settings › Workspaces.
7. Every existing workspace SHALL keep its behavior. On read, a workspace
   with no `role` keys SHALL get roles from its stored mode: `local` or
   absent gives every repository `local`; `plans-repo` gives the repository
   named by `planningRepository` the role `planning` and every other
   repository with a GitHub remote `code`; `single-repo` gives every such
   repository `both`. Reading SHALL write nothing. The first save of
   Repository setup SHALL write each repository's `role` and the mode and
   `planningRepository` the roles derive, and running it twice SHALL change
   nothing more.
8. Avoozl SHALL NOT write `github.mode` or `github.planningRepository`.
   WHEN any repository has a `role` THEN the roles SHALL win and the loader
   SHALL derive both keys from them, so every reader sees one consistent
   value. Saving Settings SHALL drop both keys from a file that has roles.
9. Switching a role SHALL delete no stored setting, as switching a mode did
   not. Settings that the new mode does not read SHALL show as "Kept, not
   used".
10. The mapping, the migration, the refused mixes and the screens SHALL have
    tests on fake data and a fake GitHub that records no call for a read.

### Requirement 106: Task details hold the task's timeline; Trace is removed

Design §4.35.

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
5. The box SHALL show the build records grouped by phase, with the one-line
   summary, failed records marked (R101.4).
6. The earlier history list of task details (row changes, evidence,
   deliveries, runs) SHALL stay in the same box, below the steps.
7. The **Trace** nav entry, page, drawer, and Done work list SHALL be
   removed, and so SHALL every "Trace" button on other pages. Delivery and Home's Recently landed
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

### Requirement 110: One intake list

Design §4.39.

**User story:** As the owner, I want every place work comes in from listed
once under `intake.sources`, so that I read and change intake in one place.

#### Acceptance criteria

1. `intake.sources` SHALL accept `via: "github"` beside `plugin:<id>` and
   `mcp`. A GitHub source names the GitHub `repository` (owner/name) and
   SHALL carry `executionRepository` (the execution repository), optional `workspaceRepository` when it differs
   from `executionRepository`,
   `assignee`, `autoStart`, `provider` and `model`. A source has no label
   and no trust list: the ready label is `managedLabels.ready` and who counts
   is `allowedActors` and `minimumPermission`, both on the repository's
   `github.repositories` entry. `labelFields` and
   `assigneeField` SHALL be refused on a GitHub source, and the GitHub
   keys SHALL be refused on a plugin or MCP source.
2. A GitHub source SHALL live in `.avoozl.json`. One declared in this machine's settings SHALL be listed with the
   reason it is not used. At most one GitHub source SHALL name a GitHub
   repository.
3. `github configure`, `github.repository.connect` and Repository setup's
   "issues here" SHALL write a GitHub source. Removing a repository or
   turning its issues off SHALL remove its GitHub source.
6. GitHub items SHALL keep source `github`.
7. Settings › Plugins › Intake sources SHALL list each GitHub source as one
   entry in the same box as every other source, with its repository,
   label, assignee, who counts and whether it starts on its own. A GitHub
   source is changed in Repository setup, so its entry SHALL link there
   instead of offering Remove. The Add dialog SHALL stay for plugin and MCP
   sources.
9. Tests SHALL cover each kind's keys and refusals, and `github configure`
   and Repository setup writing a source.

### Requirement 111: Task facts live in tasks.md

Design §4.40.

**User story:** As the owner, I want one file per spec to read and review
the tasks, so that a task's title and its acceptance sit
together and a Kiro chat, Claude Code or Codex writes them in one place.

#### Acceptance criteria

1. A spec folder SHALL hold `requirements.md` or `bugfix.md`, `design.md`
   and `tasks.md`. It SHALL NOT hold `avoozl/manifest.json`. Avoozl SHALL
   NOT read that file. A leftover one SHALL be a lint error, with its file,
   that says to delete it. No alias, fallback or migration tool SHALL read
   or convert it.
2. Each `tasks.md` item SHALL carry its facts as bullets directly under
   the item that start with `$`, one fact per bullet on one line:
   `- $after: 1.1`. Nothing SHALL nest under a fact. Facts, subtasks and
   other bullets MAY come in any order. An item with sub-items SHALL be a
   package and every other item a leaf. A leaf's plain bullets SHALL be its
   summary when it has `$done`, and its results when it has none.
3. The facts SHALL be `done` (the acceptance), `after` (task IDs that must
   finish first), `repo` (the repository), `manual`, `paths`,
   `investigate` and `type`, plus `plan` and `step` on an epic's rows. A
   list SHALL be written comma separated on one bullet, or as the same fact
   written again, each bullet adding to the list. `$done` SHALL be one
   result per bullet and SHALL NOT be split on commas. A task SHALL NOT
   name checks: every task runs its repository's checks (Requirement 7.1).
4. `tasks.md` MAY start with front-matter that holds spec-wide values:
   `repo` as the default for every leaf; `integrationBranch`,
   `integrationSync` and `kind: epic` for the spec. Front-matter keys take
   no `$`. A task's own fact SHALL win over the default. A package SHALL
   NOT take the default.
5. Lint SHALL refuse, with the file and line of the bullet: any other `$`
   fact or front-matter key, naming it and what to do; a one-value fact or a front-matter key written
   twice; a value of the wrong shape; anything nested under a fact; a `$`
   fact that is not directly under a task item; a bullet under an item that
   reads as a fact without its `$`, such as `done:`; a `Facts:` block in
   `tasks.md`; and a task with no facts. Every rule the manifest had, such as acceptance on a
   leaf, SHALL hold with the file named `tasks.md`.
6. The revision hash SHALL cover the spec's prose and its parsed facts, not
   their layout. A changed revision hash SHALL need a normal approval.
   Checkbox marks and `Status:` SHALL stay outside the hash. Avoozl SHALL
   NOT read the old layouts (`avoozl/manifest.json`, `Facts:` blocks) from
   disk or from a record stored in SQLite: a stored revision in an old
   layout reads as a folder lint refuses, and a person recreates it.

7. Avoozl SHALL parse a spec once, store its revision, and parse again only
   when the revision changes, as it did. Ticks SHALL stay outside the hash.
8. The spec page, the review tabs, the graph, proposed work, import and the plan-review view SHALL read facts from
   `tasks.md`. The review tabs SHALL show no manifest tab.
9. The planner prompt, the Spec Builder steering file and any planner skill
   SHALL tell Kiro chats, Claude Code and Codex to write `$` fact bullets
   and never `avoozl/manifest.json`. Avoozl SHALL NOT write a manifest or
   draft one from marker bullets.
10. Every spec in this repository SHALL be converted once and its
    `manifest.json` deleted in the same change. A test SHALL prove that the
    tasks and proposals parsed before and after are equal. The Nupp plans
    SHALL be converted the same way in one change in their own repository,
    after the build merges, tested on a copy first.
11. Tests SHALL cover: each key and each refusal in 5, the leftover manifest,
    default and package rules, an epic folder, the hash in 6,
    proposed work writing `$` fact bullets, and the planner text.

### Requirement 112: A repository's checks run in its isolation

Design §5.2.

**User story:** As the owner, I want every check Avoozl runs to run in a
sandbox with the network off by default, so that a worker's commit cannot
read my credentials or reach the network through its checks.

#### Acceptance criteria

1. A repository SHALL have one `isolation` setting, `{run, network,
   readable, writable, prepare}`, kept in its repository settings. `run` SHALL
   be `sandbox` (the default) or `unconfined`; `network` SHALL be `off`
   (the default) or `on`; `readable` and `writable` SHALL be absolute paths;
   `prepare` SHALL be command arguments. Only a person SHALL set it, with
   `repository.configure` or Settings › Repository setup › Landing.
2. With `sandbox`, every check (Avoozl's own check runs, integration's and
   landing's candidate runs) SHALL run in the process sandbox, writing only
   the check's folder, its own temp folder, a per-repository cache folder
   outside every secret path, and `writable`; reading no secret path; with
   the network as set; and with only the checks' environment allowlist
   (Requirement 7.1).
3. `unconfined` SHALL be accepted only with the machine's opt-in. A machine
   with no sandbox SHALL run a `sandbox` check unconfined. Either way the
   check's record SHALL say `isolation: "unconfined"`, and the Landing page
   and the task's timeline SHALL show "not sandboxed".
4. `prepare` SHALL run once per worktree and commit before its checks,
   outside isolation, with the environment allowlist. A failed prepare SHALL
   run no check and SHALL say why.
5. Every check record SHALL name the isolation it ran under.
6. Tests SHALL show that, in a sandboxed check, a TCP connection to a public
   host fails with the network off, a write outside the roots fails, and
   `GH_TOKEN` is absent.

### Requirement 113: A tick on the base branch completes the task

Design §4.41.

**User story:** As the owner, I want Avoozl to notice a commit that ticks off
a task and know it is complete, so that I do not approve the spec again for a
box someone checked.

#### Acceptance criteria

1. When Avoozl reads an approved spec's `tasks.md` as the spec's base branch
   holds it, in single-repository and plans-repository mode, a task whose
   item is ticked `[x]` and that is not done SHALL become done at once, with
   no approval and no new revision. Its evidence SHALL name the base branch,
   the `tasks.md` line and the commit that ticked it, and the task's
   integration SHALL carry that commit as its landing commit. One Activity
   line SHALL say so.
2. Only the base branch SHALL count. A tick on a working or worker branch, or
   an edit not committed, SHALL do nothing. Only `[x]` SHALL count: `[~]` and
   `[-]` stay Kiro's queued and running marks.
3. A tick on a task an Avoozl worker session is running SHALL make the task
   done and SHALL close that worker's session binding, with one Activity
   line saying the session was released.
4. A tick taken out of a done task SHALL NOT reopen it. It SHALL show in
   Needs you with Reopen and Keep done, and stay done until a person chooses.
5. A ticked item with no task ID SHALL be a lint error naming `tasks.md` and
   its line.
6. A ticked parent SHALL count as done with its open sub-tasks.
7. A task gated on Avoozl's own recorded validation (Requirement 38.4) SHALL
   not be completed by a tick.
8. Ticks on the base branch SHALL be the task state coworkers share: each
   machine's database is private, and a per-task issue is not kept. When
   Avoozl lands a task (its own worker, a merge batch, or any direct
   landing), the landing commit itself SHALL tick that task's `[x]` in its
   spec's `tasks.md` on the base branch. It SHALL be one commit, not a
   follow-up. Only the landed task's mark character SHALL change: the rest of
   the file stays byte-identical. Avoozl SHALL write no other commit for it.
9. A parent SHALL be ticked only when every child is ticked, and only as a
   result of a child's tick.
10. A spec in a plans repository other than the code repository SHALL be
    ticked there as its own commit on that repository's base branch, after
    the code lands: fetched, built on the fetched head, pushed without force,
    and started again from a fresh fetch when the branch moved.
11. A machine that reads Avoozl's own landing tick SHALL treat it as known:
    no second Activity line and no worker session released.
12. Ticks SHALL stay outside the revision hash (Requirement 111.7), so no tick
    needs a new approval.
13. Tests SHALL show: landing a task puts `[x]` in `tasks.md` on origin's base
    in the same commit; a second machine reading origin marks the task done;
    the plans-repository race retries; a parent ticks only after its last
    child; a tick on the base branch completes a task with no approval, a tick
    on another branch does nothing, a tick of an in-flight task releases its
    worker, an untick lands in Needs you, and the hash does not change.
14. The `[x]` tick SHALL be the record that the work was done. A task's
    landing commit SHALL be its **tick commit**: the commit on the base
    branch that last changed its item's line, found by following first
    parents (`git blame --first-parent` on `tasks.md`), so a direct push, a
    squash commit, a merge commit and Avoozl's own landing merge each own
    their tick. Avoozl SHALL keep it on the task in SQLite, read once, and
    receipts and Flow SHALL look the task's CI up by it (Requirement
    101.14). Avoozl SHALL NOT write a `Built:` line. A `Built: <commit>`
    note a person wrote under a ticked item SHALL be read, and used first.
    Tests SHALL show a direct push and a squash-merged pull request each
    resolving to their tick commit, a fresh database rebuilt from git
    finding the same commits, and an unchanged hash.

### Requirement 114: Git is the source of truth; SQLite is a cache

Design §4.42.

**User story:** As the owner, I want everything that matters to live in git
and GitHub, so that Avoozl fits normal git workflows, can adopt an existing
repository, lets people leave, shares work through git, and a fresh machine
rebuilds its database from main and GitHub.

#### Acceptance criteria

1. An approval SHALL be a commit on the spec repository's main branch that
   changes the spec's files and whose author email is on the repository's
   approvers list: `allowedActors` (an email, or a login whose GitHub address
   or commit author it is), else people with `minimumPermission`; in local
   mode, the checkout's own `user.email`. No second list SHALL exist.
2. The commit message SHALL carry nothing for the approval: no trailer, no
   spec name, no fingerprint. Avoozl SHALL compute the revision hash from the
   spec's files in that commit's tree.
3. The committer SHALL neither grant nor block an approval: a commit whose
   author and committer are the same approver, and one whose committer is
   someone else (a squash merge, a commit made for the author), SHALL both
   approve.
4. Avoozl's own commits (worker results, ticks, landing and merge commits)
   and its agents' commits SHALL use the checkout's own git identity as both
   author and committer, and SHALL carry no `Co-authored-by` or other
   attribution. Worker and planner prompts SHALL say so, and SHALL say never
   to push spec edits to main: a draft reaches main only through Approve.
5. Spec drafts SHALL stay on a spec branch. Approve SHALL write one commit on
   main, authored by the person clicking, that sets the spec's files to the
   reviewed revision, and push it without force. It SHALL refuse a person
   who is not an approver. When main already holds that exact text from a
   non-approver, it SHALL refuse and say to edit through a spec branch.
7. A task made from an intake item SHALL name it with a `source:` fact (its
   link), and Avoozl SHALL tie the item to that task instead of making a new
   one. An item pushed over MCP SHALL become
   a GitHub issue in its source's repository at once, with no labels, or be
   refused when the source names no GitHub repository.
8. `avoozl rebuild` (operation `workspace.rebuild`, a person's) SHALL, from an
   empty database, make every spec folder a plan, approve again each spec
   whose current text an approver committed on main (or that differs from it
   only in layout, Requirement 111.6) as that commit's author, and record
   each landing commit's tasks in Activity. A full
   database SHALL be refused.
11. Tests SHALL show: an author-only approval; an approval whose committer is
    someone else; an agent-authored edit with the owner as committer is no
    approval; and a scratch repository with approvals, a landed task and an intake-made task rebuilds to the same plans,
    approvals and tasks after its database is deleted; and no direct or
    pull request landing writes a trailer.

12. The tick SHALL adopt an approval that
    reaches main with no click: a spec pull request an approver authored and
    GitHub merged, or a push. When a checkout's base branch, as the tick
    already fetched it, has moved, or a spec's text has, the reader of
    criterion 9 SHALL run over the specs whose text on disk has no approval.
    Each one an approver committed with exactly that text SHALL be approved
    as that commit's author, and its tasks become ready as after a click.
    A commit by anyone else SHALL approve nothing and change nothing. Each
    such approval SHALL get one Activity row naming the commit and the
    approver; a click's own approval commit SHALL add none. This SHALL make
    no extra GitHub call and write nothing to git. Tests SHALL show an
    approver's squash merge with GitHub as committer approved on the next
    tick, a non-approver's commit not approved, a later edit by a
    non-approver needing approval again, and no second Activity row after a
    click.

### Requirement 115: Task IDs and refs in tasks.md are checked and linked

Design §4.43.

**User story:** As the owner, I want a task's requirement and design refs
read, checked and linked, so that a ref that names nothing is caught before
approval and a task opens the text it builds.

#### Acceptance criteria

1. A task ID MAY be written bare or as a code span: ``- [ ] `dl-1` Open the
   decision`` and `- [ ] dl-1 Open the decision` name the same task, and
   neither is a lint error. Avoozl's own writers SHALL write a named ID as a
   code span, and its prompts and docs SHALL recommend it. Kiro's numbers
   (`1.`, `1.1`) stay bare.
2. A trailing `[...]` on a task's title SHALL be read as requirement refs and
   a trailing `(...)` as design refs, each a comma-separated list, and the
   title SHALL be shown without them. A trailing bracket whose first entry
   is not ref-shaped SHALL stay title text.
3. A requirement ref SHALL be `R<n>` for a `Requirement <n>:` heading, or the
   heading's own ID (`DL2` for `Requirement DL2:`), with an optional `.<m>`
   for its numbered criterion `<m>.`. A design ref SHALL be `§` and the
   number a `design.md` heading starts with (`§4.26`, `§D1`). Either list MAY
   name a fact row (`| F13 |`) of its own file. A range (`R4.1–R4.3`,
   `NK1 to NK3`) SHALL check both ends.
4. Lint SHALL refuse a ref of the wrong form, and a ref the spec's own
   requirements or design file does not define, naming the ref, the file it
   is missing from, and the task's line.
5. The spec page SHALL show a task's refs as chips beside it; a chip SHALL
   open the spec's requirements or design tab at that requirement, criterion
   or section.
6. Refs and the ID's form SHALL be part of the spec text the revision hash
   reads, as all of `tasks.md` is.
7. Every spec in this repository SHALL lint clean under the ref rules.

### Requirement FS1: A spec folder needs only its task list, at a path the repository names

Design §FS1.

**User story:** As the owner, I want a repository to say where its spec
folders live and a spec to need only its task list, so that a spec can be one
`tasks.md` or one file, carry any notes it needs, and still read Kiro's layout
as before.

#### Acceptance criteria

1. `.avoozl.json` at the root of the repository that holds the specs SHALL
   accept `specs.path`, one folder relative to that root. Unset SHALL mean
   `.kiro/specs`. Avoozl SHALL refuse a value that is absolute, names a `.`
   or `..` folder, or resolves through a symlink to a place outside the
   checkout. It SHALL compose with `specs.branch` (Requirement 117): the path
   names the folder, the branch names where it is read.
2. Every reader and writer of spec folders SHALL use the resolved path:
   listing, reading, creating, approving, ticking, reviewing and retiring.
3. A task list SHALL be the only required part: a `tasks.md`, or, with no
   `tasks.md`, the `## Tasks` section of one `.md` file in the folder. In
   that file the task list SHALL be the list under `## Tasks` up to the next
   heading of level 2 or 1, its `###` headings SHALL be phases, and every
   other line SHALL be spec text. A folder with a `tasks.md` and a file with
   a `## Tasks` section, or two such files, SHALL be a lint error that names
   both files. `requirements.md` (or `bugfix.md`) and `design.md` SHALL be
   optional; a folder SHALL hold at most one of `requirements.md` and
   `bugfix.md`.
4. Every other Markdown file directly in the folder SHALL be spec text: part
   of the revision hash, written by Approve, read from approval commits, and
   named to workers as context. Files in subfolders, files that are not
   Markdown, and symlinks SHALL NOT be. The 1 MB per-file limit SHALL stay,
   and a folder SHALL hold at most 50 spec files.
5. A requirement ref SHALL be checked only when the spec has
   `requirements.md` or `bugfix.md`, and a design ref only when it has
   `design.md`. With no such file, lint SHALL refuse the ref and name the
   missing file.
6. Kiro's `requirements.md` (or `bugfix.md`) + `design.md` + `tasks.md`
   layout SHALL read, hash and lint as before, including a bugfix spec's
   Unchanged Behavior acceptance and the front-matter category.
7. The planner prompt, templates, skills and `docs/github-workflow.md` SHALL describe
   the path setting, the one required file and other files as spec text.
8. Tests SHALL show: a custom path; a `tasks.md`-only spec; a single-file
   spec reading as the same `tasks.md` does; the both-present lint error; a
   tick in a single file changing no spec text while its prose does; an extra
   `.md` file changing the hash; refs with and without their files; Kiro's
   layout unchanged; and path validation.
9. Every reader of the task list (the parser, lint, the revision hash, ticks,
   landing, rebuild and the spec page) SHALL find it through one shared
   function. A task that links a spec MAY target either that spec's
   `tasks.md` or its single file.

### Requirement 116: The spec issue's assignee says who works on a spec

Design §4.44.

**User story:** As one of several people on a repository, I want the spec
issue's assignee to say who is working on each spec, so that GitHub shows
who has it and no two people drive one spec.

#### Acceptance criteria

1. The shared record SHALL be per spec, not per task: a spec has one driver,
   and the driver's own Avoozl knows the tasks it runs. The spec issue's one
   assignee SHALL be the person who drives it. A person sets it on GitHub;
   Avoozl SHALL NOT write it.
2. WHEN the spec issue, or the epic issue standing in for one with no
   assignee, names another login THEN this workspace SHALL NOT drive the
   spec, and the page SHALL say "Taken by <login>".
3. WHEN the spec issue has two or more assignees THEN every workspace SHALL
   read only for the spec, no machine SHALL start new tasks for it, and
   Avoozl SHALL raise one Needs you item naming every assignee, which closes
   by itself once one is left. WHEN it has none THEN nobody drives it, and
   no Needs you item SHALL be raised.
4. WHEN every leaf task of a spec this workspace drives is complete THEN the
   driver SHALL close the spec issue as completed, once. A later revision
   SHALL NOT reopen it.
5. An approved spec with no spec issue SHALL drive on this workspace and show
   "Not shared", because no other machine can see who drives it, until the
   tick publishes its issue (Requirement 102.2).
6. Reading the assignee SHALL add no GitHub call. The tick SHALL read each
   spec issue with the conditional read it already makes, its rechecks SHALL
   share the client's cache, and an unchanged issue SHALL answer 304. The
   only new call SHALL be one close per spec, through the write pacer.
7. Each approved spec's row on the Specs list SHALL show its driver from the
   workspace cache, with no GitHub call: "You drive", "Taken by <login>",
   "Not shared", "Nobody drives" or "N assignees". The chip on the spec's
   page SHALL use the same words.
8. Tests with a fake GitHub SHALL show: the one assignee drives and the
   other workspace reads only; reassigning the issue moves the driver and
   unassigning releases it, with no assignee write; two assignees hold both
   machines and raise one Needs you item; a fully landed spec closes its
   issue once; a spec with no spec issue drives here as Not shared.

### Requirement 117: A repository names the branch its specs live on

Design §4.45.

**User story:** As the owner, I want a private or public repository to say
which branch its specs live on, so that plans can sit on their own branch
(as Nupp's do on `avoozl-plans`).

#### Acceptance criteria

1. `.avoozl.json` SHALL accept `specs.branch`, one branch name. Unset SHALL
   mean the spec repository's base branch. No other key SHALL say where
   specs live.
2. Avoozl SHALL read `.kiro/specs/` from the spec checkout, and the Specs
   page SHALL name the problem when that checkout has another branch checked
   out.
3. An approval SHALL be an approver's commit on the specs branch, Approve
   SHALL write its commit there, and ticks SHALL be read and written there.
   Code SHALL still land on each code repository's own base branch.
4. Plans-repo mode with the specs on a branch of the planning repository
   SHALL work with this setting alone.
5. Avoozl SHALL NOT forward pull requests or code between repositories. The
   pre-push content rule runs on normal landing.
6. Tests SHALL show: in plans-repo mode with `specs.branch`, a landing ticks
   the spec on that branch and leaves the planning repository's main alone,
   and another machine reads the tick there; Approve commits on the specs
   branch; an approver's commit there approves on the tick; and a checkout on
   another branch is named.

### Requirement 118: Avoozl reads git and GitHub

Design §4.46.

**User story:** As the owner, I want Avoozl to start almost entirely from a
GitHub repository, with GitHub as the identity and permission provider and
SQLite rebuilt from git and GitHub, so that Avoozl keeps no record beside
what git and GitHub already hold.

#### Acceptance criteria

1. An approval SHALL be only an approver's commit on the branch the specs
   live on (R114.1 to R114.3, R117), noticed on the tick (R114.12). One
   commit SHALL approve every spec folder it changes: an epic pull request
   MAY carry any number of specs and the epic, and the order they are
   approved in SHALL come from their `$after` links (a ticked task waits for
   its owner spec).
2. A person SHALL approve in one of three ways, each the same commit:
   merging on GitHub; **Approve** in the app, which commits the reviewed
   draft in a checkout here, authored as the person's own git identity
   (R114.5); or telling a chat to approve, which makes that commit in the
   person's checkout, authored as the person with no co-authors. A chat
   approval SHALL be a person's instruction carried out as their commit:
   `plan.approve` SHALL stay person-only and SHALL NOT be a tool an agent
   calls on its own. Nothing else SHALL be stored.
3. A spec pull request SHALL be a pull request, reviewed like any other on
   GitHub, and merging it SHALL be the approval when an approver authored it.
4. The driver SHALL be the spec issue's single assignee (R66, R116), set by
   a person on GitHub.
5. A landing SHALL be a guarded fast-forward or a head-guarded merge
   (R102.8). The landed task is complete once its tick reaches the base
   branch (R113).
6. Work SHALL run on the driver's own machine. Spreading one person's work
   over machines is that person's own agent's job.
7. An approved spec with no spec issue SHALL offer **Make the GitHub
   issues** as its primary action in a workspace that uses GitHub. It runs
   Publish issue (R102.2, `spec.publish`) in the spec's home repository:
   one issue for the spec and one for its epic. Approval SHALL never run it.
8. Tests SHALL show: one commit that changes three specs and their epic
   approves all four, a ticked task's spec after its owner; reassigning the
   spec issue moving the driver and unassigning releasing it; a guarded
   fast-forward refusing a moved base; and the page sending `spec.publish`
   with the home repository.
