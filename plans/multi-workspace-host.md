# Machine-level multi-workspace host

**Status:** Proposed design  
**Date:** November 11, 2026  
**Project:** Avoozl  
**Audience:** Avoozl maintainers and operators

## Summary

Avoozl should run once per computer and host every product workspace used on
that computer. The OpenHands extension connects to that one machine-level
service and provides a workspace switcher. Each workspace retains its own
plans, tasks, Driver, Queue, repositories, policies, runs, leases, history, and
portable collaboration state.

The host uses SQLite at two levels:

- one small machine catalog database records registered workspaces and
  host-level lifecycle state;
- every workspace keeps its own SQLite database under its machine-local
  `.avoozl/local/` directory.

This is one application, not one database. Separate workspace databases make
isolation structural: importing, restoring, stopping, deleting, corrupting, or
raising a workspace-scoped andon incident in one product cannot silently alter
another product. The catalog supplies discovery and aggregate status without
becoming another copy of task state.

A workspace has one planning root and any number of repositories. A repository
may provide plans, editable code, GitHub Queue intake, label-authorized work, or
any combination of those roles. The normal UI exposes only **Workspaces** and
**Repositories**. Terms such as "execution project" and "monitored repository"
remain internal compatibility concepts.

The existing single-workspace mode remains supported. `avoozl serve
--workspace PATH` continues to serve exactly one workspace. Running `avoozl
serve` without that option starts the machine host and every enabled registered
workspace.

## Product decisions

This plan makes the following decisions:

1. Run one Avoozl daemon per computer.
2. Connect one OpenHands Agent Server and Canvas extension to that daemon.
3. Keep one catalog SQLite database and one SQLite database per workspace.
4. Give every workspace a stable portable ID and a machine-local registration.
5. Give every operation an explicit or session-bound workspace.
6. Keep one Driver conversation per workspace.
7. Allow one planning root and many repositories per workspace.
8. Treat repository capabilities as settings, not separate user-facing object
   types.
9. Preserve single-workspace CLI, HTTP, MCP, and environment compatibility.
10. Never place credentials, transcripts, worktrees, leases, or databases in
    shared configuration.

## Terminology

### Host

The machine-level Avoozl process. It owns:

- the listen address;
- OpenHands connectivity;
- the workspace registry;
- workspace process lifecycle;
- aggregate health and notifications;
- selection of the default workspace.

The host does not own task status, plans, runs, or approvals.

### Workspace

One product or coordinated program. It owns:

- a stable workspace ID;
- one planning root;
- one isolated SQLite database;
- plans, tasks, dependencies, approvals, evidence, and receipts;
- one Driver conversation;
- repositories and their local bindings;
- Queue sources and GitHub policies;
- agent runs, leases, worktrees, batches, and andon incidents.

Workspaces are the isolation boundary. Unrelated products should not share a
workspace merely because one person maintains both.

### Repository

A Git or GitHub repository associated with a workspace. A repository may have
any of these capabilities:

- `planning`: contributes Markdown designs and plans;
- `editable`: has a local checkout where agents may create worktrees;
- `queue`: contributes issues and pull requests to Queue;
- `issueAuthorization`: permits reviewed issue labels to authorize work;
- `publication`: receives planning documents, generated state, or code changes.

The UI presents one repository record with these capabilities. It does not ask
users to separately create an execution project and a monitored repository.

### Instance

One running host on one computer. A person's laptop and desktop are different
instances even if they register the same portable workspace.

### OpenHands

The agent runtime and conversation UI shared by the host. OpenHands
conversations are always bound to one workspace and, when executing code, one
repository.

## Goals

- Operate unrelated products in isolation through one local service.
- Share one OpenHands installation without sharing Driver context between
  products.
- Switch workspaces without changing ports or reconnecting the extension.
- Show aggregate local work without merging task graphs.
- Keep repository setup understandable in the UI.
- Preserve all existing single-workspace behavior.
- Start, stop, back up, restore, and migrate one workspace independently.
- Prevent task IDs, events, runs, claims, settings, and automation from leaking
  across workspaces.
- Support a planning-only workspace, a single-repository workspace, and a
  planning repository coordinating many code repositories.
- Preserve GitHub-backed multi-computer and team coordination.
- Keep secrets and machine-local paths out of portable state.

## Non-goals

