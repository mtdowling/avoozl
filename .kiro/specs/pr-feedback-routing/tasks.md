---
repo: avoozl
---
# Tasks: feedback routing

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`PF1` to `PF13`, in `requirements.md`); `D` sections
refer to this spec's `design.md`; rule numbers are workflow v1's.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces, real git with a bare remote, a fake GitHub and fake executors;
Avoozl runs the repository's checks (AGENTS.md); never force push any branch.
Phase 1 edits `docs/github-workflow.md`, so start it after any open edit to
that file has landed on main. Phase 3 builds on rule 15's lease commits and
renewal in `src/app/workers/claims.ts`.

Task IDs start with `pf-` so they never collide with the IDs of the other
specs.

## Phase 1: Workflow rules

- [ ] `pf-1.1` Write the feedback routing rules into the workflow [PF8] (§D9)
  - `docs/github-workflow.md` has section 21, Feedback routing, with rules 21.1 to 21.6 as D9 states them
  - The Optional parts table lists Feedback routing with sections 21 and "The runner delivers no comment to a worker"
  - Section 15's lease commit example shows a `Feedback:` line, and the text says a new lease copies it
  - The Kit coverage table lists 21.1 to 21.6 under "No case"
  - `npm test -- docs-links docs-json` passes
- [ ] `pf-1.2` Write the early review rules into the workflow [PF8.3, PF13.4] (§D9, §D15)
  - `docs/github-workflow.md` has section 22, Early review, with rules 22.1 to 22.7 as D9 states them
  - The Optional parts table lists Early review with section 22 and "The runner opens no pull request before a task is done"
  - Section 17's text says that under early review the task's pull request opens before it is done and lands under 22.5
  - The Kit coverage table lists 22.1 to 22.7 under "No case"
  - `docs/glossary.md` defines early review, checkpoint and early review pull request, and its entry for a draft pull request names `landing.pr` `draft` only
  - `npm test -- docs-links docs-json` passes

## Phase 2: Reading and keying

- [ ] `pf-2.1` Read feedback in one batched query [PF7, PF1.5] (§D2)
  - Tests with a fake GraphQL: two pull requests and one issue come back from one query, each with its own `since`
  - A review thread comment published before `since` is dropped, and `isOutdated`, `line`, `originalLine` and `originalCommit` reach the record
  - A source whose `updatedAt` did not move since the last read is not in the query
  - `pullRequestFeedback` is renamed `feedbackRead`, and the demo fixture's stub follows
- [ ] `pf-2.2` Keep feedback items in `pr_feedback` [PF3.1, PF6.3] (§D3)
  - Tests: a review, a line comment and a conversation comment with the same GitHub ID get three keys
  - An item read twice keeps one row
  - A delivered item edited on GitHub afterward has `editedAfter` set and is not sent again
  - A review with an empty body makes no row, and its line comments do
  - The demo rows in `src/app/test/demo-fixture.ts` have the D3 shape

## Phase 3: Authors, routing and delivery

- [ ] `pf-3.1` Count writers, approvers and listed bots [PF2] (§D4)
  - Tests: a writer's, an approver's and a listed bot's items count
  - A listed login whose GraphQL author is a `User` does not count
  - A stranger's item is `shown` with the reason `not a writer, approver or listed bot`
  - An item carrying `POSTED` gets no row, and a hidden item is `shown` with the reason `hidden on GitHub`
  - `feedback.bots` is in the `.avoozl.json` validator and schema, and the schema parity test passes
- [ ] `pf-3.2` Route items to tasks [PF1, PF6.2, PF6.4] (§D5)
  - Tests: an item on a task's pull request goes to that task, and a labeled issue's comment goes to `issue-<n>`
  - A spec issue comment holding `` `p-2` `` goes to `p-2`, and one holding two task IDs goes to both
  - A bare `p-2`, an ID inside a fence, and another spec's ID leave the comment in state `spec`
  - An item on a done task is `after-done`, and the task stays done with no worker started
