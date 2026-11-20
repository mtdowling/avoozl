# Design: Avoozl

## Overview

This design says how Avoozl meets its requirements: who owns each kind of
state, the parts and how they connect, the workflows, and the page.

Labels follow the requirements: **Verified** (read in code, docs, or data) and
**Inferred** (follows from verified facts, not observed). Fact numbers
`F1`–`F30` refer to the requirements' facts.

### Facts about Kiro Crew and Avoozl

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| F31 | Kiro Crew script crons are Python callables that run with no LLM call. Their context offers `call_tool(server, tool, args)` for MCP tools, `notify`, `list_session_folders`, `create_session_folder`, `open_session(name, folder_id, agent, model)` returning a slot key, `send_to_session(slot, message)`, and `set_session_mode(slot, mode)`. Flow control is `Skip`, `Done`, and `Report`. Default script timeout is 30 seconds and can be raised per job. | `docs/cron-and-scheduling.md`                                       |
| F32 | An app manifest cron entry may name a `script` (Python callable) as well as a `command`.                                                                                                                                                                                                                                                                                                                                                                      | `apps/manifest_sections.py` `CronEntry`                             |
| F33 | An app backend can opt into a gateway-signed principal claim (`signedPrincipal: true`) on every proxied request.                                                                                                                                                                                                                                                                                                                                              | `apps/manifest_sections.py` `BackendConfig`; `apps/routes_proxy.py` |
| F34 | Avoozl local integration rebases the run branch onto the base branch and merges it into the originating checkout under a per-repository work lock, refusing when that checkout is not on its base branch.                                                                                                                                                                                                                                                     | `src/app/git/git.mjs` `integrateRun`                                    |
| F35 | Avoozl reads GitHub with `AVOOZL_GITHUB_TOKEN`, `GITHUB_TOKEN`, or `gh auth token`, over REST. It does not use GitHub sub-issues today.                                                                                                                                                                                                                                                                                                                       | `src/app/github/github.mjs`; no `sub_issues` reference in `src/app`        |
| F36 | `workspace-repository.mjs` publishes portable planning records from SQLite into the workspace's Git repository; Nupp uses it.                                                                                                                                                                                                                                                                                                                                 | `src/app/workspace/workspace-repository.mjs`; Nupp commit `566ef8a`           |

### GitHub and Kiro facts

Each row is **Verified** against the cited page or a read-only query on
2026-11-11, unless the row says **Inferred**.

