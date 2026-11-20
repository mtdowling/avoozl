---
repo: avoozl
---
# Tasks: merge batches

Explicit `after` lists and each task's `after` fact govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`MB1` to `MB8`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces, real git with a bare remote, and fake executors; Avoozl runs the
repository's checks; no real workspace data, machine configuration,
credentials or personal plans in the repository (AGENTS.md); never force
push any branch. A task that deletes a test file first lists, in its pull
request, each behavior that file covered and the test that covers it
afterward. Screen changes need phone and desktop, light and dark screenshots
for owner approval before merge (R92.12); screenshots are shown to the owner
and never committed (AGENTS.md).

Task IDs start with `mb-` so they never collide with the IDs
of the other specs.

## Phase 1: Merge batches in direct landing

- [x] mb-1.1 The size limit and its record [MB2] (§D2)
  - $done: Tests: a run of outcomes gives the limits D2 computes, including growth only when more members waited, halving on a culprit and the floor of 1; the ceiling follows the measured rate, with 10% assumed below 5 results; a number in `landing.mergeBatch` replaces the limit and `1` keeps every batch to one member; the limit survives a restart; the schema parity test passes.
  - Per base: `{limit, results}` on the queue record, the D2 rule after each merge batch, a culprit's `alone` mark, and `landing.mergeBatch` (`"auto"` or 1 to 16) in the validator and the schema.
- [x] mb-1.2 Merge batches in `direct` landing, after mb-1.1 [MB1.1, MB1.4, MB3, MB5] (§D1, §D3)
  - $done: Tests with real git and a bare remote: three members of two drivers land in one fast-forward with each spec's intent read back first; a batch of one lands as `direct` does today; a member that conflicts with an earlier one is sent back with its files and the rest land; a base that moves before the push gives a new candidate and new checks; a search of the push argv finds no force.
  - $after: mb-1.1
  - The landing step takes up to the limit, across specs and drivers, stacks the candidate, runs the repository's checks, and pushes a guarded fast-forward; a conflict outside `unionPaths` drops the later member and sends it back.
- [x] mb-1.3 Rerun, bisect, and the culprit confirmed alone, after mb-1.2 [MB4] (§D4)
  - $done: Tests with a fake check runner: a flaky failure lands the batch and is recorded as flaky; with member 5 of 8 bad, members 1 to 4 land, 5 goes back with its failing check and a log excerpt under 8 KB, and 6 to 8 are next in line; a pair that fails only together sends back the later one naming the earlier, which lands; the culprit's next batch holds only it.
  - $after: mb-1.2
  - A failing check reruns once; then the halving search runs only the failing checks; the culprit is checked alone; members before it land and members after it go to the front of the queue.
- [x] mb-1.4 Members as local refs, after mb-1.2 [MB6] (§D5)
  - $done: Tests: after a merge batch lands, the bare remote holds no ref but the base branch; a member fetched from another clone lands from its ref; a landed member's ref is removed.
  - $after: mb-1.2
  - Waiting members live under `refs/avoozl/land/<task>`; a member from another clone is fetched into the same ref; only the base branch is pushed.

- [x] mb-p1 Proof: merge batches on a scratch repository, after mb-1.1, mb-1.2, mb-1.3, mb-1.4 [MB1 to MB6] (§D2, §D3, §D4)
  - $done: Expected: (1) every good task lands, the bad one and the later of the pair go back to their workers, the flaky one lands; (2) the limit starts at 1, grows while batches land, and halves after each culprit; no ref but the base branch appears on the remote.
  - $done: Expected result observed; receipt under `docs/evidence/`, with no image committed.
  - $manual: true
  - $after: mb-1.1, mb-1.2, mb-1.3, mb-1.4
  - Setup: an isolated workspace and a scratch repository with a bare remote and a real check that takes about a minute; twelve verified tasks across two specs, of which one breaks the check alone, one fails once and then passes, and two break it only together.
  - Action: (1) run the tick until the queue is empty; (2) read the Landing queue status after each merge batch.
  - Expected: (1) every good task lands, the bad one and the later of the pair go back to their workers, the flaky one lands; (2) the limit starts at 1, grows while batches land, and halves after each culprit; no ref but the base branch appears on the remote.
  - Failure means: merge batches lose a good task, blame an innocent one, or leave refs on the remote.

## Phase 2: Visible

- [x] mb-2.2 The Landing queue page and status, after mb-1.3 [MB7] (§D6)
  - $done: UI and CLI tests show each part from fixture records; none of the three makes a GitHub call; a member waiting 61 minutes opens one Needs you item and a second read opens none; screenshots of the page at 390 and 1280 px, light and dark, go to the owner.
  - $after: mb-1.3
  - Waiting, Testing, Last merge batches and Size per base, from stored records; the same in `avoozl landing status --json` and the MCP read; one Needs you item past 60 minutes.
- [x] mb-2.3 The words, after mb-2.2 [MB1.5] (§D8)
  - $done: The word test passes and fails on a planted "train"; `node scripts/check/spec-lint.mjs` reports 0 errors; the README's Landing section describes merge batches.
  - $after: mb-2.2
  - A test over the page's strings, the help table, `README.md` and `docs/*.md` for "train" and "integrator".

## Phase 3: The retro

- [x] mb-3.1 The retro suggests a landing mode [MB8] (§D7)
  - $done: Tests: a window where landing waits are 60% of lead time adds the question to the brief with both numbers, and one at 30% does not; an approved proposal changes nothing until the person saves the setting.
  - The retro's facts gain each repository's median lead time and median time waiting to land; past one half, its brief asks about the landing mode with the numbers.
