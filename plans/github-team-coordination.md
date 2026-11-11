# Multi-computer, multi-user team coordination

**Status:** Proposed design
**Date:** November 11, 2026
**Project:** Avoozl
**Audience:** Avoozl maintainers and teams adopting shared planning

## Summary

Avoozl supports the same workflow for one developer with several computers and
for a team of ten or more developers, by separating two problems that earlier
drafts of this design conflated.

**Within one person, coordination is local.** Each person runs exactly one
primary Avoozl instance. It owns the SQLite database, the UI, and every
ownership decision. Their other computers run secondary instances: headless
execution targets that take jobs from the primary, do the work, and report
back. There is one arbiter per person, so delegating work between a person's
machines needs no distributed agreement.

**Across people, coordination is GitHub.** Designs are published and reviewed
as Markdown through pull requests. Approved work is projected into issues. The
GitHub assignee routes an issue to a person, and because that person has exactly
one primary, the assignee also identifies the one instance that may claim it.
Pull requests, reviews, checks, and merges stay native.

The workflow is:

1. people and agents publish Markdown designs through Git;
2. reviewers improve and approve an exact design revision;
3. approved work is projected into GitHub issues;
4. a person claims an issue, and their primary records ownership;
5. the primary delegates the job to itself or to a secondary;
6. OpenHands performs the work in a task worktree on that machine;
7. every primary can observe owner, phase, commits, branch, pull request,
   checks, review, integration, and acceptance;
8. an independent reviewer takes the review;
9. completion closes the GitHub work and every primary converges.

Provider credentials, raw conversations, worktrees, and live execution never
leave the machine that holds them. GitHub carries designs, authorization
events, assignments, branches, pull requests, reviews, sanitized progress
receipts, and completion.

## Product intent

The collaboration model preserves five boundaries:

- A merged design authorizes scope; it does not prove implementation.
- An issue claim chooses a person; it does not choose a machine.
- A delegation chooses a machine; it does not approve a change.
- A completed agent turn does not mean the change is integrated.
- A merged pull request does not mean the originating requirement is accepted.

These let a small team use substantial automation without reducing delivery to
label-to-pull-request fire-and-forget behavior.

The normal interface remains the Avoozl extension inside the primary's
OpenHands Canvas. No shared Avoozl web server, shared SQLite file, shared
provider credential, or shared OpenHands account is required.

## Goals

- Scale from one developer to at least ten active developers.
- Let one person use several computers without running several databases.
- Support one planning repository coordinating multiple code repositories.
- Publish plans and design documents through normal GitHub pull requests.
- Derive reviewable tasks from exact merged design revisions.
- Accept bounded issue-origin work without weakening design-origin provenance.
- Keep what a teammate needs legible in GitHub's own fields.
- Prevent two people from taking the same implementation.
- Make remote progress observable without publishing secrets or transcripts.
- Require review proportional to the risk of the change, and keep it
  independent when it is required at all.
- Work offline for local execution while failing closed on shared transitions.
- Recover deterministically from duplicate delivery, force-push, partial
  publication, secondary loss, and concurrent claims.

## Non-goals

- Running more than one primary per person.
- Sharing or replicating a SQLite database between computers.
- Giving a secondary its own database, UI, or ownership decisions.
- Distributed consensus between a person's own machines.
- Synchronizing provider credentials, environment variables, cookies, raw
  terminal output, or full OpenHands transcripts through GitHub.
- Treating a label, a heartbeat, or an assignee's absence as proof that a task
  is safe to take over from another person.
- Redirecting active work when a design or issue body changes.
- Requiring one centralized Avoozl or OpenHands deployment for a team.
- Making GitHub issue comments the canonical design document.
- Making GitHub a low-latency agent message bus.
- Moving uncommitted work between computers.
- Letting an author satisfy an independent-review requirement on their own pull
  request.
- Automatically closing work merely because an agent stopped or a pull request
  merged.
- Orchestrating anything after acceptance. Release pipelines, version bumps,
  changelog generation, artifact publication, staged or regional rollout, and
  propagating a change into generated or downstream repositories are all
  downstream of this workflow. Avoozl may link to them and observe their
  results as checks; it does not model or drive them.

## Instance roles

### Primary

Each person runs exactly one primary. It is the system of record for that
person and holds:

- the SQLite database;
- the UI, CLI, and MCP surfaces;
- GitHub credentials and synchronization state;
- task ownership, readiness, and dispatch decisions;
- the registry of execution targets;
- local run leases;
- its own OpenHands instance, so it can also do work itself.

A primary can read, write, delegate, and execute. The existing single-writer
guard already enforces one authoritative process per database: `agent-host.mjs`
records a `runtimeOwner` with a PID and refuses to start when a live process
already owns the store.

Which machine is primary is not an election. The primary is wherever the
database is. Moving it is an explicit, deliberate operation, not a negotiation.

### Secondary

A secondary is a headless execution target. It has:

- no database;
- no UI;
- no ownership decisions;
- no GitHub coordination role.

It listens on an authenticated port, accepts a job the primary assigns, runs
it, streams results back, and honors a stop. It does hold two things locally,
and deliberately so: its own provider credentials and its own Git access. The
primary never stores or forwards a secondary's secrets.

A secondary is an OpenHands Agent Server. Avoozl already drives one through
`providers/openhands.mjs`, and the declared capabilities cover what delegation
needs: `interrupt`, `resume`, `steer`, `queue`, `approvals`, and
`conversation`, `terminal`, `files`, and `browser` surfaces. Because the
terminal surface is available, worktree setup and commit pushes can be
expressed as job setup on the target rather than as shell commands the primary
runs locally.

So registering a secondary means registering an execution target: a URL, a
credential, and a capability set.

Today the OpenHands host is a single install-wide setting (`URL`, defaulting to
`http://127.0.0.1:38100`) and `openhands.mjs` asserts it is loopback. That
setting is replaced, not supplemented: the endpoint becomes a property of a
target, and the primary's own OpenHands is simply the target named `local`,
created at install with a loopback URL. One code path, no special case for the
single-machine configuration.

Relaxing the loopback assertion is then the central security task of this
design, because it is the only thing currently preventing a secondary from
being reachable.

If OpenHands cannot express worktree lifecycle as part of a job, the fallback is
a minimal headless Avoozl executor alongside OpenHands on the secondary, owning
only worktree and Git mechanics. That is a fallback, not the plan.

### Why one arbiter per person

