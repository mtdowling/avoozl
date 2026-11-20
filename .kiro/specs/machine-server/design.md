# Design: one tick pass, any timer, thin front ends

`MS` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`. **V** marks a claim read
in the file cited.

## D1. Shape

```text
 callers (any of them, at once is safe)        avoozl tick (one pass, exits)
 --------------------------------------        -----------------------------
 launchd / systemd timer / crontab ──┐         supervisor pass: reap, resume
 Kiro Crew cron (tick.py) ── mcp ────┼──────>  each workspace: tick -> drain
 driver chat (avoozl-drive skill) ───┘           -> checks -> notifications
                                               supervisor pass: start
                                               page step (serve.enabled)
 front ends
 ----------
 Kiro Crew page ── app backend ──┐
 standalone page (avoozl link) ──┼── workspace databases (SQLite)
 avoozl CLI ─────────────────────┤
 Claude Code, Kiro Crew chats ───┘── avoozl mcp (one per chat, in process)

 left running between ticks: the process children a pass started (each with
 its wrapper, and a broker when it has context MCP servers), and the page
```

`avoozl tick` (V: `runPass`, `src/app/tick/tick-pass.mjs`) is the only place
delivery runs. The CLI, the page and every `avoozl mcp` run operations on the
workspace database in their own process. SQLite and the in-database work
lock make that safe (V: `withWorkLock`, `src/app/git/git.mjs`).

## D2. One pass (MS1)

| Step | Code | Lock |
| --- | --- | --- |
| Supervisor pass: record running children, reap ended ones, resume those with a queued message | `openSupervisor().pass()`, `src/app/executors/supervisor.mjs` | supervisor pass lock |
| For each enabled catalog workspace, or the one named: `workspace.tick`, the harness readiness step, `drainProcessRequests`, `drainCheckRuns`, the Needs Kiro Crew step, `notifications.deliver` | `tickWorkspace`, `tick-pass.mjs` | workspace pass lock, and the tick's own work lock inside |
| Supervisor pass again: start what the tick requested | `pass()` | supervisor pass lock |
| Record each workspace's result for `avoozl status` | `recordPasses`, `src/app/executors/tick-passes.mjs` | none |
| Page step | `hostPage`, `src/app/executors/page-child.mjs` | none |

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

## D3. The pass locks (MS2)

A pass lock is an exclusive SQLite transaction that is never ended until the
step is done (V: `tryLock`, `src/app/executors/pass-lock.mjs`):
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
   it does not run under it, and its in-flight guards (V: `inFlight` in
   `src/app/delivery/check-runs.mjs`) are per process. Two ticks from two
   timers, or from two state folders on one workspace, would each drain.
2. **Supervisor pass lock**, `supervisor/pass.lock` in the machine state
   folder. Two passes at once would both read a child as `requested` and
   start it twice.

A tick that cannot take a lock skips that step for that pass and says so.
The next tick tries again.

## D4. Commands

| Command | What it does |
| --- | --- |
| `avoozl tick [--workspace PATH]` | one pass (D2), prints one result per workspace, exits |
| `avoozl mcp --workspace PATH` | stdio MCP server on that workspace (D7) |
| `avoozl mcp --kirocrew` | the Kiro Crew app's stdio MCP server, workspace per caller |
| `avoozl status` | the workspace, then the machine: last pass per workspace, children, page, harnesses |
| `avoozl link` | a new one-time owner link for the page; refused in a `process` child |

Each is one entry in `src/app/commands/`, as AGENTS.md asks.

## D5. Kiro Crew (MS1.4, MS12)

The backend keeps its page, its readers and its push to Kiro Crew's channels.
It runs no tick, no drain and no supervisor pass, and starts no process.

The cron is the Kiro Crew machine's timer. Its call (V: `createAppMcp`,
`src/app/executors/kirocrew/app-mcp.mjs`) runs the machine's pass first,
with `KIROCREW_PROXY_SECRET` and `KIROCREW_GATEWAY_ORIGIN_PROOF` removed from
the environment the pass's children inherit, and then:

1. records the observations the cron brings (session statuses from the
   cron's roster);
2. reads the `kirocrew` work the pass released: session requests for the
   `kirocrew` executor, queued messages to its chats, and the live chats to
   re-trust (V: `cronIntents`, `src/app/executors/kirocrew/cron-intents.mjs`);
3. returns those as `dispatch`, `messages` and `observe`, the shape
   `tick.py` reads.

The cron must be the one to carry them out. Kiro Crew lets only the cron job
that opened a chat send to it or set its mode, and the app backend's token
gets 403 on the chat routes with today's grants (avoozl design F129).
Widening the grants would let Avoozl reach every chat the person opened,
which the owner did not accept.

## D6. Unattended children (MS5, MS6)

A tick a timer or Kiro Crew runs does not have the person's shell
environment. Two things then fail quietly: the harness program is not on
`PATH`, and the model key is not set.

- `PATH`: the timer lines name `node` and the CLI by absolute path and set
  `PATH` (MS4.1).
- Model access: `machine.env` in the machine config folder, `KEY=value`
  lines, read by the supervisor pass. Only names in a definition's
  `keepEnv` are passed to that child (V: `withKeptValues`,
  `src/app/executors/machine-env.mjs`). The file is outside every child's
  read roots because the whole Avoozl config folder is (R95.6).
- Readiness: one function per definition answers "can this start here?"
  and both `avoozl status` and Settings › Models show it per role (MS5.3).
  The program is looked up as an absolute path, then on `machine.env`'s
  `PATH`, the server's `PATH`, and the person's login-shell `PATH`
  (`$SHELL -l -c /usr/bin/env`, a fixed argv, 3 second timeout, cached per
  process, skipped on Windows). The supervisor spawns the file that lookup
  returns and gives the child the `PATH` it was found on, so the check and
  the spawn agree (V: `findProgram`, `src/app/executors/harness-ready.mjs`).

**Roles.** `scripts/proofs/proof-ms-roles-live.mjs --harness NAME` drives the
rows of `scripts/proofs/ms-roles-rows.mjs` on a scratch repository and prints
one line per row; a test fails when a `ROLE_TABLE` row with `process: true`
has no row there, or a row drives a role `ROLE_TABLE` does not have. The
machine's `loop` is on, so the tick starts and lands the work. The script runs `avoozl tick` every 10 seconds, each as its
own process, as a timer would, with no front end open.
`scripts/proofs/run-ms-owner-proofs.mjs` runs it for ms-p2 and ms-p3 from the
owner's terminal and drafts the receipts.

| Row | Scenario | Result kind |
| --- | --- | --- |
| worker | one-file task | commit by Avoozl, landed |
| verifier | a task in a repository with no checks | verdict (not driven: the scratch repository has checks, which Avoozl runs itself) |
| reviewer | the review role every repository gets | verdict |
| planner | New plan request | spec folder that lints clean |
| retro | a retrospective | reply (not driven: retros run as the `avoozl-retro` skill, so nothing starts a retro child) |
| responder | a new discussion in the category the policy names | posted reply |
| assist | Ask for help on the page | answer, no file |
| check decide | a plugin check that needs a decision | answer (not driven: no plugin check is installed) |
| (line watch) | a red head on main | the line stops; no session request |

## D7. Codex inside Avoozl's sandbox (MS7, MS8)

Codex's own sandbox cannot nest inside Avoozl's on macOS: with
`workspace-write` or `read-only` it can neither edit a file nor run a command
(P58, `docs/evidence/p58-codex-by-definition.md`). R94.4d therefore lets
`permission.write` be `danger-full-access` inside Avoozl's sandbox only. A
read role on Codex hits the same wall, so MS7.1 extends the same rule to
`permission.read`. The read class's write roots exclude the task folder (V:
`harnessPermission`, `src/app/executors/harness-definitions.mjs`), so the
read role still cannot change code. Only Avoozl's sandbox enforces that.

That is why MS8 exists. One module, `src/app/sandbox-probes.mjs`, lists each
probe as `{id, class, argv, expect: "refused"}` with argv lists only. The CI
test runs a stand-in harness (a Node script) under `confineChild` on the
macOS and Linux legs and asserts every probe is refused. The live proof gives
Codex a brief that names the same argv lines and reads Codex's transcript and
the probe log. The name-lookup probe matters on macOS: a lookup through the
system resolver is a Mach service, not a socket, and the profile must deny it
or the receipt must name it as a finding. On Linux the CI leg installs
`bwrap`; without a usable one the test fails rather than skips.

## D8. What outlives the tick (MS3)

**Children.** The supervisor pass starts each child as
`node supervisor-child.mjs <exit-file> [--stdin FILE] <confined argv>`,
detached, with its output in its own log (V: `start` in `openSupervisor`).
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
the pass starts it as its own detached process (`context-broker-main.mjs`)
with the tick's environment, which holds the values a server's `env` names;
the child's confined environment never does. Its spec file names the
session, the servers by command and variable names only, the socket in a
`0700` folder, the token, and the run's exit file. It serves until the exit
file appears or the pass that records the child's end signals it.

**The page.** With `serve.enabled`, each pass's page step reads
`supervisor/page.json` (pid, start time, port). It starts `serve-main.mjs`
detached when that process is not alive, and stops it when `serve.enabled` is
off or `serve.port` changed. On Windows a detached child would inherit the
tick caller's handles and hold its output open, so the page starts through
`Start-Process`, which passes none, and writes its own log.

## D9. Host packages and one source (MS9.4, MS11)

```text
prompts/<role>.md   prompts/skills/<name>.md   roles.json
          \             |             /
           npm run build:hosts (scripts/build-hosts.mjs)
               /                      \
      hosts/kirocrew/            hosts/claude-code/
