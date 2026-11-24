---
repo: avoozl
category: Planning
---

# One tick pass, any timer, thin front ends

## Requirements

### Introduction

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

#### The parts

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

#### What this builds on

[avoozl](avoozl.md) stays the product spec. This spec keeps Requirement 93
(the executor seam), 94 (harness definitions), 95.2, 95.4 to 95.7 (the
supervisor pass's children and the sandbox) and 96 (one way to finish). It
sets Requirement 95.1, 95.3 and 98 (MS13), worker-paths WP1.1 and
standalone-web SW9 (MS13).

ms-p2 and ms-p3 also prove the `without-kirocrew` spec on both harnesses
(design D12, rule 3).

#### Scope

- `avoozl tick`, its pass locks, and the children and page that outlive it.
- The timers that call it, as lines in the docs.
- Unattended `process` children on Claude Code and Codex for every role.
- `avoozl mcp` and the `avoozl-drive` skill.
- Host packages and the one source they are built from.
- The Kiro Crew cron and backend on the same pass.

#### Out of scope

- Reaching Avoozl from another machine. Nothing here listens on a network.
- Kiro CLI or any other CLI as a `process` harness.
- Host packages for Codex and Kiro CLI. Any MCP client can run `avoozl mcp`
  and follow the drive skill.
- How many tasks run at once.

#### Words

| Word | Meaning |
| --- | --- |
| Tick pass | One run of `avoozl tick`: the supervisor pass, each workspace's tick and drain, the supervisor pass again, and the page |
| Timer | Whatever runs `avoozl tick` on a schedule: launchd, systemd, cron, the Kiro Crew cron or a driver chat |
| Supervisor pass | The step of a tick pass that reaps, resumes and starts `process` children |
| Pass lock | An operating-system lock a tick pass holds for one step, so two overlapping ticks never do that step twice |
| Front end | A tool a person or agent uses to reach Avoozl: Kiro Crew, Claude Code, the page, the CLI |
| Host package | The files one front end installs: skills, agents, MCP entry, guards |


#### Requirement MS1: `avoozl tick` is the one engine

**User story:** As the owner, I want all of delivery in one command that runs
once and exits, so that any timer can drive it and nothing else has to stay
up.

##### Acceptance criteria

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

#### Requirement MS2: Overlapping ticks

**User story:** As the owner, I want two timers that fire at once to do the
work once, so that I can run the tick from more than one place.

##### Acceptance criteria

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

#### Requirement MS3: Children and the page outlive the tick

**User story:** As the owner, I want an agent that runs longer than one tick
to finish its work, so that a short timer never cuts work off and no parent
process has to wait for it.

##### Acceptance criteria

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
4. Unless `serve.enabled` is `false`, each tick SHALL keep the standalone
   page's server up: start it detached when it does not run, record its pid,
   start time and port, stop it when `serve.enabled` is `false` or the port
   changed, and
   start it again when it has exited. `avoozl link` SHALL print a new
   one-time owner link for it, and SHALL be refused in a `process` child
   (`AVOOZL_CHILD`).
5. Tests: a child started by one tick process keeps running after that
   process exits; a later pass reaps it, resumes it on a queued message with
   its run count raised, and records a dead or reused pid as gone; a page
   killed between ticks is started again by the next on the same port, and
   one turned off is stopped; the tick process itself listens on no socket.

#### Requirement MS4: Timers, by choice

**User story:** As the owner, I want to pick what runs the tick on each of
my machines, so that work resumes after a restart without my opening
anything.

##### Acceptance criteria

1. `docs/getting-started.md` SHALL give paste-ready lines that run
   `avoozl tick` once a minute: a launchd agent for macOS, a systemd user
   service and timer for Linux, and a crontab line, each naming `node` and
   the CLI by absolute path and holding no secret.
2. No Avoozl command SHALL install, load or remove a timer. Setup and the
   page MAY show the lines and SHALL NOT run them.
3. The docs SHALL name the other callers: the Kiro Crew cron, which Kiro
   Crew runs every minute, and a chat that follows the `avoozl-drive`
   skill.

#### Requirement MS5: Model access for unattended children

**User story:** As the owner, I want a child started by a timer or by Kiro
Crew to reach its model the same way as one I start from my terminal, so
that unattended work does not fail on a missing login.

##### Acceptance criteria

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

#### Requirement MS6: Every role on Claude Code, unattended

**User story:** As the owner, I want every Avoozl role to run on Claude Code
with no front end open, so that Kiro Crew is optional.

##### Acceptance criteria

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

#### Requirement MS7: Every role on Codex, inside Avoozl's sandbox

**User story:** As the owner, I want every role to run on Codex too, so that
I can pick either harness per role.

##### Acceptance criteria

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

#### Requirement MS8: Proof that the sandbox contains Codex

**User story:** As the owner, I want proof that a Codex child with its own
sandbox off still cannot write, connect or read outside what Avoozl allows,
so that `danger-full-access` is safe to run unattended.

##### Acceptance criteria

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

#### Requirement MS9: A chat can drive the tick

**User story:** As the owner, I want any agent chat to keep Avoozl going when
no timer runs, so that I can drive it from the tool I have open.

##### Acceptance criteria

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

#### Requirement MS10: `avoozl mcp` per chat

**User story:** As an agent in any front end, I want `avoozl mcp` to serve
my workspace from the chat's own process, so that a chat needs nothing
running to read and plan, and starting a chat starts nothing.

##### Acceptance criteria

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

#### Requirement MS11: Host packages from one source

**User story:** As the owner, I want each front end's package built from one
source of skills, role metadata and prompts, so that they cannot drift.

##### Acceptance criteria

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

#### Requirement MS12: The Kiro Crew cron runs the pass and the chat intents

**User story:** As the owner, I want the Kiro Crew cron to be one more timer,
plus what Kiro Crew allows no one else to do, so that a Kiro Crew machine
needs nothing else running.

##### Acceptance criteria

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

#### Requirement MS13: Docs and the product spec

**User story:** As a reader, I want the docs and the product spec to say
that `avoozl tick` is the engine and a timer drives it, so that no page
names a server that does not exist.

##### Acceptance criteria

1. The product spec SHALL say so: Requirement 95.1 and 95.3 name the
   supervisor pass inside each tick and who runs the tick; Requirement 98
   says every front end (Kiro Crew, the page, the CLI and the host
   packages) works on the same workspace databases.
2. worker-paths WP1.1 SHALL say the tick runs only in `avoozl tick`, from
   whatever timer runs it. standalone-web SW3 and SW9 SHALL say each tick
   keeps the page up and `avoozl link` makes its owner link.
3. `README.md`, `docs/getting-started.md`, `docs/agent-access.md`,
   `docs/glossary.md`, `docs/workspaces.md` and `docs/scale-out.md` SHALL
   describe `avoozl tick`, the timer lines, `avoozl mcp`, the drive skill,
   `machine.env` and the host packages.
4. Research under `docs/research/` and receipts under `docs/evidence/`
   SHALL NOT be rewritten (AGENTS.md).

## Design

`MS` numbers are in [Requirements](#requirements); `R` numbers and `§`
sections without a `D` are in [avoozl](avoozl.md).

### D1. Shape

```text
 callers (any of them, at once is safe)        avoozl tick (one pass, exits)
 --------------------------------------        -----------------------------
 launchd / systemd timer / crontab ──┐         supervisor pass: reap, resume
 Kiro Crew cron (tick.py) ── mcp ────┼──────>  each workspace: tick -> drain
 driver chat (avoozl-drive skill) ───┘           -> checks -> notifications
                                               supervisor pass: start
                                               page step (unless serve off)
 front ends
 ----------
 Kiro Crew page ── app backend ──┐
 standalone page (avoozl link) ──┼── workspace databases (SQLite)
 avoozl CLI ─────────────────────┤
 Claude Code, Kiro Crew chats ───┘── avoozl mcp (one per chat, in process)

 left running between ticks: the process children a pass started (each with
 its wrapper, and a broker when it has context MCP servers), and the page
```

`avoozl tick` (`runPass`, `src/app/tick/tick-pass.ts`) is the only place
delivery runs. The CLI, the page and every `avoozl mcp` run operations on the
workspace database in their own process. SQLite and the in-database work
lock make that safe (`withWorkLock`, `src/app/git/git.ts`).

### D2. One pass (MS1)

| Step | Code | Lock |
| --- | --- | --- |
| Supervisor pass: record running children, reap ended ones, resume those with a queued message | `openSupervisor().pass()`, `src/app/executors/supervisor.ts` | supervisor pass lock |
| For each enabled catalog workspace, or the one named: `workspace.tick`, the harness readiness step, `drainProcessRequests`, `startCheckRunners`, the Needs Kiro Crew step, `notifications.deliver` | `tickWorkspace`, `tick-pass.ts` | workspace pass lock, and the tick's own work lock inside |
| Supervisor pass again: start what the tick requested | `pass()` | supervisor pass lock |
| Record each workspace's result for `avoozl status` | `recordPasses`, `src/app/executors/tick-passes.ts` | none |
| Page step | `hostPage`, `src/app/executors/page-child.ts` | none |

A repository's checks may run longer than a timer's interval, so
`startCheckRunners` (`src/app/delivery/check-runner.ts`) starts one
detached runner per repository with queued checks. Each runner drains that
repository's queue with `drainCheckRuns`, records the results, and exits;
the next tick judges them.

The first supervisor pass runs before the tick so the tick reads each child's
end in the same pass. The second starts children the tick asked for without
waiting a whole interval. One workspace's failure never stops the others; its
error is in the result, on stderr, and in the exit code.

Who calls it:

| Caller | How | Interval |
| --- | --- | --- |
| launchd, systemd, cron | the lines in `docs/getting-started.md` (MS4) | the person picks; the docs say 60 s |
| Kiro Crew cron | `tick.py` calls `plans_maintain tick` with `cron: true` through `avoozl mcp --kirocrew` (D5) | Kiro Crew's schedule, 60 s |
| A driver chat | `avoozl tick` on each wake (`avoozl-drive`, MS9) | the chat's wake |
| A chat's MCP tool | `plans_maintain tick` through `avoozl mcp` (MS10.3) | when the agent calls it |

### D3. The pass locks (MS2)

A pass lock is an exclusive SQLite transaction that is never ended until the
step is done (`tryLock`, `src/app/executors/pass-lock.ts`):
`PRAGMA busy_timeout = 0; locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE`. SQLite
holds it with `fcntl` locks on macOS and Linux and `LockFileEx` on Windows,
and the system drops it when the process ends in any way, so a killed tick
never leaves a lock behind. A second taker gets `SQLITE_BUSY` at once. No
step deletes or renames a lock file, so there is nothing to race on.

Two locks, each for a reason a test shows:

1. **Workspace pass lock**, `<database>.loop-lock` beside each workspace
   database, with `<database>.loop-lock.json` naming its holder (written
   only after the lock is held, and only ever read as information). The
   tick's in-database work lock covers `workspace.tick`, but the drain after
   it does not run under it, and its in-flight guards (`inFlight` in
   `src/app/delivery/check-runs.ts`) are per process. Two ticks from two
   timers, or from two state folders on one workspace, would each drain.
2. **Supervisor pass lock**, `supervisor/pass.lock` in the machine state
   folder. Two passes at once would both read a child as `requested` and
   start it twice.

A tick that cannot take a lock skips that step for that pass and says so.
The next tick tries again.

### D4. Commands

| Command | What it does |
| --- | --- |
| `avoozl tick [--workspace PATH]` | one pass (D2), prints one result per workspace, exits |
| `avoozl mcp --workspace PATH` | stdio MCP server on that workspace (D7) |
| `avoozl mcp --kirocrew` | the Kiro Crew app's stdio MCP server, workspace per caller |
| `avoozl status` | the workspace, then the machine: last pass per workspace, children, page, harnesses |
| `avoozl link` | a new one-time owner link for the page; refused in a `process` child |

Each is one entry in `src/app/commands/`, as AGENTS.md asks.

### D5. Kiro Crew (MS1.4, MS12)

The backend keeps its page, its readers and its push to Kiro Crew's channels.
It runs no tick, no drain and no supervisor pass, and starts no process.

The cron is the Kiro Crew machine's timer. Its call (`createAppMcp`,
`src/app/executors/kirocrew/app-mcp.ts`) runs the machine's pass first,
with `KIROCREW_PROXY_SECRET` and `KIROCREW_GATEWAY_ORIGIN_PROOF` dropped from
the environment the pass's children inherit, and then:

1. records the observations the cron brings (session statuses from the
   cron's roster);
2. reads the `kirocrew` work the pass released: session requests for the
   `kirocrew` executor, queued messages to its chats, and the live chats to
   re-trust (`cronIntents`, `src/app/executors/kirocrew/cron-intents.ts`);
3. returns those as `dispatch`, `messages` and `observe`, the shape
   `tick.py` reads.

The cron must be the one to carry them out. Kiro Crew lets only the cron job
that opened a chat send to it or set its mode, and the app backend's token
gets 403 on the chat routes with the grants it has (avoozl design F129).
Avoozl asks for no wider grant, which would reach every chat the person
opened.

### D6. Unattended children (MS5, MS6)

A tick a timer or Kiro Crew runs does not have the person's shell
environment. Two things then fail quietly: the harness program is not on
`PATH`, and the model key is not set.

- `PATH`: the timer lines name `node` and the CLI by absolute path and set
  `PATH` (MS4.1).
- Model access: `machine.env` in the machine config folder, `KEY=value`
  lines, read by the supervisor pass. Only names in a definition's
  `keepEnv` are passed to that child (`withKeptValues`,
  `src/app/executors/machine-env.ts`). The file is outside every child's
  read roots because the whole Avoozl config folder is (R95.6).
- Cloud sign-in: a definition's `homeFiles` are copied into the child's own
  home (a lane's or the probe's) before each start, so Claude Code's
  `settings.json` and Codex's `config.toml` carry their provider settings
  to the child. A `reads` entry under `~/.aws` is the one secret folder a
  child may read, read only, for an AWS profile (`harnessSecretReads`,
  `src/app/executors/harness-definitions.ts`).
- Sign-in probe: the definition's `probe` argv (no placeholders) runs in a
  fresh temp folder with a seeded home, the definition's `keepEnv`, `reads`
  and the worker's sandbox and egress. Its answer is kept in
  `harness-probes.json` in the machine config folder, keyed on the
  definition hash and a hash of `machine.env`, and read by
  `listHarnessDefinitions` (`probeHarness`,
  `src/app/executors/harness-probe.ts`).
- Egress (MS5.5): `harnessNetwork` runs the definition's
  `credentialExport` and starts `egress-proxy-main.ts`, a detached process,
  as the context broker is, since the child outlives the tick. The proxy
  listens on 127.0.0.1 on a free port, writes the port to the session
  folder, and ends when the run's exit file appears. The supervisor records
  its pid in `egress.json` and stops it with the session's context. The
  child gets `HTTPS_PROXY`, the exported keys and `setEnv`, and its sandbox
  network gets `localhost:PORT` (`src/app/executors/egress-proxy.ts`,
  `src/app/executors/harness-network.ts`).
- Readiness: one function per definition answers "can this start here?"
  and both `avoozl status` and Settings › Models show it per role (MS5.3).
  It fails on a program not found or a failed cached probe, never on a
  `keepEnv` name that is unset.
  The program is looked up as an absolute path, then on `machine.env`'s
  `PATH`, the server's `PATH`, and the person's login-shell `PATH`
  (`$SHELL -l -c /usr/bin/env`, a fixed argv, 3 second timeout, cached per
  process, skipped on Windows). The supervisor spawns the file that lookup
  returns and gives the child the `PATH` it was found on, so the check and
  the spawn agree (`findProgram`, `src/app/executors/harness-ready.ts`).

**Roles.** `scripts/proofs/proof-ms-roles-live.ts --harness NAME` drives the
rows of `scripts/proofs/ms-roles-rows.ts` on a scratch repository and prints
one line per row; a test fails when a `ROLE_TABLE` row with `process: true`
has no row there, or a row drives a role `ROLE_TABLE` does not have. The
machine's `loop` is on, so the tick starts and lands the work. The script
runs `avoozl tick` every 10 seconds, each as its own process, as a timer
would, with no front end open. It pushes a failing commit to the scratch
main for the line watch row, and reads the `command` sink's file.
`scripts/proofs/run-ms-owner-proofs.ts` runs it for ms-p2 and ms-p3 from the
owner's terminal and drafts the receipts.

| Row | Scenario | Result kind |
| --- | --- | --- |
| worker | one-file task | commit by Avoozl, landed |
| reviewer | the review role every repository gets | verdict |
| responder | a new discussion in the category the policy names | posted reply |
| assist | Ask for help on the page | answer, no file |
| check decide | a plugin check that needs a decision | answer (not driven: no plugin check is installed) |
| (line watch) | a red head on main | the line stops; no session request |

### D7. Codex inside Avoozl's sandbox (MS7, MS8)

Codex's own sandbox cannot nest inside Avoozl's on macOS: with
`workspace-write` or `read-only` it can neither edit a file nor run a command
(P58, `docs/evidence/p58-codex-by-definition.md`). R94.4d therefore lets
`permission.write` be `danger-full-access` inside Avoozl's sandbox only. A
read role on Codex hits the same wall, so MS7.1 extends the same rule to
`permission.read`. The read class's write roots exclude the task folder
(`harnessPermission`, `src/app/executors/harness-definitions.ts`), so the
read role still cannot change code. Only Avoozl's sandbox enforces that.

That is why MS8 exists. One module, `src/app/sandbox-probes.ts`, lists each
probe as `{id, class, argv, expect: "refused"}` with argv lists only. The CI
test runs a stand-in harness (a Node script) under `confineChild` on the
macOS and Linux legs and asserts every probe is refused. The live proof gives
Codex a brief that names the same argv lines and reads Codex's transcript and
the probe log. The name-lookup probe matters on macOS: a lookup through the
system resolver is a Mach service, not a socket, and the profile must deny it
or the receipt must name it as a finding. On Linux the CI leg installs
`bwrap`; without a usable one the test fails rather than skips.

### D8. What outlives the tick (MS3)

**Children.** The supervisor pass starts each child as
`node supervisor-child.ts <exit-file> [--stdin FILE] <confined argv>`,
detached, with its output in its own log (`start` in `openSupervisor`).
Before the pass ends it records, in `supervisor/supervisor.sqlite`, the
session id (`process-<uuid>`, which is also the harness's own session id for
resume), the wrapper's pid and the operating system's start time for that
pid, the log, the exit file and the run count. The wrapper writes the exit
code to the exit file when the agent ends, so no parent has to wait on it.

A later pass, in another process, reads each `running` row:

| Found | Recorded |
| --- | --- |
| exit file with a code | `exited` with that code and the result file's contents |
| no exit file, pid alive with the same start time | still `running` |
| no exit file, pid gone or started at another time | `gone` (R88.4 decides what follows) |

A session whose run has exited and has a queued message is started again
with the definition's `resume` argv, the same session id and the next run
count, so the harness resumes its own conversation. A stop request writes
`<exit-file>.stop`, which the wrapper polls, and signals the process group
off Windows after checking the start time.

**Brokers.** A child with epic context MCP servers reaches them through a
relay and a broker (epic-context D6). The broker must outlive the tick, so
the pass starts it as its own detached process (`context-broker-main.ts`)
with the tick's environment, which holds the values a server's `env` names;
the child's confined environment never does. Its spec file names the
session, the servers by command and variable names only, the socket in a
`0700` folder, the token, and the run's exit file. It serves until the exit
file appears or the pass that records the child's end signals it.

**The page.** Unless `serve.enabled` is `false`, each pass's page step reads
`supervisor/page.json` (pid, start time, port). It starts `serve-main.ts`
detached when that process is not alive, and stops it when `serve.enabled` is
`false` or `serve.port` changed. On Windows a detached child would inherit the
tick caller's handles and hold its output open, so the page starts through
`Start-Process`, which passes none, and writes its own log.

### D9. Host packages and one source (MS9.4, MS11)

```text
prompts/<role>.md   prompts/skills/<name>.md   roles.json
          \             |             /
           npm run build:hosts (scripts/bundle/build-hosts.ts)
               /                      \
      hosts/kirocrew/            hosts/claude-code/
```

Each host has one small adapter in `scripts/bundle/build-hosts.ts` that maps the
source to that host's files. `--check` builds into memory and compares byte
for byte, naming each file that differs. Generated files carry no marker;
the check is the guard. Hand-written host files (the Kiro Crew manifest, the
page source, `tick.py`, the Claude Code guard) are kept, and the check
ignores them.

`roles.json` holds what the Kiro Crew agents need (tools, permissions, hooks)
per role. Claude Code runs Avoozl's roles as `process` children, not as
plugin agents, so its plugin takes only the skills, the MCP entry and the
guard. Both packages carry `avoozl-drive`.

### D10. Security review

**Exposure.** Avoozl adds no listener here. `avoozl tick` and `avoozl mcp`
listen on nothing (a test checks the tick process). The page keeps its own
reviewed loopback listener (standalone-web D10), started by the tick.
Each context broker listens on one Unix socket in a `0700` folder of its
own, with a per-session token (epic-context D6). No container, port publish,
tunnel or remote access is built.

**Authorization.** Every `avoozl mcp` call is an agent principal, so
person-only operations are refused (R56, `mcpRefusal`). Spec approval,
harness approval and person-only Needs you answers stay with the person: the
CLI at their own prompt, or the page with its owner link. The host guard
(MS11.3) is a speed bump, as R95.7 says of Kiro Crew chats, and the docs say
so. A caller block reaches only `avoozl mcp --kirocrew`, where the gateway
attaches it.

**Children.** A sandboxed child cannot read the machine state folder (R95.6),
which holds the supervisor database and the page's owner links. On a machine
with no sandbox, the owner's per-machine opt-in (R94.5) already accepts that
a child runs with the owner's reach.

**Secrets.** `machine.env` is an owner-only file outside git and outside
every child's read roots. Its values are never logged, shown or put in a
receipt (MS5.2). Timer lines hold no secret (MS4.1). The cron's pass drops
the gateway's secrets before anything starts (MS12.1).

**Checks before landing a task that touches a listener.** Search the
repository for `0.0.0.0`, `::`, `listen(`, `--host`, `--bind`,
`Access-Control-Allow` and `createServer`. Every hit is loopback, a Unix
socket, a test, or explained in the pull request.

### D11. Phases

| Phase | Requirements | Tasks |
| --- | --- | --- |
| 1. One pass on Claude Code | MS1 to MS6 | `ms-1.1` to `ms-1.6` |
| 2. Codex | MS7, MS8 | `ms-2.1`, `ms-2.2` |
| 3. MCP and the drive skill | MS9, MS10 | `ms-3.1`, `ms-3.2` |
| 4. Host packages | MS11 | `ms-4.1`, `ms-4.2` |
| 5. Cron and docs | MS12, MS13 | `ms-5.1`, `ms-5.2` |
| 6. Live proofs | MS5 to MS8, MS12 | `ms-p2` then `ms-p3`, in parallel with `ms-p7` |

### D12. Rules

- `avoozl tick` is the engine. Nothing in Avoozl loops or stays up between
  ticks but the children a pass started and the page (MS1, MS3).
- Codex runs with its own sandbox off only inside Avoozl's sandbox. The
  containment proof shows that writes outside the write roots, network past
  the proxy and credential reads are refused (MS7, MS8).
- Spec approvals and person-only Needs you answers stay off MCP (MS10).

**Numbered rules.** Other sections cite these by number.

1. **Codex read roles with its sandbox off (MS7.1).** The read class takes
   the Codex rule above, as the write class does. Codex's read roles cannot
   run a command otherwise, and the read class's write roots keep it off the
   code. The containment proof (MS8) is the check.
2. **The page and the CLI stay on the database (D1).** No front end reaches
   delivery through another process.
3. **The proof of `without-kirocrew`.** ms-p2 and ms-p3 run every role
   with no Kiro Crew on both harnesses, and ms-p2 includes the command sink
   step of that spec's NK7.
4. **`machine.env` holds model keys (MS5.2).** Keys never go in timer lines.
5. **Timers are the person's (MS4.2).** Avoozl prints none and installs
   none; the docs hold the lines.
6. **The page is on by default, loopback only.** Its one listener binds
   `127.0.0.1` behind a one-time owner link, so it is on unless
   `serve.enabled` is `false`.

### D14. Risks

- **A long tick.** A tick that runs longer than its timer's interval makes
  the next one skip what it holds (D3). Work is not lost, only later.
- **No timer.** With no timer, no cron and no driver chat, nothing runs.
  `avoozl status` shows each workspace's last pass, so a stale one is seen.
- **Windows children.** A `process` child on Windows (only with the owner's
  no-sandbox opt-in) is started directly and inherits the tick caller's
  inheritable handles; a caller that waits for its own output to close
  waits for that child.
- **Codex output changes.** The served-model read and the JSON event shape
  can change between Codex releases; the proof records the version.

## Tasks

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`MS1` to `MS13`, in [Requirements](#requirements)); `D` sections
refer to [Design](#design), `R` numbers to
[avoozl requirements](avoozl.md#requirements). Phases are the phases of D11.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, a fake GitHub, and fake executors; Avoozl runs
the repository's checks; no real workspace data, machine configuration,
credentials or personal plans in the repository (AGENTS.md). Before
landing a task that touches a listener, run the D10 search and explain every
hit in the pull request.

Task IDs start with `ms-` so they never collide with the IDs of the other
specs.

### Phase 1: One pass on Claude Code

- [x] `ms-1.1` The pass locks [MS2] (§D3)
  - Tests on Linux, macOS and Windows: an exclusive SQLite lock is held for the handle's life and refused at once to a second opener; eight processes behind one barrier leave exactly one holder and seven that name it; after the holder is killed and eight more start, exactly one new holder exists within 5 seconds; two state folders on one workspace leave one holder, named by its record; no code path renames or deletes a lock file.
  - The code is `src/app/executors/pass-lock.ts`: the workspace pass lock `<database>.loop-lock` and `tryLock`, which the supervisor pass lock uses.
- [x] `ms-1.2` `avoozl tick` is one pass, after ms-1.1 [MS1.1, MS1.2, MS1.3, MS1.5, MS2.2] (§D2, §D4)
  - Tests through the real CLI: `avoozl tick` passes every enabled catalog workspace once, records each for `avoozl status`, and exits holding no lock; `--workspace` passes only that one; a tick that finds one workspace's pass lock held skips it and passes the other; the source test of MS1.3 passes; the single-write-path test still sees every tick write inside Operations.
  - `runPass` and `tickWorkspace` in `src/app/tick/tick-pass.ts`, the `tick` entry in `src/app/commands/delivery.ts`, and the last passes in `src/app/executors/tick-passes.ts` and `src/app/workspace/machine-status.ts`.
- [x] `ms-1.3` Children and the page outlive the tick, after ms-1.1 [MS2.3, MS3] (§D8)
  - Tests: a child started by one tick process keeps running after that process exits, with its pid and session recorded; the next pass reaps it from its exit file, resumes it on a queued message with its run count raised, and records a dead or reused pid as gone; a pass that finds the supervisor pass lock held starts nothing; an epic context session still reaches its MCP servers through its own broker process; a page killed between ticks is started again by the next on the same port, a page turned off is stopped, and the tick process listens on no socket; `avoozl link` is refused with `AVOOZL_CHILD`.
  - `openSupervisor` in `src/app/executors/supervisor.ts`, `src/app/executors/context-broker-main.ts` and `src/app/executors/page-child.ts`.
- [x] `ms-1.4` The Kiro Crew backend and cron on the pass, after ms-1.2 [MS1.4, MS12.1, MS12.3] (§D5)
  - Tests: the cron's `plans_maintain tick` call runs the machine's pass on its own state folder, records its observations and returns the start the pass released; a chat's tick call runs one pass for its own workspace; the backend starts no process; the design's F129 reason is in the code comment of the cron call.
- [x] `ms-1.5` Model access and harness readiness for unattended children, after ms-1.3 [MS5] (§D6)
  - Tests: a `keepEnv` value from `machine.env` reaches the child and no other name does; a group-readable file is refused on macOS and Linux; no value appears in logs, status or receipts; the sandbox test shows the file outside a child's read roots; a harness whose program is missing, or whose cached sign-in probe failed, shows per role in `avoozl status` and Settings › Models and a request for it opens one Needs you item.
- [x] `ms-1.6` The role proof script for any harness, after ms-1.2 [MS6.3] (§D6)
  - `scripts/proofs/proof-ms-roles-live.ts --harness NAME` runs the D6 rows on a scratch repository with `avoozl tick` run every 10 seconds as its own process, and prints one line per row; a test fails when a `ROLE_TABLE` row with `process: true` is not in its list, or a row drives a role `ROLE_TABLE` does not have; a dry run with `--harness fake-cli --offline` passes every row it can drive offline; `scripts/proofs/run-ms-owner-proofs.ts` runs ms-p2 and ms-p3 and drafts their receipts.

### Phase 2: Codex

- [x] `ms-2.1` Codex's read class inside Avoozl's sandbox, after ms-1.3 [MS7.1, MS7.2, MS7.5] (§D7)
  - Tests: `permission.read: "danger-full-access"` loads only with write roots and runs only inside Avoozl's sandbox; with no sandbox it is refused for every role, opt-in or not, on the Windows leg too; a read child's write roots exclude the task folder; `codex.json` uses it and still loads.
  - Codex's own sandbox stays off only inside Avoozl's sandbox (D12).
- [x] `ms-2.2` The containment probes and their CI test, after ms-1.3, ms-1.6 [MS8.1, MS8.2, MS8.3, MS8.4] (§D7)
  - `src/app/sandbox-probes.ts` holds every MS8.1 probe as an argv list; the test runs them under `confineChild` with `danger-full-access` and a stand-in harness on the macOS and Linux legs and every probe is refused; the Linux leg fails rather than skips without a usable `bwrap`; a probe planted to succeed fails the test naming it; `scripts/proofs/proof-ms-roles-live.ts --probes` runs the same set in a live child.
  - Fix any probe that gets through in `src/app/executors/sandbox.ts`, never by changing the probe.

### Phase 3: MCP and the drive skill

- [x] `ms-3.1` `avoozl mcp` per chat, after ms-1.2 [MS10] (§D4, §D10)
  - Tests: `avoozl mcp --workspace` serves the workspace, lists the same tools as the MCP path, and starts no process; a caller block on it grants nothing; its tick tool runs one pass for the workspace and returns; `--url` and `AVOOZL_URL` are refused naming `avoozl mcp`; the Kiro Crew cron's call through `avoozl mcp --kirocrew` returns the chat intents.
  - `src/app/mcp/mcp-stdio.ts` and `src/app/mcp/mcp-tick.ts`, and the `mcp` entry in `src/app/commands/machine.ts`.
- [x] `ms-3.2` The `avoozl-drive` skill, after ms-1.2 [MS9] (§D2)
  - `prompts/skills/avoozl-drive.md` says to run `avoozl tick` once per wake, read `avoozl next` and `avoozl status`, report Needs you with the person's commands, pass on steers with the commands an agent may run, and decide nothing the tick decides; `npm run check:hosts` passes with it in both host packages.

### Phase 4: Host packages

- [x] `ms-4.1` One source and `hosts/kirocrew/` [MS11.1, MS11.2] (§D9)
  - The Kiro Crew app is `hosts/kirocrew/` and every reference outside `docs/research/` and `docs/evidence/` follows; `prompts/` (with `prompts/skills/`) and `roles.json` are the source; `npm run check:hosts` passes and fails naming a file after one generated byte changes; `pretest` and `pretest:ci` run the check; the Kiro Crew page tests pass.
  - `scripts/bundle/build-hosts.ts` holds the adapters.
- [x] `ms-4.2` The Claude Code host package, after ms-4.1, ms-3.1 [MS11.3] (§D9)
  - `hosts/claude-code/` is built by the Claude Code adapter and checked; a test installs it into a temporary Claude Code config and finds the skills and the `avoozl mcp` entry; the guard refuses an agent shell call to each person-only `avoozl` command and allows the others; the skill names how the person approves and answers.

### Phase 5: The cron and the docs

- [x] `ms-5.1` `tick.py` keeps only chat intents, after ms-1.4, ms-4.1 [MS12.2, MS12.4] (§D5)
  - `hosts/kirocrew/crons/tick.py` opens, sends and re-trusts and nothing else; the Python test with a fake context covers each and a refused send; the Node test that the cron's call runs the pass passes; `app.json`'s permissions are unchanged.
- [x] `ms-5.2` Docs and the product spec, after ms-1.2, ms-3.2 [MS4, MS13] (§D2)
  - The product spec, worker-paths WP1.1 and standalone-web SW3 and SW9 say what MS13 lists; `README.md`, `docs/getting-started.md`, `docs/person-only.md`, `docs/glossary.md`, `docs/workspaces.md` and `docs/scale-out.md` describe `avoozl tick`, the launchd, systemd and crontab lines, `avoozl mcp`, the drive skill, `machine.env` and the host packages.

### Phase 6: Live proofs

- [ ] `ms-live-proofs` Validate the harnesses and the Kiro Crew cron (**PARALLEL**)
  - [ ] `ms-harness-proofs` Validate the process harnesses
    - [ ] `ms-p2` Proof: every role on Claude Code with no front end, after ms-1.6 [MS5, MS6] (§D6) (**MANUAL**)
      - Expected: (1) the worker, reviewer, responder and assist rows reach their result kinds, the check decide row is named as not driven, and every session has executor `process`; (2) no watch session request exists and the line stops on the red head; (3) the sink file holds one line per decision; (4) the receipt lists each row with its harness version.
      - Record the observed result in a receipt under `docs/evidence/`.
      - Setup: an isolated Avoozl home and workspace, a private scratch GitHub repository, an approved Claude Code definition, model access from `machine.env` or a model proxy, every role's harness set to `claude-code`, the machine's `loop` on, and a `command` sink to a file. Only `avoozl tick` run as its own process drives the run: no interactive Claude Code or Codex session is open, and the run's isolated home has no Kiro Crew in it. A Kiro Crew running for other work may stay open. The owner runs it from his own terminal, because Kiro Crew's sandbox refuses a nested `sandbox-exec`.
      - Action: (1) `node scripts/proofs/run-ms-owner-proofs.ts --only ms-p2`, which makes a private scratch repository, pushes the failing commit, reads the sink file, and deletes the repository at the end; (2) correct and commit the receipt it drafts.
      - Failure means: some role still needs a front end open.
      - Next decision: whether `claude-code` becomes the default harness for new workspaces.

    - [ ] `ms-p3` Proof: every role on Codex, and the sandbox contains it, after ms-2.1, ms-2.2, ms-p2 [MS7, MS8] (§D7) (**MANUAL**)
      - Expected: (1) every row reaches its result kind or the receipt names why it cannot; (2) every probe is refused on both systems, each with its error text; (3) `codex.json`'s `proved` matches the receipt.
      - Record the observed result in a receipt under `docs/evidence/`.
      - Setup: as ms-p2 with every role on `codex`, its own `CODEX_HOME`, and the model reached through the repository's model proxy. On macOS and on Linux. The owner runs it from his own terminal.
      - Action: (1) `node scripts/proofs/run-ms-owner-proofs.ts --only ms-p3`; (2) read Codex's transcript and the probe log; (3) update `proved` in `codex.json` in the receipt's commit.
      - Failure means: Codex cannot run unattended here; it stays off the failing roles.

  - [ ] `ms-p7` Proof: the cron on a throwaway Kiro Crew, after ms-5.1 [MS12] (§D5) (**MANUAL**)
    - Expected: (1) the chat opens, gets the message and keeps trust mode; (2) the cron history shows only open, send and trust calls besides the pass; (3) the task lands.
    - Record the observed result from the current cron in a receipt under `docs/evidence/`.
    - Setup: the throwaway test Kiro Crew with its own home and this machine's `loop` on, an isolated workspace with one `kirocrew` task, its worker and reviewer lanes, and a private scratch repository; the cron is the only thing that runs the tick; `scripts/proofs/proof-ms-p7-live.ts` sets it up and acts as the person. The chat drives the test crew's clicks itself.
    - Action: (1) approve the task; (2) restart the test crew's gateway while the worker's chat has a turn running, so the pass nudges the quiet chat, which sends a message to it; (3) read the cron's run history.
    - Failure means: the cron does work the pass should own, or a Kiro Crew machine needs another timer.
