---
category: Planning
---

# Requirements: one machine server, thin front ends

## Introduction

Avoozl stops being tied to Kiro Crew. One process per machine, the machine
server, runs delivery: the tick, the drain after it and the agent children.
Kiro Crew, Claude Code, Codex and Kiro CLI become thin front ends to it, on
the command line and in a page. A person approves specs and handles Needs you
from whichever tool they use, and work keeps running when that tool closes.

Approval lives in Avoozl, not in these files. Approving the spec, creating
issues and starting agents are separate acts. Nothing here changes code,
GitHub repositories or settings until its tasks run.

Every claim about today's code carries one label: **V**, read in the file
cited at `c670051c`; or **A**, assumed and not checked, with the reason.

### The owner's goal

The owner listed six parts (2026-11-19):

1. One machine server. Standalone serve gets the tick timer, the supervisor
   and the post-tick drain, which today live only in the Kiro Crew backend.
2. Starting it: `avoozl machine start`, `stop`, and an opt-in
   `install --login` for macOS (launchd), Linux (systemd) and Windows (Task
   Scheduler). No service is required.
3. MCP as a shim: `avoozl mcp` forwards calls to the server with the
   session's identity, and starts the server if it is down.
4. Workers on the process executor: the `claude-code` and `codex` harnesses
   run unattended under Avoozl's sandbox, proved for every role, with a check
   that the sandbox contains Codex's `danger-full-access`.
5. Host packages: `kirocrew-app/` moves to `hosts/kirocrew/`, and
   `hosts/claude-code/`, `hosts/codex/` and `hosts/kiro-cli/` are added, all
   generated from one source, with a check step so they cannot drift.
6. A smaller Kiro Crew cron that keeps only chat intents (open, send,
   re-trust), since Kiro Crew lets only the cron that opened a chat control it.

The first milestone is parts 1, 2 and 4 on Claude Code (design D11).

Changed 2026-11-19 (owner decision): the commands are top level, not under
`machine`. They are `avoozl start`, `avoozl stop` and `avoozl link`. The
login unit is `avoozl start --at-login`, undone by `avoozl stop --at-login`.
The server's state goes in the existing `avoozl status`. `avoozl serve`,
`avoozl supervisor` and `avoozl supervisor unit` are deleted with no
aliases.

### What already exists

Much of part 1 and part 4 is built. This spec reuses it and writes tasks only
for the gaps.

