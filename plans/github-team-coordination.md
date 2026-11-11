# GitHub-backed team coordination

**Status:** Proposed design  
**Date:** November 11, 2026  
**Project:** Avoozl  
**Audience:** Avoozl maintainers and teams adopting shared planning

## Summary

Avoozl should support the same workflow for one developer using two computers
and for a team of ten or more developers:

1. people and agents publish Markdown designs through Git;
2. reviewers improve and approve an exact design revision;
3. approved work is projected into GitHub issues;
4. a person claims an issue and one of that person's computers activates it;
5. OpenHands performs the work in a task worktree;
6. every Avoozl instance can observe the owner, phase, commits, branch, pull
   request, checks, review, integration, and acceptance;
7. an independent reviewer claims the review;
8. completion closes the GitHub work and every instance converges.

Each developer runs a private Avoozl service and OpenHands instance. Provider
credentials, raw conversations, worktrees, and live execution remain local.
GitHub is the durable team record and coordination substrate. It carries
designs, authorization events, assignments, claims, branches, pull requests,
reviews, sanitized progress receipts, and completion.

GitHub is not a heartbeat service. A durable Git claim prevents two people from
owning the same work, but it does not prove that a process is alive. Avoozl
keeps short-lived process and agent leases locally. It never takes over work
because a heartbeat expired.

Moving work from one computer to another is an explicit fenced handoff:
checkpoint and push the code, publish portable Avoozl state, transfer the
machine epoch, start a continuation conversation, and fence the former
computer. An andon cord is a separate safety mechanism. It may be required to
recover work from a lost computer, but routine handoff does not raise an
incident.

## Product intent

The collaboration model must preserve five boundaries:

- A merged design authorizes scope; it does not prove implementation.
- A task claim chooses a person; it does not choose one of that person's
  computers.
- A machine activation chooses a computer; it does not approve a change.
- A completed agent turn does not mean the change is integrated.
- A merged pull request does not mean the originating requirement is accepted.

These boundaries let a small team use substantial automation without reducing
delivery to label-to-pull-request fire-and-forget behavior.

The normal interface remains the Avoozl extension inside each developer's
OpenHands Canvas. No shared Avoozl web server, shared SQLite file, shared
provider credential, or shared OpenHands account is required.

## Goals

- Scale from one developer to at least ten active developers.
- Support one planning repository coordinating multiple code repositories.
- Publish plans and design documents through normal GitHub pull requests.
- Derive reviewable tasks from exact merged design revisions.
- Accept bounded issue-origin work without weakening design-origin provenance.
- Let custom repository labels map to normalized Avoozl states.
- Prevent two people from claiming the same implementation or review slot.
- Prevent two computers owned by one person from driving the same task.
- Make remote progress observable without publishing secrets or transcripts.
- Require independent review when policy calls for it.
- Move an active repository safely between a person's computers.
- Work offline for local execution while failing closed on shared transitions.
- Recover deterministically from duplicate delivery, force-push, partial
  publication, machine loss, and concurrent claims.

## Non-goals

- Sharing a SQLite database between computers.
- Synchronizing provider credentials, environment variables, cookies, raw
  terminal output, or full OpenHands transcripts through GitHub.
- Treating issue assignment, a label, a heartbeat, or an assignee's absence as
  proof that a task is safe to take over.
- Redirecting active work when a design or issue body changes.
- Requiring one centralized Avoozl or OpenHands deployment.
- Making GitHub issue comments the canonical design document.
- Making GitHub a low-latency agent message bus.
- Moving uncommitted work between computers.
- Letting an author satisfy an independent-review requirement on their own pull
  request.
- Automatically closing work merely because an agent stopped or a pull request
  merged.

## Operating model

### Per-developer services

Each developer owns:

- one or more computers;
- an Avoozl service and SQLite database on each active computer;
- an OpenHands instance and local provider credentials on each computer;
- a stable GitHub identity;
- a stable Avoozl actor ID bound to that GitHub identity;
- a distinct machine ID for every computer.

The developer's computers may use different providers and models. The shared
record names the actor and machine that performed a transition, but never
publishes the credential or secret used to perform it.

### Shared GitHub resources

A workspace selects one planning repository. It may be:

- a dedicated private repository;
- the same repository as the code;
- a configured branch or directory in another repository.

The planning repository carries:

- Markdown designs and plans;
- shared Avoozl configuration and JSON Schema references;
- task provenance and sanitized approval receipts;
- append-only coordination histories;
- machine-handoff checkpoints;
- stable mappings from design tasks to code-repository issues.

One planning repository may register any number of code repositories. Each code
repository retains its own branch rules, checks, labels, teams, issues, and pull
requests.

### Ownership summary

