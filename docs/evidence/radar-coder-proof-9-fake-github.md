# Proof rc-p9 on a fake GitHub: Make tests faster

Run on fake GitHub; live run pending owner. Test:
`src/app/test/proof-rc-p9.test.mjs`. Spec: `.kiro/specs/radar-coder/`, task
`rc-p9`, requirement RC9, design D11 and D17.

## Setup

- A temporary workspace, a temporary git checkout and a fake GitHub that
  records branches, files and pull requests. The planner is a fake that returns
  two proposals in turn. No real planner chat, no real crew.
- First proposal: two tasks with measured evidence (41.5 s and 12 s,
  `npm test`) and one edge. Second proposal: one task that changes a public
  interface.

## Action

1. `quickgoal.propose` "Make tests faster" at depth Measure.
2. `quickgoal.approve`, merge the fake approval pull request, `quickgoal.approve`
   again.
3. Project the plan to issues. Run the crew check (`verifyIssue`, the check a
   crew runs before it builds) on each leaf issue.
4. `quickgoal.propose` a second goal. Try Approve, then Promote.

## Observation

| Step | Result |
| --- | --- |
| Propose | status `proposed`, no promote rule, no pull request, no plan written |
| Approve | one pull request; after the merge status `approved`; still one pull request |
| Mini-spec | holds the measured evidence line and the goal text |
| Projection | 2 leaf issues, each with the measured evidence; both pass the crew check and return a brief |
| Second goal | promote rule `public-interface`; Approve refused with "Promote this goal"; no second pull request; Promote writes the spec folder and a draft plan |

## Verdict

Pass on the fake. The proof's Failure line (a crew skipped a mini-spec issue,
Q6) cannot be tested here, because no crew runs. That is the live part.

## Live run for the owner (not done)

1. Make a scratch repository with a slow test suite and a crew on `avoozl-crew`.
2. In Avoozl open Quick goal, enter "Make tests faster", choose Measure, and
   propose.
3. Check that each task shows a measured time. Press Approve once and merge the
   approval pull request.
4. Let the crew build the issues.
5. Open a second quick goal that changes a public interface. Expect Promote, not
   Approve.
6. If a crew skipped a mini-spec issue, the proof fails (Q6): use Promote for
   every goal.
7. Record the result in `docs/evidence/` and tick `rc-p9`.
