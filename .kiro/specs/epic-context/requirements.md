---
category: Planning
---

# Requirements: epic context for the owner's own work

## Introduction

A worker session today gets the task folder, its harness's own config, the
repository's `isolation.readable` folders and the loopback ports its
repository names (V: `processExecutor`, `src/app/executors/process.mjs:78`).
A team's real work often needs more: a skill that says how the team writes
a module, a folder of design notes outside the repository, an MCP server
that answers research questions, a documentation host. Today a person can
only widen the sandbox for every session of a repository, including
sessions that read a stranger's issue.

This spec adds **epic context**: extra skills, read folders, MCP servers
and network hosts that Avoozl gives to one worker session, and only when
that session does the person's own approved epic work. Two sources supply
it, and both live only on this machine: an `epicContext` block in this
machine's config, and a new plugin part, `context`, honored only from this
machine's `plugins.json`. A task gets it only when four tests pass (EC1).
Nothing in a spec, an issue, a pull request or a repository file can turn
it on.

Approval lives in Avoozl, not in these files. Approving the spec, creating
issues and starting agents are separate acts. Nothing here changes code
until its tasks run.

Every claim about today's code carries one label: **V**, read in the file
cited at `a8a22391`; or **A**, assumed and not checked, with the reason.

### Why

- **The owner's work needs the team's context.** A worker that cannot read
  the team's notes or ask its research service guesses, and a person fixes
  the guess in review.
- **A repository-wide setting gives too much.** `isolation.readable` applies
  to every session and check of the repository (V: `readable:
  repository.isolation?.readable`, `process.mjs:112`), so it also reaches a
  triage run on a stranger's issue.
- **Only this machine may decide.** A repository file is written by anyone
  whose pull request lands. If it could turn context on, a stranger's pull
  request could widen what the next worker reads.

### What this builds on

- `.kiro/specs/avoozl/` Requirement 114 (an approval is a commit on main by
  an allowed approver; V: `approvalCommits` and `approverCheck`,
  `src/app/git/git-approvals.mjs:64` and `:301`), Requirement 66 (one driver
  per spec), Requirement 40 (content rules) and Requirement 34 (plugin
  approval by hash).
- Requirement 115 (the spec issue's assignee says who drives a spec, and a
  spec with no spec issue drives here as "Not shared"), on branch
  `spec/spec-assignee-2`, not yet approved.
- `.kiro/specs/vm-harness/`: stranger input (VM6.1, VM6.2), the egress
  proxy (VM3.6, VM3.9), the box's read-only mounts (VM2.4) and the secret
  path refusal (VM2.5).
- `.kiro/specs/triage-agent/` TA13.5 and `.kiro/specs/plugin-credentials/`
  PC2.2: a plugin part that only this machine's `plugins.json` may declare
  (V: `triageBlock`, `src/app/plugins/plugins.mjs:428`).
- `.kiro/specs/plugin-checks/` PK10: MCP servers named by alias, mapped on
  this machine with environment variable names and no credential values.
- Intake tasks have IDs `intake-` plus 16 hex characters (V: `intakeTaskId`,
  `src/app/intake/intake.mjs:50`).

### Scope

- The four tests, their record, and when they run.
- The machine `epicContext` block and the `context` plugin part.
- Approval of a context part, its `ask` answers and its MCP mapping.
- What a `process` session gets: reads, skills, MCP servers through a relay,
  and hosts through the egress proxy.
- What a Kiro Crew chat worker gets, and what cannot be enforced there.
- The task row, Activity, the docs and a live proof.

### Out of scope

- Context for triage runs, reviews, verdicts, responders and planners
  (D12, question 3).
- Credentials for GitHub. Workers still get no GitHub token (PC6.6).
- A shared, hosted context service. Context stays on each machine.
- Kiro Crew chat MCP servers set per session (EC9).

### Words

