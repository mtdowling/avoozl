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
