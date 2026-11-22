---
repo: avoozl
---
# Tasks: everything runs without Kiro Crew

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`NK1` to `NK8`, in `requirements.md`); `D` sections
refer to this spec's `design.md`, `R` numbers to
`.kiro/specs/avoozl/requirements.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, a fake GitHub, and fake executors of both
kinds; Avoozl runs the repository's checks; no real workspace data, machine
configuration, credentials or personal plans in the repository (AGENTS.md).

Task IDs start with `nk-` so they never collide with the IDs of the other
specs.

## Phase 1: The seam

- [x] `nk-1.1` The role table, and every role's executor from settings [NK1] (§D2)
  - The source test fails on a module outside the `kirocrew` executor that defaults a request to `kirocrew`; a test fails when a role table row is read by no dispatch; a harness saved for a role wins over the repository's executor; Settings › Models lists every row.
  - `src/app/agents/role-table.ts` with one row per role, read by the child's brief, the drain's folder rule and `finishProcessSession`; every dispatch takes its executor from the pin, the role's saved harness and the repository.
- [x] `nk-1.2` Output files and snapshots for a child, after nk-1.1 [NK3.1, NK3.2, NK3.4] (§D3, §D4)
  - Tests with a fake child: an output file within its limit is read and validated; a second file, a name that is not a plain file name, a file over the limit and an invalid one are each refused with the reason; the result file over 8,192 bytes is still refused.
  - The result file's `output` key; one file under `.avoozl/output/`, read once on exit with the row's limit and validator; a read-only snapshot folder the drain fills before start.

## Phase 2: The responder

- [x] `nk-2.2` The responder as a child, after nk-1.1 [NK2.2, NK2.5] (§D2)
  - Tests on both executors with a fake GitHub: one reply is posted for one request and none for a blocked result; a reply that matches a content rule is held as it is for a chat; the child has no credential or network path.
  - Its row: read-only and offline in a detached copy at the base branch; Avoozl posts the reply after the checks a chat's reply gets.

## Phase 3: Definitions

- [x] `nk-5.1` Read-only roles on each shipped definition, after nk-1.2 [NK6] (§D3)
  - Tests: a definition with no way to write the result is refused for a read role with the reason, and still offered for a write role; Settings › Models shows that reason; each shipped definition lists the role classes it is proved for.
  - A definition says how a read-only child writes its result and output (`resultAllow`); one that does not is not offered for a read-only role; `examples/harnesses/codex.json` lists `proved`.

## Phase 4: Notifications

- [x] `nk-6.1` Send notifications from the tick pass [NK7.1, NK7.6, NK7.7, NK7.8] (§D6)
  - Tests: a tick with a fake sink sends a queued decision once; with no sink, `status` shows the count and the oldest age; forty waiting items and a new sink give one notification; a sink that throws does not stop the tick or a second sink, and is tried again later; the Kiro Crew push marks each row sent, one push per row.
  - The tick pass calls `notifications.deliver`; a per-sink record of what was sent; `avoozl status` shows what waits; a backlog becomes one notification; a failing sink backs off.
- [x] `nk-6.2` Command and webhook sinks, after nk-6.1 [NK7.2, NK7.3, NK7.4, NK7.5] (§D6)
  - Tests: `notifications.sinks` in `.avoozl.json` is refused naming the machine file; a title with shell characters reaches the command as one argument; a webhook to plain `http` on another host is refused when the configuration loads; the payload holds only channel, title, ID, time and link; a title that matches a content rule is held; the link is the page's address with the page on and the show command with it off; the schema parity test passes.
  - `notifications.sinks` in the machine configuration and its schema; a `command` sink run without a shell and with a timeout; a `webhook` sink to `https` or loopback; the small payload; links that are not Kiro Crew paths.

## Phase 5: What needs Kiro Crew

- [x] `nk-7.1` The table, and no silent queue, after nk-1.1 [NK8] (§D7)
  - Tests: a `kirocrew` request on a headless tick opens one item across three ticks and starts nothing; Run on from a person moves the role and cancels its waiting `kirocrew` start, and from MCP it is refused; a test fails when a module calls a Kiro Crew reader for an operation outside the table; the table holds its one part, then each role that cannot run as a child.
  - `src/app/tick/needs-kirocrew.ts`; a tick with no Kiro Crew seen lately that finds a `kirocrew` request opens one Needs you item per role with the person-only **Run on**; `avoozl status` says whether Kiro Crew is reachable and lists what waits on it.
