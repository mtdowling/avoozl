# Design: agent workers whose commands run in a container or VM

`VM` numbers are in this spec's `requirements.md`; `R` numbers are in
`.kiro/specs/avoozl/requirements.md`, `TA` numbers in
`.kiro/specs/triage-agent/`, `MS` numbers in `.kiro/specs/machine-server/`.
Labels are as in the requirements: **V** read in the file cited at
`9feab006`, or in the vendor document named (read 2026-11-19); **A**
assumed.

## D1. Shape

```text
 host, the person's user                               box (no network but lo)
 -----------------------                               -----------------------
 supervisor (outside every sandbox)                    repository image, as is
   |-- box:  <runtime> run -d ... sleep infinity  ---> mounts at host paths:
   |-- box exec broker   (Unix socket, 0600)             task folder    rw
   |     <runtime> exec ... bash -c CMD  ------------>   git directory  ro
   |-- egress proxy      (CONNECT, box.hosts only)       session temp   rw
   |                                                     own caches     rw
   `-- host sandbox (sandbox-exec / bwrap)
         agent CLI, signed in as the person
           |-- model traffic -> egress proxy -> its own model hosts
           |-- file tools: task folder only, as today
           `-- every command -> box exec -> broker -> box
```

The agent CLI runs exactly where a sandboxed session runs today (V:
`confineChild`, `src/app/executors/sandbox.mjs:352`, called from
`src/app/executors/supervisor.mjs:771`), with three changes to its sandbox
for contained sessions only (D3). Its commands leave the host through box
exec. The box holds no CLI, no credential and no socket.

## D2. Which split (the owner's two options)

The owner rejected a new key or Bedrock setup in the box and offered two
ways to keep the person's existing sign-in.

**Option 1: the CLI on the host, its commands in the box.** Chosen.

