# Agents and the CLI

Agents reach Avoozl through its MCP server, and people reach it through the
page and the CLI. All three call the same operations, so each one sees the
same state.

```json
{
  "mcpServers": {
    "avoozl": {
      "command": "avoozl",
      "args": [
        "mcp",
        "--workspace",
        "/path/to/plans"
      ]
    }
  }
}
```

Agent sessions in Kiro Crew use the app's `avoozl` MCP server. Any other stdio
MCP client can run the server with `avoozl mcp`, as above. A client that does
not find `avoozl` on its `PATH` takes the full path that `command -v avoozl`
prints.

## Roles and models

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-models-desktop-dark.png">
  <img alt="Settings, Models tab: each role harness, agent and model" src="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-models-desktop-light.png" width="800">
</picture>

**Settings › Models** picks each role's harness, agent, and model. The roles
are the worker, the reviewer, the responder, the check decide call, and the
assistant. The settings are saved as one `roles` table in `.avoozl.json`:

```json
{
  "roles": {
    "worker": {
      "harness": "claude-code",
      "model": "<model>"
    },
    "reviewer": {
      "harness": "kirocrew"
    }
  }
}
```

A row's `harness` is `kirocrew` for a Kiro Crew chat, or the name of a harness
definition in this machine's config. Only the worker takes an `agent`, and
only the worker and the check decide call take a `model`. A field left out,
or set to `auto`, keeps the role's default: its agent's own model and its
repository's executor. A `roles` entry for any other role does not load, and
the error names it.

Avoozl moves no running chat to another model.

## MCP tools

The MCP server has one tool per area, and each call names one operation in
its `action` field:

```json
{
  "action": "get",
  "input": {
    "id": "TASK_ID"
  }
}
```

Access differs by tool:

- `plans_workspace`, `plans_repos` and `plans_plugins` are read only.
- `plans_maintain`, `plans_view`, `plans_plan`, `plans_task`,
  `plans_session`, `plans_conflicts`, `plans_intake`, `plans_document`,
  `plans_github` and `plans_content` read and write.
- `plans_executor` is the Kiro Crew executor's private transport: it takes,
  releases and completes the requests that open and message chats.

Each tool's description lists its actions.

### Narrow tools

A narrow tool runs one operation and takes `{input}` with no `action`. A
role's agent, prompt or brief names the narrow tool it needs, so the role is
granted that one operation and not a grouped tool's other actions:

- a planning chat reads and drafts with `plans_query`, `plans_get_task`,
  `plans_documents`, `plans_get_document`, `plans_get_plan`,
  `plans_create_plan` and `plans_save_plan`;
- a worker uses `plans_prepare_worktree`, `plans_run_checks`, `plans_next`
  (with `claim`), `plans_report` and `plans_land`;
- a reviewer reports with `plans_report`, the responder posts with
  `plans_post_reply`, and the decide chat answers with
  `plans_submit_decide`;
- the skills read with `plans_graph` and `plans_lint`.

`plans_take_task` and `plans_approve_plan` are always refused, because only a
person takes a task by hand or approves a spec.

`avoozl next --claim` and `avoozl land TASK` run the same operations as
`plans_next` and `plans_land` at the command line. `plans_land` and
`avoozl land` land a task at once by its repository's landing mode, and only
a task the caller claimed: the session bound to it, or at the command line a
task this machine claimed or took.

### Person-only actions

Some actions belong to a person, and MCP refuses them under any tool name. Do
these in the Avoozl app:

- approving a spec and publishing its issues
- taking a task by hand, deleting a claim branch, and marking a manual task
  done or reopening it
- plugin changes and answers, epic context, content rule sets and terms,
  reading a matched line, and **Allow once**
- approving or probing a harness, choosing the harness a waiting role runs
  on, and resuming a closed lane
- GitHub setup and settings, including who counts, a high-risk GitHub step,
  merging or releasing a pull request Avoozl opened, and landing an
  integration branch
- letting a held commit's protected paths land
- adding, changing or removing repositories, the workspace repository, or
  intake sources
- workspace, flow, delivery, model, activity and telemetry settings
- **Run anyway**, resuming a pulled stop, and stopping all agents
- **Deliver this**, **Plan this** and confirming changed text on an incoming
  item
- opening a session, sending a message to a process session, deleting a
  report, and rebuilding the workspace

An agent may pull the Andon cord with `plans_session`, action `stop_line`, but
not resume it. See
[Person-only operations](person-only.md)
for what person-only does and does not guard.

## CLI

`npm ci` in a checkout links a global `avoozl` command to it.

```sh
avoozl query --workspace ~/plans --q 'ready:true'
avoozl show TASK_ID --workspace ~/plans
avoozl tick --workspace ~/plans
```

`avoozl help` shows the commands by job, and `help GROUP`,
`help COMMAND`, and `help all` give the usage lines. Choose a workspace with
`--workspace PATH` or `AVOOZL_WORKSPACE`; `status` reports on it.

Each task shows its stored `status` and the state the page shows as
`stateLabel`: Ready, Running, Waiting, Needs you, Done, Deferred, or Draft. A
task reads Waiting until a checkout is registered under the repository ID it
names.