| Piece | Today | Gap |
| --- | --- | --- |
| Supervisor | `avoozl supervisor` owns every `process` child, one per machine (R95; V: `src/app/supervisor.mjs:577`) | Its lock is a pid file with a rename takeover that two takers can both win (V: `:474-520`; design D3) |
| Tick on a headless machine | `avoozl supervisor --tick-seconds N` runs the tick and the drain for every catalog workspace (V: `src/app/headless-tick.mjs:42`) | On a Kiro Crew machine the cron runs the tick through MCP and the app backend runs the drain (V: `kirocrew-app/crons/tick.py:51`, `src/app/app-backend.mjs:281-415`); nothing stops both loops running at once |
| Page | `avoozl serve`, on `127.0.0.1` with a one-time owner link, hosted by the supervisor with `serve.enabled` (standalone-web SW3, SW9) | None; it moves under the new command names |
| Login unit | `avoozl supervisor unit` prints or writes a launchd or systemd unit; the person loads it (V: `src/app/supervisor-unit.mjs:1-22`) | No Windows; no command that loads it |
| Process executor | Claude Code ran every role class in P57, P59 and nk-p1; Codex ran a write task in P58 (`docs/evidence/`) | No proof of every role under a server no front end started; Codex read roles are not proved (V: `examples/harnesses/codex.json` `proved: ["write"]`) |
| Codex's inner sandbox | `permission.write` may be `danger-full-access` only inside Avoozl's sandbox (R94.4d, task 48.2; V: `src/app/harness-definitions.mjs:85-90`) | Only the write class may; Codex's own sandbox cannot nest in Avoozl's on macOS (P58), so its read roles cannot run commands (A: from P58's finding, not run for read) |
| MCP bridge | `avoozl mcp --url URL` posts to `URL/mcp` (V: `src/app/commands/machine.mjs:121`) | No server serves `/mcp` (V: no such route in `serve-server.mjs` or `app-backend.mjs`); the bridge is dead |
| Agents from prompts | `npm run check:agents` builds Kiro Crew agents from `prompts/` and `agent-metadata.json` (V: `src/app/executors/kirocrew/build-agents.mjs`) | Kiro Crew only |
| Cron | `tick.py` runs the whole tick through `plans_maintain tick` (V: `kirocrew-app/crons/tick.py:51-56`) | The Node backend cannot take over chats: it gets 403 opening them (F129, branch `spec/node-tick`, commit `ce63eb27`) |

### What this builds on

`.kiro/specs/avoozl/` stays the product spec. This spec keeps Requirement 93
(the executor seam), 94 (harness definitions), 95.2, 95.4 to 95.7 (the
supervisor's children and the sandbox) and 96 (one way to finish). It changes
Requirement 95.1 and 95.3 (MS1, MS3), Requirement 98 (MS13), worker-paths
WP1.1 (MS1.1) and standalone-web SW9 (MS1.1). MS13 lists every edit.

The `without-kirocrew` spec made every role run as a child; its open proof
nk-p2 overlaps MS6 and MS7 (design D12, question 3).

### Scope

- The machine server, its locks, its commands and its login unit.
- Unattended `process` children on Claude Code and Codex for every role.
- The control interface and the MCP shim.
- Host packages and the one source they are built from.
- The Kiro Crew cron and backend as clients of the machine server.

### Out of scope

- Reaching the machine server from another machine. It listens on loopback
  or a local socket only (MS9).
- Kiro CLI or any other CLI as a `process` harness. Kiro CLI is a front end
  only here.
- Worker machines (worker-paths WP5). A worker machine runs its own machine
  server and nothing about the pull route changes.
- How many tasks run at once.

### Words

| Word | Meaning |
| --- | --- |
| Machine server | The one process per machine that runs the loop and owns the children: `avoozl start` |
| Loop | The tick of every enabled catalog workspace, the drain after each, and the supervisor's pass over its children |
| Front end | A tool a person or agent uses to reach Avoozl: Kiro Crew, Claude Code, Codex, Kiro CLI, the page, the CLI |
| Shim | `avoozl mcp`: a stdio MCP server that forwards each call to the machine server |
| Control interface | The machine server's one local listener: a Unix socket, or `127.0.0.1` on Windows |
| Host package | The files one front end installs: skills, agents, MCP entry, guards |

## Requirements

### Requirement MS1: One machine server runs the loop

**User story:** As the owner, I want one process on my machine to run all of
delivery, so that work goes on whichever tool I have open or closed.

#### Acceptance criteria

1. `avoozl start` SHALL run the machine server. It SHALL do every job
   of today's supervisor (R95.2, R95.4 to R95.6), and also, for every enabled
   workspace in the machine catalog: run the tick every `machine.tickSeconds`
   seconds (default 60, allowed 10 to 86400) one pass at a time, then the
   drain of today's headless tick (process requests, queued check runs, the
   Needs Kiro Crew step, notifications to the machine's sinks). With
   `serve.enabled` it SHALL host the page child as today (SW9).
2. A source test SHALL fail when a module other than the machine server's
   loop calls `drainProcessRequests` or `drainCheckRuns`, or runs
   `workspace.tick` on a timer.
3. The Kiro Crew app backend SHALL run no tick, no drain and no supervisor.
   It SHALL start the machine server when none runs (MS3.5).
4. The machine server SHALL be detached from whatever started it. WHEN the
   starting process (a terminal, the Kiro Crew backend, the shim) exits THEN
   the next pass SHALL still run. A test kills the starter and sees it.
5. `avoozl tick` SHALL ask a running machine server for one pass now, wait
   for it, and print the result. With no machine server it SHALL run one
   tick in its own process under the workspace loop lock (MS2.3).
6. `machine.tickSeconds` SHALL live in the machine configuration and its
   schema. In `.avoozl.json` it SHALL be refused, naming the machine file.

### Requirement MS2: Exactly one loop per workspace

**User story:** As the owner, I want exactly one loop for each workspace, so
that two ticks never plan the same work and two drains never start the same
child.

#### Acceptance criteria

1. The machine lock SHALL be an operating-system file lock that the machine
   server holds for its whole life, so the operating system frees it when
   the process ends in any way. The pid file and its rename takeover SHALL
   be removed.
2. Of any number of processes that try to take the machine lock at once,
   exactly one SHALL hold it. `avoozl start` in any other SHALL
   return, naming the holder's pid, build and start time.
   `avoozl start --foreground` in any other SHALL wait for the lock,
   say once that it waits and for which pid, and take over when the holder
   ends.
3. For each workspace it ticks, the machine server SHALL also hold an
   operating-system lock beside that workspace's database for its whole
   life. A machine server that cannot take it (one with another state folder
   on the same workspace) SHALL skip that workspace on every pass, and
   `avoozl status` from either SHALL name the holder's pid and state folder.
4. The in-database work lock of the tick (V: `WORKSPACE_LOCK`,
   `src/app/tick.mjs:130`) SHALL stay. It serializes a pass with GitHub
   projection and with operations a person runs.
5. The lock record (pid, start time, build, state folder, and the control
   address once MS9 lands) SHALL be written only by the holder, after it
   holds the lock. Every reader SHALL treat it as information, never as the
   lock.
6. Tests on Linux, macOS and Windows: eight processes started at once on one
   state folder leave exactly one holder and seven that name it; with the
   holder killed by `SIGKILL` (Windows: `TerminateProcess`) and eight more
   started, exactly one new holder exists within 5 seconds; two state
   folders whose catalogs name one workspace leave one loop on it and one
   skip; a `--foreground` waiter takes over within 5 seconds of the holder's
   end.

### Requirement MS3: Start and stop

**User story:** As a person, I want to start and stop the machine server
with one command each, so that I never need a service to use Avoozl.

#### Acceptance criteria

1. `avoozl start` SHALL start the machine server detached and return
   once it holds the lock, or name the holder (MS2.2). No service SHALL be
   required.
2. `avoozl start --foreground` SHALL run it in the calling process,
   for a terminal or a login unit, until a signal or a stop request.
3. `avoozl stop` SHALL ask the machine server to stop by a request in
   its own database, wait up to 30 seconds, and then end it by pid after
   checking its start time. `process` children SHALL keep running and SHALL
   be found again at the next start (R95.4). It SHALL print what it did.
4. The lock record SHALL name the machine server's build: the package
   version and a hash of its source files. WHEN `avoozl start` finds
   a holder of another build THEN it SHALL stop that server and start its
   own; children SHALL survive as in MS3.3.
5. The Kiro Crew backend and the shim SHALL start a machine server only when
   none runs, and SHALL never replace one. When builds differ, `avoozl
   status` and the page SHALL say which build runs and that
   `avoozl start` replaces it.
6. The existing `avoozl status` (`src/app/commands/inspect.mjs`) SHALL show
   whether the machine server runs, its pid, build, start time, what
   started it (terminal, login unit, Kiro Crew, shim), its tick interval
   and each workspace's last pass. There SHALL be no separate status
   command for the server.
7. `avoozl link` SHALL print a new one-time owner link for the page,
   as `avoozl serve link` does today.
8. `avoozl supervisor`, `avoozl supervisor unit`, `avoozl serve` and
   `avoozl serve link` SHALL be deleted, with no aliases, and refused as
   unknown commands (as worker-paths WP7.1). `avoozl start`, `avoozl stop`,
   `avoozl link` and `avoozl status` are the only server commands, all at
   the top level.
9. A `process` child (`AVOOZL_CHILD`) SHALL be refused `avoozl start`,
   `avoozl stop` and `avoozl link`. None of them SHALL have an MCP
   tool.

### Requirement MS4: Start at login, by choice

**User story:** As the owner, I want to choose to have the machine server
start when I log in, on any of my machines, so that work resumes after a
restart without my opening anything.

#### Acceptance criteria

1. `avoozl start --at-login` SHALL write and load a unit for the
   current user that runs `avoozl start --foreground` now, at each login,
   and again when it exits: a launchd agent in the user's GUI domain on macOS, a
   systemd user unit on Linux, and a Task Scheduler task at logon for the
   current user with no elevation on Windows.
2. `avoozl stop --at-login` SHALL unload and delete that unit, which stops
   the server it runs. Both commands SHALL print each command they ran.
3. Nothing SHALL install the unit except this command. Setup and the page
   MAY show the command and SHALL NOT run it.
4. The unit SHALL name `node` and the CLI by absolute path, as argv lists,
   with the `PATH` captured at install. It SHALL hold no secret (MS5).
5. Install SHALL replace a unit it wrote before, and SHALL refuse a file at
   that path that it did not write.
6. On a Linux without a user systemd, install SHALL refuse with the reason
   and print the `avoozl start --foreground` line to run another way.

### Requirement MS5: Model access for unattended children

**User story:** As the owner, I want a child started by a login unit or by
Kiro Crew to reach its model the same way as one I start from my terminal,
so that unattended work does not fail on a missing login.

#### Acceptance criteria

1. A child's model access SHALL come only through its definition's `keepEnv`
   names or the repository's `sandbox.modelProxy`, as today.
2. The machine server SHALL take the values of `keepEnv` names from its own
   environment and then from the machine env file, `machine.env` in the
   machine config folder. On macOS and Linux the file SHALL be refused when
   anyone but the owner can read it. It SHALL be outside every child's read
   roots. Its values SHALL never be logged or shown.
3. For each role, `avoozl status` and Settings › Models SHALL show a harness
   that cannot start on this server, and why: its program is not on the
   server's `PATH`, or none of its `keepEnv` names is set and no model proxy
   is named. A request for it SHALL open one Needs you item, not repeat a
   failed start.
4. A login kept only in the macOS keychain is out of a child's reach, since
   the sandbox denies the keychain (V: `src/app/sandbox.mjs:29` and `:264`). The docs
   SHALL say to use an API key, Bedrock or a model proxy. (A: Claude Code's
   plan sign-in lives in the keychain on macOS; task ms-1.6 checks it.)

### Requirement MS6: Every role on Claude Code, unattended

**User story:** As the owner, I want every Avoozl role to run on Claude Code
with no front end open, so that Kiro Crew is optional.

#### Acceptance criteria

1. Every row of the role table that runs as a child (V: `process: true` in
   `src/app/role-table.mjs:102-306`: worker, verifier, reviewer, planner,
   retro, falsifier, responder, task summary, plan reviewer, plan answer,
   pull request review, triage, assist) SHALL run on the `claude-code`
   definition as a child of a machine server started by the login unit,
   with no Kiro Crew, Claude Code or other front end running, and SHALL reach
   its result kind.
2. The line watch has no agent session (avoozl task 49.1). The proof SHALL
   show that no watch session is requested and that the line watch still
   acts on a red head.
3. A test SHALL fail when a role table row with `process: true` is missing
   from the proof script's role list, so a new role cannot skip the proof.

### Requirement MS7: Every role on Codex, inside Avoozl's sandbox

**User story:** As the owner, I want every role to run on Codex too, so that
I can pick either harness per role.

#### Acceptance criteria

1. `permission.read` MAY be exactly `danger-full-access` under the rules
   R94.4d sets for `permission.write`: only inside Avoozl's sandbox, only
   with the read class's write roots (its temp folder, `.avoozl/` and named
   caches), and refused on a machine with no Avoozl sandbox, opt-in or not.
   The owner decided this on 2026-11-19 (design D12).
2. `examples/harnesses/codex.json` SHALL use it for the read class.
3. Every row of MS6.1 SHALL run on the `codex` definition and reach its
   result kind. A role that needs a served model SHALL read it from Codex's
   output, or SHALL record "no served model" with the reason, as nk-3.1 does.
4. `codex.json`'s `proved` SHALL list what the proof showed, and no more.
5. On Windows, or wherever no Avoozl sandbox runs, `codex` SHALL be refused
   for every role with the reason. A test checks it.

### Requirement MS8: Proof that the sandbox contains Codex

**User story:** As the owner, I want proof that a Codex child with its own
sandbox off still cannot write, connect or read outside what Avoozl allows,
so that `danger-full-access` is safe to run unattended.

#### Acceptance criteria

1. One probe set SHALL try, from inside a child whose permission is
   `danger-full-access`:
   - writes outside its write roots: a file in the home folder, the
     checkout's shared git folder, another worktree, Avoozl's config and
     state folders, and a temp path that is not its own;
   - network beyond what the repository names: a direct HTTPS connection to
     a public host, a loopback port not in `sandbox.network` or
     `sandbox.modelProxy`, and a name lookup;
   - reads of credentials: `~/.ssh`, `~/.config/gh`, `~/.aws`,
     `~/.git-credentials`, the workspace database, the machine state folder
     with its control token, the Kiro Crew home, on macOS the keychain
     (`security find-generic-password`), and environment variables with
     secret names other than its `keepEnv`.
2. Each probe SHALL be refused on macOS (`sandbox-exec`) and on Linux
   (`bwrap`). A CI test SHALL run the set with a stand-in harness program on
   the macOS and Linux legs. The live proof SHALL have Codex itself run it
   by shell commands its brief names.
3. A probe that succeeds SHALL fail the test and the proof, and the receipt
   SHALL name it. The fix goes in the sandbox, never in the probe.
4. The probe set SHALL be one module that the test and the proof script both
   read.

### Requirement MS9: The control interface

**User story:** As the owner, I want the machine server to take calls only
from programs running as me on this machine, so that nothing else can drive
my agents.

#### Acceptance criteria

1. The machine server SHALL listen only on: on macOS and Linux, a Unix
   socket `control.sock` with mode `0600` in the `0700` machine state
   folder; on Windows, `127.0.0.1` on a port the system picks, recorded in
   the lock record. There SHALL be no option, setting or variable that
   names another address. A test checks the listener on all three systems.
2. Every connection SHALL first send the token in `control.token` in the
   machine state folder: 32 random bytes, written by the holder after it
   takes the lock, mode `0600`, new at each start. The server SHALL compare
   it in constant time. A missing or wrong token SHALL close the connection
   with nothing run. With no token file the server SHALL refuse every call.
3. Messages SHALL be one JSON object per line. A line that is not one JSON
   object SHALL close the connection, so a browser's HTTP request is refused
   at its first line.
4. The interface SHALL serve MCP `tools/list` and `tools/call` only. Each
   call SHALL run as an agent principal: person-only operations SHALL be
   refused through it as through MCP today (R56, `mcpRefusal`). Spec
   approval, approval delegation, harness approval and the person-only
   Needs you answers SHALL never run through it.
5. Stop and manual tick SHALL stay database requests (MS1.5, MS3.3), not
   calls on this interface.
6. A sandboxed child SHALL be unable to connect to the socket or read the
   token. A test starts a confined child that tries both.
7. No log, status line, receipt or error SHALL hold the token.

### Requirement MS10: MCP as a shim

**User story:** As an agent in any front end, I want `avoozl mcp` to reach
the one machine server, so that every front end sees the same state and
starting a chat starts delivery.

#### Acceptance criteria

1. `avoozl mcp` SHALL be a stdio shim only. It SHALL forward each MCP
   message over the control interface and pass back the reply. It SHALL open
   no workspace database; a source test checks its imports.
2. The shim SHALL attach a caller claim: with `--kirocrew`, the gateway's
   caller block, as today; otherwise the host and session the front end's
   environment names, if any, and the `--workspace` its MCP entry gives. The
   server SHALL resolve the workspace by today's rules (V:
   `src/app/app-mcp.mjs:1-16`): a bound session's workspace first, then the
   named workspace or the catalog default. A claim SHALL route and attribute
   a call. It SHALL never grant one.
