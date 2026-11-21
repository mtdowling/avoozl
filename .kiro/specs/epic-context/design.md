# Design: epic context for the owner's own work

`EC` numbers are in this spec's `requirements.md`; `R` numbers are in
`.kiro/specs/avoozl/requirements.md`, `PK` numbers in
`.kiro/specs/plugin-checks/`,
and `PC` numbers in `.kiro/specs/plugin-credentials/`. Labels are as in
the requirements: **V** read in the file cited at `a8a22391`; **A**
assumed.

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
 epicContextGate(task, session)                            |
   approved  approver  you drive                           | relay socket
        |  all three pass                                  v
        v                                          supervisor (outside sandbox)
 sessionContext(sources, repository) ---------->     real MCP server, env names
        |                                            from this machine's mapping
        `-> Activity: each test, what was given
```

One function decides (`epicContextGate`), one function gathers
(`sessionContext`), and the existing start path adds the result. A session
that fails the gate goes through today's path with nothing added (EC10.3).

## D2. The three tests (EC1)

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
    }
  ]
}
```

| Test | Reads | Passes when |
| --- | --- | --- |
| `approved` | the task's plan row and its approved revision hash; the task ID | the plan's approved revision is on the specs branch (`approvalBase`, V: `git-approvals.mjs:106`), the task ID is in that revision's `tasks.md`, and the ID does not start with `intake-` (V: `intakeTaskId`, `intake.mjs:50`) |
| `approver` | `approvalCommits(root, {allowed: approverCheck(...), specs: [spec]})` (V: `git-approvals.mjs:301`) | the newest approval commit whose hash equals the approved revision's hash has an allowed author |
| `you-drive` | the driver state the Specs list shows from the workspace cache (`driverStatus`, V: `src/app/workers/driver.mjs`) | the state is `driver`, with reason `driver` ("This workspace drives it") or `not-shared`; any other state fails, and so does no state |

The tests never read a spec's prose, an issue body, a comment or a
repository file. They run in `processExecutor.start` and in the resume path
before the child is requested, and in the `kirocrew` start before the brief
is written. Every test is computed even after one fails, so Activity names
them all.

Approval commits are read once per spec and approved hash and cached in
memory with the hash as key, so a resume costs no git log. The driver state
adds no GitHub call.

### Comments after the start (EC1.7)

A message queued for a task's open session may name its author in `from:
{login}`. The send path reads that author's standing under the repository's `allowedActors` and `minimumPermission`,
as the review gate does. WHEN an author does not count and the session
holds epic context THEN the send is refused, the session is stopped at its
next safe point (the process ends; its work is committed as for any stop),
and the follow-up starts as a new session, after the stopped one has ended,
whose request says `epicContext: false`, so it gets no epic context whatever
the three tests say.

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

The host config validator (V: `src/app/settings/host-config.mjs`) gains the
block and `host-config.schema.json` its schema. The repository config
loader refuses the key in `.avoozl.json` and in layered workspace config,
naming the file, beside the other machine-only keys (A: the loader in
`src/app/settings/repository-settings.mjs` lists known keys; the task finds
the exact place). One operation, `context.machine.set`, is `person(...)` in
its feature table and refused in its handler for a bound or MCP caller and
for a child marked `AVOOZL_CHILD`, as other person-only operations are. The CLI
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
every ask answered and every alias mapped. A plugin that `.avoozl.json`
declares is skipped. Settings marks such a part "context ignored: declared
in .avoozl.json".

`context` is the last of the parts: pack, rules, intake, template,
credentials, checks, context.

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

This reuses plugin-checks' PK10 mapping: `mcp` in `plugins.json`, keyed by
plugin and alias, and its `mappingHash`; there is one mapping store, not
two. A context mapping's `command` is optional. `checkConfig` refuses
credential-like keys and values in both.

The approval view lists, for the part: `repos`; each skill as name,
description and the SHA-256 of its `SKILL.md`; each read as `about`, the
path as written and as filled here; each alias as `about`, `command` (the
plugin's, or this machine's replacement, marked) and the `env` names; each
content set. Operations: `plugins.answer`, `plugins.map`
(shared with PK10 when it exists) and the existing approve, all person-only.

## D6. A process session (EC5, EC6, EC7)

`sessionContext(sources, repository, harness)` returns
`{sources, reads, skills, mcp, left: [{item, why}]}`. It merges the
sources whose `repos` match the task's repository (its GitHub `owner/name`,
or its ID for a repository with no GitHub remote), drops an alias two
sources give and raises one Needs you item for it, refuses reads as EC5.3
says (checking against `sandboxSecretPaths`, plus the config and state
folders and home itself), and records each item it leaves out.

`processExecutor.start` (V: `process.mjs:78`) then adds:

| Item | A session that passes |
| --- | --- |
| Reads | appended to `readable` |
| Skills | copied to `{tmp-root}/avoozl-context-{session}/skills/` after a hash check, folder added to `readable` |
| Brief | an "Epic context" section: skills (name, description, path), reads (`about`, path) |
| MCP | `context.mcp` argv with `{context_mcp}`; one relay per alias |

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
        "/path/to/avoozl/src/app/executors/context-relay.mjs",
        "--socket",
        "/tmp/avz-…/mcp.sock",
        "--token",
        "…",
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
`mcp.sock` in a `0700` folder of its own under the temp folder, one per
session, sends the session's token and the alias, then pipes its standard
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

## D7. Kiro Crew chat workers (EC8)

| Item | Given to a chat | Enforced |
| --- | --- | --- |
| Skills | named in the brief, with paths | no: the chat reads what it likes |
| Reads | named in the brief | no: the chat runs as the person |
| MCP servers | not given | n/a (A: no per-chat MCP setting) |
| Hosts | not given | no: the chat has the person's network |

The gate still runs, so an intake task or a coworker's spec gets a brief
with no context section. That limits what Avoozl points the chat at, not
what it can reach. The chip says "Epic context (brief only)". The docs say
it plainly: a chat is a speed bump, not a sandbox.

## D8. Security review (EC10)

| Threat | What stops it | Test |
| --- | --- | --- |
| A repository file turns context on (`.avoozl.json` `epicContext`, a repository-declared `context` plugin, a `$context` fact) | `epicContext` is read only from `config.json`; a repo-declared part is skipped; lint refuses unknown facts | EC2.2, EC3.3, EC1.5 |
| A spec's text, an issue or a pull request asks for context | The gate reads no prose (EC1.4) | a spec whose text asks for it gets none |
| A stranger's issue or pull request reaches a context session | `approved` fails for intake and fix tasks; a comment that does not count is never sent to a context session (EC1.7) | each alone |
| A stranger reviews a context task's pull request | the send is refused and a new session starts without context | EC1.7 |
| A coworker's spec runs with my context | `you-drive` needs this person as the one assignee, or no spec issue; taking a spec over is my own act | a spec assigned to another login gets none |
| A coworker edits an approved spec | a new revision needs a new approval commit by an approver; the old approval no longer matches the hash | `approver` fails on an edit after approval |
| A non-approver's commit on main | `approverCheck` refuses its author | `approver` fails |
| A plugin widens access in an update | a new content hash, answer or mapping needs approval again (EC4.4) | a changed plugin gives nothing |
| A plugin reads a secret folder | reads inside `sandboxSecretPaths`, Avoozl's folders or home itself are refused (EC5.3) | each path refused |
| A plugin carries a credential | servers.json holds no `env`; `checkConfig` refuses credential-like keys and values; sign-ins come from this machine's mapping | each refused |
| An MCP server hands the worker its sign-in | the server runs outside the sandbox; the worker gets only its replies | the child's environment holds no mapped name |
| An MCP server listens on the network | listener check stops it and marks the plugin broken | PK7.5's test, on a relay server |
| Context leaks out in a commit or a GitHub write | content rules at `diff` and `github`, plus the source's `contentSets`, and the `pre-push` hook (Requirement 40, `docs/content-rules.md`) | a diff with a set's term is blocked |
| Context leaks out through an MCP call | the worker can send any text it read to a mapped server. The person chose the server; the evidence records each call's size | none: accepted (question 4) |
| A context session's diff smuggles a hook or `.git` change | `taskGit` (`src/app/git/task-git.mjs`) for every git call on a task folder | its tests |
| A Kiro Crew chat ignores the list | not stoppable; documented (EC8.2) | docs |

What stays reachable to an epic-context worker: everything a normal
session reaches, the listed reads and skills read-only, and the listed MCP
servers' tools. A prompt-injected worker on the
person's own approved task can move what it reads into its diff; the diff
reaches GitHub only through content rules and the landing rules of its
repository.

## D9. Visible (EC9)

- The task row and drawer read `binding.epicContext = {sources, given,
  tests}`, set when the session starts. The chip is **Epic context**, or
  **Epic context (brief only)** on a chat. A UI change, so its task brings
  phone and desktop, light and dark screenshots.
- Activity writes one `epic-context` row per start or resume whose
  repository some source names: the three tests with passed or failed and
  the reason, then the given items by name. A repository no source names
  writes nothing, so other work adds no rows.
- Settings › Epic context opens with **Extra context for your work**: with
  no block it says "None set. Workers get only the task and the repo." and
  offers **Add context**; with one it shows the form in place. The fields are
  Repos (chips), Folders to read (the folder picker, each one checked to
  exist on save), Tools (name, what it does, the command one argument per
  box, and environment variable names) and Content rules (checkboxes of
  this machine's sets). Save sends `context.machine.set`; a refusal that
  names a key shows under that key's field. **View as JSON** shows the
  block read-only. Below it, each machine plugin's part is listed read-only
  with its state (approved, needs answers, needs mapping, changed,
  ignored), then the last ten sessions with context.
- `avoozl show TASK --json` and the MCP task read return
  `epicContext` from the binding.

## D10. What does not change

- A session with no context source for its repository, or one that fails
  the gate: its argv, sandbox, brief and environment are byte for byte as
  today (EC10.3).
- Checks: context is for the session only; checks run as today.
- GitHub credentials: workers still get none (PC6.6).

## D11. Design choices

The task that depends on each choice says so.

1. **Skills: listed in the brief, or loaded by the harness.**
   List them in the brief (EC6.3). It works on every harness and on chats.
   A harness-native skills folder can be a later `context.skills` argv key
   once a live proof shows it loads only the copied folder (A).
2. **Which roles get context.** `worker` only. The verifier and
   reviewer judge the diff against the spec without it, so a claim that
   only the context supports gets a second look. Add the falsifier later if
   investigations need it.
3. **Any allowed approver, or only this person.** The owner's rule is an
   allowed approver. A coworker who is an approver could approve a spec I
   then take over. Keep "allowed approver", since taking a spec
   over is already my act and shows the spec first; add a machine setting
   `epicContext.ownApprovalsOnly` only if asked.
4. **Context sent out through MCP calls.** Content rules cannot read MCP
   arguments without breaking the "no arguments stored" rule.
   Accept: the person chose and mapped each server. Record only sizes
   (EC7.5).
5. **`repos` matching for a repository with no GitHub remote.**
   Match the registered repository ID, never a path.
6. **A machine block with skills.** No. Skills come only from a
   plugin, so each is hashed and approved; the machine block names only
   what the person wrote themselves.

## D12. Risks

- `you-drive` follows the driver states of `driverStatus`; a new state
  fails the test until the gate names it.
- Claude Code's `--mcp-config` with `--strict-mcp-config` loading exactly
  one file is read in its docs, not run here (A). ec-p1 checks it.
- A skill copied at start is the approved one; a skill the worker writes to
  its own task folder is not context and reaches nothing.
- A read folder that holds a git checkout can hold hooks; it is read-only,
  and nothing Avoozl runs uses it as a work tree.