| Word | Meaning |
| --- | --- |
| Epic context | The skills, read folders, MCP servers and network hosts one session gets beyond its normal sandbox |
| Context source | The machine `epicContext` block, or one approved `context` part of a machine plugin |
| The four tests | EC1's checks; all four pass or the session gets no epic context |
| Specs branch | The spec repository's base branch that approvals land on (V: `approvalBase`, `git-approvals.mjs:106`) |
| This person | The git `user.email` and the `gh` login of this machine |
| Ask | A value a context part needs from each person, such as the folder of a local clone, filled once on this machine |
| MCP relay | Avoozl's small stdio program that the harness starts in place of an MCP server; it forwards to the real server, which runs outside the sandbox |
| Stranger input | As VM6.1 defines it |

## Requirements

### Requirement EC1: The four tests

**User story:** As the owner, I want epic context only on my own approved
epic work, so that a stranger, a coworker's spec or a repository file can
never widen what a worker reaches.

#### Acceptance criteria

1. A session SHALL get epic context only WHEN all four tests pass for its
   task, at the time the session starts or resumes:
   - **approved**: the task is a task of a spec whose approved revision is
     on the specs branch, and the task is in that revision's `tasks.md`.
     A task whose ID starts with `intake-` (an intake task), and any task
     made outside a spec (a triage fix, a reproduction, `avoozl fix`),
     SHALL fail this test.
   - **approver**: the commit that approved that revision is by an allowed
     approver, read with the git approval reader (`approvalCommits` with
     `approverCheck`, Requirement 114).
   - **you drive**: this workspace drives the spec as this person: the spec
     issue's one assignee is this machine's `gh` login and its claim names
     this machine ("You drive", Requirement 115.11), or the spec has no
     spec issue ("Not shared", Requirement 115.8).
   - **no stranger input**: the task and the session have no stranger input
     (VM6.1, VM6.2).
2. WHEN any test fails THEN the session SHALL start with its normal sandbox,
   exactly as it would with no context source at all.
3. A test that cannot be read (a git error, an unread spec issue, a missing
   stranger field) SHALL count as failed.
4. The tests SHALL read only Avoozl's own records and git: the approved
   revision, the approval commit, the driver state in the workspace cache,
   and the stranger field. No fact in `tasks.md`, no text in a spec, an
   issue, a pull request or a comment, and no repository file SHALL change
   the result.
5. `tasks.md` SHALL have no fact that asks for epic context. Spec lint
   already refuses an unknown fact; a test SHALL check that `$context` and
   `$epicContext` are refused.
6. The tests SHALL run again on every resume. WHEN one fails on a resume
   THEN the session SHALL resume with its normal sandbox, and Activity SHALL
   name the test that now fails.
7. Text from a stranger SHALL NOT be sent into a session that holds epic
   context. WHEN such text would reach the session (a review comment, a
   pull request comment) THEN Avoozl SHALL mark the task with stranger
   input, end that session's use of epic context, and start the follow-up
   as a new session with its normal sandbox.
8. A batch (`$batch`) SHALL get epic context only when every member passes
   all four tests.

### Requirement EC2: The machine block

**User story:** As the owner, I want to name my own reads, MCP servers and
hosts for my repositories in my machine's config, so that I need no plugin
for my own setup.

#### Acceptance criteria