3. WHEN no machine server runs THEN the shim SHALL start one (MS3.5) and
   retry for up to 20 seconds. WHEN the server runs another build THEN the
   call SHALL fail with a message that names `avoozl start`.
4. `avoozl mcp --url`, the in-process `avoozl mcp --workspace` server, the
   CLI's `--url` option and `AVOOZL_URL` SHALL be removed and refused,
   naming what replaces them.
5. For the same caller, `tools/list` SHALL return the same tools as today. A
   test compares them, so no agent's allowed tools grow.

### Requirement MS11: Host packages from one source

**User story:** As the owner, I want each front end's package built from one
source of skills, role metadata and prompts, so that they cannot drift.

#### Acceptance criteria

1. `kirocrew-app/` SHALL move to `hosts/kirocrew/`. What Kiro Crew installs
   (manifest, agents, skills, page, cron, MCP entry) SHALL be unchanged.
2. The one source SHALL be `prompts/` (as today), `skills/` (moved from
   `kirocrew-app/skills/`) and `roles.json` (moved from
   `src/app/executors/kirocrew/agent-metadata.json`). `npm run build:hosts`
   SHALL write every generated file of every host package. `npm run
   check:hosts` SHALL fail when any generated file differs from what the
   build writes. They SHALL replace `build:agents` and `check:agents`, and
   `pretest` and `pretest:ci` SHALL run the check.
