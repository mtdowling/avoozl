# Durable andon cord

**Status:** Proposed design  
**Date:** November 11, 2026  
**Project:** Avoozl  
**Audience:** Avoozl agents, operators, reviewers, and maintainers

## Summary

Avoozl needs a durable andon cord: a safety incident that immediately prevents
unsafe work from advancing while preserving enough execution state for agents
and people to diagnose, repair, review, and resume deliberately.

The cord is not a process kill switch and it is not a decorative UI flag. It is
a server-enforced state transition with task, project, and workspace scopes.
Raising it closes the relevant pickup and protected-operation gates before any
interrupt requests or remote synchronization begin. It survives application,
agent-host, and computer restarts. It never treats a missing heartbeat,
disconnected worker, failed interrupt, or restarted process as proof that work
stopped.

Development of the Avoozl repository is operated as an all-AI project. For this
repository, AI agents author plans, decompose work, implement changes, run
tests, review results, maintain the system, detect unsafe conditions, pull the
cord, diagnose incidents, and propose remediation under human direction.

That is a convention of the Avoozl project, not a requirement imposed by the
Avoozl product. Other workspaces may be human-only, human-led, mixed, or highly
autonomous. The product models explicit roles and policy instead of assuming
who performs the work. Resolve and resume authority is configurable, but no
participant may infer that authority from an ability to raise or investigate an
incident.

The first implementation is local and SQLite-backed. The portable workspace
repository carries reviewed, secret-free incident transitions between a
person's computers and team members. The optional workspace coordinator later
adds immediate cross-instance propagation and fencing without becoming an
agent host, transcript store, or credentials service.

## Product intent

Long-running and parallel AI work changes the safety problem. An agent may find:

- a test that proves the design assumption is wrong;
- unexpected changes in a shared checkout;
- evidence that another worker owns the same task or resource;
- a repository, branch, dependency, or credential mismatch;
- a compromised or prompt-injected intake item;
- an integration result that does not match the reviewed commit;
- a systemic validation failure affecting work already in flight;
- a provider or tool that is behaving differently from its declared policy.

The correct response is often neither "keep going" nor "kill everything."
Avoozl needs one visible, auditable mechanism that can:

1. stop new unsafe transitions immediately;
2. distinguish freezing pickup from interrupting active turns;
3. preserve all evidence and ownership;
4. leave a bounded diagnostic path available;
5. authorize remediation without reopening unrelated work;
6. require an explicit resolution decision;
7. require a separate explicit resume decision.

The cord should make the safe action easy for an agent. Raising an incident is
not a failure and must not be punished by automatically failing or replacing
the reporting agent.

## Configurable operating model

The product supports human-only, human-led, mixed, and highly autonomous
workspaces. Policy assigns roles to identities; it does not require any role to
be an AI agent. A workspace may use these example assignments:

| Activity                             | Eligible actor                                              | Required authority                                      |
| ------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------- |
| Detect anomaly and raise incident    | Human, managed agent, Driver, or automation                 | Run-scoped callers are limited to their task or project |
| Collect evidence and diagnose        | Human reviewer, diagnostic Driver, or incident-scoped agent | Read-only incident capability                           |
| Propose remediation and task changes | Human or agent                                              | Append-only proposal or draft-plan authority            |
| Implement an approved remediation    | Human or agent                                              | Explicit incident remediation permit                    |
| Validate remediation                 | Human, agent, and deterministic checks                      | Permit-bound commands and exact commit                  |
| Review diagnosis and remediation     | Independent human or agent reviewer                         | Review authority; no implicit resolve                   |
| Resolve an incident                  | Configured resolver                                         | Local operator or reviewed delegated policy             |
| Resume normal work                   | Configured resumer                                          | Separate resume authority                               |

A participant that raises an incident may continue to report evidence. The
raiser may not approve its own new scope, grant itself a remediation permit,
silently resolve the incident, or resume ordinary dispatch unless a reviewed
policy explicitly allows that exact combination.

Delegation is explicit data. A workspace may define a rule such as "the
independent safety reviewer may resolve a task-scoped `validation-flake`
incident after the named deterministic checks pass." It may not define broad
rules such as "resolve incidents when confident." Workspace policy chooses
which categories and scopes require a human decision.

For Avoozl's own repository, the initial profile is:

- AI agents may plan, implement, test, review, raise, diagnose, and propose
  remediation;
- the raiser, implementer, and independent reviewer remain distinct roles even
  when all three are agents;
- a human directs the work and retains final resolve and resume authority until
  an exact, reviewed repository policy delegates a narrower case.

## Relationship to existing lifecycle controls

### Drain

Drain is planned maintenance:

