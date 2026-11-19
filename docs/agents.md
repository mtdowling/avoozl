# Agents and the CLI

Agents reach Avoozl through its MCP server, and people reach it through the
page and the CLI. All three call the same operations, so each one sees the
same state.

```json
{
  "mcpServers": {
    "avoozl": {
      "command": "node",
      "args": ["/path/to/avoozl/cli.mjs", "mcp", "--workspace", "/path/to/plans"]
    }
  }
}
```

Agent sessions in Kiro Crew use the app's `avoozl` MCP server. Any other stdio
MCP client can run the server directly, as above.

## Roles and models

**Settings › Models** picks each role's harness, agent, and model. The roles
are the worker, the falsifier that tests a worker's investigation, the
planner, the plan reviewer, and the retro. The settings are saved as one
`roles` table in `.avoozl.json`:

```json
{
  "roles": {
    "worker": { "harness": "claude-code", "model": "<model>" },
    "retro": { "model": "<model>" }
  }
}
```

A row's `harness` is `kirocrew` for a Kiro Crew chat, or the name of a harness
definition in this machine's config. Only the worker and the falsifier take an
`agent`. A field left out, or set to `auto`, keeps the role's default: its
agent's own model and its repository's executor.

A task's `session` pin wins over its role's row. The worker, planner, and
retro follow the harness. The falsifier and plan reviewer still run as Kiro
Crew chats. Avoozl moves no running chat to another model.

A role's agent and model live only in `roles`. A file that still sets
`delivery.agent`, `delivery.model`, `delivery.investigate.agent`,
`delivery.investigate.model`, or `flow.retro.model` does not load, and the
error names the file and the key.

## MCP tools

The MCP server has one tool per area, and each call names one operation in
its `action` field:

```json
{ "action": "get", "input": { "id": "TASK_ID" } }
```

Access differs by tool:

- `plans_workspace`, `plans_repos` and `plans_plugins` are read only.
- `plans_maintain`, `plans_view`, `plans_plan`, `plans_review`, `plans_task`,
  `plans_session`, `plans_conflicts`, `plans_intake`, `plans_document`,
  `plans_github` and `plans_content` read and write.

Each tool's description lists its actions.

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
- starting or deciding a retro
- **Deliver this** and **Plan this** on an incoming item
- acting on an issue or pull request from the GitHub pages
- opening a code review chat

An agent may pull the Andon cord with `plans_session`, action `stop_line`, but
not resume it. See
[Person-only operations](person-only.md)
for what person-only does and does not guard.

## CLI

In a checkout the CLI is `node cli.mjs`. Help and error text call it
`avoozl`.

```sh
node cli.mjs query --workspace ~/plans --q 'ready:true'
node cli.mjs show TASK_ID --workspace ~/plans
node cli.mjs tick --workspace ~/plans
```

`node cli.mjs help` shows the commands by job, and `help GROUP`,
`help COMMAND`, and `help all` give the usage lines. Choose a workspace with
`--workspace PATH` or `AVOOZL_WORKSPACE`; `status` reports on it. Only
`AVOOZL_*` variables and the `avoozl` command work.

Each task shows its stored `status` and the state the page shows as
`stateLabel`: Ready, Running, Waiting, Needs you, Done, or Deferred. A task
reads Waiting until a checkout is registered under the repository ID it names.
