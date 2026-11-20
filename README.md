# Avoozl

Avoozl is an open workflow for landing specs and epics on GitHub. Write the
plan as a task list. Many agents and teammates can work on it at once without
doing the same task twice. Each task lands in order, after checks pass. You
choose where people sign off: every PR, only the gates, or never.

Plan in specs. Land in parallel. You keep the final say.

## Open workflow

[Workflow v1](docs/github-workflow.md) is the public workflow. Its numbered
rules say how a tool lands an epic task by task from spec files on GitHub, and
the [workflow kit](workflow-kit/README.md) holds sample repositories that check
a runner against them. Any tool can follow it. Avoozl is one way to run it,
through its CLI, MCP server, web app, Kiro Crew plugin and skills.

- **Parallel work.** Tasks run in [list order](docs/github-workflow.md#3-order),
  and the children of a parallel group start side by side.
  [Claim branches](docs/github-workflow.md#15-claims) keep two runners off one
  task.
- **Teams.** The spec issue's assignee drives the spec. See
  [Spec issues and assignment](docs/github-workflow.md#8-spec-issues-and-assignment)
  for hand-offs.
- **People decide.** See [Approval](docs/github-workflow.md#7-approval),
  [Manual tasks](docs/github-workflow.md#4-manual-tasks) and
  [Landing modes](docs/github-workflow.md#17-landing-modes) for where a person
  signs off.
- **Specs or epics.** See [Linked specs](docs/github-workflow.md#6-linked-specs)
  and [Integration branches](docs/github-workflow.md#14-integration-branches)
  for epics.

## Task list

Each task in a spec is an ID, a title and the bullets that say what done means:

```markdown
- [ ] `cfg-1` Read the config file
  - A file with every key loads
- [ ] `cfg-2` Validate config
  - An unknown key is reported with its path
```

See [Tasks](docs/github-workflow.md#2-tasks) for the format and
[Landing](docs/github-workflow.md#16-landing) for the tick that marks a task
done.

## How it works

1. You write a spec: requirements, a design, and a list of tasks. You can
   write it by hand or have an agent draft it for you to review.
2. You approve it with a commit. See
   [Approval](docs/github-workflow.md#7-approval).
3. Avoozl starts a coding agent on each task whose dependencies are done. The
   agent runs as a Kiro Crew chat or as a process such as Claude Code or Codex.
4. When the agent reports done, Avoozl runs the repository's checks itself on
   that commit, in a clean worktree, with no model involved.
5. Work that passes lands the way the repository is set up: as a pull request,
   as a push to the base branch, or held until you decide.

Specs can be any size. A light spec with one task becomes one pull request. A
large one becomes ordered tasks across repositories, each checked on its exact
commit before it lands. Every change starts from a spec you approved, so no
agent's work lands without a plan a person agreed to. GitHub is optional; a
Local only workspace needs only Git.

Git holds the state that matters: specs, approvals, and what landed. The local
SQLite database is a cache, and `avoozl rebuild` makes it again on a new
machine.

## Agent limits

Agents write the code, and people keep the decisions.

- An agent cannot approve a spec unless you grant it that from your own
  terminal, and it cannot change a repository's checks.
- Avoozl never force pushes, merges with `--admin`, or skips a required check
  or review.
- Checks run in a sandbox with the network off by default, and never see a
  push or GitHub token.
- Anyone, agent or person, can stop new work with **Stop the line**. Only a
  person can resume it.

## Requirements

- Node 22.13 or later, for its built-in SQLite
- Git
- Kiro Crew 0.12.2 or later, to run Avoozl as a Kiro Crew app (optional)
- `gh` signed in, or a token, for the GitHub features (optional)

## Install

```sh
git clone https://github.com/mtdowling/avoozl.git
cd avoozl
npm ci
npm run build:kirocrew-app
kirocrew app install "$PWD/hosts/kirocrew"
```

`npm ci` also links a global `avoozl` command to this checkout, as `npm link`
does, so a `git pull` updates it. Set `AVOOZL_NO_GLOBAL_LINK=1` to skip the
link.

Open Kiro Crew's App Store, review Avoozl's trust request, and enable it. The
**Avoozl** page appears in the sidebar. To update, pull and run
`npm run build && kirocrew app update avoozl` in the checkout.

To run Avoozl without Kiro Crew, build it with `npm run build` and run
`avoozl tick` on a timer: launchd, systemd or cron, with the lines in
[Getting started](docs/getting-started.md#run-the-tick-on-a-timer), or a chat
that follows the `avoozl-drive` skill. Each tick is one pass that exits. With
`serve.enabled` in the machine's `config.json`, the tick also keeps the page
up on `127.0.0.1`, and `avoozl link` prints a one-time link that signs your
browser in. Claude Code users can load the plugin in `hosts/claude-code/`.

## Trying it out

To look around before you set anything up, choose **Start demo** on the
Avoozl page. It opens a made-up workspace in which nothing starts an agent or
writes to GitHub, and **Exit demo** returns to your own.

A workspace is a directory you own, separate from this checkout. Create one
on the page under **Add or initialize a workspace**, or from the CLI:

```sh
avoozl init ~/plans --name "My plans"
```

It holds `.avoozl.json` for settings you can commit, `.kiro/specs/` for specs,
and a local database that is not committed. A new workspace is empty. Add a
repository with `avoozl repository configure ID --root PATH`, then run
`avoozl rebuild`.

## Delivering a spec

Choose **New spec** on the Specs page, review the lint results and the task
graph, then choose **Approve revision**. See
[Write and approve a spec](docs/getting-started.md#write-and-approve-a-spec).

Register the checkout the work changes, with its base branch, a folder for
worktrees, and the checks every task must pass:

```sh
avoozl repository configure code --workspace ~/plans \
  --json '{
  "root": "/path/to/code",
  "baseBranch": "main",
  "worktreeRoot": "/path/to/worktrees",
  "checks": {
    "test": [
      "npm",
      "test"
    ]
  }
}'
```

Each check is a name and a command, run without a shell. Turn delivery on by
adding a `delivery` object to `.avoozl.json`:

```json
{
  "delivery": {}
}
```

With no GitHub, this workspace drives every spec.

The repository's `landing` setting, `off` by default, decides what happens to
work that passes. See
[Landing modes](docs/github-workflow.md#17-landing-modes) for each value.

In Kiro Crew, two one-time steps finish the setup. Share the `avoozl:avoozl`
server in **MCP Management** and restart the gateway, so agent chats can
report back. After the first tick, set the project directory of the
**Avoozl** › _repository_ chat folder to the checkout.

See [delivery.md](docs/delivery.md) for workers, merge batches, conflicts,
and who merges.

## Other agents

The page, the CLI, and the MCP server call the same operations and see the
same state. Any stdio MCP client can run the server:

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

A client that does not find `avoozl` on its `PATH` takes the full path that
`command -v avoozl` prints.

Actions that belong to a person, such as approving a spec or changing
settings, are refused over MCP. `avoozl help` lists the CLI commands.

## Documentation

The [docs](docs/README.md) cover the rest:

- [Getting started](docs/getting-started.md) for setup in more detail
- [Overview](docs/overview.md) for where state lives and what each page shows
- [Workspaces](docs/workspaces.md) for settings files, the standalone server,
  backup, and rebuilding
- [Workflow v1](docs/github-workflow.md) for the task list format, order,
  approvals, claims and landing
- [Delivery](docs/delivery.md) for workers, checks, landing, and merge batches
- [GitHub](docs/github.md) for repository roles and GitHub modes
- [Flow](docs/flow.md) for Stop the line and retros
- [Agents and the CLI](docs/agents.md) for roles and models, MCP tools, and
  person-only actions
- [Agent skills](docs/agent-skills.md) for the answer, review and triage skills
  any agent runner can use on GitHub issues and pull requests
- [Content rules](docs/content-rules.md) for keeping private terms out of
  everything Avoozl writes
- [Repository checks and isolation](docs/checks.md) for check commands and the
  sandbox they run in
- [Person-only operations](docs/person-only.md) for what an agent session cannot
  do
- [Manual tasks](docs/manual-tasks.md) for steps only a person
  does
- [Intake sources](docs/intake.md) for bringing in work from trackers and
  scripts
- [GitHub rate limit](docs/rate-limit.md) for the cache and write pacing
- [Writing a plugin](docs/plugins.md) for intake sources, content rules, and
  workflow templates
- [Glossary](docs/glossary.md) for terms that look alike

## Development

Application operations and storage live in `src/app/`, shared models in
`src/`, and the Kiro Crew page in `hosts/kirocrew/ui/`. See
[AGENTS.md](AGENTS.md) for the rules a change follows.

```sh
npm test
npm run format
```

`npm run test:changed` runs only the tests a change reaches, as CI does. Tests
use temporary workspaces and make no network or paid agent calls.

## License

MIT. Bundled third-party code and its licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