- close new pickup;
- pause running batches;
- let active turns reach their normal provider boundary;
- wait for validation and integration locks to finish;
- stop or update the host;
- resume the batches paused by that drain.

Drain assumes the work is safe to finish.

### Stop

Stop ends the agent-host process after drain has left no active runs or
protected operations. It does not express a safety judgment and does not
persist as workspace policy.

### Andon

Andon means work may be unsafe:

- close policy-bearing gates in the affected scope;
- prevent integration, merge, and acceptance even if execution has stopped;
- optionally request bounded interruption of active turns;
- preserve ownership, sessions, worktrees, messages, and receipts;
- allow observation and incident-scoped diagnosis;
- remain effective across restart until separately resolved and resumed.

Drain and andon can coexist. A host may be draining for an update while a
project-scoped incident is open. Resuming the host must not clear or bypass the
incident.

## Scope

Every incident has exactly one scope.

### Task

A task incident blocks:

- new or resumed implementation runs for that task;
- batch progression through that task;
- task validation, integration, merge, and acceptance;
- task-derived automation and retries.

Unrelated tasks may continue if they do not share a blocked resource or depend
on the incident task.

### Project

A project incident blocks:

- pickup and resume for every task using the execution project;
- project batches and project-scoped automations;
- validation, integration, merge, and acceptance for that project's work;
- worktree creation and handoff into that project.

Planning drafts and read-only repository inspection may continue.

### Workspace

A workspace incident blocks every policy-bearing operation in the workspace,
including all project and task operations. Git/GitHub observation, OpenHands
event capture, incident diagnostics, plan drafting, and read-only views remain
available.

### Resource propagation

A task incident also blocks operations that require a resource exclusively
owned by the task. A dependent task is not automatically marked incident-open,
but it remains ineligible while its prerequisite or required resource is held.
The UI must distinguish "incident in this task" from "blocked by incident
scope."

## Modes

### Freeze

Freeze closes new pickup and protected transitions immediately. Existing
provider turns may reach their next normal boundary, but:

- queued user or automation turns are held;
- steering and resume are refused;
- validation, integration, merge, and acceptance are refused;
- batches stop dispatching and enter `incident-held`;
- completed work remains unintegrated.

Freeze is appropriate when finishing the current tool or model turn is safer
than interruption.

### Safe interrupt

Safe interrupt applies every freeze rule and records a durable interrupt intent
for each affected active run. Avoozl asks the provider to interrupt and records
the acknowledgement or uncertainty.

An interrupt request is not proof of interruption. Until the provider
acknowledges a boundary, the run remains active or `interrupt-uncertain`.
Avoozl never releases its task, worktree, activation, or coordinator claim
merely because the request timed out.

Safe interrupt is the default for a newly raised project- or workspace-scoped
incident. The raiser may deliberately choose freeze when the reason explains
why interruption is riskier.

## Incident state machine

```text
                   raise
                     |
                     v
             open / gate closed
                     |
        +------------+-------------+
        |                          |
        v                          v
   stabilizing                held immediately
 interrupt intents             freeze mode or
 pending/uncertain             no active runs
        |                          |
        +------------+-------------+
                     v
                    held
                     |
        remediation permit(s)
                     |
                     v
                remediating
                     |
             evidence + review
                     |
                     v
                  resolved
              gate remains closed
                     |
              explicit resume
                     |
                     v
                  resumed
                  terminal
```

`open`, `stabilizing`, `held`, `remediating`, and `resolved` all enforce the
incident gate. Only `resumed` is terminal and non-blocking.

An incident may move back from `remediating` to `held` when a permit expires,
is revoked, or its exact task, design revision, commit, or ownership epoch no
longer matches. A resumed incident is never reopened in place; a recurrence
creates a new incident linked with `recurrenceOf`.

### Atomic raise ordering

Raising an incident performs these steps in one local transaction where
possible:

1. validate the caller's maximum permitted scope;
2. create the incident and increment the workspace safety epoch;
3. close the relevant server-side operation gate;
4. mark affected batches `incident-held`;
5. persist the audit event and affected run IDs;
6. return the durable incident ID.

Only after the transaction commits may Avoozl:

7. request provider interrupts;
8. publish portable incident state;
9. notify coordinator or GitHub integrations;
10. update UI clients.

Remote failure cannot undo the local gate.

## Server-side enforcement

The enforcement point belongs in the shared operations layer, before an
operation reaches provider, filesystem, GitHub, integration, or acceptance
code. CLI, HTTP, Canvas, MCP, automations, and the agent host must receive the
same decision.

### Default-deny classification

Every operation is classified as one of:

- `observe`: state, events, metrics, Queue reads, Git fetch, transcript reads;
- `diagnose`: read-only Driver turns and incident evidence;
- `draft`: plan drafts, comments, proposals, and review artifacts that grant no
  execution authority;
