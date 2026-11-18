---
category: Planning
---

# Requirements: integrator trains

Status: Draft

## Introduction

This spec adds integrator trains to Avoozl: finished work waits in a queue
instead of as pull requests, and one integrator lands everything ready in a
single stacked batch, validates the integrated trunk once, bisects at branch
boundaries when that fails, and fixes forward.

This spec is a draft. Approving it, creating issues and starting agents are
separate acts that a person does later.

### Why

On 2026-11-17, in the Nupp repository, ten agent-authored pull requests sat
unmerged for a day.

- Each waited on a branch CI run. The runs queued for the five shared macOS
  runners and were then cancelled. Nobody owned landing.
- Verifying each pull request on its own, on three platforms, was then
  estimated at hours.
- The owner stacked all ten on the trunk, resolved the conflicts, pushed and
  tested once. That took about 20 minutes.
- Two of the pull requests removed different Rust facilities from the same
  lines. They conflicted only because both had waited.

With many agents working in parallel, merge throughput is the bottleneck, not
coding. The rule this spec builds is: land fast, validate the integrated trunk
once, bisect at branch boundaries, and fix forward.

### What this builds on

`.kiro/specs/avoozl/` stays the product spec. This spec extends its landing
rules: Requirement 87 (Avoozl lands the work), Requirement 92 (the Landing
queue page), Requirement 102 (working branches, intents and the spec journal),
Requirement 44 (Stop the line) and design §4.26, §4.27 and §4.32.5. The code
it extends is `src/app/landing-queue.mjs` (per-base queue, `landNext`),
`src/app/landing-trains.mjs` (bounded direct trains), `src/app/direct-landing.mjs`,
`src/app/landing-conflicts.mjs`, `src/activity.mjs` (activity leases),
`withWorkLock` in `src/app/git.mjs`, and the `landing_queue` table in
`src/app/store.mjs`. Where a criterion here changes a rule there, it says which
one (LT16).

The feature is called integrator trains, and its code lives in its own module,
`src/app/integrator-trains.mjs`. The bounded `direct` trains of task 41.3 in
`src/app/landing-trains.mjs` keep their name, their four-task bound and their
halving search (design D21). The spec folder keeps the name `landing-trains`.

### Scope

- Nothing in this spec force pushes, under any setting, to any branch
  (LT16.4, LT16.7).
- Avoozl's own repository uses `landing: pr` today, and nothing here changes
  that while it stays `pr`. It may switch to `landing: train` with
  `policy: gated`, the setup LT8.8 supports for a repository whose CI does not
  gate merges.

### Out of scope

- One integrator across several machines. The design records the agreed
  direction (a shared lock ref or a server lease, design D5.4); no task builds it.
- Trains under `landing: pr` with protected review. Requirement 87.3 still
  forbids combining unrelated pull requests there. This holds for Avoozl's own
  repository too: its trains option is `landing: train` (LT8.8), not `pr`.
- Editing another repository's CI workflow or AGENTS.md. Avoozl ships the
  guidance and a setup check (LT1.7, LT1.8); a person makes the change.
- Automatic pickup of stale pull requests opened by people or other agents is
  not in this spec; `landing submit` (LT1.4) covers foreign branches by hand.

### Words

| Word            | Meaning                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Trunk           | A target branch trains land on, such as `main` or `core-dev`, in one repository                         |
| Batch branch    | `avoozl-batch/<task>`: the pushed, verified result of one task, waiting in the landing queue             |
| Ready           | A queued batch branch that a train may take now (LT4.2)                                                  |
| Train           | One integrator run that stacks a set of ready batch branches on the trunk, validates and lands them      |
| Stack           | The trunk head followed by each member's commits, rebased in train order                                 |
| Boundary        | The stack commit at the end of one member's commits                                                      |
| Cheap checks    | Fast checks run before any push, such as compile and format                                              |
| Full validation | The repository's whole test run, per platform                                                            |
| Footprint       | A task's declared `paths` plus the files its batch branch actually changes                               |
| Culprit         | The member whose boundary is the first where a failing suite fails                                       |
| Integrator      | The Avoozl role that holds the landing lease and is the only writer of the trunk (LT2)                    |

