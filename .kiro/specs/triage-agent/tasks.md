---
repo: avoozl
completion: integrated
checks: npm test, git diff --check
---
# Tasks: the triage agent and the GitHub pages

Status: Draft

Explicit `after` lists and each task's `after` fact govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`TA1` to `TA12`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

Two tasks need parts of `.kiro/specs/without-kirocrew/` that a manifest
cannot name: ta-4.1 needs the role table and the snapshot (nk-1.1, nk-1.2),
and ta-4.4 needs the pull request snapshot (nk-4.1). Each says so in its
text. Removal (Phase 5) waits for the first proof.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces, a fake GitHub that counts calls by kind (REST, conditional,
GraphQL, write), and fake executors; run `npm test` and `git diff --check`
before landing, and `npm run test:ui` for UI changes; no real workspace
data, machine configuration, credentials or personal plans in the
repository (AGENTS.md). Every task that reads or writes GitHub states, in
its pull request, the calls it adds per tick and per item. Screen changes
need phone and desktop, light and dark screenshots for owner approval
before merge (R92.12); screenshots are shown to the owner and never
committed (AGENTS.md).

This spec is a draft. Approving it, creating issues and starting agents are
separate acts. Task IDs start with `ta-` so they never collide with the IDs
of the other specs.

## Phase 1: Fixes without files

- [ ] ta-1.1 One fix record, from an issue or from text [TA9] (§D5)
  - Facts:
    - done:
      - Tests: a fix from text and one from an issue each run, verify and land with the two acceptance lines; a version 1 record loads and lands; the definition hash changes when the text changes; Make this a spec writes a folder that lints clean and archives the fix with a link; screenshots of New fix go to the owner.
    - checks: npm test, npm run test:ui, git diff --check
  - `task.fix` version 2 with a source of an issue or text; version 1 loads as version 2; **New fix** beside **New spec**; `avoozl fix "TEXT" --repo ID`; **Make this a spec**.

## Phase 2: Reading GitHub within its limits

- [ ] ta-2.1 Changed items by one conditional list per repository [TA10.1, TA10.2] (§D7)
  - Facts:
    - done:
      - Tests with the counting fake GitHub: an unchanged repository costs one conditional call answered 304 and nothing else; 150 changed items cost two calls; a closed item leaves the open list; the source has no search call on this path.
  - An item table fed by the open issues and pull requests updated since a stored cursor, with the cached ETag; no search API call.
- [ ] ta-2.2 Batched pull request counts and one cached detail query, after ta-2.1 [TA10.3, TA10.4, TA10.5] (§D7)
  - Facts:
    - done:
      - Tests: 120 changed pull requests cost three GraphQL queries; opening an unchanged item twice costs one query; an item whose `updatedAt` moved is read again; the diff is read once per head.
    - after: ta-2.1
  - One GraphQL query for the changed pull requests' counts, up to 50 a query; one GraphQL detail query per item cached by `updatedAt`; a pull request's diff cached by head commit.
- [ ] ta-2.3 Triage yields, and its calls are counted, after ta-2.1 [TA10.6, TA10.7] (§D7)
  - Facts:
    - done:
      - Tests: with 150 calls left and a landing read waiting, triage reads nothing and starts nothing; with 4,000 left it proceeds; the counts by kind match the fake's.
    - after: ta-2.1
  - Below the low mark the tick starts no triage run and reads for triage only when nothing else waits; the client counts triage's REST, GraphQL and write calls per day.

## Phase 3: The Issues and Pull requests pages

- [ ] ta-3.1 List and detail, read only, after ta-2.2 [TA8.1, TA8.2, TA8.3, TA8.7] (§D8)
  - Facts:
    - done:
      - UI tests from fixture items show each part; the owner queue filter shows only held items; a search finds an item by a word in its body; screenshots of both pages at 390 and 1280 px, light and dark, go to the owner.
    - checks: npm test, npm run test:ui, git diff --check
    - after: ta-2.2
  - Two pages with one layout: the list with its sorts, filters and search, and the detail with summary, body, checks, reviewers, assignees, labels, branches, counts and timeline.
