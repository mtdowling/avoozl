# Avoozl

Avoozl turns a goal into a reviewed task graph and delivers it through
[Kiro Crew](kirocrew-app/README.md) sessions. It runs as a Kiro Crew app: a
page, a loopback backend, an MCP server, and a one-minute tick. Its work is
described in Kiro spec folders, called specs on the page. Execution state lives in a local SQLite workspace. GitHub is
optional.

## Install

You need Kiro Crew 0.12.2.3 or later, as installed (no custom build), Node
22.13 or later (for built-in SQLite; Node 26 is tested), and Git. The GitHub
features also need `gh` signed in, or a token. Avoozl was tested on Kiro Crew
0.12.2.3; earlier versions were not tried.

```sh
git clone https://github.com/mtdowling/avoozl.git
cd avoozl
npm ci
npm run build:kirocrew-app
kirocrew app install "$PWD/kirocrew-app"
```

The build writes the page bundle and copies the CLI into
`kirocrew-app/bin/lib`, so the installed app does not depend on this checkout.
Then open Kiro Crew's App Store, review Avoozl's trust request, and enable it.
The trust request asks for these API grants:

| Grant                          | Used for                                                   |
| ------------------------------ | ---------------------------------------------------------- |
| `/apps/avoozl/api/*`           | The app's own backend                                      |
| `/api/chat/slots/avoozl_*`     | Status of the sessions the tick opened, and no others      |
| `/api/usage/turns`             | Token and credit counts per flow stage, for those sessions |
| `/api/models`                  | The model lists in Settings                                |
| `/api/apps/spec-builder/specs` | Handing a new spec to Spec Builder                         |
| `/api/reveal`                  | Showing a spec file in the file browser                    |

An update that adds a grant waits until you approve it. The **Avoozl** page
appears in the sidebar.

To update, pull, rebuild, and run `kirocrew app update avoozl`. A second
`kirocrew app install` is refused once the app is installed.

## Create a workspace

On the Avoozl page, under **Add or initialize a workspace**, enter an ID and
an absolute directory, then choose **Initialize new**. Choose **Add existing**
for a directory that already holds a workspace. The CLI does the same:

```sh
node cli.mjs init ~/plans --name "My plans"
```

A workspace is a directory you own, separate from this checkout:

```text
my-plans/
  .avoozl.json                     portable, reviewable policy
  .avoozl/local/workspace.sqlite   execution state (not committed)
  .kiro/specs/<name>/              plans
```

A new workspace has no tasks, no repositories, and no trigger rules. To add a
fictional example, run
`node cli.mjs seed --workspace ~/plans --example product-launch`. Loading
examples never approves a plan, starts a session, or configures a repository.

## Where tasks live

**Settings > Where tasks live** picks one of three modes (`github.mode` in
`.avoozl.json`):

| Mode              | `github.mode` | Tasks live in                   | Pull requests     | Who closes issues |
| ----------------- | ------------- | ------------------------------- | ----------------- | ----------------- |
| Local only        | `local`       | The workspace database          | None; local merge | No issues         |
| Plans repository  | `plans-repo`  | Issues in a planning repository | Code repositories | Avoozl            |
| Single repository | `single-repo` | Issues in the code repository   | The same repo     | `Closes #N`       |

Local only is the default. Switching to Local only keeps your GitHub settings
in the file, unused, so switching back restores them. In plans-repo mode a
leak screen keeps the planning repository's name out of branches, pull
requests, and comments in the code repositories.

## Specs

Every spec is a Kiro spec folder. Inside Avoozl and in its interfaces
(`plan.*` operations, `plans_*` MCP tools, CLI commands) a spec is stored as a
plan, so those names stay.

```text
.kiro/specs/<name>/
  requirements.md (or bugfix.md)
  design.md
  tasks.md
  avoozl/manifest.json
```

Each checkbox in `tasks.md` has a task ID, and `avoozl/manifest.json` gives
each ID its kind, summary, acceptance, dependencies (`requires`), checks, and
completion level. Avoozl refuses a folder that is missing a file, or a
`tasks.md` with a missing or repeated ID.

