---
category: Planning
---

# Requirements: epic context for the owner's own work

## Introduction

**Epic context** is the extra skills, read folders and MCP servers that
Avoozl gives one worker session, and only when that session does the
person's own approved spec work. Two sources supply it, and both live only on
this machine: an `epicContext` block in this machine's config, and the plugin
part `context`, honored only from this machine's `plugins.json`. A task gets
it only when two tests pass (EC1). Nothing in a spec, an issue, a pull
request or a repository file can turn it on.

### What this builds on

- `.kiro/specs/avoozl/` Requirement 114 (git is the source of truth;
  approvals are commits read by `approvalCommits` and `approverCheck` in
  `src/app/git/git-approvals.ts`), Requirement 40 (content rules) and
  Requirement 34 (plugin approval by hash).
- `.kiro/specs/plugin-credentials/` PC2: a plugin part that only this
  machine's `plugins.json` may declare.
- `.kiro/specs/plugin-checks/` PK10: MCP servers named by alias, mapped on
  this machine with environment variable names and no credential values.

### Scope

- The two tests, their record, and when they run.
- The machine `epicContext` block and the `context` plugin part.
- Approval of a context part, its `ask` answers and its MCP mapping.
- What a `process` session gets: reads, skills and MCP servers through a
  relay.
- What a Kiro Crew chat worker gets, and what cannot be enforced there.
- The task row, Activity, the docs and a live proof.

### Out of scope

- Context for reviews, verdicts, responders and planners
  (D11, question 2).
- Credentials for GitHub. Workers get no GitHub token (PC6).
- A shared, hosted context service. Context stays on each machine.
- Kiro Crew chat MCP servers set per session (EC8).

### Words

| Word | Meaning |
| --- | --- |
| Epic context | The skills, read folders and MCP servers one session gets beyond its normal sandbox |
| Context source | The machine `epicContext` block, or one approved `context` part of a machine plugin |
| The two tests | EC1's checks; both pass or the session gets no epic context |
| Specs branch | The spec repository's base branch that approvals land on (`approvalBase` in `src/app/git/git-approvals.ts`) |
| Ask | A value a context part needs from each person, such as the folder of a local clone, filled once on this machine |
| MCP relay | Avoozl's small stdio program that the harness starts in place of an MCP server; it forwards to the real server, which runs outside the sandbox |

## Requirements

### Requirement EC1: The two tests

**User story:** As the owner, I want epic context only on my own approved
spec work, so that a stranger or a repository file can never widen what a
worker reaches.

#### Acceptance criteria

1. A session SHALL get epic context only WHEN both tests pass for its task,
   at the time the session starts or resumes:
   - **approved**: the task is a task of a spec whose approved revision is
     on the specs branch, and the task is in that revision's `tasks.md`.
     A task whose ID starts with `intake-` (an intake task), and any task
     made outside a spec, SHALL fail this test.
   - **approver**: the commit that approved that revision is by an allowed
     approver, read with the git approval reader (`approvalCommits` with
     `approverCheck`, Requirement 114).
2. WHEN either test fails THEN the session SHALL start with its normal
   sandbox, exactly as it would with no context source at all.
3. A test that cannot be read (a git error) SHALL count as failed.
4. The tests SHALL read only Avoozl's own records and git: the approved
   revision and the approval commit. No fact in `tasks.md`, no text in a
   spec, an issue, a pull request or a comment, and no repository file SHALL
   change the result.
5. `tasks.md` SHALL have no fact that asks for epic context. Spec lint
   refuses an unknown fact; a test SHALL check that `$context` and
   `$epicContext` are refused.
6. The tests SHALL run again on every resume. WHEN one fails on a resume
   THEN the session SHALL resume with its normal sandbox, and Activity SHALL
   name the test that fails.
7. A message from a login that does not count under the repository's
   `allowedActors` and `minimumPermission` SHALL NOT be sent into a session
   that holds epic context. A message queued for a session names its author
   in `from`. WHEN such text would reach the session THEN Avoozl SHALL stop
   that session and start the follow-up as a new session with its normal
   sandbox and no epic context.

### Requirement EC2: The machine block

**User story:** As the owner, I want to name my own reads and MCP servers
for my repositories in my machine's config, so that I need no plugin
for my own setup.

#### Acceptance criteria

