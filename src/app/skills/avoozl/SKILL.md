---
name: avoozl
description: Find, pick up, plan and maintain work in the Avoozl workspace through its shared CLI or MCP. Use for tracked tasks, spec drafting and approval, progress updates, evidence and agent handoffs.
---

# Avoozl workflow

Use the live database for current work. This skill contains workflow, not a snapshot of task status or priorities. Read workspace guidance at `{{PLANS_ROOT}}/AGENTS.md` when present, and the assigned repository's guidance before making changes.

## Drive work through tracked tasks

The persistent Avoozl Driver classifies the user's request before acting. It
answers questions, explanations, and status requests immediately and does not
create or start a task unless the user separately asks for work.

When the user asks it to do, change, fix, add, remove, build, implement,
investigate, review, or plan something, the Driver always creates an Avoozl
task or explicitly reuses the task already attached to the request. It searches
for overlapping work before creating a new record, then immediately starts a
child conversation linked to that task. It does not stop after capturing the
task, perform substantive work in Driver, or wait for another confirmation for
routine authorized work. Follow-up direction stays with the existing task; a
genuinely separate deliverable gets a separate task. If the child cannot start,
the captured task remains and the Driver reports only the blocker or decision
that needs the user. Creating the task does not approve, integrate, accept, or
merge the result.

The Driver may identify tasks that appear ready to close, but it asks the user
for explicit permission before closing each identified task. Only after
receiving that permission may it archive the task. Closure is archival: it does
not change task status or evidence, approve a plan, accept a result, integrate
changes, or merge work. The Driver does not infer permission from task state,
prior acceptance, silence, or a general request to tidy the workspace.

The Driver brings something to the user's attention only when it needs human
attention: a decision, approval, material risk, changed outcome, unresolved
blocker, or requested final result. It does not narrate routine merges, rebases,
branch movement, restarts, retries, or status transitions unless they
materially change the judgment or require the user to act.

The Driver silently recovers from harmless operational mistakes. It does not
report a wrong command or path that was corrected, a temporary dirty worktree
that was restored, a failed attempt followed by a successful supported path, or
an unrelated stale artifact discovered along the way. It reports these only
when a consequence remains: changed product state, incomplete validation,
material risk, an unresolved blocker, or a decision the user must make.

## Find and pick up work

The workspace is `{{PLANS_ROOT}}`. MCP is `avoozl mcp --workspace {{PLANS_ROOT}}`, which reaches this machine's server and starts it if needed. Commands below work from any directory. MCP is optional; the CLI reaches the same operations.

```sh
{{CLI}} query --scope all --q 'ready:true'
{{CLI}} query --scope all --q 'inflight:true'
{{CLI}} show TASK_ID
```

Follow the user's assigned scope and current handoff. Read the task's design context, prerequisites, acceptance criteria, evidence and existing sessions before starting. Readiness does not grant permission for unrelated work.

Report your session before starting a tracked task:

```sh
{{CLI}} activity TASK_ID --action start --owner 'Your agent name' --session-id 'Your stable session ID' --branch BRANCH --worktree WORKTREE --summary 'Current step'
```

Keep the returned `leaseId`. Heartbeat at least every ten minutes and before and after long validation steps. Use the same task and lease for heartbeat, pause and finish:

```sh
{{CLI}} activity TASK_ID --action heartbeat --lease-id LEASE_ID --summary 'Current step'
{{CLI}} activity TASK_ID --action finish --lease-id LEASE_ID --summary 'Result and remaining work'
```

Use pause when handing off unfinished work. A stale lease is not permission to replace another worker. Preserve other agents' branches, worktrees and sessions.

## Maintain progress and evidence

Work in an isolated worktree under the target repository's rules. Update the existing task as work progresses, preserving stable IDs, context links and dependency meaning:

```sh
{{CLI}} update TASK_ID --status partial --note 'What changed, evidence location, and next step'
```

Implementation with scoped checks, source integration and whole-head acceptance are separate. Record the exact tested commit and check results; passing component tests does not establish delivery acceptance. Use `implemented` for completed scoped implementation; record integration separately and use explicit acceptance with evidence for acceptance. Do not invent historical time, tokens or cost.

SQLite owns live tasks, status, relationships, evidence and agent state. Markdown owns design prose. The HTTP `/database.json` route is a current compatibility export. Use the CLI, site or MCP instead of direct SQL writes. Follow the workspace and target repository's rules for issue tracking and implementation languages.

