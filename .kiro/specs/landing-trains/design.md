# Design: landing trains

Status: Draft

Requirements are in `requirements.md` (LT1 to LT16). Section numbers here
(D1 to D20) are this file's; `§` numbers refer to
`.kiro/specs/avoozl/design.md`.

## D1. Shape

```
task Verify passes
   │  push avoozl-batch/<task>, add queue entry          (LT1)
   ▼
landing queue (repository, target)  ──── reaper between trains (LT11)
   │  integrator holds the landing lease                  (LT3)
   │  trigger: min / max wait / max / cooldown           (LT4)
   ▼
train:  stack ─> resolve mechanical ─> cheap checks ─┬─ optimistic: move PR branches, push, full validation
        (LT5)    conflicts (LT6)        (LT7)        └─ gated:      full validation, move PR branches, push
   │
   ├─ pass:  mark integrated, merge base back, delete batch branches, comment (LT8, LT9)
   └─ fail:  rerun failing suites, bisect boundaries, land the rest,
             return or eject the culprit, revert or fix forward          (LT10)
   ▼
next train (never overlapping)
```

Who does what:

| Step                         | Owner                       | Where it runs                          |
| ---------------------------- | --------------------------- | -------------------------------------- |
| Push batch branch, enqueue   | Avoozl, after Verify        | The tick's process (as pushes today)   |
| Train, every trunk write     | The integrator              | Its own supervisor-owned process       |
| Mechanical conflict          | A declared rule             | The landing worktree                   |
| Optional resolver chat       | Integrator chat (LT6.4)     | The landing worktree; never pushes     |
| Semantic conflict, failure   | The later task's worker     | Its own task worktree                  |
| Approval of this spec        | The owner                   | —                                      |

**Why a queue and not pull requests.** On 2026-11-17 each of ten pull
requests waited on its own CI run, which waited on five shared macOS runners
and was cancelled. Stacking the ten and testing once took 20 minutes. A queue
has one owner, costs one CI run per train, and lands changes before they age
into conflicts (the two Rust removals that conflicted only because both
waited).

## D2. Records

All in the workspace database (`src/app/store.mjs`), in the `(id, body)`
JSON-row style of the existing tables. The new tables join the table lists
the store uses for export and repair (the lists that already name
`landing_queue`).

**`landing_queue`** (exists; gains fields). Key stays
`<projectId>\0<base>\0<key>`, with `key` the task ID.

| Field           | Meaning                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| `branch`        | `avoozl-batch/<task>` (new)                                                |
| `commit`        | Exact head (exists)                                                        |
| `forkPoint`     | `git merge-base` of the head and the trunk at queue time (new)             |
| `builtOn`       | Entry keys whose recorded heads this head descends from (new, D7)          |
| `footprint`     | Declared `paths` ∪ changed files (new, D13)                                |
| `cheap`         | Cheap-check results at `commit` (new)                                      |
| `train`         | Train ID while `in-train` (new)                                            |
| `state`         | `queued`, `in-train`, `landed`, `returned`, `ejected`, `closed`; `withdrawn`, `conflict`, `failed` stay for `direct` |
| `reason`        | Why it left the queue or why it is held (new)                              |
| `pr`            | Review pull request number, if a person asked (exists)                     |

**`landing_trains`** (new). One row per train.

| Field         | Meaning                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `id`          | `train-<12 hex>`                                                                 |
| `projectId`, `target`, `policy` |                                                                |
| `baseHead`    | Trunk head the stack was built on; replaced on a rebase (D10.3)                  |
| `members`     | In order: `{key, task, spec, originalHead, cutFrom, boundary, state}`            |
| `steps`       | `{name, startedAt, endedAt, result}` for stack, conflicts, cheap, full, push, ci |
| `checks`      | Per platform, per suite: status, duration, rerun                                  |
| `bisects`     | Each probe: boundary, suites, platform, result                                   |
| `culprits`    | Member keys found by bisect                                                      |
| `pushed`      | Trunk commit pushed, or null                                                     |
| `ci`          | Watched workflow run ID, conclusion, read time                                   |
| `worktrees`, `slots` | What to clean up if the holder dies (D5.3)                                |
| `outcome`     | `landed`, `partly-landed`, `failed`, `abandoned`                                 |

