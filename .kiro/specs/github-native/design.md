# Design: GitHub-native Avoozl

`GN` numbers are in this spec's `requirements.md`. Rule numbers are workflow
v1's (`docs/github-workflow.md`).

## D1. Claim branches

Workflow v1's claim branches and leases (section 15) are how several runners
share a spec. `avoozl runner report` (`src/app/workers/report-command.ts`)
records a report from a manual take (`src/app/workers/manual-take.ts`) or a
local session.

## D2. Landing from the tick

A landing commit's message is the task's subject, or a batch's list of
subjects, with no trailer (`src/app/landing/merge-batch.ts`,
`src/app/landing/landing-pulls.ts`). `avoozl rebuild` runs
`Operations.readFromGit`, whose `applyBaseTicks` takes each ticked task's
tick commit as its landing commit. Start times, tries, models and telemetry
spans stay only in the database that recorded them.

## D3. Publishing on approval

```text
approver merges a spec PR, pushes a commit, or presses Approve
  -> tick adopts the approval (adoptCommitted), or plan.approve makes it
  -> queuePublish: plan ID -> approval commit, in meta publish.pending
next workspace.tick, after applyMainApprovals
  -> publishApproved
       spec issue already held? drop it
       read open issues for the marker (readSpecIssues)
       approver login != this runner's login? drop it
       publishSpec with the approving pull request's assignees
       failed? keep it queued, name it in the tick's failure notices
```

The approver's login comes from the approval evidence cache
(`evidenceCache`, `.avoozl/approval-evidence.json`): `mergedBy`, `signer` or
`pushedBy`, else the noreply address of the approving email, else one
`GET /repos/{o}/{r}/commits/{sha}` for the author's login. The evidence read
keeps the approving pull request's number as `pull`, so its assignees cost
one pull request read. The create goes through the `spec-issues` job.

Only approvals adopted or made in this workspace are queued, so a rebuild
(`readFromGit`, which calls `adoptApprovals` directly) publishes nothing.

## D4. Where review output goes

`postReviewOutput` (`src/app/delivery/review-output.ts`) runs on each tick
with GitHub, under the `review-output` job:

| Source | Due when | Comment |
| --- | --- | --- |
| A review role's `done` report (`session_bindings.report.review`) | reported after the first pass | verdict, the reviewer's text, one line per finding |
| A finished `check-run` flow record with a failing check | ended after the first pass | each failing check's command, exit code or not-run reason, and output tail |

The target is the task's pull request (`taskLinks(...).pr`), else its spec
issue (`github-parent:plan:<plan>` receipt). With neither, the item waits.
Each comment starts with `<!-- avoozl:review task=<id> round=<n>
kind=<role or checks> -->`. A `review-output:<task>:<round>:<kind>` receipt
records it as `posted`, or `held` when the content rules refuse it; either
way it is not posted again.

The first pass that finds any output stores `review-output.since` and posts
nothing, so turning this on does not post every review a workspace already
holds, and a pass with no output writes nothing.
