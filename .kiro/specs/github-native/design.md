# Design: GitHub-native Avoozl

`GN` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`; `WP` numbers are in
`.kiro/specs/worker-paths/`. Labels are as in the requirements: **V** read
in the file cited at `a8a22391`, **A** assumed.

## D1. What goes with worker machines

One Avoozl drives a spec, on one machine. A person who wants more agents at
once runs more drivers (one per spec) or takes tasks by hand from their own
agent tool. Avoozl gives that tool `avoozl take` and `avoozl runner report`
and nothing more.

| Part                                         | Where today (V)                                | After      |
| -------------------------------------------- | ---------------------------------------------- | ---------- |
| Offers in the spec journal                   | `src/app/workers/worker-offers.mjs`, `worker-offer-step.mjs` | gone |
| Claim refs, acknowledgments, generations of a claim | `src/app/workers/worker-grants.mjs`     | gone       |
| Grant branches `avoozl/<spec>/grant/<task>`  | `grantBranch`, `worker-grants.mjs:44`          | gone       |
| Driver's check of a pushed result            | `worker-result-step.mjs`, `worker-results.mjs` | gone       |
| Claim release and stale claims               | `worker-release.mjs`                           | gone       |
| Worker setup preview                         | `worker-setup.mjs`                             | gone       |
| Worker side of `runner status`, the envelope | `remote-runner.mjs`                            | gone; `runner report` moves to `report-command.mjs` |
| `worker` and `spec offer`/`spec grants` commands | `commands/machine.mjs:436`, `commands/setup.mjs:296` | gone |
| `worker.*`, `spec.offer`, `spec.grants*`, `remote.view` | `ops/delivery.mjs`, `ops/specs.mjs`  | gone       |
| Page worker link and worker fields           | `kirocrew-app/ui/src/WorkerLink.tsx` and its callers | gone |
| Driver, generations of a driver, hand-off    | `driver.mjs`, `driver-generations.mjs`, `driver-scope.mjs` | stay |
| Manual take, report command, report match    | `manual-take.mjs`, `report-command.mjs`, `report-match.mjs` | stay |
| Spec working heads                           | `working-heads.mjs`                            | stay       |

The generation number stays: it still orders driver hand-offs (R102.13).
Only the claim half goes. Which of `remote-runner.mjs`'s functions a
remaining caller uses was not traced line by line (A: the list above comes
from the import graph of `src/app`); task `gn-1.1` traces it and moves what
stays.

Journal replay ignores the removed record kinds (GN1.5). A spec that has
old offers on its journal reads as if they were never written.

## D2. Flow and rebuild from plain git

A landing is found by its tick. On each fetch of the specs branch, Avoozl
already reads which boxes changed (R113, §4.41). That reader records, for
each newly ticked task: the commit SHA, committer time, author, and, when
GitHub reports a pull request for the commit, its number. This is a read
Avoozl already makes on the tick (A: §4.41 reads the commit; the pull
request number comes from the pull request Avoozl merged, and on rebuild
from one `commits/{sha}/pulls` read per landing, paced).

What Flow keeps and loses after `avoozl rebuild`:

| Flow fact                         | Before (trailer)    | After, on the machine that ran it | After a rebuild |
| --------------------------------- | ------------------- | --------------------------------- | --------------- |
| Which task landed, and when       | `Avoozl-Task`       | tick commit                       | tick commit     |
| Who landed it, which pull request | commit author       | same                              | same            |
| Lead time from approval           | not kept            | approval commit to tick commit    | same            |
| Start time, work time             | `Avoozl-Started`    | database                          | not known       |
| Tries                             | `Avoozl-Tries`      | database                          | not known       |
| Harness and model                 | `Avoozl-Harness`, `Avoozl-Model` | database             | not known       |
| Credits                           | `Avoozl-Cost`       | database                          | not known       |
| Stage spans (wait, work, review, land) | `Avoozl-Span`  | database                          | not known       |

So Flow loses, after a rebuild only: cycle time (start to land), tries,
harness and model mix, per-task credits and the stage breakdown. Lead time
is new and survives. On the machine that ran the work nothing changes until
its database is deleted.

The landing commit message (GN2.2) is the task title and summary. A batch
writes one subject per task. Nothing in it is read back.

## D3. Publishing on approval

```text
approver merges spec PR (or pushes a commit)
  -> tick on the approving author's workspace adopts approval (R114.13)
  -> look up spec issue by marker; none
  -> create spec issue (+ epic issue if none), read markers back
  -> two open with one marker? close the newer one (its maker)
  -> copy the spec PR's assignees onto both; none? leave unassigned
  -> every instance: drive only if spec issue and epic issue name my login
