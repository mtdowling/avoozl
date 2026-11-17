# Proof P66: journal, working-head recovery and takeover

Date: 2026-11-17. Requirement: R102 (design §4.32). Result: **NOT PASSED.**
Every invariant held on the live run. One prescribed action, "Restore journal
consistency" after a mutated or deleted record, cannot run: neither the code nor
the design has a way to restore a held journal. `avoozl-p66` stays open.

The live runs found two defects. Both are fixed on main:

- PR #403: a direct landing wrote its intent without the checks that passed, so the
  `landed` outcome had no evidence. `validOutcome` refused it, the task never
  completed, and a cross-spec successor stayed held after a real landing.
- PR #406: before dispatch, the scheduler read a spec journal through
  `/repos/undefined/undefined` when the issue's repository had no configuration
  row, so the spec held as unreadable instead of honoring its hold or generation.

## Setup

- Run 3, the one recorded here, used code on main at `b22dbe61`, which includes
  #403 and #406. Script: `scripts/proof-p66-live.mjs`.
- Private scratch repositories: code `mtdowling/avoozl-scratch-p66c` and planning
  `mtdowling/avoozl-scratch-p66c-plans`. Runs 1 and 2 (`avoozl-scratch-p66`,
  `avoozl-scratch-p66b`) found the two defects above.
- The workspace was disposable, under `/private/tmp`. No real workspace, Nupp
  repository or private pilot was read or written. A fetch guard refused any GitHub
  request outside the two scratch repositories.
- Published issues: epic #1, spec `p66-alpha` #2 and spec `p66-beta` #3 (both
  sub-issues of #1), and two throwaway journals, #4 and #5, for the mutation tests.
  All were created with `crew:avoozl` and assigned to the owner.
- Chain: `t1 -> t2 -> t3` in `p66-alpha`, plus `x1` in `p66-beta`, which requires
  `t1` (cross-spec). Landing was `direct` on `main`. The check was `npm test`.
- Executor: Claude Code 2.1.326 (`claude -p`, tools `Read`, `Write` and `Edit`,
  `--permission-mode acceptEdits`, no skip flags) ran each task in its own
  worktree. Avoozl's code made every commit after the child exited, and never
  staged `.avoozl/`. **Limit:** Avoozl's own `process` executor (47.4) is not built,
  and the tick does not yet call the journal, working-head or landing-train
  modules. So the script drives those modules directly, the way a driver would,
  against the live repositories.
- Digests:

  | Item | Digest |
  |---|---|
  | `p66-alpha` revision | `c842598637d5a38a…` |
  | `p66-beta` revision | `00719c89a9181ea8…` |
  | `t1` definition | `fcf79be03f6d650b…` |
  | `t2` definition | `2886df7d19ff8b60…` |
  | `t3` definition | `525d0af48535d3b5…` |
  | `x1` definition | `10af0d1545e66977…` |

## Results