1. This machine's `config.json` SHALL accept `epicContext`:
   `{repos, reads?, mcp?, network?, contentSets?}`. Any other key SHALL be
   refused naming the key.
   - `repos`: 1 to 50 GitHub repository names, `owner/name` or `owner/*`,
     compared without case, or registered repository IDs. Required.
   - `reads`: up to 20 folders, absolute or under `~/`.
   - `mcp`: up to 10 servers by alias (PK10.1's alias rule), each
     `{about, command, env?}`: `about` 1 to 200 characters, `command` an
     argv list, `env` the environment variable names the server may read.
   - `network`: up to 20 `host:443` pairs.
   - `contentSets`: content rule set IDs (EC10.3).
2. A `repository`'s `.avoozl.json` SHALL refuse an `epicContext` key,
   naming the file and the key. A layered workspace config SHALL refuse it
   too: it is read only from this machine's `config.json`.
3. Only a person SHALL change `epicContext`, in Settings › Epic context or
   with `avoozl context set`. The MCP tools, an agent session, a process
   child and the tick SHALL be refused.
4. The block SHALL hold no credential value. Credential-like keys and
   values SHALL be refused as plugin `config` refuses them (V:
   `checkConfig`, `plugins.mjs:137`).

### Requirement EC3: The context plugin part

**User story:** As a team's tools owner, I want to ship our skills, reads,
MCP servers and hosts as one plugin, so that each engineer installs it once
and approves exactly what it gives.

#### Acceptance criteria

1. `PARTS` SHALL gain `context`, a data part like `policy`: a plugin that
   provides only `context` SHALL have no `entry` (V: `validateManifest`,
   `plugins.mjs:313`).
2. A manifest that provides `context` SHALL hold
   `context: {repos, skills?, reads?, ask?, mcp?, network?, contentSets?}`.
   Any other key SHALL be refused naming the key, and `context` SHALL be
   refused when `provides` does not list it.
   - `repos`: as EC2.1, required.
   - `skills`: a folder inside the plugin holding up to 20 folders, each
     with one `SKILL.md` whose front matter has `name` and `description`.
   - `reads`: up to 20 `{id, about, path}`. `path` MAY hold `{ask:NAME}`
     placeholders and SHALL be absolute or under `~/` once they are filled.
   - `ask`: `NAME` to a question of 1 to 200 characters. Every
     `{ask:NAME}` SHALL name a key here, and every key SHALL be used.
   - `mcp`: a `.json` file inside the plugin, by default `mcp/servers.json`,
     mapping each alias to `{about, command}`. `command` SHALL be an argv
     list whose first item is a program name or a path inside the plugin
     folder. The file SHALL hold no `env` and no credential.
   - `network`: up to 20 `host:443` pairs.
   - `contentSets`: content rule set IDs (EC10.3).
3. A `context` part SHALL count only from a plugin declared in this
   machine's `plugins.json` and approved here. A `context` part of a plugin
   that `.avoozl.json` declares SHALL be ignored, and Settings › Plugins
   SHALL say "context ignored: declared in .avoozl.json". Its other parts
   SHALL work as before.
4. A `network` entry with a wildcard, an IP address or a port other than
   443, and a `command` that is a single shell string, SHALL be refused
   (VM7.4).

### Requirement EC4: Approving a context part

**User story:** As an engineer, I want the approval screen to show every
skill, folder, MCP server and host a context plugin gives, so that
approving is real consent.

#### Acceptance criteria

1. The approval view, the Add plugin preview and the Settings › Plugins row
   SHALL list, for a `context` part: `repos`; each skill's name, description
   and file hash; each read's `about`, its path as written and as filled on
   this machine; each MCP alias's `about`, `command` and this machine's
   mapping (EC4.3); each host; and the `contentSets`.
2. Each `ask` SHALL be answered once on this machine, in Settings › Plugins
   or `avoozl plugins answer ID NAME VALUE`, and stored in `plugins.json`.
   Until every ask is answered, the part SHALL give nothing, and one Needs
   you item SHALL name the plugin and the unanswered questions.
3. Each MCP alias SHALL get this machine's mapping in `plugins.json`, as
   PK10.2 holds it: `{env, command?}`, `env` the environment variable names
   the server may read and an optional `command` that replaces the plugin's.
   The mapping SHALL hold no credential value. A sign-in the server keeps
   itself (its own token file) SHALL stay the server's own.
4. The approval SHALL bind the plugin's content hash (Requirement 34.4), the
   ask answers and the MCP mappings. WHEN any of them changes THEN the part
   SHALL give nothing until a person approves again.
5. Answering, mapping and approving SHALL be person-only. The MCP tools, an
   agent session, a process child and the tick SHALL be refused.

### Requirement EC5: What a session gets

**User story:** As the owner, I want a session that passes the four tests
to get the context its repository's sources name, and nothing more.

#### Acceptance criteria

1. WHEN the four tests pass THEN the session's context SHALL be the union
   of every context source whose `repos` names the task's repository. A
   source that names none of it SHALL give nothing.
2. WHEN two sources give one MCP alias THEN neither SHALL give it, and one
   Needs you item SHALL name both. Reads, skills and hosts SHALL be merged
   without repeats.
3. A read SHALL be refused, naming it, when it is, holds or is inside a path
   the sandbox denies (V: `sandboxSecretPaths`,
   `src/app/executors/sandbox.mjs:91`), Avoozl's config or state folder, or
   the person's home folder itself. A refused read SHALL be left out; the
   rest SHALL still be given.
4. A read that does not exist at session start SHALL be left out and named
   in the session record.
5. Only the `worker` role SHALL get epic context in this spec (D12,
   question 3).

### Requirement EC6: Reads and skills in a process session

**User story:** As the owner, I want the worker to read the team's folders
and skills, and to change none of them.

#### Acceptance criteria

1. Each read SHALL be added to the session's read-only folders, as
   `readable` is today. In a contained session (VM2) it SHALL also be
   mounted read-only in the box at its host path. No read SHALL be
   writable.
2. Avoozl SHALL copy each skill folder of an approved part into a
   session context folder outside the task folder, after checking each
   file's hash against the approval, and SHALL add that folder read-only.
3. The brief SHALL list each skill's name, description and `SKILL.md` path,
   and each read's `about` and path, under a heading that says this is the
   person's epic context, and SHALL tell the worker to read a skill before
   work it covers.
4. The session context folder SHALL be removed when the session ends.

### Requirement EC7: MCP servers through a relay

**User story:** As the owner, I want the worker to call the team's MCP
servers without the worker ever holding their sign-in.

#### Acceptance criteria

1. A harness definition MAY hold `context.mcp`: argv added to `start` and
   `resume` that loads one MCP config file, with the placeholder
   `{context_mcp}`. A harness without it SHALL get no MCP servers, and the
   session record SHALL say so.
2. Avoozl SHALL write `{context_mcp}` with one stdio server per alias, each
   run as the MCP relay with the session and alias. The file SHALL hold no
   environment value.
3. The relay SHALL connect to a Unix socket in a `0700` folder that only
   its session's sandbox can reach. The supervisor, outside the sandbox,
   SHALL start the real server on the first connection and pipe the two.
4. The real server SHALL run outside every sandbox with the check
   environment basics plus its mapping's `env` names, a scratch working
   folder and the network, as PK10.11 runs a check's server. It SHALL NOT
   open a network listener; one that does SHALL be stopped and its plugin
   marked broken (PK7.5).
5. Each server SHALL stop when its session ends. Each tool call SHALL be
   recorded in the session's evidence: alias, tool name, time, bytes and
   any error, never the arguments or the reply.
6. MCP replies SHALL be untrusted data (Requirement 34.6).
7. A contained session SHALL get no MCP servers in this spec, because its
   harness's shell prefix also starts MCP servers in the box (D12, question
   1). Its record SHALL say "MCP not given: contained session".

