---
repo: avoozl
category: Planning
---

# Merge batches

## Requirements

### Introduction

When several verified tasks wait to land on one branch, Avoozl tests them
together once, and when that fails, finds the one that broke it and lands
the rest. A group tested and landed together is a **merge batch**. Merge
batches are part of `direct` landing and size themselves.

If each change breaks the build with probability p, a batch of n passes with
probability (1 - p)^n, so the batch size follows the measured failure rate.

#### Scope

- `direct` landing on one machine, for one base branch at a time.

#### Out of scope

- `pr` landing. A repository whose platforms can only be tested in CI, or
  that wants GitHub's merge queue, uses `pr` (Requirement 87.3).
- Landing from several machines at once.
- Pushing the base before it is tested ("optimistic" landing). Every merge
  batch is tested before the push.

#### Words

| Word          | Meaning                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------- |
| Member        | One verified task waiting to land, as a commit range                                      |
| Merge batch   | The members tested and landed together in one landing step                                |
| Candidate     | The base head with each member's commits stacked on it, in order                          |
| Boundary      | The candidate commit at the end of one member's commits                                   |
| Culprit       | The member whose boundary is the first where a failing check fails                         |
| Failure rate  | The share of members, over the last 20 that reached a result on this base, that were culprits |


#### Requirement MB1: One landing engine

**User story:** As the owner, I want one way Avoozl lands verified work on a
branch, so that I do not choose between two systems that do the same thing.

##### Acceptance criteria

1. `direct` landing SHALL land in merge batches. A merge batch of one member
   SHALL land that one task.
2. The landing modes SHALL be `direct`, `pr` and `off`. A file that sets any
   other mode SHALL NOT load.
3. A file that sets an unknown key under `landing` or `machine` SHALL NOT
   load, and the error SHALL name the file and the key.
4. A merge batch MAY hold tasks of several specs in this workspace.

#### Requirement MB2: The size sets itself

**User story:** As the owner, I want the batch size to follow how often
changes fail, so that batching saves time when work is good and costs
little when it is not.

##### Acceptance criteria

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

#### Requirement MB3: Tested before it is pushed

**User story:** As the owner, I want the base branch to move only to a head
that passed, so that a merge batch never turns the branch red.

##### Acceptance criteria

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

#### Requirement MB4: Finding what broke it

**User story:** As the owner, I want a failed merge batch narrowed to the
one change that broke it, with the rest landed, so that one bad change costs
minutes and not the batch.

##### Acceptance criteria

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

#### Requirement MB5: Conflicts

**User story:** As the owner, I want a conflict between two waiting tasks
sent back to the task that came second, so that nothing lands a resolution
nobody checked.

##### Acceptance criteria

1. A conflict while stacking SHALL be resolved only for paths in
   `landing.unionPaths` (Requirement 87.2).
2. Any other conflict SHALL drop the later member from the merge batch and
   send it back to its worker with the conflicted files, as Requirement 87.6
   says. The other members SHALL go on.

#### Requirement MB6: Nothing extra on the remote

**User story:** As the maintainer of a repository, I want Avoozl's queue to
leave no branches on the remote, so that my CI does not run on them.

##### Acceptance criteria

1. Waiting members SHALL be local refs on the machine that lands. Avoozl
   SHALL push only the base branch.
2. A member SHALL be held as a local ref at its verified commit.
3. No repository SHALL need a CI change for merge batches.

## Design

