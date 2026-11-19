# Design: one machine server, thin front ends

`MS` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`. Labels are as in the
requirements: **V** read in the file cited at `c670051c`, **A** assumed.

## D1. Shape

```text
 front ends                         machine server (one per machine)
 ----------                         --------------------------------
 Kiro Crew page ── app backend ─┐   machine lock + workspace loop locks
 standalone page (avoozl link)  ┤   loop, every machine.tickSeconds:
 avoozl CLI ──── database ──────┤     tick -> drain -> notifications
 Claude Code ┐                  │   supervisor pass over process children
 Codex       ├─ avoozl mcp ─────┴─> control interface (MCP only)
 Kiro CLI    │   (shim)             page child when serve.enabled
 Kiro Crew   ┘
 chats

 Kiro Crew cron (tick.py) ── avoozl mcp ──> pending chat intents only
        └── opens, sends to and re-trusts the kirocrew chats it owns
```

The machine server is today's supervisor with the headless tick turned on
everywhere, under a new name and a sound lock. It already runs the tick and
the drain for every catalog workspace when started with `--tick-seconds`
(V: `startSupervisor`, `src/app/executors/supervisor.mjs:582`; `tickCatalog`,
`src/app/tick/headless-tick.mjs:102`), and already hosts the page child (V:
`hostServe`, `:643`). What changes is that it becomes the only loop on every
machine, including a Kiro Crew one.

The CLI and the page keep running operations on the workspace database in
their own process, as today. SQLite and the in-database work lock already
make that safe (V: `withWorkLock`, `src/app/git/git.mjs:35`). Only the loop has
one owner. This keeps the change small: the page and the CLI need no new
transport (D12, question 4).

## D2. What moves where

| Job | Today | After |
| --- | --- | --- |
| Tick planner, Kiro Crew machine | MCP server process, called by `tick.py` (V: `cronTick`, `src/app/executors/kirocrew/app-mcp.mjs:45`) | Machine server |
| Tick planner, headless machine | `avoozl supervisor --tick-seconds` | Machine server |
| Process requests and check runs | App backend after each tick receipt (V: `src/app/executors/kirocrew/app-backend.mjs:293-372`), or headless tick | Machine server |
| Notifications to machine sinks | Headless tick (NK7.1) | Machine server |
| Notices to Kiro Crew channels | App backend | App backend, unchanged: it holds the gateway credential, which the server must never get |
| Session status, tool rows and usage of `kirocrew` chats | App backend readers and the cron's observations | Unchanged |
| Supervisor start | App backend, without the tick (V: `machineSupervisor`, `:175`) | App backend starts the machine server, with the tick |
| Open, send to and re-trust chats | `tick.py` | `tick.py`, from pending intents only |

## D3. The locks and the race (MS2)

**Today's race.** `acquireSupervisorLock` writes `supervisor.lock` with
`wx`. On `EEXIST` it reads the holder; if that pid is gone it renames the
file away and tries again (V: `src/app/executors/supervisor.mjs:474-520`). Two takers A
and B that both read the same dead holder can both win: A renames the stale
file and writes its own; B's rename then moves A's fresh file, and B writes
its own. A finds out only on its next pass, when `holds()` turns false (V:
`:916`), and may already have started a tick. On a Kiro Crew machine the
backend, a login unit and a person's terminal can all start at login, so
this is not rare. The rename is also not atomic on Windows when the target
is open.

**The fix.** Hold a lock the operating system frees by itself:

1. The machine server opens `machine/lock.sqlite` in the state folder with
   `PRAGMA locking_mode = EXCLUSIVE` and runs `BEGIN EXCLUSIVE`, which it
   never ends. SQLite holds this with `fcntl` locks on macOS and Linux and
   `LockFileEx` on Windows, and the system drops them when the process ends
   in any way. (A: `node:sqlite` keeps the lock for the life of the handle
   in this mode, and a second opener gets `SQLITE_BUSY` at once with
   `busy_timeout = 0`. Task ms-1.1's first test checks both on all three
   systems before anything else is built on it.)
2. Only after that does the holder write `machine/lock.json` (pid, start
   time, build, state folder, control address). Readers use it to name the
   holder and never to decide who holds the lock.
3. For each workspace, the holder takes the same kind of lock on
   `<database>.loop-lock` beside the workspace database before its first
   pass there, and keeps it. A second machine server, with its own state
   folder (another `XDG_STATE_HOME`, another Kiro Crew home), fails to take
   it and skips the workspace, naming the holder from a small JSON file
   written beside it after the lock is held.
4. `--foreground` waits by retrying the lock every second. A detached start
   returns at once.

No step deletes or renames a lock file, so there is nothing for two takers to
race on.

**Tests.** MS2.6. The race test starts eight real processes behind one
barrier file, so they open the lock together, and asserts exactly one
holder. It runs on the Linux, macOS and Windows CI legs.

## D4. Commands (MS1, MS3, MS4)

| Today | After |
| --- | --- |
| `avoozl supervisor` | `avoozl start --foreground` |
| `avoozl supervisor --tick-seconds N` | `avoozl start` with `machine.tickSeconds` |
| (backend's `launchSupervisor`) | `avoozl start`, the same function |
| `avoozl supervisor unit [--write]` | `avoozl start --at-login`, `avoozl stop --at-login` |
| `avoozl serve`, `avoozl serve link` | the page under the machine server (`serve.enabled`), `avoozl link` |
| supervisor and page lines in `avoozl status` | the machine server's state in the same `avoozl status` |
| `avoozl tick` | asks the running server for a pass, or runs one tick itself (MS1.5) |
| `avoozl mcp --url URL` | removed (MS10.4) |
| `avoozl mcp --workspace PATH` (in process) | `avoozl mcp --workspace PATH`, as a shim |

`start`, `stop` and `link` are top-level command entries in
`src/app/commands/machine.mjs`, one entry each, as AGENTS.md asks. The
server's state is added to the existing `status` entry in
`src/app/commands/inspect.mjs`. The `supervisor`, `supervisor unit` and
`serve` entries are deleted with no aliases, so the CLI refuses them as
unknown (worker-paths WP7.1 pattern).

**Stop and manual tick.** Both are rows in the supervisor database, the same
table pattern session requests use (V: `requestChild`, `:138`). The server
reads them on its one-second pass. They need no listener, so milestone 1
adds none. The CLI waits on the row's result, up to 30 seconds for stop and
up to the tick's own timeout for a tick.

**Build.** The build is the package version plus a SHA-256 of the sorted
source files under `src/` and `cli.mjs`, computed once at start. The Kiro
Crew app runs its own copy of the code (V: `kirocrew-app/bin/avoozl.mjs`
imports `./lib/cli.mjs`), so its build can differ from the person's global
`avoozl`. Only `avoozl start` replaces a server of another build
(MS3.4). Replacing is safe because children are detached and found again by
pid and start time (R95.4).

**Login unit.** One module replaces `src/app/executors/supervisor-unit.mjs`:

| System | File | Load | Unload |
| --- | --- | --- | --- |
| macOS | `~/Library/LaunchAgents/dev.avoozl.machine.plist`, `RunAtLoad`, `KeepAlive` | `launchctl bootstrap gui/<uid> <file>` | `launchctl bootout gui/<uid>/dev.avoozl.machine` |
| Linux | `~/.config/systemd/user/avoozl-machine.service`, `Restart=on-failure` | `systemctl --user daemon-reload`, `systemctl --user enable --now avoozl-machine.service` | `systemctl --user disable --now avoozl-machine.service` |
| Windows | Task `Avoozl machine` from an XML definition: logon trigger for the current user, `LeastPrivilege`, restart on failure | `schtasks /Create /TN "Avoozl machine" /XML <file>`, then `schtasks /Run` | `schtasks /Delete /TN "Avoozl machine" /F` |

Each command runs with an argv list, never a shell. The unit holds the
marker comment `Written by avoozl start --at-login` so install can tell its
own file from someone else's (MS4.5). On Windows the XML marker is the task's
`Description`.

## D5. Kiro Crew on a server-owned loop (MS1.3, MS12)

The backend keeps its page, its readers and its push to Kiro Crew's
channels. It loses the drain and the supervisor start, and gains one call:
at start, and each time it sees the workspace's tick receipt, it starts the
machine server if none runs.

The cron cannot move. Kiro Crew lets only the cron job that opened a chat
send to it or set its mode, and the app backend's token gets 403 on the chat
routes with today's grants (F129, branch `spec/node-tick`, `ce63eb27`).
Widening the grants would let Avoozl reach every chat the person opened,
which the owner did not accept.

So the cron's call changes meaning. Today `plans_maintain tick` with `cron:
true` runs the planner in the MCP process and returns the intents. After:

1. The call records the observations the cron brings (session statuses from
   the cron's roster).
2. It reads the pending `kirocrew` work the server's last pass left in the
   database: session requests for the `kirocrew` executor that this cron
   job owns, queued messages to its chats, and the live chats to re-trust.
3. It returns those as `dispatch`, `messages` and `observe`, the shape
   `tick.py` reads today (V: `tick.py:56-100`).

The planner never runs there. The intents are already database state, so the
call needs no new store. A chat can now take up to two intervals to open (one
pass to plan it, one cron run to open it), up to two minutes at the
defaults.

**Why this core is in milestone 1.** The owner's list puts the cron last.
Milestone 1 also requires that the Kiro Crew backend never runs a second
tick. While the cron's call still runs the planner, a Kiro Crew machine has
two loops, and the work lock only stops them overlapping, not double
planning across passes. So ms-1.3 makes the cron's call stop planning (MS12.1
and MS12.4). Task ms-5.1 deletes what is then dead in `tick.py` and moves
the call through the shim (D12, question 2).

## D6. Unattended children (MS5, MS6)

A machine server started by launchd, systemd, Task Scheduler or the Kiro
Crew backend does not have the person's shell environment. Two things then
fail quietly: the harness program is not on `PATH`, and the model key is
not set.

- `PATH` is captured into the unit at install (MS4.4), as the supervisor
  unit does today (V: `pathEnv`, `src/app/executors/supervisor-unit.mjs:58`).
- Model access: `machine.env` in the machine config folder, `KEY=value`
  lines, read by the server at start. Only names in a definition's
  `keepEnv` are passed to that child, as today (V: `sandboxEnv`,
  `src/app/executors/sandbox.mjs:128`). The file is outside every child's read roots
  because the whole Avoozl config folder already is (R95.6).
- Readiness: one function per definition answers "can this start here?"
  and both `avoozl status` and Settings › Models show it per role (MS5.3).

The role proof (ms-p2) runs with the server started by the login unit and no
front end open, which is the case that breaks.

**Roles.** The proof script reads `ROLE_TABLE`, picks every row with
`process: true`, and drives one scenario per row on a scratch repository.
P59 and nk-p1 proved most rows already on Claude Code, but with the server
started from the owner's terminal and the app backend draining. This proof
is the first with neither.

| Row | Scenario | Result kind |
| --- | --- | --- |
| worker | one-file task | commit by Avoozl, landed |
| verifier, reviewer | the worker's task, `verify: "agent"`, one review role | verdict |
| falsifier | investigate first on | verdict on findings |
| planner, plan answer | New plan request; one plan review finding | spec folder; answers |
| plan reviewer | plan review on that spec, second model | findings |
| retro | after the task lands | reply |
| responder | a reply request on an issue | posted reply |
| task summary | the landed task | stored summary |
| pull request review | a labeled pull request | stored review |
| triage | a new issue | triage result |
| assist | Ask for help on the page | answer, no file |
| (line watch) | a red head on main | the line stops; no session request |

## D7. Codex inside Avoozl's sandbox (MS7, MS8)

Codex's own sandbox cannot nest inside Avoozl's on macOS: with
`workspace-write` or `read-only` it can neither edit a file nor run a
command (P58, `docs/evidence/p58-codex-by-definition.md`). R94.4d therefore
lets `permission.write` be `danger-full-access` inside Avoozl's sandbox
only. A read role on Codex hits the same wall, so MS7.1 extends the same rule
to `permission.read`. The read class's write roots already exclude the task
folder (V: `harnessPermission`, `src/app/executors/harness-definitions.mjs:543`), so
the read role still cannot change code. Only Avoozl's sandbox enforces that.

That is why MS8 exists. One module, `src/app/sandbox-probes.mjs`, lists each
probe as `{id, class, argv, expect: "refused"}` with argv lists only. The CI
test runs a stand-in harness (a Node script) under `confineChild` on the
macOS and Linux legs and asserts every probe is refused. The live proof
gives Codex a brief that names the same argv lines and reads Codex's
transcript and the probe log. The name-lookup probe matters on macOS: a
lookup through the system resolver is a Mach service, not a socket, and the
profile must deny it or the receipt must name it as a finding.

On Linux the CI leg needs a `bwrap` that can make user namespaces. If the
runner cannot, the test fails rather than skips, and the task adds the
package to the CI job.

## D8. The control interface and the shim (MS9, MS10)

**Listener.** macOS and Linux: `net.createServer().listen(<state>/machine/control.sock)`
after `umask 077`, then `chmod 0600`. The socket path is short enough for
the 104-byte limit only if the state folder is; when it is not, the server
uses `<tmpdir>/avoozl-<uid>/control.sock` in a `0700` folder it creates and
records that path in the lock record. Windows:
`listen({host: "127.0.0.1", port: 0})`. Node has no portable way to set a
named pipe's access list, so a pipe is not used. A stale socket file is
removed only by the lock holder, after it holds the lock.

**Framing.** Newline-delimited JSON. The first line is
`{"hello": {"token": "...", "build": "...", "claim": {...}}}`. Then MCP
JSON-RPC messages, one per line. Any line that does not parse to one object
closes the connection. A browser's request begins `POST / HTTP/1.1`, so it
never reaches a handler.

**Authorization.** Every call runs through today's MCP path (V:
`handleMcp`, `src/app/mcp/mcp.mjs:155`), whose operations already refuse
person-only work (V: `mcpRefusal`, `src/app/mcp/mcp-policy.mjs:26`). The claim
only picks the workspace and records who called, by the rules
`src/app/executors/kirocrew/app-mcp.mjs` applies today, moved into the server.

**Shim.** `avoozl mcp` reads stdio, sends `hello`, and pipes lines both ways.
If the connect fails because no lock is held, it runs the start function
and retries. It has no `Store` import. `kirocrew-app/bin/avoozl_mcp.py`
keeps launching `avoozl mcp --kirocrew`, so Kiro Crew needs no change.

**Removed.** The `--url` bridge posts to `/mcp`, which nothing serves (V:
`src/app/commands/machine.mjs:121`). The CLI's `--url` and `AVOOZL_URL` reach
`/api/command`, which `avoozl serve` refuses without a browser cookie (V:
`src/app/cli/cli.mjs:140`). Both go.

## D9. Host packages and one source (MS11)

```text
prompts/<role>.md   skills/<name>/   roles.json
          \             |             /
           npm run build:hosts (scripts/build-hosts.mjs)
          /        |            |           \
 hosts/kirocrew/  hosts/claude-code/  hosts/codex/  hosts/kiro-cli/