## Requirements

### Requirement LT1: A queue of batch branches, not waiting pull requests

**User story:** As the owner, I want finished work to wait in one queue that
Avoozl owns, so that no change waits on its own CI run or on a person to press
merge.

#### Acceptance criteria

1. WHEN a task in a repository with `landing: train` passes Verify
   (Requirement 86.6) THEN Avoozl SHALL push its exact verified commit to
   `<prefix><task>` on the repository's remote, where `<prefix>` is
   `landing.trains.branchPrefix` (default `avoozl-batch/`), and SHALL add one
   entry to the landing queue of the task's target branch.
2. The push SHALL pass the pre-push content rule (Requirement 87.9) on the
   commit messages, the branch name and the added lines.
3. A queue entry SHALL record: repository, target branch, task, spec, batch
   branch name, the exact head commit, the fork point on the trunk, the
   footprint, the time it was queued, and its state. States SHALL be `queued`,
   `in-train`, `landed`, `returned`, `ejected` and `closed`.
4. A branch made outside Avoozl's worker loop SHALL enter the same queue only
   through `avoozl landing submit TASK --branch NAME` or its MCP twin, which
   SHALL refuse a branch that does not start with the prefix, a task that is
   not in an approved plan, and a head that has not passed the repository's
   cheap checks. Each refusal SHALL name the missing step.
5. Queuing the same task again while its entry waits SHALL replace the head
   and keep its place in line only when the new head descends from the old
   one. A new head that does not descend from the pushed batch branch SHALL be
   refused with the reason (writers merge and never rebase, Requirement
   77.3), and the batch branch and entry SHALL stay as they were. Avoozl SHALL
   NOT replace a batch branch by deleting and pushing it again.
6. Avoozl SHALL open a pull request for a batch branch only when a person
   asks for a review of it (`avoozl landing review TASK`, or the task's Links
   box). A review pull request SHALL NOT be a landing path: the train still
   lands the branch (LT9).
7. Avoozl SHALL ship `docs/integrator-trains.md`, which tells a repository how to
   keep CI off batch branches with `branches-ignore: ['avoozl-batch/**']` (or a
   `!avoozl-batch/**` entry where the workflow already lists `branches`), and
   why a commit-message skip tag SHALL NOT be used: the tag would land in the
   trunk and skip the one CI run the train wants.
8. `avoozl setup REPO` (Requirement 89) SHALL read the repository's workflow
   files and, under `landing: train`, SHALL list each workflow whose `push`
   trigger would run on a batch branch, with the line to add. It SHALL NOT edit
   the workflow.

### Requirement LT2: The integrator is the only writer of the trunk

**User story:** As the owner, I want one role to push to the trunk, so that
agents finishing work never race each other onto it.

#### Acceptance criteria

1. Avoozl SHALL have an `integrator` role. For each repository and target
   branch under `landing: train`, only the process that holds that target's
   landing lease (LT3) SHALL push to the target branch.
2. The integrator SHALL run as its own process owned by the machine's
   supervisor (Requirement 95), not from a chat shell, so Requirement 87.10
   holds for every trunk push.
3. Worker briefs SHALL keep the rule of Requirement 86.3: a worker never
   pushes. Avoozl's own `direct` landing step (`landDirect`) SHALL skip any
   target that is under `landing: train`.
4. The integrator role SHALL have a role prompt file, `prompts/integrator.md`
   (Requirement 97), used only when a repository turns on the integrator
   resolver chat (LT6.4). That chat SHALL edit only in the train's landing
   worktree and SHALL NOT push, commit to a named branch, open a pull request
   or comment.
5. `avoozl integrator status [--json]` SHALL show, per target, the lease
   holder, the running train and its step, and the next train's trigger state.

### Requirement LT3: The landing lease, with git as the backstop

**User story:** As the owner, I want exactly one train per trunk at a time,
and a dead integrator's lock to clear by itself, so that landing never stops
silently and never runs twice.

#### Acceptance criteria

