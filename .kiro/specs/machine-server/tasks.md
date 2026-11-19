---
repo: avoozl
completion: integrated
batch-login: Three parts of running unattended at login, each in its own module, after the server exists
batch-codex: Codex's read class and the containment probes, in the harness and sandbox modules
batch-hosts: The Codex and Kiro CLI host adapters, each its own folder and build adapter
---
# Tasks: one machine server, thin front ends

Explicit `after` lists and each task's `after` fact govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`MS1` to `MS13`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.
Phases are the milestones of D11.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, a fake GitHub, and fake executors; Avoozl runs
the repository's checks; no real workspace data, machine configuration,
credentials or personal plans in the repository (AGENTS.md). Replace or
delete the old command, module or option; add no parallel one. Screen
changes need phone and desktop, light and dark screenshots for owner
approval before merge (R92.12), shown to the owner and never committed.
Before landing a task that touches a listener, run the D10 search and
explain every hit in the pull request.

Approval lives in Avoozl, not in these files. Approving the spec, creating
issues and starting agents are separate acts. Task IDs start with `ms-` so
they never collide with the IDs of the other specs.

## Phase 1: One server on Claude Code

- [ ] ms-1.1 The machine lock and the workspace loop lock [MS2] (§D3)
  - $done: The first test shows on Linux, macOS and Windows that an exclusive SQLite lock is held for the handle's life and refused at once to a second opener; eight processes started behind one barrier leave exactly one holder and seven that name it; after the holder is killed and eight more start, exactly one new holder exists within 5 seconds; two state folders on one workspace leave one loop lock holder and one skip; a waiter takes over within 5 seconds; no code path renames or deletes a lock file.
  - Replace `acquireSupervisorLock` and `runningSupervisor` in `src/app/executors/supervisor.mjs` with the OS-held lock on `machine/lock.sqlite` and the `lock.json` record written after it; add the per-workspace `<database>.loop-lock`. If the first test fails on any system, stop and report (D14).
- [ ] ms-1.2 `avoozl start`, `stop`, `link` and the loop, after ms-1.1 [MS1.1, MS1.2, MS1.4, MS1.5, MS1.6, MS3] (§D2, §D4)
  - $done: Tests: `avoozl start` returns once the lock is held and a second names the holder; `--foreground` runs until a signal or a stop row; `avoozl stop` stops it through a database row, falls back to the pid after 30 seconds, and a fake child survives and is found again; the loop ticks every catalog workspace each `machine.tickSeconds` and drains after each; a killed starter does not stop the next pass; `avoozl tick` gets a pass from a running server and runs one itself with none; a server of another build is replaced by `avoozl start` only; `machine.tickSeconds` in `.avoozl.json` is refused naming the machine file; `supervisor`, `supervisor unit`, `serve` and `serve link` are deleted with no alias and refused as unknown; `start`, `stop` and `link` are refused with `AVOOZL_CHILD`; the existing `avoozl status` shows pid, build, start time, starter, interval and each workspace's last pass; the source test of MS1.2 passes.
  - $after: ms-1.1
  - Top-level `start`, `stop` and `link` entries in `src/app/commands/machine.mjs`, and the server's state in the `status` entry of `src/app/commands/inspect.mjs`; `startSupervisor` becomes the machine server with the tick always on; the build id; stop and tick rows in the supervisor database; `machine.tickSeconds` in the config schema. `serve-main.mjs` stays as the page child.
- [ ] ms-1.3 The Kiro Crew backend and cron on a server-owned loop, after ms-1.2 [MS1.3, MS12.1, MS12.3, MS12.4] (§D5)
  - $done: Tests with a fake gateway: the backend starts a machine server when none runs and never a second; it calls neither drain; its notices still reach Kiro Crew's channels; the cron's `plans_maintain tick` call records its observations, returns the pending `kirocrew` dispatch, messages and re-trust for its own job, and never reaches the planner; with no server it starts one and returns no intents; a `kirocrew` task goes from ready to an opened chat in two passes; the design's F129 reason is in the code comment of the cron call.
  - $after: ms-1.2
  - Delete `machineSupervisor` and the drain block in `src/app/executors/kirocrew/app-backend.mjs`, keeping the channel push and the readers; the cron call in `src/app/executors/kirocrew/app-mcp.mjs` reads pending intents from the database.
