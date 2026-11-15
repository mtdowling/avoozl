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
`reset` moves `home`, `kiro` and `app` to `*.old.<time>` and deletes nothing.

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
| Any other route | `harness.sh api GET /api/apps/issue-radar/crews?owner=O&repo=R` |

A new crew is created paused (`enabled` false, `unattended` false). An enabled,
unattended crew starts a timer loop (first turn about 5 minutes later) and works the repo's issues. Pass
the JSON in the table when a proof needs it to run. A crew's agent is fixed at
creation (`avoozl-crew`).

## What it does not do

- Radar refuses a `gh` binary under directories owned by another user, so it
  cannot run `gh` in the harness. `connect-repo` writes the repo into Radar's
  config instead of calling `/connect`. A crew runs its own `gh` from its shell.
- Crews and `gh` use the machine's existing `gh` and Kiro sign-ins. The harness
  has its own dashboard token only.
- It creates no scratch repo and runs no proof.