| Concern                  | Authority                                            |
| ------------------------ | ---------------------------------------------------- |
| Design prose             | Markdown at an exact Git commit                      |
| Design review            | GitHub planning pull request reviews                 |
| Design approval          | Merged revision plus Avoozl approval receipt         |
| Task scope               | Design task block or immutable issue-origin snapshot |
| Human routing            | GitHub assignee                                      |
| Work authorization       | Reviewed design provenance or allowed label event    |
| Person-level claim       | Git compare-and-swap claim history                   |
| Active computer          | Monotonic machine epoch in the claim history         |
| Live agent/process lease | Local Avoozl SQLite                                  |
| Conversation and tools   | Local OpenHands                                      |
| Code                     | Task branch and commits                              |
| Code review              | GitHub pull request reviews                          |
| Validation               | Avoozl evidence bound to an exact commit             |
| Integration              | GitHub merge plus Avoozl integration receipt         |
| Acceptance               | Separate Avoozl acceptance decision                  |

## Identity

Every durable event records:

- workspace ID;
- stable task ID;
- GitHub actor login and immutable actor ID when available;
- Avoozl actor ID;
- machine ID;
- instance epoch;
- event type and event ID;
- source repository and node ID;
- source and result hashes;
- timestamp supplied by the writer;
- Git commit and GitHub event timestamps observed by readers.

Display names are not authority. Renaming a GitHub login does not create a new
actor. If immutable identity cannot be resolved, a protected transition fails
closed.

Team policy maps actors and teams to capabilities such as:

- publish design;
- approve design;
- authorize issue-origin work;
- claim implementation;
- claim independent review;
- recover a lost-machine activation;
- accept a completed task.

The ability to comment, assign, label, push code, review, merge, and accept are
modeled separately even when one person holds several capabilities.

## Durable Git coordination

### Why labels and assignments are insufficient

A label can authorize work and an assignee can route work to a person, but two
instances can observe those fields at the same time. GitHub does not make a
multi-field issue update an exclusive claim.

Avoozl therefore uses three layers:

1. **Authorization:** a reviewed design revision or allowed label event says
   the work may run.
2. **Routing:** the GitHub assignee says which person's instances should care.
3. **Claim and activation:** a compare-and-swap coordination record says which
   person owns the task and which machine epoch may drive it.

### Per-task coordination ref

Each task has a stable coordination ref in the planning repository:

```text
refs/heads/avoozl/claims/<workspace-id>/<task-key>
```

The ref points to a linear chain of small commits. Each commit contains one
canonical JSON manifest and has the previous claim commit as its parent.
Examples of transitions are `claim`, `activate`, `handoff-offer`,
`handoff-accept`, `release`, `recover`, and `close`.

Creating the first ref is exclusive: only one concurrent push can create the
same ref. Later transitions are normal fast-forward pushes based on the exact
observed head. If two writers race, one push succeeds and the other is rejected
as non-fast-forward. The loser fetches, re-evaluates policy, and does not act.

No force-push or ref deletion is part of the protocol. A released task remains
as history and a new claimant appends to the same chain. This prevents an
acquire-delete-acquire ABA ambiguity.

Per-task refs avoid a single global state branch becoming a contention point.
They are machine-readable coordination records, not code-development branches.
Repositories should protect the `avoozl/claims/**` pattern from force-push and
deletion and limit updates to authorized users or an Avoozl GitHub App.

### Claim manifest

```json
{
  "version": 1,
  "workspaceId": "workspace-example",
  "taskId": "task-example",
  "source": {
    "kind": "design",
    "repository": "team/plans",
    "revision": "9f0d...",
    "blockId": "runtime-cache"
  },
  "authorization": {
    "eventId": "approval:...",
    "hash": "sha256:..."
  },
  "claim": {
    "epoch": 4,
    "ownerActorId": "github-user:1234",
    "ownerLogin": "developer",
    "state": "active"
  },
  "activation": {
    "machineEpoch": 7,
    "machineId": "machine:...",
    "instanceEpoch": "instance:..."
  },
  "checkpoint": {
    "repository": "team/code",
    "branch": "avoozl/task-example",
    "commit": "61ac...",
    "portableRevision": "22bd..."
  },
  "event": {
    "id": "event:...",
    "type": "activate",
    "actorId": "github-user:1234",
    "machineId": "machine:...",
    "createdAt": "2026-11-11T02:00:00Z"
  }
}
```

The manifest contains no token, prompt, environment value, transcript, or local
filesystem path.

### GitHub issue mirrors

Human-readable issue fields mirror the authoritative workflow:

- normalized state is represented with the repository's configured label;
- the assignee mirrors the claim owner;
- a single Avoozl status comment links the design revision, task, branch, pull
  request, checks, and current phase;
