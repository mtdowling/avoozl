# Avoozl overview

Checked against the code on `main`. This page says what the app is and what
it shows. The rest of these pages are the [triage agent and policies](policies.md),
[plugins](plugins.md), [epic types](epic-types.md), the
[content hook](content-hook.md), the [build report](build-report.md) and the
[glossary](glossary.md).

## What Avoozl is

Approve a spec; Avoozl runs it with coding agents, checks each commit itself,
and lands it. It turns an approved spec into a task graph, runs each ready
task in its own working branch with an executor (a Kiro Crew chat or a
process harness), checks the exact commit, and lands it by the repository's
`landing` setting. A spec can be one task that becomes one pull request, or
an epic across specs and repositories. GitHub is optional.

| Is                                                                         | Is not                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Plans specs of any size: spec, tasks, order                                | A label-command bot: no label is an order                        |
| Runs, checks and lands each task, and releases what waited on it           | A coder that changes code outside a spec, a fix or a triage run  |
| Works with no GitHub (Local only mode)                                     | An approver: the agent never approves, requests changes or closes |
| Triages new issues and pull requests, with Issues and Pull requests pages  | A second GitHub: no diff viewer, milestones or Projects          |

## Where state lives

Git holds what matters. SQLite is a cache, and `avoozl rebuild` makes it
again.

| What                | Where it lives                                                                      |
| ------------------- | ----------------------------------------------------------------------------------- |
| Specs               | `.kiro/specs/<name>/` in git: `requirements.md` (or `bugfix.md`), `design.md`, `tasks.md` |
| Task facts          | `Facts:` bullets under each task in `tasks.md`                                      |
| Approvals           | A commit on main whose author is an approver                                        |
| Task done           | The commit that lands a task ticks its box in `tasks.md` on main; other machines read the tick |
| What landed         | Trailers on the landing commits                                                     |
| Retros              | `.kiro/retros/`                                                                     |
| Execution state     | The workspace database, rebuilt from the above                                      |

A task never gets a GitHub issue. A spec can have one issue, its journal,
and a fix started from an issue keeps its record there.

## Workflows

| Workflow                     | Path                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Triage                       | The triage agent answers questions, reproduces bugs and starts fixes, and reviews other people's pull requests. What it cannot settle goes to Needs you › From the agent. |
| Fix                          | Fix on an issue, New fix, or `avoozl fix`: one task with no spec files. Starting it is the approval.                                                                    |
| Light spec, one pull request | New spec, Blank or From a goal, with one task. Approve records the revision. With `landing: pr` Avoozl opens the pull request, waits for its checks and reviews, and merges it. |
| Epic from an approved spec   | Spec Builder writes requirements, design and tasks. Approve records the revision. The tick releases ready tasks by capacity, phase and Stop the line. Avoozl runs, checks and lands each one. A retro follows. |

## Labels

No label is an order. The labels Avoozl reads are per-repository settings:

| Role                                       | Setting         | Who writes it                              |
| ------------------------------------------ | --------------- | ------------------------------------------ |
| Priority (ready tasks with it start first) | `priorityLabels` | A person                                  |
| Waiting on the author (holds a task)       | `waitingLabels`  | A person                                  |
| The triage agent's labels                  | `triage.labels`  | The agent, from labels the repository has  |

## Screens

The nav has eight entries (`kirocrew-app/ui/src/nav-api.ts`):

| Nav entry  | Pages                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| Dashboards | Home, Graph, Delivery, Landing queue                                                   |
| Specs      | One list with status chips; spec details with tabs                                     |
| Needs you  | Decisions, From the agent                                                              |
| GitHub     | Issues, Pull requests, Triage agent                                                    |
| Flow       | One page                                                                               |
| Retros     | Retros, Proposals                                                                      |
| Activity   | One page                                                                               |
| Settings   | Workspaces, Repository setup, GitHub, Plugins, Content rules, Flow, Models, Delivery   |

## CLI

### Delete and restore a plan

`avoozl plan delete PLAN_ID_OR_SPEC_NAME` prints a preview and changes nothing. The preview shows the
open tasks that would be archived, tasks already done, running chats (left alone), dependents, and the
spec folder state. A spec name works in place of the id; if two plans share the name, the command
refuses and lists their ids.

| Flag                   | Effect                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `--yes`                | Delete. A draft is marked deleted and kept.                                                 |
| `--retire`             | Needed with `--yes` for a plan that was ever approved, as the page's Delete asks.           |
| `--delete-spec-folder` | Also remove the spec folder. Off by default. Refused if the folder has uncommitted changes. |

`avoozl plan restore PLAN_ID` brings a deleted plan back. Both are for a person: MCP and chat callers
are still refused. The CLI runs it anywhere but a supervisor child, and says so when it runs inside an agent session.

## Agent prompts

Each agent role's standing instructions are Markdown files in
[`prompts/`](https://github.com/mtdowling/avoozl/tree/main/prompts). Its
README says which role reads which file, how the Kiro Crew agents are
generated from them, and how a retro proposes a change.
