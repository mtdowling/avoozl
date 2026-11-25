# Avoozl for Kiro Crew

This package adds Avoozl to Kiro Crew: the Avoozl page, a loopback app
backend, the `avoozl` stdio MCP server, the `avoozl-tick` script cron, the
reviewer, responder and check decide agents, and the Avoozl skills.

Build the package before a local install. The build writes the page bundle and
copies the Avoozl CLI with its dependencies into `bin/lib`, so the installed
package runs without this checkout:

```sh
npm run build:kirocrew-app
kirocrew app install /absolute/path/to/avoozl/hosts/kirocrew
```

Update the same way, since `kirocrew app update` copies the package without
building it:

```sh
npm run build && kirocrew app update avoozl
```

The build stamps `ui/dist/build.json` with a hash of `ui/src`. When the
installed page was not built from the `ui/src` installed with it, or there is
no page, the app backend answers every page request with that command.

Enable the installed app from Kiro Crew's App Store after reviewing its trust
request. `bin/avoozl.mjs` runs only `app-backend` (the default) and `mcp`. Each
serves the workspace named by `--workspace` or `AVOOZL_WORKSPACE`, or else the
default workspace of the machine catalog.

Decisions and failures go to the app's `decision` and `failure` notification
channels, each with a link to its session. The tick queues them, and the app
backend pushes them to the gateway when it starts and after each tick.

The tick needs the status of each session it opened. When Kiro Crew's script
cron offers `ScriptContext.session_status`, the cron hands the tick that roster.
Kiro Crew 0.12.2 does not, so after each tick the app backend
reads each live session with `GET /api/chat/slots/<slot>` on its app token and
records `working`, `queued`, `idle`, or `gone`. Kiro Crew answers the same way
for a closed session and a lost one, so a worker session that is `gone`
without a report opens a decision instead of a new attempt; **Retry** in
Conflicts ends it and starts the next attempt. A gone reviewer is replaced on its
own, since it changes no code. Statuses are up to one tick old.

## Engine updates

The tick, its checks and landing run from a build of Avoozl's own main, not
from the installed app. When the workspace that holds `mtdowling/avoozl` sees
its base branch move, and every `requiredChecks` name of that repository
passed on that exact commit, the tick builds the commit and moves to it:

1. `git archive` of the commit from the local checkout, `npm ci
   --ignore-scripts`, then `npm run build:kirocrew-app`, in this machine's
   state folder under `engine/builds/<commit>`.
2. `avoozl status` from the new build, which must exit 0.
3. `engine/current.json` names the new build, and the cron starts the next
   tick from it. The build before it is kept.

A build that fails, or that starts five times without finishing a pass, is
dropped: the tick goes back to the build before it and opens one Needs you
row. That commit is not tried again; the next green commit is. It looks at
main at most every five minutes.

`avoozl status` shows the build in use under `machine.engine` (`commit`
null is the installed app's copy), and **Settings › Autopilot** shows it
under This machine's engine. To stop following main, set `engine.update`
to `false` in this machine's `config.json`, with that switch, or with
`avoozl settings set delivery`:

```sh
avoozl settings set delivery --json '{"engine":{"update":false}}'
```

The page, the app backend and the MCP server stay the installed app's. A
change to them still needs `npm run build && kirocrew app update avoozl`.

## Tick watchdog

`avoozl tick watchdog --workspace PATH` is an opt-in check for a tick that
stopped running. It reads `<workspace>/.avoozl/local/tick-health.json` and posts a
macOS notification when the last tick is older than `--stale-minutes`
(default 10) or ended in an error. It only reads. Nothing installs it; to run
it every 10 minutes, fill in `scripts/dev/tick-watchdog.plist.example` and load
it with `launchctl load`. `--dry-run` prints the problem without notifying.
