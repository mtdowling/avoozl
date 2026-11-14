# Avoozl overview

Status marks, checked against the code and the task checkboxes in
`.kiro/specs/radar-coder/tasks.md` on `main`, not against the spec text:

- **built**: in the code and tested.
- **fake-tested**: in the code, tested only against a fake GitHub or fake remote tool. Never run on a real repository. Every proof task (`rc-p*`) is still open, so most Radar work sits here.
- **spec-only**: written in the spec, not in the code.

## 1. What Avoozl is

Avoozl plans epics. It turns an approved spec into GitHub issues, releases
them in order, and shows where each one stands. Another tool writes the code.

| Is                                                                                         | Is not                                                                     | Mark                                 |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------ |
| Plans epics: spec, tasks, issues, order                                                    | A triage tool                                                              | built                                |
| Hands ready issues to Issue Radar crews (default coder)                                    | A maintenance tool                                                         | fake-tested                          |
| Keeps its own local workers for repos without Radar (`coder: worker`), frozen: upkeep only | A pull request reviewer (one exception: review drafts by label, section 2) | built                                |
| Can hand tasks to a managed remote harness (`coder: remote`) as a plug                     | Tied to any named remote product                                           | fake-tested                          |
| Shows Needs you, On the line, Release queue, Trace, Flow                                   | A second issue or PR list (Radar and GitHub already have them)             | built, Flow spec-only on GitHub data |

Where a plan is for one small change, Avoozl says so and offers
"Plan it anyway" (RC13): built.

## 2. The three workflows

| Workflow                   | Path                                                                                                                                                                                                                                   | Mark                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Maintenance, by Radar      | Radar crews take issues, open pull requests, auto-merge arms when checks pass. Avoozl does not triage or plan these. It shows them on Home and Trace.                                                                                  | fake-tested (arming, claims, release); `rc-p5` open   |
| Epic from an approved plan | Spec Builder writes requirements, design, tasks. Approve opens an approval pull request. Projection makes issues (sub-issues of the source issue). Release gates by capacity, phase and Stop the line. The coder builds. Merge. Retro. | fake-tested; `rc-p2`, `rc-p3`, `rc-p4`, `rc-p11` open |
| Tag-based review drafts    | A person adds the review label to a pull request. One read-only chat drafts a pending review with line comments. The person edits and submits it. Avoozl never submits.                                                                | spec-only (`rc-20.1` to `rc-20.4` unchecked)          |

## 3. Labels

Every label is a per-repository setting. No behavior needs an `avoozl:`
prefix. The table shows what the code reads now and the default the spec
sets (RC21).

| Role                                              | Setting                 | Default in code now                                     | Default in spec (RC21)  | Who writes it         |
| ------------------------------------------------- | ----------------------- | ------------------------------------------------------- | ----------------------- | --------------------- |
| Planning (starts a plan)                          | `radar.planLabel`       | `to plan`                                               | `avoozl:plan`           | A person              |
| Ready (a crew may take it)                        | `managedLabels.ready`   | `avoozl:ready`                                          | same                    | Avoozl, on release    |
| Managed marker                                    | `managedLabels`         | `avoozl:managed`                                        | same                    | Avoozl                |
| Approval                                          | `radar.approvalLabel`   | `plan approved`                                         | `avoozl:plan-approved`  | A person              |
| Merge conflict                                    | `radar.conflictLabel`   | `merge conflict`                                        | `avoozl:merge-conflict` | Avoozl                |
| Review (starts a draft)                           | `radar.reviewLabel`     | none                                                    | `avoozl:review`         | A person              |
| Drafted                                           | `radar.draftedLabel`    | none                                                    | `avoozl:drafted`        | Avoozl                |
| Accepted (a skipped issue may be planned)         | `acceptedLabel`         | unset                                                   | unset                   | An allowed person     |
| Worker queue states: blocked, review, quarantined | `githubLabelBehaviors`  | `avoozl:blocked`, `avoozl:review`, `avoozl:quarantined` | same                    | Avoozl (worker coder) |
| Radar's claim                                     | `crewLabels.claim`      | `crew: in progress`                                     | same, Radar's           | Radar                 |
| Radar's needs-human                               | `crewLabels.needsHuman` | `crew: needs human`                                     | same, Radar's           | Radar                 |

Avoozl reads Radar's two labels and does not write them, except one claim at
approval (RC19, built). Two labels that are equal are refused (built for
planning, ready, claim, needs-human, conflict, approval). The rename and the
review and drafted labels are spec-only (`rc-20.1`).

## 4. Screens

Verdicts are the owner's decisions. UI removal happens now. Code removal
waits for the real-repository proof (`rc-p11`). The `plans_*` MCP names and
the `NUPP_WORKSPACE` and `AICOMMANDER_*` aliases stay.

### Page tabs

