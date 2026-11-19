# Phase 1 app package: tasks 1.3 and 1.4

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 1.

- Implementation commit: `e5c0f58` ("Package the Kiro Crew app with backend, MCP, and tick cron")
- Base: `kirocrew-native` at `40907fe`
- Recorded: 2026-11-11, Node v26.13.0, macOS, Kiro Crew app bundle installed at `/Applications`

## Checks

| Check | Result |
|---|---|
| `npm test` at `e5c0f58` (typecheck, build, all tests) | exit 0; 584 tests, 584 pass, 0 fail |
| New tests, `src/app/test/kirocrew-app-package.test.mjs` | 9 of 9 pass |
| `npm test` in `kirocrew-app/ui` | 3 of 3 pass |
| `git diff --check` | clean |
| Kiro Crew's own parser: `AppManifest.from_json_file(...).validate(app_root)` | no errors, nothing unchecked; `cron_permission_error` empty |
| Kiro Crew's `resolve_stdio_command` on the MCP entry | `python3 bin/avoozl_mcp.py` is anchored to the absolute install path; `node bin/avoozl.mjs mcp` would stay relative to the session's working directory |

`npm test` rebuilds `canvas-app/extension.js` with different output. That file
was restored and is not part of the change.

### Rebuild on the single write path

After the Operations write-path fix (`7998f2a`, evidence `55cf9dc`), the
package was rebuilt from `kirocrew-native` at `55cf9dc`. No package file
changed; `bin/lib` is ignored by git and rebuilt from source.

| Check | Result |
|---|---|
| `npm test` at `55cf9dc` (typecheck, build including `build:kirocrew-app`, all tests) | exit 0; 589 tests, 589 pass, 0 fail |
| `src/app/test/kirocrew-app-package.test.mjs` | 9 of 9 pass |
| `npm test` in `kirocrew-app/ui` | 3 of 3 pass |
| `git diff --check` | clean |
| `bin/lib` holds the fix | every non-test `src` module changed by `7998f2a` (`app-backend`, `cli`, `operations`, `outbox`, `server`, `workspace-host-server`, `workspace`) was rebuilt into `bin/lib` after the source |

## Task coverage

| Task | What landed | Tests |
|---|---|---|
| 1.3 manifest | `kirocrew-app/app.json` per §4.2: three agents, skill, `mcpServers.avoozl`, node backend `bin/avoozl.mjs` with `healthCheck` and `signedPrincipal: true`, script cron `avoozl-tick` (60 s, silent, no persistent session), `decision` and `failure` channels, `gh` optional. Added what Kiro Crew requires beyond §4.2: `permissions.cron` (install refuses crons without it) and `permissions.api: ["/apps/avoozl/api/*"]` (the Workspace view's calls, from task 1.6). | manifest shape; every target resolves inside the package |
| 1.3 package | `scripts/build-kirocrew-app.mjs` copies `cli.mjs`, its imports, and its npm dependencies into `kirocrew-app/bin/lib` with rolldown (`preserveModules`, so schemas, the skill, and examples beside each module still resolve). Kiro Crew copies the app folder on install and refuses entry points outside it. `bin/lib` is ignored by git and built by `npm run build:kirocrew-app`, which `npm test` runs. | MCP and backend run from the package in an unrelated directory; no build-machine path in `bin/lib` |
| 1.3 launcher | `kirocrew-app/bin/avoozl.mjs`: no command means `app-backend` (Kiro Crew passes no arguments); `mcp` is the only other command; anything else exits 2. With no `--workspace` or `AVOOZL_WORKSPACE` (or older aliases), it serves the machine catalog's default workspace. | `serve` refused; catalog default served |
| 1.3 MCP anchor | `kirocrew-app/bin/avoozl_mcp.py` execs `node <app>/bin/avoozl.mjs mcp`. This replaces §4.2's `node bin/avoozl.mjs mcp`, which Kiro Crew would start in the session's directory where the relative path does not exist. | `plans_tick` answered over stdio |
| 1.3 agents | `avoozl-planner` (read tools, `@avoozl`), `avoozl-verifier` (read tools, shell, `@avoozl`), `avoozl-responder` (read tools, only `@avoozl/plans_post_reply`). Minimal prompts; Phase 2 and 4 tasks own their behavior. | names match files; responder has no shell |
| 1.4 `crons/tick.py:run` | §4.6 flow: `plans_tick`; for each `observe`, `kirocrew-dashboard` `session_status` then `plans_session_status`; for each `dispatch`, find or create the slash-path folder, `open_session(title, folder_id, agent)`, `plans_bind_session` before `send_to_session(brief)`; then `messages` and `notify`. Every `plans_*` call is wrapped as `{"input": {...}}`. `Skip` when locked or with nothing to send. | idle and locked skip after one call; observe-only records status then skips; full flow order with bind before brief and folders created as nested parts |

## Security checks

| Check | Result |
|---|---|
| Bind | Backend code unchanged: `server.listen(port, "127.0.0.1")`. Test starts the packaged launcher with `PORT=0` and reads `listening on 127.0.0.1:<port>`. |
| Principal checks | Unchanged. From the package: `/health` 200; unsigned `POST /api/command` 401. |
| Packaged surface | The launcher serves only `app-backend` and `mcp`. `serve`, which can bind other interfaces (finding in `phase1-core-runtime.md`), is refused from the package. `bin/lib/src/app/server.mjs` is still copied because `cli.mjs` imports it; it runs only if someone invokes `bin/lib/cli.mjs serve` directly. |
| Cron | Uses only `ScriptContext` methods and the declared MCP servers; it holds no credential. Kiro Crew redacts names and messages it sends. |
| Sweep | Searched `src`, `scripts`, `cli.mjs`, and the new package files for `0.0.0.0`, `[::]`, and `listen(`. Same hits as `phase1-core-runtime.md`, none new; no new `--host`. |

No credential, workspace data, or machine path was added.

## Changed files

- `kirocrew-app/app.json`
- `kirocrew-app/bin/avoozl.mjs` (new)
- `kirocrew-app/bin/avoozl_mcp.py` (new)
- `kirocrew-app/bin/.gitignore` (new; ignores `lib/`)
- `kirocrew-app/crons/tick.py` (new)
- `kirocrew-app/agents/avoozl-planner.json`, `avoozl-verifier.json`, `avoozl-responder.json` (new)
- `kirocrew-app/README.md`: what the package contains and how it picks a workspace
- `scripts/build-kirocrew-app.mjs`: package the CLI into `bin/lib`
- `src/app/test/kirocrew-app-package.test.mjs` (new)
- `docs/evidence/phase1-app-package.md` (this receipt)

## Limits

- `plans_session_status` does not exist yet in `src/app/mcp.mjs`. Until it
  lands, a tick with any bound session fails at observation, before dispatch.
  It must land before proof P2.
- Whether a script cron may call `kirocrew-dashboard` `session_status` is still
  unverified (§4.6, MC-2); P2 checks it.
- Opening and messaging sessions needs Kiro Crew's `agent.session_control`.
- Notify intents carry a `channel`; the cron sends only the text, as in §4.6.
  Routing to the declared channels is task 2.12.
- `bin/avoozl_mcp.py` falls back to Homebrew and system `node` paths because
  the Mac app does not inherit the shell `PATH`.
- Not checked: installing the package in a real Kiro Crew profile. That is
  proof P1.
