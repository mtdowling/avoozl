# Setting up Issue Radar from Avoozl

Question: can Avoozl's app, with a `permissions.api` grant such as
`/api/apps/issue-radar/*` in its `app.json`, set up Issue Radar with no clicks
beyond Kiro Crew's own approval prompts?

**Answer: no.** The grant lets Avoozl read Radar. Every write is refused for an
app caller. The person must connect the repo and create the crew in Radar's own
page.

Tested against Kiro Crew 0.12.2.4 (internal edition), Radar 0.1.0. Paths below
are inside `kiro_crew/` of that install.

## Result per call

Live column: HTTP status from a throwaway app (`probe2`) that exchanged its app
secret for an app token and made each call. Test home `/tmp/kc-appapi-home`,
port 5612, scratch repo `mtdowling/avoozl-radar-test`.

| # | Call | Verdict | Live | Why (file:line) |
|---|------|---------|------|-----------------|
| 1a | `GET /api/apps/issue-radar/repos` | allowed | 200 | No owner check. `apps/builtins/issue_radar/backend/http_routes/repositories.py:191` |
| 1b | `GET .../crews?owner&repo` | allowed | 404 `repo_not_connected` | Passes auth, then stops at the connected-repo gate. `crew_routes.py:703`, `_query_preamble` at `:380` |
| 1c | `GET .../crews/settings` (claim TTL, needs-human label, trailer) | allowed | 404 `repo_not_connected` | Same. `crew_routes.py:1254` |
| 1d | `GET .../settings` (triage settings) | allowed | 404 `repo_not_connected` | `http_routes/repositories.py:386` |
| 2 | `POST .../connect` | refused | 403 `owner_only` | `require_owner_dashboard_request` at `routes.py:466`. App tokens fail `is_owner_dashboard_request` (`dashboard/handlers/source_providers.py:893`, needs `request["app"] == ""`). |
| 3 | `POST .../crews` | refused | 403 `owner_only` | `_body_preamble` owner gate, `crew_routes.py:474-495` |
| 4a | `PUT .../crew` (edit `extra_prompt`) | refused | 403 `forbidden` | Stopped before the handler. `/api/apps/issue-radar/crew` is on the internal-path list (`dashboard/server_internal_paths.py:391`), so the middleware (`dashboard/token_auth.py`, internal-path branch) rejects an app token. The handler would also refuse (`crew_routes.py:495`). |
| 4b | `POST .../crew/pause` (pause) | refused | 403 `forbidden` | Same path rule (`/crew` prefix). Handler: `crew_routes.py:1165-1177`. |
| 4c | `POST .../crew/pause` (resume, `paused:false`) | refused | 403 `forbidden` | Same route as 4b. |
| 5 | `PUT .../crews/settings` | refused | 403 `owner_only` | `crew_routes.py:1267-1279` |
| x | `GET /api/apps` (path not in the grant) | refused | 403 | `dashboard/token_auth_app_scope.py:203-248`, deny by default |
| x | `GET /apps/issue-radar/api/repos` (another app's proxy) | refused | 403 | `apps/routes_proxy.py:233-250`: an app token may only proxy to its own backend |

Not tested live: 4a-4c and 5 against a real crew, and 1b-1d against a connected
repo. The test home could not connect the repo as owner because the sandbox's
`gh` binary is owned by another user (`routes.py` returns "no usable gh CLI").
The refusals do not depend on this: owner checks run before the repo lookup
(2, 3, 5), and 4a-4c are cut off by the middleware. The 404s on 1b-1d prove the
request got through auth. A connected repo would return 200.

Raw responses: the probe wrote them to `/tmp/kc-appapi-results.json` on the
test machine. They are not committed.

## How the app proxy decides

1. An app backend reads its secret from `<app dir>/.app_secret`, then calls
   `POST /api/apps/<name>/token` with `X-App-Secret` (`dashboard/handlers/core.py:1112`).
   The token carries `app=<name>`. It is passed as `?token=`; an
   `Authorization` header is not read (first probe run: 403 "Token required").
2. Scope check, path only, no method check: an app token may reach its own
   `/api/apps/<name>/*`, `/apps/<name>/*`, and any prefix in `permissions.api`
   (`token_auth_app_scope.py:203-248`, glob rules at `:155-170`).
3. Only grants the owner approved count. Without a stored approval file, what the
   manifest declares counts (`apps/manager_records.py:801-841`). A later update
   that adds entries stays held back until the owner approves them
   (`apps/manager_activation.py:119-127`, `apps/routes_enable.py:305-349`).
4. Radar's routes are served by the gateway itself (not a separate backend), at
   `/api/apps/issue-radar/*`, so the grant covers them. Its own `app.json`
   (`permissions.api`) lists the same two entries.
5. Radar then applies its own gates. Mutating routes call
   `require_owner_dashboard_request`, which refuses any app token. This is the
   rule that blocks calls 2, 3, 5 (and 4a-4c at the handler too). There is no
   per-route opt-in for apps, and the grant cannot widen it.

What the user sees: enabling an app with a `permissions.api` entry shows the
entry for approval in the app store flow. Third-party app code also needs the
app trusted (`agent.apps_trusted`) or `agent.apps_allow_third_party=true`.
Neither prompt lets an app past Radar's owner check.

## What a Set up flow can and cannot do

| Step | From Avoozl | Person must |
|------|-------------|-------------|
| Read connected repos, crews, claim settings | yes, with the grant | approve the grant once |
| Check whether Radar is on, repo connected, crew exists | yes | none |
| Connect the repo | no | click Connect in Radar |
| Create the crew | no | fill the crew form in Radar |
| Edit `extra_prompt`, pause, resume | no | do it in Radar's Crews page |
| Set `needs_human_label`, `claim_ttl_hours`, `commit_trailer` | no | set in Radar's crew settings |

A usable flow, with the least clicking:

1. Avoozl reads Radar's state (grant approved once).
2. For each missing item it shows the exact values to enter: repo URL, crew
   name, agent, model, labels, `extra_prompt` text, and the three protocol
   settings. A copy button per value and a link to Radar's page.
3. After the person saves in Radar, Avoozl re-reads and ticks the item.

The person clicks Connect and Create crew, and sets the protocol fields. That is
the minimum under Kiro Crew 0.12.2.4.

## Other ways in, not tested

- Agent-tool callers (`internal_auth`) reach only `GET /crew` and `PUT /crew/work`
  (`crew_routes.py:233-260`, `_AGENT_REACHABLE`). They cannot create or pause
  crews either.
- A change in Kiro Crew, such as an app-callable owner-approved write, would be
  needed to remove the clicks. Radar's owner gate is deliberate: a live crew
  runs with an auto-approve grant in the owner's name (`crew_routes.py:474-486`).

## Can a Radar crew use Avoozl's MCP tools and skills?

**Yes.** A Radar crew whose Agent is an app-shipped agent that mounts
`avoozl:avoozl` can call Avoozl's tools in its own chat and can see Avoozl's
skills. It needs four things, listed below.

Same test setup as above (own `KIROCREW_HOME`, port 5612, plus its own
`KIRO_HOME` so the real agent folder is untouched), Kiro Crew 0.12.2.4, Avoozl
`main` built with `npm run build:kirocrew-app` and installed from
`kirocrew-app/`. Crew `avoozl-crew-two` on `mtdowling/avoozl-radar-test`, agent
`avoozl-crew`. Every row below was seen live.

| Question | Result |
|---|---|
| Did the tools load in the crew's chat? | Yes. The crew slot `crew-<id>` called `@avoozl:avoozl/plans_status` and got `revision 1, total 0, complete 0, no epics`. |
| Was MCP sharing approval needed? | No separate prompt. The server is part of the agent spec. The only prompt was the normal per-tool approval on `plans_status` (the spec's `allowedTools` was empty). An unattended crew gets the crew's auto-approve grant instead (`crew_runtime_session.py`, `sync_trust`). |
| Did the skills load? | Yes, once the spec listed them as `skill://` resources. `skill_search` then returned `avoozl`, `avoozl-costs`, `avoozl-plugin`, `avoozl-rules`. |
| Any refusal code? | No HTTP refusal. Two soft failures, below. |

What had to be true:

1. **The agent must come from an app.** A hand-written spec in the agents folder
   was ignored. The slot kept `agent: avoozl-crew` but ran as `kirocrew`
   (`effective_agent`), with no error and no tools. App-shipped agents resolve:
   the app's `agents/avoozl-crew.json` is materialized as
   `avoozl--avoozl-crew.json` and the name `avoozl-crew` then binds. Avoozl's
   `main` ships no such agent. I added `agents/avoozl-crew.json` to the test
   install only. Shipping one is a change to `kirocrew-app/app.json` and
   `kirocrew-app/agents/`.
2. **The spec lists the tools and skills.** `tools` named
   `@avoozl:avoozl/plans_status` and `@kirocrew-core/skill_search`; `resources`
   named the four `skills/*/SKILL.md` files as `skill://` paths. Without the
   `resources` entries `skill_search` answered "End of this agent's available
   skill list." with nothing in it.
3. **Avoozl must be built before install.** An install from a plain checkout has
   no `bin/lib`. The MCP server then fails at `initialize`
   (`ERR_MODULE_NOT_FOUND: .../bin/lib/src/app/host-config.mjs`), and so does the
   `avoozl-tick` cron. See `kirocrew-app/README.md`.
4. **Avoozl needs a default workspace.** A crew chat is not bound to an Avoozl
   workspace, so `plans_status` first returned the MCP error "Avoozl has no
   workspace for this session. Choose a default workspace in the Avoozl
   Workspace view." (`src/app/app-mcp.mjs:137`). After
   `workspace adopt` and `workspace set-default` on the CLI, the same call
   worked. In the UI this is one step on the Avoozl page.

Other facts:

- A narrow `tools` list also removes Radar's own crew tools. The crew said it
  had "no Issue Radar tool", so it could not read or write its ledger. A real
  `avoozl-crew` spec must also list `@kirocrew-core/issue_radar_crew_read` and
  `issue_radar_crew_record` (the pair named in `crew_routes.py:70`).
- Changing a crew's `agent` with `PUT /crew` did not move an existing slot to
  the new agent. Create the crew with the right agent from the start.
- The crew received its normal Radar nudge ("auto-nudge cycle", the Radar worker
  brief), so the tools were tested inside a real crew session. The first turn
  of each test was an owner chat message (`POST /api/chat`, then
  `POST /api/chat/slots/<slot>/approve`), not a Radar-found issue. The test home
  could not run `gh` (the sandbox marks every parent directory as owned by
  another user, and Radar refuses such a binary), so Radar never synced issues.
  The repo was added to Radar's `config.json` by hand. This does not affect the
  tool and skill results.
- The crew was created with the owner's cookie on the test gateway, which is the
  one owner step. The grant test above shows an app token cannot do it.
- Cleanup: crews retired, scratch issue #28 closed, gateway stopped. Draco and
  the owner's real `~/.kiro/agents` were not touched.

## Agent list and hooks

Same test home and build. The test install's `avoozl-crew.json` also had
`hooks` for `agentSpawn`, `preToolUse` (`matcher: "*"`) and `stop`. Each hook
ran a small script that appends one line to a log file.

| Question | Result |
|---|---|
| Does `avoozl-crew` show in Radar's Agent list? | Yes. Radar's crew form fills its Agent picker from `GET /api/agents/catalog` (the dashboard's `useAgents` hook). That list included `avoozl-crew` and every other Avoozl agent. |
| Do Avoozl MCP tools load in the crew chat? | Yes, again. A fresh crew `avoozl-crew-hooks2` called `plans_status` and got an answer. |
| Do Avoozl hooks fire? | **No.** All three hooks were in the materialized spec (`avoozl--avoozl-crew.json`), but none ran. The log file was never created, and the turn showed no error. |

Why the hooks do not run:

1. The crew chat runs on the KAS backend. Kiro Crew's log shows
   `Using custom agent profile: kirocrew-session-start`, KAS's start agent
   (`acp/kas_start_agent.py`).
2. KAS has no slot for spec `hooks`, so Kiro Crew fires them itself
   (`agent_sdk/spec_hooks.py`, `ACP_BACKENDS_CREW_FIRES_SPEC_HOOKS` in
   `agent_sdk/backends_routing.py:333`).
3. Each run first checks the `capabilities.script_hooks` gate
   (`hook_runtime/script_hooks.py:162`, `hook_runtime/governance_gate.py:189`).
4. The Amazon edition's bundled security policy pins that gate OFF
   (`kirocrew_amazon/security_policy.py:27`). It is a ceiling that
   `config.json` cannot widen; `kirocrew config set capabilities.script_hooks`
   answers "Unknown key".

So in this edition no agent spec hook fires, Avoozl's or any other. The public
edition registers the same gate as off by default
(`platform/governance_parts/catalog.py:211`). I did not test a build or policy
with the gate on, and I did not override the security policy.

What this means for Avoozl:

- An `avoozl-crew` agent can ship in `kirocrew-app/agents/`, and a person picks
  it in Radar's New crew form like any other agent.
- Anything Avoozl wants to run in a crew turn has to be a tool call, or part of
  the agent's prompt. A hook will not run it here.
- Lines added to the setup steps above: the person picks `avoozl-crew` under
  Agent in New crew, and sets a default Avoozl workspace once.

Test notes: crew created and chat turns sent with the owner session of the test
gateway, as in the section above. Test-only files (`agents/avoozl-crew.json` and
the hook script) were installed into the test home only and are not in this
change. Cleanup: crew retired, gateway stopped.
