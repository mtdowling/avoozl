---
repo: avoozl
completion: integrated
checks: npm test, git diff --check
---
# Tasks: everything runs without Kiro Crew

Status: Draft

Explicit `after` lists and the manifest's `requires` govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`NK1` to `NK9`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

Two tasks wait on `.kiro/specs/worker-paths/`, which the manifest cannot
name: nk-2.1 needs its wp-1.2, and nk-p2 needs its wp-p1. Each says so in
its text.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, a fake GitHub, and fake executors of both
kinds; run `npm test` and `git diff --check` before landing, and `npm run
test:ui` for UI changes; no real workspace data, machine configuration,
credentials or personal plans in the repository (AGENTS.md). A role's task
reads each limit from the tool the chat calls today and does not copy a
number from this spec. Screen changes need phone and desktop, light and
dark screenshots for owner approval before merge (R92.12). Screenshots are
shown to the owner and never committed (AGENTS.md).

This spec is a draft. Approving it, creating issues and starting agents are
separate acts. Task IDs start with `nk-` so they never collide with the IDs
of the other specs.

## Phase 1: The seam

- [ ] nk-1.1 The role table, and every role's executor from settings [NK1] (§D2)
  - Facts:
    - summary: Phase 1 (The seam). The role table, and every role's executor from settings. See NK1; §D2.
    - done:
      - The source test fails on a module outside the `kirocrew` executor that defaults a request to `kirocrew`; a test fails when `HARNESS_ROLES` holds a role no dispatch reads; the tests of the four roles that already run on `process` pass with their assertions unchanged; a harness saved for the plan reviewer and for review drafts is the one their requests name; screenshots of Settings › Models at 390 and 1280 px, light and dark, go to the owner.
    - checks: npm test, npm run test:ui, git diff --check
  - `src/app/role-table.mjs` with one row per role, read by `processFinish`, the drain's folder rule and `finishProcessSession`; the verifier, reviewers, planner and retro move into it unchanged; every dispatch takes its executor from the pin, `harnesses.<role>` and the project; Settings › Models lists every role.
  - Done when: The source test fails on a module outside the `kirocrew` executor that defaults a request to `kirocrew`; a test fails when `HARNESS_ROLES` holds a role no dispatch reads; the tests of the four roles that already run on `process` pass with their assertions unchanged; a harness saved for the plan reviewer and for review drafts is the one their requests name; screenshots of Settings › Models at 390 and 1280 px, light and dark, go to the owner.
- [ ] nk-1.2 Output files and snapshots for a child, after nk-1.1 [NK3.1, NK3.2, NK3.4, NK5.5] (§D3, §D4)
  - Facts:
    - summary: Phase 1 (The seam). Output files and snapshots for a child. See NK3.1, NK3.2, NK3.4, NK5.5; §D3, §D4.
    - done:
      - Tests with a fake child: an output file within its limit is read and validated; a second file, a path outside `.avoozl/output/`, a file over the limit and an invalid one are each refused with the reason; the result file over 8,192 bytes is still refused; a child cannot write into its snapshot; a write root over a checkout is refused before start.
    - after: nk-1.1
  - The result file's `output` key; one file under `.avoozl/output/`, read once on exit with the role's limit and validator; a read-only `pull-request/` or plan folder the drain fills before start; no write root that holds a git directory.
  - Done when: Tests with a fake child: an output file within its limit is read and validated; a second file, a path outside `.avoozl/output/`, a file over the limit and an invalid one are each refused with the reason; the result file over 8,192 bytes is still refused; a child cannot write into its snapshot; a write root over a checkout is refused before start.

## Phase 2: Roles with a small answer

- [ ] nk-2.1 The falsifier as a child, after nk-1.1 [NK2.1, NK2.5] (§D2)
  - Facts:
    - summary: Phase 2 (Roles with a small answer). The falsifier as a child. See NK2.1, NK2.5; §D2.
    - done:
      - Tests on both executors: a falsifier's verdict opens or holds the same gate; a `process` falsifier's report with a commit field is refused; it writes no file but its result; with every role on `process`, a task with investigate first reaches Go ahead and lands.
    - after: nk-1.1
  - The falsifier's row: a detached copy at the commit, read class, `report` with verdict, evidence and confidence, recorded with no commit. This needs wp-1.2 of `worker-paths`, so that a `process` worker's findings exist for it to judge.
  - Done when: Tests on both executors: a falsifier's verdict opens or holds the same gate; a `process` falsifier's report with a commit field is refused; it writes no file but its result; with every role on `process`, a task with investigate first reaches Go ahead and lands.
