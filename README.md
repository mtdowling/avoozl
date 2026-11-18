# Avoozl

Approve a spec; Avoozl lands it. It turns the approved revision into ordered
tasks, runs each one with a coding agent in its own worktree, runs the checks
itself on the exact commit, and merges it.

Specs can be any size. A light spec with one task becomes one pull request. A large one becomes ordered tasks across repositories, each checked on its exact commit before it lands. Every change starts from a spec you approved, so no agent's work lands without a plan a person agreed to.

Avoozl runs as a [Kiro Crew](kirocrew-app/README.md) app: a page, a loopback
backend, an MCP server, and a one-minute tick. A spec is a Kiro spec folder.
Execution state lives in a local SQLite workspace. GitHub is optional.

## Install

You need Kiro Crew 0.12.2 or later, as installed (no custom build), Node
22.13 or later (for built-in SQLite), and Git. The GitHub features also need
`gh` signed in, or a token.

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

To update, pull, then run this in the checkout:

```sh
npm run build && kirocrew app update avoozl
```

`kirocrew app update` copies `kirocrew-app` as it is and does not build. A
page left from an older build makes the installed app refuse every request
and say to run that command. A second `kirocrew app install` is refused once
the app is installed.

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

## Demo mode

To show Avoozl to someone without touching your work, choose **Start demo**
in the empty In flight box on Home. It shows only while nothing is in
flight and the workspace has never run a task. It is also on the empty page
when you have no workspace yet. It opens a made-up workspace, Recipe Box, to look
around in. **Exit demo** returns to your own workspace.

While the demo is on, a **Demo** badge shows in the header. Reads work.
Every change only says what it would do, no agent or chat starts, and GitHub
is a fake that writes nothing. **Exit demo** returns to your own workspace,
which the demo never opens. The sample is built once in a folder under your
system temp folder and kept, with any edits, for the next demo.

## Where tasks live

Each repository has a role, chosen in **Settings > Repository setup** (in
**Edit**, or in **Add repository**). The workspace's GitHub mode follows from
the roles and nothing else sets it (`github.mode` in `.avoozl.json` is
derived):

| Role       | Issues live in          | Pull requests land in | Needs a GitHub remote |
| ---------- | ----------------------- | --------------------- | --------------------- |
| `local`    | The workspace database  | The repository        | No                    |
| `code`     | The planning repository | The repository        | Yes                   |
| `planning` | The repository itself   | None                  | Yes                   |
| `both`     | The repository itself   | The repository        | Yes                   |

**Edit** and **Add repository** also offer **Private mirror of a public
repository**, a private copy that the work happens in.

That gives three modes:

| Mode              | `github.mode` | Tasks live in                   | Pull requests     | Who closes issues |
| ----------------- | ------------- | ------------------------------- | ----------------- | ----------------- |
| Local only        | `local`       | The workspace database          | None; local merge | No issues         |
| Plans repository  | `plans-repo`  | Issues in a planning repository | Code repositories | Avoozl            |
| Single repository | `single-repo` | Issues in the code repository   | The same repo     | `Closes #N`       |

Local only is the default. Only a repository with a GitHub remote can take a
role other than `local`. Switching to Local only keeps your GitHub settings
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

On the Specs page, choose **New spec** in the Specs heading. Name it, pick
the repositories in scope, and pick how to start:

- **Blank**: Kiro Crew's Spec Builder writes the spec with you, requirements,
  then design, then tasks, each for you to review. Avoozl offers to add
  `.kiro/steering/avoozl-specs.md` to the repository first, showing its text;
  it holds Avoozl's spec rules, and it is never written over a changed copy.
  Spec Builder must be turned on in Kiro Crew's Apps; when it is off, the
  drawer says so and offers an `avoozl-planner` chat instead.
- **From a goal**: type the goal, and an Avoozl planner chat writes the draft
  spec.
- **From template**: start from a workflow template in an approved plugin.

Once `tasks.md` holds still, Avoozl writes `avoozl/manifest.json` from it and
stores the folder as a draft spec. Nothing is approved or started. Select the
spec, review the lint results and the graph, then choose **Approve
revision**. Approval records the exact revision hash, so a later edit reads
as unapproved until you approve again.

