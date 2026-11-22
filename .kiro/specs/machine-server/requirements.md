---
category: Planning
---

# Requirements: one tick pass, any timer, thin front ends

## Introduction

Avoozl is not tied to Kiro Crew. All of delivery runs in `avoozl tick`: one
pass over the machine that plans, starts and checks agents, lands what
passed, and exits. Whatever runs it on a schedule drives Avoozl: an
operating-system timer (launchd, systemd, cron), the Kiro Crew cron, or a
driver chat. Kiro Crew, Claude Code and the page are thin front ends to the
same workspace databases. A person approves specs and handles Needs you from
whichever tool they use, and work keeps going when that tool closes, as long
as something runs the tick.

No process stays up between ticks except the agents a tick started (and the
standalone page, when the person turns it on). An agent outlives the tick
that started it; a later tick finds it by its recorded pid and session and
reaps or resumes it.

### The parts

1. The engine: `avoozl tick`, one pass and an exit, for every enabled
   workspace in the machine catalog or the one named.
2. The callers: an operating-system timer from lines the docs give, the
   Kiro Crew cron (`tick.py`), or a chat that follows the `avoozl-drive`
   skill. No command installs a timer, and nothing in Avoozl loops.
3. Workers on the `process` executor: the `claude-code` and `codex`
   harnesses run unattended under Avoozl's sandbox, proved for every role,
   with a check that the sandbox contains Codex's `danger-full-access`.
4. `avoozl mcp`: a plain stdio MCP server per chat, on the workspace
   database. It never loops; its one tick tool runs one pass.
5. Host packages: the Kiro Crew app is `hosts/kirocrew/` and the Claude Code
   plugin is `hosts/claude-code/`, both generated from one source, with a
   check step so they cannot drift.
6. A small Kiro Crew cron that runs the pass and then the chat intents only
   it may carry out (open, send, re-trust), since Kiro Crew lets only the
   cron that opened a chat control it.

### What this builds on

`.kiro/specs/avoozl/` stays the product spec. This spec keeps Requirement 93
(the executor seam), 94 (harness definitions), 95.2, 95.4 to 95.7 (the
supervisor pass's children and the sandbox) and 96 (one way to finish). It
sets Requirement 95.1, 95.3 and 98 (MS13), worker-paths WP1.1 and
standalone-web SW9 (MS13).

ms-p2 and ms-p3 also prove the `without-kirocrew` spec on both harnesses
(design D12, rule 3).

### Scope

- `avoozl tick`, its pass locks, and the children and page that outlive it.
- The timers that call it, as lines in the docs.
- Unattended `process` children on Claude Code and Codex for every role.
- `avoozl mcp` and the `avoozl-drive` skill.
- Host packages and the one source they are built from.
- The Kiro Crew cron and backend on the same pass.

### Out of scope

- Reaching Avoozl from another machine. Nothing here listens on a network.
- Kiro CLI or any other CLI as a `process` harness.
- Host packages for Codex and Kiro CLI. Any MCP client can run `avoozl mcp`
  and follow the drive skill.
- How many tasks run at once.

### Words

| Word | Meaning |
| --- | --- |
| Tick pass | One run of `avoozl tick`: the supervisor pass, each workspace's tick and drain, the supervisor pass again, and the page |
| Timer | Whatever runs `avoozl tick` on a schedule: launchd, systemd, cron, the Kiro Crew cron or a driver chat |
| Supervisor pass | The step of a tick pass that reaps, resumes and starts `process` children |
| Pass lock | An operating-system lock a tick pass holds for one step, so two overlapping ticks never do that step twice |
| Front end | A tool a person or agent uses to reach Avoozl: Kiro Crew, Claude Code, the page, the CLI |
| Host package | The files one front end installs: skills, agents, MCP entry, guards |

## Requirements

### Requirement MS1: `avoozl tick` is the one engine

**User story:** As the owner, I want all of delivery in one command that runs
once and exits, so that any timer can drive it and nothing else has to stay
up.

#### Acceptance criteria

1. `avoozl tick` SHALL run one tick pass and exit: a supervisor pass, then
   for every enabled workspace in the machine catalog the tick, the harness
   readiness step, the hand-off of `process` session requests, a detached
   check runner for each repository with queued checks, the Needs Kiro Crew
   step and the notifications to the machine's sinks, then a supervisor pass
   again, then the page step (MS3.4). With `--workspace PATH` it SHALL pass
   only that workspace.
2. It SHALL print one result per workspace as JSON, record each workspace's
   result and time for `avoozl status`, and exit 1 when a workspace's tick
   failed, naming it.
3. A source test SHALL fail when a module other than the tick pass calls
   `drainProcessRequests` or `startCheckRunners`, when a module other than
   the check runner calls `drainCheckRuns`, or when any module runs the tick
   or the pass on a timer of its own.
4. The Kiro Crew app backend SHALL run no tick, no drain and no supervisor
   pass, and SHALL start no process for them.
5. `avoozl status` SHALL show each workspace's last pass, the `process`
   children with their states, the page, and each harness's start problem.

### Requirement MS2: Overlapping ticks

**User story:** As the owner, I want two timers that fire at once to do the
work once, so that I can run the tick from more than one place.

#### Acceptance criteria

1. A tick pass SHALL hold an operating-system lock for each step that two
   passes must not run at once, and SHALL skip that step when another
   process holds it. The operating system SHALL free the lock when the
   process ends in any way. No code SHALL rename or delete a lock file.
2. For each workspace, the pass SHALL hold the workspace pass lock beside
   that workspace's database for the tick and the drain after it, and SHALL
   report a held one as skipped, naming the holder's pid. The drain runs
   outside the tick's in-database work lock (`WORKSPACE_LOCK`,
   `src/app/tick/tick.ts`) and its in-flight guards are per process, so
   two drains at once could start a child or send a notification twice.
