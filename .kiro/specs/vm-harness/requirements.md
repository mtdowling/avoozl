---
category: Planning
---

# Requirements: agent workers whose commands run in a container or VM

## Introduction

A repository's checks can already run in a container (avoozl Requirement
112), but the agent worker runs under `sandbox-exec` or bubblewrap as the
person's own user, and so does every command it runs. Public repositories,
which include every SDK repository, take issues and pull requests from
strangers. A fix worker on such an item runs builds, tests and the
stranger's own code next to the person's home folder and logins.

This spec splits the worker in two. The agent CLI stays on the host, in
today's sandbox, signed in the way the person already signed it in. Every
command it runs (its shell tool, builds, tests, reproductions, the
stranger's code) runs in a container the session owns, with no network and
no home folder. No new credential is set up, and Avoozl never reads, holds
or forwards the agent's sign-in.

It extends the repository's one `isolation` setting and the one `process`
executor. It adds no second mechanism.

Approval lives in Avoozl, not in these files. Approving the spec, creating
issues and starting agents are separate acts. Nothing here changes code,
GitHub repositories or settings until its tasks run.

Every claim about today's code carries one label: **V**, read in the file
cited at `9feab006`, or in the vendor document named; or **A**, assumed and
not checked, with the reason.

Changed 2026-11-19 (owner decision): the first draft put the agent CLI in
the container and gave it a model key through a proxy. The owner rejected
any new key or Bedrock setup in the box. Design D2 compares the two ways
the owner offered and picks this split.

### Why

- **The commands are the weak point.** Checks run in `isolation` (R112). A
  worker's commands run on the host under the generated macOS profile or
  bubblewrap (V: `confineChild`, `src/app/executors/sandbox.mjs:352`, called
  from `src/app/executors/supervisor.mjs:771`). A stranger's test file runs
  there when the worker runs `npm test`.
- **The sign-in must stay the person's.** Anthropic lets a person sign in
  to the unmodified Claude Code binary with their own plan, and forbids a
  third party to collect, store or intermediate plan credentials (V: Claude
  Code docs, "Legal and compliance", "Authentication and credential use").
  So the CLI must keep its own sign-in, and Avoozl must not touch it.
- **Both CLIs can send their commands elsewhere.** Claude Code's
  `CLAUDE_CODE_SHELL_PREFIX` wraps every Bash tool call, hook, status line
  and stdio MCP server start (V: Claude Code docs, "Environment
  variables"). Codex can turn its command tools off
  (`features.shell_tool`, V: Codex "Configuration reference") and take an
  MCP tool instead (A: D2).

### What this builds on

- `.kiro/specs/avoozl/` Requirement 112 (checks in isolation), 94 (harness
  definitions, R94.4d for Codex's inner sandbox), 95.5 to 95.7 (the
  supervisor's children and the host sandbox) and 96 (one way to finish).
- `.kiro/specs/triage-agent/`: collaborators and strangers (TA3.3, TA7.3,
  TA7.8) and reproductions (TA3.1, TA7.7).
- `.kiro/specs/machine-server/` MS5: what a sandboxed child needs to sign
  in (task ms-1.6), which this spec narrows for contained sessions.

### Scope

- Contained sessions: a `process` worker of any role whose commands run in
  a box on Apple `container` (macOS), podman or docker (Linux).
- What the host sandbox lets the CLI keep: its own sign-in and the network
  to its own model hosts, and nothing that runs commands.
- Which tasks must be contained: stranger input on public repositories.
- What Avoozl does on the host after a session: the commit and the files it
  reads.

### Out of scope

- Skills and labels for this work. That is a separate decision.
- The agent CLI itself inside a container (D2, option A).
- Kiro Crew chat workers. Their commands cannot be routed (VM8).
- Windows, which has no host sandbox for children today (R95.6).
- docker or podman as the box's runtime on macOS (D11, question 2).

### Words

| Word | Meaning |
| --- | --- |
| Runtime | The program that runs the box: Apple `container` (one lightweight VM per container), `podman` or `docker` |
| Box | The one container a contained session owns, from its start to its end |
| Contained session | A `process` session whose CLI runs in the host sandbox and whose every command runs in its box |
| Box exec | Avoozl's command that a harness's shell setting points at; it runs one command in the session's box |
| Egress proxy | Avoozl's per-session CONNECT proxy that lets the host CLI reach only its own model hosts; it never decrypts |
| Collaborator | A GitHub user with write, maintain or admin permission on the repository (TA words) |
| Stranger | Anyone else, including bots, and anyone whose permission could not be read |
| Stranger input | A task or session whose text, snapshot or code came from a stranger (VM6.1) |
| Public repository | A repository whose GitHub visibility is public, or whose visibility could not be read |

## Requirements

### Requirement VM1: The isolation setting covers the worker

**User story:** As the owner, I want one setting to say where a repository's
checks and worker commands run, so that I configure a container once.

#### Acceptance criteria

1. A repository's `isolation` SHALL gain two keys: `worker`, `sandbox` (the
   default) or `container`; and `runtime`, `apple-container`, `podman` or
   `docker`, absent by default. VM6.10 to VM6.12 add `strangers` and
   `strangerRoles`. The other keys SHALL keep R112's meaning.
   `image` SHALL be required when `run` or `worker` is `container`.
2. With `worker: container`, every `process` session of the repository
   SHALL be a contained session (VM2). With `sandbox` it SHALL run as
   today, except where VM6 requires the box.
3. With `runtime` absent, Avoozl SHALL pick the runtime by what is
   installed and works: on macOS, Apple `container`, then podman, then
   docker; elsewhere, podman, then docker. A box SHALL use only Apple
   `container` on macOS and only podman or docker on Linux.
4. WHEN `runtime` names a runtime that is not installed or does not work
   THEN Avoozl SHALL refuse to start the check or session, SHALL name the
   runtime and the test that failed, and SHALL NOT fall back to another
   runtime or to the host sandbox alone.
5. Only a person SHALL set `isolation`, with `repository.configure` or
   Settings › Repository setup, as R112.1 says.
6. Every check record and every session record SHALL name its isolation:
   `sandbox`, `unconfined`, or `container` with the runtime.

### Requirement VM2: The CLI on the host, every command in the box

**User story:** As the owner, I want everything a worker runs to run in a
box that sees only the task folder, so that a stranger's code cannot reach
my home folder or my logins.

#### Acceptance criteria

1. A contained session SHALL start its box before the CLI, from the
   repository's `image` with no change, and SHALL remove it after the CLI
   exits. The CLI SHALL run in the host sandbox (R95.6) with the same
   filled argv as a sandboxed session, plus its harness's `box` settings
   (VM7.1).
2. The harness's `box` settings SHALL send every command the CLI runs to
   box exec: Claude Code through `CLAUDE_CODE_SHELL_PREFIX`, Codex through
   its command tools turned off and an MCP tool that calls box exec (D3).
   A harness with no `box`, or whose routing fails the preflight (VM4.2),
   SHALL NOT run a contained session.
3. Box exec SHALL run its command with `bash -c` in the session's box, in
   the CLI's working folder, with its standard streams and exit code, and
   SHALL stop it when the caller stops. It SHALL refuse a working folder
   outside the box's mounts, and SHALL reach only its own session's box.
4. The box SHALL mount, each at its own host path: the task folder
   read-write; the repository's git directory read-only; the session's
   temp folder read-write; the repository's cache folders (VM6.6 for
   stranger input) and `isolation.writable` read-write; and
   `isolation.readable` read-only. Nothing else SHALL be mounted: no home
   folder, no credential path, no Avoozl or Kiro Crew state, and no socket.
5. Avoozl SHALL refuse a contained session when a mount from `readable`,
   `writable` or the cache folders is, holds or is inside a path the host
   sandbox denies (V: `sandboxSecretPaths`, `sandbox.mjs:91`), naming it.
6. The box SHALL have no network interface but loopback (`--network none`
   on every runtime), whatever `isolation.network` and `sandbox.network`
   say. Its environment SHALL be an allowlist written to a file the box
   never sees: `HOME` in the session's temp folder, `TMPDIR` and the
   harness's `tmpEnv`, `LANG`, `TERM`, git's empty credential helper and
   `GIT_TERMINAL_PROMPT=0`. No variable SHALL be copied from the host.
7. Commands in the box SHALL run as the person's user and group IDs, with
   every Linux capability dropped and, on podman and docker, no new
   privileges.
8. Every box SHALL carry a label with its session ID, and the supervisor
   SHALL remove any labelled box whose session is not running when it
   starts and on each pass.

### Requirement VM3: The agent keeps its own sign-in, and nothing else runs on the host

**User story:** As the owner, I want a contained worker to use the sign-in
my agent CLI already has, with nothing new to set up, and I want nothing
but the CLI itself to run on my machine.

#### Acceptance criteria

1. A contained session SHALL use the harness's existing sign-in on the
   host: a plan login, an API key the person already gave the harness, or
   a cloud provider sign-in. It SHALL need no new credential, key or
   account.
2. Avoozl SHALL NOT read, copy, store, inject or forward the harness's
   credential, and no Avoozl process SHALL decrypt the CLI's traffic.
3. The host sandbox of a contained session SHALL let the CLI read and
   write its own credential store and nothing more of it, as its
   definition's `box.signIn` names it (D3): on macOS the keychain, on
   Linux its credential file. A session that is not contained SHALL keep
   today's denials.
4. On macOS, a contained session's host sandbox SHALL let the CLI's
   process tree start only the harness's program, box exec, git and the
   definition's `box.hostPrograms`. It SHALL refuse `/usr/bin/security`
   and every other program.
5. On Linux, a contained session's host sandbox SHALL hide the person's
   D-Bus, keyring and agent sockets (V: today `bwrapArgs` binds `/`
   read-only, so `$XDG_RUNTIME_DIR` stays reachable, `sandbox.mjs:269`).
6. The CLI SHALL reach the network only through the session's egress
   proxy, which SHALL allow CONNECT to the host and port pairs in its
   definition's `box.hosts` and refuse every other request. On macOS the
   CLI SHALL reach the proxy on one loopback port; on Linux, through a
   Unix socket and a forwarder inside the bubblewrap namespace (D3).
7. The CLI's tools that fetch from the network or run outside box exec
   SHALL be off: web fetch and web search, MCP servers other than
   Avoozl's box tool, and every hook and status line from the repository's
   or the person's settings.
8. The CLI's own git calls on the host SHALL get `GIT_DIR` and
   `GIT_WORK_TREE` set, with no hooks and no `core.fsmonitor`, so a `.git`
   file written in the box changes nothing (VM5.2).
9. The egress proxy SHALL record each tunnel's time, host, port, bytes and
   any refusal in the session's evidence. No TCP listener SHALL be added on
   any address but `127.0.0.1`.

### Requirement VM4: The box image and the preflight

**User story:** As the owner, I want Avoozl to prove the box works and that
commands really go there before it trusts it with a task.

#### Acceptance criteria

1. The box SHALL run the repository's `image` as it is, pinned to its
   digest when the session starts. It SHALL need `bash` and `sleep`, and
   no agent CLI, Avoozl file or credential.
2. Before the first contained session for a repository, runtime, image
   digest and harness hash, Avoozl SHALL run a preflight and record each
   step: the runtime starts a box; `--network none` is accepted; a file
   Avoozl writes in the task folder reads back in the box (R112's probe);
   `bash` runs; a TCP connection to a public address and a DNS lookup both
   fail in the box; the CLI, started as a contained session with a fixed
   prompt, runs one shell command that prints `uname -s` and the box
   marker, and both show the box; and the same session cannot start
   `/usr/bin/security` on macOS.
3. A failed step SHALL hold every task that needs that box, with one Needs
   you item that names the step and its output. A preflight SHALL run again
   when the runtime's version, the digest or the harness's hash changes,
   and when a person asks.

### Requirement VM5: Avoozl commits from outside; the worker never pushes

**User story:** As the owner, I want nothing a worker leaves in its folder
to run on my machine when Avoozl or the CLI touches it.

#### Acceptance criteria

1. Avoozl SHALL make the commit after the worker exits, on the host, as
   today (V: `commitWorkerChanges`, `src/app/git/git.mjs:90`). The worker
   SHALL never push, and neither the box nor the CLI SHALL hold anything
   that can.
2. Every git command Avoozl runs in a task folder after any `process`
   session, contained or not, SHALL name the git directory and the work
   tree itself and SHALL refuse when the folder's `.git` file no longer
   names the git directory Avoozl made it with. It SHALL run with no hooks
   and no `core.fsmonitor`.
3. Avoozl SHALL read a session's result and output files without following
   a symbolic link, and SHALL refuse a file whose real path is outside the
   task folder.
4. A stranger-input task SHALL NOT be pushed before a person lands it
   (VM6.7), and its commit SHALL refuse a symbolic link that points outside
   the task folder.

### Requirement VM6: Stranger input runs only in the box on public repositories

**User story:** As the owner of public repositories, I want anything a
stranger wrote to run only in a box, so that a hostile issue or pull
request cannot reach my machine.

#### Acceptance criteria

1. A task or session SHALL have stranger input when any of these hold: its
   source issue or pull request was written by a stranger; its snapshot or
   brief holds text by a stranger (comments, review comments, a pull
   request body); its task folder holds commits from a stranger's pull
   request; or it was made from a task with stranger input (a fix from a
   triage run, a reproduction, a breakdown). A permission that could not be
   read SHALL count as a stranger's.
2. Stranger input SHALL be recorded on the task and on each session with
   its reason, and SHALL stay on the task. Only a spec a person approves
   (R114) starts clean.
3. On a public repository, with `isolation.strangers` at its default
   (VM6.10), every session with stranger input SHALL be a contained
   session, whatever `isolation.worker` says. This covers every role:
   triage runs, reviews, fixes, verdicts and responders.
4. On a public repository, with `isolation.strangers` at its default,
   every check of a stranger-input task SHALL run
   in a container with the network off, whatever `isolation.run` and
   `isolation.network` say. This covers the reproduction's checks (TA7.7),
   the task's own checks, integration's and landing's candidate runs, and
   `prepare`, which SHALL run in the container rather than outside
   isolation.
5. WHEN `isolation.strangers` is `container` and a public repository has
   no working runtime, no `image`, or no
   harness with `box` for the role THEN its stranger-input work SHALL wait
   in Needs you with one item per repository that says what is missing. It
   SHALL NOT fall back to the host sandbox alone or to unconfined.
6. A stranger-input session and its checks SHALL get empty cache folders of
   their own at the cache folders' paths, never the repository's shared
   ones, and SHALL NOT get `isolation.writable`.
7. A stranger-input task SHALL be pushed only after a person lands it
   (Integrate), as TA3.3 holds a stranger's fix. Its commit SHALL change no
   file under `.github/` or the repository's protected paths (R86.6); such
   a change SHALL wait in Needs you and SHALL NOT be pushed.
8. Tasks from specs and epics, and fixes from a collaborator with no
   stranger text, SHALL follow `isolation.worker`. A private repository
   SHALL follow it for every task.
9. A fix SHALL be able to start from a pull request: **Fix** on a pull
   request's page, or `avoozl fix "TEXT" --repo ID --pr N`, with its task
   folder at the pull request's head. A stranger's pull request makes it
   stranger input. (D11, question 1.)
10. A repository's `isolation` SHALL hold `strangers`, which says how its
    stranger-input work runs on a public repository:
    - `container` (the default): as VM6.3 to VM6.5 say.
    - `hold`: every covered session and check SHALL wait in Needs you, one
      item per repository, until a person starts it or changes the setting.
    - `host`: covered sessions SHALL run in the host sandbox alone and
      covered checks under `isolation.run`. Settings › Repository setup, the
      task's timeline and each session and check record SHALL say "stranger
      input on the host", and the page SHALL show a warning while it is
      set.
    VM6.2, VM6.6 and VM6.7 SHALL hold under every value. (Changed
    2026-11-19, owner decision: the stranger rule is configurable.)
11. `isolation.strangerRoles` SHALL list the role-table roles, and `checks`
    for a task's checks and `prepare`, that `strangers` covers. Absent, it
    SHALL cover every role and `checks`. A role it leaves out SHALL follow
    `isolation.worker`, and leaving out `checks` SHALL leave checks under
    `isolation.run`. An unknown role SHALL be refused naming it.
12. Only a person SHALL set `strangers` and `strangerRoles`, with
    `repository.configure` or Settings › Repository setup. The MCP tools,
    an agent session and a process child SHALL be refused.

### Requirement VM7: Harness definitions

**User story:** As the owner, I want the box to add a wall, not to remove
one, so that a definition cannot skip permissions because its commands run
in a box.

#### Acceptance criteria

1. A harness definition MAY hold `box`: `env` (variable names to literal
   values or `{box_exec}` and `{box_settings}`), `args` (argv added to
   `start` and `resume`), `hosts` (`host:port` pairs its egress proxy
   allows), `signIn` (`keychain` on macOS, and home paths under `~/` on
   Linux, of the CLI's own credential store) and `hostPrograms` (absolute
   paths of programs besides its own that the CLI starts on the host).
2. Harness definitions SHALL keep refusing `bypassPermissions`,
   `danger-full-access` and every `--dangerously-*` value in every argv
   and value, including every `box` value (V: `SKIP_VALUES`,
   `harness-definitions.mjs:85`).
3. The one exception, `permission.write: "danger-full-access"` for a CLI
   whose own sandbox cannot nest (R94.4d), SHALL apply to a contained
   session as it does today: the CLI runs only in Avoozl's host sandbox
   with write roots, and its commands run in the box.
4. A `box.signIn` path SHALL be refused when it names an SSH, GitHub, git,
   AWS or Avoozl path, and `box.hosts` SHALL be refused when it holds a
   wildcard, an IP address or a port other than 443.
5. The harness's `allow` list and its permission class SHALL apply as they
   do today. Claude Code checks its allow rules against the command before
   the prefix (V: Claude Code docs, `CLAUDE_CODE_SHELL_PREFIX`).

### Requirement VM8: Kiro Crew chats never take stranger input

**User story:** As the owner, I want a chat worker kept away from strangers'
input, since its commands cannot be sent to a box.

#### Acceptance criteria

1. A session with stranger input SHALL NOT run on the `kirocrew` executor.
   WHEN the role's executor for a stranger-input task is `kirocrew` THEN the
   task SHALL wait in Needs you, naming the role, with one action that runs
   it on a `process` harness that has `box`.
2. The docs SHALL say that a Kiro Crew chat runs as the person with only a
   speed bump between it and person-only acts (R95.5), and so is never used
   for stranger input.

### Requirement VM9: Tests and the live proofs

**User story:** As the owner, I want proof that a hostile pull request
reaches nothing, so that I can turn the triage agent on for public SDK
repositories.

#### Acceptance criteria

1. Unit tests SHALL check the box's `run` and box exec's `exec` argv for
   each runtime against D3: `--network none`, each mount and its mode, no
   home folder, the environment file and no host variable, the user IDs,
   the dropped capabilities and the label.
2. Unit tests SHALL check: a named runtime that is missing is refused with
   no fallback; docker and podman are refused for a box on macOS; a mount
   inside a secret path is refused; box exec refuses another session's box
   and a folder outside the mounts; the macOS profile of a contained
   session allows the keychain and only the listed programs, and the
   profile of any other session does not change; the Linux sandbox hides
   `$XDG_RUNTIME_DIR`; the egress proxy refuses a host outside `box.hosts`
   and a plain request; a stranger-input session on a public repository is
   never sandboxed alone; one with no runtime waits in Needs you; one
   routed to `kirocrew` waits; a moved `.git` file, a hook and a
   symbolic-link result file each change nothing on the host.
3. Container tests that need a runtime SHALL be skipped, saying so, where
   none is installed, as R112.7 does.
4. A live proof (vm-p0) SHALL run a contained session with the person's
   existing plan login on macOS with Apple `container` and on Linux with
   podman, set up nothing new, and land.
5. A live proof (vm-p1) SHALL run a stranger's pull request whose code
   tries to read `~/.ssh`, reach the network, read the GitHub token and
   write outside the task folder. All four SHALL fail on both systems, and
   a normal fix SHALL still land.

### Requirement VM10: The other specs and the docs say the same

**User story:** As the maintainer, I want the product spec, the triage spec
and the docs to describe what is built.

#### Acceptance criteria

1. avoozl Requirement 112 SHALL say, with the date, that `isolation` gained
   `worker` and `runtime` and that stranger-input checks run in a container
   (VM1, VM6.4).
2. TA7.7 SHALL say, with the date, that a reproduction's checks on a public
   repository run only in a container (VM6.4), and the code SHALL follow it
   (V: today a reproduction runs only in the host sandbox, with the whole
   shared temp folder writable: `sandboxedCheck`,
   `src/app/intake/triage-reproduce.mjs:36`).
3. `docs/checks.md`, `docs/person-only.md` and `docs/triage.md` SHALL
   describe contained sessions, the runtimes and their limits, the sign-in
   rule, the egress proxy, the stranger rule and the Kiro Crew rule.
4. `examples/harnesses/claude-code.json` and `codex.json` SHALL each hold
   the `box` key that the live proofs used.