- [ ] ms-1.4 Login install on macOS and Linux, after ms-1.2 [MS4] (§D4)
  - $done: Tests with a fake `launchctl` and `systemctl`: `avoozl start --at-login` writes the unit with absolute paths, argv lists, the captured `PATH` and no secret, and runs the load commands it prints; `avoozl stop --at-login` unloads and deletes it; `--at-login` replaces its own unit and refuses a file without its marker; a Linux without a user systemd is refused with the `--foreground` line; both are refused with `AVOOZL_CHILD` and have no MCP tool.
  - $after: ms-1.2
  - $batch: login
  - `avoozl start --at-login` and `avoozl stop --at-login`; `src/app/executors/supervisor-unit.mjs` is replaced by the new unit module.
- [ ] ms-1.5 Login install on Windows, after ms-1.2 [MS4] (§D4)
  - $done: Tests on the Windows CI leg with a fake `schtasks`: `avoozl start --at-login` writes the XML with a logon trigger for the current user, least privilege, restart on failure and the marker description, and runs `/Create` and `/Run`; `avoozl stop --at-login` runs `/Delete`; a task without the marker is refused.
  - $after: ms-1.2
  - $batch: login
- [ ] ms-1.6 Model access and harness readiness for unattended children, after ms-1.2 [MS5] (§D6)
  - $done: Tests: a `keepEnv` value from `machine.env` reaches the child and no other name does; a group-readable file is refused on macOS and Linux; no value appears in logs, status or receipts; the sandbox test shows the file outside a child's read roots; a harness whose program is missing, or whose keys are all unset with no proxy, shows per role in `avoozl status` and Settings › Models and a request for it opens one Needs you item; screenshots of Settings › Models go to the owner; the pull request says whether Claude Code's plan sign-in on macOS is keychain-only, with how it was checked.
  - $after: ms-1.2
  - $batch: login
- [ ] ms-1.7 The role proof script for any harness, after ms-1.2 [MS6.3] (§D6)
  - $done: `scripts/proof-ms-roles-live.mjs --harness NAME` runs the D6 scenario table on a scratch repository and prints one line per row; a test fails when a `ROLE_TABLE` row with `process: true` is not in its list; a dry run with a fake harness passes every row.
  - $after: ms-1.2
  - It also runs nk-p2's command sink step (D12, question 3). Task ms-2.2 adds `--probes`.

- [ ] ms-p1 Proof: one server per machine through races, restarts and closed front ends, after ms-1.3, ms-1.4, ms-1.6 [MS1, MS2, MS3, MS4] (§D3, §D5)
  - $done: Expected: (1) one machine server holds the lock and `avoozl status` names the login unit as its starter; (2) every start but one names the holder, and one tick pass runs per interval; (3) a new holder within 5 seconds and the tasks land; (4) the backend starts no second server and no second tick; a `kirocrew` task opens a chat through the cron; (5) the process task lands with Kiro Crew closed; (6) the listener check shows no new TCP listener.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $manual: true
  - $after: ms-1.3, ms-1.4, ms-1.6
  - Setup: an isolated Avoozl home and workspace, a scratch repository with a bare remote, an approved Claude Code definition, and a throwaway Kiro Crew with its own home. The owner runs it from his own terminal on macOS, then on Linux, because loading a login unit is his act.
  - Action: (1) `avoozl start --at-login`, then log out and in; (2) run `avoozl start` eight times at once and start the throwaway Kiro Crew; (3) `kill -9` the server; (4) approve a two-task spec with one task on `kirocrew` and one on `process`; (5) quit Kiro Crew; (6) run the D10 listener check.
  - Expected: (1) one machine server holds the lock and `avoozl status` names the login unit as its starter; (2) every start but one names the holder, and one tick pass runs per interval; (3) a new holder within 5 seconds and the tasks land; (4) the backend starts no second server and no second tick; a `kirocrew` task opens a chat through the cron; (5) the process task lands with Kiro Crew closed; (6) the listener check shows no new TCP listener.
  - Failure means: two loops can run on one machine, or work stops with a front end.
  - Next decision: none.
