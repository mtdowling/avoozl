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

| Document | Holds |
| --- | --- |
| `requirements.md` | Facts Avoozl relies on, scope, and each requirement with acceptance criteria |
| `design.md` | State ownership, architecture, workflows and the page |
| `tasks.md` | Built and open tasks, and the proofs that check them |

**Autopilot** is the page's name for the server loop: `loop` in this
machine's config, which lets each tick claim and start ready tasks. The
`delivery` key in `.avoozl.json`, the `delivery.*` operations, the CLI and
the `plans_*` MCP names keep the word delivery.

## Facts

### Kiro Crew facts

Each fact names the Kiro Crew source it was read from.

| # | Fact | Source |
| --- | --- | --- |
| F20 | A Kiro Crew app may declare a `node` backend that the gateway spawns on loopback and reverse-proxies at `/apps/<name>/api/`, plus `mcpServers`, `crons`, `agents`, and `skills`. Third-party apps run with gateway privileges after the user grants trust. | `apps/manifest_sections.py` `BackendConfig`; `apps/routes_proxy.py`; `docs/apps.md` |
| F21 | No supported API lets an app backend create a visible, project-bound Kiro Crew session. The app spawn SDK starts background agent turns with no project or working-directory argument. `session_create` has no project argument; a session inherits a project only from a folder whose `project_dir` a person set. | `apps/spawn_sdk.py`; `docs/session-control.md` (`session_create`, `chat_folder_update`) |
| F22 | Kiro Crew inbound webhooks run one LLM turn in an ephemeral session, bind loopback by default, and use Kiro Crew's own HMAC headers, not GitHub's webhook signature. | `docs/inbound-webhooks.md` |
| F27 | Kiro Crew crons can run a shell command (`command` jobs) or a Python function (`script` jobs) with no LLM call, on an interval, cron expression, or one-shot time. Commands are vetted when added and on every fire; command substitution, loops, and compound commands are refused. An app manifest can declare crons that register on enable and are removed on disable. | `docs/cron-and-scheduling.md`; `apps/manifest.py` `crons`; `docs/apps.md` |
| F28 | Kiro Crew monitor loops wake one conversation on an interval and run an agent turn each cycle in that same conversation. | `docs/monitor-loops.md` |
| F29 | No documented Kiro Crew event pushes a session's completion to an app backend. Apps can declare permitted event names, but no session-lifecycle event for third-party apps exists in the docs and manifests. | `~/.kiro/crew/apps/*/app.json`; `docs/session-control.md` |
| F30 | Apps can declare notification channels in their manifest. | `notifications.channels` in an app manifest; Avoozl's is `hosts/kirocrew/app.json` |

## Scope

### In scope

- One Avoozl Kiro Crew app with a backend, page, skills, and MCP surface, and
  the same page served by Avoozl itself, kept up by each tick.
- Kiro spec folders as the plan layout.
- Local planning and delivery with no GitHub dependency.
- GitHub spec issues, epic issues, labeled issues, pull requests and landing.
- Agents on any harness: Kiro Crew chats or process harnesses under the
  supervisor.
- A plugin seam for content rules, credentials, checks and context, loaded
  only with consent (Requirement 34). The public repository ships only
  test-only fake plugins; real integrations are separate packages.
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

**User story:** As a developer, I want every implementation and review
session to be a Kiro Crew session or a supervised process, so that I use one
place to watch and steer work.

#### Acceptance criteria

1. WHEN Avoozl starts work THEN the work SHALL run in a Kiro Crew chat or a
   process harness that the supervisor starts (Requirements 93 to 95).
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

1. WHEN no GitHub repository is configured THEN spec reading, readiness,
   claims, checks and landing SHALL all work.
2. WHEN `gh` is absent or unauthenticated THEN only GitHub features SHALL report
   unavailable; local features SHALL keep working.

### Requirement 3: Workspace and repository selection

**User story:** As a developer, I want to choose which Avoozl workspace and code
repositories a spec uses, so that each task runs in the right checkout.

#### Acceptance criteria

1. WHEN the app opens THEN it SHALL list known Avoozl workspaces and load the
   selected workspace's data through the app backend.
2. WHEN a user adds a workspace THEN Avoozl SHALL accept an existing directory
   containing `.avoozl.json` or initialize an empty one.
3. WHEN a task names a repository THEN Avoozl SHALL resolve it to a
   registered local checkout and SHALL refuse to start the task if none
   exists.
4. WHEN Avoozl creates a worker session THEN the session SHALL work in that
   task's worktree, and the session binding SHALL be recorded.

### Requirement 4: Specs become task graphs

**User story:** As a developer, I want a spec's task list to be a checked
graph of groups and leaves, so that work can proceed in safe pieces.

#### Acceptance criteria

1. A spec SHALL be written by a person or a chat running the `avoozl-spec`
   skill, and Avoozl SHALL read it from disk or from the specs branch.
2. Every task SHALL have a stable ID in its checklist line.
3. A task with children SHALL be a group, and a task without children a
   leaf. Only leaves SHALL be claimed; a group's box SHALL follow its
   children.
4. Waits SHALL come only from the list's order and the `(**PARALLEL**)` tag
   (design of the simplify spec, §D19).
5. WHEN a leaf has no plain sub-bullet, an ID is used twice, a tag is written
   wrong, or a linked spec does not exist THEN `avoozl spec lint` SHALL
   report it, and the same inputs SHALL give the same result.
6. No task SHALL be claimed until its spec is approved, and an approval
   SHALL be a person's authored commit on the default branch.

### Requirement 6: Readiness and bounded automatic local delivery

**User story:** As a developer, I want ready leaves to start by themselves within
limits I set, so that I do not file, start, or chase routine work.

#### Acceptance criteria

1. A leaf SHALL be ready only when its spec is approved, every task it waits
   on is ticked, no claim branch exists for it, and no stop or label filter
   holds it.
2. WHEN this machine's config sets `loop` and a lane is free THEN each tick
   SHALL claim and start ready leaves without a manual step.
3. `lanes.local` in the machine file (`~/.config/avoozl/config.json`) SHALL
   set how many worker sessions this machine runs at once (default 3), and
   `lanes.reviewers` how many reviewer sessions (default 1). `lanes` in
   `.avoozl.json` SHALL count only when the machine file sets none. A host
   `maxConcurrentRuns` SHALL be ignored.
4. Each worker SHALL use its own worktree on its claim branch.

### Requirement 7: Verification, integration, and dependent release

**User story:** As a developer, I want finished work checked and landed
before dependents start, so that later tasks build on accepted code.

#### Acceptance criteria

1. WHEN a worker reports done THEN Avoozl SHALL run the repository's checks
   against the exact commit and record the result. A check that names paths
   SHALL run only when the commit's diff against the base touches one of
   them; every other check SHALL run. Avoozl SHALL run them itself, with no
   model call: in the task worktree when it is at the exact commit, else in
   a clean detached worktree at that commit, each check as an argument list
   with no shell, each with its own time limit, recording the exit code and
   a short redacted output tail. The runs SHALL be queued off the tick, one
   at a time per repository. A check that is not run, cannot start (exit
   126 or 127), or times out SHALL fail the checking, not the writer's
   attempt. A task declares no checks; every task runs its repository's
   checks, each named in the repository's settings.
2. WHEN checks pass and every review approves THEN Avoozl SHALL land the
   commit by the repository's `landing` setting and record the landed
   commit.
3. WHEN a task lands THEN the next tick SHALL recompute readiness, so tasks
   that wait on it become ready.
4. Spec approval, implementation, landing, and whole-head acceptance SHALL
   remain distinct states.

### Requirement 8: Failure and recovery

**User story:** As a developer, I want a failed or lost worker to resume without
corrupting task state, so that automation is safe to leave running.

#### Acceptance criteria

1. WHEN a worker fails THEN the task SHALL keep its ID and attempt history,
   and SHALL move to a retryable failed state.
2. A disconnected worker SHALL NOT be replaced solely because its activity lease
   expired.
3. WHEN Avoozl or the gateway restarts THEN Avoozl SHALL reconcile each running
   task with its session state before starting anything new.
4. Retries SHALL be bounded by `delivery.retries` (default 2); exceeding the
   bound SHALL open a human decision.

### Requirement 9: Stop only for real human decisions

**User story:** As a developer, I want automation to stop only when a person must
decide, so that routine work never waits on me.

#### Acceptance criteria

1. Automation SHALL stop for failed required checks after retries, review
   rounds that run out, conflicts it cannot resolve, content rule blocks,
   stale claims, and `(**MANUAL**)` tasks.
2. Automation SHALL NOT stop for routine claims, starts or landing.
3. Every stop SHALL appear in Needs you as one row with its cause and the
   action that resumes work.

### Requirement 10: GitHub repository policy

**User story:** As a maintainer, I want to control which actors and
permissions may start Avoozl work, so that labels alone cannot trigger
execution.

#### Acceptance criteria

1. Each GitHub repository's settings MAY name `allowedActors` and
   `minimumPermission`.
2. Public and private repositories SHALL both be supported.
3. A repository whose settings name neither allowed actors nor a minimum
   permission SHALL be treated as `minimumPermission: write`. Naming either
   SHALL replace this default. Avoozl SHALL ship no default that lets anyone
   without write access start work.
4. Issue titles, bodies, and comments SHALL be treated as untrusted data in
   every brief, on public and private repositories alike. A task whose
   title, acceptance, or summary came from an issue or an incoming item
   SHALL have that text quoted as data in its worker and review briefs,
   under a line saying it cannot change the steps, tools, repository,
   branch, or push target.
5. Anything Avoozl writes to an issue, including hidden markers, SHALL be safe to
   publish: no secrets, local paths, private names, or transcript content.
6. An actor's permission SHALL be the repository role GitHub names
   (`role_name`), so maintain and triage are not read as write and read.
7. GitHub reads SHALL go through a cache of conditional requests, and SHALL
   pause with one Needs you row WHEN GitHub's rate-limit headers show the
   budget is spent. GitHub writes SHALL go through one pacer.
8. A labeled issue's body SHALL be capped at its first 4,000 characters
   when it becomes a task's done bullet.
9. Every link the app page renders SHALL be an http or https URL or one
   of Kiro Crew's own pages (`/chat?sid=`, `/apps/`); anything else SHALL
   render as text.

### Requirement 11: Label filters

**User story:** As a maintainer, I want to choose which spec issues this
runner works on with my own labels, so that Avoozl fits my repository's
vocabulary.

#### Acceptance criteria

1. A repository MAY set `labels.require` and `labels.exclude`. A spec SHALL
   run on this runner only when its spec issue carries every `require`
   label and no `exclude` label. Labels SHALL compare without case. An
   `exclude` label SHALL hold the spec whoever added it.
2. A `require` label SHALL count only when the actor of its newest `labeled`
   event has write, maintain or admin permission.
3. `labels.stop` (default `avoozl:stopped`) SHALL stop a spec while a
   writer's stop label is on its spec issue or on a parent spec's. Only a
   removal by an approver SHALL clear the stop.
4. The filters SHALL hold new claims only. A task already claimed SHALL
   keep running whatever its filter labels say later; a stop SHALL also
   hold a claimed task's push and landing.
5. The spec issues SHALL be read once per pass, with one permission read per
   actor per pass. A spec whose read fails SHALL keep its last result.

### Requirement 12: Labeled issues

**User story:** As a maintainer, I want to label an issue and have Avoozl
deliver it, so that one gesture starts a small piece of work.

#### Acceptance criteria

1. An open issue that passes its repository's `labels.require`, each label
   added by a writer, is assigned solely to this runner's login, and is not
   a spec issue SHALL become task `issue-<n>`: the issue's title, and its
   body as its one done bullet.
