# Simplification audit

Date: 2026-11-18. Code at main `76c940bc`. Owner question: does Avoozl have too
many moving parts, concepts and settings, and is any choice set in two places
when it should be one?

Short answer: yes. The biggest cost is not the number of pages. It is the
same few choices (how many tasks run at once, who merges, where an issue
enters, which model a role uses) each being set in three to ten places, some
of which nothing reads. The schema file also no longer matches what the
loader accepts, so it cannot be used to answer "what can I set".

This is a report. Only pure dead settings and dead code were changed, in a
separate small PR (see [What was removed](#what-was-removed)). Everything else
is a proposal for the owner.

## Top 10 proposals

| # | Proposal | Payoff | Risk |
|---|----------|--------|------|
| 1 | One "how many at once" knob per place: `lanes` per machine (machine config) and release N per repository. Delete the other seven. | High | Medium |
| 2 | Remove or wire Settings › Workspaces › "Agents at once". It is saved and shown but nothing enforces it. | High | Low |
| 3 | One per-repository `landing` block for who merges: mode, auto-merge, merge method. Fold `delivery.ship` (four levels) into it. | High | Medium |
| 4 | One conflict-retry count. `landing.conflictRounds` (2) and `conflicts.maxAttempts` (1) both count fix tries. | Medium | Low |
| 5 | Generate the JSON schema from the validators, or test that they match. About 45 accepted keys are missing from it and about 25 listed keys are dead. | High | Low |
| 6 | One intake list. Five paths turn an issue into work today; retire the legacy `github.issueIntake` and `github.queue` into `intake.sources`. | High | Medium |
| 7 | One way to run work on another machine. Runner mode over SSH, worker mode pull, the supervisor's process executor and the remote crew all do it. | High | High |
| 8 | One `roles` table for harness, agent and model. Today the worker's model is in Delivery, the others in Models, and four more spots pick a model. | Medium | Medium |
| 9 | Decide Routing: the page is gone, but `routing`, `crews set` and the machine files they write still steer the tick. Retire them or give them a home. | Medium | Medium |
| 10 | Hide the Dashboards › CI page until it is built. It is a "Coming later" placeholder, and Flow already shows CI. | Low | Low |

## 1. Inventory

### 1.1 Where settings live

| Layer | File or store | Holds |
|-------|---------------|-------|
| Legacy workspace file | `<workspace>/workspace.json` | Any key; read before `.avoozl.json` (`src/app/layered-config.mjs:350`) |
| Repository file | `<workspace>/.avoozl.json` | Portable, shared settings |
| Machine file | `~/.config/avoozl/config.json` | Same keys plus `machine.*`, `lease.*`; absolute paths |
| Host catalog | `host-config.schema.json` + catalog SQLite | Workspaces, `maxConcurrentRuns` |
| Environment | `AVOOZL_*` (and `AICOMMANDER_*`, `NUPP_WORKSPACE_*`) | Paths, ports, AHP |
| Command line | `--db`, `--documents`, `--port`, … | Same as environment |
| Workspace SQLite meta | `conversationSettings`, `workspaceRepository`, … | Settings saved by operations |
| Machine side files | crews, routing, providers (`src/app/crews.mjs` `machineFile`) | Crew tags, routing prompt, provider facts |

Eight layers. Most users touch two (`.avoozl.json` through Settings, and the
machine file through Workspaces).

### 1.2 Counts

| What | Count | Source |
|------|------:|--------|
| `.avoozl.json` top-level keys in the schema | 41 | `src/avoozl-config.schema.json` |
| Schema `$defs` | 32 | same |
| Schema property paths (all depths) | 356 (280 leaves) | same, walked |
| Keys the loader accepts that the schema lacks | ≈45 | §2.3 |
| Schema keys nothing reads | ≈25 | §2.2 |
| Host config keys | 9 | `src/host-config.schema.json` |
| Settings fields with a `raw=` key in the UI | 85 | `kirocrew-app/ui/src/*.tsx` |
| Nav places | 17 | 7 top items, 5 Dashboards pages, 3 Needs you sections, 2 Retros pages (`kirocrew-app/ui/src/nav-api.ts:7-42`) |
| Settings pages | 9 | `SettingsView.tsx:111-125` |
| Tabs inside each repository's settings | 5 | `SettingsView.tsx:148-154` |
| Tabs inside Settings › GitHub | 5 | `SettingsView.tsx:1202-1207` |
| CLI top-level commands | 58 | `src/app/cli.mjs` dispatch |
| Commands that run but are not in `help` | 2 | §2.6 |
| Named operations | 364 | `src/app/operation-kinds.mjs` |
| Requirements in the main spec | 107 | `.kiro/specs/avoozl/requirements.md` |
| Design sections under §4 | 36 | `.kiro/specs/avoozl/design.md` |

### 1.3 Nav pages and settings pages

- **Nav:** Dashboards (Home, Graph, Delivery, CI, Landing queue), Specs, Needs
  you (Decisions, Triage, Issue Radar), Flow, Retros (Retros, Proposals),
  Activity, Settings.
- **Settings:** Workspaces, Repository setup (per repository: Mode and branch,
  Triggers and labels, Checks, Reviews, Workflow map), GitHub (New tasks, Sync
  pace, Project, Set up GitHub, GitHub calls), Issue Radar, Plugins, Content
  rules, Flow, Models, Delivery.
- **Redirects kept for removed pages:** conflicts, untriaged, routing, trace,
  lanes, flow:retros, flow:proposals; settings issue-radar, radar-values,
  crews, crews-rules, routing, instance (`nav-api.ts:70-102`).

### 1.4 Concepts a user must learn

Each is a word the page, CLI or docs uses as if the reader knows it.

| Area | Concepts |
|------|----------|
| Planning | spec, plan, task, leaf, epic, phase, wave, release (Project field), manifest, revision, approval, approval batch, plan review, review finding, spec journal, spec driver, driver generation, takeover and handoff, gap report, supersede, manual task, gate (tracker gate) |
| Where tasks live | Local only, plans-repo, single-repo, repository role (local, code, planning, both), planning repository, workspace repository, mirror and forward |
| Intake | intake source, Triage (untriaged), rules with actions (respond, plan, deliver, execute, pause, resume, quarantine), legacy issue intake, legacy GitHub queue, Issue Radar plan label, plugins as intake |
| Running work | tick, delivery on or off, Crew Mode runner, lanes, release N and release mode (automatic, step, hold), release scopes, ranking, investigate first, executor (kirocrew, process), harness definition, supervisor, headless tick, runner mode (SSH), worker mode (pull offers), claims, slots, lease and heartbeat, platforms, sandbox, Who codes (coder: worker or issue-radar) |
| Landing | landing mode (direct, pr, train, off), ship mode (auto-merge, manual), merge method, integrator, trains, train targets, policy (optimistic, gated), conflict fix, conflict rounds, union paths, required checks, local checks first |
| Feedback and review | pull request feedback, feedback rounds, reviewers (roles), review drafts, review label, plan reviewer, spec reviewers, Needs you review ("design text changed") |
| Learning | Flow, stop the line (Andon), run anyway, retro, proposal, lessons, rules from corrections, CI waste checks, build receipts, build breakdown, evidence bundle |
| Safety | content rules and allows, privacy scan, allowed actors and minimum permission, protected paths, plugin approval by hash, harness allow-list |
| Integration | Issue Radar handover, crew labels, Radar values, public crews, plugins and packs, trackers |

That is about 100 named ideas. Many are real and needed. The findings below
target the ones that are the same idea under two names, or two knobs for one
choice.

### 1.5 CLI command groups

`init`, `seed`, `examples`, `status`, `workspace`, `project`, `github`,
`rebuild`, `mirror`, `setup`, `integrator`, `landing`, `spec`,
`workspace-repo`, `andon`, `planning`, `query`, `show`, `update`, `task`,
`activity`, `skill`, `mcp`, `tick`, `content`, `plan`, `intake`, `plugins`,
`next`, `flow`, `epics`, `epic`, `public-crews`, `gap-report`, `gate`,
`review`, `checks`, `runner`, `worker`, `driver`, `claim`, `report`, `retry`,
`verify`, `pick-again`, `routing`, `crews`, `app-backend`, `supervisor`,
`backup`, `export`, `import`, `generate`, `check`, `health`,
`register-session`, `session-hook`, `help`, plus any operation name with
`--json`.

## 2. Findings

Ranked by payoff within each group. "Dead" means a search of every non-test
`.mjs`, `.ts`, `.tsx` and `.py` file under `src/`, `kirocrew-app/` and `bin/`
found no reader of the value. Line numbers are at `76c940bc`.

### 2.1 Duplicate settings and overlapping concepts

| # | Kind | What | Where | Evidence | Proposal | Risk |
|---|------|------|-------|----------|----------|------|
| F1 | duplicate setting | **How many tasks run at once has eleven knobs.** `lanes.local` (3), `delivery.concurrency`, `delivery.repositories.*.concurrency`, `github.repositories.*.concurrency` (ignored), host `maxConcurrentRuns` (4, ignored), workspace `maxConcurrentRuns` (2, ignored), `release.capacity` (1 or 2), `release.scopes[].capacity`, `machine.slots`, `radar.crew.count`, `landing.trains.trigger.maxBranches`. | `src/app/lanes.mjs:1-18`; `src/app/delivery.mjs:254-255`, `:2101`; `src/app/github-policy.mjs:358-362`; `src/app/host-config.mjs:21-22`, `:186`, `:231` | `delivery.mjs:255`: `concurrency: delivery.concurrency ?? validateLanes(value.lanes).local`. `github-policy.mjs:360`: the old `concurrency` key "is still accepted and ignored". No reader of `maxConcurrentRuns` outside host-config, catalog-store, CLI and the Workspaces form. | Keep two: **lanes** (chats this machine runs, in the machine file, since it describes "this Mac") and **release N** (issues a repository releases at once). Read `delivery.concurrency` and per-repository `concurrency` as lanes for one release, then drop them. Train `maxBranches` and crew count are batch sizes, not concurrency; rename them in the docs. | Medium: Nupp and Avoozl repos set some of these. Needs a read-old, write-new step. |
| F2 | dead setting shown in UI | **"Agents at once"** in Settings › Workspaces says "How many tasks run here at the same time. 0 holds new work." Nothing enforces it. `setConcurrency` returns `dispatchPaused: limit === 0`, but no code reads it. | `kirocrew-app/ui/src/WorkspaceView.tsx:366-370`; `src/app/host-config.mjs:826-838` | `rg dispatchPaused` finds only `host-config.mjs:835`. `rg maxConcurrentRuns` finds no dispatch reader. `avoozl workspace concurrency ID LIMIT` posts to `workspace.concurrency.configure`, which no operation defines (`cli.mjs:1553`). | Either make this field the machine's lanes (F1), or remove the field and the CLI command. Do not leave a control that lies. | Low. UI change, so it needs screenshots. |
| F3 | duplicate setting | **Who merges is set in five places.** `delivery.ship` at task, spec, repository and workspace level (auto-merge or manual), `projects.*.landing` (direct, pr, train, off), `github.repositories.*.merge.method`, `conflicts.onSourceConflict`, and Delivery's "Who merges". | `src/app/delivery.mjs:264-279`; `src/app/repository-settings.mjs:95-102`; `src/app/github-policy.mjs:795-815`; `kirocrew-app/ui/src/DeliverySettings.tsx:152-158` | `shipMode` walks task → spec → repository → workspace. `landing` is a project key. `pr` + `manual` and `off` both mean "a person merges". | One per-repository `landing` block: `{ mode: direct|pr|train|off, method: squash|merge, conflicts: fix|ask }`. `ship: manual` becomes `mode: off` or `pr` without auto-merge. A task or spec pin keeps working as an override of `mode`. | Medium: four files read ship mode today. |
| F4 | duplicate setting | **Two counts of conflict-fix tries.** `landing.conflictRounds` (default 2) for Avoozl's own branches and trains, and `github.repositories.*.conflicts.maxAttempts` (default 1) for crew pull requests. | `src/app/landing-config.mjs:3-17`; `src/app/github-policy.mjs:795-815`; `src/app/integrator-run.mjs:493` | Both bound "how many times a chat tries to fix one conflict". | One `conflicts.maxAttempts` per repository, read by both paths. Keep the default 2 that landing uses. | Low. |
| F5 | concept that could merge | **Five ways an issue becomes work.** (a) `github.issueIntake` with label and assignee plus `avoozl github sync`, (b) legacy `github.queue` with label behaviors, (c) repository `rules` with action `plan` or `deliver`, (d) `intake.sources` (github, mcp, plugin), (e) Triage of untriaged items. Issue Radar's plan label (`radar.planLabel`) is a sixth trigger. | `src/app/github-policy.mjs:108`, `:908-912`; `src/app/repository-settings.mjs:247-345`, `:1212-1290`; `src/app/intake.mjs`; `src/app/untriaged.mjs`; `kirocrew-app/ui/src/IntakeSources.tsx` | `LEGACY_KEYS = ["issueIntake", "queue"]` are still written by `github configure` (`repository-settings.mjs:1212`, `:1267`) and read through the `github_repositories` table (`operations.mjs:866`, `:2636`, `:6507`). | One list: `intake.sources`, where GitHub is a source kind with its label rule, trust and assignee. Triage is the view of what no source covers. Migrate `issueIntake` and `queue` entries into sources once, and make `github configure` write a source. | Medium: touches sync, the projection and setup. |
| F6 | concept that could merge | **Four ways to run work on another machine.** Runner mode over SSH (R84, `runner accept`/`handoff`/`pull`), worker mode pulling offers from spec journals (R90, `worker pull`/`claim`/`setup`), the supervisor's process executor and headless tick (R97, P61), and the remote Kiro Crew. | `src/app/remote-runner.mjs`; `src/app/worker-claims.mjs`, `worker-offers.mjs`, `worker-setup.mjs`; `src/app/supervisor*.mjs`, `headless-tick*.mjs` | Each has its own CLI group, config and status view. `runner.role` takes `runner`, `worker` or `driver` (`remote-runner.mjs:149`), but the schema only lists `runner` and `driver`. | Pick the supervisor with worker pull as the one remote path (it needs no inbound SSH and is what P61 proved). Retire runner mode over SSH with a deprecation window. | High: requirement change. Owner call. |
| F7 | duplicate setting | **A role's model is picked in seven places.** `models.{planner,planReviewer,retro,reviewDraft}`, `harnesses.{worker,…}`, `delivery.agent` and `delivery.model` (the worker), `delivery.investigate.agent/model`, `delivery.reviewers[].agent/model`, `github.issueIntake.*.provider/model`, and a task manifest's `session` pin. | `src/app/chat-models.mjs:1-95`; `src/app/delivery.mjs:283-320`; `kirocrew-app/ui/src/DeliverySettings.tsx:136-145`; `ModelsSettings.tsx` | Settings › Models says "The harness each role runs on", but the worker's model is in Settings › Delivery. | One `roles` table, one row per role: `{ harness, agent, model }`. Models page edits all rows; Delivery keeps only delivery choices. The Models settings UX review in flight should take this. | Medium. |
| F8 | concept that could merge | **"Claim" means four things.** A Crew Mode `claim TASK --slot`, a worker-mode claim of an offer, a spec driver's machine claim in the plan issue marker, and Issue Radar's claim label. | `src/app/runner.mjs`; `src/app/worker-claims.mjs`; `src/app/driver.mjs:1-9`; `src/app/radar-claims.mjs` | Four modules, four state stores. | Keep the word for the driver's claim only. Rename the others in UI and docs: "take" (Crew Mode), "accept an offer" (worker), "crew label" (Radar). | Low: wording. |
| F9 | concept that could merge | **"Review" means seven things.** Plan review (cross-model), review findings, Needs you "Review N tasks: design text changed", review drafts (review label), pull request reviewers (`delivery.reviewers`), spec reviewers (`github.specReviewers`), and the per-repository Reviews tab. | `src/app/plan-review*.mjs`; `src/app/review-draft.mjs`; `src/app/github-reviews.mjs`; `SettingsView.tsx:152` | Each has its own label or page. | Name them by what is reviewed: "plan review", "code review", "draft review for you", "changed tasks". Use "review" alone for none. | Low. |
| F10 | duplicate setting | **Who may give orders is set in three places.** `github.repositories.*.allowedActors`/`minimumPermission`, `intake.sources.*.allowedActors`/`minimumPermission`, and legacy `github.issueIntake.*.allowedActors`/`minimumPermission`, each with its own default (`write`). | schema lines 717-724, 1626-1634, 1905-1913 | Same two keys, same meaning, three blocks. | One trust list per repository. An intake source names a repository and inherits it; it may only narrow it. | Low. |
| F11 | duplicate setting | **Checks are declared in five places.** `projects.*.checks` (argv lists), `runner.checks`, `github.repositories.*.requiredChecks` (GitHub check names), `landing.trains.validation`, and `avoozl setup --checks`. | schema lines 977, 1385, 1637; `src/app/landing-config.mjs:56-60`; `src/app/setup-landing.mjs:38` | Two kinds: commands Avoozl runs, and GitHub checks it waits on. | Keep those two keys, both per repository. `runner.checks` becomes `projects.*.checks`; trains read `projects.*.checks` unless they set their own. | Low. |
| F12 | duplicate setting | **Base branch in two places** that must agree: `projects.*.baseBranch` and `github.repositories.*.baseBranch`. | schema lines 1373, 1550 | `github-policy.mjs` requires the GitHub one in a GitHub mode; delivery reads the project one. | Read one (the project's). Fill the GitHub one from it. | Low. |
| F13 | default that could be fixed | **GitHub mode is both stored and derived.** `github.mode` and `github.planningRepository` are written, but the roles decide them (`deriveGitHubKeys`). | `src/app/repository-roles.mjs:1-5`; `kirocrew-app/ui/src/settings-api.ts:1005-1024` | The file says "`github.mode` stays readable: a file with no `role` is read through them". | Stop writing `github.mode`; read it only for files with no roles. Remove "mode" from user-facing text, since roles explain it. | Low. |
| F14 | concept that could merge | **Four ways to pause work.** Delivery off, release mode `hold`, Flow "stop the line" (and `run-anyway`), and Kiro Crew stopping a chat. Plus `release.mode: step`. | `DeliverySettings.tsx:18`; `kirocrew-app/ui/src/ReleaseMode.tsx`; `src/app/flow-line.mjs` | Each pauses at a different point, but the page shows them in three places. | One "Paused" control on Home that lists every active pause and its scope, and offers resume. Keep the mechanisms. | Low. |
| F15 | wrong layer | **`lanes.local` is in `.avoozl.json`** but describes this machine ("how many worker chats this Mac runs"). Every machine that checks out the repo gets the same number. `machine.slots` and `lease` are already refused in the repo file for this reason. | `src/app/lanes.mjs:1-4`; `src/app/landing-config.mjs:304-310` | `assertNoMachineKeys` refuses `machine.platforms`, `machine.slots`, `lease` in the repo file but not `lanes`. | Move lanes to the machine file (F1). Read the repo value as a fallback for one release. | Low. |
| F16 | concept that could merge | **Crew Mode runner** (`delivery.runner: crew-mode`, `next`, `claim`, `report`) is a second dispatcher beside the tick. | `src/app/runner.mjs:1-5`; `src/app/runner.mjs:295` | It exists for a conductor chat that drives rounds itself. The tick already starts chats for ready leaves. | Confirm someone still uses it. If not, retire `delivery.runner` and the `next`/`claim` commands; keep `report`. | Medium. |
| F17 | duplicate setting | **GitHub cache seconds at two levels:** `github.cacheSeconds` and `github.repositories.*.cacheSeconds`. | schema lines 1450, 1663 | A per-repository cache time is unlikely to be needed. | Keep the workspace value only. | Low. |
| F18 | default that could be fixed | **Seventeen label names are settings.** Six `managedLabels`, six Radar labels (plan, conflict, approval, review, drafted, tracker), two crew labels, `githubIssueIntake.label`, plus `priorityLabels` and `waitingLabels`. | `src/app/github-policy.mjs:27-107` | Every one has an `avoozl:` default (`RADAR_DEFAULTS`). | Keep the defaults fixed and allow a rename only through a plugin pack, not a Settings field each. Hides about 15 fields. | Low. |

### 2.2 Dead settings and dead code

| # | Kind | What | Where | Evidence | Proposal | Risk |
|---|------|------|-------|----------|----------|------|
| D1 | dead setting | `review` (review classes, humans, agents, `agentReviewer.mustDifferBy`, `excludeImplementer`, …) | schema line 145, `$defs.reviewPolicy` 1981, `reviewClass` | `rg` for `excludeImplementer`, `defaultClass`, `mustDifferBy`, `agentIsAdvisory`, `requireHumanAcceptance` finds only the schema and an old note in `plans/`. No `config.review` reader. | **Removed from the schema.** | None: the loader never read it, and unknown top-level keys still pass. |
| D2 | dead setting | `safety` (andon authority rules, separation of duty, coordinator mode) | schema line 618, `$defs.safetyPolicy` 2067 and three more | `src/app/moved-operations.mjs:17-18`: "The andon gate was replaced by repository rule actions". `config.mjs:89` copied it into `workspaceConfig().safety`, which nothing reads. | **Removed from the schema and `config.mjs`.** | None. |
| D3 | dead setting | `conversations.driver`, `conversations.routing` and the `agentRouting`, `agentRouteChoice`, `agentRouteRule` defs | schema lines 1244-1330 | `src/app/repository-settings.mjs:543-546`: "`driver` and `routing` configured the removed agent host; files that set them still load, and the values are ignored." | **Schema now marks both as ignored**, so old files still validate. | None. |
| D4 | dead setting | `models.driver` | schema line 159 | `src/app/chat-models.mjs:22-25`: retired role, "accepted and dropped". | **Schema now marks it ignored.** | None. |
| D5 | dead setting | `github.repositories.*.concurrency` (schema default 1) | schema line 1669 | `src/app/github-policy.mjs:360-361`: "still accepted and ignored". | **Schema now marks it ignored** and drops the misleading default. | None. |
| D6 | dead setting | Top-level `repository` (`id`, `roles`, `baseBranch`) and `planning` (`documents`, `exclude`) | schema lines 33, 36, `$defs.repository` 1061, `$defs.planning` 1083 | No reader of `config.repository` or `config.planning` in the loaded `.avoozl.json`. `workspace-repository.mjs` uses its own `config.repository` from SQLite meta. Roles moved to `github.repositories.*.role`. | **Removed from the schema.** | None. |
| D7 | dead code | `freeLocalLanes`, `startWithinLanes` | `src/app/lanes.mjs:20-26` | Only `src/app/test/lanes.test.mjs` imports them. Delivery uses `validateLanes` only. | **Removed, with their test lines.** | None. |
| D8 | dead setting | `ahp.*` and its flat aliases `ahpPort`, `ahpHost`, `ahpProjection`, `ahpTokens`, `ahpManifest`; `canvasOrigins`; `agentManifest` | schema lines 64, 79, 87, 826-860; `src/app/layered-config.mjs:164-176`, `:236-260`, `:280-295` | Parsed from files, environment and flags, then never read. Leftovers of the VS Code extension and agent host (design table row at line 7066). | Proposal, not removed: the path and secret allowlists at `layered-config.mjs:24-37` must keep accepting these keys so old files load, and the compatibility test asserts their path rewriting. Remove in one change with that test. | Low. |
| D9 | dead setting | `delivery.repositories.*.concurrency` once F1 lands | `src/app/delivery.mjs:2101` | Still read today. | Covered by F1. | — |
| D10 | not dead, unwired | `src/app/worker-results.mjs` | merged in #560 | Only its test imports it. It is new (task 43.5) and the next worker task wires it. | Leave it. Listed so nobody deletes it. | — |

### 2.3 Schema and validator mismatch

The schema at `src/avoozl-config.schema.json` is what an editor shows and what
`repository-settings.mjs:765` hands the page. It has drifted from the
validators.

**Accepted by the loader, missing from the schema** (found by comparing every
`raw=` key in the UI and every `onlyKeys` list with the schema):

- `flow.*` (stop scope, `localChecksFirst`, `batch.max`, `batch.by`, `ci.windowDays`, `ci.docsOnlyMinutes`, `ci.waitShare`, `ci.minPullRequests`, `retro.everyTasks`, `retro.slowFactor`, `retro.instructions`); read by `src/app/flow.mjs:161`, `:248`.
- `harnesses.*` (`src/app/chat-models.mjs:80-95`).
- `delivery.model`, `delivery.prFeedback`, `delivery.feedbackRounds`, `delivery.reviewers`, and the same under `delivery.repositories.*` (`src/app/delivery.mjs:218-240`).
- `projects.*.landing`, `executor`, `harness`, `sandbox`, `checksEnv`, `worktreeHelper` (`src/app/repository-settings.mjs:105-122`).
- `github.writesPerMinute`, `writesPerHour`, `subIssues`, `issues`, `specReviewers` (`src/app/github-policy.mjs:110-123`).
- `github.repositories.*`: `pullRequestReviews`, `crewLabels`, `approval`, `acceptedLabel`, `stackedPullRequests`, `commentSteering`, `discussions`, `untriaged`, `mirror`, `merge` (`github-policy.mjs:440-473`), and Radar's `reviewLabel`, `draftedLabel`, `trackerLabel` (`github-policy.mjs:85-98`).
- `runner.role: "worker"` (`src/app/remote-runner.mjs:96`).
- `github.issueIntake.*.managedLabel` (`repository-settings.mjs:252`).

**Proposal (F19):** generate the schema's property lists from the validators'
key lists, or add one test that walks every `onlyKeys` list and the schema and
fails on a difference. Payoff: high, because it is the only full list of what a
user can set. Risk: low.

### 2.4 Pages that could merge or go

| # | Kind | What | Where | Evidence | Proposal | Risk |
|---|------|------|-------|----------|----------|------|
| P1 | page that could go | Dashboards › CI | `kirocrew-app/ui/src/App.tsx:451-452` | Renders `<Placeholder … line="Coming later: …">`, the only placeholder page. Flow already shows CI minutes (`FlowView.tsx:344` `<CiFlow>`). | Take it off the nav until it has content. Keep the redirect. | Low. |
| P2 | page that could merge | Retros › Retros and Retros › Proposals | `nav-api.ts:22-26` | A proposal is the output of a retro. | One Retros page with each retro's proposals under it and a "waiting on you" filter. | Low. UI change. |
| P3 | page that could merge | Settings › Issue Radar and the per-repository Triggers and labels tab | `SettingsView.tsx:117`, `:150` | Both edit labels per repository. The blurb says Radar settings "have their own page". | Put each repository's Radar labels in its Triggers and labels tab; keep the Radar page for the copy-into-Radar values only. | Low. |
| P4 | page that could merge | Activity page and task Timeline | `App.tsx:456`; design §4.35 | Trace moved into task details; Activity is the same events across tasks. | Keep both, but make Activity a filter of the same timeline component so the two do not drift. | Low. |

### 2.5 Leftovers of removed features

| Feature | Status at `76c940bc` |
|---------|----------------------|
| Budgets | Gone from settings and nav. `budget` now means GitHub read budgets and `--max-budget-usd` only. PR #463 (`task/settings-inline-edit-budgets`) is still open; close it if Budgets is fully gone. |
| Lanes page | Gone; `lanes` redirects to Delivery (`nav-api.ts:86-88`). The setting stays (F1, F15). |
| Trace | Gone (R106). `OldTraceLink.tsx` and `parseTraceLink` keep old links working. Keep for now. |
| Routing page | Gone, but the `routing` and `crews` CLI commands, the `routing.*` and `crews.update` operations and their machine files still feed placement in the tick (`src/app/tick.mjs:33-41`, `src/app/routing.mjs:1-2`). See F20. |
| Driver chat | Gone. `models.driver` and `conversations.driver` are ignored (D3, D4). The spec driver (one machine per spec) is a different thing and stays. |
| Remote coder | Gone. `coder: "remote"` fails with a clear line (`github-policy.mjs:482-485`). Good as is. |
| Onboard | Still live (`Onboard.tsx`, `onboarding.mjs`). Not a leftover. |
| Batching settings | `flow.batch.max` and `flow.batch.by` are still on Settings › Flow (`FlowSettings.tsx:142-157`). In flight: PR #576. |
| Who codes | Still on each repository (`coder`). In flight: PR #575. |
| VS Code extension and agent host | `ahp.*`, `canvasOrigins`, `agentManifest` (D8). |

**F20 (proposal):** Routing has no page, but `avoozl routing set` and
`avoozl crews set` still write machine files that the tick reads for crew
placement and provider checks. Either retire placement (the owner scrapped
local workers on 2026-11-14), or show the current values read-only on
Settings › Delivery so a person can see why a task waits. Risk: medium.

### 2.6 CLI and UI mismatches

| # | What | Evidence | Proposal |
|---|------|----------|----------|
| C1 | `workspace concurrency ID LIMIT` claims "Zero pauses new dispatch". | Nothing enforces it (F2). | Remove with F2, or wire it. |
| C2 | `routing` and `crews set` have no page. | §2.5. | F20. |
| C3 | `register-session` and `session-hook` run but are not in `help`. The help is one flat list of 58 commands. | `rg "^  register-session\|^  session-hook" src/app/cli.mjs` finds nothing. | Add the two hook commands under an "Agent hooks" heading. Group help by job (setup, plan, deliver, land, inspect). |
| C4 | `andon` prints where the old gate went. | `cli.mjs:1568-1572`. | Remove after one more release; `flow stop` is the command. |
| C5 | Settings › Flow edits batching; the planner is about to decide it. | In flight (#576). | — |
| C6 | Settings › Workspaces edits a limit that the CLI's `--max-concurrent-runs` also sets, and neither is read. | F2. | F2. |

## 3. Already decided and in flight

Listed so nobody redoes them:

- **Who codes removed** — spec PR #575 (`spec/remove-who-codes`, R91.6, task 45.6).
- **Batching decided by the planner, no setting** — spec PR #576 (`spec/agent-batching`, R108, design 4.37, task 61.1).
- **Models settings UX review** — in flight; F7 is input for it.
- **Delivery settings UX review** — in flight; F3 and F14 are input for it.

## What was removed

A separate PR removes only D1-D7. Old `.avoozl.json` files that still set
these keys load as before: the loader never read D1, D2 and D6, and keeps
accepting and ignoring D3-D5. The schema marks D3-D5 as ignored instead of
dropping them, so an editor does not flag an old file.

## Not checked

- Plugin packs can set keys under `delivery` (`src/app/plugin-pack.mjs:49`,
  which still lists `runner` and `concurrency`); packs in the wild were not
  read.
- The Nupp workspace's real `.avoozl.json` was not read, so F1, F3 and F5
  migrations need a check against it.
- Dead exports were searched for module by module only in `lanes.mjs`; a full
  unused-export scan of `src/app` was not run.
