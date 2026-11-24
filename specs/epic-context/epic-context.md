---
repo: avoozl
category: Planning
---

# Epic context for the owner's own work

## Requirements

### Introduction

**Epic context** is the extra skills, read folders and MCP servers that
Avoozl gives one worker session, and only when that session does the
person's own approved spec work. Two sources supply it, and both live only on
this machine: an `epicContext` block in this machine's config, and the plugin
part `context`, honored only from this machine's `plugins.json`. A task gets
it only when two tests pass (EC1). Nothing in a spec, an issue, a pull
request or a repository file can turn it on.

#### What this builds on

- [avoozl](../avoozl/avoozl.md) Requirement 114 (git is the source of truth;
  approvals are commits read by `approvalCommits` and `approverCheck` in
  `src/app/git/git-approvals.ts`), Requirement 40 (content rules) and
  Requirement 34 (plugin approval by hash).
- [plugin-credentials](../plugin-credentials/plugin-credentials.md) PC2: a plugin part that only this
  machine's `plugins.json` may declare.
- [plugin-checks](../plugin-checks/plugin-checks.md) PK10: MCP servers named by alias, mapped on
  this machine with environment variable names and no credential values.

#### Scope

- The two tests, their record, and when they run.
- The machine `epicContext` block and the `context` plugin part.
- Approval of a context part, its `ask` answers and its MCP mapping.
- What a `process` session gets: reads, skills and MCP servers through a
  relay.
- What a Kiro Crew chat worker gets, and what cannot be enforced there.
- The task row, Activity, the docs and a live proof.

#### Out of scope

- Context for reviews, verdicts, responders and planners
  (D11, question 2).
- Credentials for GitHub. Workers get no GitHub token (PC6).
- A shared, hosted context service. Context stays on each machine.
- Kiro Crew chat MCP servers set per session (EC8).

#### Words

| Word | Meaning |
| --- | --- |
| Epic context | The skills, read folders and MCP servers one session gets beyond its normal sandbox |
| Context source | The machine `epicContext` block, or one approved `context` part of a machine plugin |
| The two tests | EC1's checks; both pass or the session gets no epic context |
| Specs branch | The spec repository's base branch that approvals land on (`approvalBase` in `src/app/git/git-approvals.ts`) |
| Ask | A value a context part needs from each person, such as the folder of a local clone, filled once on this machine |
| MCP relay | Avoozl's small stdio program that the harness starts in place of an MCP server; it forwards to the real server, which runs outside the sandbox |


#### Requirement EC1: The two tests

**User story:** As the owner, I want epic context only on my own approved
spec work, so that a stranger or a repository file can never widen what a
worker reaches.

##### Acceptance criteria

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

#### Requirement EC2: The machine block

**User story:** As the owner, I want to name my own reads and MCP servers
for my repositories in my machine's config, so that I need no plugin
for my own setup.

##### Acceptance criteria

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

#### Requirement EC3: The context plugin part

**User story:** As a team's tools owner, I want to ship our skills, reads
and MCP servers as one plugin, so that each engineer installs it once
and approves exactly what it gives.

##### Acceptance criteria

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

#### Requirement EC4: Approving a context part

**User story:** As an engineer, I want the approval screen to show every
skill, folder and MCP server a context plugin gives, so that
approving is real consent.

##### Acceptance criteria

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

#### Requirement EC5: What a session gets

**User story:** As the owner, I want a session that passes the two tests
to get the context its repository's sources name, and nothing more.

##### Acceptance criteria

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

#### Requirement EC6: Reads and skills in a process session

**User story:** As the owner, I want the worker to read the team's folders
and skills, and to change none of them.

##### Acceptance criteria

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

#### Requirement EC7: MCP servers through a relay

**User story:** As the owner, I want the worker to call the team's MCP
servers without the worker ever holding their sign-in.

##### Acceptance criteria

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

#### Requirement EC8: Kiro Crew chat workers

**User story:** As the owner, I want to know what epic context means on a
chat worker, which runs as me.

##### Acceptance criteria

1. A `kirocrew` worker that passes the two tests SHALL get the skills and
   reads named in its brief (EC6.3) and SHALL get no MCP servers. The task
   row SHALL say "Epic context (brief only)".
