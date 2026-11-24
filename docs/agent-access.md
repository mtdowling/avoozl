# Agent access

An agent can do everything in Avoozl that you can: approve, change settings,
set up repositories and GitHub, and delete. A delete needs an explicit
confirm, and Activity records who made each change.

```sh
avoozl autopilot on --workspace ~/plans
avoozl report delete weekly --yes
```

The same two calls over MCP:

```json
{
  "name": "plans_autopilot",
  "arguments": {
    "action": "set",
    "input": {
      "on": true
    }
  }
}
```

```json
{
  "name": "plans_control",
  "arguments": {
    "action": "delete_report",
    "input": {
      "id": "weekly",
      "confirm": true
    }
  }
}
```

## Tools and commands

Each change has an action on one of six MCP tools and a CLI command. No role
agent is allowed these tools, so a worker or reviewer gains nothing from them.

| MCP tool | Actions | CLI |
| --- | --- | --- |
| `plans_autopilot` | `status`, `set`, `release_runner` | `avoozl autopilot on\|off\|status`, `avoozl runner release` |
| `plans_settings` | `workspace`, `flow`, `models`, `delivery`, `conversations`, `activity`, `github`, `telemetry`, `agent_instructions`, `epic_context` | `avoozl settings get\|set AREA`, `avoozl context set`, `avoozl telemetry` |
| `plans_setup` | `add_repositories`, `remove_repositories`, `repository`, `remove_repository`, `workspace_repository`, `publish_workspace_repository`, `sync_workspace_repository`, `connect_github`, `configure_github`, `allow_github_steps`, `rebuild`, `list_workspaces`, `change_workspace`, `remove_workspace`, `approve_harness`, `probe_harness`, `run_on` | `avoozl repositories`, `avoozl repository`, `avoozl workspace-repo`, `avoozl github`, `avoozl rebuild`, `avoozl workspace`, `avoozl harness` |
| `plans_plugin_admin` | `add`, `approve`, `disable`, `remove`, `update`, `pick_credentials`, `check_updates`, `configure_updates`, `map`, `answer`, `flip_check` | `avoozl plugins`, `avoozl plugins admin`, `avoozl checks flip` |
| `plans_content_admin` | `terms`, `update_terms`, `update_sets`, `allow`, `show` | `avoozl settings get\|set content-terms\|content-sets`, `avoozl content allow\|show` |
| `plans_control` | `approve_plan`, `publish_spec`, `take`, `delete_claim`, `allow_verify`, `resume_lane`, `ready_pr`, `merge_pr`, `land_integration`, `task_done`, `task_reopen`, `stop_all`, `resume_stop`, `run_anyway`, `delete_report`, `send_message`, `open_session`, `confirm_item`, `deliver_item`, `plan_item`, `add_source`, `remove_source` | `avoozl plan approve`, `avoozl spec`, `avoozl take`, `avoozl claim delete`, `avoozl verify allow`, `avoozl lane resume`, `avoozl landing`, `avoozl integration land`, `avoozl task done\|reopen`, `avoozl flow stop\|resume\|run-anyway`, `avoozl report delete`, `avoozl session`, `avoozl intake` |

`plans_take_task` and `plans_approve_plan` take a task by hand and approve a
spec revision, as `plans_control` does. Any operation also runs by name at the
command line: `avoozl OPERATION --json JSON`.

`plans_session` action `stop_line` stops new work in a scope. It never stops
every agent; `plans_control` action `stop_all` does.

## Autopilot

Autopilot runs only while the workspace's `delivery` block in `.avoozl.json`
and this machine's `loop` are both set. `avoozl autopilot on` writes both, as
the page's switch does: an empty `delivery` block when there is none, and the
`loop` `{"run": ["specs"]}` when this machine has none. `off` removes this
machine's `loop` and keeps the `delivery` block. `status` reports `on`, and
`delivery` and `loop` on their own.

## Deletes need confirm

These run only when the input says `confirm: true`, which `--yes` sets at the
command line:

- `claim.delete`, `report.delete`, `plugin.remove`, `intake.source.remove`
- `repository.remove`, `repositories.remove`, `catalog.remove` (a workspace
  off this machine's list)
- `github.job.confirm`, the Allow for high-risk GitHub steps such as deleting
  a branch; pass its grant ids as `allow` to the step that needs them

Without it the call is refused before anything runs:

```text
report.delete deletes or allows a high-risk change. Pass confirm: true (MCP) or --yes (CLI) to run it.
```

The Avoozl page asks you in a dialog instead. `avoozl claim delete` and other
high-risk GitHub steps at the command line ask `Allow? [y/N]` on a terminal,
or take `--yes`.

## Activity names the caller

Every call to an operation on these tools writes one Activity row. Its
summary ends with who called it: `agent tool` for MCP, `cli` for the command
line, or `owner session` for the Avoozl page. The row's actor is the agent's
session (`session:<key>`), or your operator name.

```text
Saved delivery settings (by agent tool)
Ran autopilot.set (by cli)
```

`avoozl harness approve` and `avoozl workspace` work on this machine's files
without a workspace, so they write no Activity row.

## Code running as you

`avoozl credential`, the git credential helper Avoozl hands its own git
commands, refuses to answer inside an agent session or a `process` child. It
is a speed bump: code running as you can unset the markers. The sandbox is
what keeps an agent from `plugins.json`, plugin folders and `gh`'s config.
A Kiro Crew chat gets no sandbox: it runs as you, with your files, your `gh`
login and your network.

## Unattended sessions

An unattended `process` child, one a tick starts, gets `AVOOZL_CHILD`. It
keeps running after that tick exits, and a later tick reaps or resumes it.
The sandbox the tick wraps it in keeps it to its task:

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

- [Agents and the CLI](agents.md) for the narrow tools each role uses
- [Repository checks and isolation](checks.md) for the sandbox around checks