- Combining unrelated task graphs into one global graph.
- Sharing one SQLite database between computers.
- Running a centralized team Avoozl service.
- Moving raw OpenHands transcripts between workspaces.
- Letting a global Driver mutate every workspace.
- Treating aggregate search as authority to perform an operation.
- Automatically registering every Git checkout found on a computer.
- Allowing the same local checkout to be edited concurrently by two
  workspaces.
- Replacing GitHub-backed team claims with the local catalog.

## Example topology

One machine may host:

```text
Avoozl host
├── language workspace
│   ├── planning repository
│   ├── compiler repository
│   └── runtime repository
└── avoozl workspace
    └── avoozl repository
        ├── planning
        ├── editable code
        └── GitHub Queue
```

The workspaces have separate Drivers, task IDs, databases, Queue policies, and
agent runs. They share only the host, OpenHands installation, provider
availability, and machine identity.

## Configuration and files

### Global configuration

The host resolves its configuration directory using platform conventions:

- `$XDG_CONFIG_HOME/avoozl`, defaulting to `~/.config/avoozl`, on Unix;
- the equivalent per-user application configuration directory on Windows.

`config.json` is machine-local and contains no credentials:

```json
{
  "$schema": "https://avoozl.dev/schema/host-config-v1.json",
  "version": 1,
  "host": "127.0.0.1",
  "port": 9428,
  "defaultWorkspace": "language",
  "workspaces": {
    "language": {
      "root": "/home/user/work/language-plans",
      "enabled": true,
      "repositories": {
        "compiler": "/home/user/work/compiler",
        "runtime": "/home/user/work/runtime"
      }
    },
    "avoozl": {
      "root": "/home/user/work/avoozl",
      "enabled": true,
      "repositories": {
        "avoozl": "/home/user/work/avoozl"
      }
    }
  }
}
```

The registry contains local paths because it is never published. The Driver
may edit it through the same schema-validated configuration operation used by
Settings.

### Host state

The host state directory follows platform conventions:

- `$XDG_STATE_HOME/avoozl`, defaulting to `~/.local/state/avoozl`, on Unix;
- the equivalent per-user application state directory on Windows.

It contains:

- `catalog.sqlite`;
- host PID and lifecycle records;
- non-secret aggregate caches;
- host logs when file logging is enabled.

The catalog does not copy task bodies, plan prose, transcripts, or workspace
event streams.

### Workspace configuration

Each planning root may contain a committed `.avoozl.json`:

```json
{
  "$schema": "https://avoozl.dev/schema/repository-config-v1.json",
  "version": 1,
  "repository": {
    "id": "language-plans",
    "roles": ["planning"],
    "baseBranch": "main"
  },
  "planning": {
    "documents": ["plans/**/*.md"]
  }
}
```

This file contains shareable, non-secret choices:

- stable repository IDs and roles;
- planning directories;
- normalized label behavior;
- validation commands;
- review and acceptance policy;
- portable conversation and automation policy.

Each code repository may carry its own `.avoozl.json`. The machine host binds
those repositories into a workspace and records local checkout paths outside
the committed files.

### Workspace state

Machine-local workspace state remains under:

```text
.avoozl/local/
├── workspace.sqlite
├── agent-host.json
├── handoffs/
├── locks/
└── caches/
```

The entire `.avoozl/local/` directory is globally ignored by Git. Portable
planning state is published through the configured workspace repository, not
by committing SQLite.

### Precedence

Configuration resolves in this order:

1. explicit CLI arguments;
2. process environment;
3. machine registry and local repository bindings;
4. workspace `.avoozl.json`;
5. global non-secret defaults;
6. application defaults.

Local layers may bind paths and select credentials by secret name. They may
not silently weaken committed authorization or acceptance policy.

## Storage architecture

### Catalog database

`catalog.sqlite` contains:

- registered workspace ID, root, enabled state, and display order;
- last observed workspace revision and health;
- host-level OpenHands connection status;
- aggregate unread, running, blocked, and review counts;
- migration and registration receipts;
- host-level notification acknowledgements.

The catalog may be deleted and rebuilt by opening every registered workspace.
It is an index, not authority for workspace transitions.

### Workspace databases

Every workspace retains the existing Avoozl schema in its own database. Stable
task IDs only need to be unique within that workspace. Existing stores,
migrations, backups, integrity checks, event ordering, and revision
compare-and-swap behavior continue unchanged.