1. Each repository and target branch SHALL have at most one landing lease, in
   the workspace database, holding: holder (machine and process), session ID,
   lease ID, train ID, start time, last heartbeat and expiry.
2. The lease SHALL reuse the activity-lease rules of `src/activity.mjs`
   (`start`, `heartbeat`, `finish`, a lease ID required to renew or end, a
   fresh foreign holder refused), moved into one shared lease module that both
   activity and landing call. The shared module SHALL accept lease lengths in
   seconds so a one-minute heartbeat is possible; activity's 5–240 minute
   bounds SHALL stay as they are.
3. The integrator SHALL take the lease by compare-and-set inside one SQLite
   transaction: it succeeds only when no lease exists or the existing lease
   has expired, and a lost race SHALL return `busy` without side effects.
4. The integrator SHALL renew the lease every `lease.heartbeatSeconds`
   (default 60). The lease SHALL expire after `lease.missedHeartbeats`
   (default 3) missed renewals.
5. IF the expired holder is a process on this machine that is still alive
   THEN a taker SHALL NOT take the lease, and Avoozl SHALL open one Needs you
   item naming the hung integrator. This keeps the AGENTS.md rule that an
   expired lease alone never replaces a worker: the lease is taken from a
   process that is gone, not from one that went quiet.
6. Before a taker starts a new train it SHALL clean up the dead train: remove
   its landing worktrees, release its resource slots (LT13), run each held
   platform environment's `cleanup` command, and settle each member (LT3.7).
   Cleanup SHALL be recorded on the dead train's record.
7. WHEN the dead train had not pushed the trunk THEN its members SHALL return
   to `queued` in their original order. WHEN it had pushed the trunk under the
   optimistic policy THEN the taker SHALL first finish that train's full
   validation and failure handling on the pushed head, before forming a new
   train.
8. Every trunk push SHALL be a plain fast-forward from the base the train
   recorded (`guardedFastForward`). WHEN the remote trunk moved since the
   stack was built THEN the integrator SHALL fetch, rebase the stack onto the
   new trunk with the same cut rule (LT5), re-run the cheap checks (and,
   under `gated`, full validation), and try again, at most
   `failure.maxRebases` times (default 3). It SHALL NOT force the trunk under
   any setting.
9. The queue (entries, train assignment) and the train records SHALL live in
   the same workspace database as the lease.
10. The brief `withWorkLock` kind `integration` (Requirement 87.5) SHALL still
    cover the ref move and push inside a train.

### Requirement LT4: Back-to-back trains

**User story:** As the owner, I want the next train to start as soon as the
last one finishes, with limits I set, so that work lands in minutes and a
failure stays cheap to bisect.

#### Acceptance criteria

1. Trains for one target SHALL never overlap. WHEN a train finishes THEN the
   integrator SHALL take every ready entry, up to the maximum, and start the
   next train, subject to LT4.3.
2. An entry SHALL be ready when it is `queued`, its head passed the cheap
   checks, no open stop pauses it (`pausedBy`), and every queued entry it was
   built on (LT5.2) is in the same train or already landed.
3. The trigger SHALL use four settings per target:
   - `trigger.minBranches` (default 3): a train starts as soon as this many
     entries are ready;
   - `trigger.maxWaitMinutes` (default 15): a smaller train starts once the
     oldest ready entry has waited this long;
   - `trigger.maxBranches` (default 10): no train takes more, so a bisect
     stays at four or fewer rounds;
   - `trigger.cooldownSeconds` (default 60): the least time from one train's
     end to the next train's start.
4. A train SHALL take entries in queue order, except as conflict-aware
   scheduling moves them (LT12).
5. A train record SHALL hold its ID, target, policy, members in train order,
   the recorded trunk head, each member's boundary commit, each step with its
   start and end time, every check result, any culprit, the CI run it
   watches, and its outcome: `landed`, `partly-landed`, `failed` or
   `abandoned`.
6. Whether the next train waits for the last train's CI run SHALL be the
   setting `ci.waitForLastTrain` (default false). Under false the next train
   SHALL start after the last train's local validation and failure handling.

### Requirement LT5: Stacking without duplicated commits

