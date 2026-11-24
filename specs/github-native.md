---
repo: avoozl
category: Planning
---

# GitHub-native Avoozl

## Requirements

### Introduction

Avoozl keeps its records where git and GitHub already have a normal way to
hold them. `docs/github-workflow.md` (workflow v1) is the contract; this
spec covers runner sharing, landing commits, spec issues and review output.

| #   | Rule                                                                         | Requirement |
| --- | ---------------------------------------------------------------------------- | ----------- |
| 1   | Runners share a spec through claim branches and leases                       | GN1         |
| 2   | No `Avoozl-*` trailers on landing commits. Rebuild reads the tick           | GN2         |
| 3   | An adopted approval publishes its spec issue, with the approving pull request's assignees | GN3 |
| 4   | Review rounds and failing checks are comments on the pull request or spec issue | GN5      |

#### Words

| Word          | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| Approver      | The login whose evidence approves a spec commit (workflow v1 rule 7.2)     |
| Review output | A review round's verdict and findings, or a failing run of Avoozl's checks |
| Spec PR | A pull request whose changes are all under the configured specs folder |


#### Requirement GN1: Runners share a spec through claim branches

**User story:** As the owner, I want one trust boundary and one claim
protocol, so that every runner takes work the same way.

##### Acceptance criteria

1. Several runners SHALL share a spec only through workflow v1's claim
   branches and leases (section 15).
2. `avoozl runner report` SHALL record a report from a manual take and from
   a local session.

#### Requirement GN2: Landing commits carry no Avoozl trailers

**User story:** As a person reading `git log`, I want Avoozl's landing
commits to look like anyone's, so that Avoozl leaves no bookkeeping in my
history.

##### Acceptance criteria

1. Avoozl SHALL write no `Avoozl-*` line, and no other trailer, in a direct
   landing, a merge batch, a pull request's merge message or a tick commit.
2. `avoozl rebuild` SHALL find each landed task from its tick on the done
   branch, with the tick commit as its landing commit.
3. Start times, tries, harness, model and credits SHALL stay only in the
   database that recorded them.

#### Requirement GN3: An adopted approval publishes its spec issue

**User story:** As someone on the repository, I want every approved spec
to have its issue on GitHub without anyone pressing a button, so that I can
see what is planned and who runs it.

##### Acceptance criteria

1. WHEN the tick adopts an approval of a spec, or a person approves one
   with Approve, THEN the next tick SHALL publish the spec issue in the
   GitHub repository that holds the spec, if it has none (workflow v1 rule
   8.1).
2. Only the runner whose GitHub login is the approver SHALL publish: the
   login that merged the approving pull request, signed the commit, or
   pushed it from Approve, else the commit author's GitHub login. Another
   runner SHALL write nothing for it.
3. Before it creates an issue, Avoozl SHALL read the open issues for one
   that holds the spec's marker, and use it (rule 8.2).
4. The new spec issue SHALL copy the assignees of the approving pull
   request. WHEN it has none, or the approval had no pull request, THEN the
   issue SHALL stay unassigned. Avoozl SHALL NOT assign the approver or the
   publishing login.
5. A rebuild, and an approval this workspace did not adopt or make, SHALL
   publish nothing.
6. A failed publish SHALL be tried again on the next tick and named in the
   tick's failure notices. `avoozl spec publish` SHALL be a person's retry.
7. In local-only mode approval SHALL publish nothing.
8. Tests with a fake GitHub SHALL show: the merger of an approving pull
   request publishes one issue with that pull request's assignees, once; a
   pushed approval publishes an unassigned issue; another runner makes no
   issue; an existing marked issue is used; a failed publish is tried
   again; and local-only mode makes no GitHub call.

#### Requirement GN5: Review output goes where code review goes

**User story:** As a person reviewing a change, I want Avoozl's review
findings and failing checks on GitHub where I review code, so that I can
read them without Avoozl's page.

##### Acceptance criteria

1. Each review round's verdict and findings, and each run of Avoozl's own
   checks with a failing check, SHALL be posted as one comment on the
   task's pull request, or on its spec issue when the task has none
   (workflow v1 rule 19.1). Output for a task with neither SHALL wait.
2. The comment SHALL name the task and the reviewed commit, and SHALL start
   with the hidden marker `<!-- avoozl:review task=<id> round=<n>
   kind=<role or checks> -->`, which carries IDs only.
3. A failing check's part SHALL hold its command, its exit code or why it
   did not run, and its output tail as Avoozl's check run keeps it.