- `incident`: raise, note, inspect, request remediation, resolve, and resume;
- `execute`: pickup, run start/resume/send, worktree mutation, batch dispatch;
- `protect`: validate, integrate, merge, publish, approve, accept, handoff,
  takeover, or change authorization/configuration.

While an incident is effective, unrecognized operations are denied. Adding a
new operation therefore cannot accidentally bypass the cord. A deterministic
test inventories public operation names and fails until each name is
classified.

### Operation behavior

| Operation class | Open incident behavior                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Observe         | Allowed and recorded normally                                                                                                                  |
| Diagnose        | Allowed through an incident-scoped read-only capability                                                                                        |
| Draft           | Allowed, but cannot approve, publish, project readiness, or redirect active work                                                               |
| Incident        | Allowed according to incident role and transition rules                                                                                        |
| Execute         | Denied unless an exact remediation permit allows it                                                                                            |
| Protect         | Denied unless an exact remediation permit explicitly allows the named step; acceptance and ordinary publication remain denied until resolution |

The refusal includes the incident ID, scope, state, reason summary, safety
epoch, and the action the caller may take next. It does not dump secrets,
transcripts, or unrelated incident evidence.

### Coverage

At minimum the gate applies to:

- issue- and design-origin task pickup;
- `driver.open` when requested with implementation authority;
- `run.start`, `run.send`, `run.resume`, model handoff, and retries;
- `batch.start`, batch resume, and batch advancement;
- worktree creation, reassignment, handoff, and takeover;
- native OpenHands automation dispatch;
- issue label authorization and readiness promotion;
- validation commands;
- integration and merge;
- planning approval and publication;
- task acceptance and whole-head acceptance;
- coordinator claims and protected-operation leases;
- worker dispatch and returned evidence import;
- configuration changes that could widen execution authority.

Read-only Queue synchronization and exact snapshot intake continue. An observed
event may be stored and deduplicated, but cannot become dispatchable until the
incident is resumed and the event is revalidated against current policy.

## Active runs, sessions, and messages

The cord does not delete or archive active runs.

- OpenHands remains the owner of chat, terminal, files, browser, and session
  attachment.
- Avoozl records the exact provider conversation, worktree, branch, task,
  ownership epoch, and last observed event cursor.
- Freeze mode lets the current turn reach a provider boundary.
- Safe-interrupt mode sends one idempotent interrupt intent per affected run.
- Follow-up messages remain durable but are not delivered.
- A disconnected run remains owned and visible. It is not replaced.
- A completed run remains available for diagnosis but cannot validate or
  integrate outside a permit.
- Auto-archive is suspended for affected runs until the incident is resolved.

When a provider cannot confirm interruption, the UI says
`Interrupt uncertain` rather than `Stopped`. An operator may retry the same
interrupt intent without creating a duplicate request.

## Diagnostic Driver and remediation

### Diagnostic Driver

The project Driver remains available while an incident is open, but its
capability changes:

- read workspace, task, plan, Queue, run, event, and sanitized evidence;
- inspect configured repositories read-only;
- ask agents for diagnosis or independent review;
- append incident notes and remediation proposals;
- draft plan changes and task blocks.

It cannot start ordinary implementation, alter authorization, approve a plan,
integrate, accept, resolve, or resume.

The incident context sent to the Driver is bounded: incident ID, scope, reason,
safety epoch, affected IDs, last known states, and requested diagnostic
questions. The Driver fetches deeper context through read-only MCP instead of
receiving an inventory dump.

### Remediation permits

Repairing the unsafe condition may require code changes while the cord remains
open. A remediation permit is the only bypass.

A permit binds:

- incident ID and current safety epoch;
- exact task and project;
- exact approved design or issue revision;
- allowed operation classes and named operations;
- worktree and branch once created;
- claiming identity, instance ID, and coordinator fencing token when used;
- expiry and maximum attempts;
- required validation commands;
- whether integration of the repair is allowed;
- issuer and reviewed policy or human approval receipt.

The default permit allows one implementation run and validation. It does not
allow plan approval, normal batch dispatch, unrelated work, acceptance, or
incident resolution. Integration of a repair requires an explicit permit field
and exact-commit revalidation.

An agent may request and draft a permit. It may not grant itself one. A
reviewed deterministic policy may grant a narrow permit automatically, but the
receipt must name the rule, input hashes, reviewer role, and safety epoch.

Permit completion returns the incident to `held` with evidence attached. It
does not resolve or resume it.

## Resolution and resume

Resolution answers: "Has the stated unsafe condition been addressed or
accepted?" Resume answers: "May ordinary policy-bearing work start advancing
again?" They are separate operations and receipts.

