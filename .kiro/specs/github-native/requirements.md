---
category: Planning
---

# Requirements: GitHub-native Avoozl

## Introduction

The owner decided on 2026-11-19 that Avoozl should keep less of its own
machinery where git and GitHub already have a normal way to do the same
thing. This spec writes down those decisions. It changes no code until its
tasks run.

Every claim about today's code carries one label: **V**, read in the file
cited at `a8a22391`; or **A**, assumed and not checked, with the reason.

The decisions, in short:

| #   | Decision                                                                   | Requirement |
| --- | -------------------------------------------------------------------------- | ----------- |
| 1   | No worker machines. One Avoozl runs a spec; fan-out is the person's own agent | GN1      |
| 2   | No `Avoozl-*` trailers on landing commits. Flow and rebuild read plain git | GN2         |
| 3   | Approval publishes the spec issue and the epic issue. Private repos keep specs private | GN3 |
| 4   | A spec pull request an approver merges is the approval. No button-only path | GN4        |
| 5   | Review findings, falsifier results and failing checks go where code review goes | GN5     |
| 6   | The epic issue's assignee is the epic owner, and it closes when its specs land | GN6     |

GN7 lists the Avoozl-only actions that remain and which could be GitHub
actions. GN8 lists every edit to other specs.

### Why

- Worker machines add a second trust boundary, a claim protocol in the spec
  journal, grant branches `avoozl/<spec>/grant/<task>` (V:
  `grantBranch`, `src/app/workers/worker-grants.mjs:44`), a result step on
  the driver (V: `src/app/workers/worker-result-step.mjs`), four
  `worker` commands and two `spec` commands (V:
  `src/app/commands/machine.mjs:436`, `src/app/commands/setup.mjs:296`).
  People who want many agents at once already have agent tools that fan
  work out. Avoozl does not need to be one.
- Landing trailers (V: `src/app/landing/landing-trailers.mjs`) put Avoozl's
  bookkeeping into every landing commit message in the person's repository.
  Requirement 113 already makes the tick in `tasks.md` the record that a
  task landed.
- Today approval and publishing are separate acts (V: Requirement 102.2;
  `spec/approval-cutdown` keeps a **Make the GitHub issues** button). An
  approved spec with no issue is invisible to everyone else.
