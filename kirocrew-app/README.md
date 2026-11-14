# Avoozl for Kiro Crew

This package adds Avoozl to Kiro Crew: the Avoozl page, a loopback app
backend, the `avoozl` stdio MCP server, the `avoozl-tick` script cron, the
planner, verifier, and responder agents, the `avoozl` skill, and the Crew Mode
runner hook `hooks/avoozl-runner.json`.

Build the package before a local install. The build writes the page bundle and
copies the Avoozl CLI with its dependencies into `bin/lib`, so the installed
package runs without this checkout:

```sh
npm run build:kirocrew-app
kirocrew app install /absolute/path/to/avoozl/kirocrew-app
```

Enable the installed app from Kiro Crew's App Store after reviewing its trust
request. `bin/avoozl.mjs` runs only `app-backend` (the default), `mcp`, and
the Crew Mode runner commands `next`, `claim`, `report`, and `retry`. Each
serves the workspace named by `--workspace` or `AVOOZL_WORKSPACE`, or else the
default workspace of the machine catalog.

Decisions and failures go to the app's `decision` and `failure` notification
channels, each with a link to its session. The tick queues them, and the app
backend pushes them to the gateway when it starts and after each tick.

The tick needs the status of each session it opened. When Kiro Crew's script
cron offers `ScriptContext.session_status`, the cron hands the tick that roster.
Installed Kiro Crew (0.12.2.3) does not, so after each tick the app backend
reads each live session with `GET /api/chat/slots/<slot>` on its app token and
records `working`, `queued`, `idle`, or `gone`. Kiro Crew answers the same way
for a closed session and a lost one, so a worker session that is `gone`
without a report opens a decision instead of a new attempt; **Retry** in
Conflicts ends it and starts the next attempt. A gone verifier or reviewer is
replaced on its own, since it changes no code. Statuses are up to one tick old.

A Crew Mode chat can run local delivery when `.avoozl.json` sets
`"delivery": {"runner": "crew-mode"}`. Copy `hooks/avoozl-runner.json` into
`~/.kiro/hooks/` so a conductor that starts in one of the workspace's checkouts
gets the runner steering and the current `next` buckets.

## The driver session

The driver session is one long-running chat that releases ready work and
watches merges. Start it from the Start button on Home or in the side panel.
The button opens a new chat on the `avoozl-driver` agent and sends its first
message. Nothing starts one for you.

Kiro Crew lets an app read only the chats the app opened, and the person opens
this one, so Avoozl cannot look its slot up. The chat tells Avoozl instead: the
agent's `agentSpawn` and `stop` hooks run `avoozl.mjs driver hook`, which
records the chat key Kiro Crew puts in the hook payload, and a `plans_next`
call from a Kiro Crew session records it too. The page shows a link to that
chat. It reads as running for 30 minutes after the last hook or call, then as
quiet, with the link kept and a Start button for a new one. Avoozl has no
read of whether the chat is still open or mid-turn.

Not built, because the host does not allow it: sending a message into the
driver chat from the page, stopping it, and reading its turn count.
Attach / steer opens a crew's chat; you type there.
