---
category: Planning
---

# Requirements: GitHub-native Avoozl

## Introduction

Avoozl keeps less of its own machinery where git and GitHub already have a
normal way to do the same thing. `docs/github-workflow.md` (workflow v1) is
the contract; this spec covers the parts of it that moved Avoozl's own
records onto GitHub.

| #   | Rule                                                                         | Requirement |
| --- | ---------------------------------------------------------------------------- | ----------- |
| 1   | No worker machines: no offers, grants or result steps                        | GN1         |
| 2   | No `Avoozl-*` trailers on landing commits. Rebuild reads the tick           | GN2         |
| 3   | An adopted approval publishes its spec issue, with the approving pull request's assignees | GN3 |
| 4   | Review rounds and failing checks are comments on the pull request or spec issue | GN5      |
| 5   | The other specs say the same thing                                           | GN8         |

### Words

| Word          | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| Approver      | The login whose evidence approves a spec commit (workflow v1 rule 7.2)     |
| Review output | A review round's verdict and findings, or a failing run of Avoozl's checks |
| Spec PR       | A pull request whose changes are all under `.kiro/specs/`                  |

## Requirements

### Requirement GN1: No worker machines

**User story:** As the owner, I want no second kind of machine that takes
tasks from a driver, so that there is one trust boundary and no claim
protocol beside workflow v1's claim branches.

#### Acceptance criteria

1. Avoozl SHALL have no worker offers, grant branches, claim
   acknowledgments, worker result step, `worker` commands, `spec offer` or
   `spec grants` commands, or their operations. A call to one SHALL be
   refused as unknown.
2. `avoozl runner report` and the manual take SHALL stay.

### Requirement GN2: Landing commits carry no Avoozl trailers

**User story:** As a person reading `git log`, I want Avoozl's landing
commits to look like anyone's, so that Avoozl leaves no bookkeeping in my
history.

#### Acceptance criteria

1. Avoozl SHALL write no `Avoozl-*` line, and no other trailer, in a direct
   landing, a merge batch, a pull request's merge message or a tick commit.
2. `avoozl rebuild` SHALL find each landed task from its tick on the done
   branch, with the tick commit as its landing commit.
3. Start times, tries, harness, model and credits SHALL stay only in the
   database that recorded them.

### Requirement GN3: An adopted approval publishes its spec issue

**User story:** As someone on the repository, I want every approved spec
to have its issue on GitHub without anyone pressing a button, so that I can
see what is planned and who runs it.

#### Acceptance criteria

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
   tick's failure notices. `avoozl spec publish` SHALL stay as a person's
   retry.
7. In local-only mode approval SHALL publish nothing.
8. Tests with a fake GitHub SHALL show: the merger of an approving pull
   request publishes one issue with that pull request's assignees, once; a
   pushed approval publishes an unassigned issue; another runner makes no
   issue; an existing marked issue is used; a failed publish is tried
   again; and local-only mode makes no GitHub call.

### Requirement GN5: Review output goes where code review goes

**User story:** As a person reviewing a change, I want Avoozl's review
findings and failing checks on GitHub where I review code, so that I can
read them without Avoozl's page.

#### Acceptance criteria

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
   tick. Rounds from before the first pass SHALL NOT be posted.
7. Tests with a fake GitHub SHALL show: a review round is one spec issue
   comment, once; a task with a pull request gets it there; a failing check
   run is posted with its command and tail; refused text is held; and a
   failed post is tried again.

### Requirement GN8: The other specs say the same thing

**User story:** As the maintainer, I want the specs to describe what is
built, so that a later reader does not rebuild a removed part.

#### Acceptance criteria

1. In `.kiro/specs/avoozl/`, the landing trailer criteria of Requirement
   114, the trailer and retro parts of rebuild and import, and the rule
   that publishing is only a person's act (Requirements 102.2 and 116.5)
   SHALL be deleted or changed to GN2 and GN3.
2. In `.kiro/specs/worker-paths/`, WP3.1's "task on a worker machine" kind
   and WP3.4 SHALL be deleted.
3. `node scripts/check/spec-lint.mjs` SHALL report 0 errors.