Coordinating peer instances that can only communicate through GitHub requires
distributed exclusion, because GitHub offers no conditional write on an issue.
One primary per person removes that requirement entirely rather than solving it.

Moving work between a person's machines is the primary choosing a different
target. A dead secondary is a local lease expiry, which is safe because nothing
else is making that decision concurrently. Nothing in this design needs a
compare-and-swap, a machine epoch, or a handoff negotiation.

### Ownership summary

| Concern                  | Authority                                            |
| ------------------------ | ---------------------------------------------------- |
| Design prose             | Markdown at an exact Git commit                      |
| Design review            | GitHub planning pull request reviews                 |
| Design approval          | Merged revision plus Avoozl approval receipt         |
| Task scope               | Design task block or immutable issue-origin snapshot |
| Cross-person routing     | GitHub assignee                                      |
| Work authorization       | Reviewed design provenance or allowed label event    |
| Person-level ownership   | That person's primary                                |
| Executing machine        | Primary's job assignment to a target                 |
| Live agent/process lease | Primary's SQLite                                     |
| Conversation and tools   | OpenHands on the executing machine                   |
| Code                     | Task branch and commits                              |
| Code review              | GitHub pull request reviews                          |
| Validation               | Avoozl evidence bound to an exact commit             |
| Integration              | GitHub merge plus Avoozl integration receipt         |
| Acceptance               | Separate Avoozl acceptance decision                  |

## Identity

Every durable event records:

- workspace ID;
- stable task ID;
- GitHub immutable actor ID, with the login kept only for display;
- executing target ID;
- event type and event ID;
- source and result hashes;
- timestamp supplied by the writer;
- Git commit and GitHub event timestamps observed by readers.

A person is their GitHub identity. There is no separate Avoozl actor ID, because
the assignee is the claim, so identity has to be anchored to GitHub anyway and a
second identifier would only create a mapping to keep correct. Display names are
not authority: renaming a login does not create a new actor, and if immutable
identity cannot be resolved a protected transition fails closed.

Permission is likewise GitHub's answer, not a parallel system. Who may comment,
assign, label, push, review, and merge is already decided by repository
permissions, CODEOWNERS, and branch rules, and this design does not restate
them. Only two checks are Avoozl's own:

- **Write access** — the floor for taking work, read from GitHub at the time of
  the transition.
- **The execution allowlist** — who may authorize issue-origin work, which
  GitHub cannot express because applying a label there means running code on
  someone's machine with their credentials.

Execution targets have their own identity, separate from people. A target ID
names a machine, is stable across restarts, and is never a person.

Importing from an external tracker adds one mapping from tracker identity to
GitHub identity. That is a lookup table, not a third identity namespace.

## Cross-person coordination

### What GitHub is good at

GitHub is the durable team record. It carries designs, review, authorization
provenance, routing, branches, pull requests, checks, merges, and completion.
It is not a lease service and not a message bus.

### The assignee is the claim

Because each person has exactly one primary, an assigned issue reaches exactly
one instance that may act on it. That makes the assignee sufficient for
cross-person exclusion:

1. **Authorization** — a reviewed design revision or an allowed label event
   says the work may run at all.
2. **Routing and claim** — the GitHub assignee says which person owns it, and
   therefore which primary may dispatch it.
3. **Delegation** — the owning primary decides which of its targets executes.

Taking work is the existing flow in `github-queue.mjs`: read the issue, verify
it is claimable and unassigned, add the authenticated user as assignee, re-read,
and confirm only that user is assigned. The window between check and write is a
real one, but it is bounded by human pace. People click a few times an hour,
not a few times a second, and the losing side detects the conflict on re-read
and reports it rather than starting work.

This is adequate because of what fails and how much it costs. Two people taking
the same issue within the same second produces duplicate effort on one task,
detected on the next re-read or sync, and resolved socially. It does not corrupt
state, lose commits, or produce two owners of record.

### The limit of this approach

The assignee works because a person takes the work. **Unattended dispatch
across multiple people is therefore out of scope**: if nobody clicks and every
primary starts agents automatically from label or assignment webhooks, they all
process the same event at the same instant, the check-then-write window is hit
on the normal path rather than by bad luck, and nobody is watching.

That is a scope boundary, not a staged feature. Wanting it would mean
reconsidering how cross-person exclusion works, and the reconsideration should
start from the problem at that time. It is not a function of team size.

### What GitHub shows

Task state lives in the owning primary. GitHub is not asked to represent it,
because GitHub already carries the three things a teammate needs, natively:

- **the assignee** — who owns this;
- **whether a pull request exists, and its checks and reviews** — how far along;
- **open or closed** — whether it is done.

On top of those, one Avoozl status comment per issue links the design revision,
task, branch, pull request, and current phase, and checkpoint comments append
the transitions worth a notification.

That is the whole mirror. There is no label vocabulary to configure and no
mapping to maintain, so nothing can drift out of sync — a label mapping is a
second copy of the truth that someone has to keep correct forever, and it fails
quietly when they don't.

One label still does real work: the configured authorization label, which is
how issue-origin work is approved for execution. It grants authority, so it is
policy rather than decoration. Every other label in a repository stays whatever
the team already uses and means nothing to Avoozl.

If an issue's native fields disagree with the owning primary after a re-read,
Avoozl reports a reconciliation finding and refuses a protected transition until
it is resolved.

### Task state

The primary's own states are `ready`, `owned`, `active`, `blocked`,
`quarantined`, `review`, `changes-requested`, `integrated`, `accepted`, and
`closed`. They drive its queues, policy, and automation. They are internal
vocabulary, not a published schema, so they can change without touching any
repository's configuration.

## End-to-end workflow

### 1. Publish and review a design

1. A person or agent edits a Markdown design in the planning repository.
2. Avoozl runs deterministic checks and optional multi-provider review.
3. The author opens a planning pull request.
4. Review comments stay anchored to the Markdown diff.
5. The author revises the document and replies to findings.
6. Required reviewers approve the exact head revision.
7. The pull request merges.
8. Avoozl records the merged commit, review identities, checks, and task-block
   hashes as the authorization revision.

An edit after approval is a new revision. It cannot redirect active work.

**Keeping the approval durable.** A merged commit is only authoritative while
something keeps it reachable. Each approved revision therefore gets its own
immutable anchor ref, `refs/tags/avoozl/approval/<id>`, so the authorization
survives a rewritten branch and can be verified independently of the planning
repository's current history.

**Revoking an approval.** A design found wrong after merge can be revoked. The
revocation names the approval ID, and every task derived from it is flagged as
deriving from revoked authority. Revocation does not stop active runs by
itself; it closes protected gates and requires an explicit replan decision.