### Requirement EC8: Network hosts through the egress proxy

**User story:** As the owner, I want the worker to reach the team's hosts
and no others.

#### Acceptance criteria

1. Each host SHALL be added to the session's egress proxy allowlist
   (VM3.6), beside the harness's `box.hosts`. The proxy SHALL refuse every
   other host as it does today.
2. A session whose harness or platform has no egress proxy SHALL get no
   hosts, and its record SHALL say why.
3. The box of a contained session SHALL keep no network (VM2.6). Hosts
   reach the CLI's own tools only. WHEN hosts are given in a contained
   session THEN the harness's web fetch tool SHALL be left on for it, and
   the proxy SHALL be its only way out.
4. The proxy log SHALL name, for each tunnel, whether its host came from the
   harness or from epic context.

### Requirement EC9: Kiro Crew chat workers

**User story:** As the owner, I want to know what epic context means on a
chat worker, which runs as me.

#### Acceptance criteria

1. A `kirocrew` worker that passes the four tests SHALL get the skills and
   reads named in its brief (EC6.3) and SHALL get no MCP servers and no
   hosts. The task row SHALL say "Epic context (brief only)".
2. The docs SHALL say plainly: a chat runs as the person, outside Avoozl's
   sandbox, so the four tests decide only what Avoozl tells the chat, not
   what it can reach. A chat can already read the person's files and the
   network. Avoozl cannot add an MCP server to one chat (A: Kiro Crew agent
   files are built ahead of time), and cannot hold a chat to the hosts or
   folders listed.