On the Specs page, choose **New spec** (or **Plan a goal** in the header).
Fill in the name, the repositories in scope and what you want, then choose
**Open in Spec Builder**. Avoozl offers to add `.kiro/steering/avoozl-specs.md`
to the repository first, showing its text; it holds Avoozl's spec rules, and it
is never written over a changed copy. Kiro Crew's Spec Builder then drafts
requirements, design and tasks, one phase at a time for you to review. Once
`tasks.md` holds still, Avoozl writes `avoozl/manifest.json` from it and stores
the folder as a draft spec. Nothing is approved or started. Spec Builder must
be turned on in Kiro Crew's Apps; when it is off, the drawer says so and offers
an `avoozl-planner` chat instead.
Select the spec, review the lint results and the graph, then choose
**Approve revision**. Approval records the exact revision hash, so a later
edit reads as unapproved until you approve again.

## Deliver locally

Register the Git checkout the work changes, with its base branch, a worktree
directory, and the check commands:

```sh
node cli.mjs project configure code --workspace ~/plans \
  --json '{"root":"/path/to/code","baseBranch":"main","worktreeRoot":"/path/to/worktrees","checks":[["npm","test"]]}'
```

Checkout paths are per machine, so they are kept out of `.avoozl.json`. Then
turn on Autopilot, Avoozl's name for delivery, with the `delivery` block in
`.avoozl.json`:

```json
{ "delivery": { "concurrency": 1 } }
```

Each minute the tick starts a Kiro Crew session for each ready leaf, in its
own worktree. When a session reports done, Avoozl runs the checks itself on
the exact commit in a clean worktree, with no model call, then rebases,
fast-forwards the base branch, and releases the leaf's dependents. A
verifier session opens only when a task's bar needs judgment: prose
acceptance with no checks, or `verify: "agent"`. Avoozl never pushes.
Implementation, integration, and acceptance stay separate steps, each with
its own record.

To let a Crew Mode conductor claim leaves instead, set
`"delivery": {"runner": "crew-mode"}` and follow
[the app package notes](kirocrew-app/README.md).

Avoozl never replaces a worker only because its activity went quiet. It
checks durable session and delivery records first.

## Ideas

An idea is a rough note that can later become a spec. Choose **New idea** on
the Specs page or the Intake tab, give it a title, and add notes and links.
Agents can save ideas too, over MCP (`plans_intake`, action `capture_idea`)
or the CLI (`avoozl intake idea add --title ...`). An idea never runs work:
no trigger rule matches it and it never counts as untriaged.

On the Intake tab, **Ideas** lists them. **Riff on this** opens a chat about
the idea that changes nothing except adding notes and links to it (action
`add_idea_note`). **Make it a spec** opens New spec filled in from the idea,
and the idea is marked as that spec once you send it. Only a person archives,
restores, or makes an idea a spec.

## Deliver through GitHub

Pick a GitHub mode under **Settings > Where tasks live**, then use **Set up
GitHub** there, or **Settings > Repositories > Onboard** for a new folder. Both
read GitHub first and preview every write (labels, Project fields, issue
types); nothing is written until you confirm. Approved specs become issues,
sub-issues, and blocked-by links, with a Project board as the view. Public and
private repositories both work.

Avoozl ships with no trigger rule, so no label starts any work until you add
one. Each rule names an action, a `match` line in GitHub's issue-search
syntax (for example `label:agent:go -label:hold`), and is checked against
**Who counts**: who may give orders with a label, a board drag, or a close.
With nobody named, that is anyone with `write` permission. See
[trigger rules and example policies](docs/policies.md).

Other delivery routes, task trackers, intake sources, content rules, and
settings packs plug in as separate packages that you approve on each
machine. See [writing a plugin](docs/plugins.md).

## One driver per spec

Only one Avoozl drives each approved spec: it alone starts work, writes
GitHub, and merges for it. Every other workspace reads only for that spec
and says why.

- In a GitHub mode, the spec's plan issue names the driver. Its one
  assignee says which person, and a machine claim in Avoozl's marker says
  which of that person's machines. With no assignee, the epic issue's
  assignee counts. With none or several, every workspace reads only and
  one decision opens.
- **Hand off driver** on the spec's page stops new work, lets running chats
  finish, writes an export file to a folder you pick, and links the plan
  issue for you to reassign. Avoozl never reassigns it. The file may hold
  private notes; Avoozl never uploads, commits, or pushes it.
- **Take over** on the other machine takes the export, or rebuilds from
  GitHub when the old machine is gone, and lists what a rebuild loses
  first. **Force take over** assigns the plan issue to you, and asks you to
  type the spec name first. An old driver that comes back reads only.
- Nothing moves the role because a machine went quiet. A task that was
  running on the old driver is "away": it completes from GitHub when its
  pull request merges, or waits for you to start it here.