| Step | Observed | Verdict |
|---|---|---|
| Unfinished checkpoint | The `t1` worker ran 20 s and changed only its declared paths. Commit `0b0d6b53` was pushed to `avoozl/p66-alpha/task/t1` and journaled. Integrating it without evidence was refused. `releases()` returned false. Frontier: only `t1` | Pass |
| Verify and integrate `t1` | `npm test` exited 0 at `0b0d6b53`. The working branch moved to `6ee25e6a`, pushed with a checkpoint record. Frontier: `t2` dispatchable; `x1` held: "Waits for t1 to land" | Pass |
| Branch marks | Ticking `t1` on `avoozl/p66-alpha/marks` left the revision hash unchanged. `t1` stayed `open`, and `x1` stayed held | Pass |
| Journal retry | A second write of the same operation returned the existing record. A duplicated comment (a lost-response retry) left 1 effective record, and the journal was not held | Pass |
| Mutate / delete | Editing a linked record held journal #4 (`mutated`). Deleting one held journal #5 (`missing`). Take over on a held journal was refused | Pass |
| Restore journal consistency | **Not run.** No code or design path lifts a held journal: an edited comment stays edited, and a deleted one leaves `missing` | **Blocked** |
| Land `t1` (queue, direct) | Candidate `6c51f055` landed on `main` with its trailer. The outcome is `landed` with check evidence, and `t1` is complete. Frontier: `x1` released | Pass |
| `t2` from the working head | Prepare and the spec base agreed on `avoozl/p66-alpha/work`. The worker ran 19 s. Checks passed and the head moved to `27769449` | Pass |
| Rebuild after the database is discarded | A copy of the database was made and deleted, and the rebuild used a fresh clone plus the journal. Result held: `t1` complete, `t2` and `t3` open, both heads `exact`, spend `unknown` (not zero). Resume without accepting unknown spend was refused. The person's Resume then lifted the hold | Pass |
| Pause before the guarded push | Driver gen 1 wrote and read back its intent for `t2`, then paused before the push (15:11:50Z). The owner took over (gen 2, intent outstanding) and the old driver resumed at 15:11:52Z. Its guarded fast-forward landed `19d86c56` but recorded nothing (`landed-unrecorded`, displaced). The old driver's new work and new landing were refused (`displaced`). The scheduler with the old driver id held the spec (`displaced`). The new driver's reconcile wrote one outcome, and a second reconcile wrote nothing. `t2` has 1 effective outcome and 0 intents are outstanding | Pass |
| Stale / copied trailers | A person's commit `f121c79f` on `main` carried `t3`'s current trailer and a stale one. Both were `landed-unverified` (`no-evidence`, `stale-definition`), and `t3` stayed `open` | Pass |
| Cross-spec `x1` | It ran only after `t1` landed. The worker ran 21 s and checks passed on `avoozl/p66-beta/work` | Pass |
| Hold, no commit | A hold control: refresh saw `controls` and `journal` change with the plans head unchanged. `revalidate` gave `stopped`, and the scheduler held the spec as `stopped` | Pass |
| Reassignment, no commit | Unassigning the spec and the epic: refresh saw `owner` change, and `revalidate` gave `no-assignee`. Reassigning restored it | Pass |
| Issue-binding retirement | A second scratch workspace had legacy task issues #6 and #7. The preview listed both with no readiness change. The verify tick passed, with 0 task-issue calls and the ready set unchanged (`ra`, `rb`). The close (as `completed`) released no successor: `ra-next` stayed not ready | Pass |
| Canaries | A made-up internal domain and a made-up hostname in code, a home path and an IP in commit messages, a hostname in a ref name, and a hostname as a journal alias: each was refused before publication, by rule. None reached the remote or the journal | Pass |

GitHub calls, all on the planning repository:

| Call | Count |
|---|---|
| `GET issues/N/comments` | 73 |
| `GET collaborators/…/permission` | 55 |
| `GET issues/N` | 24 |
| `POST issues/N/comments` | 20 |
| `POST issues` | 5 |
| `POST /graphql` | 6 |
| Other | 16 |

The code repository was reached only over git. Every journal replay reads every
comment page and each author's permission again. There is no cache yet (56.6
reads conditionally only in `refreshSpec`).

## What blocks the pass

§4.32.4 says a changed or missing record makes the affected state unresolved and
held. `replayJournal` holds the whole journal, and nothing releases it. A person
cannot restore consistency. Re-editing a comment keeps it edited, and a deleted
comment cannot come back. The next step is for the owner to decide how a person
reconciles a held journal. For example, a person-only record that names the held
records and the reviewed tail digest, after which replay continues. That needs a
spec change and a small build, then this proof runs again.

## Next decision

Specify and build journal reconciliation, then rerun P66. Until then, don't rely on
validated journal recovery for the private pilot when a journal record has been
edited or deleted.