- [ ] ta-3.2 Actions, after ta-3.1, ta-1.1 [TA8.4, TA8.5, TA8.6] (§D8)
  - Facts:
    - done:
      - Tests: each action makes one write of the right kind on the fake GitHub and records it on the item; Approve, Request changes and Close are refused over MCP and from an agent; Fix on an issue starts a fix from it; screenshots go to the owner.
    - checks: npm test, npm run test:ui, git diff --check
    - after: ta-3.1, ta-1.1
  - Fix, Answer, Make this a spec, Run triage again, Assign to me, Edit labels, Snooze, Close with a reason, and on a pull request Review, Edit review, Approve, Request changes, Comment, Close; Review as spec kept; each write through the pacer.

## Phase 4: The agent

- [ ] ta-4.1 The `triage` role, one run per new item [TA1, TA7] (§D2, §D3)
  - Facts:
    - done:
      - Tests with fake executors: a new item gets one run and an unchanged item none; the 51st new item of a day waits with one Needs you item; a result that is not valid records the error and writes nothing; a write that matches a content rule is held; the run has no network and no credentials on `process`.
      - Tests: a comment by the item's author or a collaborator starts a run; a comment by anyone else starts none and is in the next run's snapshot.
  - The role on either executor with the snapshot and the brief's context; one result shape and its validator; `triage.agent`, `triage.dailyRuns`, `triage.labels` and `triage.reviews` per repository; content rules on every write; the author's permission read with the item. Needs nk-1.1 and nk-1.2 of `without-kirocrew`.
- [ ] ta-4.2 Questions, after ta-4.1 [TA2] (§D3)
  - Facts:
    - done:
      - Tests: an answer citing a repository file is posted once; an answer citing nothing is held; Answer on the page posts an edited draft.
    - after: ta-4.1
  - An answer with citations is posted with its agent line; one without goes to the owner queue as a draft.
- [ ] ta-4.3 Reproduce, then fix, after ta-4.1, ta-1.1 [TA3] (§D4)
  - Facts:
    - done:
      - Tests with real git and a bare remote: a collaborator's reproduced bug lands with the reproduction passing; a stranger's stops at Fix ready; a reproduction that passes on the base is not a reproduction; a command named in a result is never run, and the sandboxed checks reach no network; a second missing-information case posts no second question; a fix touching a protected path waits for the owner.
    - after: ta-4.1, ta-1.1
  - Avoozl runs the repository's checks without and with the reproduction file, sandboxed; a reproduced, bounded bug starts a fix with the reproduction as its first commit and check; a collaborator's lands by the landing setting, anyone else's waits as Fix ready; one request for information at most.
- [ ] ta-4.4 Reviews of other people's pull requests, after ta-4.1 [TA4] (§D6)
  - Facts:
    - done:
      - Tests: a 120-line change gets a full review; a 900-line one gets a partial review whose first line says so and lists what it did not cover; no review approves or requests changes; a line comment outside the diff is dropped; a pull request opened by Avoozl gets no triage review.
    - after: ta-4.1
  - The review from the snapshot in an output file; full or partial by size and protected paths; posted as one comment review with line comments, or kept as a draft under `triage.reviews: draft`. Needs nk-4.1 of `without-kirocrew`.
- [ ] ta-4.5 The owner queue and its notice, after ta-4.1, ta-3.1 [TA5] (§D8)
  - Facts:
    - done:
      - Tests: a feature, an unciteable answer, a stranger's fix and a review needing a decision each enter the queue once with their reason; each sends one notification; screenshots of Home's count go to the owner.
    - checks: npm test, npm run test:ui, git diff --check
    - after: ta-4.1, ta-3.1
  - Items the agent hands over, with class and reason; one count on Home and in Needs you; one notification per item.