- Plugin approvals, terms files, router and retro instructions, crews and
  SSH host keys stay on each machine. After a take-over the page lists
  what to set up again.

Limits: assignment is not atomic, so work the old driver started after its
last check, at most one tick's worth, can overlap; it shows as away on the
new driver. In Local only mode the lock is a row in the workspace database:
it guards only instances that open that file or a copy, cannot see another
machine, and has no forced take-over. CLI: `avoozl driver status`,
`avoozl driver handoff`, `avoozl driver takeover --file PATH` or
`--rebuild`, and `--force --confirm SPEC`.

## Flow

**Settings > Flow** holds these, in `.avoozl.json` under `flow` (a repository
can override them). The Flow view shows where the time went.

- **Timing** is always on. It records each task's time per stage, and token
  and credit counts per stage. It keeps no prompts or text.
- **Stop the line** (`stopTheLine.scope`, default `dependents`; or `repo`,
  `all`): when a check that passed on the base branch fails on a later commit
  and again on one rerun, new dispatch in scope waits and a fix task goes
  first. Running sessions keep going. It resumes when the check passes, or
  when a person presses **Run anyway**.
- **Local checks first** (`localChecksFirst`, default `true`): a session that
  pushes runs the declared checks in its worktree before each push.
- **Batching** (`batch.max`, default `3`; `batch.by`, `epic` or `files`):
  ready leaves the plan marks `size: "small"` that share an epic (or files)
  run in one session and one worktree, one commit per task. A failing batch
  splits. `1` turns it off.
- **Retro** (`retro.everyTasks`, default `10`; `retro.slowFactor`, default
  `2`): a tool-less `avoozl-retro` session names the biggest slowdown and
  proposes up to three changes. You approve or reject each, and an approved
  change is measured afterward.

The red **Stop the line** button on the Dashboard is the Andon cord: a
person, or an agent through MCP, stops new work for everything, one
repository, one spec, or one task, with a one-line reason. Running sessions
keep going. Only a person presses **Resume**.

## Routing

The **Routing** page decides which crew, agent, and model run each worker,
checks, and reviewer session. With no rule set, nothing changes: every
session runs on this machine with the agent and model from **Settings >
Delivery**.

- **Rules** (`routing.rules`) match labels, kinds, roles, repositories,
  categories, or paths, and can require or forbid crew tags, keep a task
  local, or pick an agent and model. A tracked `.avoozl.json` cannot pin a
  crew by name; that lives in this machine's settings.
- **Smart pick** (`routing.pick`) scores the crews the rules allow:
  `balanced`, `keep-local`, `spread-out`, or your own weights.
- **Model router** (`routing.router`, off by default) asks a tool-less
  `avoozl-router` session to rank the allowed crews. No answer in time falls
  back to smart pick. When only one crew and one model are left for a task,
  it is assigned with no router call, and Activity says "only one choice".
- **Pick again** makes a task's next attempt choose its agent and model
  afresh.
- **Hand-back**: a remote crew's work comes back either by `push` to the
  repository remote or by `handback`, where this machine fetches the branch
  from the crew's folder over SSH, pinning the host key on first use.
  Avoozl never pushes either way.

