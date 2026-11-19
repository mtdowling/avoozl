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
- Triages new issues and pull requests, with Issues and Pull requests pages.

Avoozl does not do these:

- Treat a label as an order.
- Change code on its own outside a spec, a fix or a triage run.
- Approve, request changes or close for a person.
- Replace GitHub: it has no diff viewer, milestones or Projects.

## State

Git holds what matters. SQLite is a cache, and `avoozl rebuild` makes it again.

- **Specs** live in `.kiro/specs/<name>/` in git: `requirements.md` (or
  `bugfix.md`), `design.md` and `tasks.md`.
- **Task facts** are the `$key:` bullets under each task in `tasks.md`.
- **Approvals** are commits on main whose author is an approver.
- **Task completion** is the commit that lands a task and ticks its box in
  `tasks.md` on main. Other machines read the tick.
- **Landings** are the trailers on the landing commits.
- **Retros** live in `.kiro/retros/`.
- **Execution state** is the workspace database, rebuilt from the items above.

A task never gets a GitHub issue. A spec can have one issue, its journal, and a
fix started from an issue keeps its record there. See [Specs](specs.md) for the
task format and [Workspaces](workspaces.md#rebuilding-the-database) for
rebuilding. See [People and machines](scale-out.md) for how several people's
machines share this state.

## Workflows

Work starts in one of four ways.

- **Triage.** The triage agent answers questions, reproduces bugs, starts fixes,
  and reviews other people's pull requests. What it cannot settle goes to
  Needs you › From the agent. See [Triage agent](triage.md).
- **Fix.** Fix on an issue, New fix, or `avoozl fix` creates one task with no
  spec files. Starting it is the approval.
- **Light spec.** New spec, Blank or From a goal, with one task. Approve records
  the revision. With `landing: pr` Avoozl opens the pull request, waits for its
  checks and reviews, and merges it.
- **Epic.** Spec Builder writes requirements, design and tasks. Approve records
  the revision. The tick releases ready tasks by capacity, phase and Stop the
  line, and Avoozl runs, checks and lands each one. A retro follows. See
  [Epic types](epic-types.md).

## Labels

No label is an order. The labels Avoozl reads are per-repository settings:

| Role                                       | Setting          | Who writes it                             |
| ------------------------------------------ | ---------------- | ----------------------------------------- |
| Priority (ready tasks with it start first) | `priorityLabels` | A person                                  |
| Waiting on the author (holds a task)       | `waitingLabels`  | A person                                  |
| The triage agent's labels                  | `triage.labels`  | The agent, from labels the repository has |

## Screens

The nav has eight entries, defined in `kirocrew-app/ui/src/nav-api.ts`:

- **Dashboards:** Home, Graph, Delivery, Landing queue.
- **Specs:** one list with status chips, and spec details with tabs.
- **Needs you:** Decisions, From the agent.
- **GitHub:** Issues, Pull requests, Triage agent.
- **Flow:** one page.
- **Retros:** Retros, Proposals.
- **Activity:** one page.
- **Settings:** Workspaces, Repository setup, GitHub, Plugins, Content rules,
  Flow, Models, Delivery.

## Deleting a plan

`avoozl plan delete PLAN_ID_OR_SPEC_NAME` prints a preview and changes nothing.
The preview shows the open tasks that would be archived, tasks already done,
running chats (left alone), dependents, and the spec folder state. A spec name
works in place of the ID. If two plans share the name, the command refuses and
lists their IDs.

- `--yes` deletes. A draft is marked deleted and kept.
- `--retire` is needed with `--yes` for a plan that was ever approved, as the
  page's Delete asks.
- `--delete-spec-folder` also removes the spec folder. It is off by default,
  and the command refuses when the folder has uncommitted changes.

`avoozl plan restore PLAN_ID` brings a deleted plan back. Both commands are for
a person, and MCP and chat callers are refused. The CLI runs them anywhere but
a supervisor child, and says so when it runs inside an agent session.

## Agent prompts

Each agent role's standing instructions are Markdown files in
[`prompts/`](../prompts/README.md). See the
README there for which role reads which file, how the Kiro Crew agents are
generated from them, and how a retro proposes a change.
