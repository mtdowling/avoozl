---
repo: avoozl
---
# Tasks: checks from a plugin

Explicit `after` lists and each task's `after` fact govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`PK1` to `PK9`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

Phase 1 makes `task` plugin checks run with every filter, as run steps
and as MCP steps. Phase 2 adds the
`phase` and `branch` stages. Phase 3 shows them and documents them. `pk-p1`
proves the whole path on a scratch repository.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces, real git with a bare remote, fake executors and only fake
plugins kept in the test tree (R34.11); Avoozl runs the repository's checks;
no real workspace data, machine configuration, credentials or personal plans
in the repository (AGENTS.md); never force push any branch. Public files
name no company-internal tool (R34.10); examples use neutral names such as
`acme/*` and `parity`. Screen changes need phone and desktop, light and dark
screenshots for owner approval before merge (R92.12); screenshots are shown
to the owner and never committed (AGENTS.md).

Approval lives in Avoozl, not in these files. Approving the spec, creating
issues and starting agents are separate acts. Task IDs start with `pk-` so
they never collide with the IDs of the other specs.

## Phase 1: Task-stage plugin checks

- [ ] pk-1.1 The checks part in the manifest [PK1] (§D1, §D2)
  - $done: Tests: D1's manifest validates and `inspectPlugin` carries its two checks; each PK1.4 key out of range is refused with an error naming the plugin, check and key; a `run[0]` or `decide` outside the folder, with `..`, absolute or missing is refused; `decideAt` without `decide`, `checks` without `provides: checks`, and a 21st check are refused; a checks-only plugin with an `entry` is refused; an invalid part makes the plugin invalid and `approvePlugin` refuses it; the existing plugin tests pass unchanged.
  - `PARTS` gains `checks`; `src/app/plugins/plugin-checks.mjs` holds `validateChecksPart` and `approvedPluginChecks`; `validateManifest` calls the validator; the config schema and `docs/plugins.md`'s manifest table name the key.
- [ ] pk-1.2 One check list and running a plugin check, after pk-1.1 [PK2, PK4.1, PK7.1, PK7.3, PK7.4, PK7.5, PK7.7] (§D3, §D4)
  - $done: Tests with a fake plugin and real git: a `task` plugin check runs on a matching repository and not on another; `paths` skip it as for repository checks; a name equal to a repository check is shadowed; two plugins with one name are both held with one Needs you item; placeholders become the commit, base and `owner/name`; a `.mjs` script runs with Avoozl's Node on all three CI platforms; `GH_TOKEN`, `SSH_AUTH_SOCK` and the gateway secrets never reach the script even when listed in `env`; `network: false` runs offline in a sandbox whose repository isolation has the network on; a script that starts a child which listens on a port is stopped, failed with the reason and its plugin marked broken; a local-folder plugin edited after approval does not run; a merge batch candidate runs the task plugin checks; every caller of `repositoryChecks` passes the plugin list (a test greps for a call without it).
  - $after: pk-1.1
  - `repositoryChecks(repository, plugins)` and `selectedChecks(..., stage)` return one list with `source` and `stage`; every caller D3 lists passes `approvedPluginChecks`; `runEach` resolves `run[0]`, fills placeholders, filters the environment with the shared code, and passes per-check `network` and the read-only plugin folder to `isolatedCheck`; the listener watch covers the process tree.
- [ ] pk-1.3 The result cache, after pk-1.2 [PK5] (§D5, §D6)
  - $done: Tests: a second task with the same content of the matched paths reuses a passed and a failed result, marked cached with the first commit; a change outside `paths` hits the cache and one inside misses; a check without `paths` misses on any tracked change; with `{base}` in `run` a different base misses; a not-run result is never stored; the merge batch rerun runs the command and replaces the entry; entry 5,001 drops the oldest, and an entry older than 30 days is dropped; a new plugin version misses.
  - $after: pk-1.2
  - `flow_records` kind `check-cache` keyed by D6's content key from `git ls-tree -r`; `runOne` checks it after the decide answer and before the command; `fresh: true` on the rerun.