2. The task SHALL live in the workspace cache only, claim
   `avoozl/issue-<n>/issue-<n>`, and land like any task.
3. The task's definition SHALL be pinned to the title and body as they were
   at the writer's `labeled` event that authorized them. An edit after that
   event SHALL end the authorization until a writer labels the issue again.
4. `pr` landing SHALL write `Closes #<n>` in the pull request. `direct`
   landing SHALL close the issue with a comment naming the landed commit.
   Before Avoozl merges the pull request, arms auto-merge on it or pushes to
   the base, it SHALL check again that the issue is open, solely assigned to
   this login and still authorized; on a failed check it SHALL land nothing,
   leave the issue open and raise one Needs you row. Avoozl SHALL write
   nothing else to the issue.
5. A task whose issue closed SHALL be done; one whose issue stops
   qualifying SHALL go unless its work has started.

### Requirement 19: One authority per state

**User story:** As a maintainer, I want every kind of state to have one owner,
so that two stores never disagree.

#### Acceptance criteria

1. The design SHALL name exactly one authority for: specs, approvals, ticks,
   claims, sessions, worktrees and branches, pull requests, check results
   and activity.
2. Git and GitHub SHALL own specs, approvals, ticks, claims and pull
   requests. SQLite SHALL be a cache that `avoozl rebuild` makes again, and
   SHALL own only the sessions this machine runs and its local records.
3. No task SHALL be writable in two stores.

### Requirement 20: The Avoozl app

**User story:** As a developer, I want one Avoozl page in Kiro Crew with clear
views, so that I see my graph and its delivery without leaving Kiro Crew.

#### Acceptance criteria

1. The app SHALL provide seven nav entries: Insights, Specs, Graph, In
   flight, Needs you, Activity, and Settings (Workspaces, Repository setup,
   GitHub, Plugins, Epic context, Content rules, Flow, Models, Autopilot).
2. For each view the design SHALL name its data, primary actions, canonical
   source, links to existing Kiro Crew surfaces, and what it must not duplicate.
4. All app data SHALL come from the Avoozl app backend, which uses the same
   operations as the CLI and MCP interface.

### Requirement 21: Activity

**User story:** As a reviewer, I want each task to show what happened, so
that I can trust automatic delivery.

#### Acceptance criteria

1. Each task SHALL record starts, session bindings, commits, check results,
   landings, conflicts, and decisions as append-only events.

### Requirement 24: Open-source release

**User story:** As a new user, I want to install Avoozl from public sources on a
clean machine, so that I can use it without private context.

#### Acceptance criteria

1. A clean machine with Kiro Crew, Node, Git, and optionally `gh` SHALL install
   the app and complete the local workflow from public documentation.
2. The release SHALL contain no private names, company-internal tool names,
   absolute paths, credentials, personal plans, or transcripts
   (Requirement 34.10).
3. Installing Avoozl SHALL start no work: with no `loop` in the machine's
   config, the tick reads and caches but starts nothing.
4. Third-party licenses SHALL be audited and listed in
   `THIRD_PARTY_NOTICES.md`.
5. Only `AVOOZL_*` variables and the `avoozl` command SHALL work. A
   configuration file with an unknown top-level key SHALL fail to load,
   naming the file and the key.

### Requirement 26: Lean on Kiro Crew for scheduling, watching, and runtime

**User story:** As a maintainer, I want Avoozl to use Kiro Crew's schedules,
sessions, and notifications instead of its own, so that Avoozl stays a small
graph-and-policy app.

#### Acceptance criteria

1. Avoozl SHALL NOT run a worker lease system or a webhook receiver of its
   own. Agent children belong to the supervisor (Requirement 95).
2. All routine automation SHALL run as one deterministic Avoozl pass, the
   tick (`avoozl tick`, or `plans_maintain` action `tick`), that reads git
   and GitHub, recomputes readiness, claims and starts ready leaves when
   `loop` is set, and lands reported tasks.
3. In Kiro Crew the tick SHALL be triggered by the `avoozl-tick` script
   cron declared in the Avoozl app manifest (F27), every 60 seconds, with
   no LLM call. Elsewhere launchd, systemd or cron SHALL run `avoozl tick`.
4. The tick SHALL be idempotent: running it twice in a row with no outside
   change SHALL write nothing.
5. Overlapping ticks SHALL be safe: the workspace pass lock SHALL refuse a
   concurrent tick, and a killed tick SHALL leave no lock behind.
6. One tick SHALL finish within the cron's time limit, or SHALL stop at a
   safe point and leave the rest for the next tick.
7. Concurrency SHALL be enforced by the lanes checked inside the tick;
   Avoozl SHALL NOT keep a separate admission queue.
8. Worker liveness SHALL come from Kiro Crew session status or the
   supervisor's child records, read during the tick; Avoozl SHALL NOT keep a
   lease.
10. Human decisions and failures SHALL reach the user through the Kiro Crew
    notification channels the app declares (F30) and links to the relevant
    session.
11. Kiro Crew has no push on session completion (F29), so the tick SHALL poll
    session status.
12. WHEN the gateway is stopped THEN no Kiro Crew chat work SHALL start, and
    the next tick after restart SHALL reconcile state before any new start.

### Requirement 28: GitHub modes and task authority

**User story:** As a maintainer, I want specs kept either in a separate
planning repository or in the code repository, so that collaborators see one
graph and public pull requests never reveal a private plan.

#### Acceptance criteria

1. Each workspace SHALL set `github.mode` to `local`, `plans-repo` or
   `single-repo`. With `local`, every task is local. `plans-repo` SHALL
   need `github.planningRepository`.
6. In plans-repo mode the spec folders, spec issues and epic issues SHALL
   live in one planning repository, and code SHALL land in the code
   repositories the specs name.
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

1. Every Avoozl plan SHALL be one Kiro spec folder, `<specs.path>/<name>/`
   (default `.kiro/specs/<name>/`), holding `requirements.md` or
   `bugfix.md` (at most one), `design.md`, and `tasks.md`. Only `tasks.md`
   is required (Requirement FS1).
2. Bugfix specs SHALL be supported the same way as feature specs.
3. In plans-repo mode spec folders SHALL live in the planning repository; in
   single-repo and local mode, in the code repository.
4. Lint SHALL refuse a plan whose folder has no `tasks.md`.
5. Every checklist item in `tasks.md` SHALL start with a backticked task ID.
   Lint SHALL refuse an item with no ID and any ID used twice.
6. Avoozl SHALL map `tasks.md` items to tasks only by these IDs, and SHALL
   derive waits from the list's order (Requirement 4.4). A sub-bullet that
   starts with `$` SHALL be refused with its fix (`facts.removed-key`).
7. The `avoozl-spec` skill SHALL write specs into this layout.
9. A spec's category SHALL come only from a `category:` key in YAML
   front-matter at the top of its `requirements.md` or `bugfix.md`. Avoozl
   SHALL read it, SHALL NOT write it, and SHALL NOT infer one from a title
   or path: a spec without one is shown as Uncategorized. Malformed
   front-matter SHALL produce a warning diagnostic with its file and line
   and SHALL NOT block approval. The Specs view SHALL group specs by
   category.

### Requirement 34: Plugin loading and trust

Design §4.8.

**User story:** As a maintainer, I want outside packages to add content
rules, credentials, checks and context to Avoozl, loaded only with my consent
and unable to break the tick, so that private integrations stay out of the
public repository.

#### Acceptance criteria

1. A plugin SHALL be a package, local folder, or pinned git commit outside
   the Avoozl source tree.
   Avoozl SHALL load a plugin only when a `plugins` entry declares it, either
   in `.avoozl.json` (shared, reviewed in Git) or in the machine-local Avoozl
   settings (`plugins.json`, this machine only, never committed).
2. A `plugins` entry SHALL name the plugin `id`, exactly one of `package` (an
   installed package name), `path` (a local folder), or `git` (34.12), the
   contract version it expects, and an optional non-secret `config`. It
   SHALL NOT hold a credential; a plugin SHALL read credentials from the
   environment by a name `config` gives.
3. Each plugin SHALL ship a manifest, `avoozl-plugin.json`, naming its `id`,
   `version`, `contract` version, the parts it provides (`rules`,
   `credentials`, `checks`, `context`), and its entry module when a part
   needs code. Any other part is refused. The ids `local` and `github`
   SHALL be refused.
4. Before a plugin's first load, and again whenever its version or content
   hash changes, Avoozl SHALL show its id, version, parts, location, and
   content hash, and SHALL load it only after a person approves in
   Settings. The approval SHALL be stored on this machine, not in Git. The
   tick SHALL NOT approve a plugin.
5. Avoozl SHALL run each plugin's code in its own local child process that
   talks to Avoozl only over stdio. Avoozl SHALL give it no port. A plugin
   SHALL NOT open a network listener; one that does SHALL be stopped and
   marked broken. Outbound calls to the plugin's own system are allowed.
6. Avoozl SHALL validate every plugin reply against the contract schema and
   SHALL treat reply text as untrusted data in every brief and view.
7. WHEN a plugin is missing, unapproved, crashes, times out, returns an
   invalid reply, or expects an unsupported contract version THEN Avoozl
   SHALL mark that plugin unavailable, SHALL show the reason on it, and
   SHALL finish the tick for everything else. The next tick SHALL try again.
8. The plugin contract SHALL be versioned by one integer. Avoozl SHALL list
   the contract versions it supports and SHALL refuse to load a plugin whose
   version it does not support. Changes inside one version SHALL be additive.
9. Settings SHALL list every declared plugin with its parts, version,
   approval state, and health, and SHALL offer approve, disable, and remove.
10. Private and company-internal integrations SHALL live outside the public
    Avoozl repository and plug in only through this seam. Public Avoozl
    files (code, tests, fixtures, docs, and this spec) SHALL NOT name any
    company-internal tool. The release leak scan (Requirement 24.2) SHALL
    cover plugin docs and test fixtures.
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
    clone, or resolve a ref. Only Add and Update SHALL fetch plugin files.
14. The approval of a git plugin SHALL bind to its commit as well as its
    version and content hash. WHEN Update resolves `ref` to a different
    commit THEN the plugin SHALL need a new approval before it loads.
15. Avoozl SHALL refuse a git source whose URL carries credentials, whose
    `subdir` leaves the repository, whose commit has no plugin manifest, or
    whose plugin declares dependencies it does not ship. Refusals, logs, and
    views SHALL NOT show a credential.
16. Settings > Plugins SHALL offer Design a plugin, which opens a chat
    seeded with the shipped `avoozl-plugin` skill to plan a plugin and write
    its files, and Plugin guide, which shows the plugin guide in the
    full-file reader. The chat SHALL NOT approve a plugin.
