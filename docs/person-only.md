# Person-only operations

Person-only operations, such as approving a plan, changing plugins or reading
content-rule terms, are refused for MCP calls and for app tokens. They do not
stop code that runs as your user, so Avoozl adds a sandbox around unattended
sessions.

The `--yes` of a high-risk GitHub step is refused inside an agent session:

```sh
avoozl claim delete owner/repo avoozl/parser/p-2 --yes
```

```text
--yes is a person's answer; it is refused inside an agent session. Run it in your own terminal.
```

Approving a spec on GitHub is merging its pull request, which no Avoozl
permission covers.

## Code running as you

Code that runs as your user can read the gateway's signing secret from another
process, or call the CLI. The command line is a person's tool, so the CLI runs a
person-only operation wherever it is typed, inside a Kiro Crew agent session
too. There it prints that it ran in an agent session, and an approval made
there records that in its receipt.

The CLI tells a session by `KIROCREW_SPAWNED=1` (set on every process Kiro Crew
starts for an agent) or `KIRO_SESSION_ID` (set in an agent's shell). The one
place the CLI refuses is a `process` child a tick started (`AVOOZL_CHILD`),
where nobody is typing.

For a Kiro Crew chat this is a speed bump. The chat runs as you, with your
files, your `gh` login and your network, so nothing stops a determined agent
from writing the database or calling `gh` itself.

The Claude Code plugin (`hosts/claude-code/`) adds one more speed bump: a hook
that refuses the agent's own shell call to an `avoozl` command only a person
may run, from `hooks/person-only.json`. Code running as you can reach the same
command another way, so the commands and the MCP tools are where Avoozl
enforces it. A chat that drives the tick (`avoozl-drive`) runs `avoozl tick`,
which is not person-only, and hands every person-only step back to you.

`avoozl credential`, the git credential helper Avoozl hands its own git
commands, refuses to answer inside an agent session or a `process` child, and
`--yes` for a high-risk GitHub step is refused there too. Both are speed
bumps, not walls: code running as you can unset the markers. The sandbox is
what keeps an agent from `plugins.json`, plugin folders and `gh`'s config.

## Epic context

Setting this machine's `epicContext` block (`avoozl context set`), answering a
context plugin's questions (`avoozl plugins answer`), mapping its servers
(`avoozl plugins map`) and approving it are a person's acts. They are refused
over MCP, for a bound session and in a `process` child. See
[Epic context](epic-context.md).

## Unattended sessions

An unattended `process` child, one a tick starts, gets `AVOOZL_CHILD`, and the
same refusal applies. It keeps running after that tick exits, and a later tick
reaps or resumes it. What keeps a child from a person-only act is the sandbox
the tick wraps it in:

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
  cache folders (`sandbox.writeRoots`). Read-only roles write nowhere.
- Its network is off. On macOS a repository can name loopback ports instead
  (`localhost:PORT`, for a proxy): `sandbox.network` for roles that may use
  the network, and `sandbox.modelProxy` for the proxy the agent reaches its
  model through. Every role gets `modelProxy`, even one that reads only its
  folder, such as the code review; only `network` is withheld from those.
- A harness definition with `egress` gets its own proxy on `127.0.0.1`,
  which tunnels only to the hosts listed there. Its sandbox opens that one
  port, so those hosts are all it can reach.
- Token, key, secret and password variables, `GH_*`, `GITHUB_*`, `AWS_*`,
  `KIROCREW_*` and `SSH_AUTH_SOCK` are removed from its environment, and git
  gets no credential helper. The names its harness definition lists in
  `keepEnv` are kept, with values from the tick's environment or this
  machine's `machine.env`, an owner-only file outside every child's reach.
- `~/.aws` is hidden unless its harness definition lists it in `reads`;
  then the child may read it, never write it, to sign in with your AWS
  profile.
- On Linux it gets an empty `$XDG_RUNTIME_DIR`, and the docker socket,
  podman's socket folder and the SSH agent socket are hidden, since a Unix
  socket on a read-only mount still connects.
- After it exits, Avoozl runs git in its task folder only while the folder's
  `.git` file still names the git directory its checkout made, with that
  directory and work tree named and hooks and `core.fsmonitor` off. It reads
  the result and output files without following a symbolic link, and does not
  commit a link that points outside the folder.

macOS uses `sandbox-exec` and Linux uses bubblewrap (`bwrap`). A machine with
neither, such as Windows, runs a harness only after you allow that harness on
that machine, with the same opt-in that lets it write outside the task folder.

A harness whose own sandbox cannot run inside Avoozl's (Codex on macOS, where a
nested `sandbox-exec` fails) may set `permission.write` to exactly
`danger-full-access`. Avoozl then starts it only inside its own sandbox, with
write roots, and refuses it everywhere else, including on a machine that opted
in. Every other bypass value stays refused.

## File modes

The `.avoozl` folder is created `0700` and the database `0600`. Backups are
`0600`. On open, Avoozl tightens an existing
workspace's folders and database, so a person who shared the folder with a group
loses that access.

On Windows, Node cannot set these modes, so the files keep the access of the
folder they are in, which in a user profile is you, the system and
administrators. Move the workspace out of a shared folder if that matters.

## See also

- [Agents and the CLI](agents.md#person-only-actions) for the actions MCP
  refuses
- [Repository checks and isolation](checks.md) for the sandbox around checks