`MB` numbers are in [Requirements](#requirements); `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`.

### D1. The parts

`direct` landing has a per-base queue (`src/app/landing/landing-queue.ts`), a
landing worktree that stacks a group on the base and checks it, a halving
search, union paths, and a guarded fast-forward
(`src/app/landing/merge-batch.ts`, `src/app/landing/direct-landing.ts`,
`src/app/landing/guarded-push.ts`). The group size comes from MB2
(`src/app/landing/merge-batch-size.ts`), the bisect confirms its culprit
(MB4.3), and the group may hold tasks of several specs (MB1.4).

### D2. The size limit (MB2)

Per base branch, the store keeps `{limit, results}`: the limit, and the
outcome of the last 20 members that reached a result (`landed` or
`culprit`). After each merge batch:

```text
p     = results.length >= 5 ? culprits(results) / results.length : 0.10
ceil  = setting is a number ? setting : min(16, max(1, floor(0.7 / p)))
limit = culprit found    ? max(1, floor(limit / 2))
      : all landed and more were waiting than the batch held ? limit + 1
      : limit
limit = min(limit, ceil)
```

`0.7 / p` keeps a batch's chance to pass near one half or better:
(1 - p)^(0.7/p) is about e^-0.7, 0.5. At p = 5% the ceiling is 14; at 20%,
3. A member that was a culprit is kept in the record's `alone` list until it
lands, and the batch builder gives it a batch of its own.

The limit and the results are plain data in the store's meta, so a restart
keeps them.

### D3. One landing step

```text
take up to `limit` waiting members, in order (an `alone` member: only it)
build the candidate: stack each member on the base, in order
   conflict outside unionPaths -> drop that member, send it back (MB5), go on
run the repository's checks on the candidate
   pass -> guarded fast-forward, mark members landed
   fail -> rerun the failing checks once on the same head
      pass -> record flaky, land as above
      fail -> bisect (D4)
```

The candidate is built by stacking in the landing worktree, with each
member's commits keeping their author and message. A base that moved before
the push starts the step again with a new candidate.

### D4. The bisect, and the culprit confirmed

The halving search in `landNext` (`src/app/landing/landing-queue.ts`) finds
the first failing boundary by building shorter candidates, running only the
checks that failed. When it names a culprit:

1. Check the culprit alone on the base, with the failing checks.
2. Fails alone: the culprit is the cause. It goes back to its worker through
   the landing-failure message, with the failing checks and a log excerpt
   capped at 8 KB.
3. Passes alone: it fails only with something ahead of it. It goes back
   naming the members ahead of it in the batch, and they land.
4. Members before the culprit land in one fast-forward. Members after it go
   to the front of the queue, in order, and the next step tests them.

A batch of n costs at most about log2(n) + 1 extra runs of the failing
checks, plus one for the confirmation.

### D5. Local refs (MB6)

A member is a ref under `refs/avoozl/land/<task>` in the checkout that
lands, pointing at the verified commit. Avoozl pushes only the base branch.
`refs/avoozl/` is not under `refs/heads/`, so a plain `git push` from that
checkout never sends it, and it never reaches CI.

### D9. Risks

| Risk                                                        | Guard                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A flaky check blames an innocent member                     | The rerun (MB4.1) and the confirmation alone (MB4.3)                           |
| The size grows on a run of luck and then fails big          | Halving on a culprit, and the ceiling from the measured rate                  |

## Tasks

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`MB1` to `MB6`, in [Requirements](#requirements)); `D` sections
refer to [Design](#design), `R` numbers to
`.kiro/specs/avoozl/avoozl.md#requirements`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces, real git with a bare remote, and fake executors; Avoozl runs the
repository's checks (AGENTS.md); never force push any branch.

Task IDs start with `mb-` so they never collide with the IDs
of the other specs.

### Phase 1: Merge batches in direct landing

- [x] `mb-1.1` The size limit and its record [MB2] (§D2)
  - Tests: a run of outcomes gives the limits D2 computes, including growth only when more members waited, halving on a culprit and the floor of 1; the ceiling follows the measured rate, with 10% assumed below 5 results; a number in `landing.mergeBatch` replaces the limit and `1` keeps every batch to one member; the limit survives a restart; the schema parity test passes.
  - Per base: `{limit, results}` in the store's meta, the D2 rule after each merge batch, a culprit's `alone` mark, and `landing.mergeBatch` (`"auto"` or 1 to 16) in the validator and the schema.
- [x] `mb-1.2` Merge batches in `direct` landing, after mb-1.1 [MB1, MB3, MB5] (§D1, §D3)
  - Tests with real git and a bare remote: three members of two specs land in one fast-forward; a batch of one lands its task; a member that conflicts with an earlier one is sent back with its files and the rest land; a base that moves before the push gives a new candidate and new checks; a search of the push argv finds no force; a file that sets another landing mode or an unknown `landing` or `machine` key does not load.
  - The landing step takes up to the limit, across specs, stacks the candidate, runs the repository's checks, and pushes a guarded fast-forward; a conflict outside `unionPaths` drops the later member and sends it back.
- [x] `mb-1.3` Rerun, bisect, and the culprit confirmed alone, after mb-1.2 [MB4] (§D4)
  - Tests with a fake check runner: a flaky failure lands the batch and is recorded as flaky; with member 5 of 8 bad, members 1 to 4 land, 5 goes back with its failing check and a log excerpt under 8 KB, and 6 to 8 are next in line; a pair that fails only together sends back the later one naming the earlier, which lands; the culprit's next batch holds only it.
  - A failing check reruns once; then the halving search runs only the failing checks; the culprit is checked alone; members before it land and members after it go to the front of the queue.
- [x] `mb-1.4` Members as local refs, after mb-1.2 [MB6] (§D5)
  - Tests: after a merge batch lands, the bare remote holds no ref but the base branch; a member fetched from another clone lands from its ref; a landed member's ref is removed.
  - Waiting members live under `refs/avoozl/land/<task>`; a member from another clone is fetched into the same ref; only the base branch is pushed.

- [x] `mb-p1` Proof: merge batches on a scratch repository, after mb-1.1, mb-1.2, mb-1.3, mb-1.4 [MB1 to MB6] (§D2, §D3, §D4) (**MANUAL**)
  - Expected: (1) every good task lands, the bad one and the later of the pair go back to their workers, the flaky one lands; (2) the limit starts at 1, grows while batches land, and halves after each culprit; no ref but the base branch appears on the remote.
  - Expected result observed; receipt under `docs/evidence/`, with no image committed.
  - Setup: an isolated workspace and a scratch repository with a bare remote and a real check that takes about a minute; twelve verified tasks across two specs, of which one breaks the check alone, one fails once and then passes, and two break it only together.
  - Action: run the tick until the queue is empty.
  - Failure means: merge batches lose a good task, blame an innocent one, or leave refs on the remote.