### Resolve preconditions

- the caller has resolver authority;
- the incident is `held` or `remediating`;
- no remediation permit is active;
- every interrupt intent is acknowledged, explicitly waived, or recorded as
  uncertain with a reviewed disposition;
- required incident checks pass against their exact commits;
- the diagnosis, remediation, and residual risk are recorded;
- no newer safety epoch invalidates the decision.

Resolution leaves the gate closed and changes the state to `resolved`.

### Resume preconditions

- the caller has resume authority;
- the incident is `resolved`;
- portable/coordinator state has not reported a newer blocking incident;
- configured repositories, task authorization, assignments, claims, and
  design revisions are revalidated;
- held batches and queued events are listed for review.

Resume increments the safety epoch, records a separate receipt, and reopens the
gate. It does not immediately replay everything. Batches paused by the incident
remain paused until an explicit batch resume, and imported events return to
pending revalidation rather than dispatching from stale snapshots.

## Permissions and prompt-injection boundary

Pulling a cord should be easier than bypassing it, but an untrusted issue body
must not be able to freeze an entire organization through prompt injection.

- A local authenticated human may raise any scope.
- The persistent Driver may raise any scope configured for its workspace role.
- A run-scoped implementation agent may raise its task or project scope.
- A request by a task agent for workspace scope immediately freezes its own
  project and creates a pending workspace escalation.
- GitHub issue text, comments, pull-request text, and imported Markdown cannot
  call incident operations directly.
- Native automation may raise only the repository/project scope named by its
  ingest-only capability.
- Any permitted caller may append evidence to an incident it can see.
- Resolve and resume default to the local human operator or an organization
  role backed by reviewed workspace policy.
- Run-scoped MCP never receives resolve or resume authority.

Repeated malicious or accidental raises are rate-limited for notification
purposes, but a valid raise is not ignored because another incident is already
open. Compatible scopes may be displayed together while retaining distinct
incident IDs and receipts.

## Durable data model

SQLite remains the live execution authority for one Avoozl instance.

### `safety_incidents`

```json
{
  "id": "andon-0199...",
  "workspaceId": "avoozl",
  "scope": { "kind": "project", "id": "avoozl" },
  "mode": "interrupt",
  "state": "stabilizing",
  "reason": "Validation shows integration may use an unreviewed commit.",
  "category": "integrity",
  "severity": "stop",
  "safetyEpoch": 42,
  "raisedAt": "2026-11-11T02:10:00.000Z",
  "raisedBy": {
    "kind": "agent",
    "runId": "run-...",
    "taskId": "..."
  },
  "affectedRunIds": ["run-..."],
  "recurrenceOf": null,
  "portableRevision": null,
  "coordinatorRevision": null
}
```

### Supporting records

- `safety_interrupts`: idempotent interrupt intent, run, provider request,
  acknowledgement, uncertainty, and timestamps;
- `safety_notes`: append-only diagnosis, evidence references, and proposals;
- `safety_permits`: exact remediation authority and disposition;
- `safety_transitions`: resolve/resume decisions and immutable receipts;
- workspace metadata: current safety epoch and an indexed set of effective
  incident scopes.

Incident reasons and notes are treated as untrusted Markdown. They are rendered
through the existing sanitized Markdown path and are never inserted into agent
system instructions as executable directions.

No record contains credentials, environment values, cookies, raw transcripts,
full source files, or machine-local checkout paths.

## Portable Git state

When a portable planning repository is configured, Avoozl publishes
secret-free incident envelopes under:

```text
.avoozl/
  incidents/
    <incident-id>.json
  incident-transitions/
    <incident-id>/
      <sequence>-<transition-id>.json
```

The envelope contains logical workspace/project/task IDs, hashes, GitHub
identities where applicable, safety epochs, timestamps, states, reason
summaries, and evidence references. It does not contain local paths, provider
credentials, transcripts, prompts, or raw terminal output.

Rules:

1. local raise closes the gate before publication;
2. publication failure leaves the local incident open and reports an outbox
   error;
3. importing an effective remote incident closes the gate before importing any
   other policy-bearing workspace change;
4. deletion or absence of an incident file never resolves it;
5. only an authorized append-only transition may resolve or resume;
6. non-fast-forward or conflicting epochs fail closed;
7. resolving on one computer does not make another computer resume
   automatically; it imports `resolved`, then requires the configured resume
   authority.

For Avoozl's own development, this plan lives in the code repository's
`plans/` directory. The repository can be registered as both the planning
repository and an execution project, with `plans/` as its Markdown source.
This does not place the SQLite database, `.avoozl/local/`, credentials,
transcripts, or machine configuration in Git.

## Multiple computers and teams

