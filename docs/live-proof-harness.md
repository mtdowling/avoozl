# Live proof harness

A throwaway Kiro Crew gateway for live proofs. It has its own home, its own
port and its own sign-in token. Your real gateway and home are never read,
written or restarted. Avoozl and Issue Radar are installed and enabled in it.

Script: `scripts/live-harness/harness.sh`. It needs `kirocrew`, `gh`, `python3`
and `curl` on the path. It is a bash script for Linux and macOS.

## Run it

```
scripts/live-harness/harness.sh start       # set up if needed, then start
scripts/live-harness/harness.sh stop
scripts/live-harness/harness.sh status
scripts/live-harness/harness.sh check       # gateway, both apps, repo, Avoozl page
scripts/live-harness/harness.sh url         # dashboard URL with the sign-in token
scripts/live-harness/harness.sh signin      # owner shell, once per home: save a sign-in cookie
scripts/live-harness/harness.sh browser-state  # Playwright storage state from that cookie
scripts/live-harness/harness.sh reload-app  # load a new app build
scripts/live-harness/harness.sh reset       # stop, move old state aside, start clean with `start`
```

`start` is safe to repeat. It installs the app from a copy of the built
`kirocrew-app/` (`AVOOZL_HARNESS_APP_SRC`; run `npm run build` first after
changing app source). On every `start` and `restart` it compares the content of
each built file with the installed app. When any differs, it reinstalls the
app before the gateway starts: uninstall (the app's `data/` is kept), then
install. A gateway that is not running refuses `kirocrew app update`, so that
is the only offline path, and it gives the tick cron a new job (see below).

`reload-app` loads a new build mid-proof. With the gateway running and a
sign-in cookie saved, it updates the app in place through the gateway's
`/api/apps/avoozl/update` route, the same route `kirocrew app update` uses.
The tick keeps its cron job and chats keep their turns. Without a cookie it
stops, reinstalls and starts. No owner step is needed once the cookie exists.

`reset` moves `home` (which holds `kiro`), `app` and `cookies.txt` to
`*.old.<time>` and deletes nothing. `KIRO_HOME` is `<home>/kiro`: Kiro Crew
writes app agent files such as `avoozl-crew` only to `<KIROCREW_HOME>/kiro/agents`
for a second home, and refuses anywhere else.

Settings (environment):

| Variable | Default |
|---|---|
| `AVOOZL_HARNESS_DIR` | `/tmp/avoozl-live-harness` |
| `AVOOZL_HARNESS_PORT` | `5690` |
| `AVOOZL_HARNESS_REPO` | `https://github.com/mtdowling/avoozl-radar-test` |
| `AVOOZL_HARNESS_AGENT` | `avoozl-crew` |
| `AVOOZL_HARNESS_APP_SRC` | `<repo>/kirocrew-app` |

The script refuses a relative directory, `/`, your home itself, and anything
under `~/.kiro`, `~/.local/state` or `$KIROCREW_HOME`, checked again after
symlinks are resolved. It refuses a symlinked `home` or `app` inside it, and
it replaces only its own `app` copy. It clears the `KIROCREW_*` variables of
the shell it is run from. The tunnel is off, and the gateway listens on
loopback only.

## Sign-in: the one owner step

A chat cannot mint a sign-in link for the test crew. `kirocrew token` asks the
gateway's `/api/token/local` route, and the gateway mints a token only for a
caller it verifies as its local owner: on macOS a process that is not
sandboxed, on Linux one in the gateway's own namespaces. A chat's shell is
sandboxed, so the gateway answers `403 member_owner_token_refused`. Reading a
sign-in from `~/.kiro` or the real crew is not an option either: the sandbox
blocks it, and it would sign in to the real crew. So there is no
`signin-url.sh`.

On macOS the sandbox also stops a chat from starting the gateway at all (it
cannot read `~/.kiro/crew-auth-staging`), so `start`, `restart` and
`route-avoozl` are the owner's too. Run the harness on macOS with a `setsid`
stand-in on the path (`exec "$@"`).

The owner runs this once per harness home, in their own terminal:

```
scripts/live-harness/harness.sh start
scripts/live-harness/harness.sh signin
```

`signin` saves a cookie session to `<harness>/cookies.txt` (mode 600) and
prints no token. The session refreshes for about 30 days and survives
restarts; `reset` retires it. From then on a chat needs no owner:

- `harness.sh api ...` and every command built on it use the cookie.
- `harness.sh reload-app` loads a new build in place.
- `harness.sh browser-state` writes `<harness>/browser-state.json` (mode 600)
  for Playwright: `browser.newContext({ storageState: "<that file>" })`, then
  open `http://localhost:<port>/apps/avoozl`.

## Chats click the test crew themselves

Proof chats drive the test crew's UI with a browser tool themselves:
Playwright, signed in with `browser-state`, the same tool used for
screenshots. That includes approval clicks inside the throwaway test
workspaces a proof creates (plan approval, Needs you answers, trust prompts).
Do not hand the owner click-by-click steps for a test crew.

Real workspaces stay the owner's. A chat never clicks, approves or signs in to
the real Kiro Crew, and real spec approvals stay the owner's own click.

## Owner-only steps

These are the steps Issue Radar only lets the dashboard owner take. The harness signs in with its own token or the saved `signin` cookie, so each one is a command.

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
- A chat the tick opens in a folder (`Avoozl/<project>`) gets no checkout until
  the folder has a project directory, and the tick skips it silently. After the
  first tick made the folder, set it with
  `harness.sh api PATCH /api/chat/folders/<folder id> '{"project_dir":"<clone>"}'`
  (ids are in `<harness>/home/folders.json`).
- A chat the tick opens asks for approval of its first
  `git` call, and an unattended chat declines it after 3 minutes. Approve the
  chat with `harness.sh api POST /api/chat/mode '{"slot":"<slot>","mode":"trust"}'`,
  then send it a message to carry on.
- It creates no scratch repo and runs no proof.
- A crew's checkout goes to the machine's default Kiro Crew workspace folder,
  not under the harness directory.
- Reinstalling Avoozl gives the tick cron a new job, which may not read or
  message chats the old job opened. `start` and `restart` reinstall when the
  build changed, so mid-proof load a build with `reload-app` while the
  harness runs, which updates in place.
