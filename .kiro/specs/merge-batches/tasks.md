---
repo: avoozl
---
# Tasks: merge batches

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`MB1` to `MB6`, in `requirements.md`); `D` sections
refer to this spec's `design.md`, `R` numbers to
`.kiro/specs/avoozl/requirements.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces, real git with a bare remote, and fake executors; Avoozl runs the
repository's checks (AGENTS.md); never force push any branch.

Task IDs start with `mb-` so they never collide with the IDs
of the other specs.

## Phase 1: Merge batches in direct landing

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
