# Live proof harness

A throwaway Kiro Crew gateway for live proofs. It has its own home, its own
port and its own sign-in token. Your real gateway and home are never read,
written or restarted. Avoozl and Issue Radar are installed and enabled in it.

Script: `scripts/live-harness/harness.sh`. It needs `kirocrew`, `gh`, `python3`
and `curl` on the path. It is a bash script, run only on Linux.

## Run it

```
scripts/live-harness/harness.sh start     # set up if needed, then start
scripts/live-harness/harness.sh stop
scripts/live-harness/harness.sh status
scripts/live-harness/harness.sh check     # gateway, both apps, repo, Avoozl page
scripts/live-harness/harness.sh url       # dashboard URL with the sign-in token
scripts/live-harness/harness.sh reset     # stop, move old state aside, start clean with `start`
```

`start` is safe to repeat. It installs the app from this repo's committed
`kirocrew-app/` (run `npm run build` first after changing app source).
`reset` moves `home` (which holds `kiro`) and `app` to `*.old.<time>` and
deletes nothing. `KIRO_HOME` is `<home>/kiro`: Kiro Crew writes app agent
files such as `avoozl-crew` only to `<KIROCREW_HOME>/kiro/agents` for a second
home, and refuses anywhere else.

Settings (environment):

| Variable | Default |
|---|---|
| `AVOOZL_HARNESS_DIR` | `/tmp/avoozl-live-harness` |
| `AVOOZL_HARNESS_PORT` | `5690` |
| `AVOOZL_HARNESS_REPO` | `https://github.com/mtdowling/avoozl-radar-test` |
| `AVOOZL_HARNESS_AGENT` | `avoozl-crew` |

The script refuses a directory under `~/.kiro` or `~/.local/state`. It clears
the `KIROCREW_*` variables of the shell it is run from. The tunnel is off.

## Owner-only steps

These are the steps Issue Radar only lets the dashboard owner take. The harness
signs in with its own token, so each one is a command.

| Step | Command |
|---|---|
| Connect a repo | `harness.sh connect-repo [url]` (edits Radar's `config.json`, restarts) |
| Show Radar settings | `harness.sh radar-settings` |
| Change Radar settings | `harness.sh radar-settings '{"notify_on_new_issue":true}'` |
| Create a crew | `harness.sh crew-create NAME ['{"enabled":true,"unattended":true}']` |
| List crews | `harness.sh crew-list` |
| Edit a crew | `harness.sh crew-edit CREW_ID '{"max_open":1}'` |
| Change crew defaults | `harness.sh crew-settings '{"claim_ttl_hours":1}'` |
| Retire a crew | `harness.sh crew-retire CREW_ID` |
| Give crew chats a caller identity | `harness.sh route-avoozl`. It sets `mcp_gateway.stub_overrides`, restarts, approves the launch the gateway refused at boot, and restarts. The override alone is not enough: without the approval the gateway leaves `avoozl:avoozl` unwrapped, and plans tools that need the caller (review drafts, replies, conflict fix, reports) refuse with "no caller identity". The log line is `stubbed server ... resolves to a launch the operator has not approved`. The app must also refuse `server/discover` (PR #240), or the chat never sends `initialize` and the gateway never learns the app takes a caller |
| Any other route | `harness.sh api GET /api/apps/issue-radar/crews?owner=O&repo=R` |

A new crew is created paused (`enabled` false, `unattended` false). An enabled,
unattended crew starts a timer loop (first turn about 5 minutes later) and works the repo's issues. Pass
the JSON in the table when a proof needs it to run. A crew's agent is fixed at
creation (`avoozl-crew`).

## What it does not do

- The app backend picks the workspace whose sessions it reads when it starts
  or when the Avoozl page calls it. A workspace made later from the CLI is not
  read until then, so the tick holds with `"held":{"reason":"unobserved"}`.
  Run `harness.sh restart` after `avoozl init` and `workspace add`.
- Radar refuses a `gh` binary under directories owned by another user, so it
  cannot run `gh` in the harness. `connect-repo` writes the repo into Radar's
  config instead of calling `/connect`. A crew runs its own `gh` from its shell.
- Crews and `gh` use the machine's existing `gh` and Kiro sign-ins. The harness
  has its own dashboard token only.
- It creates no scratch repo and runs no proof.
- A crew's checkout goes to the machine's default Kiro Crew workspace folder,
  not under the harness directory.
- Reinstalling Avoozl gives the tick cron a new job, which may not read or
  message chats the old job opened. Start a fresh harness instead of
  reinstalling mid-proof.