- milestone comments append important transitions without streaming logs.

The status comment is useful UI, not the exclusive claim. If it disagrees with
the claim ref, Avoozl reports a reconciliation finding and refuses a protected
transition until the disagreement is resolved.

## Normalized repository states

Repositories may use their existing vocabulary. Avoozl maps configured labels
or project fields into normalized states:

| Normalized state    | Meaning                                                      |
| ------------------- | ------------------------------------------------------------ |
| `triage`            | Observed but not yet accepted into the workflow              |
| `ready`             | Authorized and eligible to be claimed                        |
| `claimed`           | Owned by a person but not active on a machine                |
| `active`            | A machine epoch may drive implementation                     |
| `blocked`           | Cannot advance because of a dependency or external condition |
| `quarantined`       | Imported content requires explicit review before dispatch    |
| `review`            | Implementation awaits independent review                     |
| `changes-requested` | Review returned the task to implementation                   |
| `integrated`        | Exact code revision landed                                   |
| `accepted`          | Requirement acceptance was recorded                          |
| `closed`            | Durable workflow is complete                                 |

The issue detail view always shows the original GitHub labels and fields.
Grouping, policy, and automation use normalized states.

Mappings are stored per repository in shared `.avoozl.json`. Defaults
work without configuration. Unknown labels remain visible but do not silently
grant authority.

## End-to-end workflow

### 1. Publish and review a design

1. A person or agent edits a Markdown design in the planning repository.
2. Avoozl runs deterministic checks and optional multi-provider review.
3. The author opens a planning pull request.
4. Review comments remain anchored to the Markdown diff.
5. The author revises the document and replies to findings.
6. Required reviewers approve the exact head revision.
7. The pull request merges.
8. Avoozl records the merged commit, review identities, checks, and task-block
   hashes as the authorization revision.

An edit after approval is a new revision. It cannot redirect active work.

### 2. Project and triage tasks

For each approved task block, Avoozl:

1. resolves the target code repository and project policy;
2. creates or updates one GitHub issue with a deterministic marker;
3. copies human-readable scope and acceptance criteria;
4. stores design provenance by repository, commit, document path, and block
   hash;
5. applies the repository's normalized triage or ready label;
6. records the GitHub issue node ID in the planning record.

Projection is idempotent. A repeated event updates the same issue only when
policy allows the design-owned fields to change. An issue edit cannot rewrite
the scope of a design-origin task.

Issue-origin work follows a separate provenance union. Its authorization names
the exact issue node ID, body hash, label event, actor, and timestamp. It can
never later claim design authorization.

### 3. Claim implementation

1. A developer selects a ready issue in Queue.
2. Avoozl re-fetches the issue and authorization event.
3. It verifies repository policy, allowed actor, exact source hash, and
   eligibility.
4. It resolves the developer's immutable GitHub identity.
5. It fast-forwards the task claim ref with a `claim` transition.
6. Only after that push succeeds does it assign the issue to the developer.
7. If assignment fails, the claim enters `claim-pending-routing`; no work
   starts until reconciliation succeeds or the claimant releases it.
8. Other instances fetch the claim and remove the task from their available
   queue.

Claiming does not start an agent.

### 4. Activate one computer

The claimant chooses a computer. That Avoozl instance:

1. fetches the current claim head;
2. confirms the actor owns the claim and no other machine epoch is active;
3. appends an `activate` transition naming its stable machine ID and a new
   monotonic machine epoch;
4. creates or reuses the task worktree;
5. records a local task lease;
6. creates a child OpenHands conversation in that workspace.

The local lease prevents duplicate local dispatch. The Git activation epoch
fences the claimant's other computers. Avoozl never treats an expired local
heartbeat as permission for another computer to replace the active machine.

### 5. Implement and publish progress

OpenHands owns chat, terminal, files, browser, tools, interruption, and resume.
Avoozl owns the task boundary and publishes low-frequency milestones:

- conversation started;
- branch created;
- checkpoint commit pushed;
- validation started or completed;
- pull request opened;
- changes requested;
- ready for re-review;
- integrated;
- accepted.

The shared status contains links and sanitized summaries. It does not contain
raw prompts, chain-of-thought, terminal output, tokens, credentials, or
unreviewed file contents.

Every instance can display:

- claim owner and active machine display name;
- last durable phase and timestamp;
- branch and latest pushed commit;
- pull request and check states;
- review owner and review state;
- integration and acceptance receipts.

"Last published five minutes ago" is an observation, not a liveness claim.

### 6. Open a pull request

Avoozl records:

- repository and pull request node ID;
- base branch and head branch;
- exact head commit;
- task and design provenance marker;
- validation evidence;
- author actor ID;
- requested reviewer policy.

