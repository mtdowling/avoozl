# Epic context

Epic context is extra material one worker session gets: skills, read-only
folders and MCP servers. A session gets it only when it does your own approved
spec work. Both places that supply it live on your machine: an `epicContext`
block in `config.json`, and the `context` part of a plugin you declared and
approved here.

```json
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

Nothing in a spec, an issue, a pull request, a comment or a repository file
turns it on. A repository's `.avoozl.json` refuses an `epicContext` key, and a
`context` part declared there is ignored.

## The three tests

A session gets context only when all three pass, at each start and each
resume:

| Test | Passes when |
| --- | --- |
| `approved` | The task is in the approved revision of a spec, and that revision is on the specs branch. An `intake-` task and a fix fail. |
| `approver` | The commit that approved that revision is by an allowed approver. |
| `you-drive` | This workspace drives the spec: its spec issue's one assignee is you, or it has no spec issue ("Not shared"). |

The tests read only Avoozl's records and git. A test that cannot be read
counts as failed. When one fails, the session runs exactly as it would with no
context at all, and Activity names the test and why.

## What a session gets

- **Reads.** Each folder is added read-only. A folder that is, holds or sits
  inside a path the sandbox denies, Avoozl's config or state folder, or your
  home folder itself is left out with its reason. A missing folder is left out
  and named.
- **Skills.** Each approved skill folder is copied to a folder outside the task
  folder, after each file's hash is checked against the approval, and removed
  when the session ends. The brief lists each skill's name, description and
  path, and each folder's purpose and path.
- **MCP servers.** The worker calls a server through a relay. The real server
  runs outside the sandbox with only its mapped environment names, so the worker
  never holds its sign-in. See [the relay](#the-mcp-relay).
- **Rule sets.** The `contentSets` a giving source names also check that task's
  diff, GitHub writes and briefs. A set this machine does not have blocks.

Only the `worker` role gets context. Two sources that give one MCP alias drop
it from both, and a Needs you row names them.

## The MCP relay

A harness definition adds a `context` key with the argument list that loads
one MCP config file:

```json
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

A harness without it gets no MCP servers, and the session's record says so.
Avoozl writes the config file with one stdio server per alias, each running
`context-relay.mjs`. The relay connects to a Unix socket in a private folder
that the session's own broker process listens on outside every sandbox; the
tick that starts the session starts the broker, and it ends with the
session's run. The broker checks the session's token and alias, starts the real server on the first connection with
the basic check environment plus the names you mapped, in a scratch folder, and
passes lines both ways. Each call's alias, tool, time, size and error go to
Activity as one row, never the arguments or the reply. A server that opens a
network listener is stopped and its plugin marked broken. Servers stop when
the session ends.

The relay is not available on Windows, which has no sandbox for it.

## Kiro Crew chats

A chat that passes the tests gets the skills and reads named in its brief, and
no MCP server. Its row says **Epic context (brief only)**. A chat runs as you,
outside Avoozl's sandbox, so the tests decide only what Avoozl tells the chat,
not what it can reach: it can already read your files and use your network.
Avoozl cannot add an MCP server to one chat or hold it to the folders listed.

## Text from a login that does not count

A message queued for a session can name its author with `from`. When that
login does not count under the repository's `allowedActors` and
`minimumPermission`, and the session holds context, the message is not sent.
The session stops where it is, its work is committed as for any stop, and a
new session starts with the text and no context.

## Threats and what stops them

| Threat | What stops it |
| --- | --- |
| A repository file turns context on | `epicContext` is read only from `config.json`; a repository-declared part is ignored; lint refuses `$context` facts. |
| A spec, issue or comment asks for context | The tests read no prose. |
| An outsider's text reaches a context session | Intake tasks fail `approved`; text from a login that does not count is never sent. |
| A coworker's spec runs with your context | `you-drive` needs you as the one assignee, or no spec issue. |
| A coworker edits an approved spec | A new revision needs a new approval commit; the old one no longer matches. |
| A plugin widens access in an update | A new content hash, answer or mapping needs approval again. |
| A plugin reads a secret folder | Reads inside denied paths, Avoozl's folders or home are left out. |
| A plugin carries a credential | `servers.json` holds no `env`; credential-like keys and values are refused. |
| A server hands the worker its sign-in | The server runs outside the sandbox; the worker gets only its replies. |
| A server listens on the network | It is stopped and its plugin marked broken. |
| Context leaks through a commit or GitHub write | Content rules at `diff` and `github`, plus the source's `contentSets`. |
| Context leaks through an MCP call | Not stopped: you chose and mapped each server. Avoozl records each call's size. |
| A Kiro Crew chat ignores the list | Not stoppable; see above. |

What stays reachable to a context worker: everything a normal session reaches,
the listed reads and skills read-only, and the listed servers' tools. A worker
fooled by text on your own task can copy what it reads into its diff; the diff
reaches GitHub only through content rules and the repository's landing rules.

## Setting it up

```text
avoozl context set --json '{"repos": ["acme/*"], "reads": ["~/notes"]}'
avoozl context show
avoozl plugins answer team-context notesRoot ~/src/acme/team-notes
avoozl plugins map team-context research --env RESEARCH_TOKEN
avoozl plugins approve team-context --hash HASH
```

Setting the block, answering a plugin's questions, mapping a server and
approving are a person's acts. Settings › Epic context shows the block, each
plugin's part with its state, and the last ten sessions that got context with
their tests. See [the Context part](plugins.md#context-part) for the manifest.
The proof run is `docs/evidence/ec-p1.md`.