3. The supervisor pass SHALL hold the supervisor's pass lock. Two passes at
   once would start each requested child twice.
4. The in-database work lock of the tick SHALL stay. It serializes a tick
   with GitHub projection and with operations a person runs.
5. Tests on Linux, macOS and Windows: eight processes that take one pass
   lock at once leave exactly one holder and seven that name it; with the
   holder killed and eight more started, exactly one new holder exists
   within 5 seconds; a tick that finds a workspace's pass lock held skips
   that workspace and passes the others; a supervisor pass that finds its
   lock held starts nothing.

### Requirement MS3: Children and the page outlive the tick

**User story:** As the owner, I want an agent that runs longer than one tick
to finish its work, so that a short timer never cuts work off and no parent
process has to wait for it.

#### Acceptance criteria

1. The supervisor pass SHALL start each `process` child detached, and SHALL
   record its session id, pid, process start time, log, exit file and run
   count before the tick exits.
2. A later supervisor pass SHALL find each running child by pid and start
   time. It SHALL record a child whose wrapper wrote its exit file as
   exited with that code and result, resume a session whose run has exited
   and whose message is queued with the harness's resume command and the
   same session id, and record one it cannot find as `gone`. A pid whose
   start time differs SHALL count as gone.
3. A child given epic context MCP servers SHALL get its own broker process,
   started detached by the pass with the tick's environment, which serves
   that session's socket until the run's exit file appears. The pass that
   records the child's end SHALL stop it.
4. With `serve.enabled`, each tick SHALL keep the standalone page's server
   up: start it detached when it does not run, record its pid, start time
   and port, stop it when `serve.enabled` is off or the port changed, and
   start it again when it has exited. `avoozl link` SHALL print a new
   one-time owner link for it, and SHALL be refused in a `process` child
   (`AVOOZL_CHILD`).
5. Tests: a child started by one tick process keeps running after that
   process exits; a later pass reaps it, resumes it on a queued message with
   its run count raised, and records a dead or reused pid as gone; a page
   killed between ticks is started again by the next on the same port, and
   one turned off is stopped; the tick process itself listens on no socket.

### Requirement MS4: Timers, by choice

**User story:** As the owner, I want to pick what runs the tick on each of
my machines, so that work resumes after a restart without my opening
anything.

#### Acceptance criteria

1. `docs/getting-started.md` SHALL give paste-ready lines that run
   `avoozl tick` once a minute: a launchd agent for macOS, a systemd user
   service and timer for Linux, and a crontab line, each naming `node` and
   the CLI by absolute path and holding no secret.
2. No Avoozl command SHALL install, load or remove a timer. Setup and the
   page MAY show the lines and SHALL NOT run them.
3. The docs SHALL name the other callers: the Kiro Crew cron, which Kiro
   Crew runs every minute, and a chat that follows the `avoozl-drive`
   skill.

### Requirement MS5: Model access for unattended children

**User story:** As the owner, I want a child started by a timer or by Kiro
Crew to reach its model the same way as one I start from my terminal, so
that unattended work does not fail on a missing login.

#### Acceptance criteria

1. A child's model access SHALL come only through its definition's `keepEnv`
   names, its `reads` and `homeFiles`, or the repository's
   `sandbox.modelProxy`. `keepEnv` SHALL only pass names through: no name
   in it is required for a harness to start.