The host opens stores lazily and keeps a bounded least-recently-used pool of
idle read connections. A workspace with an active Driver, run, watcher,
protected operation, or event subscriber remains open.

### Why not one task database

One database would require adding `workspace_id` to every table, primary key,
index, foreign relationship, receipt, event, and query. Missing one predicate
could expose or mutate another product.

Separate databases provide:

- independent backup and restore;
- independent schema migration and recovery;
- no global SQLite writer contention;
- structural task-ID isolation;
- simpler deletion and re-registration;
- workspace-scoped corruption and andon behavior;
- direct reuse of the current Store and compatibility tools.

### Why not a graph database

Avoozl's authoritative workload is transactional. Tasks, runs, approvals,
claims, receipts, settings, Queue items, and events are records with strict
state transitions. Dependencies are represented by an edge table and queried
with recursive SQL.

A graph database would add a second storage model without replacing the
transactional tables. SQLite remains authoritative. If future graph analytics
outgrow recursive queries, Avoozl may build a disposable graph projection from
workspace revisions.

## Host architecture

### `WorkspaceManager`

The server introduces a `WorkspaceManager` above the existing workspace
runtime:

```text
Host
├── CatalogStore
├── WorkspaceManager
│   ├── WorkspaceRuntime A
│   │   ├── Store
│   │   ├── Operations
│   │   ├── AgentManager
│   │   └── GitHub intake
│   └── WorkspaceRuntime B
│       ├── Store
│       ├── Operations
│       ├── AgentManager
│       └── GitHub intake
└── OpenHands connection
```

`WorkspaceRuntime` retains the current single-workspace behavior. The host
adds selection, routing, lifecycle, and aggregate observation rather than
turning the Store into a multi-tenant abstraction.

### Runtime states

A registered workspace has one host state:

- `closed`: registered but no resources are open;
- `opening`: configuration and database are being validated;
- `ready`: operations may be routed;
- `draining`: new execution is refused while active work reaches a boundary;
- `stopped`: explicitly disabled until started;
- `degraded`: read-only observation is available but a required dependency
  failed;
- `quarantined`: identity, path, schema, or ownership validation failed.

Opening is idempotent. Concurrent requests share the same opening promise and
cannot create duplicate managers or agent hosts.

### Identity and path validation

On registration and every open, the host verifies:

- the root exists and is a directory;
- `.avoozl.json` is a regular file when present;
- the portable workspace ID matches the registry;
- local repository bindings resolve to expected Git repositories;
- no editable checkout is bound to another active workspace;
- the database and parent directories are not symlinks;
- configuration passes the published JSON Schema;
- database ownership is not held by another live Avoozl process.

Failure quarantines only that workspace.

## HTTP and event routing

New routes are workspace-qualified:

```text
GET  /api/workspaces
GET  /api/workspaces/:workspaceId
POST /api/workspaces/:workspaceId/operations/:operation
GET  /api/workspaces/:workspaceId/events
GET  /api/workspaces/:workspaceId/health
```

Existing routes such as `/api/state`, `/api/operations/*`, `/mcp`, and
`/database.json` continue to target the configured default workspace.

Every response includes:

- `workspaceId`;
- workspace revision when applicable;
- host instance ID;
- workspace instance epoch.

Event cursors are scoped by workspace. A cursor from one workspace is rejected
when presented to another.

The browser client keeps a separate cursor, selection, filters, open task, and
last-viewed page for every workspace.

## MCP scoping

An MCP connection is bound to one workspace during initialization. Existing
`plans_*` tools preserve their names and do not require agents to repeat a
workspace ID on every call.

The host exposes:

- a host-level discovery server with read-only workspace listing and
  selection;
- one logical workspace MCP endpoint per workspace;
- conversation capabilities bound to the selected workspace ID and epoch.

A capability minted for one workspace is invalid in every other workspace,
even if task or repository IDs match.

Run-scoped deny-by-default policy remains workspace-local. Registering a new
workspace never grants existing conversations access to it.

## OpenHands and Canvas

### Installation

The Avoozl Canvas extension is installed once. It stores one host URL, not one
URL per workspace. OpenHands agent profiles and provider credentials remain
machine-level.

### Workspace switcher

The Avoozl navigation begins with a workspace switcher that shows:

- workspace name and icon;
- running session count;
- blocked or andon state;
- review count;
- health state.

Switching changes the Avoozl planning surface but does not navigate or mutate
the active OpenHands conversation. Attaching a session explicitly opens the
conversation associated with that workspace.

On small screens, the switcher becomes an icon and current-workspace menu.

### All-workspaces view

The host provides a compact aggregate page showing:

- in-flight sessions;
- work needing review;
- blocked work and incidents;
- Queue counts;
- workspace health.

It contains links, not cross-workspace mutation controls. Starting, accepting,
integrating, resolving, or resuming work always occurs after entering the
workspace.

### Driver

Every workspace owns one persistent Driver lineage. Driver configuration,
history, compaction, handoff, model selection, and child conversations are
scoped to that workspace.

There is no omnipotent global Driver. From the aggregate page, **Chat** first
selects a workspace. This prevents accidental disclosure of one product's
plans or repository content to another Driver.

Changing the active workspace never injects context into an existing Driver
conversation.

## Repository experience

Settings shows **Repositories** inside the selected workspace. Adding one
repository opens a single form:

- GitHub repository;
- optional local checkout;
- contributes plans;
- monitor issues;
- monitor pull requests;
- permit label-authorized work;
- custom label mappings;
- base branch and required checks.

From those choices Avoozl creates the internal execution, Queue, planning, and
authorization records transactionally.

A repository may be remote-only. It appears in Queue but cannot start editable
work until a local checkout is connected.

A repository may be local-only. Agents can work in it, but Avoozl does not
poll or publish GitHub state.

Removing a repository refuses while it owns active runs, leases, worktrees,
open integration records, or unresolved incidents. Disabling monitoring does
not remove the execution binding.

## GitHub intake and automation

Every watcher, capability, snapshot, Queue item, claim, issue association, and
automation installation records the workspace ID.

An OpenHands watcher sends snapshots to:

```text
/api/workspaces/:workspaceId/github-intake
```

Its capability binds:

- host instance;
- workspace ID and instance epoch;
- repository node ID;
- observation or authorization mode;
- expiry and revocation state.

The host rejects a valid capability presented to the wrong workspace.

One GitHub repository may normally belong to only one active workspace on a
machine. A read-only duplicate requires an explicit override and can never
authorize or dispatch work.

## Execution and worktrees

Every run records:

- workspace ID;
- task ID;
- repository ID;
- local checkout identity;
- branch and worktree;
- Driver or parent conversation;
- provider and model;
- workspace instance epoch.

Worktree roots are unique per workspace and repository. A workspace cannot
reuse another workspace's worktree merely because branch names match.

The host-wide concurrency limit is applied after workspace policy:

1. the workspace selects dispatchable work;
2. workspace concurrency and andon gates apply;
3. the host scheduler allocates a machine slot fairly;
4. the workspace creates the run and worktree.

The scheduler uses bounded weighted round-robin so one busy workspace cannot
starve every other workspace. Explicit user-started work may receive priority
without bypassing workspace authorization.

## Lifecycle and CLI

### Host commands

```text
avoozl serve
avoozl status
avoozl stop
avoozl workspace list
avoozl workspace add ID --root PATH
avoozl workspace remove ID
avoozl workspace start ID
avoozl workspace drain ID
avoozl workspace stop ID
avoozl workspace set-default ID
```

`workspace remove` unregisters the workspace. It does not delete its repository
or SQLite database.

### Scoped commands

Existing commands accept `--workspace ID` when running through the host:

```text
avoozl query --workspace language
avoozl show TASK --workspace avoozl
avoozl backup --workspace language --output FILE
```

For compatibility, an absolute path remains accepted. If a path matches a
registered workspace, the host uses its stable ID.

### Compatibility mode

```text
avoozl serve --workspace PATH
```

continues to start one standalone workspace using its repository configuration
for host and port. This mode is intended for tests, recovery, portable
development, and gradual migration.

## Isolation invariants

1. Every policy-bearing operation resolves exactly one workspace before
   reading task state.
2. A task ID is meaningful only with its workspace ID.
3. No workspace database contains another workspace's task, run, event,
   approval, receipt, capability, or Driver record.
4. Host aggregation is read-only and non-authoritative.
5. A capability from one workspace is invalid in another.
6. A workspace-scoped andon incident cannot be cleared from the aggregate
   host surface.
