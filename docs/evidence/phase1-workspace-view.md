# Phase 1 Workspace view: task 1.6

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 1.

- Implementation commit: `31f14f0` ("Add Workspace view and its backend operations")
- Base: `kirocrew-native` at `5202d53`
- Recorded: 2026-11-11, Node v26.13.0, macOS

## Checks

| Check | Result |
|---|---|
| `npm test` at `31f14f0` (typecheck, build, all tests) | exit 0; 575 tests, 575 pass, 0 fail |
| `npm test` in `kirocrew-app/ui` (`node --test test/`) | 3 of 3 pass |
| `npm run build:kirocrew-app` (UI `tsc` and Vite build) | exit 0; `kirocrew-app/ui/dist/index.mjs` 12.18 kB |
| New backend tests, `src/app/test/kirocrew-workspace-view.test.mjs` | 4 of 4 pass |
| `git diff --check` | clean |
| `prettier --check` on changed `src/app` files | clean |

`npm test` rebuilds `canvas-app/extension.js` with different output. That file
was restored and is not part of the change.

## What landed

| Part | Change | Tests |
|---|---|---|
| Machine catalog | `app-backend.mjs` serves `workspaces.list`, `workspaces.add`, and `workspaces.init` over the machine `WorkspaceRegistry`. List marks the workspace this backend serves. Add and init need an absolute directory; a taken ID is 409; init refuses an existing workspace (409). Registry validation errors are 400. | lists empty, inits, adds, lists both; relative, duplicate, existing, missing directories refused |
| Workspace selection | A command may name `workspaceId`. Only registered catalog roots are opened, one store per root. Unknown ID 404; non-string 400. Without it, the served workspace is used, as before. | repository registered in a catalog workspace; served workspace unchanged |
| Repository registration | Existing `repositories.list` and `repositories.configure`, routed by `workspaceId`. | as above |
| Tick | The page may run `workspace.tick`. Each tick writes a last-run receipt, `tick-health.json`, beside the database (mode 0600, atomic rename), outside SQLite. | tick leaves the revision unchanged |
| Tick health | New observe operation `workspace.tick.health`: last run (time, outcome, policy status, error) and the tick lock holder with liveness. Reads only. | never run; ok after a tick; held lock shows `locked` and the live pid |
| Workspace view | `kirocrew-app/ui/src/WorkspaceView.tsx` over `useAppApi()`: catalog list, add or initialize, repositories of the selected workspace with a register form, tick health with "Run tick now". Labeled fields, `role="alert"` errors. `workspace-api.ts` holds the calls and the health line. | client sends each operation to `/apps/avoozl/api/command` with the right shape; error text; health line cases |

## Security checks

| Check | Result |
|---|---|
| Bind | Unchanged: `server.listen(port, "127.0.0.1")`, no host option. Live: `lsof` showed `TCP 127.0.0.1:59147 (LISTEN)` only. |
| Unsigned calls | Live: `/health` 200; unsigned `workspaces.list`, `workspaces.init`, `workspace.tick`, `workspace.tick.health` all 401, and init created no directory. |
| Principal checks | Unchanged verification. Authorization now covers the new operations: owner sessions may run all; app tokens and agent tools may list workspaces and read tick health, and get 403 for add, init, and tick. Anything else outside the app API stays 403. |
| Paths | Workspace roots open only from the catalog. Add and init take an owner-supplied absolute path and reuse registry validation (no symlinked database paths, no shared roots or checkouts). |
| Sweep | Searched `src`, `kirocrew-app`, `cli.mjs`, `scripts` for `0.0.0.0` and `[::]`: only `team-coordination.mjs`, which refuses them. No new `listen(` or `--host`. The `server.mjs` finding in `phase1-core-runtime.md` stands; this change does not touch it. |

No credential, workspace data, or machine path was added.

## Changed files

- `src/app/app-backend.mjs`: machine operations, `workspaceId`, authorization
- `src/app/tick.mjs`: last-run receipt, `tickHealth`
- `src/app/operations.mjs`: `workspace.tick.health`
- `src/app/safety.mjs`: `workspace.tick.health` is `observe`
- `src/app/test/kirocrew-workspace-view.test.mjs` (new)
- `kirocrew-app/ui/src/WorkspaceView.tsx` (new)
- `kirocrew-app/ui/src/workspace-api.ts` (new)
- `kirocrew-app/ui/src/App.tsx`: renders the view
- `kirocrew-app/ui/src/kirocrew-app-sdk.d.ts`: `useAppApi`, `Input`
- `kirocrew-app/ui/test/workspace-api.test.mjs` (new)
- `kirocrew-app/ui/package.json`: `test` script
- `kirocrew-app/ui/dist/index.mjs`: rebuilt
- `docs/evidence/phase1-workspace-view.md` (this receipt)

## Limits

- `useAppApi()` only reaches paths in the manifest's `permissions.api`. Task
  1.3 must declare `/apps/avoozl/api/*` in `kirocrew-app/app.json`, which this
  task does not own.
- Kiro Crew folder and project-directory status from §8 are not shown; they
  need Kiro Crew's folder API.
- The last-run receipt is a file write on every tick. SQLite stays untouched.
- If init succeeds and registration then fails, the new workspace stays on
  disk unregistered; "Add existing" registers it.
- Not checked: the page inside a real Kiro Crew install. That is proof P1.