17. At most once a day per plugin, and when a person chooses Check now,
    Avoozl SHALL check whether something newer than this machine's copy
    exists, outside any tick: for a git plugin with `git ls-remote` (a
    branch's newest commit, a higher release tag, or a moved tag), for a
    package with the registry's dist-tags, and for a folder by its content
    hash against the approval. The check SHALL NOT fetch, unpack, install,
    or approve anything, and SHALL NOT send a credential in a URL. WHEN
    something is newer THEN Settings SHALL show it on the plugin and Needs
    you SHALL hold one row for that plugin; a check that fails SHALL show
    on the plugin only. A machine setting, on by default and changed only
    by a person, SHALL turn the check off.

### Requirement 36: Review gates on a local delivery

Design §5.2.

**User story:** As a maintainer, I want every writer's exact commit reviewed
by fresh agents before it lands or anything builds on it, so that no
unreviewed change reaches the base branch or a dependent task.

#### Acceptance criteria

1. Review sessions SHALL run on this machine's reviewer lanes and check runs
   on none, so neither SHALL count against its worker lanes (Requirement
   6.3, and the lane sessions of the simplify spec, SM20). Avoozl SHALL add
   no separate writer limit: every task writes in its own worktree and
   landing merges one head at a time. `lanes.local: 1` gives one writer on
   the machine.
2. Every repository SHALL get one review role by default: id `review`, agent
   `avoozl-reviewer`, `distinctFrom: session`, prompt `prompts/reviewer.md`.
   `delivery.reviewers: []` SHALL turn review off for the workspace or,
   under `delivery.repositories`, for one repository. A repository's
   delivery settings MAY instead name its own review roles, at most 8. Each
   role SHALL have a unique `id`, a `focus` (for example "conventions", or
   "correctness and performance"), the agent that runs it, and a
   `distinctFrom` rule.
3. Each review SHALL run in a new session that did not write the commit and
   saw no other reviewer's session, so that its judgment is its own.
   `distinctFrom` SHALL be `model` when a role leaves it out: the
   reviewer's model SHALL differ from the model of the writer session whose
   commit it reviews. `distinctFrom: session` SHALL relax this to a new
   session only.
4. WHEN Avoozl cannot prove the rule `distinctFrom` names (the writer's or
   the reviewer's model is unknown or `auto`) THEN Avoozl SHALL NOT start
   that review and SHALL open a decision. Validation SHALL refuse a
   `distinctFrom: model` role whose model is unset or `auto`, or equals the
   writer's declared model.
5. Every review SHALL judge the exact commit the writer reported, read only,
   before landing, so that what was reviewed is what lands.
6. A review SHALL end with a verdict: `approved` or `changes-requested`, the
   subject commit, and its findings. Avoozl SHALL refuse a verdict whose
   subject is not the delivery's current commit. A reviewer that cannot
   judge SHALL report `blocked`, which retries that review and never counts
   as approval.
7. A verdict SHALL be stale once the delivery's commit moves (a new writer
   attempt, or a merge of the base). A stale verdict SHALL count for
   nothing, and every role SHALL review the new commit.
8. Avoozl SHALL land a commit only when its checks passed and every required
   review role has approved that same commit. Dependents SHALL start only
   after landing (Requirement 7.3).
9. WHEN landing would change the reviewed commit (the base moved and a
   merge is needed) THEN Avoozl SHALL NOT land it; it SHALL record the new
   commit as the delivery's commit and review it again.
10. WHEN any review returns `changes-requested` THEN that writer attempt
    SHALL end as one review round and a new writer attempt SHALL start on
    the same worktree, whose brief quotes the open findings as data and asks
    the worker to fix each defect or answer it in its done report. Its
    commit SHALL get new reviews from every role, and each review brief
    SHALL quote the worker's done report as an unverified claim and the
    role's open findings from earlier rounds. A review round SHALL NOT spend
    `retries`. WHEN a task reaches `reviewRounds` rounds (default 3, 1 to
    10, set for the workspace or one repository) THEN its delivery SHALL
    wait for a person's decision naming the open findings and SHALL NOT
    land. Earlier attempts and verdicts SHALL be kept as history.
11. A leaf whose repository has review roles SHALL NOT complete any other
    way: `task.update` SHALL refuse a typed `integration` receipt and a
    complete status for it, so that no caller skips the reviews.
12. The In flight view SHALL show, per delivery, each review's role, round,
    the model asked for and the model it ran on, and its verdict.
13. For pull request landing, Avoozl SHALL follow the code repository's
    base-branch rules on GitHub (rulesets and branch protection), read only:
    WHEN they require approving reviews THEN Avoozl SHALL count
    pull-request reviews standing on the head commit and SHALL hold the pull
    request until that many approve; WHEN they require none THEN Avoozl's
    reviewer sessions SHALL be the review gate. Avoozl SHALL NOT keep its
    own approval count. WHEN classic protection is on but GitHub hides it
    from a non-admin THEN the pull request SHALL wait with reason "review";
    only a count GitHub showed SHALL apply.
14. A review session SHALL end only through its verdict report. A turn that
    ends without one SHALL be nudged as a quiet session and SHALL NOT count
    as approval.

### Requirement 37: Every finding is closed

Design §5.2.

**User story:** As a maintainer, I want every finding from a review to be
answered by the next review, so that a defect cannot drop out of sight
between attempts.

#### Acceptance criteria

1. A finding SHALL have an `id`, a `kind` (`defect` or `observation`), 1 to
   20 repository paths, and text of at most 2,000 characters. Paths are
   required so that closure can be checked against what changed.
2. Avoozl SHALL refuse `approved` while the verdict lists, or leaves open,
   any defect, and SHALL refuse `changes-requested` with no defect, so that
   the verdict and its findings agree.
3. A review of a later commit SHALL close every finding still open from
   earlier verdicts of the same role on the same delivery, each as `fixed`,
   `unchanged`, or `withdrawn` when the worker's answer shows it was not a
   defect.
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
7. Rules about a domain's own artifacts SHALL stay in that repository's
   validation script, run as one of the repository's checks. Avoozl SHALL
   NOT encode them.

### Requirement 38: Checks that cannot run keep the gate shut

Design §5.2.

**User story:** As a maintainer, I want a check that could not run to block
acceptance, so that a broken tool never reads as a pass.

#### Acceptance criteria

1. A check SHALL have one of three results: passed (exit 0), failed (any
   other exit), or not run (the command could not start, timed out, or was
   not reported). Exit codes 126 and 127 SHALL read as not run.
2. WHEN any of the repository's checks the commit runs is not run THEN the
   gate SHALL stay shut: the commit SHALL NOT be accepted or landed.
3. A not-run check SHALL fail the checking, not the writer's attempt,
   because the writer did nothing wrong; the check SHALL be retried within
   the retry bound and then open a decision.
4. `task.accept` SHALL take a person's typed evidence, or derive it from
   check results Avoozl recorded: every repository check passed at the
   leaf's landed commit.
5. Check results used for acceptance SHALL be for the task's current commit
   and SHALL cover every repository check, not the earliest result on record
   or a subset of checks.

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
   content: `plan` (every spec file at approval), `github` (issue and pull
   request titles and bodies, comments and replies), `brief` (worker and
   reviewer briefs), `diff` (each worker's diff before it lands, added lines
   only), `intake`, `proposal` and `activity`. A rule set MAY narrow the
   boundaries and repositories it applies to; by default it applies to all
   of them but `intake`, which a set must name.
4. Text SHALL be decoded before matching (percent escapes, HTML character
   references, zero-width characters, backslashes), so that an encoded term
   still matches.
5. WHEN content matches a rule whose action is `block` (the default) THEN
   Avoozl SHALL NOT write or approve it, SHALL NOT redact or rewrite it, and
   SHALL open a decision for the owner that names the rule set, the rule id,
   the boundary, the target (file or field), and the line. WHEN the write
   comes from an agent's own tool call (a responder posting a reply, a
   worker reporting `done`) THEN Avoozl SHALL refuse that call with the
   same names, so the agent can fix it in the same session, and SHALL
   record the refusal without opening a decision.
6. A rule set MAY use action `report`, which writes the content and records
   the finding with a Kiro Crew notification. Built-in rule sets SHALL
   always block.
7. The owner SHALL be able to allow a blocked write once, with a reason.
   The allowance SHALL be recorded with who, why, and when, SHALL cover only
   that rule, that target, and that exact content (by hash), and SHALL be
   used up by the one write. Only a person SHALL allow, from the app page or
   the CLI; the tick and agent sessions SHALL NOT.
8. Receipts, events, decisions, notifications, logs, and the GitHub text
   Avoozl writes SHALL NOT contain a matched private term in clear text;
   they SHALL show the rule set, the rule id, and the location. The app page
   MAY show the matched line on demand by reading it again from its source,
   and SHALL NOT store it.
9. A private plugin SHALL be able to supply rule sets through the plugin
   system (Requirement 34): a plugin part `rules`, loaded only after a
   person approves its exact version and hash, whose rules stay in memory
   and are never written to SQLite, receipts, or Git.
10. WHEN a rule set that `.avoozl.json` names is unavailable (terms file
    missing or refused, plugin missing, unapproved, or broken, or a rule that
    does not compile) THEN every boundary it covers SHALL fail closed: Avoozl
    SHALL write nothing there and SHALL open one decision naming the rule
    set and why it is unavailable. The tick SHALL finish everything the rule
    set does not cover.
11. Matching SHALL run within a time limit per check (2 seconds). A check
    that runs past it SHALL count as unavailable (criterion 10), so that a
    slow pattern can neither stop the tick nor let content through.
12. The plans-repo leak screen (Requirement 28.7, 28.8), the reply screen
    (design §4.7), and the secret screen on markers and publications SHALL
    be built-in rule sets of this feature. Configuration SHALL NOT turn a
    built-in rule set off.
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
17. Residual risk: text a worker writes to GitHub itself, such as `gh`
    comments, does not pass through Avoozl and is not checked by content
    rules. The pre-push hook checks the diff, and quoted outside text in
    briefs (Requirement 10.4) narrows what can steer it.

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
   `queued`, `coding`, `tests`, `commands`, `checks` (checks Avoozl ran
   itself), `ci-wait`, `review`, `rework`, `merge`, and `waiting` (on a
   person or on another task). Each span SHALL record its stage, start,
   end, task, attempt, session role, and the source it came from.
3. Spans SHALL come from events Avoozl already sees: readiness, starts,
   session status, `plans_report` reports, check and review results,
   GitHub check-run and review times, retries, and landing. Avoozl SHALL
   NOT add a poller, webhook, or listener for timing (Requirement 26).
4. WHERE Avoozl can read a session's tool calls (a session the tick opened
   on this machine) THEN Avoozl SHALL split worker time into `coding`,
   `tests`, and `commands` from them: a shell call that runs one of the
   repository's checks SHALL count as `tests`, any other shell call as
   `commands`, and the rest as `coding`.
5. WHERE tool calls cannot be read THEN Avoozl SHALL use the phase markers a
   worker sends with `plans_report` `progress` (`phase`: `coding`, `tests`,
   `commands`, or `ci-wait`), and SHALL count unmarked worker time as
   `coding`. Every span SHALL name which source it came from, so a coarse
   number never reads as an exact one.
6. Timing SHALL hold durations, stage names, check names, and command names
   only. It SHALL NOT hold prompts, transcript text, tool output, tokens, or
   cost. A command name SHALL pass the content rules (Requirement 40) before
   it is stored.
7. Avoozl SHALL compute, per task and per window of finished tasks: lead
   time, flow efficiency (active time over lead time), first-pass rate
   (share of agent tasks finished with no rework and no failed attempt),
   time to fix (line stopped to line green, Requirement 44), and change
   failure rate (share of landed tasks later named as a culprit,
   Requirement 44). Insights and `avoozl insights` SHALL show them.
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
   repository's landing branch fails on a later commit of that branch,
   and it still fails when Avoozl runs it once more on the same commit.
2. Avoozl SHALL stop the line WHEN a task breaks its dependents: a
   dependent's check fails on a check that also fails when Avoozl runs it
   once on the dependent's unchanged base commit, or a dependent's worker
   reports `blocked` naming the task as the cause. A failure that also
   fails on the base SHALL NOT cost the dependent's writer an attempt.
3. A check that fails and then passes on the same commit SHALL NOT stop the
   line. Avoozl SHALL record it as flaky with the check name and commit.