- [ ] nk-2.2 The responder and the task summary as children, after nk-1.1 [NK2.2, NK2.3, NK2.5] (§D2)
  - Facts:
    - summary: Phase 2 (Roles with a small answer). The responder and the task summary as children. See NK2.2, NK2.3, NK2.5; §D2.
    - done:
      - Tests on both executors with a fake GitHub: one reply is posted for one request and none for a blocked result; a reply that matches a content rule is held as it is for a chat; the summary is stored and shown; neither child has a credential or a network path.
    - after: nk-1.1
  - Their rows: the responder's reply is posted by Avoozl after today's checks; the summary is stored on the task; both read-only.
  - Done when: Tests on both executors with a fake GitHub: one reply is posted for one request and none for a blocked result; a reply that matches a content rule is held as it is for a chat; the summary is stored and shown; neither child has a credential or a network path.
- [ ] nk-2.3 The issue planner's critique as a child, after nk-1.1 [NK2.4] (§D2)
  - Facts:
    - summary: Phase 2 (Roles with a small answer). The issue planner's critique as a child. See NK2.4; §D2.
    - done:
      - Tests: `critique.md` written by a child is read as a chat's is; a child that writes any other file in the spec folder is refused by its write roots.
    - after: nk-1.1
  - Its row: write root the spec folder's `avoozl/` folder only.
  - Done when: Tests: `critique.md` written by a child is read as a chat's is; a child that writes any other file in the spec folder is refused by its write roots.

- [ ] nk-p1 Proof: investigate first with no Kiro Crew chat, after nk-2.1, nk-2.2, nk-2.3 [NK1, NK2] (§D2)
  - Facts:
    - summary: Phase 2 (Roles with a small answer). Proof: investigate first with no Kiro Crew chat. See NK1, NK2; §D2.
    - done:
      - Expected: (1) each worker reports findings and each falsifier gives a verdict; (2) the first task lands, the second investigates again and then lands; (3) every session has executor `process` and no request for `kirocrew` was written.
      - Expected result observed; receipt under `docs/evidence/`.
    - manual: true
    - completion: person
    - after: nk-2.1, nk-2.2, nk-2.3
  - Setup: as proof P59, an isolated workspace and a scratch repository with a bare remote, with every role on `process` and an approved Claude Code definition, and `worker-paths` wp-1.2 landed. The owner runs it from his own terminal, as in P57.
  - Action: (1) run the tick on a two-task spec with investigate first on; (2) press Go ahead on one task and Investigate again on the other; (3) read the session list.
  - Expected: (1) each worker reports findings and each falsifier gives a verdict; (2) the first task lands, the second investigates again and then lands; (3) every session has executor `process` and no request for `kirocrew` was written.
  - Failure means: a machine with no Kiro Crew must still turn investigate first off.
  - Next decision: none.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 3: Roles with rules about who wrote what

- [ ] nk-3.1 Plan review as a child, after nk-1.2 [NK3.3, NK5.1, NK5.2] (§D3, §D5)
  - Facts:
    - summary: Phase 3 (Roles with rules about who wrote what). Plan review as a child. See NK3.3, NK5.1, NK5.2; §D3, §D5.
    - done:
      - Tests: a child's review with a served model records the round as a chat's does; with no `servedModel` in the definition, or none in the output, the round is skipped with today's reason; a review by the model that wrote the plan is refused; findings over the tool's limit are refused.
    - after: nk-1.2
  - Its row: the plan snapshot, read class, findings and summary in an output file; the definition's `servedModel` field; a round counts only with a served model that differs from the author's.
  - Done when: Tests: a child's review with a served model records the round as a chat's does; with no `servedModel` in the definition, or none in the output, the round is skipped with today's reason; a review by the model that wrote the plan is refused; findings over the tool's limit are refused.
- [ ] nk-3.2 The plan answer as a child, after nk-1.2 [NK5.1, NK5.3] (§D5)
  - Facts:
    - summary: Phase 3 (Roles with rules about who wrote what). The plan answer as a child. See NK5.1, NK5.3; §D5.
    - done:
      - Tests: an answer of "fixed" is recorded only against the revision the child wrote; a child that changed nothing may answer with reasons only; a folder that fails lint stores nothing and opens the same decision a chat's would; an answer for a spec approved meanwhile changes no file.
    - after: nk-1.2
  - Its row: write root the one spec folder; on exit Avoozl lints, stores the revision as that session's, and records each answer from `report`.
  - Done when: Tests: an answer of "fixed" is recorded only against the revision the child wrote; a child that changed nothing may answer with reasons only; a folder that fails lint stores nothing and opens the same decision a chat's would; an answer for a spec approved meanwhile changes no file.
