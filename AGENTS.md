# Working on Avoozl

Approve a spec; Avoozl runs it with coding agents, checks each commit itself,
and lands it. It is a local application with a Kiro Crew app page, CLI, and
MCP interface. Its agent sessions run in Kiro Crew chats or as process
harnesses under its supervisor. It pushes and merges by each repository's
`landing` setting, after checks pass on the exact head. UI, CLI, and MCP
share operations in `src/app/operations.mjs`.
SQLite owns execution state; Markdown owns design prose.

Keep application source independent of workspace paths and data. Tests use
isolated temporary workspaces. Do not add real workspace databases, machine
configuration, provider credentials, transcripts, or personal plans to this repo.
Screenshots are never committed: keep them outside git and show them in chat.

Use a task worktree for changes. Preserve other work and active agent sessions.
Run `npm test` and `git diff --check` before landing. `npm run test:changed`
runs only the tests a change reaches, as CI does. The built page
(`kirocrew-app/ui/dist`) is not in git; `npm run build` makes it. Do not add commit attribution
or co-authors. Use short imperative commit messages.

Initialization creates an empty workspace. Example data is explicitly requested,
transactional, and installed once. Preserve edits on retries. Never use example
installation to approve drafts, start agents, or configure an execution repository.

Never replace a disconnected worker solely
because its activity lease expired. Keep plan approval, implementation,
integration, and whole-head acceptance distinct.

The Nupp plans workspace uses this same application. Its own rules and data remain
outside this repo. NUPP*WORKSPACE environment aliases are compatibility
interfaces; preserve them when changing public surfaces. The deprecated
one-tool-per-operation `plans*\*` MCP names were removed, except the narrow
tools a role's agent, prompt or brief names; keep those so no agent's
allowed tools grow.

This application was renamed from AICommander to Avoozl. `AVOOZL_*` is the
current environment prefix, and `AICOMMANDER_*`, `NUPP_WORKSPACE_*`, the
`aicommander` command name, and the `aicommander.*` editor settings remain
accepted for the same reason. Research under `docs/research/` and generated
receipts under `docs/evidence/` record what was observed at the time: do not
rewrite their contents to match a later name; regenerate a receipt instead.
