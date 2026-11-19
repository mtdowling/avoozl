---
category: Planning
---

# Requirements: the triage agent and the GitHub pages

## Introduction

Avoozl watches a repository's issues and pull requests and acts on each new
one: it answers questions from the documentation, reproduces bugs, fixes and
lands simple ones, reviews other people's pull requests, and hands the rest
to the owner with a reason. The owner works from Issues and Pull requests
pages in Avoozl that show each item, what the agent did with it, and the
actions that are left. One change, a fix, needs no spec files.

This replaces Avoozl's label commands and its Issue Radar integration.
Issue Radar fixes issues and helps a person review and act on pull
requests, but it does not answer questions, review on its own, or land, and
it runs only inside Kiro Crew; Avoozl already has most of the parts
(design D1).

Approval lives in Avoozl, not in these files. Approving the spec, creating
issues and starting agents are separate acts that a person does later. Nothing in it changes code,
repositories or settings until its tasks run.

Claims about today's code carry one label: **V**, read in the file cited at
`e519494`; or **A**, assumed and not checked, with the reason.

### Why

- **The owner's workflow.** A triage agent answers, reproduces, fixes and
  lands simple bugs, reviews pull requests (saying when a review is
  partial), and sends bigger items to the owner; a view shows what it is
  doing and stops it. Avoozl shows the owner what needs attention and lets
  them act on it: tag, review, fix, or go to GitHub.
- **Issue Radar does not fill it.** Read in Kiro Crew 0.12.2, under
  `src/kiro_crew/apps/builtins/issue_radar/` (`B`) and
  `website/src/apps/issue-radar/` (`W`):
  - Its crews pick an issue at random within a label scope, reproduce it,
    and open a fix with a regression test (V: `B/backend/crew_brief.md:106`,
    `:373`, `:438`). They pass on new features, design questions and
    architecture with a `needs human` label (V: `:175`, `:592`).
  - No crew answers a question: a crew only asks the author for missing
    detail (V: `crew_brief.md:135`).
  - No crew reviews someone else's pull request; a crew answers review
    comments on its own pull requests (V: `crew_brief.md:52`). On the page,
    **Review** opens a chat that drafts comments for a person to post (V:
    `W/lib/review.prompt.ts`), and **Auto review** lists CI and review-bot
    checks, not an AI review (V: `W/components/PrDetail.tsx:469`).
  - A crew never merges; it re-arms auto-merge on an approved pull request
    (V: `crew_brief.md:53`, `:649`). A person can merge one pull request
    at a time from the page (V: `B/backend/http_routes/pr_actions.py:54`).
  - It runs only inside the Kiro Crew gateway (V: `B/backend/watch.py:33`).
  - Its page is what this spec's pages learn from: AI summaries, label
    suggestions applied by a click, person actions on issues and pull
    requests, and CI runs (V: `B/app.json:16`, `B/backend/routes.py:759`).
- **Label commands are unused weight.** Trigger rules with seven actions,
  Who counts, six managed labels and a plan label exist (V:
  `RULE_ACTIONS` and `MANAGED_LABEL_KEYS`, `src/app/github-policy.mjs:19`),
  and neither Avoozl's own nor Nupp's `.avoozl.json` sets a rule.
- **One fix should not need a spec folder.** **Deliver this** already
  starts a fix with no files, keyed to the issue's text (V: `boundedFix`,
  `src/app/github-intake.mjs:51`). Nothing does the same without a GitHub
  issue.

### What this builds on

- `.kiro/specs/without-kirocrew/`: every role on the `process` executor, a
  pull request snapshot for a child with no network (NK4), output files for
  long answers (NK3), and the content hook kept as a general tool.
- `.kiro/specs/standalone-web/` and `.kiro/specs/ui-components/`: the page
  is drawn with Kiro Crew's own components, inside Kiro Crew or served by
  Avoozl.
- `.kiro/specs/merge-batches/`: how a fix lands under `direct`.
- `.kiro/specs/avoozl/` Requirement 102: GitHub holds no per-task issues;
  the issue an item came from is the record of its fix.

### Scope

- Repositories with a GitHub remote that the owner turns the agent on for.
- Issues and pull requests opened after the agent is turned on, and older
  open ones the owner asks it to take.

### Out of scope

- A long-running agent. The tick is code; each item gets one short session
  (design D2).
- More of GitHub on the pages: a diff viewer, inline comments outside the
  agent's draft review, editing of issue text, milestones and Projects, and
  notifications for other GitHub events. None is ruled out; a later spec
  may add any of them on the same reads (TA10).