**`landing_leases`** (new). One row per `<projectId>\0<target>`: `holder`
(machine ID, pid, process start time), `sessionId`, `leaseId`, `train`,
`startedAt`, `heartbeatAt`, `expiresAt`.

**`resource_slots`** (new, in the supervisor's machine database, not the
workspace one): `<slot>\0<n>` → holder workspace, train, pid, taken time.
Machine-wide because two workspaces on one Mac share the one Windows VM.

## D3. Batch branches and registration

- After Verify passes for a `train` repository, the tick pushes the exact
  verified commit as `<prefix><task>` (default `avoozl-batch/`), through the
  same scanned push path as `pushHead` (`src/app/working-heads.mjs`), and
  calls `enqueueLanding` with the new fields. The task's local worktree is
  kept until the task lands (Requirement 88.6).
- Task IDs go into ref names as they are; the content rule already checks
  them (Requirement 87.9). A task ID that is not a valid ref component is
  refused at queue time with the reason.
- `avoozl landing submit TASK --branch NAME` is for branches from sessions
  Avoozl did not start (the Nupp case). It fetches the branch, runs the cheap
  checks at its head in a scratch worktree, and queues it. It refuses: a
  prefix mismatch, a task outside an approved plan, a failed cheap check.
- `avoozl landing review TASK` opens a pull request for the batch branch,
  titled from the task, body from the task's acceptance, and stores its
  number on the entry. It is the only way a pull request appears.

## D4. The integrator

- `avoozl integrator run --workspace PATH` is a supervisor child
  (`src/app/supervisor.mjs`). One per workspace serves every `train` target
  in it; it holds one lease per target it is running a train for.
- Its loop, per target: renew or take the lease; reap (D12); if no train is
  running and the trigger fires (D6), run one train; sleep to the next
  heartbeat.
- Every git write to a trunk in a `train` target comes from this process.
  `landDirect` skips `train` targets, so the tick never pushes a trunk.
- `prompts/integrator.md` is the resolver chat's role prompt. The chat is
  opened only under `conflicts.resolver: "chat"`, through the executor seam
  (§4.28), with the landing worktree as its only folder and the file list as
  data. The harness for it is chosen per role in Settings › Models, like
  every other role.

## D5. The landing lease, and git as the backstop

### D5.1 One lease module

`src/activity.mjs` already has the rules this lease needs: `start` refuses a
fresh foreign holder, `heartbeat` and `finish` need the lease ID, an expired
record is `stale`, never silently active. They move into `src/lease.mjs`:

```
takeLease(record, {holder, sessionId, seconds, now})  -> record | busy
renewLease(record, {leaseId, seconds, now})           -> record | changed
endLease(record, {leaseId, now})                      -> record | changed
leaseState(record, now)                               -> none | active | stale | ended
```

`applyActivity` keeps its API and its 5–240 minute bounds and calls these.
The landing lease calls them with `seconds = heartbeatSeconds ×
missedHeartbeats` (default 180) inside one `store.transaction`, which makes
take a compare-and-set: read the row, decide, write, all under SQLite's write
lock.

### D5.2 Taking a lease

```
row = landing_leases[target]
if row is active:                      -> busy
if row is stale:
    if row.holder.machine == this machine and pid alive with same start time:
        open Needs you "integrator for <target> is hung"; -> busy
    cleanup(row.train)                 (D5.3)
take with a new leaseId and train ID
```

The pid check uses the same probe as `liveLocks` in `src/app/git.mjs`, plus
the process start time, so a reused pid does not look alive. This is the
AGENTS.md rule applied to the integrator: expiry alone never replaces a
holder that is still there.

### D5.3 Cleanup of a dead train

From the dead train's record: remove each listed landing worktree
(`git worktree remove --force`, then `rm -rf`), run each held platform
environment's `cleanup` argv, release its rows in `resource_slots`, then:

- not pushed: members go back to `queued`, same `seq`, so order holds;
- pushed under `optimistic`: the new train first runs full validation on
  `pushed` and the failure steps (D11), and only then forms its own stack.