### Personal multi-computer

An instance that imports a newer effective incident:

- closes its matching local gate immediately;
- records which remote transition caused the gate;
- refuses new pickup even if its local activity appears idle;
- preserves different local models, credentials, and checkout paths;
- never assumes another computer's interrupt succeeded.

Git propagation is durable but not instantaneous. The UI shows the last
portable revision and warns when publication or fetch is stale.

### Independent team instances

Each user's Avoozl service applies the same imported incident policy locally.
GitHub remains the durable collaboration and protected-merge boundary. Teams
should require an `avoozl/safety-clear` check for automated planning and code
merges when they need enforcement beyond cooperative local clients.

The check reports the incident ID and safety epoch, not private diagnostic
content. Repository administrators retain GitHub's explicit override path and
audit trail.

### Optional coordinator

The workspace coordinator may add:

- atomic incident sequence and workspace safety epoch;
- immediate notification/long-poll delivery to connected instances;
- fencing of claims and protected operations against the current safety epoch;
- durable acknowledgement by each instance;
- explicit cross-user resolve/resume roles.

The coordinator stores only the minimal incident envelope, transition receipts,
instance acknowledgements, and identity/audit data. It never receives provider
credentials, complete plans, source code, worktrees, or transcripts.

In strict mode, inability to verify the coordinator's current safety epoch
blocks new claims, handoffs, takeovers, integration, and merge. Existing local
execution follows the last effective incident state and does not get killed
merely because the coordinator is unreachable.

## API and operations

The shared operation surface should expose:

- `safety.status`: effective incidents, affected scopes, safety epoch, active
  interrupts, permits, and allowed next actions;
- `safety.raise`: create an incident and close gates;
- `safety.note`: append diagnosis or evidence;
- `safety.interrupt.retry`: retry the same idempotent interrupt intent;
- `safety.remediation.request`: propose a bounded permit;
- `safety.remediation.grant`: grant a reviewed permit;
- `safety.remediation.revoke`: revoke a permit and return to held;
- `safety.resolve`: record resolution while keeping gates closed;
- `safety.resume`: reopen gates after revalidation;
- `safety.portable.publish` and `safety.portable.sync`: durable propagation;
- later, `safety.coordinator.ack`: acknowledge the current coordinator epoch.

Every response includes the incident ID and safety epoch. Mutating calls accept
an idempotency/submission ID and an expected incident revision. Replaying a
successful submission returns its receipt; conflicting input under the same ID
fails.

### CLI

```sh
avoozl andon status
avoozl andon raise --scope project:avoozl --mode interrupt --reason "..."
avoozl andon note INCIDENT_ID --input diagnosis.md
avoozl andon remediation request INCIDENT_ID --task TASK_ID
avoozl andon resolve INCIDENT_ID --input resolution.md
avoozl andon resume INCIDENT_ID
```

CLI output distinguishes `gate closed`, `interrupt requested`,
`interrupt uncertain`, `resolved but still stopped`, and `resumed`.

### MCP

Compatibility-prefixed tools may expose:

- `plans_andon_status`;
- `plans_andon_raise`;
- `plans_andon_note`;
- `plans_andon_propose_remediation`.

Run-scoped MCP does not expose grant, resolve, or resume. Current `plans_*` and
`NUPP_WORKSPACE` compatibility contracts remain intact.

## OpenHands integration

OpenHands owns session UI and provider interruption. Avoozl owns the incident
and policy decision.

- The Canvas extension displays incident state from Avoozl.
- OpenHands conversations remain attachable and readable.
- Avoozl sends provider interrupt once per durable intent and records the
  response.
- The Driver receives a read-only incident capability.
- Remediation conversations are children of the Driver and are visibly marked
  with the incident and permit IDs.
- Native OpenHands GitHub automations may continue observing but cannot trigger
  work while their project is gated.
- Disabling or restarting the Canvas extension does not clear the incident.

The OpenHands UI must never claim the workspace is safe merely because a
conversation says it finished.

## User interface

### Cord control

Canvas shows an always-available andon control in the Avoozl header. It must not
rely on a global OpenHands keyboard shortcut. Activating it opens a confirmation
dialog with:

- scope: current task, current project, or workspace;
- mode: safe interrupt or freeze;
- concise required reason;
- category and severity;
- affected active runs and protected operations;
- a clear statement of what will continue and what will stop.

The final button says `Raise andon` rather than `Stop everything`.

### Effective incident banner

An effective incident produces a persistent, non-dismissible banner:

- red theme with icon and text, never color alone;
- reason summary, scope, state, raiser, and age;
- active/uncertain interrupt count;
- affected tasks, projects, batches, and protected operations;
- links to diagnosis, evidence, remediation, and sessions;
- only actions authorized for the current caller.

