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
- Replace GitHub: it has no diff viewer, milestones or Projects.

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
[workflow v1](github-workflow.md#2-tasks) for the task format and
[Workspaces](workspaces.md#rebuilding-the-database) for rebuilding. See [People and machines](scale-out.md) for how several people's
machines share this state.

## Workflows

Work starts in one of three ways.

- **Labeled issue.** A writer labels and assigns an issue, and it becomes one
  task with no spec files. The label is the approval.
- **Light spec.** A spec with one task, written by hand or by a chat with the
  `avoozl-spec` skill. A person approves it; see
  [Approval](github-workflow.md#7-approval). With `landing: pr` Avoozl opens
  the pull request, waits for its checks and reviews, and merges it.
- **Epic.** The `avoozl-spec` skill writes requirements, design and tasks, and
  a person approves them. The tick releases ready tasks by capacity, phase and
  Stop the line, and Avoozl runs, checks and lands each one.

## Labels

No label is an order. The labels Avoozl reads are per-repository settings:

| Role                                       | Setting          | Who writes it                             |
| ------------------------------------------ | ---------------- | ----------------------------------------- |
| Priority (ready tasks with it start first) | `priorityLabels` | A person                                  |
| Waiting on the author (holds a task)       | `waitingLabels`  | A person                                  |
| Spec issues this machine works             | `labels.require`, `labels.exclude` | A person                |
| Stop a spec and the specs it links         | `labels.stop` (default `avoozl:stopped`) | A writer |

## Screens

The nav has six entries, defined in `hosts/kirocrew/ui/src/nav-api.ts`:

- **Specs:** one list with status chips, and spec details with tabs.
- **Graph:** the dependency graph of a spec, an epic or every spec.
- **In flight:** live sessions, claim branches, this machine's lanes,
  integration branches and the delivery columns.
- **Needs you:** Decisions.
- **Activity:** one page.
- **Settings:** Workspaces, Repository setup, GitHub, Plugins, Epic context,
  Content rules, Flow, Models, Autopilot.

**Run in a chat** on a spec, a task or a Needs you item opens a chat seeded
with the matching skill and the item's IDs: a Kiro Crew chat inside Kiro Crew,
and a process session on the standalone page.

## Agent prompts

Each agent role's standing instructions are Markdown files in
[`prompts/`](../prompts/README.md). See the
README there for which role reads which file and how the Kiro Crew agents are
generated from them.