- [ ] `pf-3.3` Record delivery in the lease commit [PF3] (§D6)
  - Tests with real git and a bare remote: a renewal after a round writes `Feedback:` lines that cover the sent items
  - An item inside the 10-minute window counts as delivered only when its key is listed
  - A new lease on an existing claim copies the `Feedback:` lines, and the new holder sends only later items
  - After `avoozl rebuild`, `pr_feedback` holds the same states and the next tick sends nothing
  - A failed renewal after a send leaves the items pending, so the next holder sends them again
- [ ] `pf-3.4` Send each task's round at a safe turn [PF4, PF2.6, PF5.1] (§D7)
  - Tests with fake executors: an `idle` chat gets one message holding every pending item of its task
  - A `working` chat gets nothing until a tick reads it `idle`
  - A `process` child gets a queued `send` request, delivered after its run exits
  - A task whose lane moved on or whose session closed gets a lane request with the round as its brief
  - A stopped spec's rounds are held, and a runner without the newest lease sends nothing
  - A worker that reported done has its attempt reopened, and its waiting landing entry leaves the queue
  - Each body sits in a fence longer than its longest backtick run, and a message over `SEND_MAX_CHARS` keeps every header and link
  - The `process` brief names the feedback message's first line

## Phase 4: Answers and view

- [ ] `pf-4.1` Take the worker's answers and raise scope conflicts [PF5, PF6.5] (§D8)
  - Tests: `runner report TASK done --feedback FILE` and a result file's `feedback` list record each answer on its item
  - An entry for an item not delivered to the task is refused, and `scope` without a `suggestion` is refused
  - Each `scope` entry makes one Needs you row with the item's text, link and suggestion, once per task and item
  - A labeled issue's row says to edit the issue and add its label again
  - A feedback round whose commit changes the task's spec text goes back with the files named
  - `runner report` help lists `--feedback FILE`
- [ ] `pf-4.2` Show feedback on the task and the spec [PF6] (§D3, §D5)
  - The task drawer lists each item with its author, link, time, state, reason and answer
  - The spec view lists the spec issue comments in state `spec`
  - `npm run test:ui` passes
  - Phone and desktop screenshots in light and dark, kept outside git, were shown to the owner before merge

## Phase 5: Workflow kit

- [ ] `pf-5.1` Add the `feedback` case field to the kit [PF8.2] (§D3, §D9)
  - `workflow-kit/README.md` lists `feedback`: the source, its items as `{key, kind, author, authorType, at, body, posted, hidden}`, the lease's `Feedback:` lines, and the expected `deliver` and `show` lists
  - `src/app/test/workflow-kit-adapter.ts` runs a feedback case through Avoozl's routing
- [ ] `pf-5.2` Write one kit case per routing and dedupe rule (**PARALLEL**)
  - [ ] `pf-5.2.1` Cases for pull request items [21.1]
    - `feedback-pull-review`, `feedback-pull-line` and `feedback-pull-comment` each deliver their item to the task, and Avoozl passes them
  - [ ] `pf-5.2.2` Case for a labeled issue comment [21.1]
    - `feedback-labeled-issue` delivers a writer's comment to `issue-<n>`, and Avoozl passes it
  - [ ] `pf-5.2.3` Cases for spec issue comments [21.1]
    - `feedback-spec-named` delivers to the named task, and `feedback-spec-unnamed`, `feedback-spec-bare-id` and `feedback-spec-other-spec` deliver to no worker, and Avoozl passes them
  - [ ] `pf-5.2.4` Cases for counted authors [21.2]
    - `feedback-stranger`, `feedback-bot-listed`, `feedback-bot-unlisted`, `feedback-user-named-as-bot` and `feedback-own-post` give the D4 results, and Avoozl passes them
  - [ ] `pf-5.2.5` Cases for delivering once [21.3]
    - `feedback-same-key`, `feedback-mark-window` and `feedback-handoff-copies-mark` each deliver every key once, and Avoozl passes them
  - [ ] `pf-5.2.6` Cases for the holder and a stop [21.4]
    - `feedback-not-holder` and `feedback-stopped` deliver nothing, and Avoozl passes them
  - [ ] `pf-5.2.7` Case for a done task [21.5]
    - `feedback-done-task` shows the item and leaves the task done, and Avoozl passes it
  - [ ] `pf-5.2.8` Case for a scope conflict [21.6]
    - `feedback-scope` makes one person's decision and no spec edit, and Avoozl passes it