- [ ] ms-p1w Proof: the login task on Windows, after ms-1.5 [MS4] (§D4)
  - $done: Expected: (1) the server starts at logon with no window and `avoozl status` names the login unit; (2) Task Scheduler restarts it; (3) the task is gone and nothing starts at the next logon.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $manual: true
  - $after: ms-1.5
  - Setup: a Windows user session with Node and Avoozl installed, an isolated Avoozl home, no sandbox (so no `process` work runs here).
  - Action: (1) `avoozl start --at-login`, sign out and in; (2) end the server's process; (3) `avoozl stop --at-login`, sign out and in.
  - Expected: (1) the server starts at logon with no window and `avoozl status` names the login unit; (2) Task Scheduler restarts it; (3) the task is gone and nothing starts at the next logon.
  - Failure means: Windows users must start the server by hand.
  - Next decision: none.
- [ ] ms-p2 Proof: every role on Claude Code with no front end, after ms-1.3, ms-1.4, ms-1.6, ms-1.7 [MS5, MS6] (§D6)
  - $done: Expected: (1) every row reaches its result kind and every session has executor `process`; (2) no watch session request exists and the line stops on the red head; (3) the sink file holds one line per decision; (4) the receipt lists each row with its harness version.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $manual: true
  - $after: ms-1.3, ms-1.4, ms-1.6, ms-1.7
  - Setup: as ms-p1, with the server started by the login unit, model access from `machine.env` or a model proxy, every role's harness set to `claude-code`, investigate first on, and a `command` sink to a file. No Kiro Crew, Claude Code or other front end runs during the run. The owner runs it from his own terminal, because Kiro Crew's sandbox refuses a nested `sandbox-exec`.
  - Action: (1) `scripts/proof-ms-roles-live.mjs --harness claude-code`; (2) push a failing commit to the scratch main; (3) read the sink file; (4) write the receipt.
  - Expected: (1) every row reaches its result kind and every session has executor `process`; (2) no watch session request exists and the line stops on the red head; (3) the sink file holds one line per decision; (4) the receipt lists each row with its harness version.
  - Failure means: some role still needs a front end open.
  - Next decision: whether `claude-code` becomes the default harness for new workspaces.

## Phase 2: Codex

- [ ] ms-2.1 Codex's read class inside Avoozl's sandbox, after ms-1.2 [MS7.1, MS7.2, MS7.5] (§D7)
  - $done: Tests: `permission.read: "danger-full-access"` loads only with write roots and runs only inside Avoozl's sandbox; with no sandbox it is refused for every role, opt-in or not, on the Windows leg too; a read child's write roots exclude the task folder; `codex.json` uses it and still loads.
  - $after: ms-1.2
  - $batch: codex
  - Codex's own sandbox stays off only inside Avoozl's sandbox, as the owner decided (D12).
- [ ] ms-2.2 The containment probes and their CI test, after ms-1.2, ms-1.7 [MS8.1, MS8.2, MS8.3, MS8.4] (§D7)
  - $done: `src/app/sandbox-probes.mjs` holds every MS8.1 probe as an argv list; the test runs them under `confineChild` with `danger-full-access` and a stand-in harness on the macOS and Linux legs and every probe is refused; the Linux leg fails rather than skips without a usable `bwrap`; a probe planted to succeed fails the test naming it; `scripts/proof-ms-roles-live.mjs --probes` runs the same set in a live child.
  - $after: ms-1.2, ms-1.7
  - $batch: codex
  - Fix any probe that gets through in `src/app/executors/sandbox.mjs`, never by changing the probe.

- [ ] ms-p3 Proof: every role on Codex, and the sandbox contains it, after ms-2.1, ms-2.2, ms-p2 [MS7, MS8] (§D7)
  - $done: Expected: (1) every row reaches its result kind or the receipt names why it cannot; (2) every probe is refused on both systems, each with its error text; (3) `codex.json`'s `proved` matches the receipt.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $manual: true
  - $after: ms-2.1, ms-2.2, ms-p2
  - Setup: as ms-p2 with every role on `codex`, its own `CODEX_HOME`, and the model reached through the repository's model proxy. On macOS and on Linux. The owner runs it from his own terminal.
  - Action: (1) `scripts/proof-ms-roles-live.mjs --harness codex --probes`; (2) read Codex's transcript and the probe log; (3) update `proved` in `codex.json` in the receipt's pull request.
  - Expected: (1) every row reaches its result kind or the receipt names why it cannot; (2) every probe is refused on both systems, each with its error text; (3) `codex.json`'s `proved` matches the receipt.
  - Failure means: Codex cannot run unattended here; it stays off the failing roles.
  - Next decision: none.

