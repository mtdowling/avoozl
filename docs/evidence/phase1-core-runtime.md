# Phase 1 core runtime: tasks 1.1, 1.2, 1.5, 1.7

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 1.
Tasks 1.3, 1.4, and 1.6 were not started.

- Implementation commit: `d22f2b9` ("Add app backend, stdio MCP server, tick, and session binding")
- Base: `kirocrew-native` at `0747a53`
- Recorded: 2026-11-11, Node v26.13.0, macOS

## Checks

| Check | Result |
|---|---|
| `npm test` at `d22f2b9` (typecheck, build, all tests) | exit 0; 571 tests, 571 pass, 0 fail |
| `git diff --check 0747a53 d22f2b9` | clean |
| New tests, `src/app/test/kirocrew-runtime.test.mjs` | 8 of 8 pass |
| Principal interop: a header signed by Kiro Crew's own `proxy_auth.sign_proxy_principal_claim` | verified by `verifyPrincipal`; the same header replayed is refused |

`npm test` rebuilds `canvas-app/extension.js` with different output. That file
was restored and is not part of the change.

## Task coverage

| Task | What landed | Tests |
|---|---|---|
| 1.1 `avoozl app-backend` | `src/app/app-backend.mjs`; CLI `app-backend` reads `$PORT`. Binds `127.0.0.1` only, with no host option. `GET /health` is the only unsigned route. Every other route verifies `X-KiroCrew-Principal` against `KIROCREW_PROXY_SECRET`: domain tag, issue time within 60 s, method, request-target, body digest, a one-use request ID, and a known kind. Missing, forged, stale, replayed, or `none` claims get 401. With no secret, every claim fails. Action-level authorization: `owner-session` may run any client operation; `app-token` and `agent-tool` may only observe; anything outside the client API gets 403. | binds loopback, health-only unsigned; fresh exact claim only (wrong secret, body, target, method, stale, `none`, owner without ID, garbage, replay); fails closed with no secret; app token and agent tool may observe but not write |
| 1.2 `avoozl mcp` | Without `--url`, `AVOOZL_URL` (or the older aliases), or a registered workspace ID, and when the database exists, `mcp` now serves JSON-RPC over stdio in process through the existing `handleMcp`. The old bridge to a running server is still used when one is named. Every existing `plans_*` name is unchanged. New tools: `plans_tick`, `plans_bind_session`, `plans_rediscover_sessions`. | spawns `cli.mjs mcp` on a fresh workspace: initialize, a notification with no reply, `tools/list` containing every `WORKSPACE_TOOLS` name and only `plans_*` names, then `plans_tick` |
| 1.5 `workspace.tick` | `src/app/tick.mjs`; operation `workspace.tick`, MCP `plans_tick`, CLI `tick`. Takes the `avoozl:workspace-tick` row in `work_locks`, or returns `{skipped: "locked"}`. Loads `.avoozl.json` from the workspace checkout with the same safety and portability checks as layered config, and records its SHA-256 and the `HEAD` commit. An invalid file keeps the last valid policy and raises one `decision` notify intent per distinct file. Returns `{policy, observe, dispatch: [], messages: [], notify}`; `observe` lists bound slots. | two ticks leave every SQLite table byte-identical and return equal results; a held lock returns `locked` and writes nothing; invalid JSON keeps the last valid hash and notifies once; a secret-like key is invalid; a missing file is `absent` |
| 1.7 `plans_bind_session` and rediscovery | `src/app/session-bindings.mjs`; table `session_bindings`; operations `session.bind` and `session.rediscover`. A binding is a slot with a task, a role (`worker`, `verifier`, `responder`, `planner`), and an attempt. Binding the same slot again writes nothing; a slot never moves to another task or role (409). Rediscovery parses `avoozl:<task-id> …` titles, binds unbound slots for known tasks, and reports bound, non-Avoozl, and unknown-task sessions. | binds once and never moves; unknown task 404; empty slot 400; title parsing, including dotted IDs; rediscovery binds only the lost slot as attempt 2; a second rediscovery writes nothing |

All three new operations are classified `execute` in `src/app/safety.mjs`, so an
active andon incident blocks them.

## Security sweep

Searched the whole project, excluding `node_modules`, built bundles, research,
and receipts, for `0.0.0.0`, `[::]`, wildcard service binds, `app.run(host=`,
`listen(`, and `--host`.

| Hit | Verdict |
|---|---|
| `src/app/app-backend.mjs` `server.listen(port, "127.0.0.1")` | New. Loopback, fixed, gated by the signed principal. Live check: `lsof` showed `TCP 127.0.0.1:54041 (LISTEN)` only; `/health` 200; unsigned `/api/command` 401 |
| `src/app/agent-host.mjs` | Loopback, fixed |
| `src/app/ahp/facade.mjs` | Refuses any host outside loopback |
| `src/app/target-listener.mjs` | Loopback by default; a non-loopback bind needs `--allow-remote` plus TLS |
| `src/app/workspace-host-server.mjs` | Defaults to `127.0.0.1` |
| `src/app/team-coordination.mjs` | Refuses wildcard hosts |
| `scripts/vscode-*.mjs` `--host 127.0.0.1` | Loopback |
| `src/app/server.mjs` and `cli.mjs serve` | Already there, not changed here. Defaults to `127.0.0.1`, but `serve --host`, the workspace `host` setting, or `NUPP_WORKSPACE_HOST` can bind any interface with no authentication. **Fix:** in `startServer`, refuse any `host` outside `127.0.0.1`, `::1`, and `localhost`, the way `ahp/facade.mjs` does. Task 5.3 deletes this server; 5.8 re-runs this sweep. |

No credential, workspace data, or machine path was added. `.avoozl.json`
loading refuses secret-like keys and absolute paths.

## Changed files

- `src/app/app-backend.mjs` (new)
- `src/app/session-bindings.mjs` (new)
- `src/app/tick.mjs` (new)
- `src/app/test/kirocrew-runtime.test.mjs` (new)
- `src/app/cli.mjs`: `app-backend`, `tick`, in-process `mcp`, help
- `src/app/mcp.mjs`: three new `plans_*` tools
- `src/app/operations.mjs`: wiring and a `workspaceRoot` option
- `src/app/safety.mjs`: classifications
- `src/app/store.mjs`: `session_bindings` table
- `README.md`: `mcp` behavior
- `docs/evidence/phase1-core-runtime.md` (this receipt)

## Limits

- The last valid policy and the last reported invalid file live in memory. A
  restarted MCP server reports an invalid file once more and has no fallback
  policy. Persist both once policy drives decisions (§4.4).
- `avoozl mcp --workspace PATH` no longer bridges to a running server unless
  `--url` is given. Agent-run tools need that bridge.
- `plans_*` tools take `{input: {...}}`, like every existing tool. The `tick.py`
  sketch in §4.6 passes bare arguments; task 1.4 must wrap them.
- Not checked: running inside a real Kiro Crew install. That is proof P1, after
  the manifest in task 1.3.