On small screens the summary remains visible and details collapse below it.
Screen readers receive a polite announcement on raise and state change, not a
continuously repeating alert.

### Resolution flow

The incident page shows a timeline of append-only events and separate controls:

1. `Request/approve remediation`;
2. `Resolve incident`;
3. `Resume work`.

The Resume control is absent or disabled until resolution and revalidation are
complete. The UI lists held batches and queued events rather than replaying them
automatically.

Task, Queue, Graph, Now, and Epics views show scoped incident markers. The task
tray links to the incident and explains whether the task owns the incident or
is blocked by its scope.

## Audit and provenance

Audit events include:

- incident raised and gate epoch advanced;
- affected batches held;
- each interrupt requested, acknowledged, failed, retried, or waived;
- notes and evidence appended;
- remediation requested, granted, used, expired, revoked, and completed;
- remote incident imported or publication failed;
- coordinator epoch observed and acknowledged;
- resolve attempted, refused, or recorded;
- resume attempted, refused, or recorded;
- each ordinary operation refused by the gate;
- any GitHub administrator override observed during an incident.

Receipts name actor kind and identity, client, run/task when applicable,
submission ID, input hashes, incident revision, safety epoch, timestamp, and
result. The audit record references sanitized evidence rather than embedding
credentials, transcripts, or source.

## Restart and recovery

Startup order is:

1. open and migrate SQLite;
2. load effective incidents and safety epoch;
3. install the operation gate;
4. recover runs, batches, outbox, and provider connections;
5. synchronize portable/coordinator incident state;
6. expose normal API and Canvas readiness.

The service may expose health while recovery is in progress, but it must not
accept policy-bearing operations before the incident gate is installed.

If SQLite says an incident is effective and portable state appears resumed,
Avoozl keeps the gate closed and reports a conflict until authorized transition
history proves the ordering. If portable state says an incident is effective
and SQLite does not know it, import closes the gate before other workspace
changes.

Provider reconnect never redelivers held messages or resumes an interrupted run
while an incident is effective.

## Failure cases

- **Provider interrupt times out:** keep run active/uncertain and ownership
  intact; allow idempotent retry.
- **Agent host crashes after gate commit:** startup restores the gate before
  provider recovery.
- **Portable publish fails:** local gate stays closed; outbox and UI report
  propagation incomplete.
- **Portable histories diverge:** fail closed; do not choose a winner from wall
  clock time.
- **Coordinator unavailable:** strict new claims and protected operations stop;
  last known incident remains effective.
- **Raiser disappears:** incident remains open; resolver authority is
  independent of ownership heartbeat.
- **Remediation agent fails:** retain its session and evidence; permit expires
  or is revoked; incident returns to held.
- **A task changes while permit is active:** hash mismatch revokes use of the
  permit before the next operation.
- **A new operation lacks classification:** deny it while incidents are
  effective and fail deterministic coverage tests.
- **GitHub merge bypass occurs:** record the observed override and keep Avoozl
  acceptance blocked.
- **Incident file is deleted:** deletion has no transition authority.
- **Several incidents overlap:** the strictest effective scope/mode wins; each
  incident still requires its own resolution and resume.

## Deterministic plan and implementation checks

Because AI agents will implement and maintain this feature, completion must not
depend on an agent's confidence statement. Required checks include:

- every public operation appears in the operation classification matrix;
- an unclassified operation is denied under an effective incident;
- raise closes gates before provider, Git, coordinator, or UI side effects;
- all state transitions reject stale expected revisions and safety epochs;
- interrupt delivery is idempotent and uncertainty is preserved;
- task/project/workspace scope matching has exhaustive table tests;
- no heartbeat expiry releases ownership or proves interruption;
- diagnostic capabilities cannot mutate source or policy;
- remediation permits reject unrelated task, project, commit, operation, and
  expired inputs;
- resolve never opens a gate;
- resume revalidates and does not automatically resume batches or replay stale
  events;
- startup installs the gate before recovering work;
- portable import rejects traversal, symlinks, malformed JSON, secrets, stale
  epochs, deletion-as-resolution, and unauthorized transitions;
- coordinator fencing rejects an older safety epoch;
- Canvas, CLI, HTTP, MCP, and agent-host paths receive the same refusal;
- accessibility tests cover focus, labels, status announcements, contrast, and
  phone layout;
- `npm test` and `git diff --check` pass from an isolated task worktree.

## Migration and compatibility

The schema migration adds incident tables without rewriting existing tasks,
runs, batches, approvals, integrations, or acceptance receipts.

Existing workspaces begin with safety epoch `0` and no incident. Existing Drain
and Stop commands keep their meanings. The andon guard composes with the
existing `manager.draining` gate rather than replacing it.