Each action is appended to the dead train's `steps` with `by: <new train>`,
and its outcome becomes `abandoned`.

### D5.4 Git as the backstop, and more machines later

The trunk push is `guardedFastForward` (`src/app/driver-generations.mjs`):
check the remote head equals `baseHead`, then a plain push. Two integrators
that both believe they hold the lease cannot both land: the second push is
not a fast-forward and fails. There is no force on a trunk anywhere.

Later, for integrators on several machines (not in this spec): the lease
moves to a lock ref `refs/avoozl/train/<branch>` on the target remote, created
atomically (a push that must create the ref and fails if it exists), holding
a small commit with holder, train and heartbeat time; or to a server lease.
The workspace lease stays the local fast path either way.

## D6. Train trigger

Per target, evaluated each loop when no train runs:

```
ready = queued entries, cheap checks passed, not paused, builtOn satisfied
if now < lastTrainEnd + cooldownSeconds:          wait
if ready.length >= minBranches:                   start(take(ready, maxBranches))
elif ready and oldest(ready).queuedAt + maxWaitMinutes <= now:
                                                  start(take(ready, maxBranches))
else:                                             wait
```

`take` keeps queue order, then applies D13. The default `maxBranches` of 10
matches the incident and keeps a bisect to at most four probes
(`ceil(log2 10)`). With `ci.waitForLastTrain` on, `start` also waits for the
previous train's CI conclusion.

## D7. Stacking and the cut rule

```
stack = baseHead (landing worktree, detached, rerere.enabled=false)
for member in train order:
    from = member.forkPoint
    for other in queued ∪ this train ∪ landed:
        if other.originalHead is an ancestor of member.head and is newer than from:
            from = other.originalHead            # the cut
    if other entry named by from is queued but not in this train: hold member
    range = from..member.head
    if range empty or `git cherry` says every commit is in the trunk: close member (contained)
    git rebase --onto <stack> <from> <member.head>   # commit by commit
    on conflict: D8
    stack = new HEAD; member.boundary = stack
```

`builtOn` is computed at queue time from recorded heads, so the cut never
depends on patch matching after a rebase changed the commits. Landed entries
keep `originalHead`, so a branch built on yesterday's landed branch still cuts
correctly. Each stacked commit gets the `Avoozl-Task` trailer (`trailers` in
`src/app/landing-trains.mjs`).

The stack is linear (rebased), not the `--no-ff` merges `mergeTrain` makes for
`direct`. A linear stack makes each boundary a commit the bisect can check
out, and is what the owner did by hand.

## D8. Conflicts

On a conflicted rebase step, for each conflicted file:

1. Find a `conflicts.mechanical` rule whose `paths` glob matches. None:
   semantic.
2. Apply its strategy in the landing worktree:
   - `union`: `git merge-file --union` of the three stages (today's
     `unionMerge`);
   - `regenerate`: take the member's side, run the rule's `command`, which
     must rewrite the file (for a lockfile, the package manager's lock step);
   - `format`: accept when the two sides differ only in whitespace after the
     formatter runs on both, then keep the formatted text.
3. Run the rule's `verify` argv with `{file}` replaced (default: the cheap
   checks). Pass: `git add` the file. Fail: do not stage; semantic.
4. Under `conflicts.resolver: "chat"` only: a file whose rule failed in step
   2 or 3 goes to the integrator chat; its edit is verified as in step 3.

Any semantic file: `git rebase --abort` for this member, reset the stack to
the previous boundary, drop the member (state `returned` once
`sendConflictBack` accepts it, else Needs you), and continue with the next
member. The message names the conflicted files and the earlier member's
boundary commit, as data. The later task gets the conflict because the
earlier one is already stacked: that is the agreed rule, and it is the task
whose author can see both changes.

## D9. Validation

### D9.1 Platforms on a machine

Global configuration, per machine:

```json
{
  "machine": {
    "platforms": {
      "macos-arm64": { "kind": "native" },
      "linux-x64": {
        "kind": "container",
        "wrapper": ["/opt/avoozl-wrappers/linux-container", "--"],
        "cleanup": ["/opt/avoozl-wrappers/linux-container", "--reset"],
        "slot": "linux-container"
      },
      "windows-x64": {
        "kind": "vm",
        "wrapper": ["/opt/avoozl-wrappers/windows-vm", "--"],
        "cleanup": ["/opt/avoozl-wrappers/windows-vm", "--revert"],
        "slot": "windows-vm"
      }
    },
    "slots": { "linux-container": 1, "windows-vm": 1 }
  },
  "lease": { "heartbeatSeconds": 60, "missedHeartbeats": 3 }
}
```

A wrapper is an argv prefix: Avoozl runs `wrapper ++ command` with the
landing worktree as the working directory. How the wrapper reaches the files
(a shared mount, a sync) is the wrapper's business.

### D9.2 Which platforms a train needs

`platforms.rules` maps globs to platform names; `platforms.classifier` is an
argv that reads changed paths (stack base to head) on stdin and prints a JSON
list, so Nupp can call `.github/scripts/classify-changes.lua` instead of
copying its rules. Neither set: every platform named in `validation.full`.

### D9.3 Runs

- Cheap: each `validation.cheap` argv on the stack head, native, in order,
  stop at first failure, per-check timeout (`runCheckAt`).
- Full: each needed platform's command through its environment, platforms in
  parallel up to free slots. Each writes its results file when declared:

```json
{ "suites": [ { "name": "doctest", "status": "passed", "seconds": 12.1 } ] }
```

- No environment for a needed platform: CI fallback (LT7.7). Optimistic: the
  trunk push's own run. Gated: `workflow_dispatch` of `ci.workflow` on a
  pushed candidate ref `avoozl-validate/<train>` with input
  `platforms=<name>`; that ref is deleted after the run.

## D10. Policies and the push

### D10.1 Optimistic

```
stack, conflicts, cheap checks
write intents (landWithIntents)
move PR branches to boundaries (D10.4)
withWorkLock(integration): re-read trunk, guardedFastForward(baseHead -> stack head)
mark tasks integrated, merge base back, delete batch branches, comment
full validation on the pushed head (+ CI fallback platforms from the push's run)
failure -> D11
```

### D10.2 Gated

```
stack, conflicts, cheap checks
full validation on the stack head (+ CI fallback by workflow_dispatch)
failure -> D11 (drop culprit, restack, recheck), then continue
write intents, move PR branches, withWorkLock: guarded push
mark integrated, merge base back, delete batch branches, comment
```

### D10.3 Trunk moved

`guardedFastForward` returns false or the re-read differs: fetch, set
`baseHead` to the new head, rebase the stack onto it with D7 (members keep
their order and cut points), re-run the cheap checks. Under `gated`, full
validation also reruns, because what passed was a different tree. Bounded by
`failure.maxRebases` (default 3); past that the train ends `failed` with the
reason "trunk kept moving", and its members go back to `queued`. Something
else writing the trunk is itself a Needs you item, since the integrator is
supposed to be the only writer.

### D10.4 Merged ordering

For each member with an open pull request, before the trunk push:

```
git push --force-with-lease=refs/heads/<branch>:<entry.commit> <remote> <boundary>:refs/heads/<branch>
```

This is the only non-fast-forward write Avoozl makes, and only on a batch
branch, on the exact head it recorded (LT16.4). When the lease fails, the
member leaves the train before the push (a person or tool updated the branch)
and returns to `queued` with the new head. Then the trunk push makes each
boundary reachable from the trunk, and GitHub marks those pull requests
merged. After the push, the comment from `pullRequests.commentTemplate`:

```
Landed in train {train} as {position} of {count}, trunk {trunkCommit}.
Checks: {checks}.
```

Placeholders are filled only from the train record; the text passes the
privacy rule (Requirement 102.12) before it is written.

## D11. Failure

### D11.1 Confirm, then bisect

1. Rerun each failing suite once on the same head and platform
   (`failure.flakyReruns`, default 1). Passing on the rerun: recorded
   `flaky`, the train continues.
