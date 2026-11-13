# Proofs P12 and P13 (single-repo half): Issue Radar run and auto-merge

Date: 2026-11-12. Requirements: R17, R27.4 (P12), R18 (P13). Result:
**P12 PASS** and **P13 single-repo half PASS**, on the retry after one repair.

## Setup

- Test repo: private `mtdowling/avoozl-e2e-radar-20261112`, default branch
  `main`. Auto-merge allowed. Ruleset 27124571 ("main requires test") requires
  the GitHub Actions check `test` (`node --test`).
- Avoozl ran from `kirocrew-native` at `cc6c15f` in the isolated workspace
  `$TMPDIR/kc-p12/run2` (namespace `avz_6wn34o4oaasvailn`). Policy:
  single-repo mode, `coder: issue-radar`, `requiredChecks: ["test"]`,
  managed labels `p12-managed`, `p12-ready`, `p12-decision`, and one rule
  `deliver` on label `p12-deliver` with `autoPublishChildren: true`, allowed
  actor `mtdowling`.
- Source issue #2 ("Config library: parse, validate, format"), labeled
  `p12-deliver` by `mtdowling`.
- Each step was one call of the proof driver `$TMPDIR/kc-p12/driver.mjs`
  (`workspace.tick` with no sessions). Raw output is in
  `$TMPDIR/kc-p12/out/run2/`.

Two roles were played by the proof driver, not by live Kiro Crew sessions:

- **Issue Radar crew.** A crew cannot be created from a chat (the scope API
  is owner-only, and computer use refuses to drive the Kiro Crew window).
  `$TMPDIR/kc-p12/crew.sh` did what Issue Radar does for one ready issue:
  check the ready label, add the claim label `crew: in progress`, branch
  `issue-radar/N` from `origin/main`, commit, open a PR whose body is
  `Closes #N`, and turn on squash auto-merge.
- **Planner.** The tick does not open a planner session for a matched
  deliver issue (the respond path does open a responder). The driver made the
  calls the `avoozl` skill gives the planner: `plans_classify_issue` (broad),
  the spec folder `.kiro/specs/p12-config-library/` in the project clone, a
  draft (`plans_draft_children`), and a critique with no findings.

## Steps and observations

| Step | Observed |
|---|---|
| Tick 1 | Intake matched #2 for `mtdowling`: task `dispatch.state = authorized`. Nothing written to GitHub. |
| Planner | Classified broad. Spec: epic 1 (the source issue) with leaves 1.1 parse, 1.2 validate (requires 1.1), 1.3 format. Draft lint clean (one warning: the epic title matches the source task, which is the source issue itself). |
| Tick 2 | Published with no preview comment: #3 (1.1), #4 (1.2), #5 (1.3) as sub-issues of #2. #4 blocked by #3. `p12-ready` on #3 and #5 only; none on #2 or #4. |
| Crew on #3 and #5 | PR #6 (`Closes #3`) and PR #7 (`Closes #5`), squash auto-merge on. Both merged by auto-merge after `test` passed (#7 at 14:56:35Z, #6 at 14:56:44Z). GitHub closed #3 and #5; each `ClosedEvent.closer` is the PR (#6 merge `f1cdc4e`, #7 merge `c5dabdd`). |
| Tick 3 | 1.1 and 1.3 `githubVerdict.state = verified` (PR, head SHA, check `test` success), tasks accepted. Same tick re-projected the plan and added `p12-ready` to #4. |
| Crew on #4 | PR #8 (`Closes #4`), merged by auto-merge at 14:59:05Z after `test` passed. Closer of #4 is PR #8 (merge `a5443e3`). |
| Tick 4 | 1.2 verified (PR #8) and accepted. Parent #2 closed as completed (no closer PR: Avoozl closed the parent after its last child). |
| Tick 5 | No change. |
| Avoozl never writes the PR | PRs #6-#8 were opened, and auto-merge turned on, by the crew script only. They have no comments. Avoozl's only pull-request write (`createPullRequest`) is the workspace-repository sync, which this workspace does not configure. |

## Run 1 failure and repair

Run 1 (workspace `$TMPDIR/kc-p12/ws`, source #2) failed: ticks read
nothing. The tick ran no issue intake, no broad-issue breakdown advance and no
re-projection, so a labeled issue was never taken in and ready labels could
not move without a manual `github sync` or `github project` call.

P19's repair `40b432a` already made the tick re-project plans whose readiness
changed. This proof's repair `cc6c15f` adds the rest, with a test in
`src/app/test/github-breakdown.test.mjs` that drives intake, publishing,
readiness and the parent close through ticks alone:

- The tick runs `syncGitHubIssues` when any repository has rules, then
  `advanceGitHubBreakdowns` when any issue has a breakdown, under the tick
  lock it already holds.
- Intake no longer withdraws a projected plan issue: it is authorized by its
  approved plan, not by a trigger label.

`npm test` passed 811 of 811 and `git diff --check` was clean.

## Observed outside the expectations

- The tick does not start the planner for a deliver match, so a broad issue
  waits for an Avoozl chat to run the breakdown skill. P12's "no further human
  action" holds only with that chat running.
- After #2 closed, its local epic task still reads `status: planned`.
- The crew claim label stays on closed issues because the script, unlike
  Issue Radar, does not remove it.

## Cleanup

All test issues (#2-#5) are closed. Delete the test repo with:

```
gh repo delete mtdowling/avoozl-e2e-radar-20261112 --yes
```