2. The tick SHALL take the values of `keepEnv` names from its own
   environment and then from the machine env file, `machine.env` in the
   machine config folder. On macOS and Linux the file SHALL be refused when
   anyone but the owner can read it. It SHALL be outside every child's read
   roots. Its values SHALL never be logged or shown.
3. For each role, `avoozl status` and Settings › Models SHALL show a harness
   that cannot start on this machine, and why: its program is not found,
   or its last sign-in probe failed. The probe SHALL run the definition's
   `probe` argv once with the home, environment and sandbox a worker gets,
   and its answer SHALL be cached per definition hash and `machine.env`.
   Neither the tick nor a page read SHALL run it; a person runs it with
   Check again in Settings › Models or `avoozl harness probe NAME`.
   A failed probe SHALL show the harness's own error text, shortened, with
   every given value and anything shaped like a credential redacted, and
   one line on how to fix it. A harness with no probe answer yet SHALL not
   be held back. The program SHALL be looked up, in order, as an absolute
   path in the definition, on `machine.env`'s `PATH`, on the tick's `PATH`,
   then on the person's login-shell `PATH` (read once per process; not on
   Windows). The supervisor SHALL spawn the path that lookup finds, with the
   `PATH` it was found on. A program found nowhere SHALL be named with each
   place looked and the fix: set `PATH` in `machine.env`, or give an
   absolute path. A request for it SHALL open one Needs you item, not
   repeat a failed start.
4. A login kept only in the macOS keychain is out of a child's reach, since
   the sandbox denies the keychain (`src/app/executors/sandbox.ts`). The
   docs SHALL say to use an API key, a cloud provider's short-lived
   credentials in `machine.env`, or a model proxy.