| #   | Fact                                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F37 | A parent issue can take sub-issues from other repositories of the same owner; up to 100 sub-issues per parent and eight levels of nesting (rechecked 2026-11-13, §6.9). `gh issue create --parent` and `gh issue edit --add-sub-issue` manage them.                                                                                                    | [Adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues); [REST sub-issues](https://docs.github.com/en/rest/issues/sub-issues)                                                                                  |
| F38 | A sub-issue may belong to a different organization than its parent. Sub-issues inherit the parent's Project and milestone by default. Projects have a REST API that adds items and updates field values.                                                                                                                                               | [Changelog 2025-09-11](https://github.blog/changelog/2025-09-11-a-rest-api-for-github-projects-sub-issues-improvements-and-more/)                                                                                                                                           |
| F39 | Issue dependencies (blocked by, blocking) are generally available, with up to 50 issues per relationship type, in REST, GraphQL, and webhooks. `gh issue edit --add-blocked-by` accepts issue numbers or URLs. Same-org cross-repository dependencies were proved live (F11). Cross-organization dependencies are **Inferred** to work; P18 checks it. | [Creating issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies); [Changelog 2025-08-21](https://github.blog/changelog/2025-08-21-dependencies-on-issues/)                                          |
| F40 | A Project can hold issues and pull requests from any organization, up to 50,000 items. Project timeline events on an issue are visible only to people who can read the Project.                                                                                                                                                                        | [Adding items to your project](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/adding-items-to-your-project)                                                                                                           |
| F41 | Projects support custom fields, including single-select and iteration fields, up to 50 fields. An iteration field groups items into repeating time blocks with breaks.                                                                                                                                                                                 | [About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects); [About iteration fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-iteration-fields) |
| F42 | A milestone groups issues and pull requests in one repository.                                                                                                                                                                                                                                                                                         | [About milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones)                                                                                                                                                            |
| F43 | A closing keyword can name an issue in another repository (`Fixes octo-org/octo-repo#100`). Keywords work only when the pull request targets the default branch.                                                                                                                                                                                       | [Linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)                                                                                                                      |
| F44 | Issue types are set per organization or user, up to 25; the defaults are task, bug, and feature, so `Epic` exists only if the owner adds it.                                                                                                                                                                                                           | [Managing issue types](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization)                                                                                                                               |
| F45 | `gh project` needs the `project` token scope. The local `gh` token has `project`, `repo`, `read:org`, `workflow`, and `gist`.                                                                                                                                                                                                                          | [gh project manual](https://cli.github.com/manual/gh_project); `gh auth status`                                                                                                                                                                                             |
| F46 | `nupp-lang` has issue types Task, Bug, and Feature (no Epic) and no Projects yet. Its private planning repository has issues turned off.                                                                                                                                                                                                               | Read-only GraphQL query                                                                                                                                                                                                                                                     |
| F47 | A Kiro spec has `requirements.md` (or `bugfix.md` for bugfix specs), `design.md`, and `tasks.md`. Running all tasks builds a dependency graph from `tasks.md` and runs independent tasks in waves.                                                                                                                                                     | [Kiro specs](https://kiro.dev/docs/specs)                                                                                                                                                                                                                                   |
| F48 | Kiro recommends one spec per feature under `.kiro/specs/<name>/`, stored in the repository beside the code, or in a central specs repository shared across projects. **Sync Files** can add tasks for new requirements and mark finished tasks.                                                                                                        | [Kiro spec best practices](https://kiro.dev/docs/specs/best-practices)                                                                                                                                                                                                      |
| F49 | Project built-in workflows update Status on events. Two are on by default in a new Project: closed issues or pull requests get Status Done, and merged pull requests get Status Done. (Checked 2026-11-12.)                                                                                                                                            | [Using the built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations)                                                                                                              |
| F50 | A change made by a built-in workflow shows in the timeline as made by `@github-project-automation`. (Checked 2026-11-12.)                                                                                                                                                                                                                              | [Adding items to your project](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/adding-items-to-your-project)                                                                                                           |

### GitHub-native facts

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F51 | **Verified (live probe, 2026-11-12).** An issue in a private repository with a linked branch made by GraphQL `createLinkedBranch` (`repositoryId` = a different, public repository) closed as `COMPLETED`, with the pull request as `closer`, about 1 second after a pull request from that branch merged into the public repository's default branch. The pull request body had no closing keyword. Logged out, the pull request page, its partials, and REST pull request, issue, timeline, and events showed no private repository name; GitHub hides the `connected` event from viewers without access.                   | `docs/evidence/github-linked-branch-probe.md` in the Avoozl repository, commit `31adf4e`                                                                       |
| F52 | **Verified (same probe).** Limits: `closingIssuesReferences` on the pull request was empty right after it was opened and filled by merge time; the issue's `linkedBranches` empties on close while the branch stays; only same-owner user repositories were tried, so an organization (rulesets, base protection, org visibility) is untested; the merger had access to the private repository; notifications to watchers were not checked. GitHub closes only on merges into the default branch.                                                                                                                             | Same                                                                                                                                                           |
| F53 | Issues with open blocked-by dependencies show a native **Blocked** icon on Project boards and issue lists, and issue search accepts `is:blocked`, so `is:open -is:blocked` lists unblocked open issues. **Verified** that REST search accepts both qualifiers (2026-11-12, `nupp-lang/nupp`); the icon is from GitHub's docs.                                                                                                                                                                                                                                                                                                 | [Creating issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies); REST `search/issues` |
| F54 | Built-in Project workflows: Item added to project (sets a Status), Item closed (Done), Pull request merged (Done), Pull request linked to issue (sets a Status), Item reopened, Auto-add to project (with a filter), Auto-add sub-issues to project, Auto-archive items, Auto-close issue (closes the issue when Status becomes Done), Code review approved, Code changes requested. None reacts to a blocker closing.                                                                                                                                                                                                        | [Using the built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations) |
| F55 | **Verified (GraphQL schema and a read-only query, 2026-11-12).** `ProjectV2.workflows` returns each workflow's `name`, `number`, and `enabled`; nothing exposes its target Status or filter. The only workflow mutation is `deleteProjectV2Workflow`; none creates, enables, disables, or edits one. On `nupp-lang` Project #2 the instantiated workflows are Auto-add sub-issues, Auto-add, Auto-close issue, Item added, Item closed, Pull request linked, and Pull request merged, all `enabled: true`; Auto-archive, Item reopened, and the review workflows are not listed until someone configures them (**Inferred**). | `gh api graphql` introspection of `ProjectV2Workflow` and `Mutation`; query on `organization(login:"nupp-lang").projectV2(number:2).workflows`                 |
| F88 | **Verified (live REST `search/issues`, 2026-11-12, `cli/cli`).** Label qualifiers compare without case (`label:bug` and `label:BUG` gave 2288 each; `label:"Needs-Triage"` and `label:needs-triage` gave 1545 each). `label:a,b` is OR (4800), repeated `label:` is AND (3), and `-label:a,b` excludes both, the same as `-label:a -label:b` (1918 each, which is 6718 − 4800). GitHub's docs also say search is not case sensitive.                                                                                                                                                                                          | [Searching issues and pull requests](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests); REST `search/issues`    |
| F89 | **Verified (same probe).** `no:assignee` combines with `label:` in REST search (2060 for `no:assignee label:bug`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | REST `search/issues`                                                                                                                                           |

An app cannot create a session from its Node backend (F21), but a script
cron the app declares can open a visible session in a folder with no LLM call
(F31).

---

## 1. Product thesis

Kiro Crew and other agent harnesses run agents. Git and GitHub store the
work. Avoozl turns an approved spec into landed code between them:

1. **Plan.** A spec's `tasks.md` is a graph of packages and bounded leaves
   with stable IDs and `$after` edges.
2. **Gate.** Avoozl decides which leaves are ready from their edges, policy,
   conflicts, open decisions and the stopped line.
3. **Dispatch.** The tick starts a worker on each ready leaf in its own
   worktree, as a Kiro Crew chat or a process harness under the supervisor
   (§4.28).
4. **Prove.** Avoozl runs the repository's checks itself on the worker's exact
   commit, with no model involved, and runs review roles where policy asks.
5. **Land.** Work that passes lands by the repository's `landing` setting
   (§4.26), and the landing commit ticks the task in `tasks.md` (§4.41).
6. **Release.** Avoozl recomputes readiness and dispatches what became ready.

## 2. Non-goals

- No chat, terminal, file browser, memory, or transcript store of its own.
- No webhook receiver, tunnel, or worker lease.
- No GitHub browser or CI view.
- No force push, admin merge, or skipped required check or review.
- No second writable copy of what git holds.
- No reading or writing another app's private data or routes.
- No private or company-internal integration in the public repository, named
  or implemented. Such integrations are separate packages loaded through the
  plugin seam (§4.8).
- No GitHub milestones or Projects.

---

## 3. State ownership

### 3.1 One authority per kind of state

| State | Authority | Avoozl SQLite role |
| --- | --- | --- |
| Spec text | Git: the spec folder under `specs.path` on the specs branch (§4.45, FS1) | Cache |
| Approval | Git: an approver's authored commit of that exact text on the specs branch (§4.42) | Cache; `avoozl rebuild` reads it again |
| Repository policy | Git: `.avoozl.json` at an exact commit | Receipt of the commit applied |
| Task facts and edges | Git: `$` fact bullets in `tasks.md` (§4.40) | Cache |
| Task done | Git: the `[x]` tick on the base branch, and its tick commit (§4.41) | Cache |
| Task running state | SQLite: attempts, worktrees, sessions, check runs | **Authoritative**; lost on rebuild except what git holds |
| Spec driver | GitHub: the spec issue's single assignee, else its epic issue's (§4.44); Local only: this workspace | Cache |
| Spec issues and epic issues | GitHub, with the hidden marker (§3.4) | Cache |
| Kiro Crew sessions and transcripts | Kiro Crew | Binding: task ID to slot key |
| Process children | The supervisor (§4.28) | Binding: task ID to child record |
| Worktrees and branches | Git in the target repository | Receipt: path, branch, base |
| Pull requests and their checks | GitHub | Cache |
| Avoozl's own check runs | SQLite: command, exit code, output tail, commit | **Authoritative** |
| Landing record | Git: the landing commit and its trailers (§4.42) | Cache |
| Activity | SQLite append-only log, pointing at real sources | **Authoritative** |
| Human decisions | SQLite | **Authoritative** |
| Plugin approvals | Machine-local settings: id, version, content hash | Receipt |

### 3.3 The rebuild test

Delete the SQLite file, run `avoozl rebuild`, then `avoozl tick`. The result
must equal the previous state for every spec, approval, task, edge, tick and
landing record (Requirement 114). Running state such as session bindings may
be missing; the tick rediscovers them from session titles (`avoozl:<task-id>`).

### 3.4 Managed issue marker, version 2

Each spec issue and epic issue carries this marker. Its `taskId` is
`plan.<id>` or `epic.<id>`:

```html
<!-- avoozl-task
{
  "version": 2,
  "taskId": "w3.reactor-timers",
  "namespace": "avz_k3q9m2x7v4d8p1ta",
  "kind": "leaf",
  "parent": "w3",
  "source": {
    "commit": "<40-hex>",
    "manifest": "<sha256>"
  },
  "compiler": "<sha256>",
  "edges": {
    "conditions": {
      "<task-id>": "integrated"
    },
    "supports": [
      "<task-id>"
    ]
  },
  "applied": {
    "title": "<sha256>",
    "body": "<sha256>",
    "labels": [
      "agent:managed"
    ],
    "blockers": [
      "<node-id>"
    ],
    "project": {
      "Release": "runtime-flip",
      "Wave": 2
    }
  },
  "order": {
    "actor": "<login>",
    "reason": "COMPLETED",
    "closedAt": "<ISO-8601>"
  }
}
-->
```

- Blocking edges are GitHub issue dependencies (F39); the marker never
  duplicates them as truth.
- `order` is present only while the issue is closed by an allowed actor's
  order with no merged closing pull request (§6.5): the closer's login, the
  close reason (`COMPLETED` or `NOT_PLANNED`), and the close time, all copied
  from the issue's own close event, which is public wherever the issue is.
  Rebuild reads it, so a later policy change does not reclassify an old
  order. Avoozl removes it when the issue is reopened.
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
  can still tell a human edit from a stale baseline.
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
 │  reviewers, planner)                            │    task facts, worktrees)
 │                                                 └── GitHub REST        │
 │  supervisor ──▶ process harness children (Claude Code, Codex, ...)    │
 └───────────────────────────────────────────────────────────────────────┘
```

- **Avoozl core** (**Verified** exists, **Proposed** scope): `src/app/api/operations.mjs`
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
  "skills": [
    "skills/avoozl"
  ],
  "agents": [
    "agents/avoozl-planner.json",
    "agents/avoozl-verifier.json",
    "agents/avoozl-responder.json"
  ],
  "mcpServers": {
    "avoozl": {
      "command": "node",
      "args": [
        "bin/avoozl.mjs",
        "mcp"
      ]
    }
  },
  "backend": {
    "type": "node",
    "entryPoint": "bin/avoozl.mjs",
    "healthCheck": "/health",
    "signedPrincipal": true
  },
  "crons": [
    {
      "name": "avoozl-tick",
      "every": 60,
      "script": "crons/tick.py:run",
      "silent": true,
      "persistent_session": false
    }
  ],
  "notifications": {
    "channels": [
      {
        "id": "decision",
        "name": "Avoozl needs a decision",
        "icon": "CircleHelp"
      },
      {
        "id": "failure",
        "name": "Avoozl delivery failed",
        "icon": "CircleX"
      }
    ]
  },
  "ui": {
    "entry": "dist/index.mjs",
    "pages": [
      {
        "route": "/apps/avoozl",
        "label": "Avoozl",
        "icon": "Workflow"
      }
    ]
  },
  "dependencies": {
    "commands": [
      "node",
      "git"
    ],
    "optionalCommands": [
      "gh"
    ]
  }
}
```

`gh` moves to optional: local work needs no GitHub (Requirement 2.3).

### 4.3 Work model

**Proposed.** The model extends today's tasks and edges (`src/model.mjs`,
`src/query.mjs`).

| Field        | Values                                       | Rule                                                                       |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------------- |
| `id`         | lowercase, dotted path allowed               | Immutable after approval; comes from the `tasks.md` item's ID (§6.8)       |
| `kind`       | `package`, `leaf`                            | From nesting: an item with sub-items is a package. Only leaves dispatch    |
| `repository` | registered repository ID                     | Required for leaves; exactly one                                           |
| `acceptance` | list of observable statements                | Required for leaves                                                        |
| `manual`     | `true` or absent                             | A leaf only a person does: never dispatched, marked done by a person (§4.16) |
| `status`     | `draft`, `approved`, `running`, `review`, `done`, `failed`, `blocked`, `deferred`, `partial` | `partial` exists only for migrated tasks |
| `decision`   | open decision ID or null                     | Any open decision blocks readiness                                         |

A leaf completes when it lands; a manual leaf completes when a person marks
it done. Every leaf runs its repository's checks (§5.2).

A `requires` edge, written as `$after`, blocks a task until the task it
names is done.

A leaf is **ready** when: it is approved; every blocking edge's condition holds;
no conflict, open decision, quarantine, or pause applies; its repository is
registered; and its route has capacity.

### 4.4 Repository policy in `.avoozl.json`

`mode` and `planningRepository` are derived from each repository's `role` (§4.34, Requirement 105).

**Proposed.** Replaces `github.queue` label behaviors and single-label intake
(F15). No names are built in; the values below are examples.

```json
{
  "github": {
    "mode": "plans-repo",
    "planningRepository": "example/plans",
    "defaultAuthority": "github",
    "project": {
      "owner": "example",
      "number": 7,
      "fields": {
        "status": "Status",
        "release": "Release",
        "wave": "Wave",
        "iteration": null
      },
      "statusValues": {
        "todo": "Todo",
        "inProgress": "In progress",
        "done": "Done",
        "deferred": "Deferred"
      }
    },
    "epicIssueType": "Epic",
    "repositories": {
      "example/app": {
        "checkout": "../app",
        "folder": "Avoozl/example-app",
        "baseBranch": "main",
        "allowedActors": [
          "maintainer-login"
        ],
        "minimumPermission": "maintain",
        "requiredChecks": [
          "build",
          "test"
        ],
        "dependencyText": false,
        "priority": [
          "critical",
          "high"
        ],
        "managedLabels": {
          "managed": "agent:managed",
          "responding": "agent:responding",
          "planning": "agent:planning",
          "ready": "agent:ready",
          "stale": "agent:stale",
          "decision": "agent:decision"
        },
        "rules": [
          {
            "id": "answer",
            "action": "respond",
            "match": "label:agent:respond -label:agent:paused"
          },
          {
            "id": "build",
            "action": "deliver",
            "match": "label:agent:build -label:agent:paused assignee:maintainer-login",
            "author": "maintainer-login",
            "autoPublishChildren": false
          },
          {
            "id": "pause",
            "action": "pause",
            "match": "label:agent:paused"
          }
        ]
      }
    }
  }
}
```

Validation (deterministic, in `repository-settings.mjs`):

- `mode` is `plans-repo`, `single-repo`, or absent; `plans-repo` needs
  `planningRepository`, `single-repo` forbids it (Requirement 28.1);
- `coder` is accepted and ignored: the Avoozl worker is the only coder;
- a repository with github tasks names a `baseBranch` equal to its default
  branch, because GitHub closes issues only from merges into the default
  branch;
- `statusValues` names only `todo`, `inProgress`, `done`, and `deferred`;
  only `deferred` is read as an order (§6.7);
- every rule names a known action: `respond`, `plan`, `deliver`, `execute`,
  `pause`, `resume`, `quarantine` (Requirement 11.3);
- every rule's `match` parses under the grammar below, and no rule has both
  `match` and a legacy label key (Requirement 11.2, 11.6);
- no trigger label equals a managed label (Requirement 11.4);
- a repository with any executing rule (`respond`, `deliver`, `execute`) names
  at least one allowed actor or a minimum permission, else it uses
  `minimumPermission: write`;
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
Settings.

A rule's trigger is `match`, one line of GitHub's own issue-search syntax. People already know it, and
pasting the line into a GitHub issue search shows the same issues. Avoozl reads
only these terms:

| Term                             | Parsed into  | Meaning                |
| -------------------------------- | ------------ | ---------------------- |
| `label:x` (repeatable)           | `labelsAll`  | has every such label   |
| `label:a,b` (one group per rule) | `labelsAny`  | has at least one       |
| `-label:x`, `-label:a,b`         | `labelsNone` | has none of them       |
| `assignee:login` (one)           | `assignee`   | assigned to that login |
| `no:assignee`                    | `unassigned` | assigned to nobody     |

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

**Proposed.** One operation, `workspace.tick`, exposed as MCP tool `plans_maintain {action: "tick"}`
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
  intents = ctx.call_tool("avoozl", "plans_maintain", {"action": "tick"})
  for s in intents.observe:   status = ctx.call_tool("kirocrew-dashboard", "session_status", {"target": s.slot})
                              ctx.call_tool("avoozl", "plans_session", {"action": "status", "slot": s.slot, "status": status})
  for d in intents.dispatch:  folder = find_or_create(ctx, d.folder)
                              slot = ctx.open_session(d.title, folder_id=folder, agent=d.agent)
                              ctx.call_tool("avoozl", "plans_session", {"action": "bind", "task": d.task, "slot": slot})
                              ctx.send_to_session(slot, d.brief)
  for m in intents.messages:  ctx.send_to_session(m.slot, m.text)
  for n in intents.notify:    ctx.notify(n.text)
  if not (intents.dispatch or intents.messages or intents.notify): raise Skip()
```

- Session titles are `avoozl:<task-id> <short title>`, so bindings are
  rediscoverable (§3.3).
- `plans_session {action: "bind"}` is recorded before the first message, so a crash between
  open and send leaves a bound, empty session the next tick messages.
- Whether a script cron may call the `kirocrew-dashboard` server's
  `session_status` is **Inferred**; proof P2 checks it. If it cannot, MC-2
  becomes blocking.
- **Why the tick stays a Python script cron (F129).** Moving it
  into the Node backend on a timer works only if `app.json` adds a
  `/api/chat` grant and `permissions.sessionApproval`, the second for the
  worker chats' trust mode (Requirement 88.1). Together they let Avoozl list
  every chat the person opened and send turns to it or trust it. The script
  cron's own credential reaches only the sessions that job opened. The tick
  stays in `crons/tick.py` unless the owner accepts that wider reach.

New MCP tools (**Proposed**, `plans_` prefix kept for consistency):
`plans_maintain {action: "tick"}`, `plans_session {action: "bind"}`, `plans_session {action: "status"}`, `plans_report`
(worker, verifier, responder reports), `plans_prepare_worktree`,
`plans_project_preview`, `plans_post_reply`, `plans_github {action: "rebuild"}`.

### 4.7 Security and exposure

**Proposed.**

- The node backend binds `127.0.0.1` on a port the gateway assigns and accepts
  only requests carrying a valid gateway-signed principal (F33). It refuses
  unsigned requests with 401. It never binds another interface.
- Avoozl opens no other listener: no website, workspace host server,
  intake callback or remote execution listener.
- GitHub credentials come from `AVOOZL_GITHUB_TOKEN`, `GITHUB_TOKEN`, or
  `gh auth token` (F35), never from SQLite or `.avoozl.json`. Kiro Crew's secret
  store may supply the environment variable.
- Issue text, comments, and pull-request text are untrusted data in every brief.
  Briefs quote them inside a fenced block labeled as data and restate the task's
  own acceptance criteria from the approved task facts.
- The responder agent has read tools only and no shell write or `gh` write; its
  reply reaches GitHub through `plans_post_reply`, which Avoozl screens for
  secrets and absolute paths before posting.
- Content rules (§4.9) check every write and approval against the rule sets
  `.avoozl.json` names; the terms stay out of Git, and findings never log
  them.
- Plugins run only after a person approves their exact version and hash, each
  in a local child process over stdio, with no port and no listener (§4.8).

### 4.8 Plugins and loading

Requirement 34. This is the one way to add an intake source or content
rules from outside Avoozl. A manifest that lists any other kind is refused
when it loads.

**Where plugins live and how they are declared.** A plugin is a package
installed into Avoozl's plugin folder under the app's data directory, a
local folder, or one commit of a git repository (below). Avoozl never installs one during a tick; **Add plugin** in
Settings does it. A `plugins` entry declares each plugin:

```json
{
  "plugins": [
    {
      "id": "example-intake",
      "package": "@example/avoozl-intake",
      "contract": 1,
      "config": {
        "baseUrl": "https://tickets.example.com",
        "tokenEnv": "EXAMPLE_INTAKE_TOKEN"
      }
    },
    {
      "id": "example-rules",
      "path": "../avoozl-example-rules",
      "contract": 1
    }
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

**Git sources**. An entry may
name a git repository instead of a package or a folder:

```json
{
  "id": "example-rules",
  "git": "https://git.example.com/team/rules-plugin.git",
  "ref": "v1.4.0",
  "subdir": "plugin",
  "contract": 1
}
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
{
  "id": "example-intake",
  "version": "1.2.0",
  "contract": 1,
  "kinds": [
    "intake"
  ],
  "capabilities": {
    "intake": [
      "actor"
    ]
  },
  "entry": "index.mjs"
}
```

The manifest `id` must equal the entry's `id`. `local` and `github` are
reserved. An intake source names a plugin as `plugin:<id>`.

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
macOS and Linux; `src/app/plugins/test/plugins.test.mjs` checks it.)
The plugin may call its own system over the network. Every reply is checked
against the contract schema and treated as untrusted data: quoted as data in
briefs, escaped in views.

**Failure isolation.** Each call has a time limit (default 20 seconds) inside
the tick's budget (§4.5). When a plugin is missing, unapproved, crashes, times
out, replies with an invalid shape, or expects an unsupported contract version,
Avoozl marks it unavailable for this tick, shows the reason on its intake
sources and rule sets, and finishes the tick for everything else. The next
tick tries again.

**Contract version.** One integer, `contract`. Avoozl lists the versions it
supports and refuses others at load. Changes inside a version only add
optional fields or capabilities.

**Intake kind** (Requirement 50.7). One call, `poll({cursor, limit})`:
changed items since the cursor, as incoming items (§4.12). With the `actor`
capability the plugin reports who acted, so trigger rules can run on its
items.

**Private integrations.** An intake source for an internal tracker is a
separate private package that plugs in here. Nothing in the public Avoozl
repository names a company-internal tool: not code, tests, fixtures, docs,
or this spec. Tests use only the fake plugins under `test/fixtures/plugins/`. The release leak scan
(§13 gate 5, task 7.4) covers plugin docs and fixtures.

### 4.9 Content rules

Requirement 40. A company that uses
Avoozl may need to keep private terms, internal system names, private
repository names, hostnames, and file locations out of everything Avoozl
writes. Avoozl already has narrow screens for some of this (F67–F71). This
section makes them one feature with one matcher, instead of adding another
screen beside them.

#### Facts

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F67 | **Verified.** The release scan keeps public rules (secrets, home and temp paths) in the script and reads private terms from an untracked file, `rule: regex` per line with `#` comments, at `$AVOOZL_RELEASE_TERMS` or `.avoozl/local/release-terms.txt`, matched per line ignoring case. A missing file prints a warning and the scan goes on. Each finding prints up to 160 characters of the matched line. It scans the npm and app packages, plugin docs, and fake plugins, and optionally the tree and history. | `scripts/check/release-scan.mjs` `PUBLIC_RULES`, `parseTerms`, `localTerms`, `scanText`                                                                      |
| F68 | **Verified.** `findPlanningLeak` decodes percent escapes and HTML character references (up to three rounds), drops zero-width characters and backslashes, and matches the planning repository's `owner/name` with whitespace allowed between its characters, ignoring case. It returns `{field, form}`, never the text. Callers: the linked-branch step, comment steering, worker dispatch (a brief that leaks is not sent), and `pullRequestLeak` over pull request titles, bodies, and commit messages.            | `src/app/github-plans-repo.mjs`; `github-linked-branches.mjs`, `github-steering.mjs`, `delivery.mjs` `planReadyDispatches`                             |
| F69 | **Verified.** `screenReply` checks a reply per line against a secrets table, a paths table, and this machine's own roots. It returns `{kind, line}` and never the matched text. `postReply` refuses with 422, posts nothing, and records a `github.reply.refused` event with the findings; the responder fixes the reply in its session.                                                                                                                                                                             | `src/app/github/github-respond.mjs` `screenReply`, `machineRoots`, `postReply`                                                                                |
| F70 | **Verified.** `secretReason` is a third secrets table (with a high-entropy check) that refuses markers (with the planning-repository and path checks), workspace publications, and the broad-issue preview comment, with 422 and a reason.                                                                                                                                                                                                                                                                           | `src/app/workspace/workspace-repository.mjs` `secretReason`, `scanWorkspacePublication`; `github-marker.mjs` `validateMarker`; `github-breakdown.mjs` `screened` |
| F71 | **Verified.** The three secrets tables (F67, F69, F70) differ in patterns and coverage.                                                                                                                                                                                                                                                                                                                                                                                                                              | Same files                                                                                                                                             |
| F72 | **Verified.** Nothing screens issue titles, issue body text outside the marker, Project field values, plan files at save or approval, or worker diffs. Only the eight modules in F68–F70 call a screen.                                                                                                                                                                                                                                                                                                              | `grep` for the four screen functions in `src/app`                                                                                                      |
| F73 | **Verified.** The plugin loader is on `kirocrew-native` with kinds `route` and `tracker`.                                                                                                                                                                                                                                                                                                                                                                                                                            | `src/app/plugins/plugins.mjs` `KINDS`; commit `8662302`                                                                                                        |
| F74 | **Verified.** `.avoozl/local/` is ignored (`.gitignore`, and `local-ignore.mjs` adds it for workspaces). Machine-local settings live at `~/.config/avoozl/config.json`, and shared configuration refuses absolute paths.                                                                                                                                                                                                                                                                                             | `src/app/workspace/local-ignore.mjs`; `src/app/settings/layered-config.mjs`                                                                                               |

#### Policy

`.avoozl.json` says which rule sets apply. It never holds a rule.

```json
{
  "contentRules": {
    "sets": [
      {
        "id": "company-terms"
      },
      {
        "id": "public-only",
        "action": "block",
        "boundaries": [
          "github",
          "diff"
        ],
        "repositories": [
          "example/app"
        ]
      },
      {
        "id": "trial-hostnames",
        "action": "report"
      },
      {
        "id": "example-rules",
        "plugin": "example-rules"
      }
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

| Boundary                 | What is checked                                                              | Where                                                                                      | On a match                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `plan`: planner draft    | Every spec file the planner saves or proposes                                | `plan.create`, `plan.save`, `plan.propose`                                                 | The call is refused with set, rule, file, and line; the planner fixes it                                                |
| `plan`: approval         | Every spec file at the exact folder hash                                     | `lintSpec`, as `content.match` diagnostics                                                 | Approval is refused; the diagnostic opens a decision                                                                    |
| `github`: issues         | Title and whole body (marker included) of every create or update             | Projection (§6.3), before the write                                                        | Nothing written for that issue; decision                                                                                |
| `github`: Project fields | Release and Iteration values                                                 | Project sync (§6.7), before the write                                                      | Nothing written for that item; decision                                                                                 |
| `github`: comments       | Breakdown previews, published summaries, steering replies, responder replies | Each comment writer, `plans_post_reply`                                                    | Avoozl's own comment: decision. A responder reply: refused in-call (F69)                                                |
| `github`: pull requests  | Candidate pull request titles, bodies, and commit messages                   | Each tick, as `pullRequestLeak` does (task 4.8)                                            | Completion blocked; decision; the worker is told the rule id and location                                               |
| `brief`                  | Worker, verifier, and reviewer briefs                                        | Before `send_to_session`                                                                   | Brief not sent; decision                                                                                                |
| `diff`                   | Added lines of the worker's diff against its base                            | `plans_report` `done`; pre-push hook; local integration; open pull request diffs each tick | `done` refused in-call; push stopped; integration held with a decision; GitHub-route completion blocked with a decision |

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

| Set                           | From                                                                              | Applies at                                                       |
| ----------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `builtin:planning-repository` | `findPlanningLeak` (F68), plans-repo mode only                                    | Linked branch, steering, briefs, pull requests (as today)        |
| `builtin:reply-safety`        | `screenReply` secrets, paths, and machine roots (F69)                             | Responder replies (as today)                                     |
| `builtin:published-secrets`   | `secretReason`, plus `validateMarker`'s path and planning-repository checks (F70) | Markers, workspace publications, broad-issue previews (as today) |

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

R40.15. A team's list will match some
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
  `allow <rule>: regex` cancels only that rule's match. A rule cannot be
  named `allow` or `allow <name>`.
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

| Choice                                                               | Why                                                                                                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Two layers: sets in `.avoozl.json`, terms outside Git                | Reviewers see which rules apply; the list itself never lands in a repository. The release scan already works this way (F67)        |
| One matcher; old screens become built-in sets                        | No fourth screen; one place to fix decoding and to prove "never logged"                                                            |
| Built-in sets cannot be turned off                                   | They guard credentials and plans-repo mode's core promise                                                                          |
| Block and ask, never redact                                          | A silent rewrite changes meaning without anyone seeing it, and hides that a list matched                                           |
| Agent calls are refused in-call; Avoozl's own writes open a decision | The agent can fix its own text at once, as the reply screen does today (F69); a decision per typo would page the owner for nothing |
| Added lines only for diffs                                           | Content already in a repository is not this change's leak, and blocking on it would stop all work there                            |
| Pre-push hook                                                        | A pushed branch on a public repository is already public                                                                           |
| Fail closed when a set is unavailable                                | The feature exists so content never appears; a missing file must not quietly turn it off                                           |
| Allow once by content hash                                           | It lets one reviewed exception through without weakening the rule for the next write                                               |
| Findings carry rule id and location, never text                      | Receipts, notifications, and logs travel further than the machine                                                                  |
| Time limit in a worker thread                                        | A synchronous regex cannot be stopped from the same thread                                                                         |
| `report` action                                                      | Lets a company try a new list on real traffic before it blocks                                                                     |

### 4.10 Agent and model per session

Every session Avoozl opens runs on this machine, on the executor its
harness names (§4.28). The crew snapshot (`crews.mjs`) stays for the In
flight view's unreachable-crew flag.

#### Facts

| #   | Fact                                                                                                                                                                                                                                                                                                                  | Evidence                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| F75 | **Verified.** The tick opens every session with `ctx.open_session(title, folder_id=, agent=, model=)`. The script API posts `name`, `title`, `folder_id`, `agent`, and `model` to `/api/chat/slots`. Every Avoozl session runs on this machine.                                                                        | `hosts/kirocrew/crons/tick.py` `run`; Kiro Crew `cron_script_context.py` `open_session`         |
| F83 | **Verified.** A worker finds its checkout through its Kiro Crew folder's project directory (MC-1), which exists only on this machine. The content-rules pre-push hook is installed per worktree on this machine (task 10.4).                                                                                          | `src/app/delivery/delivery.mjs` folder `Avoozl/<repository id>`; §7.1 MC-1; §4.9                       |

#### Agent and model per session

The writer's session comes from the `worker` row of the `roles` table
(§4.28), then Kiro Crew's default agent and `auto`. A retry keeps its last
model unless it is out. Checks and review roles keep
their own agent and model (§5.2). The binding records `agent`, `model`,
`modelUsed` (when Kiro Crew reports it, F65), and `sessionReason`. A coding agent outside Kiro Crew is a
process harness (§4.28).

### 4.11 Flow: timing, stop the line, and retrospectives

Requirements 43–48. The owner
approved the direction; the defaults below are this design's picks and are
marked as defaults.

#### Why this exists

The owner ran a large compiler rewrite through an agent workflow, and it took
weeks. To learn what slowed it down, the owner had to keep asking an agent
for a meta-analysis after the fact. Each time the same causes came back:

1. Too much process and ceremony per task: a session, a worktree, a
   verifier, review rounds, and a report for every small change.
2. Waiting on GitHub CI to learn about failures a local run would have shown
   in minutes.
3. Failures not fixed when introduced: later tasks built on a broken branch,
   failed, retried, and failed again for a cause that was not theirs.
4. No record of where each task's time went (code, tests, commands, waiting),
   so every analysis started from transcripts.
5. No pause to improve: the same slow step repeated for weeks because nothing
   stopped to look at it.

This section answers each with a standard practice from lean delivery,
named so that a later reader can look it up rather than reinvent it:

| Cause                                 | Practice                                                                                                                                                                                                                                                                                 | Avoozl feature                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 4. No record of time                  | **Value stream map** (each step's active and waiting time from request to delivery); **flow efficiency** (active time over lead time); **DORA metrics** (lead time for changes, change failure rate, time to restore)                                                                    | Flow timing, always on (Requirement 43) |
| 3. Failures not fixed when introduced | **Andon / stop the line**: anyone who sees a defect stops the line, the defect is fixed first, then work resumes                                                                                                                                                                         | Stop the line (Requirement 44)          |
| 2. Waiting on CI                      | Shift checks left: run them where the change is made, so CI confirms                                                                                                                                                                                                                     | Local checks first (Requirement 45)     |
| 1. Ceremony per task                  | Keep each step that every task pays small and cheap                                                                                                                                                                                                                                      | Batching small tasks (Requirement 46)   |
| 5. No pause to improve                | **Kaizen** (small, continuous improvement) through a **retrospective**; **theory of constraints** (improve the one biggest bottleneck, because speeding any other step does not speed the whole); **PDCA** (plan, do, check, act: check that a change helped, and undo it if it did not) | Retrospectives (Requirement 47)         |

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

Flow timing measures something no provider sees: wall-clock time across the
delivery steps, including the time no model is running at all (queued, CI
wait, review wait, waiting on a person). It stores no tokens, cost, prompts,
or transcript text.

Stop the line is a delivery rule driven by check results on the landing
branch; it opens no runs and pauses only dispatch.

#### Facts

A fact read from source and not called live is
marked so.

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                            | Evidence                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| F90 | **Verified (source).** Kiro Crew stores each tool call as a transcript row with role `tool`, the row's `ts`, and `meta` holding `tool_call_id`, the ACP `kind` (read, edit, execute, and so on), the redacted `input`, and the MCP server and tool name when the backend sends them.                                                                                            | Kiro Crew `dashboard/chat_turn/tool_rows.py` `_tool_meta`, `_on_tool_call`                                                                 |
| F91 | **Verified (source), not called live for tool rows.** An app token may read `GET /api/chat/slots/<slot>` only for a slot the app owns; the answer holds the messages with their `meta`, with `limit` and an incremental `cursor=1` read. Avoozl's backend already reads its tick-opened sessions this way for status, under the `/api/chat/slots/avoozl_*` grant in `app.json`. | Kiro Crew `dashboard/slot_ownership.py` `deny_app_slot_access`, `dashboard/chat_api/slot_detail.py`; Avoozl `src/app/executors/kirocrew/session-observer.mjs` |
| F92 | **Inferred.** No end time, duration, or exit code is stored with a tool row; only its start `ts`. A call's length can only be estimated as the gap to the next row, which also counts the model's thinking time after the call.                                                                                                                                                 | F90; no such field found in `tool_rows.py` or `tool_results.py`                                                                            |
| F93 | **Verified (source).** Session control refuses an app's own cron (`_app_owned_cron_refusal`), so the tick cannot use `session_read_message`; and that read returns only `index`, `role`, `content`, and `ts`, without `meta`.                                                                                                                                                   | Kiro Crew `dashboard/session_control_parts/caller_access.py`; `session_status.py` `read_messages`                                          |
| F94 | **Verified (source).** A slot the app does not own answers 404 to the app token, so the owner's own chats give the app no tool rows. Remote sessions are out of reach for the app (F77).                                                                                                                                                    | `slot_ownership.py` `deny_app_slot_access`; F77                                                                                            |
| F95 | **Verified (live, 2026-11-12, public repository).** GitHub check runs carry `started_at` and `completed_at`; pull request reviews carry `submitted_at`.                                                                                                                                                                                                                         | REST `commits/{sha}/check-runs`, `pulls/{n}/reviews`                                                                                       |
| F96 | **Verified.** Avoozl already records the events timing needs: session bindings with role, attempt, `boundAt`, and `statusAt`; `plans_report` with `progress`, `done`, `blocked`, and `question`; verifier entries `{command, exitCode}`; `integrateRun` reruns the checks on the integrated commit (F63); and the `events` table with `at`.                                     | `src/app/sessions/session-bindings.mjs`, `src/app/delivery/delivery.mjs` `reportSession`, `src/app/store/store.mjs`                                                |

So per-call detail is partly there: for sessions the tick opens on this
machine, Avoozl can read which calls ran, their kind and command, and when
each started (F90, F91). It cannot read when a call ended (F92), or read
sessions it does not own (F94). The fallback below fills in.

#### Timing model

A **span** is one stretch of one attempt in one stage:

```text
flow_spans(id, task_id, attempt, role, stage, started_at, ended_at,
           source, detail)        -- source: tool-calls | markers | events
```

`detail` holds a check name or a command name (first word and subcommand,
after the content rules), never output. Stages and where each comes from:

| Stage      | Starts                                                             | Ends                                       | Source                                             |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------- |
| `queued`   | Task becomes ready                                                 | Its worker session is bound                | events                                             |
| `coding`   | Worker bound, or a phase marker `coding`                           | Next span in the attempt, or `done`        | tool calls, markers, or events                     |
| `tests`    | A shell call running a repository check, or marker `tests`         | Next tool row or marker                    | tool calls or markers; verifier sessions as events |
| `commands` | Any other shell call, or marker `commands`                         | Next tool row or marker                    | tool calls or markers                              |
| `ci-wait`  | First check run requested on the pushed head                       | Last required check run completed (F95)    | GitHub check runs                                  |
| `review`   | Review role bound, or review requested on GitHub                   | Verdict reported, or review `submitted_at` | events, GitHub reviews                             |
| `rework`   | Attempt 2 or later starts after a rejection or failed verification | That attempt's `done`                      | events (the whole later attempt)                   |
| `merge`    | Verified, or pull request approved                                 | Integrated, or merged                      | events                                             |
| `waiting`  | `question`, or `blocked` on another task or a person               | The answer arrives                         | events                                             |

Rules:

- **Source order.** Tool calls when readable, then phase markers, then
  events. A worker span with neither tool calls nor markers is `coding`.
- **Phase markers (fallback).** `plans_report` `progress` takes an optional
  `phase` (`coding`, `tests`, `commands`, `ci-wait`). Avoozl stamps the time
  it receives the marker; the worker sends one when it switches. The worker
  brief asks for markers only when Avoozl cannot read the session's tool
  calls, so a tick-opened local session is not asked to report what Avoozl
  can already see.
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

| Metric              | Definition                                                                                                 | Practice                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------- |
| Lead time           | Ready to integrated (local) or merged (GitHub), per task                                                   | DORA lead time for changes |
| Flow efficiency     | (`coding` + `tests` + `commands` + `rework` + `merge`) / lead time                                         | Value stream map           |
| First-pass rate     | Tasks accepted on attempt 1 with no `rework` span / finished tasks                                         | Lean first-pass yield      |
| Time to fix         | Line stopped to line green, per stop                                                                       | DORA time to restore       |
| Change failure rate | Integrated tasks later named culprit / integrated tasks                                                    | DORA change failure rate   |
| Fix-work share      | Finished fix tasks (bugfix spec, `type: fix`, stop-the-line fix, or issue type Bug) / finished tasks (R79) | Failure demand             |

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

Requirement 64. In the Toyota line anyone who sees a
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

Requirement 64.12–64.16. The dialog's second choice is
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

Default on. It applies wherever a session Avoozl opens pushes. The brief tells the worker to run
the repository's checks before each push; the `done` report lists each
check's name, command, exit code, and duration for the pushed commit, for
the checks that commit's diff picks (§5.2); Avoozl refuses a
`done` without them. The pre-push hook Avoozl installs in each worktree
(task 10.4) also refuses a push whose commit has no recorded local pass. It
reads the record the worker's check run left in the worktree's git
directory, so the checks run once, not twice. A CI failure after a local
pass is recorded as "CI only", which usually means the two environments
differ; the retrospective sees those counts.

#### One session per task

Each ready leaf gets its own worker session and worktree, and makes its own
commit. Checks and review run on that commit. An agent may group its own
work inside one task.

#### Retrospectives

Triggers (Requirement 47.1) and their defaults:

| Trigger                      | Default                                                                                                  | Why                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Every N finished tasks       | `flow.retro.everyTasks` = 10                                                                             | A steady cadence, like a sprint retrospective, small enough to act on |
| A task far slower than usual | `slowFactor` = 3 × the repository's median lead time over its last 20 finished tasks, at least 5 of them | A spike is a signal worth a look while it is fresh                    |
| A task's third attempt       | fixed: two retries                                                                                       | Repeated rework is the clearest waste                                 |
| A long CI wait               | `slowFactor` × the repository's median CI wait, at least 5 samples; 30 minutes without them              | CI wait was one of the original causes                                |

At most one retrospective runs per workspace; triggers fold into the next
one, and spike triggers within an hour of the last retrospective wait for
the next count trigger (shortcut: fixed one-hour gap, make it a setting if
retrospectives run too often).

The `avoozl-retro` agent is tool-less, like the router (§4.10): it gets the
data in its brief and answers with JSON, so it cannot read or change
anything. One local session per retrospective, on `roles.retro.model`
(default `auto`, meaning Kiro Crew's default for the agent). The brief holds
the window's stage totals per task and per repository, the metrics with the
previous window's values, line stops with culprits and time to fix, flaky
checks, CI-only failures, the earlier proposals with their PDCA
results, and the owner's machine-local `flow.retro.instructions`. It passes
the content rules at the `brief` boundary.

Reply:

```json
{
  "bottleneck": {
    "stage": "ci-wait",
    "repository": "example/app",
    "evidence": "ci-wait is 41% of lead time over 10 tasks; median 23 min"
  },
  "proposals": [
    {
      "type": "settings",
      "file": "repository",
      "key": "flow.stopTheLine.scope",
      "from": "repo",
      "to": "dependents",
      "metric": "lead time",
      "direction": "down",
      "evidence": "6 of 10 tasks waited on stops in unrelated packages"
    },
    {
      "type": "plan",
      "spec": "example-spec",
      "change": "Split task 4.2 into a parser leaf and a wiring leaf",
      "metric": "first-pass rate",
      "direction": "up",
      "evidence": "4.2 took 3 attempts; both rejections were in the parser"
    }
  ]
}
```

- **Typed and bounded.** At most 3 proposals, each `settings` or `plan`.
  Settings proposals may touch only keys the Settings page edits, and never
  content rules, plugin trust or approvals, trigger actors or minimum
  permission, crew trust, or tokens: those guard safety, not speed. Removing
  a review role or a repository check is allowed, because ceremony was one of
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
    "stopTheLine": {
      "scope": "dependents"
    },
    "localChecksFirst": true,
    "retro": {
      "everyTasks": 10,
      "slowFactor": 3,
      "model": "auto"
    }
  }
}
```

In `.avoozl.json` per workspace, overridable per repository under that
repository's entry (`repositories.<id>.flow`); a missing key means its
default. `flow.retro.instructions` lives only in machine-local settings;
validation refuses it in a tracked file. There is no timing key.

#### Why each choice

| Choice                                          | Why                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Timing always on, no setting                    | The data must exist before anyone asks; the original problem was having none                                   |
| Stages fixed, not configurable                  | Comparable numbers across repositories and over time                                                           |
| Every span names its source                     | Exact and coarse numbers must not be mixed silently                                                            |
| Tool rows first, markers as fallback            | Use what Kiro Crew already exposes (F90, F91); ask workers only for what Avoozl cannot see                     |
| No prompts, output, tokens, or cost             | Flow is about time; Kiro Crew owns usage; less stored means less to leak                                       |
| Rerun once before stopping                      | One flaky check must not stop all work                                                                         |
| Culprit by range, bisect bounded                | A known culprit makes the fix task specific; an unbounded bisect would itself stop the line                    |
| Pause dispatch only; running chats untouched    | Stopping a chat mid-change loses work                                                                          |
| Default scope `dependents`                      | Stops what builds on the break and keeps unrelated work moving; `repo` and `all` are there for stricter owners |
| Stopped check is "not judged" on other tasks    | Nobody loses an attempt for a break that is not theirs (Requirement 38)                                        |
| Fix task first in line, revert allowed          | Andon: fix the line before new work; a revert is often fastest                                                 |
| Not in Needs you unless the fix needs the owner | The fix is already in line; Needs you is for decisions only a person makes                                     |
| Run anyway is person-only                       | Overriding a stop is the owner's call                                                                          |
| Local checks first, default on                  | CI should confirm, not discover                                                                                |
| Hook checks a record, not a rerun               | The checks run once                                                                                            |
| Tool-less retro agent                           | It can only propose, never act                                                                                 |
| Typed proposals with evidence                   | A proposal must be checkable and reversible                                                                    |
| Safety settings out of reach                    | A speed review must not loosen what protects the owner                                                         |
| PDCA with a revert proposal                     | A change that did not help should not stay by default                                                          |
| Retro instructions machine-local                | They may name private machines or people, like the router's                                                    |

#### Prompt, model, usage and charts

- **Built-in prompt, then the owner's.** Settings shows the `avoozl-retro`
  prompt read-only, folded, with Copy, and below it **Your instructions**,
  labeled as added after the built-in prompt. One shared page part; the
- **Model picker.** `roles.retro.model` (Settings › Models) is a dropdown of the models Kiro Crew
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

Requirement 50. Work arrives from
more places than GitHub: an internal ticket tracker, an internal code
review system, a script the owner runs. They share one record, one
operation, and one pipeline.

#### Facts

| #    | Fact                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| F101 | **Verified (source).** Intake is GitHub only. The tick's `intakeStep` calls `syncGitHubIssues` when a repository has rules. That lists open issues by each rule's first label (`candidateIssues`, never search), reads each issue's events and timeline, and stores matched issues as `github_issues` rows.                                  | `src/app/tick/tick.mjs` `intakeStep`; `src/app/github/github-sync.mjs` `candidateIssues`, `syncGitHubIssues`                    |
| F102 | **Verified (source).** The Untriaged list is GitHub only and is not in SQLite. The tick runs one GraphQL search per repository per 10 minutes and writes `untriaged.json` beside the database; `untriaged.view` applies the exclusions at read time.                                                                                         | `src/app/untriaged.mjs` `untriagedPath`, `refreshUntriaged`, `untriagedView`; `src/app/tick/tick.mjs`                    |
| F103 | **Verified (source).** The tracker contract has `project`, `read`, `list`, and `close`, and tracker capabilities `edges`, `subtasks`, `actor`, and `pause`. No call brings outside work in: `list` returns only records that carry Avoozl's own marker.                                                                                      | `src/app/plugins/plugin-contract.mjs` `trackerReplies`; `src/app/plugins/plugins.mjs` `CAPABILITIES`; `src/app/trackers.mjs` header |
| F104 | **Verified (source).** The plugin child calls a method by name and fails only when that method is called and missing. Changes inside a contract version only add optional fields or capabilities. So an optional `poll` needs no new contract version.                                                                                       | `src/app/plugins/plugin-child.mjs` `handle`; `src/app/plugins/plugin-contract.mjs` `SUPPORTED_CONTRACTS`                            |
| F105 | **Verified (source).** The tick opens only plugins an unfinished task names as route or authority. A plugin that is only a source would never be opened.                                                                                                                                                                                     | `src/app/tick/tick.mjs` `referencedPlugins`, `pluginStep`                                                                |
| F106 | **Verified (source).** A tracker close or pause counts as an order only when the plugin has the `actor` capability and the entry's `config.allowedActors` names the actor; anything else holds the task and opens a decision, and Avoozl does not reopen.                                                                                    | `src/app/trackers.mjs` `allowedActor`, `judge`                                                                      |
| F107 | **Verified (source).** GitHub's check is `actorAllowed(repository, login, held)`: `allowedActors` and `minimumPermission` over the ranks `none` < `read` < `triage` < `write` < `maintain` < `admin`, applied to the newest event that made a rule true. Actions apply by the precedence quarantine, pause, deliver, execute, plan, respond. | `src/app/github/github-policy.mjs` `PERMISSIONS`, `actorAllowed`, `matchingRules`; `src/app/github/github-sync.mjs` `PRECEDENCE`  |
| F108 | **Verified (source).** An MCP request carries Kiro Crew's caller block, which names a session key, not a person; a script cron's own copy of the server has no caller at all. Person-only operations refuse a session caller or MCP with 403.                                                                                                | `src/app/executors/kirocrew/app-mcp.mjs` header; `src/app/api/operations.mjs` `content.show`, plugin edits                                 |
| F109 | **Verified (source).** Content-rule boundaries are `plan`, `github`, `brief`, and `diff`. Nothing screens an item when it comes in; issue text is screened later, at `brief`.                                                                                                                                                                | `src/app/content/content-rules.mjs` `BOUNDARIES`; `src/app/github/github-sync.mjs`                                                 |
| F110 | **Verified (source).** `parseMatch` reads `label:`, `-label:`, `assignee:`, and `no:assignee` and refuses every other token by name.                                                                                                                                                                                                         | `src/app/issue-match.mjs`                                                                                           |
| F111 | **Verified (source).** `task.capture` (`plans_intake {action: "capture"}`) records a person's request as an inbox task, idempotent by a submission ID.                                                                                                                                                                                                          | `src/capture.mjs`; `src/app/mcp/mcp.mjs`                                                                                |
| F112 | **Verified (source).** Each store table is its own SQLite table of `id` and JSON `body`, on an allowlist in `store.mjs`; `github_issues` is one.                                                                                                                                                                                             | `src/app/store/store.mjs` `get`, `list`, `put`                                                                            |
| F113 | **Inferred.** An internal ticket tracker or code review system can answer "items changed since cursor X" for a query. A source that cannot is still usable, but its plugin must page through every open item each poll.                                                                                                                      | Not checked against any real system; proof P32 uses a fake                                                          |

#### The record

```json
{
  "source": "tickets",
  "id": "T-1042",
  "link": "https://tickets.example.com/T-1042",
  "kind": "ticket",
  "title": "Export fails on empty sheet",
  "body": "…",
  "labels": [
    "sev:3"
  ],
  "author": "alice",
  "assignees": [
    "bob"
  ],
  "state": "open",
  "updatedAt": "2026-11-12T20:01:00Z",
  "fields": {
    "component": "export",
    "queue": "app-team"
  },
  "trigger": {
    "actor": "bob",
    "permission": "write",
    "eventId": "T-1042:evt:77",
    "at": "2026-11-12T20:00:40Z"
  }
}
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
{
  "intake": {
    "sources": {
      "tickets": {
        "via": "plugin:example-tracker",
        "repository": "example/app",
        "labelFields": [
          "component"
        ],
        "assigneeField": "owner",
        "minimumPermission": "write"
      },
      "script": {
        "via": "mcp",
        "repository": "example/app"
      }
    }
  }
}
```

`repository` names a registered workspace repository, which is where a
delivered item's leaf lands and whose rules apply. It works in every mode,
Local only included, because a plugin or MCP source does not need GitHub.

#### Two ways in

**A plugin's `poll`** (preferred). A plugin provides `intake` and
implements `poll({cursor, limit})`, which returns
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
(Requirement 56) instead of new tool names.

#### Pipeline

```text
item ─► check ─► dedup ─► content rules ─► trigger match ─► action
          │        │            │                 │
       refused  unchanged   quarantined      no match ─► intake list
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
   without it matches GitHub items only.
5. **Action**, by today's precedence (F107), for the allowed matches
   (below): `quarantine`, `pause`, `deliver` or `execute` (a leaf, local
   authority, in the source's repository, pinned to the item's snapshot),
   `plan` (an inbox task through `task.capture`, F111, for the planner),
   `respond` (GitHub only in this phase), and `resume`. No match, or only
   disallowed matches: the item is untriaged.

**GitHub on the record.** GitHub intake writes each issue it lists as an
item with `source: "github"`, with its event and permission reads and its
snapshot freeze.

#### Who counts

| Source   | Actor                                        | Standing                                                                       | Check                                                                                             |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `github` | The newest event that made the rule true     | GitHub repository permission                                                   | The repository's `allowedActors` and `minimumPermission` (unchanged)                              |
| Plugin   | `trigger.actor`, with the `actor` capability | `trigger.permission`: the plugin maps its own system's roles to `none`…`admin` | The source repository's `allowedActors` and `minimumPermission`, default `write`, by the same `actorAllowed` |
| MCP      | None that Avoozl can verify                  | The local owner                                                                | Meets only `pause` and `quarantine` rules                                                         |

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
   CLI (`avoozl intake plan|deliver`). Both refuse a session caller or MCP with 403,
   like `content.allow`.

#### Updates and closes

An item from any source can change after it came in. Avoozl compares the
new record with the stored one and updates the record and the tied task:

| Change at the source                                      | Result                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title or labels                                           | The task's cached title and labels follow; rules run again; no allowed match left withdraws the authorization, as GitHub's `withdrawn` does                                                                                     |
| Body after the trigger snapshot                           | The task is quarantined until an allowed actor re-triggers or a person confirms the new snapshot (Requirement 12.1, 12.2). The snapshot covers the body only, as for GitHub                                                     |
| Closed by an allowed actor                                | An order: dependents are released, the actor, reason, and time are recorded, and it never counts as a verified completion; each released dependent's brief says the blocker closed without merged code |
| Closed by anyone else, an unknown actor, or an MCP caller | Dependents wait and a decision opens; Avoozl does not reopen the item                                                                                                                                                           |
| Reopened                                                  | The order is withdrawn; dependents wait again for new dispatch only; running sessions are left alone                                                                                                                            |

Avoozl writes nothing back to a non-GitHub source in this phase, so a
delivered item stays open at its source until someone closes it there.
Write-back belongs to a plugin's tracker calls, later.

#### Reviews

An item of kind `review` asks for a code review. It never becomes a
delivery: `deliver`, `execute`, `plan`, and `respond` rules skip it, and
only `pause` and `quarantine` apply. GitHub pull requests are kind `pr`.

#### Keeping and deleting

A closed item tied to no task is deleted 30 days after it closed. An item
tied to a task stays while the task does. The cursor row stays until its
source is removed from the settings.

#### Why each choice

| Choice                                      | Why                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| One record for every source                 | One matcher, one check, one list; a new source is a plugin, not a feature                        |
| SQLite, not a file                          | The cron and the backend already share the database; one lock, one quiet-tick rule               |
| `poll` on intake plugins                    | Reuses plugin consent, health, and isolation (§4.8); no model turn; the cursor survives restarts |
| MCP only for declared `mcp` sources         | An MCP caller cannot pose as GitHub or a plugin                                                  |
| Plugin states standing, Avoozl decides      | One `actorAllowed` and one visible bar                                                           |
| MCP is the owner but meets no starting rule | It cannot prove an outside order (F108); stopping rules are safe                                 |
| No `source:` means GitHub                   | Every existing rule keeps its meaning                                                            |
| `intake` content boundary off by default    | GitHub intake keeps its behavior                                                                 |
| Reviews never deliver                       | A review request is someone else's code, so it never delivers (§2)                                |
| No write-back yet                           | Smallest change; the tracker contract already holds the write calls                              |

#### A fix

A single bounded fix runs directly from its input issue or from text, with a
compact acceptance definition, exact-head checks and a pull request; it need
not become a full spec (Requirement 102.19). Its record is
`task.fix = {v: 2, source: {issue: {repository, number}} | {text, by},
snapshot, acceptance, definition}` in `src/app/intake/fix.mjs`: `snapshot`
is the digest of the issue's title and body or of the text, `acceptance` the
two lines, and `definition` the digest of the canonical record. **Make this
a spec** writes `.kiro/specs/fix-<n>/` with the text as `requirements.md`
and one task, and archives the fix with a link to it.

### 4.13 Pull request feedback

Requirement 54. #### Current-code facts

| ID   | Fact                                                                                                                                                                                                                                                                                             | Source                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| F114 | **Verified.** The plans-repo brief tells the worker to fix failing checks and answer review until the pull request merges. No code reads checks, reviews, or mergeable state for a leaf's open pull request.                                                                                     | `src/app/delivery/delivery.mjs` (brief step 5); `git grep` for `reviewThreads`, `mergeable` |
| F115 | **Verified.** The tick already sends two kinds of message to a bound worker through `intents.messages`: the leak screen's edit request and comment-mention steering. Both only reach sessions the tick opened (`source: tick`). | `src/app/github-close.mjs`; `src/app/github-steering.mjs`                          |
| F116 | **Verified.** Steering fences quoted text with `fence()` and checks the actor with `actorAllowed`.                                                                                                                                                                                               | `src/app/github-steering.mjs`, `src/app/github/github-respond.mjs`                        |

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
    worker gone                  -> new attempt, same branch, resume brief + text,
                                    same agent and model (§4.10)
    crew unreachable             -> wait (§4.10); nothing re-placed
    record receipt, round += 1
```

A round is counted when the message is sent or the attempt opens. The
same-check rule reads check names across the last three head commits the
worker pushed, so a flaky check that passes once resets it.

#### Choices

| Choice                                | Why                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| Avoozl relays; the worker edits       | Avoozl pushes and merges (Requirement 87); one writer per branch                                                |
| Only allowed actors' comments         | A public pull request's comments are untrusted; steering uses the same bar                    |
| One message per pull request per tick | A red CI run can fail ten checks at once; one turn should see all of them                     |
| Check links, not logs                 | Logs are large and may hold secrets; the worker reads them with `gh` in its own worktree      |
| A bound and a same-check stop         | A worker that cannot fix a check should stop costing turns and ask once                       |
| On by default                         | Delivery runs without a person; the switch exists for repositories with noisy bots            |

### 4.14 Plugin bundles and settings packs

Requirement 55. It replaces the
separate config-pack idea: a team ships one plugin, and a pack is one of
its parts.

#### Facts

| ID   | Fact                                                                                                                                                                                                                                                    | Source                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| F117 | **Verified.** The plugin manifest named `kinds` (route, tracker, rules), and the loader starts a child process only for a kind the manifest declares; an `entry` was always required.                                                                   | `src/app/plugins/plugins.mjs` `validateManifest`, `pluginHost`                       |
| F118 | **Verified.** Every setting a pack may set already has a validator that names the bad key: `normalizeGitHubPolicy` (repositories, project, epic type), `validateContentRules` (refuses rule-like keys), `deliveryPolicy` (review roles), `flowSection`. | `src/app/github/github-policy.mjs`, `content-rules.mjs`, `delivery.mjs`, `flow.mjs` |
| F119 | **Verified.** A repository that names nobody counts people with write access (`DEFAULT_PERMISSION`), so a pack that sets a lower permission or adds actors widens who counts.                                                                           | `src/app/github/github-policy.mjs` `repositoryInput`                                |
| F120 | **Verified.** A shared (`.avoozl.json`) entry may hold no absolute path, so a bundle reads machine paths from environment variables its config names.                                                                                                   | `src/app/settings/layered-config.mjs` `assertPortableRepositoryConfig`                |

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

| Rule                                               | Reason                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Pack runs no code; pack-only plugins have no entry | A team can share settings with nobody trusting code                                 |
| One whitelist, then the existing validators        | Settings and packs refuse the same values with the same names                       |
| Preview hash on import                             | The person imports what they saw, not what changed after                            |
| Who-counts change needs acceptance                 | Lowering who can give orders must never be silent                                   |
| `packs` provenance in `.avoozl.json`               | A reviewer of the commit sees where each setting came from                          |
| No follow mode, no org minimums                    | After import the settings are the repository's own; nobody upstream can change them |
| Intake is its own plugin kind's `poll`             | Reuses plugin consent, health, and isolation; Requirement 50 adds storage           |

### 4.15 Onboard a repository

Settings › Repository setup has one **Add repository** entry that runs these steps as follow-up setup.

Requirement 58. Settings >
Repositories gets **Onboard** beside Add repository: one stepped dialog,
styled like Add plugin, that walks a folder to plans read from git (Requirement 58).
Every step reuses an operation that already exists, except two new reads and
one adopt write.

| Step           | Operation                                                                                                 | Writes                       |
| -------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Pick folder    | `onboarding.inspect` (detect, plus `.avoozl.json`, spec folders, already added, visibility)               | none                         |
| Pick mode      | the mode cards, in the shared radio fold-out                                                              | none                         |
| Check GitHub   | `github.setup` without `confirm`                                                                          | none                         |
| Set up         | `github.setup` with `confirm`, `github.settings.update`, `repositories.configure`                         | each GitHub write asks first |
| Pick approvers | `onboarding.authors`: the base branch's commit authors, most commits first, without the agent author     | none                         |
| Import specs   | `plan.specs`, `onboarding.adopt {folder, specs, approvers}`                                               | plans, approvals, ticks      |
| Leak scan      | `onboarding.scan`: content rules plus the public secret and path rules the release scan uses              | none                         |
| Finish         | a summary and Approve in Plans for the drafts                                                             | none                         |

`onboarding.authors` and `onboarding.scan` are `observe`. The leak scan runs
only when the repository that holds the specs is public (single-repo mode,
or this folder as the planning repository), and it names file, line, set and
rule, never the matched text.

`onboarding.adopt` is `protect`, a person's call from the app page. It
checks that the folder is an added repository, then calls
`Operations.readFromGit`, the one reader behind `workspace.rebuild`
(§4.42), with the named specs, that folder as the only checkout, and
`approverCheck` over the emails the person confirmed instead of the
repository's own list. A spec that has a plan is skipped. The reader makes a
plan per spec, approves it again as the author of the approver's commit,
runs `applyBaseTicks` with `land`, which sets each done ticked task's
`integration.commit` to its tick commit when it has no landing, then records
landing trailers, Flow spans and retros. In a GitHub mode the dialog first
adds the confirmed emails to that repository's `allowedActors` with
`github.settings.update`, so later approvals check the same list. The flow
makes no per-task issues and no per-task issue text. It starts no agent and
pushes nothing.

### 4.16 Workflow templates, manual tasks, and task links and notes

Requirement 61. A repeated kind
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
```

| Key                          | Holds                                                                                      | Checked by                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `id`, `title`, `description` | Shown in the New plan drawer                                                               | `id` like a plugin ID, unique in the plugin                              |
| `inputs`                     | Fields the person fills: `text`, `choice` (with `options`), `file`, `repositories`, `epic` | Each has `id`, `label`, `type`, `required`; IDs unique                   |
| `prompt`                     | The planner prompt, Markdown                                                               | Exists; uses only known `{{input}}` names                                |
| `starter`                    | A spec folder in the §6.8 layout                                                           | Lints clean with sample values; may hold `manual` leaves and proof tasks |
| `phases`                     | Phase IDs and titles, in order                                                             | Match the starter's headings or `phase` values (§6.9)                    |
| `proofKinds`                 | Proof outlines: title, setup, action, expected, failure means, next decision               | Each has a title; the prompt tells the planner to fill them              |
| `pack`                       | A settings pack (§4.14)                                                                    | The pack validators of Requirement 55.4                                  |
| `flow`                       | Flow defaults                                                                              | The Flow settings validator (§4.11)                                      |

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
the plan to that epic folder's `tasks.md` and its facts, which come back as
a draft revision of the epic (§6.9: both sides must agree).

**Settings and flow.** Picking a template changes no setting. When it has a
`pack` or `flow`, the drawer shows the pack preview (create, change, keep,
skip) with **Import these settings**, unticked. Ticking it and submitting
runs the person-only pack import against the shown preview hash, exactly as
Settings does (Requirement 55.5–55.7).

#### Manual leaves

```markdown
- [ ] review Review with the team
  - $manual: true
  - $repo: sdk
  - $after: protocol-tests
  - $done: The team agreed the runtime and protocol results are good enough to cut over
```

- **Lint.** `manual` leaves need `done` and `repo`; `paths` is an error
  (`spec.manual-field`). `repo` only says where the issue lives, since
  nothing runs in it.
- **Tick.** A manual leaf is left out of `ready` for dispatch,
  verification, review and integration. Its edges work as for any task, and
  its dependents wait until it is done.
- **Lane.** Before its blockers finish it is in **Blocked or waiting**.
  Then it is in **Needs you**, tagged **Manual**, reason "Waiting for a
  person: Review with team". This reuses the lane people already watch and
  the Avoozl state option that exists on the board (§6.7), so setup
  changes nothing.
- **Mark done.** The task drawer shows the acceptance and **Mark done**. The
  dialog takes optional outcome links, and **Done** or
  **Skipped**. `task.manual.complete` and `task.manual.reopen` are person
  only (page and CLI); MCP refuses them (Requirement 56.2). Either choice
  releases dependents; Skipped stays visible on the task and in Flow.
- **Flow.** Time in Needs you counts as waiting on a person; first-pass
  rate and time to fix skip manual leaves.

#### Links and notes

Tasks keep links, not notes. The drawer box is **Links**: the list, or "No
links yet", and an **Add link** button that opens the URL and label fields
for one link with Add and Cancel. The CLI is `avoozl task links`.

| Field                         | Rule                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `kind`                        | `link`                                                                         |
| `url`, `label`                | Link only: `https` or `http`, at most 2,000 characters, no user info; label 1–200 characters |
| `outcome`                     | True when saved from a manual leaf's Mark done dialog                                        |
| `author`                      | `person` (with the `gh` login when known) or `session:<id>`                                  |
| `at`, `editedAt`, `removedAt` | Times; a removed entry leaves the list and stays in activity history                         |
| `onIssue`                     | Show on the issue; false by default                                                          |

**Why SQLite, not spec text.** Links and notes record what happened while
the work ran: a meeting's outcome, a doc a reviewer pointed at, a decision.
They change after approval. In a spec file each one would change the
revision hash and send the plan back for approval, and the planner would
own text that people and workers write. They are execution state, so
they live in a `task_notes` table with at most 200 entries per task. A
link that belongs in the plan itself goes through Edit plan.

**Access.**

| Who                       | List | Add                 | Edit or remove | Show on the issue |
| ------------------------- | ---- | ------------------- | -------------- | ----------------- |
| Person (page, CLI)        | yes  | yes                 | yes            | yes               |
| Session (MCP `task` tool) | yes  | its bound task only | no             | no                |

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

**Briefs.** A worker's brief gets a "Links" section: the newest
20 entries, at most 8,000 characters, each with author and time, introduced
as data from people and agents, not instructions. A dependent's brief also
carries each blocker's outcome entries, so the cutover worker reads what
the review decided.

**GitHub.** Nothing is written by default, because notes may hold meeting
notes not meant for a shared repository. An entry a person ticks **Show on
the issue** is listed in the managed body section under "Links" (a
rebuild still reads the older "Links and notes" heading). Edits there by others are conflicts, as for the rest of the
managed section. The rebuild test (§3.3) rebuilds shown entries from the
body; entries not shown live only in SQLite and its backups, and may be
missing after a rebuild, like session bindings.

#### Example: SDK rewrite template

| Phase          | Starter tasks                                                 | Kind                                                 |
| -------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| Inventory      | List `{{sdk}}`'s operations and features; read the gap list   | leaves                                               |
| Codegen        | Generate the client from the models; compare with the old one | leaves                                               |
| Runtime        | Port transport, auth, retries, paging                         | leaves                                               |
| Protocol tests | Run the protocol test suite until it passes                   | leaf, plus proof `protocol-tests`                    |
| Review         | **Review with team**                                          | `manual`, requires protocol tests                    |
| Cutover        | Switch callers, dry run, release notes                        | leaves, require review, plus proof `cutover-dry-run` |

```json
{
  "id": "sdk-rewrite",
  "title": "SDK rewrite",
  "description": "Rewrite one SDK on the new runtime, phase by phase, with a team review before cutover.",
  "inputs": [
    {
      "id": "sdk",
      "label": "Which SDK",
      "type": "text",
      "required": true
    },
    {
      "id": "repository",
      "label": "Target repository",
      "type": "repositories",
      "required": true
    },
    {
      "id": "gaps",
      "label": "Gap list",
      "type": "file",
      "required": false
    }
  ],
  "prompt": "prompt.md",
  "starter": "starter",
  "phases": [
    {
      "id": "inventory",
      "title": "Inventory"
    },
    {
      "id": "codegen",
      "title": "Codegen"
    },
    {
      "id": "runtime",
      "title": "Runtime"
    },
    {
      "id": "protocol-tests",
      "title": "Protocol tests"
    },
    {
      "id": "review",
      "title": "Review"
    },
    {
      "id": "cutover",
      "title": "Cutover"
    }
  ],
  "proofKinds": [
    {
      "id": "protocol-tests",
      "title": "Protocol tests pass"
    },
    {
      "id": "cutover-dry-run",
      "title": "Cutover dry run"
    }
  ],
  "flow": {
    "stopTheLine": {
      "scope": "dependents"
    },
    "localChecksFirst": true,
    "retro": {
      "everyTasks": 10
    }
  }
}
```

Each new SDK plan made this way can join one epic, such as an SDK target
architecture epic, through the drawer's Epic field. The review's outcome
note and links reach the cutover workers' briefs.

### 4.18 Retro prompt and skill proposals

Requirement 68. The retro of §4.11 can change settings and plans. Much of
what slows a task is in what the worker is told, so it may also propose
prompt and skill diffs. Proposals are on the Retros nav entry.

```text
retro brief ◀─ timing, receipts, prompt sections, skill texts
     │
     ▼ reply: settings │ plan │ prompt │ skill  (≤ 3, each with evidence)
schema + base hash + locked sections + content rules (`proposal`)
     │
     ▼ Proposals view: a person approves each one
prompt ─▶ override version N  (~/.config/avoozl/prompts/<workspace-id>.json)
repo skill ─▶ one leaf via Deliver this ─▶ PR or local integrate
external skill ─▶ note on the plugin card (nothing sent)
     │
     ▼ PDCA per version ─▶ kept │ undone
```

#### Facts

| ID   | Fact                                                                                                                                                                                                                        | Source                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| F121 | **Verified.** Avoozl composes the worker brief and the reviewer role brief itself; each quotes earlier words with "data, not instructions" lines, and a review role's `focus` (1–300 characters) comes from `.avoozl.json`. | `src/app/delivery/delivery.mjs` `workerBrief`, `reviewBrief`, `deliveryPolicy`                    |
| F122 | **Verified.** The retro and planner prompts ship in the app's agent files, and Kiro Crew loads an agent's prompt from the installed app; `retroPrompt()` reads the shipped file.                                            | `hosts/kirocrew/agents/avoozl-retro.json`, `avoozl-planner.json`; `src/app/flow/flow-retro.mjs` |
| F123 | **Verified.** The Spec Builder steering text is one constant, written into a repository only after a person agrees and never over a changed copy.                                                                           | `src/app/specs/spec-steering.mjs` `STEERING_TEXT`                                              |
| F124 | **Verified.** Content-rule boundaries are `plan`, `github`, `brief`, `diff`, and `intake` (opt-in); an unknown boundary is refused.                                                                                         | `src/app/content/content-rules.mjs` `BOUNDARIES`                                                 |
| F125 | **Unknown.** Whether Kiro Crew lets an app replace an agent's prompt for one session. Until known, an agent-prompt override travels in the seed (below).                                                                    | Not checked live                                                                         |

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

| Target                         | Delivered as                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `brief.worker`, `brief.review` | Avoozl composes the brief from the override's sections                                                                                        |
| `agent.planner`, `agent.retro` | The shipped agent prompt stays; the seed carries each changed section whole, labeled as replacing the section of the same name (F125)         |
| `steering.specs`               | The next steering file the New spec drawer writes; a copy equal to an older Avoozl text is offered again, a changed copy is left alone (F123) |

#### Proposals

```json
{
  "type": "prompt",
  "target": "brief.worker",
  "section": "steps",
  "base": "sha256:…",
  "diff": "@@ -3,1 +3,2 @@ …",
  "metric": "first-pass rate",
  "direction": "up",
  "evidence": {
    "runs": [
      "4.1#1",
      "4.2#2",
      "4.3#1"
    ],
    "value": "50%",
    "effect": "fewer rejections for a missing test"
  }
}
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
  workspace. Revert sets the active version back one step and is
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

#### UI

The Flow tab gets **Overview** (today's content), **Proposals**, and
**Lessons** views.
Proposals are on the Retros pill (§8.4).

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

#### Why each choice

| Choice                                       | Why                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Diffs against a hashed base                  | A stale proposal fails instead of overwriting a newer text                                            |
| Locked sections, and briefs outrank skills   | A speed review must not loosen what protects the owner                                                |
| Overrides outside shipped files              | An update stays clean, and revert is one step                                                         |
| Override per workspace                       | One workspace's evidence should not change another's prompts silently                                 |
| Repo skill change as a leaf                  | It is code in someone's repository, so it gets checks and review                                      |
| External skill as a note                     | Avoozl cannot edit a pinned plugin                                                                    |
| Lessons on this Mac, summaries only          | Cross-workspace reuse without moving one workspace's text into another                                |
| Undone and retired kept                      | Retros should not relearn what failed                                                                 |
| Automatic marks, person edits                | Marks are reversible; changing what a lesson says is a judgment                                       |
| Keep the override until a rebase is approved | Dropping it silently would undo a proven change                                                       |

### 4.19 Activity log and Activity tab

Requirement 71. One table of who did what, from
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
at})` in `src/app/store/activity-log.mjs`. It trims the summary to 200
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

| Where                                                                                                                          | Kind                                                                                      | Summary (Avoozl's words, IDs only)                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `task.start`, `run.start`, `session.request`                                                                                   | `dispatch`                                                                                | Dispatched TASK                                                          |
| `task.update` to Deferred                                                                                                      | `stop`                                                                                    | Stopped TASK (Deferred)                                                  |
| `flow.stop`, `flow.resume`                                                                                                     | `andon.pull`, `andon.resume`                                                              | Pulled or resumed the Andon cord for SCOPE                               |
| `integration.merge`, `task.merge`                                                                                              | `merge`                                                                                   | Merged TASK, or merged duplicates into TASK                              |
| `plan.approve`                                                                                                                 | `approve`                                                                                 | Approved plan PLAN                                                       |
| `plan.archive`, `task.archive`, `run.archive` and their undo                                                                   | `archive`, `unarchive`                                                                    | Archived THING                                                           |
| `plan.delete`, `run.delete`, `report.delete`                                                                                   | `delete`                                                                                  | Deleted THING                                                            |
| settings updates (configuration, GitHub, flow, delivery, conversations, content-rule sets and terms, activity) | `settings.save`                                                                           | Saved NAME settings                                                      |
| `plugin.approve`                                                                                                               | `plugin.approve`                                                                          | Approved plugin ID                                                       |
| `delivery.settings.update` with a model, `task.update` with an agent or model                            | `model.switch`                                                                            | Writer model set to MODEL, and so on                                     |
| GitHub verdicts                                                                                                                | `github.pr-merged`, `github.close`, `github.close-held`                                   | Closing pull request merged for TASK; ACTOR closed #N; the close is held |
| Project items                                                                                                                  | `github.board-deferred`, `github.board-resumed`, `github.board-ignored`, `github.release` | Board orders and ignored moves                                           |
| Wave written back                                                                                                              | `github.revert`                                                                           | Wave on TASK written back                                                |
| `github_issues` label events                                                                                                   | `github.label`                                                                            | ACTOR's label applied rule RULE (ACTION) on #N                           |
| incoming items                                                                                                                 | `intake.item`                                                                             | New ITEM from SOURCE, source `github` or `plugin`                        |
| projection and tracker conflicts                                                                                               | `github.conflict`, `plugin.conflict`                                                      | FIELD on TASK was changed outside Avoozl                                 |
| tracker verdicts                                                                                                               | `plugin.close`                                                                            | TASK closed in its tracker                                               |

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

| Choice                      | Why                                                                      |
| --------------------------- | ------------------------------------------------------------------------ |
| One table, one helper       | Provider switching and later callers add rows without a new store        |
| Avoozl writes every summary | Issue text and prompts never reach the log                               |
| Redact, not refuse          | The row still shows something happened, without the text                 |
| Diff snapshots in the tick  | One place sees every GitHub and plugin change without touching each step |
| `key` on derived rows       | Two ticks, or two processes, record a change once                        |

### 4.20 Provider health and switching models

Health reads are in `provider-health.mjs`. Settings › Models sets the model of Avoozl's own chats. There is no manual switch.

Requirement 72. A rate limit or an
empty credit balance stalls every chat on that provider. Avoozl reads each
session's usage turns and tool rows (§4.11), reads health from them, keeps
new work off an out provider, and moves running chats with Kiro Crew's own
model change. `out` is a hard check, and the settings are one low line and
optional limits.

```text
GET /api/usage/turns ─▶ sums per provider and model in the window ─▶ limits?
GET /api/chat/slots/<slot> rows ─▶ error kind (usage_limit, 429 …)    │
                                                                       ▼
                     provider_health: ok │ low │ out  (+ a person's marks)
                         │                              │
   new task / retry ◀────┘                              └──▶ running chat on out
   out never offered; low stays                            POST /api/chat/slots/<slot>/model
   an option                                               same session, next turn
                                                                 │
                                    provider_switches ◀──────────┘ ─▶ activity hook
                                    Needs you: "<provider> is out"
```

#### Facts

| ID   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                          | Where                                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F126 | **Verified from source, not called live.** `POST /api/chat/slots/{slot}/model` with `{model}` changes one chat's model in place (`session/set_model`) and answers `{ok, model}`; while a turn runs it answers `deferred: true` and applies the pick when that turn ends. An app may call it on a slot it owns: the slot checkpoint admits the owner app, and an app grant is a prefix match, so `/api/chat/slots/avoozl_*` already covers it. | Kiro Crew `dashboard/chat_api/slot_model.py` `api_chat_slot_model`, `dashboard/slot_ownership.py`, `dashboard/token_auth_app_scope.py` `_api_pattern_matches` |
| F127 | **Verified from source.** A failed turn leaves a row with role `error` and `meta.kind`, among them `usage_limit` (a spent plan allowance), `model_unavailable` (capacity or rollout refusal after the retry ladder) and `transient_retry`. Plain error rows have no kind, so Avoozl also reads a few words of the text, and stores only the kind.                                                                                             | Kiro Crew `dashboard/chat_utils_injected_rows.py`, `dashboard/chat_turn/recovery.py` `_terminal_error_meta`                                                   |
| F128 | **Verified from source.** `GET /api/models` lists `model_name`, `display_name` and `description`, with no provider. Providers therefore come from the model ID's first word.                                                                                                                                                                                                                                                                  | Kiro Crew `dashboard/handlers/agents.py` `api_models`                                                                                                         |
| F129 | **Verified live (Kiro Crew 0.12.2.4 test crew, port 5698, 2026-11-19).** The app backend can do the tick's Kiro Crew calls only with wider grants than `app.json` holds. With today's grants the app token gets 403 `{"code": "forbidden"}` ("app token not permitted for this endpoint") on `GET /api/chat/slots`, `GET /api/chat/folders`, `POST /api/chat/slots` and `POST /api/chat`. With `/api/chat` granted, it lists folders, creates a folder, opens a slot bound to an agent in a folder with a project directory, and sends with `POST /api/chat?ws=1` (`{ok, slot, mid}`, or `{ok, queued, queue_id}` when busy). `POST /api/chat/mode` `{mode: "trust"}` still answers 403 `session_approval_not_granted` until the manifest declares `permissions.sessionApproval` and the owner consents. That grant also lets the app send turns to, and set the mode of, every local chat the person opened. The token scope check is path-only: any grant that reaches `POST /api/chat` reaches the whole `/api/chat/*` tree, including `GET /api/chat/slots`, which lists the person's own chats with their titles. No Node cron exists: an app cron is a Python `script` or a `sh -c` `command`, which never runs on Windows. App backends start with the gateway and are restarted when they exit. App MCP `args` are not anchored to the install root except a relative `.py` launcher, so `bin/avoozl_mcp.py` stays. | Probe `node-tick-probe.mjs` against the test crew; Kiro Crew `dashboard/token_auth_app_scope.py` `_api_pattern_matches`, `chat_api/slot_approval.py` `deny_session_approval_caller`, `slot_ownership.py` `app_may_control_session`, `apps/permissions.py` `app_can_manage_session_approvals`, `cron_script_context.py`, `apps/bridges_mcp.py` `_resolve_app_launcher_arg`, `docs/cron-and-scheduling.md` |

#### Settings

Machine-local, `~/.config/avoozl/config.json` key `providers`, because
limits and credits belong to that machine. `.avoozl.json` refuses the key
(tick and settings validation):

```json
{
  "providers": {
    "lowPercent": 80,
    "limits": {
      "claude": {
        "credits": 500
      },
      "model-a": {
        "tokens": 2000000
      }
    }
  }
}
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
  and tokens), why, and one line such as "claude: 85% used, low".

shortcut: errors are read from local worker sessions only (the rows the
timing read already has); reviewer errors are missed until an app-scoped roster carries them. Their usage still counts.

#### New tasks and retries

An `out` model is a hard check (§4.10): it is never offered, and a
person's replacement for it is offered instead. A `low` model stays an
option. The delivery model is the one choice: out takes the person's
replacement, else the task waits.
A retry keeps its model unless it is `out` (R72.6).

#### Running chats

After the reads, the backend looks at each live session the tick opened.
Only `out` moves a running chat; `low` never does. On an `out` model it picks
a target (R72.9: the person's replacement, then the models Kiro Crew lists, the first `ok`, else `low`) and calls F126. The binding's
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
- **Providers.** `lowPercent` and a credits limit per provider are read from
  this machine's settings file (R72.17).

#### Why each choice

| Choice                                           | Why                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Kiro Crew's model change, not a new session      | The chat keeps its context, worktree and commits, and Kiro Crew waits for the turn to end |
| Health from reads Avoozl already makes           | No new request and no new grant                                                           |
| Store the kind, not the text                     | Error text can hold prompts or paths                                                      |
| Credits mark the provider, rate limits the model | Credits are an account's; a limit is often one model's                                    |
| Person marks stay until undone                   | A timer would undo a person's decision                                                    |
| Settings on this machine                         | Limits and reachable models differ per machine                                            |

### 4.21 Investigate before coding

Requirement 75. A leaf's first turn is findings, not
code; a falsifier tries to break them; a gate decides.

```text
dispatch ─▶ worker: findings + confidence (no edits)
              ─▶ falsifier (read-only, other model): stands | refuted + confidence
                   ├─ both ≥ minConfidence and stands ─▶ worker: go ahead
                   └─ else ─▶ Needs you: Go ahead | Investigate again | Stop
```

| Setting                              | Values                    | Default       |
| ------------------------------------ | ------------------------- | ------------- |
| `delivery.investigate.mode`          | `all`, `not-small`, `off` | `not-small`   |
| `delivery.investigate.minConfidence` | `medium`, `high`          | `high`        |
| Task fact `investigate`              | `true`, `false`           | from the mode |

The falsifier is role `falsifier`, chosen like a review role (§4.10) with
`distinctFrom: model`. Its brief quotes the findings as untrusted data. One
round per press of Investigate again; the attempt does not spend a retry.

### 4.22 Evidence bundle

Requirement 76. One bundle per task under
`.avoozl/local/evidence/<task-id>/`: `bundle.json` (entries with kind,
time, source and text) and attached files. Kinds: `findings`, `falsifier`,
`decision`, `review`, `check`, `file`. Every entry passes the content rules
and the secret screen first; a blocked entry is saved redacted. The drawer
reads it through `task.evidence`. On GitHub one comment per pull request,
found again by its marker, holds the text summary and is updated in place.
Entries are screened at the `evidence` content boundary. A worker attaches
files through `plans_report` `evidence: [{kind: "file", path, note?}]` and
notes as `{kind: "note", text}`; a check entry may carry `logTail`.
shortcut: GitHub's API cannot upload a file to a comment, so
`github.evidence.attach` is not built and the comment names attached files
only; upgrade if GitHub adds an upload API.

### 4.23 Bringing pull requests up to date

Requirement 77. The tick remembers each base branch
head. When it moves, it reads `mergeable` and `mergeStateStatus` of the open
pull requests its writers opened and, for `CONFLICTING` or `BEHIND` (when up
to date is required), sends one pull request feedback message of kind
`base-moved`: merge the base branch in, fix, check, push; never force push.
Avoozl refuses to send a brief or message that holds `--force`,
`--force-with-lease`, `push -f` or a `+` refspec; the tick drops it and
says so once. A move is judged once GitHub has read mergeability again
(`mergeable` is not `UNKNOWN`), and its message goes out once per base head.
The base head is the pull request's `baseRef` target, read in the same
query. Locally, a verified task whose integration branch moved is merged
forward in its worktree with a merge commit, which every role then judges
again.

### 4.24 Rules from repeated corrections

Requirement 78. `corrections` rows {id, taskId, by,
kind, summary, at}. The retro groups them by meaning (model) and needs two
tasks per group to propose a rule. Approval makes one leaf, source `retro`,
that edits `.kiro/steering/avoozl-rules.md`; it reaches the repository by
the usual review and checks. PDCA watches the group after the rule lands.

### 4.25 Who merges a pull request

Requirement 80. `landing.pr` is the one setting for who merges a `pr`
landing's pull requests. A review approval cannot be the release signal:
GitHub refuses an approving review of one's own pull request, and Avoozl
opens pull requests as the owner. Ready for review can be, and GitHub
already shows it.

| `landing.pr`      | Opens as         | Who merges                                   |
| ----------------- | ---------------- | -------------------------------------------- |
| `draft` (default) | Draft            | A person, after Ready for review or Approve  |
| `ready`           | Ready for review | A person                                     |
| `auto`            | Ready for review | Avoozl, once checks pass on the exact head   |

**Setting.** `landingSettings` (`landing-config.mjs`) reads `pr` from the
repository's landing block, then the workspace's top-level `landing.pr`,
then `draft`. `validateLandingConfig` and the landing block validator in
`github-policy.mjs` refuse any other value. Settings › Delivery shows the
workspace's value (`delivery.settings.update` with `landingPr`); a
repository's Landing tab shows its own (`PrModeFields`), whose first
choice is **The workspace's setting**. Both saves are person only.

**Open.** `pullSteps.prepare` sends `draft: pr === "draft"`.
`publishPlanningPullRequest` (`workspace-repository.mjs`) sends
`draft: true`. `draft-pulls.test.mjs` reads every `.createPullRequest(`
call in `src/` and fails on one that leaves it to GitHub's default.

**Wait.** `pullSteps.check` reads the required checks. A failed check fails
the portion, so the worker gets it back even on a draft. Otherwise a draft
returns `{wait, reason: "draft"}` before any review read. Once checks and
reviews pass, `draft` and `ready` return `{wait, reason: "merge"}` unless
the queue entry's `mergeApproved.commit` is that exact head; `auto` goes on
to merge. `land` refuses a draft. `queuedHold` shows "Draft, waiting for
you." or "Ready to merge, waiting for you."; `landingWaitNeedsYou` gives
one `needs-human` row (`draft-pr` or `pr-merge`) at once, titled by the
pull request alone, since the row already names its task.

**Release and merge.** Ready for review on GitHub is seen by the next
tick's `prepare`, which reads the pull request anyway. **Approve** is
`landing.ready` (person policy), which calls `releaseDraft` and then
`markPullRequestReadyForReview`, or writes nothing when it is already
ready. **Merge** is `landing.merge` (person policy), which calls
`approveMerge`; it accepts only the head the last check saw pass. The next
tick checks that head again and merges it with `headGuardedMerge`; a moved
head merges nothing. A merge on GitHub is recorded by `observe`. Nothing
converts a pull request back to a draft. Avoozl never arms GitHub
auto-merge, so every merge it makes follows a check it read itself. A
pull request closed without merging goes back to its writer once, as one
feedback round.

**One landing block per repository.**

```json
{
  "landing": {
    "pr": "draft"
  },
  "github": {
    "repositories": {
      "owner/name": {
        "landing": {
          "mode": "pr",
          "pr": "ready",
          "method": "squash"
        },
        "conflicts": {
          "onSourceConflict": "fix",
          "maxAttempts": 2
        }
      }
    }
  }
}
```

| Key                    | Values                  | Default  | When the block sets none                                    |
| ---------------------- | ----------------------- | -------- | ----------------------------------------------------------- |
| `landing.mode`         | `direct`, `pr`, `off`   | `off`    | `projects.<id>.landing` of the checkout of that repository |
| `landing.pr`           | `draft`, `ready`, `auto`| `draft`  | the workspace's top-level `landing.pr`                      |
| `landing.method`       | `squash`, `merge`       | `squash` | the default                                                 |
| `conflicts.maxAttempts`| 0–10                    | 2        | the default                                                 |

`landingSettings` is the one reader of the block. The landing code reads
the mode from the project row, so the tick (and the app on each load of
`.avoozl.json`) copies `landing.mode` onto the row of each registered
checkout whose GitHub `owner/name` sets it. `conflicts.maxAttempts` bounds
the rounds a landing conflict goes back to its worker chat (Requirement
87.6). `avoozl setup REPO` writes `landing.mode` and leaves
`repositories.<id>.landing` as it was.

Settings › Repository setup › Edit › Landing has one **Who merges** section
(mode and `landing.pr`), **Merge method** and **Conflicts**. `direct`
landing and Local only have no merge setting: Avoozl lands the verified
commit after its checks pass.

Avoozl's own repository sets none of these keys: it keeps `pr` from its
project, draft pull requests, squash and 2 landing rounds.

### 4.26 Avoozl owns the coding loop

Requirements 86–92. The worker edits and commits; Avoozl reads the commit,
runs the checks and pushes. Nobody else pushes, merges or claims a task.

**Settled points.**

| #   | Decision                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Avoozl pushes and merges. Per repository: `landing: direct \| pr \| off`. It lands only after checks pass on the updated head. Never force push. Avoozl's own repository honors the owner-selected policy; do not restore its disabled required-check gate (R87.8) |
| 2   | A vanished worker chat is resumed once, automatically, in the same worktree, only when Kiro Crew reports the chat gone. Never because it went quiet or its lease expired. A second vanish goes to Needs you       |
| 3   | `lanes.local` (default 3) in the machine file sets how many workers this machine runs at once (§4.26 Lanes)                                                                                                       |
| 4   | A worker chat opens with `project: false` and the worktree path in its brief, and reports by CLI                                                                                                                  |
| 5   | Kiro Crew's push-to-main policy checks chat shell commands. The tick is not a chat, so its push goes through                                                                                                    |
| 6   | Nupp lands `direct` on public `core-dev`, with `scripts/worktree` and `scripts/test-changed`. Plans stay in a private planning workspace. No private mirror, forwarding or leak scan for this setup; the pre-push content rule is the one leak guard. |

**The loop.**

```
Pick ──> Prepare ──> Work ──> Verify ──> Land ──> Accept
Avoozl    Avoozl     chat     Avoozl     Avoozl   Avoozl (Stop the line)
```

- **Pick.** One scheduler per workspace. Ready tasks are ranked by how many
  tasks they unblock. A task whose declared `paths`
  overlap a running task's paths anywhere in the repository is held, not
  skipped: it stays first in line. The owner's picks and the plan order
  still win.
- **Prepare.** `createWorktree` (`src/app/git/git.mjs`) gets its first caller.
  With `scripts/worktree` present it runs only the hash-approved version
  (R83.4); otherwise `git worktree add`. A task is cut from its spec's recorded working head, including an authorized fork (§4.32).
  After landing, the worktree and the local task branch are removed.
- **Work.** The chat opens with `project: false`, its trust mode set, and a
  brief that names the worktree path, the task, its acceptance, its
  declared paths and one command to report:
  `avoozl runner report TASK done|blocked` (§4.28).
  The brief says: edit, run what you like, commit; do not push, open a pull
  request, merge, label or comment. The trust mode is set again on every
  tick, because a gateway restart loses it.
- **Verify.** On `done`, Avoozl reads `HEAD` of the worktree (never the
  chat's word for it), diffs it against the task's base, refuses a file
  outside declared paths, and sends a protected path to Needs you. Checks
  run as their own job, off the tick, warm in the task worktree, each with
  a timeout. A failure goes back to the same chat as one retry round
  (Requirement 8's bound).
- **Land.** One queue per base branch, held by `withWorkLock`
  (`src/app/git/git.mjs`) with kind `integration`. One exact portion lands at a time; direct merge batches follow §4.32.5.
- **Accept.** Stop the line (Requirement 64) watches every head Avoozl
  landed. A red head pauses the queue for that base and opens a fix task.

**Landing modes.** `direct` checks an exact merged portion or merge batch
against the current target base, then advances it with a guarded fast-forward.
`pr` proposes an exact verified portion from the target repository or a fork;
its own required checks and standing review govern the merge. `off` verifies
only and pushes nothing. No force pushes or bypasses. See Requirement 87 and
§4.32.5; a checkpoint is not a landing or acceptance receipt.

A merge conflict goes back to the same worker chat with the file list, for
the repository's `conflicts.maxAttempts` rounds (default 2, §4.25), then
to Needs you. `pr` mode lands pull requests itself. A pause from Stop the line keeps the queue's order.

Every push passes the pre-push content rule first (Requirement 40): commit
messages, branch name and added lines. The push and the merge run in the
tick's own process. Kiro Crew's push-to-main policy reads chat shell
commands, so it does not see them; Phase 40's proof checks that on a real
gateway, because if the policy also covered the tick, `direct` would need a
person to push.

**Vanished chats.** Kiro Crew's session list is the only signal. When it
says the chat is gone, Avoozl opens one new chat in the same worktree with
the same brief and the last report quoted as data. A quiet chat or an
expired lease changes nothing (AGENTS.md). A second vanish for the same
task opens a Needs you item.

**Lanes, workers and ownership.** Two settings decide how much runs at once. `lanes.local` (default 3, 0–32) in
the machine file (`~/.config/avoozl/config.json`) is how many worker chats
this machine runs; it describes the machine, so it is not shared through
the repository. Release N (`github.repositories.*.release.capacity`) is how
many issues a repository releases at once. `deliveryPolicy` sets
`concurrency` from, in order: the machine file's `lanes.local`, the
`.avoozl.json` `lanes.local`, then 3. A file that sets `delivery.concurrency`
or `delivery.repositories.*.concurrency` does not load, and the error names
the file and the key. A per-workspace field cannot hold one machine
number, so there is none. The merge batch size is a batch size, not a
concurrency setting.
shortcut: each workspace counts only its own live chats against the lanes,
so two workspaces on one machine can run up to twice the lanes; count across
the catalog once a machine serves several busy workspaces.
Each spec has an issue-assigned driver, with an epic-assignee fallback only
when unambiguous. The driver's check is repeated before integration and
landing. Quiet and expired leases release nothing. Headless process workers
need no Kiro Crew page. See §4.32.7 and §6.10.

**Setup.** Preview registered roots, target/base, checks, protected paths,
approved helper, source/fork access and landing policy. Under `pr`, preview
required rules, merge methods and statuses without duplicating rules. Do not
create task labels, Project or issue types. Publish issue is a separate
per-spec action. Real settings changes still need owner authorization.

**Approval.** An approver's commit on the specs branch is the approval; the
hash receipt caches it (§4.42).

**A public repository with private plans.** For the Nupp compiler, plans
stay in a private planning workspace and code lands `direct` on the public
`core-dev`. Nothing private is pushed: the brief carries no plan text into
commit messages, branch names are `avoozl/<task id>` with task IDs checked
by the content rule, and the pre-push content rule screens each push. Its
plans sit on the planning repository's `avoozl-plans` branch (`specs.branch`,
§4.45).

### 4.27 Links to related GitHub items, and the landing queue

Requirement 92. Avoozl links from specs and in-flight work to the GitHub items
they relate to, and shows what waits to land. Discussion and full browsing stay
on GitHub. A dedicated SCM links page is out of scope.

**One link set, from stored records only.** A pure read model builds one link
set per spec and one per task from rows the tick and landing already write.
It adds no GitHub read, and its only input is the local store:

| Link | Stored source |
|---|---|
| Spec issue | Spec publication (56.2) |
| Spec working branch | Qualified working heads (56.3) |
| Task branch and worktree | Worktree preparation (40.4) |
| Task PR and check state | Landing queue and the shared PR/check read (41.x, 42.x) |
| Landed commit | Delivery records |
| Intake issues a spec came from | Intake records |

Each link carries its repository, kind, number or ref or SHA, and, for check
state, the head SHA and read time. A URL is built from those fields for the
repository's registered host; no URL is taken from issue or comment content.
A missing record shows as "none". Check state shows its age; when the stored
head differs from the task's current head the dot is grey and says so. A
counting-client test builds link sets for a seeded workspace and asserts the
GitHub call count is the same as with link sets off.

**Where links show.**

| Surface | Links box or chips |
|---|---|
| Spec details panel | Spec issue, working branch, open PRs with a check dot each, intake issues it came from |
| Task details view, and the Graph modal that reuses it | Branch, PR, checks, landed commit, issue |
| In flight rows | `PR #N` chip with a check dot; branch chip |

Every GitHub link is an anchor with `target="_blank"` and
`rel="noopener noreferrer"`. A worktree path is shown only in the local app,
as text, never as a link and never in a GitHub write. A spec issue in a private
home renders only on local surfaces.

**Landing queue page.** Dashboards gains a Landing queue page next to CI (a
Dashboards page, not a nav pill). It reads the per-base landing queue (41.2)
and the cached check state: one group per target base, items in landing order,
and for each held item the reason (checks pending or failing, conflict round
N, path hold, review missing, line stopped, landing off). At 390 px rows stack
full width. It makes no GitHub call; Refresh redraws from the store.


### 4.28 Any harness runs the work

Requirements 93–98. This seam comes first: Phase 46 runs
before the worker rebuild of §4.26 (Phases 40–45), so the rebuild calls the
executor interface and never Kiro Crew directly.

```
tick (planner) ──writes──> session requests {executor, role, task, ...}
                              │                         │
                     kirocrew executor            process executor
                     (Kiro Crew chats)            supervisor pass (each avoozl tick)
                                                  child = agent CLI in the worktree
                              │                         │
              runner report (chats) ┴ exit code + .avoozl/result.json (children) ──> Avoozl commits or reads HEAD
```

**Executor interface.** `start(role, task, worktree, brief, model,
permissionClass) -> sessionId`, `send(sessionId, text)`,
`status(sessionId) -> working | idle | exited <code> | gone`, and optional
`stop` and `usage`. The `kirocrew` executor holds today's calls from
`hosts/kirocrew/crons/tick.py`; folders and project directories are its
private detail. The `process` executor hands the request to the
supervisor pass.

**Harness definitions.** One JSON file per harness in the machine config,
approved by hash like the worktree helper. Commands are argv lists with
placeholders; nothing is passed through a shell.

```json
{
  "name": "example-cli",
  "start": [
    "example-cli",
    "--cwd",
    "{worktree}",
    "--model",
    "{model}",
    "--prompt-file",
    "{brief_file}",
    "--sandbox",
    "{permission}"
  ],
  "resume": [
    "example-cli",
    "--resume",
    "{session}",
    "--message-file",
    "{message_file}"
  ],
  "permission": {
    "write": "workspace-write",
    "read": "read-only"
  },
  "writeRoots": [
    "{worktree}",
    "{tmp}",
    "{repository_cache_dirs}"
  ],
  "allow": [
    "{repository_allow_commands}"
  ],
  "cost": {
    "from": "output",
    "field": "total_cost_usd"
  }
}
```

The values above are an example. Each real CLI's accepted permission and
sandbox values are not verified yet; they are proof items of Phase 47
(Claude Code) and Phase 48 (Codex).

**Settled points.**

| Topic          | Decision                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permissions    | Write roles: the harness's workspace-write sandbox, confined to the task worktree. Read-only roles: read-only. Never a skip-all-permissions or bypass flag. A harness that cannot confine writes is refused for write roles unless the owner opts in per machine. Avoozl passes no spend cap |
| Default        | `process` with Claude Code for the Nupp compiler repository; `kirocrew` for Avoozl's own repository until Phase 47's proof passes                                  |
| Write roots    | Task folder, temp, and the cache directories in repository config. The worktree's git directory is in the main checkout (`git rev-parse --git-common-dir`), so the child only edits and Avoozl commits after it exits |
| No skip flag   | Enforced in code: a definition with `bypassPermissions`, `danger-full-access` or any `--dangerously-*` flag is refused at load, with a test. One exception (R94.4d): `permission.write` may be exactly `danger-full-access` for a harness whose own sandbox cannot nest inside Avoozl's (Codex on macOS); such a child starts only inside Avoozl's sandbox with the task write roots, and with no Avoozl sandbox it is refused, opt-in or not |
| Allow-list     | Per repository, the build and test commands an unattended child may run without a prompt. `git push` is never on it |
| Quota          | Plan quota: no new session once the quota reads low |
| Kiro Crew repo | Avoozl's own repository on `kirocrew` chats has trust mode set again each tick, or ordinary workers stall unattended |
| Person-only    | Children get `AVOOZL_CHILD=1`, and the CLI refuses person-only commands there. That is a speed bump: the child runs as the owner. "Never" holds only through the sandbox: database, credentials and the Kiro Crew home outside its reach, network off or restricted. For `kirocrew` chats it stays a speed bump |

**Supervisor pass.** Each `avoozl tick` runs the supervisor pass, which owns
children: session id, pid, start time, exit code and log file, in SQLite in
the machine state folder. It takes only `process` requests and starts each
child detached, so the child outlives the tick. A later pass finds it by pid
and start time, reads its exit file once it ends, and resumes it on a queued
message with the same session id; one it cannot find is `gone`. Whatever runs
the tick runs the pass: the app's cron on a Kiro Crew machine, a launchd,
systemd or cron timer, or a driver chat (`.kiro/specs/machine-server/`).

**Finishing.** A sandboxed child cannot reach the database, so a `process`
child ends by writing `.avoozl/result.json` in its task folder (`state`
`done` or `blocked`, and `text`) and exiting. The supervisor pass reads the exit
code and the file; Avoozl commits the changes and checks the diff. Avoozl
never stages a path under `.avoozl/`, whatever the repository's
.gitignore says, and refuses to land a worker commit that holds one
(`commitWorkerChanges`, `refuseAvoozlPaths`). A missing or bad file, or `done` with a non-zero exit, is `exited <code>` and
takes the retry path. Kiro Crew chats and people use `avoozl runner report
TASK done|blocked`; `next`, `take` and the report stay as the manual
path.

**Prompts.** `prompts/<role>.md` holds each role's prompt; the build writes
the Kiro Crew agent files from them, and a test fails on drift.

**UI.** Only the Avoozl page in Kiro Crew. In flight shows a `process`
session's status, log tail, cost and a copyable attach command; Send
message queues a `send`; Settings › Models picks a harness and model per
role. Headless machines have
`avoozl status` and `avoozl runner status --json` only.

**Roles table** (R98.5 to R98.9). One `roles` object
in `.avoozl.json` holds each role's harness, agent and model:

```json
{
  "roles": {
    "worker": {
      "harness": "claude-code",
      "agent": "avoozl-worker",
      "model": "<model>"
    },
    "falsifier": {
      "model": "<other model>"
    },
    "planner": {
      "model": "<model>"
    },
    "planReviewer": {
      "model": "<other model>"
    },
    "retro": {
      "harness": "kirocrew"
    },
    "reviewDraft": {}
  }
}
```

| Older key, refused                 | Row and field          |
| ---------------------------------- | ---------------------- |
| `models.<role>`                    | `roles.<role>.model`   |
| `harnesses.<role>`                 | `roles.<role>.harness` |
| `delivery.agent`, `delivery.model` | `roles.worker`         |
| `delivery.investigate.agent/model` | `roles.falsifier`      |
| `flow.retro.model`                 | `roles.retro.model`    |

`resolveRoles(config)` in `chat-models.mjs` reads the table. Every reader
goes through it: `chatModel` and `roleHarness` for the chats, and the
delivery policy's worker agent and model and its falsifier agent and model.
A file that still sets an older key does not load; the error names the file
and the key. Settings › Models reads and writes the table
(`models.settings.get` and `models.settings.update`). Settings › Delivery
has no Writer section.

Not in the table: `delivery.reviewers[]` keep their own `agent` and
`model`, because each review role is a list entry with its own id and
focus, per repository.
(`radar.crew.models`). `github.issueIntake.*.model` is saved but never
read.

With `serve.enabled`, each tick keeps the standalone page (the
`standalone-web` spec) up on `127.0.0.1` only, signed in by a one-time owner
link from `avoozl link`, for machines with no Kiro Crew.

**Steps and exits.**

| Phase | Step                                    | Exit                                                                                              |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 46    | Name the seam                           | Today's calls behind the interface; behavior coverage retained under R93.6; the suite passes                           |
| 47    | Supervisor and `process` with Claude Code | A 3-task chain on a scratch repository with one feedback round by resume, a killed child that recovers, a backend restart mid-run |
| 48    | Codex by definition file only           | Codex runs a task; the proof fails if any source file changed                                     |
| 49    | Every role on any executor              | Verifier, reviewer, planner, retro and watch each run on `process`                                |
| 50    | The UI                                  | In flight, Send message and Settings › Models work for `process` sessions                         |
| 51    | Headless workers                        | A machine under launchd runs tasks with the CLI only; the base for §4.26's pull-based worker mode |
| 52    | The manual path                         | `next`, `take` and `runner report` still work for a person                                       |

### 4.29 Cross-model plan review

Requirement 99. A second model reads each draft before
the person approves it. Its findings and the planner's answers show in the
Approve dialog. It never decides anything.

```text
draft revision stored (planner, Spec Builder import, From a goal, reload)
  ─▶ mode? off: nothing │ ask: Needs you (Review | Skip) │ auto ─┐
  ─▶ model check: reviewer named, writer known, the two differ ─┤
       └─ fails ─▶ Review skipped + reason (Review anyway: person only)
  ─▶ reviewer chat (read-only, reviewer model) ─▶ plans_submit_review
  ─▶ planner chat: fixed <hash> | answered <reason>, per finding
  ─▶ next round while rounds allow and the planner wrote a new revision
  ─▶ Approve dialog: reviewed by M at H: N found, N fixed, N for you
```

| Setting               | Values                  | Default |
| --------------------- | ----------------------- | ------- |
| `models.planReviewer` | a model name, or `auto` | `auto`  |
| `planReview.mode`     | `auto`, `ask`, `off`    | `auto`  |
| `planReview.rounds`   | 1 to 3                  | 1       |

With `models.planReviewer` unset, `auto` mode skips every review and says
"Pick a Plan reviewer model in Settings › Models", so nothing runs on the
same model by default.

**Role.** `src/app/settings/chat-models.mjs` adds `planReviewer` to `MODEL_ROLES` and
dispatch role `plan-review` to `DISPATCH_ROLE`. `validateModels` refuses a
`planReviewer` equal to a named `planner`. `planReview` is validated with
the other `.avoozl.json` blocks.

**Writer model.** The model that wrote a revision is the model Kiro Crew
reports for the session that wrote it: the planner chat's run
(`actualModel`, as `plan.review.submit` already reads it), the From a goal
planner chat, or the Spec Builder chat when Kiro Crew reports one. A reload
of a folder a person edited has no writer model. The check runs before the
chat opens and again when findings arrive: `plan.review.submit` refuses a
spec finding from a session whose reported model equals the writer's.
"Review anyway" is person only (the CLI and MCP policy refuse an agent) and
sets `unproven: true` on the round.

**Rounds.** One `review_rounds` row per round: `{id, planId, spec,
revisionHash, pass, round, reviewerModel, writerModel, unproven, state
(running | done | skipped), note, slot, commits: {repository: sha},
startedAt, endedAt}`. A pass starts at a revision that did not come from
the planner answering the pass's last round. The tick's `planReviewStep`
runs after the new-plan import and the folder reload, and starts at most one
round per plan per tick. A spec still settling (Requirement 65.6) waits.

**Brief.** The reviewer opens on the planning repository's spec folder at
the revision, plus a clean detached worktree per repository the task facts
name at its default branch head, as reviews of a commit do (§4.10). The
brief quotes the files as data, lists the other spec folders (name, state,
hash) for `conflict` findings, and names the six kinds. The session is bound
to the plan and revision (`run.review`), so `plans_submit_review` takes
findings only for that revision. The worktrees are removed when the round
ends.

**Findings.** Stored as `review_threads` rows with `source: "plan-review"`,
`roundId`, `kind`, `severity`, `file`, `line`, `statement` and `evidence`. The
existing quote-anchored threads for text plans are unchanged. A spec finding
is checked against the named file of that revision: the file must be in
the hash, and the line in range. At most 50 findings per round, as today.

**Answers.** After a round the tick sends the planner chat the findings as
data. The planner reads them with `plans_plan_review` (`plan.review.findings`)
and answers with `plans_answer_review` (`plan.review.answer`):
`{planId, roundId, answers: [{id, action: fixed | answered, revisionHash?,
text}]}`. A `fixed` answer names the hash the planner wrote; the next round
reviews that hash. A person closes an open finding with
`plan.review.dispose`.

**Counts.** For the latest pass of a plan: found is every finding; fixed is
every `fixed` answer whose hash was stored; for you is the rest that no
person has closed. `plan.reviewSummary` returns `{state, reviewerModel,
revisionHash, current, found, fixed, forYou, open: [...], note}`.
`approvalChecks` carries it as `review`; approving never reads it.

**Flow.** Planning spans are keyed by spec, not task: stages `plan-review`
and `plan-answer` in their own table, and usage rows from those sessions are
tagged with the spec. The Flow tab shows a Planning group per spec. Task
flow efficiency does not read it.

| Choice                                     | Why                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Skip, not fall back, on an unproven pair   | A model tends to approve its own mistakes; a quiet same-model review reads as a check that did not happen |
| Reuse `review_threads` and `review_rounds` | Already keyed by plan and hash, with a run bound to one revision                                          |
| Never blocks approval                      | The person decides; a review is evidence, not a gate                                                      |
| Default one round                          | Each round is a reviewer chat and a planner chat                                                          |
| Keep the critique                          | It checks task facts against prose; this checks the plan against the code                                |

Tests, with fake chats and fake model names:

| Test                          | Shows                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Different-model rule          | Same model, unset reviewer, unknown writer: skipped with a note and no chat; submit from a same-model session refused                     |
| Findings keyed by hash        | A new revision gets a new round; old findings stay, marked older; the planner's fix revision is reviewed only while rounds remain         |
| Review never changes approval | `plan.approve` gives the same result with no review, open findings, a skipped and a running review; no GitHub write                       |

shortcut: the writer model comes from what Kiro Crew reports for a session;
a Spec Builder draft is skipped until Spec Builder reports its chat's model.
Upgrade when it does.

### 4.30 Retrospectives catch steady CI waste

Requirement 100. The retrospective's CI trigger in §4.11
fires only on an outlier: one CI wait far over the repository's median. A
cost that every pull request pays is the median, so it never fires. This
section adds what each pull request changed, repeat runs, and fixed limits,
counted over every pull request in the workspace's repositories.

```text
tick's GitHub check, per repository
  ─▶ open pull request read (one GraphQL call, widened): files, createdAt,
     check runs on the head commit with times, workflow run id and event
  ─▶ workflow runs read (one REST call, ETag): runs since the window start
  ─▶ pr_ci and ci_runs rows (task or other)
  ─▶ steady waste: docs-only minutes │ CI wait share │ repeat run
  ─▶ retro trigger (with or without finished tasks)
  ─▶ brief: minutes by class, wait share, repeats, workflow files
  ─▶ proposals: settings │ plan (repository + workflow + change) │ …
  ─▶ PDCA: CI minutes per pull request by class, before and after
```

**File classes.** Each changed path takes the first class whose globs match,
in this order. A path that matches none is `code`, so an unknown file never
looks like waste. Globs use `globToRegex` in `src/app/flow/flow-ci.mjs`
(`*` inside a folder, `**` across folders, a trailing `/` for a folder).

| Class   | Default globs                                                                        |
| ------- | ------------------------------------------------------------------------------------ |
| `ci`    | `.github/`, `.gitlab-ci.yml`, `.circleci/`                                           |
| `spec`  | `.kiro/specs/`                                                                       |
| `tests` | `test/`, `tests/`, `**/test/**`, `**/tests/**`, `**/*.test.*`, `**/*_test.*`         |
| `docs`  | `docs/`, `*.md`, `**/*.md`, `*.txt`, `LICENSE`                                       |
| `other` | `package-lock.json`, `**/package-lock.json`, `*.lock`, `.gitignore`, `.editorconfig` |
| `code`  | anything else                                                                        |

`flow.ci.classes` replaces one class's list, for example
`{"docs": ["docs/", "*.md"]}`; classes it does not name keep their defaults.
A pull request is **docs-only** when its classes are all `spec` or `docs`.
For grouping in Flow, a pull request belongs to its first class present in
the order `code`, `tests`, `ci`, `other`, `spec`, `docs`.

**Settings.** In the `flow` block, beside `retro`:

| Setting                   | Values                   | Default |
| ------------------------- | ------------------------ | ------- |
| `flow.ci.windowDays`      | whole number 1 to 90     | 7       |
| `flow.ci.docsOnlyMinutes` | whole number 1 to 100000 | 60      |
| `flow.ci.waitShare`       | number 0.05 to 1         | 0.4     |
| `flow.ci.minPullRequests` | whole number 1 to 1000   | 5       |
| `flow.ci.classes`         | class to a list of globs | above   |

`flowSection` in `src/app/flow/flow.mjs` adds `ci` to its groups and the four
number keys to `FLOW_KEYS`; `classes` is checked as a record of known class
names to lists of at most 50 strings. The default of 60 docs-only minutes
fires on today's 3-OS matrix (about 25 minutes of jobs per spec-only pull
request) after three such pull requests, and stays quiet once docs-only
changes skip the suite (about 1 minute each).

**What is read.** `openPullRequests` gains, per pull request, `createdAt`,
`files(first:100){totalCount nodes{path}}`, and on the head commit's check
rollup `contexts(first:100)` with each `CheckRun`'s `name`, `startedAt`,
`completedAt` and `checkSuite{workflowRun{databaseId event workflow{resourcePath}}}`. The
first page of the same query also reads, as `recent`, the 50 most recently
updated closed pull requests with `createdAt`, `closedAt`, author, head and
the same `files`. A pull request opened and merged between two checks, or
closed before a workspace's first check, is never listed open, so without
this it would be missed. A closed one never seen open gets a row; one seen
open takes its exact `closedAt`.
The workflow runs read is `GET /repos/{owner}/{repo}/actions/runs` with
`per_page=100` and `created=>=` the window start, through the client's HTTP
cache (`github_http_cache`), so an unchanged list is a 304. A run gives its
id, workflow path, head commit, head branch, event, attempt, start, end and
pull request numbers. GitHub leaves a run's pull request numbers empty once
the pull request is merged, so a run links to its pull request by the run
list, the head commit's check runs, the head commit, and then the head
branch of a pull request open when the run started.

**Call budget.**

| Read                         | When                            | New calls                                             |
| ---------------------------- | ------------------------------- | ----------------------------------------------------- |
| Open pull requests (GraphQL) | already once per repo per check | 0; about 1 point per page today, about 3 when widened |
| Workflow runs (REST, ETag)   | at most once per repo per check | ≤ 1 per repo per check; a 304 when unchanged          |

With 2 repositories and a check every 5 minutes this is at most 24 REST
calls an hour, most of them 304s, against 5,000 an hour. No call is made per
pull request or per run.

**Stored rows.**

```text
pr_ci(repository, number, task_id, author, classes, partial, created_at,
      first_seen, last_seen, closed_at, ci_ms, wait_ms)
ci_runs(repository, run_id, workflow, head_sha, event, attempt, pr_number,
        started_at, ended_at, job_ms)
```

`job_ms` is the sum of the run's check run times on the head commit when the
open pull request read saw them, and otherwise the run's own wall time,
marked an estimate. A pull request's `ci_ms` sums its runs' `job_ms`; its
`wait_ms` is the union of its runs' start-to-end spans, and its lead time is
`created_at` to `closed_at`. Rows older than 90 days are removed by the tick.

**Triggers.** Over the last `flow.ci.windowDays` days, per repository:

| Trigger         | Fires when                                                                                       | Key                                 |
| --------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Docs-only waste | `ci_ms` of docs-only pull requests > `docsOnlyMinutes`                                           | `waste:docs:<repo>:<window>`        |
| CI wait share   | ≥ `minPullRequests` closed, and the sum of `wait_ms` > `waitShare` × the sum of their lead times | `waste:wait:<repo>:<window>`        |
| Repeat run      | one workflow has two or more distinct run ids on one head commit                                 | `repeat:<repo>:<workflow>:<window>` |

`<window>` is the window's start date, so each fires at most once a window.
They are added to `triggers` in `src/app/flow/flow-retro.mjs` and are not spikes,
so the one-hour gap does not hold them. A retrospective started only by them
runs with no finished tasks; its task sections are empty.

**Brief.** Per repository: CI minutes and pull request counts by class, split
`task` and `other`; the wait share; each repeat run finding; and the workflow
files seen in `ci_runs`. A `task` pull request names its task ID. An `other`
pull request is its number, author and classes only. Nothing else about it
enters the brief, and Avoozl reads no chat it did not open. The brief still
passes content rules at `brief`.

**Proposals and PDCA.** A `plan` proposal MAY add `repository` and
`workflow` (a `.github/workflows/` path seen in `ci_runs`); `PLAN_FIELDS`
gains both and validation refuses a workflow that was not seen. Approval
opens a planner draft for one new task naming the workflow file and the
change. `METRICS` gains `CI minutes per pull request`, and a proposal using
it names a class (`all`, or one class). PDCA compares the mean `ci_ms` of the
last `flow.retro.everyTasks` closed pull requests of that repository and
class before approval with the same number closed after it, and keeps the
10% rule of Requirement 47.7.

**Flow tab.** A **CI** card per repository: minutes by class as bars, split
task and other; the wait share against its limit; and a **Repeat runs** list
of workflow, commits with repeats, extra runs and extra minutes. Settings ›
Flow gets a **CI** group with the four number fields and the class globs
shown read-only.

**Tests.**

| Test                      | Shows                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Classes from globs        | Defaults, the class order, `flow.ci.classes` replacing one class, an unmatched path is `code`, partial |
| One read per check        | A fake client sees the same GraphQL call count as before and at most one runs read per repo per check  |
| Not-modified reuse        | A 304 runs read reuses the cached list and records no new rows                                         |
| Spec-only waste fires     | 10 spec-only pull requests with 25 CI minutes each fire docs-only waste once in the window             |
| Repeat run fires          | Two runs of one workflow on one commit fire repeat run; attempt 2 of one run does not                  |
| Steady, varied, no waste  | Code pull requests with 10 to 30 CI minutes, one run each, wait share under the limit: nothing fires   |
| Outliers unchanged        | The Requirement 47.1 tests pass unchanged                                                              |
| Other pull requests       | Counted in triggers; the brief holds number, author and classes only                                   |
| CI plan proposal and PDCA | A proposal naming an unseen workflow is dropped; an approved one opens a draft; PDCA by class          |

shortcut: one page of 100 runs per read; a repository with more runs in the
window sees only the newest 100. Read more pages if Flow shows the cap hit.

shortcut: 50 closed pull requests per check; a repository that closes more
than 50 between two checks misses the oldest, and a new workspace sees only
the newest 50 of its window. A pull request in neither list closes at the
first check that no longer lists it open. Read a second page if that shows.

### 4.31 Every build receipt, and a build breakdown for retrospectives

Requirement 101. Build receipts keep
one record per merged pull request: the last line of the first matching
artifact. This section keeps every record of every artifact on the head
commit, and adds a repository's own build report to Flow and the
retrospective.

```text
tick's CI step (flow-ci.mjs ciStep), per repository with buildReceipts on
  ─▶ workflow runs read (§4.30, already made): head commits and run states
  ─▶ artifact list (one REST call, ETag, no name filter)
  ─▶ new build-receipt* and report artifacts: one download each
  ─▶ parseReceipts: every line ─▶ build_observations
  ─▶ build-report adapter ─▶ build_breakdowns (when receipts.report is set)
  ─▶ Flow: per pull request totals, phases, costliest phase; Trace: every line
  ─▶ retroBrief: builds (phases, breakdowns by comparison key)
  ─▶ PDCA: Build minutes per pull request │ Build part minutes, matching keys only
```

**By commit (R101.14).** Every commit that reaches the base branch (a direct
push, a squash or merge commit, Avoozl's landing) has a `push` run there.
`readReceipts` takes the head commit of each such run in `ci_runs` whose
branch is the repository's `baseBranch` as one more head to settle, beside
the merged pull requests' heads. It uses the same artifact list, so no call
is added, and the same `receipt_artifacts` rows, so each artifact is
downloaded once. `pr_ci` gains `mergeCommit` from the closed pull request
read it already makes (`mergeCommit{oid}`); a push commit's observations
carry the pull request whose `mergeCommit` it is. `observationsAtMain`
gives one commit's CI: its own lines, else those of the pull request head
that landed as it. Flow (`buildRows`) has one row per base-branch commit,
shown by pull request number or short SHA. A task's builds
(`observationsForTask`) are `observationsAtMain` of a person's `task.built`,
else of `task.tickCommit`, else of `task.integration.commit`, else the lines
naming the task.

**Receipt line.** Version 1 stays, with three optional fields. A line
without them still parses: `task` is null, `attempt` is 1 and `phase` is the
command.

```
{
  "v": 1,
  "issue": 12,
  "task": "7.2",
  "attempt": 2,
  "phase": "test",
  "commit": "abc1234",
  "command": "npm test",
  "target": "macos-latest",
  "start": "warm",
  "ms": 41230,
  "exit": 1,
  "counters": {},
  "at": "2026-11-16T10:00:00Z"
}
```

`bin/build-receipt` gains `--task`, `--attempt` and `--phase`, with
`AVOOZL_TASK`, `AVOOZL_ATTEMPT` and then `GITHUB_RUN_ATTEMPT` as fallbacks.
`parseReceipts(text)` in `src/app/flow/build-receipt.mjs` returns
`{ records, skipped }` for every line, with the same field checks
`parseReceipt` does today; `parseReceipt` becomes its last record for any
caller left. CI uploads `build-receipt-${{ matrix.os }}` from every job
(`if: always()`), and the summary step prints every line.

**Reading.** `build-receipt-read.mjs` moves from one receipt per pull
request to artifacts. The artifact list is
`GET /repos/{owner}/{repo}/actions/artifacts?per_page=100` with no `name`,
through `github_http_cache`, so an unchanged list is a 304. An artifact is a
receipt when its name is `build-receipt` or starts with `build-receipt-`, and
a report when its name starts with `receipts.report.artifact`. It is read
when its `workflow_run.head_sha` is the head commit of a merged pull request
in `pr_ci` (which gains `head_sha` and `merged_at` from the same open and
recent pull request read) and its id is not in `receipt_artifacts`. A pull
request whose head commit runs in `ci_runs` are all complete and that has no
matching artifact is stored as `none`. The reader runs from `ciStep`, not
from `radar-flow.mjs`; Trace's `receiptFor` reads the stored rows and makes
no call.

**Call budget.**

| Read           | When                                  | New calls                                    |
| -------------- | ------------------------------------- | -------------------------------------------- |
| Artifact list  | at most once per repository per check | ≤ 1; a 304 when unchanged                    |
| Artifact files | once per artifact never read          | 1 each; 3 for a pull request on 3 platforms  |
| Reports        | in a receipt field, or as artifacts   | 0 for a field; 1 per new artifact otherwise  |

**Stored rows.**

```text
receipt_artifacts(repository, artifact_id, run_id, head_sha, name, kind,
                  read_at, lines, skipped)
build_observations(repository, pr_number, head_sha, run_id, task, attempt,
                   command, target, seq, phase, start, ms, exit, failed,
                   counters, at)
build_breakdowns(repository, pr_number, head_sha, run_id, task, attempt,
                 workload, engine, target, toolchain, cache, costs, parts,
                 counters, at)
```

The `build_observations` key is repository, head commit, run, task,
attempt, command, target and `seq`, the order among lines with the same
key. `failed` is a non-zero `exit` or a run whose conclusion is not
`success`. Rows older than 90 days are removed by the tick, as for `pr_ci`.
The old `buildReceipts` metadata value is read once into
`build_observations` and then removed.

**Aggregation.** `buildView(rows)` replaces `receiptsView`:

| Output           | From                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| Per pull request | total ms of every observation; ms per phase over targets; costliest phase; failed ms apart |
| Per group        | median ms per phase, target and start, successful observations only     |
| Per instance     | count, median and sum                                                   |

Flow's receipts card shows the per pull request rows with the costliest
phase named, and the medians per group. Trace lists every observation on
the merged step, grouped by phase, failed ones marked.

**Build report, version 1.** Documented in `docs/build-report.md`, which
the task that builds the adapter adds.

| Field       | Type                                            | Required |
| ----------- | ----------------------------------------------- | -------- |
| `format`    | `"avoozl.build-report"`                         | yes      |
| `v`         | `1`                                             | yes      |
| `workload`  | string, at most 80                              | yes      |
| `engine`    | string, at most 80                              | yes      |
| `target`    | string, at most 80                              | yes      |
| `toolchain` | string, at most 120 (a toolchain or seed ID)    | yes      |
| `cache`     | string, at most 32 (the cache mode)             | yes      |
| `costs`     | `build`, `provisioning`, `cache`, `test`: ms    | yes      |
| `parts`     | at most 32 of `{name, kind, ms}`, `kind` a cost | no       |
| `counters`  | at most 16 names to numbers                     | no       |
| `task`, `attempt`, `commit`, `at` | as in a receipt line      | no       |

`receipts.report` in `.avoozl.json` is `{"field": "<name>"}`, an object at
that field of each receipt line, or `{"artifact": "<prefix>"}`, artifacts
whose files hold one report per line. With neither set, nothing is read.
`src/app/flow/build-report.mjs` holds `parseBuildReport(value)` (a breakdown or
a skip reason) and `comparisonKey(b)`: the five fields joined, or null when
any is missing. Avoozl adds no budget, limit or profiler. A repository that
wants those keeps them in its own tooling and writes the results into the
report as parts or counters.

**Retrospective.** `retroBrief` in `src/app/flow/flow-retro.mjs` adds
`builds: buildBrief(store, repositories, { now })` beside `ci`. Per
repository it holds the costliest phase of each pull request in the window,
labeled `task` or `other` as in §4.30, and, per comparison key, the count,
the latest and median of each cost and part, and the costliest part.
Breakdowns with a null key are counted as `unmatched` and summarized
nowhere else. With no observations and no breakdowns for a repository,
`builds` omits it, so the brief is as it is today. `triggers` is unchanged:
build data informs a retrospective but does not start one.

`PLAN_FIELDS` gains `key` and `part`; validation refuses a key or part that
is not in the brief. `METRICS` gains **Build minutes per pull request**
(by phase, target and start) and **Build part minutes** (by comparison key
and part). PDCA for either compares only matching groups, the last
`flow.retro.everyTasks` before approval with the same number after it, and
keeps the 10% rule. With fewer on either side it records
`Not enough comparable builds` and no verdict.

**Tests.**

| Test                        | Shows                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Every line                  | A file with 4 lines keeps 4; a bad line is skipped and counted; an old line parses          |
| Several phases, 3 platforms | 3 artifacts with build and test lines keep 6 observations for one pull request              |
| Failed attempt kept         | Attempt 1 failed and attempt 2 passed: both kept, attempt 1 marked failed, out of medians   |
| Costliest phase             | Flow names the phase with the most ms summed over targets                                   |
| Calls                       | One list per check; a 304 reads nothing; one download per new artifact; next check 0         |
| None remembered             | Complete runs with no artifact store `none`; a running run stores nothing yet               |
| Report parse                | Field and artifact forms; an unknown version and a missing field are skipped and counted    |
| Mismatched keys             | Breakdowns differing in any of the five fields, or missing one, are never compared          |
| Breakdown in brief          | A retro brief holds the key, costs, parts and costliest part                                |
| No reports                  | A repository with no reports: same brief and same call count as before                      |
| Repository neutral          | Fixtures use made-up workload, engine and target names; the release scan finds nothing      |

shortcut: one page of 100 artifacts per list; a repository that writes more
than 100 between two checks misses the oldest. Read a second page if Flow
shows the cap hit.

### 4.32 Working branches and spec issues

Requirement 102, owner pivot. Git holds design, approvals, ticks and implementation. One issue per
spec/epic holds ownership (its assignee) and discussion; SQLite caches local
execution. Tasks stay in the spec. Public pull requests reference their public
slice issue; private slice links stay private. Forks are source locations, not
workflow modes.

#### 4.32.1 Progress and completion are different things

| State | Meaning | May release |
|---|---|---|
| In progress | Work exists on a task's checkpoint ref | Nothing |
| Verified on branch | The task passed its acceptance checks at an exact commit on the spec's working branch | Nothing yet |
| Landed | Its tick reached the spec's base branch (§4.41) | Successors in any spec |

A checkbox on a working branch shows branch progress, and the page labels it so.
Marks are outside the approved hash (`withoutMarks`, `src/app/specs/spec-plans.mjs`).
A tick on the base branch completes the task; a tick on any other branch does not.
Packages complete from their children.

#### 4.32.2 A trailer identifies work

Every landing commit Avoozl makes carries `Avoozl-Task: <id>@<definition>`
(opaque where the plan is private), where the definition is a digest of the
task's facts (`taskDefinition`, `src/app/specs/task-outcomes.mjs`). The trailer
names the task a landing completed; the tick on the base branch completes it.

#### 4.32.3 Working branches

Each spec has one active working branch per repository it changes. The branch may
live in the target repository or an authorized fork. References are fully
qualified: repository identity, branch and exact commit, separately from the
target repository and landing branch. Branch names alone are never identities.
Code and plans stay separate where the plan is private: code goes to the code
repository; the spec and its checkmarks stay in the planning repository.

- **The spec's driver owns integration** into the working branch. Workers run in
  isolated task worktrees and never push to it. Avoozl makes every commit and push, so
  a sandboxed worker needs no GitHub credentials.
- **Checkpoints.** Unfinished work is checkpointed on the task's own ref under the
  spec's namespace and is never acceptance evidence. The driver integrates a task
  into the spec's working branch at the commit where it passed its checks, so the
  working branch is a sequence of verified integrations and a portion lands by
  naming a commit, with no cherry-pick.
- **Portions.** A working branch need not become one large pull request. Reviewable
  portions land while the spec continues (4.32.5). A portion names an exact commit
  or range and its tasks, never "the current head".
- An externally pushed unverified head is only a checkpoint until the driver
  verifies its exact commit. Branch deletion never means completion. Content and
  sandbox controls apply to every checkpoint; acceptance gates apply to verified
  integrations and landing.

#### 4.32.3a Forks are ordinary working-branch locations

A person may push a spec's working branch or task checkpoints to their fork. Avoozl
fetches and verifies those commits and opens or observes a pull request against the
registered upstream repository. No upstream copy of the source branch and no separate
fork workflow mode is required.

- **Discovery.** An existing pull request supplies its head repository, ref and SHA.
  Listing only the target repository's refs is insufficient.
- **Registration.** Fetch only from a repository allowed by trusted repository setup or an
  authorized owner action. Issue prose and branch contents cannot register a clone URL,
  local path, build command or remote. Verify the source repository's relationship to
  the configured target and validate the exact fetched commit and intended base.
- **Permissions.** Source push rights and target merge rights are separate. A contributor
  can checkpoint to a fork without upstream write access. An authorized maintainer
  lands the pull request; Avoozl observes it if its own login cannot merge. It does not
  relax upstream reviews, checks, fork workflow approvals or secret restrictions.
- **Local storage.** Reuse a registered checkout with isolated task worktrees, or a
  dedicated clone where required. The repository mapping and exact refs determine
  what is fetched, not a requirement to clone once per branch.
- **Issue home.** The spec issue remains in its registered canonical home; a fork checkout does
  not relocate that home or require issues to be enabled on the fork. A private planning
  repository does not become public because its code branch lives in a public fork.
- Fork deletion, an inaccessible fork, or a source branch rewritten by its owner holds
  affected work and offers recovery from a retained verified commit; none means done.
  Avoozl itself never force pushes.

#### 4.32.4 Public writes carry no internal information

Requirement 102.16 to 102.18 cover spec and epic issue bodies, status and intake
comments, pull request bodies and check summaries. Refused: host, server and machine
names, usernames, local and home paths, internal URLs and hostnames, IP addresses,
crew, instance and session IDs, gateway ports and session keys.

- **Machine label.** Where a public surface names a machine, it uses the label the
  owner picks per machine (for example "Draco"), kept in machine config, never one
  derived from the hostname or username.
- **Scan.** The 56.11 scan runs before the first write and refuses hostname and IP
  literals, `*.corp`, `*.internal`, `*.local` and `*.lan` names, any domain on the
  owner's private machine-local list of internal domains, home paths (`/Users/<name>`,
  `/home/<name>`, `C:\Users\<name>`, `~/`), and this machine's own hostname and
  username, read at scan time. The private domain list never enters the repository.
  A false hit uses the existing allow-once path with a reason.
- Public branches and commit messages use opaque identifiers. A private issue may
  reference a public pull request; the public pull request never names the private
  issue, repository or tasks. When both are public, the pull request references the
  spec issue so GitHub supplies its timeline.

#### 4.32.5 Landing

Builds on phases 40–42, revised by Requirement 102.

- **Content rule in process.** Before every externally visible write, and before every checkpoint or landing push,
  validate the outgoing range, added lines, commit messages and ref names in process.
  Reuse the existing push scanner and `enforceDiff` rather than relying on a shell hook.
- **Hold the lock briefly.** `withWorkLock` kind `integration` blocks every validation
  (`src/app/git/git.mjs:36-52`). Hold it for the ref move and push only.
- **`direct`: a portion is an exact commit on the working branch.** The landing worktree
  merges it with the current base, checks that head once, fast-forwards, pushes. A
  merge batch may combine portions of several specs, up to the size limit
  (`merge-batches` D2). On failure, rerun once, then bisect to the culprit (`merge-batches` D4).
- **`pr`: a portion is one pull request** from a ref at that exact commit. Its head has
  its own passing required checks and its own standing approval, so several tasks can
  land together under protected review. Avoozl updates only a source branch it is authorized to write,
  and only for the pull request at the head of the queue. Read-only upstream access
  permits proposing and observing a landing, never authorizing it. If the repository dismisses stale approvals, an update after
  approval means a new review request, not a merge.
- **Guarded.** A `direct` push is a fast-forward from the recorded base head
  (`guardedFastForward`); a `pr` merge is guarded by the pull request's head
  (`headGuardedMerge`), both in `src/app/landing/guarded-push.mjs`.
- After a portion lands, the base is merged back into the working branch with a merge
  commit. Never a force push.
- **Union paths (direct only).** `landing.unionPaths` names append-only registry files
  that merge with union semantics in the landing worktree.

#### 4.32.6 Slices: sharing design and review

A slice is a spec.

| Role | Recorded | Used for |
|---|---|---|
| Owner | Assignee on the spec's issue | Drafts the spec; their Avoozl is its driver |
| Spec approver | The approval commit's author | The design review |
| Code reviewers | CODEOWNERS and the repository's rules | Approving the slice's pull requests |

- At pull request open, call `requestReviewers` (`src/app/github/github.mjs:1490`); before
  landing apply `reviewVerdict` and `branchReviewRule`
  (`src/app/github/github-branch-rules.mjs:43`).
- Avoozl adds no review rule of its own; it honors the repository's. Where a rule
  requires approval, GitHub will not let the author approve, so that slice needs a
  second person. With no rule (solo, `direct`), the owner may approve the spec locally.
  Approval is still an explicit act on the exact revision.
- **Approval evidence** is the approval commit: its author, the commit, and the spec
  re-hashed at that commit equal to the approved hash (§4.42).

**Epics.** One epic spec whose rows are the lifecycle of each member spec, with an epic
issue and one sub-issue per member (`addSubIssue`, `src/app/github/github.mjs:1002`). Today an
epic entry may hold only `plan` and `summary` (`src/app/specs/spec-plans.mjs:627-716`); add
`step`. An entry may hold `plan`, `summary` and `step: design | review | implement`.
Legacy entries without `step` mean implement. A plan may occur once per step, with
no duplicate plan/step pair. Rows are derived, never hand-ticked:

| Row | Done when |
|---|---|
| Design X | X exists as a draft and its owner has asked for approval |
| Review X with team | An approval commit exists for X's current revision |
| Implement X | Every leaf and person task of X is complete under 4.32.1 |

#### 4.32.7 One driver per spec

The driver is the spec issue's single assignee (§6.10, §4.44). Before every
dispatch and every landing the driver reads the issue again (4.32.8); a spec
this workspace does not drive stops there.

#### 4.32.8 Refresh git and GitHub independently

| Cached | Invalidated by |
|---|---|
| Repository contents | The branch head and the relevant file hashes (`src/app/git/repo-files.mjs`) |
| The spec issue's assignees | Conditional requests (`src/app/github/github.mjs`) |
| Pull request reviews, checks and merge results | Their own reads, independent of branch commits |

Reparse a spec only when its definition changes. Ownership, approval and CI change
without a commit, so a branch change is never the only refresh signal.

#### 4.32.9 A new driver

A new driver (the person now assigned) fetches the recorded working branches, reads
the spec and its ticks from git, and observes open pull requests. Attempt logs,
transcripts, Flow spans and queue order are disposable.

#### 4.32.11 Smaller rules

- **Spec edits.** A changed or removed task with a live ref goes to Needs you.

#### 4.32.12 Repository layouts

The same loop supports code and plans together, and public code with
private plans on their own specs branch (§4.45). Repository layout
determines visibility; fork location never chooses a different loop.
Working heads and checkpoints may live in authorized forks in each layout.
A tick reads and writes no task issue and ignores an old binding row.

### 4.33 Review findings the owner can read and decide

Requirement 104. Extends §4.29. The reviewer, the
planner answer and the different-model rule are unchanged. This section
changes what a finding holds, who closes it, and where a person reads it.

```text
round (revision H, reviewer model ≠ writer model)
  ─▶ findings: severity, category, anchor {file, lines, quote, quoteHash}
  ─▶ planner turn: fixed <H2> | answered <reason>
  ─▶ person, on the document's tab: Accept | Reject | Defer | Resolve
        Accept ─▶ next planner turn must fix it (no reviewer round counted)
        Reject/Resolve ─▶ next reviewer round told; same quote+category dropped
        Defer ─▶ follow-up row (no task, no issue)
  ─▶ more rounds while planReview.rounds allows; then Review anyway (+1)
  ─▶ Approve dialog: counts by severity and state, Open review link
  ─▶ person approves the exact revision on screen
```

**Is this the review process?** Yes. Each round is bound to one revision
hash. The reviewer finds, the planner fixes or answers, and the person
decides what is left. It repeats while `planReview.rounds` allows, and
Review anyway adds one round at a time. None of it approves or blocks.

**Finding fields.** `review_threads` rows with `source: "plan-review"`
gain:

| Field        | Value                                                                |
| ------------ | -------------------------------------------------------------------- |
| `severity`   | `info`, `warn`, `blocker`; old values mapped on read (R104.1)       |
| `kind`       | unchanged; shown as **Category**                                     |
| `anchor`     | `{file, lineStart, lineEnd, quote, quoteHash}` at `revisionHash`     |
| `decisions`  | append-only `[{action, by, at, revisionHash, note}]`                 |
| `answer`     | unchanged (`fixed` with `revisionHash`, or `answered`)               |

`file` and `line` stay for rows written before this phase; their anchor
is `{file, lineStart: line, lineEnd: line}` with no quote, and they show
at that line only at their own revision. No migration rewrites old rows.
`quoteHash` is `sha256` of the quote with each whitespace run collapsed to
one space, from `node:crypto`'s `createHash("sha256")`.

**State.** Derived on read in one function, `findingState(thread, plan,
running)`: the latest decision wins (`accepted`, `rejected`, `deferred`,
`resolved`; `reopen` clears it), else the planner answer (`fixed`,
`answered`), else `open`; `answered`, `open` and accepted-but-not-fixed
read as `for you` once no round or planner turn runs. A `fixed` answer
whose hash is not stored stays `for you`, as in §4.29.

**Anchoring.** `anchorAt(thread, revision)` returns `{file, lineStart,
lineEnd}` or `{moved: true}`. It searches the collapsed quote in the same
file of the asked revision, mapping back to original line numbers. One
match moves the anchor; none or several mark it moved. It is pure and run
on read; the stored anchor never changes. The submit check reuses
`lineFor` from `plan-reviews.mjs` on the file text.

**Person actions.** One operation, `plan.review.finding.decide {id, action:
accept | reject | defer | resolve | reopen, revisionHash, note?}`, is added
to `PERSON_ONLY` in `mcp-policy.mjs`. `reject` needs a note. `defer` also
writes a `review_followups` row `{id, planId, spec, findingId,
revisionHash, note, by, at}`. `plan.review.dispose` maps its four
dispositions onto this operation and becomes person-only too. CLI:
`avoozl plan finding ID accept|reject|defer|resolve|reopen [--note TEXT]`,
and `avoozl plan review SPEC` prints severity, state and anchor lines.
`plans_plan_review` returns the new fields read-only; MCP has no decide.

**Feeding the loop.** The planner answer brief (`plan-review-answers.mjs`)
adds three data lists: accepted (must fix), rejected with reason, deferred.
The reviewer brief (`plan-review-step.mjs`) adds rejected and resolved
findings with reasons. `plan.review.submit` drops a finding whose `kind`
and `quoteHash` match a rejected or resolved one in the same pass, and the
round's `note` counts the drops. `planReviewStep` opens one planner answer
turn for a plan with an accepted, unfixed finding and no running turn; the
turn row has `trigger: "person"` and does not count against
`planReview.rounds`. Review anyway (`plan.review.decide`, already
person-only) starts one more reviewer round when the cap is reached. Its
writer-model check is unchanged.

**Review comments.** The findings show inline on each spec document's own
tab, as review comments in a pull request's diff; there is no separate
Review tab. A link from the spec header (Open review) and the Approve
dialogs is `?view=review&plan=P&rev=H&file=F&finding=X&severity=S&state=X`:
it opens document tab F (none: the first with an open finding) at
revision H.

| Part         | Behavior                                                                |
| ------------ | ----------------------------------------------------------------------- |
| Document tab | the file rendered by `Markdown.tsx`, at the review's revision           |
| Thread       | the cards of a block, under the last rendered block the anchor touches  |
| Card border  | `info` grey (`--border`), `warn` yellow (`--warning`), `blocker` red (`--danger`) |
| Card body    | severity label, category, file:lines, claim, evidence, planner, history |
| Card buttons | Accept, Reject (reason), Defer (note), Resolve; Reopen once decided     |
| Select       | card click highlights the lines; text click selects its card            |
| Moved        | listed above the text under **Moved or removed**                        |
| Toggle       | Hide comments / Show comments with the count, kept in local storage     |
| Filters      | severity and state chips with counts, kept in the address               |
| Overview     | a Review card: rounds with their chats, and every finding as a link     |

`blocks()` in `markdown.ts` already gives each block and list item its
first source `line`. `Markdown.tsx` writes it as `data-source-line` on the
rendered element; a block's range runs to the next block's line minus one,
so the view maps line ranges to blocks without a second parser.
`Markdown.tsx` takes an `after(line)` that renders a thread under a block
(under a list item, as a bare item of the same list, the list numbering
its items explicitly).
Chat links use the round's `slot` and the planner answer receipt's `slot`
through `linkHref`, as Review drafts' Open chat does; a binding that is
gone shows Chat closed.

`plan.review.view {planId, revisionHash?}` returns the three files at the
revision and every finding of the plan's latest pass with `state`,
`anchorAt` for that revision, decisions and chat links. It reads only the
workspace database and the stored revision.

**Approve dialogs.** `PlanReviewSummary.tsx` shows counts by severity and
by state and an **Open review** link, and loses its close controls.
`plan.reviewSummary` adds `bySeverity` and `byState`. While a dialog is
open it re-reads `plan.reviewSummary` and the plan preview on the page's
existing refresh. When the hash moves, the dialog swaps to the new
revision and shows "Changed while open: H1 → H2", each changed file with
`+added −removed` lines from a line diff of the two stored revisions, and
findings that became fixed or moved. The Approve button resets and needs a
new click. `plansClient.approve` returns `{changed: preview}` instead of
throwing, and the dialog applies it as the same update. The batch dialog
does this per entry. `plan.approve` still refuses a stale hash.

| Choice                                    | Why                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| Quote plus hash, not line numbers alone   | Lines move with every edit; an exact quote finds the passage again       |
| Compute anchors on read                   | One stored truth per revision; nothing to migrate when text moves        |
| Person-only decisions                     | A finding for the person must not be closed by an agent                  |
| Accept starts a planner turn, not a round | The person already judged it; a reviewer round would only repeat it      |
| Defer makes no task                       | Tasks come from approved spec revisions only                             |
| Dialog updates in place                   | The person keeps their place, and still approves only what is on screen  |

Tests, with fake chats, fake model names and a fake GitHub:

| Test                         | Shows                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Severity mapping             | Old rows read as blocker, warn and info; a blocker approves the same as none                 |
| Anchor survives edits        | Moved text keeps its finding at the new lines; deleted or duplicated text reads as moved     |
| Quote refused                | A missing or ambiguous quote is refused at submit                                             |
| Person-only decide           | MCP and agent sessions are refused for decide and dispose; a person's action records revision |
| Accept feeds the planner     | One planner turn per plan per tick; it does not use up `planReview.rounds`                   |
| Rejected is not repeated     | Same kind and quote hash in the same pass is dropped and counted                             |
| Defer stays local            | A follow-up row, no task, zero GitHub calls                                                   |
| Dialog updates in place      | A hash change mid-dialog shows the change and resets Approve; no thrown error                |

shortcut: anchors search only the same file, so a passage moved to another
file reads as moved. Upgrade if reviews of split files show it often.

### 4.34 A role per repository decides where tasks live

Repository setup is a compact list with a read-only role badge and View, Edit and Remove icon buttons. The role is chosen in Edit and in Add repository.

Requirement 105. Replaces the **Where tasks live**
Settings page and the mode choice of §4.4. The three modes stay as the
derived result; only the way a person sets them changes.

**Roles.**

| Role       | Issues, sub-issues, specs live in | Pull requests land in | Needs a GitHub remote |
| ---------- | --------------------------------- | --------------------- | --------------------- |
| `local`    | The workspace database            | The repository        | No                    |
| `code`     | The planning repository           | The repository        | Yes                   |
| `planning` | The repository itself             | None                  | Yes                   |
| `both`     | The repository itself             | The repository        | Yes                   |

**Mapping, both ways.**

| Today's `github.mode` | Roles it gives (read)                                                  | Roles that give it (write)                                   |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| absent or `local`     | Every repository `local`                                               | All `local`, or no repository                                |
| `plans-repo`          | The `planningRepository` row `planning`; every other GitHub row `code` | Exactly one `planning`; every other GitHub repository `code` |
| `single-repo`         | Every GitHub row `both`                                                | At least one `both`; no `planning`, no `code`                |

Any other mix is refused on save (R105.2): one `planning` plus a `both`;
two `planning`; `code` with no `planning`; `local` beside a GitHub role.
No current mode needs such a mix, so no mode is lost. A workspace in
`plans-repo` that registers only code repositories has its planning row
synthesized from `planningRepository` ("GitHub only", no checkout). Such a
planning repository has no `github.repositories` entry, so no `role` key can
sit on it: `planningRepository` stays stored and names it, and the `code`
roles are valid because it exists. With a `planning` role on an entry,
`planningRepository` is set from that entry.

**Storage and migration.** The canonical key is
`github.repositories["owner/name"].role`. `github.mode` and
`github.planningRepository` stay in the schema as derived values. One
resolver in `github-policy.mjs` does both directions:

```text
read:  any role present? ─yes─▶ roles win; mode and planningRepository derived
                         └no──▶ roles derived from mode and planningRepository
write: roles ─▶ validate mix ─▶ write role per row + derived mode + planningRepository
```

The resolver runs inside the config loader, so readers of the raw
`github.mode` (the marker, linked branches, the driver, content rules, the
approval batches) see the derived value and need no change. Reading writes
nothing. The first save of Repository setup writes `role` on every row with
a GitHub remote and the derived keys, which equal the old values for an
untouched workspace. A second save writes nothing new.

**Screens.** Repository setup lists each repository with a role picker that
saves in place (no Edit button for it; another change makes the other
Settings pages edit in place, so this task touches only the role picker and
what feeds it). The picker is the old RadioFold with the four roles; each
role's body keeps the old pictures and facts for the mode it makes. Above
the list: "Tasks live in the database", "Tasks live in acme/plans" or
"Tasks live in each repository's own issues". A refused mix shows its line
under the list and keeps the old roles.

Settings › Workspaces takes what was not per repository: default authority,
epic issue type, cache and write limits, sub-issue cap, include-done, Project
and field names, **Set up GitHub**, crews and This computer. These show only
when the derived mode is a GitHub mode, as before, with the same "Kept, not
used" line in Local only. The `github` tab and `ModePicker` page are
removed; a link to the old tab (`?tab=github`) opens Repository setup. The
Set up GitHub wizard and Onboard read the derived mode and write roles, not
`mode`, when they propose a change.

**Tests.** Mapping both ways for every row of the table, the refused
mixes, a stored mode that disagrees with the roles, a workspace with a
synthesized planning row, read writes nothing, two saves equal one, raw
`github.mode` readers see the derived value, the role picker and summary
line, the moved settings, and the old link. Screenshots: Repository setup
and Workspaces in the full app shell, phone and desktop, light and dark,
committed under `docs/evidence/repo-roles/`.

### 4.35 Task details hold the timeline; Trace is removed

Requirement 106.

**Source.** `src/app/tasks/task-steps.mjs` exports `taskSteps(...)`, a pure
function. `taskDetailView` passes it records it already reads or can read from
the store, and returns the result as `steps` beside `timeline`:

| Step                | From                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| Spec approved       | The plan's approval receipt (`approvals`), with the approver          |
| Ready               | The earliest `queued` flow span of the task                           |
| Started (attempt N) | The earliest session binding of attempt N (`boundAt`)                 |
| Attempt N failed    | The delivery record's attempt N, when its outcome is not `done`       |
| Checks              | Evidence rows with an exit code: last time, passed and failed counts  |
| Landed              | The delivery record in state done, verified or integrated, with commit |
| Builds              | `build_observations` rows of the task, `receiptLine` and `phaseGroups` |
| Integrated          | `task.integration` (time, commit)                                     |

States and the wait text follow Trace: done, skipped (a later step has a
time), now (the first without a time after the last timed one), later.
Attempts expand in order, so a retry reads as Started 1, Attempt 1 failed,
Started 2. Nothing here calls GitHub; a test builds the view with a GitHub
double that fails on any call.

**Screen.** `TaskDrawer` keeps its Timeline box (a `SectionBox`, open at first
like the others). The steps list goes first, drawn as Trace drew it (dot,
label, time, wait, detail, builds by phase), the history list below under
"All records". `TraceView.tsx`, `TraceDone.tsx` and `trace-api.ts` go; the
time helpers `clock` and `afterPrevious` move to `task-api.ts`.

**Navigation.** `trace` leaves `TABS`. `redirectTab('trace')` returns
Delivery. A `?trace=owner/repo#N` link is read once by a small component
inside the task drawer provider: it reads the graph, finds the task whose
issue matches and opens its details; with no match it opens Delivery. The
Trace buttons on On the line rows and the Dashboard drawer are removed.

**Tests.** `src/app/tasks/test/task-steps.test.mjs` (records to steps, failed,
skipped, in progress, builds, no GitHub call); `hosts/kirocrew/ui/test`
cases for the redirects, the nav, and the box; `trace.test.mjs`,
`trace-page.test.mjs` and `trace-api.test.mjs` are removed with the code.

shortcut: a task made before the pivot with no plan approval receipt shows
Spec approved without a time; upgrade only if such tasks matter.

### 4.39 One intake list

Requirement 110; `docs/research/simplification-audit.md` item 6,
F5. Changes §4.12's source list and the issue intake keys of §4.4.

**Why.** Every place work comes in is one entry under `intake.sources`.
Rules say what a match does; an item no rule matches waits for a person.

**Shape.** A GitHub source is one more `intake.sources` entry:

```json
{
  "intake": {
    "sources": {
      "github-example-app": {
        "via": "github",
        "repository": "example/app",
        "executionRepository": "app",
        "assignee": "example-bot",
        "autoStart": false,
        "provider": null,
        "model": null
      }
    }
  }
}
```

| Kind | Keys only it takes | Where it may live | Read by |
| --- | --- | --- | --- |
| `github` | `executionRepository`, `workspaceRepository`, `assignee`, `autoStart`, `provider`, `model` | `.avoozl.json` | `github_repositories`, `github sync` |
| `plugin:<id>` | `labelFields`, `assigneeField` | either | the tick's `poll` |
| `mcp` | `labelFields`, `assigneeField` | either | `intake.submit` |

All kinds take `repository`. Who counts is the repository's own `allowedActors` and `minimumPermission` (`github.repositories`); a source has none.

**Load.** `github-sources.mjs` owns the GitHub kind. `githubSources(value)`
returns the file's GitHub sources by GitHub repository: each `via: github`
entry, then each old `github.issueIntake` entry not already named, as the
source it describes, with id `github-<owner>-<name>`. An `enabled: false`
entry is no source. `github.queue` is not read. The settings diff
(`desiredActions`, `appliedActions` in `repository-settings.mjs`) compares
these sources with the `github_repositories` rows, so an old file and its
moved form compare the same and neither is flagged.

**Write.** `updateGitHubIssueIntake`, `updateUnifiedRepository` and the
first write of a new file go through one `writeGitHubSource(value, entry,
{remove})`. It first moves every old entry into `intake.sources` and
deletes `github.issueIntake` and `github.queue`, then adds, replaces or
removes the one source. So the move happens once, on the first write, and
nothing writes the old keys after it.

**Pipeline.** GitHub items come from GitHub intake and are stored as source
`github`. `sourceMap` leaves GitHub sources out, so poll and `intake.submit`
never see them, and `source:` names a plugin or MCP source.

**Settings.** Intake sources lists each GitHub source in the shared
`SourceBox` with Comes from GitHub, Work lands in, Ready label, Assignee,
Starts on its own and Who counts. Its action opens Repository setup. The
Add dialog
keeps plugin and MCP: adding a GitHub source makes GitHub labels, which
Repository setup does.

**Tests.** `intake.test.mjs`: GitHub keys and refusals, a machine-scope
GitHub source listed as unused, `sourceMap` without GitHub.
`github-sources.test.mjs`: a disabled one dropped, ids and clashes.
`repository-settings.test.mjs`: `github configure` and Repository setup
write a source. UI tests for the GitHub entry.

### 4.40 Task facts live in tasks.md

Requirement 111.

**Why.** Two files described each task: the title in `tasks.md`, its
repository, edges, checks and acceptance in a JSON file keyed by the same ID.
A person read one and then hunted for the other. One file is easier to
review, and Kiro chats, Claude Code and Codex write Markdown bullets without
a second file to keep in step.

**Shape.** A task's facts are the bullets directly under its item that
start with `$`, one fact per bullet on one line. Other bullets under the item
are its summary, and subtasks are its nested items, in any order around the
facts. Spec-wide defaults are front-matter at the top of `tasks.md`, written
without `$`:

```markdown
---
repo: avoozl
---
- [ ] lt-1.2 Queue table and records
  - $after: lt-1.1
  - $done: Tests load a valid file and get every default
  - $done: An unknown key is refused, and the message names the key
  - [ ] lt-1.2.1 Add the queue migration
    - $repo: nupp
    - $done: The migration runs twice with no change the second time
```

| Key | Stored as | Value |
| --- | --- | --- |
| `repo` | `repository` | one text |
| `type` | `type` | one text |
| `done` | `acceptance` | list |
| `after` | `requires` | list of task IDs |
| `paths` | `paths` | list |
| `manual`, `investigate` | the same name | `true` or `false` |
| `plan`, `step` | an epic's entry | text, in an epic folder |

An item with sub-items is a package and every other item a leaf. A leaf
with no `$done` takes each plain bullet under it as one result. The `##`
heading above a task is its phase.

A list is `$key: a, b`, or the same fact written again, each bullet adding
to the list. `$done` is one result per bullet and is never split on commas,
so a result may hold one; Avoozl writes one `$done:` bullet per result.
Nothing nests under a fact. A comma inside backticks does not split.
`$paths` reads a Files note as written:
each item's backticks, a note in parentheses after it, such as `(new)`, and
a sentence's closing period are not part of the path.

Every task runs its repository's checks (§5.2).

**Front-matter keys.** `repo` (the default for leaves); `integrationBranch`,
`integrationSync`, `kind: epic` (the spec).

**Reader.** `spec-facts.mjs` turns `tasks.md` into the object `parseSpec`
reads, `{tasks, integrationBranch, ...}`, plus the line of each bullet. `parseSpec`, `lintSpec`, `proposeSpecWork`, the
spec page, review tabs, graph, import and the
plan-review view take the facts from it. The default fills a leaf's missing
`repo`; a package takes none. Diagnostics name
`tasks.md` and the bullet's line. A leftover `avoozl/manifest.json` is one
error, `spec.manifest-left`, and nothing reads the file.

**Lint codes** (errors): `facts.unknown-key` (a `$` fact Avoozl does not
know), `facts.removed-key` (a fact or key outside the set above, with what to
do), `facts.duplicate-key` (a one-value fact written twice), `facts.value`
(a wrong value, or anything nested under a fact), `facts.misplaced` (a `$`
fact that is not directly under a task item), `facts.stray` (a bullet such
as `done:` under an item that reads as a fact without its `$`),
`facts.missing` (a task with no facts), `facts.block` (a `Facts:` block
still in `tasks.md` on disk), `spec.manifest-left`. The rules the manifest
had keep their codes. Nothing reads `Facts:` blocks or the manifest, on
disk or in a record stored in SQLite.

**Revision hash.** The hash covers the prose files without `Status:`,
`tasks.md` without checkbox marks, `$` fact bullets and its front-matter, and
the parsed facts written as one JSON text in the shape the old manifest had
(version 1, tasks in `tasks.md` order, each task's keys in bullet order,
defaults filled in). Defaults in front-matter or on each task, and a list on
one bullet or repeated, hash the same. Avoozl parses a revision once, keeps it in SQLite,
and parses again only when the hash changes. Ticks stay outside it.

**No carry-over.** A revision with a new hash needs a normal approval, even
when only its layout changed.

**Tests.** `spec-facts.test.mjs`: each key, each refusal with its line,
defaults and packages, an epic folder, a leftover manifest.
`spec-plans.test.mjs` and the fixtures write `$` facts. A hash test: an
inline list and repeated bullets hash the same, marks stay outside, and a
changed fact changes it. `facts-blocks.test.mjs`: a `Facts:` block is
refused.
`spec-conversion.test.mjs` as above. `kirocrew-planner.test.mjs`: the
planner prompt's example folder lints clean.

### 4.41 A tick on the base branch completes the task

**Why.** The commit that ticks a task is enough to mark it done.

**What it does.** On each tick of the workspace, `applyBaseTicks`
(`operations.mjs`) takes each approved spec and reads its `tasks.md` from the
base branch by git (`spec-ticks.mjs` `baseTasks`): the specs branch
(§4.45), which is the repository's `baseBranch` unless `specs.branch` names
another. The working tree is never read, so an unsaved edit and a worker
branch count for nothing. A read runs again
only when the branch head or the approved revision moved. `applyTicks`
compares the `[x]` items with the database:

- A ticked item whose task is not done becomes `accepted`. Its
  `acceptanceEvidence.baseline` holds the file, line, branch and commit, and
  `integration` holds the commit that ticked it (`tickCommits`, below).
  In plans-repository mode the plans branch is cached without history, so the
  commit is the branch head at the first read. One `task.ticked` Activity line
  is written.
- A parent's ticked box completes its open sub-items.
- An open worker session binding for the task is closed and one
  `worker.released` Activity line says so. Avoozl cannot close the chat
  itself; it stops observing and dispatching to it.
- Each read stores the ticked IDs under the meta key `spec-ticks:<plan>`. An
  ID that was ticked and is open now, on a done task, sets `task.untick`. The
  Conflicts view shows it as an `untick` item; `conflicts.settle` with
  `reopen` returns the task to planned, and with `keep` clears the item.
- Marks stay outside the revision hash (`withoutMarks`), so none of this
  creates a revision, an approval or a GitHub change by itself.
- Lint reports `task.ticked-unknown-id` for a ticked item with no task ID.

**Write side: ticks are the shared state.** Each machine's SQLite is private,
so the base branch's `tasks.md` is how coworkers learn a task is done. The
tick is the record that the work was done; CI time is not written there, it
is found from the tick commit (§4.31, R101.14).

- Direct landing builds each landing candidate in a worktree
  (`stackMembers`, `merge-batch.mjs`). Each member is merged with
  `--no-commit`, `tickEntry` (`spec-ticks.mjs`) ticks its task in the
  worktree, and one merge commit holds both. `tickedText` changes only the
  mark character of that line, then ticks a parent whose children are all
  ticked and that sits above a task just ticked.
- No other commit is written: the landing commit only ticks.
- The tick commit: `tickCommits` (`spec-ticks.mjs`) runs one
  `git blame --first-parent --porcelain <head> -- tasks.md` per read and
  gives each line's commit. With first parents only, a merge owns what it
  brought, so Avoozl's landing merge, a merge commit and a squash or direct
  push each own their tick. `applyTicks` stores it as `task.tickCommit`
  once (a task that has one is not blamed again) and uses it as the
  completing task's `integration.commit`. A fresh database finds the same
  commits from git.
- A `Built:` line a person wrote is read into `task.built` and looked up
  first. Avoozl writes none.
- shortcut: in a merge batch only the head gets a push run, so a member's
  own landing merge has no CI of its own on another machine; the landing
  machine looks up its `integration.commit`, the batch head. Upgrade: map a
  tick commit to the next first-parent commit with a push run.
- A spec in another repository (`tickPlansRepo`): after the push, the
  workspace's planning checkout fetches the specs branch, ticks in a
  detached worktree, commits, and pushes without
  force; a rejected push
  fetches again and starts over, five times.
- A task Avoozl landed has `integration.commit`, so the read side treats its
  tick as known (no Activity line, no worker released).
- The read side fetches `origin/<base>` (once per checkout and tick) and reads
  that, so a coworker's pushed tick reaches this machine. A checkout with no
  remote reads its own branch.
- Not covered: the pull-request landing and the local integrate path do not
  tick in their commit yet. A tick there arrives when a person ticks it on
  the base branch.

### 4.42 Git is the source of truth

**Why.** Git and GitHub hold everything that matters, so a lost database
loses nothing, and Avoozl fits plain git workflows. The database is a cache
(Requirement 114).

**Approvals.** `git-approvals.mjs` reads `git log` for the spec's paths on
main. A commit counts when its author email passes `approverCheck`: the
repository's `allowedActors` (email, or login by GitHub noreply address or
the commit's GitHub author), else `minimumPermission`; locally, the
checkout's `user.email`. The committer is not read. Each counted commit's spec files are read with `git cat-file --batch`
and hashed with `specHash`.

Approve (`approveInGit` in `operations.mjs`, used by `plan.approve`) first runs the database approval on a scratch copy, then
`commitApproval` builds one commit on origin's default branch (fetched) or
local main with a temporary index: the spec's reviewed files, authored by
the person git names, parented on the branch head. It pushes that commit
without force and moves the local branch forward; a checked-out branch has
only the spec paths of its index reset. An unchanged tree refuses ("edit it
through a spec branch"). The receipt names the commit and the author email.

An approver's commit on the specs branch, read on the tick, approves a spec
whose folder Avoozl did not commit itself (§4.46).

**Commit identity.** Every commit Avoozl makes (`commitWorkerChanges`,
ticks, landing commits, merge-forward commits) and every supervised child's
commit uses the checkout's own git identity as author and committer, with no
`Co-authored-by` trailer. A separate agent author made GitHub's squash add
one. Approval safety rests on spec drafts staying on `spec/` branches and
Approve squashing them onto main as the person clicking. A tick commit
changes only marks, which `specHash` ignores, so it approves nothing new.
The worker and planner prompts say to commit as the repository's identity,
add no attribution, and never push spec edits to main.

**Landing trailers.** `landing-trailers.mjs` `landingMetrics` reads a task's
worker bindings, attempts, usage and Flow spans (at most 200) when it is
queued to land, directly or by pull request. `landingMessage` writes them
under its `Avoozl-Task:` line, one `Avoozl-Span: ID STAGE START END ROLE
ATTEMPT SOURCE` line per span. A direct landing's merge commit carries
it (`merge-batch.mjs`); a pull request landing passes it as the merge's
`commit_message` (`landing-pulls.mjs`, `mergePullRequest`), so GitHub's
squash commit on main carries the same block. A private task's public name
gets no metrics. `landingsFromGit` reads them back.

**Retros.** `retro-files.mjs` `writeRetroFiles`, on each tick, commits every
finished retro not yet in git as `.kiro/retros/<id>.md` (a summary and the
record as a `json avoozl-retro` block), authored by the agent, in one commit
on main (`commitOnMain`, which `commitApproval` also uses). A retro a content
rule matches at the `proposal` boundary stays out.

**Intake.** The `source:` fact is stored as `intakeSource`; `startTask` ties
an item whose link a task names to that task. `intake.submit` creates one
issue per item in the source's GitHub repository with no labels
(`withoutCrewLabel: "intake"`), so nothing an MCP caller sends lives only in
SQLite and its words never trigger a rule.

**Rebuild.** `workspace.rebuild` (CLI `avoozl rebuild`) refuses a database
with plans, then runs `Operations.readFromGit` over every spec folder. The
Onboard flow's adopt step (§4.15) runs the same function over one added
repository's specs. It creates a plan per spec folder, approves each one whose current
text matches an approver's commit (exact hash, or `sameSpecContent`) in
dependency passes with `baseline` so ticked tasks start done (each at its
tick commit as its landing commit), records one `task.landed` Activity row per landing trailer,
puts back each trailer's Flow spans, and reads every retro file on main.

**Approvals on the tick.** A spec pull request an approver authored and
GitHub merged, or an approver's push, approves with no click
(Requirement 114.12). `Operations.applyMainApprovals` runs on each
`workspace.tick` after `applyBaseTicks`. It takes the plans whose text on
disk has no approval, groups them by checkout (`approvalCheckout`), and
reads each checkout's base branch with `baseHead` (`spec-ticks.mjs`), using
the fetch `applyBaseTicks` already made that tick. When the head, a plan's
hash or the text on disk changed since the last read, it runs
`approvalCommits` over those specs. The approver check is kept per checkout
and approvers list, so each author email is decided once. A plan whose disk
text an approver committed is approved by `adoptApprovals`, the same pass
`readFromGit` uses; when the plan still holds an older revision, the disk
text is saved as the next revision first. Each approval writes one Activity
row (`plan.approved`, source `tick`, the author as actor) naming the commit.
A clicked approval already has its receipt, so the tick skips it.


### 4.43 Task IDs and refs in tasks.md

**Why.** A ref that names nothing should be caught before approval, and a
task should open the text it cites (Requirement 115).

**IDs.** `specItems` reads the first token as the ID, with or without
backticks. Lint does not ask for either form. Kiro's numbers stay bare.
`taskToken` (`spec-refs.mjs`) is how every writer spells an ID:
`proposeSpecWork`, `fix.spec`, the sample specs and the planner prompt.

**Refs.** `splitRefs` takes a trailing `(...)`, then a trailing `[...]`,
off the title when the list's first entry starts with `§` or capitals and a
digit. `requirementIds` maps each `Requirement X:` heading (`R<n>` for a
number) and each numbered criterion under it, to the line it is on, until
the next heading of the same or a higher level; `designIds` maps each
heading whose text starts with a section number. Both add fact table rows.
`resolveRefs` checks each entry's form (`task.ref-form`) and that each end
of a range exists (`task.ref-unknown`). A proposal carries its refs as
`{kind, ref, file, line}`, and approval copies them onto the task.

**Page.** Tasks by phase shows a task's refs as chips. A chip opens the
file's tab and scrolls to the marked block at or above the ref's line.
Lines come from the files the spec was read with; after an edit on disk the
page reads the new folder and the plan shows as changed.

**Why each choice.** The refs resolve in the spec's own files only:
another spec's sections are prose in a summary bullet, so a ref never
breaks when another spec moves. Ranges check their ends, not every member,
because a criterion list may skip numbers.

### FS1. Flexible spec folders

**Why.** A spec had to be Kiro's three files at `.kiro/specs/`. A small spec
is often one task list, a repository may keep specs elsewhere, and a spec may
need notes beside its prose (Requirement FS1).

**Path.** `specs-path.mjs` reads `specs.path` from the `.avoozl.json` at the
root of the checkout that holds the specs: `specsPath(root)` gives the
checked path, `specsDirectory(root)` the folder on disk, `specFolderPath(root,
name)` a spec's repository path, and `specsPathOf(store, repository)` the
path of a repository read over GitHub, through its registered checkout. The
setting belongs to the spec repository, not the workspace, so each code
repository in single-repo mode keeps its own, and a reader that has only a
checkout root needs nothing else. `validateSpecs` in `layered-config.mjs`
checks the text; `specsPath` also checks that the deepest existing folder of
the path resolves inside the checkout. `specs.path` is not resolved to an
absolute path when the layer loads. With a `specs.branch` setting (§4.45), the branch
says where the folder is read and the path says which folder.

**Files.** `readSpecFolder` reads every regular `.md` file directly in the
folder. `revisionFiles(files)` orders them: Kiro's in their old order, then
the rest by name. `specHash` reads that order, so a Kiro folder hashes as
before. `parseSpec` refuses a folder with no task list, a folder with two
(`spec.tasks-twice`, naming both files), and a folder with both prose kinds;
a folder with no `bugfix.md` is a feature spec.

**Task file.** `spec-tasks.mjs` says where a spec's tasks are: `taskFile`
names `tasks.md`, or with none the one file whose `## Tasks` heading sits
outside a fence, and `specTasks` returns that file and its task text. The
task text of a single file keeps the file's line numbers: its front-matter
and the section's lines stay, other lines are blank, and headings under
`## Tasks` lose one `#`. So `specItems`, `headingPhases`, `readFacts`, ticks
(`tickedText`, `baseTasks`, `tickCommits`) and diagnostics read it as they
read `tasks.md`, and a line number is a line of the real file. `specHash`
hashes the whole single file with the section's marks open and its facts
left out. A proposed task goes at the end of the section (`addTaskLines`). Approve writes
every spec file and removes ones the reviewed revision left out
(`commitOnMain` `replace`). `approvalCommits` reads, at each approval commit,
every spec file name the spec's history touched. A worker's brief names the
spec's files and folder as context (`specTextNotes` in `delivery.mjs`).

**Refs.** `resolveRefs` checks a ref against its file when the spec has it,
and otherwise reports `task.ref-file-missing` naming the file.

**Limits.** Kiro's Spec Builder and the Kiro Crew planner agents write only
`.kiro/specs/`; with another path, draft with a process planner.

### 4.44 The spec issue's assignee says who works on a spec

**Why.** Two people on one repository could not see who was working on
what. The record is per spec (Requirement 116): a spec has one driver, and
that driver's own Avoozl already knows its running tasks. GitHub's assignee
is the one field everyone already sees.

**Who may drive.** `verdictOf` in `driver.mjs` reads the spec issue's
assignees (the epic issue's when the spec issue has none):

| Assignees            | Here                                                   |
| -------------------- | ------------------------------------------------------ |
| None                 | Read only, "Nobody drives"; no Needs you item           |
| This login           | Driver                                                 |
| Another login        | Read only, "Taken by <login>"                          |
| Two or more          | Read only on every machine; one Needs you item names them |
| No spec issue at all | Driver, "Not shared"                                   |

A person sets the assignee on GitHub; Avoozl never writes it. Reassigning
hands a spec off, and unassigning releases it.

**Closing.** In the tick's driver step, a spec this workspace drives whose
leaf tasks are all complete has its open spec issue closed as completed,
with one `PATCH` (`closeLanded`). The read already in hand says whether it is
open, so the step adds no read.

**Calls.** No new read. The driver step's `github.issue` is the conditional
read it already makes; the rechecks before dispatch and integrate hit the
client's cache (`github.cacheSeconds`, default 60), and an unchanged issue
answers 304, which does not count against the rate limit. Every write goes
through the write pacer (`github-pacer.mjs`).

**No spec issue.** A spec nobody published has no shared record, so it
drives on the workspace that has it and the page says "Not shared". Avoozl
makes no issue for it: **Make the GitHub issues** or `avoozl spec publish`
stays the person's act. The limit, in the docs: two machines that both hold
an unpublished spec both drive it.

**Privacy.** An assignee is a login on an issue the reader can already see,
and it names no other item, so `source-backlinks.mjs` is unchanged.

**Page.** `plansTableView` adds each spec's `driver` (state, reason,
assignees) from the `drivers` table. The Specs list shows it under the
title, and the spec's chip uses the same words (`rowDriverText` and
`chipText` in `driver-api.ts`).

### 4.45 The specs branch

**Why.** Avoozl does not forward pull requests or code between
repositories. One setting says the branch specs live on (Requirement 117).

**Setting.** `specs.branch` in `.avoozl.json`, checked by `validateSpecs` in
`layered-config.mjs`. `specs-branch.mjs` reads it: `specsBranchSetting` gives
the setting or null, and `specsBranch(store, workspaceRoot, root)` gives the
setting, else the checkout's repository `baseBranch`, else `main`.

**Readers and writers.** Spec folders are read from the spec checkout on disk
(`specHomes`); a checkout with another branch checked out adds one line to
`homeErrors`. `applyBaseTicks` and `applyMainApprovals` read the specs branch
with `baseHead`. `tickPlansRepo` ticks there. `approvalBase(root, {branch})`
and `commitApproval(..., {branch})` make Approve's commit there. Landing still
targets each code repository's base.

**Plans-repo mode.** The planning checkout holds `.avoozl.json` and is on
the specs branch; code repositories land on their own base.

### 4.46 Avoozl reads git and GitHub

Requirement 118. **Why.** Avoozl starts from a GitHub repository, with
GitHub for identity and permission and SQLite rebuilt from git and GitHub.
Every record Avoozl reads is a commit, a tick, a pull request or an issue.

| What | Where it lives |
| --- | --- |
| Approval | An approver's commit on the specs branch (`git-approvals.mjs`) |
| Several specs approved at once | One commit holding them, ordered by `$after` |
| A spec pull request | A pull request, reviewed and merged on GitHub |
| Driver | The spec issue's assignee (§4.44) |
| Landing | A guarded push or head-guarded merge (`guarded-push.mjs`) |
| Task done | Its tick on the base branch (§4.41) |

**Approval.** `applyMainApprovals` reads approver commits on the specs
branch (§4.45, `specsBranch`); `adoptCommitted(group, commits, branch)` approves every spec a commit
holds with its current text, in `adoptApprovals` passes so a ticked task's
spec waits for its owner. The receipt's `approval` is `{kind: "commit",
commit, approvedBy}`. **Approve** (`approveInGit`) and chat approval write
the same commit as the person; `plan.approve` is person-only.

**Driver.** `driver.mjs` reads the spec issue: one assignee who is this
login drives here (`verdictOf`); several open one decision; none drives
nowhere; no spec issue drives here as Not shared. A fully landed spec's
issue is closed once (`closeLanded`). Status, the Specs list row, the
read-only banner with its spec issue link and Settings › General › This
computer (its label) are what the page shows.

**Landing.** `merge-batch.mjs` and `landing-pulls.mjs` push or merge
through `guarded-push.mjs`; `queueDirect` and `queuePullRequest` need only
the task's spec.

**Machines.** Work runs on the driver's own machine, with its own
executors. In Local only mode this workspace drives every approved spec;
the machine row only names this machine.

**Make the GitHub issues.** The spec header's primary action for an
approved spec with no `links.issue` in a workspace whose GitHub mode is not
`local`; it calls `spec.publish` with the home repository.

**Tests.** `src/app/git/test/git-approvals.test.mjs`,
`src/app/landing/test/guarded-push.test.mjs`,
`src/app/workers/test/spec-assignee.test.mjs`,
`hosts/kirocrew/ui/test/plans-api.test.mjs` and
`hosts/kirocrew/ui/test/spec-header.test.mjs`.

## 5. Local workflow

From one large goal to integrated commits, with no GitHub.

| Step             | Owner                                                                                                                                                                                     | What happens                                                                                                                                                                                                                                              | Stops for a person when                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1. Enter goal    | User in Kiro Crew chat, or **Plan a goal** in the Avoozl page (opens a draft chat)                                                                                                        | The `avoozl` skill captures the goal and the workspace                                                                                                                                                                                                    | Never                                     |
| 2. Draft graph   | `avoozl-planner` session                                                                                                                                                                  | Writes one Kiro spec folder `.kiro/specs/<name>/` in the planning repository (§6.8): `requirements.md` (or `bugfix.md`), `design.md`, `tasks.md` with one ID per item, and `avoozl/manifest.json` with kinds, repositories, edges, checks, and completion | Never                                     |
| 3. Critique      | A second `avoozl-planner` session with no access to the first one's transcript                                                                                                            | Writes `avoozl/critique.md` in the same folder: missing acceptance, unbounded leaves, wrong edges, open decisions                                                                                                                                         | Never                                     |
| 4. Validate      | Avoozl core (spec reader, `lintPlan`, cycle check)                                                                                                                                        | Deterministic pass or fail with file and line numbers (§6.8)                                                                                                                                                                                              | Validation fails twice                    |
| 5. Approve       | User in the Plans view                                                                                                                                                                    | Approves the exact revision hash; stable IDs freeze                                                                                                                                                                                                       | Always (Requirement 4.8)                  |
| 6. Ready         | Tick                                                                                                                                                                                      | Computes ready leaves                                                                                                                                                                                                                                     |                                           |
| 7. Dispatch      | Tick | The tick opens one worker session per ready leaf, up to this machine's lanes, on the executor its role names (§4.28) |
| 8. Work          | Worker session                                                                                                                                                                            | Calls `plans_prepare_worktree` (branch `avoozl/<task-id>`), implements, commits, reports `done` with the commit SHA through `plans_report`                                                                                                                | Worker reports `question`                 |
| 9. Complex leaf  | Worker session                                                                                                                                                                            | May call `task_run` on a spec it writes for the leaf; Task Runner steps stay inside that run (F5, F6)                                                                                                                                                     |                                           |
| 10. Verify       | Tick queues a check run that Avoozl makes itself (an `avoozl-verifier` session only for a bar that needs judgment), plus one session per review role when the repository names any (§5.2) | Runs the repository's checks the diff picks as argv on the exact SHA in a clean worktree and records exit codes and output tails; review roles report verdicts and findings                                                                               | Checks fail after the retry bound         |
| 11. Integrate    | Tick (`integrateRun`)                                                                                                                                                                     | Rebases and merges into the local integration branch                                                                                                                                                                                                      | Rebase conflict the worker cannot resolve |
| 12. Release      | Tick                                                                                                                                                                                      | Recomputes readiness; dispatches newly ready leaves                                                                                                                                                                                                       |                                           |
| 13. Close parent | Tick                                                                                                                                                                                      | Marks packages and the epic done when all required children are done; whole-head acceptance stays a separate, explicit action                                                                                                                             | Whole-head acceptance                     |

Notes:

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

### 5.2 Review gates on a local delivery

Requirements 36–39. The
handoff was written to run a multi-step rewrite flow in another repository
as normal Avoozl tasks: one writer, two independent reviews of the writer's
exact commit, rework when a review asks for changes, and nothing downstream
until both approve. Its survey of the code read an older branch; the facts
below read `kirocrew-native` at `dd8b28b`.

#### Facts

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| F56 | **Verified.** A worker's `done` report queues one check run that Avoozl makes itself on the repository's checks the commit's diff picks in a detached worktree at the reported commit; an `avoozl-verifier` session opens only for a bar that needs judgment (§5.2 Checks in code). `verdictCause` refuses a report for another commit, a picked check missing from the report, and a non-zero exit. | `src/app/delivery/delivery.mjs` `planVerifierDispatches`, `planCheckRuns`, `verifierBrief`, `verdictCause`; `src/app/delivery/check-runs.mjs` |
| F57 | **Verified.** A rejected verdict marks the worker's attempt failed; the retry path opens a new worker attempt on the same worktree with the earlier cause quoted as data, up to `retries`, then a decision. A blocked or quiet verifier fails only the verification and is retried. Attempts and verifications stay on the `task_deliveries` row.                                                         | `delivery.mjs` `reconcileVerifications`, `reconcileDeliveries`, `workerBrief`                                               |
| F58 | **Verified.** Only a `verified` delivery is integrated, and a local leaf's `integrated` completion is reached from `task.integration.commit`, so dependents already wait for the verifier and integration.                                                                                                                                                                                                | `delivery.mjs` `integrateVerified`; `src/work-model.mjs` `completionReached`; `src/query.mjs` `ready`                       |
| F59 | **Verified.** Per-repository and workspace concurrency count only live worker attempts; verifier sessions do not count. The default workspace concurrency is 1.                                                                                                                                                                                                                                           | `delivery.mjs` `readyLeaves`, `DELIVERY_DEFAULTS`                                                                           |
| F60 | **Verified.** `task.update` accepts a typed `integration` receipt (commit, time, branch, repository, evidence strings) and sets `task.integration`, which meets `integrated` completion with no verifier and no merge. It also sets `status` directly, including `accepted`, and `checks`.                                                                                                                | `src/app/api/operations.mjs` `task.update`                                                                                      |
| F61 | **Verified.** `task.accept` takes typed `evidence`, or derives it with `acceptanceFromValidation`, which reads the first-listed commit's command records and does not check that every declared check ran. `componentOnly` accepts with no integration.                                                                                                                                                   | `operations.mjs` `acceptanceFromValidation`, `task.accept`                                                                  |
| F62 | **Verified.** `validateRun` records `exitCode: null` when a command cannot start and stops at the first failure. A verifier report needs an integer exit code for each check; a check it leaves out is a rejection, which fails the worker's attempt.                                                                                                                                                     | `src/app/git/git.mjs` `commandEvidence`, `validateUnlocked`; `delivery.mjs` `checkResults`, `reconcileVerifications`            |
| F63 | **Verified.** `integrateRun` rebases the branch onto the integration branch and reruns the repository's checks, so the integrated commit can differ from the verified one.                                                                                                                                                                                                                                | `git.mjs` `integrateRun`                                                                                                    |
| F64 | **Verified.** Plan approval deletes and rebuilds each task's incoming edges that carry the plan's `planId`.                                                                                                                                                                                                                                                                                               | `src/app/specs/plans.mjs` approval                                                                                                |
| F65 | **Verified.** The verifier agent's model is `auto`; session bindings record no model; `tick.py` calls `open_session` without the `model` argument F31 lists. Whether Kiro Crew reports the model a session actually ran on is **Inferred** not available.                                                                                                                                                 | `hosts/kirocrew/agents/avoozl-verifier.json`; `src/app/sessions/session-bindings.mjs`; `hosts/kirocrew/crons/tick.py`                    |
| F66 | **Verified.** Task rows already use `acceptance` (criteria text) and `distinctFrom` (duplicate-review reasons). A new task flag cannot reuse either name.                                                                                                                                                                                                                                                 | `delivery.mjs` `workerBrief`; `operations.mjs` `task.update`                                                                |

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
    "model": "model-a",
    "reviewers": [
      {
        "id": "conventions",
        "focus": "language and repository conventions",
        "agent": "avoozl-reviewer",
        "model": "model-b"
      },
      {
        "id": "correctness",
        "focus": "correctness and performance",
        "agent": "avoozl-reviewer",
        "model": "model-c"
      }
    ],
    "repositories": {
      "example-rewrite": {
        "feedbackRounds": 3
      }
    }
  }
}
```

- `model` is the writer's model. The tick passes it to `open_session` for
  worker sessions it opens. Each binding records the model it was opened on.
- Each reviewer has `id`, `focus`, `agent`, `model`, and `distinctFrom`
  (`model`, the default, or `session`). Validation refuses a duplicate `id`,
  an empty `focus`, and, for `distinctFrom: model`, a missing or `auto` model
  on either side or a reviewer model equal to the writer's.
- The checks role is always present, with id `checks`. Avoozl runs it
  itself (Checks in code, below); a verifier chat holds it only for a bar
  that needs judgment.
- With no `reviewers` key, every repository gets `DEFAULT_REVIEWER` in
  `delivery.mjs`: id `review`, agent `avoozl-reviewer`, `distinctFrom:
  session`. `reviewers: []` turns review off, for the workspace or for one
  repository under `repositories`.
- `reviewRounds` (default 3, 1–10, workspace or repository) caps the review
  rounds. Each `changes-requested` verdict fails the writer attempt with
  `review: <role id>`, which `failuresSince` does not count against
  `retries`. At the cap the delivery is `decision` with the cause
  `review requested changes in N rounds; open findings: <refs>`, and the
  tick sends one decision notice.
- The worker's rework brief asks it to fix each open defect or answer it in
  its done report. The next review brief quotes that report as an
  unverified claim and names the role's last reviewed commit, so the
  reviewer reads `git log <commit>..HEAD`. A closure may be `withdrawn` when
  the answer shows a finding was not a defect.
- `prompts/reviewer.md` is the reviewer's standing prompt: an independent
  session that ranks every defect, tries to defeat the change through other
  inputs, entry points and callers, judges whether each test would fail on a
  revert, reruns checks a report claims without an exit code, attacks a
  findings file the task names first, labels each finding blocking,
  important or minor, and leaves style and other designs out.

#### Checks in code

The checks role makes no model call when the bar is commands.

**Repository checks**. The checks are the
repository's, set in its workspace repository config and only by a person
(`repository.configure`). `checks` maps a name (`^[a-z][a-z0-9-]{0,39}$`) to
argv, or to `{"run": [argv], "paths": [glob, ...]}`:

```json
{
  "test": [
    "npm",
    "test"
  ],
  "diff": [
    "git",
    "diff",
    "--check"
  ],
  "ui": {
    "run": [
      "npm",
      "run",
      "test:ui"
    ],
    "paths": [
      "src/ui/**"
    ]
  }
}
```

A check with `paths` runs only when the commit's diff against the base
touches a match; every other check always runs. Tasks never name checks:
there is no `checks` fact or default (§4.40), and a stored task's list is
ignored. The older form, a list of argv arrays, still loads, each check
named by its argv joined with spaces and with no paths. Records, reruns,
bisect steps are keyed by check name; each still keeps
`command` for display. A check runs with only the environment a process
needs to start plus the names in `checksEnv`, whether or not it lists any;
push and GitHub credentials never reach a check, even when listed.
`verify.checkTimeouts` is keyed by check name (a key written as the
command text still matches), with `verify.checkTimeoutSeconds` the
default.

- **Queue.** The tick queues one `check-run` record (in `flow_records`)
  per reported commit. The app backend drain runs the queue
  off the tick's path: per repository, oldest first, one at a time, under
  a work lock. Nothing starts while all agents are stopped, and a commit a
  stopped line holds is not queued until the line is green. A run left
  `running` by a process that is gone goes back in the queue.
- **Run.** A clean detached worktree at the exact reported commit. Each
  repository check the commit's diff picks runs as argv with no shell, with its own time limit (20 minutes), and records
  its exit code and the last lines of its output, redacted by the content
  rules and with the worktree path removed. The worktree is removed
  afterwards. If HEAD is not the reported commit, nothing runs.
- **Verdict.** The next tick judges the run with the same `verdictCause`
  rules as a verifier's report. A check not run, exit 126 or 127, or a
  timeout fails the checking, which is retried, not the writer's attempt.
  A non-zero exit fails the writer's attempt; the tail is kept beside
  that check on the verification. A run for an older commit judges nothing.
- **Receipts.** The verification keeps role id `checks` and the same entry
  shape (`name`, `command`, `exitCode`, `durationMs`), so receipts and gates read
  the same. Flow timing records the run as stage `checks`.
- **Judgment.** A verifier session on `avoozl-verifier` opens only when
  the task says `verify: "agent"`, or its repository has no checks. Its report carries a `verdict` like a reviewer's.

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
   {
     "taskId": "rw.3",
     "kind": "done",
     "commit": "<C>",
     "verdict": "changes-requested",
     "findings": [
       {
         "id": "F1",
         "kind": "defect",
         "paths": [
           "src/x.py"
         ],
         "text": "..."
       }
     ],
     "closures": [
       {
         "finding": "2:correctness:F2",
         "state": "fixed",
         "note": "..."
       }
     ]
   }
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
(`plans_task {action: "retry"}`) may dismiss findings by reference with a reason.

**Not run.** A checks report entry may be `{command, exitCode: null,
notRun: "<reason>"}`. Avoozl reads `notRun`, a null exit code, 126, 127, and
a picked repository check missing from the report as not run (Requirement
38.1). `validateRun` evidence with `exitCode: null` already fails;
acceptance now also needs every repository check present at the current
commit.

**Supersede by hand.** `task.supersede` (`avoozl task supersede`,
`plans_task {action: "supersede"}`) takes `{id, create}` and, in one transaction,
creates the new task, copying the old task's `requires` and `sequence`
edges unless `create.requires` is given, sets `supersedes` and
`supersededBy`, and sets the old task to `superseded` (a new status,
`complete: false`, hidden by default). The ready rule resolves each edge's
`from` through `supersededBy` to the newest task before it checks completion
or decisions. Plan approval leaves the chain alone.

**GitHub pull-request reviews follow branch rules.** Avoozl
reads the base branch's rulesets and classic protection; their required
approving review count is the count a GitHub-route leaf needs on its head
SHA, and with no such rule reviews are not read. Settings shows the rule,
read only. A file that sets `pullRequestReviews` does not load.

#### Why each choice

| Choice                                                             | Why                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviews are roles on one delivery, not review tasks in the graph   | A delivery already ties a verifier to the writer's exact commit, retries, and holds history (F56, F57). Review tasks would need integration-free acceptance, a fake integration record, supersede chains for every rework, and edges from every dependent to every review. Roles need none of that, and the graph stays the user's plan |
| No dedicated task kind for reviews                                 | Same reason: a review has no repository change, no landing, and no dependents of its own                                                                                                                                                                                                                                       |
| `distinctFrom: model` is the default                               | Rule 2 forbids a reviewer sharing the writer's model. A new session alone is already guaranteed; the model is what reviewers would share otherwise                                                                                                                                                                                      |
| Unknown model shuts the gate                                       | Kiro Crew does not report the model a session ran on (F65), so Avoozl relies on the model it asked for. When it did not ask (`auto`, or a conductor that names none) it cannot prove the rule and asks a person                                                                                                                         |
| Split focus                                                        | Two reviewers with one focus each catch more than two reviewers skimming everything. The focus is text in policy so each repository picks its own                                                                                                                                                                                       |
| Verdicts name their commit; a moved head makes them stale          | Rule 3: the review judges what merges. Comparing the stored commit is enough; no timer or invalidation step is needed                                                                                                                                                                                                                   |
| Re-review after a rebase that changes the commit                   | A rebase can change behavior. With one writer per repository the base rarely moves, so the extra round is rare                                                                                                                                                                                                                          |
| Rework is a new attempt, not a superseded task                     | The retry path already keeps the worktree, quotes the cause, bounds retries, and keeps history (F57). Superseding for each rework would grow the graph and need edge tricks                                                                                                                                                             |
| Closure checked in Avoozl, domain rules in the repository's script | The fixed-or-unchanged check is generic: paths and diffs. What a rewrite run must contain is that repository's business, so its validation script runs as a repository check, and Avoozl adds no field for it                                                                                                                            |
| Task's own diff via patch-id                                       | A plain diff between two commits also shows base changes after a rebase, which would let `fixed` pass on someone else's edit                                                                                                                                                                                                            |
| Not-run fails the checking session, not the writer                 | A missing tool is not the writer's fault; today it costs a worker retry (F62). It still never passes                                                                                                                                                                                                                                    |
| Typed integration refused where reviews apply                      | `task.update` can set `integration` or `accepted` directly (F60), which would skip every gate this section adds                                                                                                                                                                                                                         |
| Supersede resolves on read                                         | Plan approval rebuilds plan edges (F64), so a rewritten edge would snap back on the next approval                                                                                                                                                                                                                                       |
| Supersede only for local authority                                 | GitHub and plugin rows are caches of their tracker (Requirement 19.3)                                                                                                                                                                                                                                                                   |
| No separate writer limit                      | Each task writes in its own worktree and landing merges one head at a time, so the machine's lanes are the only cap (Requirement 6.3). A second mechanism would only drift from it                                                                                                                                                        |
| GitHub pull-request reviews later                                  | GitHub already gates GitHub-route merges with required reviews; reading them into Avoozl is useful only for display and the Delivery view                                                                                                                                                                                               |

## 6. GitHub workflows

### 6.1 Design-first

**Proposed.** The plan layout is §6.8; this section is the flow.

1. The user writes requirements (or a bugfix analysis) and design in Kiro or
   Spec Builder (F7, F47). Both write a Kiro spec folder. Repository steering
   asks for an ID on every `tasks.md` item (§6.8).
2. In the Avoozl Plans view the user picks the spec folder and presses
   **Prepare delivery**. Avoozl reads the files from disk (MC-7 interim).
3. An `avoozl-planner` session writes `$` fact bullets under every
   `tasks.md` item (§4.40): its kind, repository, edges, checks, completion,
   and source references (file and heading).
4. A critique session compares the task facts and prose and lists uncovered
   requirements and unsourced tasks.
5. Deterministic validation checks schema, references, cycles, repository
   registration, and label policy.
6. The user commits the spec folder through a normal review (pull request or local
   commit). Approval is the reviewed commit, pinned with policy commit and
   compiler digest.
7. **Preview** lists every issue create and update, sub-issue link, dependency
   edge, and label change, per repository.
8. **Apply** runs projection (§6.3) inside the next tick. Ready labels go last.
9. Avoozl worker sessions implement the tasks in both modes (§6.6).
10. Completion and release follow §6.5.

Spec Builder's own **Approve tasks** handoff starts one execution session for
the whole checklist (F7), and Kiro's **Run all Tasks** runs `tasks.md` in its
own waves (F47). For Avoozl-delivered specs the user uses neither. Avoozl
shows that warning on the spec's card.

### 6.6 GitHub modes

Uses F37–F43. The mode follows from the repositories' roles (§4.34).

|                                     | Plans-repo mode                          | Single-repo mode      |
| ----------------------------------- | ---------------------------------------- | --------------------- |
| Spec folders, spec and epic issues  | A planning repository                    | The code repository   |
| Pull requests and landed code       | The code repositories each task names    | The same repository   |
| Who codes tasks                     | Avoozl worker sessions                   | Avoozl worker sessions |
| Planning repository named in public | Never                                    | Not applicable        |

In plans-repo mode no pull request, commit message, branch name or marker in
a code repository names the planning repository. The `leak` built-in rule
set (§4.9) checks each of them before it is written; a match opens a
decision and the task does not land until it is fixed (Requirement 28.8).

### 6.8 Plan layout: Kiro spec folders

**Proposed.** Required for every plan (Requirement 30), built on F47–F48.

```text
.kiro/specs/<name>/
  requirements.md   (feature spec)   or   bugfix.md   (bugfix spec)
  design.md
  tasks.md             (each task's facts: $ bullets, §4.40)
  avoozl/critique.md   (planner critique, optional)
```

- **Where.** Plans-repo mode: the planning repository. Single-repo mode: the
  code repository. No GitHub mode: the workspace's planning repository.
- **Task IDs.** Every checklist item in `tasks.md` starts with an ID token:
  `- [ ] <id> <title>`. A token that is a bare number path (`1`, `2.14`, Kiro's
  usual numbering) becomes `<name>.<token>`; any other token (`w3.reactor-timers`)
  is used as is, which keeps migrated IDs. IDs are unique across the namespace.
- **Mapping.** One `tasks.md` ID is one Avoozl task, never an issue. The
  task's `$` fact bullets hold kind, repository, edges, completion,
  milestone and iteration.
- **Waves.** Kiro computes its own waves from `tasks.md` when it runs all
  tasks (F47). Avoozl ignores them: its graph comes only from the `$` fact bullets.
  A `[x]` mark on the base branch completes its task (§4.41); other marks are
  not Avoozl state.
- **Bugfix specs.** A `bugfix.md` spec maps the same way. Its unchanged
  behavior clauses become acceptance on the fix leaves.
- **Validation** refuses: a missing folder; a missing `design.md` or
  `tasks.md`; neither or both of `requirements.md` and `bugfix.md`; an item
  with no ID; an ID used twice; an item with no facts, a leftover
  `avoozl/manifest.json`, and the other §4.40 refusals; and after approval, an approved ID whose
  item text changed without a new approval. Kiro's **Sync Files** can add or
  mark tasks (F48); a renumbered item fails this check instead of silently
  moving an issue to other work. (**Inferred** that Sync Files may renumber.)
- **Category (Requirement 30.9).** Grouping in the Plans view comes from
  YAML front-matter at the very top of `requirements.md` or `bugfix.md`,
  for example `---` / `category: Runtime` / `---`, the same place Kiro puts
  steering inclusion modes (**Verified** for steering in Kiro's docs). Front-matter
  stays part of the revision hash like any other text. Avoozl reads only a
  top-level one-line `category:`; it never writes it, never stores it in the
  facts, and never guesses one, so a plan without it is Uncategorized.
  Kiro's spec folders are flat, so grouping is by category, not by folder
  nesting. Whether Kiro, or Spec Builder, keeps front-matter when it
  regenerates a spec file is **Unverified**: Kiro's spec docs do not mention
  front-matter, and no spec code was found to read (Kiro CLI 3.2.1; the IDE is
  not installed). Spec Builder's skill writes `requirements.md` whole, so a
  regeneration may drop it (**Inferred**). A dropped block is visible, not
  silent: the folder shows as changed on disk and the plan moves to
  Uncategorized. Avoozl's planner keeps an existing block as is.

### 6.9 Epics across plans, phases inside plans

Tasks are never issues (Requirement 59.8).

Requirement 59. An epic is a goal
that spans plans, such as a language rewrite. A phase is a group of tasks
inside one plan. Each word has one meaning. Other forms (a task
`kind: "epic"`, a per-task `epic` string, `doc:<path>` epics) are validation
errors.

| Level         | Is                    | Comes from                                         | GitHub                                                     |
| ------------- | --------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| Epic          | A goal across plans   | Its own spec folder; members' `epic:` front-matter | One issue, `epicIssueType`                                 |
| Plan          | One spec folder       | `.kiro/specs/<name>/` (§6.8)                       | One plan issue, sub-issue of its epic's issue              |
| Phase         | A group inside a plan | `phase` fact, else the `tasks.md` heading          | Not an issue: managed body line and optional Project field |
| Package, leaf | Tasks                 | `kind` fact                                        | Sub-issues of the plan issue or package                    |

**Epic folder.** The same three files as a plan (§6.8), so Requirement 30's
layout rule holds unchanged. A folder is an epic folder when its `tasks.md`
front-matter says `kind: epic` (§4.40). `requirements.md` states the goal and what
done means. `design.md` says how the member plans fit and in what order.
`tasks.md` has one item per member plan, for example
`- [ ] 1 Native runtime`. Its facts list plans, not tasks:

```markdown
---
kind: epic
---
- [ ] 1 Native runtime
  - $plan: native-runtime
  - $summary: Direction and work W1-W7
- [ ] 2 Runtime contracts
  - $plan: runtime-contracts
```

- A row may hold only `plan`, `summary` and `step` (§4.32.6). The older
  `memberPlan` key is an unknown key; task 21.7 renamed it in the one
  folder that used it.
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

| Code                           | Severity | When                                                                                                       |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `spec.epic-member-missing`     | error    | An entry's `plan` is not a spec folder in the namespace                                                    |
| `spec.epic-member-unconfirmed` | error    | The named plan's `epic:` is missing or names another epic                                                  |
| `spec.epic-member-twice`       | error    | Two entries name the same plan                                                                             |
| `spec.epic-nested`             | error    | An entry names an epic folder                                                                              |
| `spec.epic-task-fields`        | error    | An entry holds a key other than `plan` and `summary` (`memberPlan` included)                               |
| `spec.epic-bugfix`             | error    | The epic folder has `bugfix.md`                                                                            |
| `spec.epic-unknown`            | warning  | A plan's `epic:` names no epic folder, or one that does not list it                                        |
| `facts.unknown-key`            | error    | A task has an `epic` fact, or front-matter has `epics`; use a `##` heading |

**Phases.** A task's phase is the nearest heading of level 2 or lower above
its item in `tasks.md`; otherwise **No phase**. The heading's text is the
title, and its slug is the ID, made unique within the plan by a `-2`
suffix. A heading renamed in `tasks.md` changes the phase ID; no issue or
edge depends on it, so nothing else moves. Phases never add edges,
readiness, or completion.

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
the marker with `kind` `epic` or `plan`. The tick's close step (§5, step 13) closes a plan issue when all its tasks are complete and an epic issue
when all its plan issues are closed. Avoozl closes them in both modes,
since no pull request closes a parent.

The phase is not an issue. Avoozl writes `Phase: <title>` in each task's
managed body section and, when `project.fields.phase` names a field, sets
that field. Like Wave, the field is Avoozl's: a person's edit is reverted
on the next tick and nothing else happens. With no field named, nothing
is written to the Project.

**Limits**, from GitHub's docs and the GraphQL schema:

| Limit                                  | Value                                                                                                                                                                               | Source                                                                                                                                                                                                                       | Status                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Sub-issues per parent                  | 100                                                                                                                                                                                 | [Adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues); the docs source sets `sub-issue_limit: '100'` in `data/variables/projects.yml` of github/docs          | **Verified** (docs)       |
| Closed sub-issues count toward the 100 | yes                                                                                                                                                                                 | A user's report of the `addSubIssue` error "Parent cannot have more than 100 sub-issues" with 433 closed children ([community discussion 207865](https://github.com/orgs/community/discussions/207865)); the docs do not say | **Inferred** (one report) |
| Nesting depth                          | 8 levels                                                                                                                                                                            | Adding sub-issues                                                                                                                                                                                                            | **Verified** (docs)       |
| Sub-issue from another repository      | allowed when both repositories have the same owner                                                                                                                                  | [REST sub-issues](https://docs.github.com/en/rest/issues/sub-issues): `sub_issue_id` "must belong to the same repository owner as the parent issue"; the docs' UI steps add issues from other repositories                   | **Verified** (docs)       |
| Who may link                           | triage permission or more                                                                                                                                                           | Adding sub-issues                                                                                                                                                                                                            | **Verified** (docs)       |
| GraphQL                                | `addSubIssue(issueId, subIssueId or subIssueUrl, replaceParent)`, `removeSubIssue`, `reprioritizeSubIssue`; `Issue.subIssuesSummary` gives `total`, `completed`, `percentCompleted` | `gh api graphql` introspection                                                                                                                                                                                               | **Verified** (schema)     |

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

Existing projected issues for an old `kind: "epic"` task stay where
they are, as package issues. The next preview shows their type change and
their new parent, the plan issue; nothing is closed or recreated.

**Views.**

| View             | Epic (across plans)                                                                                        | Phase (inside a plan)                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Graph            | Top level: epics and **No epic**; drill to member plans                                                    | Plan drill-in: phases, then tasks; **No phase** last   |
| Delivery         | Filter; row shows plan and phase                                                                           | Filter, enabled once a plan is picked                  |
| Flow             | Filter                                                                                                     | Filter                                                 |
| Dashboard        | **Progress by epic**: one row per epic over all member plans' tasks, plus **No epic**                      | None                                                      |
| Plans            | Filter and an Epic column; epic folders listed with kind **Epic**                                          | None                                                      |
| Plan left column | The plan's epic as a link to its epic page                                                                 | Phases with progress, replacing today's per-plan epics |
| Epic page        | Goal, what done means, member plans with status and progress, open decisions, Edit and Discuss like a plan | Each member's phase counts                             |

The Graph's back stack and breadcrumb read All > Epic > Plan > Phase >
Focus: task. The epic page is the Graph's epic drill-in with the epic's
prose beside it, so no new top tab is added. The New plan drawer offers
**Epic** (pick one) and **Phases**; the seed tells the planner to write the
`epic:` key and the phase headings.

### 6.10 Driver: one machine drives each spec

Requirement 66 and §4.44. `src/app/workers/driver.mjs` decides;
`driver-scope.mjs` answers from SQLite for every write loop.

#### The lock: who is assigned

In a GitHub mode the spec issue's single assignee drives the spec: the Avoozl
whose `gh` login is that assignee. With no assignee on the spec issue, the epic
issue's assignee stands in; a spec issue with several assignees never falls
back to the epic. Several assignees read only everywhere and open one
decision. Task-issue assignees keep their own meaning. In Local only mode this
workspace drives every approved spec.

The machine ID (`mch_` plus 16 base32 characters) and an optional label live
in machine-local settings (`driver.json`). The label passes the `github`
content-rule boundary and is never filled from the host name.

#### Reading it in the tick

The tick's driver step reads each approved spec's issue and writes the
`drivers` row (state, reason, assignees). It reads the issue **again** right
before each dispatch for the spec, before projection, and before each
integrate or merge (`recheckDrivers`). A spec this workspace does not drive is
read-only here: the tick refreshes its own cache and views, and nothing is
dispatched, messaged, written to GitHub, integrated or merged for it
(`driverGuard` refuses any GitHub write keyed to it). An unread issue reads
only for that tick. Assignment is not atomic, so work started before the next
read can overlap, at most one tick's worth.

#### Page and Settings

- The spec's own page and row show its driver: "Driver: you",
  "Taken by octocat", "Driver: nobody" or "Driver: you · not shared".
- A read-only spec shows a banner on its pages saying why, with a link to
  the spec issue, where reassigning it moves the spec.
- Settings › General › **This computer**: Machine label (optional) and the
  machine ID shown small. These stay on this machine.
- `driver.status` is readable on the page, in the CLI (`avoozl driver
  status`) and over MCP; `driver.settings.update` is person-only.

| Decision                                                    | Reason                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Spec issue assignee names the driver, the epic's as default | GitHub's own owner field, visible in every list and view, with history                             |
| Exactly one assignee                                        | Several is not an answer; guessing is the bug                                                      |
| Avoozl never reassigns                                      | Hand-off is a person's GitHub action                                                               |
| Check again before each dispatch                            | Assignment is not atomic; this bounds the overlap to one tick                                      |
| Age never moves the role                                    | A slow or asleep machine is not a gone one; the repository rule for workers applies to drivers too |

### 6.11 Demo mode

Demo mode has the sample, the fake GitHub, the badge, the bar and Exit demo, and no tour. **Start demo** is in the empty In flight box on Home.

Requirement 82. `src/app/workspace/demo.mjs` builds the sample; the app backend
serves it; `hosts/kirocrew/ui/src/Demo.tsx` shows it.

**Sample.** `installDemo(root)` builds in `<root>.staging-*` and renames the
folder into place; the `demo:sample` receipt marks it done. Built through
the same `plan.create` and `plan.approve` path as a person's specs, but
only inside the throwaway folder, so the data has the real shape. Single-
repo mode on the fake `example/recipe-box`; specs live in its checkout.
Machine settings (plugins) live in the sample folder, and its
configuration home is the sample folder. The default root is one folder
per user under the system temp folder.

**Serving.** Machine operations `demo.start`, `demo.exit` and `demo.status`.
Requests for workspace `@demo`, which no catalog ID can be, go to the
sample. Reads run; every other operation is refused with 409, `demo: true`
and a preview sentence. The sample's `Operations` get the fake GitHub and
no notifier, crew reader, session stopper or driver. The backend's drain
never reads the sample.

**Page.** `host.ts` wraps the host's `useAppApi` and `useChatLauncher`. In
the demo, Open chat shows a preview, only Avoozl commands and GETs reach
the host, and `workspaces.*` answer with the sample alone. `Demo.tsx` holds
the badge, the Demo bar with the last preview and Exit demo, and the tour
card (the popover layer) whose steps (`demo-api.ts` `TOUR`) move the page.

| Choice                                                        | Why                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| A separate folder, not example data in the person's workspace | Nothing to clean up in their database; exit is just a switch |
| Preview by refusal at the backend                             | One gate covers every page action, current and future        |
| Fake GitHub refuses unknown methods                           | A new write method fails closed                              |
| `@demo` ID                                                    | Cannot collide with a catalog workspace                      |

shortcut: the global Avoozl configuration file is still read beneath the
sample's own (`loadLayeredConfig`); upgrade by passing the sample as home
at each call site if a person's global file ever names repositories.

### 6.12 Security follow-ups

Requirement 83. Audit findings S4 to S8 from the PR 29 comment.

**S4, CLI gate.** `cliRefusal` in `src/app/mcp/mcp-policy.mjs` runs at the top of
`localOrRequest` in `cli.mjs`, before the in-process or server path. It uses
`PERSON_ONLY` and `mcpRefusal`, so the MCP and CLI lists cannot drift. A
session is `KIROCREW_SPAWNED=1` or `KIRO_SESSION_ID` (found in Kiro Crew's
`launch.py` and `hook_runtime/script_hooks.py`; the dashboard terminal, in
`handlers/terminal_shell.py`, copies the gateway environment and adds
`KIROCREW_TERMINAL=1`, so it has neither). In such a session the CLI runs the operation and notes it (`agentSessionNote`); it
refuses only in a supervisor child. The
request for a descriptor or 0600 file is `docs/kirocrew-requests/`.

**S5, file modes.** `Store` creates `.avoozl` and `.avoozl/local` 0700 and the
database 0600 before SQLite opens it, and `tightenWorkspace` chmods existing
ones (and `-wal`, `-shm`) on open. A database named by `--db` outside
`.avoozl` leaves its folder alone. `privateFile` serves backup and export.
Windows: Node sets no modes there; the files keep their folder's access.

**S6, worktree helper.** `createWorktree` hashes `scripts/worktree` and
compares it with the repository's `worktreeHelper`; a mismatch is a 409 that
shows the hash. The approval lives with the repository, beside the `checks` that
already run repository code.

**S7, plugin re-hash.** `pluginHost.connect` calls `contentHash` again for a
local folder just before `PluginProcess` spawns.

**S8, checks env.** `repositoryConfig` and repository settings take `checksEnv`.
`commandEvidence`, `runChecksAt`, `runCheckAt` and `runLocalChecks` pass it to
`checkEnvironment(env, allow)`. The setting is named `checksEnv`, not
`checks.env`. A check always gets the allowlist, the start-up names plus `checksEnv`, even when
`checksEnv` is absent, and never the push or GitHub credentials.

| Choice                              | Why                                                        |
| ----------------------------------- | ---------------------------------------------------------- |
| Gate on Kiro Crew's own markers     | Nothing for the person to set up; a terminal is unaffected |
| Approval stored with the repository | Whoever edits `checks` already runs code there             |
| Allowlist always on                 | A check never holds a token it was not given               |

shortcut: S4 is a speed bump and S7 leaves a small window between the hash and
the child's read; upgrade S4 with the upstream request, S7 by copying first.

### 6.14 The content hook

Requirement 85. Usage in `docs/content-hook.md`.

`avoozl content hook` (`src/app/content/content-hook.mjs`) is an agent's
pre-tool-use command. It reads the event, splits the shell line into
commands, and for a write command (criterion 1) takes the text, labels and
branch from its arguments. For `git push` and `gh pr create` it also runs the
`diff` boundary over the commits not yet on the base branch, their messages
and added lines, as the pre-push check on Avoozl's own pushes does (§4.9);
that check is separate code. It uses the `github` and `diff` boundaries and
the repository's rule sets as they are; there is no new rule format. A
refusal is exit code 2 with the rule set, id and place on stderr. Text it
cannot read (`$(...)`, `$VAR`, a here-document it cannot see) is refused
with the reason.

Tried on a scratch repository with a fake canary string. Blocked: comment,
label, issue title, `gh api` body, commit message, branch name, pull request
body, and a push whose commit held the canary only in a file. Not blocked: a
script that ran `gh issue comment` with the canary inside the script. That
is the stated limit, and nothing cleans it up afterward.

shortcut: the hook reads command text. Upgrade when agent writes go through
one tool.

---

## 7. Kiro Crew integration map

| Feature                     | How Avoozl uses it                                                                                                                              | Interface                                           | Status                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Kiro Crew chat              | Planning conversations; the `avoozl` skill drives Avoozl MCP tools                                                                              | Skill + MCP server                                  | **Proposed**; skill exists (F14)                          |
| Kiro Crew sessions          | One session per leaf, verifier, reviewer, planner; links from every task                                                                         | Script cron `open_session`, `send_to_session` (F31) | **Proposed**; P2 proves                                   |
| Cron                        | The tick, every 60 seconds                                                                                                                      | App manifest script cron (F32)                      | **Proposed**; P2 proves                                   |
| Notifications               | Decisions and failures                                                                                                                          | App notification channels (F30) via `ctx.notify`    | **Proposed**                                              |
| Task Runner                 | Optional, inside a worker session for a complex leaf                                                                                            | `task_run` tool from the worker                     | **Verified** tool (F5); use **Proposed**                  |
| Spec Builder and Kiro specs | The only plan layout: Kiro spec folders, written by Kiro, Spec Builder, or Avoozl's planner (§6.8)                                              | Files on disk                                       | **Verified** files (F7, F47)                              |
| Workflows                   | Optional for large replans (Nupp) where restartable phases help; not required by any proof                                                      | User-started from chat                              | **Verified** features; use **Proposed**                   |
| Monitor loops               | Not used for routine work (Requirement 26.9)                                                                                                    | None                                                | **Verified** cost model (F28)                             |
| Inbound webhooks            | Not used in v1                                                                                                                                  | None                                                | **Verified** limits (F22)                                 |

## 8. Avoozl app user experience

**Built.** One page in Kiro Crew with seven nav entries. Every view reads the node backend, which calls the same
operations as CLI and MCP (Requirement 20.4).

| Nav entry     | Pages                                                              | Holds                                                                                                         |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Dashboards** | Home, Graph, Delivery, Landing queue                                | Counts and In flight; the task graph; running and recent tasks with machine badges and Stop the line; the landing queue |
| **Specs**     | one list with status chips; spec details with tabs                 | Kiro spec folders, review, graph, links;           **New spec**                                               |
| **Needs you** | Decisions                                                          | Open decisions                                                                                                |
| **Flow**      | one page                                                           | Lead time, flow efficiency, first-pass rate, time to fix, stacked time bars, bottlenecks                      |
| **Retros**    | Retros, Proposals                                                  | Retrospectives, their proposals and PDCA results                                                              |
| **Activity**  | one page                                                           | The activity log and tick health                                                                              |
| **Settings**  | Workspaces, Repository setup, GitHub, Plugins, Content rules, Flow, Models, Delivery | `.avoozl.json` and machine settings; the repository role, labels, checks and reviews are tabs of each repository |

Flow shows CI minutes; there is no separate CI page.

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

| Tool                    | View                                                     | Buttons (each calls an Avoozl tool) |
| ----------------------- | -------------------------------------------------------- | ----------------------------------- |
| `plans_graph`           | Ready, running, waiting (with blockers), needs you, done | Refresh; open a task's session      |
| `plans_preview`         | Draft graph, critique findings, validation diagnostics   | Approve exact revision              |
| `plans_project_preview` | Issues, sub-issues, and dependency links to be created   | Project                             |
| `plans_decision`        | One open decision with its options                       | Each option                         |

Rules:

- Every write a button makes goes through the same operation and the same
  expected hash or revision as the CLI and page, so a stale view is refused.
- Views show only Avoozl's own data. Issue and pull-request text stays escaped.
- A view is an addition, not the only path: every action also exists as a tool
  the agent can call and in the app page.

**Open (Inferred).** Whether an MCP server shipped inside a Kiro Crew app can be
routed and render views is not documented; proof P8b checks it. If it cannot,
the user adds the same server in Connections and routes it.

**Spike.** A 200-line stdio server and one HTML view render the
spike graph with Start, Accept, Fail, and Reopen buttons over the spike
workspace (`avoozl-crewmode-spike/mcp-app`). **Verified** in a Kiro Crew chat
after the user approved sharing in MCP Management and restarted: the view
renders, and its buttons write and redraw it. Lessons:

- Only the view's own tool should name the `ui://` resource. When the button's
  tool also named it, the write landed but the view never redrew.
- Each click took several seconds because the spike starts the CLI three
  times (about 3 seconds each under load). The real server must call
  operations in-process.
- Reopening a task leaves its done dependents done; dependents not yet
  started wait again.

### 8.2 Set up GitHub wizard

A **Set up GitHub** button in Settings runs one operation, `github.setup`,
also exposed as CLI `avoozl github setup` and MCP tool
`plans_github {action: "setup_preview"}`. It uses the token Avoozl already
reads and stores no new secret (`src/app/github/github-setup.mjs`).

**Flow.** The wizard reads first, builds one plan of writes, shows it, and
writes only after one confirmation.

| #   | Step                         | Reuse when                     | Create when missing |
| --- | ---------------------------- | ------------------------------ | ------------------- |
| 1   | Token                        | Scopes `repo` and `read:org` present | Nothing; shows the fix command |
| 2   | Mode and planning repository | Named repository exists        | Plans-repo mode only: new repository, private |
| 3   | Issues                       | `has_issues` is on             | Turns issues on in the repositories the mode needs |
| 6   | Epic issue type              | Organization has `Epic`        | Created when the organization has issue types and the person may create one |
| 8   | `.avoozl.json`               | None                           | One proposed diff; the person saves it through `github.settings.update` |

**Rules.**

- **Preview, then one confirmation.** The preview lists every GitHub write.
  Nothing is written before the person confirms, and the confirm carries the
  preview's hash: a GitHub change since the preview refuses it.
- **Idempotent.** Each step matches by name and adds only what is missing. A
  second run shows "Nothing to change".
- **Never deletes or renames.** The wizard calls no delete endpoint and never
  changes an existing object's name or visibility.
- **Permission failures.** A step refused for permission is reported with its
  fix, and every step that does not need it still runs. The wizard ends with
  a checklist of what only a person can do on GitHub.

### 8.4 Flow tab and Flow settings

Requirement 48, §4.11. One tab
answers "where does the time go, and what should change". It shows only
graph and delivery timing; pull requests and CI runs stay on GitHub, and
the tab links out to them. The icon is `Gauge` (check that the
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
│   Narrow stops (flow.stopTheLine.scope repo → dependents)  lead time ↓   │
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
  and each span's stage, length, and source.
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

Requirement 68: the Flow tab gains
**Proposals** and **Lessons** views, and Settings › Flow a **Lessons**
sub-group, sketched in §4.18.

Retros is its own nav pill after Flow, with two pages,
**Retros** (every retro, newest first, with its scope, time, model and the
proposals it made) and **Proposals** (§4.18's view, for every proposal). Each
retro links to each of its proposals and each proposal links back. Flow keeps
only its charts (Overview) and has no sub-pages. Flow's sort and filters sit
in the left nav as rows and chips, as Specs' do: sort by newest, lead time or
task; window and stage rows; repository, spec, phase and epic chips with
counts. By day and By week stay on the Over time card. The old Flow Retros
and Proposals links open the new pages. The retro's settings stay in
Settings › Flow. Where §4.18 and §8.4 above say "the Flow tab gets
Proposals", read the Retros pill's Proposals page.

### 8.6 New plan

**New spec** is in the Specs heading and opens a centered modal, starting From a goal.

Requirement 57. The Plans page's New
plan button opens a right drawer. Submit calls `plan.new`, a page-only
operation (agents and MCP are refused). It checks the fields, runs content
rules on the seed at the `brief` boundary, records the request and returns
the seed. The page then opens a chat with the `avoozl-planner` agent in
draft mode. After each tick, a requested folder that lints clean is stored
as a draft plan. A folder that never lints clean stays pending and can be
imported by hand.

The modal starts with Blank or From template, and a template fills the seed
(§4.16).

**Spec Builder hand-off** (Requirement 65). The app holds the grant
`/api/apps/spec-builder/specs`. Kiro Crew matches a
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
6. The steering file asks Spec Builder for `$` fact bullets under each
   item and front-matter defaults (§4.40). Each tick the folder lints and,
   once clean, imports as a draft. Avoozl writes nothing into the folder.

7. A refused create maps to words: `app_disabled` says to turn Spec
   Builder on in Apps; an SDK grant refusal says to approve the update in
   Apps › Updates; both offer the planner chat with the same fields.

### 8.7 Specs: the page's name

Requirement 62. People write
`.kiro/specs/<name>/` folders, and the page says spec wherever a person
reads it. Inside Avoozl the record is a plan.

| Shown to people                                                                                                                      | Kept as is                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Specs tab and heading; New spec, Edit spec, Discuss spec, Delete spec, Archive spec, Unarchive spec, Change spec (was Plan a change) | `plans_*` MCP tools; `plan.*` and `plans.*` operations                                             |
| Spec filters and columns in Dashboard, Graph, Delivery, Flow, Intake and Conflicts                                                   | CLI commands and flags; `.avoozl.json` keys                                                        |
| Drawer, dialog, tooltip, aria and empty-state text; notices; page-shown operation messages                                           | SQLite tables and columns; receipt and marker fields                                               |
| `docs/`, README, shipped skills and agents                                                                                           | The Plans repo mode and its plans repository; `avoozl-planner`; `docs/research/`, `docs/evidence/` |

Plan as a verb stays (**Plan this**, "plan a goal"). The guard is a test
over the page's source: it collects JSX text and string literals,
matches `\bplans?\b` case-blind, and fails on any match not in its
allowlist. Each allowlist entry is one exact string with the reason it
stays, so a new string fails until someone decides.

### 8.9 Searchable pickers

Requirement 73. `Picker.tsx` is one combobox for every
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

Requirement 81. The task drawer's Files fold
(`TaskFiles.tsx`, `files-api.ts`) reads only when first opened.

- **Where.** `task.files` and `task.diff` (`src/app/tasks/task-files.mjs`) find
  the task's `task_worktrees` row. A worktree still on disk is read as is,
  untracked files too; else the branch (`refs/heads/<branch>`, then
  `origin/<branch>`) in the repository's checkout; else `mode: none`. The
  base is the merge base of the head with the integration branch, else the
  base branch. A task with no worktree shows its branch on GitHub.
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
8. Only `AVOOZL_*` and the `avoozl` command work, and an unknown
   top-level settings key fails to load naming the file and key.
9. Clean build from a fresh clone; `npm test` and `git diff --check` pass.
10. App package installs with `kirocrew app install` and passes P15.
11. npm package and signed GitHub release published; Avoozl's own repository
    dogfoods the GitHub loop.