2. Bisect over boundaries `b1..bn` (bn is the stack head, known failing; the
   base is known passing because the previous train validated it). Probe the
   middle boundary with only the still-failing suites, on only the failing
   platforms; narrow to the first failing boundary. Without a results file a
   probe reruns the whole platform command.
3. The member ending at that boundary is the culprit. A failure that the
   bisect cannot place (every probe passes) is recorded as an interaction of
   the full set; the last member is treated as the culprit, because it is the
   one that changed what passed.

### D11.2 What happens next

| Policy     | Trunk                                                                            | Rest of the train                                                                          |
| ---------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| gated      | Untouched                                                                        | Drop the culprit, restack, cheap checks, rerun the failed suites, land; up to `maxBisects` |
| optimistic | `revert`: one fast-forward revert of the culprit's range; `fix-forward`: Stop the line for the target and a fix task first in line | Already landed; members after the culprit stay landed unless the revert conflicts, which ends in Needs you |

And for the culprit's task, `failure.action`: `return` sends its worker chat
the suites, platform and a log excerpt of at most 200 lines, as data, through
`sendFailureBack`, up to `failure.retries`; `eject` opens Needs you.

### D11.3 Red CI after landing

With `ci.bisectOnRed`, a failed conclusion of `ci.workflow` on a head a train
pushed starts a bisect of that train before the next train: the failing jobs
name the platforms (the workflow's job names are mapped to platforms by
`ci.jobPlatforms`), the probes run locally where an environment exists, and
the result feeds D11.2 as if local validation had failed. A platform with no
local environment cannot be probed locally; the train then goes to Needs you
with the failing jobs.

## D12. Reaping

Between trains, in the integrator loop:

| Condition                                   | Action                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Ready and not taken for `reap.idleHours`    | One Needs you item with the hold reason                                |
| More than `reap.behindCommits` behind trunk | Rebase with D7 in a scratch worktree, cheap checks, lease-guarded move of its batch branch; conflict goes back as D8 |
| All commits already in the trunk            | `closed`, reason with the trunk commit, delete batch branch           |
| Rounds or retries used up                   | `returned` or `ejected`, one Needs you item, keep the branch           |
| Remote batch branch with no entry           | One Needs you item; never deleted by Avoozl                            |

Each action is written once; a repeated tick finds the same state and writes
nothing.

## D13. Scheduling by footprint

`footprint` = declared `paths` of the task (the manifest field Pick already
reads) ∪ `git diff --name-only forkPoint..head`. Two entries overlap when any
path or glob matches. Under `same-train`, `take` pulls each overlapping later
entry forward to sit right after the earliest entry it overlaps, as long as
the train stays within `maxBranches`; under `serialize`, it leaves the later
one for the next train. Pick's path holds (`src/app/spec-scheduler.mjs`)
already keep overlapping Avoozl tasks from running at once; this covers
submitted branches and tasks whose real footprint exceeded their declared
paths.

## D14. Capacity

- Local slots: `resource_slots` rows, taken in one transaction for every slot
  a train's needed platforms use, before full validation; released at train
  end. A worker check that needs a taken slot reports "waiting for
  windows-vm (train-…)" and retries next tick.
- CI: before a gated fallback run, one paced read of the watched workflow's
  queued and in-progress jobs (`GET /repos/{owner}/{repo}/actions/runs` with
  status filters, then the jobs of those runs, through the pacer of
  `src/app/github-pacer.mjs`), counted by `ci.jobPlatforms`. At or above
  `capacity.ci.<platform>`, the train waits and its step says so.

## D15. Visibility

From the store only (Requirement 92.2), extending
`src/app/landing-queue-view.mjs`:

| Number                    | Source                                                        |
| ------------------------- | ------------------------------------------------------------- |
| Queue depth               | `landing_queue` rows in `queued` or `in-train` per target     |
| Time in queue             | `queuedAt` to now, or to `finishedAt`                         |
| Branch age                | Head commit time to now                                       |
| Behind trunk              | Commit count recorded at the last reap pass, with its time    |
| Train pass rate           | Trains `landed` with no bisect ÷ trains, last 7 days          |
| p50 / p90 time in queue   | Landed entries, last 7 days                                   |
| Running train and step    | `landing_trains` row without `outcome`                        |

