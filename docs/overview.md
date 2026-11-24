# Avoozl

Avoozl lands epics from specs by running ready tasks, checking their exact
commits, and recording what lands. Open the graph to see the order of the work
and which parts can run in parallel.

```sh
avoozl graph service-rollout --workspace ~/plans
```

## Epic rollout

A parent spec links the specs for a program that changes several
repositories. For a repeatable rollout, use one template to write each
repository's plan with the same phases, acceptance criteria, and gates.
Each plan names its own repository and describes the changes that repository
needs.

1. Write a parent spec named `service-rollout` that links `gateway` and
   `worker` under a parallel group. A person approves the parent spec and
   each linked spec. See [Linked specs](github-workflow.md#6-linked-specs) for
   how the links work.
2. Avoozl starts ready tasks from both plans as workers become available.
   Both plans keep their own task order. Runners on different machines share
   progress through Git. See [People and machines](scale-out.md) for
   assignment and claims.
3. Avoozl runs the repository's checks on the exact commit in a clean
   worktree. Each repository's [landing mode](github-workflow.md#17-landing-modes)
   determines whether checked changes land directly, go through a pull
   request, or wait for a person.
4. Put a [manual task](manual-tasks.md) after the parallel group to require
   sign-off on the rollout. It appears in **Needs you** after both linked
   specs finish. Later tasks wait until a person releases the gate.

See [Getting started](getting-started.md) to install Avoozl and run a first
spec. A local-only workspace needs only Git.

## Control during a rollout

In **Settings › Autopilot**, choose the epics the runner can start. Agents
can deliver each wave up to the gates you put in the plan. Between waves,
a [manual task](manual-tasks.md) gives a person the go/no-go decision, and
the repository's landing mode determines who merges its pull requests.

- **Pause new work.** If a shared check breaks during the rollout, pull the
  andon cord in **In flight**. Choose the task, spec, repository, or workspace
  to pause. Running sessions keep going while you investigate. Flow can also
  pause affected work when a previously passing check fails on the landing
  branch and fails again on rerun. See [Stop the line](flow.md#stop-the-line).
- **Steer a worker.** Open the active attempt from **In flight**. Send
  guidance in the Kiro Crew chat or use **Send message** for a process
  session. See [Steering a running task](delivery.md#steering-a-running-task).
- **Adjust the next wave.** Run a retro in **Insights** to see which stage
  slowed delivery and what to change in the plan or settings. For example, a
  retro can identify repeated review rounds and suggest clearer acceptance
  criteria for the next wave. Review the suggestions and decide which to
  apply. See [Retros](flow.md#retros).
- **Set the execution roles.** Choose a worker agent and a harness for each
  role in **Settings › Models**. A worker can use a coding CLI while a
  reviewer works in a Kiro Crew chat. Each machine can approve its own
  process harnesses. See [Roles and models](agents.md#roles-and-models) and
  [Approve a harness](getting-started.md#approve-a-harness).

## State

Git holds what matters. SQLite is a cache, and `avoozl rebuild` makes it again.

- **Specs** live in `.kiro/specs/<name>/` in git: `requirements.md` (or
  `bugfix.md`), `design.md` and `tasks.md`.
- **Task order** comes from the list in `tasks.md`. Plain bullets under
  each task say what done means.
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

## Issue handoff

Your existing tools can handle triage, review, and routine maintenance. To
hand a scoped fix to Avoozl, assign the issue to the runner and have a
repository writer apply the configured label. When the issue loop is enabled,
Avoozl treats the issue as one task and applies the repository's landing mode.
See [Labeled issues](github-workflow.md#11-labeled-issues) for the handoff.

## Labels

Each repository sets the labels Avoozl reads.

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