- [ ] pk-1.4 The decide call, after pk-1.2 [PK3, PK7.6, PK7.8] (§D5)
  - $done: Tests with a fake executor: approval queues one `approve` call per applicable task and a `true` there skips the `diff` call; a `done` report queues one `diff` call per commit; `needed: false` records `skipped: decide`; output that is not exactly `{needed, reason}`, a failed call, a timeout, no model, and an input over 200 KB each count as `true` with the cause; a diff holding instructions to change other checks changes nothing but that answer; the run waits while a check is Deciding and then holds every check in one record; **Run it** and **Skip it** are refused over MCP and for an app token and accepted from a person; a new commit drops the flip; no answer appears in a spec file, issue body, pull request body or commit; the tick makes no model call (the existing tick test holds).
  - $after: pk-1.2
  - The `checkDecide` row in `role-table.mjs` (read, snapshot, offline, a 1 KB `decide.json`, hands `decide`) and `prompts/check-decide.md`; `check-decide` records; queuing at approval and at `done`; the app backend drains them beside check runs; the flip operation in `src/app/ops/`, person-only; Settings › Models lists the role.
- [ ] pk-1.5 A required plugin check, after pk-1.2 [PK6] (§D8)
  - $done: Tests: a repository whose `requiredChecks` names `parity` waits for the local result on that exact head and lands after it passes; under `pr` landing auto-merge is armed only after it; a passing GitHub check named `parity` does not satisfy it while the plugin provides the name; with the plugin absent the task waits with one Needs you item naming the check, and a second tick opens none; `mergePath` does not ask for a branch rule for `parity` while still asking for a CI name; the pull request body and Activity hold the check's name and result and none of the plugin's paths, prompt or script text; a run, MCP, phase and branch plugin check through a recording fake GitHub makes no commit status, check run, comment or review.
  - $after: pk-1.2
  - One reader for a required name's result in `landing-pulls.mjs`, `merge-path.mjs` and the direct landing gate: the local plugin result for a name a plugin provides, GitHub for any other; the Needs you item; PR text from name and result only; the check-run path gets no GitHub client.

- [ ] pk-1.6 MCP steps, after pk-1.3, pk-1.4 [PK10, PK1.4, PK7.2] (§D1, §D6, §D13)
  - $done: Tests with a fake stdio MCP server in the test tree: D1's `parity-review` validates, and a step naming an undeclared alias, an unused alias, an unknown placeholder, a path with a filter, or `network` on an MCP step is refused; a mapping with a credential-like key or value is refused, and setting one is refused over MCP and for an app token; a changed mapping stops the check until the plugin is approved again; with no mapping the check is not run naming the alias; start, three polls and a result pass and fail by `pass`; an MCP error, a reply with no JSON, a missing `id`, a missing result value and a timeout each fail; a tool missing from `tools/list` is not run; a reply naming another tool or holding instructions changes nothing and no tool outside the step is called (the fake server records every call); the stored output is only the `text` value, bounded and redacted; the server sees its mapping's `env` and never `GH_TOKEN`, `SSH_AUTH_SOCK` or the gateway secrets; a server that opens a listener is stopped and its plugin marked broken; a backend killed mid-poll resumes the same id and the fake server saw one `start`; a cache hit makes no call, and a changed mapping misses; the decide prompt and stages apply as for a run step.
  - $after: pk-1.3, pk-1.4
  - `src/app/plugins/mcp-steps.mjs`: the stdio client, the path reader and D13's loop, with the line reader and listener check shared with plugin children; `servers` and `mcp` in `validateChecksPart`; the `mcp` mapping in `plugins.json`, person-only, its hash bound to the approval; `mcpId` on the check-run record.

## Phase 2: Phase and branch stages

- [ ] pk-2.1 The `phase` stage, after pk-1.3, pk-1.4 [PK4.2, PK4.3, PK4.5] (§D7)
  - $done: Tests with real git and a bare remote: a two-task phase runs its `phase` check once, after both landed, at the last landing commit with `{base}` before the first; no task waited on it; a decide check applies when either task had `true`; a failure opens one Needs you item with the proposed fix text in an untrusted block; Start creates a fix in that phase through `startFix`; after the fix lands the check runs again and passes; a phase whose combined diff misses `paths` runs nothing.
  - $after: pk-1.3, pk-1.4
  - `check-run` records with `scope: {kind: "phase", ...}`; the tick queues one per phase and last landing commit; `startFix` takes `{plan, phase}`; the Needs you item with Start.
- [ ] pk-2.2 The `branch` stage, after pk-1.3, pk-1.4 [PK4.4, PK4.5] (§D7)
  - $done: Tests: each new integration branch head queues one `branch` check run; a pending result keeps the head pending, a failure makes it red and stops the epic's line, and a pass with green CI makes it green; no task landing into the branch waits on it; a head the check's `paths` miss is not held by it.
  - $after: pk-1.3, pk-1.4
  - `check-run` records with `scope: {kind: "branch", ...}`; `headState` in `integration-head.mjs` reads local plugin results beside GitHub checks.

