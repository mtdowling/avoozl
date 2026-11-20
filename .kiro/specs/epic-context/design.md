# Design: epic context for the owner's own work

`EC` numbers are in this spec's `requirements.md`; `R` numbers are in
`.kiro/specs/avoozl/requirements.md`, `VM` numbers in
`.kiro/specs/vm-harness/`, `PK` numbers in `.kiro/specs/plugin-checks/`,
`PC` numbers in `.kiro/specs/plugin-credentials/` and `TA` numbers in
`.kiro/specs/triage-agent/`. Requirement 115 is on branch
`spec/spec-assignee-2`. Labels are as in the requirements: **V** read in
the file cited at `a8a22391`; **A** assumed.

## D1. Shape

```text
 this machine only                                 the task's session
 -----------------                                 ------------------
 config.json  epicContext {repos, reads, mcp,      process child in its sandbox
              network, contentSets}                  + reads, read-only
 plugins.json team-context (approved, machine)       + skills copy, read-only
              answers, MCP mappings                  + brief: "Epic context"
        |                                            + MCP config -> relay
        v                                            + proxy allowlist + hosts
 epicContextGate(task, session)                            |
   approved  approver  you drive  no stranger              | relay socket
        |  all four pass                                   v
        v                                          supervisor (outside sandbox)
 sessionContext(sources, repository) ---------->     real MCP server, env names
        |                                            from this machine's mapping
        `-> Activity: each test, what was given
```

One function decides (`epicContextGate`), one function gathers
(`sessionContext`), and the existing start path adds the result. A session
that fails the gate goes through today's path with nothing added (EC11.3).

## D2. The four tests (EC1)

`epicContextGate(store, {task, session, workspace})` in a new
`src/app/workers/epic-context.mjs` returns:

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
      "passed": true
    },
    {
      "name": "you-drive",
      "passed": false,
      "why": "Taken by octo-dev"
    },
    {
      "name": "no-stranger-input",
      "passed": true
    }
  ]
}
```

| Test | Reads | Passes when |
| --- | --- | --- |
| `approved` | the task's plan row and its approved revision hash; the task ID | the plan's approved revision is on the specs branch (`approvalBase`, V: `git-approvals.mjs:106`), the task ID is in that revision's `tasks.md`, and the ID does not start with `intake-` (V: `intakeTaskId`, `intake.mjs:50`) |
| `approver` | `approvalCommits(root, {allowed: approverCheck(...), specs: [spec]})` (V: `git-approvals.mjs:301`) | the newest approval commit whose hash equals the approved revision's hash has an allowed author |
| `you-drive` | the driver state the Specs list shows from the workspace cache (Requirement 115.11) | "You drive" or "Not shared"; any other state fails, and so does no state |
| `no-stranger-input` | `task.strangerInput` and the session's own field (VM6.2, task vm-3.1) | neither is set, and the field exists |

The tests never read a spec's prose, an issue body, a comment or a
repository file. They run in `processExecutor.start` and in the resume path
before the child is requested, and in the `kirocrew` start before the brief
is written. Every test is computed even after one fails, so Activity names
them all.

Approval commits are read once per spec and approved hash and cached in
memory with the hash as key, so a resume costs no git log. The driver state
adds no GitHub call (Requirement 115.9).

### Stranger text after the start (EC1.7)

Today a follow-up on a task (a review comment, a pull request comment) is
sent to the task's open session. The send path asks the stranger rule of
VM6.1 for the text's authors. WHEN any is a stranger and the session holds
epic context THEN the send is refused, the task gets `strangerInput`, the
session is stopped at its next safe point (the process ends; its work is
committed as for any stop), and the follow-up starts a new session, which
now fails `no-stranger-input`.

