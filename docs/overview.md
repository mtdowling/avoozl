# Avoozl

Avoozl runs an approved spec with coding agents, checks each commit itself, and
lands it. A spec can be one task that becomes one pull request, or an epic
across specs and repositories.

```sh
avoozl plan approve NAME --workspace ~/plans
avoozl status --workspace ~/plans
```

Approving a spec turns it into a task graph. The tick starts each ready task in
its own working branch with an executor (a Kiro Crew chat or a process
harness), checks the exact commit, and lands it by the repository's `landing`
setting. GitHub is optional. See [Getting started](getting-started.md) to
install it.

## Boundaries

Avoozl does these:

- Plans specs of any size: spec, tasks and order.
- Runs, checks and lands each task, and releases what waited on it.
- Works with no GitHub, in Local only mode.

Avoozl does not do these:

- Treat a label as an order.
- Change code on its own outside a spec or a labeled issue.
- Triage issues or review other people's pull requests. Any agent runner can,
  with the [agent skills](agent-skills.md) Avoozl ships.
- Approve, request changes or close for a person.
- Replace GitHub: it has no code diff viewer, milestones or Projects board.

## State

Git holds what matters. SQLite is a cache, and `avoozl rebuild` makes it again.

- **Specs** live in `.kiro/specs/<name>/` in git: `requirements.md` (or
  `bugfix.md`), `design.md` and `tasks.md`.
- **Task facts** are the `$key:` bullets under each task in `tasks.md`.
- **Approvals** and **task completion** are commits on the specs branch. See
  [Approval](github-workflow.md#7-approval) and
  [Done tasks](github-workflow.md#18-done-tasks).
- **Execution state** is the workspace database, rebuilt from the items above.

A task never gets a GitHub issue. A spec can have one issue, whose assignee
drives it, and a labeled issue is its own one-task spec. See
[Tasks](github-workflow.md#2-tasks) for the task format,
[Rebuilding the database](workspaces.md#rebuilding-the-database) for
`avoozl rebuild`, and [People and machines](scale-out.md) for how several
people's machines share this state.

## Workflows

Work starts in one of three ways.

- **Labeled issue.** A writer labels an issue, and it becomes one task with no
  spec files. The label is the approval. See
  [Labeled issues](github-workflow.md#11-labeled-issues).
- **Light spec.** A spec with one task, written by hand or by a chat with the
  `avoozl-spec` skill. A person approves it; see
  [Approval](github-workflow.md#7-approval). With `landing: pr` Avoozl opens
  the pull request, and the pull request mode (`draft` unless set) decides who
  merges it.
- **Epic.** The `avoozl-spec` skill writes requirements, design and tasks, and
  a person approves them. The tick releases ready tasks by capacity, phase and
  Stop the line, and Avoozl runs, checks and lands each one.

## Labels

No label is an order. The labels Avoozl reads are per-repository settings:

| Role | Setting | Who writes it |
| --- | --- | --- |
| Priority (ready tasks with it start first) | `priorityLabels` | A person |
| Waiting on the author (holds a task) | `waitingLabels` | A person |
| Spec issues this machine works | `labels.require`, `labels.exclude` | A person |
| Stop a spec and the specs it links | `labels.stop` (default `avoozl:stopped`) | A writer |

## Views

The page has seven views, in this order in the nav. It opens on Insights.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/in-flight-desktop-dark.png">
  <img alt="The In flight view: three ready tasks, each with Start now, Defer and Details" src="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/in-flight-desktop-light.png" width="800">
</picture>

- **Insights:** a read-only home. A strip of what waits (Needs you, In
  flight, Ready, Main, Autopilot), each spec's burndown, tasks finished per
  day, lead time per task, time per stage, review rounds, rework and the saved
  retros. See [Insights](flow.md#insights).
- **Specs:** the spec list and each spec's details.
- **Graph:** the dependency graph of a spec, an epic or every spec. Select a
  task to see its internal Worker → Checks → Review → Land execution stages;
  those stages are not extra dependency edges.
- **In flight:** live sessions, claim branches, this machine's lanes,
  integration branches and the delivery columns.
- **Needs you:** Decisions, where a worker handed work back, a spec or issue
  was edited by hand, or a task needs your choice.
- **Activity:** who did what in this workspace, from the page, the CLI, MCP,
  GitHub and plugins, newest first.
- **Settings:** Workspaces, Repository setup, GitHub, Plugins, Epic context,
  Content rules, Flow, Models and Autopilot.

**Run in a chat** on a spec, a task, a Needs you item or a retro opens a chat
seeded with the matching skill and the item's IDs. Inside Kiro Crew it is a
Kiro Crew chat. On the standalone page it opens the **Start a session**
dialog, which runs the role's harness from **Settings › Models**.

### Screenshots

Each view and Settings tab, on a desktop and a phone, in light and dark. They
show the example workspace that `npm run docs:screenshots` builds.

| View | Desktop | Phone |
| --- | --- | --- |
| Insights | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/insights-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/insights-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/insights-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/insights-phone-dark.png) |
| Specs | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/specs-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/specs-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/specs-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/specs-phone-dark.png) |
| A spec | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/spec-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/spec-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/spec-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/spec-phone-dark.png) |
| Graph | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/graph-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/graph-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/graph-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/graph-phone-dark.png) |
| In flight | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/in-flight-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/in-flight-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/in-flight-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/in-flight-phone-dark.png) |
| Needs you | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/needs-you-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/needs-you-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/needs-you-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/needs-you-phone-dark.png) |
| Activity | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/activity-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/activity-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/activity-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/activity-phone-dark.png) |
| Settings › Workspaces | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-workspaces-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-workspaces-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-workspaces-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-workspaces-phone-dark.png) |
| Settings › Repository setup | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-repositories-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-repositories-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-repositories-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-repositories-phone-dark.png) |
| Settings › GitHub › Epic issues | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-phone-dark.png) |
| Settings › GitHub › Sync pace | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-sync-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-sync-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-sync-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-sync-phone-dark.png) |
| Settings › GitHub › GitHub calls | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-calls-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-calls-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-calls-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-calls-phone-dark.png) |
| Settings › Plugins | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-plugins-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-plugins-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-plugins-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-plugins-phone-dark.png) |
| Settings › Epic context | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-context-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-context-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-context-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-context-phone-dark.png) |
| Settings › Content rules | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-content-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-content-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-content-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-content-phone-dark.png) |
| Settings › Flow | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-flow-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-flow-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-flow-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-flow-phone-dark.png) |
| Settings › Models | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-models-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-models-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-models-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-models-phone-dark.png) |
| Settings › Autopilot | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-autopilot-desktop-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-autopilot-desktop-dark.png) | [light](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-autopilot-phone-light.png), [dark](https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-autopilot-phone-dark.png) |

## Agent prompts

Each agent role's standing instructions are Markdown files in
[`prompts/`](../prompts/README.md). See the README there for which role reads
which file and how the Kiro Crew agents are generated from them.