The alert (LT14.4) uses the existing Needs you and notification paths, keyed
by entry, so it fires once.

## D16. Settings

Repository file, `.avoozl.json`:

```json
{
  "landing": {
    "conflictRounds": 2,
    "trains": {
      "branchPrefix": "avoozl-batch/",
      "trigger": { "minBranches": 3, "maxWaitMinutes": 15, "maxBranches": 10, "cooldownSeconds": 60 },
      "validation": {
        "cheap": [["scripts/build"], ["scripts/format", "--check"]],
        "full": {
          "macos-arm64": { "command": ["scripts/test", "--results", "build/suites.json"], "results": "build/suites.json" },
          "linux-x64":   { "command": ["scripts/test", "--results", "build/suites.json"], "results": "build/suites.json" },
          "windows-x64": { "command": ["scripts/test", "--results", "build/suites.json"], "results": "build/suites.json" }
        }
      },
      "platforms": { "classifier": ["scripts/ci-platforms"] },
      "failure": { "action": "return", "retries": 2, "trunk": "revert", "maxBisects": 2, "maxRebases": 3, "flakyReruns": 1 },
      "conflicts": { "resolver": "rules", "mechanical": [ { "paths": ["CHANGELOG.md"], "strategy": "union" } ] },
      "scheduling": { "overlap": "same-train" },
      "reap": { "idleHours": 24, "behindCommits": 50 },
      "pullRequests": { "mode": "review-only", "mergedOrdering": true, "commentTemplate": "Landed in train {train} as {position} of {count}, trunk {trunkCommit}." },
      "ci": { "workflow": "ci.yml", "waitForLastTrain": false, "bisectOnRed": false, "jobPlatforms": { "test (macos)": "macos-arm64" } },
      "capacity": { "ci": { "macos-arm64": 2 } },
      "alerts": { "waitMinutes": 60 },
      "targets": {
        "core-dev": { "policy": "optimistic" },
        "main": { "policy": "gated", "trigger": { "maxBranches": 4 } }
      }
    }
  }
}
```

The script names above show the shape only; each repository names its own. Per target, a key under `targets.<branch>` replaces the same
key at the `trains` level (objects merge one level deep).

Defaults and bounds:

| Key                          | Default          | Bounds                              |
| ---------------------------- | ---------------- | ----------------------------------- |
| `branchPrefix`               | `avoozl-batch/`  | ends with `/`, valid ref prefix     |
| `policy`                     | none (required)  | `optimistic`, `gated`               |
| `trigger.minBranches`        | 3                | 1–`maxBranches`                     |
| `trigger.maxWaitMinutes`     | 15               | 0–1440                              |
| `trigger.maxBranches`        | 10               | 1–32                                |
| `trigger.cooldownSeconds`    | 60               | 0–3600                              |
| `failure.action`             | `return`         | `return`, `eject`                   |
| `failure.retries`            | 2                | 0–10                                |
| `failure.trunk`              | `revert`         | `revert`, `fix-forward`             |
| `failure.maxBisects`         | 2                | 0–10                                |
| `failure.maxRebases`         | 3                | 0–10                                |
| `failure.flakyReruns`        | 1                | 0–3                                 |
| `conflicts.resolver`         | `rules`          | `rules`, `chat`                     |
| `scheduling.overlap`         | `same-train`     | `same-train`, `serialize`           |
| `reap.idleHours`             | 24               | 1–720                               |
| `reap.behindCommits`         | 50               | 1–10000                             |
| `pullRequests.mergedOrdering`| true             | boolean                             |
| `ci.waitForLastTrain`        | false            | boolean                             |
| `ci.bisectOnRed`             | false            | boolean                             |
| `alerts.waitMinutes`         | 60               | 1–10080                             |
| `lease.heartbeatSeconds`     | 60               | 10–600 (machine only)               |
| `lease.missedHeartbeats`     | 3                | 2–10 (machine only)                 |