### 2. Project tasks into issues

Tasks come from strictly parsed fenced blocks, not from prose. The existing
parser in `plans.mjs` matches ```` ```task ```` blocks, requires valid JSON,
validates against the schema, and refuses a nested fence. Surrounding prose is
for humans; only the block is machine-readable, and runtime state is never
written back into the prose as a second authority.

For each approved task block, Avoozl:

1. resolves the target code repository and project policy;
2. creates or updates one GitHub issue with a deterministic marker;
3. copies human-readable scope and acceptance criteria;
4. stores design provenance by repository, commit, document path, and block
   hash;
5. records the task as `ready`, since a projected design task is already
   authorized;
6. records the GitHub issue node ID in the planning record.

Projection is idempotent. A repeated event updates the same issue only when
policy allows design-owned fields to change. An issue edit cannot rewrite the
scope of a design-origin task.

Issue-origin work follows a separate provenance union. Its authorization names
the exact issue node ID, body hash, label event, actor, and timestamp. It can
never later claim design authorization.

### Imported requirements

Work also originates outside GitHub, in whatever tracker an organization already
runs. That is an **intake source**, not a second coordination substrate. GitHub
still carries claims, pull requests, reviews, and merges; the tracker only says
where a requirement came from.

The existing seam already has the right shape: `github-intake.mjs` mints
capability tokens, validates a versioned snapshot schema, and ingests
authenticated snapshots. Another tracker is a sibling source with its own schema
version feeding the same task derivation.

Four rules keep it from becoming a second authority:

- **One way.** Import creates a GitHub issue and a ticket-origin provenance
  record. What goes back to the tracker is a link, and at most a terminal
  status. Runtime state is never written back, for the same reason it is never
  written back into design prose.
- **Snapshot, not subscription.** Scope comes from the imported snapshot and its
  field hash, exactly as issue-origin scope comes from a body hash. A later
  ticket edit invalidates dispatch for unstarted work and raises scope drift for
  active work. It never redirects a running job.
- **Ownership is GitHub-side only.** A tracker assignee is informational.
  Claiming happens through the GitHub assignee, so import needs an actor mapping
  from tracker identity to GitHub identity, and a protected transition fails
  closed when that mapping is missing rather than guessing.
- **Same untrusted-input boundary.** An authenticated reporter is still
  untrusted prompt input. Imported content can be quarantined before `ready`,
  and the authorizing-actor policy applies unchanged, even where a private
  tracker justifies a broader allowlist than a public repository.

A ticket-origin task that outgrows its ticket uses the existing promote-to-design
path. Promotion links to the imported predecessor and does not rewrite its
provenance.

### 3. Take the work

1. A developer selects a ready issue in Queue on their primary.
2. The primary re-fetches the issue and the authorization event.
3. It verifies repository policy, allowed actor, exact source hash, and
   eligibility.
4. It resolves the developer's immutable GitHub identity.
5. It assigns the issue and confirms the assignment by re-reading.
6. It records ownership and marks the task `owned`.

Taking work does not start an agent. Other primaries observe the assignment on
their next sync and drop the task from their available queue.

### 4. Delegate to a target

The owning primary selects an execution target. That may be itself or a
registered secondary. It:

1. confirms the target is paired, reachable, and capability-matched;
2. records a job with a stable job ID and a local run lease;
3. sends the job envelope: task scope, acceptance criteria, repository, base
   commit, branch name, and policy;
4. the target prepares a task worktree at the base commit;
5. the target creates an OpenHands conversation for the job;
6. the primary marks the task `active` with the target recorded.

The job envelope is narrow by construction. A target receives what it needs to
do the work and nothing else: no store access, no other tasks, no credentials
from the primary, no ability to change its own authorization.

Capability matching covers operating system, architecture, available hardware,
which repositories the target can reach, which provider credentials it holds,
and configured concurrency. A job that no target can satisfy stays `owned` with
an explicit reason rather than failing silently.

### 5. Implement and publish progress

OpenHands owns chat, terminal, files, browser, tools, interruption, and resume
on the executing machine. The primary owns the task boundary and publishes
**checkpoints**.

A checkpoint is one published phase transition: a sanitized statement that the
task reached a named point, with links to the artifacts that prove it. There
are about ten over a task's life:

- job dispatched;
- conversation started;
- branch created;
- commit pushed;
- validation started or completed;
- pull request opened;
- changes requested;
- ready for re-review;
- integrated;
- accepted.

The contrast is OpenHands' own event stream — token deltas, every tool call,
terminal output, activity changes — which runs to thousands of events and never
leaves the executing machine. Checkpoints are what let another person's primary
render the state of your task without access to your transcript, credentials,
or files.

So a checkpoint carries links and sanitized summaries only. It never contains
raw prompts, chain-of-thought, terminal output, tokens, credentials, or
unreviewed file contents.

**The worktree lives on the executing machine.** When a secondary runs the job,
the primary cannot read those files. It observes work through pushed commits
and OpenHands events.

Push at meaningful boundaries — when a coherent chunk of work is ready, not on
a timer. Ten commits where one would do is worse than redoing twenty minutes of
work. What this design requires is not push frequency but honesty about the
gap: the primary must know what has not been pushed on each target and say so
when it matters, so a lost machine produces a stated amount of redoable work
rather than a silent hole.

Every primary can display owner, executing target, last durable phase and
timestamp, branch and latest pushed commit, pull request and check states,
review owner and state, and integration and acceptance receipts.

"Last published five minutes ago" is an observation, not a liveness claim.

### 6. Open a pull request

Avoozl records repository and pull request node ID, base and head branch, exact
head commit, task and design provenance marker, validation evidence, author
actor ID, and requested reviewer policy.

Multiple pull request attempts remain in history. Avoozl derives one current
primary attempt and flags multiple simultaneously open attempts.

### 7. Take an independent review

Opening a pull request creates one or more review work items. Review uses
GitHub's native review request rather than an exclusive claim, because the
side-effect asymmetry that justifies exclusion for implementation does not
apply here: two people reviewing the same pull request produces two reviews,
which is harmless.

What is enforced is independence, by immutable identity. The eligible set
excludes:

- the pull request author;
- the implementation owner;
- any actor whose identity cannot be resolved;
- actors excluded by repository policy;
- an agent using the same configured identity when policy requires a different
  one.

A reviewer may use a local agent to inspect the pull request, but the durable
review is a GitHub review bound to an exact commit. A comment, a local agent
summary, or Avoozl task completion is not approval.

If changes are requested, the implementation task returns to
`changes-requested`, the original implementer retains ownership unless they
release it, new commits invalidate approvals per repository rules, and review
becomes eligible again at the new exact head.

For a one-person project, policy may require an explicit review waiver or allow
a separately identified agent reviewer. Avoozl records the waiver; it never
silently treats self-review as independent review.

### Automating review

Requiring a human on every change makes human attention the limit on throughput,
which is the wrong limit to accept by default. Review is therefore policy per
**change class**, not a single boolean:

| Class            | Gate                                                    |
| ---------------- | ------------------------------------------------------- |
| Mechanical       | Required checks only; integrate with no review          |
| Low risk         | Agent review, with a human notified rather than blocking |
| Normal           | Agent review first, then one human review               |
| High consequence | Human review required; agent review is advisory         |

A repository declares which paths, change shapes, and task origins map to each
class, and an unmatched change takes the most restrictive class rather than the
most permissive.

Agent review is real review in this model: it is claimable work, it produces a
GitHub review bound to an exact commit, and it is subject to the same
independence rules. Its value is reducing what reaches a human, and that is a
large reduction.

**What automation does not fix.** Independence enforced by identity is not
independence in fact. An agent reviewing with the same model that implemented
the change shares its blind spots, so it will approve the same mistake
confidently — two draws from one distribution are not two pieces of evidence.
Agent review therefore reduces review *volume* without reducing correlated
risk, and no amount of configuration changes that, because it is a property of
the models rather than a gap in policy.

Two dials make this tractable rather than fatal:

- **Decorrelate.** Policy may require that a reviewing agent differ from the
  implementing agent in provider or model, not merely in identity. Targets
  already carry their own providers, and multi-provider review already exists
  for designs, so this is configuration rather than new machinery.
- **Keep acceptance human where it matters.** Integration and acceptance are
  already separate. A class may automate review fully and still require a
  person to record acceptance, which preserves a human decision without putting
  one in the path of every commit.

The honest summary: automation raises the throughput ceiling substantially and
does not remove it. Where being wrong is expensive, a correlated reviewer is not
a reviewer.

### 8. Integrate, accept, and close

1. GitHub performs the merge under repository policy.
2. Avoozl records an integration receipt with repository, pull request, merge
   commit, base branch, checks, reviewer identities, and time.
3. A separate acceptance policy evaluates the originating acceptance criteria.
4. A configured actor records acceptance or a reviewed waiver.
5. The primary marks the task accepted and closed.
6. The issue receives the repository's completed state and closes.
7. All primaries archive the task from action queues while retaining links to
   the issue, commits, pull request, reviews, conversation lineage, evidence,
   and receipts.

Issue closure without the required receipts is an observed mismatch, not
acceptance.

Acceptance is where this workflow ends. Whatever happens to the change
afterwards — released, versioned, published, rolled out regionally, regenerated
into other repositories — is downstream, and deliberately not modeled here.
Avoozl can link to it and read its results as checks, but `accepted` means a
requirement was satisfied, never that a change shipped.

## Delegation mechanics

### Pairing

A secondary is enrolled once, deliberately, and never discovered implicitly. A
secondary that is merely reachable on a network is not a target.

Pairing establishes a target ID, a long-lived credential, the capability set,
and the primary that owns it. A secondary accepts jobs from exactly one
primary. Re-pairing to a different primary is explicit and refuses while any
job is active.

### Moving a job between targets

Moving a job from one of a person's machines to another is **redispatch**. It is
entirely internal to that person's primary: a job record stops pointing at one
target and a new job starts on another. GitHub sees nothing. The issue, the
assignee, and the owner do not change, because ownership was never per-machine.

The new target starts from the last pushed commit on the task branch. Anything
committed but unpushed on the old target is listed before the move, and the move
refuses if that looks like more work than the user expects to redo. Anything
uncommitted is not moved at all.

Redispatch is also how a person with one machine experiences nothing: there is
nowhere to move a job to, so it never appears.

### Liveness

The primary tracks each target's connection and each job's lease. A lease that
expires lets the primary stop that job and start a new one on another target.
That is safe here only because the primary is the sole decision-maker for that
person — there is no second claimant to race. It moves a job between machines;
it never moves ownership between people.

The rule for the target is the mirror and it is the important one: a secondary
that cannot reach its primary stops at the next turn boundary rather than
running on indefinitely. Failing closed on the executor is safe; failing open to
a taker is not. A secondary that has already self-stopped makes redispatch
uneventful.

### Andon

Andon is a button in the primary, scoped to a task, project, or workspace, and
it is ordinary operational equipment rather than an emergency. It means "work
may be unsafe, so hold the gates." `plans/andon-cord.md` owns the full design,
including incident state, server-side enforcement, and resume preconditions.
This design adds only how it reaches a secondary.

The two modes in that plan are exactly the two stops worth having:

- **Freeze** — stop when you can. Close new pickup and protected transitions
  immediately; let the current provider turn reach its normal boundary. Queued
  turns are held, steering is refused, nothing integrates. Use this when
  finishing the current turn is safer than cutting it off.
- **Safe interrupt** — stop now. Every freeze rule, plus a durable interrupt
  intent recorded per affected run, and an interrupt request sent to the
  provider. This is the default for a newly raised project or workspace
  incident.

Both propagate to every target carrying affected jobs, and both preserve
ownership, worktrees, sessions, and receipts. An andon never moves a job or
releases a task.

One honest limit, already modeled in that plan: an interrupt request is not
proof of interruption. Until the provider acknowledges a boundary, a run is
`interrupt-uncertain`. `OPENHANDS_CAPABILITIES` declares
`interruptStopsSpawnedWork: "unknown"`, so on a secondary that uncertainty
extends to anything the agent spawned — a test run, a dev server, a background
script. The fix is on the target, not in the protocol: a secondary should stop
a job's process group, not only its conversation, so "stop now" means it. Until
that exists, the UI reports `interrupt-uncertain` rather than implying a clean
halt.

## Replacing the primary

Because the primary is the sole system of record for one person, replacing it
is a first-class operation rather than a recovery story.

It is also smaller than it sounds. Almost everything a primary knows is a
projection of something GitHub already owns, so a replacement re-derives it
rather than receiving it. Only live work — pairings, running jobs, worktree
locations, cursors, the outbox — is genuinely local, and that is the only thing
a handover needs to carry. History does not transfer, and does not need to.

### Rebuild is the mechanism

There is one mechanism, and it is not a recovery codepath: **rebuild is the
projection pipeline run from scratch.** Projection is already required to be
idempotent, and every durable record already anchors to an external immutable
ID — a task to its design commit and block hash or its issue node ID and body
hash, a pull request and issue to their node IDs, an approval to its anchor ref,
an integration to its merge commit. Replaying projection over the same anchors
reproduces the same records with the same IDs.

So a new primary is installed, pointed at the workspace, and syncs the planning
repository and every registered code repository. The task graph comes back with
ownership from assignment, scope and authorization from provenance, and review,
integration, and acceptance state from GitHub.

That re-derives everything GitHub owns, which is almost everything that
matters, and it does so from the authority rather than from a peer's copy.

### What rebuild cannot know

Only a small set is genuinely local, and it is small because it is exactly the
set GitHub has no reason to hold:

| Local-only state           | Why it matters                                     |
| -------------------------- | -------------------------------------------------- |
| Target pairings            | Which machines this person can delegate to         |
| In-flight job records      | What is running right now, and where               |
| Worktree locations         | Which machine holds which branch, and what is unpushed |
| Unpublished outbox entries | Published effects that had not left yet            |
| Sync cursors               | Where to resume without a full re-read             |
| Conversation pointers      | Which run corresponds to which OpenHands conversation |

Everything in that table is about **live work**. None of it is history.

### Handover carries the delta, not the database

That makes the handover bundle and the rebuild gap the same set, which is the
whole design:

1. The old primary enters **handover**: drain, refuse new work, go read-only.
   It displays a one-time adoption code.
2. The new primary is pointed at the old one's URL with that code. The code is
   single-use and short-lived, so no long-lived key authorizes a takeover.
3. The new primary rebuilds from GitHub, as above.
4. It pulls the live-state delta from the old primary and reconciles it against
   what it just rebuilt.
5. It takes the primary generation, incremented.
6. The old primary records itself superseded and will not resume as primary.
7. The new primary re-pairs each secondary and authenticates to GitHub itself.

Provider credentials, GitHub tokens, and pairing credentials never transfer.
Re-pairing rotates every target credential as a side effect.

If the old machine is gone, steps 1, 2, and 4 are skipped and the result is a
rebuild with the live-state delta missing. That is the same operation with a
stated gap, not a different procedure.

### History does not need to transfer

Closed tasks, old runs, settled receipts, and prior job records are narrative.
Their artifacts are in GitHub — closed issues, merged pull requests, reviews,
merge commits — and the trace from design block to closed issue is reconstructed
by the same projection replay. What is lost is local colour: which conversation
implemented something last quarter, and evidence files that were never
published.

So do not build history migration. Two things cover it for free: the old
primary's database remains a readable archive rather than being destroyed, and
transferring the live set is cheap enough that it can be verified properly
instead of hashing a whole schema.

One exception, and it is the only one: **a record that closes a gate must be
published, never local.** An approval revocation is the example — if it lived
only in the old database, revoked authority would silently become valid again
after a rebuild. This design already publishes approvals as anchor refs and
revocations as receipts, so the rule is satisfied; it is written down here
because it is the invariant that makes discarding history safe.

### The hazard that remains: two primaries

Copying the database file instead of handing over, and starting it while the
original still runs, produces two primaries for one person — both assigning
issues and dispatching jobs from divergent state. `runtimeOwner` will not catch
it, because its liveness check is `process.kill(pid, 0)`, meaningful only on the
same machine.

The **primary generation** bounds the damage. It increments on every adoption,
pairing records it, every job carries it, and a secondary refuses a job from a
generation older than the highest it has seen. A stale primary can read and
export, but nothing will execute for it and it reports itself superseded. That
leaves only GitHub-side effects — a stale primary could still assign an issue —
which are visible, human-paced, and reconcilable, rather than two machines
quietly running agents on one task.

Conversations are never lost by any of this. They live in OpenHands on whichever
machine ran them; the worst case is a pointer an operator relinks.

## State machines

### Task

```text
design draft
    |
    v
