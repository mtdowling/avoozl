# Person-only operations

Person-only operations, such as approving a plan, changing plugins or reading
content-rule terms, are refused for MCP calls and for app tokens. They do not
stop code that runs as your user, so Avoozl adds a delegation grant and a
sandbox around unattended sessions.

```sh
avoozl approval delegate claude
avoozl plan approve NAME --delegate claude
```

## Code running as you

Code that runs as your user can read the gateway's signing secret from another
process, or call the CLI. The command line is a person's tool, so the CLI runs a
person-only operation wherever it is typed, inside a Kiro Crew agent session
too. There it prints that it ran in an agent session, and an approval made
without a delegate records that in its receipt.

The CLI tells a session by `KIROCREW_SPAWNED=1` (set on every process Kiro Crew
starts for an agent) or `KIRO_SESSION_ID` (set in an agent's shell). The one
place the CLI refuses is a process the supervisor started (`AVOOZL_CHILD`),
where nobody is typing.

For a Kiro Crew chat this is a speed bump. The chat runs as you, with your
files, your `gh` login and your network, so nothing stops a determined agent
from writing the database or calling `gh` itself.

## Approval delegation

Approval delegation lets an agent approve in its own name. A person runs
`approval delegate NAME`. Then `plan approve ... --delegate NAME` and
`plan.approve` with `delegate` work from an agent session and over MCP,
approving as that person, and each receipt records the delegate and the grant.
With no active grant the delegate is refused. Over MCP, granting and revoking
are person-only.

## Unattended sessions

An unattended `process` child, one the supervisor starts, gets `AVOOZL_CHILD`,
and the same refusal applies. What keeps a child from a person-only act is the
sandbox the supervisor wraps it in:

- It can neither read nor write the workspace databases (each catalog
  workspace's `.avoozl` folder), Avoozl's machine config and state folders, the
  Kiro Crew home (`KIROCREW_HOME`, or `~/.kiro/crew`), the `gh` config,
  `~/.git-credentials`, `~/.config/git/credentials`, `~/.netrc`, `~/.ssh`,
  `~/.aws` and, on macOS, the keychain.
- Under your home folder it reads only its task folder, its temp and cache
  folders, the repository's git directory, the harness's own config (the
  definition's `reads`, such as `~/.claude` and `~/.claude.json` for Claude
  Code), `~/.gitconfig`, `~/.config/git` and the repository's
  `isolation.readable` paths. Your other repositories and documents are not
  readable, and system and toolchain folders outside home stay readable.
- It writes only to its task folder, its own temp folder and the repository's
  cache folders. Read-only roles write nowhere.
- Its network is off. On macOS a repository can name loopback ports instead
  (`localhost:PORT`, for a proxy): `sandbox.network` for roles that may use
  the network, and `sandbox.modelProxy` for the proxy the agent reaches its
  model through. Every role gets `modelProxy`, even one that reads only its
  folder, such as the triage agent; only `network` is withheld from those.
- Token, key, secret and password variables, `GH_*`, `GITHUB_*`, `AWS_*`,
  `KIROCREW_*` and `SSH_AUTH_SOCK` are removed from its environment, and git
  gets no credential helper.

macOS uses `sandbox-exec` and Linux uses bubblewrap (`bwrap`). A machine with
neither, such as Windows, runs a harness only after you allow that harness on
that machine, with the same opt-in that lets it write outside the task folder.

A harness whose own sandbox cannot run inside Avoozl's (Codex on macOS, where a
nested `sandbox-exec` fails) may set `permission.write` to exactly
`danger-full-access`. Avoozl then starts it only inside its own sandbox, with
write roots, and refuses it everywhere else, including on a machine that opted
in. Every other bypass value stays refused.

## File modes

The `.avoozl` folder is created `0700` and the database `0600`. Backups and
`export --output` files are `0600`. On open, Avoozl tightens an existing
workspace's folders and database, so a person who shared the folder with a group
loses that access.

On Windows, Node cannot set these modes, so the files keep the access of the
folder they are in, which in a user profile is you, the system and
administrators. Move the workspace out of a shared folder if that matters.

## See also

- [Agents and the CLI](agents.md#person-only-actions) for the actions MCP
  refuses
- [Repository checks and isolation](checks.md) for the sandbox around checks