## D3. The machine block (EC2)

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
    "network": [
      "docs.acme.example:443"
    ],
    "contentSets": [
      "acme-terms"
    ]
  }
}
```

The host config validator (V: `src/app/settings/host-config.mjs`) gains the
block and `host-config.schema.json` its schema. The repository config
loader refuses the key in `.avoozl.json` and in layered workspace config,
naming the file, beside the other machine-only keys (A: the loader in
`src/app/settings/repository-settings.mjs` lists known keys; the task finds
the exact place). One operation, `context.machine.set`, is `person(...)` in
its feature table and refused in its handler for a bound or MCP caller and
for a child marked `AVOOZL_CHILD`, as `triage.setup` is (TA13.3). The CLI
entry is `avoozl context set --json '{...}'` and `avoozl context show`.

## D4. The context part (EC3)

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
    "network": [
      "docs.acme.example:443"
    ],
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

`validateManifest` (V: `plugins.mjs:313`) gains `checkContext`, beside
`checkPolicy`. `context` joins the data parts, so a plugin that provides
only `context` has no `entry`. A `command` path inside the plugin is
resolved against the plugin folder and must stay inside it; a program name
is looked up on `PATH` when the server starts. The skills folder is read
at validation: each `SKILL.md` is at most 64 KB, and its front matter must
hold `name` (the folder name) and `description` (1 to 300 characters).

`contextSources(options)` in `plugins.mjs` returns the machine block and
every plugin that is `approved`, `source: machine`, provides `context`, has
every ask answered and every alias mapped. It filters exactly as
`triageBlock` does (V: `plugins.mjs:428`), so a plugin that `.avoozl.json`
declares is skipped. Settings marks such a part "context ignored: declared
in .avoozl.json".

The parts list grows by one. Plugin-checks and plugin-credentials each add
a part too; whichever lands first sets the order, and the docs list them
all.

## D5. Approval, asks and mappings (EC4)

```json [~/.config/avoozl/plugins.json, the new keys]
{
  "context": {
    "team-context": {
      "answers": {
        "notesRoot": "~/src/acme/team-notes"
      },
      "servers": {
        "research": {
          "env": [
            "RESEARCH_TOKEN"
          ]
        }
      }
    }
  }
}
```

`readPluginSettings` (V: `plugins.mjs:93`) keeps `context` through plugin
edits, as it keeps `intake`. The approval stores
`sha256(contentHash, canonical(answers), canonical(servers))` (A: the
approval record has room for one more hash, as PK10.3 also needs). A
plugin whose answers or mappings no longer match the stored hash reads as
`changed`, and its context part gives nothing until approved again.

If plugin-checks' PK10 mapping lands first, this reuses its `servers`
mapping shape and hash, keyed by plugin and alias; there is one mapping
store, not two. `checkConfig` refuses credential-like keys and values in
both.

The approval view lists, for the part: `repos`; each skill as name,
description and the SHA-256 of its `SKILL.md`; each read as `about`, the
path as written and as filled here; each alias as `about`, `command` (the
plugin's, or this machine's replacement, marked) and the `env` names; each
host; each content set. Operations: `plugins.answer`, `plugins.map`
(shared with PK10 when it exists) and the existing approve, all person-only.

## D6. A process session (EC5, EC6, EC7)

`sessionContext(sources, repository, harness)` returns
`{sources, reads, skills, mcp, hosts, left: [{item, why}]}`. It merges the
sources whose `repos` match the task's repository (its GitHub `owner/name`,
or its ID for a repository with no GitHub remote), drops an alias two
sources give and raises one Needs you item for it, refuses reads as EC5.3
says (reusing VM2.5's check against `sandboxSecretPaths`, plus the config
and state folders and home itself), and records each item it leaves out.

`processExecutor.start` (V: `process.mjs:78`) then adds:

| Item | Sandboxed session | Contained session (VM2) |
| --- | --- | --- |
| Reads | appended to `readable` | appended to `readable` and mounted read-only in the box at the host path |
| Skills | copied to `{tmp-root}/avoozl-context-{session}/skills/` after a hash check, folder added to `readable` | the same, and mounted read-only |
| Brief | an "Epic context" section: skills (name, description, path), reads (`about`, path) | the same |
| MCP | `context.mcp` argv with `{context_mcp}`; one relay per alias | none (question 1) |
| Hosts | added to the egress proxy allowlist (D7) | the same; web fetch stays on |

The session context folder is outside the task folder and outside the
session's own temp folder, so the worker cannot change a skill it reads.
The supervisor removes it when the child exits.

### The MCP relay

```json [{context_mcp}, written by Avoozl]
{
  "mcpServers": {
    "research": {
      "command": "/path/to/node",
      "args": [
        "/path/to/avoozl/bin/context-relay.mjs",
        "--session",
        "process-…",
        "--alias",
        "research"
      ]
    }
  }
}
```

```json [~/.config/avoozl/harnesses/claude-code.json, the new key]
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