4. Avoozl SHALL find the culprit between the last green commit and the
   first red one. With one landed task commit in that range, that task
   SHALL be the culprit. With more, Avoozl SHALL bisect in a separate
   worktree, never in the landing checkout, up to 8 check runs; past that
   bound the culprit SHALL be "unknown" and the range SHALL be recorded.
5. WHILE the line is stopped THEN Avoozl SHALL NOT start new work in the
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
   next free lane in that repository. Its brief SHALL name the check, the
   culprit commit or range, and the failing output's last lines after the
   content rules (Requirement 40), and SHALL allow either a fix or a revert
   of the culprit commit. A second stop for the same check SHALL reuse the
   open fix task.
8. WHEN the stopped check passes on the landing branch head THEN Avoozl SHALL
   resume starts in the scope, close the stop with its time to fix, and
   notify the owner once.
9. The In flight heading SHALL show a red **Line stopped** banner naming the
   check, the branch, the culprit, the fix task and its state, and how many
   tasks are paused. The stop SHALL enter **Needs you** only when the fix
   task reports a `question`, reports `blocked` with a reason only a person
   can act on, or fails past its retry bound.
10. The owner MAY press **Run anyway**, which SHALL ask for confirmation,
    resume starts in the scope while the stop stays open, and record who
    pressed it and when. Only a person SHALL be able to run anyway; agent
    and plugin callers SHALL be refused.
11. The culprit task SHALL stay landed and accepted. Avoozl SHALL NOT
    reopen or revert it by itself.

### Requirement 45: Local checks first

Design §4.11.

**User story:** As the owner, I want a worker to run the repository's checks
on the machine that made a commit, so that CI only confirms.

#### Acceptance criteria

1. The setting `flow.localChecksFirst` SHALL default to `true`, and
   Settings › Flow SHALL show it.
2. `flow.checks.run` (MCP `plans_run_checks`) SHALL run the checks the
   worktree's HEAD picks, as in Requirement 7.1, and SHALL return each
   check's name, command, exit code, and duration for that commit, and
   record the run in the repository's git directory.
3. Local delivery, where nothing is pushed, SHALL be unchanged: the
   checks already run on this machine (Requirement 7.1).

### Requirement 46: One session per task

Design §4.11.

**User story:** As the owner, I want each task to run on its own, so that
every task keeps its own commit, checks, review and timing.

#### Acceptance criteria

1. Avoozl SHALL hand each ready leaf to its own worker session and its own
   worktree. An agent MAY group its own work inside one task.
2. Checks and review SHALL run on the task's own head commit.
3. Every task SHALL keep its own ID, done bullets, commit and timing.

### Requirement 50: Incoming items from every source

Design §4.12.

**User story:** As the owner, I want work from GitHub and anything else I
script to come into Avoozl the same way, so that an outside tool can hand
Avoozl an item over MCP and a person decides what to do with it.

#### Acceptance criteria