1. This machine's `config.json` SHALL accept `epicContext`:
   `{repos, reads?, mcp?, contentSets?}`. Any other key SHALL be refused
   naming the key.
   - `repos`: 1 to 50 GitHub repository names, `owner/name` or `owner/*`,
     compared without case, or registered repository IDs. Required.
   - `reads`: up to 20 folders, absolute or under `~/`.
   - `mcp`: up to 10 servers by alias (PK10's alias rule), each
     `{about, command, env?}`: `about` 1 to 200 characters, `command` an
     argv list, `env` the environment variable names the server may read.
   - `contentSets`: up to 20 content rule set IDs (EC9.3).
2. A repository's `.avoozl.json` SHALL refuse an `epicContext` key, naming
   the file and the key. A layered workspace config SHALL refuse it too: it
   is read only from this machine's `config.json`.
3. Only a person SHALL change `epicContext`, in Settings > Epic context or
   with `avoozl context set`. The MCP tools and an agent session SHALL be
   refused.
4. The block SHALL hold no credential value. A credential-like key, and a
   `command` item that looks like a credential, SHALL be refused.

### Requirement EC3: The context plugin part

**User story:** As a team's tools owner, I want to ship our skills, reads
and MCP servers as one plugin, so that each engineer installs it once
and approves exactly what it gives.

#### Acceptance criteria

1. `context` SHALL be one of the plugin parts in `PARTS`
   (`src/app/plugins/plugins.ts`). It is a data part: a plugin that provides
   only data parts SHALL have no `entry`.
2. A manifest that provides `context` SHALL hold
   `context: {repos, skills?, reads?, ask?, mcp?, contentSets?}`.
   Any other key SHALL be refused naming the key, and `context` SHALL be
   refused when `provides` does not list it.
   - `repos`: as EC2.1, required.
   - `skills`: a folder inside the plugin holding up to 20 folders, each
     with one `SKILL.md` of at most 64 KB whose front matter has `name` (the
     folder name) and `description` (1 to 300 characters).
   - `reads`: up to 20 `{id, about, path}`. `path` MAY hold `{ask:NAME}`
     placeholders and SHALL be absolute or under `~/` once they are filled.
   - `ask`: `NAME` to a question of 1 to 200 characters. Every
     `{ask:NAME}` SHALL name a key here, and every key SHALL be used.
   - `mcp`: a `.json` file inside the plugin, by default `mcp/servers.json`,
     mapping each alias to `{about, command}`. `command` SHALL be an argv
     list whose first item is a program name or a path inside the plugin
     folder. The file SHALL hold no `env` and no credential.
   - `contentSets`: content rule set IDs (EC9.3).
3. A `context` part SHALL count only from a plugin declared in this
   machine's `plugins.json` and approved here. A `context` part of a plugin
   that `.avoozl.json` declares SHALL be ignored, and Settings > Plugins
   SHALL say "context ignored: declared in .avoozl.json". Its other parts
   SHALL still work.
4. A `command` that is a single shell string SHALL be refused.

### Requirement EC4: Approving a context part

**User story:** As an engineer, I want the approval screen to show every
skill, folder and MCP server a context plugin gives, so that
approving is real consent.

#### Acceptance criteria

1. The approval view, the Add plugin preview and the Settings > Plugins row
   SHALL list, for a `context` part: `repos`; each skill's name, description
   and `SKILL.md` hash; each read's `about`, its path as written and as
   filled on this machine; each ask with its answer; each MCP alias's
   `about`, `command` and this machine's mapping (EC4.3); and the
   `contentSets`.
2. Each `ask` SHALL be answered once on this machine, in Settings > Plugins
   or `avoozl plugins answer ID NAME VALUE`, and stored in `plugins.json`.
   Until every ask is answered, the part SHALL give nothing, and one Needs
   you item SHALL name the plugin and the unanswered questions.
3. Each MCP alias SHALL get this machine's mapping in `plugins.json`, as
   PK10 holds it: `{env, command?}`, `env` the environment variable names
   the server may read and an optional `command` that replaces the plugin's.
   Until every alias is mapped, the part SHALL give nothing. The mapping
   SHALL hold no credential value. A sign-in the server keeps itself (its
   own token file) SHALL stay the server's own.
4. The approval SHALL bind the plugin's content hash (Requirement 34), the
   ask answers and the MCP mappings. WHEN any of them changes THEN the part
   SHALL give nothing until a person approves again.
5. Answering, mapping and approving SHALL be person-only. The MCP tools and
   an agent session SHALL be refused.

### Requirement EC5: What a session gets

**User story:** As the owner, I want a session that passes the two tests
to get the context its repository's sources name, and nothing more.

#### Acceptance criteria

1. WHEN the two tests pass THEN the session's context SHALL be the union
   of every context source whose `repos` names the task's repository. A
   source that names none of it SHALL give nothing. A repository with no
   GitHub remote SHALL match only by its registered ID.
2. WHEN two sources give one MCP alias THEN neither SHALL give it, and one
   Needs you item SHALL name both. Reads and skills SHALL be merged without
   repeats.
3. A read SHALL be left out, with its reason, when it is, holds or is inside
   a path the sandbox denies (`sandboxSecretPaths`,
   `src/app/executors/sandbox.ts`), Avoozl's config or state folder, or
   the person's home folder itself. The rest SHALL still be given.
4. A read that does not exist at session start SHALL be left out and named
   in the session record.
5. Only the `worker` role SHALL get epic context (D11, question 2).

### Requirement EC6: Reads and skills in a process session

**User story:** As the owner, I want the worker to read the team's folders
and skills, and to change none of them.

#### Acceptance criteria

1. Each read SHALL be added to the session's read-only folders. No read
   SHALL be writable.
2. Avoozl SHALL copy each skill folder of an approved part into a session
   context folder outside the task folder, after checking each file's hash
   against the approval, and SHALL add that folder read-only. A skill with a
   changed file SHALL be left out.
3. The brief SHALL list each skill's name, description and `SKILL.md` path,
   each read's `about` and path, and each MCP alias given, under an "Epic
   context" heading that says this is the person's epic context, and SHALL
   tell the worker to read a skill before work it covers.
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
   run as the MCP relay with the session's socket, token and alias. The file
   SHALL hold no environment value.
3. The relay SHALL connect to a Unix socket in a `0700` folder of its own.
   A broker process Avoozl starts for the session, outside the sandbox,
   SHALL check the token and the alias, start the real server on the
   connection and pipe the two.
4. The real server SHALL run outside every sandbox with the check
   environment basics plus its mapping's `env` names, in a scratch working
   folder, as PK10 runs a check's server. It SHALL NOT open a network
   listener; one that does SHALL be stopped and its plugin marked broken
   (PK7.5).
5. Each server SHALL stop when its session ends. Each tool call SHALL be
   recorded in Activity: alias, tool name, time, bytes and any error, never
   the arguments or the reply.
6. MCP replies SHALL be untrusted data (Requirement 34).

### Requirement EC8: Kiro Crew chat workers

**User story:** As the owner, I want to know what epic context means on a
chat worker, which runs as me.

#### Acceptance criteria

1. A `kirocrew` worker that passes the two tests SHALL get the skills and
   reads named in its brief (EC6.3) and SHALL get no MCP servers. The task
   row SHALL say "Epic context (brief only)".
2. The docs SHALL say plainly: a chat runs as the person, outside Avoozl's
   sandbox, so the two tests decide only what Avoozl tells the chat, not
   what it can reach. Avoozl cannot add an MCP server to one chat, and
   cannot hold a chat to the folders listed.
3. A chat worker that fails a test SHALL get a brief with no epic context
   section.

### Requirement EC9: Visible, and kept out of what leaves the machine

**User story:** As the owner, I want to see which sessions got context and
why, and I want the context kept out of commits and GitHub.

#### Acceptance criteria

1. A task whose last session got epic context SHALL show an **Epic
   context** chip on its row and in its drawer, naming the sources.
2. Activity SHALL record, at each session start and resume where some
   source names the task's repository, each of the two tests with passed
   or failed and the reason, and what was given: skill names, read IDs and
   MCP aliases, and what was left out. It SHALL record no read path's
   contents, no MCP argument and no environment value.
3. The context brief SHALL pass the repository's content rules (Requirement
   40) plus every set that a giving source names in `contentSets`, at the
   `brief` boundary, and the task's diff and GitHub writes SHALL pass those
   sets at the `diff` and `github` boundaries. A brief the rules block SHALL
   give no context.