- Closing issues on its own, and approving or requesting changes on a pull
  request on its own.

### Words

| Word          | Meaning                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| Item          | One open issue or pull request in a watched repository                                        |
| Triage run    | One agent session for one item: classify, then act                                            |
| Class         | `question`, `bug`, `optimization`, `feature`, `pull-request`, or `unclear`                    |
| Fix           | One change with no spec files: its text, its repository, and two acceptance lines              |
| Collaborator  | A GitHub user with write access to the repository                                             |
| Owner queue   | Items the agent handed to the owner, with its reason                                          |

## Requirements

### Requirement TA1: The agent, run per item by the tick

**User story:** As the owner, I want each new issue and pull request looked
at once by an agent, so that nothing waits for me to read it first.

#### Acceptance criteria

1. Each repository SHALL have `triage.agent`, `on` or `off` (default `off`),
   set on Settings › Repository setup. Turning it on SHALL ask whether to
   take the open items already there or only new ones.
2. The tick SHALL find new and changed items with the reads of TA10 and
   SHALL start one triage run for each new item, within the repository's
   daily cap (TA7.4).
3. A triage run SHALL be a short session on the executor the `triage` role
   names (Settings › Models). It SHALL get a snapshot of the item (body,
   comments, labels, author's permission, and for a pull request its files,
   diff and checks), the repository's recent triage decisions, and possible
   duplicates by title. It SHALL have no network and no credentials.
4. A triage run SHALL first set the item's class, with a one-line reason,
   and then act by TA2 to TA5. Every decision and every write SHALL be
   recorded on the item with its run.
5. An item SHALL get a new triage run only when a person asks, or when its
   author answers a question the agent asked (TA3.4). A comment SHALL start
   a run only when its author is the item's author or a collaborator on the
   repository (TA7.8); anyone else's comment is data for the item's next run
   and never starts one. (Changed 2026-11-18: who may start a run from a
   comment.)

### Requirement TA2: Questions

**User story:** As a user of the project, I want a question answered from
the documentation, with an example, so that I do not wait for a maintainer.

#### Acceptance criteria

1. For a `question`, the run SHALL write an answer that cites the files or
   pages it relies on, with an example where one fits.
2. An answer that cites at least one file in the repository SHALL be posted
   as a comment by Avoozl. An answer that cannot cite one SHALL NOT be
   posted; it SHALL go to the owner queue as a draft.
3. The comment SHALL say it was written by an agent.

### Requirement TA3: Bugs and optimizations

**User story:** As the owner, I want a reproducible bug with a small fix
fixed and landed without me, so that simple problems close themselves.

#### Acceptance criteria

1. For a `bug` or `optimization`, the run SHALL first try to reproduce it:
   a test file that shows the problem, placed where the repository's own
   checks run it. Avoozl SHALL run those checks at the base branch with and
   without the file (TA7.7); the bug is reproduced when they pass without it
   and fail with it.
2. WHEN it reproduces and the fix is bounded (one change, justified by the
   report alone, not a design decision) THEN Avoozl SHALL start a fix
   (TA9) whose first commit is the reproduction, so the repository's checks
   run it.
3. WHEN the issue's author is a collaborator THEN the fix SHALL land by the
   repository's landing setting. Otherwise it SHALL stop at "Fix ready" in
   the owner queue, with its pull request or verified commit, for the owner
   to land.
4. WHEN it does not reproduce for lack of information THEN Avoozl SHALL
   post one comment asking for what is missing, and SHALL NOT ask again on
   that item.
5. Anything else (it does not reproduce with the information given, the fix
   is not bounded, the reproduction fails to run) SHALL go to the owner
   queue with what was found.

### Requirement TA4: Reviews of other people's pull requests

**User story:** As a contributor, I want a first review soon after I open a
pull request, and to know whether it was a full review or not.

#### Acceptance criteria

1. For a `pull-request` not opened by Avoozl, the run SHALL review it from
   the snapshot.
2. The review SHALL be full when the change is small and touches no path the
   repository marks as sensitive, and partial otherwise. A partial review
   SHALL say so in its first line and list what it did not cover. The size
   threshold SHALL be a setting, `triage.fullReviewMaxLines` (default 300).
3. Avoozl SHALL post the review as a comment review with line comments. It
   SHALL NOT approve or request changes on its own.
