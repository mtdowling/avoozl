# Working on Avoozl

Avoozl is a local planning application with a website, CLI, MCP interface,
and managed agent host. UI, CLI, and MCP share operations in `src/app/operations.mjs`.
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

Web reloads preserve the separate agent host. Drain before updating host code;
stop refuses while work is active. Never replace a disconnected worker solely
because its activity lease expired. Keep plan approval, implementation,
integration, and whole-head acceptance distinct.

The Nupp plans workspace uses this same application. Its own rules and data remain
outside this repo. Existing `plans_*` MCP names and NUPP_WORKSPACE environment
aliases are compatibility interfaces; preserve them when changing public surfaces.
