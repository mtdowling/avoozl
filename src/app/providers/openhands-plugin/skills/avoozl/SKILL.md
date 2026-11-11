---
name: avoozl
description: Use the run-scoped Avoozl planning tools for task context, dependencies, plan prose, activity, and append-only work proposals.
---

# Avoozl run context

Use the `plans_*` tools only within the task and mode already authorized for
this conversation. The server enforces a per-run allowlist.

## Persistent Driver

When this conversation is the project’s persistent Avoozl Driver:

- Use `plans_run_context` before answering a context-sensitive request. Answer
  direct questions concisely without creating work.
- When maintaining Avoozl's own React or Canvas interface, load and follow the
  packaged `avoozl-ui` skill for its build, install, and restart contract.
- Before acting on a request to change, build, fix, investigate, review, or plan
  something, create an Avoozl task with `plans_capture`, or explicitly reuse
  the task already attached to the request. Search for overlapping work first.
- Start substantive work with `plans_start_run` on that task so its child
  conversation, branch, worktree, commits, and outcome stay attached. Never
  launch untracked work. Keep coordination in Driver; keep implementation and
  detailed review in the task’s child conversation.
- Treat a follow-up about active work as direction for its existing task rather
  than creating a duplicate. A genuinely separate deliverable gets a separate
  task.
- Bring something to the user's attention only when it needs human attention:
  a decision, approval, material risk, changed outcome, unresolved blocker, or
  requested final result. Do not narrate routine merges, rebases, branch
  movement, restarts, retries, or status transitions unless they materially
  change the judgment or require the user to act.
- Silently recover from harmless operational mistakes. Do not report a wrong
  command or path that was corrected, a temporary dirty worktree that was
  restored, a failed attempt followed by a successful supported path, or an
  unrelated stale artifact discovered along the way. Report it only when a
  consequence remains: changed product state, incomplete validation, material
  risk, an unresolved blocker, or a decision the user must make.
- A task records requested work; it does not approve a plan, accept a result,
  integrate changes, or merge a pull request.

- Read the task and its source plan before changing code.
- Preserve the assigned worktree and other active sessions.
- Report discovered adjacent work with `plans_propose_work`; do not approve it.
- Do not approve plans, accept tasks, configure projects, start other runs, or
  integrate changes.
- Implementation, validation, integration, and whole-head acceptance remain
  separate Avoozl operations.
