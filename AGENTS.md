# Working on Avoozl

Avoozl is a local planning application with a Kiro Crew app page, CLI, and MCP
interface; Kiro Crew runs its agent sessions. UI, CLI, and MCP share operations in
`src/app/operations.mjs`.
SQLite owns execution state; Markdown owns design prose.

Keep application source independent of workspace paths and data. Tests use
isolated temporary workspaces. Do not add real workspace databases, machine
configuration, provider credentials, transcripts, or personal plans to this repo.

Use a task worktree for changes. Preserve other work and active agent sessions.
Run `npm test` and `git diff --check` before landing. Do not add commit attribution
or co-authors. Use short imperative commit messages.

Initialization creates an empty workspace. Example data is explicitly requested,
transactional, and installed once. Preserve edits on retries. Never use example
installation to approve drafts, start agents, or configure an execution repository.

Never replace a disconnected worker solely
because its activity lease expired. Keep plan approval, implementation,
integration, and whole-head acceptance distinct.

The Nupp plans workspace uses this same application. Its own rules and data remain
outside this repo. Existing `plans_*` MCP names and NUPP_WORKSPACE environment
aliases are compatibility interfaces; preserve them when changing public surfaces.

This application was renamed from AICommander to Avoozl. `AVOOZL_*` is the
current environment prefix, and `AICOMMANDER_*`, `NUPP_WORKSPACE_*`, the
`aicommander` command name, and the `aicommander.*` editor settings remain
accepted for the same reason. Research under `docs/research/` and generated
receipts under `docs/evidence/` record what was observed at the time: do not
rewrite their contents to match a later name; regenerate a receipt instead.