```

Only the approving author's workspace publishes (GN3.2), so a second
machine of another person never races. One person with two machines can
race; the marker read-back of GN3.3 settles it with no person. Publishing
does not decide who drives: the assignees do (GN3.5). An unassigned spec
shows "Unassigned" and waits, with no Needs you row (GN3.6).

The GitHub writes per approval: one create per issue, one sub-issue link,
and one assignee write per issue when the spec PR had assignees. All go
through the write pacer and are low-risk jobs.

## D4. Approval paths

| Path                                         | Today (V)                       | After                 |
| -------------------------------------------- | ------------------------------- | --------------------- |
| Approver merges a spec PR                    | approves on the tick (R114.13)  | the one path          |
| Approver pushes a commit to the specs branch | approves on the tick (R114.13)  | stays; it is git      |
| **Approve revision**, GitHub workspace       | commits as the person, pushes   | gone (GN4.3)          |
| **Approve revision**, local-only             | commits as the person           | stays (GN4.5)         |
| Approval delegation                          | operations and `--delegate`     | gone (also in `spec/approval-cutdown`) |
| `plan approve`, batch approval               | operations                      | gone                  |

A pushed approver commit stays because it is a git fact and the
repository's branch rules decide who may push. Avoozl adds no rule there.

## D5. Where review output goes

The rule is one sentence: post on the task's pull request if it has one,
else on the spec issue.

| Landing mode | Before a PR exists                           | Once the PR exists                          |
| ------------ | -------------------------------------------- | ------------------------------------------- |
| `pr`         | investigate findings and falsifier verdict: spec issue comment | review with line comments; checks in the check run |
| `direct`     | every round: one spec issue comment          | (no PR)                                     |
| `off`        | every round: one spec issue comment          | (no PR)                                     |

For `direct` the owner asked for a choice and a recommendation.

**Recommended: a comment on the spec issue, one per round.** Reasons:

1. The candidate commit is not on GitHub before it lands, so a commit
   comment has nothing to attach to until it is too late to matter.
2. The spec issue is where people watching the spec already get notified.
3. It keeps `direct` meaning "no pull request", which is why a person
   picks it.
4. One write per round, the same cost as the pull request review.

Not chosen: opening a pull request anyway in `direct` mode. It gives line
threads, but it turns `direct` into `pr` with a different name, adds a
create and a close per task, and makes main wait on GitHub's merge. A
person who wants line threads sets `landing: pr`.

Each comment starts with a hidden marker
`<!-- avoozl:review task=<id> round=<n> -->` so rebuild can find it. The
marker carries IDs only (R102.11).

A finding's decision (GN5.6) on a pull request uses GitHub's own thread
resolve. On a spec issue comment there are no threads, so a reply from an
approver that starts with `accept`, `reject` or `defer` and quotes the
finding's number is the decision. The page's buttons post that same reply.

## D6. The epic owner

The epic issue's assignee is read with the spec issues on the same
conditional read (A: the driver already reads the epic issue, V:
`src/app/workers/driver.mjs:286`, for the stand-in that GN6.3 removes).
Closing the epic needs no new read: each member spec issue's close is
Avoozl's own write, so the workspace that closes the last one knows.
Reopening on a new member spec happens in the publish of D3.

## D7. Acts that still need Avoozl

| Act                         | Today                | GitHub instead                    | Recommendation |
| --------------------------- | -------------------- | --------------------------------- | -------------- |
| Take over a spec            | page, CLI            | assign yourself on the spec issue | **GitHub**; the page button assigns |
| Release a spec              | page, CLI            | unassign yourself                 | **GitHub**     |
| Hand off a spec             | page, CLI            | none: it writes an export and drains chats | stays Avoozl |
| Stop the line for a spec or epic | page, CLI, MCP (stop only) | add `avoozl:stopped` label | **GitHub** |
| Resume                      | page, CLI (person)   | remove the label (approver only)  | **GitHub**     |
| Stop all agents on this machine | page, CLI (person) | none: it is about one machine   | stays Avoozl   |
| Start a ready task now      | page, CLI (`task.start`) | none worth it                 | stays Avoozl   |
| Finding decision            | page buttons         | resolve thread, or a reply        | **GitHub** (GN5.6) |
| Investigate: Go ahead, Investigate again, Stop | page | an approver's reply on the findings comment (GN7.6) | **GitHub**; the page buttons post the reply |
| Reopen or Keep done (tick removed) | Needs you     | none: it is a local mismatch      | stays Avoozl   |
| Retry a failed delivery     | page, CLI            | none                              | stays Avoozl   |
| `landing: off`, land the verified commit | Needs you | none                         | stays Avoozl   |
| Approve                     | page, CLI            | merge the spec PR (GN4)           | **GitHub**     |
| Reject a spec PR            | page                 | close the PR                      | **GitHub**     |

Investigate's Go ahead starts an agent, so the tick checks who wrote the
reply on every read, the same check GN7.3 makes for a label. Only an
approver's reply counts, and only for its own round.

## D8. Order with other branches

This spec's tasks start after `spec/spec-assignee`, `spec/drop-mirror` and
`spec/approval-cutdown` land, because `gn-3.1`, `gn-4.1` and `gn-6.1` edit
the same code. The spec edits of GN8 for those branches are made in
`gn-7.1`, against whatever landed.

## D9. Decisions

These rules settle the design's open questions.

1. Nobody drives a spec by default. An instance drives a spec only when the
   spec issue and every other issue tied to it (its epic issue) name this
   instance's GitHub login (GN3.5). A new spec issue copies the spec PR's
   assignees, or stays unassigned and shows "Unassigned" with no Needs you
   row (GN3.4, GN3.6).
2. A pushed approver commit with no pull request still counts (D4).
3. Investigate's Go ahead, Investigate again and Stop are also an
   approver's reply on GitHub (GN7.6).
4. Retro files hold no per-task credits (GN2.6).

## D10. Spec folder format

The owner cut the spec format on 2026-11-19. The code is built separately
on `spec/cut-facts` (the facts) and in the `specs.path` work (where specs
live); this section only records the format they build, so that the rest
of this spec and `docs/github-workflow.md` agree with it.

**Where specs live.** A repository's `specs.path` names the folder that
holds its specs, default `.kiro/specs`. Each subfolder is one spec. Only
`tasks.md` is required. Every other `.md` file in the folder is spec text:
read, hashed and shown, never parsed for tasks.

**Task facts.** A fact is a `$name: value` sub-bullet under a task.

| Fact           | Meaning                                                  | Required |
| -------------- | -------------------------------------------------------- | -------- |
| `$after`       | Task IDs that must be ticked first                       | no       |
| `$manual`      | `true`: only a person does it and ticks it               | no       |
| `$repo`        | The one repository the task changes                      | when the workspace has several |
| `$done`        | One checkable result; repeat for more                    | yes, on a leaf |
| `$plan`        | Epic folder only: a member spec's folder name            | yes, on an epic item |
| `$step`        | Epic folder only: `design`, `review` or `implement`      | no       |
| `$paths`       | Files the task changes                                   | no       |
| `$investigate` | `true` or `false`: write findings before coding          | no       |
| `$type`        | One lowercase word, such as `fix`                        | no       |

A plain sub-bullet (no `$`) under a leaf also counts as one `$done`
result.

**Read from the layout.** A task with sub-items is a package, done when
its sub-items are. A task takes its phase from the `##` heading above it.
An agent groups its own work inside a task. Lint refuses any fact not in
the table above.

**Front matter.** `kind`, `epic`, `category`, `integrationBranch`,
`integrationSync` and `repo`. `kind: epic` marks an epic folder.

This spec's own `tasks.md` uses only the kept facts.