4. Review output SHALL be advisory: Avoozl SHALL NOT submit a GitHub
   approval or change request, and a posted finding SHALL approve nothing
   (rule 19.2).
5. Every text SHALL pass the content rules at the `github` boundary first.
   A refused text SHALL open the content rules' decision and SHALL NOT be
   posted.
6. Avoozl SHALL post each round once, through the `review-output` GitHub
   job, a low-risk job. A failed post SHALL be tried again on the next
   tick. Output that already exists when Avoozl first finds any SHALL NOT be
   posted, and a pass with no output SHALL write nothing.
7. Tests with a fake GitHub SHALL show: a review round is one spec issue
   comment, once; a task with a pull request gets it there; a failing check
   run is posted with its command and tail; refused text is held; and a
   failed post is tried again.

## Design

`GN` numbers are in [Requirements](#requirements). Rule numbers are workflow
v1's (`docs/github-workflow.md`).

### D1. Claim branches

Workflow v1's claim branches and leases (section 15) are how several runners
share a spec. `avoozl runner report` (`src/app/workers/report-command.ts`)
records a report from a manual take (`src/app/workers/manual-take.ts`) or a
local session.

### D2. Landing from the tick

A landing commit's message is the task's subject, or a batch's list of
subjects, with no trailer (`src/app/landing/merge-batch.ts`,
`src/app/landing/landing-pulls.ts`). `avoozl rebuild` runs
`Operations.readFromGit`, whose `applyBaseTicks` takes each ticked task's
tick commit as its landing commit. Start times, tries, models and telemetry
spans stay only in the database that recorded them.

### D3. Publishing on approval

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

### D4. Where review output goes

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

## Tasks

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`GN1` to `GN5`, in [Requirements](#requirements)); `D` sections
refer to [Design](#design).

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces, real git with a bare remote and a fake GitHub; Avoozl runs the
repository's checks (AGENTS.md).

### Phase 1: Claim branches

- [x] `gn-1.1` Share specs through claim branches only [GN1] (§D1)
  - Runners coordinate through claim branches and leases.
  - `runner report` records results from a manual take and a local session.

### Phase 2: No trailers

- [x] `gn-2.1` Landing commits with no trailers; rebuild reads the tick [GN2] (§D2)
  - A direct landing, a batch landing and a pull request landing write no trailer line
  - A rebuilt workspace takes each ticked task's tick commit as its landing commit

### Phase 3: Publishing on approval

- [x] `gn-3.1` Publish the spec issue of an adopted approval [GN3] (§D3)
  - With a fake GitHub: the merger of an approving pull request publishes one spec issue with that pull request's assignees, once; a pushed approval publishes it unassigned; another runner makes no issue; an open issue with the spec's marker is used; a failed publish is tried again; local-only mode makes no GitHub call
  - The tick queues each approval it adopts, and the evidence cache keeps the approving pull request's number

### Phase 4: Review output on GitHub

- [x] `gn-4.1` Post each review round on the pull request or the spec issue [GN5.1, GN5.2, GN5.4, GN5.5, GN5.6, GN5.7] (§D4)
  - With a fake GitHub: a review round is one marked spec issue comment naming the task and commit, once; a task with a pull request gets it there; text the content rules refuse is held; a failed post is tried again; output that exists before the first pass is not posted
- [x] `gn-4.2` Post failing checks the same way [GN5.3] (§D4)
  - A failing check run is one comment with each failing check's command, exit code and output tail, and no passing check

### Phase 5: Proof

- [ ] `gn-p1` Proof: a merged spec PR publishes its issue, and review output reaches GitHub [GN3, GN5] (§D3, §D4) (**MANUAL**)
  - Setup: use an isolated workspace, a scratch plans repository and two
    scratch code repositories. Set one code repository to `landing: pr`
    and the other to `landing: direct`. Use a second login that can write
    to the plans repository and cannot approve specs.
  - Action: run `scripts/proofs/gn-p1.ts`. The second login opens one PR
    with a one-task spec for each code repository and assigns the
    approver. The approver merges it. The tick runs both tasks and the
    direct task fails its checks once.
  - Expected: the approver's runner publishes one issue per spec and
    copies the PR assignee. Review rounds appear once on the task PR or
    spec issue. The failed check appears once on the direct task's spec
    issue. Both tasks land and their commits carry no trailers.
  - Record the observed result in a receipt under `docs/evidence/`.
