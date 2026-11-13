# Avoozl on stock installed Kiro Crew

Receipt for running Avoozl on the Kiro Crew the owner has installed, with no
custom Kiro Crew build.

- App source: branch `task/stock-kc` (commits "Read session status through the
  app backend on stock Kiro Crew" and "Drain the catalog default workspace when
  none is served")
- Kiro Crew: installed 0.12.2.3 (`kirocrew --version`), binary
  `~/Library/Application Support/<Kiro Crew edition>/runtime.noindex/0.12.2.3/.../bin/kirocrew`,
  read and run only; not modified
- Model: real kiro-cli (`agent.acp_backend: kiro`)
- Recorded: 2026-11-12 23:14–23:31 UTC, macOS

## What failed on stock

Read from the stock bundle's `kiro_crew` package.

| Avoozl call | Stock 0.12.2.3 | What the user saw |
|---|---|---|
| `ctx.session_status()` in `crons/tick.py` | `ScriptContext` (`cron_script_context.py`) has no such method; only `notify`, folder calls, `open_session`, `send_to_session`, `set_session_mode`, `crew_log_append`, `call_tool` | The cron caught the `AttributeError` and called `plans_tick` with no `sessions`. The tick then ran as the page's plan-only tick: no integration, no GitHub step, no notices queued, and every live session counted as unobserved, so after the first dispatch nothing new dispatched |
| `kirocrew-dashboard` `session_status` through `ctx.call_tool` (design §4.6) | `created_session_status` resolves the caller through `caller_slot_key`; a `cron:<job>` key names no slot (`caller_unidentified`), and `_app_owned_cron_refusal` refuses app crons outright | Not usable from the cron |
| Served-model fields (`served_model`, `model_withheld`, `model_changed`) | Not sent by any stock route | Already handled: the tick trusts the requested model and says the served model was not reported |

Everything else the cron and backend call exists on stock: `open_session`
(with `model`), `send_to_session`, folder calls, `call_tool`, the app token
exchange (`POST /api/apps/<name>/token`), and `POST /api/notifications/push`.

## The fallback

- `crons/tick.py` uses `ctx.session_status` when it is callable. It always
  sends `cron: true`, and sends `sessions` only when it read a roster.
- `workspace.tick` treats `cron: true` as the script cron with or without a
  roster. Without one, a live session counts as observed once any status was
  recorded for it, and the receipt says `observer: "app"`.
- After each tick receipt, the app backend reads every live session the tick
  opened with `GET /api/chat/slots/<slot>?limit=1` on its app token
  (`src/app/session-observer.mjs`) and records `working`, `queued`, `idle`, or
  `gone` (404). Any other answer leaves the last status in place. The slots the
  cron opens carry `_app = "avoozl"` (`derive_caller_app` reads the cron job's
  `created_by`), so the slot-ownership middleware admits the app; app.json
  grants only `/api/chat/slots/avoozl_*`, not the session list.
- `gone` is not final. A worker that is gone without a report opens a decision
  and a `decision` notice; Avoozl never starts another worker on its own.
  Retry ends it as `lost` and the tick starts the next attempt. A gone verifier
  or reviewer is replaced, since it changes no code.
- The backend drains the catalog default workspace when it started before any
  workspace existed, so adding one in the Workspace view is enough.

## Live proof (P5 flow)

Profile `$TMPDIR/aicommander-stock-kc/.live` (`env.sh`): `HOME`,
`KIROCREW_HOME`, `KIRO_HOME`, `XDG_*`, `GH_CONFIG_DIR`, `AVOOZL_WORKSPACE` all
under it; `KIROCREW_BOUND_PORT` and `KIROCREW_PORT` unset. Workspace and
sample repository copied from `$TMPDIR/kc-p4-snapshot` (plan
`config-loader`, leaves `.1.1 -> .1.2 -> .1.3`, `.1.1 -> .1.3`). Setup as in
P5: config `agent.session_control`, `agent.sandbox_allow_unsandboxed_exec`,
`agent.acp_backend kiro`, `mcp_gateway.stub_servers`, `agent.apps_trusted`;
`kirocrew app install`, `app enable`; the narrowed default agent spec moved
aside before the first boot; the stub launch approved; the folder's project
directory set (MC-1); `workspaces.add` through the page API.

| Time (UTC) | Event |
|---|---|
| 23:16:46 | First tick: receipt `observer: "app"`, folder `Avoozl/sample` created |
| 23:19:21 | Worker bound for 1.1 |
| 23:20:17 | 1.1 worker done |
| 23:21:15 | 1.1 verifier bound; done 23:21:32 |
| 23:22:16 | 1.1 integrated |
| 23:22:19 | Worker bound for 1.2; backend read it `working` at 23:22:59 (app token exchange and slot read granted in `security_events.jsonl`) |
| 23:23:08 | 1.2 worker done; verifier bound 23:23:17, done 23:23:36 |
| 23:24:17 | 1.2 integrated; worker bound for 1.3 at 23:24:18 |
| 23:25:05 | 1.3 worker done; verifier bound 23:25:17, done 23:25:32 |
| 23:26:18 | 1.3 integrated |

```text
$ git -C sample log --format='%h %an %s' main
152aee4 P5 Test Add --config CLI flag and report config errors on stderr
46ece6f P5 Test Add validateConfig and loadAndValidate
0dbc903 P5 Test Add loadConfig to read and parse JSON config files
5124a0e P4 Start sample CLI
$ (cd sample && npm test)
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

Verdict: **PASS**. Three linked tasks ran automatically to merge in
dependency order, each with one worker and one verifier attempt.

Until 23:22 the backend ran the first build, which drained only a served
workspace; this backend had started before the workspace was added, so it read
no sessions, and the 23:20:16 receipt held dispatch on the unobserved 1.1
worker until that worker reported done. The second commit fixed this, and the
app was updated in place (`POST /api/apps/avoozl/update`) before 1.2.

### Gone session, live

After P5, a worker binding for slot `avoozl_ghost_check`, which Kiro Crew
does not hold, was added on epic `config-loader.1`.

| Time (UTC) | Event |
|---|---|
| 23:28:18 | Backend read the slot: 404, recorded `gone` |
| 23:29:17 | Tick set the delivery to `decision` ("Kiro Crew no longer lists session avoozl_ghost_check, and it has not reported"); notice `config-loader.1: its session is gone` queued and pushed at 23:29:17.768 |
| 23:30:00 | `delivery.retry` through the page API: binding `lost` |
| 23:30:25 | Tick recorded the failed attempt; delivery `failed` |

## What stock Kiro Crew still cannot tell Avoozl

- Closed versus lost: both read 404. A gone worker waits for a person instead
  of being retried. MC-2 (`ScriptContext.session_status`) restores the
  difference, and the cron uses it as soon as Kiro Crew ships it.
- Freshness: statuses are read after each tick, so they are up to one tick old,
  and a session opened in a tick is first read after the next one.
- A gone planner or responder session is not treated as ended; those steps
  still read only `closed` and `lost`.
- The served model is not reported, as before.