```

Each host has one small adapter in `scripts/build-hosts.mjs` that maps the
source to that host's files. `--check` builds into memory and compares byte
for byte, naming each file that differs. Generated files carry no marker;
the check is the guard. Hand-written host files (the Kiro Crew manifest, the
page source, `tick.py`) are listed per host as kept, and the check ignores
them.

`roles.json` holds what the Kiro Crew agents need today (tools, permissions,
hooks) per role. A host that has no agent concept (Claude Code runs Avoozl's
roles as `process` children, not as plugin agents) takes only the skills, the
MCP entry and the guard.

The task that writes each host checks that host's current package format in
its own docs when it runs, and cites them in the pull request (A: plugin and
config formats change between releases; this spec does not fix them).

## D10. Security review

This section follows the repository owner's exposure policy for anything
that listens on a socket.

**Exposure.** One new listener, the control interface. On macOS and Linux it
is a Unix socket, which has no network address at all. On Windows it is
`127.0.0.1` on a system-picked port. No code path binds another address, and
no option, setting or variable names one (MS9.1). A test checks the bound
address or socket mode on each system. The page keeps its own reviewed
listener (standalone-web D10). The machine server itself adds no other
socket. No container, port publish, tunnel or remote access is built.

**Callers on the same machine.** On macOS and Linux, the socket file's mode
and its folder's mode keep out other users. The operating system enforces
that. On Windows any local process can open a TCP connection, and is refused
without the token. On all systems the token file is owner-only, in a folder
no sandboxed child can read (MS9.6), and is new at each start.

**Authentication mechanism.** The caller proves it runs as the owner by
reading an owner-only file. This is the loopback-token pattern that local
developer tools such as Jupyter Server use, and the native mechanism for a
single-user program on one machine. It is a secret Avoozl makes itself, and
that is acceptable only because the interface is local and serves one
person. Any later spec that lets another machine reach the machine server
SHALL replace it with an identity provider native to where Avoozl is
deployed, and SHALL NOT reuse the token. The owner chose this mechanism on
2026-11-19 (D12).

**Fail closed.** No token file, an unreadable one, a missing `hello` or a
wrong token: nothing runs. There is no test bypass. Tests write their own
token in a temporary state folder.

**Authorization.** The interface is for agents. Every call is an agent
principal, so person-only operations are refused (MS9.4). Spec approval,
approval delegation, harness approval and person-only Needs you answers stay
with the person: the CLI at their own prompt, or the page with its owner
link. The host guard (MS11.3) is a speed bump, as R95.7 says of Kiro Crew
chats, and the docs say so.

**Children.** A sandboxed child cannot open the socket or read the token,
since the machine state folder is outside its roots (R95.6), and a test
checks it (MS9.6). On a machine with no sandbox, the owner's per-machine
opt-in (R94.5) already accepts that a child runs with the owner's reach.

**Secrets.** `machine.env` and `control.token` are owner-only files outside
git and outside every child's read roots. Neither value is logged, shown or
put in a receipt (MS5.2, MS9.7). Login units hold no secret (MS4.4).

**Checks before landing each task that touches a listener.** Search the
repository for `0.0.0.0`, `::`, `listen(`, `--host`, `--bind`,
`Access-Control-Allow` and `createServer`. Every hit is loopback, a Unix
socket, a test, or explained in the pull request. After the server starts in
a proof, `lsof -nP -iTCP -sTCP:LISTEN` (macOS), `ss -ltnx` (Linux) or
`Get-NetTCPConnection -State Listen` (Windows) shows only the socket or
`127.0.0.1`.

## D11. Milestones

| Milestone | Requirements | Tasks | Exit |
| --- | --- | --- | --- |
| 1: one server on Claude Code | MS1, MS2, MS3, MS4, MS5, MS6, MS12.1, MS12.3, MS12.4 | ms-1.1 to ms-1.7 | ms-p1, ms-p1w, ms-p2 |
| 2: Codex | MS7, MS8 | ms-2.1, ms-2.2 | ms-p3 |
| 3: the shim | MS9, MS10 | ms-3.1, ms-3.2 | ms-p4 |
| 4: host packages | MS11 | ms-4.1 to ms-4.4 | ms-p5, ms-p6 |
| 5: cron and docs | MS12.2, MS12.5, MS13 | ms-5.1, ms-5.2 | ms-p7 |

Milestones 2 and 3 can start once ms-1.2 lands, beside the rest of
milestone 1; only their proofs wait for ms-p2. Milestone 4's move of
`kirocrew-app/` waits for ms-1.3, which edits files under it.

## D12. Decisions

**Decided by the owner (2026-11-19).** He accepted every point of the
conductor's review, so these are settled and not open:

- One machine server holds the machine lock. The Kiro Crew backend is a
  client of it, and never runs a second tick (MS1.3, MS2, D3, D5).
- Codex runs with its own sandbox off only inside Avoozl's sandbox. The
  containment proof shows that writes outside the write roots, network past
  the proxy and credential reads are refused (MS7, MS8). Question 1 below is
  that rule applied to the read class.
- Spec approvals and person-only Needs you answers stay off MCP, even
  through the shim (MS9.4, MS10).
- The shim reaches the server only over a local socket, or `127.0.0.1` on
  Windows, with an owner-only token file. The server listens only there
  (MS9, D10).
- Claude Code's host package comes first. Codex and Kiro CLI follow once it
  is proven, and a generate-and-check step keeps them in step (MS11).
- Milestone 1 is one server with its lock, `avoozl start` and `stop`, the
  opt-in login install (Windows as its own task), and every role proven on
  Claude Code (D11).

**Questions, decided by the owner on 2026-11-19 as recommended.** Other
sections cite these by number.

1. **Codex read roles with its sandbox off (MS7.1).** The read class takes
   the owner's Codex rule above, as the write class does. Codex's read
   roles cannot run a command otherwise, and the read class's write roots
   already keep it off the code. The containment proof (MS8) is the check.
2. **The cron's core change is in milestone 1 (D5).** One loop on a Kiro
   Crew machine needs it.
3. **nk-p2 of `without-kirocrew`.** ms-p2 and ms-p3 cover its steps on both
   harnesses, and ms-p2 includes its command sink step. ms-5.2 ticks nk-p2
   as proved by those two receipts.
4. **The page and the CLI stay on the database (D1).** Only the loop and MCP
   go through the server.
5. **`machine.env` holds model keys (MS5.2).** Keys never go in unit files.
6. **The Windows live proof (ms-p1w) waits for a Windows machine** with a
   user session. Until then the Windows CI tests stand.
7. **`avoozl stop` leaves children running (MS3.3).** A restart loses no
   work. **Stop all agents** stays the way to end them.
8. **The page stays opt-in (`serve.enabled`).** No listener is added unless
   asked for.

## D13. What does not change

- The tick's planner, delivery, landing and acceptance.
- The executor seam (R93), harness definitions and their approval by hash
  (R94), one way to finish (R96), and the sandbox's rules (R95.5, R95.6).
- The page and its owner link (standalone-web).
- What a Kiro Crew chat sees: its agents, skills and MCP tools.
- Worker machines (worker-paths WP5).

## D14. Risks

- **SQLite lock behavior (D3).** If `node:sqlite` cannot hold an exclusive
  lock this way on one system, ms-1.1 stops and reports. The fallback is a
  lock on an open file handle by a small native-free method per system,
  which needs its own review.
- **Login-time starts.** The backend, a login unit and a terminal may all
  start at once. MS2.6 tests exactly that.
- **Socket path length** on macOS when the state folder is deep (D8).
- **Version skew** between the Kiro Crew app's copy and the global CLI
  (D4). Status says it; only `avoozl start` resolves it.
- **Codex output changes.** The served-model read and the JSON event shape
  can change between Codex releases; the proof records the version.
