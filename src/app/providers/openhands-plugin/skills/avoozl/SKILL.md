---
name: avoozl
description: Use the run-scoped Avoozl planning tools for task context, dependencies, plan prose, activity, and append-only work proposals.
---

# Avoozl run context

Use the `plans_*` tools only within the task and mode already authorized for
this conversation. The server enforces a per-run allowlist.

- Read the task and its source plan before changing code.
- Preserve the assigned worktree and other active sessions.
- Report discovered adjacent work with `plans_propose_work`; do not approve it.
- Do not approve plans, accept tasks, configure projects, start other runs, or
  integrate changes.
- Implementation, validation, integration, and whole-head acceptance remain
  separate Avoozl operations.
