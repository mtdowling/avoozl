# Proof P19: single-repo mode end to end

Date: 2026-11-12. Requirements: R28.9, R16, R31.1. Result: **PASS** on the
retry, after one repair.

## Setup

- Test repo: public `mtdowling/avoozl-e2e-single-20261112` (README, test files,
  and the Kiro spec `.kiro/specs/p19-single-repo/`). Default branch `main`, no
  required checks.
- Avoozl ran from `kirocrew-native` at `40b432a` in the isolated workspace
  `$TMPDIR/kc-p19/ws2` (single-repo mode, `baseBranch: main`,
  `coder: worker`, managed labels `p19-managed` and `p19-ready`,
  `delivery: {runner: "tick"}`).
- Spec: epic 1 with chain 1.1 -> 1.2 -> 1.3. Projection made epic #7 and
  leaves #8, #9, #10, with blocked-by links. Only #8 was ready.
- No Issue Radar crew was set up, so the proof driver played the Issue Radar
  crew for leaf 1.1. The driver also played the Avoozl worker for 1.2 and
  followed the dispatched brief step by step.

## Steps and observations

| Step | Observed |
|---|---|
| 1.1, Issue Radar way | PR #11 from `issue-radar/8`, body `Closes #8`, merged as `ca52241`. GitHub closed #8; its `ClosedEvent.closer` is PR #11. |
| Tick after #11 | 1.1 `githubVerdict.state = verified` (PR #11), task accepted. Same tick moved `p19-ready` to #9, made linked branch `avoozl/p19-single-repo.1.2`, and dispatched the worker brief. |
| 1.2, Avoozl worker | Commit `00d8e37` on the linked branch. PR #12, body from acceptance only, no closing keyword. Squash auto-merge, merged as `ad52aca`. GitHub closed #9; its `ClosedEvent.closer` is PR #12 (linked-branch close). |
| Tick after #12 | 1.2 `githubVerdict.state = verified` (PR #12), task accepted. Dependent 1.3 released: `p19-ready` on #10 and its worker dispatched. |
| Avoozl closes neither | Both closed events name a pull request as closer. Avoozl wrote no close. |
| Policy edit `baseBranch: develop` | `github.settings.validate` returned `valid: false`; `github.settings.update` was refused with 409. Message: `.avoozl.json github.repositories.mtdowling/avoozl-e2e-single-20261112.baseBranch is develop, but the default branch of mtdowling/avoozl-e2e-single-20261112 is main.` The saved file still has `baseBranch: main`. |

## Run 1 failure and repair

Run 1 (workspace `$TMPDIR/kc-p19/ws`, issues #2-#5, PR #6) failed:

1. Validation accepted `baseBranch: develop` and saved it.
2. After #3 closed and 1.1 was verified, 1.2 never became ready. The tick
   never re-projected, so `p19-ready` and dispatch readiness stayed on the
   closed leaf.
3. Single-repo worker leaves had no linked-branch delivery path from the tick.

Repair `40b432a` (one commit, with `src/app/test/single-repo-delivery.test.mjs`):
the tick re-projects approved plans so readiness and ready labels move,
single-repo worker leaves get a linked branch and brief, and Settings checks
`baseBranch` against the repository's default branch. `npm test` passed 810 of
810 and `git diff --check` was clean.

## Cleanup

Test issues left open (#2, #4, #5, #7, #10) were closed after this receipt.
Delete the test repo with:

```
gh repo delete mtdowling/avoozl-e2e-single-20261112 --yes
```