Remote crews are not live yet. Until Kiro Crew can open a session on another
instance (Kiro Crew issue #36335), every session runs on this machine;
Preview still shows where tasks would go. Hand-back over SSH is tested only
with a fake `ssh` command.

## Pull request feedback

For each leaf an Avoozl worker codes on a linked branch, the tick reads its
open pull request and sends what is new to the worker that wrote it: failed
checks, changes requested, comments by people Who counts allows, merge
conflicts, and auto-merge turned off. One message per pull request per tick.
Avoozl writes nothing to GitHub here. It is on by default, for at most 5
rounds per leaf; set `delivery.prFeedback` and `delivery.feedbackRounds`, or
use **Settings > Delivery**. Issue Radar's leaves are skipped.

## Agents and the CLI

Agent sessions in Kiro Crew reach Avoozl through the app's `avoozl` MCP
server. Any other stdio MCP client can run it directly:

```json
{
  "mcpServers": {
    "avoozl": {
      "command": "node",
      "args": [
        "/path/to/avoozl/cli.mjs",
        "mcp",
        "--workspace",
        "/path/to/my-plans"
      ]
    }
  }
}
```

The page, the CLI, and MCP call the same operations, so each one sees the
same state. `node cli.mjs help` lists the commands.

### MCP tools

MCP has one tool per thing, each with an `action` field that names one
operation: `plans_workspace` (read only), `plans_maintain`, `plans_view`,
`plans_plan`, `plans_review`, `plans_task`, `plans_session`,
`plans_conflicts`, `plans_intake`, `plans_document`, `plans_github`,
`plans_repos` (read only), `plans_plugins` (read only), `plans_content`, and
`plans_run`. Each tool's description lists its actions. A call looks like
`{"action": "get", "input": {"id": "TASK_ID"}}`.

Some actions belong to a person and are refused over MCP under any tool name,
old or new: approving or starting a spec, deletes, plugin changes, Allow
once and content-rule terms, choosing a conflict winner, GitHub setup writes
and settings (including Who counts), adding or removing repositories or
intake sources, workspace, flow, delivery, and routing settings, Pick again,
Run anyway, resuming a pulled stop, starting or deciding a retro, Deliver
this and Plan this on an incoming item, sending issues to Issue Radar, and
opening a code review chat. Do these in the Avoozl app. An agent may pull
the Andon cord (`plans_session`, action `stop_line`), but not resume it.

The older one-tool-per-operation `plans_*` names stay listed and keep
working. Each description starts with `Deprecated:` and names its
replacement. They stay listed because a Kiro Crew session can call only the
tools its client was shown.

```sh
node cli.mjs query --workspace ~/plans --q 'ready:true'
node cli.mjs show TASK_ID --workspace ~/plans
node cli.mjs tick --workspace ~/plans
```

Choose a workspace with `--workspace PATH` or `AVOOZL_WORKSPACE`.

## What is tested

Receipts are in [docs/evidence/](docs/evidence/). "Fakes" means automated
tests with a fake GitHub, fake sessions, or fake crews, run by `npm test`.

| Feature                                              | Tested                                                |
| ---------------------------------------------------- | ----------------------------------------------------- |
| Local delivery with real Kiro Crew sessions          | Live (P4, P5, P6)                                     |
| Single-repo mode end to end                          | Live, in a test repository (P19, P20)                 |
| Cross-repository edges and rebuild from GitHub       | Live, in test repositories (P9)                       |
| Plans-repo mode and its leak screen                  | Fakes, plus read-only live queries                    |
| Intake list                                          | Fakes, plus a read-only live count (P31)              |
| Plugins, packs, plugin and MCP intake sources        | Fakes only (P26, P32, P35)                            |
| Flow: timing, stop the line, batching, retros        | Fakes only (P30)                                      |
| Andon cord                                           | Fakes only                                            |
| Routing, model router, agent and model per task      | Fakes only (P29, P33); remote crews wait on Kiro Crew |
| Provider health and Switch model                     | Fakes only (P44); Kiro Crew's model change not called |
| One driver per spec, hand off and take over          | Fakes only (P40)                                      |
| Pull request feedback                                | Fakes only (P34)                                      |
| Spec Builder hand-off                                | Fakes only                                            |
| Stacked pull requests, comment steering, Discussions | Fakes only                                            |

## Configuration and secrets

`.avoozl.json` holds portable policy: repositories, GitHub mode and rules,
delivery limits, and agent instructions. It is meant to be committed.
Paths in it are relative to the file. The loader rejects absolute paths and
fields that look like secrets. Keep GitHub credentials in `gh` or your
credential store.

The app backend binds 127.0.0.1 and accepts only requests that the Kiro Crew
gateway signed. Do not expose it.

## Back up

```sh
node cli.mjs backup --workspace ~/plans --output ~/plans-backup.sqlite
```

Back up the spec folders and `.avoozl.json` with it. Use the backup command
rather than copying the database file: SQLite also keeps a WAL file.

## Compatibility

Avoozl was first released as AICommander. These names keep working:

- MCP tool names that start with `plans_`.
- `AVOOZL_*` variables, and the older `AICOMMANDER_*` and `NUPP_WORKSPACE_*`
  names, including `NUPP_WORKSPACE` for the workspace.
- The `aicommander` command, the same CLI as `avoozl`.
- Older fenced-`task` plan files, which stay readable so their work can move
  to spec folders.

## Develop

Application operations and SQLite storage live in `src/app/`, shared models
in `src/`, and the Kiro Crew page in `kirocrew-app/ui/`. Run `npm test` before
sharing a change. Tests use disposable workspaces and make no network or paid
agent calls. `node scripts/release-scan.mjs` checks what the npm and app
packages would contain.

## License

MIT. Bundled third-party code and its licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