- Claude Code supports it. `CLAUDE_CODE_SHELL_PREFIX` wraps every shell
  command Claude Code spawns: Bash tool calls, hook commands, status line
  commands and stdio MCP server starts. The wrapper gets the whole shell
  invocation as one quoted argument and must run it with a shell, such as
  `exec bash -c "$1"`. Permission rules are checked against the command
  before the prefix. Exec-form and PowerShell hooks skip the prefix (V:
  Claude Code docs, "Environment variables", `CLAUDE_CODE_SHELL_PREFIX`;
  issue #20485 quotes the permission note). A reported bug passes the
  prefix as the MCP server command on Windows (V: issue #91581), which does
  not apply here, since contained sessions turn MCP servers off.
- Codex has no documented command prefix. It can turn its command tools
  off (`features.shell_tool`, "Enable command execution tools", V: Codex
  "Configuration reference") and take MCP servers from `-c` overrides (A:
  that `-c mcp_servers.*` works for `codex exec` and that `shell_tool =
  false` removes every command path, including unified exec). Avoozl's box
  tool then runs commands. Until vm-2.3 proves both, Codex runs no
  contained session (D11, question 3).
- It keeps the sign-in where the vendor put it. Anthropic permits a person
  to sign in to the unmodified Claude Code binary with their own plan, and
  the binary must not be modified (V: Claude Code docs, "Legal and
  compliance"). The prefix is a documented setting, not a change to the
  binary.
- It needs no agent CLI in the image, so the box runs the repository's own
  image and the first draft's image build and entry script go away.

**Option 2: the model proxy holds the plan login.** Rejected.

- Not allowed. Anthropic does not permit third-party developers to route
  requests through Free, Pro, Max or Ultra plan credentials on their users'
  behalf, and says developers may not collect, store or intermediate
  Claude.ai credentials or session tokens (V: Claude Code docs, "Legal and
  compliance", "Authentication and credential use"). A proxy that reads the
  token from the keychain and refreshes it does exactly that.
- Not supported. Claude Code documents only its own `/login` flow, the
  keychain on macOS and `~/.claude/.credentials.json` on Linux (V: Claude
  Code docs, "Authentication", "Credential management"). Reading and
  refreshing that token from outside would rebuild an undocumented OAuth
  client, and a refresh that rotates the token could sign the person out
  of their own CLI (A).

What option 1 costs: the CLI still runs on the host, so its own sandbox
matters. Today that sandbox blocks a plan login on macOS, since it denies
the keychain (V: `KEYCHAIN_SERVICES`, `sandbox.mjs:29`, and
`~/Library/Keychains`, `:121`), and gives a Linux child no network at all
(V: `bwrapArgs` refuses loopback ports, `sandbox.mjs:280`). D3 opens both,
narrowly, for contained sessions only, and makes up for it by letting
nothing but the CLI run on the host.

## D3. A contained session

### The setting and the runtime (VM1)

```json [.avoozl.json]
{
  "repositories": {
    "sdk": {
      "isolation": {
        "run": "container",
        "worker": "container",
        "runtime": "apple-container",
        "image": "public.ecr.aws/docker/library/node:22-bookworm",
        "network": "off",
        "prepare": ["npm", "ci"]
      }
    }
  }
}
```

`isolationSetting` (V: `check-isolation.mjs:72`) gains `worker` and
`runtime`. One picker replaces `containerRuntime` (V: `:128`, docker then
podman) for checks and boxes alike:

| Platform | Named `runtime` | Absent, checks | Absent, box |
| --- | --- | --- | --- |
| macOS | that one, or refuse | `apple-container`, `podman`, `docker` | `apple-container`, or none |
| Linux | that one, or refuse | `podman`, `docker` | `podman`, `docker` |
| Windows | `podman` or `docker` for checks, or refuse | `podman`, `docker` | none |

A runtime works when its probe exits 0 within 10 seconds: `container system
status` (V: in Apple's command reference), `podman version`, `docker
version`. Settings › Repository setup shows both keys beside the current
isolation fields (V: `kirocrew-app/ui/src/IsolationPanel.tsx`).

### The box

The supervisor starts the box before the CLI, removes it after, and names
it `avoozl-{session}`. Every path is the real host path, mounted at the same
path, so the paths in the CLI's commands work in the box.

```text
apple-container (macOS):
  container run -d --name avoozl-{session} --label avoozl.session={session}
    --network none --no-dns --uid {uid} --gid {gid} --cap-drop ALL
    --volume {worktree}:{worktree}
    --mount type=bind,source={gitdir},target={gitdir},readonly
    --volume {tmp}:{tmp}
    --volume {cache}:{cache} ...                (VM6.6 for stranger input)
    --mount type=bind,source={readable},target={readable},readonly ...
    --volume {writable}:{writable} ...          (none for stranger input)
    --env-file {sessionFolder}/box.env
    {image}@{digest} sleep infinity

  box exec:  container exec -i --uid {uid} --gid {gid} --workdir {cwd}
               --env-file {sessionFolder}/box.env avoozl-{session} bash -c {cmd}
  stop:      container delete --force avoozl-{session}

podman (Linux):
  podman run -d ... --network none --userns keep-id --user {uid}:{gid}
    --cap-drop ALL --security-opt no-new-privileges
    --volume {worktree}:{worktree}:rw --volume {gitdir}:{gitdir}:ro ...
  box exec:  podman exec -i --workdir {cwd} --env-file ... avoozl-{session} bash -c {cmd}
  stop:      podman rm -f avoozl-{session}

docker (Linux): as podman, with --user {uid}:{gid} and no --userns.
```

Apple's flags are in its command reference (V: `run` takes `--network`,
`--no-dns`, `--uid`, `--gid`, `--cap-drop`, `--volume`, `--mount
...,readonly`, `--env-file`, `-d`, `--label`; `exec` takes `-i`, `--uid`,
`--gid`, `--workdir`, `--env-file`; `delete --force`). `--network none`
attaches no network (V: `noNetworkName = "none"` sets `config.networks =
[]`, `Sources/Services/ContainerAPIService/Client/Utility.swift` on
`main`; A: release 1.7.1 does the same, which the preflight checks).

`box.env` is written `0600` in the session's folder under the state folder,
which is never mounted, from VM2.6's allowlist. The supervisor lists boxes
by name and label on start and on each pass (Apple: `container list --all
--format json`) and removes those whose session is not running.

### Box exec and its broker

Box exec is a small Avoozl program the harness's shell setting names
(`{box_exec}`). It takes the CLI's command line as its one argument, as
Claude Code's prefix passes it, and its working folder from its own. It
connects to the session's broker socket, sends the two, relays its standard
streams both ways, passes on `SIGTERM` and `SIGINT`, and exits with the
command's code.

The broker runs in the supervisor, outside every sandbox, on a Unix socket
at `{state}/box/{session}/exec.sock` in a `0700` folder. A long state path
uses the short socket folder machine-server ms-3.1 defines. For each
connection it checks that the folder is inside the task folder or the
session's temp folder, then runs the runtime's `exec` line above.

A broker keeps the runtime out of the CLI's process tree. The runtime can
start a new container with any host folder mounted, so the CLI must not be
able to run it (D9). It also avoids starting a runtime inside the host
sandbox, which denies its state under home and, on Linux, nested
namespaces (A).

### The host sandbox of a contained session

`confineChild` gets one more input, `contained`, set only for contained
sessions. Every other session's profile and bubblewrap arguments stay byte
for byte as today, which a test checks.

| | macOS (`sandbox-exec`) | Linux (bubblewrap) |
| --- | --- | --- |
| Sign-in store | `box.signIn: keychain` drops the keychain denials (mach services, `~/Library/Keychains`) | `box.signIn` paths are bound read-write into the empty home |
| Programs | `(deny process-exec)`, then allow only the harness's program, `node`, box exec, `git` and `box.hostPrograms`; `/usr/bin/security` is never allowed | not limited (A: bubblewrap has no exec filter); D9 says what that leaves |
| Sockets | deny the runtime's mach services (A: `com.apple.container.*`); allow `unix-socket` connect to the broker socket only (A: SBPL `remote unix-socket` form) | an empty folder over `$XDG_RUNTIME_DIR`, and `/dev/null` over `/var/run/docker.sock` and `/run/podman`; the broker and proxy sockets bound in |
| Network | the egress proxy's one loopback port, as `sandbox.network` ports work today (V: `sandboxProfile`, `sandbox.mjs:228`) | `--unshare-net`; a forwarder inside the namespace listens on `127.0.0.1:{port}` and pipes to the proxy socket |
| Git | `GIT_DIR`, `GIT_WORK_TREE`, `core.hooksPath` empty and `core.fsmonitor=false` through `GIT_CONFIG_*` | the same |

`HTTPS_PROXY` points the CLI at `http://127.0.0.1:{port}` on both (A: Claude
Code and Codex both read it).

The Linux socket rows also close a gap in today's sandbox for every
session: bubblewrap binds `/` read-only (V: `bwrapArgs`, `sandbox.mjs:269`),
and a Unix socket on a read-only mount still connects, so a child can reach
the person's keyring over D-Bus and a docker daemon (A: the kernel's rule
for socket connects). The task applies these rows to every Linux session,
since the code is shared.

### The egress proxy

One per contained session, started by the supervisor before the CLI. It is
a CONNECT proxy like the one P57 used (V:
`scripts/live-proofs/p57-model-proxy.mjs`), with the allowlist taken from
`box.hosts` instead of a fixed pattern. It tunnels TLS and never decrypts,
so it never sees a credential (VM3.2). It refuses every plain request and
every other host, and logs each tunnel. On macOS it listens on
`127.0.0.1` and a random port; on Linux on a Unix socket. A sandboxed child
of another session cannot reach it: macOS allows only each session's own
port, and the Linux socket is bound only into its own session.

The P57 run showed Claude Code working with its telemetry host refused (V:
`docs/evidence/p57-claude-code-supervisor.md:79`).

### Turning off what would run on the host

Claude Code (`box.args` and `box.env`, A: flag names from the CLI
reference, checked by vm-2.3):

- `CLAUDE_CODE_SHELL_PREFIX={box_exec}`.
- `--setting-sources user`, so the repository's `.claude/settings.json` and
  `.claude/settings.local.json`, which a stranger's pull request can add,
  are not read; `--settings {box_settings}` with `disableAllHooks: true`.
- `--strict-mcp-config` with no servers, so the repository's `.mcp.json`
  starts nothing.
- `--disallowedTools WebFetch` and `--disallowedTools WebSearch`.

Codex (A, vm-2.3): `-c features.shell_tool=false`, `-c web_search=
"disabled"`, and one MCP server, Avoozl's box tool, whose `run` tool calls
box exec.

## D4. The harness `box` key (VM7)

```json [~/.config/avoozl/harnesses/claude-code.json, the new key]
{
  "box": {
    "env": { "CLAUDE_CODE_SHELL_PREFIX": "{box_exec}" },
    "args": [
      "--setting-sources", "user",
      "--settings", "{box_settings}",
      "--strict-mcp-config",
      "--disallowedTools", "WebFetch",
      "--disallowedTools", "WebSearch"
    ],
    "hosts": ["api.anthropic.com:443", "platform.claude.com:443"],
    "signIn": { "darwin": "keychain", "linux": ["~/.claude/.credentials.json"] }
  }
}
```

The hosts shown are an example (A: the refresh host); vm-p0 records the
hosts a plan login needed, and the example file takes them. A Bedrock
sign-in lists its runtime host instead (V: P57's allowlist). `box.args`
pass the same argv checks as `start` (V: `argv`,
`harness-definitions.mjs:125`); `{box_exec}` and `{box_settings}` join the
placeholders the supervisor fills itself.

## D5. The preflight (VM4)

Each step runs with D3's flags in a throwaway task folder:

| Step | Runs | Passes when |
| --- | --- | --- |
| starts | `run -d` the image, then `exec bash -c true` | exit 0 |
| no network | `--network none` | the runtime does not refuse it |
| mounts | R112's probe (V: `containerBlindness`, `check-isolation.mjs:280`) | the random content reads back |
| no route | a TCP connect to `1.1.1.1:443` and a DNS lookup of `example.com` in the box | both fail |
| routing | the CLI as a contained session with a fixed prompt to run `uname -s; cat /etc/avoozl-box` (a marker the broker writes into the box at start) | the output shows `Linux` and the session's marker |
| host stays shut | the same session asked to run `/usr/bin/security list-keychains` and `ls ~/.ssh` | both run in the box and fail there; on macOS the profile also refuses `security` |

The routing steps spend one short model turn on the person's own sign-in.
Results are stored per repository, runtime version, digest and harness
hash. A failed step holds the work and opens one Needs you item with **Run
preflight again**.

## D6. After the session, on the host (VM5)

Avoozl commits after the worker exits (V: `commitWorkerChanges`,
`src/app/git/git.mjs:90`, which runs `git add -A` and `git commit` with the
folder's own `.git`). The box and, today, a sandboxed worker can both write
the folder's top-level `.git` file, because the task folder is writable. A
`.git` file that points at a git directory the worker made, with
`core.fsmonitor` or a hook in its config, would run a command on the host
at Avoozl's next `git add`.

So every git command Avoozl runs in a task folder goes through one helper
that:

1. reads the `.git` file and refuses unless it is exactly the
   `gitdir: {path}` line recorded when the folder was made;
2. runs `git --git-dir={gitdir} --work-tree={folder}`, so the file is not
   read again;
3. adds `-c core.hooksPath={empty folder} -c core.fsmonitor=false`.

This replaces the bare `git(worktree, …)` calls on task folders in
`commitWorkerChanges`, `refuseAvoozlPaths` and their callers, for sandboxed
sessions too. The CLI's own git calls get the same through its
environment (D3).

Result and output files (`.avoozl/result.json`, `.avoozl/output/*`, R96.1)
are read through one function that refuses a symbolic link at any level and
a real path outside the folder.

## D7. Stranger input (VM6, VM8)

### Who is a stranger

The triage snapshot already reads the author's permission (V:
`authorPermission`, `src/app/intake/triage.mjs:616`) and the comment
authors' (V: `:260`). A permission of `write`, `maintain` or `admin` is a
collaborator (V: `COLLABORATOR`, `src/app/intake/triage-reproduce.mjs:31`).
Anything else, a bot, or a failed read is a stranger.

A task's `strangerInput` is `{reason, source}` or absent. It is set when the
task is made and copied to every task made from it:

| Made by | Stranger input when |
| --- | --- |
| A triage run on an item | the item's author, or any comment author in its snapshot, is a stranger |
| A fix from an issue (TA9) or a reproduction (TA3.2) | the issue has stranger input |
| A fix from a pull request (VM6.9) | the pull request's author or any commit author on its head is a stranger |
| A review of a pull request (TA4) | as a triage run |
| A breakdown, a responder, a verdict on such a task | its parent has it |
| A spec or an epic a person approved (R114) | never |

Git owns it (R114): a fix's record on its issue carries the field, and a
rebuild reads it back from there.

### Public repositories

The repository's GitHub visibility is read once a day with the reads TA10
already makes, as one more GraphQL field (A: on the repository query that
the open-list read makes). A failed read counts as public. A repository with
no GitHub remote has no strangers.

### Routing

| Repository | Stranger input | `strangers` | Session | Checks and `prepare` |
| --- | --- | --- | --- | --- |
| public | yes | `container` (default) | contained, required | in a container, network off, own caches |
| public | yes | `hold` | waits in Needs you | waits in Needs you |
| public | yes | `host` | host sandbox alone, marked "stranger input on the host" | `isolation.run`, own caches, marked the same |
| public | no | any | `isolation.worker` | `isolation.run` |
| private | any | any | `isolation.worker` | `isolation.run` |

`strangers` applies only to the roles and `checks` that `strangerRoles`
lists, every one when it is absent; the rest follow the last two rows.
`host` and `hold` keep the record, the own caches and the landing rule (no
push before Integrate, no `.github/` change). While `host` is set,
Settings › Repository setup shows a warning that a stranger's code runs as
the person, and every Needs you and timeline entry for such work says so.
Both keys are person-only, as `isolation` is (R112.1): `repository.configure`
refuses them from MCP, an agent session or a child marked `AVOOZL_CHILD`.

The session start path (V: `processExecutor`, `process.mjs:78`) asks one
function, `sessionIsolation(repository, task)`, which returns `contained`,
`sandbox` or `{wait: reason}`. The check path asks the same for
`checkOptions` (V: `check-isolation.mjs:243`), which `verify.mjs`,
`flow-line.mjs` and `git.mjs` already call (V: `verify.mjs:254`,
`flow-line.mjs:66`, `git.mjs:651`). The reproduction's own `sandboxedCheck`
(V: `triage-reproduce.mjs:36`) is deleted, and reproductions use
`checkOptions` as every other check does. That also ends its write root of
the whole shared temp folder (V: `writeRoots: [dir, os.tmpdir()]`, `:41`).

A `{wait}` answer opens or updates one Needs you item per repository, such
as "sdk: stranger input waits; this Mac has no Apple container", and the task
stays ready. When the reason clears, the next tick starts it.

The executor choice (V: `repositoryExecutor`,
`src/app/agents/role-table.mjs:12`) returns `{wait}` for a stranger-input
task whose role is on `kirocrew` (VM8.1), with **Run on {harness}** naming
the repository's `process` harness that has `box`.

### Landing

A stranger's fix already waits for Integrate (V: `task.ship = "manual"`,
`triage-reproduce.mjs:171`; `integrateVerified`,
`src/app/delivery/delivery.mjs:3008`). VM6.7 makes the rule hold for every
stranger-input task, and adds that nothing of it is pushed before Integrate
(A: today a `manual` task's branch is not pushed before Integrate; the task
checks it and adds the guard if it is). Pushing a stranger's code into the
repository itself would run it in the repository's CI with its secrets,
which a fork's pull request does not get.

## D8. Harness rules (VM7)

`parseHarnessDefinition` keeps its refusals and applies them to every `box`
value. The R94.4d exception does not change: Codex's own sandbox may be off
only inside Avoozl's host sandbox, with write roots (V: `innerOff`,
`sandbox.mjs:373`). In a contained session the CLI is in that sandbox and
its commands are in the box, so nothing new is allowed.

## D9. Security review

| Attempt | What stops it |
| --- | --- |
| Stranger code reads `~/.ssh`, `~/.config/gh`, `~/.aws`, the keychain | It runs in the box, which has no home folder of the person's (VM2.4) |
| Stranger code reads `GH_TOKEN` or a key from the environment | `box.env` holds only VM2.6's names |
| Stranger code reaches the network | The box has no interface but loopback (VM2.6) |
| Stranger code starts a new container with home mounted | The runtime is reachable only from the broker, never from the box or the CLI's tree (D3) |
| Stranger text makes the CLI run a command on the host | Every shell path goes to box exec; on macOS the profile refuses any other program (VM3.4) |
| Stranger text makes the CLI fetch a URL | Web tools off, MCP off, and the egress proxy allows only `box.hosts` (VM3.6, VM3.7) |
| A stranger's `.claude/settings.json` or `.mcp.json` adds a hook or server | Project settings and MCP files are not read (D3) |
| Stranger code rewrites `.git` so the host's git runs a command | `GIT_DIR` for the CLI; D6's helper for Avoozl (VM3.8, VM5.2) |
| A linked result file makes Avoozl read a host file | No links followed (VM5.3) |
| A cache poisoned for a later trusted task | Own empty caches (VM6.6) |
| Stranger code runs in CI with the repository's secrets | Not pushed before Integrate; no `.github/` change (VM6.7) |
| An install script runs on the host | `prepare` runs in the container (VM6.4) |

What the CLI on the host can still reach: the task folder and its temp and
cache folders, its own config under `reads` (today: `~/.claude` with the
person's other transcripts, V: `harnessReads`, `harness-definitions.mjs:610`),
its sign-in store, and the network to `box.hosts`. A prompt-injected agent
can read those with its file tools and put them into the model's context or
into a file in the task folder. That file reaches GitHub only when a person
reads the diff and lands it (VM6.7). On Linux the CLI's tree may start any
program; with no network but the proxy and no socket but its own, a program
there reaches the same things as the CLI.

Listeners: the egress proxy on macOS is a TCP listener on `127.0.0.1` with
a random port, as P57's proxy was; it adds no token, since it carries only
encrypted tunnels to the allowed hosts. Everything else is a Unix socket in
a `0700` folder whose mode is the gate. The box publishes no port. vm-p0
and vm-p1 run `lsof -nP -iTCP -sTCP:LISTEN` during a session and expect
only the proxy's loopback line.

## D10. What does not change

- The `process` executor, the supervisor, the brief, the finish (R96) and
  the commit after exit, apart from D6's helper.
- Sandboxed sessions that are not contained, apart from D3's Linux socket
  rows.
- R112's checks for tasks with no stranger input, except that macOS may now
  pick Apple `container`.
- Kiro Crew chat workers for tasks with no stranger input.
- Triage's rules on who lands a fix (TA3.3) and who starts a run (TA7.8).

## D11. Open questions

Each has a recommendation; the task that depends on it says so.

1. **No flow runs a stranger's pull request today.** No code fetches a pull
   request's head (V: no `refs/pull` or `pull/N/head` in `src/app/`).
   VM6.9 adds **Fix** on a pull request and `avoozl fix --pr N`.
   *Recommendation:* keep it (vm-3.3). Without it, vm-p1 tests a stranger's
   issue whose reproduction carries the same code.
2. **docker or podman as the box's runtime on macOS.** *Recommendation:*
   Apple `container` only. The box no longer needs a socket inside, so
   Docker Desktop or Colima could work; add them only if someone asks,
   since they share one VM across every container.
3. **Codex's sign-in and routing.** Codex keeps a ChatGPT sign-in in
   `~/.codex/auth.json`, and today's sandbox denies `~/.codex`, since it
   also holds transcripts (V: `sandboxSecretPaths`, `sandbox.mjs:111`, and
   P58's receipt). Its command routing is unproved (D2). *Recommendation:*
   Claude Code first. Codex gets contained sessions only after vm-2.3
   proves `shell_tool = false` leaves no command path and that
   `auth.json` alone, read-write, keeps its sign-in; until then Codex
   stranger-input work waits.
4. **Private repositories with outside collaborators.** *Recommendation:*
   keep VM6 to public repositories, as asked.
5. **Spend per contained session.** Budgets were removed on 2026-11-17 (V:
   `spendCap` note, `harness-definitions.mjs:42`). *Recommendation:* no
   cap; the plan quota rule and the daily triage cap (TA7.4) bound it. A
   stranger's text now spends the person's plan, not a key.
6. **A VM on Linux.** podman and docker share the host's kernel.
   *Recommendation:* no VM runtime in v1; prefer rootless podman. Revisit
   after vm-p1.
7. **The keychain on macOS.** Contained sessions get the whole login
   keychain, not one item, because the sandbox cannot name an item. The
   program allowlist is what keeps `security` and scripts away from it.
   *Recommendation:* accept, since the alternative is option 2. If a test
   shows a way to name one item, use it.
8. **A stranger-input task on a `kirocrew` role.** *Recommendation:* hold in
   Needs you with **Run on {harness}** (VM8.1), since a switch changes the
   model and who pays.
9. **VM size.** Apple's default memory and CPUs may be small for a build
   (A). *Recommendation:* no setting in v1; vm-p1 records whether the
   scratch suite fits.
10. **Every Linux session, or only contained ones, for D3's socket rows.**
    *Recommendation:* every one, since a docker socket reachable from a
    sandboxed child is a way out today (A until vm-2.2's test shows it).

## D12. Risks

- Apple `container`'s `--network none` is read in its `main` source and
  docs, not run on release 1.7.1 here (A). The preflight and vm-p0 decide.
- Claude Code's flag names in D3 and its refresh host are from its docs and
  not run here (A). If a plan login's refresh cannot write its store, the
  session fails at refresh; vm-p0 runs past one refresh or records that it
  could not.
- `CLAUDE_CODE_SHELL_PREFIX` passes "the full shell invocation, including
  environment setup" (V: docs). That setup may source a shell snapshot that
  sets a macOS `PATH` inside the Linux box (A). If so, box exec resets
  `PATH` to the image's before running it.
- The SBPL forms for an exec allowlist and a Unix socket connect, and the
  Apple runtime's mach service names, are not checked here (A).
- On SELinux hosts the mounts need a relabel, which changes the task
  folder's label on the host (A).
- A git filter driver the person configured globally, such as git-lfs, still
  runs on stranger content during the host commit.
- A bug in Claude Code itself runs with the CLI's reach in D9.