- [ ] `pf-5.3` Publish the feedback cases [PF8] (§D9)
  - `docs/github-workflow-scenarios.md` is regenerated by `scripts/kit/scenarios-doc.ts` and shows every feedback case
  - The Kit coverage table in `docs/github-workflow.md` lists none of 21.1 to 21.6 under "No case"

## Phase 6: Early review

- [ ] `pf-6.1` Add the `landing.earlyReview` setting [PF9] (§D10)
  - `landingSettings` returns `earlyReview`: the repository's value, then the workspace's, then `false`
  - The `.avoozl.json` validator and schema hold `landing.earlyReview`, and the schema parity test passes
  - Tests: the landing settings operation that sets it is person-only, and an agent, MCP or tick caller is refused
  - The Autopilot page and a repository's **Landing** tab show **Open the pull request early** with its hint, and the toggle is disabled with its line in a repository that does not land in `pr` mode
  - `npm run test:ui` passes
  - Phone and desktop screenshots in light and dark, kept outside git, were shown to the owner before merge
- [ ] `pf-6.2` Take checkpoint reports [PF10] (§D11)
  - Tests: `plans_report` kind `checkpoint` with a commit, `ready`, `underway` and `criteria` records a `pending` row in `task_checkpoints` and leaves the attempt open
  - Each refusal in D11 is refused with its message: no early review, delivery not running, a commit outside the task's history, a repeat of the newest checkpoint, and a criterion that is not a position of the task's acceptance
  - `avoozl runner report TASK checkpoint --commit SHA --checkpoint FILE` records the same row, and `runner report` help lists it
  - A `process` result in state `checkpoint` records the row at `HEAD` and queues one `send` with "Checkpoint taken. Keep working on the task."
  - Both worker briefs name the checkpoint step only when the task's repository has early review
- [ ] `pf-6.3` Push a checkpoint and open or edit the early review pull request [PF11, PF12] (§D12, §D13)
  - Tests with real git, a bare remote and a fake GitHub: the first checkpoint pushes the claim branch and opens one draft pull request to the task's base, the integration branch when rule 14.1 names one
  - A second checkpoint pushes as a fast-forward and edits the same pull request's body, and no second pull request is opened
  - Three pending checkpoints in one tick cost one push and one write, and an unchanged body costs no write
  - A content hit in the push, the title or the body pushes nothing and writes nothing, and the open pull request stays at the last checkpoint
  - The refused worker gets one message at its next safe turn naming each file and line or commit and the rule, with no matched text
  - A runner without the newest lease pushes nothing, and a full pacer leaves the row `pending`
  - The body matches D13, keeps a person's text after the marker, and lists the approved acceptance with the checkpoint's criteria marked `Ready`
  - A closed early review pull request is not reopened or replaced, and the task shows who closed it
  - Every write is a `land` job through the pacer, and `updatePullRequest` is in the fake GitHub
  - `avoozl rebuild` restores the newest pushed checkpoint from the body
- [ ] `pf-6.4` Turn the early review pull request into the landing pull request [PF13] (§D14, §D15)
  - Tests: a done task's landing entry takes its early review pull request, pushes the verified commit as a fast-forward, and edits the body to the done form
  - Under `draft` it stays a draft with one **Needs you** row, and `releaseDraft` releases it
  - Under `ready` Avoozl marks it ready and waits for a person to merge; under `auto` it marks it ready and merges guarded by the head
  - A required check that ran `skipped` before the newest ready event counts as not run, and landing waits for a run that started after it
  - While the task is in flight the pull request is never in the landing queue, marked ready, merged or armed for auto-merge
  - Feedback on the pull request reaches the task's worker, and a review on a checkpoint's commit names that checkpoint in the message
- [ ] `pf-6.5` Show early review on the task and document it [PF9, PF12.6, PF13.5] (§D10, §D13, §D15)
  - The task drawer shows the early review pull request's link, each checkpoint's number, commit and state, and a refused checkpoint's rules
  - `docs/delivery.md` has an Early review section under Landing with the setting, the body, the change into the landing pull request per `landing.pr`, and the CI guard example
  - `npm run test:ui` and `npm test -- docs-links docs-json` pass
  - Phone and desktop screenshots in light and dark, kept outside git, were shown to the owner before merge
