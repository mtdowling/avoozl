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

**Settings › Models** picks each role's harness, agent, and model. The roles
are the worker, the planner, and the retro. The settings are saved as one
`roles` table in `.avoozl.json`:

```json
{
  "roles": {
    "worker": {
      "harness": "claude-code",
      "model": "<model>"
    },
    "retro": {
      "model": "<model>"
    }
  }
}
```

A row's `harness` is `kirocrew` for a Kiro Crew chat, or the name of a harness
definition in this machine's config. Only the worker takes an
`agent`. A field left out, or set to `auto`, keeps the role's default: its
agent's own model and its repository's executor.

The worker, planner, and retro follow the harness. Avoozl moves no running
chat to another model.

A role's agent and model live only in `roles`. A file that still sets
`delivery.agent`, `delivery.model`, `delivery.investigate`, or
`flow.retro.model` does not load, and the error names the file and the key.

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
- `plans_maintain`, `plans_view`, `plans_plan`, `plans_review`, `plans_task`,
  `plans_session`, `plans_conflicts`, `plans_intake`, `plans_document`,
  `plans_github` and `plans_content` read and write.

Each tool's description lists its actions.

A worker's runner tools are narrow, one operation each: `plans_next` (with
`claim`), `plans_report` and `plans_land`. `avoozl next --claim` and
`avoozl land TASK` run the same operations at the command line. `plans_land`
and `avoozl land` land a task now by its repository's landing mode, and only
a task the caller claimed: the session bound to it, or at the command line a
task this machine claimed or took.

### Person-only actions

Some actions belong to a person, and MCP refuses them under any tool name. Do
these in the Avoozl app:

- approving or starting a spec
- deletes
- plugin changes, **Allow once**, and content rule terms
- choosing a conflict winner
- GitHub setup writes and settings, including who counts
- adding or removing repositories or intake sources
- workspace, flow, and delivery settings
- **Run anyway**, and resuming a pulled stop
- **Deliver this** and **Plan this** on an incoming item
- acting on an issue or pull request from the GitHub pages

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
`--workspace PATH` or `AVOOZL_WORKSPACE`; `status` reports on it. Only
`AVOOZL_*` variables and the `avoozl` command work.

Each task shows its stored `status` and the state the page shows as
`stateLabel`: Ready, Running, Waiting, Needs you, Done, or Deferred. A task
reads Waiting until a checkout is registered under the repository ID it names.