Multiple pull request attempts remain in history. Avoozl derives one current
primary attempt and flags multiple simultaneously open attempts.

### 7. Claim independent review

Opening a pull request creates one or more review work items. Each required
review slot has its own stable claim key.

The eligible set excludes:

- the pull request author;
- the implementation claim owner;
- any actor whose identity cannot be resolved;
- actors excluded by repository policy;
- an agent instance using the same configured identity when policy requires a
  different identity.

A reviewer claims a slot through the same compare-and-swap protocol. Avoozl
then requests that reviewer on GitHub when permissions allow.

The reviewer may use a local agent to inspect the pull request, but the durable
review is a GitHub review bound to an exact commit. A comment, local agent
summary, or Avoozl task completion does not count as approval.

If changes are requested:

1. the implementation task returns to `changes-requested`;
2. the original implementer retains ownership unless explicitly released;
3. new commits invalidate approvals according to repository rules;
4. review work becomes eligible again at the new exact head.

If the team has one developer, policy may require an explicit review waiver or
allow a separately identified agent reviewer. Avoozl records the waiver; it
does not silently treat self-review as independent review.

### 8. Integrate, accept, and close

After required checks and reviews pass:

1. GitHub performs the merge under repository policy.
2. Avoozl records an integration receipt containing repository, pull request,
   merge commit, base branch, checks, reviewer identities, and time.
3. A separate acceptance policy evaluates the originating acceptance criteria.
4. A configured actor records acceptance or a reviewed waiver.
5. Avoozl appends `accepted` and `close` to the task claim history.
6. The issue receives the repository's completed state and closes.
7. All instances archive the task from action queues while retaining links to
   the issue, commits, pull request, reviews, conversation lineage, evidence,
   and receipts.

Issue closure without the required receipts is an observed mismatch, not
acceptance.

## State machines

### Task

```text
design draft
    |
    v
planning review -> revision requested -> planning review
    |
    v
approved revision -> projected -> triage -> ready
                                         |
                                         v
                                      claimed
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
holds protected transitions without pretending the task changed business
status.

### Claim

```text
unclaimed -> claim-pending-routing -> claimed -> active
    ^                |                  |         |
    |                v                  v         v
    +------------- released <------ handoff --- closed
                                      |
                                      v
                                   recovery
```

Every claim and activation transition increments its corresponding epoch. A
writer with an older epoch is fenced even if it still has a process, worktree,
or OpenHands conversation.

### Review slot

```text
available -> claimed -> reviewing -> submitted
    ^          |           |            |
    |          v           v            v
    +------- released   superseded   approved / changes-requested