7. One workspace migration or restore never writes another database.
8. Disabling or removing a workspace never deletes its database.
9. Repository paths and credentials never enter portable configuration.
10. A default workspace is a compatibility selection, not implicit global
    authority.

## Security

The host remains loopback-only by default. Remote access uses the trusted VPN
and authentication boundary chosen for OpenHands; opening the listen address
requires explicit configuration.

Global and workspace configuration reject secret-like property names and
inline credentials. Provider keys, GitHub authentication, OpenHands tokens,
cookies, and automation secrets remain in their owning secret stores.

The workspace ID from an HTTP path is untrusted input. The host resolves only
registered IDs and never converts arbitrary URL segments into filesystem
paths.

Workspace registration requires an explicit local action. Git content cannot
register another checkout, change the host listen address, or bind an
unreviewed local path.

## Backup, restore, and portability

Backups are workspace-specific:

```text
avoozl backup --workspace ID --output FILE
```

The catalog may optionally be backed up, but restoring it cannot restore task
state.

Restoring a workspace:

1. drains that workspace;
2. verifies no active protected operations;
3. backs up the current database;
4. validates the incoming database and workspace identity;
5. advances the workspace instance epoch;
6. atomically replaces the database;
7. rebuilds catalog aggregates;
8. leaves the workspace stopped until explicitly resumed.

Portable Git synchronization remains per workspace. Registering the same
portable workspace on another computer creates a new local database and
machine identity, then hydrates reviewed shared state. It never copies the
catalog or local leases.

## Failure handling

### One workspace fails to open

The workspace becomes quarantined. Other workspaces and OpenHands remain
available. The aggregate page shows a repair action.

### Catalog is unavailable

The host refuses registration changes and protected aggregate actions.
Already-open workspaces may continue through their direct qualified routes.
The catalog can be rebuilt from the global configuration and workspace health.

### OpenHands is unavailable

Planning, Queue inspection, local state, and deterministic checks remain
available. New agent runs fail without affecting other workspace state.

### Duplicate host

Workspace database ownership fencing prevents two local host processes from
opening the same workspace for mutation. A read-only recovery command may
inspect it explicitly.

### Configuration changes while active

Non-structural display changes reload immediately. Root, workspace ID,
database, repository binding, OpenHands endpoint, or worktree-root changes
require that workspace to drain and reopen.

### Workspace removed while selected

The UI moves to the default workspace or the workspace picker. Existing
OpenHands conversations remain readable, but their Avoozl capabilities are
revoked.

## Migration

### Existing single workspace

The first machine-host startup:

1. discovers an explicitly supplied current workspace;
2. reads its existing `.avoozl.json`;
3. adds a stable `workspaceId` if absent through an explicit reviewed edit;
4. registers the root and current repository bindings globally;
5. leaves the existing SQLite database in place;
6. sets it as the default workspace;
7. verifies revision, task, document, plan, run, and approval counts;
8. starts through `WorkspaceManager`;
9. records a migration receipt in the catalog and workspace.

No task rows are copied during this migration.

### Existing Canvas connection

Canvas keeps the same Avoozl URL. After upgrade it receives the workspace list
and opens the default workspace. Its former page, filters, and task selection
are stored under that workspace ID.

### Existing CLI and MCP clients

Unqualified clients continue to use the default workspace. The UI warns when
more than one workspace exists and an interactive command omits scope, but
scripts preserve compatibility.

Run-scoped MCP connections remain bound to the workspace from which they were
created. They do not follow later default-workspace changes.

## Implementation plan

### Increment 1: host configuration and catalog

```task
{
  "id": "multi-workspace-catalog",
  "project": "avoozl",
  "title": "Add the machine workspace registry and catalog",
  "summary": "Create schema-validated global configuration and a rebuildable SQLite catalog for registered workspace discovery and health.",
  "acceptance": [
    "Global configuration resolves through platform-appropriate paths and contains no secrets.",
    "Workspace add, list, remove, enable, disable, and default selection are atomic and auditable.",
    "The catalog stores aggregates and lifecycle metadata but no authoritative task or plan state.",
    "Deleting the catalog and rebuilding it preserves every workspace database.",
    "Path, symlink, duplicate-ID, duplicate-checkout, and schema validation fail closed."
  ],
  "requires": []
}
```