1. An **incoming item** SHALL be one record: `source`, `id`, `link`,
   `kind` (`issue`, `pr`, `review`, or `ticket`), `title`, `body`,
   `labels`, `author`, `assignees`, `state` (`open` or `closed`, with
   `closeReason`, `closedBy`, and `closedAt` when closed), `updatedAt`,
   `fields` (the source's own values), and an optional `trigger`
   (`actor`, `permission`, `eventId`, `at`).
2. Every item from an MCP caller SHALL be checked before it is stored, as
   untrusted data: `source` and `id` 1 to 200 characters; `link` http or
   https only; `title` 1 to 240 characters; `body` at most 20,000; at most
   100 labels and 20 assignees of at most 200 characters each; `fields` at
   most 50 keys of text, number, or true/false values of at most 2,000
   characters. A bad item SHALL be refused with a reason naming the field,
   and the other items of the same call SHALL still be stored.
3. The dedup key SHALL be `source` plus `id`. Storing an item whose
   content is unchanged SHALL write nothing. An item whose `updatedAt` is
   older than the stored one SHALL be ignored as stale and reported so.
4. Incoming items and each source's read state SHALL be stored in the
   workspace SQLite database.
5. The operations `intake.submit`, `intake.list`, `intake.view` and
   `intake.sources` SHALL be shared by the CLI (`avoozl intake`) and MCP
   (the grouped `plans_intake` tool of Requirement 56). `intake.list`,
   `intake.view` and `intake.sources` SHALL only read.
6. Sources SHALL be declared under `intake.sources` in `.avoozl.json` or in
   the machine-local Avoozl settings, like `plugins` entries
   (Requirement 34.1): an id (`github`, `local` and `retro` reserved),
   `via` (`github` or `mcp`), the registered workspace `repository` its
   work lands in, and optional `labelFields` and `assigneeField`.
8. `intake.submit` SHALL take `{source, items}` with 1 to 100 items for a
   source whose `via` is `mcp`, and return a result per item (`created`,
   `updated`, `unchanged`, `stale`, or `refused`, with a reason). A submit
   to `github` or to an undeclared source SHALL be refused.
9. Each stored or changed item SHALL go through, in order: the checks of
   criterion 2, dedup, content rules, then the intake list, where it waits
   for a person. No label or rule SHALL start work from an item.
10. Content rules SHALL have an `intake` boundary (Requirement 40.3) that
    screens an item's title, body, labels, and fields. A `block` finding
    SHALL quarantine the item and open a decision that names the set and
    rule but never the matched text; a `report` finding SHALL be recorded
    and the item SHALL continue. No built-in set SHALL run at `intake`.
14. An MCP caller SHALL count as the local owner, with no verifiable
    outside actor: whatever `author` or `trigger` it sends is recorded as
    its claim. A close it reports SHALL be treated as a close by an actor
    who is not allowed (criterion 18).
15. A person SHALL be offered **Plan this** (`intake.plan`) and **Deliver
    this** (`intake.deliver`, one leaf in the source's repository, pinned
    to the item's snapshot). Both SHALL be refused from an agent session or
    MCP.
17. WHEN a source changes an item tied to a task THEN Avoozl SHALL update
    the record. A body or title changed after the task's snapshot SHALL
    quarantine the task, which keeps the snapshot's title, until a person
    confirms the new snapshot with `intake.confirm` {source, id, hash},
    where `hash` is the `snapshotHash` (title and body) that `intake.view`
    showed; a changed item SHALL be refused. Sessions and MCP callers SHALL
    be refused.
18. WHEN a source closes an item tied to a task THEN an allowed actor's
    close SHALL release dependents, be recorded, and never count as a
    verified completion; any other close, or one whose actor is unknown,
    SHALL hold the dependents and open a decision. Avoozl SHALL NOT reopen
    the item.
20. Avoozl SHALL write nothing to a non-GitHub source.
21. A closed item tied to no task SHALL be deleted from SQLite 30 days
    after it closed. An item tied to a task SHALL be kept while the task
    exists.
22. Public Avoozl code, docs, fixtures, and tests SHALL name sources only
    generically (an internal ticket tracker, the fake MCP caller), and the
    release leak scan SHALL cover them.

### Requirement 53: Agent and model per session

Design §4.10 "Agent and model per session".

**User story:** As the owner, I want to choose which agent and model write
the tasks, so that hard work gets a strong model and routine work gets a
cheap one.

#### Acceptance criteria

1. Review roles SHALL keep their own `agent` and `model` (design §5.2).
2. Each role's session (`worker`, `reviewer`, `responder`, `checkDecide`,
   `assist`) SHALL come from its row of the `roles` table (Settings ›
   Models, Requirement 98.5), and then Kiro Crew's default agent and
   `auto`.
4. For a review role with `distinctFrom: model` (Requirement 36), the
   `worker` row SHALL name the writer's model, not `auto`. Avoozl SHALL
   never run a review on the writer's model under `distinctFrom: model`.
5. Every session binding SHALL record the model asked for, and the model
   Kiro Crew reports it ran on, when Kiro Crew reports one.
6. The In flight view SHALL show the model of each running session.

### Requirement 54: Pull request feedback goes back to its writer

Design §4.13.

**User story:** As the owner, I want failed checks and merge conflicts on an
Avoozl worker's pull request sent back to that worker, so that the pull
request gets fixed and merges without me.

#### Acceptance criteria

1. This requirement SHALL cover each task whose pull request Avoozl opened
   from its claim branch.
2. WHEN a required check fails on the pull request's head commit THEN
   Avoozl SHALL send the failed checks back to the worker, even on a draft
   pull request.
3. WHEN the pull request conflicts with its base branch THEN Avoozl SHALL
   send the conflict back to the worker, for at most the repository's
   `conflicts.maxAttempts` rounds.
4. Messages SHALL quote outside text as data (Requirement 10.4).
10. Avoozl pushes, updates and merges the pull request (Requirement 87); the
    worker only edits and commits.

### Requirement 56: Fewer MCP tools, every safe action

**User story:** As the owner, I want a session to reach every safe Avoozl
action through a few MCP tools, so that its tool list stays short and
nothing a person must decide can be done from a chat.

#### Acceptance criteria

1. MCP SHALL offer one grouped tool per thing a session acts on, each with
   an `action` field whose values are listed in its schema. Each action
   SHALL call one existing operation, with that operation's authority class
   unchanged.
2. Approving a plan or plugin, Allow once, choosing a conflict winner,
   content-rule terms, Who counts and other settings, adding or removing
   repositories, GitHub setup writes, flow settings and Run anyway, Plan
   this and Deliver this, and deletes SHALL be person only. An MCP call that
   reaches one, under any tool name, SHALL be refused before anything runs,
   saying to do it in the Avoozl app. A test SHALL fail when an operation
   has neither an MCP route nor a written reason it has none, and a test
   SHALL check that each person-only operation is refused. Marking a manual
   task done or reopening it is person only too (Requirement 61.13).
3. Only registered tools SHALL be listed or answered. A narrow tool that a
   shipped agent, role prompt or brief names (such as `plans_report`,
   `plans_next` or `plans_land`) SHALL stay as a current tool, so no agent's
   allowedTools grows. Agents, prompts and briefs SHALL name only registered
   tools, and a test SHALL fail when one names a tool that is not
   registered or when a read-only role is given a grouped tool with write
   actions. The four reads `plans_query`, `plans_get_task`,
   `plans_documents` and `plans_get_document` SHALL be narrow tools over the
   `query`, `task.get`, `plan.table` and `document.get` operations.
4. A session MAY archive and unarchive a plan, and the record SHALL name
   the session.
5. A grouped tool with a read-only name SHALL stay read only, so an agent
   allowed that name gains nothing.

### Requirement 59: Parent specs and phases

Design §6.9.

**User story:** As the owner, I want a large goal to be a parent spec that
links its member specs, and the groups of tasks inside one spec to be its
phases, so that a rewrite shows its member specs and their progress, and no
grouping is made up from a file path.

#### Acceptance criteria

1. A parent spec SHALL link each member spec with a Markdown link in a task
   title whose target is `<specs.path>/<name>/tasks.md`. That task SHALL be
   a spec group whose children are the linked spec's phases, so the linked
   spec's tasks wait as the parent's list orders them (design of the
   simplify spec, §D19.2).
2. Lint SHALL refuse a spec group whose linked folder does not exist
   (unless an earlier open task in the same list stands for it), a spec
   linked as a spec group more than once in the repository, and a spec
   group with sub-items of its own.
3. Lint SHALL refuse the front-matter keys `kind` and `epic` with the fix
   "link member specs from the parent's task titles".
5. A **phase** SHALL be a group of tasks inside one spec: the nearest `##`
   heading above its item in `tasks.md`, whose text is its title. A task
   under no heading SHALL sit under its spec as **No phase**. Phases SHALL
   run in order (Requirement 4.4) and SHALL add no other edges.
6. Avoozl SHALL NOT invent a grouping named after a file. No view, list,
   filter or brief SHALL show a raw `doc:` ID or a file path as a group
   name.
10. The Graph SHALL drill into a spec's phases, then a phase's tasks, with
    Back stepping out one level at a time (Requirement 60).

### Requirement 60: One Back history for the app page

**User Story:** As a user, I want Back to work everywhere on the Avoozl
page, so that I can retrace tabs, sections, drill-ins and dialogs without
leaving the page.

#### Acceptance Criteria

1. The page SHALL keep one Back history. A step SHALL be a top tab, an
   inner tab (a Settings section, a repository sub-tab, other in-view
   tabs), an opened spec, a Graph drill-in level (the Graph's own stack,
   not a copy), or an open drawer (task drawer) or modal (file viewer,
   repository Edit, Add plugin, confirm).
2. The mouse back button, Alt+Left and Cmd+[ SHALL take one step. Esc
   SHALL close the topmost drawer or modal. Alt+Left in a text field
   SHALL stay with the field.
3. Going back SHALL restore the view's scroll position and selection
   (the opened spec, the Graph level, zoom and selected task). Focus SHALL
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

### Requirement 61: Manual tasks

Design §4.16.

**User story:** As the owner, I want to put steps in a spec that only people
do, such as a team review, so that a person's step gates the work after it.

#### Acceptance criteria

9. A leaf whose title ends with `(**MANUAL**)` SHALL be a step only a person
   does. Its plain sub-bullets say what the person checks. Lint SHALL refuse
   the tag on a group and any other form of the word `manual` in
   parentheses or bold.
10. A manual leaf SHALL never be claimed, checked, reviewed or landed by
    Avoozl, and SHALL never appear in the ready leaves a worker or the tick
    reads. Tasks after it SHALL wait until it is done.
11. Before the tasks it waits on are done, a manual leaf SHALL sit in
    **Blocked or waiting**. Once they are, it SHALL sit in **Needs you**
    with the reason "Waiting for a person: <title>", in every view.
12. The task drawer SHALL show a manual leaf's done bullets and a **Mark
    done** button. Mark done SHALL open a dialog with a choice of **Done**,
    **Skipped** or **Refused**, and SHALL record who, when and the choice.
    Done and Skipped SHALL release the tasks that wait on it; Refused SHALL
    keep them held. Skipped SHALL show on the task.
13. Marking a manual leaf done or reopening it SHALL be person only (page
    and CLI). An MCP call SHALL be refused under Requirement 56.2.
15. Flow timing (Requirement 43) SHALL count a manual leaf's time in Needs
    you as waiting on a person, and SHALL leave it out of first-pass rate.

### Requirement 62: The Plans page is called Specs

Design §8.7.

**User story:** As the owner, I want the page and its words to say spec,
so that the name matches the `.kiro/specs/<name>/` folders I write.

#### Acceptance criteria

1. Everything a person reads on the page SHALL call Avoozl's plan a
   **spec**: the nav tab and heading (**Specs**), buttons, drawer and
   dialog text, tooltips, aria labels, empty states, filters, column
   labels, notices and the operation messages the page shows.
2. These names SHALL NOT change: the `plans_*` MCP tool names, the `plan.*`
   and `plans.*` operation names, CLI commands and flags, `.avoozl.json`
   keys, SQLite tables and columns, the **Plans repository** mode and the
   plans repository it names. Text under `docs/research/` and
   `docs/evidence/` SHALL stay as written.
3. A test (`hosts/kirocrew/ui/test/specs-name.test.ts`) SHALL read the
   page's source and fail on any user-facing `plan` or `plans` word outside
   an allowlist. The allowlist SHALL name each kept name of criterion 2 and
   each use of plan as a verb, one entry per phrase.

### Requirement 64: Pull the Andon cord

Design §4.11.

**User story:** As the owner, I want to stop new work myself when I see
something wrong, so that nothing new builds on it while it is looked at.

#### Acceptance criteria

1. The In flight heading SHALL show a **Stop the line** button. It SHALL
   open a dialog with a scope and a reason, and Cancel SHALL change nothing.
2. The scope SHALL be one of: everything in the workspace (`all`), one
   repository (`repo`), one spec (`spec`), or one task and its transitive
   dependents (`task`). The dialog SHALL list the repositories, specs and
   tasks to choose from. A missing or unknown repository, spec or task
   SHALL be refused by name, and nothing SHALL be recorded.
3. The reason SHALL be required: one line of 1-200 characters. An empty
   reason, a longer one, or one with a line break SHALL be refused.
4. The reason SHALL pass the `brief` content-rule boundary (Requirement 40).
   A `block` finding SHALL refuse the pull, name the set and rule and never
   the matched text, and record nothing.
5. WHILE a pulled stop is open THEN Avoozl SHALL NOT dispatch new work in
   its scope. Running sessions SHALL be left alone.
6. The **Line stopped** banner (Requirement 44.9) SHALL show each pulled
   stop with who pulled it, its scope and its reason, and how many tasks it
   pauses. Each open stop SHALL also be one Needs you row.
7. A pulled stop SHALL close only through **Resume**. Resume SHALL be one
   button on the banner and one CLI command, SHALL be a person's only, and
   SHALL record who resumed it and when. Agent, app-token and plugin
   callers SHALL be refused with 403.
8. A pulled stop SHALL never resume by itself: no passing check, integrated
   fix or tick SHALL close it. An automatic stop (Requirement 44) SHALL
   keep its own rules: Resume SHALL NOT change it, and Run anyway SHALL NOT
   apply to a pulled stop.
9. Agent sessions SHALL be able to pull the cord over MCP (`plans_session`
   action `stop_line`) with a reason, for example when a worker finds a
   broken base. The stop SHALL name the session as who pulled it, and the
   owner SHALL be notified once.
10. The CLI SHALL offer `avoozl flow stop` with a scope and a reason (or
    `--full`), and `avoozl flow resume` with the stop ID.
11. A resumed stop SHALL record its open-to-resume time as its time to fix.
12. The Stop the line dialog SHALL offer two choices: **Stop the line**,
    which stops new work only (criteria 1-11), and **Stop all agents**, a
    full stop. A full stop SHALL pause everything in the workspace like
    scope `all`, and SHALL also stop every running session the tick opened
    at once. It SHALL keep each worktree and branch, and SHALL mark each
    stopped attempt "Interrupted by stop". An interrupted attempt SHALL NOT
    count as a failure toward the retry limit, and SHALL NOT be nudged.
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
16. A full stop SHALL be recorded as `full`, with the sessions it stopped.

### Requirement 71: Activity log and Activity tab

Design §4.19.

**User story:** As the owner, I want one list of what people, sessions,
GitHub and plugins did in this workspace, so that I can see who changed
what and when without reading chats, the tick log or GitHub.

#### Acceptance criteria

1. Avoozl SHALL keep an `activity_log` table in the workspace's SQLite.
   Each row SHALL hold its time, source (`local`, `github`, `plugin`, `mcp`
   or `tick`), actor, kind, a short summary, a target ID and a link.
2. Avoozl SHALL record these local actions when they succeed: dispatch,
   a session message, stop (a task set to Deferred), pulling and resuming
   the Andon cord, merge, approval, archive and unarchive, delete, marking
   a manual task done or reopening it, a settings save, plugin approval,
   and a model switch. A call through MCP or an agent session SHALL be
   recorded with source `mcp` and the session as actor.
3. The tick SHALL record what it sees change from GitHub: closes, merged
   closing pull requests, board moves and conflicts. A change seen twice
   SHALL be recorded once. A failing, stalled or recovered tick SHALL
   write one row with source `tick`.
4. A row SHALL hold only IDs and a short summary Avoozl writes. It SHALL
   NOT hold a prompt, a content-rule term, a token, file contents, or an
   issue or pull request title or body. A summary SHALL be at most 200
   characters.
5. Before a row is saved, Avoozl SHALL screen its actor, summary, target
   and link with the built-in secret and path screens and the content-rule
   sets that cover the `activity` boundary. A set with no `boundaries`
   list SHALL cover it. A row that matches, or that a set cannot check,
   SHALL be saved as redacted: its time, source and kind, the summary
   "Redacted by content rules", and no actor, target or link.
6. Rows SHALL be kept 30 days by default. `activity.retentionDays` in
   `.avoozl.json` (1-365) SHALL change it, from the Activity tab's Keep
   activity field. Each tick SHALL delete older rows.
7. The page SHALL have an Activity tab: the shared heading, the shared
   filter panel with Source, Kind and Actor, 100 rows per page with the
   shared Show more, newest first. A row whose target is a task SHALL open
   the task drawer. Every GitHub thing in a row SHALL link to GitHub in a
   new tab with `target="_blank"` and `rel="noopener noreferrer"`. Each URL
   SHALL be built from the row's known GitHub repository, never from free
   text; a repository with no GitHub remote SHALL show plain text.
8. Avoozl SHALL expose one helper, `recordActivity`, that any part of
   Avoozl calls to add a row. It SHALL validate and screen the row as in
   criteria 4 and 5, and SHALL never make the action that called it
   fail.
9. `activity.list` SHALL read the log with `source`, `kind`, `actor`,
   `limit` (at most 100) and `offset`, and SHALL be the `activity` action
   of the `plans_view` MCP tool. Recent task events SHALL be `plans_view`
   action `recent`. `activity.settings.update` SHALL be a person's only.

### Requirement 73: Searchable task and spec pickers

Design §8.9.

**User story:** As the owner, I want to type to find a task or spec
wherever I pick one, so that I never scroll a long dropdown.

#### Acceptance criteria

1. Every place the page picks one task or one spec SHALL use one shared
   combobox: the Stop the line scope, the filter panels, and any other task
   or spec choice.
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
5. The list SHALL show at most 50 results with a count of the rest, and a
   test SHALL filter 5,000 tasks and see 50 shown.

### Requirement 75: Investigate before coding

**User story:** As the owner, I want a worker to show what it found before
it writes code, and a reviewer to try to prove it wrong, so that agents do
not build on a wrong reading of the task.

#### Acceptance criteria

1. A task asks for findings first when one of its bullets names a findings
   file. The `avoozl-investigate` skill SHALL tell its worker to write that
   file in the task's worktree before changing code: what it read, the
   cause or approach it believes, the change it plans, how it will check
   it, and a confidence of low, medium or high.
2. The skill SHALL tell the reviewer of such a task to read the findings
   file first and look for evidence that it is wrong, and to report a
   refuted claim as a defect on the file.
3. Lint SHALL refuse a `$investigate` bullet with the fix: split the task
   into an investigation task whose bullets name `findings/<id>.md`, then
   the task whose bullets name that file.

### Requirement 77: Bring task branches up to date

Design §4.23.

**User story:** As the owner, I want agent work to keep up with the base
branch without rewriting pushed history.

#### Acceptance criteria

3. Writers SHALL merge, never rebase a pushed branch, and SHALL NEVER
   force push. Avoozl SHALL refuse to send a brief or feedback message that
   asks for a force push, and SHALL say why in Needs you.
5. For local delivery, a task branch whose worktree is behind the
   integration branch SHALL be merged forward before its checks run.

### Requirement 80: Who merges a pull request

Design §4.25.

**User story:** As the owner, I want to choose whether Avoozl's pull
requests open as drafts and who merges them, so that nothing lands before I
want it to.

#### Acceptance criteria

1. `landing.pr` SHALL be the one setting for who merges a `pr` landing's
   pull requests: `draft` (the default), `ready` or `auto`. It MAY be set
   for the workspace at the top level of `.avoozl.json`, and for one
   repository in its landing block, which wins. Any other value SHALL be
   refused on load. Only a person SHALL change it.
2. Each pull request Avoozl opens SHALL be a draft exactly when `landing.pr`
   is `draft`.
3. A draft SHALL wait with reason `draft` and one Needs you row. It SHALL
   NOT be merged or put in a merge batch while it is a draft, and a
   required check that fails on it SHALL still go back to the worker. A
   person SHALL release it by clicking Ready for review on GitHub, which
   Avoozl SHALL see on its next read of the pull request, or by pressing
   **Approve** in Avoozl (`landing.ready`), which SHALL call GraphQL
   `markPullRequestReadyForReview` and only mark it ready. A push to a
   released pull request SHALL NOT make it a draft again.
4. With `draft` or `ready`, once checks and reviews pass on the exact head
   the pull request SHALL wait with reason `merge` and one Needs you row. A
   person SHALL merge it on GitHub, which Avoozl SHALL record, or press
   **Merge** in Avoozl (`landing.merge`) for that exact head, which merges
   it guarded by the head.
5. With `auto`, Avoozl SHALL merge the pull request from the tick once checks
   and reviews pass on the exact head. Avoozl SHALL NOT arm GitHub
   auto-merge.
6. **Approve** and **Merge** SHALL be a person's only: refused for agents,
   MCP and the tick.
7. WHEN a pull request closes without merging THEN its task SHALL stay
   claimed and Needs you SHALL show one row for it, with Delete claim
   branch to make the task ready again.
8. `direct` landing and `off` SHALL have no merge setting (Requirement 87).

### Requirement 83: Security follow-ups from the PR 29 audit

Design §6.12.

**User story:** As the owner, I want repository code, agent sessions and
other local users held to what I approved, so that a public repository or a
chatty agent cannot reach my secrets or my approvals.

#### Acceptance criteria

1. WHEN the CLI is run with `KIROCREW_SPAWNED=1` or `KIRO_SESSION_ID` set
   THEN it SHALL run a person-only operation and SHALL record that it ran
   in an agent session. The command line is a person's tool, so it does not
   refuse. A supervisor child (`AVOOZL_CHILD`) SHALL be refused
   (Requirement 95.5).
2. The docs SHALL say plainly that person-only stops MCP and app tokens, not
   code running as the user. A draft request to Kiro Crew for passing the
   proxy secret by descriptor or a 0600 file SHALL be kept in
   `docs/kirocrew-requests/`.
3. A new `.avoozl` folder SHALL be 0700 and a new database 0600, set before
   the database opens. Backups SHALL be 0600. An existing workspace SHALL be
   tightened on open.
4. `docs/checks.md` SHALL name the repository-owned code that runs on its
   own. `scripts/worktree` SHALL run only when the repository's
   `worktreeHelper` equals its SHA-256 hash; otherwise the refusal SHALL
   show the hash.
5. A repository MAY set `checksEnv`, a list of variable names. Check
   processes SHALL then get only those, the basics needed to start, and
   never the gateway credentials.
6. A local-folder plugin SHALL be hashed again just before it starts and
   SHALL be refused if the hash changed since approval.

### Requirement 85: The content hook

Design §6.14. Usage in `docs/content-hook.md`.

**User story:** As the owner of a machine that holds private names, links and
notes, I want any agent that writes to GitHub with my login to have its
writes checked before they run, so that one careless line does not become a
public leak.

#### Acceptance criteria

1. Avoozl SHALL ship a hook command, `avoozl content hook`, that any agent
   can run as a pre-tool-use command before each shell call. It SHALL read
   the call from stdin and, for these writes, run content rules
   (Requirement 40) before they run: `gh issue` and `gh pr` writes, `gh api`
   with a write method or body fields, and `git commit`, `git tag` and
   `git push`. It SHALL check the text, the labels, the branch name, and,
   for `git push` and `gh pr create`, the commit messages and added lines
   the call would publish.
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

   | Step | Owner | What it does |
   | --- | --- | --- |
   | Pick | Avoozl | Ranks ready tasks by the open tasks that wait on each, then the longest open chain below it, then its place in `tasks.md`, and claims the top one with a claim branch |
   | Prepare | Avoozl | Adds the task worktree with the approved `scripts/worktree` helper or `git worktree add` |
   | Work | Chat | Edits in that worktree, then reports; Avoozl commits a sandboxed child's changes |
   | Verify | Avoozl | Runs the repository's checks in the task worktree and checks the diff against protected paths |
   | Land | Avoozl | Lands through the per-base-branch queue (Requirement 87) |
   | Accept | Avoozl | Stop the line (Requirement 64) watches every head Avoozl landed |

3. The worker SHALL edit code and report. Avoozl SHALL commit sandboxed
   child changes; a chat or person MAY commit locally as Requirement 96
   permits. Its brief SHALL NOT tell it to push, open or edit a pull
   request, merge, turn on auto-merge, label, or comment. Avoozl SHALL read
   the commit from the worktree and SHALL NOT take the commit from the
   chat's report.
4. GitHub SHALL hold spec and epic issues (Requirement 102), never per-task
   issues or Project task state. External issue labels or arbitrary
   comments SHALL NOT grant authority.
5. A spec SHALL run on this machine only when its spec issue, and the spec
   issue of every parent spec that links it, is assigned to this runner's
   login alone (Requirement 116).
6. Verify SHALL send a diff that touches a protected path (the flow
   setting `verify.protectedPaths`, plus `.github/workflows/**` and
   `scripts/worktree` by default) to the owner in Needs you before it
   lands; `avoozl verify allow` lets that exact commit through. The same
   diff SHALL pick which of the repository's checks run: a check that names
   paths runs only when the diff touches one.
7. The repository's checks SHALL run in the task worktree, warm (the
   worktree keeps its dependencies and build output between attempts), in
   their own job off the tick, with a timeout per check, keyed by the
   check's name in `verify.checkTimeouts`. A check SHALL see only the
   environment a process needs to start and the names the repository lists
   in `checksEnv`, and never the push or GitHub credentials, even when
   listed. Checks are the repository's; a task never names them.
8. Approval SHALL be an approver's commit on the specs branch (Requirement
   114).