Validation (`validateTrains` in `src/app/landing-config.mjs`, called from
`loadLayeredConfig` beside `conflictRounds`) refuses: an unknown key; a value
out of bounds; `minBranches > maxBranches`; a target without `policy`; a
`regenerate` rule without `command`; a needed platform with no machine
environment and no `ci.workflow`; `machine.*` or `lease.*` in the repository
file (checked against `configWithoutRepository`); and an absolute path in the
repository file (already refused by `assertSafeConfig`). Each message names
the key path and the file it came from. A gated target with a CI-only
platform loads with a warning that each such train costs one extra CI run.

## D17. CI guidance for repositories

`docs/landing-trains.md` says, with these snippets:

```yaml
# A push workflow with no branch filter: ignore batch branches.
on:
  push:
    branches-ignore: ['avoozl-batch/**']
```

```yaml
# A push workflow that already lists branches cannot also use
# branches-ignore for the same event; add a negative pattern instead.
on:
  push:
    branches: ['**', '!avoozl-batch/**']
```

```yaml
# Review pull requests from batch branches: keep required checks reporting,
# skip the work. Moving a branch for merged ordering would otherwise start
# one pull_request run per moved branch.
jobs:
  test:
    if: ${{ !startsWith(github.head_ref, 'avoozl-batch/') }}
```

It also says why not a skip tag in the commit message (`[skip ci]`): the
stacked commits keep their messages, so the tag would ride into the trunk and
skip the trunk push's run, which is the one run the train wants. And it
describes the `workflow_dispatch` input a gated repository with a CI-only
platform needs (D9.3). Avoozl's own `test.yml` already runs `push` only on
`main`, so it needs only the pull request job condition.

## D18. Changes to the `avoozl` spec

| Rule there                          | Change here                                                         |
| ----------------------------------- | ------------------------------------------------------------------- |
| R87.1 landing values                | Adds `train`                                                        |
| R87.2 train bound (4 tasks, 1 driver) | Not under `train`; LT4.3 bounds it; intents still per driver      |
| R87.4 checks before landing         | Optimistic: cheap checks before, full after                        |
| R87.4 never force push              | Kept for trunks and every non-batch branch; batch branches move only by a lease on the recorded head |
| R87.5 one queue, `withWorkLock`     | Kept; the landing lease scopes the whole train around it            |
| §4.32.5 `direct` merges with `--no-ff` | `train` stacks linearly (D7); `direct` unchanged                 |
| `landNext` halving                  | Kept for `direct`; `train` bisects boundaries (D11)                 |
| R77.3 writers merge, never rebase   | Not for batch branches; the reaper rebases them (D12)               |

## D19. Failure modes

| What goes wrong                                  | What happens                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Integrator crashes mid-train                     | Lease expires; next taker cleans up (D5.3)                                     |
| Integrator hangs                                 | Lease expires, pid alive: Needs you; nothing taken                             |
| Two integrators think they hold the lease        | Second trunk push is not a fast-forward and fails (D5.4)                       |
| Trunk moved by someone else                      | Rebase, recheck, retry up to `maxRebases`; Needs you names the other writer    |
| A rule's resolution is wrong                     | Its `verify` fails, file not staged, conflict returned (D8)                   |
| rerere replays an old bad resolution             | Off in landing worktrees                                                       |
| Flaky suite                                      | Fails, passes on rerun: recorded `flaky`, train continues                      |
| Culprit cannot be placed                         | Last member treated as culprit (D11.1)                                         |
| CI-only platform red after an optimistic push    | One CI run says so; revert or fix forward per `failure.trunk`                  |
| Batch branch updated by someone during a train   | Merged-ordering lease fails; member leaves the train, re-queues               |
| Branch built on an ejected branch                | Held, reason names it; reaper's idle alert if it stays held                    |
| VM left dirty by a dead train                    | Its `cleanup` argv runs before the next train takes the slot                   |

## D20. Owner steps

Steps 1 and 2 are not tasks. Step 3 is `lt-p5`, marked manual in the manifest.

1. Approve this spec.
2. For Nupp: add the batch-branch CI exclusions from D17 to its workflows,
   change its AGENTS.md so agents stop pushing to the trunk and submit
   instead, and write the machine settings for this Mac's Colima container and
   UTM Windows VM wrappers.
3. Run `lt-p5`, the live train on Nupp.