**User story:** As the owner, I want a branch built on another queued branch
to land its own commits only, so that the trunk never carries the same change
twice.

#### Acceptance criteria

1. The integrator SHALL build the stack in a fresh landing worktree, detached
   at the recorded trunk head, by rebasing each member's range onto the
   previous boundary, in train order.
2. A member's range SHALL start at its fork point on the trunk, unless its
   head descends from the head of another entry that is queued, in the same
   train, or landed; then the range SHALL start at the newest such head (the
   cut). The cut SHALL use the heads recorded at queue time, not patch
   matching.
3. WHEN the entry a member was built on is neither in the train nor landed
   THEN the member SHALL NOT be stacked and SHALL wait, with the hold reason
   naming that entry.
4. WHEN a member's range is empty after the cut, or every commit in it is
   already in the trunk, THEN the member SHALL be closed as contained (LT11.3)
   instead of stacked.
5. Every stacked commit SHALL keep its author and message and SHALL gain the
   trailer `Avoozl-Task: <task>@<definition>` that intents read today.
6. The train record SHALL keep, for each member, its original head and its
   boundary commit, so later trains can cut at it and the landing comment
   (LT9.2) can name it.

### Requirement LT6: Conflicts

**User story:** As the owner, I want conflicts a rule can settle settled in
the train, and every other conflict sent back to the task that made it, so
that the train never lands a resolution nobody checked.

#### Acceptance criteria

1. A conflict while stacking member N SHALL be resolved only by a rule the
   repository declares in `conflicts.mechanical`. Each rule names paths and
   one strategy: `union` (append both sides, as `landing.unionPaths` does
   today), `regenerate` (run a declared command that rewrites the file, such
   as a lockfile), or `format` (take both sides' hunks when they differ only
   in whitespace, then run the formatter). `landing.unionPaths` SHALL be read
   as `union` rules.
2. After any rule resolves a file, the integrator SHALL run the rule's
   `verify` command on that file (default: the cheap checks). It SHALL NOT
   stage a file whose resolution failed verification; the conflict then
   counts as semantic.
3. `rerere` SHALL be off in landing worktrees (`rerere.enabled=false`), so a
   recorded resolution is never replayed without verification.
4. A repository MAY turn on the integrator resolver chat
   (`conflicts.resolver: "chat"`, default `"rules"`). It SHALL be offered only
   the files a mechanical rule covers whose rule failed, and its result SHALL
   pass LT6.2 like any other.
5. A semantic conflict SHALL return to the later task, member N: the
   integrator SHALL drop N from this train, keep stacking the rest, and send
   N's worker chat the conflicted files and the commit of the earlier member
   it conflicts with, through `sendConflictBack`, counted against
   `landing.conflictRounds` (Requirement 87.6). After the last round the task
   SHALL go to Needs you.
6. `conflicts.mechanical` SHALL default to empty: with no rules, every
   conflict is semantic.

### Requirement LT7: Cheap checks, full validation, and platforms

**User story:** As the owner, I want each train validated once per platform
on this machine where it can be, and in CI only where it cannot, so that
three platforms cost one run each, not one per change.

#### Acceptance criteria

1. Each target SHALL declare `validation.cheap` (argv lists; default the
   repository's `checks`) and `validation.full` per platform (an argv list and
   an optional results file).
2. The cheap checks SHALL run on the whole stack before any push, in the
   landing worktree, with the per-check timeout of Requirement 86.7.
3. Each machine SHALL declare, in its global configuration, the platform
   environments it has: `native`, or a wrapper argv that runs a command in a
   container or a VM, with an optional `cleanup` argv and the resource slot it
   needs (LT13). The repository file SHALL NOT hold these; a repository file
   that sets them SHALL be refused, naming the global file.
4. Which platforms a train needs SHALL come from `platforms.rules` (path
   globs to platform names) or `platforms.classifier` (an argv that reads the
   changed paths on stdin and prints a JSON list of platforms, so a repository
   can delegate to its own CI classifier). With neither, every declared
   platform SHALL be needed.
5. Full validation SHALL run each needed platform's command through that
   platform's environment on the stack head.