- [ ] nk-3.3 The issue planner's breakdown as a child, after nk-1.2 [NK5.4] (§D2)
  - Facts:
    - summary: Phase 3 (Roles with rules about who wrote what). The issue planner's breakdown as a child. See NK5.4; §D2.
    - done:
      - Tests: a bounded issue writes no folder and records its kind; a broad one stores a folder that lints clean; lint errors reach the same session by `resume` and a clean second try is stored; errors left after two tries open one Needs you item; a definition with no `resume` goes to Needs you at the first error.
    - after: nk-1.2
  - Its row: `report` with kind and reason; for a broad issue the spec folder; lint after exit; errors sent back with `resume` at most twice.
  - Done when: Tests: a bounded issue writes no folder and records its kind; a broad one stores a folder that lints clean; lint errors reach the same session by `resume` and a clean second try is stored; errors left after two tries open one Needs you item; a definition with no `resume` goes to Needs you at the first error.

## Phase 4: Roles that read a pull request

- [ ] nk-4.1 The pull request snapshot, after nk-1.2 [NK4.1, NK4.2, NK4.5] (§D4)
  - Facts:
    - summary: Phase 4 (Roles that read a pull request). The pull request snapshot. See NK4.1, NK4.2, NK4.5; §D4.
    - done:
      - Tests with a fake GitHub: the snapshot holds each part; over the limit the largest diffs are left out and named; the fetch makes no call from the child; the GitHub call counter of RC29 (`radar-coder`, still in force) counts these reads under their own source.
    - after: nk-1.2
  - Avoozl fetches title, body, files, diffs, checks and review comments with its own GitHub client into `pull-request/`, with a size limit and a README that marks it as data; the head SHA is recorded on the session.
  - Done when: Tests with a fake GitHub: the snapshot holds each part; over the limit the largest diffs are left out and named; the fetch makes no call from the child; the GitHub call counter of RC29 (`radar-coder`, still in force) counts these reads under their own source.
- [ ] nk-4.2 Review drafts as a child, after nk-4.1 [NK4.3] (§D4)
  - Facts:
    - summary: Phase 4 (Roles that read a pull request). Review drafts as a child. See NK4.3; §D4.
    - done:
      - Tests on both executors: one pending review is posted with the same body and comments; nothing is submitted; a draft for a head that moved is kept and marked, and posts nothing; a line comment outside the diff is dropped as it is for a chat.
    - after: nk-4.1
  - Its row: read class, body and line comments in an output file; Avoozl posts the pending review, and only for the recorded head.
  - Done when: Tests on both executors: one pending review is posted with the same body and comments; nothing is submitted; a draft for a head that moved is kept and marked, and posts nothing; a line comment outside the diff is dropped as it is for a chat.
- [ ] nk-4.3 The pull request review as a child, after nk-4.1 [NK4.4] (§D4)
  - Facts:
    - summary: Phase 4 (Roles that read a pull request). The pull request review as a child. See NK4.4; §D4.
    - done:
      - Tests: the review is stored and shown; no GitHub write is made; the Kiro Crew chat path is unchanged.
    - after: nk-4.1
  - Its row: read class, the review in an output file, stored with the session; shown with the session and by `avoozl show`.
  - Done when: Tests: the review is stored and shown; no GitHub write is made; the Kiro Crew chat path is unchanged.

## Phase 5: Definitions

- [ ] nk-5.1 Read-only roles on each shipped definition, after nk-1.2 [NK6] (§D3)
  - Facts:
    - summary: Phase 5 (Definitions). Read-only roles on each shipped definition. See NK6; §D3.
    - done:
      - Tests: a definition with no way to write the result is refused for a read role with the reason, and still offered for a write role; Settings › Models shows that reason; each shipped definition is listed as proved or not proved per role class.
    - after: nk-1.2
  - A definition says how a read-only child writes its result and output; one that does not is not offered for a read-only role; `examples/harnesses/codex.json` gains what it needs or is marked.
  - Done when: Tests: a definition with no way to write the result is refused for a read role with the reason, and still offered for a write role; Settings › Models shows that reason; each shipped definition is listed as proved or not proved per role class.

## Phase 6: Notifications

- [ ] nk-6.1 Send notifications from the headless tick [NK7.1, NK7.6, NK7.7, NK7.8, NK7.9] (§D6)
  - Facts:
    - summary: Phase 6 (Notifications). Send notifications from the headless tick. See NK7.1, NK7.6, NK7.7, NK7.8, NK7.9; §D6.
    - done:
      - Tests: a headless tick with a fake sink sends a queued decision once; with no sink, `status` shows the count and the oldest age; forty waiting items and a new sink give one notification; a sink that throws does not stop the tick or a second sink, and is tried again later; the Kiro Crew push is unchanged.
  - The headless tick calls `notifications.deliver`; a per-sink record of what was sent; `avoozl status` shows what waits; a backlog becomes one notification; a failing sink backs off; `src/web-notifications.mjs` and its test go.
  - Done when: Tests: a headless tick with a fake sink sends a queued decision once; with no sink, `status` shows the count and the oldest age; forty waiting items and a new sink give one notification; a sink that throws does not stop the tick or a second sink, and is tried again later; the Kiro Crew push is unchanged.