5. A definition with `egress` SHALL get its own egress proxy per session,
   bound to 127.0.0.1 only, with no setting that widens it. The proxy SHALL
   allow only CONNECT to port 443 of a listed host, where `*` stands for one
   label and the last two labels are fixed. It SHALL refuse every other
   request. It SHALL log host names only, never a header or tunnel byte.
   The child SHALL get `HTTPS_PROXY` for it, and its sandbox SHALL open
   only that loopback port beyond the repository's own. A definition with
   `credentialExport` SHALL have that argv run outside the sandbox before
   each start and each probe. The child SHALL get only the
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`
   values that argv prints, without `AWS_PROFILE`. Its copied `homeFiles`
   SHALL leave out the harness's own credential helper. No value SHALL be
   logged, and a failed export SHALL name its exit, never its output.

### Requirement MS6: Every role on Claude Code, unattended

**User story:** As the owner, I want every Avoozl role to run on Claude Code
with no front end open, so that Kiro Crew is optional.

#### Acceptance criteria

1. Every row of the role table that runs as a child (`process: true` in
   `src/app/agents/role-table.ts`: worker, reviewer, responder, check
   decide, assist) SHALL run on the `claude-code` definition as a child of
   a tick a timer ran, with no front end driving it (no interactive Claude
   Code or Codex session, and no Kiro Crew in the run's home), and SHALL
   reach its result kind.
2. The line watch has no agent session. The proof SHALL show that no watch
   session is requested and that the line watch still acts on a red head.
3. A test SHALL fail when a role table row with `process: true` is missing
   from the proof script's role list, so a new role cannot skip the proof.

### Requirement MS7: Every role on Codex, inside Avoozl's sandbox

**User story:** As the owner, I want every role to run on Codex too, so that
I can pick either harness per role.

#### Acceptance criteria

1. `permission.read` MAY be exactly `danger-full-access` under the rules
   R94.4d sets for `permission.write`: only inside Avoozl's sandbox, only
   with the read class's write roots (its temp folder, `.avoozl/` and named
   caches), and refused on a machine with no Avoozl sandbox, opt-in or not
   (design D12).
2. `examples/harnesses/codex.json` SHALL use it for the read class.
3. Every row of MS6.1 SHALL run on the `codex` definition and reach its
   result kind. A role that needs a served model SHALL read it from Codex's
   output, or SHALL record "no served model" with the reason.
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
     `~/.git-credentials`, the workspace database, the machine state
     folder, the Kiro Crew home, on macOS the keychain
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

### Requirement MS9: A chat can drive the tick

**User story:** As the owner, I want any agent chat to keep Avoozl going when
no timer runs, so that I can drive it from the tool I have open.

#### Acceptance criteria

1. `prompts/skills/avoozl-drive.md` SHALL say, for any runner: on each wake
   run `avoozl tick` once, read `avoozl next` and `avoozl status`, tell the
   person each Needs you item with the command that answers it, pass on
   what the person asks with the commands an agent may run, and stop until
   the next wake.
2. The skill SHALL decide nothing the tick decides: it SHALL not plan, pick,
   start, land or judge work, start a loop, or run a second tick while one
   runs.
3. The skill SHALL name the person-only steps and give the command the
   person types for each, as the front-end skill does.
4. Every host package SHALL carry the skill.

### Requirement MS10: `avoozl mcp` per chat

**User story:** As an agent in any front end, I want `avoozl mcp` to serve
my workspace from the chat's own process, so that a chat needs nothing
running to read and plan, and starting a chat starts nothing.

#### Acceptance criteria

1. `avoozl mcp --workspace PATH` SHALL be a stdio MCP server in its own
   process on that workspace's database. It SHALL start no process of its
   own and SHALL never loop.
2. A caller block in a message SHALL be read only by `avoozl mcp
   --kirocrew`, where Kiro Crew's gateway attaches it and picks the
   workspace by the rules in `src/app/executors/kirocrew/app-mcp.ts`.
   Any other server SHALL drop it, since any client could send one.
3. Its one tick tool, `plans_maintain` `tick`, SHALL run one tick pass for
   the caller's workspace and return its result. The Kiro Crew cron's call
   is MS12.1.
4. The CLI's `--url` option and `AVOOZL_URL` SHALL be refused, naming
   `avoozl mcp`.
5. For the same caller, `tools/list` SHALL return the same tools as the MCP
   path itself. A test compares them, so no agent's allowed tools grow.

### Requirement MS11: Host packages from one source

**User story:** As the owner, I want each front end's package built from one
source of skills, role metadata and prompts, so that they cannot drift.

#### Acceptance criteria

1. The Kiro Crew app SHALL live in `hosts/kirocrew/`.
2. The one source SHALL be `prompts/` (role prompts, and every skill as
   `prompts/skills/<name>.md`) and `roles.json` (each Kiro Crew agent's tools,
   permissions and hooks). `npm run build:hosts` SHALL write every generated
   file of every host package. `npm run check:hosts` SHALL fail when any
   generated file differs from what the build writes, and `pretest` and
   `pretest:ci` SHALL run the check.
3. `hosts/claude-code/` SHALL be a Claude Code plugin with the skills, an MCP
   entry that runs `avoozl mcp`, and a guard that refuses the agent's own
   shell call to a person-only `avoozl` command. The guard is a speed bump
   (R95.7), and the docs SHALL say so. Its skill SHALL tell the agent how
   the person approves a spec and answers a person-only Needs you item: the
   `avoozl` command, run by the person at their own prompt, or the page from
   `avoozl link`.

### Requirement MS12: The Kiro Crew cron runs the pass and the chat intents

**User story:** As the owner, I want the Kiro Crew cron to be one more timer,
plus what Kiro Crew allows no one else to do, so that a Kiro Crew machine
needs nothing else running.

#### Acceptance criteria

1. The cron's `plans_maintain` `tick` call (`cron: true`) SHALL run this
   machine's tick pass (MS1.1), with no gateway secret in the environment
   the pass's children inherit, then record the session observations it
   brings, and return only the pending intents for `kirocrew` sessions that
   the pass released: open (dispatch), send (messages) and re-trust
   (observe).
2. `tick.py` SHALL carry out only those three.
3. The reason SHALL be recorded in the design: Kiro Crew lets only the cron
   job that opened a chat control it, and the app backend gets 403 opening
   chats with the grants it has (product design F129).
4. Tests: a Python test of `tick.py` with a fake context; a Node test that
   the cron's call runs the pass and returns what the pass released.

### Requirement MS13: Docs and the product spec

**User story:** As a reader, I want the docs and the product spec to say
that `avoozl tick` is the engine and a timer drives it, so that no page
names a server that does not exist.

#### Acceptance criteria

1. The product spec SHALL say so: Requirement 95.1 and 95.3 name the
   supervisor pass inside each tick and who runs the tick; Requirement 98
   says every front end (Kiro Crew, the page, the CLI and the host
   packages) works on the same workspace databases.
2. worker-paths WP1.1 SHALL say the tick runs only in `avoozl tick`, from
   whatever timer runs it. standalone-web SW3 and SW9 SHALL say each tick
   keeps the page up and `avoozl link` makes its owner link.
3. `README.md`, `docs/getting-started.md`, `docs/person-only.md`,
   `docs/glossary.md`, `docs/workspaces.md` and `docs/scale-out.md` SHALL
   describe `avoozl tick`, the timer lines, `avoozl mcp`, the drive skill,
   `machine.env` and the host packages.
4. Research under `docs/research/` and receipts under `docs/evidence/`
   SHALL NOT be rewritten (AGENTS.md).