planning review -> revision requested -> planning review
    |
    v
approved revision -> projected -> ready
                                    |
                                    v
                                  owned
                                         |
                                         v
                                       active
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
                    blocked                         implementation complete
                       |                                   |
                       +------------> active               v
                                                   pull request open
                                                           |
                                                           v
                                                        review
                                                  +--------+--------+
                                                  |                 |
                                                  v                 v
                                          changes requested      approved
                                                  |                 |
                                                  +----> active     v
                                                               integrated
                                                                   |
                                                                   v
                                                                accepted
                                                                   |
                                                                   v
                                                                  closed
```

`quarantined` may intercept an imported task before `ready`. An open andon cord
holds protected transitions without pretending the task changed business status.

### Job

```text
pending -> running -> done | failed | stopped
   |
   v
rejected
```

A job is the primary's record of one attempt on one target. A task may have
several job records over its life; only one may be running. Redispatch is not a
state — it stops one job and creates another.

### Review

```text
eligible -> requested -> submitted -> approved / changes-requested
                            |
                            v
                        superseded
```

A new pull request head may supersede a submitted review under branch policy.

## Synchronization

### Event sources

OpenHands automations watch configured GitHub repositories and submit exact,
authenticated snapshots to the owning primary. Snapshots may contain planning
pull request changes and review state; issue labels, assignment, comments, and
closure; code branch and commit changes; and pull request head, checks,
reviews, and merge state.

A primary verifies every snapshot against GitHub before an authorization-bearing
transition. Manual Sync remains the reconciliation and recovery path.

### Local materialization

Each primary's database stores the last complete generation per repository,
GitHub node IDs and immutable hashes, task and review projections, event
cursors and replay IDs, registered targets and their capabilities, jobs, local
runs and leases, worktree locations by target, unpublished outbox entries, and
associations between plans, tasks, issues, commits, pull requests, and runs.

Synchronization is idempotent. The same event may arrive many times. A partial
repository generation never deletes prior state.

### Convergence rules

- GitHub node IDs identify issues and pull requests; numbers and titles do not.
- The assignee identifies the owning person, and therefore the owning primary.
- Design-origin scope comes only from its authorized design revision.
- Issue-origin scope comes only from its authorized issue snapshot.
- Local execution events cannot rewrite shared authorization.
- A shared transition cannot silently discard unpublished local work.
- A primary reconciles its own materialized view against GitHub, never against
  another primary. Primaries do not compare state with each other, so a stale
  local view is resolved by re-reading rather than treated as a conflict.
- State that still contradicts GitHub after a re-read produces a finding and
  closes protected gates.

### Progress visibility

The UI distinguishes:

- **durable phase:** last state confirmed through GitHub;
- **local activity:** a job this primary is driving, on any of its targets;
- **remote activity:** a recent sanitized check-in from another person's
  primary;
- **unknown:** no current activity evidence.

Another person's activity is never represented as a guaranteed live connection.
A user can follow commits, branches, pull requests, checks, and published
checkpoints from any primary. Attaching to someone else's live OpenHands
conversation requires a separately authenticated route and is optional.

## Queue behavior

Three queues, each answering a different question for the current actor:

- **Mine** — what I own, grouped by executing target. Blocked work stays here
  with a badge saying why, because it is still mine to unblock.
- **Available** — authorized work nobody has taken.
- **Review** — pull requests I am eligible for and did not author or implement.

Anything else is a filter rather than a queue. Completed work is hidden by
default and reachable with a toggle; it is never deleted. Designs awaiting
review and tasks awaiting acceptance appear in Mine or Review according to who
is responsible, rather than in a separate bucket that needs its own relevance
rules.

## Scaling

Nothing here is a function of team size. There are two axes, and each adds
exactly one thing.

**One machine or several.** With one machine the primary is also the execution
target: no pairing, no delegation, nothing in this design is paid for. Adding
machines adds paired secondaries, which may run different providers and models,
and redispatch to move a job between them.

**One person or several.** Alone, GitHub publication is optional and independent
review is a waiver or a separately identified agent reviewer. With other people,
GitHub becomes the shared surface: planning pull requests for design review, the
assignee for ownership, review work visible only to eligible non-authors.

Growth past that is ordinary GitHub practice rather than new mechanism.
CODEOWNERS, protected branches, and required checks keep working. A GitHub App
is worth owning snapshot delivery where policy permits. Repository and team
filters narrow queues without changing authority, and update batching matters
once repositories are busy. None of these change how anything is owned.

A person may work locally after taking a task, but taking, integrating, and
accepting all require synchronization.

## Multi-repository plans

A task declares one execution repository. A design may produce tasks in several
repositories, and they are simply independent tasks — each with its own issue,
owner, branch, pull request, checks, review, and integration receipt. Ordering
between them is the design author's concern.

There is no parent-objective construct, no aggregate acceptance, and no
cross-repository merge. A failure in one repository does not roll back another's
history, and nothing pretends otherwise.

## Concurrent behavior

### Offline

A target finishes its current turn and stops, per the liveness rule. A primary
that cannot reach GitHub may keep dispatching work it has already taken, but
cannot take more, because taking work means assigning an issue.

### Concurrent claims

Two people taking the same issue is detected on re-read: one assignment stands,
the other reports a conflict and starts nothing. Near-simultaneous success is
possible and is surfaced as a reconciliation finding rather than silently
tolerated.

### Concurrent design edits

Normal Git pull request conflict handling applies. Avoozl derives tasks only
from the merged revision, never from the apparent union of competing branches.

### Conflicting issue edits

For a design-origin task, issue text is a projection. A conflicting issue edit
is displayed and may become a proposed amendment, but it cannot change active
scope.

For issue-origin work, a body-hash change after authorization invalidates
dispatch until an allowed actor reauthorizes the new snapshot.

## Failure handling

| Failure                                    | Required behavior                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| GitHub unavailable while taking work       | No assignment, no job, no worktree, no agent                            |
| Assignment appears to succeed for two people | Report reconciliation finding; do not both dispatch                   |
| Assignment changes externally              | Report mismatch; do not silently transfer ownership                     |
| Target unreachable before dispatch         | Job stays pending; try another target or hold with a stated reason      |
| Target unreachable during a job            | Target self-stops at a boundary; primary may redispatch from last push    |
| Target rejects a job                       | Record the rejection reason; do not retry blindly on the same target    |
| OpenHands conversation fails               | Task stays active or blocked; retry or redispatch explicitly              |
| Progress publication fails                 | Continue authorized local work if policy permits; queue the outbox      |
| Pull request head changes                  | Rebind validation and review to the new exact commit                    |
| Reviewer becomes ineligible                | Invalidate that review and request another reviewer                     |
| Secondary dies before pushing a commit    | Resume from last push; state possible local loss explicitly             |
| Primary database lost                      | Restore from backup; re-pair targets; reconcile from GitHub             |
| Duplicate snapshot or webhook              | Return the prior receipt without repeating effects                      |
| Incomplete repository snapshot             | Preserve prior materialization; never infer deletions                   |
| Approval anchor unreachable                | Treat derived tasks as unverified authority; close protected gates       |
| Local clock skew                            | Order by recorded event IDs and GitHub timestamps, not local clocks     |

## Security and threat model

### The secondary listener is the main new surface

A secondary accepts jobs and runs them. That is remote code execution by
design, and it is the highest-risk component introduced here. Today
`agent-host.mjs` binds `127.0.0.1` and rejects any request whose `Host` header
is not loopback, and `openhands.mjs` asserts the agent server host is loopback.
Those defaults must survive: delegation is opt-in, and loopback-only remains the
default posture.

Requirements before any non-loopback listener ships:

- explicit pairing, with no implicit or broadcast discovery;
- mutual authentication on every job, not a bearer token over plain HTTP;
- transport confidentiality and integrity, via TLS or a private overlay
  network rather than a forwarded port;
- binding to a specific private interface, never to all interfaces;
- a narrow job envelope, so a compromised primary cannot read a target's
  secrets and a compromised target cannot widen its own authorization;
- per-job audit records on both sides.

The `builder-security` skill applies to this work and must be followed as
policy, not reference, before the bind or the auth mechanism is written.

### Untrusted input

Issue bodies, comments, pull request text, Markdown designs, patches,
filenames, and repository content are untrusted prompt input. A maintainer
applying a label does not make the body safe. A job envelope from the primary
carries untrusted content and must be treated as data by the target.

Run-scoped MCP remains deny-by-default. Plan approval, task acceptance,
integration, merge, credential changes, configuration changes, and target
pairing are denied unless a narrower policy grants the exact action.

### Authorization

- Label-authorized execution is limited to configured private repositories by
  default.
- The label actor must have configured repository authority and appear on the
  Avoozl allowlist.
- Public repository observation never implies execution authority.
- Assignment routes and claims work; it grants no new capability. Someone else
  assigning an issue cannot cause unattended execution unless policy explicitly
  allows unattended dispatch for that repository.
- Protected transitions re-fetch GitHub state rather than trusting cached
  snapshots.

### Secrets

Never publish provider keys or profile credentials, GitHub tokens, OpenHands
service credentials, pairing credentials, environment files, local paths or
usernames, raw prompts or transcripts, terminal logs, unredacted tool results,
or intake capability tokens.

Shared configuration contains only non-secret policy. Machine-local data lives
under `.avoozl/local/` and is globally ignored. Export and publication inspect
paths, symlinks, sizes, and secret patterns and fail closed.

A target's credentials stay on the target. The primary stores a pairing
credential and nothing else belonging to that machine.

### Replay and tampering

- Every submitted event and every job has a stable delivery ID.
- Receipts bind event ID, source hash, actor, target, and result.
- Replays return the original result.
- Reusing an ID with different content is tampering.
- Approval anchors are immutable refs and are verified before derived work.
- Approval, integration, and acceptance receipts remain separate.

### Privacy

Team members observe the work metadata required for collaboration. Full agent
conversations stay on the machine that ran them unless the owner deliberately
exposes that instance through a separate authenticated channel. The default
shared view contains summaries and artifact links only.

## Configuration

Shared policy lives in each repository's own `.avoozl.json`, which already
declares the repository's identity and roles. Most of what this design needs is
there: `github.issueIntake` carries the authorization `label`, `allowedActors`,
and `minimumPermission`, which are exactly the two checks Avoozl adds on top of
GitHub's permissions.

Only review classes are new:

```json
{
  "$schema": "./src/avoozl-config.schema.json",
  "version": 1,
  "workspaceId": "product",
  "repository": {
    "id": "service-a",
    "roles": ["code"],
    "baseBranch": "main"
  },
  "github": {
    "issueIntake": {
      "team/service-a": {
        "label": "avoozl:ready",
        "minimumPermission": "write",
        "allowedActors": ["github-user:1234"],
        "autoStart": false
      }
    }
  },
  "review": {
    "requiredChecks": ["build", "test"],
    "excludeAuthor": true,
    "excludeImplementer": true,
    "defaultClass": "high-consequence",
    "classes": {
      "mechanical": { "humans": 0, "agents": 0 },
      "low-risk": { "humans": 0, "agents": 1, "notifyHuman": true },
      "normal": { "humans": 1, "agents": 1 },
      "high-consequence": {
        "humans": 1,
        "agents": 1,
        "agentIsAdvisory": true,
        "requireHumanAcceptance": true
      }
    },
    "agentReviewer": { "mustDifferBy": "provider" }
  }
}
```

Targets are machine-local rather than shared policy, since they describe one
person's hardware and credentials:

```json
{
  "role": "primary",
  "targets": [
    {
      "id": "target:desktop",
      "url": "https://desktop.internal:38100",
      "capabilities": {
        "os": "linux",
        "arch": "arm64",
        "repositories": ["team/service-a"],
        "providers": ["anthropic"],
        "concurrency": 2
      }
    }
  ]
}
```

Machine-local data stays under `.avoozl/local/` and is globally ignored.

## User experience

### Task view

The task drawer shows task state; design, issue, or imported provenance,
including whether its authority was revoked; owner and
executing target; local, remote, or unknown activity; branch, worktree location
and which machine holds it, commits, and pull requests; current validation and
review state; independent reviewer or eligible reviewers; integration and
acceptance receipts; and Redispatch, Release, Raise andon, Review, and Open
session actions as policy allows.

### Targets view

A primary-only view listing each registered target with its pairing state,
reachability, capabilities, current jobs, and recent job history. Pairing,
re-pairing, and removal happen here, and removal refuses while a job is active.

### Team activity

The activity page groups work running on this person's targets, work owned by
teammates, implementation awaiting review, review awaiting response, blocked or
incident-held work, and recently integrated and accepted work.

Rows for other people's work link to GitHub artifacts. They do not offer
steering unless a separate authenticated connection is configured.

### Redispatch

The Redispatch action names the new target, lists unpushed commits and running
turns on the current target, refuses an unsafe move, stops the current job at a
boundary, and reports what resumed and what may have been lost.

There is no "force because offline" shortcut that silently discards work.

## API operations

Exposed through UI, CLI, and MCP:

- `targets.list`
- `targets.pair`
- `targets.unpair`
- `targets.status`
- `work.take`
- `work.release`
- `jobs.dispatch`
- `jobs.redispatch`
- `jobs.stop`
- `jobs.status`
- `review.queue`
- `review.request`
- `checkpoint.publish`
- `checkpoint.reconcile`
- `andon.raise`
- `andon.resolve`
- `primary.rebuild` — reproject from GitHub; report the live-state gap
- `primary.handover` — drain, go read-only, issue a one-time adoption code
- `primary.adopt` — rebuild, then pull and reconcile the live-state delta
- `primary.liveState` — serve or export the local-only set, for adopt or backup

Agent access is narrower: read task state and checkpoints for its own job,
publish bounded checkpoints for that job, request redispatch or release, and
raise an andon incident. An agent may never pair a target, approve scope,
accept work, or merge by default.

All mutation operations accept an idempotency key.

## Observability

Record what indicates something is wrong, not what indicates activity:

- assignment conflicts detected;
- independence violations prevented;
- job rejections, by reason;
- targets that self-stopped on primary loss;
- unpushed work reported at redispatch;
- reconciliation findings, and snapshot lag;
- pending outbox age;
- work blocked by incident or policy.

Throughput and latency figures are deliberately absent. They are easy to
collect, invite optimizing the wrong thing, and none of them would change a
decision in this design.

Metrics use stable pseudonymous IDs and contain no prompt, credential, source
content, or transcript.

## Rollout

Two steps, because only two orderings are forced. Everything else can be built
in whatever order suits the work. The acceptance matrix below defines done; it
is not repeated here.

**Step 1 — multi-user, one machine each.** Identity and observation, design
publication with approval anchors and revocation, idempotent issue projection,
the hardened assignee claim path, checkpoints and artifact association, review
classes and independence, integration receipts, separate acceptance, and
archive-on-close. This is a complete product for a team where each person works
on one computer.

**Step 2 — delegation.** Target pairing, a per-target OpenHands endpoint, job
dispatch with narrow envelopes and capability matching, leases and liveness,
self-stop on primary loss, redispatch, andon propagation to targets, the primary
generation fence, and primary handover, copy, and rebuild. Includes its own
security work rather than deferring it.

The two forced orderings: taking work has to exist before delegating it, and
the authentication, transport, and private-interface binding for a secondary
have to ship with the listener, never after it. Loopback-only stays the default
throughout, so step 1 is unaffected by step 2's risk.

Team-scale concerns — GitHub App permissions, delivery batching, rate-limit
handling, repository partitioning — are hardening applied when a real team hits
them, not a step to wait for.

## Acceptance test matrix

1. two users race to take the same task;
2. one user dispatches to two targets and only one job runs;
3. assignment succeeds but confirmation read fails;
4. a source issue changes after label authorization;
5. a design changes after implementation starts;
6. an approval is revoked after tasks were derived;
7. a planning branch is rewritten after approval;
8. a pull request is force-pushed after review;
9. the author attempts to satisfy a required review;
10. a reviewer approves an older head;
11. a secondary loses contact with unpushed commits;
12. a secondary is lost after pushing a commit;
13. a secondary is dispatched a job it cannot satisfy;
14. an unpaired machine attempts to accept a job;
15. a paired secondary is re-pointed at a second primary;
16. andon is raised while a secondary job is mid-turn;
17. duplicate and out-of-order snapshots arrive;
18. a repository snapshot is incomplete;
19. the authorization label is removed while work is active;
20. one planning repository projects tasks to several code repositories;
21. a target uses different provider credentials from the primary;
22. a public repository submits malicious issue content;
23. a task integrates but fails acceptance;
24. a primary hands over to a new primary, which supersedes it and re-pairs;
25. an adoption transfer is interrupted part way through;
26. a superseded primary is restarted and attempts to dispatch;
27. a primary is rebuilt from GitHub alone and names its live-state gap;
28. a rebuilt primary does not restore an approval that was revoked;
29. a rebuild reproduces task IDs identically from the same anchors;
30. more than ten developers take unrelated work concurrently.

Every test asserts both allowed behavior and denied side effects.

## Invariants

1. Each person runs exactly one primary, and it is the sole system of record
   for that person.
2. A secondary has no database, no UI, and no ownership decisions.
3. A secondary accepts jobs from exactly one primary and only after pairing.
4. Reachability is never authorization; pairing is explicit.
5. A job envelope carries only what that job needs.
6. A target's credentials never leave that target.
7. A design-origin task's scope comes only from its approved revision, held
   reachable by an immutable approval anchor.
8. Provenance never changes kind, whether design-origin, issue-origin, or
   imported from a tracker.
9. Active scope is immutable until work reaches a reviewed amendment boundary.
10. Assignment routes and claims work but grants no execution capability.
11. A target that cannot reach its primary stops at a turn boundary.
12. A lease expiry may move a job to another of that person's targets. It never
    moves ownership between people, and it never changes a GitHub assignee.
13. Unpushed work is reported before a move and named as possible loss after
    one, never silently discarded.
14. Where a change class requires review, the author and implementer cannot
    satisfy it, whether human or agent.
15. Review, integration, acceptance, and closure remain separate.
16. Credentials and raw conversations never enter shared Git state.
17. Processed work is archived from queues, not erased.
18. An andon cord blocks unsafe advancement; it never transfers ownership.
19. Failure to synchronize makes protected operations less permissive, never
    more permissive.
20. Loopback-only is the default posture; delegation is opt-in.
21. A secondary refuses a job from a primary generation older than the highest
    it has seen.
22. A primary must be able to rebuild from GitHub plus re-pairing, and must
    report what it could not recover.
23. Any record that closes a gate is published, never local only, so discarding
    local history can never restore revoked authority.

## Decisions

- One primary per person; it owns the database, the UI, and all decisions.
- Secondaries are headless execution targets with no database and no UI.
- A secondary is an OpenHands Agent Server registered as an execution target,
  not a second Avoozl installation.
- Coordination within a person is local RPC; coordination across people is
  GitHub.
- The GitHub assignee is the cross-person claim, which is sound because each
  person has exactly one primary.
- Unattended cross-person dispatch is out of scope, so no distributed exclusion
  mechanism is needed anywhere in this design.
- Approvals get immutable anchor refs and support revocation.
- Review uses native GitHub review requests; independence is enforced by
  identity, not by exclusive claim.
- Review is policy per change class, so human attention is not the default limit
  on throughput. Agent review is real review, and an unmatched change takes the
  most restrictive class.
- Imported tracker requirements are an intake source with their own provenance,
  never a second coordination substrate.
- Task state lives in the primary. GitHub's native fields are the mirror, so
  there is no label vocabulary to configure and no mapping to keep correct. One
  label carries authorization, because that grants authority.
- A person is their GitHub identity, and permission is GitHub's answer. Avoozl
  adds only write access and an execution allowlist.
- Three queues: Mine, Available, Review. Everything else is a filter.
- Cross-repository work is independent tasks, not a parent-objective construct.
- Keep local live leases in the primary's SQLite.
- Publish sanitized checkpoints, not raw execution streams.
- Push at meaningful boundaries; require honest reporting of unpushed work
  rather than a push cadence.
- Andon is a primary-side button with the two modes in `plans/andon-cord.md`:
  freeze stops when it can, safe interrupt stops now.
- Replacing a primary is a rebuild from GitHub plus a live-state delta. History
  is not migrated; the old database stays a readable archive.
- A primary generation fences stale primaries at the target.
- Keep loopback-only defaults; delegation is opt-in and explicitly paired.
- Retain manual reconciliation even when automations provide snapshots.

## Open questions

- Whether OpenHands can express task worktree lifecycle as job setup on a
  target, or whether a minimal headless Avoozl executor is needed alongside it.
- Whether a secondary can stop a job's whole process group, so "stop now" covers
  what the agent spawned and `interrupt-uncertain` becomes rare rather than
  routine.
- Which transport to require for non-loopback delegation: TLS with pinned
  certificates, or a private overlay network only.
- How a primary should present a secondary's worktree contents before a push,
  if at all.
- Whether capability matching should be declarative only, or probe a target.
- How change class is determined — declared paths and change shapes, or
  something that inspects the diff.
- Whether `mustDifferBy: "provider"` is strong enough decorrelation to justify
  automating review on a class, or whether that needs measuring first.
- Whether moving a primary warrants tooling beyond documented database
  relocation and a recommended backup.
- Whether a rebuilt primary should offer to relink conversation pointers, or
  simply drop them.
- Whether a periodic live-state export should be automatic, and where it goes.
- Whether conversation pointers belong in published checkpoints, which would move
  them out of the local-only set and shrink the handover delta further.