The relay is a small Node program. It connects to
`{socket-root}/ctx/{session}/mcp.sock` (the short socket folder of
machine-server ms-3.1, `0700`), sends the alias, then pipes its standard
streams both ways. The supervisor's broker, outside every sandbox, checks
that the alias is one this session was given, starts the real server on
the first connection with the check environment basics plus the mapped
`env` names, in a scratch folder, and pipes JSON-RPC lines. It reads only
the method and tool name of each request for the evidence record (time,
alias, tool, bytes, error). It stops the server when the session ends and
runs the listener check after each start and every minute (PK7.5).

Why a relay, not the server in the sandbox: a server started by the CLI
would run in the CLI's sandbox, so its sign-in (its environment, its token
file) would sit where the worker's own tools can read it, and its network
would be the worker's. Outside, the worker reaches only the server's tools.

The harness `context` key passes the same argv checks as `start` (V:
`argv`, `harness-definitions.mjs:124`, and the `SKIP_VALUES` refusal), and
`{context_mcp}` joins the placeholders only the supervisor fills.

### Contained sessions (question 1)

Claude Code's `CLAUDE_CODE_SHELL_PREFIX` also wraps stdio MCP server starts
(VM D2), so in a contained session the relay would start inside the box,
which has no socket and no network (VM2.4, VM2.6). This spec gives a
contained session no MCP servers and records why.

## D7. Hosts through the egress proxy (EC8)

The egress proxy of VM3.6 (task vm-2.4) takes its allowlist from the
harness's `box.hosts`. An epic-context session's proxy takes `box.hosts`
plus the context hosts, each tagged with where it came from, and its log
writes the tag (EC8.4). The proxy needs vm-2.4; until it lands, or on a
platform where it cannot run (A: Windows), hosts are not given and the
session record says "hosts not given: no egress proxy".

In a contained session the box keeps `--network none`; only the CLI's own
tools go through the proxy. VM3.7 turns web fetch off for contained
sessions because their text may be a stranger's. An epic-context session
has no stranger input (EC1), so its harness argv drops the web fetch
refusal when it has hosts, and the proxy is still its only way out.

## D8. Kiro Crew chat workers (EC9)

| Item | Given to a chat | Enforced |
| --- | --- | --- |
| Skills | named in the brief, with paths | no: the chat reads what it likes |
| Reads | named in the brief | no: the chat runs as the person |
| MCP servers | not given | n/a (A: no per-chat MCP setting) |
| Hosts | not given | no: the chat has the person's network |

The gate still runs, so a stranger's issue or a coworker's spec gets a
brief with no context section. That limits what Avoozl points the chat at,
not what it can reach. The chip says "Epic context (brief only)". The docs
repeat VM8.2's line: a chat is a speed bump, not a sandbox.

## D9. Security review (EC11)

| Threat | What stops it | Test |
| --- | --- | --- |
| A repository file turns context on (`.avoozl.json` `epicContext`, a repository-declared `context` plugin, a `$context` fact) | `epicContext` is read only from `config.json`; a repo-declared part is skipped; lint refuses unknown facts | EC2.2, EC3.3, EC1.5 |
| A spec's text, an issue or a pull request asks for context | The gate reads no prose (EC1.4) | a spec whose text asks for it gets none |
| A stranger's issue or pull request reaches a context session | `approved` fails for intake and fix tasks; `no-stranger-input` fails on VM6.1's marker; stranger text is never sent to a context session (EC1.7) | each alone |
| A stranger reviews a context task's pull request | the send is refused and a new session starts without context | EC1.7 |
| A coworker's spec runs with my context | `you-drive` needs this person as the one assignee, or no spec issue; taking a spec over is my own act (Requirement 115.2) | a spec assigned to another login gets none |
| A coworker edits an approved spec | a new revision needs a new approval commit by an approver; the old approval no longer matches the hash | `approver` fails on an edit after approval |
| A non-approver's commit on main | `approverCheck` refuses its author | `approver` fails |
| A plugin widens access in an update | a new content hash, answer or mapping needs approval again (EC4.4) | a changed plugin gives nothing |
| A plugin reads a secret folder | reads inside `sandboxSecretPaths`, Avoozl's folders or home itself are refused (EC5.3) | each path refused |
| A plugin carries a credential | servers.json holds no `env`; `checkConfig` refuses credential-like keys and values; sign-ins come from this machine's mapping | each refused |
| An MCP server hands the worker its sign-in | the server runs outside the sandbox; the worker gets only its replies | the child's environment holds no mapped name |
| An MCP server listens on the network | listener check stops it and marks the plugin broken | PK7.5's test, on a relay server |
| The worker reaches hosts beyond the list | the egress proxy refuses others | proxy test |
| Context leaks out in a commit or a GitHub write | content rules at `diff` and `github`, plus the source's `contentSets`, and the `pre-push` hook (Requirement 40, `docs/content-rules.md`) | a diff with a set's term is blocked |
| Context leaks out through an MCP call | the worker can send any text it read to a mapped server. The person chose the server; the evidence records each call's size | none: accepted (question 5) |
| A context session's diff smuggles a hook or `.git` change | VM5.2's helper for every git call after a process session | VM's tests |
| A Kiro Crew chat ignores the list | not stoppable; documented (EC9.2) | docs |