- Review findings live in `review_threads` rows and nowhere else (V:
  `src/app/reviews/review-findings.mjs:4-6`, "reads or writes the workspace
  database only"). Requirement 99.9 says a review never writes to GitHub. A
  person who reads the pull request does not see them, and `avoozl
  rebuild` cannot bring them back.

### What this builds on

`.kiro/specs/avoozl/` stays the product spec. This spec assumes three
branches land first, in this order: `spec/spec-assignee` (the spec issue's
assignee is who drives the spec), `spec/drop-mirror` (no mirror; a
repository names its specs branch) and `spec/approval-cutdown` (approval is
a commit on GitHub). Each of them claims Requirement 115 to 116, design
§4.43 to §4.44 and Phase 67 to 68 of the avoozl spec, so this spec uses its
own folder and `GN` numbers. Where this spec and one of those branches
disagree, this spec wins, and GN8 names each change.

The spec folder format this spec assumes is the cut one of design §D10.
Its code is built on `spec/cut-facts` and in the `specs.path` work, not
here.

### Scope

- Worker machines and every part that serves only them.
- The landing commit's message, Flow's sources and `avoozl rebuild`.
- When the spec issue and epic issue are made, and their assignees.
- Which approval paths stay.
- Where review, falsifier and check output is written.

### Out of scope

- Many tasks at once on one machine. The lane limit stays.
- A person finishing a task by hand (`avoozl take`, WP2). It stays.
- How the person's own agent tool fans out work. Avoozl only stays out of
  its way.

### Words

| Word          | Meaning                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| Driver        | The one Avoozl that runs a spec, named by the spec issue's assignee (R66) |
| Epic owner    | The one login assigned to the epic issue                                  |
| Review output | Review findings, falsifier verdicts and failing check output for a task  |
| Round         | One worker attempt and the checks and reviews that follow it              |
| Spec PR       | A pull request whose changes are all under `.kiro/specs/` (R107)          |

## Requirements

### Requirement GN1: One machine runs a spec; worker machines are gone

**User story:** As the owner, I want Avoozl to run each spec on one
machine, so that there is one trust boundary and no claim protocol to
maintain.

#### Acceptance criteria

1. Avoozl SHALL start sessions only on the machine of the spec's driver.
   No setting, command, operation, page or journal record SHALL offer a
   task to another machine or accept a result from one.
2. These SHALL be deleted, and a call to a removed command or operation
   SHALL be refused as unknown (WP7.1):
   - the commands `avoozl worker pull`, `worker accept`, `worker setup`,
     `worker attempt`, `avoozl spec offer` and `spec grants`;
   - the operations `worker.pull`, `worker.accept`, `worker.setup`,
     `worker.attempt`, `spec.offer`, `spec.grants`, `spec.grants.release`,
     `spec.grants.status` and `remote.view`;
   - grant branches `avoozl/<spec>/grant/<task>`, claim refs, offers and
     claim acknowledgments in the spec journal, and the envelope;
   - the worker offer step and the worker result step in the tick;
   - the config keys `runner.role`, `workers.offerTo` and
     `workers.grantStaleAfter`;
   - the Needs you rows for stale claims and Release claim, and the page's
     worker machine link and fields.
3. `avoozl runner report` and `avoozl runner status` SHALL stay for a
   session on this machine and for the manual take. `runner status` SHALL
   show only this machine's sessions and the supervisor's children.
4. A config file that holds a removed key SHALL load, and the key SHALL be
   dropped, as WP6.6 does for other unknown machine keys.
5. A journal record of a removed kind (offer, claim, acknowledgment,
   grant) SHALL be ignored on replay and SHALL NOT hold the spec.
6. Driver hand-off (R66, `spec/spec-assignee`) SHALL stay. Moving a spec to
   another machine is a hand-off of the whole spec, never of one task.
7. The README and `docs/` SHALL say that Avoozl runs on one machine per
   driver, and that a person who wants more agents at once uses their own
   agent tool to fan work out, for example several Kiro Crew chats, each
   driving its own spec or taking tasks with `avoozl take`.
8. Each test file that is deleted SHALL be listed in the pull request with
   the behaviors it covered that stay and the test that covers each one.

### Requirement GN2: Landing commits carry no Avoozl trailers

**User story:** As a person reading `git log`, I want Avoozl's landing
commits to look like anyone's, so that Avoozl leaves no bookkeeping in my
history.

#### Acceptance criteria

1. Avoozl SHALL write no `Avoozl-Task`, `Avoozl-Started`, `Avoozl-Tries`,
   `Avoozl-Harness`, `Avoozl-Model`, `Avoozl-Cost` or `Avoozl-Span` line,
   and no other trailer, in any commit message it writes: direct landings,
   merge batches, pull request squash messages, and tick commits.
2. A landing commit's message SHALL be the task's title as a short
   imperative subject, and its body SHALL be the task summary, or empty.
   A batch landing SHALL list one subject line per task in the body.
3. Flow and `avoozl rebuild` SHALL take a landing from plain git facts
   only:
   - which task: the `[x]` boxes the commit adds to `tasks.md` on the
     specs branch (R113);
   - when: the commit's committer time;
   - who: the commit's author, and for a pull request, its number from
     GitHub's merge commit for that pull request;
   - lead time: from the commit that approved the task's spec revision
     (R114.1) to the commit that ticked the task.
4. A spec kept on a separate specs branch SHALL get the tick in its own
   commit there (R113); that commit's time SHALL count as the landing time.
5. Start time, tries, harness, model, credits and Flow spans SHALL stay in
   the workspace database as a cache. `avoozl rebuild` SHALL NOT restore
   them, and Flow SHALL show "not known" for each one it has no row for.
   GN design §D2 lists what Flow loses after a rebuild.
6. A retro file under `.kiro/retros/` (R114.10) SHALL keep its own
   summary, with no per-task credits (owner decision, 2026-11-19). Credits
   survive only in the database that recorded them.
7. Requirement 102.5 SHALL read "the tick" for "a trailer": a tick in
   `tasks.md` is a pointer, not proof, and `landed` still needs verified
   intent evidence.
8. Tests SHALL show: a direct landing, a batch landing and a pull request
   landing each write no trailer; a scratch repository rebuilds to the same
   landed tasks, landing times, authors and pull request numbers after its
   database is deleted; and Flow shows "not known" for a rebuilt task's
   model and credits.

### Requirement GN3: Approval publishes the spec issue and the epic issue

**User story:** As someone on the repository, I want every approved spec to
have its issue on GitHub at once, so that I can see what is planned without
asking anyone to press a button.

#### Acceptance criteria

1. WHEN the tick adopts an approval (R114.13) of a spec that has no spec
   issue THEN it SHALL run Publish issue (R102.2) in the spec's home
   repository in the same tick: one spec issue, and the epic issue if the
   spec's epic has none. The spec issue SHALL be a sub-issue of the epic
   issue.
2. Only the workspace whose GitHub login authored the approving commit
   (its email matched as in R114.1) SHALL publish. Another workspace SHALL
   wait for the issue to appear and SHALL write nothing.
3. Before it creates an issue, Avoozl SHALL look for an existing one by its
   hidden marker (V: `src/app/specs/spec-publication.mjs:6`). After it
   creates one it SHALL read the marker back. WHEN two open issues hold the
   same marker THEN the workspace that made the newer one SHALL close it as
   a duplicate of the older one, and nothing else SHALL change.
4. (Changed 2026-11-19, owner decision.) A new spec issue SHALL copy the
   assignees of the spec PR that approved it. WHEN that pull request has
   none, or the approval was a pushed commit with no pull request, THEN the
   spec issue SHALL stay unassigned. Avoozl SHALL NOT assign the approver
   or the publishing login.
5. An Avoozl instance SHALL drive a spec only WHEN the spec issue's
   assignee, and the assignee of every other issue tied to the spec (its
   epic issue), is the one GitHub login this instance is tied to. Any
   other case SHALL start nothing for the spec on this instance.
6. An approved spec whose spec issue has no assignee SHALL be driven by
   nobody. The Specs list and the spec page SHALL show "Unassigned", and
   Avoozl SHALL raise no Needs you row for it. A person picks it up by
   assigning a login on GitHub or with Take over.
7. The **Make the GitHub issues** button, its dialog and the "Not shared"
   state for an approved spec in a GitHub workspace SHALL be removed.
   `avoozl spec publish SPEC` SHALL stay as the retry when the tick's
   publish failed, and Needs you SHALL offer it once for that spec.
8. A spec stays private only by living in a private repository. The issue
   SHALL be created in the spec's home repository and have that
   repository's visibility. The privacy checks of R102.11 and R102.12
   SHALL run before each write, as today.
9. Publishing SHALL be a low-risk job in the credentials job table (it is
   already listed as one) and SHALL run without a popup, from the tick.
10. In local-only mode (no GitHub remote) approval SHALL publish nothing,
    and the page SHALL show "Local only" for the spec.
11. Tests with a fake GitHub SHALL show: an approver's merge of a spec PR
    with an assignee makes one spec issue and one epic issue on the next
    tick, with that assignee copied; a spec PR with no assignee, and a
    pushed approver commit, leave both unassigned, shown as "Unassigned",
    with no Needs you row and nothing started; an instance drives only
    when the spec issue and the epic issue both name its login; another
    workspace makes no issue; two workspaces racing leave one open issue;
    a failed publish raises one Needs you row and `avoozl spec publish`
    makes the issue.

### Requirement GN4: A merged spec pull request is the approval

**User story:** As a contributor, I want to propose a spec by opening a pull
request and have it approved when an approver merges it, so that approval
is the normal GitHub review I already know.

#### Acceptance criteria

1. Anyone with access to the repository SHALL be able to propose a spec, or
   a change to one, by opening a spec PR. Avoozl SHALL adopt it as a draft
   revision (R107) whoever the author is.
2. The approval SHALL be the merge commit, or a pushed commit, on the specs
   branch, authored by an approver (R114.1 to R114.3, R114.13). Avoozl
   SHALL read it on its tick with no click. The proposer need not be an
   approver; the merger must be.
3. In a workspace whose spec repository has a GitHub remote, Avoozl SHALL
   have no other approval path. **Approve revision**, `avoozl plan approve`,
   the approval delegation operations and any receipt that marks a spec
   approved in the database alone SHALL be removed.
4. In their place the spec page SHALL show **Open pull request** for a
   draft that has none (it pushes `spec/<name>` and opens a spec PR as the
   person, a low-risk job), and **Merge on GitHub to approve** with a link
   once it has one.
5. In local-only mode, **Approve revision** SHALL stay. It SHALL write the
   approving commit as the person on the local specs branch (R114.5), so
   the approval is still a git commit.
6. `docs/specs.md` SHALL say, in its Approving section: open a pull request
   with the spec folder; an approver merges it; that merge is the approval.
7. Tests SHALL show: a spec PR opened by a non-approver and merged by an
   approver is approved on the next tick; the same PR merged by a
   non-approver is not; `plan.approve` is refused as unknown in a GitHub
   workspace; and **Approve revision** writes a commit in local-only mode.

### Requirement GN5: Review output goes where code review goes

**User story:** As a person reviewing a change, I want Avoozl's review
findings, falsifier results and failing checks on GitHub where I review
code, so that I can read and answer them without Avoozl's page, and so that
they survive a rebuild.

#### Acceptance criteria

1. Requirement 99.9's "never writes to GitHub" SHALL be removed. A review
   SHALL still never approve and never block approval.
2. WHEN a task's pull request exists (`landing: pr`) THEN each round's
   review output SHALL be posted on it as one pull request review:
   - each finding on a changed line SHALL be a line comment with its
     severity as the first word;
   - each finding not on a changed line, and the falsifier's verdict with
     its reasons, SHALL be in the review body;
   - the review event SHALL be `COMMENT`, never `APPROVE` or
     `REQUEST_CHANGES`.
3. Failing check output on a pull request's head SHALL be posted as the
   check run Avoozl already writes for that head (its CI receipt), with
   the failing command and the last 60 lines of its output, at most 10 KB,
   in the check run's output.
4. WHEN no pull request exists for the task (`landing: direct`, or before
   the pull request opens) THEN each round's review output and failing
   check output SHALL be posted as one comment on the spec issue, naming
   the task ID and the candidate commit's SHA. When the task's pull request
   opens later, its body SHALL link those comments.
5. Spec reviews (R99, R104) SHALL be posted on the spec PR in the same way.
6. A person's decision on a finding SHALL be read from GitHub: a resolved
   review thread is resolved, and a reply that starts with `accept`,
   `reject` or `defer` from an approver records that decision. The page's
   buttons SHALL do the same GitHub writes. The database SHALL only cache
   them.
7. Every posted text SHALL pass the content rules and the privacy checks of
   R102.11 and R102.12 first. WHEN a write is refused THEN Avoozl SHALL
   post a short line that says how many findings were held and by which
   rule, and raise one Needs you row. The held text is the only review
   output kept only on this machine, and the row says so.
8. Avoozl SHALL make one GitHub write per round per place (one review, or
   one comment), through the write pacer. Posting review output SHALL be a
   low-risk job in the credentials job table.
9. `avoozl rebuild` SHALL restore findings and their decisions from the
   pull request reviews and spec issue comments Avoozl wrote, found by a
   hidden marker in each.
10. Tests with a fake GitHub SHALL show: a pr-mode round makes one review
    with line comments and the falsifier verdict in the body; a
    direct-mode round makes one spec issue comment; a failing check fills
    the check run's output; a refused write posts the held line and one
    Needs you row; a resolved thread reads as resolved; and a rebuild
    restores the findings.

### Requirement GN6: The epic issue's assignee is the epic owner

**User story:** As the owner of an epic, I want GitHub to show that the epic
is mine and to close it when all its specs land, so that the epic issue
says the truth without my upkeep.

#### Acceptance criteria

1. The epic issue's one assignee SHALL be the epic owner. WHEN Avoozl
   publishes an epic issue (GN3.1) THEN it SHALL copy the assignees of the
   spec PR that approved it, as GN3.4 does for the spec issue, and leave it
   unassigned when there are none.
2. A person SHALL change the epic owner by changing the assignee on GitHub,
   or with **Take over epic** on the page, which assigns this login and
   removes no one else's unless forced. Avoozl SHALL read the assignee with
   the conditional read it already makes of the epic issue.
3. (Changed 2026-11-19, owner decision.) A member spec SHALL be driven only
   by the instance whose login is both the spec issue's assignee and the
   epic issue's assignee (GN3.5). WHEN they differ, or either is
   unassigned, THEN no instance SHALL drive it, and the page SHALL show
   "Unassigned" or "Taken by <login>". The rule in `spec/spec-assignee`
   that lets the epic issue's assignee stand in for a spec issue with none
   SHALL be removed.
4. WHEN an epic issue has two or more assignees THEN the page SHALL show
   "N owners" and raise one Needs you row, which closes by itself once one
   is left. Nothing SHALL stop running.
5. WHEN every member spec's issue is closed as completed THEN the epic
   owner's workspace SHALL close the epic issue as completed, once. WHEN
   the epic has no owner THEN the driver of the last member spec to land
   SHALL close it. A later member spec SHALL reopen it.
6. Tests with a fake GitHub SHALL show: a published epic copies the spec
   PR's assignee, or stays unassigned; a reassignment on GitHub is read on
   the next tick; a member spec whose epic names another login is not
   driven; two owners raise one row; the epic closes once when its last
   spec closes; and a new member spec reopens it.

### Requirement GN7: Avoozl-only actions are listed, and each has a GitHub answer or a reason

**User story:** As the owner, I want to know which acts still need
Avoozl's own page, CLI or MCP, so that I can do the rest on GitHub.

#### Acceptance criteria

1. `docs/delivery.md` SHALL hold one table of every act that still needs
   Avoozl's page, CLI or MCP, with what it does on GitHub instead, if
   anything. Design §D7 is that table.
2. The acts §D7 marks **GitHub** SHALL each work from GitHub alone, read on
   the tick with no new GitHub call beyond the reads it already makes: a
   person assigning themselves on the spec issue SHALL be Take over;
   unassigning themselves SHALL be Release; the `avoozl:stopped` label on a
   spec or epic issue SHALL be Stop the line for it, and removing it SHALL
   resume it.
3. Only a person SHALL be able to resume: a label removed by Avoozl's own
   agent identity, or by a login that is not an approver, SHALL NOT resume.
   A label added by anyone with write access SHALL stop.
4. The page's buttons for those acts SHALL make the same GitHub change, so
   that GitHub and the page never disagree.
5. Creating the `avoozl:stopped` label SHALL be a high-risk job and SHALL go
   through the popup, once, in setup. Adding or removing it SHALL be low
   risk.
6. (Added 2026-11-19, owner decision.) Investigate first's **Go ahead**,
   **Investigate again** and **Stop** SHALL each also be an approver's
   reply on the findings comment (the spec issue comment or pull request
   review of GN5): a reply whose first line is `go ahead`, `investigate
   again` or `stop`. The tick SHALL read it with the comment reads it
   already makes. A reply from a non-approver, or from Avoozl's own agent
   identity, SHALL do nothing. A reply that is newer than a later round's
   findings SHALL apply only to its own round. The page's buttons SHALL
   post the same reply.
7. Tests with a fake GitHub SHALL show: an approver's `go ahead` reply
   resumes the same session on the next tick; a non-approver's reply and
   the agent identity's reply do nothing; and a reply on an old round does
   not start the new one.

### Requirement GN8: The other specs say the same thing

**User story:** As the maintainer, I want the specs to describe what is
built, so that a later reader does not rebuild a removed part.

#### Acceptance criteria

1. In `.kiro/specs/avoozl/`: Requirement 90 SHALL be marked retired by GN1;
   Requirement 102.9 SHALL drop claim acknowledgments; Requirement 102.14
   SHALL be retired; Requirement 102.5 SHALL change as GN2.7 says;
   Requirement 114.7, 114.10 (its trailer part) and 114.12 (its trailer
   part) SHALL be retired by GN2; Requirement 102.2's "independent of
   approval" SHALL be retired by GN3; Requirement 99.9's GitHub clause
   SHALL be retired by GN5. Each keeps its text under a dated line naming
   this spec.
2. Tasks 43.1 to 43.6 and proof `avoozl-p53` of the avoozl spec SHALL be
   marked superseded by this spec, and `avoozl-p53` SHALL not be run.
3. In `.kiro/specs/worker-paths/`: WP5 SHALL be marked retired by GN1 except
   that it removed SSH runner mode; WP3.1's "task on a worker machine" kind
   and WP3.4 SHALL be retired; tasks `wp-3.1` and `wp-3.2` and proof `wp-p3`
   SHALL be marked superseded; proof `wp-p4`'s "one remote route" SHALL
   read "no remote route".
4. In `.kiro/specs/direct-links/`: DL1's worker machine and remote attempt
   parts SHALL be retired, and task `dl-2` SHALL open only attempts on this
   machine.
5. In the branches named under "What this builds on", whichever has landed:
   `spec/spec-assignee` criterion 8 (publishing stays a person's act),
   criterion 3's epic stand-in, and criterion 1's "driver named by the spec
   issue alone" SHALL be retired by GN3 and GN6;
   `spec/approval-cutdown` criteria 6 and 7 (Approve for a checkout, and
   the **Make the GitHub issues** button) SHALL be retired by GN4 and GN3.
6. `node scripts/check/spec-lint.mjs` SHALL report 0 errors after each
   edit.
