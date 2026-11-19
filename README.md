# Avoozl

Avoozl turns a spec you approve into merged code. It splits the spec into
tasks, gives each task to a coding agent in its own worktree, runs your checks
on the exact commit the agent made, and lands the work once they pass.

Each task in a spec says what it waits on and what done means:

```markdown
- [ ] 1.2 Validate config
  - Facts:
    - after: 1.1
    - done:
      - An unknown key is reported with its path
  - Report each key the schema does not name, with its JSON path.
```

Avoozl starts task 1.2 once 1.1 has landed. The commit that lands 1.2 ticks
its box on main, so anyone who reads the branch sees it done.

## How it works

1. You write a spec: requirements, a design, and a list of tasks. You can
   write it by hand or have an agent draft it for you to review.
2. You approve it. An approval is a commit on main that you authored, so every
   plan an agent works from is one a person agreed to.
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
kirocrew app install "$PWD/kirocrew-app"
```

Open Kiro Crew's App Store, review Avoozl's trust request, and enable it. The
**Avoozl** page appears in the sidebar. To update, pull and run
`npm run build && kirocrew app update avoozl` in the checkout.

To run Avoozl without Kiro Crew, build it with `npm run build` and start the
page with `node cli.mjs serve --workspace ~/plans`. It listens on `127.0.0.1`
only and prints a one-time link that signs your browser in.

In a checkout the CLI is `node cli.mjs`. Help and error text call it `avoozl`.

## Trying it out

To look around before you set anything up, choose **Start demo** on the
Avoozl page. It opens a made-up workspace in which nothing starts an agent or
writes to GitHub, and **Exit demo** returns to your own.

A workspace is a directory you own, separate from this checkout. Create one
on the page under **Add or initialize a workspace**, or from the CLI:

```sh
node cli.mjs init ~/plans --name "My plans"
```

It holds `.avoozl.json` for settings you can commit, `.kiro/specs/` for specs,
and a local database that is not committed. A new workspace is empty.
`node cli.mjs seed --workspace ~/plans` adds an example as draft specs, and
does not approve them.

## Delivering a spec

Choose **New spec** on the Specs page, review the lint results and the task
graph, then choose **Approve revision**. Editing the spec later makes it read
as unapproved until you approve it again.

Register the checkout the work changes, with its base branch, a folder for
worktrees, and the checks every task must pass:

```sh
node cli.mjs repository configure code --workspace ~/plans \
  --json '{"root":"/path/to/code","baseBranch":"main","worktreeRoot":"/path/to/worktrees","checks":{"test":["npm","test"]}}'
```

Each check is a name and a command, run without a shell. Turn delivery on by
adding `{ "delivery": {} }` to `.avoozl.json`. With no GitHub, also make this
workspace the one that drives the spec:

```sh
node cli.mjs spec publish NAME --workspace ~/plans
node cli.mjs spec takeover NAME --workspace ~/plans
```

The repository's `landing` setting decides what happens to work that passes:

- `off`, the default, holds the verified commit in **Needs you**.
- `direct` stacks verified tasks on the base branch, checks the result, and
  fast-forwards the remote.
- `pr` opens a pull request, waits for its required checks and reviews, and
  merges it.

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
      "command": "node",
      "args": ["/path/to/avoozl/cli.mjs", "mcp", "--workspace", "/path/to/plans"]
    }
  }
}
```

Actions that belong to a person, such as approving a spec or changing
settings, are refused over MCP. `node cli.mjs help` lists the CLI commands.

## Documentation

See the [documentation site](https://mtdowling.com/avoozl/) for the rest:

- [Getting started](docs/getting-started.md) for setup in more detail
- [Overview](docs/overview.md) for where state lives and what each page shows
- [Workspaces](docs/workspaces.md) for settings files, the standalone server,
  backup, and rebuilding
- [Specs](docs/specs.md) for the task list format, approvals, and dependencies
  across specs
- [Delivery](docs/delivery.md) for workers, checks, landing, and merge batches
- [Drivers](docs/drivers.md) for which machine drives a spec, and handing off
- [GitHub](docs/github.md) for repository roles and GitHub modes
- [Flow](docs/flow.md) for Stop the line, retros, and rules from corrections
- [Agents and the CLI](docs/agents.md) for roles and models, MCP tools, and
  person-only actions
- [Triage agent](docs/triage.md) for issue and pull request triage on GitHub
- [Content rules](docs/content-rules.md) for keeping private terms out of
  everything Avoozl writes
- [Repository checks and isolation](docs/checks.md) for check commands and the
  sandbox they run in
- [Person-only operations](docs/person-only.md) for what an agent session cannot
  do
- [Manual tasks and task links](docs/manual-tasks.md) for steps only a person
  does
- [Intake sources](docs/intake.md) for bringing in work from trackers and
  scripts
- [GitHub rate limit](docs/rate-limit.md) for the cache and write pacing
- [Writing a plugin](docs/plugins.md) for intake sources, content rules, and
  workflow templates
- [Glossary](docs/glossary.md) for terms that look alike

## Development

Application operations and storage live in `src/app/`, shared models in
`src/`, and the Kiro Crew page in `kirocrew-app/ui/`. See
[AGENTS.md](AGENTS.md) for the rules a change follows.

```sh
npm test
npm run format
npm run docs:dev
```

`npm run test:changed` runs only the tests a change reaches, as CI does. Tests
use temporary workspaces and make no network or paid agent calls.

## License

MIT. Bundled third-party code and its licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