A spec can be as small as one task. With the repository's `landing` set to
`pr` (see [Landing](#landing)), approving a one-task spec sends one pull
request, checked and merged like any other task.

For dependencies across specs, load each referenced spec as a stored draft
first. Preview distinguishes a declared task from an existing approved task.
You approve each spec separately; approval creates only that spec's tasks.
A dependency on a draft owner stays pending and blocks delivery and GitHub
projection until the owning spec is actually approved. An unrelated newer
draft does not erase its last real approval. Retiring an owner restores the
hold; if a dependent is already projected, revise its links before invalidating
the owner so an old ready label cannot authorize work.

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

A local worker needs nothing more: it works in the worktree its brief names
and reports from the command line. Two Kiro Crew steps, each done once, are
for the other chats:

1. Let Kiro Crew tell Avoozl which chat is calling. A worker that opens a
   pull request, and every verifier, reviewer and investigation chat, reports
   with `plans_report`, and Kiro Crew names the caller only to MCP servers
   it shares. Open **MCP Management**, find `avoozl:avoozl`, turn on
   sharing, and press **Approve sharing**. Then restart the gateway
   (**Settings › About › Restart gateway**). Without this, such a chat can do
   its work but `plans_report` refuses it. A shared server runs outside the
   chat sandbox, with your access.

2. After the first tick, open the chat folder **Avoozl** › _repository ID_
   in the sidebar and set its project directory to the checkout. The planner,
   responder and retro chats open there, and the tick opens none of them
   until it is set.

The Avoozl worker codes every task. It runs as a Kiro Crew chat or as a
process harness such as Claude Code or Codex, chosen per role in **Settings >
Models**. Each minute the tick starts a worker session for each ready leaf,
in its own worktree. Every session runs on this machine unless a worker
machine pulls the work (`avoozl worker setup`). When a session reports done, Avoozl runs the checks itself on
the exact commit in a clean worktree, with no model call, then integrates
it and releases the leaf's dependents. A verifier session opens only when a
task's bar needs judgment: prose acceptance with no checks, or
`verify: "agent"`. Implementation, integration, and acceptance stay
separate steps, each with its own record.

### Landing

Avoozl pushes and merges, but only after the checks pass on the exact head
it lands, and it never force pushes, uses `--admin`, or bypasses a required
check or review. Each repository has a `landing` setting:

- `off` (the default until setup writes another): Avoozl pushes nothing. The
  verified commit waits in Needs you.
- `direct`: Avoozl merges the verified work with the current base in a
  landing worktree, checks that exact candidate, and fast-forwards the base
  on the remote. A moved base means a new candidate and new checks.
- `pr`: Avoozl pushes the task branch, opens or reuses one pull request,
  waits for its required checks and reviews on that exact head, and merges.
  Without merge permission it waits for an authorized person to merge.
- `train`: Avoozl pushes each verified task as a batch branch and queues it.
  One integrator stacks the ready branches on the base, validates the stack
  once, and lands it. When the stack fails, it bisects at branch boundaries,
  lands the good branches, and sends the rest back. Use it when one
  validation run is expensive. See
  [integrator trains](docs/integrator-trains.md).

When the base moves and a merge conflicts, or the checks fail, the task goes
back to its worker chat, for at most `landing.conflictRounds` rounds (default
2); after that it goes to Needs you. Stop the line pauses the queue.
`avoozl setup OWNER/REPO --project ID --checks NAME --landing pr|direct|train|off`
previews the repository setup and `--yes` applies it.

To let a Crew Mode conductor claim leaves instead, set
`"delivery": {"runner": "crew-mode"}` and follow
[the app package notes](kirocrew-app/README.md).

Avoozl never replaces a worker only because its activity went quiet. It
checks durable session and delivery records first.

## Deliver through GitHub

Give each repository a role in **Settings > Repository setup**, then use
**Set up GitHub** under **Settings > GitHub**, or **Add repository** and then
**Set up GitHub and import specs** for a new folder. Both
read GitHub first and preview every write (labels, Project fields, issue
types); nothing is written until you confirm. Approved specs become issues,
sub-issues, and blocked-by links, with a Project board as the view. Public and
private repositories both work.

For a mirror, private specs live on its orphan plans branch. Approval pull
requests target that branch.

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
- Plugin approvals, terms files, retro instructions, crews and
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
can override them). The Flow page shows where the time went. Retros and
Proposals are pages of the **Retros** entry in the nav.

- **Timing** is always on. It records each task's time per stage, and token
  and credit counts per stage. It keeps no prompts or text.
- **Stop the line** (`stopTheLine.scope`, default `dependents`; or `repo`,
  `all`): when a check that passed on the base branch fails on a later commit
  and again on one rerun, new dispatch in scope waits and a fix task goes
  first. Running sessions keep going. It resumes when the check passes, or
  when a person presses **Run anyway**.
- **Local checks first** (`localChecksFirst`, default `true`): a session that
  pushes runs the declared checks in its worktree before each push.
- **Batching** has no setting. The planner groups small related leaves in
  the manifest's `batches`, each with a one-line reason. A group runs in one
  session and one worktree, one commit per task, once every task in it is
  ready. Avoozl checks the rules in code (one plan and repository, no edge
  between members, at most 5, an approved revision); a group that breaks one
  runs as single tasks and says why. A failing batch splits.
- **Retro** (`retro.everyTasks`, default `10`; `retro.slowFactor`, default
  `3`): a tool-less `avoozl-retro` session names the biggest slowdown and
  proposes up to three changes. You approve or reject each, and an approved
  change is measured afterward.

**Settings > Models** picks the model of each of Avoozl's own chats: the
planner, the retro and review drafts. It is saved as `models` in
`.avoozl.json`, for example `{"models": {"retro": "<model>"}}`; a role left
out, or `auto`, runs on its agent's own model. Avoozl moves no running chat to another model.

The same page picks the **harness** each role runs on, saved as `harnesses`,
for example `{"harnesses": {"worker": "claude-code"}}`: `kirocrew` is a Kiro
Crew chat, and any other value names a harness definition in this machine's
config. A role left out, or `auto`, runs on its project's executor. A
task's `session.harness` pin wins over both. The worker, planner and retro
follow it; the plan reviewer and review drafts still run as Kiro Crew
chats.

The red **Stop the line** pause icon, in the heading of **Dashboards >
Delivery**, is the Andon cord: a
person, or an agent through MCP, stops new work for everything, one
repository, one spec, or one task, with a one-line reason. Running sessions
keep going. Only a person presses **Resume**.

## Pull request feedback

For each leaf an Avoozl worker codes on a linked branch, the tick reads its
open pull request and sends what is new to the worker that wrote it: failed
checks, changes requested, comments by people Who counts allows, merge
conflicts, and auto-merge turned off. One message per pull request per tick.
Avoozl writes nothing to GitHub here. It is on by default, for at most 5
rounds per leaf; set `delivery.prFeedback` and `delivery.feedbackRounds`, or
use **Settings > Delivery**.

When a pull request's base branch moves and the pull request then conflicts
with it, or falls behind a base that requires branches to be up to date, the
writer gets one message to merge the base branch in with a merge commit.
Avoozl never asks for a force push, and drops any brief or message that does.

## Investigate first, evidence, and who merges

- **Investigate first** (`delivery.investigate`): before it changes a file,
  a worker reports what it read, the cause it believes, the change it plans,
  how it will check it, and how sure it is. A second, read-only chat tries
  to prove that wrong. Coding starts only when both are sure enough
  (`minConfidence`, default `high`) and the findings stand; otherwise the
  task waits in Needs you with **Go ahead**, **Investigate again** and
  **Stop**. `mode` is `not-small` (default), `all` or `off`; a manifest task
  may set `investigate: true` or `false`.
- **Evidence**: each task keeps one bundle under `.avoozl/local/evidence/`
  with its findings, decisions, review verdicts, check results and the
  images or videos (at most 20 MB) the worker attaches. The task drawer shows
  it, and one comment on the pull request holds its text summary.
- **Who merges** (`delivery.ship`): `auto-merge` (default) has the writer turn
  on GitHub auto-merge. `manual` keeps it off and shows **Ready to merge** in
  Needs you when checks and reviews pass; you merge on GitHub, or press
  **Integrate** for a local task. A repository, spec manifest (`ship`) or
  task may set its own. Landing (above) is how Avoozl itself merges.
- **Rules from corrections**: changes requested, work sent back with a
  reason, a revert of an agent's commit, and Pick again with a reason are
  recorded. When the retro sees the same correction on two tasks it may
  propose a rule; once you approve it, it lands as one task that edits
  `.kiro/steering/avoozl-rules.md` in that repository and makes `AGENTS.md`
  point to it, so every chat reads the rules. Avoozl keeps no lessons store of
  its own.
- Flow shows the share of finished tasks that were bug fixes, and
  corrections per week.

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

```sh
node cli.mjs query --workspace ~/plans --q 'ready:true'
node cli.mjs show TASK_ID --workspace ~/plans
node cli.mjs tick --workspace ~/plans
```

Choose a workspace with `--workspace PATH` or `AVOOZL_WORKSPACE`.

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

- MCP tool names that start with `plans_`, including the older
  one-tool-per-operation names. Each of those says `Deprecated:` and names
  its replacement.
- `AVOOZL_*` variables, and the older `AICOMMANDER_*` and `NUPP_WORKSPACE_*`
  names, including `NUPP_WORKSPACE` for the workspace.
- The `aicommander` command, the same CLI as `avoozl`.
- Older fenced-`task` plan files, which stay readable so their work can move
  to spec folders.
- An `.avoozl.json` with no `role` keys, which gets its roles from its
  stored `github.mode`.
- `.avoozl.json` keys of settings that no longer exist (`coder`,
  `routing.remoteRelay`, `flow.batch`), which load and are ignored.
  `node scripts/migrate-routing.mjs <file>` reads old routing keys.

## Develop

Application operations and SQLite storage live in `src/app/`, shared models
in `src/`, and the Kiro Crew page in `kirocrew-app/ui/`. Run `npm test` before
sharing a change; `npm run test:changed` runs only the tests a change reaches, and CI
does the same. The built page is not committed: `npm run build` makes it. Tests use disposable workspaces and make no network or paid
agent calls. `node scripts/release-scan.mjs` checks what the npm and app
packages would contain.

## License

MIT. Bundled third-party code and its licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