3. `hosts/claude-code/` SHALL be a Claude Code plugin with the skills, an MCP
   entry that runs `avoozl mcp`, and a guard that refuses the agent's own
   shell call to a person-only `avoozl` command. The guard is a speed bump
   (R95.7), and the docs SHALL say so. Its skill SHALL tell the agent how
   the person approves a spec and answers a person-only Needs you item: the
   `avoozl` command, run by the person at their own prompt, or the page from
   `avoozl link`.
4. `hosts/codex/` and `hosts/kiro-cli/` SHALL follow in each tool's own
   format, and SHALL start only after the Claude Code host's proof passes.

### Requirement MS12: The Kiro Crew cron keeps only chat intents

**User story:** As the owner, I want the Kiro Crew cron to do only what Kiro
Crew allows no one else to do, so that the loop has one owner.

#### Acceptance criteria

1. The cron's `plans_maintain` `tick` call SHALL run no planner. It SHALL
   record the session observations it brings, and SHALL return only the
   pending intents for `kirocrew` sessions: open (dispatch), send
   (messages) and re-trust (observe).
2. `tick.py` SHALL carry out only those three, and its other code SHALL be
   deleted.
3. The reason SHALL be recorded in the design: Kiro Crew lets only the cron
   job that opened a chat control it, and the app backend gets 403 opening
   chats with today's grants (F129).
4. WHEN no machine server owns the workspace's loop THEN the cron's call
   SHALL start one (MS3.5) and return no intents for that pass.
5. Tests: a Python test of `tick.py` with a fake context; a Node test that
   the cron's call never reaches the planner.

### Requirement MS13: Docs and the product spec

**User story:** As a reader, I want the docs and the product spec to
describe one machine server, so that no page says the tick lives in Kiro
Crew.

#### Acceptance criteria

1. The product spec SHALL change: Requirement 95.1 and 95.3 name the machine
   server, its lock and who starts it; Requirement 98 says every front end
   (Kiro Crew, the page, the CLI and the host packages) reaches the same
   machine server, and criterion 5 goes.
2. worker-paths WP1.1 SHALL say the tick runs only in the machine server.
   standalone-web SW9 SHALL say the machine server hosts the page.
3. `README.md`, `docs/getting-started.md`, `docs/person-only.md` and
   `docs/glossary.md` SHALL describe the machine server, its commands, the
   login unit, `machine.env` and the host packages.
4. Research under `docs/research/` and receipts under `docs/evidence/`
   SHALL NOT be rewritten (AGENTS.md).
