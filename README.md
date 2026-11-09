# AICommander

Plans, tasks, and agents in one local workspace. Use the website, CLI, or MCP to work with the same plans and execution state.

```sh
git clone https://github.com/mtdowling/aicommander.git
cd aicommander
npm ci --ignore-scripts
node cli.mjs init ../my-plans --name "My plans"
node cli.mjs serve --workspace ../my-plans
```

Open [localhost:9428](http://127.0.0.1:9428/). Node 22.13 or later is required for its built-in SQLite support; Node 26 is tested. Planning and browsing work without an agent account. Managed agents use your installed provider and its own authentication.

![An example product launch in AICommander](docs/example-workspace.png)

## Start empty or load examples

New workspaces contain no tasks or example plans. Add a task, write a proposal, or choose **Load examples** in the empty workspace or Settings.

```sh
node cli.mjs seed --workspace ../my-plans --example product-launch
```

The fictional product launch includes two epics, eight tasks, dependencies, a design document, an unapproved proposal, three saved views, and a walkthrough. Loading it again preserves changes and creates no duplicates. It never configures a repository, launches an agent, or approves the draft. Example tasks carry an `example` tag. They are ordinary editable tasks after loading.

CLI, UI, and MCP all call the same `workspace.seed` operation. MCP clients can list packs with `plans_examples` and load a requested pack with `plans_seed_example`, using `{"input":{"example":"product-launch"}}`. Managed worker connections cannot seed their own workspace.

## Keep code and data separate

The application checkout contains reusable software and example fixtures. Each workspace has its own configuration, state, and design files:

```text
my-plans/
  workspace.json
  state/workspace.sqlite
  plans/
```

SQLite owns live tasks, dependencies, evidence, approvals, conversations, and agent state. Markdown owns design prose. `/database.json` is an export of current state, not a file to edit.

Choose a workspace with `--workspace PATH` or `AICOMMANDER_WORKSPACE`. Configuration paths are relative to that workspace, so moving an ordinary workspace preserves them:

```json
{
  "version": 1,
  "name": "My plans",
  "dbPath": "state/workspace.sqlite",
  "documents": "plans",
  "port": 9428,
  "host": "127.0.0.1"
}
```

The application checkout, plan directory, and repositories being worked on can all live in different locations. For example:

```sh
node /opt/aicommander/cli.mjs init /srv/team-state --documents /srv/team-plans
node /opt/aicommander/cli.mjs serve --workspace /srv/team-state
```

Then configure a working repository such as `/home/you/projects/product` in Settings. Its code stays in that repository; plans stay in `/srv/team-plans`; the application stays in `/opt/aicommander`. Use `init --db PATH` to place SQLite independently too.

`--db`, `--documents`, `--host`, `--port`, and `--url` override configuration. `AICOMMANDER_URL` selects an endpoint for CLI and MCP clients. Repository checkout paths, worktree directories, and provider authentication are machine-specific; configure those on each machine. Each workspace has one agent host and web server.

To adopt an existing SQLite workspace, write a configuration pointing to its existing database and Markdown directory, then start AICommander with that workspace. Do not import a stale JSON export over a live database. Stop the previous web server before replacing it. Drain and stop the previous agent host only after its active work finishes; web reloads can preserve a compatible existing host.

## Connect an agent

The HTTP MCP endpoint is [localhost:9428/mcp](http://127.0.0.1:9428/mcp). A stdio client can launch this bridge with absolute paths:

```json
{
  "mcpServers": {
    "aicommander": {
      "command": "node",
      "args": [
        "/path/to/aicommander/cli.mjs",
        "mcp",
        "--workspace",
        "/path/to/my-plans"
      ]
    }
  }
}
```

Start the server first. The bridge connects to that workspace's endpoint. Existing `plans_*` tool names remain stable.

Export the portable agent workflow skill without starting the server:

```sh
node cli.mjs skill --workspace ../my-plans
```

Install that output as the `aicommander` skill in your agent client's skill directory. It contains this installation's paths and endpoint, not task records or credentials. Re-export after moving the application or workspace. Read the workspace and target repository's own guidance before acting.

## Plan and execute

Capture tasks through the UI or `task.capture`. For substantial work, draft one Markdown plan with design and proposed deliverables. Each deliverable uses a fenced `task` block:

````markdown
# Save preferences

Preserve the user's settings after restarting.

```task
{
  "id": "save-preferences",
  "title": "Persist preferences",
  "summary": "Restore saved preferences on startup.",
  "acceptance": ["A changed preference survives restart."],
  "requires": []
}
```
````

Use `plan.create`, `plan.save`, and `plan.get` to work on the draft. Approval identifies the exact document hash and database revision, records who authorized it and the evidence, and extracts tasks atomically. Indexing Markdown alone does not create ready work. The example proposal stays a draft until explicitly approved.

Configure a Git checkout, base branch, worktree directory, and acceptance commands in Settings before managed execution. Claude and Codex use their own harnesses and authentication. Implementation runs own isolated worktrees; acceptance checks run against a clean committed head. Integration rebases, revalidates, and fast-forwards the configured checkout. Integration does not push. Scoped implementation, integration, and whole-head acceptance remain separate.

```sh
node cli.mjs query --workspace ../my-plans --q 'ready:true'
node cli.mjs show TASK_ID --workspace ../my-plans
node cli.mjs task.update --workspace ../my-plans --json '{"id":"TASK_ID","status":"partial"}'
node cli.mjs plan.create --workspace ../my-plans --json '{"prompt":"Save preferences"}'
node cli.mjs workspace --workspace ../my-plans
node cli.mjs help
```

Shared operations accept `--json JSON` or `--input FILE`, with optional `--revision N` for optimistic writes. MCP exposes operation wrappers with an `input` object. Inspect `tools/list` for current schemas. The UI uses the same operations through `/api/command`.

## Back up and update

```sh
node cli.mjs backup --workspace ../my-plans --output ../my-plans-backup.sqlite
node cli.mjs export --workspace ../my-plans --output ../tasks-export.json
node cli.mjs reload --workspace ../my-plans
```

Back up the Markdown directory and configuration alongside the SQLite backup. Use the backup command rather than copying an active database file by itself: SQLite also uses a WAL file. The JSON export contains task and document state; a SQLite backup also preserves conversations, approvals, receipts, and other execution history.

The web process and agent host are separate. Reloading the website leaves agents running. Before updating host code, use `host drain`, let active work finish, then use `host stop`. Start `serve` after the update to launch its replacement. Do not launch replacement workers because a check-in is stale; inspect durable session and delivery records before resuming.

The default listener is loopback. Private LAN/VPN listening is available with `--host 0.0.0.0`. This is a trusted local workspace, without per-user authentication or public-internet hosting support.

## Fork and customize

Fork this repository to retain an upstream relationship and bring in later improvements. Create your workspace separately, then change the UI, workflow, providers, or example packs in your fork. Your planning data stays independent of source updates. The repository can also be used as a GitHub template for a fresh independent history.

Application operations and SQLite storage live in `src/app/`. Shared models and browser assets live in `src/`. Provider adapters live in `src/app/providers/`. The exported workflow skill lives in `src/app/skills/aicommander/`. Add example packs under `examples/` and register them in `src/app/examples.mjs`; packs use stable IDs and installation receipts to preserve later edits.

Run `npm test` before sharing changes. Tests use disposable workspaces and provider fixtures; they do not require paid agent calls. CI runs on Linux, macOS, and Windows with Node 26.

## License

MIT. The bundled Marked renderer retains its own license in [src/MARKED-LICENSE.md](src/MARKED-LICENSE.md).

## VS Code client

An extension in [`extension/`](extension/README.md) brings plans, tasks, and the conversations this workspace owns into the editor. It is a client: it never starts a provider process and never opens a second writer for a conversation that already has an owner. Saving a plan records a draft revision and never approves it, a conflicting save cannot overwrite another client's revision, and stopping a conversation is reported as a cancellation rather than a failure.

```sh
node cli.mjs serve --workspace ../my-plans --ahp   # site, agent host, and the editor facade
node cli.mjs editor --workspace ../my-plans        # the editor settings to paste
node scripts/package-extension.mjs                 # build an installable .vsix
```

The editor facade translates owned sessions into Microsoft's Agent Host Protocol so they appear as native chat. It binds loopback only and requires a bearer token on every connection; the address `editor` prints contains that token, so treat it as a credential. Reach it from another machine through an authenticated tunnel or an SSH local port forward, never by publishing the listener.

The [implementation plan](docs/design/vscode-client.md) records what is built, what the implementation changed about its own assumptions, and which acceptance gates remain open: native clicked controls, a real-provider run, remote routing, and physical-phone parity. [The evidence](docs/evidence/vscode/README.md) is reproducible with `node scripts/vscode-evidence.mjs`. The website remains the phone companion, and no website feature has been retired. The [research handoff](docs/research/vscode/README.md) records the original investigation and which of its conclusions have since been corrected.
