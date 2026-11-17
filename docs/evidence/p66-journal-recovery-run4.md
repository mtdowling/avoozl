# Proof P66: journal, working-head recovery and takeover (run 4)

Date: 2026-11-17. Requirement: R102 (design §4.32). Result: **PASS**, with the
limit below. This run follows `p66-journal-recovery.md`. Run 3 could not restore
a held journal. Task 56.15 (PR #419) added the person's reanchor, and run 4
exercises every prescribed action.

## Setup

- Code: main at `6b340b61`, which includes #403, #406, the spec #417 and the build
  #419. Script: `scripts/proof-p66-live.mjs`. The run did everything in one pass,
  then `--only reanchor` added the reanchor step.
- Private scratch repositories: code `mtdowling/avoozl-scratch-p66d` and planning
  `mtdowling/avoozl-scratch-p66d-plans`. The workspaces were disposable, under
  `/private/tmp`. A fetch guard refused any GitHub request outside those two
  repositories. No real workspace, Nupp repository or private pilot was touched.
- Issues: epic #1, spec `p66-alpha` #2 and spec `p66-beta` #3 (sub-issues of #1),
  and throwaway journals #4 and #5. The reanchor specs `p66-edit` #9 and
  `p66-gone` #10 were published by `spec.publish`. #8 was left by an aborted
  first reanchor attempt, which had no assignee.
- Chain: `t1 -> t2 -> t3` in `p66-alpha`; `x1` in `p66-beta` requires `t1`.
  Landing was `direct` on `main`; the check was `npm test`.
- Digests: `p66-alpha` revision `c842598637d5a38a…`, `p66-beta` `00719c89a9181ea8…`.
  Definitions: `t1` `fcf79be03f6d650b…`, `t2` `2886df7d19ff8b60…`, `t3`
  `525d0af48535d3b5…`, `x1` `10af0d1545e66977…`.

**Limit.** The worker is Claude Code 2.1.326 (`claude -p`, tools `Read`, `Write`
and `Edit`, `--permission-mode acceptEdits`, no skip flags). It ran in each task's
worktree, and Avoozl's code committed after it exited. Avoozl's own `process`
executor (47.4) is not built yet, and the tick does not yet call the journal,
working-head or landing-train modules. So the script drives those modules as a
driver would. Publish, take over, reanchor and resume for the reanchor specs went
through `Operations.execute` with no caller, the same path the local CLI uses. They
ran with the owner's `gh` login, as on P66's other person steps. The same calls
from an MCP caller were refused.

## Results

| Step | Observed | Verdict |
|---|---|---|
| Unfinished checkpoint | The `t1` worker ran 12 s, inside its declared paths. Commit `8509c281` was pushed to `avoozl/p66-alpha/task/t1` and journaled. Integration without evidence was refused, and nothing was released | Pass |
| Verify and integrate `t1` | `npm test` exited 0. The working head is `0f69d80b`. `t2` is dispatchable; `x1` is held ("Waits for t1 to land") | Pass |
| Branch marks | The tick on `avoozl/p66-alpha/marks` left the revision unchanged. `t1` stayed `open` and `x1` stayed held | Pass |
| Journal retry | The same operation twice gave one record. A duplicated comment gave 1 effective record, and the journal was not held | Pass |
| Mutate / delete | An edit held journal #4 (`mutated` ×2). A deletion held #5 (`missing`). Take over on a held journal was refused | Pass |
| **Restore journal consistency** | Specs #9 (edited record) and #10 (deleted record). An MCP caller was refused ("Only a person reanchors a spec journal"). The preview wrote nothing and showed the journal not held. A stale tail was refused ("last record is …, review it again"). The person's reanchor held 2 IDs on #9 and 1 on #10: the journal was not held, and the spec stayed `stopped` until Resume, then cleared. The damaged comments stayed as they were: the edited one is still edited, and the deleted one is still gone. Each journal gained 3 comments (reanchor, hold, release) | Pass |
| Land `t1` (queue, direct) | `755a8857` landed with its trailer and check evidence. `t1` is complete, and `x1` was released | Pass |
| `t2` from the working head | Prepare agreed on `avoozl/p66-alpha/work`. The worker ran 19 s, checks passed, head `648a60cb` | Pass |
| Rebuild after the database is discarded | Held: `t1` complete, `t2` and `t3` open, heads `exact`, spend `unknown` (not zero). Resume without accepting unknown spend was refused; the person's Resume lifted the hold | Pass |
| Pause before the guarded push | Gen 1 wrote and read back its `t2` intent and paused (16:18:23.786Z). The owner took over (gen 2, intent outstanding), and the old driver resumed at 16:18:25.933Z. It pushed `efe38ef0` but recorded nothing (`landed-unrecorded`). Its new work and new landing were refused (`displaced`), and the scheduler held the spec (`displaced`). The new driver's reconcile wrote 1 outcome; a second reconcile wrote none. 0 intents are outstanding | Pass |
| Stale / copied trailers | A person's commit `699b075b` with a copied `t3` trailer and a stale one: both `landed-unverified`, and `t3` stayed `open` | Pass |
| Cross-spec `x1` | Ran only after `t1` landed (16 s). Checks passed, head `93e2a6d4` | Pass |
| Hold, no commit | Refresh saw `controls` and `journal` change, with the plans head unchanged. `revalidate` and the scheduler both gave `stopped` | Pass |
| Reassignment, no commit | Unassigning gave `owner` changed and `no-assignee`; reassigning restored it | Pass |
| Issue-binding retirement | Legacy issues #6 and #7: no readiness change, the verify tick passed with 0 task-issue calls, the ready set was unchanged, and the close released no successor | Pass |
| Canaries | A made-up internal domain and hostname in code, a home path and an IP in commit messages, a hostname in a ref name, and a hostname as a journal alias: all refused before publication, and none reached the remote or the journal | Pass |

None of the failure conditions appeared: no unchecked or stale completion, no
double dispatch after take over, no lost hold, no reset of spend, no task-issue
side effects, and no leak.

## GitHub calls

All on the planning repository. These include one aborted reanchor attempt.

| Call | Count |
|---|---|
| `GET issues/N/comments` | 92 |
| `GET collaborators/…/permission` | 69 |
| `POST issues/N/comments` | 34 |
| `GET issues/N` | 31 |
| `GET` repository | 16 |
| `POST issues` | 8 |
| Other | 31 |

Every replay rereads all comments and each author's permission; there is no cache
yet.

## Next decision

Validated journal recovery may be used for the private pilot. Wiring the tick to
the working-branch modules and building the `process` executor (47.4) remain
before an unattended run.
