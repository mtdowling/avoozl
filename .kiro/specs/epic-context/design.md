# Design: epic context for the owner's own work

`EC` numbers are in this spec's `requirements.md`; `R` numbers are in
`.kiro/specs/avoozl/requirements.md`, `PK` numbers in
`.kiro/specs/plugin-checks/`,
and `PC` numbers in `.kiro/specs/plugin-credentials/`.

## D1. Shape

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

## D2. The two tests (EC1)

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

### Comments after the start (EC1.7)

A message queued for a task's open session may name its author in `from:
{login}`. The send path in `src/app/executors/process.ts` reads that
author's standing with `authorCounts`, under the repository's
`allowedActors` and `minimumPermission`, as the review gate does. WHEN an
author does not count and the session holds epic context THEN the message is
not sent, the session is stopped, and the follow-up starts as a new session
whose request says `epicContext: false`, so it gets no epic context whatever
the two tests say. Activity records an `epic-context.comment` row.

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

## D5. Approval, asks and mappings (EC4)

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

## D6. A process session (EC5, EC6, EC7)

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

### MCP relay

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

## D7. Kiro Crew chat workers (EC8)

| Item | Given to a chat | Enforced |
| --- | --- | --- |
| Skills | named in the brief, with the approved plugin paths | no: the chat reads what it likes |
| Reads | named in the brief | no: the chat runs as the person |
| MCP servers | not given | n/a: no per-chat MCP setting |

`chatBrief` runs the same gate before the start request is stored, so an
intake task gets a brief with no context section. That limits what Avoozl
points the chat at, not what it can reach. The chip says "Epic context
(brief only)".

## D8. Security review (EC10)

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

## D9. Visible (EC9)

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

## D10. Sessions without context

- A session with no context source for its repository, or one that fails
  the gate: its argv, sandbox, brief and environment are byte for byte those
  of a session with no source (EC10.3).
- Checks: context is for the session only.
- GitHub credentials: workers get none (PC6).

## D11. Design choices

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

## D12. Risks

- A skill copied at start is the approved one; a skill the worker writes to
  its own task folder is not context and reaches nothing.
- A read folder that holds a git checkout can hold hooks; it is read-only,
  and nothing Avoozl runs uses it as a work tree.