What stays reachable to an epic-context worker: everything a normal
session reaches, the listed reads and skills read-only, the listed MCP
servers' tools, and the listed hosts. A prompt-injected worker on the
person's own approved task can move what it reads into its diff; the diff
reaches GitHub only through content rules and the landing rules of its
repository.

## D10. Visible (EC10)

- The task row and drawer read `binding.epicContext = {sources, given,
  tests}`, set when the session starts. The chip is **Epic context**, or
  **Epic context (brief only)** on a chat. A UI change, so its task brings
  phone and desktop, light and dark screenshots.
- Activity writes one `epic-context` row per start or resume whose
  repository some source names: the four tests with passed or failed and
  the reason, then the given items by name. A repository no source names
  writes nothing, so other work adds no rows.
- Settings › Epic context lists the machine block (with **Edit**), each
  machine plugin's part and its state (approved, needs answers, needs
  mapping, changed, ignored), and the last ten sessions with context.
- `avoozl show TASK --json` and the MCP task read return
  `epicContext` from the binding.

## D11. What does not change

- A session with no context source for its repository, or one that fails
  the gate: its argv, sandbox, brief and environment are byte for byte as
  today (EC11.3).
- Stranger-input sessions: VM6 and VM8 as written.
- Checks: context is for the session only; checks run as today.
- GitHub credentials: workers still get none (PC6.6).

## D12. Decisions

Each question was decided as recommended (owner, 2026-11-19); the task that
depends on it says so.

1. **MCP in a contained session.** The shell prefix starts MCP servers in
   the box. *Decided:* none in v1, recorded per session (EC7.7). Revisit if
   the harness gains an MCP transport over a Unix socket, which would let
   the relay stay on the host without a listener.
2. **Skills: listed in the brief, or loaded by the harness.** *Decided:*
   list them in the brief (EC6.3). It works on every harness and on chats.
   A harness-native skills folder can be a later `context.skills` argv key
   once a live proof shows it loads only the copied folder (A).
3. **Which roles get context.** *Decided:* `worker` only. The verifier and
   reviewer judge the diff against the spec without it, so a claim that
   only the context supports gets a second look. Add the falsifier later if
   investigations need it.
4. **Any allowed approver, or only this person.** The owner's rule is an
   allowed approver. A coworker who is an approver could approve a spec I
   then take over. *Decided:* keep "allowed approver", since taking a spec
   over is already my act and shows the spec first; add a machine setting
   `epicContext.ownApprovalsOnly` only if asked.
5. **Context sent out through MCP calls.** Content rules cannot read MCP
   arguments without breaking the "no arguments stored" rule. *Decided:*
   accept: the person chose and mapped each server. Record only sizes
   (EC7.5).
6. **`repos` matching for a repository with no GitHub remote.** *Decided:*
   match the registered repository ID, never a path.
7. **A machine block with skills.** *Decided:* no. Skills come only from a
   plugin, so each is hashed and approved; the machine block names only
   what the person wrote themselves.

## D13. Risks

- The egress proxy and the stranger marker are not built (tasks vm-2.4 and
  vm-3.1). Hosts wait for the proxy; the gate cannot pass without the
  marker field, so no session gets context before vm-3.1 lands (EC1.3).
- Requirement 115 is not approved. If its driver words change, `you-drive`
  follows them; a task here says so.
- Claude Code's `--mcp-config` with `--strict-mcp-config` loading exactly
  one file is read in its docs, not run here (A). ec-p1 checks it.
- A skill copied at start is the approved one; a skill the worker writes to
  its own task folder is not context and reaches nothing.
- A read folder that holds a git checkout can hold hooks; it is read-only,
  and nothing Avoozl runs uses it as a work tree.