```

A new pull request head may supersede a submitted review under branch policy.

## Switching computers

### Routine handoff

Moving from computer A to computer B is deliberate and lossless at a durable
boundary:

1. **Request:** A or B creates a handoff request naming the target machine.
2. **Drain:** A stops accepting new turns for the task and waits for the current
   OpenHands turn and protected operations to reach a boundary.
3. **Checkpoint:** A commits all intended work, runs the configured checkpoint
   checks, and pushes the task branch.
4. **Flush:** A publishes portable Avoozl task state and a sanitized handoff
   summary to the planning repository.
5. **Offer:** A appends `handoff-offer` with the exact code commit, portable
   revision, prior conversation ID, next actions, and target machine.
6. **Hydrate:** B fetches the repositories, verifies hashes, imports portable
   state, and prepares a worktree at the exact commit.
7. **Accept:** B appends `handoff-accept` with a new machine epoch.
8. **Fence:** A observes the new epoch, releases its local lease, and makes its
   task session read-only.
9. **Continue:** B creates a continuation OpenHands conversation linked to the
   previous run and resumes from the checkpoint.

The original OpenHands conversation may remain readable on A. Unless OpenHands
provides a supported portable-conversation format, B receives a bounded
handoff summary and durable artifacts rather than the raw conversation.

The handoff is not complete until B's acceptance commit is visible. Before
acceptance, A may cancel the offer by appending a new transition based on the
unchanged head. After acceptance, returning to A requires another handoff.

### Lost computer recovery

No timeout grants ownership.

If A is unavailable:

1. an authorized actor raises a task- or project-scoped andon cord;
2. the new computer fetches the last durable checkpoint;
3. Avoozl shows what may be missing, including unpushed work and unpublished
   conversation state;
4. recovery policy requires the configured approval;
5. the new computer appends `recover` with a higher machine epoch;
6. work resumes in a new continuation conversation;
7. the andon incident is resolved and normal dispatch is resumed separately.

If A later reconnects, it sees the higher epoch and is fenced. A stale
check-in, old credential, or old local database cannot reclaim the task.

### Repository driver handoff

A person may hand off every active task for one execution project together.
The project handoff is a transaction plan, not an atomic cross-task operation:

1. freeze new local pickup for the project;
2. enumerate active task claims;
3. checkpoint each task independently;
4. transfer each machine epoch;
5. verify the target computer accepted all tasks;
6. report any partial transfer and leave those tasks fenced;
7. switch the project's preferred Driver only after task transfers settle.

The Driver's conversational history is not the project authority. A new Driver
may be initialized from the portable project summary and linked to its
predecessor.

## Synchronization

### Event sources

OpenHands automations watch configured GitHub repositories and submit exact,
authenticated snapshots to the local Avoozl instance. Snapshots may contain:

- planning pull request changes and review state;
- issue labels, assignment, comments, and closure;
- claim-ref heads;
- code branch and commit changes;
- pull request head, checks, reviews, and merge state.

Avoozl verifies every snapshot against GitHub before an authorization-bearing
transition. Manual Sync remains the reconciliation and recovery path.

### Local materialization

Each Avoozl database stores:

- the last complete generation per repository;
- GitHub node IDs and immutable hashes;
- claim and activation epochs;
- task and review projections;
- event cursors and replay IDs;
- local runs, leases, worktrees, and unpublished outbox entries;
- associations between plans, tasks, issues, commits, pull requests, and runs.

Synchronization is idempotent. The same event may arrive many times. A partial
repository generation never deletes prior state.

### Convergence rules

- Higher valid claim and machine epochs supersede lower epochs.
- Git ref ancestry determines claim-history order.
- GitHub node IDs identify issues and pull requests; numbers and titles do not.
- Design-origin scope comes only from its authorized design revision.
- Issue-origin scope comes only from its authorized issue snapshot.
- Local execution events cannot rewrite shared authorization.
- A shared transition cannot silently discard unpublished local work.
- Unknown or contradictory state produces a finding and closes protected gates.

### Progress visibility

The UI distinguishes:

- **durable phase:** last state confirmed through GitHub;
- **local activity:** a session this instance can observe directly;
- **remote activity:** a recent sanitized check-in from another instance;
- **unknown:** no current activity evidence.

Remote activity is never represented as a guaranteed live connection. A user
can follow commits, branches, pull requests, checks, and published milestones
from any instance. Attaching to the live OpenHands conversation requires a
separately authenticated route to the owning OpenHands instance and is
optional.

## Queue behavior

Each instance builds the same actionable queues from shared state and filters
them for the current actor:

- **Triage:** recent unowned issues and pull requests, designs awaiting review,
  and tasks awaiting approval or acceptance.
- **Available:** authorized unclaimed implementation and review work.
- **Mine:** claims owned by the current actor, separated by active machine.
- **Review:** pull requests for which the actor is eligible and is not the
  author or implementer.
- **Blocked:** work held by dependencies, conflicts, policy, or incidents.
- **History:** processed issues, completed tasks, released claims, and closed
  reviews.

Processed work is hidden from action queues by default, not deleted. Quiet
repositories use a wider recency window so Triage remains useful without
letting busy repositories dominate.

## One developer through larger teams

### One developer, one computer

- Local SQLite and OpenHands remain primary for execution.
- GitHub publication is optional until collaboration or portability is needed.
- Claims are still recorded when shared synchronization is enabled.
- Independent review may be explicitly waived or delegated to a separately
  identified reviewer according to policy.

### One developer, multiple computers

- GitHub carries designs, branches, receipts, and claim epochs.
- Only one machine epoch drives a task.
- Routine handoff moves checkpointed work without copying credentials.
- A different provider or model may continue the task on the target computer.

### Two to four developers

- Assignment routes work; claim refs prevent double ownership.
- Planning pull requests become the shared design-review surface.
- Review tasks appear only to eligible non-authors.
- The status comment and pull request provide a familiar GitHub fallback UI.

### Five to ten or more developers

- A GitHub App should own snapshot delivery and protected coordination-ref
  writes where organizational policy permits.
- Repository and team filters partition Queue without changing authority.
- Per-task refs avoid global claim-ledger contention.
- CODEOWNERS, protected branches, required checks, and required reviews remain
  enforceable by GitHub.
- Avoozl batches and rate-limits status updates and relies on webhooks or
  OpenHands automations rather than every instance polling every repository.
- Workspace administrators publish shared policy; individual instances retain
  local provider and execution configuration.

The protocol does not require every team member to be online. A developer may
work locally after a valid activation, but integration, handoff, release, and
acceptance require synchronization.

## Multi-repository plans

A design task declares one execution repository. A feature spanning several
repositories is represented as a parent objective with coordinated child
tasks, each with its own:

- target repository;
- issue;
- claim;
- branch and pull request;
- checks and review;
- integration receipt.

Dependencies express required order. The parent is accepted only after its
children satisfy the design's aggregate criteria.

The first release does not attempt an atomic merge across repositories. Avoozl
may coordinate staged integration, but a failure in one repository does not
roll back another repository's Git history.

## Offline and concurrent behavior

### Offline execution

An active machine may continue already authorized local work while offline if
policy permits. It may commit locally and run checks. It may not:

- claim new shared work;
- transfer ownership;
- publish shared readiness;
- integrate;
- accept;
- assume no newer machine epoch exists.

When connectivity returns, it fetches claim state before pushing. If fenced, it
preserves its local commits on a recovery branch and does not update the task
branch automatically.

### Concurrent claims

Two claim attempts start from the same ref head. One fast-forward succeeds. The
other fails, fetches the winner, and exits without assignment, worktree
creation, or agent launch.

### Concurrent design edits

Normal Git pull request conflict handling applies. Avoozl derives tasks only
from the merged revision, never from the apparent union of competing branches.

### Conflicting issue edits

For a design-origin task, issue text is a projection. A conflicting issue edit
is displayed and may become a proposed amendment, but it cannot change active
scope.

For issue-origin work, a body-hash change after authorization invalidates
dispatch until an allowed actor reauthorizes the new snapshot.

### Force-push or ref deletion

Protected coordination refs should make either operation unavailable. If
observed, Avoozl quarantines the affected task, preserves the last verified
head, and requires explicit recovery. It never reconstructs authority from the
issue's current display state alone.

## Failure handling

| Failure                                  | Required behavior                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| GitHub unavailable during claim          | No claim, assignment, worktree, or agent                                  |
| Claim push succeeds but assignment fails | Keep pending claim; retry routing or release explicitly                   |
| Assignment changes externally            | Report mismatch; do not silently transfer claim                           |
| Agent host disconnects                   | Preserve ownership and session; do not replace it                         |
| OpenHands conversation fails             | Task remains active or blocked; retry or hand off explicitly              |
| Progress publication fails               | Continue authorized local work if policy permits; queue idempotent outbox |
| Pull request head changes                | Rebind validation and review to the new exact commit                      |
| Reviewer becomes ineligible              | Invalidate that review slot and request another reviewer                  |
| Machine dies before checkpoint           | Recover from last push; state possible local loss explicitly              |
| Partial multi-task handoff               | Fence transferred tasks; retain explicit ownership of untransferred tasks |
| Duplicate snapshot or webhook            | Return the prior receipt without repeating effects                        |
| Incomplete repository snapshot           | Preserve prior materialization; never infer deletions                     |
| Local clock skew                         | Order shared claims by Git ancestry and epochs, not timestamps            |

## Security and threat model

### Untrusted input

Issue bodies, comments, pull request text, Markdown designs, patches, filenames,
and repository content are untrusted prompt input. A maintainer applying a
label does not make the body safe.

Run-scoped MCP remains deny-by-default. New operations are unavailable to an
agent until explicitly allowed. Plan approval, task acceptance, integration,
merge, credential changes, configuration changes, and claim recovery are
denied unless a narrower policy grants the exact action.

### Authorization

- Label-authorized execution is limited to configured private repositories by
  default.
- The label actor must have configured repository authority and appear on the
  Avoozl allowlist.
- Public repository observation never implies execution authority.
- Assignment routes work but grants no new capability.
- Claim-ref writers are restricted by repository permissions and branch rules.
- Protected transitions re-fetch GitHub state rather than trusting cached
  snapshots.

### Secrets

Never publish:

- provider keys or profile credentials;
- GitHub tokens;
- OpenHands service credentials;
- environment files;
- local paths or usernames;
- raw prompts or transcripts;
- terminal logs;
- unredacted tool results;
- intake capability tokens.

Shared configuration contains only non-secret policy. Machine-local data lives
under `.avoozl/local/` and is globally ignored. Export and publication inspect
paths, symlinks, sizes, and secret patterns and fail closed.

### Replay and tampering

- Every submitted event has a stable delivery ID.
- Receipts bind event ID, source hash, actor, result, and prior coordination
  head.
- Replays return the original result.
- Reusing an ID with different content is tampering.
- Claim manifests are canonicalized and hashed.
- Ref ancestry and GitHub audit events are verified before protected actions.
- Approval, integration, and acceptance receipts remain separate.

### Privacy

Team members may observe work metadata required for collaboration. Full agent
conversations remain on the owning OpenHands instance unless the owner
deliberately exposes that instance through a separate authenticated channel.
The default shared view contains summaries and artifact links only.

## Configuration sketch

```json
{
  "$schema": "./node_modules/avoozl/avoozl-config.schema.json",
  "workspace": {
    "id": "product-workspace",
    "planningRepository": "team/product-plans"
  },
  "repositories": [
    {
      "id": "service-a",
      "github": "team/service-a",
      "labels": {
        "ready": ["work:ready"],
        "blocked": ["work:blocked"],
        "review": ["review:needed"],
        "quarantined": ["security:triage"]
      },
      "requiredChecks": ["build", "test"],
      "review": {
        "required": 1,
        "excludeAuthor": true,
        "excludeImplementer": true
      }
    }
  ],
  "coordination": {
    "mode": "git-claims",
    "repository": "team/product-plans",
    "refPrefix": "avoozl/claims",
    "requireProtectedRefs": true
  },
  "handoff": {
    "requirePushedCheckpoint": true,
    "requireCleanWorktree": true,
    "lostMachineRecovery": "approved-andon"
  }
}
```

The final schema should use stable IDs and typed structures rather than infer
policy from names.

## User experience

### Task view

The task drawer shows:

- normalized state and original GitHub labels;
- design or issue provenance;
- owner, claim epoch, active machine, and machine epoch;
- local, remote, or unknown activity;
- branch, worktree when local, commits, and pull requests;
- current validation and review state;
- independent reviewer or available review slots;
- integration and acceptance receipts;
- Handoff, Release, Raise andon, Review, and Open session actions as policy
  allows.

### Team activity

The activity page groups:

- work active on this computer;
- work active on another computer owned by the current user;
- work owned by teammates;
- implementation awaiting review;
- review awaiting response;
- blocked or incident-held work;
- recently integrated and accepted work.

Remote rows link to GitHub artifacts. They do not offer local steering unless a
separate authenticated OpenHands connection is configured.

### Handoff

The Handoff action:

1. names the target computer;
2. lists uncommitted files, unpushed commits, running turns, and pending
   protected operations;
3. refuses unsafe transfer;
4. checkpoints and publishes;
5. waits for target acceptance;
6. clearly reports which computer currently owns the epoch.

There is no "force because offline" shortcut. Lost-machine recovery is a
separate, audited flow.

## API operations

The first implementation should expose shared operations through UI, CLI, and
MCP:

- `coordination.status`
- `coordination.claim`
- `coordination.release`
- `coordination.activate`
- `coordination.handoff.offer`
- `coordination.handoff.accept`
- `coordination.handoff.cancel`
- `coordination.recover`
- `coordination.reconcile`
- `review.queue`
- `review.claim`
- `review.release`
- `progress.publish`
- `progress.reconcile`

Agent access is narrower:

- read coordination and progress for its task;
- publish bounded progress for its task;
- request handoff or release;
- raise an andon incident;
- never recover ownership, approve scope, accept work, or merge by default.

All mutation operations accept an idempotency key and expected coordination
head.

## Observability

Avoozl records:

- claim latency and contention;
- failed compare-and-swap attempts;
- time from ready to claim;
- time from pull request to review claim;
- author-reviewer separation violations prevented;
- handoff duration and failure phase;
- stale local machine epochs fenced;
- snapshot lag and reconciliation findings;
- pending outbox age;
- work blocked by incident or policy.

Metrics contain stable pseudonymous IDs where possible and no prompt,
credential, source content, or transcript.

## Rollout

### Increment 1: Shared identity and observation

- Stable workspace, actor, machine, issue, pull request, and task IDs.
- Monitor configured repositories through OpenHands snapshots.
- Show remote owners, branches, commits, pull requests, checks, and completion.
- Preserve processed history while hiding it from action queues.

**Proof:** Two independent Avoozl instances converge on the same read-only task
and pull request view.

### Increment 2: Design publication and projection

- Publish planning pull requests.
- Record exact merged design authorization.
- Project deterministic issues across registered repositories.
- Normalize custom repository labels.

**Proof:** Replaying publication creates no duplicate issue, and an issue edit
cannot rewrite design-owned scope.

### Increment 3: Exclusive person claims

- Add per-task coordination refs and compare-and-swap transitions.
- Assign the successful claimant on GitHub.
- Hide claimed work from other available queues.
- Reconcile partial claim and assignment failures.

**Proof:** In a simultaneous two-instance claim test, exactly one instance can
create a worktree or start OpenHands.

### Increment 4: Machine activation

- Register stable machines.
- Add machine epochs and local activation leases.
- Fence old epochs.
- Keep agent host reconnect separate from ownership.

**Proof:** Two computers for one actor cannot drive the same task, and a stale
computer cannot resume after a newer epoch is observed.

### Increment 5: Progress and artifact trace

- Publish bounded milestone receipts.
- Associate branches, commits, pull requests, checks, and runs.
- Render local, remote, and unknown activity distinctly.

**Proof:** A third instance can follow the task through a pushed commit and pull
request without access to the agent transcript or provider credentials.

### Increment 6: Independent review work

- Create review slots.
- Exclude author and implementer identities.
- Claim review work and request reviewers.
- Bind review outcome to an exact pull request head.

**Proof:** The submitter cannot satisfy an independent review requirement, and
a new head invalidates stale approval according to repository policy.

### Increment 7: Integration, acceptance, and closeout

- Record exact integration receipts.
- Keep acceptance separate.
- Close and archive only after configured criteria.
- Preserve full trace from design block to closed issue.

**Proof:** Agent completion, pull request approval, merge, and acceptance remain
four distinct observable transitions.

### Increment 8: Routine computer handoff

- Drain, checkpoint, publish, offer, accept, fence, and continue.
- Create linked continuation conversations.
- Add project-wide handoff orchestration.

**Proof:** Work started on one computer resumes from the same pushed commit and
portable task state on another computer with different local credentials; the
former computer becomes read-only.

### Increment 9: Lost-machine recovery and andon integration

- Require an incident and reviewed recovery authority.
- Increment epochs without relying on timeouts.
- Preserve recovery branches and possible-loss findings.

**Proof:** A recovered task fences the lost computer when it returns, and
resolving the incident does not implicitly accept or integrate work.

### Increment 10: Team-scale hardening

- GitHub App permissions and protected coordination refs.
- Delivery batching, rate-limit handling, and repository partitioning.
- Operational dashboards and reconciliation tools.
- Load tests with more than ten active developers and hundreds of open tasks.

**Proof:** Independent repositories continue progressing during contention or
outage in another repository, and claim correctness does not depend on polling
frequency.

## Acceptance test matrix

The release test suite must include:

1. two users race to claim the same task;
2. one user races from two computers;
3. the claim push succeeds and assignment fails;
4. a stale machine reconnects after handoff;
5. the source issue changes after label authorization;
6. a design changes after implementation starts;
7. a pull request is force-pushed after review;
8. the author attempts to claim required review;
9. a reviewer approves an older head;
10. a machine goes offline with unpushed commits;
11. a machine is lost after a pushed checkpoint;
12. duplicate and out-of-order snapshots arrive;
13. a repository snapshot is incomplete;
14. a coordination ref is force-pushed or deleted;
15. a custom label mapping changes while work is active;
16. one planning repository projects tasks to several code repositories;
17. an instance has different provider credentials from the claimant's former
    computer;
18. a public repository submits malicious issue content;
19. a task integrates but fails acceptance;
20. a team of more than ten developers claims unrelated work concurrently.

Every test asserts both allowed behavior and denied side effects.

## Invariants

1. A shared state change names an immutable source and prior coordination head.
2. Exactly one person-level claim epoch is current for a task.
3. Exactly one machine epoch may drive a claimed task.
4. No timeout alone transfers either epoch.
5. Assignment routes work but never replaces the claim.
6. A label may authorize work only under explicit repository and actor policy.
7. Design-origin and issue-origin provenance never change kind.
8. Active scope is immutable until work reaches a reviewed amendment boundary.
9. The pull request author cannot satisfy an independent-review requirement.
10. Review, integration, acceptance, and closure remain separate.
11. Local credentials and raw conversations never enter shared Git state.
12. A fenced instance may preserve and export work but may not advance shared
    state.
13. Processed work is archived from queues, not erased.
14. An andon cord blocks unsafe advancement; it does not silently transfer
    ownership.
15. Failure to synchronize makes protected operations less permissive, never
    more permissive.

## Decisions

- Use one Avoozl and OpenHands pair per developer computer.
- Use GitHub as the durable collaboration and coordination record.
- Use per-task fast-forward Git refs for exclusive person claims and machine
  epochs.
- Keep local live leases in SQLite.
- Publish sanitized milestones, not raw execution streams.
- Require explicit, fenced machine handoff.
- Model pull request review as claimable work.
- Enforce reviewer independence by immutable identity.
- Normalize repository-specific states while preserving original labels.
- Retain manual reconciliation even when OpenHands automations provide
  continuous snapshots.

## Open questions

- Whether the first coordination implementation should write refs with each
  user's credential or require a GitHub App.
- The practical branch-count and retention limits at very large task volumes.
- Whether completed coordination histories should be packed into periodic
  immutable archive refs while preserving verification.
- Which OpenHands conversation metadata can be portably exported through a
  supported API.
- Whether a team wants remote, authenticated live-session attachment in
  addition to durable progress observation.
- Which review policies permit a separately identified agent reviewer for a
  one-person project.
- Whether project-wide handoff needs a convenience transaction log beyond the
  independent task transitions.