## Phase 3: Visible and documented

- [ ] pk-3.1 Plugin checks on the page and in reads, after pk-1.5, pk-1.6, pk-2.1, pk-2.2 [PK7.2, PK8, PK4.6] (§D10)
  - $done: UI and CLI tests from fixture records: a task's checks list each plugin check with its plugin, result, skip filter and cached mark; decide answers show with Run it and Skip it; the Epics page shows phase and branch results; Settings › Plugins shows each check's PK7.2 fields, the prompt text, each MCP step's tools, arguments and sent files, each alias with its mapping and a Set mapping action, and shadowed and clashing repositories; `avoozl show TASK --json` and the MCP task read return the same fields; Flow counts plugin check and decide time in `checks`; screenshots at 390 and 1280 px, light and dark, go to the owner.
  - $after: pk-1.5, pk-1.6, pk-2.1, pk-2.2
  - Task › Checks, Epics, Settings › Plugins and the approval view, from stored records only.
- [ ] pk-3.2 Docs and the plugin skill, after pk-3.1 [PK9] (§D1, §D9)
  - $done: `docs/plugins.md` has a Checks part section with D1's manifest, prompt, a script, the MCP step and its `plugins.json` mapping, and says results never post to GitHub; `docs/checks.md` links it and its table of code Avoozl runs gains a plugin check row; the `avoozl-plugin` skill names the part; the release leak scan passes on the new docs and fixtures; `node scripts/check/spec-lint.mjs` reports 0 errors.
  - $after: pk-3.1
  - The guide states the speed-bump limit for Kiro Crew chat executors (PK7.8).

- [ ] pk-p1 Proof: a slow outside check on a scratch repository, after pk-1.5, pk-1.6, pk-2.1, pk-2.2, pk-3.1 [PK1 to PK10] (§D5, §D6, §D7, §D8, §D13)
  - $done: Expected result observed; receipt under `docs/evidence/`, with no image committed.
  - $manual: true
  - $after: pk-1.5, pk-1.6, pk-2.1, pk-2.2, pk-3.1
  - Setup: an isolated workspace; a scratch repository `acme/api` with a bare remote; a fake review service the proof script starts on `127.0.0.1` that answers each request after 60 seconds and fails any change to `schema/`; a local-folder plugin `acme-checks` with check `parity` (`repos: ["acme/*"]`, `paths: ["src/api/**", "schema/**"]`, `network: true`, a decide prompt, `decideAt: ["approve", "diff"]`, `stage: "task"`), added in this machine's `plugins.json` and approved in Settings; `requiredChecks: ["parity"]` on the repository; one spec with four tasks: a docs edit, a `src/api` refactor the prompt calls internal, a `src/api` change to a response field, and a `schema/` change. For the MCP leg: a fake stdio MCP server the proof script ships, whose `create_review` returns an id at once and whose `get_review` reports `running` for 90 seconds and then a verdict (`same`, or `differs` for any change to `schema/`), logging every call; check `parity-review` from D1 as `stage: "task"`, with the alias mapped in this machine's `plugins.json`.
  - Action: (1) approve the spec and run the tick until the queue is empty; (2) rerun the third task's check on the same content; (3) edit the plugin's script and run one more tick; (4) switch the check to `stage: "phase"`, approve again and run a two-task phase; (5) MCP leg: enable `parity-review`, run the field change and the schema change, and restart the app backend once mid-poll; (6) change the alias's mapping and run one more tick.
  - Expected: (1) the docs task lands with `parity` skipped by paths; the refactor lands with `skipped: decide` and its reason; the field change waits about 60 seconds and lands; the schema change fails and goes back to its worker; nothing of the plugin is in the repository, its branches or pull request text but the name `parity`; (2) the rerun is cached and takes under a second; (3) no check runs until the plugin is approved again; (4) both tasks land without waiting, the phase check runs once after the second, and its failure opens one Needs you item with a Start fix; (5) the field change passes after about 90 seconds and the schema change fails and goes back to its worker with the review's summary as its only output; the server's log shows one `create_review` per change despite the restart, and no tool but `create_review`, `get_review` and `tools/list`; (6) no MCP step runs until the plugin is approved again; across every leg the bare remote and GitHub hold no commit status, check run or comment from a plugin check.
  - Failure means: a plugin check runs where its filters say no, a cache hit is wrong, the plugin or a result reaches the repository or GitHub, an MCP step calls a tool it does not name or starts twice, or a phase check blocks a task.
  - Next decision: whether `branch` needs its own live proof on an epic.