4. A pull request whose review found a problem the author must fix, or that
   needs a design decision, SHALL also go to the owner queue.

### Requirement TA5: The owner queue

**User story:** As the owner, I want everything the agent could not settle
in one place with its reason, so that I only look at what needs me.

#### Acceptance criteria

1. `feature` and `unclear` items, and the items TA2.2, TA3.3, TA3.5 and
   TA4.4 send, SHALL go to the owner queue with the class, the reason and
   what the agent did.
2. The owner queue SHALL be a filter of the Issues and Pull requests pages
   (TA8) and SHALL appear on Home and in Needs you as one count.
3. Avoozl SHALL send one notification per item that enters it.

### Requirement TA6: Seeing and stopping the agent

**User story:** As the owner, I want to see what the agent is doing and has
done, and to stop it, so that I trust it with my repositories.

#### Acceptance criteria

1. A Triage agent page SHALL show: the runs in progress; every run with its
   item, class, reason, writes and result; counts per day by class and
   result; each repository's daily cap and what is left of it; and GitHub
   calls used by triage today.
2. Each repository SHALL have Pause, and the page SHALL have Stop all. Both
   SHALL take effect before the next run starts; a running session finishes
   and its writes are held for the owner.
3. Stop the line (Requirement 64) SHALL also stop triage runs in its scope.
   An agent MAY pull it; only a person resumes it.
4. A run whose item is closed or merged while it runs SHALL be stopped, and
   none of its writes SHALL be sent. The item's record SHALL say the run was
   stopped because the item closed. (Changed 2026-11-18: added.)

### Requirement TA7: Trust

**User story:** As the owner, I want the agent's writes held to rules that
do not depend on what an issue says, so that a hostile issue cannot make it
do damage.

#### Acceptance criteria

1. Item text SHALL be data. The brief SHALL say so, and the snapshot SHALL
   mark everything from GitHub as written by other people.
2. Every write SHALL pass the content rules (Requirement 40) before it is
   sent: comments, reviews and line comments, labels, commit messages and
   the added lines of a fix.
3. Only a collaborator's issue SHALL lead to a fix that lands without the
   owner (TA3.3). A fix SHALL change no file under the repository's
   protected paths (Requirement 86.6) without the owner.
4. Each repository SHALL have a daily cap of triage runs,
   `triage.dailyRuns` (default 50). Past it, new items wait for the next day
   and one Needs you item says so.
5. The agent SHALL NOT close an issue or pull request, and SHALL NOT approve
   or request changes on a pull request.
6. The agent MAY add labels the repository already has, and SHALL NOT
   create labels.
7. A triage run SHALL name files, never commands. Avoozl SHALL run only the
   repository's configured checks, and SHALL run them for a reproduction
   with no network and no credentials: in a container when the repository's
   isolation names one or a container runtime is installed, else in the
   sandbox, always with the network off, whatever the repository's own
   isolation setting says (avoozl Requirement 112). (Changed 2026-11-18:
   the reproduction's isolation is named.)
8. Only a comment by the item's author or by a collaborator on the
   repository SHALL start a triage run. A comment by anyone else SHALL be
   read as data in the item's next run and SHALL NOT start, resume or
   queue one. (Changed 2026-11-18: added.)

### Requirement TA8: The Issues and Pull requests pages

**User story:** As the owner, I want to see an item, what the agent did, and
act on it without leaving Avoozl for the common decisions.

#### Acceptance criteria

1. Issues and Pull requests SHALL be two pages with the same layout: a list
   and a detail.
2. The list SHALL show number, title, author, age, labels and the agent's
   class and result, and for a pull request its files, lines added and
   removed, and failed, passed and skipped checks. It SHALL sort by number
   and by last update, filter by state, by owner queue, by "authored by
   me", "assigned to me", "review requested" and by label, and search by
   text.
3. The detail SHALL show the agent's summary (its class, reason and what it
   did), the body rendered with code blocks, a first-time contributor mark,
   checks and CI runs, reviewers, assignees, labels with the agent's
   suggestions to add by click, branches, change counts, and the timeline
   with its recent comments.
4. Actions on an issue: **Fix**, **Answer** (edit and post the agent's
   draft), **Make this a spec**, **Run triage again**, **Assign to me**,
   **Edit labels**, **Snooze**, **Close** with a reason, **Open on GitHub**.