- [ ] nk-6.2 Command and webhook sinks, after nk-6.1 [NK7.2, NK7.3, NK7.4, NK7.5] (§D6)
  - Facts:
    - summary: Phase 6 (Notifications). Command and webhook sinks. See NK7.2, NK7.3, NK7.4, NK7.5; §D6.
    - done:
      - Tests: `notifications.sinks` in `.avoozl.json` is refused naming the machine file; a title with shell characters reaches the command as one argument; a webhook to plain `http` on another host is refused when the configuration loads; the payload holds only channel, title, ID and time; a title that matches a content rule is held; the link is the page's address with the page on and the show command with it off; the schema parity test passes.
    - after: nk-6.1
  - `notifications.sinks` in the machine configuration and its schema; a `command` sink run without a shell and with a timeout; a `webhook` sink to `https` or loopback; the small payload; links that are not Kiro Crew paths.
  - Done when: Tests: `notifications.sinks` in `.avoozl.json` is refused naming the machine file; a title with shell characters reaches the command as one argument; a webhook to plain `http` on another host is refused when the configuration loads; the payload holds only channel, title, ID and time; a title that matches a content rule is held; the link is the page's address with the page on and the show command with it off; the schema parity test passes.

## Phase 7: What needs Kiro Crew

- [ ] nk-7.1 The table, and no silent queue, after nk-1.1 [NK8] (§D7)
  - Facts:
    - summary: Phase 7 (What needs Kiro Crew). The table, and no silent queue. See NK8; §D7.
    - done:
      - Tests: a `kirocrew` request on a headless tick opens one item across three ticks and starts nothing; Run on from a person sets the role's harness and the next tick starts the session, and from MCP it is refused; a test fails when a module calls a Kiro Crew reader for an operation outside the table; once nk-2.1 to nk-4.3 have landed the table holds the four rows of NK8.4.
    - after: nk-1.1
  - `src/app/needs-kirocrew.mjs`; a headless tick that finds a `kirocrew` request opens one Needs you item per role with the person-only **Run on**; `avoozl status` says whether Kiro Crew is reachable and lists what waits on it.
  - Done when: Tests: a `kirocrew` request on a headless tick opens one item across three ticks and starts nothing; Run on from a person sets the role's harness and the next tick starts the session, and from MCP it is refused; a test fails when a module calls a Kiro Crew reader for an operation outside the table; once nk-2.1 to nk-4.3 have landed the table holds the four rows of NK8.4.

- [ ] nk-p2 Proof: all of Avoozl on a machine with no Kiro Crew, after nk-p1, nk-3.1, nk-3.2, nk-3.3, nk-4.2, nk-4.3, nk-5.1, nk-6.2, nk-7.1 [NK1 to NK9] (§D8)
  - Facts:
    - summary: Phase 7 (What needs Kiro Crew). Proof: all of Avoozl on a machine with no Kiro Crew. See NK1 to NK9; §D8.
    - done:
      - Expected: (1) to (5) each step finishes and every session has executor `process`; the pending review is on GitHub and not submitted; (6) the file holds one line per decision and failure, each with only a channel, a title, an ID and a time, and `status` shows nothing waiting on Kiro Crew; (7) the receipt lists each role Codex ran and each it could not, with the reason.
      - Expected result observed; receipt under `docs/evidence/`.
    - manual: true
    - completion: person
    - after: nk-p1, nk-3.1, nk-3.2, nk-3.3, nk-4.2, nk-4.3, nk-5.1, nk-6.2, nk-7.1
  - Setup: a machine user with no Kiro Crew installed; an isolated workspace, a scratch GitHub repository, approved Claude Code and Codex definitions, the supervisor with the tick, one `command` sink that appends to a file, and `worker-paths` wp-p1 landed. The owner runs it from his own terminal.
  - Action: (1) start a spec from a goal; (2) let the plan review run with a second model and answer one finding; (3) approve from the command line; (4) run the tick until the tasks land, with investigate first on; (5) label a pull request for a review draft and ask for a reply on an issue; (6) read the sink's file and `avoozl status`; (7) repeat steps 1 to 5 with every role on Codex.
  - Expected: (1) to (5) each step finishes and every session has executor `process`; the pending review is on GitHub and not submitted; (6) the file holds one line per decision and failure, each with only a channel, a title, an ID and a time, and `status` shows nothing waiting on Kiro Crew; (7) the receipt lists each role Codex ran and each it could not, with the reason.
  - Failure means: some part of Avoozl still needs Kiro Crew and does not say so.
  - Next decision: whether Requirement 98, "Kiro Crew stays the only UI", is retired once `standalone-web` has its own proof.
  - Done when: Expected result observed; receipt under `docs/evidence/`.
