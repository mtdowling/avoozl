# Phase 5: website, intake callback, and queue browser removal

Tasks 5.3 (R1.3) and 5.5 (R26.1), design §9.

- Base: `kirocrew-native` at `c7a1a81`, rebased onto it and fast-forwarded under `$TMPDIR/avoozl-kirocrew-native-land.lock` (`lockf`)
- Code commit: `4da8705` Remove the website, intake callback and queue browser

## What was deleted

Website (5.3):

- `src/app/server.mjs`, the single-workspace site, its HTTP MCP endpoint, its
  SSE event stream, and its `/api/github-intake` route.
- `src/app/compat-server.mjs`. Its `generate` (Markdown reindex) moved into
  `src/app/cli.mjs`, so `avoozl generate` still works.
- `src/web/` (15 files), the React site. `src/app/ui/` (routing-policy form and
  usage charts). `ui-dist` was a build output and its `.gitignore` line is gone.
- `vite.config.ts` and `tsconfig.json` (both covered only `src/web`).
- Page modules that touched the DOM: `src/facets.mjs`, `src/onboarding.mjs`,
  `src/progress.mjs`, `src/strip.mjs`, `src/virtual-list.mjs`,
  `src/workbench.mjs`, `src/style.css`, and their `.d.mts` files.
- CLI: the `serve --workspace` site mode (with `--ahp`) and `reload`. The
  machine-host `serve` branch (`workspace-host-server.mjs`) belongs to task 5.1.
- npm scripts: `build:web`, `dev:web`, `typecheck`, `start`, `prestart`. `build`, `prepack`, and `pretest` now run only `build:kirocrew-app`.

Intake callback and queue browser (5.5):

- `src/app/github-intake.mjs` (capability tokens and snapshot ingest) and the
  `/api/github-intake` route in `server.mjs` and `workspace-host-server.mjs`.
- `src/app/github-queue.mjs`, `src/app/github-overlap.mjs`, `src/queue-triage.mjs`.
- Operations: `github.intake.capabilities`, `github.intake.capability.create`,
  `github.intake.capability.revoke`, `github.queue.configure`,
  `github.queue.remove`, `queue.items`, `queue.comments`, `queue.diff`,
  `queue.sync`, `queue.claim`, `queue.createTask`, `queue.confirmLink`,
  `work.take`. Removed from `operations.mjs`, `client.mjs`, and `safety.mjs`.
- `repositories.configure` no longer takes `monitorIssues` or
  `monitorPullRequests`. `github.project.connect` configures issue intake only.
  `primary.rebuild` no longer syncs the queue.

Kept on purpose:

- Pure models and their tests: `graph-layout`, `query`, `progress-model`,
  `markdown`, `marked`, `highlight`, `document-pages`, `band-paint`,
  `strip-model`, `agent-pins`, `pan-momentum`, `web-notifications`,
  `workbench-model`, `browse-model`, `views.mjs` (run pages for operations).
- The queue SQLite tables stay as read-only history. Old rows still read in
  status, review requests, design extraction, and portable publication.
  `queueAssociationId` moved into `workspace-repository.mjs` so published
  association files keep their names.
- Settings files with a `github.queue` section still parse.
- `queue.design.triage` (plan triage) stays.

## Tests

`npm test`: 618 of 618 passed. `kirocrew-app/ui` tests: 21 of 21 passed.
`git diff --check` clean. Prettier clean on changed files. The app package
was rebuilt by `pretest` (`npm run build:kirocrew-app`).

New tests in `src/app/test/kirocrew-runtime.test.mjs`:

- Each page view loads through the app backend with a signed principal and
  returns 200: `workspaces.list`, `repositories.list`, `plan.specs`,
  `graph.view`, `delivery.view`, `conflicts.view`, `github.settings.get`,
  `workspace.tick.health`.
- Each removed route returns 401 unsigned and 404 signed:
  `POST /api/github-intake`, `POST /github-intake`, `GET /`, `GET /index.html`,
  `GET /api/view-state`, `GET /database.json`, `GET /api/events`,
  `POST /api/operation`, `POST /mcp`.
- Each removed operation sent to `/api/command` with a signed owner principal
  returns 403 and runs nothing.
- `Operations.execute` rejects removed queue and intake operations with 404.

Existing tests still cover the rest: unsigned calls get 401, only `/health`
is unsigned, and the backend binds 127.0.0.1.

Tests removed with the code they covered: the HTTP site tests (`http`,
`reload`, `workspace-events`, `multi-workspace-web`, the `web-*` source
checks, the HTTP cases in `report.test.mjs` and `workspace.test.mjs`), the
intake and queue tests, `routing-policy-form`, the DOM page tests
(`deeplinks`, `session-navigation`, `enhanced-graph`, `epic-gestures`,
`strip-overlay`, two `workbench` cases), the facets and virtual-list cases,
`github-workflow-docs` (it only checked `src/web` and removed OpenHands docs),
and queue-dependent cases in `design-extraction`, `repository-settings`, and
`workspace-repositories`.

## Listeners left

`src/app/app-backend.mjs` on 127.0.0.1. Still present and owned by task 5.1:
`workspace-host-server.mjs`, `agent-host.mjs`, `target-listener.mjs`.