## Phase 3: The shim

- [ ] ms-3.1 The control interface, after ms-1.2 [MS9] (§D8, §D10)
  - $done: Tests on Linux, macOS and Windows: the socket is `0600` in a `0700` folder, or the listener is `127.0.0.1`; no option or variable changes the address; a missing or wrong token, a missing `hello`, and an HTTP request line each close the connection with nothing run; with no token file every call is refused; a person-only operation is refused through it; a confined child cannot connect or read the token; a long state path falls back to the short socket folder; a search of logs, status and receipts after a run finds no token.
  - $after: ms-1.2
  - The listener in the machine server, the token written after the lock, the address in `lock.json`, and the `app-mcp.mjs` workspace rules moved into the server.
- [ ] ms-3.2 `avoozl mcp` is the shim, after ms-3.1, ms-1.3 [MS10] (§D8)
  - $done: Tests: the shim forwards calls and replies and imports no `Store`; `--kirocrew` passes the gateway caller block and a bound session reaches its workspace; with no server it starts one and the call succeeds within 20 seconds; a server of another build fails the call naming `avoozl start`; `tools/list` matches today's for each caller kind; `mcp --url`, `--url` and `AVOOZL_URL` are refused naming what replaces them; the cron's call works through the shim.
  - $after: ms-3.1, ms-1.3
  - Delete the in-process MCP modes in `src/app/commands/machine.mjs` and the CLI's server request path in `src/app/cli/cli.mjs`.

- [ ] ms-p4 Proof: two front ends through the shim, after ms-3.2 [MS9, MS10] (§D8, §D10)
  - $done: Expected: (1) the call starts the server and returns; (2) both sessions see the same task state; (3) both approvals are refused through MCP and work from the person's own prompt; (4) the child's attempts are refused; (5) only the socket shows.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $manual: true
  - $after: ms-3.2
  - Setup: the server stopped; a throwaway Kiro Crew chat and an interactive Claude Code session with `avoozl mcp` in its MCP config, both on one isolated workspace. The owner types in Claude Code, since it is his session.
  - Action: (1) call `plans_next` from Claude Code; (2) call it from the Kiro Crew chat; (3) ask each agent to approve a spec and to answer a person-only Needs you item; then do both at the person's own prompt; (4) start a `process` task whose brief tries to connect to the socket and read the token; (5) run the D10 listener check.
  - Expected: (1) the call starts the server and returns; (2) both sessions see the same task state; (3) both approvals are refused through MCP and work from the person's own prompt; (4) the child's attempts are refused; (5) only the socket shows.
  - Failure means: an agent can act as the person, or a front end sees other state.
  - Next decision: none.

## Phase 4: Host packages

- [ ] ms-4.1 One source and `hosts/kirocrew/`, after ms-1.3 [MS11.1, MS11.2] (§D9)
  - $done: `kirocrew-app/` is `hosts/kirocrew/` and every reference outside `docs/research/` and `docs/evidence/` follows; `skills/` and `roles.json` are the source; `npm run check:hosts` passes and fails naming a file after one generated byte changes; `build:agents` and `check:agents` are gone and `pretest` and `pretest:ci` run the check; the built Kiro Crew package lists the same files as before the move, apart from paths; the Kiro Crew page tests pass unchanged.
  - $after: ms-1.3
  - `scripts/build-hosts.mjs` replaces `src/app/executors/kirocrew/build-agents.mjs`, with the Kiro Crew adapter only.
- [ ] ms-4.2 The Claude Code host package, after ms-4.1, ms-3.2 [MS11.3] (§D9)
  - $done: `hosts/claude-code/` is built by the Claude Code adapter and checked; a test installs it into a temporary Claude Code config and finds the skills and the `avoozl mcp` entry; the guard refuses an agent shell call to each person-only `avoozl` command and allows the others; the skill names how the person approves and answers; the pull request cites the Claude Code docs it followed and the version checked.
  - $after: ms-4.1, ms-3.2