### Requirement 87: Avoozl lands the work

Design §4.26.

**User story:** As the owner, I want Avoozl to push and merge only after the
checks pass on the exact head it lands, so that main stays green without me
pressing merge.

#### Acceptance criteria

1. Each repository SHALL have one landing block,
   `github.repositories.<owner/name>.landing`, edited on the repository's
   Landing tab in Settings: `mode` (`direct`, `pr` or `off`), `pr`
   (Requirement 80), `method` (`squash` or `merge`, default `squash`),
   `mergeBatch` and `commitPrefix`. A repository with no mode SHALL be
   `off`. Under `off` Avoozl SHALL push nothing. The block's mode wins over
   the repository row's `landing`.
2. `direct` SHALL select an exact verified commit, or a merge batch of
   waiting members across specs, up to the size limit of `merge-batches`
   MB2. A landing worktree SHALL stack them on the current base, check that
   exact candidate, and fast-forward from the recorded base. A moved base
   SHALL require a new candidate and checks. A failed merge batch SHALL be
   narrowed to one culprit (`merge-batches` MB4). Declared append-only
   `landing.unionPaths` SHALL merge only in that landing worktree and SHALL
   still pass all checks.
3. `pr` SHALL open or reuse one pull request for an exact verified commit,
   including a head on an authorized fork. Each head SHALL meet its own
   required checks and the repository's review rule. Only the head of the
   per-base queue MAY be updated. Source push permission SHALL NOT imply
   target merge permission. Without merge permission Avoozl SHALL observe
   an authorized maintainer's merge. Pull requests SHALL land one at a
   time, never in a merge batch.
4. Avoozl SHALL land only after checks passed on the updated head. It SHALL
   never force push, never use `--admin`, and never bypass a required
   review or check.
5. Landing SHALL be serialized per base branch through one queue, using the
   work lock (`withWorkLock`, `src/app/git/git.ts`). Stop the line SHALL
   pause the queue; a paused queue SHALL keep its order.
6. WHEN a merge of the base into the task branch conflicts THEN Avoozl SHALL
   send the conflict to the same worker with the list of conflicted files,
   for at most the repository's `conflicts.maxAttempts` rounds (default 2).
   A later failure SHALL go to Needs you.
9. Every push and merge SHALL pass the pre-push content rule (Requirement 40)
   on the commit messages, the branch name and the added lines first.
10. A push or merge made by the tick SHALL run as the tick's own process,
    not from a chat shell.

### Requirement 88: Unattended worker basics

Design §4.26.

**User story:** As the owner, I want a chain of tasks to keep moving while I
am away, through a gateway restart, so that I come back to landed work
instead of a stuck chat.

#### Acceptance criteria

1. The Kiro Crew cron that opened a lane chat SHALL set the chat's trust
   mode again on every tick, because a gateway restart loses it.
2. A worker SHALL report by CLI from its worktree. Avoozl SHALL match the
   report to the task by the worktree path and the task's report token in
   the brief, so a report needs neither MCP sharing nor the gateway's
   session identity.
3. A local worker chat SHALL open with `project: false` and the worktree
   path in its brief.
4. WHEN Kiro Crew reports a worker chat gone THEN Avoozl SHALL start the
   task once more on a free worker lane, in the same worktree with the same
   brief and the last report quoted as data, and the closed lane SHALL wait
   for a person's Resume (simplify SM20.8). A second vanish of the same task
   SHALL go to Needs you. Avoozl SHALL NOT replace a chat because it went
   quiet or its activity lease expired.
5. `lanes.local`, default 3, SHALL be a setting in the machine file
   (Requirement 6.3).
6. Prepare SHALL use the approved `scripts/worktree` helper
   (`createWorktree`, `src/app/git/git.ts`). Avoozl SHALL remove a task's
   worktree and its local branch after the task lands, and SHALL keep them
   for a task that did not land.

### Requirement 92: Links to related GitHub items

**User story:** As a driver, I want each spec and task to link to its issue,
branch, pull request, checks and landed commit, so that I can reach the
GitHub item in one click without Avoozl copying GitHub's browser.

#### Acceptance criteria

1. Avoozl SHALL build one link set per spec and one per task, only from
   records it already stores: the spec issue (Requirement 102), the spec
   working branch, the task branch and worktree, the task pull request and
   its check state from landing (Requirement 87), and the landed commit
   from delivery records.
2. Building, showing, filtering or refreshing link sets SHALL make no GitHub
   call.
3. Link targets SHALL be built from validated repository names, numbers,
   ref names and SHAs only, never from a URL read from issue or comment
   content. A missing record SHALL show as missing. Check state SHALL show
   its age, and state from a head that is not current SHALL NOT show as
   current.
4. The spec details panel SHALL have a **Links** box: the spec issue, the
   working branch, and open pull requests with a check dot each.
5. The task drawer SHALL have a **Links** tab: branch, pull request, checks,
   landed commit and issue.
6. Each In flight row SHALL show small chips: `PR #N` with a check dot, and
   the branch.
9. Every link to GitHub SHALL open in a new tab with `target="_blank"` and
   `rel="noopener noreferrer"`.
10. Public text SHALL follow the privacy rule (Requirements 102.16-102.18):
    no host names, usernames, local paths or private spec references. A
    worktree path SHALL show only in the local app, never in a GitHub write.

### Requirement 93: Any harness runs the work; one executor seam

Design §4.28.

**User story:** As the owner, I want Avoozl to start, message and watch a
worker through one small interface, so that I can run a task with any agent
harness without changing the loop.

#### Acceptance criteria