6. A results file, when declared, SHALL be JSON with one record per suite
   (`name`, `status`). The integrator SHALL use it to find failing suites for
   the bisect (LT10). Without one, the bisect SHALL rerun the whole command.
7. WHEN a needed platform has no environment on this machine THEN the train
   SHALL NOT count as validated until one CI run of that platform's jobs has
   passed on the train's head. Under the optimistic policy that run SHALL be
   the trunk push's own CI run. Under the gated policy it SHALL be one
   `workflow_dispatch` run on the candidate, with the platform passed as an
   input, and settings validation SHALL warn that this costs one extra run.

### Requirement LT8: Optimistic and gated landing

**User story:** As the owner, I want to choose per trunk between landing
first and validating first, so that a busy trunk lands fast and a sensitive
one never goes red.

#### Acceptance criteria

1. Each target SHALL set `policy` to `optimistic` or `gated`, with no
   default; `avoozl setup` SHALL ask for it.
2. Under `optimistic`, after the cheap checks pass the integrator SHALL push
   the trunk, then run full validation on the pushed head, and the trunk
   push SHALL be the one consolidated CI run.
3. Under `gated`, the integrator SHALL run full validation on the stack head
   and push the trunk only when it passes.
4. Before the trunk push, under both policies, each spec in the train SHALL
   get its intent, read back before the push (`landWithIntents`), as today.
5. After a landed train, Avoozl SHALL mark each landed task integrated at its
   boundary commit, merge the trunk back into each spec's working branch
   (`mergeBaseBack`), delete each landed batch branch, and remove the landing
   worktree.
6. The train's one CI run SHALL be read through the existing pacer and
   recorded on the train (`ci.workflow` names the workflow to watch).
7. A train SHALL be validated when every needed platform passed locally or by
   its one CI run (LT7.7), and only then SHALL its tasks count toward Stop the
   line's accepted heads.
8. A repository whose CI does not gate merges (its trunk requires no checks)
   MAY use `landing: train` with `policy: gated`, with full validation on this
   machine's own platform (`native`, such as macOS) and one
   `workflow_dispatch` run (LT7.7) covering the needed platforms that have no
   environment on this machine. This SHALL be a supported setup, and it is the
   one offered for Avoozl's own repository (design D16.1). `landing: pr` with
   protected review SHALL stay out of scope (Requirement 87.3).

### Requirement LT9: Pull requests: review only, closed when the change lands

**User story:** As a reviewer, I want a pull request I asked for to be closed
with a note when its change lands, saying where it landed, so that GitHub's
history stays readable without moving anyone's branch.

#### Acceptance criteria

1. `pullRequests.mode` SHALL be `review-only` (the only value in this spec):
   pull requests exist only when a person asks (LT1.6).
2. After the trunk push that lands a member with an open pull request, the
   integrator SHALL post one comment on that pull request from
   `pullRequests.commentTemplate`, with links to the trunk commit and the
   train, the member's position and the check results, screened by the
   privacy rule (Requirement 102.12) before it is written, and SHALL then
   close the pull request. It SHALL NOT move the batch branch: GitHub shows the
   pull request as closed, not merged.
3. A member whose pull request a person closed SHALL still land; the comment
   SHALL NOT be posted on a closed pull request.

### Requirement LT10: Failure: bisect, land the good branches, return the culprit

**User story:** As the owner, I want a red train narrowed to the branch that
broke it, with the others landed, so that one bad change costs minutes and
not the whole batch.

#### Acceptance criteria

1. WHEN full validation fails THEN the integrator SHALL rerun the failing
   suites on the same head, `failure.flakyReruns` times (default 1). A suite that passes on the rerun SHALL be
   recorded as flaky and SHALL NOT fail the train.
2. WHEN failures remain THEN the integrator SHALL bisect over member
   boundaries, rerunning only the failing suites on each probe, on the
   platforms that failed, to find the first boundary where any still fails.
   The member ending there is the culprit.