| Screen                                                                    | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Why                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Home (Dashboard): Needs you, On the line, Release queue, Progress by goal | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Radar's lists do not show epics or release order. Built.                                                      |
| Specs (with Spec Builder, approval, projection, quick goal)               | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The core of planning. Built.                                                                                  |
| Graph                                                                     | Remove the tab. For issues on GitHub, link to Issue Radar's Graph (Frontier and Focus over live blocked-by edges), deep link to Focus on the issue if Radar's route supports it, else the tab. Keep Avoozl's graph only inside Specs (a plan before projection; epic, plan, phase drill-down, with phase gate, release count, held reasons) and beside the local-workers view for `coder: worker` repos. Back-stack and drill rules stay.                          | Radar shows live edges; Avoozl shows what Radar cannot. Built today as a tab.                                 |
| Trace (page and drawer)                                                   | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                               | One path per issue, from GitHub times. Built.                                                                 |
| Flow                                                                      | Keep, rebuild on GitHub data (RC8.5), retros under it                                                                                                                                                                                                                                                                                                                                                                                                              | Today it reads local worker data. The GitHub rebuild is spec-only (`rc-8.4`, `rc-8.5` unchecked).             |
| Delivery                                                                  | Remove from the nav. Show it only when the workspace has a `coder: worker` repo, labeled "local workers". Lane map for Radar repos: Ready is Home Release queue. In progress is On the line (all machines) and Radar's Pipeline lanes or crew page (this machine). Needs you is Waiting on you. Waiting on blockers is Release queue held reasons and Graph. Done is Trace. Move any held or blocker text Delivery has and Release queue lacks into Release queue. | Its controls (Defer, Start now, Retry, review runs, content rule reports) act only on Avoozl's local workers. |
| Conflicts                                                                 | Remove the tab. Fold into Needs you (RC8.1). Still a tab in the code today.                                                                                                                                                                                                                                                                                                                                                                                        | One queue for what waits on a person.                                                                         |
| Intake                                                                    | Remove the tab. Fold into Needs you.                                                                                                                                                                                                                                                                                                                                                                                                                               | Radar handbacks and planning-label items become Needs you rows. Where Ideas go is not decided.                |
| Activity                                                                  | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Who did what, from the page, MCP, GitHub and plugins. Built.                                                  |
| Settings                                                                  | Keep, with the removals below                                                                                                                                                                                                                                                                                                                                                                                                                                      |                                                                                                               |
| Review drafts list                                                        | Add (spec-only, RC20)                                                                                                                                                                                                                                                                                                                                                                                                                                              | The one pull request feature.                                                                                 |

### Settings tabs

| Tab                                                                           | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Workspaces, Repositories (with Crews and rules, per-repo coder, release mode) | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Where tasks live                                                              | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Plugins, Content rules                                                        | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Flow (settings)                                                               | Keep                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Delivery                                                                      | Remove from the nav. Show it only when the workspace has a `coder: worker` repo, labeled "local workers". Lane map for Radar repos: Ready is Home Release queue. In progress is On the line (all machines) and Radar's Pipeline lanes or crew page (this machine). Needs you is Waiting on you. Waiting on blockers is Release queue held reasons and Graph. Done is Trace. Move any held or blocker text Delivery has and Release queue lacks into Release queue. | Its controls (Defer, Start now, Retry, review runs, content rule reports) act only on Avoozl's local workers. |
| Budgets                                                                       | Keep for planner, retro and quick-goal chats. Remove per-task worker budgets and price fields. Built-in prices stay, with no page.                                                                                                                                                                                                                                                                                                                                 |
| Routing                                                                       | Remove from the nav. Keep its code path only where RC11.3 needs it, for `coder: worker` on local-only repos, opened from that repo's Settings.                                                                                                                                                                                                                                                                                                                     |

### Other surfaces

| Surface                                                                        | Verdict                              |
| ------------------------------------------------------------------------------ | ------------------------------------ |
| Side panel tab "Avoozl" (spec check and Approve, the crew a chat is on, recap) | Keep. Built.                         |
| Set up wizard, Radar values screen                                             | Keep. Fake-tested.                   |
| Quick goal modal and proposal screen                                           | Keep. Fake-tested.                   |
| Release mode and Release queue, Stop the line                                  | Keep. Fake-tested.                   |
| Integration branches                                                           | Keep. Fake-tested.                   |
| Demo and walkthrough                                                           | Keep. Retarget to crews (`rc-12.8`). |
| Runner mode                                                                    | Remove from nav and Home             |
| Remote relay                                                                   | Remove from nav and Home             |
| Foreman                                                                        | Never built. Stays unbuilt.          |
| Per-task worker budgets, Prices                                                | Remove from nav and Home             |
| Worker Files and diff fold on Radar repos                                      | Remove                               |

## 5. What is retired, and when

| Item                                                                        | UI  | Code                             | Spec task   |
| --------------------------------------------------------------------------- | --- | -------------------------------- | ----------- |
| Routing page, crew routing and placement                                    | Now | After `rc-p11`, Radar repos only | `rc-12.3`   |
| Runner mode                                                                 | Now | After `rc-p11`                   | `rc-12.4`   |
| Remote relay                                                                | Now | After `rc-p11`                   | `rc-12.5`   |
| Per-task worker budgets, worker Files and diff fold                         | Now | After `rc-p11`                   | `rc-12.6`   |
| Worker dispatch                                                             | n/a | After `rc-p11`, Radar repos only | `rc-12.2`   |
| Intake page, Delivery tab (kept for worker repos), Graph tab, Conflicts tab | Now | After `rc-p11`                   | No task yet |

Not retired: `coder: worker` for local-only repos (frozen), the `plans_*`
MCP names, the environment aliases, the `aicommander` command and the
`aicommander.*` editor settings. A compatibility test guards them
(`rc-12.7`, spec-only).

## 6. Links

| What                | Where                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| Radar coder spec    | [`.kiro/specs/radar-coder/`](../.kiro/specs/radar-coder/)               |
| Experience proposal | [`docs/proposals/avoozl-experience.md`](proposals/avoozl-experience.md) |
| Clickable mockups   | [`docs/proposals/experience/`](proposals/experience/)                   |
| Research            | [`docs/research/`](research/)                                           |