Older Avoozl instances that encounter portable incident records they do not
understand must fail closed for policy-bearing work and direct the operator to
upgrade. They may continue read-only inspection.

Existing public operation names, `plans_*` MCP tools, `AVOOZL_*` environment
variables, and the accepted `AICOMMANDER_*` and `NUPP_WORKSPACE_*`
compatibility names remain supported.

## Implementation plan

The increments are ordered so every landing leaves Avoozl usable and adds a
real safety boundary rather than only UI.

### Increment 1: local incident model and operation gate

Add SQLite records, safety epochs, scope matching, atomic raise, status, notes,
resolve/resume separation, default-deny operation classification, and restart
recovery. Initially use freeze mode only.

```task
{
  "id": "andon-core-gate",
  "project": "avoozl",
  "title": "Implement the durable local andon gate",
  "summary": "Persist scoped safety incidents and enforce them through the shared operations layer before policy-bearing side effects.",
  "acceptance": [
    "Task, project, and workspace incidents atomically close the matching operation gate and survive restart.",
    "Every public operation is deterministically classified and unclassified operations fail closed.",
    "Resolve leaves the gate closed and only a separate authorized resume reopens it.",
    "Existing Drain and Stop behavior remains distinct and compatible.",
    "Isolated migration, scope, race-ordering, restart, CLI, HTTP, and MCP tests pass."
  ],
  "requires": []
}
```

### Increment 2: active-run stabilization and batches

Implement freeze and safe-interrupt behavior, durable interrupt intents,
uncertainty, message holding, auto-archive suspension, and batch
`incident-held` state.

```task
{
  "id": "andon-run-stabilization",
  "project": "avoozl",
  "title": "Stabilize active runs and batches under andon",
  "summary": "Apply freeze or idempotent safe-interrupt policy without losing ownership, sessions, worktrees, messages, or evidence.",
  "acceptance": [
    "Freeze holds new turns and protected transitions while preserving the current provider boundary.",
    "Safe interrupt records one durable intent per run and never equates timeout with successful interruption.",
    "Disconnected or stale workers retain ownership until explicit handoff or takeover.",
    "Affected batches enter incident-held and never resume automatically.",
    "Completed affected conversations remain readable and are not auto-archived until resolution."
  ],
  "requires": ["andon-core-gate"]
}
```

### Increment 3: diagnostic Driver and remediation permits

Add bounded incident context, read-only diagnosis, remediation proposals, exact
permits, independent AI review, and permit revocation.

```task
{
  "id": "andon-remediation-permits",
  "project": "avoozl",
  "title": "Add incident diagnosis and bounded remediation",
  "summary": "Keep the Driver useful for diagnosis and allow explicitly reviewed repair work without reopening unrelated execution.",
  "acceptance": [
    "The Driver can inspect and discuss incidents through a read-only incident capability.",
    "Agents can append evidence and propose remediation but cannot grant their own permit.",
    "A permit binds the incident epoch, task, project, source revision, operation set, expiry, and required checks.",
    "Permit mismatch or revocation fails before source, provider, validation, or integration side effects.",
    "Remediation completion returns the incident to held and cannot resolve or resume it."
  ],
  "requires": ["andon-run-stabilization"]
}
```

### Increment 4: native Canvas, CLI, and MCP experience

Add the always-available cord, confirmation dialog, persistent banner, incident
timeline, scoped markers, authorized controls, and provider-neutral CLI/MCP
surfaces.

```task
{
  "id": "andon-operator-surfaces",
  "project": "avoozl",
  "title": "Expose andon controls in Canvas, CLI, and MCP",
  "summary": "Make incidents visible and operable without duplicating OpenHands session UI or weakening server-side enforcement.",
  "acceptance": [
    "Canvas exposes an accessible raise dialog and a persistent non-dismissible incident banner.",
    "Task, Queue, Now, Graph, and Epics surfaces distinguish incident ownership from inherited blocking.",
    "Resolve and Resume are visibly separate and only appear for authorized callers.",
    "CLI clearly reports gate, interrupt, resolution, and resume states.",
    "Run-scoped MCP can raise and diagnose but cannot grant, resolve, or resume.",
    "Phone, keyboard, screen-reader, and contrast tests pass."
  ],
  "requires": ["andon-core-gate", "andon-run-stabilization", "andon-remediation-permits"]
}
```

### Increment 5: portable repository propagation

Publish secret-free append-only envelopes, import effective incidents before
other workspace changes, detect conflicts, and expose stale propagation.

