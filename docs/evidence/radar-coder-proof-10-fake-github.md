# Proof rc-p10 on a fake GitHub: a public repository

Run on fake GitHub; live run pending owner. Test:
`src/app/test/proof-rc-p10.test.mjs`. Spec: `.kiro/specs/radar-coder/`, task
`rc-p10`, requirement RC10, design D12 and D17.

## Setup

- A temporary workspace with a fake GitHub, one `issue-radar` repository and
  two approved leaf tasks. Release capacity is 2.
- The stored visibility is set to public, then to unread, then to public with
  an incomplete sign-off, then to public with a complete sign-off.

## Action

Tick the projection twice for each hold state, read the release queue, count
the ready-label writes. Then record a complete sign-off and tick again.

## Observation

| State | Ready label written | Release queue reason |
| --- | --- | --- |
| public, no sign-off | none | the public-hold sentence, on both rows |
| visibility not read | none | the same sentence |
| public, sign-off incomplete | none | held |
| public, sign-off complete | 2 | released up to capacity |

## Verdict

Pass on the fake: nothing releases before the sign-off, and the queue says why.

Limit found, now fixed: nothing in the app wrote the sign-off. The owner-only
operation `radar.signoff` ({repository, complete}) now writes the workspace key
`publicSignoff` that `publicHold` reads (`src/app/test/proof-rc-p10.test.mjs`
covers the write, the refusal for app tokens, and the release after it). The
"after" half can now run live from the app.

## Live run for the owner (not done)

1. Make a scratch public repository with an approved spec and two projected
   tasks. Register it with the Radar coder.
2. Turn release on with N=2 and wait for a tick.
3. Expect no ready label on any task, and the release queue showing the
   public-hold sentence.
4. If a crew could be handed work, the proof fails: refuse public repositories
   for the Radar path.
5. Record the sign-off with the app operation `radar.signoff` (complete true),
   tick again and expect two ready labels.
6. Record the result in `docs/evidence/` and tick `rc-p10`.
