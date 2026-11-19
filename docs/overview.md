# Avoozl overview

Status 2026-11-18, checked against `origin/main`. The avoozl spec
(`.kiro/specs/avoozl/`) governs. The `radar-coder` spec is superseded where
it conflicts (see the banner at its top). This file lists what the app is
and shows now; it is not a list of verdicts.

## 1. What Avoozl is

Approve a spec; Avoozl runs it with coding agents, checks each commit itself,
and lands it. It turns an approved spec into a task graph, runs each ready
task in its own working branch with an executor (a Kiro Crew chat or a
process harness), checks the exact commit, and lands it by the repository's
`landing` setting. A spec can be one task that becomes one pull request, or
an epic across specs and repositories. GitHub is optional.

| Is                                                                                          | Is not                                                                     |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Plans specs of any size: spec, tasks, order                                                             | A triage tool (Issue Radar does that)                                      |
| Runs, checks and lands each task, and releases what waited on it                            | A coder for unplanned work: every change starts from an approved spec      |
| Local only mode: tasks in SQLite, no GitHub                                                 | A pull request reviewer (one exception: review drafts by label)            |
| Shows Needs you, In flight, Landing queue, Delivery, Flow and Retros                        | A second issue or pull request list (Issue Radar and GitHub already have them) |

## 2. Workflows

| Workflow                   | Path                                                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maintenance, by Radar      | Radar crews take issues and open pull requests. Avoozl does not triage or plan these. Needs you › Issue Radar lists what you sent to a crew.                                                                            |
| Light spec, one pull request | New spec, Blank or From a goal, with one task. Approve records the revision. With `landing: pr` Avoozl opens the pull request, waits for its checks and reviews, and merges it. |
| Epic from an approved spec | Spec Builder writes requirements, design and tasks. Approve records the revision. The tick releases ready tasks by capacity, phase and Stop the line. Avoozl runs, checks and lands each one (R86, R87). Retro follows. |
| Tag-based review drafts    | A person adds the review label to a pull request. One read-only chat drafts a pending review with line comments. The person edits and submits it. Avoozl never submits.                                                 |

## 3. Labels

Every label is a per-repository setting. No behavior needs an `avoozl:`
prefix. Defaults below are what the code reads (`github-policy.mjs`,
`github-label-behaviors.mjs`). Radar's own labels are set in Settings › Issue
Radar.

| Role                                               | Setting                 | Default                       | Who writes it    |
| -------------------------------------------------- | ----------------------- | ----------------------------- | ---------------- |
| Planning (starts a plan)                           | `radar.planLabel`       | `avoozl:plan`                 | A person         |
| Ready                                              | `managedLabels.ready`   | `avoozl:ready`                | Avoozl           |
| Managed marker                                     | `managedLabel`          | `avoozl:managed`              | Avoozl           |
| Approval                                           | `radar.approvalLabel`   | `avoozl:plan-approved`        | A person         |
| Merge conflict                                     | `radar.conflictLabel`   | `avoozl:merge-conflict`       | Avoozl           |
| Review (starts a draft)                            | `radar.reviewLabel`     | `avoozl:review`               | A person         |
| Drafted                                            | `radar.draftedLabel`    | `avoozl:drafted`              | Avoozl           |
| Accepted (a skipped issue may be planned)          | `acceptedLabel`         | unset                         | An allowed person |
| Task states: ready, blocked, review, quarantined   | `githubLabelBehaviors`  | `avoozl:ready`, `avoozl:blocked`, `avoozl:review`, `avoozl:quarantined` | Avoozl |
| Radar's claim                                      | `crewLabels.claim`      | `crew: in progress`           | Radar            |
| Radar's escalation (its needs-human label)         | `crewLabels.needsHuman` | `crew: needs human`; recommended `crew: needs avoozl` | Radar |

Two labels that are equal are refused.

## 4. Screens

The nav has seven entries (`kirocrew-app/ui/src/nav-api.ts`):

| Nav entry  | Pages                                                          |
| ---------- | -------------------------------------------------------------- |
| Dashboards | Home, Graph, Delivery, CI, Landing queue                       |
| Specs      | One list with status chips; spec details with tabs             |
| Needs you  | Decisions, Triage, Issue Radar                                 |
| Flow       | One page                                                       |
| Retros     | Retros, Proposals                                              |
| Activity   | One page                                                       |
| Settings   | Workspaces, Repository setup, GitHub, Issue Radar, Plugins, Content rules, Flow, Models, Delivery |

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

## Links

| What                | Where                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| Radar coder spec    | [`.kiro/specs/radar-coder/`](../.kiro/specs/radar-coder/)               |
| Experience proposal | [`docs/proposals/avoozl-experience.md`](proposals/avoozl-experience.md) |
| Clickable mockups   | [`docs/proposals/experience/`](proposals/experience/)                   |
| Research            | [`docs/research/`](research/)                                           |
