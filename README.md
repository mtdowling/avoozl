# Avoozl

Avoozl turns a goal into a reviewed task graph and delivers it through
[Kiro Crew](kirocrew-app/README.md) sessions. It runs as a Kiro Crew app: a
page, a loopback backend, an MCP server, and a one-minute tick. Plans are Kiro
spec folders. Execution state lives in a local SQLite workspace. GitHub is
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
The trust request asks for two API grants: the app's own `/apps/avoozl/api/*`,
and `/api/chat/slots/avoozl_*`, which lets the app backend read the status of
the sessions its tick opened (Kiro Crew still refuses any session the app does
not own). An update that adds a grant waits until you approve it.
The **Avoozl** page appears in the sidebar.

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

## Plan

Every plan is a Kiro spec folder:

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

In the Plans view, under **Plan a goal**, choose **Open planning draft**. It
opens a chat with a drafted message; add your goal and the repositories in
scope, then send it. The chat runs the `avoozl-planner` agent twice, once to
write the folder and once to critique it; neither can approve or start work.
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
turn on delivery in `.avoozl.json`:

```json
{ "delivery": { "concurrency": 1 } }
```

Each minute the tick starts a Kiro Crew session for each ready leaf, in its
own worktree. When a session reports done, Avoozl runs the checks on a clean
committed head, rebases, fast-forwards the base branch, and releases the
leaf's dependents. Avoozl never pushes. Implementation, integration, and
acceptance stay separate steps, each with its own record.

To let a Crew Mode conductor claim leaves instead, set
`"delivery": {"runner": "crew-mode"}` and follow
[the app package notes](kirocrew-app/README.md).

Avoozl never replaces a worker only because its activity went quiet. It
checks durable session and delivery records first.

## Deliver through GitHub

Choose **Set up GitHub** in Settings. The wizard previews every write (labels,
Project fields, issue types) and applies them only after you confirm. Two
modes are supported:

- **Single-repo**: issues, specs, and pull requests live in one code
  repository. A pull request that says `Closes #N` closes its issue.
- **Plans-repo**: issues and specs live in a planning repository, and pull
  requests go to the code repositories. Avoozl closes the issues.

Approved plans become issues, sub-issues, and blocked-by links, with a
Project board as the view. Public and private repositories both work.

Avoozl ships with no trigger rule, so no label starts any work until you add
one. Each rule names an action, a `match` line in GitHub's issue-search
syntax (for example `label:agent:go -label:hold`), and who may trigger it. See
[trigger rules and example policies](docs/policies.md).

Other delivery routes and task trackers plug in as separate packages that
you approve on each machine. See
[writing a route or tracker plugin](docs/plugins.md).

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
old or new: approving a plan or plugin, Allow once, choosing a conflict
winner, content-rule terms, Who counts and other settings, adding or removing
repositories, GitHub setup writes, and deletes. Do these in the Avoozl app.

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