1. Avoozl SHALL start and drive every agent session through one executor
   interface (`src/app/executors/executors.ts`):

   | Call | Input | Output |
   | --- | --- | --- |
   | `start` | role, task, worktree, brief, model, permission class | session ID |
   | `send` | session ID, text | accepted or refused |
   | `status` | session ID | `working`, `idle`, `exited <code>`, or `gone` |
   | `stop` | session ID (optional for an executor) | stopped |
   | `usage` | session ID (optional for an executor) | tokens and cost, when the harness has them |

2. Avoozl SHALL ship two executors. `kirocrew` SHALL hold the Kiro Crew
   session calls; folders and project directories SHALL be its private
   detail, not part of the interface. `process` SHALL run an agent CLI as a
   child process in the task worktree (Requirement 95).
3. The tick SHALL stay a pure planner: it SHALL write session requests that
   name an executor, and each executor SHALL take only the requests that
   name it.
4. The interface SHALL carry no Kiro Crew word.
5. A session request that names no executor SHALL use `kirocrew`. A role's
   harness saved in Settings › Models SHALL pick `process` for it.

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
   placeholder next to shell text, or an unknown placeholder SHALL be
   refused when the file is loaded.
3. A definition SHALL be approved by hash (`avoozl harness`,
   `harness.approve`), as the worktree helper is (R83.4). A changed file
   SHALL not run until a person approves its new hash.
4. Permission for unattended children: a write role SHALL use the
   harness's workspace-write sandbox, whose write roots are the task
   folder, the temp directory, and the cache directories the repository
   config names (`sandbox.writeRoots`, for example a compiler cache such as
   sccache); a read-only role SHALL use its read-only mode.
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
4c. Each repository SHALL have a command allow-list for unattended children
    (`sandbox.allowCommands`: its build and test commands), passed to the
    harness's allow setting, so a child does not stall on a prompt.
    `git push` SHALL never be allowed, and an entry that allows it, in any
    form, SHALL be refused.
4d. A harness whose own sandbox cannot run inside Avoozl's (on macOS a
    nested `sandbox-exec` fails with `sandbox_apply: Operation not
    permitted`) MAY set `permission.write` to exactly `danger-full-access`,
    its value for no inner sandbox. Avoozl SHALL then start such a child
    only inside its own sandbox, with the write roots of 4. WHEN no Avoozl
    sandbox is active THEN it SHALL refuse the session, opt-in (5) or not.
    Every other place and value of 4b stays refused, `permission.read`
    included.
