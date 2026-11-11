---
name: avoozl-ui
description: Edit, verify, rebuild, reinstall, and safely reload Avoozl's React and OpenHands Canvas web UI when working in the Avoozl application repository.
---

# Avoozl UI maintenance

Use this skill only in an Avoozl application source checkout. Keep workspace
databases, credentials, transcripts, and machine-local configuration out of the
repository.

## Edit the UI

- Work in the task's isolated worktree and preserve unrelated edits and active
  sessions.
- Treat `src/web/` as source. `canvas-app/extension.js` is the generated,
  installable OpenHands Canvas bundle; do not hand-edit it.
- Reuse existing components, tokens, responsive behavior, and OpenHands bridges
  before adding another UI pattern.
- Verify the changed interaction at desktop and narrow widths. Cover meaningful
  behavior with tests rather than assertions that only match copy.

## Build and install

Run the repository's required checks, including `npm test` and
`git diff --check`. A web UI change must leave a freshly generated
`canvas-app/extension.js`; review its presence separately from the source diff.

After the change is ready:

1. Run `npm run build:canvas`.
2. Run `avoozl openhands install-app` from this checkout to refresh the installed
   Canvas extension and packaged skills.
3. Verify `avoozl openhands status` and the Avoozl health endpoint, then refresh
   the OpenHands page.

Pure Canvas UI changes do not require stopping Avoozl or its agent host.

## Reload safely

Restart only when server-side code or served standalone assets require it.

- Inspect `avoozl status` first. Do not replace or stop a host with active or
  queued work.
- For a single-workspace server, prefer
  `avoozl reload --workspace <workspace-root>`; it preserves the separate agent
  host.
- For the multi-workspace host, drain every enabled workspace, stop the serving
  process gracefully, restart the same `avoozl serve` command from the updated
  checkout, and resume the workspaces. Never use a force kill to bypass drain.
- If agent-host code changed, follow the stricter repository drain/stop
  contract. A disconnected or stale worker is not permission to replace it.
- Verify health, workspace readiness, concurrency limits, and OpenHands app
  status after restart. If recovery is incomplete, leave intake drained and
  report the exact failing check.