3. Under `gated`, the integrator SHALL drop the culprit, re-stack the rest
   with the cut rule, re-run the cheap checks and the suites that failed, and
   land them if they pass, repeating at most `failure.maxBisects` (default 2)
   times per train before the train fails.
4. Under `optimistic`, the trunk SHALL be repaired by `failure.trunk`:
   `revert` (default) pushes one fast-forward revert of the culprit's range;
   `fix-forward` leaves the trunk, pulls Stop the line for the target
   (Requirement 44) and puts a fix task first in line.
5. The culprit's task SHALL be handled by `failure.action`: `return` (default)
   sends its worker chat the failing suites, their platform and a bounded log
   excerpt, through `sendFailureBack`, at most `failure.retries` times
   (default 2), then ejects it; `eject` sets its entry `ejected` and opens one
   Needs you item.
6. WHEN `ci.bisectOnRed` is on (default off) and the watched CI workflow
   fails on a trunk head a train landed THEN the integrator SHALL bisect that
   train's boundaries for the failing jobs' platforms (mapped by
   `ci.jobPlatforms`), as in LT10.2, before the next train starts. A platform
   with no local environment SHALL go to Needs you with the failing jobs.

### Requirement LT11: Reaping: nothing sits silently

**User story:** As the owner, I want every branch that cannot move to say why
and go back to someone, so that the queue never fills with stale work.

#### Acceptance criteria

1. An entry ready for longer than `reap.idleHours` (default 24) without
   being taken by a train SHALL get one Needs you item naming why it waits.
2. An entry more than `reap.behindCommits` (default 50) commits behind the
   trunk SHALL be refreshed by the integrator, between trains: it SHALL
   re-stack the entry onto the trunk in its own landing worktree (LT5.1) with
   the cut rule and re-check it with the cheap checks. The refresh SHALL NOT
   move, push or delete the batch branch. A clean result SHALL record only the
   new boundary and the rebased range on the queue entry, and a later train
   MAY stack from it; a conflict SHALL go back to the task as LT6.5 says.
3. An entry whose commits are already all in the trunk SHALL be set `closed`
   with the reason "already in the trunk at <commit>", and its batch branch
   deleted.
4. An entry that has used all its conflict rounds or failure retries SHALL be
   set `returned` or `ejected`, with one Needs you item, and its batch branch
   kept until a person removes it or the task queues again.
5. A batch branch on the remote with no queue entry SHALL be listed once in
   Needs you; Avoozl SHALL NOT delete it.

### Requirement LT12: Conflict-aware scheduling

**User story:** As the owner, I want tasks that touch the same files landed
together or one after another, so that they do not drift into conflict while
both wait.

#### Acceptance criteria

1. WHEN two ready entries' footprints overlap THEN, under
   `scheduling.overlap: "same-train"` (default), the integrator SHALL put them
   in the same train in queue order, moving the later one forward past
   non-overlapping entries if needed, within `trigger.maxBranches`.
2. Under `scheduling.overlap: "serialize"`, the later overlapping entry SHALL
   wait for the next train.
3. Pick's repository-wide path holds (Requirement 86.2) SHALL stay; this rule
   adds the landing side for branches Pick did not hold.

### Requirement LT13: Shared capacity

**User story:** As the owner, I want trains to respect the few shared
runners, the one Windows VM and the Linux container, so that a train never
starves or overloads them.

#### Acceptance criteria

1. Each machine SHALL declare resource slots with a count, such as
   `windows-vm: 1` and `linux-container: 1`, in its global configuration. The
   slots SHALL be held in the machine's supervisor database, so every
   workspace on the machine shares them.
2. The integrator SHALL hold the slot of each platform environment the train
   uses for the whole train, and release it when the train ends or its taker
   cleans up (LT3.6).
3. A worker check that needs a held slot SHALL wait, with the hold reason
   naming the train.
4. Each target MAY set `capacity.ci` per platform: the most CI runs of that
   platform Avoozl starts at once. Before a fallback run (LT7.7) the
   integrator SHALL count queued and running jobs of the watched workflow on
   that platform, in one paced read, and wait while the count is at the limit.

### Requirement LT14: Visibility and alerts