5. A harness that cannot confine writes to the worktree SHALL be refused for
   write roles, unless the owner opts in for that machine
   (`harness-unconfined.json`, at the definition's current hash).
7. Adding a harness SHALL need only its definition file.

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
   is a speed bump, not a guarantee: the child runs as the owner and could
   unset the marker, write the database or call `gh`.
6. "A child never does a person-only act" SHALL hold only through the
   sandbox: for a `process` child the workspace database, the GitHub and
   other credentials, and the Kiro Crew home SHALL be outside its read and
   write roots, and its network SHALL be off or restricted to what the
   repository names. A harness that cannot do this SHALL be refused for
   unattended roles unless the owner opts in for that machine.
7. For a `kirocrew` chat, person-only refusal SHALL stay a speed bump, and
   the docs SHALL say so plainly.

### Requirement 96: One way to finish

Design §4.28.

**User story:** As the owner, I want every worker, on any harness, to finish
in a way Avoozl reads the same, so that Avoozl reads one kind of result.

#### Acceptance criteria

1. A `process` child SHALL finish by writing a small result file,
   `.avoozl/result.json` in its task folder (`{"state": "done" | "blocked",
   "text": "..."}`, at most 8 KB), and exiting. The supervisor pass SHALL
   read the exit code and that file, and SHALL record the result. The brief
   SHALL say so as its last step.
2. A `kirocrew` chat and a person SHALL finish with
   `avoozl runner report TASK done|blocked` (with text for `blocked`), the
   CLI report of Requirement 88.2.
3. Avoozl SHALL match a result to its session by the supervisor pass's
   record or the worktree, SHALL make or read the commit in the worktree
   itself (Requirement 94.4a), and SHALL treat the result text as data.
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

1. Each role's prompt SHALL live in `prompts/<role>.md`: `worker`,
   `reviewer`, `responder`, `check-decide` and `assist`.
2. The host files, the Kiro Crew agent files among them, SHALL be generated
   from `prompts/` and `roles.json` by `npm run build:hosts`. A check SHALL
   fail when a generated file differs from its source.
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
   `worker`, `reviewer`, `responder`, `checkDecide` and `assist`. Every row
   MAY set `harness`; `worker` MAY also set `agent` and `model`, and
   `checkDecide` MAY also set `model`. A missing key or `auto` keeps that
   role's default. Any other role or field SHALL be refused by name.
6. Settings › Models SHALL be the only page that picks a role's harness,
   agent or model. Settings › Autopilot SHALL keep only delivery choices:
   a picker of **Off** (you deliver) and **Autopilot** (Avoozl delivers),
   and below it every Autopilot setting, with this machine's `loop.run` and
   `loop.every`. Autopilot SHALL show as on only when the `delivery` block
   and this machine's `loop` are both set. Picking Autopilot SHALL write
   both; picking Off SHALL remove this machine's `loop` only. Each SHALL be
   a person's alone. While tasks are ready and this machine has no `loop`,
   Needs you SHALL show one row saying Autopilot is off on this machine and
   how to turn it on.
8. Saving Settings › Models SHALL write `roles`.

### Requirement 102: Working branches and spec issues

Design §4.32.

**User story:** As a spec owner or contributor, I want pushed work to
survive a change of driver, including work on forks, without one GitHub
issue per task or exposing private planning information.

#### Acceptance criteria

1. Git SHALL hold design, approvals, ticks and implementation; the spec
   issue SHALL hold ownership (its assignee) and discussion; SQLite SHALL
   cache local execution. There SHALL be one issue per published spec and
   one for its epic, never one per task.
2. The tick SHALL publish the spec issue in its home repository for each
   approval this workspace adopts or makes (workflow v1 rule 8.1);
   `avoozl spec publish` SHALL stay a person's retry. An issue the
   workspace already holds for the spec or epic SHALL be reused.
3. A successor SHALL start once its prerequisite's tick reaches the base
   branch. Checkbox marks SHALL stay outside the approved revision hash.
4. Every reference to work SHALL identify the source repository, branch
   and exact commit separately from the target repository and base.
   Sandboxed agents SHALL receive no push credentials.
5. Fork heads SHALL land without copying branches upstream. Discovery SHALL
   use the pull request's head repository, ref and SHA. Fetches SHALL use
   registered repositories, verify the source and target relationship and
   the exact commit, and never turn issue prose into clone URLs, commands
   or local paths.
6. Source push rights SHALL be separate from target merge rights. An
   authorized maintainer MAY merge while Avoozl observes. Reviews, required
   checks and fork CI permissions SHALL remain the target repository's
   rules.
7. The privacy scan SHALL run before every public GitHub write and every
   push, including commit messages and ref names.
8. Landing SHALL use a guarded fast-forward from the recorded base or a
   head-guarded pull request merge, never a force push.
10. Rebuild SHALL read the spec folders, approvals, ticks and landing
    commits from git.
11. Reads of spec issues SHALL use conditional requests, so an unchanged
    issue costs no full read.
16. No public Avoozl write on GitHub SHALL expose internal information. This
    covers spec and epic issue bodies, comments, pull request bodies and
    check summaries. Internal information is host, server and machine
    names, usernames, local and home paths, internal URLs and hostnames, IP
    addresses, crew, instance and session IDs, gateway ports and session
    keys.
17. A machine named in records SHALL be named only by its public alias
    (`machine.alias` in machine config). When it is unset, Avoozl SHALL
    generate a neutral two-word name once and store it, never deriving it
    from the hostname or username.
18. The privacy scan (the always-on content-rule set `builtin:privacy`)
    SHALL refuse, before the write: hostname and IP literals; internal
    domains, including a private, machine-local list the owner keeps in
    `privacy.internalDomains`; home paths; and this machine's own hostname
    and username. A hit SHALL name the rule and line, never the text. In a
    pushed diff's added lines only this machine's own names and the private
    domain list SHALL apply.

### Requirement 106: Task timeline

Design §4.35.

**User story:** As the owner, I want a task's steps in its own details, so
that I read how it went in one place.

#### Acceptance criteria

1. The task drawer SHALL have a **Timeline** tab that lists the task's
   recorded steps, each with its time: row changes, each session attempt
   starting and its status, evidence, delivery states, integration with its
   commit, and checks that ran not sandboxed.
2. The tab SHALL read stored records only, and SHALL make no GitHub call.

### Requirement 110: One intake list

Design §4.39.

**User story:** As the owner, I want every place work comes in from listed
once under `intake.sources`, so that I read and change intake in one place.

#### Acceptance criteria

1. `intake.sources` SHALL accept `via: "github"` and `via: "mcp"`. A GitHub
   source names the GitHub `repository` (owner/name) and SHALL carry
   `executionRepository`, an optional `workspaceRepository` when it
   differs, `assignee`, `autoStart`, `provider` and `model`. An MCP source
   names a registered `repository` and MAY set `labelFields` and
   `assigneeField`. A key of the other kind SHALL be refused. The ids
   `github`, `local` and `retro` are built in and SHALL be refused.
2. A GitHub source SHALL live in `.avoozl.json`. At most one GitHub source
   SHALL name a GitHub repository; a second one SHALL be listed with its
   error.
3. `avoozl github configure`, `github.repository.connect` and Repository
   setup SHALL write a GitHub source. Removing a repository SHALL remove
   its GitHub source.
6. GitHub items SHALL keep source `github`.

### Requirement 111: Tasks in tasks.md

Design §4.40.

**User story:** As the owner, I want one file per spec to read and review
the tasks, so that a task's title and what done means sit together and any
agent writes them in one place.

#### Acceptance criteria

1. A task SHALL be a checkbox line with an ID and a title. Under a leaf,
   each plain sub-bullet SHALL be one result someone can check. An item
   with sub-items SHALL be a group, and a group SHALL have no plain
   sub-bullets.
2. The list SHALL order the work: each task waits for the one above it in
   the same list. A group whose title ends with `(**PARALLEL**)` SHALL run
   its children side by side. A leaf whose title ends with `(**MANUAL**)`
   SHALL be done by a person and never given to an agent.
3. A task's phase SHALL be the `##` heading above it. A task title that
   links another spec's `tasks.md` SHALL make that task a spec group whose
   children are the linked spec's phases.
4. `tasks.md` MAY start with front matter whose one key is `repo`, the
   repository the spec changes.
5. Lint SHALL refuse, with the file and line: any `$` bullet
   (`facts.removed-key`, with its fix); a front-matter key such as `kind`
   or `integrationBranch` (`frontmatter.removed-key`); a leaf with no plain sub-bullet
   (`done.missing`); a group with a plain sub-bullet (`group.bullets`); a
   misspelled or misplaced `(**PARALLEL**)` or `(**MANUAL**)` tag; a group's
   box that disagrees with its children (`group.box`); a `Status:` line;
   and a folder that holds `avoozl/manifest.json`.
6. The revision hash SHALL cover the spec's prose and its tasks, not their
   layout. A changed revision hash SHALL need a normal approval. Checkbox
   marks SHALL stay outside the hash.
7. Avoozl SHALL parse a spec once, store its revision, and parse again only
   when the revision changes.
9. The spec steering text SHALL tell agents never to write
   `avoozl/manifest.json`.

### Requirement 112: A repository's checks run in its isolation

Design §5.2.

**User story:** As the owner, I want every check Avoozl runs to run in a
sandbox with the network off by default, so that a worker's commit cannot
read my credentials or reach the network through its checks.

#### Acceptance criteria

1. A repository SHALL have one `isolation` setting, `{run, network,
   readable, writable, prepare}`, kept in its repository settings. `run`
   SHALL be `sandbox` (the default) or `unconfined`; `network` SHALL be
   `off` (the default) or `on`; `readable` and `writable` SHALL be absolute
   paths; `prepare` SHALL be command arguments. Only a person SHALL set it,
   with `repository.configure` or Settings › Repository setup › Landing.
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

1. When Avoozl reads an approved spec's `tasks.md` as the specs branch
   holds it, a task whose item is ticked `[x]` and that is not done SHALL
   become done at once, with no approval and no new revision. Its evidence
   SHALL name the branch, the `tasks.md` line and the commit that ticked
   it, and the task's integration SHALL carry that commit as its landing
   commit. One Activity line SHALL say so.
2. Only the specs branch SHALL count. A tick on a working or worker branch,
   or an edit not committed, SHALL do nothing. Only `[x]` SHALL count: `[~]`
   and `[-]` stay Kiro's queued and running marks.
3. A tick on a task an Avoozl worker session is running SHALL make the task
   done and SHALL close that worker's session binding, with one Activity
   line saying the session was released.
4. A tick taken out of a done task SHALL NOT reopen it. It SHALL show in
   Needs you with Reopen and Keep done, and stay done until a person chooses.
5. A ticked item with no task ID SHALL be a lint error naming `tasks.md` and
   its line.
6. A ticked parent SHALL count as done with its open sub-tasks.
8. Ticks on the specs branch SHALL be the task state coworkers share: each
   machine's database is private, and a per-task issue is not kept. When
   Avoozl lands a task (its own worker, a merge batch, or any direct
   landing), the landing commit itself SHALL tick that task's `[x]` in its
   spec's `tasks.md`. It SHALL be one commit, not a follow-up. Only the
   landed task's mark character SHALL change: the rest of the file stays
   byte-identical.
9. A parent SHALL be ticked only when every child is ticked, as a result of
   a child's tick. When two children land on bases that lack each other's
   tick and leave the parent open with every child ticked, the runner that
   next reads the base after that merge SHALL tick the parent in a commit of
   its own that changes only that box. A spec group SHALL be ticked the same
   way once every task of its linked spec is ticked, when both files are on
   one specs branch.
10. A spec in a plans repository other than the code repository SHALL be
    ticked there as its own commit on the specs branch, after the code
    lands: fetched, built on the fetched head, pushed without force, and
    started again from a fresh fetch when the branch moved.
11. A machine that reads Avoozl's own landing tick SHALL treat it as known:
    no second Activity line and no worker session released.
12. Ticks SHALL stay outside the revision hash (Requirement 111.6), so no
    tick needs a new approval.
14. The `[x]` tick SHALL be the record that the work was done. A task's
    landing commit SHALL be its **tick commit**: the commit on the specs
    branch that last changed its item's line, found by following first
    parents (`git blame --first-parent` on `tasks.md`), so a direct push, a
    squash commit, a merge commit and Avoozl's own landing merge each own
    their tick. Avoozl SHALL keep it on the task in SQLite, read once.
    Avoozl SHALL NOT write a `Built:` line. A `Built: <commit>` note a
    person wrote under a ticked item SHALL be read, and used first.

### Requirement 114: Git is the source of truth; SQLite is a cache

Design §4.42.

**User story:** As the owner, I want everything that matters to live in git
and GitHub, so that Avoozl fits normal git workflows, can adopt an existing
repository, lets people leave, shares work through git, and a fresh machine
rebuilds its database from main and GitHub.

#### Acceptance criteria

1. An approval SHALL be a commit on the specs branch that changes the
   spec's files and carries evidence that an approver stands behind it:
   GitHub says an approver merged the pull request whose merge commit it
   is, or an approver's GitHub-verified signature signs it, or the
   repository declares (`trust: "branch-protection"`) that only approvers
   can push there, and then its author is an approver. A login is an
   approver when `allowedActors` names it, or, with a `minimumPermission`,
   when it holds that permission. In local mode, the checkout's own
   `user.email` approves.
2. The commit message SHALL carry nothing for the approval: no trailer, no
   spec name, no fingerprint. Avoozl SHALL compute the revision hash from
   the spec's files in that commit's tree.
3. The committer SHALL be no evidence, so a squash merge with GitHub as
   committer SHALL count through its merger.
4. Avoozl's own commits (worker results, ticks, landing and merge commits)
   and its agents' commits SHALL use the checkout's own git identity as both
   author and committer, and SHALL carry no `Co-authored-by` or other
   attribution. Worker prompts SHALL say so, and SHALL say never to push
   spec edits to main.
5. Spec drafts SHALL stay on a spec branch. `avoozl plan approve PLAN --yes`
   SHALL write one commit on the specs branch, authored by the person
   running it, that sets the spec's files to the reviewed revision, and
   push it without force. It SHALL refuse a person who is not an approver.
7. An item pushed over MCP SHALL become a GitHub issue in its source's
   repository at once, or be refused when the source names no GitHub
   repository.
8. `avoozl rebuild` (operation `workspace.rebuild`, a person's) SHALL, from
   an empty database, make every spec folder a plan, approve again each
   spec whose current text an approver committed, as that commit's author,
   and record each landing commit's tasks in Activity. A database that is
   not empty SHALL be refused.
12. The tick SHALL adopt an approval that reaches the specs branch with no
    command: a spec pull request an approver merged, or a push. When a
    checkout's base branch, as the tick already fetched it, has moved, or a
    spec's text has, the reader of criterion 1 SHALL run over the specs
    whose text on disk has no approval. Each one an approver committed with
    exactly that text SHALL be approved as that commit's author, and its
    tasks become ready. A commit with no approver evidence SHALL approve
    nothing. Each such approval SHALL get one Activity row naming the
    commit and the approver. This SHALL write nothing to git.

### Requirement 115: Task IDs and refs in tasks.md are checked and linked

Design §4.43.

**User story:** As the owner, I want a task's requirement and design refs
read, checked and linked, so that a ref that names nothing is caught before
approval and a task opens the text it builds.

#### Acceptance criteria

1. A task ID SHALL be a code span holding `[A-Za-z0-9][A-Za-z0-9._-]*`:
   ``- [ ] `dl-1` Open the decision``, `` `parse` `` and `` `1.2` `` are task
   IDs, and IDs compare exactly. A task whose ID is not in a code span, as
   `- [ ] dl-1 Open the decision` or Kiro's bare `1.`, SHALL be a lint
   error naming the line. The spec skill converts bare IDs to code spans.
2. A trailing `[...]` on a task's title SHALL be read as requirement refs and
   a trailing `(...)` as design refs, each a comma-separated list, and the
   title SHALL be shown without them. A trailing bracket whose first entry
   is not ref-shaped SHALL stay title text. The refs are stripped for display
   only: the task text a lease records and compares keeps the full title,
   refs included.
3. A requirement ref SHALL be `R<n>` for a `Requirement <n>:` heading, or the
   heading's own ID (`DL2` for `Requirement DL2:`), with an optional `.<m>`
   for its numbered criterion `<m>.`. A design ref SHALL be `§` and the
   number a `design.md` heading starts with (`§4.26`, `§D1`). Either list MAY
   name a fact row (`| F20 |`) of its own file. A range (`R4.1–R4.3`,
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
`tasks.md` or one file, carry any notes it needs, and still read Kiro's
layout.

#### Acceptance criteria

1. `.avoozl.json` at the root of the repository that holds the specs SHALL
   accept `specs.path`, one folder relative to that root. Unset SHALL mean
   `.kiro/specs`. Avoozl SHALL refuse a value that is absolute, names a `.`
   or `..` folder, or resolves through a symlink to a place outside the
   checkout. It SHALL compose with `specs.branch` (Requirement 117): the path
   names the folder, the branch names where it is read.
2. Every reader and writer of spec folders SHALL use the resolved path:
   listing, reading, creating, approving, ticking and reviewing.
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
   Markdown, and symlinks SHALL NOT be. The 1 MB per-file limit SHALL hold,
   and a folder SHALL hold at most 50 spec files.
5. A requirement ref SHALL be checked only when the spec has
   `requirements.md` or `bugfix.md`, and a design ref only when it has
   `design.md`. With no such file, lint SHALL refuse the ref and name the
   missing file.
6. Kiro's `requirements.md` (or `bugfix.md`) + `design.md` + `tasks.md`
   layout SHALL read, hash and lint, including a bugfix spec's Unchanged
   Behavior acceptance and the front-matter category.
7. The skills and `docs/github-workflow.md` SHALL describe the path
   setting, the one required file and other files as spec text.
8. Tests SHALL show: a custom path; a `tasks.md`-only spec; a single-file
   spec reading as the same `tasks.md` does; the both-present lint error; a
   tick in a single file changing no spec text while its prose does; an extra
   `.md` file changing the hash; refs with and without their files; Kiro's
   layout; and path validation.
9. Every reader of the task list (the parser, lint, the revision hash, ticks,
   landing, rebuild and the spec page) SHALL find it through one shared
   function (`src/app/specs/spec-tasks.ts`). A task that links a spec MAY
   target either that spec's `tasks.md` or its single file.

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
2. This workspace SHALL run a spec only when its spec issue, and the spec
   issue of every parent spec that links it, is assigned to this runner's
   own login and to no one else. A spec issue with no assignee, another
   login, or two or more assignees SHALL hold the spec, with the reason
   naming the assignees.
5. An approved spec in a repository with a GitHub name and no spec issue
   SHALL wait, with the reason "spec issue not published yet", until the
   tick publishes its issue (Requirement 102.2). A repository with no GitHub
   name is local-only, and its approved specs SHALL run on this workspace.
6. Each pass SHALL read the spec issues once and cache each spec's result;
   the ready rule SHALL read the cache. A spec whose read fails SHALL keep
   its last result.

### Requirement 117: A repository names the branch its specs live on

Design §4.45.

**User story:** As the owner, I want a private or public repository to say
which branch its specs live on, so that plans can sit on their own branch.

#### Acceptance criteria

1. `.avoozl.json` SHALL accept `specs.branch`, one branch name. Unset SHALL
   mean the spec repository's base branch. No other key SHALL say where
   specs live.
2. Avoozl SHALL read the spec folders from the specs branch.
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
   branch; and an approver's commit there approves on the tick.

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
   MAY carry any number of specs and the epic.
2. A person SHALL approve in one of four ways, each the same commit:
   merging the spec's pull request on GitHub; the page's **Approve** button
   (its **Approve spec** dialog) or `avoozl plan approve --yes`, either of
   which commits the reviewed draft in a checkout here, authored as the
   person's own git identity (R114.5); or telling a chat to approve, which
   makes that commit in the person's checkout, authored as the person with
   no co-authors. `plan.approve` SHALL stay person-only and SHALL NOT be a
   tool an agent calls on its own. Nothing else SHALL be stored.
3. A spec pull request SHALL be a pull request, reviewed like any other on
   GitHub, and merging it SHALL be the approval when an approver merged it.
4. The driver SHALL be the spec issue's single assignee (R116), set by a
   person on GitHub.
5. A landing SHALL be a guarded fast-forward or a head-guarded merge
   (R102.8). The landed task is complete once its tick reaches the specs
   branch (R113).
6. Work SHALL run on the driver's own machine. Spreading one person's work
   over machines is that person's own agent's job.
