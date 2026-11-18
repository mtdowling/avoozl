# Tasks: integrator trains

Status: Draft

Grouped into a first cut (Phases 1 to 7) and later phases (Phases 8 to 11).
Explicit `after` lists and the manifest's `requires` govern execution; phase
numbers alone do not impose a dependency. Each phase that can be shown end to
end ends with a proof. Requirement numbers are in brackets (`LT1` to `LT16`,
in `requirements.md`); `D` sections refer to this spec's `design.md`, `R`
numbers to `.kiro/specs/avoozl/requirements.md`.

The first cut is LT1 to LT5, LT6 except the resolver chat, LT7, LT8, the LT10
bisect and repair, LT13's local slots, and LT14's queue depth and wait line,
with the LT15 settings and LT16 rule changes they need. The later phases are
review pull requests (LT9), reaping and the rest of LT14 (LT11, LT14.2,
LT14.4), conflict-aware scheduling (LT12), CI capacity (LT13.4), the resolver
chat (LT2.4, LT6.4) and the red-CI bisect (LT10.6). Every later-phase task is
after `lt-p3`, which is after `lt-p2` and `lt-p1`, so no later phase starts
before the first cut's lease, train and failure proofs pass. Later phases do
not wait for `lt-p4`, the manual live run.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces, real git with a bare remote, and a fake GitHub; run `npm test` and
`git diff --check` before landing; no real workspace data, machine
configuration, credentials or personal plans in the repository (AGENTS.md);
never force push any branch. The first cut's settings task validates only the
keys the first cut reads; each later-phase task adds its own keys to the
schema and to `validateTrains`. The new code lives in
`src/app/integrator-trains.mjs` (D21).

This spec is a draft. Approving it, creating issues and starting agents are
separate acts. Task IDs start with `lt-` so they never collide with the IDs of
the other specs. The entry marked `"manual": true` in the manifest waits for a
person.

## First cut

## Phase 1: Settings and the queue

- [x] lt-1.1 Settings for `landing.trains` and the machine keys, with validation [LT15, LT7.3] (§D16)
  - `landing.trains` and `landing.trains.targets.<branch>` in `src/avoozl-config.schema.json`; `machine.platforms`, `machine.slots` and `lease.*` in the global configuration; `validateTrains` in `src/app/landing-config.mjs`, called from `loadLayeredConfig`; defaults and bounds as in the D16 table for the keys the first cut reads; `landing: train` with an invalid block lands nothing and opens one Needs you item.
  - Done when: Tests in `src/app/test/integrator-trains-config.test.mjs` load a valid file and get every default; refuse an unknown key, each out-of-range value, `minBranches` above `maxBranches`, a target without `policy`, a `regenerate` rule without `command`, a needed platform with neither an environment nor `ci.workflow`, and `machine.*` or `lease.*` in `.avoozl.json`, each message naming the key and file; a gated target with a CI-only platform loads with the extra-run warning; a target override replaces the `trains`-level key.
- [x] lt-1.2 Batch branches and queue registration, after lt-1.1 [LT1.1, LT1.2, LT1.3, LT1.4, LT1.5, LT16.1] (§D2, §D3)
  - The landing value `train`; after Verify the tick pushes `<prefix><task>` through the scanned push path, as a plain push, and queues an entry with `branch`, `forkPoint`, `builtOn`, `footprint` and `cheap`; `avoozl landing submit TASK --branch NAME` and its MCP twin; requeue keeps its place for a descendant head and refuses any other.
  - Done when: Tests in `src/app/test/landing-batch-branches.test.mjs`: a verified task's commit appears on the bare remote as `avoozl-batch/<task>` and in the queue with every field; a planted content-rule match blocks the push; `submit` refuses a wrong prefix, a task outside an approved plan and a failed cheap check, each naming the step; a descendant requeue keeps `seq`; a rewritten head is refused with the reason and the remote branch and entry are unchanged; a branch built on another queued branch records it in `builtOn`.