- [ ] ta-4.6 The Triage agent page, Pause and Stop all, after ta-4.1, ta-2.3 [TA6] (§D2)
  - Facts:
    - done:
      - UI tests show each part; Pause stops new runs before the next tick and holds a running session's writes for the owner; Stop all does the same everywhere; a pulled stop line stops triage in its scope; screenshots go to the owner.
      - Tests: an item closed or merged while its run runs stops the run, sends none of its writes and records why.
    - checks: npm test, npm run test:ui, git diff --check
    - after: ta-4.1, ta-2.3
  - Runs in progress, every run with its item, class, reason, writes and result, counts per day, caps left and calls used; Pause per repository and Stop all; Stop the line stops triage in its scope.

- [ ] ta-p1 Proof: triage on a scratch repository, after ta-1.1, ta-2.3, ta-3.2, ta-4.2, ta-4.3, ta-4.4, ta-4.5, ta-4.6 [TA1 to TA10] (§D2 to §D8)
  - Facts:
    - done:
      - Expected: (1) the question is answered with a citation; the collaborator's bug is reproduced, fixed and landed; the stranger's bug waits as Fix ready; the feature goes to the owner; the hostile issue changes nothing outside its rules; the small pull request gets a full review and the large one a partial review that says so; (2) each page action makes its one write; (3) the page's call counts stay under one hundred for the hour and show every write.
      - Expected result observed; receipt under `docs/evidence/`, with no image committed.
    - manual: true
    - after: ta-1.1, ta-2.3, ta-3.2, ta-4.2, ta-4.3, ta-4.4, ta-4.5, ta-4.6
  - Setup: a scratch public repository with a small test suite and docs; issues for each class, written by a collaborator and by a second account without write access, including one that asks the agent to do something it must not; two pull requests from the second account, one small and one large; the triage agent on, on Claude Code.
  - Action: (1) run the tick for an hour; (2) act on the owner queue from the pages; (3) read the Triage agent page.
  - Expected: (1) the question is answered with a citation; the collaborator's bug is reproduced, fixed and landed; the stranger's bug waits as Fix ready; the feature goes to the owner; the hostile issue changes nothing outside its rules; the small pull request gets a full review and the large one a partial review that says so; (2) each page action makes its one write; (3) the page's call counts stay under one hundred for the hour and show every write.
  - Failure means: the agent cannot be left alone on a public repository, or it costs GitHub calls the owner cannot afford.
  - Next decision: whether to remove the old ways in (Phase 5).

## Phase 5: One way in

- [ ] ta-5.1 Remove label commands, after ta-p1 [TA11.1, TA11.4] (§D9)
  - Facts:
    - done:
      - Tests: a file with rules, Who counts and label names loads and they are ignored; each removed operation and command answers with its line; no tick step reads a label as an order; the pull request lists what each deleted test covered and where it is covered now.
    - after: ta-p1
  - Trigger rules and their actions, Who counts for orders, the managed and plan labels, the review label and the label-triggered steps go; the planner, breakdown and responder stay as roles the agent and the page start.
- [ ] ta-5.2 Remove the Issue Radar integration and public crews, after ta-p1 [TA11.2, TA11.3, TA11.4] (§D9)
  - Facts:
    - done:
      - Tests: Radar settings load and are ignored; the content hook refuses a matching write as it does today; no source file imports a removed module; `kirocrew-app/app.json` holds no Issue Radar grant; the pull request lists what each deleted test covered and where it is covered now.
    - after: ta-p1
  - The `radar-*` modules, Send to Issue Radar, the crew views and strip, the escalation intake, Settings › Issue Radar and the app grant go; public crews go except the content hook, which moves to `src/app/content-hook.mjs`.
- [ ] ta-5.3 The old spec, the product spec and the docs, after ta-5.1, ta-5.2 [TA11.5, TA12] (§D9)
  - Facts:
    - done:
      - `node scripts/spec-lint.mjs` reports 0 errors; a search of `src/`, `kirocrew-app/`, `README.md` and `docs/*.md` finds no `radar-coder` citation, no Send to Issue Radar and no label-command section.
    - after: ta-5.1, ta-5.2
  - `.kiro/specs/radar-coder/` deleted and code comments citing it renamed; Requirements 49, 52, 85, 91.6, 92, 103, 107 and 110 marked with what changed; README and policies describe the agent, the pages and fixes.
