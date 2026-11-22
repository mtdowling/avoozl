---
category: Planning
---

# Requirements: merge batches

## Introduction

When several verified tasks wait to land on one branch, Avoozl tests them
together once, and when that fails, finds the one that broke it and lands
the rest. A group tested and landed together is a **merge batch**. Merge
batches are part of `direct` landing and size themselves.

If each change breaks the build with probability p, a batch of n passes with
probability (1 - p)^n, so the batch size follows the measured failure rate.

### Scope

- `direct` landing on one machine, for one base branch at a time.

### Out of scope

- `pr` landing. A repository whose platforms can only be tested in CI, or
  that wants GitHub's merge queue, uses `pr` (Requirement 87.3).
- Landing from several machines at once.
- Pushing the base before it is tested ("optimistic" landing). Every merge
  batch is tested before the push.

### Words

| Word          | Meaning                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------- |
| Member        | One verified task waiting to land, as a commit range                                      |
| Merge batch   | The members tested and landed together in one landing step                                |
| Candidate     | The base head with each member's commits stacked on it, in order                          |
| Boundary      | The candidate commit at the end of one member's commits                                   |
| Culprit       | The member whose boundary is the first where a failing check fails                         |
| Failure rate  | The share of members, over the last 20 that reached a result on this base, that were culprits |

## Requirements

### Requirement MB1: One landing engine

**User story:** As the owner, I want one way Avoozl lands verified work on a
branch, so that I do not choose between two systems that do the same thing.

#### Acceptance criteria

1. `direct` landing SHALL land in merge batches. A merge batch of one member
   SHALL land that one task.
2. The landing modes SHALL be `direct`, `pr` and `off`. A file that sets any
   other mode SHALL NOT load.
3. A file that sets an unknown key under `landing` or `machine` SHALL NOT
   load, and the error SHALL name the file and the key.
4. A merge batch MAY hold tasks of several specs in this workspace.

### Requirement MB2: The size sets itself

**User story:** As the owner, I want the batch size to follow how often
changes fail, so that batching saves time when work is good and costs
little when it is not.

#### Acceptance criteria

1. Each base branch SHALL keep a size limit, starting at 1.
2. After a merge batch lands with every member, and more members were
   waiting than it held, the limit SHALL grow by one.
3. After a merge batch has a culprit, the limit SHALL halve, rounding down,
   and never below 1.
4. The limit SHALL never exceed `max(1, floor(0.7 / p))`, where p is the
   failure rate, nor 16. With fewer than 5 results on the base, p SHALL be
   taken as 10%.
5. A merge batch SHALL take waiting members in queue order, up to the
   limit. A member that was a culprit SHALL land alone the next time it
   comes up.
6. `landing.mergeBatch` SHALL be the only setting: `"auto"` (default), or a
   whole number from 1 to 16 that replaces the limit. `1` turns batching
   off.

### Requirement MB3: Tested before it is pushed

**User story:** As the owner, I want the base branch to move only to a head
that passed, so that a merge batch never turns the branch red.

#### Acceptance criteria

1. The candidate SHALL be built in a landing worktree at the current base
   head, stacking each member's commits in order. Each commit SHALL keep its
   author and message.
2. The repository's checks SHALL run on the candidate: every check whose
   paths a member's diff touches, and every check that names no paths. Each
   SHALL be keyed by its name in reruns and bisect steps. A
   check MAY itself run another platform, through a container or a VM, as
   the repository chooses.
3. Only a candidate whose checks pass SHALL be pushed, as a guarded
   fast-forward from the base it was built on (Requirement 87.4). A base
   that moved SHALL mean a new candidate and new checks.
4. Nothing SHALL be force pushed, under any setting.

### Requirement MB4: Finding what broke it

**User story:** As the owner, I want a failed merge batch narrowed to the
one change that broke it, with the rest landed, so that one bad change costs
minutes and not the batch.

#### Acceptance criteria

1. WHEN a check fails on the candidate THEN that check SHALL run once more on
   the same head. A check that passes then SHALL be recorded as flaky and
   SHALL NOT fail the merge batch.
2. WHEN it fails again THEN the boundaries SHALL be bisected, running only
   the checks that failed, to find the culprit.
3. The culprit SHALL then be checked alone on the base, with the checks
   that failed.
   - Fails alone: it SHALL go back to its worker with the failing checks
     and a bounded log excerpt, through the path a landing failure uses,
     counted against `conflicts.maxAttempts`.
   - Passes alone: it broke only together with an earlier member. It SHALL
     go back to its worker naming that member, and the earlier member SHALL
     land.
4. The members before the culprit SHALL land. The members after it SHALL go
   back to the queue, at the front, in order.

### Requirement MB5: Conflicts

**User story:** As the owner, I want a conflict between two waiting tasks
sent back to the task that came second, so that nothing lands a resolution
nobody checked.

#### Acceptance criteria

1. A conflict while stacking SHALL be resolved only for paths in
   `landing.unionPaths` (Requirement 87.2).
2. Any other conflict SHALL drop the later member from the merge batch and
   send it back to its worker with the conflicted files, as Requirement 87.6
   says. The other members SHALL go on.

### Requirement MB6: Nothing extra on the remote

**User story:** As the maintainer of a repository, I want Avoozl's queue to
leave no branches on the remote, so that my CI does not run on them.

#### Acceptance criteria

1. Waiting members SHALL be local refs on the machine that lands. Avoozl
   SHALL push only the base branch.
2. A member SHALL be held as a local ref at its verified commit.
3. No repository SHALL need a CI change for merge batches.