5. Actions on a pull request: **Review** (run or rerun the agent's review),
   **Edit review** (the agent's draft review with its line comments, then
   post), **Approve**, **Request changes**, **Comment**, **Close**, **Edit
   labels**, **Open on GitHub**. Approve, Request changes and Close SHALL
   be a person's.
6. A pull request that only adds a spec SHALL keep **Review as spec**
   (Requirement 107).
7. These pages replace Requirement 92's rule that Avoozl has no Issues or
   Pull requests pages, and replace the Triage list (the Untriaged list of
   Requirement 49, inside the one intake list of Requirement 110).

### Requirement TA9: A fix needs no spec files

**User story:** As the owner, I want to start one change with a sentence or
from an issue, without writing a spec, so that small work stays small.

#### Acceptance criteria

1. A fix SHALL be one task whose definition is its text (the issue's title
   and body as they read when it started, or what the owner typed), its
   repository and two acceptance lines: it does what the text asks, and the
   repository's checks pass on the exact head that lands. Its definition
   hash SHALL be the hash of those.
2. A fix SHALL start from **Fix** on an issue, from **New fix** beside **New
   spec** on the page, or from `avoozl fix "TEXT" --repo ID`. Starting it is
   the approval.
3. A fix from an issue SHALL keep its record on that issue; a fix without
   one SHALL keep it in the workspace database.
4. A fix SHALL run, be checked and land like any task. **Make this a spec**
   SHALL turn a fix that grew into a spec folder holding its text.
5. **Deliver this** and its `bounded-fix` record SHALL become this fix; an
   older `bounded-fix` task SHALL load as one.

### Requirement TA10: GitHub traffic

**User story:** As the owner, I want the agent and the pages to stay well
inside GitHub's limits, so that landing and everything else keep working.

#### Acceptance criteria

1. All GitHub traffic of this spec SHALL go through Avoozl's one client:
   its write pacer, its conditional-request cache and its rate-limit pause
   (V: `src/app/github-pacer.mjs`, `src/app/github-rate.mjs`). No child
   SHALL call GitHub.
2. Finding new and changed items SHALL use one conditional REST list per
   repository, the open issues and pull requests updated since the last
   cursor, newest first, so an unchanged repository costs nothing. It SHALL
   NOT use the search API.
3. The list page's pull request counts (checks, files, lines) SHALL come
   from one GraphQL query per repository for the pull requests that
   changed since the last read, not one call per pull request.
4. An item's detail SHALL come from one GraphQL query, cached by the item's
   `updatedAt`. Opening an item whose `updatedAt` has not changed SHALL make
   no call.
5. The snapshot for a triage run SHALL reuse the detail read and add the
   diff only for a pull request.
6. Triage SHALL yield to everything else: when fewer than the existing low
   mark of calls are left in the hour, the tick SHALL start no triage run
   and SHALL read for triage only when nothing else waits.
7. The Triage agent page SHALL show the calls triage used today, by REST,
   GraphQL and writes.

### Requirement TA11: What goes

**User story:** As the maintainer, I want the ways this replaces removed, so
that there is one way an issue becomes work.

#### Acceptance criteria

1. Label commands SHALL be removed: trigger rules and their actions, Who
   counts for label orders, the managed state labels, the plan label, the
   review label, and the label-triggered planner and responder steps. The
   planner, the breakdown and the responder SHALL stay as roles the triage
   agent and the page's buttons start.
2. The Issue Radar integration SHALL be removed: Send to Issue Radar, the
   crew views, claims and strip, the escalation intake, Settings › Issue
   Radar, and the `/api/apps/issue-radar/*` grant in `kirocrew-app/app.json`.
3. Public crews SHALL be removed except the content hook, which SHALL move
   to its own module as a general pre-tool-use command.
4. Settings for any of these SHALL load and be ignored. Removed commands and
   operations SHALL answer with one line naming what replaced them.
5. The `.kiro/specs/radar-coder/` spec, superseded on 2026-11-15, SHALL be
   deleted, and the code comments that cite it SHALL name this spec or the
   product spec instead.

### Requirement TA12: The product spec says the same

**User story:** As the maintainer, I want the avoozl spec to describe what
is built, so that a later reader does not rebuild what this removes.

#### Acceptance criteria

1. Requirements 49, 52, 85, 91.6, 92, 103, 107 and 110 of
   `.kiro/specs/avoozl/` SHALL each say what this spec changed, with the
   date, and keep their text as the record.
2. `README.md` and `docs/policies.md` SHALL describe the triage agent, the
   pages and fixes, and SHALL no longer describe label commands or Issue
   Radar.
