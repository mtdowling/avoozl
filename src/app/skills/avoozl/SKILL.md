---
name: avoozl
description: Find, claim, plan and maintain work in the Avoozl workspace through its shared CLI or MCP. Use for tracked tasks, plan drafting and approval, progress updates, evidence and agent handoffs.
---

# Avoozl workflow

Use the live database for current work. This skill contains workflow, not a snapshot of task status or priorities. Read workspace guidance at `{{PLANS_ROOT}}/AGENTS.md` when present, and the assigned repository's guidance before making changes.

## Drive work through tracked tasks

The persistent Avoozl Driver answers ordinary questions directly. When the user
asks it to change, build, fix, investigate, review, or plan something, it first
creates an Avoozl task or explicitly reuses the task already attached to the
request. It searches for overlapping work before creating a new record, then
starts substantive work as a child conversation linked to that task. Follow-up
direction stays with the existing task; a genuinely separate deliverable gets
a separate task. Creating the task does not approve, integrate, accept, or
merge the result.

The Driver brings something to the user's attention only when it needs human
attention: a decision, approval, material risk, changed outcome, unresolved
blocker, or requested final result. It does not narrate routine merges, rebases,
branch movement, restarts, retries, or status transitions unless they
materially change the judgment or require the user to act.

## Find and claim work

The workspace is `{{PLANS_ROOT}}`; the site is {{BASE}}/ and MCP is {{BASE}}/mcp. Commands below work from any directory. MCP is optional; the CLI reaches the same operations.

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
2. **Related to the task's plan, but not this task.** Append one proposed `task` block to that plan. The proposal is not executable, and the amended plan no longer matches its approval receipt, so the plan itself reads as having unapproved changes and its tasks are flagged for review. The discovery is resolved the next time a person approves that plan — there is no separate queue to groom.

   ```sh
   {{CLI}} plan.propose --json '{"id":"PLAN_ID","proposal":{"id":"local-id","title":"...","acceptance":["Observable check."]}}'
   ```

   Pass the plan's current `hash` as `expectedHash` to refuse a concurrent edit instead of appending to a changed document. MCP exposes this as `plans_propose_work`.

3. **Needs a different design.** Draft a new plan and tell the user; a design decision is theirs.

Do not use capture as a discovery channel. `task.capture` / `plans_capture` is a person's own request from the view in front of them; using it for findings manufactures inert inbox tasks with no plan, no approval and no dependencies.

## Avoid duplicate tasks

Search current tasks and use `task.duplicates` / MCP `plans_duplicates`
before creating work. Reuse an existing task ID when another plan describes the
same deliverable: set `taskId` in its proposed task block. This adds document
context without replacing the canonical task's status or acceptance. Capture
can set `reuseTaskId`; identical captured prompts reuse their existing task.
When matching names describe separate work, supply `distinctReason` explaining
the difference rather than renaming to evade the check.

Consolidation requires reviewing scope and source contexts, choosing the current
canonical record and supplying task hashes and a reason through `task.merge`
/ MCP `plans_merge_tasks`. Do not merge an active worker's task. Matching names
alone do not establish identity. Merges retain old IDs as aliases and keep
original task/edge records in a receipt; read it with `task.merge.get`. Do not
promote acceptance or rewrite frozen Markdown checkboxes during cleanup.

## Draft and approve plans

Draft a new plan in one Markdown document with design, proposed fenced `task` blocks, metadata, acceptance criteria and dependencies. Review that complete proposal before extracting live tasks. Draft indexing never approves work or enters it in the ready queue.

Approval must identify the exact document revision and come from explicit authorization; a design request or silence is not approval. Use shared `plan.create`, `plan.save`, `plan.get` and `plan.approve` operations. Approval records an immutable receipt and atomically extracts tasks with recoverable Markdown publication. Review amendments before extracting changed scope; preserve existing task identities and evidence.

After a plan edit, reconcile affected task records and design links in the same work. The running server watches source changes. If it is stopped, run `{{CLI}} generate`. Source-review flags require review, not automatic clearing.

## Managed agents and reconnects

Use configured projects and selected provider models for authorized managed execution. Implementation runs own isolated worktrees. Ask uses read-only inspection and opens a conversation without creating tasks or plan drafts. Both Claude and Codex use the same task workflow. Do not start additional agents or batches merely because the tools exist.

Web reloads leave the separate agent host running. During a disconnect, continue already authorized local work and retry reads with bounded backoff. Inspect the recorded run, handoff, pending requests and delivery receipts before resuming; preserve provider session IDs and submission IDs. Never automatically resend an uncertain message or bypass a pending approval. Codex supports active steering; interrupt Claude before redirecting an active turn.

For operation arguments, task-block examples, validation/integration, models and backups, read `{{APP_ROOT}}/README.md` and use:

```sh
{{WORKSPACE_CLI}} help
{{WORKSPACE_CLI}} workspace
{{WORKSPACE_CLI}} handoff --json '{"id":"TASK_ID"}'
```

MCP exposes the same workflow through tools including `plans_query`, `plans_activity`, `plans_update_task`, `plans_get_plan`, `plans_approve_plan`, `plans_handoff`, `plans_get_run`, `plans_validate_run` and `plans_integrate`. Inspect `tools/list` for each tool's current input schema. Approval and integration remain subject to the user's authorization.

To refresh an installed copy, print the maintained skill with `{{CLI}} skill` and replace the installed `SKILL.md` with that output.

## Link external Claude sessions

After claiming work, register the real provider identity, not just an agent
nickname. Keep the ownership lease and transcript link separate:

```sh
{{WORKSPACE_CLI}} register-session --task TASK_ID --lease LEASE_ID --provider claude --session SESSION_UUID
```

For a Claude subagent, `SESSION_UUID` is the parent session and `--agent AGENT_ID`
selects the child's own transcript. The parent or launcher should pass these
identities to each worker. Do not substitute a task name or start another agent
to obtain an identity. MCP `plans_register_session` takes the same fields as
`{taskId, leaseId, provider, providerSessionId, agentId?}`.

Claude launchers can use `{{WORKSPACE_CLI}} session-hook --task TASK_ID --lease
LEASE_ID` as a SessionStart/SubagentStart/PostToolUse command hook. It reads Claude's JSON
hook input (`session_id`, optional `agent_id`), validates the transcript, and
registers it without taking over the worker. `AVOOZL_TASK` and
`AVOOZL_LEASE` can supply the task and lease instead of flags. Hook
failure reports to stderr and leaves the worker running; retry registration
through the CLI or MCP when the workspace returns. A new task claim needs a
new registration; heartbeats preserve the existing link.

`session.discover` (MCP `plans_discover_sessions`) lists local session metadata
inside the task's projects. The site also offers **Link Claude session** when a
worker has no transcript. Choose the exact session/subagent; do not guess from
a similar name. `task.sessions` (MCP `plans_task_sessions`) resolves the explicit
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

Load examples only when the user requests them. `workspace.examples` lists packs;
`workspace.seed` with `{"example":"product-launch"}` installs one once, preserving
later edits. Managed worker connections cannot seed examples.