- [ ] ms-p5 Proof: Claude Code as the front end, after ms-4.2, ms-p2 [MS10, MS11.3] (§D9)
  - $done: Expected: (1) the agent drafts the spec and does not approve it; (2) the person's approval lands and the tasks run; (3) the agent cannot answer the item and the person can; (4) the tasks land with Claude Code closed.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $manual: true
  - $after: ms-4.2, ms-p2
  - Setup: no Kiro Crew; the Claude Code plugin installed from `hosts/claude-code/`; an isolated workspace and scratch repository; the server not running. The owner drives Claude Code.
  - Action: (1) ask the agent to plan a two-task spec; (2) approve it at the person's own prompt with the command the skill gives; (3) handle a person-only Needs you item the same way; (4) quit Claude Code and wait.
  - Expected: (1) the agent drafts the spec and does not approve it; (2) the person's approval lands and the tasks run; (3) the agent cannot answer the item and the person can; (4) the tasks land with Claude Code closed.
  - Failure means: a Claude Code user still needs Kiro Crew or the page for a step.
  - Next decision: whether to publish the plugin.
- [ ] ms-4.3 The Codex host package, after ms-p5 [MS11.4] (§D9)
  - $done: `hosts/codex/` is built by its adapter and checked; a test installs it into a temporary `CODEX_HOME` and finds the skills and the MCP entry; the guard or its documented absence is in the package's README; the pull request cites the Codex docs and version.
  - $after: ms-p5
  - $batch: hosts
- [ ] ms-4.4 The Kiro CLI host package, after ms-p5 [MS11.4] (§D9)
  - $done: `hosts/kiro-cli/` is built by its adapter and checked; a test installs it into a temporary Kiro CLI config and finds the agent, the steering or skills and the MCP entry; the guard or its documented absence is in the README; the pull request cites the Kiro CLI docs and version.
  - $after: ms-p5
  - $batch: hosts

- [ ] ms-p6 Proof: Codex and Kiro CLI as front ends, after ms-4.3, ms-4.4 [MS11.4] (§D9)
  - $done: Expected: in each tool, the agent drafts and does not approve, the person approves and answers at their own prompt, and the tasks land with the tool closed.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $manual: true
  - $after: ms-4.3, ms-4.4
  - Setup: as ms-p5, once with Codex and once with Kiro CLI.
  - Action: the four steps of ms-p5 in each tool.
  - Expected: in each tool, the agent drafts and does not approve, the person approves and answers at their own prompt, and the tasks land with the tool closed.
  - Failure means: that tool's users still need another front end for a step.
  - Next decision: none.

## Phase 5: The cron and the docs

- [ ] ms-5.1 `tick.py` keeps only chat intents, after ms-3.2, ms-4.1 [MS12.2, MS12.5] (§D5)
  - $done: `hosts/kirocrew/crons/tick.py` opens, sends and re-trusts and nothing else; the Python test with a fake context covers each and a refused send; the Node test that the cron's call never reaches the planner passes; `app.json`'s permissions are unchanged.
  - $after: ms-3.2, ms-4.1
- [ ] ms-p7 Proof: the cron on a throwaway Kiro Crew, after ms-5.1 [MS12] (§D5)
  - $done: Expected: (1) the chat opens, gets the message and keeps trust mode; (2) the cron history shows only open, send and trust calls; (3) the task lands.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $after: ms-5.1
  - Setup: the throwaway test Kiro Crew with its own home, an isolated workspace with one `kirocrew` task, the machine server running. The chat drives the test crew's clicks itself.
  - Action: (1) approve the task; (2) send a message to its chat from the page; (3) restart the test crew's gateway; (4) read the cron's run history.
  - Expected: (1) the chat opens, gets the message and keeps trust mode; (2) the cron history shows only open, send and trust calls; (3) the task lands.
  - Failure means: the cron still does work the machine server should own.
  - Next decision: none.
- [ ] ms-5.2 Docs and the product spec, after ms-p2, ms-p4, ms-p5, ms-p7 [MS13] (§D1)
  - $done: The product spec, worker-paths WP1.1 and standalone-web SW9 say what MS13 lists; `README.md`, `docs/getting-started.md`, `docs/person-only.md` and `docs/glossary.md` describe the machine server, its commands, the login unit, `machine.env` and the host packages; no file outside `docs/research/` and `docs/evidence/` names `avoozl supervisor` or `avoozl serve`; nk-p2 in `.kiro/specs/without-kirocrew/tasks.md` is ticked with the ms-p2 and ms-p3 receipts (D12, question 3).
  - $after: ms-p2, ms-p4, ms-p5, ms-p7