3. A chat worker that fails a test SHALL get a brief with no epic context
   section.

### Requirement EC10: Visible, and kept out of what leaves the machine

**User story:** As the owner, I want to see which sessions got context and
why, and I want the context kept out of commits and GitHub.

#### Acceptance criteria

1. A task whose current session has epic context SHALL show an **Epic
   context** chip on its row and in its drawer, naming the sources.
2. Activity SHALL record, at each session start and resume where some
   source names the task's repository, each of the four tests with passed
   or failed and the reason, and what was given: source names, skill
   names, read IDs, MCP aliases and hosts. It SHALL record no read path's
   contents, no MCP argument and no environment value.
3. The task's diff, its GitHub writes and its briefs SHALL pass the
   repository's content rules as today (Requirement 40), plus every set
   that a giving source names in `contentSets`, at the `diff`, `github`
   and `brief` boundaries. A named set this machine does not have SHALL
   block as a missing terms file does.
4. Settings › Epic context SHALL show the machine block, each machine
   plugin's context part with its state, and the last ten sessions that got
   context, with their tests.
5. `avoozl show TASK --json` and the MCP task read SHALL return the four
   tests and what was given for the last session, without paths' contents.

### Requirement EC11: Security

**User story:** As the owner, I want each way to misuse epic context to be
named with what stops it, and each stop tested.

#### Acceptance criteria

1. The design SHALL state the threats and what stops each (D9): a
   repository trying to turn context on, stranger input, a coworker's spec,
   a plugin widening access, and context leaking out through commits,
   GitHub writes or MCP calls.
2. Each stop SHALL have a test.
3. A session without epic context SHALL have the same sandbox, brief and
   harness argv, byte for byte, as before this spec, which a test checks.

### Requirement EC12: Tests, the live proof and the docs

**User story:** As the owner, I want proof on scratch repositories that the
gate holds and the context arrives.

#### Acceptance criteria

1. Unit tests SHALL check each test of EC1 alone failing, each EC2 and EC3
   refusal, the approval hash binding, the merge and alias conflict, each
   read refusal, the relay's socket and stop, the proxy allowlist and the
   byte-for-byte check of EC11.3.
2. A live proof (ec-p1) SHALL run on scratch repositories with a fake MCP
   server and show the context given to an approved, driven spec task and
   withheld from a stranger's issue, an intake task, a coworker-driven spec
   and a repository that tries to turn it on.
3. `docs/plugins.md` SHALL gain a Context part section; a new
   `docs/epic-context.md` SHALL describe the four tests, the machine block,
   the relay, the egress hosts, the Kiro Crew limits and the threats; and
   the shipped `avoozl-plugin` skill SHALL know the part.
4. Examples SHALL use only neutral names: `acme/*`, the `research` alias and
   the `team-context` plugin.