- [x] lt-1.3 CI guidance for repositories and setup's workflow check, after lt-1.1 [LT1.7, LT1.8] (§D17)
  - `docs/integrator-trains.md` with the D17 snippets, the reason not to use a skip tag, the gated `workflow_dispatch` input, and the D16.1 setup for a repository whose CI does not gate merges; `avoozl setup REPO` under `landing: train` lists each workflow whose `push` trigger matches the batch prefix, with the line to add, and edits nothing.
  - Done when: A setup test with three fixture workflows (no filter, `branches: [main]`, `branches: ['**']`) lists the first and third with the right line each and not the second; the workflow files are byte-identical after the run; `node scripts/release-scan.mjs` is clean on the new doc.

## Phase 2: The landing lease and the integrator

- [x] lt-2.1 One lease module from the activity lease [LT3.2] (§D5.1)
  - `src/lease.mjs` with `takeLease`, `renewLease`, `endLease`, `leaseState`, in seconds; `applyActivity` calls it and keeps its API and 5–240 minute bounds.
  - Done when: `src/report.test.mjs`'s activity tests pass unchanged; new tests in `src/lease.test.mjs` cover take on none and on stale, busy on active foreign, renew and end with the right and the wrong lease ID, and a 180-second lease going stale at 181 seconds.