- [ ] `pf-6.6` Add the `early` case field to the kit [PF8.3] (§D9, §D12)
  - `workflow-kit/README.md` lists `early`: the repository's setting, `landing.pr`, the claim's leases, each checkpoint `{commit, ready, criteria}`, the content hits, the open pull request, and the expected `push`, `open`, `edit`, `ready` and `refuse` results
  - `src/app/test/workflow-kit-adapter.ts` runs an early case through Avoozl's early review
- [ ] `pf-6.7` Write the early review kit cases (**PARALLEL**)
  - [ ] `pf-6.7.1` Case for a first checkpoint [22.1, 22.2]
    - `early-first-checkpoint` pushes the claim branch and opens one draft pull request to the task's base, and Avoozl passes it
  - [ ] `pf-6.7.2` Case for a later checkpoint [22.3, 22.4]
    - `early-later-checkpoint` pushes a fast-forward and edits the same pull request without marking it ready, and Avoozl passes it
  - [ ] `pf-6.7.3` Case for a refused checkpoint [22.2]
    - `early-content-refused` pushes nothing and opens nothing, and Avoozl passes it
  - [ ] `pf-6.7.4` Case for feedback on an early review pull request [22.7, 21.1]
    - `early-feedback-routes` delivers a writer's review on the early review pull request to the task's worker, and Avoozl passes it
  - [ ] `pf-6.7.5` Cases for the change into the landing pull request [22.5, 22.6]
    - `early-lands-draft`, `early-lands-ready` and `early-lands-auto` give the D14 results, `early-skipped-check` waits for a run after the ready event, and Avoozl passes them
- [ ] `pf-6.8` Publish the early review cases [PF8.3] (§D9)
  - `docs/github-workflow-scenarios.md` is regenerated by `scripts/kit/scenarios-doc.ts` and shows every early case
  - The Kit coverage table in `docs/github-workflow.md` lists none of 22.1 to 22.7 under "No case"

## Phase 7: Proof

- [ ] `pf-p1` Proof: feedback routing on a scratch repository [PF1 to PF7] (**MANUAL**)
  - Setup: an isolated workspace and a scratch repository in `pr` landing with `draft`; one approved spec with two tasks claimed by this runner, a writer login, a second non-writer login, and a listed bot
  - Action: the writer leaves a review with one line comment on task 1's pull request, the non-writer comments on it, the writer comments on the spec issue naming task 2 in a code span and then comments naming no task; the claim moves to a second machine; the writer comments once more
  - Expected: task 1's worker gets the review and line comment once, at an idle turn; the non-writer's comment shows as not delivered; task 2's worker gets the spec issue comment; the unnamed comment shows on the spec only; after the move only the last comment is sent; the lease commit's `Feedback:` lines match
  - Expected result observed; receipt under `docs/evidence/`, with no image committed
  - Failure means: a comment reaches the wrong worker, reaches a worker twice, is lost on the move, or a stranger's text reaches a worker
- [ ] `pf-p2` Proof: early review on a scratch repository [PF9 to PF13] (**MANUAL**)
  - Setup: an isolated workspace and a scratch repository in `pr` landing with `landing.earlyReview` on, `landing.pr` `ready`, CI jobs guarded on the draft state, and a content rule set with one term; one approved task claimed by this runner, and a coworker login with write access
  - Action: the worker reports a checkpoint; the coworker leaves a review with a line comment; the worker fixes it and reports a second checkpoint; the worker reports a third checkpoint whose commit holds the term; the worker removes it and reports done
  - Expected: the first checkpoint opens one draft pull request with no CI run; the coworker's review reaches the worker at an idle turn, naming checkpoint 1; the second checkpoint edits the same pull request; the third pushes nothing and the worker is told the file, line and rule; at done Avoozl marks the same pull request ready, CI runs on the exact head, and a person merges it
  - Expected result observed; receipt under `docs/evidence/`, with no image committed
  - Failure means: a second pull request opens, a refused checkpoint reaches GitHub, feedback is lost or relayed by hand, or a skipped draft check counts toward landing
