# Phase 5 tasks 5.2 and 5.4: OpenHands Canvas and VS Code client removal

Date: 2026-11-12. Branch `task/p5-ext` off `kirocrew-native` at `9f62a7a`.
Code commit: `f31f057`. Spec: design §9 rows "OpenHands" and "VS Code
extension"; requirement R1.3.

## Deleted

| Area | Paths |
|---|---|
| Canvas app | `canvas-app/` (extension bundle, manifest, icon, packaged Linux backends), `vite.canvas.config.ts`, `src/web/canvas.tsx`, `src/web/canvas-chat.tsx`, `src/web/openhands-navigation-context.tsx`, `src/web/openhands-sidebar-mobile-nav-context.tsx` |
| Canvas backend | `canvas-backend/avoozl-backend`, `scripts/package-canvas-backend.mjs` |
| OpenHands integration | `src/app/openhands-app.mjs` (Canvas install, agent setup), `src/app/openhands-automations.mjs`, `src/app/openhands-surface.mjs` (surface proxy and WebSocket bridge), `src/app/providers/openhands-plugin/` |
| OpenHands docs | `docs/openhands.md`, `docs/design/openhands-github-product.md` |
| VS Code extension | `extension/`, `scripts/package-extension.mjs`, `scripts/vscode-*.mjs` (9 fixture, drive and evidence scripts) |
| Agent Host Protocol facade | `src/app/ahp/` (events, facade, main, projection, translate, uris) |
| VS Code docs | `docs/design/vscode-client.md`, `docs/design/vscode-handoff.md`, `docs/design/surface-decision.md` |
| Tests of deleted code | `openhands-app.test.mjs`, `openhands-automations.test.mjs`, `ahp-facade.test.mjs`, `ahp-projection.test.mjs`, `extension.test.mjs`, `serve-facade.test.mjs`, the surface tests in `openhands.test.mjs` and `workspace-host-server.test.mjs`, the product-doc tests in `github-workflow-docs.test.mjs` |

Removed with them:

- CLI: the `openhands` command, `ahp` command, `editor` command, `serve --ahp`,
  and their help lines (`src/app/cli.mjs`); `config.ahp` (`src/app/config.mjs`).
- Operations: the seven `openhands.automations.*` operations,
  `provisionGitHubIntake`, and the `automation` and `automationProvisioning`
  fields of `github.queue.configure`, `repositories.configure` and
  `github.project.connect` (`src/app/operations.mjs`, `client.mjs`,
  `safety.mjs`).
- Servers: the `/openhands/*` proxy, `/api/openhands-surface`, and the
  OpenHands WebSocket proxy in `server.mjs` and `workspace-host-server.mjs`;
  the automations wiring in `server.mjs` and `workspace-manager.mjs`.
- `package.json`: scripts `build:canvas`, `package:canvas-backend`,
  `package:extension`, `fixture`, `evidence`; `build` no longer runs the
  Canvas build; `format` and `format:check` no longer name `extension` or
  `canvas-app`; `files` drops `canvas-app/` and `extension/`; dependencies
  `@openhands/agent-canvas`, `@openhands/extensions` and
  `@microsoft/agent-host-protocol`. The lock file lost 341 packages and no
  remaining package changed version.
- `vite.config.ts`: the OpenHands navigation bridge plugin.
- `README.md`: the Canvas App setup and the VS Code client section.

## Checks

| Check | Result |
|---|---|
| `npm test` (typecheck, web build, app package build, tests) | 741 of 741 pass |
| `git diff --check` | clean |
| Imports of a deleted module | none (`git grep` for `openhands-app`, `openhands-automations`, `openhands-surface`, `openhands-plugin`, `/ahp/`, `agent-host-protocol`, `canvas-app`, `canvas-backend`, `vite.canvas`, `package-extension`, `vscode-`) |
| `node cli.mjs tick` on a new workspace | prints intents, no error |
| `node cli.mjs mcp` `tools/list` | 88 tools |
| `node cli.mjs app-backend` | `/health` returns `{"ok":true,"app":"avoozl"}`; an unsigned `/api/workspace` returns 401 |
| `npm run build:kirocrew-app` | rebuilt; no tracked change under `kirocrew-app/` |

## What still mentions these names, and why

| Where | Why it stays |
|---|---|
| `src/app/providers/openhands.mjs`, `src/app/openhands-target.mjs`, `openhands.test.mjs`, `providers/executor.mjs`, `manager.mjs`, `agent-routing.mjs`, `telemetry.mjs`, `target-listener.mjs`, `team-coordination.mjs`, the `openhands.profiles` and `openhands.models` operations, `@openhands/typescript-client` | OpenHands as a run provider and execution target. Tasks 5.1 and 5.6 delete providers, routing, telemetry and targets. `OPENHANDS_PLUGIN.source` in the provider now names a deleted folder; it is only read when an OpenHands run starts |
| `canvasOrigins` and `--canvas-origin` in `cli.mjs`, `config.mjs`, `server.mjs`, `workspace-host-server.mjs`; the OpenHands recovery page in `server.mjs` | The website's allowed-origin list and recovery page. Task 5.3 deletes `server.mjs` host modes |
| `src/web/`, `src/*.mjs` page modules and their tests | Task 5.3. Hits in `progress.mjs` and `strip.mjs` are the HTML `<canvas>` element |
| `ahp` keys in `layered-config.mjs` and `src/avoozl-config.schema.json` | Old `.avoozl.json` and `workspace.json` files that set them still load. Nothing reads the value now |
| README routing paragraph | Describes provider routing, deleted by task 5.1 |
| `plans/*.md` | Old design prose kept as history |
| `docs/research/vscode/`, `docs/evidence/vscode/` | Research and receipts stay as recorded (AGENTS.md) |
| `src/app/git.mjs` comment on OpenHands Git isolation | Explains a Git config guard that still applies to any isolated agent |
