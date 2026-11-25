# Avoozl

Avoozl lands epics from specs. It runs ready tasks in parallel across
repositories and machines, checks the exact commits before they land, and
shows what's done, what's blocked, and what needs your decision.

For a program that spans many similar repositories, define the workflow once.
Reuse its phases, acceptance criteria, and approval gates in each repository's
plan, and track the rollout as one epic.

A parent spec can run two linked specs in parallel and hold sign-off until
both are done.

```markdown
- [ ] `rollout-services` Update the services (**PARALLEL**)
  - [ ] `rollout-gateway` Update [Gateway](../gateway/tasks.md)
  - [ ] `rollout-worker` Update [Worker](../worker/tasks.md)
- [ ] `rollout-review` Sign off on the rollout (**MANUAL**)
  - Both services pass the shared acceptance checks
```

See [Epic rollout](docs/overview.md#epic-rollout) for how Avoozl runs this
plan.

## Control during delivery

Let Autopilot run the waves of an epic. Put sign-off gates between phases
and choose who merges in each repository. You can also take and land a task
yourself. See [Autopilot](docs/delivery.md#turning-autopilot-on).

- **Pull the andon cord.** Pause new work for a task, spec, repository, or the
  whole workspace. You decide when to resume. See
  [Stop the line](docs/flow.md#stop-the-line).
- **Steer work in flight.** Open the worker's session to see what it's done
  and send guidance on the current task. See
  [Steering a running task](docs/delivery.md#steering-a-running-task).
- **Run a retro.** Use delivery timings to find the slowest part of the loop
  and get proposed changes to the plan or settings. You choose which changes
  to make. See [Retros](docs/flow.md#retros).
- **Choose the agent and harness.** Pick the worker agent and set the harness
  for each role. Use Kiro Crew, Claude Code, Codex, or a process harness you
  define. See [Roles and models](docs/agents.md#roles-and-models).

## Pick up where you left off

If you need to switch priorities between tasks, reassign the spec's GitHub
issue to a coworker. Their Avoozl runner can pick up the next ready task
from the same plan. If you need to switch which computer is driving your
Avoozl session, clone the workspace repository and run `avoozl rebuild`.
Avoozl restores specs, approvals, and completed tasks from Git.

## Open workflow

[Workflow v1](docs/github-workflow.md) is the public workflow. Its numbered
rules say how a tool lands an epic task by task from spec files on GitHub, and
the [workflow kit](workflow-kit/README.md) holds sample repositories that check
a runner against them. Any tool can follow it. Avoozl is one way to run it,
through its CLI, MCP server, web page, Kiro Crew app and skills.

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

## Delivery flow

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

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/spec-desktop-dark.png">
  <img alt="A spec page: its summary, details, task graph and manifest" src="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/spec-desktop-light.png" width="800">
</picture>

A spec can cover one change or link several repositories' specs into an epic.
Each repository sets how checked work lands. A local-only workspace needs
only Git.

Git holds the state that matters: specs, approvals, and what landed. The local
SQLite database is a cache, and `avoozl rebuild` makes it again on a new
machine.

## Agent limits

Agents write the code, and people keep the decisions.

- An agent can't approve a spec or change a repository's checks.
- Avoozl never force pushes, merges with `--admin`, or skips a required check
  or review.
- Checks run in a sandbox with the network off by default, and never see a
  push or GitHub token.

## Requirements

- Node 22.18 or later, for type stripping and built-in SQLite
- Git
- Kiro Crew 0.12.2 or later, to run Avoozl as a Kiro Crew app (optional)
- `gh` signed in, or a token, for the GitHub features (optional)

## Install

```sh
git clone https://github.com/mtdowling/avoozl.git
cd avoozl
npm ci
npm run build
kirocrew app install "$PWD/hosts/kirocrew"
```

`npm ci` also links a global `avoozl` command to this checkout, as `npm link`
does, so a `git pull` updates it. Set `AVOOZL_NO_GLOBAL_LINK=1` to skip the
link.

Open Kiro Crew's App Store, review Avoozl's trust request, and enable it. The
**Avoozl** page appears in the sidebar. The tick updates itself to
Avoozl's newest green main (see
[Engine updates](hosts/kirocrew/README.md#engine-updates)). The page, app
backend and MCP server change only when you update the app: pull and run
`npm run build && kirocrew app update avoozl` in the checkout.

To run Avoozl without Kiro Crew, run `avoozl tick` on a timer: launchd,
systemd or cron, with the lines in
[Getting started](docs/getting-started.md#run-the-tick-on-a-timer), or a chat
that follows the `avoozl-drive` skill. Each tick is one pass that exits. The tick
also keeps the page up on `127.0.0.1`, and `avoozl link` prints a one-time
link that signs your browser in. `serve.enabled: false` in the machine's
`config.json` turns the page off. Claude Code users can load the plugin in `hosts/claude-code/`.

## Create a workspace

A workspace is a directory you own, separate from this checkout. Create one
on the page with **Settings › Workspaces › Add a workspace**, or from the CLI:

```sh
avoozl init ~/plans --name "My plans"
```

It holds `.avoozl.json` for settings you can commit, `.kiro/specs/` for specs,
and a local database that isn't committed. A new workspace is empty.

## Deliver a spec

Write the spec by hand, or ask a chat to with the `avoozl-spec` skill, then
approve it. See
[Write and approve a spec](docs/getting-started.md#write-and-approve-a-spec).
For examples, browse [Avoozl's own specs](specs/).

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

Each check is a name and a command, run without a shell. The repository's
`landing` setting, `off` by default, decides what happens to work that
passes. See [Landing modes](docs/github-workflow.md#17-landing-modes) for each
value.

Then pick **Autopilot** in **Settings › Autopilot**. It writes a `delivery`
block to `.avoozl.json` and a `loop` to this machine's config, and the tick
starts and lands ready tasks from then on. See
[Turning Autopilot on](docs/delivery.md#turning-autopilot-on) for both
settings, and [Kiro Crew setup](docs/delivery.md#kiro-crew-setup) for the
one-time Kiro Crew steps that reviewer chats and pull request workers need.

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

A client that doesn't find `avoozl` on its `PATH` takes the full path that
`command -v avoozl` prints.

Agents reach every action over MCP, approvals and settings included; a
delete needs `confirm: true`, and Activity names who called it. See
[Agent access](docs/agent-access.md). `avoozl help` lists the CLI commands.

## Issue handoff

Avoozl can also fix issues for you when
[labeled issue handoff](docs/github.md#labeled-issues) is enabled.

## Documentation

The [docs index](docs/README.md) lists every page. Start with these:

- [Epic rollout](docs/overview.md#epic-rollout) for linked specs and gates
- [Getting started](docs/getting-started.md) for setup and a first spec
- [Overview](docs/overview.md) for where state lives and what each view shows
- [Workflow v1](docs/github-workflow.md) for the task list format, order,
  approvals, claims and landing
- [Delivery](docs/delivery.md) for workers, checks, landing, and merge batches
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