- [x] lt-2.2 The landing lease: compare-and-set, heartbeat, expiry and the hung holder, after lt-2.1, lt-1.1 [LT3.1, LT3.3, LT3.4, LT3.5, LT3.9] (§D2, §D5.2)
  - `landing_leases` table (added to the store's table lists); take inside one transaction; renew every `heartbeatSeconds`; expire after `missedHeartbeats`; a stale lease whose holder pid is alive on this machine with the same start time is not taken and opens one Needs you item.
  - Done when: Tests in `src/app/test/landing-lease.test.mjs`: two stores on one database file race to take the lease and exactly one wins, the other gets `busy` and writes nothing; a lease renewed on time stays; one not renewed for three heartbeats goes stale; a stale lease with a live pid is refused with one Needs you item across three loops; a stale lease with a dead pid is taken.
- [x] lt-2.3 The integrator process and role, after lt-2.2, lt-1.2 [LT2.1, LT2.2, LT2.3, LT2.5] (§D4, §D21)
  - `avoozl integrator run` as a supervisor child serving every `train` target in its workspace, in `src/app/integrator-trains.mjs`; `landDirect` skips `train` targets; `avoozl integrator status [--json]`.
  - Done when: Tests: with a `train` target, a tick that verifies a task pushes only the batch branch and never the trunk; the integrator process is the only caller that pushes the trunk (a test wraps git and records pushes by process); the supervisor restarts a killed integrator; `status --json` shows holder, train and trigger state.
- [ ] lt-2.4 A taker cleans up a dead train, after lt-2.3, lt-3.1 [LT3.6, LT3.7] (§D5.3)
  - Remove listed worktrees, run held environments' `cleanup`, release slots, settle members: back to `queued` in order if unpushed; finish validation and failure handling first if an optimistic train had pushed. Each action is written to the dead train's steps; its outcome becomes `abandoned`.
  - Done when: Tests kill an integrator (a) mid-stack, (b) mid-full-validation under gated and (c) after an optimistic push; in each the taker leaves no landing worktree, runs the fake cleanup command once, frees the slot, and (a, b) requeues members in the same order or (c) runs full validation on the pushed head before forming a new train.
- [ ] lt-p1 Proof: one integrator per trunk, and a dead one clears by itself, after lt-2.1, lt-2.2, lt-2.3, lt-2.4 [LT2, LT3] (§D5)
  - Setup: an isolated workspace, a scratch repository with a bare remote, a `train` target with a slow fake full validation, and two integrator processes on one machine.
  - Action: (1) queue three branches and start both integrators; (2) kill the lease holder during full validation; (3) suspend (SIGSTOP) the next holder past its expiry; (4) move the remote trunk by hand during a train.
  - Expected: (1) one train, one trunk push; the other integrator reports `busy`; (2) the survivor takes the lease after three missed heartbeats, cleans up and lands the three; (3) nothing is taken and one Needs you item names the hung integrator; (4) the push is refused, the stack is rebased and rechecked, and the trunk never shows a forced update.
  - Failure means: two trains can run at once, or a dead lock needs a person.
  - Next decision: if expiry is too slow in practice, tune the heartbeat defaults before Phase 5.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 3: The train engine

- [x] lt-3.1 Train records and the back-to-back trigger, after lt-2.3 [LT4] (§D2, §D6)
  - `landing_trains` table; readiness (cheap checks passed, not paused, `builtOn` satisfied); the trigger with `minBranches`, `maxWaitMinutes`, `maxBranches` and `cooldownSeconds`; trains never overlap; entries in queue order.
  - Done when: Tests with a fake clock: two ready entries with `minBranches` 3 wait until `maxWaitMinutes` and then go as a train of two; twelve ready entries make a train of ten and leave two; a train finishing starts the next only after the cooldown; a paused entry and an entry whose `builtOn` is queued outside the train are not ready, each with its hold reason; no two trains exist for one target at any step.
- [x] lt-3.2 Stacking with the cut rule, after lt-3.1 [LT5] (§D7, §D21)
  - A detached landing worktree with `rerere.enabled=false`; each member's range from its fork point or the newest `builtOn` head, rebased in order; contained members closed; each commit keeps author and message and gains the `Avoozl-Task` trailer (`trailers`, now exported from `src/app/landing-trains.mjs`); boundaries and original heads on the train record.
  - Done when: Real-git tests: B built on A, both queued, stack A then B with each of A's commits exactly once; B built on A where A landed yesterday, B's commits only; B built on A where A is queued outside the train, B held naming A; a branch whose commits are all in the trunk is closed as contained; every stacked commit has its trailer and original author; `src/app/test/landing-trains.test.mjs` passes unchanged.
- [x] lt-3.3 Mechanical conflicts with per-file verification; semantic ones go to the later task, after lt-3.2 [LT6.1, LT6.2, LT6.3, LT6.5, LT6.6] (§D8)
  - `conflicts.mechanical` rules with `union`, `regenerate` and `format`; `landing.unionPaths` read as `union` (reusing `unionMerge`); each resolved file's `verify` must pass before `git add`; a semantic conflict drops member N, keeps stacking, and goes to N's chat through `sendConflictBack` with the files and the earlier member's boundary.
  - Done when: Real-git tests: two appends to a `union` path stack cleanly; a `regenerate` rule's command rewrites a lockfile and it is staged; a rule whose `verify` fails leaves the file unstaged and the conflict semantic; with no rules every conflict is semantic; the later of two branches editing the same lines is dropped and its chat gets the file list and commit, while a third, unrelated member still lands; a planted rerere record is not replayed.

## Phase 4: Validation and local capacity

- [x] lt-4.1 Machine platform environments and the platforms a train needs, after lt-1.1 [LT7.3, LT7.4] (§D9.1, §D9.2)
  - Read `machine.platforms` from the global file only; `platforms.rules` globs or the `platforms.classifier` argv (changed paths on stdin, JSON list out); all platforms when neither is set.
  - Done when: Tests: a classifier fixture script gets the changed paths and its JSON output decides the platforms; rules map `src/win/**` to `windows-x64` only; a classifier that exits nonzero or prints bad JSON fails the train's step with the reason; a platform environment set in `.avoozl.json` is refused.
- [x] lt-4.2 Cheap and full validation runners with suite results, after lt-4.1, lt-3.2 [LT7.1, LT7.2, LT7.5, LT7.6] (§D9.3)
  - Cheap checks on the stack head before any push, with per-check timeouts; full validation per needed platform through its wrapper, in parallel up to free slots; the results file read into the train record.
  - Done when: Tests with fake wrapper scripts: the wrapper receives the command and runs in the landing worktree; a cheap check failure stops before any push; a timeout fails with "timed out after N s"; a results file's suites appear per platform on the train; a missing or malformed results file means whole-command reruns, recorded once.
- [x] lt-4.3 Local resource slots shared across workspaces, after lt-4.1 [LT13.1, LT13.2, LT13.3] (§D14)
  - `resource_slots` in the supervisor's machine database; a train takes every slot its platforms use before full validation and releases them at its end; a worker check needing a held slot waits with the train named.
  - Done when: Tests: two workspaces on one machine database, one `windows-vm` slot: the second train waits until the first ends; a worker check waits with "waiting for windows-vm (train-…)"; a crashed holder's slot is freed by the taker (with lt-2.4).
- [x] lt-4.4 CI fallback for platforms without a local environment, after lt-4.2 [LT7.7] (§D9.3)
  - Optimistic: the trunk push's run counts for that platform; gated: one `workflow_dispatch` on `avoozl-validate/<train>` with the platform input, pushed as a plain new branch, then the ref is deleted.
  - Done when: Fake-GitHub tests: a gated train with a CI-only platform dispatches exactly one run naming every CI-only platform, waits for it, counts as validated only on success, and deletes the ref; an optimistic train makes no dispatch and reads the push's run.
- [x] lt-4.5 Avoozl's own `test.yml` accepts the validation dispatch, after lt-4.4 [LT8.8] (§D16.1)
  - `.github/workflows/test.yml` gains `workflow_dispatch` with a `platforms` input that limits the matrix legs to the named platforms (`linux-x64` to `ubuntu-latest`, `windows-x64` to `windows-latest`, `macos-arm64` to `macos-latest`); `push` stays `branches: [main]`; the job name, the matrix key and the docs-only skip are unchanged.
  - Built against the sharded `test.yml` (plan job, lint, per-system shard jobs, required checks `test (<os>)`): the plan job's `legs` step sets an unrequested system's shards to `[]`, and its required check passes with nothing to run. The test below reads those names instead of one job `test` with a matrix.
  - Done when: A test reads `test.yml` and finds the input, `push` on `main` only, the job `test` with matrix `os` values unchanged, and the platform-to-runner mapping above; one dispatch run on a scratch branch with `platforms=linux-x64,windows-x64` runs only those two legs, linked in the pull request; the scratch branch is deleted afterward.

## Phase 5: Landing

- [x] lt-5.1 Gated and optimistic policies, the guarded push, a moved trunk, and no force push anywhere, after lt-3.3, lt-4.2 [LT8.1, LT8.2, LT8.3, LT8.4, LT8.5, LT3.8, LT3.10, LT16.2, LT16.3, LT16.4, LT16.6, LT16.7] (§D10.1, §D10.2, §D10.3, §D10.4)
  - Each policy's step order; intents for every spec through its driver's journal before the push; `guardedFastForward` inside `withWorkLock`; on a moved trunk, rebase with the cut rule and recheck, up to `failure.maxRebases`; after landing: integrated at each boundary, `mergeBaseBack`, each batch branch deleted only if the remote still shows its recorded head, worktree removed.
  - Done when: Real-git tests: gated pushes only after full validation passes and never on a failure; optimistic pushes after cheap checks and then runs full validation on the pushed head; a train with tasks of two drivers writes two intents, both read back before the push; a trunk moved during the train is rebased onto and pushed after rechecks, and after `maxRebases` moves the train fails with "trunk kept moving" and members requeue; a batch branch pushed to during the train is kept and its new head queued; no push in any test is forced; a test scanning every `git push` argv in `src/` finds no `--force`, `-f`, `--force-with-lease` or `+` refspec.
- [x] lt-5.2 Watch the train's one CI run, after lt-5.1, lt-4.4 [LT8.6, LT8.7, LT4.6] (§D10, §D9.3)
  - Read `ci.workflow`'s run for the pushed head through the pacer and record it on the train; validated only when every needed platform passed; `ci.waitForLastTrain` holds the next train until that conclusion.
  - Done when: Fake-GitHub tests: the run ID and conclusion land on the train record; a train with a CI-only platform is validated only after the run passes; with `waitForLastTrain` false the next train starts before the conclusion and with true it waits; Stop the line counts only validated trains' heads.
- [ ] lt-p2 Proof: ten branches land in one train, after lt-p1, lt-1.2, lt-3.2, lt-3.3, lt-4.2, lt-5.1, lt-5.2 [LT1, LT4, LT5, LT6, LT8] (§D7, §D10)
  - Setup: a scratch repository with a bare remote and a fake GitHub; ten task branches as in the 2026-11-17 incident, two of which delete different functions from the same lines, one built on another, one append-only `CHANGELOG.md` conflict under a `union` rule; policy optimistic.
  - Action: queue all ten, let the integrator run.
  - Expected: one train of nine; the later of the two same-line branches returns to its task with the conflicted file and the earlier commit; the stacked branch carries no duplicated commit; the changelog merges by rule and passes verify; one trunk push, one CI run, no forced update on any ref; the returned branch, fixed by a merge and requeued, lands in the next train.
  - Failure means: stacking or the cut rule does not hold on a realistic batch.
  - Next decision: whether `optimistic` can be the default suggested by setup for trunks with fast cheap checks.
  - Done when: Expected result observed; receipt under `docs/evidence/` with the train timeline.

## Phase 6: Failure

- [x] lt-6.1 Flaky reruns and the boundary bisect over failing suites, after lt-4.2, lt-3.2 [LT10.1, LT10.2] (§D11.1)
  - Rerun failing suites `failure.flakyReruns` times; record flakes; bisect boundaries with only the still-failing suites on only the failing platforms; an unplaceable failure names the last member.
  - Done when: Tests with a fake suite runner: a suite that fails then passes is recorded `flaky` and the train continues; in a train of ten with member 7 bad the bisect probes at most four boundaries, each probe runs only the failing suite on the failing platform, and names member 7; with no results file each probe runs the whole command; every probe passing names the last member and records the interaction.
- [x] lt-6.2 Land the good branches; return, eject, revert or fix forward, after lt-6.1, lt-5.1 [LT10.3, LT10.4, LT10.5, LT16.5] (§D11.2)
  - Gated: drop the culprit, restack, cheap checks, rerun the failed suites, land, up to `maxBisects`. Optimistic: `revert` pushes one fast-forward revert of the culprit's range; `fix-forward` pulls Stop the line for the target and puts a fix task first. `failure.action` `return` sends the culprit's chat the suites, platform and a log excerpt of at most 200 lines through `sendFailureBack`, up to `retries`; `eject` opens Needs you. `landNext` halving stays for `direct`.
  - Done when: Real-git tests: gated with one culprit lands nine and returns one; gated with a second culprit after the first restack stops at `maxBisects`; optimistic `revert` leaves the trunk green with one revert commit and no forced update; `fix-forward` opens a stop and a fix task first in line; `return` sends the excerpt and counts rounds, then ejects; `eject` opens one Needs you item; a `direct` repository still halves.
- [ ] lt-p3 Proof: a red train lands the rest, after lt-p2, lt-6.1, lt-6.2 [LT10] (§D11)
  - Setup: a scratch repository with a fake suite runner, eight queued branches, member 5 breaks one suite on one platform, member 2 has a flaky suite; run once gated and once optimistic with `revert`.
  - Action: let the integrator run each.
  - Expected: gated: the flake is recorded and ignored; the bisect probes only the failing suite on the failing platform and names member 5; seven land; member 5's chat gets the suite and excerpt. Optimistic: eight land, then one revert of member 5's range turns the trunk green; member 5 is returned. Neither run forces any ref.
  - Failure means: one bad branch still costs the whole batch, or a revert breaks the trunk further.
  - Next decision: whether the later phases start now, and whether `bisectOnRed` (lt-11.2) should default on.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 7: Queue depth and wait

- [ ] lt-7.1 Queue depth and time in queue on the Landing queue page, the CLI and MCP, after lt-3.1 [LT14.1, LT14.3] (§D15)
  - Extend `src/app/landing-queue-view.mjs` with, per target, queue depth, each entry's time in queue and hold reason, and the running train and its step; `avoozl landing status [--json]` and the MCP read return the same. Branch age, behind-trunk, last trains, the 7-day numbers and the wait alert come in lt-9.2.
  - Done when: A seeded-store test checks depth, each time in queue and hold reason, and the running train's step; a counting-client test shows zero GitHub calls for the page, the CLI and the MCP read; the UI test renders the page at 390 and 1280 px; screenshots in light and dark go to the owner (R92.12).
- [ ] lt-p4 Proof: a live train on Nupp, after lt-p3, lt-1.3, lt-4.3, lt-4.4, lt-7.1 [LT1, LT7, LT8, LT13.1, LT13.2] (§D20)
  - Setup: the owner's Nupp checkout, `landing: train` on its trunk, the D17 CI exclusions in its workflows, machine settings for this Mac's native, container and Windows VM environments, and Nupp's own classifier as `platforms.classifier`.
  - Action: let a day of agent work queue and land.
  - Expected: no branch waits for its own CI run; each train ends with one CI run on the trunk; median time in queue under 30 minutes; any red train is narrowed to one branch and the rest land.
  - Failure means: the train is slower than stacking by hand, or the platforms cannot be validated locally.
  - Next decision: keep, retune, or limit trains to repositories with fast cheap checks.
  - Done when: The owner records the day's queue depth and time-in-queue numbers from the Landing queue page in a receipt under `docs/evidence/`.

## Later phases

## Phase 8: Review pull requests

- [ ] lt-8.1 Review pull requests only on request, after lt-p3 [LT1.6, LT9.1] (§D3)
  - `avoozl landing review TASK` and the Links box action open a pull request for the batch branch and store its number; nothing else opens one; `pullRequests.mode` and `pullRequests.commentTemplate` join the schema and `validateTrains`.
  - Done when: A fake-GitHub test shows no pull request for a queued task until `review` runs, one after it, the same one on a second run, and the number on the queue entry; a test over the tick path counts zero pull request creations.
- [ ] lt-8.2 Comment on and close review pull requests after landing, after lt-8.1 [LT9.2, LT9.3] (§D10.4)
  - After the trunk push, one comment per open review pull request from the template, with links to the train and the trunk commit, privacy-screened, then the pull request is closed; the batch branch is never moved for it.
  - Done when: Fake-GitHub and real-git tests: after a landed train the pull request has one comment with the train link, position and trunk commit link, passes the privacy rule, and is closed; the batch branch's remote head is unchanged from queue time until its deletion; a closed pull request gets no comment; no push in the test targets the batch branch.

## Phase 9: Reaping and the rest of visibility

- [ ] lt-9.1 The reaper, after lt-p3 [LT11, LT16.6] (§D12)
  - Between trains: idle alert, refresh past `behindCommits` by re-stacking in the integrator's landing worktree and recording `refreshed` under a local-only ref, contained branches closed with the trunk commit, exhausted entries returned or ejected, unknown batch branches listed and never deleted; `reap.*` joins the schema and `validateTrains`.
  - Done when: Tests: an entry idle past `idleHours` gets one Needs you item across three loops; an entry 51 commits behind is refreshed and rechecked, its `refreshed` range is recorded, its remote batch branch still shows the original head, and the local ref is on no remote; the next train stacks from the refreshed range; a conflicting one goes back to its task; a fully contained entry is closed with the commit and its branch deleted; an orphan remote batch branch is listed once and still exists afterward; a second pass with nothing changed writes nothing.
- [ ] lt-9.2 The rest of the queue numbers, and the wait alert, after lt-7.1, lt-9.1 [LT14.1, LT14.2, LT14.4] (§D15)
  - Add branch age, behind-trunk, last trains, 7-day p50/p90 time in queue, pass rate and bisect count to the page, the CLI and the MCP read; the alert past `alerts.waitMinutes`, once per entry; `alerts.*` joins the schema and `validateTrains`.
  - Done when: A seeded-store test checks every number; a counting-client test shows zero GitHub calls; the alert fires once for an entry over the threshold and not again; the UI test renders the page at 390 and 1280 px; screenshots in light and dark go to the owner (R92.12).
- [ ] lt-p5 Proof: nothing sits silently, after lt-9.1, lt-9.2 [LT11, LT14] (§D12, §D15)
  - Setup: a scratch repository and a fake clock; one idle entry, one 60 commits behind, one already merged by hand, one with no retries left, one orphan batch branch on the remote.
  - Action: run the integrator loop through two days of fake time with no trains due.
  - Expected: each case ends in its D12 state with one Needs you item where D12 says so; no batch branch on the remote moved; the page and `landing status --json` show the same numbers; the wait alert fired once per entry over the threshold.
  - Failure means: a branch can still wait with nobody told.
  - Next decision: tune the reaping defaults from the receipt.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 10: Scheduling and CI capacity

- [ ] lt-10.1 Conflict-aware train composition by footprint, after lt-p3 [LT12] (§D13)
  - Footprint from declared `paths` and the branch diff; `same-train` pulls an overlapping later entry forward within `maxBranches`; `serialize` leaves it for the next train; `scheduling.*` joins the schema and `validateTrains`.
  - Done when: Tests: with entries A, C, D, B where A and B overlap, `same-train` makes the order A, B, C, D; with `maxBranches` 2 it makes A, B; `serialize` makes A, C, D and leaves B; an entry whose real diff exceeds its declared paths is matched on the real files.
- [ ] lt-10.2 CI capacity for fallback runs, after lt-p3 [LT13.4] (§D14)
  - `capacity.ci` counted from one paced read of queued and in-progress jobs, mapped by `ci.jobPlatforms`, before a gated fallback run; `capacity.ci` and `ci.jobPlatforms` join the schema and `validateTrains`.
  - Done when: Fake-GitHub tests: with `capacity.ci.macos-arm64` 2 and two macOS jobs queued the train waits and its step says so; with one queued it dispatches; the read count per loop is one.

## Phase 11: The resolver chat and the red-CI bisect

- [ ] lt-11.1 The integrator resolver chat, off by default, after lt-p3 [LT2.4, LT6.4] (§D4, §D8)
  - `prompts/integrator.md` with the role prompt; under `conflicts.resolver: "chat"`, a file whose mechanical rule failed goes to an integrator chat through the executor seam with the landing worktree as its only folder; its edit must pass `verify`; `conflicts.resolver` joins the schema and `validateTrains`.
  - Done when: A fake-executor test: the chat is opened only for a covered file whose rule failed, never for an uncovered one; its brief holds no push, pull request or comment instruction and passes `briefAllowed`; a resolution that fails `verify` is not staged and the conflict returns to the later task.
- [ ] lt-11.2 Bisect when CI goes red on a landed trunk, after lt-p3 [LT10.6] (§D11.3)
  - With `ci.bisectOnRed`, a failed watched run on a train's pushed head starts a bisect of that train for the failing jobs' platforms (mapped by `ci.jobPlatforms`), before the next train; a platform with no local environment goes to Needs you; `ci.bisectOnRed` and `ci.jobPlatforms` join the schema and `validateTrains` if lt-10.2 has not added them.
  - Done when: Fake-GitHub tests: a failed run on a train's head bisects locally and reverts or fixes forward per settings before the next train starts; a failed run on a head no train pushed changes nothing; the CI-only-platform case opens one Needs you item with the failing jobs; with the setting off nothing happens.