```

Each host has one small adapter in `scripts/build-hosts.mjs` that maps the
source to that host's files. `--check` builds into memory and compares byte
for byte, naming each file that differs. Generated files carry no marker;
the check is the guard. Hand-written host files (the Kiro Crew manifest, the
page source, `tick.py`, the Claude Code guard) are kept, and the check
ignores them.

`roles.json` holds what the Kiro Crew agents need (tools, permissions, hooks)
per role. Claude Code runs Avoozl's roles as `process` children, not as
plugin agents, so its plugin takes only the skills, the MCP entry and the
guard. Both packages carry `avoozl-drive`.

## D10. Security review

**Exposure.** Avoozl adds no listener here. `avoozl tick` and `avoozl mcp`
listen on nothing (a test checks the tick process). The page keeps its own
reviewed loopback listener (standalone-web D10), now started by the tick.
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

## D11. Phases

| Phase | Requirements | Tasks | Exit |
| --- | --- | --- | --- |
| 1: one pass on Claude Code | MS1 to MS6 | ms-1.1 to ms-1.6 | ms-p2 |
| 2: Codex | MS7, MS8 | ms-2.1, ms-2.2 | ms-p3 |
| 3: MCP and the drive skill | MS9, MS10 | ms-3.1, ms-3.2 | none |
| 4: host packages | MS11 | ms-4.1, ms-4.2 | none |
| 5: cron and docs | MS12, MS13 | ms-5.1, ms-5.2 | ms-p7 |

## D12. Rules

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
3. **nk-p2 of `without-kirocrew`.** ms-p2 and ms-p3 cover its steps on both
   harnesses, and ms-p2 includes its command sink step. nk-p2 is ticked as
   proved by those two receipts.
4. **`machine.env` holds model keys (MS5.2).** Keys never go in timer lines.
5. **Timers are the person's (MS4.2).** Avoozl prints none and installs
   none; the docs hold the lines.
6. **The page stays opt-in (`serve.enabled`).** No listener is added unless
   asked for.

## D13. What does not change

- The tick's planner, delivery, landing and acceptance.
- The executor seam (R93), harness definitions and their approval by hash
  (R94), one way to finish (R96), and the sandbox's rules (R95.5, R95.6).
- The page and its owner link (standalone-web).
- What a Kiro Crew chat sees: its agents, skills and MCP tools.

## D14. Risks

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