### Increment 2: workspace manager

```task
{
  "id": "multi-workspace-manager",
  "project": "avoozl",
  "title": "Host isolated workspace runtimes in one process",
  "summary": "Wrap the existing Store, Operations, AgentManager, and intake services in a lifecycle-managed WorkspaceRuntime selected by WorkspaceManager.",
  "acceptance": [
    "Two workspaces with identical task IDs operate without collision.",
    "Opening, draining, stopping, reopening, and quarantining one workspace does not affect another.",
    "Workspace databases retain the existing schema and migration behavior.",
    "Concurrent opens create one runtime and one ownership lease.",
    "Idle stores close safely while active runs, subscribers, or protected operations keep their workspace open."
  ],
  "requires": ["multi-workspace-catalog"]
}
```

### Increment 3: qualified HTTP and compatibility routing

```task
{
  "id": "multi-workspace-http",
  "project": "avoozl",
  "title": "Route HTTP and event streams by workspace",
  "summary": "Add workspace-qualified API, event, health, and intake routes while preserving default-workspace compatibility URLs.",
  "acceptance": [
    "Every qualified response identifies its workspace and instance epoch.",
    "Event cursors cannot cross workspaces.",
    "Unqualified routes target only the configured default workspace.",
    "Changing the default does not retarget existing run or MCP capabilities.",
    "HTTP isolation and malicious workspace-ID tests pass."
  ],
  "requires": ["multi-workspace-manager"]
}
```

### Increment 4: MCP isolation

```task
{
  "id": "multi-workspace-mcp",
  "project": "avoozl",
  "title": "Bind MCP sessions and capabilities to one workspace",
  "summary": "Preserve existing plans_* tools while routing each connection through an immutable workspace binding.",
  "acceptance": [
    "Existing plans_* names remain compatible.",
    "Workspace discovery is read-only and cannot grant access.",
    "Run-scoped tokens fail in every workspace except their origin.",
    "Task ID collisions cannot expose cross-workspace context.",
    "Default-workspace changes do not alter an established MCP session."
  ],
  "requires": ["multi-workspace-http"]
}
```

### Increment 5: Canvas workspace experience

```task
{
  "id": "multi-workspace-canvas",
  "project": "avoozl",
  "title": "Add workspace switching and aggregate status to Canvas",
  "summary": "Connect Canvas once to the machine host and provide isolated workspace navigation plus a read-only all-workspaces overview.",
  "acceptance": [
    "The workspace switcher works on desktop, phone, keyboard, and screen reader.",
    "Page, filters, selection, and event cursor are remembered independently per workspace.",
    "Aggregate status links into a workspace before any mutation.",
    "Switching never attaches or injects context into an OpenHands conversation.",
    "A quarantined workspace cannot crash or black out the rest of the extension."
  ],
  "requires": ["multi-workspace-http"]
}
```

### Increment 6: repository simplification

```task
{
  "id": "multi-workspace-repositories",
  "project": "avoozl",
  "title": "Unify repository setup within each workspace",
  "summary": "Replace separate project and monitored-repository setup with one repository model whose capabilities configure planning, execution, Queue, and authorization.",
  "acceptance": [
    "One form configures GitHub identity, local checkout, planning, Queue, authorization, labels, branch, and checks.",
    "Remote-only and local-only repositories have clear supported behavior.",
    "Existing project and GitHub records migrate transactionally without changing task provenance.",
    "The same editable checkout cannot be active in two workspaces.",
    "Settings edits the shared and machine-local configuration layers explicitly."
  ],
  "requires": ["multi-workspace-manager"]
}
```

### Increment 7: Drivers, runs, automation, and scheduling

```task
{
  "id": "multi-workspace-execution",
  "project": "avoozl",
  "title": "Scope Drivers and execution to workspaces",
  "summary": "Give each workspace an independent Driver lineage, Queue intake, OpenHands capabilities, agent runs, worktrees, leases, and fair host scheduling.",
  "acceptance": [
    "Every Driver and child conversation records one immutable workspace ID.",
    "GitHub watcher snapshots and capabilities cannot cross workspace boundaries.",
    "Branches, worktrees, runs, leases, and archived sessions remain workspace-scoped.",
    "Host concurrency is shared fairly without bypassing workspace policy.",
    "A workspace andon incident blocks only matching work unless a host incident is separately raised."
  ],
  "requires": [
    "multi-workspace-mcp",
    "multi-workspace-repositories",
    "multi-workspace-canvas"
  ]
}
```