2. The docs SHALL say plainly: a chat runs as the person, outside Avoozl's
   sandbox, so the two tests decide only what Avoozl tells the chat, not
   what it can reach. Avoozl cannot add an MCP server to one chat, and
   cannot hold a chat to the folders listed.
3. A chat worker that fails a test SHALL get a brief with no epic context
   section.

#### Requirement EC9: Visible, and kept out of what leaves the machine

**User story:** As the owner, I want to see which sessions got context and
why, and I want the context kept out of commits and GitHub.

##### Acceptance criteria

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

#### Requirement EC10: Security

**User story:** As the owner, I want each way to misuse epic context to be
named with what stops it, and each stop tested.

##### Acceptance criteria

1. The design SHALL state the threats and what stops each (D8): a
   repository trying to turn context on, a comment that does not count, a
   plugin widening access, and context leaking out through commits,
   GitHub writes or MCP calls.
2. Each stop SHALL have a test.
3. A session without epic context SHALL have the same sandbox, brief and
   harness argv, byte for byte, as a session with no context source, which
   a test checks.

#### Requirement EC11: Tests, the live proof and the docs

**User story:** As the owner, I want proof on scratch repositories that the
gate holds and the context arrives.

##### Acceptance criteria

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

## Design

`EC` numbers are in [Requirements](#requirements); `R` numbers are in
[avoozl requirements](../avoozl/avoozl.md#requirements), `PK` numbers in
[plugin-checks](../plugin-checks/plugin-checks.md),
and `PC` numbers in [plugin-credentials](../plugin-credentials/plugin-credentials.md).

### D1. Shape

```text
 this machine only                                 the task's session
 -----------------                                 ------------------
 config.json  epicContext {repos, reads, mcp,      process child in its sandbox
              contentSets}                           + reads, read-only
 plugins.json team-context (approved, machine)       + skills copy, read-only
              answers, MCP mappings                  + brief: "Epic context"
        |                                            + MCP config -> relay
        v                                                  |
 epicContextGate(task)                                     |
   approved  approver                                      | relay socket
        |  both pass                                       v
        v                                          broker (outside sandbox)
 sessionContext(sources, repository) ---------->     real MCP server, env names
        |                                            from this machine's mapping
        `-> Activity: each test, what was given
```

One function decides (`epicContextGate`), one function gathers
(`sessionContext`), and `processContext` adds the result to the start. Both
live in `src/app/workers/epic-context.ts`. A session that fails the gate goes
through the normal path with nothing added (EC10.3).

### D2. The two tests (EC1)

`epicContextGate(store, {taskId}, deps)` returns:

```json
{
  "given": false,
  "tests": [
    {
      "name": "approved",
      "passed": true
    },
    {
      "name": "approver",
      "passed": false,
      "why": "The approving commit is by dev@example.com, who is not an allowed approver."
    }
  ]
}
```

| Test | Reads | Passes when |
| --- | --- | --- |
| `approved` | the task's plan row and its approval receipt's hash; the task ID | the plan is `approved`, the revision with that hash is on the specs branch (`approvalBase`), the task ID is in that revision's `tasks.md`, and the ID does not start with `intake-` |
| `approver` | the approval commit found by `approvalCommits(root, {ref, specs: [spec]})` | `approverOf(root)` allows that commit's author |

The tests never read a spec's prose, an issue body, a comment or a
repository file. Every test is computed even after one fails, so Activity
names them all. Approval commits are read once per checkout, spec and
approved hash and cached in memory, so a resume costs no git log.

#### Comments after the start (EC1.7)

A message queued for a task's open session may name its author in `from:
{login}`. The send path in `src/app/executors/process.ts` reads that
author's standing with `authorCounts`, under the repository's
`allowedActors` and `minimumPermission`, as the review gate does. WHEN an
author does not count and the session holds epic context THEN the message is
not sent, the session is stopped, and the follow-up starts as a new session
whose request says `epicContext: false`, so it gets no epic context whatever
the two tests say. Activity records an `epic-context.comment` row.

### D3. The machine block (EC2)

```json [~/.config/avoozl/config.json]
{
  "epicContext": {
    "repos": [
      "acme/*"
    ],
    "reads": [
      "~/notes/acme-widgets"
    ],
    "mcp": {
      "research": {
        "about": "Answers questions from the team's design archive",
        "command": [
          "research-mcp",
          "--stdio"
        ],
        "env": [
          "RESEARCH_TOKEN"
        ]
      }
    },
    "contentSets": [
      "acme-terms"
    ]
  }
}
```

`validateEpicContext` in `src/app/context/epic-context-config.ts` checks the
block, with the shared field checks in `src/app/context/context-shape.ts`.
`src/app/settings/host-config.ts` runs it on the host config, and
`src/host-config.schema.json` holds its schema. `assertNoMachineKeys` in
`src/app/landing/landing-config.ts` refuses the key in `.avoozl.json` and in
layered workspace config, naming the file.

The operation `context.machine.set` in `src/app/ops/context.ts` is
`person(...)` and refuses a bound or MCP caller. It checks that each read
folder exists before it writes. The CLI entries are
`avoozl context set --json '{...}'`, `avoozl context set --remove` and
`avoozl context show` (`src/app/commands/context.ts`).

### D4. The context part (EC3)

```json [team-context/avoozl-plugin.json]
{
  "id": "team-context",
  "version": "1.0.0",
  "contract": 1,
  "provides": [
    "context"
  ],
  "context": {
    "repos": [
      "acme/*"
    ],
    "skills": "skills",
    "reads": [
      {
        "id": "team-notes",
        "about": "The team's design notes",
        "path": "{ask:notesRoot}/widgets"
      }
    ],
    "ask": {
      "notesRoot": "The folder of your clone of acme/team-notes"
    },
    "mcp": "mcp/servers.json",
    "contentSets": [
      "acme-terms"
    ]
  }
}
```

```json [team-context/mcp/servers.json]
{
  "research": {
    "about": "Answers questions from the team's design archive",
    "command": [
      "node",
      "mcp/research.mjs"
    ]
  }
}
```

```text
team-context/
  avoozl-plugin.json
  skills/
    module-layout/SKILL.md
    error-messages/SKILL.md
  mcp/
    servers.json
    research.mjs
```

`validateManifest` in `src/app/plugins/plugins.ts` reads the part with
`readContextPart` (`src/app/context/plugin-context.ts`). A plugin of data
parts only has no `entry`. A `command` path inside the plugin is resolved
against the plugin folder and must stay inside it; a program name is looked
up on `PATH` when the server starts. The skills folder is read at
validation, and each file of each skill is hashed, so a copy at session start
can be checked. A link inside a skill folder is refused.

`contextSources(options)` returns every plugin that is `approved`, declared
in this machine's `plugins.json`, provides `context`, has every ask answered
and every alias mapped. A plugin that `.avoozl.json` declares is skipped, and
`contextView` marks its part "context ignored: declared in .avoozl.json".

### D5. Approval, asks and mappings (EC4)

```json [~/.config/avoozl/plugins.json, the context keys]
{
  "context": {
    "team-context": {
      "answers": {
        "notesRoot": "~/src/acme/team-notes"
      }
    }
  },
  "mcp": {
    "team-context": {
      "research": {
        "env": [
          "RESEARCH_TOKEN"
        ]
      }
    }
  }
}
```

Answers live under `context`, keyed by plugin. Mappings live under `mcp`,
keyed by plugin and alias: the same store PK10's checks use. A mapping's
`command` is optional and replaces the plugin's.

`contextHash(settings, id)` is the SHA-256 of the canonical answers and
mappings, and the approval binds it beside the content hash. A plugin whose
answers or mappings do not match reads as `changed`, and its context part
gives nothing until approved again.

`contextView` gives what the approval view, the Add plugin preview and
Settings list: `repos`; each skill as name, description and the SHA-256 of
its `SKILL.md`; each read as `about`, the path as written and as filled here;
each ask with its answer; each alias as `about`, `command` (the plugin's, or
this machine's replacement, marked) and the `env` names; each content set;
and the state (approved, needs answers, needs mapping, ignored, or the
plugin's own state). The operations `plugin.answer`, `plugin.map` and the
approval are person-only.

### D6. A process session (EC5, EC6, EC7)

`sessionContext(sources, repository, places)` returns
`{sources, reads, skills, servers, contentSets, left, conflicts}`. It merges
the sources whose `repos` match the task's repository (its GitHub
`owner/name`, or its ID for a repository with no GitHub remote), drops an
alias two sources give, leaves out reads as EC5.3 says (checking against
`sandboxSecretPaths`, plus the config and state folders and home itself),
and records each item it leaves out. `contextNeedsYou` raises the Needs you
rows for unanswered asks and alias conflicts.

`processContext` then gives the process executor:

| Item | A session that passes |
| --- | --- |
| Reads | added to `readable` |
| Skills | copied into a fresh `avoozl-context-*` folder under the temp folder after a hash check, mode `0444`, the folder added to `readable` |
| Brief | an "Epic context" section: skills (name, description, path), reads (`about`, path), MCP aliases |
| MCP | the harness's `context.mcp` argv with `{context_mcp}`; one relay per alias |

The session context folder is outside the task folder, so the worker cannot
change a skill it reads. The supervisor removes it when the child exits.

#### MCP relay

```json [{context_mcp}, written by Avoozl]
{
  "mcpServers": {
    "research": {
      "command": "/path/to/node",
      "args": [
        "/path/to/avoozl/src/app/executors/context-relay.ts",
        "--socket",
        "/tmp/avz-.../mcp.sock",
        "--token",
        "...",
        "--alias",
        "research"
      ]
    }
  }
}
```

```json [~/.config/avoozl/harnesses/claude-code.json, the context key]
{
  "context": {
    "mcp": [
      "--mcp-config",
      "{context_mcp}",
      "--strict-mcp-config"
    ]
  }
}
```

The relay (`src/app/executors/context-relay.ts`) connects to `mcp.sock` in
a `0700` folder of its own under the temp folder, one per session, sends the
session's token and the alias, then pipes its standard streams both ways.

The broker (`src/app/executors/context-broker.ts`) runs as its own detached
process per session (`context-broker-main.ts`), started by the supervisor,
because the tick that starts a child exits long before the child does. It
checks the token and that the alias is one this session was given, starts
the real server on the connection with the check environment basics plus the
mapped `env` names, in a scratch folder, and pipes JSON-RPC lines. It reads
only the method and tool name of each request and each reply's size and
error, and appends one line per call to the session's `context-calls.jsonl`;
the process executor turns each line into an `epic-context.call` Activity
row. A server that opens a listener is stopped and its plugin marked broken
(PK7.5). The broker ends when the session's run ends.

A server started by the harness CLI would run in the CLI's sandbox, so its
sign-in would sit where the worker's own tools can read it. Outside, the
worker reaches only the server's tools.

The harness `context` key (`src/app/executors/harness-definitions.ts`)
passes the same argv checks as `start`, and `{context_mcp}` is a placeholder
only the supervisor fills.

### D7. Kiro Crew chat workers (EC8)

| Item | Given to a chat | Enforced |
| --- | --- | --- |
| Skills | named in the brief, with the approved plugin paths | no: the chat reads what it likes |
| Reads | named in the brief | no: the chat runs as the person |
| MCP servers | not given | n/a: no per-chat MCP setting |

`chatBrief` runs the same gate before the start request is stored, so an
intake task gets a brief with no context section. That limits what Avoozl
points the chat at, not what it can reach. The chip says "Epic context
(brief only)".

### D8. Security review (EC10)

| Threat | What stops it | Test |
| --- | --- | --- |
| A repository file turns context on (`.avoozl.json` `epicContext`, a repository-declared `context` plugin, a `$context` fact) | `epicContext` is read only from `config.json`; a repo-declared part is ignored; lint refuses unknown facts | EC2.2, EC3.3, EC1.5 |
| A spec's text, an issue or a pull request asks for context | The gate reads no prose (EC1.4) | a spec whose text asks for it gets none |
| A stranger's issue or pull request reaches a context session | `approved` fails for intake tasks; a comment that does not count is never sent to a context session (EC1.7) | each alone |
| An edit to an approved spec | a new revision needs a new approval commit by an approver; the old approval does not match the new hash | `approved` fails on a task added after approval |
| A non-approver's commit on main | `approverCheck` refuses its author | `approver` fails |
| A plugin widens access in an update | a new content hash, answer or mapping needs approval again (EC4.4) | a changed plugin gives nothing |
| A plugin reads a secret folder | reads inside `sandboxSecretPaths`, Avoozl's folders or home itself are left out (EC5.3) | each path left out |
| A plugin carries a credential | servers.json holds no `env`; credential-like keys and command items are refused; sign-ins come from this machine's mapping | each refused |
| An MCP server hands the worker its sign-in | the server runs outside the sandbox; the worker gets only its replies | the child's environment holds no mapped name |
| An MCP server listens on the network | the listener check stops it and marks the plugin broken | PK7.5's test, on a broker server |
| Context leaks out in a commit or a GitHub write | content rules at `diff` and `github`, plus the source's `contentSets` (Requirement 40) | a diff with a set's term is blocked |
| Context leaks out through an MCP call | the worker can send any text it read to a mapped server. The person chose the server; Activity records each call's size | none: accepted (question 4) |
| A Kiro Crew chat ignores the list | not stoppable; documented (EC8.2) | docs |

What stays reachable to an epic-context worker: everything a normal
session reaches, the listed reads and skills read-only, and the listed MCP
servers' tools. A prompt-injected worker on the person's own approved task
can move what it reads into its diff; the diff reaches GitHub only through
content rules and the landing rules of its repository.

### D9. Visible (EC9)

- `recordContext` keeps each task's last session under the store's
  `epicContext` meta: tests, sources, given items, what was left out and the
  content sets. `contextChip` (`src/app/context/context-record.ts`) reads it
  for the task row and drawer: **Epic context**, or **Epic context (brief
  only)** on a chat.
- Activity writes one `epic-context.session` row per start or resume whose
  repository some source names: the two tests with passed or failed and the
  reason, then the given items by name and what was left out. A repository no
  source names writes nothing, so other work adds no rows.
- Settings > Epic context (`hosts/kirocrew/ui/src/EpicContextSettings.tsx`)
  opens with **Extra context for your work**: with no block it says "None
  set. Workers get only the task and the repo."; with one it shows the form.
  The fields are Repos, Folders to read (each one checked to exist on save),
  Tools (name, what it does, the command one argument per box, and
  environment variable names) and Content rules (this machine's sets). Save
  sends `context.machine.set`; a refusal that names a key shows under that
  key's field. **View as JSON** shows the block read-only. Below it, each
  machine plugin's part is listed read-only with its state, then the last ten
  sessions with context (`context.get`).
- `avoozl show TASK --json` and the MCP task read return `epicContext` from
  the task's record, with its chip.

### D10. Sessions without context

- A session with no context source for its repository, or one that fails
  the gate: its argv, sandbox, brief and environment are byte for byte those
  of a session with no source (EC10.3).
- Checks: context is for the session only.
- GitHub credentials: workers get none (PC6).

### D11. Design choices

1. **Skills are listed in the brief.** It works on every harness and on
   chats (EC6.3).
2. **Only the `worker` role gets context.** The verifier and reviewer judge
   the diff against the spec without it, so a claim that only the context
   supports gets a second look.
3. **Any allowed approver.** The `approver` test accepts any allowed
   approver, not only this person.
4. **Context sent out through MCP calls.** Content rules cannot read MCP
   arguments without storing them. Accepted: the person chose and mapped
   each server, and Activity records only sizes (EC7.5).
5. **`repos` matching for a repository with no GitHub remote.** Match the
   registered repository ID, never a path.
6. **The machine block has no skills.** Skills come only from a plugin, so
   each is hashed and approved; the machine block names only what the person
   wrote themselves.

### D12. Risks

- A skill copied at start is the approved one; a skill the worker writes to
  its own task folder is not context and reaches nothing.
- A read folder that holds a git checkout can hold hooks; it is read-only,
  and nothing Avoozl runs uses it as a work tree.

## Tasks

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`EC1` to `EC11`, in [Requirements](#requirements)); `D` sections
refer to [Design](#design), `R` numbers to
[avoozl requirements](../avoozl/avoozl.md#requirements).

Tests use isolated temporary workspaces and state folders, a fake GitHub,
fake executors and fake MCP servers. Screen changes need phone and desktop,
light and dark screenshots for owner approval before merge, shown to the
owner and never committed. Examples use only `acme/*`, `research` and
`team-context`.

Task IDs start with `ec-` so
they never collide with the IDs of the other specs.

### Phase 1: The gate and the two sources

- [x] `ec-1.1` The two tests and their record [EC1.1, EC1.2, EC1.3, EC1.4, EC1.5] (§D2)
  - Tests with real git: a task of an approved spec passes both; each test failing alone gives `given: false` and names that test with its reason; an `intake-` task fails `approved`; a task added to `tasks.md` after approval fails `approved`; an approval commit by a non-approver fails `approver`; a git error fails; spec text, an issue body and a `.avoozl.json` key that ask for context change nothing; `$context` and `$epicContext` facts are refused by lint.
  - `epicContextGate` in `src/app/workers/epic-context.ts`, with approval commits cached per spec and hash.
- [x] `ec-1.2` The machine `epicContext` block [EC2] (§D3)
  - Tests: the block loads with `repos`, `reads`, `mcp` and `contentSets`; an unknown key, a missing `repos`, more than the limits, a shell string `command` and a credential-like key or value are each refused naming the key; `.avoozl.json` and layered workspace config refuse `epicContext` naming the file; `context.machine.set` is refused over MCP and for a bound caller; `avoozl context set` and `avoozl context show` work from a terminal; the schema in `host-config.schema.json` matches.
- [x] `ec-1.3` The `context` plugin part [EC3] (§D4)
  - Tests: a `team-context` manifest with skills, reads, asks and `mcp/servers.json` loads; a plugin that provides only `context` and names an `entry` is refused; each EC3.2 key error, an unused or unknown ask, a `SKILL.md` over 64 KB or with a wrong `name`, a servers file with `env` or a credential, a `command` path outside the plugin and a shell string are each refused naming it; `contextSources` returns only approved machine plugins and skips a part `.avoozl.json` declares, which Settings marks "context ignored: declared in .avoozl.json" while its other parts still work.
  - `readContextPart` in `src/app/context/plugin-context.ts`, called by `validateManifest` in `src/app/plugins/plugins.ts`.
- [x] `ec-1.4` Asks, MCP mappings and the approval hash, after `ec-1.3` [EC4] (§D5)
  - Tests: an unanswered ask gives nothing and raises one Needs you item naming the questions; `avoozl plugins answer` stores the answer in `plugins.json`; an alias with no mapping gives nothing; a mapping holds `env` names and an optional `command`, and a credential value is refused; changing an answer or a mapping turns the plugin `changed` until approved again; `readPluginSettings` keeps `context` through plugin edits; answer, map and approve are refused over MCP and for a bound caller; the approval view lists repos, each skill with its hash, each read as written and filled, each alias with its command and env names, and each content set.
  - Uses PK10's mapping store (`mcp` in `plugins.json`).

### Phase 2: The session

- [x] `ec-2.1` Gathering a session's context, after `ec-1.2`, `ec-1.4` [EC5] (§D6)
  - Tests: sources whose `repos` match the task's repository are merged without repeats, and others give nothing; a repository with no GitHub remote matches only by its ID; one alias from two sources is dropped from both with one Needs you item naming them; a read that is, holds or is inside a `sandboxSecretPaths` entry, Avoozl's config or state folder, or home itself is left out with its reason; a missing read is left out and named; only the `worker` role gets context.
  - `sessionContext` in `src/app/workers/epic-context.ts`.
- [x] `ec-2.2` Reads, skills and the brief in a process session, after `ec-1.1`, `ec-2.1` [EC6, EC1.6, EC10.3] (§D6)
  - Tests with a fake harness: a passing session's reads join `readable` and none is writable; skills are copied to the session context folder only when each file's hash matches the approval, and a changed file gives no skill; the brief's "Epic context" section lists each skill's name, description and path and each read's `about` and path; the folder is removed when the child exits; a resume runs the gate again and drops context when a test fails, naming it in Activity; a failing or sourceless session's argv, sandbox input, brief and environment are byte for byte the same.
  - `processContext` in `src/app/workers/epic-context.ts`, called from `src/app/executors/process.ts`.
- [x] `ec-2.3` The MCP relay and the harness `context` key, after `ec-2.2` [EC7] (§D6)
  - Tests with a fake MCP server: a harness `context.mcp` argv with `{context_mcp}` loads and passes the same argv refusals as `start`; a harness without it gets no MCP and the record says so; the written MCP config names only the relay and holds no environment value; the broker's socket is `0600` in a `0700` folder and refuses a wrong token and an alias the session was not given; the real server starts outside the sandbox with only the basics and its mapped `env` names, in a scratch folder; the worker child's environment holds no mapped name; each tool call's alias, tool, time, bytes and error reach Activity, and no argument or reply does; a server that listens is stopped and its plugin marked broken; servers stop when the session ends.
  - `src/app/executors/context-relay.ts`, `src/app/executors/context-broker.ts` and `context-broker-main.ts`, started from `src/app/executors/supervisor.ts`; the `context` key in `src/app/executors/harness-definitions.ts` and `examples/harnesses/claude-code.json`.
- [x] `ec-2.5` Kiro Crew chat workers, after `ec-1.1`, `ec-2.1` [EC8] (§D7)
  - Tests with a fake `kirocrew` executor: a passing chat worker's brief names its skills and reads and no MCP server, and its record reads "brief only"; a failing chat worker's brief has no epic context section and is byte for byte the same.
- [x] `ec-2.6` A comment that does not count never reaches a context session, after `ec-2.2` [EC1.7] (§D2)
  - Tests with the fake GitHub: a message to a context session that names an author (`from`) who does not count under `allowedActors` and `minimumPermission` is not sent; the session stops; the follow-up starts a new session whose request says `epicContext: false` and gets no context; a counted author's message is sent.
- [x] `ec-2.7` The chip, Activity, Settings > Epic context and the reads, after `ec-2.2`, `ec-2.5` [EC9] (§D9)
  - Tests: the task's record holds sources, given items and tests; the task row and drawer show **Epic context**, or **Epic context (brief only)** on a chat; one Activity row per start or resume whose repository a source names lists the two tests with their reasons and the given items by name, and no path's contents, MCP argument or environment value; a repository no source names writes no row; a giving source's `contentSets` apply at `diff`, `github` and `brief`; Settings > Epic context shows the machine context form (empty state, each field checked before Save, a refusal shown under its field, a missing folder refused), each plugin part read-only with its state and the last ten context sessions; `avoozl show TASK --json` and the MCP task read return `epicContext`.

### Phase 3: Proof and docs

- [x] `ec-p1` Proof: context reaches the owner's own spec task and nothing else, after `ec-2.3`, `ec-2.6`, `ec-2.7` [EC1, EC7, EC9, EC11.2] (§D2, §D6, §D8) (**MANUAL**)
  - Expected: (1) the approval view lists both skills, the read, and the `research` alias with its command and env name; (2) the spec task's session reads the note file, quotes the marker skill's phrase and calls `research` once; Activity shows the passed tests and the given items, and the task row shows **Epic context**; (3) the fake server's environment holds the marker variable and the worker's does not; (4) the intake task and the repository that names `epicContext` or declares the plugin in `.avoozl.json` each get none, and Activity names the failing test or the refusal; (5) a message from a login without write access to the context task's session starts a new session without context; (6) a diff with an `acme-terms` term is blocked; (7) editing `servers.json` turns the plugin `changed` and the next session gets nothing; (8) a listing of TCP listeners shows no new listener of the sessions.
  - Expected result observed; receipt at `docs/evidence/ec-p1.md`, with no image committed.
  - Setup: an isolated Avoozl home and workspace; scratch repositories `acme/widgets` and `acme/tools` with bare remotes and a fake GitHub; the example `team-context` plugin with two skills (one with a marker phrase), a read `{ask:notesRoot}/widgets` holding one note file, and a fake stdio MCP server `research` whose one tool echoes a marker and records its environment names; an `acme-terms` content set; a harness with the `context` key.
  - Action: (1) add, answer, map and approve the plugin; (2) approve a one-task spec on `acme/widgets`; let its task run with a brief that asks it to read the note, use the marker skill and call `research`; (3) make an intake task and a commit to `acme/tools` that adds `epicContext` to `.avoozl.json` and declares the plugin there, and let each run; (4) queue a message to the context task's session from a login without write access; (5) ask the context task for a change that writes an `acme-terms` term; (6) edit `servers.json`; (7) list the listeners after the sessions.
  - Failure means: the gate or a source lets context reach work that is not the owner's own, or the relay leaks the server's sign-in.
  - Next decision: none.
- [x] `ec-3.1` Docs, the example plugin and the plugin skill, after `ec-p1` [EC8.2, EC11.3, EC11.4] (§D3, §D4, §D7, §D8)
  - `docs/plugins.md` has a Context part section with the `team-context` manifest, a `servers.json`, the asks and the mapping; `docs/epic-context.md` describes the two tests, the machine block, what a session gets, the relay, the Kiro Crew limits and D8's threats; `docs/person-only.md` lists the person-only context operations; `examples/plugins/team-context/` loads and matches the docs; the shipped `avoozl-plugin` skill knows the part.
