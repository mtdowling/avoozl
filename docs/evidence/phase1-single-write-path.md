# Phase 1 single write path

Tasks 1.1, 1.2 and 1.5 now share one SQLite write boundary: `Operations`.
The task spec was not changed. `kirocrew-app/**` and
`scripts/build-kirocrew-app.mjs` were not touched.

Base: `kirocrew-native` at `d3ac3d1`. Work commit: `7998f2a`
(`Route every SQLite write through Operations`).

## Callers

| Caller | Write path |
| --- | --- |
| App backend (`cli.mjs app-backend`) | `Operations.execute` |
| Stdio MCP server (`cli.mjs mcp`) | `handleMcp` -> `Operations.execute` |
| Tick cron | `plans_tick` on the MCP server -> `Operations.execute` |
| CLI, no server URL | `Operations.execute`, `importSnapshot`, `initialize` |

## Changed files

- `src/app/operations.mjs`: `execute` runs `perform`, then publishes the
  outbox when given `plansRoot`. New `initialize` and `importSnapshot`
  entry points.
- `src/app/outbox.mjs`: `flushOutbox` moved here from `server.mjs`, unchanged.
- `src/app/app-backend.mjs`: passes `plansRoot` to Operations; no direct
  `flushOutbox`.
- `src/app/cli.mjs`: local mode, `import` and `mcp` go through Operations;
  no direct `flushOutbox` or `store.importSnapshot`.
- `src/app/workspace.mjs`: `initializeWorkspace` writes through
  `Operations.initialize`.
- `src/app/server.mjs`, `src/app/workspace-host-server.mjs`,
  `src/app/test/workflow.test.mjs`: import `flushOutbox` from `outbox.mjs`.
- Tests: `src/app/test/single-write-path.test.mjs` (CLI),
  `src/app/test/single-write-path-servers.test.mjs` (MCP, tick, backend),
  `src/app/test/write-path.mjs` (helpers), `src/app/test/write-trace.mjs`
  (preload).

Direct reads stay: callers still open a `Store` to read and close it.

## How the tests prove it

`write-trace.mjs` is preloaded into each real `cli.mjs` process. It logs every
SQLite statement that changes rows and whether `src/app/operations.mjs` is on
the stack. With `AVOOZL_DENY_OPERATIONS=1` every Operations write entry point
throws.

- Allowed: CLI `init`, `import`, `update`, `tick`; MCP `plans_update_task`,
  `plans_tick`, `plans_bind_session`; backend `task.update`,
  `workspace.tick`. Every traced write is inside Operations.
- Denied: the same CLI, MCP and backend calls fail, and a dump of every row
  of every table is unchanged. A denied `init` leaves no snapshot.

## Results

- `npm test`: 589 tests, 589 pass, 0 fail, 0 cancelled (`/tmp/swp-test4.log`).
- `git diff --check`: clean, including new files.
- The earlier run had one failure in `ahp-facade.test.mjs`
  ("concurrent clients see the same actions in the same order"). It passed
  5 of 5 alone and in the final full run; it is not touched by this change.

## Security checks

- The app backend still binds `127.0.0.1` (test waits for
  `listening on 127.0.0.1:<port>`).
- Principal checks are unchanged: the tests send signed owner-session
  `X-KiroCrew-Principal` claims over `KIROCREW_PROXY_SECRET`.
- No route, handler or bind address changed. The backend handler only lost
  its direct outbox flush, which Operations now does.
- `flushOutbox` path and symlink checks moved unchanged.