### Increment 8: single-workspace migration

```task
{
  "id": "multi-workspace-migration",
  "project": "avoozl",
  "title": "Migrate existing installations without copying task data",
  "summary": "Register existing workspace roots and databases under the machine host while preserving standalone compatibility and exact state counts.",
  "acceptance": [
    "Migration leaves the existing workspace database in place.",
    "Tasks, documents, edges, plans, approvals, runs, events, and receipts match before and after.",
    "Canvas, CLI, HTTP, MCP, environment aliases, and standalone serve remain compatible.",
    "Migration can be retried without duplicate registry or task records.",
    "Rollback can reopen the original single-workspace mode."
  ],
  "requires": [
    "multi-workspace-execution"
  ]
}
```

### Increment 9: dogfood two isolated workspaces

```task
{
  "id": "multi-workspace-dogfood",
  "project": "avoozl",
  "title": "Operate two products through one Avoozl host",
  "summary": "Register one multi-repository product workspace and Avoozl's own repository as a separate workspace, then prove isolation and normal daily operation.",
  "acceptance": [
    "Both workspaces appear through one Canvas extension and one host URL.",
    "Avoozl's repository supplies its own plans, tasks, Queue, Driver, runs, and history.",
    "The product workspace retains its existing planning and code repositories unchanged.",
    "Identical task IDs, concurrent runs, watcher snapshots, and Driver chats remain isolated.",
    "Stopping, backing up, restoring, or raising an incident in one workspace leaves the other usable.",
    "No credentials, transcripts, SQLite files, local paths, or personal planning state are committed."
  ],
  "requires": [
    "multi-workspace-migration"
  ]
}
```

## Acceptance matrix

| Scenario | Expected result |
| --- | --- |
| Two workspaces contain task `build` | Both resolve independently |
| One database fails integrity check | Only that workspace quarantines |
| Default workspace changes | Existing runs and MCP sessions remain bound |
| Same GitHub repository added twice | Second editable binding is refused |
| Same repository observed read-only twice | Explicit override required; no authorization |
| Workspace watcher calls another intake URL | Capability is rejected |
| One workspace has an active andon incident | Other workspaces continue |
| Host restarts during two active runs | Each runtime recovers only its own runs |
| One workspace is restored | Its epoch advances; other revisions do not |
| Catalog is deleted | Rebuild discovers workspaces without task loss |
| Canvas switches workspace | No conversation is attached automatically |
| Aggregate page starts an action | User is routed into the workspace first |
| Standalone serve is used | Existing single-workspace behavior remains |

## Validation

Every increment must run:

- isolated temporary workspace tests;
- two-workspace collision and leakage tests;
- database migration and restart tests;
- HTTP and MCP capability-boundary tests;
- OpenHands conversation-binding tests;
- GitHub watcher routing tests;
- Canvas desktop and responsive tests;
- `npm test`;
- `git diff --check`.

Tests must never use real workspace databases, provider credentials,
transcripts, personal plans, or public repository mutations.

## Relationship to team coordination

This plan governs multiple local products on one computer. The GitHub-backed
team coordination design governs multiple people and computers participating
in one portable workspace.

They compose as follows:

- the host selects a local workspace;
- the workspace's GitHub coordination state selects a person;
- its machine epoch selects one of that person's computers;
- its local lease selects one active process and run.

The catalog is never a team lock service and is never published.

## Relationship to the andon cord

The andon design retains task, repository, and workspace scopes. A later
host-scoped incident may stop new execution across every workspace when the
machine or shared OpenHands installation is unsafe.

A workspace incident cannot be resolved from the aggregate host page. Routine
workspace switching, computer handoff, draining, and stopping do not raise an
andon incident.

## Final product shape

Installation and normal use become:

```text
npx avoozl install
avoozl workspace add product --root ~/work/product-plans
avoozl workspace add avoozl --root ~/work/avoozl
avoozl serve
```

The user opens OpenHands once, selects Avoozl, and switches between isolated
workspaces. Each workspace looks like a complete Avoozl product. The host makes
them discoverable and operable from one place without turning unrelated work
into one shared database or one shared agent context.