4. Settings > Epic context SHALL show this machine's own context as a form
   (repos, folders to read, tools and content rule sets), each machine
   plugin's context part read-only with its state, and the last ten
   sessions that got context, with their tests. The form SHALL check each
   field before Save and show each problem next to its field. A save SHALL
   refuse a folder that does not exist on this machine.
5. `avoozl show TASK --json` and the MCP task read SHALL return the two
   tests and what was given for the last session, without paths' contents.

### Requirement EC10: Security

**User story:** As the owner, I want each way to misuse epic context to be
named with what stops it, and each stop tested.

#### Acceptance criteria

1. The design SHALL state the threats and what stops each (D8): a
   repository trying to turn context on, a comment that does not count, a
   plugin widening access, and context leaking out through commits,
   GitHub writes or MCP calls.
2. Each stop SHALL have a test.
3. A session without epic context SHALL have the same sandbox, brief and
   harness argv, byte for byte, as a session with no context source, which
   a test checks.

### Requirement EC11: Tests, the live proof and the docs

**User story:** As the owner, I want proof on scratch repositories that the
gate holds and the context arrives.

#### Acceptance criteria

1. Unit tests SHALL check each test of EC1 alone failing, each EC2 and EC3
   refusal, the approval hash binding, the merge and alias conflict, each
   read refusal, the relay's socket and stop and the byte-for-byte check of
   EC10.3.
2. A live proof (ec-p1) SHALL run on scratch repositories with a fake MCP
   server and show the context given to an approved spec task and withheld
   from an intake task and a repository that tries to turn it on.
3. `docs/plugins.md` SHALL have a Context part section;
   `docs/epic-context.md` SHALL describe the two tests, the machine block,
   the relay, the Kiro Crew limits and the threats; and the shipped
   `avoozl-plugin` skill SHALL know the part.
4. Examples SHALL use only neutral names: `acme/*`, the `research` alias and
   the `team-context` plugin.
