# Design: Avoozl as a Kiro Crew-native, GitHub-native product

## Overview

This design answers the approved requirements. It is the recommendation: what
Avoozl becomes, how it uses Kiro Crew and GitHub, what happens to today's code,
how an existing workspace moves over, and what must be proved before anything grows.

Labels follow the requirements: **Verified** (read in code, docs, or data),
**Inferred** (follows from verified facts, not observed), **Proposed** (this
design's recommendation). Fact numbers `F1`–`F30` refer to the requirements'
evidence baseline.

### Decisions already made

| Decision | Answer | Source |
|---|---|---|
| Public repositories | Fully supported; execution needs an explicit reviewed rule | Owner, 2026-11-11 |
| Who writes GitHub pull requests | Issue Radar crews scoped to Avoozl's ready label in single-repo mode; Avoozl worker sessions in plans-repo mode (§6.6) | Owner, 2026-11-11 (updated) |
| Autopilot | The name people read for delivery, the tick starting ready leaves on its own. The `delivery` key, the `delivery.*` operations, the CLI and the `plans_*` MCP names keep their names | Owner, 2026-11-13 |
| Runtime machinery | Kiro Crew crons, sessions, and notifications; Avoozl builds none of its own | Requirement 26 |
| Label-driven loop | Similar idea to the public glorp project; no code, skills, or text reused | Requirement 27 |
| Persistence for GitHub work | GitHub issues, sub-issues, dependencies, labels, Project fields, and pull requests hold the truth; SQLite is a rebuildable cache | Owner, 2026-11-11 |
| GitHub is the default | Issues track the work. Epics are parent issues with the owner's `Epic` issue type when one exists. Tasks are sub-issues. `requires` and `sequence` edges become issue dependencies (blocked by). Completion levels and `supports` edges stay in the hidden marker | Owner, 2026-11-11; Requirements 13.7, 13.8 |
| GitHub Projects are the default view | Avoozl adds each managed issue to the configured Project (v2, org or user), sets Release at projection (from plan milestones, replacing per-repo GitHub milestones), keeps Wave and optional Iteration current, and never writes Status. `gh` needs the `project` scope, which the owner granted | Owner, 2026-11-11, changed 2026-11-12; Requirements 29, 33 |
| Plans-repo mode | A private planning repository holds issues, sub-issues, and dependencies; code pull requests land in code repositories. No closing keywords; at dispatch Avoozl creates a linked branch `avoozl/<task-id>` for the planning issue in the code repository, and GitHub closes the planning issue when that branch's pull request merges (F51). Avoozl worker sessions code the leaves | Owner, 2026-11-11, changed 2026-11-12; Requirements 28, 33 |
| Single-repo mode | No planning repository; issues live in the code repository; pull requests say `Closes #N` (a linked branch is also allowed); GitHub closes the issue and Avoozl still verifies completion. Issue Radar can code these | Owner, 2026-11-11; Requirement 28 |
| GitHub-native split | GitHub owns Project Status (built-in workflows), the blocked signal (open blocked-by dependencies, `is:blocked`), and leaf-issue closing in both modes. Avoozl owns issues, sub-issues, blocked-by links, the linked branch, Release at projection, Wave, picking ready work, starting coding sessions, and the completion verdict. People own assignees, drags, and Deferred (§6.5, §6.7) | Owner-approved direction, 2026-11-12; Requirement 33 |
| Close without code | A leaf issue closed with no merged closing pull request (by hand, or by Auto-close issue after a drag to Done) by an actor the policy allows is an order: Avoozl marks the task done by order, not verified, and releases its dependents. Any other closer holds the dependents and opens a decision. Auto-close issue is recommended on (§6.5) | Owner, 2026-11-12; Requirement 33.8–33.10 |
| Local tasks | Opt-in and never synced: `authority: local`, per task or per workspace. Local moves to github only through an approved projection. With a GitHub mode configured, the default authority is `github` | Owner, 2026-11-11; Requirement 28 |
| Nupp | Plans-repo mode in a private planning repository with an org Project; Nupp's 3 milestones become Release values | Owner, 2026-11-11; §10 |
| Plugins | Outside packages may add delivery routes and task trackers through one versioned seam, loaded only after a person approves each version, in a local child process with no listener. Private and company-internal integrations live outside the public repository and plug in only this way (§4.8) | Owner, 2026-11-12; Requirements 22, 34, 35 |
| Review gates | Each local writer's exact commit gets the checks role plus review roles with split focus, each in a fresh session on a model other than the writer's, before integration; changes requested start a new writer attempt and new reviews; every finding is closed as fixed or unchanged against the changed files; a check that cannot run keeps the gate shut. Reviews are roles on one delivery, not graph tasks (§5.2) | Owner handoff, 2026-11-12; Requirements 36–39 |
| Content rules | `.avoozl.json` names which rule sets apply and the action; the banned terms live in an untracked terms file or an approved private plugin. Every write or approval boundary is checked; a match blocks and opens a decision, never redacts, and can be allowed once with a reason; findings name rule and location, never the term. Today's leak, reply, and secret screens become built-in sets (§4.9) | Owner, 2026-11-12; Requirement 40 |
| Plan layout | Required, not a default: every plan is a Kiro spec folder `.kiro/specs/<name>/` with `requirements.md` or `bugfix.md`, `design.md`, `tasks.md`, and `avoozl/manifest.json`. Fenced plan files are a migration read path only | Owner, 2026-11-11; Requirement 30 |
| Untriaged list | A read-only list of open issues and pull requests that no trigger rule, triage label, or task covers, linking out to GitHub, Issue Radar, and Code Review Sage; GitHub modes only; deep links wait on MC-14 (§8.5) | Owner, 2026-11-12; Requirement 49 |
| Crew placement | Remote workers push their task branches to public and private repositories alike; Avoozl never pushes. The routing prompt (since 2026-11-13; before, router instructions) is machine-local only. MC-10 is a required Kiro Crew ask, and every chat Avoozl opens, local or remote, must be attachable from In flight; until MC-10 ships remote placement is inert. Chat limits (3 local, 2 remote, per crew) and the stale limit (120 s) are configurable defaults (§4.10) | Owner, 2026-11-12; Requirement 41 |

### New verified facts used by this design

| # | Fact | Evidence |
|---|---|---|
| F31 | Kiro Crew script crons are Python callables that run with no LLM call. Their context offers `call_tool(server, tool, args)` for MCP tools, `notify`, `list_session_folders`, `create_session_folder`, `open_session(name, folder_id, agent, model)` returning a slot key, `send_to_session(slot, message)`, and `set_session_mode(slot, mode)`. Flow control is `Skip`, `Done`, and `Report`. Default script timeout is 30 seconds and can be raised per job. | `docs/cron-and-scheduling.md` |
| F32 | An app manifest cron entry may name a `script` (Python callable) as well as a `command`. | `apps/manifest_sections.py` `CronEntry` |
| F33 | An app backend can opt into a gateway-signed principal claim (`signedPrincipal: true`) on every proxied request. | `apps/manifest_sections.py` `BackendConfig`; `apps/routes_proxy.py` |
| F34 | Avoozl local integration rebases the run branch onto the base branch and merges it into the originating checkout under a per-project work lock, refusing when that checkout is not on its base branch. | `src/app/git.mjs` `integrateRun` |
| F35 | Avoozl reads GitHub with `AVOOZL_GITHUB_TOKEN`, `GITHUB_TOKEN`, or `gh auth token`, over REST. It does not use GitHub sub-issues today. | `src/app/github.mjs`; no `sub_issues` reference in `src/app` |
| F36 | `workspace-repository.mjs` publishes portable planning records from SQLite into the workspace's Git repository; Nupp uses it. | `src/app/workspace-repository.mjs`; Nupp commit `566ef8a` |

### GitHub and Kiro facts for the 2026-11-11 decisions

Each row is **Verified** against the cited page or a read-only query on
2026-11-11, unless the row says **Inferred**.

| # | Fact | Evidence |
|---|---|---|
| F37 | A parent issue can take sub-issues from other repositories of the same owner; up to 100 sub-issues per parent and eight levels of nesting (rechecked 2026-11-13, §6.9). `gh issue create --parent` and `gh issue edit --add-sub-issue` manage them. | [Adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues); [REST sub-issues](https://docs.github.com/en/rest/issues/sub-issues) |
| F38 | A sub-issue may belong to a different organization than its parent. Sub-issues inherit the parent's Project and milestone by default. Projects have a REST API that adds items and updates field values. | [Changelog 2025-09-11](https://github.blog/changelog/2025-09-11-a-rest-api-for-github-projects-sub-issues-improvements-and-more/) |
| F39 | Issue dependencies (blocked by, blocking) are generally available, with up to 50 issues per relationship type, in REST, GraphQL, and webhooks. `gh issue edit --add-blocked-by` accepts issue numbers or URLs. Same-org cross-repository dependencies were proved live (F11). Cross-organization dependencies are **Inferred** to work; P18 checks it. | [Creating issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies); [Changelog 2025-08-21](https://github.blog/changelog/2025-08-21-dependencies-on-issues/) |
| F40 | A Project can hold issues and pull requests from any organization, up to 50,000 items. Project timeline events on an issue are visible only to people who can read the Project. | [Adding items to your project](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/adding-items-to-your-project) |
| F41 | Projects support custom fields, including single-select and iteration fields, up to 50 fields. An iteration field groups items into repeating time blocks with breaks. | [About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects); [About iteration fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-iteration-fields) |
| F42 | A milestone groups issues and pull requests in one repository. | [About milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones) |
| F43 | A closing keyword can name an issue in another repository (`Fixes octo-org/octo-repo#100`). Keywords work only when the pull request targets the default branch. | [Linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue) |
| F44 | Issue types are set per organization or user, up to 25; the defaults are task, bug, and feature, so `Epic` exists only if the owner adds it. | [Managing issue types](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization) |
| F45 | `gh project` needs the `project` token scope. The local `gh` token has `project`, `repo`, `read:org`, `workflow`, and `gist`. | [gh project manual](https://cli.github.com/manual/gh_project); `gh auth status` |
| F46 | `nupp-lang` has issue types Task, Bug, and Feature (no Epic) and no Projects yet. Its private planning repository has issues turned off. | Read-only GraphQL query |
| F47 | A Kiro spec has `requirements.md` (or `bugfix.md` for bugfix specs), `design.md`, and `tasks.md`. Running all tasks builds a dependency graph from `tasks.md` and runs independent tasks in waves. | [Kiro specs](https://kiro.dev/docs/specs) |
| F48 | Kiro recommends one spec per feature under `.kiro/specs/<name>/`, stored in the repository beside the code, or in a central specs repository shared across projects. **Sync Files** can add tasks for new requirements and mark finished tasks. | [Kiro spec best practices](https://kiro.dev/docs/specs/best-practices) |
| F49 | Project built-in workflows update Status on events. Two are on by default in a new Project: closed issues or pull requests get Status Done, and merged pull requests get Status Done. (Checked 2026-11-12.) | [Using the built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations) |
| F50 | A change made by a built-in workflow shows in the timeline as made by `@github-project-automation`. (Checked 2026-11-12.) | [Adding items to your project](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/adding-items-to-your-project) |

### GitHub-native facts for the 2026-11-12 split

| # | Fact | Evidence |
|---|---|---|
| F51 | **Verified (live probe, 2026-11-12).** An issue in a private repository with a linked branch made by GraphQL `createLinkedBranch` (`repositoryId` = a different, public repository) closed as `COMPLETED`, with the pull request as `closer`, about 1 second after a pull request from that branch merged into the public repository's default branch. The pull request body had no closing keyword. Logged out, the pull request page, its partials, and REST pull request, issue, timeline, and events showed no private repository name; GitHub hides the `connected` event from viewers without access. | `docs/evidence/github-linked-branch-probe.md` in the Avoozl repository, commit `31adf4e` |
| F52 | **Verified (same probe).** Limits: `closingIssuesReferences` on the pull request was empty right after it was opened and filled by merge time; the issue's `linkedBranches` empties on close while the branch stays; only same-owner user repositories were tried, so an organization (rulesets, base protection, org visibility) is untested; the merger had access to the private repository; notifications to watchers were not checked. GitHub closes only on merges into the default branch. | Same |
| F53 | Issues with open blocked-by dependencies show a native **Blocked** icon on Project boards and issue lists, and issue search accepts `is:blocked`, so `is:open -is:blocked` lists unblocked open issues. **Verified** that REST search accepts both qualifiers (2026-11-12, `nupp-lang/nupp`); the icon is from GitHub's docs. | [Creating issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies); REST `search/issues` |
| F54 | Built-in Project workflows: Item added to project (sets a Status), Item closed (Done), Pull request merged (Done), Pull request linked to issue (sets a Status), Item reopened, Auto-add to project (with a filter), Auto-add sub-issues to project, Auto-archive items, Auto-close issue (closes the issue when Status becomes Done), Code review approved, Code changes requested. None reacts to a blocker closing. | [Using the built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations) |
| F55 | **Verified (GraphQL schema and a read-only query, 2026-11-12).** `ProjectV2.workflows` returns each workflow's `name`, `number`, and `enabled`; nothing exposes its target Status or filter. The only workflow mutation is `deleteProjectV2Workflow`; none creates, enables, disables, or edits one. On `nupp-lang` Project #2 the instantiated workflows are Auto-add sub-issues, Auto-add, Auto-close issue, Item added, Item closed, Pull request linked, and Pull request merged, all `enabled: true`; Auto-archive, Item reopened, and the review workflows are not listed until someone configures them (**Inferred**). | `gh api graphql` introspection of `ProjectV2Workflow` and `Mutation`; query on `organization(login:"nupp-lang").projectV2(number:2).workflows` |
| F88 | **Verified (live REST `search/issues`, 2026-11-12, `cli/cli`).** Label qualifiers compare without case (`label:bug` and `label:BUG` gave 2288 each; `label:"Needs-Triage"` and `label:needs-triage` gave 1545 each). `label:a,b` is OR (4800), repeated `label:` is AND (3), and `-label:a,b` excludes both, the same as `-label:a -label:b` (1918 each, which is 6718 − 4800). GitHub's docs also say search is not case sensitive. | [Searching issues and pull requests](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests); REST `search/issues` |
| F89 | **Verified (same probe).** `no:assignee` combines with `label:` in REST search (2060 for `no:assignee label:bug`). | REST `search/issues` |

`F31` changes the earlier gap `F21`: an app cannot create a session from its
Node backend, but a script cron the app declares can open a visible session in
a folder with no LLM call. The remaining gap is project binding (see MC-1).

---

## 1. Product thesis

**Proposed.** Kiro Crew runs agents. GitHub stores shared work. Neither one
turns a large goal into a dependency graph and then keeps that graph moving
(F3, F4, F8, F13). Avoozl owns that job and nothing else:

1. **Plan.** Turn a goal, a reviewed design, or a triggered issue into a graph of
   epics, work packages, and bounded leaves with stable IDs and typed edges.
2. **Gate.** Decide which leaves are ready from blockers, policy, conflicts, and
   open decisions.
3. **Dispatch.** Hand ready leaves to Kiro Crew: a Crew Mode conductor asks
   Avoozl for each round's ready leaves (§5.1) for local work and for
   plans-repo leaves (§6.6); in single-repo mode the ready label goes to an
   Issue Radar crew.
4. **Prove.** Accept a leaf only from verified completion facts.
5. **Release.** Recompute readiness and dispatch what became ready.

Avoozl is a policy engine and a graph, packaged as one Kiro Crew app. It does
not write code, run agents, open pull requests, review them, or host a UI
outside Kiro Crew.

## 2. Non-goals

**Proposed**, extending the requirements' list:

- No agent runtime, provider adapters, model routing, chat, terminal, file
  browser, model picker, memory, or transcript store.
- No scheduler, poller daemon, admission queue, worker leases, webhook receiver,
  tunnel, or notification system.
- No GitHub browser, triage view, pull-request view, CI view, or review agent.
  Issue Radar and Code Review Sage own those. The one exception is the
  Untriaged list (§8.5, owner request 2026-11-12): only Avoozl knows which
  open items no rule covers, so it lists them and hands each one off.
- No pull-request creation, push, or merge by the Avoozl process. Kiro Crew
  sessions (Issue Radar crews or Avoozl worker sessions) do that work.
- No second writable copy of GitHub-backed tasks.
- No website, Canvas page, VS Code extension, or Agent Host Protocol facade.
- No reading or writing another app's private data or routes.
- No private or company-internal integration in the public repository, named
  or implemented. Such integrations are separate packages loaded through the
  plugin seam (§4.8).
- No GitHub milestones; the Project's Release field replaces them (F42).
- No Discussions, stacked pull requests, or comment-mention steering in the
  first release (Requirement 27.13).

---

## 3. State ownership

### 3.1 One authority per kind of state

| State | Authority | Avoozl SQLite role | Notes |
|---|---|---|---|
| Reviewed design | Git: a Kiro spec folder `.kiro/specs/<name>/` in the planning repository (plans-repo mode or no GitHub mode) or the code repository (single-repo mode), at an exact commit (§6.8) | Receipt: approved commit and hash | Never edited in SQLite |
| Repository policy and labels | Git: `.avoozl.json` at an exact commit | Receipt of the commit applied | Settings view edits the file, not SQLite |
| Task manifest | Git: `avoozl/manifest.json` inside the spec folder, generated then reviewed | Receipt | Pins design commit, policy commit, compiler digest |
| Local task graph (local-only tasks) | **SQLite** in the workspace, published to Git by `workspace-repository` (F36) | **Authoritative** | The only writable task store for local work |
| Local task status | **SQLite** | **Authoritative** | Derived states (ready) are computed, not stored |
| GitHub issue graph | GitHub: issues, sub-issue links, issue dependencies, hidden markers | **Cache** | Rebuildable from GitHub alone |
| GitHub task status | GitHub: open/closed, state reason, open blocked-by dependencies (the native Blocked signal, F53), managed labels | **Cache** | Avoozl writes no Blocked Status or blocked label |
| Project item Status | GitHub Project: built-in workflows (F54) and people's drags. Avoozl never writes it | **Cache** | Avoozl reads only Deferred as an order (§6.7) |
| Project item fields (Release, Wave, Iteration) | GitHub Project; Avoozl sets Release at projection and keeps Wave and Iteration current from plan milestones and edges. A person may change Release (§6.7) | **Cache** with last applied values | A Release change drafts a manifest change; a Wave edit is reverted (§6.7) |
| Pause (Deferred) | GitHub: the item's Status, as set by an allowed actor | **Cache** | Rebuild reads it from the Project |
| Last applied managed values | GitHub: hidden marker in the issue | **Cache** | Moves out of SQLite (fixes F12, F17) |
| Kiro Crew sessions and transcripts | Kiro Crew | Binding: task ID → slot key | Bindings can be rediscovered from session titles |
| Worktrees and branches | Git in the target repository | Receipt: path, branch, base SHA | Branch name derived from task ID |
| Pull requests | GitHub | Cache | Written by Issue Radar (single-repo mode), Avoozl worker sessions (plans-repo mode), or a person; never by the Avoozl process |
| Test results | The system that ran them: GitHub checks for GitHub work; Avoozl's own check run (or a verifier session when the bar needs judgment) plus re-runnable command for local work | Receipt: command, exit code, commit SHA | |
| Completion | Derived: GitHub facts (Requirement 16) or local verified-and-integrated commit | Cached verdict | Never written as an independent fact for GitHub tasks |
| Activity and evidence | Append-only event log in SQLite, pointing at real sources | Authoritative for local; receipt for GitHub | Evidence links, not copies |
| Human decisions | SQLite for local tasks; GitHub labels and comments for GitHub tasks | Authoritative / cache | |
| Tracker plugin records (`authority: plugin:<id>`) | The plugin's tracker: records, open or closed, managed fields, the stored marker, and native links when the plugin has `edges` | **Cache** | Same rule as GitHub. Without `edges`, the graph's edges come from the approved manifest and SQLite caches them (§4.8) |
| Plugin approvals | Machine-local Avoozl settings: id, version, content hash | Receipt | Never in Git; never set by the tick (§4.8) |
| Spec driver (which machine may write for a spec) | GitHub: the plan issue's single assignee (else its epic issue's) plus the machine claim in its marker; Local only: a SQLite row | **Cache** in GitHub modes; authoritative in Local only | Moves only by a person: a reassignment then Take over, or Force take over (§6.10) |

### 3.2 When SQLite is authoritative

**Proposed.** Every task row carries `authority: "local" | "github" | "plugin:<id>"`.

- `local`: SQLite owns the row. Writes go through operations. Portable records
  publish to Git for durability and review. A local task never syncs to GitHub.
- `github`: the row is a cache. Operations refuse direct edits and route the
  change to GitHub (title, body, labels, edges, Project fields) through
  projection. The tick overwrites the row from GitHub on every sync.
- `plugin:<id>`: the row is a cache of a record in a tracker plugin's system
  (§4.8). The same rules as `github` apply: operations refuse direct edits
  with 409 (as task 2.2 does for `github`) and route the change through the
  plugin's `project`; the tick overwrites the row from `read`. A plugin task
  shows the plugin's record link and the plugin id on every card. Added
  2026-11-12 (Requirement 35).
- **Default.** With no GitHub mode, every task is `local`. With a GitHub mode
  (§6.6), a new task's default is `github`: once its plan is approved, the
  next projection creates its issue. Local is opt-in, either per task
  (`authority: local` on the manifest entry) or per workspace
  (`"defaultAuthority": "local"` in `.avoozl.json`).
- **Pending.** Between approval and its first projection, a task bound for
  GitHub is still a SQLite row with no issue. It is shown as "pending
  projection" and does not dispatch.
- **Telling them apart.** A github task has an issue link, shown as
  `owner/repo#number` on every card, row, and brief. A local task has no issue
  link and shows the word "local". The stored rule matches this: a row
  linked to an issue reads as `github`; any other row reads as `local`.
  **Verified** in the Phase 2 work model (`taskAuthority` in
  `src/work-model.mjs` on branch `task/phase2-model-validation`).
- A task changes authority only through an approved projection (local →
  github, or local → `plugin:<id>`) or an explicit "take back local" action that closes the GitHub issue
  as `not_planned`. Projecting an opt-in local task needs a plan change that
  removes its `authority: local`, then approval. One task never has two
  writable rows.

### 3.3 The rebuild test

**Proposed, and proof P9.** For a workspace whose tasks are all
`authority: "github"`: delete the SQLite file, run `avoozl rebuild`, then
`avoozl tick`. The result must equal the previous state for every task, edge,
status, completion verdict, and managed-field baseline. Only session bindings may
be missing; the tick rediscovers them from session titles (`avoozl:<task-id>`).
The same test holds for `authority: "plugin:<id>"` tasks, rebuilt from the
plugin's `list` and `read` plus the approved manifest (§4.8, proof P26).

### 3.4 Managed issue marker, version 2

**Proposed.** Replaces the version 1 marker in `github-sync.mjs`:

```html
<!-- avoozl-task
{"version":2,
 "taskId":"w3.reactor-timers",
 "namespace":"avz_k3q9m2x7v4d8p1ta",
 "kind":"leaf",
 "parent":"w3",
 "source":{"commit":"<40-hex>","manifest":"<sha256>"},
 "compiler":"<sha256>",
 "edges":{"conditions":{"<task-id>":"integrated"},"supports":["<task-id>"]},
 "applied":{"title":"<sha256>","body":"<sha256>","labels":["agent:managed"],"blockers":["<node-id>"],
            "project":{"Release":"runtime-flip","Wave":2}},
 "order":{"actor":"<login>","reason":"COMPLETED","closedAt":"<ISO-8601>"}}
-->
```

- `edges` holds the Avoozl-only edge detail that GitHub dependencies cannot
  carry: a `requires` edge's completion level, keyed by the blocking task ID,
  and advisory `supports` edges. Blocking edges themselves are GitHub issue
  dependencies (F39); the marker never duplicates them as truth.
- `applied.project` holds the last Project field values Avoozl wrote
  (Release, Wave, Iteration; never Status, §6.7).
- `order` is present only while the issue is closed by an allowed actor's
  order with no merged closing pull request (§6.5): the closer's login, the
  close reason (`COMPLETED` or `NOT_PLANNED`), and the close time, all copied
  from the issue's own close event, which is public wherever the issue is.
  Rebuild reads it, so a later policy change does not reclassify an old
  order. Avoozl removes it when the issue is reopened. Added 2026-11-12.
- `namespace` is an opaque ID for the planning workspace that owns the task
  IDs. `avoozl init` generates it once: `avz_` plus 16 lowercase base32
  characters from 80 random bits. It is stored as `"namespace"` in the planning
  repository's `.avoozl.json` and never changes. Random rather than readable
  (`avoozl123`) so two users' graphs never collide in one repository.
- The marker never names the planning repository, its path, or its owner. A
  planning repository may be local-only, private, or public; the marker reads the
  same either way.
- `source.commit` and `source.manifest` pin the reviewed input by hash only. The
  planning workspace maps them back to its own repository and file.
- Only the workspace whose `.avoozl.json` holds this namespace may write the
  issue. Any other workspace treats it as read-only and shows it in preview.
- `applied` holds hashes of the last values Avoozl wrote, so a fresh workspace
  can still tell a human edit from a stale baseline (Requirement 15).
- The marker contains no local path, token, private name, or transcript text
  (Requirement 10.7). The projector rejects any marker field that matches an
  absolute path or credential pattern.

---

## 4. Canonical architecture

### 4.1 Components

```text
                          Kiro Crew gateway
 ┌───────────────────────────────────────────────────────────────────────┐
 │  Avoozl app (one install)                                             │
 │                                                                       │
 │  page (React, app SDK) ──useAppApi──▶ node backend ──┐                │
 │                                        (loopback,     │                │
 │                                         signed proxy) │                │
 │  MCP server (stdio) ◀── agents, skills ───────────────┤                │
 │                                                       ▼                │
 │  script cron "avoozl-tick" ──call_tool──▶  Avoozl core (operations)   │
 │        │  open_session / send_to_session        │                      │
 │        ▼                                        ├── SQLite workspace   │
 │  Kiro Crew sessions (workers, verifier,         ├── Git (design, policy│
 │  responder, planner)                            │    manifest, worktrees)
 │                                                 └── GitHub REST        │
 │  Issue Radar crews ◀──── ready label ───────────────┘                  │
 │  Code Review Sage (pull-request review, unchanged)                     │
 └───────────────────────────────────────────────────────────────────────┘
```

- **Avoozl core** (**Verified** exists, **Proposed** scope): `src/app/operations.mjs`
  and the modules it calls. UI, CLI, and MCP keep sharing it (AGENTS.md).
- **Node backend** (**Proposed**): `avoozl app-backend`, declared as
  `backend: {type: "node", entryPoint: "...", signedPrincipal: true}` (F20, F33).
  It serves the page's API and nothing else.
- **MCP server** (**Proposed**): `avoozl mcp`, declared in `mcpServers`. It keeps
  every `plans_*` name (AGENTS.md compatibility) and adds the tools in §4.6.
- **Tick script cron** (**Proposed**): a Python callable shipped in the app and
  declared in `crons` (F31, F32). It holds no logic beyond calling the Avoozl
  MCP server and the session context methods.
- **Skills and agents** (**Proposed**): the `avoozl` skill for planning in chat,
  plus three narrow agents shipped by the app: `avoozl-planner`,
  `avoozl-verifier`, `avoozl-responder`. Implementation leaves use Kiro Crew's
  `kirocrew-worker`.

### 4.2 App manifest shape

**Proposed.** Field names are the ones Kiro Crew's manifest parser accepts (F20, F32).

```json
{
  "name": "avoozl",
  "displayName": "Avoozl",
  "license": "MIT",
  "skills": ["skills/avoozl"],
  "agents": ["agents/avoozl-planner.json", "agents/avoozl-verifier.json", "agents/avoozl-responder.json"],
  "mcpServers": {
    "avoozl": { "command": "node", "args": ["bin/avoozl.mjs", "mcp"] }
  },
  "backend": {
    "type": "node",
    "entryPoint": "bin/avoozl.mjs",
    "healthCheck": "/health",
    "signedPrincipal": true
  },
  "crons": [
    { "name": "avoozl-tick", "every": 60, "script": "crons/tick.py:run",
      "silent": true, "persistent_session": false }
  ],
  "notifications": { "channels": [
    { "id": "decision", "name": "Avoozl needs a decision", "icon": "CircleHelp" },
    { "id": "failure", "name": "Avoozl delivery failed", "icon": "CircleX" }
  ]},
  "ui": { "entry": "dist/index.mjs",
          "pages": [{ "route": "/apps/avoozl", "label": "Avoozl", "icon": "Workflow" }] },
  "dependencies": { "commands": ["node", "git"], "optionalCommands": ["gh"] }
}
```

`gh` moves to optional: local work needs no GitHub (Requirement 2.3).

### 4.3 Work model

**Proposed.** The model extends today's tasks and edges (`src/model.mjs`,
`src/query.mjs`).

| Field | Values | Rule |
|---|---|---|
| `id` | lowercase, dotted path allowed (`w3.reactor-timers`) | Immutable after approval; comes from the `tasks.md` item's ID (§6.8) |
| `kind` | `epic`, `package`, `leaf` | Only leaves dispatch; epics and packages complete from children. Changed 2026-11-13: inside a plan only `package` and `leaf`; epics span plans (§6.9) |
| `authority` | `local`, `github`, `plugin:<id>` | §3.2; default `github` when a GitHub mode is set; `plugin:<id>` needs a loaded tracker plugin (§4.8) |
| `route` | `local`, `github`, `plugin:<id>` | How a leaf is delivered; `plugin:<id>` needs a loaded route plugin (§4.8) |
| `repository` | registered repository ID | Required for leaves; exactly one |
| `acceptance` | list of observable statements | Required for leaves |
| `checks` | named commands (local) or check names (GitHub) | Required for code leaves |
| `completion` | `merged-pr`, `integrated`, `released`, `answered`, `person` | `answered` only for `respond`; `person` only, and always, for a `manual` leaf (§4.16) |
| `manual` | `true` or absent | A leaf only a person does: never dispatched, waits in Needs you, marked done by a person (§4.16) |
| `status` | `draft`, `approved`, `running`, `review`, `done`, `failed`, `blocked`, `deferred`, `partial` | `partial` exists only for migrated tasks (§10) |
| `decision` | open decision ID or null | Any open decision blocks readiness |

Edge kinds stay as today (F25): `requires` and `sequence` block; `supports` is
advisory. A `requires` edge may name a completion level
(`{"task":"sdk-code","condition":"integrated"}`); the default is the
dependency's own `completion`.

A leaf is **ready** when: it is approved; every blocking edge's condition holds;
no conflict, open decision, quarantine, or pause applies; its repository is
registered; and its route has capacity.

### 4.4 Repository policy in `.avoozl.json`

**Proposed.** Replaces `github.queue` label behaviors and single-label intake
(F15). No names are built in; the values below are examples.

```json
{
  "github": {
    "mode": "plans-repo",
    "planningRepository": "example/plans",
    "defaultAuthority": "github",
    "project": {
      "owner": "example", "number": 7,
      "fields": { "status": "Status", "release": "Release", "wave": "Wave",
                  "iteration": null },
      "statusValues": { "todo": "Todo", "inProgress": "In progress",
                        "done": "Done", "deferred": "Deferred" }
    },
    "epicIssueType": "Epic",
    "repositories": {
      "example/app": {
        "checkout": "../app",
        "folder": "Avoozl/example-app",
        "baseBranch": "main",
        "coder": "worker",
        "allowedActors": ["maintainer-login"],
        "minimumPermission": "maintain",
        "requiredChecks": ["build", "test"],
        "concurrency": 2,
        "dependencyText": false,
        "priority": ["critical", "high"],
        "managedLabels": {
          "managed": "agent:managed",
          "responding": "agent:responding",
          "planning": "agent:planning",
          "ready": "agent:ready",
          "stale": "agent:stale",
          "decision": "agent:decision"
        },
        "rules": [
          { "id": "answer", "action": "respond",
            "match": "label:agent:respond -label:agent:paused" },
          { "id": "build", "action": "deliver",
            "match": "label:agent:build -label:agent:paused assignee:maintainer-login",
            "author": "maintainer-login",
            "autoPublishChildren": false },
          { "id": "pause", "action": "pause", "match": "label:agent:paused" }
        ]
      }
    }
  }
}
```

Validation (deterministic, in `repository-settings.mjs`):

- `mode` is `plans-repo`, `single-repo`, or absent; `plans-repo` needs
  `planningRepository`, `single-repo` forbids it (Requirement 28.1);
- `coder` is `worker` or `issue-radar`; `issue-radar` is refused in
  plans-repo mode, because a crew opens pull requests only in its own
  repository (Requirement 27.14);
- a repository with github tasks names a `baseBranch` equal to its default
  branch, because GitHub closes issues only from merges into the default
  branch (F43, F52; Requirement 16.5, changed 2026-11-12);
- `statusValues` names only `todo`, `inProgress`, `done`, and `deferred`;
  only `deferred` is read as an order (§6.7);
- `project.fields` names only fields that exist on the Project, with the
  right types (single-select for Status and Release, number for Wave,
  iteration for Iteration), checked against GitHub when the token allows
  (Requirement 29);
- every rule names a known action: `respond`, `plan`, `deliver`, `execute`,
  `pause`, `resume`, `quarantine` (Requirement 11.3);
- every rule's `match` parses under the grammar below, and no rule has both
  `match` and a legacy label key (Requirement 11.2, 11.6);
- no trigger label equals a managed label (Requirement 11.4);
- a repository with any executing rule (`respond`, `deliver`, `execute`) names
  at least one allowed actor or a minimum permission, else it uses
  `minimumPermission: write` (Requirement 10.3, owner decision 2026-11-12);
- `priority` labels are not managed labels;
- an empty `rules` list is valid and executes nothing (Requirement 24.3);
- each `plugins` entry follows §4.8: a known shape, one of `package`, `path`, or
  `git` (with `ref`), no credential in a `git` URL, no credential-looking value in `config`, an id other than `local`
  or `github`, and no id declared twice across `.avoozl.json` and the
  machine-local settings (Requirement 34.1–34.3);
- `contentRules` follows §4.9: known boundaries and repositories, unique
  set ids, no `builtin:` id, each `plugin` naming a `plugins` entry, and no
  key that could hold a rule (Requirement 40.1).

In plans-repo mode `.avoozl.json` lives in the planning repository, which is
the only place that names it. Nothing Avoozl writes to a code repository
copies `planningRepository`. In single-repo mode the file lives in the code
repository. (**Proposed**)

Nobody writes the `github` block by hand. The **Set up GitHub** wizard in
Settings (§8.2) fills `mode`, `planningRepository`, `project` (owner, number,
`fields`, `statusValues`), `epicIssueType`, and each repository's
`managedLabels`, and proposes them
as one reviewed change to this file. Its output passes the same validation as
any Settings edit. People still write `rules`, actors, and permissions in
Settings. (**Proposed**, owner decision 2026-11-12, Requirement 32)

A rule's trigger is `match`, one line of GitHub's own issue-search syntax
(owner decision 2026-11-12, Requirement 11.2). People already know it, and
pasting the line into a GitHub issue search shows the same issues. Avoozl reads
only these terms:

| Term | Parsed into | Meaning |
|---|---|---|
| `label:x` (repeatable) | `labelsAll` | has every such label |
| `label:a,b` (one group per rule) | `labelsAny` | has at least one |
| `-label:x`, `-label:a,b` | `labelsNone` | has none of them |
| `assignee:login` (one) | `assignee` | assigned to that login |
| `no:assignee` | `unassigned` | assigned to nobody |

Values may be quoted (`label:"needs triage"`, `label:"a, b",c`). Labels
compare without case, as GitHub search does (F88). Every other token is
refused with an error naming it: `is:`, `repo:`, `author:`, other
qualifiers, upper-case qualifier names, `-assignee:`, free text, an unclosed
quote, an empty value, a second `label:a,b` group, two different assignees,
and `assignee:` with `no:assignee`. Refusing beats skipping, because a skipped
token makes a rule match more than its line says. A line needs at least one
`label:` term, so no rule matches every open issue.

Parsing yields the same internal fields the matcher already reads, so
evaluation is one code path for both forms. The legacy keys `labelsAll`,
`labelsAny`, `labelsNone`, and `assignee` still read unchanged when `match`
is absent; a rule with both is refused as ambiguous (Requirement 11.6).
Settings writes `match` from now on, converting a legacy rule when it is
saved. `author` stays its own key, and who may trigger a rule stays in
`allowedActors` and `minimumPermission`: search syntax cannot say whose label
counts.

A rule matches an issue when the parsed label sets, assignee, and author
filters hold, and the newest event that made the rule true came from an
allowed actor with at least the minimum permission (Requirement 10.4, 10.5).
The existing label-event and permission check in `syncGitHubIssues` is kept
and generalized. The tick still lists issues by label and never by search
(F12 lesson). Only the Settings preview (`github.trigger.preview`) calls
GitHub search, read only, to show the open issues a line matches now: a
count and up to 10 links.

### 4.5 The tick

**Proposed.** One operation, `workspace.tick`, exposed as MCP tool `plans_tick`
and CLI `avoozl tick`. It is idempotent and bounded (Requirement 26).

Order of one tick, per workspace:

1. **Lock.** Take the workspace tick lock (existing `work_locks` table). If held,
   return `{skipped: "locked"}` and write nothing.
2. **Load policy** from `.avoozl.json` at the checked-out commit. Invalid policy
   keeps the last valid one and raises a decision.
3. **Observe sessions.** Return the list of bound slot keys whose status the
   script must read (step 4 runs in the script; see §4.6).
4. **Sync GitHub** for each registered repository: list managed issues (open and
   closed) and trigger-labeled issues directly, never by search (F12 lesson);
   read markers, sub-issues, blockers, labels, label events, closing pull
   requests, and check states for candidates. A leaf is a ready candidate
   when it is open and GitHub counts no open blocker (`blockedBy`, the fact
   behind the Blocked icon and `is:blocked`, F53). That set equals issue
   search `is:open -is:blocked`, but search can lag (F12 lesson), so the
   tick reads each issue's blockers directly.
5. **Evaluate rules.** Freeze a snapshot for each newly matching issue (body hash,
   label event ID, actor, permission). Quarantine changed snapshots.
6. **Reconcile reports.** Apply worker, verifier, and responder reports received
   through MCP since the last tick.
7. **Verify completion.** Run `inspectGitHubTaskCompletion` (F13) for GitHub
   leaves whose issue GitHub closed (§6.5); for a close with no merged
   closing pull request, check the closer and record an order or open a
   decision (§6.5); withdraw done for reopened leaves; accept local
   leaves whose verifier report matches the integrated commit.
8. **Integrate local work** whose verification passed (`integrateRun`, F34).
9. **Recompute readiness** across the whole graph.
10. **Project** approved GitHub changes in safe order (§6.3), then sync
    Project fields (Release, Wave, Iteration; never Status, §6.7), within
    this tick's write budget.
11. **Plan dispatches.** Choose ready leaves by priority, then graph order, up to
    each repository's and route's free capacity. In plans-repo mode, create
    each chosen leaf's linked branch (§6.6) before its intent is returned.
12. **Return intents** to the script: sessions to open, messages to send, labels
    already applied, notifications to raise.

Bounds:

- each tick stops at a safe point when its time budget (default 45 seconds of a
  120-second script timeout) is spent, and the next tick continues;
- each step is resumable from SQLite receipts, so a killed tick leaves no
  half-applied GitHub change without a receipt;
- two ticks in a row with no outside change write nothing (proof P4 checks it).

### 4.6 Dispatch through Kiro Crew

**Proposed.** The script cron is the only code that opens sessions (F31):

```text
tick.py:run(ctx)
  intents = ctx.call_tool("avoozl", "plans_tick", {})
  for s in intents.observe:   status = ctx.call_tool("kirocrew-dashboard", "session_status", {"target": s.slot})
                              ctx.call_tool("avoozl", "plans_session_status", {"slot": s.slot, "status": status})
  for d in intents.dispatch:  folder = find_or_create(ctx, d.folder)
                              slot = ctx.open_session(d.title, folder_id=folder, agent=d.agent)
                              ctx.call_tool("avoozl", "plans_bind_session", {"task": d.task, "slot": slot})
                              ctx.send_to_session(slot, d.brief)
  for m in intents.messages:  ctx.send_to_session(m.slot, m.text)
  for n in intents.notify:    ctx.notify(n.text)
  if not (intents.dispatch or intents.messages or intents.notify): raise Skip()
```

- Session titles are `avoozl:<task-id> <short title>`, so bindings are
  rediscoverable (§3.3).
- `plans_bind_session` is recorded before the first message, so a crash between
  open and send leaves a bound, empty session the next tick messages.
- Whether a script cron may call the `kirocrew-dashboard` server's
  `session_status` is **Inferred**; proof P2 checks it. If it cannot, MC-2
  becomes blocking.

New MCP tools (**Proposed**, `plans_` prefix kept for consistency):
`plans_tick`, `plans_bind_session`, `plans_session_status`, `plans_report`
(worker, verifier, responder reports), `plans_prepare_worktree`,
`plans_project_preview`, `plans_post_reply`, `plans_rebuild`.

### 4.7 Security and exposure

**Proposed.**

- The node backend binds `127.0.0.1` on a port the gateway assigns and accepts
  only requests carrying a valid gateway-signed principal (F33). It refuses
  unsigned requests with 401. It never binds another interface.
- Avoozl opens no other listener. The current `server.mjs` website, the
  workspace host server, the intake callback (`github-intake.mjs`), and the
  remote execution target listener on `main` are removed (§9).
- GitHub credentials come from `AVOOZL_GITHUB_TOKEN`, `GITHUB_TOKEN`, or
  `gh auth token` (F35), never from SQLite or `.avoozl.json`. Kiro Crew's secret
  store may supply the environment variable.
- Issue text, comments, and pull-request text are untrusted data in every brief.
  Briefs quote them inside a fenced block labeled as data and restate the task's
  own acceptance criteria from the approved manifest.
- The responder agent has read tools only and no shell write or `gh` write; its
  reply reaches GitHub through `plans_post_reply`, which Avoozl screens for
  secrets and absolute paths before posting.
- Content rules (§4.9) check every write and approval against the rule sets
  `.avoozl.json` names; the terms stay out of Git, and findings never log
  them.
- Plugins run only after a person approves their exact version and hash, each
  in a local child process over stdio, with no port and no listener (§4.8).

### 4.8 Plugins: routes, trackers, and loading

**Proposed**, owner request 2026-11-12 (Requirements 22, 34, 35). This is the
one way to add a delivery system or a task tracker. It stays a schema and an
interface until the gate in Requirement 22.4 holds: every proof in Phases 0–7
passes, and a second real route exists. A private code-review route in its own
private package counts as that second real route. Test fakes never count.

**Where plugins live and how they are declared.** A plugin is a package
installed into Avoozl's plugin folder under the app's data directory, a
local folder, or one commit of a git repository (below). Avoozl never installs one during a tick; **Add plugin** in
Settings does it. A `plugins` entry declares each plugin:

```json
{
  "plugins": [
    { "id": "example-tracker", "package": "@example/avoozl-tracker",
      "contract": 1,
      "config": { "baseUrl": "https://tracker.example.com",
                  "tokenEnv": "EXAMPLE_TRACKER_TOKEN",
                  "allowedActors": ["maintainer-login"] } },
    { "id": "example-review", "path": "../avoozl-example-review", "contract": 1 }
  ]
}
```

Entries go in `.avoozl.json` (shared, reviewed in Git) or in the machine-local
Avoozl settings (this machine only, never committed). A private integration
whose name must not appear in a public repository is declared in the
machine-local settings; Settings warns before saving a `plugins` entry into a
`.avoozl.json` that lives in a public repository. `config` is plain data
passed to the plugin; credentials come only from the environment or Kiro
Crew's secret store, by the name `config` gives.

**Git sources** (Requirement 34.12–34.15, added 2026-11-12). An entry may
name a git repository instead of a package or a folder:

```json
{ "id": "example-review", "git": "https://git.example.com/team/review-plugin.git",
  "ref": "v1.4.0", "subdir": "plugin", "contract": 1 }
```

`git` is a URL or a local repository path (relative paths resolve like
`path`). `ref` is a tag, a branch, or a full commit. `subdir` is optional.
A branch moves, so Avoozl never trusts a ref: the person's **Add** or
**Update** action resolves `ref` to a full commit with `git ls-remote`, and
stores the pin (`git`, `ref`, `subdir`, `commit`) in machine-local settings.
It then fetches that one commit into
`<machine plugins folder>/git/<id>/<commit>/` with the person's own git and
credential helpers, so private repositories work: a fresh repository with
no template hooks, `core.hooksPath` pointed at an empty folder, a shallow
`fetch --depth 1` of the commit, no submodules, no tags, LFS smudge off, and
a check that the fetched commit equals the pin. The `.git` folder is then
removed, so the plugin folder is plain files. Avoozl runs no `npm install`
and no install script; a plugin that lists dependencies it does not ship is
refused with a message saying it must ship ready to run. The tick reads only
the pinned folder: it never fetches, clones, or resolves a ref, and a git
entry with no pin, or a pin that no longer matches the entry, shows as
missing until a person chooses Update. Settings shows the resolved commit
before approval, and the approval stores the commit beside the version and
hash, so a new commit needs a new approval even when the version string
stays the same. Refused: a URL with a user name and password or token in it
(an SSH user such as `git@` is fine), a value starting with `-` or naming a
`transport::` helper, a `subdir` that is absolute, contains `..`, or
resolves outside the checkout through a link, and a commit with no
`avoozl-plugin.json` at `subdir`. Git's error text is shown with any URL
credentials masked.

**Manifest.** Each plugin ships `avoozl-plugin.json`:

```json
{ "id": "example-tracker", "version": "1.2.0", "contract": 1,
  "kinds": ["tracker"],
  "capabilities": { "tracker": ["edges", "subtasks", "actor", "pause"],
                    "route": [] },
  "entry": "index.mjs" }
```

The manifest `id` must equal the entry's `id`. `local` and `github` are
reserved. Route names and authorities are `plugin:<id>`.

**Consent.** Before the first load, and after any change of version or
content hash (a SHA-256 over the package's files), Settings shows the id,
version, kinds, capabilities, location, and hash, and loads the plugin only
after a person approves. The approval lives in machine-local settings. The
tick, example installation, and `.avoozl.json` cannot approve a plugin.

**Running.** Avoozl starts each approved plugin as its own Node child process
and talks to it with JSON messages over stdio. It gives the plugin no port.
A plugin must open no listener; Avoozl checks the child's open sockets after
start and on each health check, and stops and marks broken one that listens.
(**Inferred**: listing a child's listening sockets needs no extra rights on
macOS and Linux; proof P26 checks it.)
The plugin may call its own system over the network. Every reply is checked
against the contract schema and treated as untrusted data: quoted as data in
briefs, escaped in views.

**Failure isolation.** Each call has a time limit (default 20 seconds) inside
the tick's budget (§4.5). When a plugin is missing, unapproved, crashes, times
out, replies with an invalid shape, or expects an unsupported contract version,
Avoozl marks it unavailable for this tick, parks each of its tasks as "needs
you" with the reason, writes nothing for those tasks, and finishes the tick for
everything else. The next tick tries again. A plugin's tasks never fall back to
another route or authority on their own.

**Contract version.** One integer, `contract`. Avoozl lists the versions it
supports and refuses others at load. Changes inside a version only add
optional fields or capabilities.

**Route kind** (Requirement 22). `submit(task, brief)` returns a remote ID and
link; `status(id)` returns `queued`, `running`, `needs-person` (with a link),
`failed`, or `done`; `completion(id)` returns a pull request link, an answer,
or both; `cancel(id)`. Readiness and dependent release work as in §4.3 and
Requirement 22.5–22.9.

**Tracker kind** (Requirement 35). The same jobs GitHub authority does, stated
generically:

| Job | Contract call | GitHub equivalent |
|---|---|---|
| Create or update a task's record | `project(task, desired)`, idempotent by namespace and task ID; returns record ID and link | Projection (§6.3), marker v2 (§3.4) |
| Read state | `read(ids)`: open or closed, close reason, last close or pause actor, managed field values, stored marker | Tick step 4 |
| Rebuild | `list(namespace)`: every record carrying the namespace and task ID | Rebuild from markers (§3.3) |
| Close | `close(id, reason)` with `completed` or `not_planned` | Parent close; take back local (Requirement 33.3) |
| Bring outside work in (optional capability `poll`, Requirement 50.7) | `poll({cursor, limit})`: changed items since the cursor, as incoming items (§4.12) | Issue intake (§4.4) and the Untriaged read (§8.5) |

- **Marker.** The plugin stores the namespace, task ID, and last applied
  managed values with each record, where its tracker allows (a hidden field or
  a managed description section). A tracker that cannot store them is refused
  for the kind `tracker`.
- **Graph.** Most trackers have no native blocked-by links. Then the graph
  stays in Avoozl: blocking edges come from the approved manifest in Git,
  SQLite caches them, and the tracker holds only records. An edge change is a
  plan change. With the `edges` capability, Avoozl projects blocking edges as
  the tracker's own links, and they become managed fields.
- **Conflicts.** Managed fields are the title, the managed description
  section, managed tags, and (with `edges`) blocking links. The three-way rule
  of Requirement 15.1–15.3 applies with the marker's last applied values.
  Avoozl edits no other field.
- **Completion.** The verdict stays Avoozl's, from the task's route: local
  verified-and-integrated commit (§5) or a route plugin's `completion`
  (Requirement 22.8). After the verdict Avoozl calls `close(id, "completed")`.
- **Orders.** A close or pause by someone else follows Requirement
  33.8–33.10, using the actor from `read` and the entry's `allowedActors` or
  the tracker permission the plugin reports. Without the `actor` capability,
  every outside close or pause holds its dependents and opens a decision.
- **One authority.** A task is `local`, `github`, or one `plugin:<id>`, never
  two. A plugin row refuses direct edits with 409.

**Private integrations.** A route for an internal code review system, or a
tracker for an internal tracker, is a separate private package that plugs in
here. Nothing in the public Avoozl repository names a company-internal tool:
not code, tests, fixtures, docs, or this spec. Tests use only the fake route
and fake tracker plugins under `test/fixtures/plugins/`. The release leak scan
(§13 gate 5, task 7.4) covers plugin docs and fixtures.

### 4.9 Content rules

**Proposed**, owner request 2026-11-12 (Requirement 40). A company that uses
Avoozl may need to keep private terms, internal system names, private
repository names, hostnames, and file locations out of everything Avoozl
writes. Avoozl already has narrow screens for some of this (F67–F71). This
section makes them one feature with one matcher, instead of adding another
screen beside them. The facts read `kirocrew-native` at `dbf001b`.

#### Current-code facts

| # | Fact | Evidence |
|---|---|---|
| F67 | **Verified.** The release scan keeps public rules (secrets, home and temp paths) in the script and reads private terms from an untracked file, `rule: regex` per line with `#` comments, at `$AVOOZL_RELEASE_TERMS` or `.avoozl/local/release-terms.txt`, matched per line ignoring case. A missing file prints a warning and the scan goes on. Each finding prints up to 160 characters of the matched line. It scans the npm and app packages, plugin docs, and fake plugins, and optionally the tree and history. | `scripts/release-scan.mjs` `PUBLIC_RULES`, `parseTerms`, `localTerms`, `scanText` |
| F68 | **Verified.** `findPlanningLeak` decodes percent escapes and HTML character references (up to three rounds), drops zero-width characters and backslashes, and matches the planning repository's `owner/name` with whitespace allowed between its characters, ignoring case. It returns `{field, form}`, never the text. Callers: the linked-branch step, comment steering, worker dispatch (a brief that leaks is not sent), and `pullRequestLeak` over pull request titles, bodies, and commit messages. | `src/app/github-plans-repo.mjs`; `github-linked-branches.mjs`, `github-steering.mjs`, `delivery.mjs` `planReadyDispatches` |
| F69 | **Verified.** `screenReply` checks a reply per line against a secrets table, a paths table, and this machine's own roots. It returns `{kind, line}` and never the matched text. `postReply` refuses with 422, posts nothing, and records a `github.reply.refused` event with the findings; the responder fixes the reply in its session. | `src/app/github-respond.mjs` `screenReply`, `machineRoots`, `postReply` |
| F70 | **Verified.** `secretReason` is a third secrets table (with a high-entropy check) that refuses markers (with the planning-repository and path checks), workspace publications, and the broad-issue preview comment, with 422 and a reason. | `src/app/workspace-repository.mjs` `secretReason`, `scanWorkspacePublication`; `github-marker.mjs` `validateMarker`; `github-breakdown.mjs` `screened` |
| F71 | **Verified.** The three secrets tables (F67, F69, F70) differ in patterns and coverage. | Same files |
| F72 | **Verified.** Nothing screens issue titles, issue body text outside the marker, Project field values, plan files at save or approval, or worker diffs. Only the eight modules in F68–F70 call a screen. | `grep` for the four screen functions in `src/app` |
| F73 | **Verified.** The plugin loader is on `kirocrew-native` with kinds `route` and `tracker`. | `src/app/plugins.mjs` `KINDS`; commit `8662302` |
| F74 | **Verified.** `.avoozl/local/` is ignored (`.gitignore`, and `local-ignore.mjs` adds it for workspaces). Machine-local settings live at `~/.config/avoozl/config.json`, and shared configuration refuses absolute paths. | `src/app/local-ignore.mjs`; `src/app/layered-config.mjs` |

#### Policy

`.avoozl.json` says which rule sets apply. It never holds a rule.

```json
{
  "contentRules": {
    "sets": [
      { "id": "company-terms" },
      { "id": "public-only", "action": "block",
        "boundaries": ["github", "diff"],
        "repositories": ["example/app"] },
      { "id": "trial-hostnames", "action": "report" },
      { "id": "example-rules", "plugin": "example-rules" }
    ]
  }
}
```

- `id` names the set. A set with no `plugin` reads its rules from a terms
  file: the path machine-local settings give in
  `contentRules.terms.<id>`, else `.avoozl/local/content-rules/<id>.txt` in
  the workspace. The path stays on the machine (F74), so the public file
  names neither the terms nor where they live.
- `plugin` names a `plugins` entry (§4.8) whose plugin declares the kind
  `rules`. The plugin may supply several sets; the entry picks one by `id`.
- `action` is `block` (default) or `report`.
- `boundaries` narrows the set to some of `plan`, `github`, `brief`, and
  `diff` (table below); absent means all. `repositories` narrows it to some
  registered repositories; absent means all, and local work with no
  repository is always covered.
- Validation refuses an unknown boundary, an unknown repository, a duplicate
  `id`, an `id` starting with `builtin:`, a `plugin` that names no entry,
  and any key that could hold a rule (`terms`, `patterns`, `rules`) in
  `.avoozl.json`.

The terms file format is the release scan's (F67): `rule: regex` per line,
`#` comments, matched per line ignoring case. One format means a company
writes one list. Before loading, Avoozl runs `git check-ignore` and
`git ls-files` from the file's folder; a file Git tracks, or one inside a
repository and not ignored, is refused, because the whole point is that the
list never lands in a repository.

#### Boundaries

| Boundary | What is checked | Where | On a match |
|---|---|---|---|
| `plan`: planner draft | Every spec file the planner saves or proposes | `plan.create`, `plan.save`, `plan.propose` | The call is refused with set, rule, file, and line; the planner fixes it |
| `plan`: approval | Every spec file and `avoozl/manifest.json` at the exact folder hash | `lintSpec`, as `content.match` diagnostics | Approval is refused; the diagnostic opens a decision |
| `github`: issues | Title and whole body (marker included) of every create or update | Projection (§6.3), before the write | Nothing written for that issue; decision |
| `github`: Project fields | Release and Iteration values | Project sync (§6.7), before the write | Nothing written for that item; decision |
| `github`: comments | Breakdown previews, published summaries, steering replies, responder replies | Each comment writer, `plans_post_reply` | Avoozl's own comment: decision. A responder reply: refused in-call (F69) |
| `github`: pull requests | Candidate pull request titles, bodies, and commit messages | Each tick, as `pullRequestLeak` does (task 4.8) | Completion blocked; decision; the worker is told the rule id and location |
| `brief` | Worker, verifier, and reviewer briefs | Before `send_to_session` | Brief not sent; decision |
| `diff` | Added lines of the worker's diff against its base | `plans_report` `done`; pre-push hook; local integration; open pull request diffs each tick | `done` refused in-call; push stopped; integration held with a decision; GitHub-route completion blocked with a decision |

Why the diff is checked four times: added lines only, so content already in
the repository never blocks new work. A public repository shows a branch the
moment it is pushed, so a check at merge time is too late there. The
pre-push hook (`avoozl content check --push`, installed in each worktree
Avoozl prepares) is the gate that stops a push. `plans_report done` catches
the same lines when the worker forgets to push. Integration and the open
pull request check are the backstop for a worktree Avoozl did not prepare,
or a hook that was skipped. (**Inferred**: a `pre-push` hook in a linked
worktree runs from the main checkout's `hooks` folder unless
`core.hooksPath` or `extensions.worktreeConfig` is set; task 10.4 checks how
to install it per worktree without touching the main checkout's hooks.)

#### Built-in rule sets

The existing screens become built-in sets. They keep their patterns,
decoding, boundaries, and refusal messages, so their tests pass unchanged.
Configuration cannot turn them off.

| Set | From | Applies at |
|---|---|---|
| `builtin:planning-repository` | `findPlanningLeak` (F68), plans-repo mode only | Linked branch, steering, briefs, pull requests (as today) |
| `builtin:reply-safety` | `screenReply` secrets, paths, and machine roots (F69) | Responder replies (as today) |
| `builtin:published-secrets` | `secretReason`, plus `validateMarker`'s path and planning-repository checks (F70) | Markers, workspace publications, broad-issue previews (as today) |

The three secrets tables (F71) stay separate for now. Merging them would
make some boundaries refuse text they accept today; that is an owner choice
(DONE list), not part of this change.

#### Matching

One module, `content-rules.mjs`, holds the terms parser (moved from the
release scan), the decoder (moved from `github-plans-repo.mjs`), and one
`check({boundary, repository, target, text, added})` that returns findings
as `{set, rule, boundary, target, line}`. A finding never carries the
matched text. The release scan imports the parser and matcher and keeps its
own public rules and file location; for private-term findings it prints the
rule id with the file and line, because terminal output gets pasted into
chats and CI logs.

Rules come from people the machine's owner trusts (a local file, or a
plugin a person approved), but the text they run on is untrusted (issue
bodies, diffs). A badly written pattern can still take very long on
hostile text. Each check runs in a `worker_threads` worker with a time
limit (default 2 seconds); a timeout makes the set unavailable for that
check. A rule that does not compile makes its set unavailable at load.

#### Decisions and allow once

A block opens one decision per set and target, naming the set, rule id,
boundary, target, and line. The decision view shows the matched line only
when a person opens it, read again from the source (the spec file, the
pending projection, the brief, the commit); it is never stored. **Allow
once** takes a reason and records who, why, when, the rule, the target, and
the SHA-256 of the exact content. The next write of that exact content at
that target passes that rule once; any change to the content checks again.
Only a person can allow: the app page and the CLI can, the MCP tools that
sessions call cannot (403), and neither can the tick or example
installation.

**Unavailable sets fail closed.** A set `.avoozl.json` names that is
missing on this machine, refused (tracked file), from a missing, unapproved,
or broken plugin, or that timed out, blocks every boundary it covers and
opens one decision naming the set and the reason. Everything it does not
cover goes on. A new machine with no terms file therefore writes nothing a
company set covers until its owner adds the file.

#### Rules plugins

A plugin kind `rules` joins `route` and `tracker` (§4.8). Its contract has
one call, `ruleSets()`, returning `[{id, version, rules: [{id, pattern}]}]`.
The usual consent, child process, schema check, and time limit apply. Avoozl
keeps the rules in memory for the tick and writes none of them to SQLite,
receipts, or Git; findings record the set's `version`. A company ships its
list as a private plugin, declared in machine-local settings, and public
Avoozl never sees it.

#### Allowed patterns

**Added 2026-11-13**, owner decision (R40.15). A team's list will match some
text it means to allow, for example a public product that shares a word
with a private codename. Allow once fits a single reviewed write; a false
positive that recurs needs a standing exception, the way git-secrets'
allowed patterns work. The terms file takes two more line forms:

```text
codename: \bzorblat\b
host: \bbuild\d+\.corp\.example\b
allow: \bzorblat-public\b
allow host: \bbuild0\.corp\.example\b
```

- `allow: regex` cancels a match of any rule in the file on that line;
  `allow <rule>: regex` cancels only that rule's match. A rule named
  `allow` or `allow <name>` is therefore no longer possible.
- A match is dropped only when an allow pattern matches the same line the
  rule matched, plain or decoded, as rules are. Diffs stay per added line.
- Allow patterns compile with the same flags, run in the same worker under
  the same time limit, and count toward the same 2,000-line limit.
- They are as private as terms: never in findings, events, or logs. A
  cancelled match is not a finding; `check` returns only a count of allowed
  matches per set and rule.
- Errors are line-numbered and never repeat the line: a pattern that does
  not compile, or `allow <rule>` naming a rule the file lacks.
- Only the owner's terms files take allow lines. Built-in sets keep Allow
  once only. A rules plugin returning `allow` in a set is refused (its sets
  become unavailable): a plugin author controls the pattern itself and can
  write the exception into it, and a key Avoozl ignored silently would look
  like an exception that is not there.
- The release scan reads the same file format (F67) and applies a file's
  allow lines to that file's rules only, never to its public rules.

#### Why each choice

| Choice | Why |
|---|---|
| Two layers: sets in `.avoozl.json`, terms outside Git | Reviewers see which rules apply; the list itself never lands in a repository. The release scan already works this way (F67) |
| One matcher; old screens become built-in sets | No fourth screen; one place to fix decoding and to prove "never logged" |
| Built-in sets keep today's patterns and cannot be turned off | Owner asked for unchanged behavior; they guard credentials and plans-repo mode's core promise |
| Block and ask, never redact | A silent rewrite changes meaning without anyone seeing it, and hides that a list matched |
| Agent calls are refused in-call; Avoozl's own writes open a decision | The agent can fix its own text at once, as the reply screen does today (F69); a decision per typo would page the owner for nothing |
| Added lines only for diffs | Content already in a repository is not this change's leak, and blocking on it would stop all work there |
| Pre-push hook | A pushed branch on a public repository is already public |
| Fail closed when a set is unavailable | The feature exists so content never appears; a missing file must not quietly turn it off |
| Allow once by content hash | It lets one reviewed exception through without weakening the rule for the next write |
| Findings carry rule id and location, never text | Receipts, notifications, and logs travel further than the machine |
| Time limit in a worker thread | A synchronous regex cannot be stopped from the same thread |
| `report` action | Lets a company try a new list on real traffic before it blocks |

### 4.10 Crew placement

**Proposed**, owner request 2026-11-12 (Requirement 41). The owner runs
several Kiro Crew instances: this machine and remote crews on other
machines, some on other operating systems. Today every session Avoozl opens
runs on this machine (F75), which can run short of memory. Placement picks
the crew for each session. It is a different question from the route
(§4.8, Requirement 22): the route says what does the work (an Avoozl worker
session, Issue Radar, or `plugin:<id>`); placement says which crew runs a
session Avoozl opens itself. Code and spec keep the two words apart.

**Owner answers, 2026-11-12.** Decided, not defaults:

1. Remote workers push their task branches, to public and private
   repositories alike. Avoozl itself never pushes. Content rules and the
   repository's policy still apply to what is pushed.
2. Router instructions are machine-local only, never in a tracked
   `.avoozl.json`. (Since 2026-11-13 this is the routing prompt.)
3. Avoozl needs Kiro Crew's MC-10 (§7.1). The owner must be able to attach
   to every chat Avoozl opens, local or remote. Until MC-10 ships, remote
   crews fail the reach check and Settings › Routing says so.
4. Chat limits (3 for `local`, 2 for a remote crew) and the 120-second stale
   limit stay as defaults, configurable per crew and by one setting.

The facts read Avoozl `kirocrew-native` at `0a7ef2d` and the Kiro Crew
0.12.2 runtime's own source. A fact read from source and not yet called
live is marked so.

#### Current-code facts

| # | Fact | Evidence |
|---|---|---|
| F75 | **Verified.** The tick opens every session with `ctx.open_session(title, folder_id=, agent=, model=)`. The script API posts `name`, `title`, `folder_id`, `agent`, and `model` to `/api/chat/slots` and has no crew argument. Every Avoozl session runs on this machine. | `kirocrew-app/crons/tick.py` `run`; Kiro Crew `cron_script_context.py` `open_session` |
| F76 | **Verified (source).** While Kiro Crew's `work_ledger.remote_dispatch` switch is on, the MCP tools `session_create`, `session_send`, `session_read_message`, `session_stop`, and `session_close` take `crew` (an instance id or exact name). With `crew`, `session_create` takes only `title`, `agent`, `model`, and `work_item`: no folder and no project directory. | Kiro Crew `mcp_session_crew.py` `with_crew_schema`, `run_crew_create` |
| F77 | **Verified (source).** `crew` is owner-only. The caller must be an owner-minted dashboard session; `cron:`, workflow, and subagent keys, app-scoped callers, unattended slots, and bound work-ledger workers are refused, and the running turn must be one the owner sent. | Kiro Crew `dashboard/handlers/remote_dispatch_routes.py` `authorize_remote_dispatch` |
| F78 | **Inferred** from F77, not called live. Neither the tick script cron nor the app backend can open a remote session today, and a Crew Mode conductor can only during a turn the owner sent. P29 checks this live first. | F77 |
| F79 | **Verified (source).** Follow-up calls with `crew` reach only a remote slot the same caller created; that record lives in the hub's memory and is lost when the hub restarts. | `remote_dispatch_routes.py` module notes, `_record_dispatch` |
| F80 | **Verified (source).** Each crew serves `GET /api/chat/headroom` behind the same switch: `mem_free_gb`, `cpu_count`, `load_per_cpu`, `posture`, `disk_free_gb`, `open_workers`, `measured_at`, numbers and status words only. The settings `work_ledger.remote_dispatch_memory_gb` and `_disk_gb` and a CPU limit of 1.0 load per CPU decide when a crew answers `crew_busy`. | Kiro Crew `dashboard/remote_dispatch_headroom.py` |
| F81 | **Verified (source).** Kiro Crew's own placement (`session_create` with `work_item` and no `crew`) picks the connected crew with the most memory and disk headroom. It knows no tags, and it retires a binding whose crew stays unreachable for `retire_minutes` (default 30) and dispatches the item elsewhere. | Kiro Crew `dashboard/handlers/remote_placement.py` `place`, `_score`; `remote_dispatch_headroom.py` `retire_minutes` |
| F82 | **Verified (source).** `GET /api/instances` lists connected instances and `GET /api/instances/{id}/status` their state. **Inferred:** no operating system or architecture field is listed, so tags come from the owner. | Kiro Crew `dashboard/routes/connections.py` |
| F83 | **Verified.** A worker finds its checkout through its Kiro Crew folder's project directory (MC-1), which exists only on this machine. The content-rules pre-push hook is installed per worktree on this machine (task 10.4). | `src/app/delivery.mjs` folder `Avoozl/<project id>`; §7.1 MC-1; §4.9 |

Avoozl does not use Kiro Crew's own placement (F81). It cannot express
tags or keep-local rules, and its timed retirement re-places a lost worker,
which Requirement 8.2 forbids.

#### Crew registry

Avoozl lists crews from `GET /api/instances` plus `local` (this machine,
always present). Everything else about a crew is the owner's, kept in
machine-local settings (`~/.config/avoozl/config.json`, F74), never in a
tracked file:

```json
{
  "crews": {
    "local":       { "tags": ["os:macos", "arch:arm64", "trust:local"], "chatLimit": 3 },
    "<instance id>": { "name": "build box", "tags": ["os:linux", "arch:x64", "tools:docker", "trust:remote"],
                       "gitHosts": ["github.com", "git.example.internal"], "chatLimit": 4 }
  },
  "crewStaleSeconds": 120
}
```

- `trust` is `local` or `remote`; a crew without settings is
  `trust:remote` with no git hosts, so nothing can be placed on it until
  the owner fills it in.
- `gitHosts` lists the hosts the crew can fetch from and push to. Any host
  works, GitHub or a private git host.
- `chatLimit` is how many Avoozl sessions may run there at once, set per
  crew. Unset, it is 3 for `local` and 2 for a remote crew.
- `crewStaleSeconds` is how old a reading may be before its crew is
  unavailable. Unset, it is 120 (two ticks). It is one machine-local
  setting for all crews.

#### One routing prompt (2026-11-13)

**Decided**, owner 2026-11-13: routing went overboard. The rule builder,
presets, scorer, smart pick, weighted `choices`, the separate Providers page
and its thresholds form are removed. In their place:

1. **Off by default.** Every session runs on `local`, on the agent and model
   from `delivery`, as before.
2. **On**, the person writes one routing prompt. Each tick, ONE routing
   agent call ranks every ready worker at once and picks a crew and a model
   for each. Nothing is cached across ticks that could hide a changed fact.
3. **Facts, never decided by the prompt.** Hard checks run first and filter
   the options: crew online, crew ready (it approves tools on its own, so a
   chat would not stall on an approval), crew can reach the repository, the
   tags the task `needs`, and provider health. A provider or model that is
   `out` is a hard check: it is never offered. `low` is a fact the agent
   reads (for example "claude: 85% used, low"); one setting, low at 80% by
   default.
4. Running chats switch model on their own only when their provider is out
   (§4.20). `low` affects new tasks only, through the prompt.
5. A crew or model pinned in a task's manifest still wins.
6. Canned example prompts the person inserts and edits: Tests go remote,
   Private repos stay local, Spread the load, Prefer Kiro models when Claude
   is low, 70% Claude, 30% Kiro.
7. The agent chooses only among options that passed the checks, its reply
   is validated, and task text in its brief is marked as untrusted data. A
   bad or missing reply falls back to local and is logged in Activity.

Settings live in this machine's file only, because the prompt may name
private machines:

```json
{
  "routing": { "enabled": true, "prompt": "Tests go remote. Everything else stays local.", "model": "model-r" },
  "providers": { "lowPercent": 80, "limits": { "claude": { "credits": 500 } } }
}
```

`enabled` is false and `prompt` empty when unset; on without a prompt is
off. `model` is the routing agent's model, Kiro Crew's default when unset.
Validation refuses `routing` in a tracked `.avoozl.json`, any
`projects.<id>.routing`, and the old `rules`, `pick` and `router` keys, each
naming the one-time migration (`scripts/migrate-routing.mjs`, which turns
old rules and the old router instructions into prompt lines, then can be
deleted).

A manifest task carries what the checks need:

- `needs` (optional): crew tags its work requires, such as `os:windows` or
  `tools:docker`. A crew without every tag fails the check.
- `session` (optional): `{agent, model, crew}`, each a pin that wins over
  the prompt. `choices` is refused.

#### Fetchable work

A remote crew has no checkout of this machine (F83). A session may go to a
remote crew only when:

- the repository has a remote whose host is in the crew's `gitHosts`;
- the base commit is on that remote (`git branch -r --contains <base>`
  after a fetch); and
- for a retry or rework, the earlier attempt's branch is on that remote.

Otherwise the crew fails the reach check with the reason "work not
fetchable". Avoozl itself never pushes, so a base that exists only here
keeps the task local. The remote brief carries the clone URL, the base
commit, and the task branch name instead of a checkout path; the worker
clones into its own crew's workspace, checks out the base, works on the
task branch, and pushes that branch to the same remote before it reports
`done`. Avoozl fetches the branch, checks the reported commit, and then
verifies, reviews, and integrates exactly as for a local worker.

The push is allowed on public and private repositories alike (owner,
2026-11-12); visibility plays no part in placement. What the push carries is
still checked: a repository's policy must allow execution there
(Requirement 10), a content-rule set that covers `diff` keeps work off
remote crews unless it allows them (below), and the `diff` boundary runs
again at `plans_report` `done` and at local integration (§4.9), so a
remote branch that matches a rule is held before it lands.

#### Hard checks

For each worker, checks, and reviewer session (`placement.mjs`
`crewChecks`, `modelChecks`), every check only removes:

| Check | A crew or model fails when | Source |
|---|---|---|
| Pin | The task pins another crew | Manifest `session.crew` |
| Where the commit is | A checks or review session would leave `local` | §5.2 |
| Needs | The crew lacks a tag in `needs` | Manifest `needs`, crew tags |
| Agent | A named agent is not installed there | Crew snapshot `agents` |
| Online | The reading is missing or older than the stale limit, the crew is unreachable, under Kiro Crew's memory or disk minimum, at load 1.0 per CPU, or at its chat limit | Crew registry (F80) |
| Ready | A remote crew does not report that it approves tools on its own (`ready: true` in the crew snapshot); unknown counts as not ready | Kiro Crew's per-instance approval state (YOLO), read by the backend when the app may |
| Reach | Remote dispatch is off, a content-rule set forbids remote crews, the work is not fetchable (below), or no MC-10 (and no Remote relay for a worker) | §4.10 Fetchable work, §4.9 |
| Out | A model, or its provider, is `out`; a person's replacement is offered instead | §4.20 |
| Review model | A writer model equals a `distinctFrom: model` review role's model | R53.7 |

A crew that fails a check that cannot clear by waiting is removed; a crew
that is only full or has a stale reading is busy. No crew left and none
busy is **no fit**: one decision naming each crew and the check that
removed it. Busy only: the task waits without a decision.

The models a worker may run on are the pin alone, else the kept model of a
retry unless it is out (R53.6), the default (`delivery.model`, else Kiro
Crew's default) and, with the prompt on, the models Kiro Crew lists (`GET
/api/models`, F128, read on every backend pass), each minus the checks
above. The options are every crew with room times every model that passed.

#### The routing agent

```text
tick N:   checks ─▶ options per ready worker ─▶ 1 option: take it
                                               ─▶ >1: queue ─▶ ONE avoozl-router session (all queued tasks)
backend:  idle session ─▶ last reply ─▶ validate against each task's options ─▶ answered | fallback (Activity)
tick N+k: checks again ─▶ pick still an option? take it : local (Activity) ─▶ answer spent
```

- One tool-less `avoozl-router` session per tick at most, on `local`, on
  the person's model, for every queued task (at most 50; the rest ask on
  the next tick). The tick never waits on it: tasks show "placing".
- Its brief holds, in order: the person's prompt; the facts Avoozl checked
  that tick (each crew's tags, chats, online, memory, load; each provider's
  health line); and the tasks, each with title, labels, type, repository,
  category, paths, last model, and its options. The task block is fenced
  and labeled untrusted data, not instructions; a fence inside task text is
  broken so it cannot close the block. The brief passes the content rules
  like any other.
- The reply is one JSON array `[{task, crew, model, reason}]`. A malformed
  reply falls back for the whole call; a pick outside its task's options
  falls back for that task. Each fallback is one Activity row of kind
  `routing.fallback`.
- No reply within 90 seconds, or a session that ended without one, falls
  back.
- An answer is used in the one tick that reads it. The checks run again on
  that tick's facts first: a pick that no longer passes falls back to
  local. Then the answer is spent, and any task still ready asks again in
  the next call, with fresh facts. Nothing is cached across ticks.
- Fallback means `local` on the kept or default model when `local` is an
  option, else the task waits.
- The routing session is not a work chat: it does not count toward
  `local`'s chat limit.

Preview runs the checks read-only over the ready tasks and shows each
task's options, what ruled the rest out, what would happen (pinned, the
only option, routing off, or the agent picks among N), and the exact brief
one call would get. It opens no session and calls no agent.

Only one choice: when pins and hard checks leave exactly one crew and
model for a ready worker, there is nothing to judge. The task takes it,
is not put in the routing call, and one Activity row `routing.only-one` is
written per attempt. A tick with no task left to rank opens no routing
session (`routing.mjs` `placeOne`, `tick.mjs`).

#### Agent and model per session

The writer's session comes from: the manifest `session` pin, the routing
agent's pick (on), `delivery` (repository, then workspace), then Kiro
Crew's default agent and `auto`. A retry keeps its last model unless it is
out; **Pick again** clears it. Checks and review roles keep their own agent
and model (§5.2) and run on `local`. The binding records `agent`, `model`,
`modelUsed` (when Kiro Crew reports it, F65), and `sessionReason`. Issue
Radar and `plugin:<id>` leaves ignore `session`. A coding agent outside
Kiro Crew is a route plugin (§4.8).

| Choice | Why |
|---|---|
| One prompt, not rules | Owner, 2026-11-13: routing went overboard |
| Hard checks before the agent | A compliance or approval fact must never rest on a model's guess; the agent picks only among what passed |
| One call per tick, all tasks at once | The agent can spread load across tasks; one session costs less than one per task |
| Used once, checked again | A crew that went offline or a provider that went out since the call is never picked from an old answer |
| Low is a fact, out is a check | The owner decides what low means in the prompt; out cannot run at all |
| Pins win | A task that must run somewhere says so in its own manifest |
| Fallback is local | Off is local; a failed call should look like off, not like a guess |

#### Content rules and trust

Every brief to any crew passes the content rules' `brief` boundary and the
plans-repo leak screen before it is sent (§4.9). A content-rule set gains
optional `remote: "allow" | "forbid"`. The default is `forbid` for a set
that covers `diff`, because its pre-push hook cannot be installed on another
machine (F83), and `allow` otherwise. Built-in sets are `allow`: they check
pull-request text and briefs on this machine.

#### Hand-back over SSH

**Decided**, owner 2026-11-13 (Requirement 41.15). How a remote crew's
work comes back is the crew's own machine-local setting:

```json
{ "crews": { "<instance id>": { "delivery": "handback", "sshHost": "user@build-box.example",
                                "worktreeRoot": "/home/user/avoozl-work" } } }
```

- `handback` (the default): the brief tells the worker to clone into
  `<worktreeRoot>/<repository>-<task id>`, check out `avoozl/<task id>` at
  the base commit, commit there, and not push or write to GitHub. At its
  `done` report this machine fetches `+refs/heads/avoozl/<task id>` from
  that folder on `sshHost` into `refs/avoozl/remote/<task id>`, checks
  that the fetched tip is the reported commit, and fast-forwards the local
  task branch to it. Then the `diff` boundary, local checks, verification,
  review, and integration run here as for a local worker; a local Kiro Crew
  chat pushes. A crew without `sshHost` or `worktreeRoot` fails the
  reach check as "work not fetchable".
- `push`: the worker pushes its task branch to the repository remote, as
  in Fetchable work above, and this machine fetches it from there.
- Host keys: git runs ssh with `BatchMode=yes`, `HashKnownHosts=no`, and
  `UserKnownHostsFile` set to Avoozl's own `known_hosts` beside the
  machine-local settings. The first fetch from a host uses
  `StrictHostKeyChecking=accept-new`, which pins its key; every later fetch
  uses `yes`, so a changed key refuses the fetch and the report.
- Tests use a fake ssh command that checks the same file and runs git
  locally. No test connects to a host.

| Choice | Why |
|---|---|
| Hand-back is the default | The remote crew needs no GitHub write, and the push stays with a chat on this machine |
| Pin on first use, check every time | The same trust ssh gives, without asking a person mid-tick |
| Avoozl's own known_hosts | The pin is Avoozl's record and does not change the owner's ssh files |

#### Recording and recovery

Each binding stores `crew`, the remote slot key, the reason (pinned, the
only option, the routing agent's reason, or the fallback and why), the
reading, what the checks ruled out, and the time. The Delivery view shows the crew.
When a crew stops answering, its sessions show "crew unreachable" and stay
bound (Requirement 8.2): no timer re-places them. When the crew answers
again, the tick reconciles with that crew's session state before anything
new is dispatched there. A person's **Retry**, or the bounded retry policy
after a reported failure, places the task afresh. After a hub restart the
hub forgets which remote slots Avoozl opened (F79), so those sessions are
lost workers until MC-10 gives a lasting binding.

#### Who opens remote sessions

The tick cannot open a remote session today (F77, F78). MC-10 (§7.1) is a
required upstream ask to Kiro Crew, filed as a standalone request: an owner
grant that lets the Avoozl app and its tick cron open, message, read, and
close remote sessions, limited to sessions the app opened itself, with a
binding that survives a hub restart.

Attach is part of the ask. The owner must be able to attach to every chat
Avoozl opens, local or remote: open it and type into it from the **In
flight** card's Attach link. A local chat opens as today
(`/chat?sid=<slot>`). A remote chat must open the same way, from the slot
key and crew id in the binding. Kiro Crew's crew window lists a peer's live
sessions (`GET /api/instances/{id}/chat-slots`), but no link an app can
build from a binding is known (**Inferred**), so attach is part of MC-10.

Until Kiro Crew ships MC-10, remote crews fail the reach check (unless the
Remote relay carries a worker), and every session still runs on `local`.
Settings › Routing says once, in a neutral color, that remote crews wait on
Kiro Crew. No interim works around the owner-only
check, because that check is a Kiro Crew security rule.

#### Why each choice

| Choice | Why |
|---|---|
| "Placement" separate from "route" | A route can hand work to Issue Radar or a plugin that runs its own sessions; placement only applies to sessions Avoozl opens |
| Hard checks are facts, the prompt only chooses among them | A sentence cannot widen what the checks allow, and an approval or reach fact never rests on a model's guess |
| Off means local only | Nothing changes until the owner opts in |
| Crew ids and git hosts in machine-local settings | Machine names and private hosts must not land in a repository |
| Base must be fetchable; Avoozl never pushes | The owner's rule; a local-only base stays local |
| Remote push on public and private repositories alike | Owner, 2026-11-12; visibility is not the guard, content rules and repository policy are |
| The routing prompt machine-local only | Owner, 2026-11-12; it may name private machines |
| MC-10 required, every chat attachable | Owner, 2026-11-12: "we need to be able to attach to any chat" |
| Chat limits and stale limit configurable | Owner, 2026-11-12; machines differ, the defaults fit one laptop |
| Kiro Crew's limits read, not copied | One setting per fact; the platform already has them |
| Stale reading means unavailable | A crew that stopped reporting may be gone |
| No fit opens a decision; no room just waits | No fit needs the owner to change a pin, `needs` or a crew; no room clears itself |
| Not Kiro Crew's own placement | It has no tags and re-places on a timer (F81) |
| Agent after the checks, with fallback to local | The model ranks; it cannot widen what the checks allow, and a failure costs only the ranking |
| Diff-covering content sets forbid remote by default | Their pre-push hook guards a public push and runs only here |

### 4.11 Flow: timing, stop the line, and retrospectives

**Proposed**, owner request 2026-11-12 (Requirements 43–48). The owner
approved the direction; the defaults below are this design's picks and are
marked as defaults.

#### Why this exists

The owner ran a large compiler rewrite through an agent workflow, and it took
weeks. To learn what slowed it down, the owner had to keep asking an agent
for a meta-analysis after the fact. Each time the same causes came back:

1. Too much process and ceremony per task: a session, a worktree, a
   verifier, review rounds, and a report for every small change.
2. Too little batching: tiny related tasks each paid that fixed cost.
3. Waiting on GitHub CI to learn about failures a local run would have shown
   in minutes.
4. Failures not fixed when introduced: later tasks built on a broken branch,
   failed, retried, and failed again for a cause that was not theirs.
5. No record of where each task's time went (code, tests, commands, waiting),
   so every analysis started from transcripts.
6. No pause to improve: the same slow step repeated for weeks because nothing
   stopped to look at it.

This section answers each with a standard practice from lean delivery,
named so that a later reader can look it up rather than reinvent it:

| Cause | Practice | Avoozl feature |
|---|---|---|
| 5. No record of time | **Value stream map** (each step's active and waiting time from request to delivery); **flow efficiency** (active time over lead time); **DORA metrics** (lead time for changes, change failure rate, time to restore) | Flow timing, always on (Requirement 43) |
| 4. Failures not fixed when introduced | **Andon / stop the line**: anyone who sees a defect stops the line, the defect is fixed first, then work resumes | Stop the line (Requirement 44) |
| 3. Waiting on CI | Shift checks left: run them where the change is made, so CI confirms | Local checks first (Requirement 45) |
| 1, 2. Ceremony and no batching | Right-size the batch: pay the fixed cost once for several small changes | Batching small tasks (Requirement 46) |
| 6. No pause to improve | **Kaizen** (small, continuous improvement) through a **retrospective**; **theory of constraints** (improve the one biggest bottleneck, because speeding any other step does not speed the whole); **PDCA** (plan, do, check, act: check that a change helped, and undo it if it did not) | Retrospectives (Requirement 47) |

The parts a later change must keep, and why:

- **Timing is always on.** The whole point is that the data exists before
  anyone asks. A setting to turn it off would be off exactly when it was
  needed.
- **Every span names its source.** Some numbers are exact (from tool calls or
  GitHub timestamps) and some are coarse (from reports). A chart that mixes
  them without saying so leads to wrong conclusions.
- **Stop the line pauses new work only.** A running chat is left alone
  (Requirement 8.2's rule against replacing workers on a timer applies in
  spirit: stopping a chat mid-change loses work). New work in the scope
  waits because it would build on the break.
- **The retrospective proposes; the owner decides.** A process that changes
  itself can drift into removing the checks that keep it safe. Every change
  is typed, carries evidence, and needs a click; PDCA proposes undoing a
  change that did not help.
- **One bottleneck at a time.** Theory of constraints: a proposal that speeds
  a stage that is not the bottleneck does not shorten lead time, so the
  retrospective must name the bottleneck first and tie each proposal to it.

#### How this differs from the deleted telemetry

Task 5.1 deleted `telemetry.mjs`. It measured provider usage for the agent
host Avoozl used to run itself: tokens, cost, and provider events per run.
Kiro Crew now owns providers and shows usage on its own page, so that module
had nothing left to measure (F97). Flow timing measures something no provider
sees: wall-clock time across the delivery steps, including the time no model
is running at all (queued, CI wait, review wait, waiting on a person). It
stores no tokens, cost, prompts, or transcript text. It uses new tables; the
old `usage_samples` and `provider_events` tables stay read-only.

The old `safety.mjs` andon on `main` (§9) paused Avoozl-owned runs on safety
incidents and was deleted with the host. Stop the line here is a delivery
rule driven by check results on the landing branch; it opens no runs and
pauses only dispatch.

#### Current-code facts

Read against Avoozl `kirocrew-native` at `4939103` and the Kiro Crew source
at `01561d008` (2026-11-12). A fact read from source and not called live is
marked so.

| # | Fact | Evidence |
|---|---|---|
| F90 | **Verified (source).** Kiro Crew stores each tool call as a transcript row with role `tool`, the row's `ts`, and `meta` holding `tool_call_id`, the ACP `kind` (read, edit, execute, and so on), the redacted `input`, and the MCP server and tool name when the backend sends them. | Kiro Crew `dashboard/chat_turn/tool_rows.py` `_tool_meta`, `_on_tool_call` |
| F91 | **Verified (source), not called live for tool rows.** An app token may read `GET /api/chat/slots/<slot>` only for a slot the app owns; the answer holds the messages with their `meta`, with `limit` and an incremental `cursor=1` read. Avoozl's backend already reads its tick-opened sessions this way for status, under the `/api/chat/slots/avoozl_*` grant in `app.json`. | Kiro Crew `dashboard/slot_ownership.py` `deny_app_slot_access`, `dashboard/chat_api/slot_detail.py`; Avoozl `src/app/session-observer.mjs` |
| F92 | **Inferred.** No end time, duration, or exit code is stored with a tool row; only its start `ts`. A call's length can only be estimated as the gap to the next row, which also counts the model's thinking time after the call. | F90; no such field found in `tool_rows.py` or `tool_results.py` |
| F93 | **Verified (source).** Session control refuses an app's own cron (`_app_owned_cron_refusal`), so the tick cannot use `session_read_message`; and that read returns only `index`, `role`, `content`, and `ts`, without `meta`. | Kiro Crew `dashboard/session_control_parts/caller_access.py`; `session_status.py` `read_messages` |
| F94 | **Verified (source).** A slot the app does not own answers 404 to the app token, so a Crew Mode conductor's workers and the owner's own chats give the app no tool rows. Remote sessions are out of reach for the app (F77). | `slot_ownership.py` `deny_app_slot_access`; F77 |
| F95 | **Verified (live, 2026-11-12, public repository).** GitHub check runs carry `started_at` and `completed_at`; pull request reviews carry `submitted_at`. | REST `commits/{sha}/check-runs`, `pulls/{n}/reviews` |
| F96 | **Verified.** Avoozl already records the events timing needs: session bindings with role, attempt, `boundAt`, and `statusAt`; `plans_report` with `progress`, `done`, `blocked`, and `question`; verifier entries `{command, exitCode}`; `integrateRun` reruns the checks on the integrated commit (F63); and the `events` table with `at`. | `src/app/session-bindings.mjs`, `src/app/delivery.mjs` `reportSession`, `src/app/store.mjs` |
| F97 | **Verified.** Task 5.1 deleted `telemetry.mjs` with the host and providers; the run-era `usage_samples` and `provider_events` tables stay read-only. | §9; task 5.1 |

So per-call detail is partly there: for sessions the tick opens on this
machine, Avoozl can read which calls ran, their kind and command, and when
each started (F90, F91). It cannot read when a call ended (F92), and it
cannot read Crew Mode or remote sessions at all (F94). MC-13 (§7.1) asks
Kiro Crew for the missing parts. Until then the fallback below fills in.

#### Timing model

A **span** is one stretch of one attempt in one stage:

```text
flow_spans(id, task_id, attempt, batch_id, role, stage, started_at, ended_at,
           source, detail)        -- source: tool-calls | markers | events
```

`detail` holds a check name or a command name (first word and subcommand,
after the content rules), never output. Stages and where each comes from:

| Stage | Starts | Ends | Source |
|---|---|---|---|
| `queued` | Task becomes ready | Its worker session is bound | events |
| `coding` | Worker bound, or a phase marker `coding` | Next span in the attempt, or `done` | tool calls, markers, or events |
| `tests` | A shell call running a declared check, or marker `tests` | Next tool row or marker | tool calls or markers; verifier sessions as events |
| `commands` | Any other shell call, or marker `commands` | Next tool row or marker | tool calls or markers |
| `ci-wait` | First check run requested on the pushed head | Last required check run completed (F95) | GitHub check runs |
| `review` | Review role bound, or review requested on GitHub | Verdict reported, or review `submitted_at` | events, GitHub reviews |
| `rework` | Attempt 2 or later starts after a rejection or failed verification | That attempt's `done` | events (the whole later attempt) |
| `merge` | Verified, or pull request approved | Integrated, or merged | events |
| `waiting` | `question`, or `blocked` on another task or a person | The answer arrives | events |

Rules:

- **Source order.** Tool calls when readable, then phase markers, then
  events. A worker span with neither tool calls nor markers is `coding`.
- **Phase markers (fallback).** `plans_report` `progress` takes an optional
  `phase` (`coding`, `tests`, `commands`, `ci-wait`). Avoozl stamps the time
  it receives the marker; the worker sends one when it switches. The worker
  brief asks for markers only when Avoozl cannot read the session's tool
  calls, so a tick-opened local session is not asked to report what Avoozl
  can already see. This works for Crew Mode too: the conductor relays the
  worker's report.
- **Check durations.** Verifier entries gain `durationMs`; a `done` report's
  check list (Requirement 45) carries it too. A check run Avoozl makes
  itself (§5.2 Checks in code) records its span as stage `checks`, role
  `checks`, from start to end of the run.
- **Reading tool rows.** The backend reads each live tick-opened worker
  session with the incremental cursor once per tick, alongside the status
  read it already makes (F91), and keeps only `kind`, the command's first
  words, and `ts`. Shortcut: one read per live session per tick, the same
  bound the status read has; batch it when Kiro Crew offers an app-scoped
  roster.
- **Restart.** An open span stays open across a restart and closes at the
  next event that ends it (Requirement 43.8).

Metrics (Requirement 43.7), computed on read, never stored as truth:

| Metric | Definition | Practice |
|---|---|---|
| Lead time | Ready to integrated (local) or merged (GitHub), per task | DORA lead time for changes |
| Flow efficiency | (`coding` + `tests` + `commands` + `rework` + `merge`) / lead time | Value stream map |
| First-pass rate | Tasks accepted on attempt 1 with no `rework` span / finished tasks | Lean first-pass yield |
| Time to fix | Line stopped to line green, per stop | DORA time to restore |
| Change failure rate | Integrated tasks later named culprit / integrated tasks | DORA change failure rate |
| Fix-work share | Finished fix tasks (bugfix spec, `type: fix`, stop-the-line fix, or issue type Bug) / finished tasks (R79) | Failure demand |

`review` and `queued` count as waiting in flow efficiency because, from the
task's side, both are waiting for someone else. Deployment frequency, the
fourth DORA metric, is shown as integrations per day in the window and has
no card.

#### Stop the line

```text
landing branch head moves ─▶ checks rerun on the integrated commit (F63)
   │ a check that passed before now fails
   ▼
rerun once on the same commit ── passes ─▶ record "flaky", no stop
   │ fails again
   ▼
find culprit: last green .. first red
   one task commit ─▶ that task │ more ─▶ bisect in a scratch worktree (≤ 8 runs) │ else "unknown" + range
   ▼
stop: pause new dispatch in scope; running chats untouched
create fix task first in line; banner on Dashboard
   ▼
fix integrates ─▶ checks pass on head ─▶ resume, close stop with time to fix, notify once
```

- **Where checks come from.** Local delivery already reruns the
  repository's checks on each integrated commit (F63). In GitHub modes,
  Avoozl reads the required checks on the base branch's new commits through
  the same read it uses for completion (§6.5); it runs nothing in CI.
- **Breaking dependents.** When a verification fails, Avoozl runs the failed
  checks once on the task's unchanged base commit. A failure there is not
  the task's fault: it costs the writer no attempt, and Avoozl looks for the
  culprit in the base branch's history and stops the line. A worker's
  `blocked` report that names a task as the cause starts the same search
  from that task's commit.
- **Scope** (`flow.stopTheLine.scope`, default `dependents`).
  `dependents` pauses the culprit's transitive dependents, which are the
  tasks known to build on the break, and leaves unrelated work moving; with
  an unknown culprit it pauses the whole repository, because Avoozl cannot
  tell what builds on what. `repo` and `all` widen it. Other tasks in the
  repository keep running under `dependents`, but the stopped check's result
  on their commits counts as not judged (Requirement 38): their gates stay
  shut until the line is green, and they lose no attempts.
- **Fix task.** A new leaf `<culprit-id>.fix-<n>` (or `line.fix-<n>` with an
  unknown culprit) in the culprit's tracker and repository, local authority
  unless the culprit's issue lives on GitHub, in which case it is projected
  like any other new leaf. It takes the next free slot in that repository
  before any other ready leaf. Its brief allows a revert of the culprit
  commit, because a revert is often the fastest fix and the culprit's task
  can be redone afterwards.
- **Run anyway.** The owner may resume dispatch while the stop stays open,
  for example when the failing check is known to be broken for an outside
  reason. It is recorded and shown on the banner. Agents and plugins cannot
  press it.
- **Needs you.** The stop itself does not need the owner, because the fix
  task is already in line. It goes into **Needs you** only when the fix task
  asks a question, is blocked on something only a person can do, or fails
  past its retry bound.

#### Pull the cord

Added 2026-11-13 (Requirement 64). In the Toyota line anyone who sees a
defect may pull the cord. Avoozl's automatic stops only fire on a check that
used to pass; the cord covers what no check sees.

```text
Stop the line (header) ─▶ dialog: scope + one-line reason ─▶ flow.stop
   │ reason passes the `brief` content rules, scope target exists
   ▼
flow_stops row { manual: true, by, scope, target, reason, openedAt }
   │ dispatch skips every task in scope (fix tasks too); running chats untouched
   ▼
banner: who, when, scope, reason, paused count ─▶ Resume (person) ─▶ flow.resume
   ▼
closedAt, resumedBy, time to fix ─▶ Flow stops, charts, retro
```

- **Scope.** `all` pauses every task; `repo` every task in one
  repository; `spec` every task of one plan; `task` one task and its
  transitive dependents along blocking edges. Unlike an automatic stop, a
  pulled stop pauses fix tasks in scope too, because the person asked for
  nothing new to start.
- **Who.** `flow.stop` is an `execute` operation. The page and the CLI pull
  as a person; an agent session pulls through `plans_session` action
  `stop_line`, and the stop names the session. `flow.resume` is person
  only (`mcp-policy.mjs`) and refuses app-token and agent-tool callers.
- **Never by itself.** The line watch closes only stops that have a check
  or a fix task; a pulled stop has neither, so only Resume closes it.
  Resume refuses an automatic stop, and Run anyway refuses a pulled one.
- **Flow.** A pulled stop is a row in `flow_stops` like any other, so it is
  listed, counted per day and week, and its open-to-resume time is a time
  to fix. The retro payload's `lineStops` carries `manual`, `scope` and
  `reason`.
- **CLI.** `avoozl flow stop --scope all|repo|spec|task [--repository ID]
  [--spec ID] [--task ID] --reason TEXT` and `avoozl flow resume STOP-ID`.

#### Stop all agents

Added 2026-11-13 (Requirement 64.12–64.16). The dialog's second choice is
a full stop: nothing new starts anywhere, and every running chat Avoozl
opened stops now.

```text
Stop all agents ─▶ confirm (replies in progress are lost; files are kept)
   ▼ flow.stop {full: true, reason}   (person only; MCP refused)
flow_stops row { manual, full, scope: all, by, reason, sessions: [] }
   ▼ for each live binding the tick opened (any role)
POST /api/chat/slots/<slot>/stop (app backend, app token)
   ├─ ok ─▶ binding.interrupted { stop, at }; worker attempt recorded
   │        { outcome: interrupted, cause: "Interrupted by stop" },
   │        delivery state `interrupted`
   └─ refused ─▶ sessions[i].error; the session runs on, unmarked
Resume ─▶ flow.resume ─▶ each `interrupted` delivery of this stop ─▶ `failed`
   ▼ next tick: same worktree and branch, same agent and model
```

- **Where the stop runs.** Only the app backend holds the app token, so
  `flow.stop {full: true}` needs its session stopper. The CLI without the
  backend is refused with nothing recorded.
- **Attempts.** `interrupted` is its own outcome: it is not a failure for
  the retry limit, and an interrupted session is not live, so it is not
  nudged or counted against concurrency. Review and checks sessions are
  stopped too; their verification is recorded `interrupted` and a new one
  opens after Resume. While a full stop is open no checks or review
  session opens.
- **Same model.** The next worker attempt keeps the interrupted binding's
  agent and model, whatever the policy says now.
- **Brief.** The next brief says the attempt was interrupted by a stop and
  tells the worker to read `git status` and `git log` in the kept worktree
  first.

#### Local checks first

Default on. It applies wherever a session Avoozl opens pushes: plans-repo
workers (§6.6) and remote workers (§4.10). The brief tells the worker to run
the declared checks before each push; the `done` report lists each check's
command, exit code, and duration for the pushed commit; Avoozl refuses a
`done` without them. The pre-push hook Avoozl installs in each worktree
(task 10.4) also refuses a push whose commit has no recorded local pass. It
reads the record the worker's check run left in the worktree's git
directory, so the checks run once, not twice. A CI failure after a local
pass is recorded as "CI only", which usually means the two environments
differ; the retrospective sees those counts. Local delivery pushes nothing
and is unchanged. Issue Radar's sessions are not Avoozl's, so this cannot be
enforced there.

#### Batching

A leaf is batchable only when the plan marks it `size: "small"` in the
manifest, because only the planner knows a task is small before it runs.
Avoozl groups ready batchable leaves by `flow.batch.by` (`phase`, the same
parent or phase, by default, renamed from `epic` in §6.9; or `files`, overlapping manifest `paths`) up to
`flow.batch.max` (default 3). Every leaf in a batch shares the repository,
route, crew, and review roles, has no edge to another, and has local
authority. GitHub-authority leaves are not batched yet: each closes through
its own linked branch (plans-repo, F51) or `Closes #N` in its own pull
request (single-repo, through Issue Radar), and a shared branch for several
issues is not proved.

One worker session, one worktree, one commit per task in order, one
`done` per task. Checks and review run once on the batch head, which is the
saving. If they fail, Avoozl splits the batch and retries each task alone
without costing anyone an attempt, because a failing batch does not say
which task broke it.

#### Retrospectives

Triggers (Requirement 47.1) and their defaults:

| Trigger | Default | Why |
|---|---|---|
| Every N finished tasks | `flow.retro.everyTasks` = 10 | A steady cadence, like a sprint retrospective, small enough to act on |
| A task far slower than usual | `slowFactor` = 3 × the repository's median lead time over its last 20 finished tasks, at least 5 of them | A spike is a signal worth a look while it is fresh |
| A task's third attempt | fixed: two retries | Repeated rework is the clearest waste |
| A long CI wait | `slowFactor` × the repository's median CI wait, at least 5 samples; 30 minutes without them | CI wait was one of the original causes |

At most one retrospective runs per workspace; triggers fold into the next
one, and spike triggers within an hour of the last retrospective wait for
the next count trigger (shortcut: fixed one-hour gap, make it a setting if
retrospectives run too often).

The `avoozl-retro` agent is tool-less, like the router (§4.10): it gets the
data in its brief and answers with JSON, so it cannot read or change
anything. One local session per retrospective, on `flow.retro.model`
(default `auto`, meaning Kiro Crew's default for the agent). The brief holds
the window's stage totals per task and per repository, the metrics with the
previous window's values, line stops with culprits and time to fix, flaky
checks, CI-only failures, batches, the earlier proposals with their PDCA
results, and the owner's machine-local `flow.retro.instructions`. It passes
the content rules at the `brief` boundary.

Reply:

```json
{
  "bottleneck": { "stage": "ci-wait", "repository": "example/app",
                  "evidence": "ci-wait is 41% of lead time over 10 tasks; median 23 min" },
  "proposals": [
    { "type": "settings", "file": "repository", "key": "flow.batch.max",
      "from": 3, "to": 5, "metric": "lead time", "direction": "down",
      "evidence": "7 of 10 tasks were size small in 2 epics" },
    { "type": "plan", "spec": "example-spec",
      "change": "Split task 4.2 into a parser leaf and a wiring leaf",
      "metric": "first-pass rate", "direction": "up",
      "evidence": "4.2 took 3 attempts; both rejections were in the parser" }
  ]
}
```

- **Typed and bounded.** At most 3 proposals, each `settings` or `plan`.
  Settings proposals may touch only keys the Settings page edits, and never
  content rules, plugin trust or approvals, trigger actors or minimum
  permission, crew trust, or tokens: those guard safety, not speed. Removing
  a review role or a declared check is allowed, because ceremony was one of
  the original causes, but it is marked "removes a check" and needs a second
  confirmation.
- **Never applied by the agent.** Approve on a settings proposal writes it
  through the same validated operation Settings uses, with an expected
  revision, so a stale proposal fails instead of overwriting a newer edit.
  Approve on a plan proposal opens a planner draft; the draft then needs
  plan approval like any other.
- **PDCA.** Approval records the metric over the last `everyTasks` finished
  tasks. After that many more, Avoozl records it again and marks the result
  helped, no change, or worse. Less than a 10% move in the expected
  direction is "did not help", and the next retrospective gets a typed
  revert proposal for it. A plan change's revert is a plan proposal too.
- **Failure.** A retrospective that fails, times out (10 minutes), or
  answers nothing valid is recorded as failed with its reason; delivery
  goes on.

#### Configuration

```json
{
  "flow": {
    "stopTheLine": { "scope": "dependents" },
    "localChecksFirst": true,
    "batch": { "max": 3, "by": "phase" },
    "retro": { "everyTasks": 10, "slowFactor": 3, "model": "auto" }
  }
}
```

In `.avoozl.json` per workspace, overridable per repository under that
repository's entry (`projects.<id>.flow`); a missing key means its
default. `flow.retro.instructions` lives only in machine-local settings;
validation refuses it in a tracked file. There is no timing key.

#### Why each choice

| Choice | Why |
|---|---|
| Timing always on, no setting | The data must exist before anyone asks; the original problem was having none |
| Stages fixed, not configurable | Comparable numbers across repositories and over time |
| Every span names its source | Exact and coarse numbers must not be mixed silently |
| Tool rows first, markers as fallback | Use what Kiro Crew already exposes (F90, F91); ask workers only for what Avoozl cannot see |
| No prompts, output, tokens, or cost | Flow is about time; Kiro Crew owns usage; less stored means less to leak |
| Rerun once before stopping | One flaky check must not stop all work |
| Culprit by range, bisect bounded | A known culprit makes the fix task specific; an unbounded bisect would itself stop the line |
| Pause dispatch only; running chats untouched | Stopping a chat mid-change loses work |
| Default scope `dependents` | Stops what builds on the break and keeps unrelated work moving; `repo` and `all` are there for stricter owners |
| Stopped check is "not judged" on other tasks | Nobody loses an attempt for a break that is not theirs (Requirement 38) |
| Fix task first in line, revert allowed | Andon: fix the line before new work; a revert is often fastest |
| Not in Needs you unless the fix needs the owner | The fix is already in line; Needs you is for decisions only a person makes |
| Run anyway is person-only | Overriding a stop is the owner's call |
| Local checks first, default on | CI should confirm, not discover |
| Hook checks a record, not a rerun | The checks run once |
| Batch only `size: "small"`, local authority | Only the planner knows size in advance; GitHub closing links are one per issue |
| Batch by epic by default | Same-parent tasks usually share context and files |
| Split a failed batch, no attempt cost | A failing batch does not say which task broke it |
| Tool-less retro agent | It can only propose, never act |
| Typed proposals with evidence | A proposal must be checkable and reversible |
| Safety settings out of reach | A speed review must not loosen what protects the owner |
| PDCA with a revert proposal | A change that did not help should not stay by default |
| Retro instructions machine-local | They may name private machines or people, like the router's |

#### Owner additions (2026-11-13)

Added while Phase 12 was built; they change no rule above.

- **Built-in prompt, then the owner's.** Settings shows the `avoozl-retro`
  prompt read-only, folded, with Copy, and below it **Your instructions**,
  labeled as added after the built-in prompt. One shared page part; the
  routing prompt (§4.10) may use the same one later.
- **Model picker.** `flow.retro.model` is a dropdown of the models Kiro Crew
  lists (`GET /api/models`, granted in `app.json`) plus `auto`. A saved
  model Kiro Crew no longer lists stays, marked "not offered now".
- **Tokens and credits.** **Verified (source), not called live.** Kiro Crew
  serves an app the per-turn usage rows of its own sessions:
  `GET /api/usage/turns?slot=<slot>&days=N`, row-level isolated to the app
  (`dashboard/handlers/telemetry.py` `api_usage_turns`; rows `ts`, `model`,
  `input`, `output`, `credits`, among others; the kiro backend fills
  credits, others fill tokens). The backend reads each session the tick
  opened after each tick receipt, and keeps only `ts`, `model`, `input`,
  `output` and `credits` in `flow_usage`. Each turn is attributed to its
  session, then that session's task and attempt, then the flow stage whose
  span holds the turn's time, and to its model. The Flow tab totals them
  per task, plan, stage and model. Until a read answers, it says "not
  available". No upstream request is needed for this.
- **Charts over time.** Lead time (median), flow efficiency, first-pass
  rate, time to fix, stage mix, and tokens or credits, by day and by ISO
  week, from the same filtered `flow.view`, so the shared filter panel
  narrows them all. Theme colors, no yellow (CI wait is sky blue), one
  column at 320 px.

### 4.12 Incoming items

**Proposed**, owner idea 2026-11-12 (Requirement 50). Work arrives from
more places than GitHub: an internal ticket tracker, an internal code
review system, a script the owner runs. Each would otherwise need its own
intake, its own rules, and its own list. This section makes them one
record, one operation, and one pipeline. GitHub intake and the Untriaged
list move onto it and keep their behavior.

#### Current-code facts

Read against Avoozl `kirocrew-native` at `6d83f83` (2026-11-12), read only.

| # | Fact | Evidence |
|---|---|---|
| F101 | **Verified (source).** Intake is GitHub only. The tick's `intakeStep` calls `syncGitHubIssues` when a repository has rules. That lists open issues by each rule's first label (`candidateIssues`, never search), reads each issue's events and timeline, and stores matched issues as `github_issues` rows. | `src/app/tick.mjs` `intakeStep`; `src/app/github-sync.mjs` `candidateIssues`, `syncGitHubIssues` |
| F102 | **Verified (source).** The Untriaged list is GitHub only and is not in SQLite. The tick runs one GraphQL search per repository per 10 minutes and writes `untriaged.json` beside the database; `untriaged.view` applies the exclusions at read time. | `src/app/untriaged.mjs` `untriagedPath`, `refreshUntriaged`, `untriagedView`; `src/app/tick.mjs` |
| F103 | **Verified (source).** The tracker contract has `project`, `read`, `list`, and `close`, and tracker capabilities `edges`, `subtasks`, `actor`, and `pause`. No call brings outside work in: `list` returns only records that carry Avoozl's own marker. | `src/app/plugin-contract.mjs` `trackerReplies`; `src/app/plugins.mjs` `CAPABILITIES`; `src/app/trackers.mjs` header |
| F104 | **Verified (source).** The plugin child calls a method by name and fails only when that method is called and missing. Changes inside a contract version only add optional fields or capabilities. So an optional `poll` needs no new contract version. | `src/app/plugin-child.mjs` `handle`; `src/app/plugin-contract.mjs` `SUPPORTED_CONTRACTS` |
| F105 | **Verified (source).** The tick opens only plugins an unfinished task names as route or authority. A plugin that is only a source would never be opened. | `src/app/tick.mjs` `referencedPlugins`, `pluginStep` |
| F106 | **Verified (source).** A tracker close or pause counts as an order only when the plugin has the `actor` capability and the entry's `config.allowedActors` names the actor; anything else holds the task and opens a decision, and Avoozl does not reopen. | `src/app/trackers.mjs` `allowedActor`, `judge` |
| F107 | **Verified (source).** GitHub's check is `actorAllowed(repository, login, held)`: `allowedActors` and `minimumPermission` over the ranks `none` < `read` < `triage` < `write` < `maintain` < `admin`, applied to the newest event that made a rule true. Actions apply by the precedence quarantine, pause, deliver, execute, plan, respond. | `src/app/github-policy.mjs` `PERMISSIONS`, `actorAllowed`, `matchingRules`; `src/app/github-sync.mjs` `PRECEDENCE` |
| F108 | **Verified (source).** An MCP request carries Kiro Crew's caller block, which names a session key, not a person; a script cron's own copy of the server has no caller at all. Person-only operations refuse a session caller or MCP with 403. | `src/app/app-mcp.mjs` header; `src/app/operations.mjs` `content.show`, plugin edits |
| F109 | **Verified (source).** Content-rule boundaries are `plan`, `github`, `brief`, and `diff`. Nothing screens an item when it comes in; issue text is screened later, at `brief`. | `src/app/content-rules.mjs` `BOUNDARIES`; `src/app/github-sync.mjs` |
| F110 | **Verified (source).** `parseMatch` reads `label:`, `-label:`, `assignee:`, and `no:assignee` and refuses every other token by name. | `src/app/issue-match.mjs` |
| F111 | **Verified (source).** `task.capture` (`plans_capture`) records a person's request as an inbox task, idempotent by a submission ID. | `src/capture.mjs`; `src/app/mcp.mjs` |
| F112 | **Verified (source).** Each store table is its own SQLite table of `id` and JSON `body`, on an allowlist in `store.mjs`; `github_issues` is one. | `src/app/store.mjs` `get`, `list`, `put` |
| F113 | **Inferred.** An internal ticket tracker or code review system can answer "items changed since cursor X" for a query. A source that cannot is still usable, but its plugin must page through every open item each poll. | Not checked against any real system; proof P32 uses a fake |

#### The record

```json
{ "source": "tickets", "id": "T-1042", "link": "https://tickets.example.com/T-1042",
  "kind": "ticket", "title": "Export fails on empty sheet", "body": "…",
  "labels": ["sev:3"], "author": "alice", "assignees": ["bob"],
  "state": "open", "updatedAt": "2026-11-12T20:01:00Z",
  "fields": { "component": "export", "queue": "app-team" },
  "trigger": { "actor": "bob", "permission": "write",
               "eventId": "T-1042:evt:77", "at": "2026-11-12T20:00:40Z" } }
```

`kind` is `issue`, `pr`, `review`, or `ticket`. `state` is `open` or
`closed`; a closed item adds `closeReason` (`completed` or `not_planned`),
`closedBy`, and `closedAt`, the same shape as a tracker record (F103).
`trigger` is optional and names the event that last changed what a rule
would match. Limits (R50.2) follow the plugin contract's: 20,000
characters of body, http and https links only, titles of at most 240
characters like task titles.

Storage is two new store tables (F112): `incoming_items`, keyed
`<source>\0<id>`, with the record, its content hash, the snapshot hash a
trigger froze, the task it is tied to, its route, and its findings; and
`intake_sources`, one row per source, with the cursor, last read time,
`more`, and the last error. A row is rewritten only when its hash changes,
so a quiet tick writes nothing (Requirement 26).

#### Sources

GitHub is the built-in source `github`; it is never declared. Other
sources are declared like `plugins` entries (§4.8), in `.avoozl.json` or
in the machine-local settings, so a private integration's name can stay
off a public repository:

```json
{ "intake": { "sources": {
    "tickets": { "via": "plugin:example-tracker", "repository": "example/app",
                 "labelFields": ["component"], "assigneeField": "owner",
                 "minimumPermission": "write" },
    "script":  { "via": "mcp", "repository": "example/app" } } } }
```

`repository` names a registered workspace repository, which is where a
delivered item's leaf lands and whose rules apply. It works in every mode,
Local only included, because a plugin or MCP source does not need GitHub.

#### Two ways in

**A plugin's `poll`** (preferred). A tracker plugin declares the new
capability `poll` and implements `poll({cursor, limit})`, which returns
`{items, cursor, more}`: at most `limit` items (Avoozl asks for 500),
an opaque cursor of at most 2,000 characters, and whether more are
waiting. The tick cron calls it once per source per tick, after the
GitHub steps and before dispatch, inside the plugin's usual time limit.
The tick opens every plugin a declared source names, besides those its
tasks name (F105). The cursor is stored only after every returned item
is handled, so a crash replays the same page, and dedup makes the replay
free. With `more`, the next tick reads the next page. A failed poll keeps
the cursor and the items, shows the error on the source, and stops
nothing else (§4.8). It costs no model turn.

**MCP** for outside callers, for example a Kiro Crew cron job that reads a
system no plugin covers. `plans_intake` action `submit_items` calls `intake.submit` with
`{source, items}` (1–100 items) for a source whose `via` is `mcp`. A
submit naming `github`, a plugin source, or an undeclared source is
refused, so an MCP caller cannot pose as GitHub or a plugin. The reply
lists, per item, `created`, `updated`, `unchanged`, `stale`, or `refused`
with a reason, and where the item went.

Both ways produce the same record and run the same pipeline, inside the
workspace tick lock: `intake.submit` runs the pipeline at once, under the
lock, and the tick runs it for polled and GitHub items.

**Operations.** `intake.submit` (act), `intake.list` (observe: filters
`source`, `kind`, `state`, `untriaged`, paged by 100), and `intake.view`
(observe: one record with its route, findings, and history). The CLI is
`avoozl intake submit --source <id> --file <items.json>`, `avoozl intake
list`, and `avoozl intake view <source> <id>`; MCP adds the actions
`submit_items`, `items`, and `item` to the grouped `plans_intake` tool
(Requirement 56) instead of new tool names. No
existing `plans_*` name changes. The old `github.intake.*` callback
operations are unrelated and stay on their delete path (§9).

#### Pipeline

```text
item ─► check ─► dedup ─► content rules ─► trigger match ─► action
          │        │            │                 │
       refused  unchanged   quarantined      no match ─► Untriaged
                or stale    (decision)
```

1. **Check** the item's shape (R50.2). A bad item is refused alone.
2. **Dedup** on `source` + `id`. Same hash: nothing. Older `updatedAt`:
   ignored as stale.
3. **Content rules** at the new `intake` boundary (§4.9): title, body,
   labels, and fields. `block` quarantines the item with a decision that
   names the set and rule, never the text; `report` records a finding.
   No built-in set runs here (F109), so GitHub intake is unchanged unless
   the owner adds a set for `intake`.
4. **Trigger match**: the source repository's rules, through the one
   matcher (`matchingRules`, F107), on labels, assignees, and author,
   after `labelFields` and `assigneeField` add `<field>:<value>` labels
   and an assignee. A rule's `match` gains one `source:<id>` term; a rule
   without it matches GitHub items only, which is every rule today, so
   nothing changes. `source:` is refused in an Untriaged filter, because
   GitHub search reads that line.
5. **Action**, by today's precedence (F107), for the allowed matches
   (below): `quarantine`, `pause`, `deliver` or `execute` (a leaf, local
   authority, in the source's repository, pinned to the item's snapshot),
   `plan` (an inbox task through `task.capture`, F111, for the planner),
   `respond` (GitHub only in this phase), and `resume`. No match, or only
   disallowed matches: the item is untriaged.

**GitHub on the record.** `syncGitHubIssues` keeps its listing by label,
its event and permission reads, its snapshot freeze, and its
`github_issues` rows. It also writes each issue it lists as an item with
`source: "github"`, and each `github_issues` row points at its item. The
Untriaged read keeps its search, interval, page limit, and exclusions; it
writes its results as items and its read state (query, checked time,
error, truncated, and the keys the last search returned) as the
repository's `intake_sources` row. `untriaged.view` lists, for a GitHub
repository, only items its last search returned, exactly as the file did.
`untriaged.json` is no longer written; on the first tick after the
upgrade each repository is read again, once, like a **Check now**.

#### Who counts

| Source | Actor | Standing | Check |
|---|---|---|---|
| `github` | The newest event that made the rule true | GitHub repository permission | The repository's `allowedActors` and `minimumPermission` (unchanged) |
| Plugin | `trigger.actor`, with the `actor` capability | `trigger.permission`: the plugin maps its own system's roles to `none`…`admin` | The source's `allowedActors` and `minimumPermission`, default `write`, by the same `actorAllowed` |
| MCP | None that Avoozl can verify | The local owner | Meets only `pause` and `quarantine` rules |

The plugin states who acted and what that person may do in its system;
Avoozl still makes the call. That keeps one check in one place, shown in
Settings, and a plugin cannot quietly lower the bar the owner set. A
plugin without `actor` has no allowed actor (F106), so its items only list
or stop.

Why an MCP caller counts as the owner yet cannot start work:

1. The caller block names a Kiro Crew session, not a person, and a cron's
   own server copy has no caller (F108). Avoozl cannot tell who wrote the
   item at its source.
2. The MCP server is a stdio process on this machine, started by Kiro
   Crew's gateway or by a process the owner runs (F108). So whoever calls
   acts with the owner's authority, which is why it may add items and
   list them.
3. An agent session may be relaying text it read somewhere. Its `author`
   and `trigger` are claims. Taking them as an outside order would let a
   prompt-injected session start code work and skip the trigger-actor
   gate of Requirement 10.4.
4. `pause` and `quarantine` only stop work, so letting a claim meet them
   cannot widen anything. A close releases dependents, so a close it
   reports is treated as one by an actor who is not allowed.
5. A person still has a path: **Plan this** and **Deliver this** in the
   Untriaged tab or the CLI. Both refuse a session caller or MCP with 403,
   like `content.allow`.

#### Updates and closes

An item from any source can change after it came in. Avoozl compares the
new record with the stored one and updates the record and the tied task:

| Change at the source | Result |
|---|---|
| Title or labels | The task's cached title and labels follow; rules run again; no allowed match left withdraws the authorization, as GitHub's `withdrawn` does |
| Body after the trigger snapshot | The task is quarantined until an allowed actor re-triggers or a person confirms the new snapshot (Requirement 12.1, 12.2). The snapshot covers the body only, as for GitHub |
| Closed by an allowed actor | An order (Requirement 33.8–33.10): dependents are released, the actor, reason, and time are recorded, and it never counts as a verified completion; each released dependent's brief says the blocker closed without merged code |
| Closed by anyone else, an unknown actor, or an MCP caller | Dependents wait and a decision opens; Avoozl does not reopen the item |
| Reopened | The order is withdrawn; dependents wait again for new dispatch only; running sessions are left alone |

Avoozl writes nothing back to a non-GitHub source in this phase, so a
delivered item stays open at its source until someone closes it there.
Write-back belongs to a plugin's tracker calls, later.

#### Reviews

An item of kind `review` asks for a code review. It never becomes a
delivery: `deliver`, `execute`, `plan`, and `respond` rules skip it, and
only `pause` and `quarantine` apply. It lists in Untriaged with a **Code
review** button for Code Review Sage, by the fallback of §8.5: the app's
page, with a tooltip naming the item. Starting a review needs MC-15
(§7.1); when Kiro Crew ships it, a `review` rule action starts one review
per item snapshot. GitHub pull requests stay kind `pr` and keep §8.5.

#### Keeping and deleting

A closed item tied to no task is deleted 30 days after it closed. An item
tied to a task stays while the task does. The cursor row stays until its
source is removed from the settings.

#### Why each choice

| Choice | Why |
|---|---|
| One record for every source | One matcher, one check, one list; a new source is a plugin, not a feature |
| SQLite, not a file | The cron and the backend already share the database; one lock, one quiet-tick rule |
| `poll` on tracker plugins | Reuses plugin consent, health, and isolation (§4.8); no model turn; the cursor survives restarts |
| MCP only for declared `mcp` sources | An MCP caller cannot pose as GitHub or a plugin |
| Plugin states standing, Avoozl decides | One `actorAllowed` and one visible bar |
| MCP is the owner but meets no starting rule | It cannot prove an outside order (F108); stopping rules are safe |
| No `source:` means GitHub | Every existing rule keeps its meaning |
| `intake` content boundary off by default | GitHub intake keeps its behavior |
| Reviews never deliver | A review request is someone else's code; Code Review Sage owns reviews (§2) |
| No write-back yet | Smallest change; the tracker contract already holds the write calls |

### 4.13 Pull request feedback

**Proposed**, owner request 2026-11-13 (Requirement 54).

#### Current-code facts

| ID | Fact | Source |
|---|---|---|
| F114 | **Verified.** The plans-repo brief tells the worker to fix failing checks and answer review until the pull request merges. No code reads checks, reviews, or mergeable state for a leaf's open pull request. | `src/app/delivery.mjs` (brief step 5); `git grep` for `reviewThreads`, `mergeable` |
| F115 | **Verified.** The tick already sends two kinds of message to a bound worker through `intents.messages`: the leak screen's edit request and comment-mention steering. Both only reach sessions the tick opened (`source: tick`); a Crew Mode conductor's workers get the leak decision in `next`. | `src/app/github-close.mjs`; `src/app/github-steering.mjs` |
| F116 | **Verified.** Steering fences quoted text with `fence()` and checks the actor with `actorAllowed`. | `src/app/github-steering.mjs`, `src/app/github-respond.mjs` |

#### Flow

```text
tick
  for each covered leaf with an open PR on avoozl/<task-id> (or its Closes #N PR):
    read (batched per repo, skipped when updatedAt is unchanged):
      head SHA, checks on head, reviews, review threads, mergeable, autoMergeRequest
    events = failed checks on head
           + changes-requested reviews and new review comments by allowed actors
           + CONFLICTING
           + auto-merge off
    drop events already in receipts (PR, head SHA, event ID)
    if none: continue
    if rounds >= feedbackRounds or same check failed on 3 heads or worker reported blocked:
      open decision (Needs you); stop
    text = one message: task ID and title, events, fenced quotes, check links
    pass content rules (brief); leak screen in plans-repo mode
    worker live, source tick     -> intents.messages
    worker live, Crew Mode       -> next (conductor relays)
    worker gone                  -> new attempt, same branch, resume brief + text,
                                    same agent and model (§4.10)
    crew unreachable             -> wait (§4.10); nothing re-placed
    record receipt, round += 1
```

A round is counted when the message is sent or the attempt opens. The
same-check rule reads check names across the last three head commits the
worker pushed, so a flaky check that passes once resets it.

#### Choices

| Choice | Why |
|---|---|
| Avoozl relays; the worker acts | Avoozl never pushes or merges (Requirement 18); one writer per branch |
| Only allowed actors' comments | A public pull request's comments are untrusted; steering uses the same bar |
| One message per pull request per tick | A red CI run can fail ten checks at once; one turn should see all of them |
| Check links, not logs | Logs are large and may hold secrets; the worker reads them with `gh` in its own worktree |
| A bound and a same-check stop | A worker that cannot fix a check should stop costing turns and ask once |
| Not for Issue Radar leaves | Issue Radar already runs this loop for the pull requests it opens |
| On by default | The owner wants delivery without a person; the switch exists for repositories with noisy bots |

### 4.14 Plugin bundles and settings packs

**Built** 2026-11-13, owner request (Requirement 55). It replaces the
separate config-pack idea: a team ships one plugin, and a pack is one of
its parts.

#### Current-code facts

| ID | Fact | Source |
|---|---|---|
| F117 | **Verified.** The plugin manifest named `kinds` (route, tracker, rules), and the loader starts a child process only for a kind the manifest declares; an `entry` was always required. | `src/app/plugins.mjs` `validateManifest`, `pluginHost` |
| F118 | **Verified.** Every setting a pack may set already has a validator that names the bad key: `normalizeGitHubPolicy` (repositories, project, epic type), `validateContentRules` (refuses rule-like keys), `deliveryPolicy` (review roles), `flowSection`. | `src/app/github-policy.mjs`, `content-rules.mjs`, `delivery.mjs`, `flow.mjs` |
| F119 | **Verified.** A repository that names nobody counts people with write access (`DEFAULT_PERMISSION`), so a pack that sets a lower permission or adds actors widens who counts. | `src/app/github-policy.mjs` `repositoryInput` |
| F120 | **Verified.** A shared (`.avoozl.json`) entry may hold no absolute path, so a bundle reads machine paths from environment variables its config names. | `src/app/layered-config.mjs` `assertPortableRepositoryConfig` |

#### Shape

```text
plugin folder
  avoozl-plugin.json  provides: [pack, rules, tracker, intake, route]
                      kinds derived; capabilities.tracker lists poll for intake
                      entry only when a part runs code
  avoozl-pack.json    {description, settings}: settings only, checked by name
  index.mjs           rules.ruleSets, tracker.*, tracker.poll, route.*

Add plugin -> What step lists the parts and what the pack sets
           -> Applies to: this computer, or shared (.avoozl.json)
           -> Review: parts, hash, and the pack preview; Approve
plugin card -> Preview and import pack
           -> plugin.pack.preview: create | change | keep | skip, who-counts warnings
           -> plugin.pack.import {previewHash, acceptLowered, confirmPublic}
              approved plugin only; writes settings and packs.<id> provenance
```

`plugin.pack.preview` reads only and may run before approval, so a person
can look first. `plugin.pack.import` is a person's act (an agent session
gets 403), like approval. The tick never imports. The CLI has
`plugins pack-preview` and `plugins pack-import`.

#### Why each rule

| Rule | Reason |
|---|---|
| Pack runs no code; pack-only plugins have no entry | A team can share settings with nobody trusting code |
| One whitelist, then the existing validators | Settings and packs refuse the same values with the same names |
| Preview hash on import | The person imports what they saw, not what changed after |
| Who-counts change needs acceptance | Lowering who can give orders must never be silent |
| `packs` provenance in `.avoozl.json` | A reviewer of the commit sees where each setting came from |
| No follow mode, no org minimums | After import the settings are the repository's own; nobody upstream can change them |
| Intake is the tracker kind's `poll` | Reuses plugin consent, health, and isolation; Requirement 50 adds storage |
| Crew placement rules are not a pack key yet | They do not exist until Phase 11 builds them (task 16.7) |

### 4.15 Onboard a repository

**Built** 2026-11-13, owner request (Requirement 58). Settings >
Repositories gets **Onboard** beside Add repository: one stepped dialog,
styled like Add plugin, that walks a folder to draft plans ready to approve.
Every step reuses an operation that already exists; three reads are new.

| Step | Operation | Writes |
|---|---|---|
| Pick folder | `onboarding.inspect` (detect, plus `.avoozl.json`, spec folders, already added, visibility) | none |
| Pick mode | the mode cards, in the shared radio fold-out | none |
| Check GitHub | `github.setup` without `confirm` | none |
| Set up | `github.setup` with `confirm`, `github.settings.update`, `repositories.configure` | each GitHub write asks first |
| Import specs | `plan.specs`, `plan.create {spec}` | drafts only |
| Leak scan | `onboarding.scan`: content rules plus the public secret and path rules the release scan uses | none |
| Preview issues | `plan.issues.preview`: approval runs on a scratch copy of the store, then the projection preview reads it | none |
| Finish | a summary and Approve in Plans | none |

The three new reads are `observe`. The leak scan runs only when the
repository that holds the issues is public (single-repo mode, or this folder
as the planning repository), and it names file, line, set and rule, never
the matched text. With one GitHub repository registered, the issue preview
uses it for every leaf, as lint already does. The flow approves nothing,
starts no agent and pushes nothing.

### 4.16 Workflow templates, manual tasks, and task links and notes

**Proposed**, owner approval 2026-11-13 (Requirement 61). A repeated kind
of work, such as rewriting one SDK after another, should start from the
same phases, proofs, settings and flow habits each time. Some steps in it
are for people only, such as a team review, and what they decide has to
reach the agents after them. Three small parts cover this: templates,
manual leaves, and links and notes on every task.

#### Templates

A template is a folder in a plugin, named by the `template` part in
`provides` (§4.14). It holds no code, so it runs as nothing, like a pack;
a template-only plugin has no `entry`. Install, pin, approval and the
shared-with-the-repo rule are the plugin's (§4.8, §4.14), so a team ships
its templates in the same bundle as its pack and rules.

```
templates/sdk-rewrite/
  avoozl-template.json
  prompt.md
  starter/requirements.md
  starter/design.md
  starter/tasks.md
  starter/avoozl/manifest.json
```

| Key | Holds | Checked by |
|---|---|---|
| `id`, `title`, `description` | Shown in the New plan drawer | `id` like a plugin ID, unique in the plugin |
| `inputs` | Fields the person fills: `text`, `choice` (with `options`), `file`, `repositories`, `epic` | Each has `id`, `label`, `type`, `required`; IDs unique |
| `prompt` | The planner prompt, Markdown | Exists; uses only known `{{input}}` names |
| `starter` | A spec folder in the §6.8 layout | Lints clean with sample values; may hold `manual` leaves and proof tasks |
| `phases` | Phase IDs and titles, in order | Match the starter's headings or `phase` values (§6.9) |
| `proofKinds` | Proof outlines: title, setup, action, expected, failure means, next decision | Each has a title; the prompt tells the planner to fill them |
| `pack` | A settings pack (§4.14) | The pack validators of Requirement 55.4 |
| `flow` | Flow defaults | The Flow settings validator (§4.11) |

Placeholders are plain text replacement: `{{sdk}}` becomes what the person
typed, nothing is evaluated, and an unknown name makes the template invalid.
A `file` input is read in the page with the browser's file picker, at most
200 KB of text, and goes into the seed; Avoozl never opens a path typed into
a field. A template's seed still runs in the planner chat; the blank form
goes to Spec Builder (§8.6).

**New plan from template.** The New plan drawer (§8.6) starts with **Blank**
or **From template**, as radio fold-outs. From template lists approved
templates with title and description; picking one shows its inputs under
the drawer's Name, Category and Epic. `plan.new` gains `template` (plugin
ID, template ID, version) and `inputs`; it checks each required input and
runs content rules on the whole seed at the `brief` boundary, and a refused
request records nothing. The seed holds the prompt, the starter with its
placeholders filled, the inputs, and the spec rules the drawer already
sends. The tick imports the folder as a draft once it lints clean, with the
template recorded on the plan. With an epic picked, the planner also adds
the plan to that epic folder's `tasks.md` and manifest, which come back as
a draft revision of the epic (§6.9: both sides must agree).

**Settings and flow.** Picking a template changes no setting. When it has a
`pack` or `flow`, the drawer shows the pack preview (create, change, keep,
skip) with **Import these settings**, unticked. Ticking it and submitting
runs the person-only pack import against the shown preview hash, exactly as
Settings does (Requirement 55.5–55.7). The batching default works only
because the starter and prompt mark small tasks `size: "small"` (§4.11).

#### Manual leaves

```json
"review": {
  "kind": "leaf",
  "manual": true,
  "repository": "sdk",
  "acceptance": ["The team agreed the runtime and protocol results are good enough to cut over"],
  "completion": "person",
  "requires": ["protocol-tests"]
}
```

- **Lint.** `manual` leaves need `acceptance`, `repository` and completion
  `person`; `checks`, `agent`, `model`, `size`, `paths` and `route` are
  errors (`spec.manual-field`), and `person` on any other leaf is an error
  (`spec.person-completion`). `repository` only says where the issue
  lives, since nothing runs in it.
- **Tick.** A manual leaf is left out of `ready` for dispatch, batching,
  verification, review and integration. Its edges work as for any task, and
  every edge condition on it is met when it is done, because there is no
  merge or integration to wait for.
- **Lane.** Before its blockers finish it is in **Blocked or waiting**.
  Then it is in **Needs you**, tagged **Manual**, reason "Waiting for a
  person: Review with team". This reuses the lane people already watch and
  the Avoozl state option that exists on the board (§6.7), so setup
  changes nothing.
- **Mark done.** The task drawer shows the acceptance and **Mark done**. The
  dialog takes an optional outcome note and links, and **Done** or
  **Skipped**. `task.manual.complete` and `task.manual.reopen` are person
  only (page and CLI); MCP refuses them (Requirement 56.2). Either choice
  releases dependents; Skipped stays visible on the task and in Flow.
- **GitHub.** The issue is projected like any task's, under its plan issue
  or package, never gets a ready or trigger label and is never handed to
  Issue Radar. Its managed body says "Manual task: a person closes this
  issue or marks it done in Avoozl. No agent works on it." Mark done closes
  it as the person's `gh` login (completed for Done, not planned for
  Skipped), refused when that login fails Who counts. A close on GitHub by
  an allowed actor is the completion, with the close reason as Done or
  Skipped; unlike a code task, nothing is missing, so it counts as
  verified. A close by anyone else, or by a closer Avoozl cannot read,
  holds the dependents and opens a decision; the issue is not reopened. A
  reopened issue makes the leaf open again: new dispatch of dependents
  waits and running sessions are left alone, as for any reopened task.
- **Flow.** Time in Needs you counts as waiting on a person; first-pass
  rate and time to fix skip manual leaves.

#### Links and notes

| Field | Rule |
|---|---|
| `kind` | `link` or `note` |
| `url`, `label` | Link only: `https` or `http`, at most 2,000 characters, no user info; label 1–200 characters |
| `text` | Note only: 1–10,000 characters |
| `outcome` | True when saved from a manual leaf's Mark done dialog |
| `author` | `person` (with the `gh` login when known) or `session:<id>` |
| `at`, `editedAt`, `removedAt` | Times; a removed entry leaves the list and stays in activity history |
| `onIssue` | Show on the issue; false by default |

**Why SQLite, not spec text.** Links and notes record what happened while
the work ran: a meeting's outcome, a doc a reviewer pointed at, a decision.
They change after approval. In a spec file each one would change the
revision hash and send the plan back for approval, and the planner would
own text that people and workers write. They are execution state, so
they live in a `task_notes` table with at most 200 entries per task. A
link that belongs in the plan itself goes through Edit plan.

**Access.**

| Who | List | Add | Edit or remove | Show on the issue |
|---|---|---|---|---|
| Person (page, CLI) | yes | yes | yes | yes |
| Session (MCP `task` tool) | yes | its bound task only | no | no |

`task.notes.list` is `observe`. `task.notes.add` is open to sessions for
their bound task, so a worker can leave a finding for the next one.
`task.notes.edit`, `task.notes.remove` and `task.notes.show` are person
only. The CLI gets `avoozl task notes <id>` with `add`, `edit` and
`remove`.

**Content rules.** A new `notes` boundary, on by default like `plan`,
`github` and `brief`, checks each entry when saved. A block refuses a
session's call with the rule's names (§4.9) and refuses a person's save
inline with Allow once. Entries are checked again at `brief` when they go
into a brief and at `github` when shown on an issue.

**Briefs.** A worker's brief gets a "Links and notes" section: the newest
20 entries, at most 8,000 characters, each with author and time, introduced
as data from people and agents, not instructions. A dependent's brief also
carries each blocker's outcome entries, so the cutover worker reads what
the review decided.

**GitHub.** Nothing is written by default, because notes may hold meeting
notes not meant for a shared repository. An entry a person ticks **Show on
the issue** is listed in the managed body section under "Links and
notes". Edits there by others are conflicts, as for the rest of the
managed section. The rebuild test (§3.3) rebuilds shown entries from the
body; entries not shown live only in SQLite and its backups, and may be
missing after a rebuild, like session bindings.

#### Example: SDK rewrite template

| Phase | Starter tasks | Kind |
|---|---|---|
| Inventory | List `{{sdk}}`'s operations and features; read the gap list | leaves, `size: "small"` |
| Codegen | Generate the client from the models; compare with the old one | leaves |
| Runtime | Port transport, auth, retries, paging | leaves |
| Protocol tests | Run the protocol test suite until it passes | leaf, plus proof `protocol-tests` |
| Review | **Review with team** | `manual`, requires protocol tests |
| Cutover | Switch callers, dry run, release notes | leaves, require review, plus proof `cutover-dry-run` |

```json
{
  "id": "sdk-rewrite",
  "title": "SDK rewrite",
  "description": "Rewrite one SDK on the new runtime, phase by phase, with a team review before cutover.",
  "inputs": [
    { "id": "sdk", "label": "Which SDK", "type": "text", "required": true },
    { "id": "repository", "label": "Target repository", "type": "repositories", "required": true },
    { "id": "gaps", "label": "Gap list", "type": "file", "required": false }
  ],
  "prompt": "prompt.md",
  "starter": "starter",
  "phases": [
    { "id": "inventory", "title": "Inventory" },
    { "id": "codegen", "title": "Codegen" },
    { "id": "runtime", "title": "Runtime" },
    { "id": "protocol-tests", "title": "Protocol tests" },
    { "id": "review", "title": "Review" },
    { "id": "cutover", "title": "Cutover" }
  ],
  "proofKinds": [
    { "id": "protocol-tests", "title": "Protocol tests pass" },
    { "id": "cutover-dry-run", "title": "Cutover dry run" }
  ],
  "flow": {
    "batch": { "by": "phase", "max": 3 },
    "stopTheLine": { "scope": "dependents" },
    "localChecksFirst": true,
    "retro": { "everyTasks": 10 }
  }
}
```

Each new SDK plan made this way can join one epic, such as an SDK target
architecture epic, through the drawer's Epic field. The review's outcome
note and links reach the cutover workers' briefs.

### 4.17 Budgets and usage receipts

**Proposed**, owner decisions 2026-11-13 (Requirement 67). A task that loops
or keeps asking for review rounds can spend without limit, and nobody sees
it until the bill. Avoozl already reads every turn's tokens and credits for
the sessions its tick opened (§4.11, owner additions, `flow_usage`). This
section adds a price table, a cap per task, a stop at the cap, and a receipt.

```text
GET /api/usage/turns (after each tick receipt) ─▶ flow_usage (raw counts only)
                                                       │
price table (this Mac, versioned) ─▶ priced on read ───┤
                                                       ▼
cap = task ▸ spec ▸ repository ▸ workspace ─▶ spend ≥ cap?
   │ no: Delivery card, In flight, drawer show $spent / $cap
   ▼ yes
no new session for the task; stop message to each live session
   ▼
Needs you: Raise budget (person) │ Stop (person, pauses like Deferred)
```

#### Price table

- **Where.** Machine-local settings, `~/.config/avoozl/config.json` key
  `prices` (F74), never in a tracked file:

  ```json
  {
    "prices": {
      "version": 3,
      "creditUsd": 0.04,
      "models": {
        "claude-sonnet-4.5": { "inputPerMTokUsd": 3, "outputPerMTokUsd": 15 }
      }
    }
  }
  ```

  The numbers above are an example layout, not shipped prices. Avoozl ships
  an empty table, because prices change and a public repository should not
  carry stale ones. Validation refuses `prices` in `.avoozl.json`, in a
  settings pack (§4.14), and in a manifest, and names the file.
- **Versions.** `prices.save` (person only) bumps `version`, computes the
  sha256 of the canonical JSON, and writes a row to the SQLite table
  `price_versions` (`version`, `sha256`, `saved_at`, `table_json`). A
  driver export (§6.10) leaves `prices` and `price_versions` out, like
  every machine-local setting; the new driver prices with its own table.
- **Pricing a turn.** `credits > 0` and `creditUsd` set: `credits ×
  creditUsd`. Otherwise tokens and a model price: `input ×
  inputPerMTokUsd / 1e6 + output × outputPerMTokUsd / 1e6`. Anything else
  is unpriced. The kiro backend fills credits and other backends fill
  tokens (§4.11), so one table covers both.
- **Settings › Prices**, marked "this computer only": one row per model
  Kiro Crew lists (`GET /api/models`, already granted) and per model seen
  in `flow_usage`, with input and output price fields, a Credit price
  field, the version and when it was saved, and a muted note on each model
  with turns but no price.

#### Caps

- **Levels.** `budget: { usd?, tokens?, credits?, mode? }` at the workspace
  (`.avoozl.json` `budget`), the repository (`projects.<id>.budget`), the
  spec (manifest top-level `budget`), and the task (a leaf's `budget`). The
  most specific level that sets a key wins, key by key. Every level is a
  per-task cap; there is no spec-wide total. With no `usd` anywhere, the
  task has no dollar cap; its receipt is still kept.
- **Fallback.** Unpriced turns count against `tokens` (input plus output)
  and `credits`, defaulting to 2,000,000 and 200 per task. Priced turns
  count only against `usd`. A task stops when any of the three is reached.
  The first unpriced turn of a model on a task raises one warning on the
  task and lists the model in Settings › Prices.
- **What counts.** Every binding of the task: writer attempts and retries,
  the verifier, review roles (§5.2), responders for pull request feedback
  (§4.13), and the batch (§4.11). A batch's cap is the sum of its tasks'
  caps; its turns are shared out evenly across its tasks and marked
  `shared` on their receipts. A fix task (`<culprit-id>.fix-<n>`) has its
  own cap from its repository and workspace. Planner, critic, retro and
  router sessions are not tasks and have no cap; their turns show on Flow
  under "no task".
- **Modes.** `mode` is `"stop"` (default) or `"warn"`, most specific
  level winning. In `stop` mode the cap works as "The stop" below. In
  `warn` mode nothing is stopped, paused or messaged: at 100% the task
  gets an Over budget badge (spend / cap) on the drawer, the Delivery card
  and In flight, and one Needs you item, "Over budget: $X of $Y", with
  Acknowledge, Raise budget and Switch to stop (person only).
  Acknowledge clears it until spend passes the next step, each further
  50% of the cap. `budget.notify: true` at the workspace also sends a Kiro
  Crew notice per step; it is off by default. Switch to stop records who
  and when in `budget_holds` and the next check stops the task.
- **80% warning.** At 80% of any cap the task and the receipt show a
  warning in both modes; nothing else changes.
- **Fallback settings.** The 2,000,000-token and 200-credit fallbacks are
  the defaults of the workspace `budget.tokens` and `budget.credits`.
- **Intake grants.** A grant (`intakeBudget` on the task) only fills a
  dollar cap no level set, never raises a person's cap, and forces `stop`
  mode.
- **Raises.** `budget.raise {taskId, usd?, tokens?, credits?}` (person
  only) writes a row to `budget_raises` (`task_id`, `by`, `at`,
  `from_json`, `to_json`, `price_version`). A raise overrides the computed cap for that task
  without editing the approved manifest, whose hash stays pinned.

#### The stop

Spend is known after each usage read, which runs after each tick receipt,
about once a minute. The check runs then (in the app backend, under the
tick's lock) and again in the tick before any dispatch for the task. A
task can pass its cap by the turns that run between two reads; the
receipt shows the overrun. Stops, pauses, over-budget steps and sent
messages live in SQLite `budget_holds`. The rest of this section is
`stop` mode.

1. Spend reaches a cap. The tick records a `budget` stop on the task:
   spend, cap, level, and the price version used.
2. The tick dispatches nothing new for the task: no retry, verifier,
   review round, responder, or batch slot.
3. For each live session bound to the task, the tick queues one message
   through the existing `messages` intent and `send_to_session` (§4.6):
   "Budget reached. Finish the tool call you are in, leave the worktree as
   it is, report `blocked` with `budget`, and stop." Kiro Crew delivers it
   as the session's next turn (**Inferred**: a message sent to a busy
   session waits for the current turn; P41 checks it with the fake, and
   the first live stop records it). Avoozl never calls a stop, interrupt
   or close on the session.
4. Every Avoozl MCP call from a bound session, except `plans_report`,
   returns `budget_reached` (status 409, error code `budget_reached`) with the same text, so a worker that missed the
   message still learns at its next Avoozl call.
5. The task opens one Needs you decision of kind `budget` with **Raise
   budget** and **Stop**. Turns that ran between the cap and the stop are
   still recorded; the receipt shows the overrun in dollars.

Raise budget sends one "Budget raised to $N; go on" message to a live
session, or lets the next tick dispatch the next attempt as usual. Stop
pauses the task exactly as an allowed drag to Deferred does (§6.7): nothing
new is dispatched, the session and worktree are left alone, dependents
wait, and in GitHub modes the Project Status shows Deferred. Neither costs
an attempt (§5.2).

#### Receipts

`budget.receipt {taskId}` is an observe operation:

```json
{
  "taskId": "s1.a1",
  "spec": "s1",
  "repository": "r1",
  "complete": false,
  "missing": [{ "slot": "avoozl_…", "reason": "crew-mode" }],
  "cap": { "usd": 5, "tokens": 2000000, "credits": 200, "level": "spec" },
  "raises": [{ "by": "owner", "at": "…", "from": { "usd": 5 }, "to": { "usd": 8 } }],
  "price": { "version": 3, "sha256": "…" },
  "stops": [{ "at": "…", "usd": 5.12, "priceVersion": 2 }],
  "totals": { "input": 0, "output": 0, "credits": 0, "usd": 0, "unpricedTurns": 0 },
  "byStage": [{ "stage": "coding", "input": 0, "output": 0, "credits": 0, "usd": 0, "priced": true }],
  "byModel": [],
  "byAttempt": [],
  "readAt": "…"
}
```

- Stages are the Flow stages, attributed by `turnStage` (§4.11).
- Dollars use the current price version on every read, so a price edit
  recomputes old receipts. A stop or raise also keeps the dollars and
  version that applied then.
- The drawer's **Budget** fold, after Timing, shows spend against the cap,
  the receipt tables, and **Export JSON**, which downloads the same object.
  The CLI is `avoozl budget receipt TASK [--json]`; MCP is `plans_view`
  action `receipt` (R56: no new tool).
- The retro payload gains `receipts`: each finished task's totals by stage
  and model. Counts, dollars, model IDs and stage names only.
- The Delivery card and In flight card show a chip `$1.20 / $5.00`, muted
  below 80% of the cap, red at the cap, and "spend unknown" when it is.

#### Where usage can be missing

| Case | Why | What the budget does |
|---|---|---|
| Crew Mode worker | Bound by a conductor, not opened by the tick; `observeUsage` reads `source: "tick"` bindings only | Spend unknown; warn once; no stop |
| Remote chat | `/api/usage/turns` reads this gateway's rows; remote placement is inert until MC-10, and MC-10 does not cover usage | Spend unknown; warn once; no stop |
| Issue Radar route | Avoozl opens no session (§6.4) | No receipt beyond "not run by Avoozl" |
| Usage read fails | Kiro Crew refuses or the backend is down | Keep last known spend with its time; retry next tick; no stop |
| Turn with no model | Row has tokens but no `model` | Unpriced; counts against the token cap |

Unknown spend never stops a task, because a budget is a cap, not a
permission, and stopping on missing data would turn a read failure into a
blocked line. Known spend from readable sessions of the same task still
counts.

#### Incoming item budgets (hook only)

An incoming item (§4.12) may later carry `budget: { usd }` from a plugin
source whose entry the owner approved with a `budget` capability. A task
made from that item by Plan this or Deliver this would take it at the spec
level, below the manifest task. Nothing builds this until a real grant
plugin exists; payments, escrow and refunds are out of scope. A grant only sets a cap where none
exists and is always `stop` mode (owner decision 2026-11-13).

#### Built (2026-11-13)

`src/app/budget.mjs` holds the price table, caps, spend, holds and
receipts. Settings puts caps in **Settings › Budgets** (workspace and each
repository, `budget.settings.get` and `budget.settings.update`) rather than
in the repository Edit modal, so each cap lives in one place. The CLI adds
`avoozl budget view|raise|stop|acknowledge|switch-to-stop`. The driver
export (§6.10) is not built yet; when it is, it leaves `prices` and
`price_versions` out.

#### Why each choice

| Choice | Why |
|---|---|
| Dollars as the unit | Tokens and credits do not compare across models |
| Prices on this Mac only, none shipped | Prices are private and go stale; a shared file would spread wrong numbers |
| Raw counts stored, dollars on read | A price change recomputes every receipt |
| Versioned price table | A receipt can say which prices made a stop |
| Token and credit fallback | An unpriced model must still have a ceiling |
| Most specific level wins, key by key | A task can tighten one cap without restating the rest |
| Raise in SQLite, not the manifest | The approved manifest's hash stays pinned |
| Stop at the next turn by message | Ending a tool call mid-change can lose work |
| Retries and reviews share the cap | The point is a task's total cost |
| Unknown spend warns, never stops | A missing read must not block delivery |
| Warn mode | Some owners want to see overspend, not block it |
| Acknowledge until the next 50% step | One item per step cannot nag every tick |
| Grant caps always stop | It is someone else's money |
| No spec-wide total | Owner decision 2026-11-13; per-task caps first |
| Raise and Stop person only | Spending more is the owner's call |
| Budget never a permission | Spend limits must not loosen safety gates |

---

### 4.18 Retro prompt and skill proposals, and lessons

**Proposed**, owner approval 2026-11-13 (Requirements 68–70). The retro of
§4.11 can change settings and plans. Much of what slows a task is in what
the worker is told, so it may now also propose prompt and skill diffs. What
one workspace learns is kept as a lesson on this Mac, so other workspaces'
retros can reuse it, and lessons heal when what they were learned on
changes.

```text
retro brief ◀─ timing, receipts, prompt sections, skill texts, lessons
     │
     ▼ reply: settings │ plan │ prompt │ skill  (≤ 3, each with evidence)
schema + base hash + locked sections + content rules (`proposal`)
     │
     ▼ Proposals view: a person approves each one
prompt ─▶ override version N  (~/.config/avoozl/prompts/<workspace-id>.json)
repo skill ─▶ one leaf via Deliver this ─▶ PR or local integrate
external skill ─▶ note on the plugin card (nothing sent)
     │
     ▼ lesson (untested) ─▶ PDCA per version ─▶ kept │ undone
     ▼
lessons store (~/.config/avoozl/lessons.sqlite) ─▶ other workspaces' retros
     ▲ drift checks re-score, mark stale, re-check; a person rewrites,
       merges or retires
     ▼ a person shares chosen kept lessons (summaries) ─▶ PR to the plans
       repo (plans-repo) or the code repo (single-repo); Local only: nowhere
```

#### Current-code facts

| ID | Fact | Source |
|---|---|---|
| F121 | **Verified.** Avoozl composes the worker brief and the reviewer role brief itself; each quotes earlier words with "data, not instructions" lines, and a review role's `focus` (1–300 characters) comes from `.avoozl.json`. | `src/app/delivery.mjs` `workerBrief`, `reviewBrief`, `deliveryPolicy` |
| F122 | **Verified.** The retro and planner prompts ship in the app's agent files, and Kiro Crew loads an agent's prompt from the installed app; `retroPrompt()` reads the shipped file. | `kirocrew-app/agents/avoozl-retro.json`, `avoozl-planner.json`; `src/app/flow-retro.mjs` |
| F123 | **Verified.** The Spec Builder steering text is one constant, written into a repository only after a person agrees and never over a changed copy. | `src/app/spec-steering.mjs` `STEERING_TEXT` |
| F124 | **Verified.** Content-rule boundaries are `plan`, `github`, `brief`, `diff`, and `intake` (opt-in); an unknown boundary is refused. | `src/app/content-rules.mjs` `BOUNDARIES` |
| F125 | **Unknown.** Whether Kiro Crew lets an app replace an agent's prompt for one session. Until known, an agent-prompt override travels in the seed (below). | Not checked live |

#### Prompt registry and locked sections

Each built-in prompt is a list of named sections with the sha256 of its
shipped text. The five targets are `brief.worker`, `brief.review`,
`agent.planner`, `agent.retro`, and `steering.specs`. Sections marked
locked are `untrusted-data`, `content-rules`, `who-counts`, `acceptance`
(proof and acceptance wording), and `person-only`. A diff whose changed
lines fall in a locked section is refused with the section's name. Every
brief ends its locked sections with one line saying they outrank any skill
the session loads, so a skill change cannot loosen them either.

How an override reaches a session:

| Target | Delivered as |
|---|---|
| `brief.worker`, `brief.review` | Avoozl composes the brief from the override's sections |
| `agent.planner`, `agent.retro` | The shipped agent prompt stays; the seed carries each changed section whole, labeled as replacing the section of the same name (F125) |
| `steering.specs` | The next steering file the New spec drawer writes; a copy equal to an older Avoozl text is offered again, a changed copy is left alone (F123) |

#### Proposals

```json
{ "type": "prompt", "target": "brief.worker", "section": "steps",
  "base": "sha256:…", "diff": "@@ -3,1 +3,2 @@ …",
  "metric": "first-pass rate", "direction": "up",
  "evidence": { "runs": ["4.1#1", "4.2#2", "4.3#1"], "value": "50%",
                "effect": "fewer rejections for a missing test" },
  "lessons": ["L-7f3a"] }
```

A `skill` proposal names `target: "repo:<repository>:<path>"` or
`"external:<plugin or source>:<path>"` instead of a section. The brief
holds every unlocked section of the five prompts, with hashes, and the text
of at most 3 skills that runs in the window loaded, up to 8,000 characters
each (shortcut: fixed caps, raise them if retros ask for skills they cannot
see). The brief passes the content rules at `brief` as today. Each proposal
then passes them at the new `proposal` boundary, which every rule set
covers unless it narrows `boundaries`.

Approve, by type (person only, 403 for everyone else):

- **Prompt.** Writes override version N to the workspace's file under
  `~/.config/avoozl/prompts/`, with the shipped section text, its hash, the
  diff, the result's hash, the proposal, who and when. The override is per
  workspace; lessons carry it to other workspaces as a proposal, never as
  a silent copy. Revert sets the active version back one step and is
  recorded the same way.
- **Repository skill.** An incoming item with source `retro` and the diff
  as its snapshot, then one leaf through `intake.deliver` in that
  repository, with the diff quoted as data and the repository's checks.
  GitHub modes open a pull request; Local only integrates.
- **External skill.** A "Suggested change" note on the plugin card in
  Settings › Plugins (or in Flow when no plugin owns the file) with the
  diff, evidence and **Copy**. Its PDCA starts only if a later pin loads a
  skill whose hash differs.

Each attempt records `prompts` (target to version ID, such as
`brief.worker@3f2a91c0+o2`) and `skills` (target to sha256). Skill hashes
come from tool calls that read a skill file (F91) when Avoozl can read
them, else from an optional `skills` list in the worker's reports. The
receipt and the Timing fold show both. PDCA compares the change's metric
over `everyTasks` finished tasks on the old version with as many on the
new one, and marks the window "mixed" when another change took effect in
it.

#### Lessons store

One SQLite file on this Mac, `~/.config/avoozl/lessons.sqlite`. The raw
store never goes to a repository or GitHub. It leaves this Mac only in a
person's pack export, a person's **Share** of chosen proven lessons as
summaries (below), and the driver handoff export (§6.10), which includes
it (`lessons.export {raw: true}`).

| Field | Holds |
|---|---|
| `id` | `L-` and a short hash |
| `pattern` | stage, check kind (`test`, `lint`, `build`, `typecheck`, `format`, `other`), tool (a command's first word), traits |
| `finding`, `change` | summaries of at most 300 characters; change type and target |
| `outcome` | `untested`, `kept`, `undone` |
| `evidence` | task and run counts, metric, before and after |
| `context` | Avoozl version, model IDs, prompt and skill versions, check and tool names, traits, metric baseline |
| `confidence`, `confirmedAt`, `state`, `staleReason` | healing (below) |
| `source` | workspace random ID, or `pack:<plugin>@<version>` |
| `history` | each change with who or what made it and when |

Traits come from a fixed list so no free text leaks: up to 3 languages by
file count, build files present (such as `package.json` or `Cargo.toml`),
GitHub mode, and CI present. The retro reply gives each proposal a
`lesson` (`pattern`, `finding`) in general words. Validation refuses task
IDs, paths, issue and pull request numbers, repository names and URLs, and
the content rules run at the new `lesson` boundary, on write and again with
the reading workspace's rules on use. A refused lesson is not written, and
the proposal still stands.

A retro's brief gets up to 10 matching lessons (same stage and at least
one shared trait): `kept` first, then confidence, evidence count, and
date. Undone, retired and expired lessons go in a short "did not work"
list. `flow.lessons.share` and `flow.lessons.read` (default `true`) live in
`.avoozl.json` per workspace (not per repository), so a team can commit an
opt-out. Untested lessons expire
after `untestedDays` (90).

A plugin bundle may provide `lessons`: `avoozl-lessons.json` with
`version` and `lessons`, checked like a written lesson. Import follows the
pack flow (§4.14): `plugin.lessons.preview` reads only and
`plugin.lessons.import {previewHash}` is a person's act. `lessons.export`
writes the same shape to a file the person picks and is person-only.

#### Healing

Drift checks run at each retrospective and when a lesson is read:

| Trigger | Mark |
|---|---|
| A model in `context` is no longer listed (`GET /api/models`) or no longer used for that stage | `needs re-check` |
| A prompt or skill version in `context` changed | `needs re-check` |
| A check or tool it names is gone from every matching repository | `stale` |
| Matching repositories' traits changed | `needs re-check` |
| A newer PDCA result for the same pattern and change disagrees | `needs re-check`, confidence down |
| Not confirmed within `confirmDays` (180) | `stale` |

These marks need no approval, are recorded in `history`, and clear by
themselves when fresh runs confirm the lesson. A marked lesson is left out
of the citable list. Confidence starts at 0.5, becomes 0.8 when kept, rises
0.05 per confirming window to 0.95, and drops 0.2 on a disagreement; below
0.3 the lesson needs a re-check (shortcut: fixed steps, fit them to real
data after P42). A window confirms a lesson when its change is in effect in
a matching workspace and the metric stays within 10% of its after value.

Every `reviewEvery` retros (5), the retro also gets the store's marked and
similar lessons and may reply with `lessonEdits` (`rewrite`, `merge`,
`retire`), each a diff with evidence, shown in Proposals for a person. No
lesson is deleted.

Overrides heal too. At backend start, Avoozl compares each override's
shipped-section hash with the shipped text. When it changed, the override
is flagged, the Proposals view shows a three-way diff (old built-in, new
built-in, override), and Avoozl proposes a rebased override made with a
three-way merge. Until a person approves, sessions keep the override and
the Flow tab and Settings warn. Locked sections are never overridden, so
an upstream change to one always wins. A new lessons pack version marks
changed imported lessons `needs re-check` until it is imported, and
retires removed ones with that reason.

#### UI

The Flow tab gets **Overview** (today's content), **Proposals**, and
**Lessons** views.

```text
◔ Flow   Overview │ Proposals │ Lessons
┌ Proposal · retro 4 · prompt brief.worker § steps (v3f2a91c0+o1) ───────┐
│ - Run the checks.                                                       │
│ + Run the checks. Add a test for each changed branch before done.       │
│ evidence: 4.1#1, 4.2#2, 4.3#1 · first-pass rate 50% ↑ · cites L-7f3a     │
│                                                    [Reject] [Approve]   │
└────────────────────────────────────────────────────────────────────────┘
┌ Prompt versions ───────────────────────────────────────────────────────┐
│ brief.worker  +o2 since Nov 12  PDCA: helped        [Revert]            │
│ agent.retro   +o1  ⚠ built-in changed in 0.2.0 · rebase proposed        │
└────────────────────────────────────────────────────────────────────────┘
┌ Lessons  Filters: Pattern [ci-wait ▾] Outcome [all ▾] Source [all ▾]    │
│ L-7f3a  tests · npm · js  "Ask for a test per branch"  kept  0.85        │
│         confirmed Nov 10 · from another workspace        [History]       │
│ L-19c0  ci-wait · cargo   "Batch by files"  undone  did not work         │
│ L-a4e2  review · py       stale: check `lint` removed                    │
└────────────────────────────────────────────────────────────────────────┘
```

#### Sharing

Owner decision 2026-11-13 (R69.11–R69.15). The Lessons view ranks share
candidates: this workspace's own lessons that are `kept`, unmarked and not
read-only, by evidence count, then fit, then confidence. Fit counts the
other workspaces on this Mac whose traits (recorded in the store's meta at
each retro) share one of the lesson's traits.

| Step | Operation | Caller |
|---|---|---|
| Preview | `lessons.share.preview {ids}`: target repository, file, text, hash | Person (reads only) |
| Share | `lessons.share {ids, previewHash}` | Person only; 403 for sessions, MCP, app token, plugins |

The file is `.avoozl/lessons.json` in the pack shape (`version`,
`lessons`), merged by lesson ID with the file already on the base branch,
summaries only, checked at the `lesson` and `github` boundaries. Avoozl
writes it on a new branch `avoozl/lessons-<date>` in a temporary worktree
of the target checkout, commits, pushes and opens a pull request:

| Mode | Target |
|---|---|
| plans-repo | the planning repository |
| single-repo | the code repository |
| Local only | none; Share is off and the view says so |

When GitHub cannot be reached the commit stays on the branch and the
result names it. Another workspace imports the file like a plugin's
lessons pack.

Settings › Flow gets a **Lessons** sub-group: Share this workspace's
lessons (`flow.lessons.share`), Use lessons from other workspaces
(`flow.lessons.read`), Untested lessons expire after (days,
`flow.lessons.untestedDays`), Confirm within (days,
`flow.lessons.confirmDays`), and Review lessons every (retros,
`flow.lessons.reviewEvery`), all "(optional)" with defaults as
placeholders, and one line saying lessons stay on this computer.

#### Why each choice

| Choice | Why |
|---|---|
| Diffs against a hashed base | A stale proposal fails instead of overwriting a newer text |
| Locked sections, and briefs outrank skills | A speed review must not loosen what protects the owner |
| Overrides outside shipped files | An update stays clean, and revert is one step |
| Override per workspace | One workspace's evidence should not change another's prompts silently; lessons carry it as a proposal |
| Repo skill change as a leaf | It is code in someone's repository, so it gets checks and review |
| External skill as a note | Avoozl cannot edit a pinned plugin |
| Lessons on this Mac, summaries only | Cross-workspace reuse without moving one workspace's text into another |
| Share chosen proven lessons by pull request | A person decides what leaves; the repository's review sees it; raw contexts stay local |
| Undone and retired kept | Retros should not relearn what failed |
| Automatic marks, person edits | Marks are reversible; changing what a lesson says is a judgment |
| Keep the override until a rebase is approved | Dropping it silently would undo a proven change |

### 4.19 Activity log and Activity tab

Owner request 2026-11-13 (Requirement 71). One table of who did what, from
the page, the CLI, MCP, GitHub and plugin sync. It is the "activity log"
the driver export (§6.10) names.

```text
operations.execute ─▶ recordOperation ─┐
tick: snapshot before ─▶ steps ─▶ snapshot after ─▶ recordTickChanges ─┤
other code (provider switching) ─▶ recordActivity ─────────────────────┤
                                                                       ▼
                       validate ─▶ screen (secrets, paths, `activity` sets)
                                                                       │
                                     clean ─▶ row │ match ─▶ redacted row
                                                                       ▼
            activity_log ─▶ activity.list ─▶ Activity tab, plans_view activity
                         ◀─ pruneActivity on each tick (retentionDays)
```

#### Table

`activity_log(seq, at, source, actor, kind, summary, target_id, link,
redacted, key UNIQUE)` in the workspace's SQLite, indexed by `at`. `key`
is set only for rows the tick derives, so a change two ticks (or two
processes) see is written once (`INSERT OR IGNORE`). Sources are `local`,
`github`, `plugin` and `mcp`. Kinds are dotted names
(`/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/`, at most 64 characters), so a later
caller can add one without a schema change.

#### One helper

`recordActivity(store, {source, actor, kind, summary, targetId, link, key,
at})` in `src/app/activity-log.mjs`. It trims the summary to 200
characters, drops a target that is not a plain ID and a link that is not
`https:`, screens the row, and inserts it. A read-only store records
nothing. Bad input (an unknown source or kind) throws, so a caller's test
finds it. Every built-in caller wraps it so an action never fails because
its row could not be written.

#### Screening

Each of actor, summary, target and link is checked with
`secretReason` (builtin:published-secrets), the `PUBLISH_RULES` secret and
path patterns, and `check({boundary: "activity"})` against the content
rule sets. `activity` joins the boundary list and is not opt-in, so a set
with no `boundaries` list covers it. A finding or an unavailable set saves
the row redacted: time, source, kind, the summary "Redacted by content
rules", and null actor, target and link. No decision opens and no
notification is sent; the write it describes was already screened at its
own boundary. The matched text is never stored.

#### What is recorded

| Where | Kind | Summary (Avoozl's words, IDs only) |
|---|---|---|
| `task.start`, `run.start`, `session.request` | `dispatch` | Dispatched TASK |
| `task.update` to Deferred | `stop` | Stopped TASK (Deferred) |
| `flow.stop`, `flow.resume` | `andon.pull`, `andon.resume` | Pulled or resumed the Andon cord for SCOPE |
| `integration.merge`, `task.merge` | `merge` | Merged TASK, or merged duplicates into TASK |
| `plan.approve` | `approve` | Approved plan PLAN |
| `plan.archive`, `task.archive`, `run.archive` and their undo | `archive`, `unarchive` | Archived THING |
| `plan.delete`, `run.delete`, `report.delete` | `delete` | Deleted THING |
| settings updates (configuration, GitHub, flow, delivery, routing, crews, conversations, content-rule sets and terms, activity) | `settings.save` | Saved NAME settings |
| `plugin.approve` | `plugin.approve` | Approved plugin ID |
| `delivery.settings.update` with a model, `task.update` with an agent or model, `delivery.pickAgain` | `model.switch` | Writer model set to MODEL, and so on |
| GitHub verdicts | `github.pr-merged`, `github.close`, `github.close-held` | Closing pull request merged for TASK; ACTOR closed #N; the close is held |
| Project items | `github.board-deferred`, `github.board-resumed`, `github.board-ignored`, `github.release` | Board orders and ignored moves |
| Wave written back | `github.revert` | Wave on TASK written back |
| `github_issues` label events | `github.label` | ACTOR's label applied rule RULE (ACTION) on #N |
| incoming items | `intake.item` | New ITEM from SOURCE, source `github` or `plugin` |
| projection and tracker conflicts | `github.conflict`, `plugin.conflict` | FIELD on TASK was changed outside Avoozl |
| tracker verdicts | `plugin.close` | TASK closed in its tracker |

The tick's rows come from a diff of a small snapshot taken before and
after the tick (verdict states, Project item orders, label event IDs,
incoming item IDs and conflict fields), read with SQL where it can, so a
tick with no change parses no record. The Wave revert is recorded where it
is written, in `github-project.mjs`.

#### Retention, reads and the tab

`activity.retentionDays` (default 30, 1–365) is a `.avoozl.json` key,
read and saved by `activity.settings.get` and person-only
`activity.settings.update` from the Activity tab's Keep activity field. Each
`workspace.tick` calls `pruneActivity`. `activity.list {source, kind,
actor, limit ≤ 100, offset}` answers `{items, total, sources, kinds,
actors, retentionDays}` newest first, and is `plans_view` action
`activity`; the Dashboard's task timeline moves to action `recent`.

The Activity tab (icon `History`) uses `ViewHeading`, the shared
`FilterPanel` (Source, Kind, Actor), 100 rows per page with `ShowMore`,
and a row per entry: time, source, actor, summary, target. A task target
opens the drawer; a GitHub link opens with `target="_blank"
rel="noopener noreferrer"` through `safeHref`. A redacted row says so.

#### Why each choice

| Choice | Why |
|---|---|
| One table, one helper | Provider switching and later callers add rows without a new store |
| Avoozl writes every summary | Issue text and prompts never reach the log |
| Redact, not refuse | The row still shows something happened, without the text |
| Diff snapshots in the tick | One place sees every GitHub and plugin change without touching each step |
| `key` on derived rows | Two ticks, or two processes, record a change once |

### 4.20 Provider health and switching models

**Proposed**, owner request 2026-11-13 (Requirement 72). A rate limit or an
empty credit balance stalls every chat on that provider, and today a new
task still opens there. Avoozl already reads each session's usage turns and
tool rows (§4.11). This section reads health from them, keeps new work off an
out provider, and moves running chats with Kiro Crew's own model change.
Changed 2026-11-13 (owner decision, §4.10 One routing prompt): `out` is a
hard check, `low` is a fact the routing prompt weighs for new tasks only,
and the settings shrink to one low line and optional limits, shown in
Settings › Routing.

```text
GET /api/usage/turns ─▶ sums per provider and model in the window ─▶ limits?
GET /api/chat/slots/<slot> rows ─▶ error kind (usage_limit, 429 …)    │
                                                                       ▼
                     provider_health: ok │ low │ out  (+ a person's marks)
                         │                              │
   new task / retry ◀────┘                              └──▶ running chat on out
   out never offered; low is a                             POST /api/chat/slots/<slot>/model
   fact in the routing brief                               same session, next turn
                                                                 │
                                    provider_switches ◀──────────┘ ─▶ activity hook
                                    Needs you: "<provider> is out"
```

#### Facts

| ID | Fact | Where |
|---|---|---|
| F126 | **Verified from source, not called live.** `POST /api/chat/slots/{slot}/model` with `{model}` changes one chat's model in place (`session/set_model`) and answers `{ok, model}`; while a turn runs it answers `deferred: true` and applies the pick when that turn ends. An app may call it on a slot it owns: the slot checkpoint admits the owner app, and an app grant is a prefix match, so `/api/chat/slots/avoozl_*` already covers it. | Kiro Crew `dashboard/chat_api/slot_model.py` `api_chat_slot_model`, `dashboard/slot_ownership.py`, `dashboard/token_auth_app_scope.py` `_api_pattern_matches` |
| F127 | **Verified from source.** A failed turn leaves a row with role `error` and `meta.kind`, among them `usage_limit` (a spent plan allowance), `model_unavailable` (capacity or rollout refusal after the retry ladder) and `transient_retry`. Plain error rows have no kind, so Avoozl also reads a few words of the text, and stores only the kind. | Kiro Crew `dashboard/chat_utils_injected_rows.py`, `dashboard/chat_turn/recovery.py` `_terminal_error_meta` |
| F128 | **Verified from source.** `GET /api/models` lists `model_name`, `display_name` and `description`, with no provider. Providers therefore come from the model ID's first word. | Kiro Crew `dashboard/handlers/agents.py` `api_models` |

#### Settings

Machine-local, `~/.config/avoozl/config.json` key `providers`, because
limits and credits belong to that machine. `.avoozl.json` refuses the key
(tick and settings validation):

```json
{ "providers": { "lowPercent": 80, "limits": { "claude": { "credits": 500 }, "model-a": { "tokens": 2000000 } } } }
```

Both keys are optional. A limit key names a provider or a model; both are
checked. The usage window is 5 hours and an error mark's cooldown 30
minutes, both fixed. A model's provider is its ID's first word. The removed
`cooldownMinutes`, `windowHours`, `groups` and `fallback` keys are refused
with the migration's name.

#### Health

- **Record.** `provider_health` rows keyed `provider:<id>` or `model:<id>`:
  `level`, `source` (`usage`, `error`, `person`), `kind`, `since`,
  `lastErrorAt`, `until` (cooldown end), `to` (a person's replacement) and
  `by`. A row at `ok` is deleted, so an empty table means no change
  (R72.18).
- **Usage.** After each usage read the backend sums the window per key and
  writes or clears `usage` marks (R72.2). It never overrides a `person`
  mark and never lowers an `error` `out`.
- **Errors.** The backend's tool-row read for timing already fetches each
  local worker session's new rows; it also hands them to the health check,
  so no new request is made. Kind first, then the text's words (F127). The
  model is the session's served model, else its requested one; a session on
  `auto` marks nothing. `out of credits` marks the provider, since credits
  are an account's; a rate limit marks the model (R72.3).
- **Recovery.** On read, an `error` mark past `until` is dropped; a usage
  turn on the model after `lastErrorAt` drops it too (R72.4).
- **Facts, read live.** `providerFacts` gives one row per provider or model
  with usage, a limit or a mark: level, percent of its limit (else credits
  and tokens), why, and one line such as "claude: 85% used, low". Settings
  › Routing shows the rows; the routing brief carries the lines.

shortcut: errors are read from local worker sessions only (the rows the
timing read already has); reviewer, remote and Crew Mode errors are missed
until an app-scoped roster carries them. Their usage still counts.

#### New tasks and retries

An `out` model is a hard check (§4.10): it is never offered, and a
person's replacement for it is offered instead. A `low` model stays an
option; its line is in the routing brief, so the prompt decides ("Prefer
Kiro models when Claude is low"). With routing off, the delivery model is
the one choice: out takes the person's replacement, else the task waits.
A retry keeps its model unless it is `out` (R72.6). Preview shows what was
ruled out and why (R72.7).

#### Running chats

After the reads, the backend looks at each live session the tick opened.
Only `out` moves a running chat; `low` never does. On an `out` model it picks
a target (R72.9: the person's replacement, then the task's pinned model,
then the models Kiro Crew lists, the first `ok`, else `low`) and calls F126. The binding's
`model` becomes the target and its `switches` list gains `{from, to, at,
by}`; the session, worktree and branch stay, so committed work is kept and
the next turn runs on the new model (R72.8). A refusal is recorded on the
binding and not retried for that model. The served-model gate reads
`switches`: a chat Avoozl switched is judged by all its models (R72.11).

#### Manual switch

- `provider.switch.preview {from, to}` (observe): `from` is `{provider}`,
  `{model}` or `{tasks: [...]}`. It lists the live chats it would move and
  the ones it would skip with why (a reviewer whose writer runs on `to`),
  and a hash of that list.
- `provider.switch {from, to, alsoNewTasks, previewHash}` (person-only): 409
  when the hash no longer matches; else it queues one `pending` switch per
  chat (by the person) and, with `alsoNewTasks`, writes `person` marks with
  `to` as the replacement. The backend applies pending switches on its next
  pass, the same way as automatic ones (R72.14).
- `provider.health.clear {id}` (person-only) undoes a mark.
- `providers.view` (observe) gives settings, marks with levels, the last 50
  switches and the live chats with their models.
- `providers.settings.update {providers, expectedHash}` (person-only).

#### Activity hook

`provider-health.mjs` calls `onSwitchRecorded(store, entry)` once per
finished switch record. It writes one activity row (§4.19) of kind
`model.switch`, source `local`, actor `avoozl` or the person, the task as
target, and the key `provider-switch:<id>` so a record is logged once. A
row that cannot be written never loses the record in `provider_switches`
(R72.10). `provider.switch`, `provider.health.clear` and
`providers.settings.update` are recorded as local actions too.

#### Page

- **Switch model** in the Dashboard header and on the In flight card opens
  one dialog: From (Provider, Model, or Tasks with a checkbox per running
  task), To (models from `GET /api/models`), Also new tasks, the preview
  list, and Switch. Health marks show above with Undo for a person's.
- **Needs you** lists `out` marks from `conflicts.view` kind `provider-out`
  (R72.16).
- **Settings › Routing › Providers** shows each provider's health and usage
  and edits `lowPercent` and a credits limit per provider (R72.17). There is
  no separate Providers tab.

#### Why each choice

| Choice | Why |
|---|---|
| Kiro Crew's model change, not a new session | The chat keeps its context, worktree and commits, and Kiro Crew waits for the turn to end |
| Health from reads Avoozl already makes | No new request and no new grant |
| Store the kind, not the text | Error text can hold prompts or paths |
| Credits mark the provider, rate limits the model | Credits are an account's; a limit is often one model's |
| Person marks stay until undone | The owner said so; a timer would undo a decision |
| Settings on this machine | Limits and reachable models differ per machine |

### 4.21 Investigate before coding

Added 2026-11-13 (Requirement 75). A leaf's first turn is findings, not
code; a falsifier tries to break them; a gate decides.

```text
dispatch ─▶ worker: findings + confidence (no edits)
              ─▶ falsifier (read-only, other model): stands | refuted + confidence
                   ├─ both ≥ minConfidence and stands ─▶ worker: go ahead
                   └─ else ─▶ Needs you: Go ahead | Investigate again | Stop
```

| Setting | Values | Default |
|---|---|---|
| `delivery.investigate.mode` | `all`, `not-small`, `off` | `not-small` |
| `delivery.investigate.minConfidence` | `medium`, `high` | `high` |
| Manifest `investigate` | `true`, `false` | from the mode |

The falsifier is role `falsifier`, chosen like a review role (§4.10) with
`distinctFrom: model`. Its brief quotes the findings as untrusted data. One
round per press of Investigate again; the attempt does not spend a retry.

### 4.22 Evidence bundle

Added 2026-11-13 (Requirement 76). One bundle per task under
`.avoozl/local/evidence/<task-id>/`: `bundle.json` (entries with kind,
time, source and text) and attached files. Kinds: `findings`, `falsifier`,
`decision`, `review`, `check`, `file`. Every entry passes the content rules
and the secret screen first; a blocked entry is saved redacted. The drawer
reads it through `task.evidence`. On GitHub one comment per pull request,
found again by its marker, holds the text summary and is updated in place.

### 4.23 Bringing pull requests up to date

Added 2026-11-13 (Requirement 77). The tick remembers each base branch
head. When it moves, it reads `mergeable` and `mergeStateStatus` of the open
pull requests its writers opened and, for `CONFLICTING` or `BEHIND` (when up
to date is required), sends one pull request feedback message of kind
`base-moved`: merge the base branch in, fix, check, push; never force push.
Avoozl refuses to send a brief or message that holds `--force`,
`--force-with-lease` or `push -f`.

### 4.24 Rules from repeated corrections

Added 2026-11-13 (Requirement 78). `corrections` rows {id, taskId, by,
kind, summary, at}. The retro groups them by meaning (model) and needs two
tasks per group to propose a rule. Approval makes one leaf, source `retro`,
that edits `.kiro/steering/avoozl-rules.md`; it reaches the repository by
the usual review and checks. PDCA watches the group after the rule lands.

### 4.25 Ship mode

Added 2026-11-13 (Requirement 80).

| `delivery.ship` | Writer | Avoozl | Person |
|---|---|---|---|
| `auto-merge` (default) | enables auto-merge | waits for the merge | nothing |
| `manual` | does not enable auto-merge | Needs you: Ready to merge, when checks and reviews pass | merges on GitHub, or presses Integrate in Local only |

## 5. Local workflow

**Proposed.** From one large goal to integrated commits, with no GitHub.

| Step | Owner | What happens | Stops for a person when |
|---|---|---|---|
| 1. Enter goal | User in Kiro Crew chat, or **Plan a goal** in the Avoozl page (opens a draft chat) | The `avoozl` skill captures the goal and the workspace | Never |
| 2. Draft graph | `avoozl-planner` session | Writes one Kiro spec folder `.kiro/specs/<name>/` in the planning repository (§6.8): `requirements.md` (or `bugfix.md`), `design.md`, `tasks.md` with one ID per item, and `avoozl/manifest.json` with kinds, repositories, edges, checks, and completion | Never |
| 3. Critique | A second `avoozl-planner` session with no access to the first one's transcript | Writes `avoozl/critique.md` in the same folder: missing acceptance, unbounded leaves, wrong edges, open decisions | Never |
| 4. Validate | Avoozl core (spec reader, `lintPlan`, cycle check) | Deterministic pass or fail with file and line numbers (§6.8) | Validation fails twice |
| 5. Approve | User in the Plans view | Approves the exact revision hash; stable IDs freeze | Always (Requirement 4.8) |
| 6. Ready | Tick | Computes ready leaves | |
| 7. Dispatch | Crew Mode conductor (preferred, §5.1); tick and script cron as fallback | The conductor asks Avoozl for ready leaves and opens one worker session per leaf, up to capacity; the fallback opens `kirocrew-worker` sessions from the tick. The brief names the task ID, acceptance, checks, and the worktree tool | |
| 8. Work | Worker session | Calls `plans_prepare_worktree` (branch `avoozl/<task-id>`), implements, commits, reports `done` with the commit SHA through `plans_report` | Worker reports `question` |
| 9. Complex leaf | Worker session | May call `task_run` on a spec it writes for the leaf; Task Runner steps stay inside that run (F5, F6) | |
| 10. Verify | Tick queues a check run that Avoozl makes itself (an `avoozl-verifier` session only for a bar that needs judgment), plus one session per review role when the repository names any (§5.2) | Runs the leaf's declared checks as argv on the exact SHA in a clean worktree and records exit codes and output tails; review roles report verdicts and findings on the same SHA | Checks fail after the retry bound |
| 11. Integrate | Tick (`integrateRun`) | Rebases and merges into the local integration branch | Rebase conflict the worker cannot resolve |
| 12. Release | Tick | Recomputes readiness; dispatches newly ready leaves | |
| 13. Close parent | Tick | Marks packages and the epic done when all required children are done; whole-head acceptance stays a separate, explicit action | Whole-head acceptance |

Notes:

- **Parallel leaves.** Crew Mode is the preferred local runner (§5.1): its
  conductor runs each round's ready leaves as worker sessions and reports
  bindings and results to Avoozl. Opening one worker session per leaf from the
  script cron remains the fallback.
- **Integration branch.** Defaults to the repository's `baseBranch` in the
  registered checkout, as today (F34). A repository may name a separate
  `integrationBranch` to keep the user's checkout untouched.
- **Failure.** A worker that reports `blocked`, errors, or whose session closes
  without a report moves its leaf to `failed` with evidence. The next tick
  retries by opening a new session with a resume brief on the same worktree,
  up to `retries` (default 2), then opens a decision. A session that is merely
  quiet is nudged with `send_to_session`; it is never replaced only because time
  passed (Requirement 8.2).
- **Restart.** After a gateway restart the first tick observes every bound
  session before dispatching anything (Requirement 8.3, 26.12).

### 5.1 Crew Mode spike result (2026-11-11)

**Verified.** A Crew Mode conductor delivered a four-task Avoozl graph
(`slug`, `clamp`; `post-url` requires `slug`; `page-url` requires `post-url` and
`clamp`) in a toy repository, driven only by a steering file and the Avoozl CLI:

- rounds followed readiness: {slug, clamp}, then {post-url, clamp retry}, then
  {page-url}; no task ran before its blockers were accepted;
- one worker session per task; the conductor wrote each session ID and merged
  commit onto the task's notes;
- a deliberately failed `clamp` went back to `planned` and passed on retry 1
  without breaking order;
- the conductor merged each accepted branch into `main` and ran the tests there.

**Limits found.**

- Ordering and session binding hold only because the conductor follows the
  steering file. Nothing enforces them in code, and the binding is a note, not a
  structured field. MC-5 is worked around, not solved.
- A task marked `partial` still appears in `ready:true` results. The steering file
  had to tell the conductor to skip tasks it already started. Avoozl must exclude
  claimed tasks from readiness (or add a claim operation).
- The conductor cannot load the Avoozl MCP server (`includeMcpJson` is false), so
  the integration path is the CLI through `execute_bash`.

**CLI correction.** The CLI writes the local SQLite file directly whenever that
file exists and no server URL is set (`localOrRequest`); it calls the workspace
server only when one is configured, and some commands use `request` only. While a
workspace server runs, a direct CLI write is a second writer. §4.5's tick and any
CLI path the conductor uses must go through one writer: either the app backend
or the CLI with the server stopped.

**Design consequence (Proposed).** Crew Mode becomes the preferred local runner:
the conductor asks Avoozl for ready leaves each round and reports results back.
Avoozl keeps the graph, readiness, verification rules, and GitHub. The script
cron of §4.6 stays for GitHub work and as the local fallback. Task 1.4 and proof
P2 are still needed for GitHub; a new proof P2b repeats this spike against the
real app backend with claim-aware readiness and a structured session binding.

### 5.2 Review gates on a local delivery

**Proposed**, from an owner handoff of 2026-11-12 (Requirements 36–39). The
handoff was written to run a multi-step rewrite flow in another repository
as normal Avoozl tasks: one writer, two independent reviews of the writer's
exact commit, rework when a review asks for changes, and nothing downstream
until both approve. Its survey of the code read an older branch; the facts
below read `kirocrew-native` at `dd8b28b`.

#### Current-code facts

| # | Fact | Evidence |
|---|---|---|
| F56 | **Verified.** A worker's `done` report queues one check run that Avoozl makes itself on the leaf's declared checks (else the repository's) in a detached worktree at the reported commit; an `avoozl-verifier` session opens only for a bar that needs judgment (§5.2 Checks in code). `verdictCause` refuses a report for another commit, a declared check missing from the report, and a non-zero exit. | `src/app/delivery.mjs` `planVerifierDispatches`, `planCheckRuns`, `verifierBrief`, `verdictCause`; `src/app/check-runs.mjs` |
| F57 | **Verified.** A rejected verdict marks the worker's attempt failed; the retry path opens a new worker attempt on the same worktree with the earlier cause quoted as data, up to `retries`, then a decision. A blocked or quiet verifier fails only the verification and is retried. Attempts and verifications stay on the `task_deliveries` row. | `delivery.mjs` `reconcileVerifications`, `reconcileDeliveries`, `workerBrief` |
| F58 | **Verified.** Only a `verified` delivery is integrated, and a local leaf's `integrated` completion is reached from `task.integration.commit`, so dependents already wait for the verifier and integration. | `delivery.mjs` `integrateVerified`; `src/work-model.mjs` `completionReached`; `src/query.mjs` `ready` |
| F59 | **Verified.** Per-repository and workspace concurrency count only live worker attempts; verifier sessions do not count. The default workspace concurrency is 1. | `delivery.mjs` `readyLeaves`, `DELIVERY_DEFAULTS` |
| F60 | **Verified.** `task.update` accepts a typed `integration` receipt (commit, time, branch, repository, evidence strings) and sets `task.integration`, which meets `integrated` completion with no verifier and no merge. It also sets `status` directly, including `accepted`, and `checks`. | `src/app/operations.mjs` `task.update` |
| F61 | **Verified.** `task.accept` takes typed `evidence`, or derives it with `acceptanceFromValidation`, which reads the first-listed commit's command records and does not check that every declared check ran. `componentOnly` accepts with no integration. | `operations.mjs` `acceptanceFromValidation`, `task.accept` |
| F62 | **Verified.** `validateRun` records `exitCode: null` when a command cannot start and stops at the first failure. A verifier report needs an integer exit code for each check; a check it leaves out is a rejection, which fails the worker's attempt. | `src/app/git.mjs` `commandEvidence`, `validateUnlocked`; `delivery.mjs` `checkResults`, `reconcileVerifications` |
| F63 | **Verified.** `integrateRun` rebases the branch onto the integration branch and reruns the repository's checks, so the integrated commit can differ from the verified one. | `git.mjs` `integrateRun` |
| F64 | **Verified.** Plan approval deletes and rebuilds each task's incoming edges that carry the plan's `planId`. | `src/app/plans.mjs` approval |
| F65 | **Verified.** The verifier agent's model is `auto`; session bindings record no model; `tick.py` calls `open_session` without the `model` argument F31 lists. Whether Kiro Crew reports the model a session actually ran on is **Inferred** not available. | `kirocrew-app/agents/avoozl-verifier.json`; `src/app/session-bindings.mjs`; `kirocrew-app/crons/tick.py` |
| F66 | **Verified.** Task rows already use `acceptance` (criteria text) and `distinctFrom` (duplicate-review reasons). A new task flag cannot reuse either name. | `delivery.mjs` `workerBrief`; `operations.mjs` `task.update` |

So the handoff's two main gaps are already closed on this branch: review
runs at the writer's exact commit before integration (F56), and nothing
needs a fake integration record because a verifier is a role on the writer's
own delivery, not a task (F58). What is missing is more than one role,
reviewer independence, findings, not-run checks, and closing the typed
paths around the gate (F60, F61).

#### Policy

Review roles extend the `delivery` block of `.avoozl.json`. A repository
entry may replace the workspace's list.

```json
{
  "delivery": {
    "concurrency": 1,
    "model": "model-a",
    "reviewers": [
      { "id": "conventions", "focus": "language and repository conventions",
        "agent": "avoozl-reviewer", "model": "model-b" },
      { "id": "correctness", "focus": "correctness and performance",
        "agent": "avoozl-reviewer", "model": "model-c" }
    ],
    "repositories": {
      "example-rewrite": { "concurrency": 1 }
    }
  }
}
```

- `model` is the writer's model. The tick passes it to `open_session` for
  worker sessions it opens, and a Crew Mode conductor names it when it claims
  a task (`runner.claim`). Each binding records the model it was opened on.
- Each reviewer has `id`, `focus`, `agent`, `model`, and `distinctFrom`
  (`model`, the default, or `session`). Validation refuses a duplicate `id`,
  an empty `focus`, and, for `distinctFrom: model`, a missing or `auto` model
  on either side or a reviewer model equal to the writer's.
- The checks role is always present, with id `checks`. Avoozl runs it
  itself (Checks in code, below); a verifier chat holds it only for a bar
  that needs judgment.

#### Checks in code

The checks role makes no model call when the bar is commands. Owner
decision 2026-11-13.

- **Queue.** The tick queues one `check-run` record (in `flow_records`)
  per reported commit, after fetching remote hand-back branches, so a
  remote commit is checked here too. The app backend drain runs the queue
  off the tick's path: per repository, oldest first, one at a time, under
  a work lock. Nothing starts while all agents are stopped, and a commit a
  stopped line holds is not queued until the line is green. A run left
  `running` by a process that is gone goes back in the queue.
- **Run.** A clean detached worktree at the exact reported commit. Each
  declared check (`task.checks`, else the repository's `checks`) runs as
  argv with no shell, with its own time limit (20 minutes), and records
  its exit code and the last lines of its output, redacted by the content
  rules and with the worktree path removed. The worktree is removed
  afterwards. If HEAD is not the reported commit, nothing runs.
- **Verdict.** The next tick judges the run with the same `verdictCause`
  rules as a verifier's report. A check not run, exit 126 or 127, or a
  timeout fails the checking, which is retried, not the writer's attempt.
  A non-zero exit fails the writer's attempt; the tail is kept beside
  that check on the verification. A run for an older commit judges nothing.
- **Receipts.** The verification keeps role id `checks` and the same entry
  shape (`command`, `exitCode`, `durationMs`), so receipts and gates read
  the same. Flow timing records the run as stage `checks`.
- **Judgment.** A verifier session on `avoozl-verifier` opens only when
  the task says `verify: "agent"`, or its acceptance is prose with no
  declared check. Its report carries a `verdict` like a reviewer's.

#### Flow

1. A worker reports `done` with commit C. The delivery opens round C.
2. The tick starts every role for round C at once: it queues the checks
   run (or opens the verifier when the bar needs judgment), and opens each
   review role on its agent and model. At
   dispatch it compares the reviewer's model with the model recorded on the
   writer attempt's binding; if either is unknown, it opens a decision
   instead (Requirement 36.4).
3. A review brief names the task, its acceptance and checks, commit C, the
   role's focus, and the role's open findings from earlier rounds, quoted as
   data. It names no other role's verdict. The reviewer adds a detached
   worktree at C, reads, and edits nothing.
4. A reviewer reports through `plans_report` kind `done` with `commit`,
   `verdict`, `findings`, and `closures`:

   ```json
   { "taskId": "rw.3", "kind": "done", "commit": "<C>",
     "verdict": "changes-requested",
     "findings": [ { "id": "F1", "kind": "defect", "paths": ["src/x.py"],
                     "text": "..." } ],
     "closures": [ { "finding": "2:correctness:F2", "state": "fixed",
                     "note": "..." } ] }
   ```

   `plans_report` refuses, so the reviewer can correct it in the same
   session: a commit other than C; a finding with no path; `approved` with a
   defect listed or left open; `changes-requested` with no defect; an open
   finding with no closure; a closure that fails the changed-files check.
5. Verdicts are stored on the delivery as `verifications` entries, which
   gain `role`, `model`, `verdict`, `findings`, and `closures`. Every entry
   names its round's commit, so an entry for an older commit is stale and
   counts for nothing.
6. When the checks role and every review role have approved round C, the
   delivery is `verified`. Integration fast-forwards C. If the base moved,
   Avoozl rebases in the task's worktree and, when the head is no longer C,
   opens round C' instead of merging (Requirement 36.9).
7. Any `changes-requested` fails the writer attempt whose commit is C, with
   the findings as its cause; the existing retry path (F57) starts a new
   attempt, whose brief quotes every open finding. Roles still running on C
   finish, and their verdicts stay as history.
8. A checks session that reports a not-run check, or leaves one out, fails
   only that session (F62 changes here), and the checks role is retried.

**Open findings and closure.** A role's open findings are the findings of
its own earlier verdicts on this delivery that no later closure closed.
Finding references are `<attempt>:<role>:<id>`. For each closure Avoozl
compares the finding's paths between the earlier subject E and the current
subject C, using the task's own diff, not the base's: a path changed when
`git diff <merge-base(E)> E -- <path> | git patch-id --stable` differs from
the same for C. `fixed` needs at least one changed path, `unchanged` none. A
defect closed `unchanged` stays open. A person retrying a stopped delivery
(`plans_retry_delivery`) may dismiss findings by reference with a reason.

**Not run.** A checks report entry may be `{command, exitCode: null,
notRun: "<reason>"}`. Avoozl reads `notRun`, a null exit code, 126, 127, and
a declared check missing from the report as not run (Requirement 38.1).
`validateRun` evidence with `exitCode: null` already fails; acceptance now
also needs every declared check present at the current commit.

**`acceptFrom: "validation"`.** A manifest field on a leaf, linted like
`completion`. It changes `task.accept` and `task.update` as Requirement 38.4
says. A leaf whose repository has review roles gets the same `task.update`
refusals (Requirement 36.11) whether or not it sets the flag. The
multi-step rewrite flow sets it on each writer leaf and lists that
repository's validation script as a declared check, so the checks role runs
it on the exact commit and acceptance can only come from its pass.

**Supersede by hand.** `task.supersede` (`avoozl task supersede`,
`plans_supersede_task`) takes `{id, create}` and, in one transaction,
creates the new task, copying the old task's `requires` and `sequence`
edges unless `create.requires` is given, sets `supersedes` and
`supersededBy`, and sets the old task to `superseded` (a new status,
`complete: false`, hidden by default). The ready rule resolves each edge's
`from` through `supersededBy` to the newest task before it checks completion
or decisions. Plan approval leaves the chain alone.

**GitHub pull-request reviews follow branch rules (2026-11-12).** Avoozl
reads the base branch's rulesets and classic protection; their required
approving review count is the count a GitHub-route leaf needs on its head
SHA, and with no such rule reviews are not read. Settings shows the rule,
read only. The `pullRequestReviews` key is deprecated. The original note:
**Later: GitHub pull-request reviews.** For GitHub-route leaves, branch
protection's required reviews already gate the merge. A later task may read
pull-request reviews on the head SHA as verdicts (`APPROVED`,
`CHANGES_REQUESTED`) from reviewers the repository policy allows, stale when
the head moves. It is not part of the first cut (Requirement 36.13).

#### Why each choice

| Choice | Why |
|---|---|
| Reviews are roles on one delivery, not review tasks in the graph | A delivery already ties a verifier to the writer's exact commit, retries, and holds history (F56, F57). Review tasks would need integration-free acceptance, a fake integration record, supersede chains for every rework, and edges from every dependent to every review. Roles need none of that, and the graph stays the user's plan |
| No dedicated task kind for reviews | Same reason: a review has no repository change, no completion level, and no dependents of its own |
| `distinctFrom: model` is the default | Rule 2 forbids a reviewer sharing the writer's model. A new session alone is already guaranteed; the model is what reviewers would share otherwise |
| Unknown model shuts the gate | Kiro Crew does not report the model a session ran on (F65), so Avoozl relies on the model it asked for. When it did not ask (`auto`, or a conductor that names none) it cannot prove the rule and asks a person |
| Split focus | Two reviewers with one focus each catch more than two reviewers skimming everything. The focus is text in policy so each repository picks its own |
| Verdicts name their commit; a moved head makes them stale | Rule 3: the review judges what merges. Comparing the stored commit is enough; no timer or invalidation step is needed |
| Re-review after a rebase that changes the commit | A rebase can change behavior. With one writer per repository the base rarely moves, so the extra round is rare |
| Rework is a new attempt, not a superseded task | The retry path already keeps the worktree, quotes the cause, bounds retries, and keeps history (F57). Superseding for each rework would grow the graph and need edge tricks |
| Closure checked in Avoozl, domain rules in the repository's script | The fixed-or-unchanged check is generic: paths and diffs. What a rewrite run must contain is that repository's business, so its validation script runs as a declared check, and Avoozl gains only `acceptFrom` |
| Task's own diff via patch-id | A plain diff between two commits also shows base changes after a rebase, which would let `fixed` pass on someone else's edit |
| Not-run fails the checking session, not the writer | A missing tool is not the writer's fault; today it costs a worker retry (F62). It still never passes |
| `acceptFrom`, not `acceptance` | `acceptance` already holds criteria text on every task (F66) |
| Typed integration refused where reviews or `acceptFrom` apply | `task.update` can set `integration` or `accepted` directly (F60), which would skip every gate this section adds |
| Supersede resolves on read | Plan approval rebuilds plan edges (F64), so a rewritten edge would snap back on the next approval |
| Supersede only for local authority | GitHub and plugin rows are caches of their tracker (Requirement 19.3) |
| One writer per repository is concurrency 1 | It already exists per repository and caps both the tick and a Crew Mode conductor (F59). A second mechanism would only drift from it |
| GitHub pull-request reviews later | GitHub already gates GitHub-route merges with required reviews; reading them into Avoozl is useful only for display and the Delivery view |

## 6. GitHub workflows

### 6.1 Design-first

**Proposed.** The plan layout is §6.8; this section is the flow.

1. The user writes requirements (or a bugfix analysis) and design in Kiro or
   Spec Builder (F7, F47). Both write a Kiro spec folder. Repository steering
   asks for an ID on every `tasks.md` item (§6.8).
2. In the Avoozl Plans view the user picks the spec folder and presses
   **Prepare delivery**. Avoozl reads the files from disk (MC-7 interim).
3. An `avoozl-planner` session writes `avoozl/manifest.json` in the folder:
   for every `tasks.md` ID, its kind, repository, edges, checks, completion,
   and source references (file and heading).
4. A critique session compares manifest and prose and lists uncovered
   requirements and unsourced tasks.
5. Deterministic validation checks schema, references, cycles, repository
   registration, and label policy.
6. The user commits the manifest through a normal review (pull request or local
   commit). Approval is the reviewed commit, pinned with policy commit and
   compiler digest.
7. **Preview** lists every issue create and update, sub-issue link, dependency
   edge, and label change, per repository.
8. **Apply** runs projection (§6.3) inside the next tick. Ready labels go last.
9. In single-repo mode, Issue Radar crews scoped to the ready label implement
   leaves (§6.4); in plans-repo mode, Avoozl worker sessions do (§6.6).
10. Completion and release follow §6.5.

Spec Builder's own **Approve tasks** handoff starts one execution session for
the whole checklist (F7), and Kiro's **Run all Tasks** runs `tasks.md` in its
own waves (F47). For Avoozl-delivered specs the user uses neither. Avoozl
shows that warning on the spec's card.

### 6.2 Issue-first

**Proposed.** Driven only by labels and assignees on GitHub (Requirement 27).

```text
label added ─▶ tick: rule match? actor allowed? snapshot frozen?
                 │
     ┌───────────┼───────────────────────────┐
  respond      deliver                      pause / quarantine
     │           │                               │
 add responding  planner session classifies    remove ready, stop dispatch
 open responder     │
 session        bounded ─────────────┐    broad ──────────────────────────┐
 reply via      keep issue as leaf   │    child graph drafted + critiqued │
 plans_post_    add ready when       │    preview on the issue (comment)  │
 reply          blockers done        │    approval: re-label or auto rule │
 remove label        │               │    create sub-issues + edges       │
                     ▼               │    children follow "bounded" path  │
            Issue Radar crew claims, PR, CI, review, merge                │
                     ▼                                                    │
            tick verifies completion ─▶ releases dependents ─▶ closes parent
```

- **Snapshot.** Planning reads only the frozen body; a later body edit
  quarantines the issue until a new trigger event (existing behavior, kept).
- **Classify.** The planner answers one question with a reason: is this one
  bounded leaf in one repository with observable acceptance? The answer is a
  `plans_report`; Avoozl records it as evidence.
- **Broad issue approval.** With `autoPublishChildren: false` the planner posts a
  preview comment through `plans_post_reply`, adds the `decision` label, and
  waits; an allowed actor re-applies the trigger label to approve that exact
  preview hash. With `true`, children publish after deterministic validation
  passes and no decision is open (Requirement 9).
- **Children.** The planner writes the child graph as a Kiro spec folder like
  any plan (§6.8). Children are created as GitHub sub-issues of the source
  issue, with issue dependencies between them, managed markers, and inherited
  assignees. The source issue stays open as the parent. In plans-repo mode the
  source issue must itself be in the planning repository; an issue filed in a
  code repository is copied into a new planning issue, and Avoozl links back
  only by a comment on the planning side.
- **Respond.** One responder session per snapshot; at most one reply; the
  `responding` label is removed when the session reports or fails.

### 6.3 Projection order

**Verified** in today's code: readiness removed first, edges reconciled, state
re-read, ready added last (F11). **Proposed** additions:

1. Compute the full desired graph for the namespace.
2. Remove the ready label from every leaf that is blocked, conflicted, or about
   to change.
3. Create or update issues; reuse any issue whose marker matches, open or
   closed (fixes F12). A closed issue for an unfinished task is not a
   failure: §6.5 judges it (an allowed closer's order, otherwise a decision).
   Changed 2026-11-12: it was always a conflict. Epics get the configured `epicIssueType` when the owner has it
   (F44); otherwise no type, and Settings says so once.
4. Reconcile sub-issue links, then issue dependencies for `requires` and
   `sequence` edges (F37–F39). Completion levels and `supports` edges go only
   into the marker (§3.4).
5. Re-read issues, links, and edges; compare with desired values.
6. Add the ready label only to leaves that are ready and unclaimed.
7. Record new `applied` hashes in each marker.

**Done tasks** (R74, owner decision 2026-11-13). Step 1 leaves out a task
that is already done and has no issue yet, unless `github.issues.includeDone`
is `true` (default `false`). Such a task gets no issue, no Project card and no
sub-issue link, and an edge from it counts as met with no blocked-by link. The
plan issue and the epic issue are still made, even when every task is done.
An open task under a skipped package sits under the plan issue. A task that
already has an issue keeps it. A done task that opens again gets its issue on
the next projection. The preview lists the skipped tasks as `skippedDone`.

| Setting | Values | Default |
|---|---|---|
| `github.issues.includeDone` | `true` or `false` | `false`: only open tasks get issues |

One namespace has one writer: projection runs only inside the tick under the
workspace lock, and only the workspace whose policy names itself the
namespace owner may write. Other workspaces preview only.

### 6.4 Issue Radar handoff

**Proposed**, within verified limits (F4, F23, F24). Single-repo mode only;
plans-repo leaves use §6.6.

- The user configures one Issue Radar crew per repository route with scope label
  equal to Avoozl's `ready` label. The Settings view shows the exact value and a
  link to Issue Radar.
- Avoozl limits how many leaves carry `ready` at once to the repository's
  `concurrency`, so Issue Radar's random pick only ever sees allowed work, in
  priority order.
- Avoozl never writes Issue Radar's claim label or its needs-human label. It
  reads them as GitHub labels.
- A leaf with a crew claim label but no `ready` label is **stale claimed work**:
  Avoozl adds `stale`, raises a decision, and does nothing else.
- A leaf with the crew's needs-human label opens a decision and blocks its
  dependents (Requirement 27.11).
- Working beside crews (Requirement 52.7–52.10, added 2026-11-13). Crews act
  with the owner's `gh` login, so Avoozl cannot tell a crew's label or close
  from the owner's by actor. It tells them by label instead: a close on an
  issue carrying the claim label is held unless a closing pull request
  merged (this overrides the allowed-close order of §6.5 for claimed
  issues); a `labeled` or `unlabeled` event on a crew label never triggers
  a rule, and a rule may not name one as a positive label; the ready label
  comes off a leaf that is blocked again, including by a reopened blocker.

### 6.5 Completion and release

**Verified** check exists (F13); **Proposed** wiring, changed 2026-11-12 so
GitHub closes every leaf issue (Requirement 33):

- **Linking.** In single-repo mode the pull request says `Closes #N`, or
  comes from a linked branch. In plans-repo mode Avoozl creates the linked
  branch `avoozl/<task-id>` at dispatch (§6.6), and GitHub links the pull
  request to the planning issue (a `connected` event, F51). Avoozl does not
  match pull requests by branch name.
- **Who closes.** GitHub, in both modes, when the pull request merges into
  the default branch (F43, F51). Avoozl never closes a leaf issue.
- **Rule.** A leaf is complete when GitHub reports its issue closed as
  `COMPLETED`, `closedByPullRequestsReferences` holds exactly one pull
  request, that pull request is merged, lives in the leaf's code repository,
  targets `baseBranch`, and every check in the policy's `requiredChecks`
  passed on its head SHA (Requirement 16.1). `requiredChecks` may be empty
  where branch protection already requires the checks at merge. Today's
  check already reads `closedByPullRequestsReferences` and verifies state,
  base, and checks; the change is to accept a closer in the leaf's registered
  code repository instead of only the issue's repository, and to read checks
  there. `closingIssuesReferences` is not used, because it can be empty
  until merge (F52).
- **Base branch.** GitHub closes only from merges into the default branch.
  Validation refuses a non-default `baseBranch` for github tasks (§4.4).
- **Merged but open.** A pull request on the task's linked branch (or one
  naming `Closes #N`) that merged and passed while the issue stays open opens
  a decision. Avoozl does not close the issue for it.
- **Closed without code** (changed 2026-11-12, Requirement 33.8). An issue
  closed with no merged pull request as closer, as `COMPLETED` or
  `NOT_PLANNED`, is never a verified completion. Two ways reach it: a
  person closes it, or a person drags the card to Done and the Auto-close
  issue workflow closes it. The tick reads the issue's latest `ClosedEvent`
  (`actor`, `stateReason`, `createdAt`) and runs the trigger-label actor
  check (`allowedActors` or `minimumPermission`, §4.4; the code
  repository's policy for a plans-repo leaf).
  - **Allowed closer: an order.** The task becomes done by order. The tick
    records the order in the SQLite receipt and in the marker's `order`
    field (§3.4), releases dependents, and recomputes readiness in the same
    tick. It starts no new session for the task and leaves a running one
    alone. The order satisfies every completion level on a `requires` edge,
    including `merged-pr` and `integrated`, so a dependent can start on code
    that never merged. The owner accepts that risk. The Delivery view shows
    "Closed without merged code by <actor>" beside the task.
  - **Not allowed, or no readable closer: held.** Dependents stay held even
    though GitHub shows them unblocked, and Avoozl opens a decision. It does
    not reopen the issue. Resolving the decision as "accept" records the
    owner as the order's actor.
  - **Closer through Auto-close.** **Inferred (owner-stated):** the close
    event's actor is the person who dragged the card. P11 checks it. If
    GitHub names `@github-project-automation` instead, the tick reads the
    Status change's actor from the item's change record, as for Deferred
    (§6.7); if neither names a person, the close is held.
  - **Dependent briefs.** Each released dependent's brief says the blocker
    closed without merged code, by whom, when, and why, and tells the worker
    to check for the missing code first. It links the blocker issue, except
    in plans-repo mode, where it names the blocker by task ID and title only
    (§6.6 rule 2). An Issue Radar leaf gets no Avoozl brief, so the same note
    goes in its managed body section (§6.4).
- **Reopened** (added 2026-11-12, Requirement 33.10). A reopened leaf loses
  its done state, verified or by order, on the next tick, and the marker's
  `order` is removed. Dependents that have not started wait again; running
  sessions are left alone, and a dependent already done stays done. This is
  the rule the MCP view spike asked for (§8.1).
- Each tick runs the completion check for GitHub leaves that GitHub closed
  since the last verdict. A verdict is cached with the head SHA and check
  results; it is recomputed only when GitHub changes.
- A `completed: true` verdict marks the leaf done and triggers readiness
  recomputation in the same tick.
- `conflict: true` (several closers, wrong base, wrong repository, or the
  planning repository named in public text, §6.6) opens a decision.
- A parent issue closes as completed, by Avoozl, when every required child is
  done, verified or by order: no pull request closes a parent. Besides "take back local", this is
  the only issue close Avoozl makes.
- Merging is Issue Radar's or GitHub auto-merge's job under required reviews and
  checks (F24, Requirement 18).

### 6.6 GitHub modes

**Proposed**, using F37–F43.

| | Plans-repo mode | Single-repo mode |
|---|---|---|
| Issues, sub-issues, dependencies | A private planning repository | The code repository |
| Spec folders | Planning repository | The code repository |
| Pull requests | Code repositories named by each leaf | The same repository |
| Link from PR to issue | Linked branch `avoozl/<task-id>`, created by Avoozl at dispatch; no closing keyword | `Closes #N` (a linked branch is also allowed) |
| Who closes the leaf issue | GitHub on merge into the default branch; Avoozl verifies | GitHub on merge; Avoozl verifies |
| Who codes leaves | Avoozl worker sessions in the code repository | Issue Radar (default) or worker sessions (`coder`) |
| Planning repository named in public | Never | Not applicable |

**Plans-repo delivery.** The Phase 2 runner does the work: the Crew Mode
conductor (§5.1), with the tick's script cron as fallback (§4.6), opens one
`kirocrew-worker` session per ready leaf in the code repository's folder.
Before the brief goes out, the tick creates the leaf's linked branch: GraphQL
`createLinkedBranch` with the planning issue's node ID, `repositoryId` of the
code repository, `oid` of the head of `baseBranch`, and name
`avoozl/<task-id>` (F51). It reuses the branch when the issue already lists a
linked branch of that name; GitHub drops the link when the issue closes, but
the branch stays (F52). The brief differs from local delivery in four ways:

1. the worker fetches branch `avoozl/<task-id>`, pushes its commits to it,
   and opens one pull request from it against `baseBranch`;
2. the brief carries the task's own title and acceptance, never the planning
   issue's URL, number, or repository; the pull request body is written from
   them alone;
3. the worker enables auto-merge, so GitHub merges under the repository's
   required reviews and checks (Requirement 18);
4. the worker fixes CI and answers review on that pull request until it
   merges or reports `blocked`.

There is no verifier session or `integrateRun` for these leaves: the
repository's checks on the head SHA are the verification.

**Leak screen.** Each tick reads the candidate pull request's title, body,
and commit messages and searches them for the planning repository's
`owner/name`, its URL, and `owner/name#`. A hit opens a decision and blocks
completion; Avoozl asks the worker to edit the text. Avoozl never edits the
pull request itself. The branch name holds only the task ID. A logged-out
viewer sees no planning-repository name on the pull request, its timeline, or
its events (F51); people with read access to the planning repository see the
link, which is intended. The probe ran on same-owner user repositories only,
so P25 repeats it inside an organization before Phase 6 (F52).

**What else stays private.** Avoozl adds only planning issues to the
Project, never code pull requests, so no Project timeline event lands on a
public pull request (F40). Avoozl writes sub-issue links and dependencies
only between planning issues. It never adds a link on a code-repository
issue that points into the planning repository, because the link would show
there. (**Inferred**: GitHub may hide a link to a private issue from people
who cannot read it, but Avoozl does not rely on that.)

**Cross-organization.** The planning repository and a code repository may
belong to different organizations. Sub-issues across organizations are
**Verified** (F38). In plans-repo mode every sub-issue and dependency is
between planning issues, so only the pull request lookup crosses
organizations, and that needs only read access. Cross-organization
dependencies matter only in single-repo setups with several repositories;
P18 checks them (F39).

### 6.7 GitHub Project sync

**Proposed.** Requires `gh` or a token with the `project` scope (F45).

- **Items.** On projection Avoozl adds each managed issue to the configured
  Project (org or user, F40). Sub-issues inherit the parent's Project by
  default (F38); Avoozl still checks each one and adds any that is missing.
- **Status** (single-select) belongs to GitHub and people (changed
  2026-11-12, Requirement 33). Avoozl never writes it. The recommended
  built-in workflows (§8.2) move a card: Item added sets Todo, Pull request
  linked sets In progress, Item closed and Pull request merged set Done
  (F54). Blocked work shows GitHub's own Blocked icon (F53), not a column.
  The one Status Avoozl reads is Deferred, a person's order (below).
  Pending-projection tasks have no item yet.
- **Avoozl state** (single-select, optional; added 2026-11-13, R29.18–21)
  is Avoozl's own column: the Delivery lane from `src/delivery-lanes.mjs`,
  the module the Delivery tab imports too. Sync writes it after the Status
  orders of the same pass, so a card paused this pass reads Deferred, and
  only when the board differs. The receipt keeps the value Avoozl last
  wrote; a different board value is a person's edit, written back once and
  kept as `stateConflict` (shown in Conflicts) until the state moves. It is
  not kept in the issue marker, so a state change never rewrites a body.
  Setup creates it and **Board by Avoozl state**; Status's first option is
  Ready, and a board with Todo keeps Todo.
- **Release** (single-select) is set from the plan's milestones when Avoozl
  adds the item. A milestone is
  a manifest-level group of task IDs; each leaf takes its own milestone, and a
  parent takes the latest milestone of its children. Avoozl creates missing
  Release options only when the policy allows it. GitHub milestones are not
  used, because each belongs to one repository (F42). People may change
  Release afterward (below).
- **Iteration** is optional. When `fields.iteration` names an iteration field
  (F41), Avoozl sets the iteration the manifest names for a task, and leaves
  it empty otherwise. It never invents dates.
- **Wave** (number) is computed, never read from the manifest. **Proposed**
  (owner decision 2026-11-12):
  - A task that waits on nothing is wave 1. Any other task is 1 plus the
    highest wave among the tasks it waits on. Only blocking edges count
    (`requires`, `sequence`); `supports` edges do not. Every managed item
    gets a wave by this rule, parents included.
  - Done tasks keep their wave, so finishing work never renumbers what
    follows. Only an edge change moves a wave.
  - The tick recomputes every wave and writes only the ones that changed.
    Projection uses the same function, so projection and the tick agree, and
    a second pass writes nothing.
  - Wave is order, not time: the earliest round a task could run. Capacity
    (`concurrency`) may start it later. Avoozl never turns a wave into a date.
  - Validation already refuses cycles (§5), so every task has a wave.
  - Wave versus Epic:

    | | Epic | Wave |
    |---|---|---|
    | Comes from | Parent and child links (sub-issues) | Waits-on links (`requires`, `sequence`) |
    | Answers | What a task belongs to | How soon it can start |
    | Spans | One subtree | Any epics; one wave may hold tasks from several |
    | Changes when | A task moves to another parent | An edge is added or removed |

    Changed 2026-11-13 (§6.9): an epic now spans plans, and a group inside
    one plan is a phase. Wave still spans them all.
- **Board edits.** **Proposed (owner decision 2026-11-12, changed the same
  day for the GitHub-native split, Requirement 33):** people use the Project
  board as usual. A card drag is never a conflict, and Avoozl reverts no
  Status. Avoozl uses no webhooks. It reads Project changes on its 60-second
  tick (§4.5). It first applies this tick's completion and state changes,
  then reads each item:

  | Edit | Result |
  |---|---|
  | Status to Deferred (the `statusValues.deferred` option) by an allowed actor | Pause: no new dispatch; a running session is left alone; Kiro Crew notifies the owner |
  | Status out of Deferred by an allowed actor | Resume; Avoozl writes no Status, so the column the person picked stays |
  | Deferred in or out by an actor the policy does not allow, or whose actor cannot be read | Ignored as an order; the card is not reverted; the Delivery view shows "Deferred by a person the policy does not allow" |
  | Done | The Auto-close issue workflow closes the issue; §6.5 judges the close (an allowed actor's order releases dependents; anyone else's close holds them with a decision). Changed 2026-11-12 |
  | Any other Status, including In progress or Todo | The board's own; Avoozl neither reverts nor acts on it. When it disagrees with Avoozl's state, the Delivery view shows both |
  | Release, by anyone | Kept; Avoozl drafts a manifest change for review |
  | Wave, by anyone | Refused; Wave written back from edges; Kiro Crew notification |
  | Automation (`@github-project-automation`) | Expected; it writes only Status, which Avoozl does not track |

  - **Who may order.** **Proposed:** only actors the repository policy
    allows, by the same `allowedActors` or `minimumPermission` check used for
    trigger labels (§4.4, Requirement 10), may pause or resume. For a managed
    issue in plans-repo mode, the policy of the leaf's code repository
    decides. Only Deferred needs the check, because it is the only Status
    Avoozl acts on.
  - **Why other drags need no rule.** **Proposed:** verified completion
    comes only from GitHub closing the issue through a merged pull request
    (§6.5). A drag to Done closes the issue through Auto-close issue (§8.2),
    and §6.5 judges that close by its actor, so the drag itself needs no
    rule. Changed 2026-11-12: Auto-close issue was off and a Done drag
    changed nothing. Running and review are shown from Kiro Crew sessions
    and pull requests in the Avoozl app, not from Status.
  - **Pause and resume.** **Proposed:** Deferred is the pause record, so
    rebuild reads it from the Project. A paused task keeps its claim and
    session; Avoozl starts no new session for it, creates no linked branch
    for it, and does not publish its ready label. Moving the card to any
    other column resumes it. A paused task whose running session merges a
    passing pull request still completes (§6.5).
  - **Release changes.** **Proposed:** Avoozl writes Release when it adds the
    item, and again only when an approved manifest moves the task and the
    field still holds the value Avoozl last wrote (`applied.project`). Any
    other value is a person's: Avoozl keeps it, uses it for the parent's
    latest-milestone rule, and drafts a manifest change that moves the task
    to that milestone for review in the Avoozl app; it commits nothing on its
    own. Once an approved manifest says the same, the draft is closed.
  - **Automations.** **Verified:** Project workflows set Status on events
    (F49, F54), attributed to `@github-project-automation` (F50). Avoozl
    keeps no Status baseline, so there is nothing to reconcile.
  - **Reading the actor.** **Inferred:** Avoozl reads the actor of a
    Deferred move from the issue's Project timeline event or the item's
    change record; that event is visible only with read access to the
    Project (F40). P16 checks which source is readable. **Proposed:** when
    the actor cannot be read, the move is ignored as an order.
  - **Issue edits stay conflicts.** Edits to the issue itself (title, managed
    body section, managed labels, blocked-by links) are still conflicts under
    Requirement 15: Avoozl leaves them and opens a decision.
- **Project setup.** **Proposed:** any built-in Project template works.
  Avoozl needs only Status (single-select, mapped through
  `project.statusValues`), Release (single-select), Wave (number), and an
  optional Iteration field. Status needs only the options the recommended
  workflows set (Todo, In progress, Done) and Deferred (changed 2026-11-12:
  no Ready, In review, or Blocked options). **Verified (2026-11-12, GraphQL
  read):** a Project made from a template may have only Todo, In progress,
  and Done, as `nupp-lang` Project #2 does. **Proposed:** the wizard adds
  Deferred when missing and maps the four names through `statusValues`. It
  never removes or renames an option, and it keeps every existing option
  `id` (L6). The **Set up GitHub** wizard (§8.2) creates the Project
  when asked, adds whichever of these is missing, and adds a Board view with
  a column per Status, grouped by Release. When the API cannot set the
  grouping, the wizard's checklist names the one click left (§8.2, L7a). No
  Roadmap view is made: it is date-based, and tasks have no known durations.
  A person may add one later. Applying a built-in template and changing
  built-in workflows are the choices it cannot make through the API (§8.2,
  limits L9, L12).
- **Idempotence.** A sync with no change writes nothing. Field writes use the
  Projects REST API (F38) over the token Avoozl already reads (F35).
- **No scope.** Without the `project` scope, Project sync reports unavailable
  in Settings and issue projection continues.

### 6.8 Plan layout: Kiro spec folders

**Proposed.** Required for every plan (Requirement 30), built on F47–F48.

```text
.kiro/specs/<name>/
  requirements.md   (feature spec)   or   bugfix.md   (bugfix spec)
  design.md
  tasks.md
  avoozl/manifest.json
  avoozl/critique.md   (planner critique, optional)
```

- **Where.** Plans-repo mode: the planning repository. Single-repo mode: the
  code repository. No GitHub mode: the workspace's planning repository.
- **Task IDs.** Every checklist item in `tasks.md` starts with an ID token:
  `- [ ] <id> <title>`. A token that is a bare number path (`1`, `2.14`, Kiro's
  usual numbering) becomes `<name>.<token>`; any other token (`w3.reactor-timers`)
  is used as is, which keeps migrated IDs. IDs are unique across the namespace.
- **Mapping.** One `tasks.md` ID is one Avoozl task and, in a GitHub mode, one
  issue. The manifest keys every entry by that ID and holds kind, repository,
  edges, checks, completion, milestone, iteration, and `authority` for
  opt-in local tasks.
- **Waves.** Kiro computes its own waves from `tasks.md` when it runs all
  tasks (F47). Avoozl ignores them: its graph comes only from the manifest.
  `tasks.md` checkbox marks are not Avoozl state either.
- **Bugfix specs.** A `bugfix.md` spec maps the same way. Its unchanged
  behavior clauses become acceptance on the fix leaves.
- **Validation** refuses: a missing folder; a missing `design.md` or
  `tasks.md`; neither or both of `requirements.md` and `bugfix.md`; an item
  with no ID; an ID used twice; a manifest entry with no `tasks.md` item, or
  an item with no manifest entry; and after approval, an approved ID whose
  item text changed without a new approval. Kiro's **Sync Files** can add or
  mark tasks (F48); a renumbered item fails this check instead of silently
  moving an issue to other work. (**Inferred** that Sync Files may renumber.)
- **Category (Requirement 30.9).** Grouping in the Plans view comes from
  YAML front-matter at the very top of `requirements.md` or `bugfix.md`,
  for example `---` / `category: Runtime` / `---`, the same place Kiro puts
  steering inclusion modes (**Verified** for steering in Kiro's docs). Front-matter
  stays part of the revision hash like any other text. Avoozl reads only a
  top-level one-line `category:`; it never writes it, never stores it in the
  manifest, and never guesses one, so a plan without it is Uncategorized.
  Kiro's spec folders are flat, so grouping is by category, not by folder
  nesting. Whether Kiro, or Spec Builder, keeps front-matter when it
  regenerates a spec file is **Unverified**: Kiro's spec docs do not mention
  front-matter, and no spec code was found to read (Kiro CLI 3.2.1; the IDE is
  not installed). Spec Builder's skill writes `requirements.md` whole, so a
  regeneration may drop it (**Inferred**). A dropped block is visible, not
  silent: the folder shows as changed on disk and the plan moves to
  Uncategorized. Avoozl's planner keeps an existing block as is.
- **Old plan files.** Free-form plan files with fenced task blocks
  (`extractPlan`) are read only by the migration path (§10). Avoozl never
  writes them. A migrated workspace may keep reading its old graph through
  that path until its plans move to spec folders (§10.2 step 11).

### 6.9 Epics across plans, phases inside plans

**Proposed**, owner decision 2026-11-13 (Requirement 59). An epic is a goal
that spans plans, such as a language rewrite. A phase is a group of tasks
inside one plan. Today's code mixes three things under one word: the
manifest `kind: "epic"` (a parent task inside a plan), the per-task `epic`
string with its `epics` list (a grouping), and `doc:<path>` epics that the
catalog and capture paths make up for any document (`src/catalog.mjs`,
`src/capture.mjs`, `src/app/plans.mjs`; `specOf` in
`src/app/page-views.mjs` parses them back). This section gives each word
one meaning and removes the made-up groups. Changed 2026-11-13 (owner):
old forms are errors, not warnings, and no migration operation exists. The
owner is the only user, so task 21.7 rewrites the owner's plans once with a
throwaway script.

| Level | Is | Comes from | GitHub |
|---|---|---|---|
| Epic | A goal across plans | Its own spec folder; members' `epic:` front-matter | One issue, `epicIssueType` |
| Plan | One spec folder | `.kiro/specs/<name>/` (§6.8) | One plan issue, sub-issue of its epic's issue |
| Phase | A group inside a plan | Manifest `phase`, else the `tasks.md` heading | Not an issue: managed body line and optional Project field |
| Package, leaf | Tasks | Manifest `kind` | Sub-issues of the plan issue or package |

**Epic folder.** The same four files as a plan (§6.8), so Requirement 30's
layout rule holds unchanged. A folder is an epic folder when its manifest
has a top-level `"kind": "epic"`. `requirements.md` states the goal and what
done means. `design.md` says how the member plans fit and in what order.
`tasks.md` has one item per member plan, for example
`- [ ] 1 Native runtime`. The manifest lists plans, not tasks:

```json
{
  "version": 1,
  "kind": "epic",
  "tasks": {
    "1": { "plan": "native-runtime", "summary": "Direction and work W1-W7" },
    "2": { "plan": "runtime-contracts" }
  }
}
```

- An entry may hold only `plan` and `summary`. The older `memberPlan`
  key is an error; task 21.7 renames it in the one folder that used it.
- Each member's `requirements.md` (or `bugfix.md`) starts with front-matter
  such as `---` / `category: Runtime` / `epic: rewrite` / `---`. Avoozl reads
  `epic:` exactly as it reads `category:` (§6.8): one top-level line, never
  written, never guessed, part of the revision hash.
- Membership needs both sides. The epic's list is the order shown; the
  member's `epic:` key confirms it. A list entry the member does not confirm
  is an error on the epic folder. A member key the epic does not list is a
  warning on the plan, which then shows under **No epic**.
- The epic's own `tasks.md` items are not tasks. They make no Avoozl task,
  no issue of their own, no readiness, and no edges. The epic's issue is
  the epic folder itself.
- Approving an epic revision stores its member list. It never approves a
  member plan or its tasks, which keep their own approvals.
- Progress is computed, never stored: an epic counts the tasks of its
  member plans; a plan is done when each of its tasks is done or archived
  with a reason; an epic is done when every member plan is done.

**Validation codes** (errors block approval of the folder that has them):

| Code | Severity | When |
|---|---|---|
| `spec.epic-member-missing` | error | An entry's `plan` is not a spec folder in the namespace |
| `spec.epic-member-unconfirmed` | error | The named plan's `epic:` is missing or names another epic |
| `spec.epic-member-twice` | error | Two entries name the same plan |
| `spec.epic-nested` | error | An entry names an epic folder |
| `spec.epic-task-fields` | error | An entry holds a key other than `plan` and `summary` (`memberPlan` included) |
| `spec.epic-bugfix` | error | The epic folder has `bugfix.md` |
| `spec.epic-unknown` | warning | A plan's `epic:` names no epic folder, or one that does not list it |
| `spec.kind-epic` | error | A plan's manifest entry has `"kind": "epic"`; use `package` |
| `spec.entry-epic` | error | A plan's manifest entry has `epic`, or the manifest has a top-level `epics` list; use `phase` and `phases` |

**Phases.** A task's phase is, in order: its manifest entry's `phase`
value; otherwise the nearest heading of level 2 or lower above its item in
`tasks.md`; otherwise **No phase**. The heading's text is the title, and
its slug is the ID, made unique within the plan by a `-2` suffix. A
manifest may name titles for its `phase` values:

```json
"phases": { "w1": { "title": "W1: core execution" } }
```

A `phase` value with no title shows its ID. A heading renamed in
`tasks.md` changes the phase ID; no issue or edge depends on it, so
nothing else moves. Phases never add edges, readiness, or completion. A
heading-only plan such as this spec gets its phases from its
`## Phase N: ...` headings with no manifest change.

**No invented groups.** The `doc:` form goes away. Capture and catalog
paths stop creating `doc:<path>` epics; a captured task keeps its source
reference (document and lines) as provenance only. A task with no plan
shows under **No plan**. Every view reads the plan, epic, and phase titles
from records, so no view, export, or brief ever prints a `doc:` ID or a
file path as a group name. `specOf` reads the task's plan or its source
reference instead of parsing an epic string.

**Store.** `epics` holds only cross-plan epics: ID, title, the epic
folder's plan record, and the ordered member plan IDs from its last
approved revision. A plan record gains `epic` (from front-matter, or null).
A task gains `phase` (ID and title) and loses `epic`; its epic is always
its plan's epic, so a task cannot disagree with its plan.

**GitHub layering.** Projection order (§6.3) adds two parent kinds before
tasks:

1. The epic issue, titled from the epic's `requirements.md` heading. Its
   managed body section holds the goal, what done means, and a list of
   member plans. It gets `epicIssueType` when the owner has one (F44).
2. One plan issue per approved plan, titled from its spec heading, with a
   managed body section linking the spec folder. It is a sub-issue of its
   epic's issue when the plan has an epic. It gets no issue type.
3. Task issues, as today, each a sub-issue of its package, or of the plan
   issue when it has no package.

Epic and plan issues live in the repository that holds the plan's task
issues: the planning repository in plans-repo mode, the code repository in
single-repo mode. They are never ready, never get a ready label, and carry
the marker with `kind` `epic` or `plan`. The tick's close step (§5, step
13) closes a plan issue when all its tasks are complete and an epic issue
when all its plan issues are closed. Avoozl closes them in both modes,
since no pull request closes a parent.

The phase is not an issue. Avoozl writes `Phase: <title>` in each task's
managed body section and, when `project.fields.phase` names a field, sets
that field. Like Wave, the field is Avoozl's: a person's edit is reverted
on the next tick and nothing else happens. With no field named, nothing
is written to the Project.

**Limits**, checked 2026-11-13 against GitHub's docs and the GraphQL
schema, read only (no issue was written to test them):

| Limit | Value | Source | Status |
|---|---|---|---|
| Sub-issues per parent | 100 | [Adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues); the docs source sets `sub-issue_limit: '100'` in `data/variables/projects.yml` of github/docs | **Verified** (docs) |
| Closed sub-issues count toward the 100 | yes | A user's report of the `addSubIssue` error "Parent cannot have more than 100 sub-issues" with 433 closed children ([community discussion 207865](https://github.com/orgs/community/discussions/207865)); the docs do not say | **Inferred** (one report) |
| Nesting depth | 8 levels | Adding sub-issues | **Verified** (docs) |
| Sub-issue from another repository | allowed when both repositories have the same owner | [REST sub-issues](https://docs.github.com/en/rest/issues/sub-issues): `sub_issue_id` "must belong to the same repository owner as the parent issue"; the docs' UI steps add issues from other repositories | **Verified** (docs) |
| Who may link | triage permission or more | Adding sub-issues | **Verified** (docs) |
| GraphQL | `addSubIssue(issueId, subIssueId or subIssueUrl, replaceParent)`, `removeSubIssue`, `reprioritizeSubIssue`; `Issue.subIssuesSummary` gives `total`, `completed`, `percentCompleted` | `gh api graphql` introspection | **Verified** (schema) |

Epic, plan, package, and leaf use four levels, well inside eight. Epic and
plan issues always sit in the same repository as their task issues, so the
owner rule only matters for an epic whose member plans use repositories
under different owners.

The cap is a setting: `.avoozl.json` `github.subIssues.maxPerParent`, an
integer of at least 1, default 100. It sits in Settings > GitHub setup,
shown in the two GitHub modes only, with the line "Most sub-issues Avoozl
links under one issue. GitHub allows 100, closed ones included." When
GitHub changes its limit, the owner changes this one number. A value above
GitHub's limit is allowed; GitHub then refuses the extra links, which show
as refused links (Requirement 59.9).

Before linking, projection reads the parent's `subIssuesSummary.total`, so
sub-issues a person added count too. Children are linked in `tasks.md`
order until the cap. The rest stay unlinked: their marker names the parent,
the preview lists them, and the Delivery view shows "Over the sub-issue
limit; group these tasks in packages". Avoozl never unlinks a closed child
to make room, because the closed children are the parent's history. For a
plan, the fix is packages: each package is one sub-issue of the plan issue
and holds up to the cap itself. When an epic issue and a plan issue are
under different owners, or a link write is refused, both issues stay, the
marker records the epic, and the Delivery view shows why (Requirement
59.9).

Existing projected issues for a manifest `kind: "epic"` entry stay where
they are, as package issues. The next preview shows their type change and
their new parent, the plan issue; nothing is closed or recreated.

**Views.**

| View | Epic (across plans) | Phase (inside a plan) |
|---|---|---|
| Graph | Top level: epics and **No epic**; drill to member plans | Plan drill-in: phases, then tasks; **No phase** last |
| Delivery | Filter; row shows plan and phase | Filter, enabled once a plan is picked |
| Flow | Filter | Filter; `flow.batch.by: "phase"` (`epic` is refused) |
| Dashboard | **Progress by epic**: one row per epic over all member plans' tasks, plus **No epic** | — |
| Plans | Filter and an Epic column; epic folders listed with kind **Epic** | — |
| Plan left column | The plan's epic as a link to its epic page | Phases with progress, replacing today's per-plan epics |
| Epic page | Goal, what done means, member plans with status and progress, open decisions, Edit and Discuss like a plan | Each member's phase counts |

The Graph's back stack and breadcrumb read All > Epic > Plan > Phase >
Focus: task. The epic page is the Graph's epic drill-in with the epic's
prose beside it, so no new top tab is added. The New plan drawer offers
**Epic** (pick one) and **Phases**; the seed tells the planner to write the
`epic:` key and the phase headings.

**One-time rewrite** (task 21.7). No operation, CLI command or MCP action
migrates a workspace: the owner is Avoozl's only user, so the owner's data
is rewritten once and the old forms are errors from then on. Task 21.7
writes a script, runs it, and keeps it in the task's report, not in `src/`.
The script calls only existing operations (`plan.save`, `task.archive`,
`task.update`, `flow.settings.update`) and edits spec files as local commits.

1. Copy the workspace database and every spec repository to a temporary
   folder and run the whole rewrite there first. Lint every plan.
2. Back up the live SQLite file with its sha256, and record the path and
   hash in the task's report.
3. Each `epics` row that is neither a `doc:` epic nor backed by an epic
   folder becomes a phase, with the same ID and title, of each plan whose
   tasks use it: the plan's manifest gets `phase` values and a `phases`
   object, saved as a new draft revision of that plan.
4. Each task in a `doc:` epic whose source is a spec plan's `tasks.md`
   takes that item's heading as its phase; any other goes to **No phase**.
5. Each task whose plan record is gone is archived with `task.archive`,
   reason "plan removed". Done tasks are archived the same way, so history
   stays readable.
6. Each manifest in the old form is rewritten: `kind: "epic"` to
   `package`, per-entry `epic` to `phase`, `epics` to `phases`; an epic
   folder gets the top-level `"kind": "epic"`, and its entries keep only
   `plan` (renamed from `memberPlan`) and `summary`.
7. `flow.batch.by: "epic"` becomes `"phase"` in each `.avoozl.json`.
8. Run it again; it finds nothing to change. Nothing is approved, no
   session is started or stopped, nothing is written to GitHub, and
   nothing is pushed. Rewritten plans come back as drafts for the owner to
   approve; the next projection preview shows the GitHub side.

The plans covered: Nupp's plans, including the rewrite epic folder and its
native runtime plan, and Avoozl's own spec (which already uses headings
only, so it should need no change).

**Nupp example.** A planning repository holds a rewrite epic folder
listing 21 member plans, each with `epic:` front-matter. Its manifest has
`memberPlan` entries with `kind` and `repository` and no top-level kind.
The native runtime plan's manifest gives each task an `epic` value `W1`–`W7`,
and its `tasks.md` headings are "From design.md" and "Recorded only in the
workspace database". After the build, both folders fail lint with
`spec.epic-task-fields` and `spec.entry-epic` until task 21.7 rewrites
them. After the rewrite the epic folder lists its 21 members, and the
runtime plan's tasks group under phases W1–W7 (manifest values win over
headings).

### 6.10 Driver: one machine drives each spec

**Proposed** 2026-11-13 (Requirement 66; the lock was changed the same day
to the plan issue's assignee). Avoozl runs on one person's machine, the
**driver**. Run state is in that machine's SQLite. GitHub holds the spec
(in Git), issues, links, the Project, branches, pull requests and markers
keyed by the namespace (§3.4). The namespace check of §6.3 asks only
whether `.avoozl.json` names the namespace, and every clone of the
planning repository does. So two machines can both tick one spec today,
and the role cannot be moved.

#### The lock: who is assigned, and which of their machines

Every spec already has a plan issue under its epic issue (§6.9). The
driver is read from it:

- **Assignee: which person.** The plan issue's assignee is the spec's
  driver. A plan issue with no assignee takes its epic issue's assignee,
  so one assignment can name the driver for every member spec. Task-issue
  assignees keep their meaning (intake rules, Issue Radar) and say nothing
  about the driver.
- **Claim: which machine.** One person may run Avoozl on two machines with
  one `gh` login, which an assignee cannot tell apart. The plan issue's
  marker (§3.4, `kind: "plan"`) gets a `claim`:

```json
"claim": {"machine": "mch_7hw2c4n6r8t1y3pq", "label": "laptop",
          "login": "octocat", "takenAt": "<ISO-8601>",
          "heartbeatAt": "<ISO-8601>", "from": null, "forced": false,
          "export": null}
```

A workspace drives a spec only when the issue that decides has **exactly
one** assignee, that assignee is this machine's `gh` login, and the claim
names this machine. Every other case reads only:

| Plan issue (or epic issue, when the plan issue has none) | Claim | Here |
|---|---|---|
| One assignee, this login | This machine | **Driver** |
| One assignee, this login | Another machine, or none | Read only; **Take over** offered |
| One assignee, someone else | Any | Read only; **Force take over** offered |
| No assignee, or several | Any | Read only on every machine; one decision |

The decision for zero or several names the issue and the assignees found,
and closes by itself once the issue has one. A plan issue with several
assignees never falls back to the epic: several names is a conflict, not a
blank.

**Why the assignee.** It is GitHub's own answer to "who owns this", it
shows in every issue list and Project view, it is searchable
(`assignee:octocat`) and its changes are in the issue's timeline with who
made them. Hand-off is then a normal GitHub action. Rejected: a new
Project field (fields are per item, a person's Project edit is an order,
§6.7, and a field has no history of who set it), a pinned issue (one more
issue per spec, and a repository pins at most 3), and a comment lock (a
second place to look for what the assignee already says).

**GitHub's limits, checked 2026-11-13** in GitHub's docs: an issue takes
up to 10 assignees. Who can be assigned: yourself, anyone who has
commented on the issue, anyone with write access, and organization
members with read access. In the web page, triage access and up can
assign. Through the REST API only users with push access can add or
remove assignees, and GitHub **silently ignores** the change otherwise
([REST: assignees](https://docs.github.com/en/rest/issues/assignees);
[Assigning issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/assigning-issues-and-pull-requests-to-other-github-users);
[Repository roles](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization)).
So Avoozl reads assignees back after every change it makes and never
trusts a 2xx alone.

**Heartbeat.** The driver edits the claim's `heartbeatAt` at most once per
`driver.heartbeatMinutes` (machine-local, default 15): 96 marker edits a
day per spec at the default. Editing an issue body sends no notification
(**Inferred** from GitHub community answers). The claim is left out of the
`applied` hashes, so it never reads as a conflict. Three missed intervals
show "not seen since". Age never moves the role: the heartbeat is for
people to read, and Avoozl never replaces a disconnected worker or driver
because a lease expired.

#### Reading it in the tick

Step 4 of §4.5 already reads each plan issue (§6.9); it now also keeps its
assignees and claim. The tick reads them **again** right before each
dispatch intent for the spec (step 11), before projection (step 10), and
before each integrate (step 8). A spec that is not driven here is
read-only: its steps run only as far as they change this machine's cache
and views, the script gets no intents for it, and nothing is written to
GitHub or the spec folder for it. Other specs keep ticking.

**The overlap, and its bound.** Assignment is not atomic: a person can
reassign the plan issue while the old driver is mid-tick. The old driver
then keeps going only until its next check, and every write step checks
first, so it can start at most what that one tick does after its last
read, inside one tick's time budget (45 seconds, §4.5). The new driver
cannot start before its own Take over, which waits 10 seconds and reads
again. A session the old driver started in that window shows as **away**
on the new driver (below), so it is never started twice by Avoozl.
**Limit**, stated in the docs.

**First driver.** Approval in a GitHub mode projects the plan issue first
(§6.3). It is created assigned to the approving person, unless the epic
issue's assignee already decides, with this machine's claim, and no task
issue is created until both read back. A plan issue made before this
section has no claim: every workspace reads only for that spec and shows
**Take over**. One click on the machine that should drive restores
delivery. This pauses delivery once after the upgrade, on purpose:
guessing the driver is the bug this section fixes.

**Take over** (person-only) is offered when the assignee rule names this
login but the claim does not name this machine: a hand-off was reassigned
to this person, or this is the person's other machine. It writes this
machine's claim (`from` names the old one), reads the issue again at least
10 seconds later, and drives only if its claim is still there. Two
machines with one login pressing it at once both write; the body that
GitHub keeps decides, both read the same one, and the other reads only and
names the winner.

#### Hand off

**Hand off driver** (person-only) runs on the driver:

1. Dispatch stops for the spec. Running chats keep running and are never
   ended; their reports, verification, integration and GitHub completion
   still apply.
2. The page lists the running chats with their tasks. When none is left,
   Avoozl writes the export. **Export with N unfinished** writes it sooner
   and records those tasks as unfinished. **Cancel** before the export
   resumes dispatch.
3. The export is one JSON file, `<spec>.avoozl-driver.json`, saved to a
   folder the person picks. It holds the namespace, spec, approved commit
   and hash, task rows and receipts, local-authority tasks, decisions open
   and answered, Flow spans and stops, retros and proposals, task links and
   notes, the activity log, token usage, session bindings marked with the
   old machine ID, the raw lessons store (`lessons.export {raw: true}`,
   §4.18), and the list of machine-local items in use (below). It
   never holds a terms file, router or retro instructions, a token, a crew
   host or a host key. Avoozl never uploads, commits or pushes it; the
   person moves it, and the dialog says it may hold private notes.
4. The claim records the file's sha256, the spec is read-only here, and
   the page links the plan issue: **Reassign it on GitHub**. Avoozl does
   not reassign it.

On the new machine, once the assignee rule names its login, **Take over**
offers **From an export** or **Rebuild from GitHub**. From an export it
checks the namespace and spec, the file's sha256 against the claim, and
that the approved commit is in this workspace's spec checkout (fetching
the planning repository if needed). A mismatch is refused by name and
changes nothing. Then it imports in one SQLite transaction and writes the
claim. A same-person hand-off (one login, two machines) needs no
reassignment: Take over on the other machine is enough.

Tasks the export marks unfinished, bound to a session on another machine,
or with an open linked branch or pull request and no session here are
**away**. They are never started again because a lease expired. The tick
completes an away task from GitHub facts when they show it done (a merged
closing pull request, or an allowed close, §6.5). In plans-repo mode a
running worker pushes its own branch and opens its own pull request
(§6.6), so finished work reaches the new driver through GitHub. An away
task with no such fact gets one decision: **Start it here** or **Wait**.

#### Rebuild from GitHub

When the old machine is gone, Take over runs `avoozl rebuild` (§3.3) for
the spec, then writes the claim.

| Kept (read back from GitHub and the spec) | Lost (only in the old machine's SQLite) |
|---|---|
| Tasks, edges, completion levels, status, verdicts, orders, managed baselines, Release, Wave, Iteration, Deferred, linked branches, pull requests | Flow spans and stop history, so lead time and time to fix restart |
| The approved spec at its commit | Retros and PDCA proposals |
| Notes and links shown on GitHub (§4.16) | Notes and links not shown on GitHub (the default) |
| | The spec's local-authority tasks, unless the workspace repository published them (§3.2) |
| | Answered decisions' local records, the activity log, token usage |

Open decisions are not copied. The next tick raises again every decision
whose cause is still in GitHub or the spec: conflicts, disallowed closes,
leak hits, quarantined snapshots, and a zero-or-several assignee decision.
The dialog shows this list before anything runs.

#### Force take over

The one assignee change Avoozl makes, and only from a person's confirm box.
It is offered on a read-only spec. The dialog names the current assignee,
the claim's machine label and ID and its last heartbeat, says that machine
may still be running chats for this spec and that their local results will
not come here, and needs the spec name typed. Then Avoozl:

1. sets the plan issue's assignees to exactly this login, when they are
   not already (one login, two machines needs no change), and reads them
   back; when GitHub kept the old ones (no push access), it says so and
   stops;
2. rebuilds from GitHub, or imports a matching export if the person gives
   one;
3. writes a claim with `"forced": true` and `from` set, waits and reads it
   back, records the event, and notifies the owner once.

When the old driver ticks again it reads only. Its banner says who took
over, when, and that it was forced. It never takes the role back by
itself. Chats still running on it finish; what they push reaches GitHub,
and the new driver judges it.

#### What never moves

Machine-local settings (F74) stay on each machine: plugin approvals
(§4.8), the private terms file (§4.9), the routing prompt (§4.10), retro
instructions (§4.11), the crew registry and SSH host keys. After any
take-over the page lists what to set up again: from the export's list, or
after a rebuild from the plugins and rule sets `.avoozl.json` names. Until
then today's fail-closed rules hold: an unapproved plugin's tasks park and
a missing terms file blocks its boundary, so a new driver cannot write
GitHub through an unchecked boundary.

#### Local only mode

There is no GitHub, so the lock is a `driver` row per spec in the
workspace's SQLite: machine ID, label, state and heartbeat. Hand-off is
the export and Take over from the file. Its limits, stated in the docs and
in Settings: it guards only instances that open this file or a copy of it,
it cannot see another machine, and there is no forced take-over between
machines because there is nothing shared to write to. A copy opened on
another machine sees a row naming a different machine and reads only until
a person presses Take over.

#### Who may do it

`driver.handoff`, `driver.takeover` and `driver.forceTakeover` are
person-only operations on the page and CLI. Agent sessions, MCP, the app
token and plugins get 403 (F108). `driver.status` is readable everywhere,
including the workspace status MCP reply. CLI: `avoozl driver status`,
`avoozl driver handoff`, `avoozl driver takeover --file <path>`,
`avoozl driver takeover --rebuild`, and `avoozl driver takeover --force
--confirm <spec>`.

#### Page and Settings

- The header shows the selected spec's driver: "Driver: you", or
  "Driver: octocat · laptop · seen 4 min ago", with "not seen since"
  after three missed heartbeats.
- A read-only spec shows a banner on its pages saying why: assigned to
  someone else, your other machine, or no assignee or several (with a link
  to the issue). It offers **Take over** when this login is the assignee
  and **Force take over** otherwise. The Dashboard counts read-only specs.
- Hand off driver sits in the spec view's left column actions. Its dialog
  is stepped: drain (running chats listed), export (folder picker),
  reassign (the issue link).
- Settings › General › **This computer**: Machine label (optional),
  Heartbeat minutes (optional, placeholder 15), and the machine ID shown
  small. The group's blurb says these stay on this machine.

| Decision | Reason |
|---|---|
| Plan issue assignee names the driver, the epic's as default | GitHub's own owner field, visible in every list and view, with history |
| A machine claim beside it | One login on two machines is the owner's own case |
| Exactly one assignee | Zero or several is not an answer; guessing is the bug |
| Avoozl never reassigns, except Force take over | Hand-off is a person's GitHub action |
| Check again before each dispatch | Assignment is not atomic; this bounds the overlap to one tick |
| Age never moves the role | A slow or asleep machine is not a gone one; the repository rule for workers applies to drivers too |
| Export is a file the person moves | It may hold private notes; GitHub is not a place for them |

---

## 7. Kiro Crew integration map

| Feature | How Avoozl uses it | Interface | Status |
|---|---|---|---|
| Kiro Crew chat | Planning conversations; the `avoozl` skill drives Avoozl MCP tools | Skill + MCP server | **Proposed**; skill exists (F14) |
| Kiro Crew sessions | One session per leaf, verifier, responder, planner; links from every task | Script cron `open_session`, `send_to_session` (F31) | **Proposed**; P2 proves |
| Cron | The tick, every 60 seconds | App manifest script cron (F32) | **Proposed**; P2 proves |
| Notifications | Decisions and failures | App notification channels (F30) via `ctx.notify` | **Proposed** |
| Issue Radar | Implements ready GitHub leaves in single-repo mode; claims, PRs, CI, review, merge. Not used for plans-repo leaves (§6.6) | GitHub labels only | **Verified** capabilities (F1, F24); handoff **Proposed** |
| Issue Radar Investigate | Not used by Avoozl; users may still investigate by hand | None | **Verified** manual and local-only (F2) |
| Task Runner | Optional, inside a worker session for a complex leaf | `task_run` tool from the worker | **Verified** tool (F5); use **Proposed** |
| Spec Builder and Kiro specs | The only plan layout: Kiro spec folders, written by Kiro, Spec Builder, or Avoozl's planner (§6.8) | Files on disk | **Verified** files (F7, F47) |
| Crew Mode | Preferred runner for local leaves and plans-repo leaves: the conductor asks Avoozl for ready leaves each round and reports results (§5.1, §6.6) | Steering file plus Avoozl CLI via `execute_bash` | **Verified** by spike (§5.1); enforcement **Proposed** |
| Workflows | Optional for large replans (Nupp) where restartable phases help; not required by any proof | User-started from chat | **Verified** features; use **Proposed** |
| Code Review Sage | Reviews pull requests Issue Radar opens; Avoozl links to it | None | **Verified** (F10) |
| Monitor loops | Not used for routine work (Requirement 26.9) | None | **Verified** cost model (F28) |
| Inbound webhooks | Not used in v1 | None | **Verified** limits (F22) |

### 7.1 Missing handoff contracts

Each has an interim that uses only supported interfaces. None is a private route.

| ID | Missing contract | Interim | Blocking? |
|---|---|---|---|
| MC-1 | Open a session bound to a project directory, or create an app-owned folder with `project_dir` | Avoozl creates a folder per repository; the user sets its project directory once in Kiro Crew; Avoozl refuses dispatch until the folder reports one (if `list_session_folders` does not expose it, the worker brief also passes the absolute checkout path and the worker verifies `git rev-parse --show-toplevel`) | Partly: one manual step per repository |
| MC-2 | Session lifecycle events or status readable by an app | Tick polls `session_status` through the script cron | Yes if P2 shows the script cannot call it |
| MC-3 | Read or write an Issue Radar crew's label scope | Settings shows the required label; stale-claim detection catches mismatches | No |
| MC-4 | Issue Radar pre-claim blocker gate | Avoozl only labels unblocked leaves ready | No |
| MC-5 | Read a Crew Mode work-ledger item's session binding from an app | The conductor reports each item's session ID to Avoozl (§5.1) | No; relies on conductor compliance |
| MC-6 | Per-run test command and working directory for Task Runner | Verifier session runs checks; Task Runner optional | No |
| MC-7 | Spec Builder event or hook after design approval | User presses **Prepare delivery** in Avoozl | No |
| MC-8 | GitHub-signed webhook intake into Kiro Crew | 60-second polling tick | No |
| MC-9 | Script cron access to a per-app GitHub secret | Environment variable or `gh auth token` | No |
| MC-10 | Open, message, read, and close a session on a connected remote crew from an app's backend and tick cron, under a grant the owner gives that app once, limited to remote sessions that app opened, with a binding that survives a hub restart; and let the owner attach to (open and type into) each such session from the app's In flight card (F77–F79) | None: remote crews fail the reach check, every session runs on `local`, and Settings › Routing says so (§4.10) | Yes, for remote placement only. A required upstream ask (owner, 2026-11-12) |
| MC-11 | Open a remote session with a working checkout (clone URL, base commit, branch) | The brief carries clone URL, base commit, and branch; the worker clones and checks `git rev-parse HEAD` (§4.10) | No |
| MC-12 | Read each crew's headroom (F80) from an app | **Inferred** readable through the hub's instance proxy; if not, remote crews show no readings and count as unavailable | Yes, for remote placement only |
| MC-13 | Read the tool calls of a session the app runs: kind, command, start, end, status, and exit code, for slots the app owns and for Crew Mode and remote sessions bound to its tasks, under an owner grant (F90–F94) | Tick-opened local sessions: kinds, commands, and start times from the slot read (F91), lengths estimated; Crew Mode and remote sessions: worker phase markers, marked coarse (§4.11) | No; timing is coarser without it |
| MC-14 | Page links that open Issue Radar on one repository with a filter or a set of selected issue and pull-request numbers, or on one item, and open Code Review Sage on one pull request's review by owner, repository, and number (F98, F99) | Open the app's page; the button's tooltip says the item must be picked there; the title links to GitHub (§8.5) | No; one more click per item |
| MC-15 | Start a Code Review Sage review of one item from an app: a pull request by owner, repository, and number, or an outside review request by link, returning a run ID the app can link to (F99) | A `review` item lists in Untriaged with the **Code review** button and its fallback tooltip; nothing starts a review (§4.12) | No; one more click per review |
| MC-16 | A `permissions.api` entry for one method and exact path, such as `POST /api/apps/spec-builder/specs`, matching no child route | The prefix grant, with a source scan test that Avoozl calls only the create route (§8.6) | No; narrows a grant the owner already accepted |

---

## 8. Avoozl app user experience

**Proposed.** One page in Kiro Crew with nine views. Every view reads the node
backend, which calls the same operations as CLI and MCP (Requirement 20.4).

| View | Data shown | Primary actions | Canonical source | Links out | Must not duplicate |
|---|---|---|---|---|---|
| **Workspace** | Workspaces known to this machine; selected workspace's repositories (checkout, GitHub repo, Kiro Crew folder, project-dir status); tick health (last run, lock, errors) | Add or initialize workspace; register repository; run tick now | Machine catalog (`catalog-store`); `.avoozl.json`; SQLite receipts | Kiro Crew folder; Schedule page for the tick cron | Kiro Crew's project or folder settings |
| **Plans** | Kiro spec folders; manifest; critique findings; validation diagnostics; approval receipts; projection preview | Plan a goal (draft chat); Prepare delivery; Validate; Approve revision; Preview; Apply | Git files; SQLite receipts | Spec Builder spec; planner and critique sessions | Spec Builder's editor and phases; Kiro Crew chat |
| **Graph** | Epics, packages, leaves, edges, readiness, authority (issue link, plugin record link, or "local"), route; filters by epic, repository, status, Release | Open a task; pause or resume a subtree; approve a broad issue's children | SQLite (local) and cached GitHub graph | Each task's session, issue, or pull request; the GitHub Project | GitHub issue pages and Project views |
| **Delivery** | Running and recent leaves: worker session, verifier result, commit, PR number and merged state, required checks, completion verdict; per-repository capacity | Retry; nudge session; take back local; open session | Kiro Crew sessions; GitHub; SQLite receipts | Kiro Crew session; Issue Radar repository; GitHub PR; Code Review Sage | Issue Radar's pipeline and item lanes; Sage findings; Kiro Crew transcripts |
| **Conflicts** | Open decisions: managed-field conflicts, duplicate task IDs, stale claims, needs-human, failed critiques, quarantined snapshots, completion conflicts | Accept GitHub value; reapply desired value; reassign task ID; dismiss with reason | SQLite decisions; GitHub | The issue or session involved | Kiro Crew's own approval prompts |
| **Settings** | `.avoozl.json`: GitHub mode, planning repository, default authority, Project and its fields, epic issue type; per repository: rules, managed labels, actors, permission, checks, concurrency, priority, coder; required Issue Radar crew label (single-repo mode); a link to **Routing** for delivery routes and crews; plugins with kinds, version, approval state, and health (§4.8) | Edit and validate; **Set up GitHub** wizard (§8.2); check Project fields and the `project` scope; show crew setup; add, approve, disable, or remove a plugin | `.avoozl.json` in Git; machine-local settings for plugin approvals and local plugin entries | Issue Radar crew setup; GitHub Project settings; Kiro Crew secrets | Issue Radar settings; Kiro Crew settings |
| **Settings › Routing** | The routing prompt switch and prompt with examples; provider health and usage; crews with tags, trust, chat limit, readings, and check results; a read-only dry run on ready tasks (§4.10, §8.3) | Turn routing on or off, edit the prompt and insert examples, pick the routing agent's model; set Low at and per-provider limits; edit a crew's tags and chat limit and the stale limit; Preview | Machine-local settings only (the prompt, providers, crews, chat limits, the stale limit), never tracked; Kiro Crew instance list, headroom and models | Kiro Crew Connections; Kiro Crew remote dispatch settings | Kiro Crew's instance management and its remote dispatch limits |
| **Flow** | Lead time, flow efficiency, first-pass rate, and time to fix with the previous window; stacked time bar per task by stage; biggest bottleneck; retrospectives with proposals and PDCA results (§4.11, §8.4) | Approve or reject a proposal; run a retro now; open a task | SQLite `flow_spans`, line stops, and retrospectives | Each task's session; the pull request and CI run in GitHub | Issue Radar's pipeline and CI views; Kiro Crew's Usage page |
| **Intake** | Open items from every source (§4.12) that no trigger rule, triage label, or task covers, with source, kind, number or ID, title, repository, author, age, labels, comments, and a pull request's draft and checks state (§8.5) | Check now; open at the source; open in Issue Radar (GitHub); Code review; select several and open them in Issue Radar; Plan this and Deliver this (non-GitHub, person only) | Incoming items in SQLite, read from GitHub search, plugin `poll`, and `intake.submit`; `.avoozl.json` `untriaged` per repository and `intake.sources` | GitHub item; Issue Radar; Code Review Sage | Issue Radar's lists and item pages; Sage reviews; GitHub's issue list |

**Choosing a repository and workspace.** A workspace is a directory with
`.avoozl.json` and its SQLite file (existing layout). The machine catalog lists
known workspaces. Registering a repository records its local checkout, optional
GitHub `owner/repo`, base branch, and a Kiro Crew folder name. Avoozl creates the
folder on the next tick and shows "Set project directory" until MC-1's manual
step is done.

**Creating project-bound sessions.** Only the tick script opens sessions, in the
repository's folder, with an explicit agent (never inheriting a default), and a
title of `avoozl:<task-id> …` (§4.6).

**Linking tasks to sessions.** Each task stores its bound slot keys with role
(`worker`, `verifier`, `responder`, `planner`) and attempt number. The page
opens a slot with the app SDK's chat navigation. Rediscovery by title covers a
lost binding.

### 8.1 Avoozl inside chat: MCP App views

**Proposed, deferred to Phase 8.** The app page stays the main view. Kiro Crew renders MCP Apps (SEP-1865, revision 2026-01-26): a tool
whose definition names a `ui://` resource shows that HTML as a live,
sandboxed view in the chat, and the view can call the same server's tools
(`serverTools`) and post text to the chat (`message`). **Verified** in Kiro Crew's
`mcp-apps.md`; it requires the user to route the stdio server through the MCP
gateway once in MCP Management.

Avoozl's MCP server gives four tools a view:

| Tool | View | Buttons (each calls an Avoozl tool) |
|---|---|---|
| `plans_graph` | Ready, running, waiting (with blockers), needs you, done | Refresh; open a task's session |
| `plans_preview` | Draft graph, critique findings, validation diagnostics | Approve exact revision |
| `plans_project_preview` | Issues, sub-issues, and dependency links to be created | Project |
| `plans_decision` | One open decision with its options | Each option |

Rules:

- Every write a button makes goes through the same operation and the same
  expected hash or revision as the CLI and page, so a stale view is refused.
- Views show only Avoozl's own data. Issue and pull-request text stays escaped.
- A view is an addition, not the only path: every action also exists as a tool
  the agent can call and in the app page.
- The Crew Mode conductor cannot load Avoozl's server (§5.1), so views appear in
  ordinary chats, not in the conductor.

**Open (Inferred).** Whether an MCP server shipped inside a Kiro Crew app can be
routed and render views is not documented; proof P8b checks it. If it cannot,
the user adds the same server in Connections and routes it.

**Spike (2026-11-11).** A 200-line stdio server and one HTML view render the
spike graph with Start, Accept, Fail, and Reopen buttons over the spike
workspace (`avoozl-crewmode-spike/mcp-app`). **Verified** in a Kiro Crew chat
after the user approved sharing in MCP Management and restarted: the view
renders, and its buttons write and redraw it. Lessons:

- Only the view's own tool should name the `ui://` resource. When the button's
  tool also named it, the write landed but the view never redrew.
- Each click took several seconds because the spike starts the CLI three
  times (about 3 seconds each under load). The real server must call
  operations in-process.
- Reopening a task left its dependents done. Avoozl needs a rule for that.
  §6.5 now gives it for GitHub leaves (2026-11-12): dependents not yet
  started wait again; done ones stay done.

### 8.2 Set up GitHub wizard

**Proposed** (owner decision 2026-11-12, Requirement 32). A **Set up GitHub**
button in Settings runs one operation, `github.setup`, also exposed as CLI
`avoozl github setup` and MCP tool `plans_github_setup`. It uses the token
Avoozl already reads (F35) and stores no new secret.

**Flow.** The wizard reads first, builds one plan of writes, shows it, and
writes only after one confirmation.

| # | Step | Reuse when | Create when missing |
|---|---|---|---|
| 1 | Token | Scopes `repo`, `read:org`, `project` present | Nothing; shows the fix, e.g. `gh auth refresh -s project` (L1) |
| 2 | Mode and planning repository | Named repository exists | Plans-repo mode only: new repository, private (L2) |
| 3 | Issues | `has_issues` is on | Turns issues on in the planning repository, or in each code repository in single-repo mode (L3) |
| 4 | Project | Person picks an org or user Project | New Project, then set private (L4) |
| 5 | Fields | Field of that name and type exists | Status options Todo, In progress, Done, and Deferred, mapped through `project.statusValues` (only Deferred is usually missing); Release (single-select) with one option per milestone in the mode's spec folders, or a first release the person names when no spec exists; Wave (number, L11); Iteration only if the person asks (L5, L6) |
| 5b | Views | A view of that name exists | Default: `Board by release`, Board layout, a column per Status, grouped by Release. Optional, if the person asks: `Table by wave`, Table layout grouped by Wave. Each view: REST views first with `vertical_group_by` and `group_by`; on any REST failure (404 seen), GraphQL `createProjectV2View` without grouping, and a checklist item (L7a, L7b) |
| 5c | Built-in workflows | Each workflow's `enabled` matches the recommendation below | Nothing: no API can turn a workflow on or off or set its column or filter (L12). The wizard reads `workflows { name enabled }`, and puts each mismatch, and each setting it cannot read, on the checklist |
| 6 | Epic issue type | Organization has `Epic` | Created when the organization has issue types and the person is an organization admin (L8) |
| 7 | Managed labels | Label of that name exists | Labels from `managedLabels` in each repository Avoozl labels (L10) |
| 8 | `.avoozl.json` | — | One diff with mode, repository, Project number, field names, `statusValues`, `epicIssueType`, labels; written only after review, through the Settings edit path (§4.4) |

**Rules.**

- **Preview, then one confirmation.** The preview lists every GitHub write:
  object, owner, name, and the visibility it will have. Nothing is written
  before the person confirms. Step 8 is a file change and gets its own
  review after the writes, because it holds IDs GitHub assigns.
- **Idempotent.** Each step matches by name (repository, Project title or
  number, field, option, view, issue type, label) and adds only what is
  missing. A second run builds an empty plan and shows "Nothing to change".
- **Never deletes or renames.** The wizard calls no delete endpoint. It never
  changes an existing object's name, type, color, description, or
  visibility. A same-named object of the wrong kind (for example a text
  field named Release) is reported; the person picks another name, and the
  wizard writes that name into `project.fields`.
- **Adding Status options keeps the old ones.** The field update replaces
  the whole option list (L6), so the wizard sends every existing option with
  its own `id`, name, color, and description unchanged, then appends the new
  ones. It re-reads the field, and fails the step if any old option changed.
- **Partial success.** A step refused for scope or permission (HTTP 401, 403,
  or a GraphQL `FORBIDDEN` error) is reported with the reason and the fix.
  Every step that does not depend on it still runs. Without the `project`
  scope, steps 4, 5, 5b, and 5c are skipped and make no call that writes.
- **Private by default.** New repositories and Projects are private. An
  existing public one is reused as is and shown as public in the preview.

**What is left by hand.** The wizard ends with a short checklist, each item a
link:

- only when step 5b fell back to GraphQL: in `Board by release`, **Group by
  Release, then Save**; in `Table by wave` (if made), **Group by Wave, then
  Save** (L7a);
- optional: apply a built-in template; Avoozl works without one (L9);
- the built-in workflow settings that differ from the recommendation, or
  that the API cannot read, in **Project → Workflows** (L12). Recommended
  (Requirement 33.6, **Proposed**):

  | Workflow | Setting |
  |---|---|
  | Auto-add sub-issues to project | On |
  | Auto-add to project | On, filter `is:issue label:<managed label>` |
  | Item added to project | On, Status Todo |
  | Pull request linked to issue | On, Status In progress |
  | Item closed | On, Status Done |
  | Pull request merged | On, Status Done |
  | Auto-close issue | **On**: a drag to Done closes the issue as done, which §6.5 judges by the actor (changed 2026-11-12: was off) |
  | Auto-archive items | Off |
  | Item reopened, Code review approved, Code changes requested | Not needed; leave as the person likes |

  The wizard checks `enabled` for each listed workflow it can read. It cannot
  read a workflow's Status target or filter, so those lines always stay on
  the checklist with "check the column". On `nupp-lang` Project #2 Auto-close
  issue is already on (F55), so its checklist has no Auto-close item;
- optional: add a Roadmap view later. It needs date fields, which Avoozl
  does not set, so the wizard never makes one.

**GitHub API limits.** Checked 2026-11-11 against the docs and by
introspecting the live GraphQL schema (read-only); L7a and L7b updated from
a live run on 2026-11-12.

| # | Limit | Label | Source |
|---|---|---|---|
| L1 | Classic tokens and `gh` OAuth tokens list their scopes in the `X-OAuth-Scopes` response header; `gh auth refresh -s <scope>` adds a scope. Fine-grained tokens have no scopes, so the wizard probes with read calls instead (**Inferred**) | **Verified** | [Scopes for OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps); [gh auth refresh](https://cli.github.com/manual/gh_auth_refresh) |
| L2 | A repository can be created private for an organization or the user | **Verified** | [Create an organization repository](https://docs.github.com/en/rest/repos/repos#create-an-organization-repository) |
| L3 | Issues are turned on with `has_issues` on a repository update | **Verified** | [Update a repository](https://docs.github.com/en/rest/repos/repos#update-a-repository) |
| L4 | `createProjectV2` takes an owner and title but no visibility; `updateProjectV2` sets `public`. Whether a new Project starts private is not documented, so the wizard always sets it (**Inferred**) | **Verified** (schema) | [Using the API to manage Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects); [Managing visibility](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/managing-visibility-of-your-projects) |
| L5 | `createProjectV2Field` creates single-select fields with options and iteration fields with a start date and duration | **Verified** (schema) | [Using the API to manage Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects) |
| L6 | `updateProjectV2Field` replaces a field's option list; an option keeps its identity, and items keep their values, only if its `id` is sent | **Verified** (schema field description) | [Using the API to manage Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects) |
| L7a | GraphQL `createProjectV2View` creates a view with a name, a layout (`BOARD_LAYOUT`, `TABLE_LAYOUT`, `ROADMAP_LAYOUT`), and `configuration.visibleFieldIds` only. It has no group-by input. Seen live 2026-11-12 on `nupp-lang` Project #2: a `BOARD_LAYOUT` view came back with Status columns and empty `groupByFields` | **Verified** (2026-11-12, `createProjectV2View`) | [Using the API to manage Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects); live schema introspection 2026-11-11 |
| L7b | The REST docs list `POST /orgs/{org}/projectsV2/{n}/views` (and a user form) with `layout`, `vertical_group_by`, and `group_by`. On `nupp-lang` it returned 404 on 2026-11-12, so whether it is live, and whether its grouping works, is not proved. P24 checks it | **Inferred** | [REST Project views](https://docs.github.com/en/rest/projects/views) |
| L8 | Creating an organization issue type needs an organization admin and, for classic tokens, `admin:org`. Only organizations have this endpoint; on a user account the wizard skips step 6 (**Inferred**) | **Verified** | [REST issue types](https://docs.github.com/en/rest/orgs/issue-types); F44 |
| L9 | No API applies a built-in template. `copyProjectV2` copies an existing Project, which covers organization templates, which are Projects. No mutation creates or turns on a built-in workflow; only `deleteProjectV2Workflow` exists | **Inferred** (absent from the schema and docs) | [Managing project templates](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/managing-project-templates-in-your-organization); [Built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations) |
| L10 | Labels are created per repository; creating a name that exists fails with 422 | **Verified** | [Create a label](https://docs.github.com/en/rest/issues/labels#create-a-label) |
| L11 | `createProjectV2Field` takes `NUMBER`. Grouping a table by a number field is **Inferred**: the docs list only title, labels, reviewers, and linked pull requests as fields you cannot group by | **Verified** (schema); grouping **Inferred** | [Customizing the table layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-table-layout) |
| L12 | Built-in workflows can be read but not set: `ProjectV2.workflows` gives `name`, `number`, and `enabled`; there is no field for the target Status or filter, and the only workflow mutation is `deleteProjectV2Workflow` (F55). The wizard never deletes one. Workflows not yet configured may not be listed (**Inferred**) | **Verified** (2026-11-12, live schema and read-only query) | [Built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations); F55 |
| L13 | `createLinkedBranch` takes `issueId`, `repositoryId` (may differ from the issue's repository), `oid`, and `name`, and needs push access to that repository | **Verified** (F51) for same-owner user repositories; organizations **Inferred** until P25 | F51, F52 |

The API can create views (L7a), so the view moved from the checklist into
step 5b; only its grouping may be left as a click. The owner chose a Board
over a Roadmap (2026-11-12), because tasks have no known durations.

P24 proves the wizard.

### 8.3 Routing page

**Proposed**, owner request 2026-11-12 (Requirement 42). Changed
2026-11-13 (owner decision): Routing is a Settings tab, and holds one
routing prompt instead of rules, presets, a scorer and a router form; the
separate Providers tab folds in. The tab follows the settings style the
owner set: a heading and one short line per section, plain labels with the
raw key shown small, Required or Optional on every field, defaults as
placeholders, and an empty section that says what to do. Everything here is
saved on this machine only.

```text
Settings › Routing
Off by default: every task runs on this machine. On, one routing prompt picks
a crew and a model for each ready task, among the options that pass the checks.
┌ Routing prompt ─────────────────────────────────────────────────────────┐
│ Tell the routing agent how to choose. It only picks among options that  │
│ pass the checks below.                                                   │
│ [x] On   One call each tick ranks every ready task. A bad reply → local. │
│ Prompt (optional, routing.prompt, saved on this machine only)           │
│ [ Tests go remote. Everything else stays local.                       ]  │
│ Examples: [+ Tests go remote] [+ Private repos stay local]              │
│           [+ Spread the load] [+ Prefer Kiro models when Claude is low] │
│           [+ 70% Claude, 30% Kiro]                                      │
│ Routing agent's model [ default ▾ ]                          [Save]     │
│ Last call router-12: 4 tasks, answered.                                 │
├ Providers ──────────────────────────────────────────────────────────────┤
│ Health and usage in the last 5 hours, read live. Out is never offered.  │
│ Provider  Health  Usage       Limit (credits per 5 h)                    │
│ claude    low     85% used    [ 500 ]                                    │
│ kiro      ok      no usage    [ none ]                                   │
│ Low at (% of limit) [ 80 ]                                   [Save]     │
├ Crews ──────────────────────────────────────────────────────────────────┤
│ Crew       Tags          Chats Load Memory Online   Ready  Reaches repos │
│ local      os:macos      2/3   0.8  3 GB   yes      yes    yes      [✎] │
│ build box  os:linux      0/4   0.2  24 GB  yes      yes    yes   [✎][🗑]│
│ win box    os:windows    –/2   –    –      stale 4m unknown no hosts [✎] │
│ Remote crews wait on Kiro Crew (MC-10). Every chat runs on local.        │
│ Stale after [ 120 s ]                                        [Save]     │
├ Preview ──────────────────────────────────────────────────── [Preview] ─┤
│ 3.2 Parse flags   the routing agent picks among 4 options               │
│     options: local / default; build box / default; …                     │
│ 4.1 Audit export  local / default: the only option that passed          │
│     ruled out: build box (content rule set c1 forbids remote crews)     │
│ 5.3 Windows paths ◆ Needs you: no crew passes the checks                │
│ ▸ What the routing agent would get                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Routing prompt.** The switch is off by default, and on with an empty
prompt counts as off. Each example button appends its text on its own line,
once; the person edits it. The model picker lists the models Kiro Crew
offers this machine. The last call's line says what happened, including a
fallback and why.

**Providers.** One row per provider or model with usage, a limit or a mark
(§4.20 Facts). A limit field per row turns usage into a percent; **Low at**
is the one threshold. `out` shows in yellow; Undo for a person's mark lives
in the Switch model dialog.

**Crews.** One row per crew from §4.10's registry, with each check's result
and why. Edit opens a side form (Trust, Tags, Git hosts, Chat limit,
hand-back; Trust Required, the rest Optional; the Chat limit placeholder is
3 for `local` and 2 for a remote crew). One **Stale after** field sets
`crewStaleSeconds`, placeholder 120 s. Remove clears this machine's
settings for the crew and asks for confirmation first; it does not
disconnect the crew from Kiro Crew. Until MC-10 ships, the section shows one
neutral line: "Remote crews wait on Kiro Crew (MC-10). Every chat runs on
local."

**Preview.** Runs the hard checks read-only over the current ready tasks:
each task's options, what ruled the rest out, and what would happen; with
the prompt on, the exact brief one call would get, folded. It opens no
session, calls no agent, and writes no state.

**Colors.** Yellow marks only what needs the owner: a no-fit task and an
out provider. Stale crews and waiting tasks use a neutral Kiro palette
color. Remove is red and confirms first.

### 8.4 Flow tab and Flow settings

**Proposed**, owner request 2026-11-12 (Requirement 48, §4.11). One tab
answers "where does the time go, and what should change". It shows only
graph and delivery timing; pull requests and CI runs stay in Issue Radar and
GitHub, and the tab links out to them. The icon is `Gauge` (check that the
Kiro Crew host exports it, as `icons.ts` requires; else `Timer`), before the
heading and on the nav tab.

```text
◔ Flow                                                  Workspace: example ▾
Where delivery time goes, and what the last retro proposed.
┌ Filters ───────────────────────────────────────────────────────────────┐
│ Repository [all ▾]  Epic [all ▾]  Window [last 20 tasks ▾]  Stage [all ▾]│
└────────────────────────────────────────────────────────────────────────┘
┌ Lead time ────┐ ┌ Flow efficiency ┐ ┌ First-pass rate ┐ ┌ Time to fix ──┐
│ 3 h 10 m      │ │ 34%             │ │ 70%             │ │ 42 m          │
│ was 4 h 05 m  │ │ was 28%         │ │ was 60%         │ │ was 1 h 30 m  │
└───────────────┘ └─────────────────┘ └─────────────────┘ └───────────────┘
┌ Biggest bottleneck ────────────────────────────────────────────────────┐
│ CI wait: 41% of lead time in example/app (median 23 min per task).      │
└────────────────────────────────────────────────────────────────────────┘
┌ Time per task ─────────────────────────────────────────────────────────┐
│ 4.1  ▇▇ queued ▇▇▇▇▇▇ coding ▇▇ tests ▇▇▇▇▇▇▇▇ ci-wait ▇ merge   2 h 40 m│
│ 4.2  ▇ ▇▇▇▇ coding ▇▇▇▇▇▇ rework ▇▇ review ▇ merge          ⓘ   3 h 55 m│
│ (coarse) marks bars built from reports, not tool calls                   │
└────────────────────────────────────────────────────────────────────────┘
┌ Retros ────────────────────────────────────────────────────────────────┐
│ Retro 3 · after 10 tasks · bottleneck ci-wait                            │
│   Raise batch max to 5 (flow.batch.max 3 → 5)   lead time ↓              │
│   evidence: 7 of 10 tasks were small in 2 epics     [Reject] [Approve]   │
│ Retro 2 · approved: local checks first on · PDCA: CI wait −38%, helped   │
└────────────────────────────────────────────────────────────────────────┘
```

- **Metric cards.** Each shows the window's value and the previous window's.
  A card with no data says what produces it ("Finish a task to see lead
  time").
- **Time per task.** One stacked bar per task, colored by stage, with a
  legend; bars from phase markers or events are marked coarse. The info
  icon opens the task drawer.
- **Biggest bottleneck.** The stage with the most waiting or rework in the
  window, from the same numbers, so it matches what a retrospective would
  name.
- **Retros.** Newest first, each with its bottleneck, proposals, and
  **Approve** and **Reject** (Approve is not red; a "removes a check"
  proposal asks a second time). Approved proposals show their PDCA result
  when it is in. **Run a retro now** starts one by hand. Empty: "A retro runs
  after 10 finished tasks."
- **Task drawer.** A **Timing** fold after **Delivery**: the task's bar,
  each span's stage, length, and source, and the batch it ran in.
- **Dashboard banner.** While a stop is open, above every other section:
  "Line stopped: `npm test` fails on `main` since `abc1234` (task 3.2).
  Fix: 3.2.fix-1, running. 4 tasks paused." with **Open fix task** and
  **Run anyway** (asks to confirm). Red, because new work is stopped. After
  Run anyway the banner stays and says so.

Settings gets one **Flow** group, laid out like the other groups (a heading
and one short line per sub-group, plain labels with the raw key small,
"(required)" or "(optional)" in plain text, defaults as placeholders):

```text
Flow
How Avoozl measures delivery time and reacts to slow or broken work.
┌ Timing ────────────────────────────────────────────────────────────────┐
│ Always on. Avoozl records where each task's time goes; nothing to set.  │
└────────────────────────────────────────────────────────────────────────┘
┌ Stop the line ─────────────────────────────────────────────────────────┐
│ When a change breaks a check that passed, pause new work until it's fixed.│
│ What to pause (optional)  ○ Tasks that build on it  ○ This repository    │
│ flow.stopTheLine.scope    ○ Everything                                   │
└────────────────────────────────────────────────────────────────────────┘
┌ Local checks first ────────────────────────────────────────────────────┐
│ Run the checks here before any push, so CI only confirms.               │
│ [x] Require a local pass before push (optional)   flow.localChecksFirst  │
└────────────────────────────────────────────────────────────────────────┘
┌ Batching ──────────────────────────────────────────────────────────────┐
│ Run small related tasks together to pay setup and checks once.          │
│ Most tasks per run (optional) [ 3 ]  flow.batch.max                      │
│ Group by (optional)  ○ Same phase ○ Same files      flow.batch.by        │
└────────────────────────────────────────────────────────────────────────┘
┌ Retro ─────────────────────────────────────────────────────────────────┐
│ A review that finds the biggest slowdown and proposes one change.       │
│ After this many tasks (optional) [ 10 ]  flow.retro.everyTasks           │
│ Slow when over (optional) [ 3 ] × usual  flow.retro.slowFactor           │
│ Model (optional) [ auto ▾ ]              flow.retro.model                │
│ Instructions (optional) [                     ]  flow.retro.instructions │
│ Saved on this machine only.                                              │
└────────────────────────────────────────────────────────────────────────┘
```

The scope choice is a card picker in the page (three small cards, each
saying what it pauses and when to pick it); the sketch shows it as radio
buttons only for space. Local-only mode shows every Flow sub-group, because
all of them apply to local delivery; the local-checks-first line says it
matters only when sessions push.

Owner approval 2026-11-13 (Requirements 68–70): the Flow tab gains
**Proposals** and **Lessons** views, and Settings › Flow a **Lessons**
sub-group, sketched in §4.18.

### 8.5 Intake tab

Renamed from Untriaged on 2026-11-13 (R50.23). **Untriaged** is the tab's
default filter; setting keys and the `untriaged` notification channel keep
their names. Built: the GitHub read is SQLite now (`github` incoming items
and a `github:<repo>` `intake_sources` row), not `untriaged.json`.

**Proposed**, owner request 2026-11-12 (Requirement 49). Avoozl acts only on
issues a trigger rule matches and reads only pull requests tied to its
tasks, so anything else is invisible in Avoozl, and Issue Radar notifies
only on CI failures for the owner's own pull requests. Only Avoozl knows
which open items no rule will pick up. This tab lists them and hands each
one to the app that does the work. It is the one exception to the
no-triage-view rule (§2): it shows no bodies, comments, CI logs, or review
findings and edits nothing.

The icon is `Inbox` (the host exports it), before the heading and on the
nav tab. The count badge uses the host's accent color (the `info` badge), not
yellow: an untriaged item waits for someone, not necessarily the owner.
The tab and the Dashboard count are hidden in Local only mode.

```text
▣ Intake                                                 Workspace: example ▾
Open issues and pull requests no trigger rule, triage label, or task covers.
┌ Filters ───────────────────────────────────────────────────────────────┐
│ Repository [all ▾]  Kind [all ▾]  Age [any ▾]  Author [all ▾]  Label [all ▾] │
│ 37 untriaged · checked 4 min ago [Check now]   [Open selected in Issue Radar]│
└────────────────────────────────────────────────────────────────────────┘
┌──┬─────────────────────────────────┬───────────┬────────┬─────┬────────┬───┬─────────┐
│☐ │ ◉ #142 Crash on empty input       │ org/app   │ alice  │ 2 d │ bug    │ 3 │ (◎)     │
│☐ │ ⇄ #145 Bump parser  draft · ✓     │ org/app   │ bob    │ 5 h │        │ 0 │ (◎)(⌕)  │
└──┴─────────────────────────────────┴───────────┴────────┴─────┴────────┴───┴─────────┘
  ◉ issue  ⇄ pull request  (◎) Open in Issue Radar  (⌕) Code review
```

**Settings.** One **Untriaged** group under Settings › Repositories ›
Triggers and labels, per repository:

| Field | Key | Rule |
|---|---|---|
| Untriaged filter (optional) | `untriaged.filter` | The trigger grammar of §4.4, parsed by the same code, without the rule that a line needs a `label:` term. Blank means `-label:<each triage label>`, shown as the placeholder. Chips and a count of matches, like a rule's line. |
| Triage labels (optional) | `untriaged.triageLabels` | Checkboxes from the repository's labels on GitHub. A saved name GitHub no longer has stays, marked. A managed label is refused. |
| Ignore older than (optional) | `untriaged.ignoreOlderThanDays` | Whole days, 1 to 3650; blank shows every age. |
| Notify me (optional) | `untriaged.notify` | Off by default. |

**Reading.** The tick cron, which already reads GitHub, runs one GitHub
GraphQL search per repository at most every 10 minutes:
`repo:<owner/repo> is:open <filter> -label:<triage label>… created:>=<date>`,
up to 3 pages of 100 items, each with number, title, URL, author, created
time, labels, comment count, and for a pull request its draft state, its
head commit's check rollup, and the issues it closes. One query per
repository keeps the cost to a few GraphQL points a tick (F12's lesson
applies to the tick's own listing, which stays by label; this list is a
view, so search lag only delays it). Results go to `untriaged.json` beside
the database, with `checkedAt`, the query, and any error; a failed read
keeps the last items. A changed query is read on the next tick.

**Excluding.** `untriaged.view` applies Requirement 49.2 at read time: it
drops items with a triage or managed label, issues any rule matches by
labels, assignee, and author (the matcher of §4.4 without the actor check:
a rule that would match but for the actor still covers the item), issues
that are a task's issue, and pull requests a task records or that close a
task's issue. `refresh: true` reads GitHub first, for **Check now**.

**Hand-off links** (F98, F99). Until MC-14, Kiro Crew has no link to one
item in either app:

| Button | Target | Now |
|---|---|---|
| Number and title | GitHub item | Exact, new tab, `rel="noopener noreferrer"` |
| Open in Issue Radar | That item in Issue Radar | `/issue-radar`; tooltip: "Issue Radar can't open one item from a link yet. Opens Issue Radar; pick <repo> #N there." |
| Code review (pull requests) | Code Review Sage's review of that pull request | `/code-review-sage`; tooltip: "Code Review Sage can't open one pull request from a link yet. Opens Code Review Sage; pick <repo> #N there." |
| Open selected in Issue Radar | Issue Radar with the selection | `/issue-radar`; tooltip names the selected numbers |

**Notice.** With `untriaged.notify` on for any repository, a tick whose
fresh count for those repositories is higher than at the last notice, and
an hour or more after it, queues one `untriaged` notification for the
workspace: "N untriaged in <repo>, …". It links to the Avoozl page.

**Send to Issue Radar** (Requirement 52, added 2026-11-13). The Untriaged
tab is no longer read-only for one action: a person may label issues for an
Issue Radar crew. The row button and the bulk button open one dialog:

1. **Pick a crew.** The backend reads `GET /api/apps/issue-radar/crews`
   through the gateway client when the app token may (a `permissions.api`
   grant). Each crew shows its name, state and scope labels; picking one
   uses its first scope label. An empty scope shows a warning: that crew
   takes every open issue, so no label is needed. Without the grant (403),
   with Issue Radar off, or with the repository not connected there, the
   dialog says why and the person types the label. The draft upstream ask
   is for a read-only, app-reachable crew list, because a grant has no
   method and `/crews` also admits `POST /crews` and `PUT /crews/settings`.
2. **Confirm.** The dialog names the label and every item. The label is
   refused when empty, over 50 characters, starting `crew:`, managed, a crew
   label, or a positive trigger label of the repository.
3. **Write.** `untriaged.handoff` (owner session only) checks the person's
   `gh` login against Who counts, passes the label through content rules
   (`github` boundary), adds it to each issue, and stores a `radar-handoff`
   receipt per item. Per-item results come back.

`untriaged.view` returns a second list, `withRadar`: candidate issues not
tied to a task that have a hand-off receipt or carry the crew claim or
needs-human label. They leave the Untriaged count. Each row says claimed or
not and needs a person or not. A needs-human row also shows under Needs you
(as a `needs-human` item with reason `crew` and the issue link).
shortcut: a handed-off issue that leaves the cached read (closed, or
filtered out) leaves the list; keep receipts if a history view is asked
for.

**Every source** (Requirement 50.15, 50.16, added 2026-11-12). The list
reads incoming items (§4.12), so it covers every declared source, not
GitHub alone. The filter panel gains **Source**, and each row shows its
source. GitHub rows keep everything above. A non-GitHub item is untriaged
when it is open, matches no rule of its source's repository (actor check
aside, as for GitHub), and is tied to no task. Its row links to the item's
`link` in a new tab, shows no Issue Radar button, shows **Code review**
for kind `review`, and offers a person **Plan this** and **Deliver this**,
which refuse a session caller or MCP with 403. In Local only mode the tab
shows when a non-GitHub source is declared, with only those sources; with
none, it stays hidden as before. **Check now** on a plugin source polls it
once. A non-GitHub source's items count toward its repository's notice.

**Code review chat** (added 2026-11-13, R49.16–18; a stand-in until MC-15).
**Code review** on a pull request calls `review.chat` (person only). It
checks for `~/.kiro/crew/skills/sage-review/SKILL.md`, builds the seed from
the cached search row (the search now reads `headRefOid`), runs content
rules on it, and stores one `pr-review:<repo>#<n>` receipt. The cron's next
tick opens the chat without a project folder, binds it as role `pr-review`
to the receipt, and sends the seed; the row then shows **Attach**. A queued
or open chat is reused; a closed one gets a new attempt. Avoozl makes no
GitHub call for it, and the seed tells the chat to post nothing.

#### Facts

| # | Fact | Evidence |
|---|---|---|
| F98 | **Verified (source).** Issue Radar's page is the route `/issue-radar` and reads no query string or hash: nothing under `website/src/apps/issue-radar/` calls `useSearchParams` or reads `location.search` or `location.hash`; its repository and selection are restored from local storage. Its own CI notice links to the bare route. So no link can open a repository, a filter, a selection, or one item. | Kiro Crew `01561d008`: `website/src/apps/builtinRegistry.ts:67`; `website/src/apps/issue-radar/IssueRadarPage.tsx`; `website/src/apps/issue-radar/context.tsx:27`; `src/kiro_crew/apps/builtins/issue_radar/backend/ci_watch.py:62` |
| F99 | **Verified (source).** Code Review Sage's page `/code-review-sage` reads only `?run=<run_id>`, a review run's ID, once at mount; there is no pull-request parameter. Avoozl does not know run IDs. | `website/src/apps/builtinRegistry.ts:64`; `website/src/apps/code-review-sage/CodeReviewSagePage.tsx:17`; `website/src/apps/code-review-sage/context.tsx:194` |
| F100 | **Verified (source).** Avoozl's other links to Issue Radar already use `/issue-radar` with `target="_top"`. | `src/app/github-policy.mjs` `ISSUE_RADAR_PATH`; `kirocrew-app/ui/src/SettingsView.tsx` `CrewScopes` |

---

### 8.6 New plan

**Built**, owner request 2026-11-13 (Requirement 57). The Plans page's New
plan button opens a right drawer. Submit calls `plan.new`, a page-only
operation (agents and MCP are refused). It checks the fields, runs content
rules on the seed at the `brief` boundary, records the request and returns
the seed. The page then opens a chat with the `avoozl-planner` agent in
draft mode. After each tick, a requested folder that lints clean is stored
as a draft plan. A folder that never lints clean stays pending and can be
imported by hand.

Changed 2026-11-13: the drawer starts with Blank or From template, and a
template fills the seed (§4.16).

**Spec Builder hand-off** (built 2026-11-13, Requirement 65). The owner
approved the grant `/api/apps/spec-builder/specs`. Kiro Crew matches a
grant as a path prefix for every method, so it also reaches approve,
handoff, execute, task, stop and delete under it; Avoozl's page calls only
`POST /api/apps/spec-builder/specs`, and a source scan test enforces that.

1. Open in Spec Builder calls `plan.new` with `preview`. It checks the
   fields and reads `.kiro/steering/avoozl-specs.md` in the spec root,
   recording nothing.
2. A missing file is shown in full in the drawer. **Add the file** writes
   it (create-only, never over a copy); **Skip the file** puts the same
   rules in the description. A present or changed copy is left alone.
3. `plan.new` with `handoff: "spec-builder"` runs content rules on the
   description, records the request and returns the create body: `name`,
   `working_dir` (the spec root), `spec_type: "feature"` (quick skips
   design.md) and `description`.
4. The page posts it to Spec Builder, then opens `/spec-builder` through
   the SDK's navigate. Spec Builder has no deep link; its page opens the
   spec named by its own last-open entry, which Avoozl sets first.
5. Spec Builder's seed tells its agent to write requirements.md,
   design.md and tasks.md only, and appends the description as the user's
   words. Its chat runs the default agent with the spec root as its
   folder, and that agent's resources include `.kiro/steering/**/*.md`.
6. Each tick, once the prose files exist and `tasks.md` is unchanged since
   the last tick, Avoozl writes `avoozl/manifest.json` from it: an item with
   sub-items is a `package` that requires them; every other item is a
   `leaf` whose bullets are its acceptance, with `_Repository:_`,
   `_Requires:_`, `_Checks:_` and `_Manual_` read into their fields and the
   one picked repository as the default. Then the folder lints and imports
   as a draft. Until the first approval, a changed `tasks.md` rewrites a
   manifest Avoozl wrote and nobody edited.
7. A refused create maps to words: `app_disabled` says to turn Spec
   Builder on in Apps; an SDK grant refusal says to approve the update in
   Apps › Updates; both offer the planner chat with the same fields.

MC-16 is no longer needed for create. Kept narrowed as a nice-to-have: a
grant entry for one method and exact path, so the app could not reach
Spec Builder's approve, handoff and delete routes at all.

### 8.7 Specs: the page's name

**Proposed**, owner approval 2026-11-13 (Requirement 62). People write
`.kiro/specs/<name>/` folders, and the page called them plans. The page
now says spec wherever a person reads it. Inside Avoozl the record is
still a plan, so no interface moves.

| Shown to people | Kept as is |
|---|---|
| Specs tab and heading; New spec, Edit spec, Discuss spec, Delete spec, Archive spec, Unarchive spec, Change spec (was Plan a change) | `plans_*` MCP tools; `plan.*` and `plans.*` operations |
| Spec filters and columns in Dashboard, Graph, Delivery, Flow, Intake and Conflicts | CLI commands and flags; `.avoozl.json` keys |
| Drawer, dialog, tooltip, aria and empty-state text; notices; page-shown operation messages | SQLite tables and columns; receipt and marker fields |
| `docs/`, README, shipped skills and agents | The Plans repo mode and its plans repository; `avoozl-planner`; `docs/research/`, `docs/evidence/` |

Plan as a verb stays (**Plan this**, "plan a goal"). The guard is a test
over the page's source: it collects JSX text and string literals,
matches `\bplans?\b` case-blind, and fails on any match not in its
allowlist. Each allowlist entry is one exact string with the reason it
stays, so a new string fails until someone decides.

### 8.8 Ideas

**Proposed**, owner approval 2026-11-13 (Requirement 63). An idea is a
rough thing to riff on before it is worth a spec. It rides the incoming
item record (§4.12) so it lists, filters and stores like any intake item,
but it is the one kind that never meets the pipeline's trigger match.

#### The record

```json
{ "source": "local", "id": "idea-7f3a2c", "kind": "idea",
  "title": "Graph minimap for big plans", "state": "open",
  "notes": [{ "text": "Maybe only past 200 nodes.", "author": "person", "at": "2026-11-13T16:02:00Z" }],
  "links": [{ "url": "https://example.com/minimap", "label": "Prior art" }],
  "updatedAt": "2026-11-13T16:02:00Z" }
```

`local` is already reserved (R50.6) and is never declared. A graduated
idea adds `graduated: { spec, at }`. `body` is the notes joined, so search
and content rules read one text. Ideas are stored in `incoming_items`
like other items, keyed `local\0<id>`.

#### Operations

| Operation | Kind | Who | MCP action | CLI |
|---|---|---|---|---|
| `idea.capture` | act | anyone; a session is recorded as author | `capture_idea` | `avoozl intake idea add` |
| `idea.append` | act | anyone on an open idea; append only | `add_idea_note` | `avoozl intake idea note` |
| `idea.archive`, `idea.restore` | act | person only (403 for a session or MCP) | none | `avoozl intake idea archive`, `restore` |
| `intake.list` with `kind: "idea"`, `intake.view` | observe | anyone | `items`, `item` | `avoozl intake list --kind idea` |

Capture and append run the `intake` content boundary (§4.9) on the new
text. A block refuses the write; it does not quarantine, because an idea
has no work to hold. No new MCP tool name: the actions join the grouped
`plans_intake` tool (R56).

#### Never runs work

`takeItem` returns before trigger match for kind `idea`. `intake.deliver`
and `intake.plan` refuse an idea with 409. The Untriaged count, badge and
notice skip ideas, and no tick step writes them anywhere. The 30-day purge
skips them.

#### Page

**+ New idea** sits in the Specs page header and the Intake header, and
opens one small modal: Title (required), Notes, Links (one per line). The
Intake tab's **Kind** filter gains **Idea**; the Specs page header also
shows **Ideas (N)**, which opens Intake with that filter. Opening an idea
shows a drawer with its notes and links, **Add note**, **Add link**,
**Riff on this**, **Make it a spec** and **Archive** (or **Restore**).

**Riff on this** asks `chat.context` with purpose `riff-idea`. The seed
gives the idea as data and says: make no file, Git or GitHub change; you
may add notes and links to this idea with `plans_intake` `add_idea_note`.
The page opens the chat with the app SDK, like **Discuss spec**.

**Make it a spec** opens the New spec flow through its one entry point
(§8.6), prefilled: Name from the title as a spec folder name, What you
want from the title and notes, Links and context from the links, and the
idea key. The request operation marks the idea graduated when it records
the request. Avoozl adds no second path to Spec Builder.

#### Why each choice

| Choice | Why |
|---|---|
| An incoming item kind | One list, one store, one filter panel; the owner asked for it |
| Source `local` | Already reserved; an idea comes from this workspace, not an outside system |
| Agents may capture and append | Writing a note starts nothing; limits cap it; content rules screen it |
| Archive, restore, graduate are a person's | They change what the owner sees and decides |
| Reuse the New spec entry point | One place owns spec rules and the Spec Builder hand-off |

### 8.9 Searchable pickers

Added 2026-11-13 (Requirement 73). `Picker.tsx` is one combobox for every
task and spec choice: the Stop the line target, the filter panels' task
and spec fields, Start now, and any later one. Repositories keep their
short select.

- **Items.** `{id, title, spec?, state?}`. The match is a lower-case
  substring test on `id`, `title` and `spec`, run over a list built once
  per item set; an ID that starts with the text sorts first. At most 50
  results render, with "N more; type to narrow".
- **Keys.** Down and Up move the highlight, Home and End jump, Enter picks,
  Esc closes the list, and a second Esc clears the text. Tab leaves
  without picking.
- **ARIA.** The input is `role="combobox"` with `aria-expanded`,
  `aria-controls`, `aria-autocomplete="list"` and
  `aria-activedescendant`; the list is `role="listbox"` and each result is
  `role="option"` with `aria-selected`. The state shows as a small badge
  beside the title.

### 8.10 Task files and diffs

Added 2026-11-13 (Requirement 81). The task drawer's Files fold
(`TaskFiles.tsx`, `files-api.ts`) reads only when first opened.

- **Where.** `task.files` and `task.diff` (`src/app/task-files.mjs`) find
  the task's `task_worktrees` row. A worktree still on disk is read as is,
  untracked files too; else the branch (`refs/heads/<branch>`, then
  `origin/<branch>`) in the repository's checkout; else `mode: none`. The
  base is the merge base of the head with the integration branch, else the
  base branch. A remote crew's task, or one with no worktree, shows its
  branch on GitHub.
- **Reads.** `git diff --name-status -z -M` and `--numstat -z` give the
  list; `ls-files` and `ls-tree` give Show all files. `task.diff` runs one
  `git diff ... -- <path>` and builds an untracked file's diff itself after
  an `lstat`. Every call is `execFile` with `--literal-pathspecs`,
  `core.fsmonitor=false`, the gateway secrets stripped, `--end-of-options`
  before refs, and `--` before paths.
- **Paths.** A path must be relative with forward slashes and no `.`,
  `..` or empty part, and must be one Git lists for the task (or in the
  tree, which reads as unchanged). An untracked link is reported, never
  read.
- **Caps.** 3,000 files listed; a diff over 256 KB returns `tooLarge` with
  its counts; binaries return `binary`. The page draws the first 1,500
  lines with a button for the rest.
- **Editor.** `kiro://file/<path>[:line]` or `vscode://file/<path>[:line]`,
  picked on the fold and kept in the page's storage; Kiro by default.

## 9. Current-code disposition

Covers `feature/kirocrew-github-delivery` and the `main`-only modules (F19).
The branch must be rebased onto `main` before any change lands.

| Area | Files | Disposition | Reason |
|---|---|---|---|
| SQLite task storage | `store.mjs` entities, edges, events, evidence, receipts, integration, work_locks | **Adapt** | Add `authority`, `kind`, `route`; keep as local authority and GitHub cache |
| Run-era tables | runs, run_capabilities, surface_capabilities, provider_events, usage_*, deliveries, requests, outbox, batches | **Replace** with session bindings and dispatch receipts; keep old tables read-only for history | Agent runs move to Kiro Crew |
| Plan documents | `plans.mjs`, plans and approvals tables, `plan-reviews.mjs` | **Adapt** | Design text lives in Kiro spec folders (§6.8); SQLite keeps revision hashes and approval receipts; review threads stay for plan critique |
| Task extraction | `extractPlan`, `plan-quality.mjs`, `task-dedup.mjs`, `task-identity.mjs` | **Keep**; `extractPlan` becomes migration-read-only, and a new spec-folder reader feeds the same `lintPlan` | Deterministic validator and dedup are the compiler core; fenced plan files are no longer written (Requirement 30.8) |
| Design-prose extraction (`main`) | `design-extraction.mjs` | **Adapt** | Feeds the critique's coverage check; advisory, never authoritative |
| Dependency graph | `query.mjs`, `model.mjs`, `graph-layout.mjs`, `progress-model.mjs` | **Keep** | Readiness and layout are reused by the app page |
| GitHub intake | `syncGitHubIssues`, `parseIssueTask`, authorization in `github-sync.mjs` | **Adapt** | Rules engine (§4.4), snapshot freeze kept, public repos allowed |
| Intake callback | `github-intake.mjs` capability tokens and `/api/github-intake` | **Delete** | Own webhook receiver (Requirement 26.1) |
| GitHub queue browser | `github-queue.mjs`, `github-overlap.mjs`, queue tables | **Delete** | Duplicates Issue Radar browsing |
| Label behaviors | `github-label-behaviors.mjs` | **Replace** | Becomes `managedLabels` |
| GitHub projection | `projectPlanIssues` | **Adapt** | Marker v2, closed-issue reuse, sub-issues, issue dependencies, epic issue type, title and body conflicts, namespace writer, private-only check removed |
| Completion | `github-completion.mjs` | **Adapt** | Wire into the tick and release; accept a closer in the leaf's registered code repository (drop the same-repository limit) and read its checks there; no branch-name matching (§6.5) |
| GitHub client | `github.mjs` | **Keep**, extend | Add sub-issue, issue dependency, issue type, and Projects REST endpoints (F37–F41) |
| Repository settings | `repository-settings.mjs`, `layered-config.mjs`, `config.mjs`, `agent-instructions.mjs` | **Adapt** | New policy schema; instruction rules feed briefs |
| Workspace manager | `workspace-manager.mjs`, `catalog-store.mjs`, `workspace.mjs`, `workspace-repositories.mjs` | **Adapt** | Becomes the node backend's workspace registry; drop host-ownership epochs tied to the agent host |
| Workspace publication | `workspace-repository.mjs`, `source-sync.mjs` | **Keep** | Git durability for local authority (F36) |
| Local integration | `git.mjs` `integrateRun` | **Keep** | Proven merge path (F34) |
| Agent host | `agent-host.mjs`, `host-main.mjs`, `host-scheduler.mjs`, `host-config.mjs`, `remote-manager.mjs`, `manager.mjs`, `workspace-host-server.mjs` | **Delete** | Kiro Crew owns runtime (F18, F26) |
| Providers and routing | `providers/claude.mjs`, `codex.mjs`, `executor.mjs`, `cancellation.mjs`, `approvals.mjs`, `agent-routing.mjs`, `conversation-settings.mjs`, `run-capabilities.mjs`, `external-sessions.mjs`, `telemetry.mjs` | **Delete** | Same |
| Safety and andon (`main`) | `safety.mjs`, `safety-policy.mjs`, `restart-control.mjs` | **Delete** after extracting the pause/resume semantics into rule actions | Built around Avoozl-owned runs |
| Team coordination and execution targets (`main`) | `team-coordination.mjs`, `target-listener.mjs`, `target-auth.mjs`, `target-heartbeats.mjs`, `openhands-target.mjs` | **Defer**, out of the public tree | A remote listener and dispatch plane; any future delivery route belongs behind the plugin seam |
| OpenHands | `openhands-app.mjs`, `openhands-automations.mjs`, `openhands-surface.mjs`, `providers/openhands*`, `canvas-app/`, `canvas-backend/`, `docs/openhands.md` | **Delete** after a final tagged release | Kiro Crew is the only host |
| Website | `server.mjs`, `src/web/`, `ui/`, `ui-dist/`, older `src/*.mjs` page modules | **Replace** | App page reuses pure models (`graph-layout`, `query`, `progress-model`, `markdown`); the rest goes |
| VS Code extension | `extension/`, `src/app/ahp/` | **Delete** | Agent surface outside Kiro Crew |
| MCP interface | `mcp.mjs` | **Keep**, adapt | All `plans_*` names stay; run tools route through dispatch or return a pointer to the Kiro Crew session; new tools in §4.6 |
| CLI | `cli.mjs`, `compat-cli.mjs`, `cli.mjs` root | **Keep**, adapt | Add `tick`, `rebuild`, `project preview/apply`, `app-backend`; remove `serve` host modes; `aicommander` alias stays |
| Examples | `examples.mjs`, `examples/` | **Keep** | Explicit, transactional seeding |
| Bundled skills | `src/app/skills/avoozl`, `kirocrew-app/skills/avoozl` | **Adapt** | One skill, in the app |
| Kiro Crew app | `kirocrew-app/` | **Replace** contents | Manifest §4.2, real page, backend, MCP, cron, agents |
| Live proof scripts | `scripts/github-projection-live.mjs`, `scripts/github-completion-live.mjs` | **Keep**, extend | Base for proofs P6–P11 |
| Compat server | `compat-server.mjs` | **Delete** | Follows the website |

---

## 10. Moving an existing workspace

These steps move an existing Avoozl workspace, with its SQLite database and
plan files, onto the new model. The first workspace moved was Nupp's; its
counts are in the requirements' "Example workspace facts" table. Everything
below is **Proposed**.

### 10.1 What stays where

**Proposed.** The owner picks the GitHub mode (§6.6). The table assumes
plans-repo mode: a private planning repository holds the issues, and code
lands in code repositories, some of them public. In single-repo mode the
issues live in the code repository instead.

| Records | Destination | Why |
|---|---|---|
| Epics | Parent issues in the planning repository, unchanged task IDs in their markers; `Epic` issue type only if the owner adds it (F46) | Requirement 23.9 |
| Unfinished tasks | Sub-issues of their epic, unchanged IDs; `requires` and `sequence` edges become issue dependencies; `supports` edges and completion levels go in the marker | Requirements 13.7, 13.8 |
| Finished tasks | Read-only migration baseline committed in the planning repository (status `done`, evidence kept); no issues. Edges from unfinished tasks to them are recorded as met | Requirement 23.2; no issue churn for finished work |
| Partial tasks | Package issues until reconciled; remaining work becomes leaf sub-issues | Partial work needs reconciling before it can be a leaf |
| Planned tasks | Issues; each becomes `package` or `leaf` after classification; milestone rows become Release values, not issues | |
| Deferred, blocked, and review tasks | Deferred: Status Deferred, set once at cutover as the owner's recorded order. Blocked: issue dependencies, or a decision when the blocker is not a task. Review: the open pull request. Avoozl writes no other Status (§6.7) | Requirement 23.4 (changed 2026-11-12) |
| Milestones | Options of the Project's Release field; each issue's Release comes from its milestone | Requirement 23.10 |
| Document-derived entries that overlap epic scope | Acceptance clauses or context on existing tasks; unmatched entries reported | Requirement 23.5 |
| Other document-derived entries | Stay in the read-only SQLite archive, non-executable | Not part of epic delivery |
| Old SQLite database | Read-only archive after cutover; the GitHub issues become the live record | Requirement 19 |

Setup done once, before step 8, by the **Set up GitHub** wizard (§8.2) in
the chosen mode: it turns on issues in the planning repository if they are
off (F46), creates the Project with Status and Release single-select fields,
and adds an `Epic` issue type if an organization admin runs it.

### 10.2 Sequence

1. **Freeze.** Copy the SQLite file and record the plans repository commit. All
   work below reads the copy (Requirement 23.8).
2. **Rebase.** Land the current schema in the new code so the copy opens
   without loss (F19). Prove on the copy only.
3. **Map identity.** Assign `kind`: epics are `epic`; each task with children
   or broad scope is `package`; the rest are `leaf` candidates. IDs do not change.
4. **Map checklist entries.** For each document-derived entry, match by
   document and line range to an epic's context range (epics carry document
   and line ranges; their tasks may not), then let a critique session propose
   the task; deterministic code applies only matches the user accepts. Reuse
   existing `task-dedup` merge receipts. Commit a mapping report: matched,
   merged-as-acceptance, unmatched.
5. **Reconcile partial work.** For each partial task, a planner session reads
   the task's evidence, recorded branches, commits, and run records, and
   reports one of: complete pending acceptance, partial with named remaining
   leaves, or stale. Remaining work becomes new leaves under the task, with
   IDs `<task-id>.<slug>`.
6. **Decompose broad planned work.** The same planner flow turns broad planned
   tasks into packages with bounded leaves. Only leaves can become ready.
7. **Drain runs.** Runs still `observing` or `interrupted` in the old host are
   finished or closed before cutover; their evidence is imported.
8. **Cutover.** One reviewed change in the planning repository commits the
   manifest, mapping report, reconciliation report, and baseline. The user
   approves it, and the next tick projects the issues, sub-issues,
   dependencies, and Project items, with Release set from milestones. The
   graph is read through the migration read path (§6.8) until step 11.
9. **Turn on Autopilot.** Enable the tick for one epic with concurrency 1. Avoozl
   worker sessions code its leaves in the code repositories (§6.6), against
   each code repository's default branch, so GitHub closes each issue
   (§6.5). (Changed 2026-11-12: a recorded integration branch that is not a
   default branch can be a `baseBranch` only if the owner makes it the
   repository's default.) Widen after three leaves merge and complete
   cleanly.
10. **Clean up stale plans.** Avoozl lists plan files in the planning
    repository that are stale or no longer current. A file is listed only
    with evidence: every task it holds is done or migrated (each ID is in the
    baseline or has an issue), and the file is superseded (a newer file or
    spec covers it) or has no live reference (no open issue body, manifest,
    current plan, or steering file links to it). Each file gets one reason
    line naming that evidence. The owner approves the list; deletion is one
    reviewed commit with nothing else in it. Git history keeps the files, so
    reverting that commit undoes it. The step touches no issue and no marker.
11. **Move to the Kiro spec layout.** Each current plan file becomes
    `.kiro/specs/<name>/` with `requirements.md` (or `bugfix.md`), `design.md`,
    `tasks.md`, and `avoozl/manifest.json` (§6.8). Every `tasks.md` item uses
    the task's existing ID as its token (`w3.reactor-timers`), so markers and
    issue links do not change. Validation must pass on every spec. A
    projection preview after the move must show no issue created, closed,
    re-parented, or re-linked; only marker source pins may change. After this
    step the migration read path is no longer used for the workspace.

Steps 10 and 11 run after cutover and never change which issue holds which
task.

### 10.3 When automatic delivery may begin

All of: proofs P1–P5 pass on a scratch copy; P14, P17, P18, and P25 pass; the
mapping report has zero unreviewed unmatched entries; no run of the workspace
is active in the old host; the owner setup in §10.1 is done; the cutover
change is approved.

---

## 11. Proof sequence

The proofs, each with setup, action, expected result, failure meaning,
and next decision, are tasks in `tasks.md` (P1–P32). Summary:

| Proof | Proves |
|---|---|
| P1 | A real Avoozl backend runs inside Kiro Crew behind the signed proxy |
| P2 | The tick script cron opens, messages, and observes sessions |
| P3 | The workspace picker loads real SQLite data (a Nupp copy) |
| P4 | A local parent decomposes into dependent leaves; the tick is idempotent |
| P5 | Ready local leaves execute, verify, integrate, and release dependents automatically |
| P6 | Worker failure and gateway restart recover without losing task truth |
| P7 | Configurable label rules (all, any, none, assignee, actor) route correctly, on a public repository |
| P8 | Single-repo projection with sub-issues, issue dependencies, and the epic issue type |
| P9 | Cross-repository dependencies and the SQLite-delete rebuild test |
| P10 | Managed-field conflicts on title, body, labels, and edges; Project field edits are orders, not conflicts |
| P11 | Exact pull-request completion releases dependents, in both link forms; an allowed close without code releases its dependent with a brief note, and a disallowed one holds and asks |
| P12 | Issue Radar executes a ready leaf with no manual step (single-repo mode) |
| P13 | The pull request merges automatically under required checks |
| P14 | An existing workspace graph migrates without duplicates |
| P15 | A clean machine installs and runs the local workflow from public docs |
| P16 | Project sync: Release, Wave, and Iteration for issues from several repositories, and Status left to built-in workflows; Deferred by an allowed actor pauses; other drags are left alone; a Release change is kept and drafts a manifest change; a Wave edit is reverted |
| P17 | Plans-repo mode in one organization: private plans repo, public code repo, GitHub closes the issue through the linked branch, no repo name in the public PR |
| P18 | Plans-repo mode across two organizations |
| P19 | Single-repo mode end to end: `Closes #N`, GitHub closes, Avoozl verifies; a non-default base is refused |
| P20 | Local and github tasks in one workspace; opt-in local never syncs; projection moves one |
| P21 | Kiro spec folder validation, feature and bugfix specs |
| P22 | Stale-plan cleanup after moving a workspace |
| P23 | Moving a workspace to the Kiro spec layout with the issue mapping unchanged |
| P24 | The Set up GitHub wizard creates everything on a fresh account, then changes nothing on a second run; a token without `project` gets the fix command and no Project writes |
| P25 | The linked-branch close and logged-out leak check repeated inside one organization (private planning repo, public code repo), before Phase 4 builds on it and before Phase 6 |
| P26 | Fake tracker and fake route plugins load only after approval, run a mixed chain end to end, rebuild from the tracker, and a broken plugin parks its tasks without stopping the tick (Phase 8) |
| P27 | Review gates with fake writers and reviewers: two review roles on distinct models gate integration of the exact commit, changes requested rework the same delivery, closures are checked against changed files, a not-run check keeps the gate shut without costing a writer attempt, a rebase forces re-review, typed paths around the gate are refused, and supersede survives plan re-approval (Phase 9) |
| P28 | Content rules with a fake terms file and a fake rules plugin: every boundary blocks a match and opens a decision without logging the term, agent calls are refused in-call, allow once passes one exact write, a missing or broken set fails closed, the built-in screens behave as before, and the terms never reach Git (Phase 10) |
| P29 | Crew placement by one routing prompt with fake crews (`local`, `fake-linux`, `fake-windows`) and a fake routing agent: off keeps everything local, one call places every ready task among options that passed the checks, an answer is used once, a bad or missing reply falls back to local and is logged, `needs` and pins hold, a crew that would stall on approvals is never offered, no fit opens a decision, an unfetchable base leaves local alone, a lost crew keeps its binding, limits are configurable, the prompt stays machine-local, a public repository's remote push integrates, and every chat is attachable from In flight (Phase 11) |
| P30 | Flow with fake workers and scripted timings: spans from tool calls and from markers, a batch that runs once and splits on failure, a breaking commit that stops dependent work and resumes on green after a fix task, a flaky check that does not stop, local checks first refusing a push, and a retro proposal approved and then PDCA-checked into a revert proposal (Phase 12) |
| P31 | The Untriaged list with a fake GitHub: rule matches, triage labels, managed labels, and task-linked items are left out; the filter's default and errors; one cached read per interval; a failed read keeps items; the hand-off links and their fallback; Local only hides the tab; one batched notice; then a live read-only count on real repositories (Phase 13) |
| P32 | Incoming items from a fake plugin source and a fake MCP caller: one record and pipeline for both, dedup and stale replays, the cursor kept on failure, content rules quarantining at intake, `source:` rules, who counts for each source, updates and closes following the allowed-close rule, a review that never delivers, every source in Untriaged, and GitHub intake and the GitHub Untriaged list unchanged (Phase 14) |
| P33 | Superseded 2026-11-13 by P29 and P44: rules and weighted choices are removed. Agent and model per task with fake crews and fake agents: no `session` changes nothing, the order of sources holds, weighted choices split a batch as computed, retries keep the model, review distinctness skips colliding choices, a missing agent rules a crew out (Phase 11) |
| P34 | Pull request feedback with a fake GitHub and fake workers: failed checks, changes requested, review comments, conflicts, and auto-merge off each reach the live worker once, in one message per tick; untrusted comments are not relayed; a gone worker gets a resume attempt on the same branch and model; the round bound and the same-check stop open a decision; Avoozl writes nothing to GitHub (Phase 15) |
| P35 | One bundle plugin with a pack, rules, a tracker, and an intake source: it installs shared with the repository, previews its pack as create/change/keep/skip, refuses an import before approval, imports after approval with provenance, polls a fake intake source, and refuses an unknown pack key by name, a silent who-counts lowering, and a new version without a new approval (Phase 16) |
| P36 | Epics across plans and phases inside plans, in a temporary workspace with one epic and two member plans: membership needs both sides, phases come from the manifest or headings, no `doc:` group appears, three levels of sub-issues project and a second preview writes nothing, and the old forms are errors (Phase 21; the owner's data is rewritten once in task 21.7) |
| P37 | Workflow templates, manual leaves, and links and notes, in a temporary single-repo workspace with a fake GitHub and the sample SDK rewrite template: the template makes a draft that joins an epic and imports no setting unless ticked, the manual review leaf is never dispatched and gates cutover, only a person or an allowed GitHub closer completes it, and links and notes pass content rules, reach briefs, and reach the issue only when shown (Phase 22) |
| P38 | The Specs name and ideas, in a temporary workspace with a fake chat and a fake New spec entry point: no user-facing plan word outside the allowlist, the compat names unchanged, an idea captured by a person, by MCP and by a session, refused fields and blocked text, an idea that never matches a rule or counts as untriaged, a riff that only appends, Make it a spec that prefills New spec and graduates the idea, and archive kept past the purge (Phase 23) |
| P40 | Driver handoff with temporary workspaces on one fake GitHub: the plan issue's single assignee and the machine claim pick one driver, the epic's assignee stands in, zero or several assignees read only with one decision, one login on two machines, the check before dispatch, age never moves the role, drain then export then reassign and take over, a tampered file refused, rebuild and forced take-over with the loss list, a silently ignored reassignment, the old driver going read-only on return, away tasks never restarted by lease, the re-approve list, person-only 403s, and the Local only row (Phase 26) |
| P41 | Budgets and receipts in a temporary workspace with fake workers and fake usage rows: priced and unpriced turns, caps by level, retries and review rounds on one cap, a batch's shared cap, the stop message at the next turn with no session stopped, `budget_reached` on MCP, Raise budget and Stop as a person only, a price change recomputing a receipt with both versions shown, unknown spend for Crew Mode and a failed read, JSON export, the retro payload, and no budget changing a gate (Phase 27) |
| P42 | Prompt and skill proposals and lessons with fake workers and a fake retro model in two temporary workspaces: locked sections, stale bases and blocked text dropped, person-only approve and revert, overrides outside shipped files, a repository skill change as a leaf and an external one as a note, PDCA per version with mixed windows, lessons shared with no source text, opt-out, refused lesson text, drift marks that clear on confirmation, the lessons review, override drift with a three-way diff, pack versions, and person-only export (Phase 28) |
| P43 | The activity log in a temporary workspace with a fake GitHub and a fake plugin: every listed local action and tick event makes one row, a change seen twice makes one, a secret-shaped or rule-matched value is saved redacted, rows past retention go on the tick, and the tab and `plans_view` read the same rows (Phase 29) |
| P45 | Investigate first, evidence bundles, staying current, rules from corrections, fix-work share and ship mode with fake workers, a fake falsifier and a fake GitHub (Phase 34) |
| P44 | Provider health and switching with fake usage rows, fake error rows and a fake Kiro Crew model change in a temporary workspace: usage and error marks, recovery by success and cooldown, new tasks and weighted choices skipping low and out, retries keeping a model until it is out, running chats switched in the same session at the next turn, the review gate across a switch, the manual switch with preview hash and Also new tasks, person-only 403s, Needs you, and nothing changed with no settings (Phase 30) |

A new server, shared database, or plugin mechanism other than the seam in §4.8
requires a failed proof that a small Kiro Crew or GitHub contract cannot fix.

## 12. Phased roadmap

Detailed in `tasks.md`. **Proposed** order:

| Phase | Outcome | Exit |
|---|---|---|
| 0. Baseline | Rebase onto `main`; tag the last host-era release | Tests pass on the rebased branch |
| 1. App shell | Node backend, MCP server, page with Workspace view, tick cron | P1, P2, P3 |
| 2. Local delivery | Work model, planner/critic flow, dispatch, verifier, integration, release, recovery; the local option and the runner plans-repo mode reuses | P4, P5, P6, P2b |
| 3. GitHub core | Modes and authority, Kiro spec reader, rules engine, marker v2, sub-issues, issue dependencies, epic type, projection fixes, Project sync, setup wizard, rebuild, conflicts, completion wiring | P7–P11, P16, P20, P21, P24, P25 |
| 4. Delivery loops | Single-repo: ready-label handoff to Issue Radar. Plans-repo: worker sessions in code repos, linked branch at dispatch, leak screen; GitHub closes issues. Both: respond action, broad-issue decomposition, stale claims | P12, P13, P17, P18, P19 |
| 5. Removal | Delete host, providers, OpenHands, website, extension, intake callback, queue browser | Full test suite passes; no listener besides the app backend |
| 6. Move an existing workspace | Migration on a copy, cutover to planning-repository issues and the Project, then stale-plan cleanup and the move to spec folders | P14, P22, P23 |
| 7. Release | Docs, license audit, scans, npm and app publish | P15 |
| 8. Later | Plugin seam: route and tracker contracts, loading and consent (§4.8); deferred GitHub features | Only after P1–P25 pass; the seam also waits for a second real route (§14); then P26 |
| 9. Review gates | Review roles on a local delivery, findings closure, not-run checks, `acceptFrom: "validation"`, supersede by hand (§5.2); GitHub pull-request reviews as verdicts later | Starts after Phase 2's proofs, independent of Phases 3–8; P27 |
| 10. Content rules | One matcher for banned terms at every write and approval boundary; terms outside Git; built-in sets from today's screens; rules plugins (§4.9) | Starts after Phase 2's proofs; GitHub and plugin tasks also wait for the tasks that built those boundaries; P28 |
| 11. Crew placement | Crew registry, hard checks, the opt-in routing prompt and its one call per tick, manifest pins and `needs`, remote briefs and fetch-back, Settings › Routing (§4.10, §8.3) | Starts after Phase 2's proofs and 10.4; remote sessions also wait for MC-10, a required Kiro Crew ask (11.10); P29 |
| 12. Flow | Flow timing, stop the line, local checks first, batching, retrospectives with PDCA, the Flow tab and settings (§4.11, §8.4) | Starts after Phase 2's proofs; GitHub timing and local checks first also wait for 3.11, 4.7, and 10.4; P30 |
| 13. Untriaged | Untriaged filter and triage labels, the cached read in the tick, `untriaged.view`, the Untriaged tab and Dashboard count, the optional notice (§8.5) | Starts after Phase 2's proofs and after 3.13 and 3.14; exact hand-off links wait for MC-14 (13.6); P31 |
| 14. Incoming items | One incoming-item record in SQLite; `intake.submit`, `intake.list`, `intake.view` on the page, CLI, and MCP; plugin `poll` and MCP submit; the `intake` content boundary; `source:` rules and who counts per source; updates and closes; reviews to Code Review Sage; every source in Untriaged; GitHub intake and the Untriaged read moved onto the record (§4.12) | Starts after Phase 2's proofs and after 8.7, 10.6, 13.3, and 13.4; the `review` action waits for MC-15 (14.11); P32 |
| 15. Pull request feedback | Failed checks, reviews, conflicts, and auto-merge state on worker pull requests sent back to the worker, with a round bound (§4.13) | Starts after Phase 2's proofs and after 4.7 and 10.4; P34 |
| 16. Plugin bundles | One plugin bundles a settings pack, content rules, a tracker, and an intake source; packs preview and import once with provenance; the intake contract hook (§4.14) | Starts after 8.6–8.8; does not wait for Phases 9–15; P35 |
| 21. Epics and phases | Epic folders across plans, phases from `tasks.md` headings, no invented groups, epic and plan issues on GitHub, the sub-issue cap setting, the views, and a one-time rewrite of the owner's plans (§6.9) | Starts after Phase 3's proofs and 19.1; P36 |
| 22. Templates, manual tasks, links and notes | The `template` plugin part and From template in New plan; `manual` leaves in Needs you and on GitHub; Links and notes on every task (§4.16) | Starts after 21.1, 16.3, 17.1 and P28; P37 runs after P36 |
| 23. Specs and ideas | The page says spec (§8.7); ideas as `local` incoming items with notes and links, Riff on this, Make it a spec through the New spec entry point, and archive (§8.8) | Starts after 14.10, 17.1 and 19.1; P38 |
| 26. Driver handoff | One driver per spec: the plan issue's assignee plus a machine claim, read-only ticks elsewhere, the check before dispatch, hand off with drain, export and reassign, take over from the file or a rebuild, force take over, what never moves, the header and banner (§6.10) | Starts after 3.8, 3.10 and 21.4; P40 |
| 27. Budgets and receipts | A machine-local, versioned price table; dollar caps per task from workspace, repository, spec and task, with token and credit fallbacks; the stop at the next turn and Raise budget or Stop in Needs you; receipts by stage, model and attempt with JSON export; spend on the drawer, Delivery and In flight (§4.17) | Starts after 12.12 and 12.9; P41 |
| 28. Retro prompt and skill proposals, and lessons | Prompt and skill diffs with evidence from the retro, local per-workspace prompt overrides with revert, repository skill changes as leaves and external ones as notes, PDCA per version, a lessons store on this Mac shared across workspaces, lessons packs, and healing of lessons and overrides (§4.18) | Starts after 12.9 and 12.10; P42 |
| 29. Activity log | One SQLite activity table, one `recordActivity` helper, local actions and the tick's GitHub and plugin events, screening and redaction, retention on the tick, the Activity tab and `plans_view` action `activity` (§4.19) | Starts after 10.4, 12.11 and 14.10; P43 |
| 30. Provider health and switching | Health levels from usage reads and error rows, routing that skips low and out, running chats moved with Kiro Crew's model change, the manual Switch model dialog, Needs you, and Settings › Providers (§4.20) | Starts after 11.11 and 12.12; P44 |
| 33. Only open tasks get issues | `github.issues.includeDone` (default off): done tasks get no issue, card or link at approval (§6.3) | Built in PR #34 |
| 34. Investigate first, evidence, staying current, rules, fix share, ship mode | Findings and a falsifier before code, an evidence bundle per task, pull requests brought up to date without force pushes, rules from repeated corrections, the fix-work share in Flow, and `delivery.ship` (§4.21–§4.25) | Starts after 15.4, 28.3 and 12.11; P45 |

### 12.1 Bootstrap: building Avoozl before Avoozl works

**Proposed.** Phases 0–2 build the delivery loop, so Avoozl cannot deliver
them. Copying prompts between chats is the wrong experience even for a
bootstrap. Instead, one Crew Mode chat drives Phases 1–2 with features Kiro
Crew ships today (F8, F9).

| Stage | Driver | What the user does |
|---|---|---|
| Phase 0 | One background subagent from the planning chat (already started) | Nothing; reviews its report |
| Phases 1–2 | One Crew Mode chat on `kirocrew-conductor` | Turns on Crew Mode once (Settings → Developer → Feature Previews), opens one Crew Mode chat filed in a folder whose project directory is the `kirocrew-native` worktree, sends one starter message, and answers questions in that chat |
| Phase 3 onward | Avoozl itself: Plans view → **Prepare delivery** → **Deliver** | Approves the manifest; answers decisions in the Conflicts view or the linked session |

How the conductor runs Phases 1–2:

- **One round per phase.** The conductor creates one work-ledger item per task
  that can run alongside the others in that phase, using the task's text as
  `acceptance`. Tasks that depend on each other inside a phase (for example 1.3
  after 1.1 and 1.2) go in a later round of the same phase, because Crew Mode
  items must be independent (F8).
- **Workers in the sidebar.** Each item gets its own `kirocrew-worker` session
  in the chat's folder, so the user can open, watch, or take over any of them.
- **Proofs gate rounds.** After a phase's tasks are accepted, the conductor runs
  that phase's proofs as items. A proof that needs the user (a second GitHub
  account, a gateway restart, a clean machine) comes back as a `question` item
  and waits in the one chat.
- **Git ownership.** All workers commit to branch `kirocrew-native` in that one
  worktree. Because workers share it, each round's items must touch disjoint
  files; the conductor serializes items that edit the same file.
- **Stop.** The conductor stops after P5 and P6 pass. Phase 3 begins only through
  Avoozl's own **Deliver** on this spec (the dogfood point in §11).

What this proves early: the Crew Mode experience is what Avoozl must beat. If a
user prefers the conductor chat to the Avoozl page after Phase 2, that is a
signal to revisit the UX in §8 before Phase 3.

Starter message for the Crew Mode chat:

```text
Goal: deliver Phases 1 and 2 of the Avoozl spec, then stop.
Spec: .kiro/specs/avoozl/tasks.md
Context: design.md beside it; repo rules in AGENTS.md of this worktree.
Branch: kirocrew-native in this worktree. Never push. Short imperative commits, no attribution.
Rounds: one phase at a time; inside a phase, only tasks with no unmet dependency
and no shared files run together. After a phase's tasks are accepted, run its
proofs (P1–P3, then P4–P6) and ask me in this chat when a proof needs me.
Stop after P6 passes or when a proof fails twice; report what failed and why.
```

## 13. Open-source release gates

**Proposed.** All must pass before a public release:

1. Kiro Crew is the only documented host; README starts from app install.
2. No trigger rule exists after install; execution needs an explicit rule.
3. Public repositories work; P7 runs on a public test repository.
4. Every listener is loopback and gated by the signed principal (§4.7); a
   project-wide search for `listen(`, `0.0.0.0`, and `--host` finds nothing else.
5. No private names, internal systems (including any company-internal tool a
   private plugin serves, §4.8), absolute paths, credentials, personal
   plans, or transcripts in the tree, history scan included.
6. Third-party license audit of bundled code (including `marked`) with notices.
7. Spec and research documents with machine-local paths stay out of the release
   or are rewritten to relative names; receipts under `docs/evidence/` are
   regenerated rather than edited (AGENTS.md).
8. Compatibility: `plans_*` MCP names, `AVOOZL_*`, `AICOMMANDER_*`,
   `NUPP_WORKSPACE_*`, and the `aicommander` command still work.
9. Clean build from a fresh clone; `npm test` and `git diff --check` pass.
10. App package installs with `kirocrew app install` and passes P15.
11. npm package and signed GitHub release published; Avoozl's own repository
    dogfoods the GitHub loop.

## 14. Kill criteria

**Proposed.** Remove or never build a feature when its condition holds:

| Feature | Kill when |
|---|---|
| Task Runner inside leaves | Over ten complex leaves, it does not raise first-pass verification versus a plain worker session |
| Crew Mode dispatch | Proof P2b fails twice, or conductors skip reporting session bindings in real use |
| Avoozl's local graph | Kiro Crew ships dependency edges and a ledger that outlives one chat; Avoozl then keeps only the GitHub graph, label rules, and the done check |
| Workflows for replanning | The Nupp replan (§10.2 steps 5–6) completes without it |
| Respond action | Fewer than one in five replies needs no human correction over twenty issues |
| Automatic child publication | Any auto-published child graph needs a human rewrite twice in a row |
| `dependencyText` parsing | Native dependency edges cover every proof and Nupp need |
| Priority labels | Concurrency never exceeds ready work in real use for a month |
| Iteration field sync | No configured Project names an iteration field by release |
| Separate integration branch | No user enables it by release |
| Graph view layout engine | The Delivery and Conflicts views answer every proof question without it |
| Plugin seam (routes and loading) | Never built beyond schema until a second real route exists. A private code-review route in its own private package counts as the second real route; test fakes do not |
| Tracker plugin contract | Never built beyond schema until the route seam's gate holds and a real tracker plugin is being written |
| Any new listener, server, or database | Always, unless a failed proof shows no small contract fixes it |

---

## Recommended product statement

> **Avoozl is the Kiro Crew app that lands epics.** It keeps a large goal's task
> graph true: it turns Kiro specs and labeled GitHub issues into durable work
> graphs, says which bounded leaves are ready, lets Crew Mode, worker sessions,
> and Issue Radar do the work, and releases each dependent only after verified
> completion, with GitHub issues and a GitHub Project as the default record and
> SQLite as the record only for opt-in local work. Avoozl runs no agents of
> its own.
