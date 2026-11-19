# Working on Avoozl

Approve a spec; Avoozl runs it with coding agents, checks each commit itself,
and lands it. It is a local application with a Kiro Crew app page, CLI, and
MCP interface. Its agent sessions run in Kiro Crew chats or as process
harnesses under its supervisor. It pushes and merges by each repository's
`landing` setting, after checks pass on the exact head. UI, CLI, and MCP
share operations. Each feature's operations are one table of
`{name, class, policy, handler}` entries in `src/app/ops/` (the dispatcher, the
class list and the MCP policy read `src/app/operation-table.mjs`), and each CLI
command is an entry `{command, help, run}` in `src/app/commands/`. Add an
operation or command as one entry; never add it to a list elsewhere.
SQLite owns execution state; Markdown owns design prose.

Keep application source independent of workspace paths and data. Tests use
isolated temporary workspaces. Do not add real workspace databases, machine
configuration, provider credentials, transcripts, or personal plans to this repo.
Screenshots are never committed: keep them outside git and show them in chat.

Use a task worktree for changes. Preserve other work and active agent sessions.
Run `npm run format` (Biome) before committing; CI runs `npm run format:check`.
Markdown is not auto-formatted.
Run `npm test` and `git diff --check` before landing. `npm run test:changed`
runs only the tests a change reaches, as CI does. The built page
(`kirocrew-app/ui/dist`) is not in git; `npm run build` makes it. Do not add commit attribution
or co-authors. Use short imperative commit messages.

Run `npm run dup:changed` before opening or updating a pull request. It
fails when the change adds a copy/paste clone or grows one. Remove the clone
by sharing the code (a helper, a loop, a table); do not suppress it or add
an ignore. `npm run dup` checks the whole repo against
`scripts/dup-baseline.json`; when a cleanup lowers the count, run
`npm run dup -- --update` and commit the lower baseline.

Initialization creates an empty workspace. Example data is explicitly requested,
transactional, and installed once. Preserve edits on retries. Never use example
installation to approve drafts, start agents, or configure an execution repository.

Never replace a disconnected worker solely
because its activity lease expired. Keep plan approval, implementation,
integration, and whole-head acceptance distinct.

The Nupp plans workspace uses this same application. Its own rules and data remain
outside this repo. Keep the narrow `plans_*` MCP tools a role's agent, prompt
or brief names, so no agent's allowed tools grow.

No backward compatibility until Avoozl has other users.

Research under `docs/research/` and generated receipts under `docs/evidence/`
record what was observed at the time: do not rewrite their contents to match a
later name; regenerate a receipt instead.