**User story:** As the owner, I want to see how deep the queue is and how
long things wait, so that I can tell when landing is the bottleneck again.

#### Acceptance criteria

1. The Landing queue page (Requirement 92.7) SHALL show per target: queue
   depth, each entry's time in queue, branch age, commits behind the trunk and
   hold reason, the running train and its step, and the last trains with
   their outcome and duration.
2. It SHALL show, per target, over the last 7 days: median and 90th
   percentile time in queue, trains run, train pass rate (trains that landed
   every member without a bisect, over all trains) and bisects run.
3. `avoozl landing status [--json]` and an MCP read SHALL return the same
   numbers. None of the three SHALL make a GitHub call (Requirement 92.2).
4. WHEN an entry has been queued longer than `alerts.waitMinutes` (default
   60) THEN Avoozl SHALL open one Needs you item and send one notification,
   and SHALL NOT repeat them for that entry.

### Requirement LT15: Settings

**User story:** As the owner, I want every train setting in one validated
place per repository and per machine, so that a bad setting fails at load
time and not in the middle of a train.

#### Acceptance criteria

1. Repository settings SHALL live in `.avoozl.json` under `landing.trains`,
   with defaults at that level and overrides per target branch under
   `landing.trains.targets.<branch>`: branch prefix, policy, trigger limits,
   cheap and full validation per platform, platform rules or classifier,
   failure action and retries, trunk repair, conflict rules and resolver,
   reaping thresholds, pull request mode and comment template, the CI
   workflow to watch, `ci.waitForLastTrain`, `ci.bisectOnRed`, capacity and
   alerts.
2. Machine settings SHALL live in the global configuration
   (`~/.config/avoozl/config.json`): platform environments with wrapper,
   cleanup and slot; resource slot counts; `lease.heartbeatSeconds` and
   `lease.missedHeartbeats`.
3. `src/avoozl-config.schema.json` SHALL describe both, and a validator in
   `src/app/landing-config.mjs`, called from `loadLayeredConfig`, SHALL refuse
   an unknown key, a value out of range, `minBranches` above `maxBranches`, a
   target with no `policy`, a needed platform with neither a machine
   environment nor a CI workflow, and a machine key in the repository file.
   Each message SHALL name the key and its file.
4. A repository with `landing: train` and no valid `landing.trains` SHALL land
   nothing and SHALL show one Needs you item naming the first error.

### Requirement LT16: Changes to the `avoozl` spec's landing rules

**User story:** As a maintainer, I want every rule this spec changes named,
so that the two specs never disagree silently.

#### Acceptance criteria

1. Requirement 87.1 SHALL gain the landing value `train`. `direct`, `pr` and
   `off` SHALL keep their meaning.
2. Under `train`, the train bound of Requirement 87.2 (four tasks, one
   driver) SHALL NOT apply; LT4.3 sets the bound, and a train MAY hold tasks
   of several drivers in this workspace. Each spec's intent SHALL still go
   through its own driver's journal.
3. Under `train` with `policy: optimistic`, the "checks" of Requirement 87.4
   that must pass before landing SHALL be the cheap checks; full validation
   follows the push. Under `gated`, Requirement 87.4 SHALL hold unchanged.
4. Requirement 87.4's "never force push" SHALL hold for every branch,
   including the trunk, batch branches and `avoozl-validate/` refs. No
   setting turns it off. The brief rule of Requirement 77.3
   (`asksForcePush` in `src/app/delivery.mjs`: a brief that asks for a force
   push is never sent) SHALL stay unchanged.
5. The halving search in `landNext` SHALL stay for `direct`; `train` SHALL use
   the boundary bisect of LT10.
6. Requirement 77.3 (a writer merges, never rebases a pushed branch, never
   force pushes) SHALL hold unchanged for batch branches, as for every other
   branch. Nothing moves a pushed batch branch except a fast-forward push of a
   descendant head (LT1.5); the reaper's refresh leaves it where it is
   (LT11.2).
7. A test SHALL scan Avoozl's push calls (every `git push` argv the source
   builds) and find no `--force`, `-f`, `--force-with-lease` or `+` refspec
   anywhere.
