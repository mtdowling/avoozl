# Phase 6: partial reconciliation, decomposition, old-host drain

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 6
tasks 6.5–6.7 [R23.3, R23.6, R23.7] (design §10.2 steps 5–7).

- Tool: `scripts/migration-reconcile.mjs` over `src/app/migration-reconcile.mjs`;
  the drain ran the old host code at `1657244` (before 5.1 deleted it)
- Recorded: 2026-11-12 15:40–16:20 UTC, Node v26.13.0, macOS
- Input: the 6.1 frozen copy (read only), the planning repository at
  `3efad7cea590b3f12c19efb75a966b7fc5183c41`, the code repository's
  `main` (`465fce8f2e63`) and integration branch `codex/native-core-first-programs`
  (`0b8748fef88c`, the same tips GitHub reports), and the 6.2 and 6.4 reports
- Verdict: done as proposals. Counts match the requirements table (41 partial;
  5 observing and 1 interrupted run). Nothing is applied; every verdict,
  leaf, and decomposition waits for owner review before 6.8

| Report | What it holds |
|---|---|
| [phase6-reconciliation.md](phase6-reconciliation.md) | 41 partial tasks: verdict, commits, branches, reason, remaining leaves |
| [phase6-decomposition.md](phase6-decomposition.md) | 32 broad packages: leaf, package with leaves, or hold |
| [phase6-drain.md](phase6-drain.md) | The 6 open runs, what the old host could do, and their imported evidence |

The machine-readable reports (`reconciliation.json`, `decomposition.json`,
`drain.json`, the evidence and scope files, and the two proposal files) stay
with the 6.1–6.4 reports for the 6.8 cutover change.

## How the proposals were made

`partialEvidence` gathers, for each partial task, its source item (open and
checked boxes at the planning commit), evidence paths, runs, task activity,
every commit-like word in its text with the kept refs that contain it, every
named `codex/` or `claude/` branch and whether it survives, and the checklist
entries 6.4 mapped to it. `broadScope` lists the unfinished packages that are
not partial. A planner session (this worker) read those rows, each task's
text, and its source item, and wrote one proposal per task.
`applyProposals` refuses a missing, repeated, or unreasoned proposal, a leaf
without acceptance, a leaf ID that is not a new `<task-id>.<slug>`, and a
checklist entry on a leaf that 6.4 did not map to that task (entries become
acceptance, never new tasks, R23.5).

## 6.5 Reconcile the 41 partial tasks

| Verdict | Count |
|---|---|
| partial, with named remaining leaves | 37 |
| complete pending acceptance | 4 (`collector-units`, `dev-loop-ledger`, `shared-compiler-baseline`, `shared-compiler-sharing-pilot`) |
| stale | 0 |

75 remaining leaves are proposed, IDs `<task-id>.<slug>`, each with acceptance;
19 carry a mapped checklist entry as acceptance. Findings that matter for review:

- The owner paused native work on 2026-11-11. Every lane branch the tasks name
  is gone from GitHub and the local checkout; only `main` and the integration
  branch survive. 19 words that look like commits resolve on no kept ref,
  including the two runner-hangs winddown commits (`61854bd12`, `5019a6664`),
  the nominal-metadata fix `c89c2af8f`, and the shared-compiler harness
  `babc0538f`. Some are digests, not commits. The report lists them per task.
- The restart handoff the tasks cite
  (`todo/nupp-native-runtime-winddown-2026-11-11.md`), the shared-compiler
  pilot report and its checkpoint `af53ebc`, and the archive volume the notes
  point to are not available: the file and checkpoint are not in the planning
  repository's history, and the volume is not mounted. Two of the four
  complete-pending-acceptance verdicts depend on restoring them.
- 9 partial tasks have no commit, branch, evidence, run or recorded state.
  They keep the `partial` verdict with leaves, and each reason says the
  status is not supported by evidence, so the owner can reset them to planned.

## 6.6 Decompose broad planned work

| Verdict | Count |
|---|---|
| leaf (the task is bounded; acceptance added) | 16 |
| package with leaves | 9 (27 leaves) |
| hold | 7 |

Held: `core-workers` and its 4 deferred children (deferred by the owner),
`combined-acceptance` (the final gate, blocked on the parts), and
`shared-compiler-production` (conditional on a pilot whose gate did not pass).
`vm-tmpfile-seek` is a leaf whose first step is an owner choice.

## 6.7 Drain the old-host runs

`drain-old-host.mjs` (kept with the reports) imported the old host's store and
operations from a detached `1657244` checkout, copied the frozen database to a
scratch file, and, for each run in an open state, read it, asked to interrupt
it, and archived it. It created no manager, provider, server, or plans root,
and it never opened the frozen copy or the real workspace for writing.

| Run | Task | Old host read | Old host interrupt | Archived |
|---|---|---|---|---|
| 5 external observations | `general-ffi` (partial); `nonreturning-bodies`, `guest-fixture-exports`, `core-runtime-code-loading`, `core-string-method-errors` (implemented) | 404: transcript not on this machine | 409: read-only external transcript | yes, state stays `observing` |
| `run-89d2a4a4…` (codex ask) | none (a plan-review conversation) | ok | needs a live manager | yes, state stays `interrupted` |

Gap: the old host cannot finish or close an external observation; archive is
its only close, and it keeps the state. All 5 observations point at one
Claude session on another machine name, whose worktree and transcript are
gone here, so no transcript evidence can be imported. The imported evidence is
the run records, link events, task activity, and commit reachability. Four of
the five tasks are already finished in the baseline.

The interrupted run reviewed stale plans for the owner, who then asked it to
archive them. Its final messages and the owner's instruction are imported in
full; it stopped while closing the old VM task records. Three catalog tasks
from `todo/nupp-runtime.md` are still `planned` in the copy, an input for the
6.10 stale-plan list.

## Checks

- Frozen copy hashes are the same before and after (`.avoozl.json`
  `cbeea976…`, `.avoozl/config.json` `b1acfea9…`, `workspace.sqlite`
  `d911fc62…`). The drain's scratch copy is the only file written.
- `npm test` and `git diff --check` before landing (see commit).
- The rendered reports contain no home, temporary, volume, or local-app paths.

## Owner decisions this needs

- Accept, change, or reject each verdict and leaf before 6.8.
- P14 expects 80 unfinished sub-issues. The proposals add 102 leaves under
  their tasks; P14's count needs to say whether leaves count.
- Whether to restore the missing commits and reports from the archive, or
  treat them as lost and redo the work.