```task
{
  "id": "andon-portable-sync",
  "project": "avoozl",
  "title": "Synchronize andon incidents through the portable workspace repository",
  "summary": "Carry durable incident transitions between computers and team instances without synchronizing credentials, transcripts, paths, or SQLite.",
  "acceptance": [
    "Local raise closes the gate even when publication fails.",
    "Remote effective incidents close the gate before any other policy-bearing import.",
    "Deletion, absence, stale epoch, and non-fast-forward history cannot resolve an incident.",
    "Portable records pass path, symlink, schema, identity, secret, and tamper checks.",
    "A second computer imports resolution but does not silently resume ordinary work."
  ],
  "requires": ["andon-core-gate", "andon-operator-surfaces"]
}
```

### Increment 6: team enforcement and coordinator propagation

Add immediate coordinator events, epoch fencing, instance acknowledgement,
GitHub safety checks, and team roles.

```task
{
  "id": "andon-team-coordination",
  "project": "avoozl",
  "title": "Coordinate andon state across team instances",
  "summary": "Use the optional coordinator and protected GitHub checks for immediate propagation and stale-owner fencing without centralizing agents or credentials.",
  "acceptance": [
    "The coordinator atomically advances the workspace safety epoch and notifies connected instances.",
    "Claims and protected operations carrying an older safety epoch are rejected.",
    "Coordinator outage fails closed for new strict claims and protected operations while preserving active local evidence.",
    "GitHub safety checks expose only incident IDs and epochs and can gate automated merges.",
    "The coordinator stores no source, complete plans, paths, provider credentials, or transcripts."
  ],
  "requires": ["andon-portable-sync"]
}
```

### Increment 7: configurable incident authority policy

Add reviewed delegation rules, independent safety-review pipelines, and
anti-self-approval enforcement for human-only, human-led, mixed, and highly
autonomous workspaces.

```task
{
  "id": "andon-authority-policy",
  "project": "avoozl",
  "title": "Define configurable authority for incident handling",
  "summary": "Assign incident roles explicitly across human-only, human-led, mixed, and highly autonomous workspaces without permitting inferred self-approval.",
  "acceptance": [
    "Workspace policy declares which identities and roles may raise, diagnose, review, request permits, resolve, or resume each incident category and scope.",
    "Human-only, human-led, mixed, and highly autonomous policy fixtures exercise the same enforcement model.",
    "Broad confidence-based delegation is rejected; automatic decisions bind named checks, hashes, roles, and limits.",
    "The raiser and remediation implementer cannot satisfy an independent-review requirement themselves.",
    "The Avoozl repository profile uses AI agents for delivery and independent review while retaining human resolve and resume by default.",
    "Every delegated decision records the exact reviewed rule and evidence that authorized it."
  ],
  "requires": ["andon-remediation-permits", "andon-team-coordination"]
}
```

### Increment 8: dogfood Avoozl's own plan

Register this repository as Avoozl's planning and execution project, import the
`plans/` directory without approving it automatically, review the exact
revision, and exercise the cord during a controlled local run.

```task
{
  "id": "andon-avoozl-dogfood",
  "project": "avoozl",
  "title": "Dogfood the andon workflow on Avoozl development",
  "summary": "Use Avoozl's repository-owned, all-AI development workflow to prove the complete incident lifecycle without publishing secrets or mutating public repositories.",
  "acceptance": [
    "The Avoozl repository is configured with plans/ as its Markdown planning source using portable non-secret configuration.",
    "Importing this plan creates a reviewable draft and never approves, dispatches, or accepts it automatically.",
    "A controlled task- or project-scoped incident closes pickup, preserves an OpenHands session, supports diagnosis, resolves, and resumes with distinct receipts.",
    "A separate AI reviewer checks the implementation evidence and a human retains final resolve/resume authority under the initial repository policy.",
    "No workspace database, .avoozl/local content, credentials, transcripts, or personal planning data is committed."
  ],
  "requires": [
    "andon-operator-surfaces",
    "andon-portable-sync",
    "andon-authority-policy"
  ]
}
```

## Acceptance of the design

Before approving this plan, reviewers should confirm:

- an agent can pull the cord quickly without gaining bypass authority;
- the operation matrix has no fail-open extension point;
- the remediation path can repair the system without reopening unrelated work;
- resolve and resume remain distinct in storage, API, UI, and policy;
- a disconnected or interrupted agent is never silently replaced;
- portable and coordinator designs do not centralize credentials or
  transcripts;
- Avoozl's all-AI repository workflow has explicit independent review and
  anti-self-approval boundaries without constraining other workspace operating
  models;
- the task blocks can be implemented and accepted independently in the stated
  order.

Approval of this document authorizes only its exact reviewed revision through
Avoozl's normal plan workflow. Committing the Markdown does not itself start an
agent, grant a remediation permit, resolve an incident, or resume work.