## Handle what you discover while implementing

Work you find mid-task has three dispositions. Normally the first applies:

1. **In scope for the task you are doing.** Do it, and record the result as evidence on that task. Filing anything is the exception.
2. **Related to the task's spec, but not this task.** Propose a task on that
   spec through `plan.propose` / `plans_plan {action: "propose"}` with
   `{id, proposal}`. It adds a draft item to the spec's task list and runs only
   after a person approves the spec.

3. **Needs a different design.** Draft a new plan and tell the user; a design decision is theirs.

Do not use capture as a discovery channel. `task.capture` / `plans_intake {action: "capture"}` is a person's own request from the view in front of them; using it for findings manufactures inert inbox tasks with no plan, no approval and no dependencies.

## Draft and approve specs

A spec is a folder under `<specs.path>/<name>/`. The default `specs.path` is
`.kiro/specs`. Store a spec as a draft with
`plan.create` / `plans_create_plan` and `{spec}`, reload it after an edit with
`plan.save` / `plans_save_plan`, and check it with `plan.lint`. `plan.preview`
shows the tasks approval would create.

Approval is a person's: an approver's commit on main, or Approve in the app
with `plan.approve` and the previewed hash and revision. A design request or
silence is not approval. Preserve existing task identities and evidence when
a spec changes.

After a spec edit, reconcile affected task records in the same work.

## Agent sessions and reconnects

Agent sessions run in Kiro Crew; Avoozl starts none. The tick opens a session for a ready leaf, or ask for one with `plans_session {action: "request"}`. `plans_next` lists every leaf; a person takes one by hand with `avoozl claim TASK`. Steer, answer, or stop the work in the task's Kiro Crew session. Do not start additional sessions merely because the tools exist.

During a disconnect, continue already authorized local work and retry reads with bounded backoff. Inspect the session binding, handoff, and recorded evidence before resuming. Never launch a replacement worker because a check-in is stale.

For operation arguments, task-block examples, validation/integration, models and backups, read `{{APP_ROOT}}/README.md` and use:

```sh
{{WORKSPACE_CLI}} help
{{WORKSPACE_CLI}} workspace
{{WORKSPACE_CLI}} handoff --json '{"id":"TASK_ID"}'
```

MCP exposes the same workflow through tools including `plans_query`,
`plans_task {action: "update"}`, `plans_get_plan`, `plans_approve_plan`,
`plans_task {action: "handoff"}`, and `plans_task {action: "integrate"}`. Inspect `tools/list` for each tool's current input
schema. Approval and integration remain subject to the user's authorization.

To refresh an installed copy, print the maintained skill with `{{CLI}} skill` and replace the installed `SKILL.md` with that output.

## Waiting on CI

Every chat, Issue Radar and the Avoozl tick share one GitHub login and its rate limit (5,000 REST calls an hour). To wait on a pull request's checks, run `gh pr checks <number>` once every 2 to 3 minutes. Do not use `gh pr checks --watch`, `gh run watch`, or a loop that polls faster. While Avoozl shows "GitHub rate limit reached", make no GitHub calls until the time it gives.

`session.discover` lists local session metadata
inside the task's repositories. The site also offers **Link Claude session** when a
worker has no transcript. Choose the exact session/subagent; do not guess from
a similar name. `task.sessions` (MCP `plans_task {action: "sessions"}`) resolves the explicit
link first, then the exact reported provider/run ID, then active managed runs.
External Claude attachments are read-only and update while open. Continue
messages, interruptions and approvals in the original Claude interface. Managed
Claude/Codex sessions keep their existing controls. External Codex transcript
attachment is not implemented. A check-in alone does not provide a transcript
or steering channel; task edits do not send external workers messages.

Document edits compare the document hash; unrelated activity revisions can advance
while a human writes. Source/preview editing preserves the approval boundary for
new proposals.

New managed runs default to automatic provider review. `approvalMode` accepts
`automatic` or `manual` on run/intent/batch creation; retain the recorded value
through follow-ups and reconnects. Users can change a managed conversation's
mode in the site, or explicitly authorize `run.approvals` with `{id,
approvalMode}`. This changes tool review policy, not task or plan approval.
Do not change your own approval policy or answer a pending request on the user's
behalf. Automatic review retains the provider's access restrictions; do not
replace a denied action with bypass permissions.
