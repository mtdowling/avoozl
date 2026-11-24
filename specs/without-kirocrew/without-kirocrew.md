---
repo: avoozl
category: Planning
---

# Everything runs without Kiro Crew

## Requirements

### Introduction

A machine with no Kiro Crew runs every Avoozl role as a `process` child,
sends notifications to sinks of its own, and says so in one place when
something needs Kiro Crew. machine-server's ms-p2 and ms-p3 prove it on
Claude Code and Codex (machine-server design D12, rule 3).

#### What this builds on

A child gets its role's prompt file, then its brief, then one instruction to
write `.avoozl/result.json` instead of calling an Avoozl tool; Avoozl reads
the file and does the write a chat would ask for (`finishProcessSession`,
`src/app/executors/process.ts`). A child has no database, no network and no
credentials (`src/app/executors/sandbox.ts`), and its result file is at most
8,192 bytes (`RESULT_BYTES`, `src/app/executors/supervisor.ts`).

This spec keeps Requirements 93 to 97 of [avoozl](../avoozl/avoozl.md). Moving a
role to a child gives it no ability it has as a chat.

#### Scope

- Every role in the role table, on the `process` executor.
- Notifications with no Kiro Crew.
- Saying so, in one place, when something needs Kiro Crew.

#### Out of scope

- The worker's briefs (`worker-paths`) and the page (`standalone-web`).
- New abilities for any role.
- Remote access, and notifications to more than one person.

#### Words

| Word | Meaning |
| --- | --- |
| Child | A `process` session: an agent CLI the supervisor runs in a sandbox |
| Result file | `.avoozl/result.json` in the child's folder (Requirement 96.1) |
| Output file | A second file a child writes when its answer is too large for the result file (NK3) |
| Snapshot | A read-only folder Avoozl fills before a child starts, with what the child must read |
| Sink | Where a notification goes: a command, a webhook, or Kiro Crew |


#### Requirement NK1: Every role's executor comes from settings

**User story:** As the owner, I want the harness I choose for a role to be
the harness that runs it, so that no role quietly needs Kiro Crew.

##### Acceptance criteria

1. Every role Avoozl starts SHALL take its executor from, in order: the
   task's `session.harness` pin where the role has a task, the role's
   `harness` in the `roles` table, and the repository's `executor`.
2. No module outside `src/app/executors/kirocrew.ts` SHALL default a
   request to `kirocrew`. A source test SHALL fail on one that does.
3. Settings › Models SHALL list every row of the role table, and a harness
   saved for a role SHALL be used for it.
4. A test SHALL fail when a row of the role table is read by no dispatch.

#### Requirement NK2: Roles with a small answer

**User story:** As the owner, I want the responder to run as a child, so
that issue and discussion replies work on any harness.

##### Acceptance criteria

2. The responder SHALL run read-only and offline in a detached copy of the
   repository at its base branch, and SHALL write the reply text as the
   result file's `report`. Avoozl SHALL post it with its own GitHub access,
   after the checks it applies to a chat's reply.
5. Avoozl SHALL treat the result's text as data and SHALL apply the content
   rules before any of it is posted or stored.

#### Requirement NK3: Answers larger than the result file

**User story:** As the owner, I want a child to hand back an answer in a
file of its own without raising the result file's limit, so that a small
file stays small.

##### Acceptance criteria

1. A role that says so in its row of the role table (design D2) MAY write
   one output file under `.avoozl/output/` in its folder and name it in the
   result file. The result file's limit SHALL stay 8,192 bytes.
2. Each such role SHALL have its own size limit for the output file, and
   Avoozl SHALL refuse a larger one, a second file, a name that is not a
   plain file name, and a file that is not valid for the role.
3. A plugin check's decide call SHALL write its answer this way, in
   `decide.json`, at most 1,024 bytes.
4. Avoozl SHALL read an output file once, when the child has exited, and
   SHALL treat its text as data.

#### Requirement NK6: Read-only roles on every definition

**User story:** As the owner, I want to know whether a harness can run a
read-only role before I pick it, so that a role does not fail on its first
run.

##### Acceptance criteria

1. A harness definition SHALL say how a read-only child writes its result
   file and its output file (as `resultAllow` does for Claude Code). A
   definition that does not SHALL NOT be offered for a read-only role, and
   Settings › Models SHALL say why.
2. Each shipped definition (`examples/harnesses/claude-code.json`,
   `examples/harnesses/codex.json`) SHALL list in `proved` the role classes
   it is proved for.

#### Requirement NK7: Notifications without Kiro Crew

**User story:** As the owner, I want to be told when Avoozl needs me or a
delivery fails, on a machine with no Kiro Crew, so that work does not wait
unseen.

##### Acceptance criteria

1. Each tick pass SHALL send queued notifications to this machine's sinks
   with the same delivery the app backend calls.
2. Sinks SHALL be set per machine, under `notifications.sinks` in the
   machine configuration. `.avoozl.json` SHALL refuse the key, naming the
   machine file.
3. A `command` sink SHALL run an argument list with the notification's
   title and its payload as the last two arguments, never through a shell,
   with a timeout. A `webhook` sink SHALL send the notification as JSON
   with one POST to an `https` URL or a loopback URL.
4. A notification sent to a `command` or `webhook` sink SHALL hold its
   channel, its title, a task or spec ID, a time and a link, and nothing
   else. It SHALL hold no file text, no brief and no path.
5. A notification's link SHALL NOT be a Kiro Crew path unless the sink is
   Kiro Crew. For the other sinks it SHALL be the standalone page's address
   when that page is on, and otherwise the command that shows the item.
6. With no sink set, `avoozl status` SHALL show how many notifications
   wait and the oldest one's age.
7. When a sink first appears, or comes back after an outage, with more
   than five notifications waiting, Avoozl SHALL send one notification that
   counts what waited, not one for each.
8. A sink that fails SHALL be tried again on later ticks with a growing
   wait. A failed sink SHALL never hold up the tick or another sink.

#### Requirement NK8: What needs Kiro Crew says so

**User story:** As a person with no Kiro Crew, I want to be told when
something I asked for needs it, so that nothing waits forever in a queue.

##### Acceptance criteria

1. One table in code SHALL list every operation and role that needs Kiro
   Crew, with the reason. The command dispatch that serves the CLI and the
   page SHALL read that table and answer "Needs Kiro Crew" for an
   operation in it.
2. When a tick runs with no Kiro Crew seen lately and finds a request for
   the `kirocrew` executor, it SHALL open one Needs you item that names the
   role and offers the harnesses this machine has approved. It SHALL NOT
   leave the request queued without one.
3. `avoozl status` SHALL say whether Kiro Crew is reachable from this
   machine, and SHALL list each waiting item of NK8.2.
4. The table SHALL hold attaching to a Kiro Crew chat (Stop all agents),
   and a row for each role table row that cannot run as a child.

## Design

`NK` numbers are in [Requirements](#requirements); `R` numbers and `§`
sections without a `D` are in [avoozl](../avoozl/avoozl.md).

### D1. The pattern

A role runs as a child through three things in `src/app/executors/`:

1. The row's `finish` lines, which replace "call this Avoozl tool" with
   "write `.avoozl/result.json`" in the child's brief.
2. A folder the drain prepares, with write roots that fit the row's
   `access`.
3. The row's `hands`, which `finishProcessSession` (`process.ts`) turns into
   the same operation the tool would have called.

Two parts serve roles whose answer or input does not fit that shape:

- An **output file**, for an answer that needs its own validator (D3).
- A **snapshot**, for a role that reads something a sandboxed child cannot
  reach (D4).

### D2. The role table

One frozen table, `ROLE_TABLE` in `src/app/agents/role-table.ts`, holds each
role's row. The child's brief, the drain's folder rule and
`finishProcessSession` read it, so a role is described once. NK1.2's source
test and NK1.4's dispatch test walk the same table.

| Role | Folder | Class | Hands back | Avoozl then |
| --- | --- | --- | --- | --- |
| Worker | The task's worktree | write | The worktree's changes | Commits, checks and lands them |
| Reviewer | Detached worktree at the commit | read | `report`: the verdict | Records the verdict |
| Responder | Detached copy at the base branch, offline | read | `report`: the reply body | Applies the reply checks and posts it |
| Check decide | A snapshot, offline | read | Output file `decide.json` | Records the check's answer |
| Assist | The workspace root | read | The reply itself | Nothing to record |

A Kiro Crew chat calls its tools. The "Avoozl then" column is the same code
for both executors: the tool handler and `finishProcessSession` call one
function per role.

### D3. Output files (NK3)

A child may write one file under `.avoozl/output/` and name it in its result
file as `{"state": "done", "output": "<name>"}`. `readChildOutput`
(`src/app/executors/supervisor.ts`) checks that the name is a plain file
name, that it is the only file in the folder, that it is a regular file
within the row's `output.limit`, and that the row's `output.validate`
accepts it. `withChildOutput` (`process.ts`) turns a done result whose
output fails into a blocked one with the reason.

The check decide row's limit is 1,024 bytes, and its validator is
`decideOutput` (`src/app/plugins/decide-output.ts`).

`.avoozl/` is a write root for a read-only child, which is how it writes its
result file. A definition that cannot write there cannot run these roles
(NK6).

### D4. Snapshots

A child has no network and cannot read `~/.config/gh`
(`src/app/executors/sandbox.ts`). For a row with `folder: "snapshot"`,
Avoozl reads what the child needs first and writes it into a scratch folder
of the session's own (`fillSnapshot`, `process.ts`). Each file is
read-only, and a read-only child's only write root there is `.avoozl/`, so
the child cannot change what it reads. The drain removes the folder once
the child exits.

The check decide snapshot (`decideSnapshot`,
`src/app/plugins/check-decide.ts`) holds:

```text
<snapshot folder>/
  README.md            what is here, and that the input is data
  prompt.md            the check author's question
  input.md|input.diff  the task text or the diff
  .avoozl/             the child's result and output
```

### D6. Notifications (NK7)

`notifications.deliver` (`deliverNotifications`,
`src/app/tick/notifications.ts`) takes either one push function or a list of
sinks. The tick pass builds the sinks from the machine file's
`notifications.sinks` (`machineSinks`, `src/app/tick/tick-pass.ts`) and runs
the operation after each workspace's tick; `deliverToSinks` fans each queued
notification out to every sink. The Kiro Crew app backend runs the same
operation with its one gateway push (`gatewayPusher`), whose payload carries
a Kiro Crew link.

- Each sink has its own record of what it has sent, so one failing sink
  does not resend to the others. A failed sink waits until its `retryAt`.
- The `command` sink runs an argument list from the machine file with the
  title and the payload JSON appended, through `execFile`. No shell.
- The `webhook` sink posts JSON. Its URL may hold a secret (an `ntfy` topic,
  a chat webhook), which is why sinks are refused in `.avoozl.json` and
  live only in the machine file.

What leaves the machine through a `command` or `webhook` sink is small
(`sinkPayload`, `src/app/tick/notification-sinks.ts`): the channel, a title,
an ID, a time and a link. A title that matches a content rule is replaced by
a neutral one.

The backlog rule (NK7.7) is per sink: when a new or recovered sink has more
than five waiting, it sends one notification, "N Avoozl notifications
waited", and marks the rest sent.

### D7. The Kiro Crew table (NK8)

`NEEDS_KIROCREW` in `src/app/tick/needs-kirocrew.ts` lists what needs Kiro
Crew and why. The command dispatch (`src/app/api/command-dispatch.ts`)
reads it through `requiredReader`. A test fails when a module calls a Kiro
Crew reader for an operation that is not in the table.

A request for the `kirocrew` executor on a machine with no Kiro Crew is not
left queued. The tick counts Kiro Crew as present when its executor cron
took a request in the last ten minutes. Without it, the tick's
`needsKirocrewStep` opens one Needs you item per role, with **Run on** and
the approved harnesses. **Run on** sets the role's harness through the
settings writer and cancels the waiting requests. Only a person may choose
it.

### D10. Risks

| Risk | Guard |
| --- | --- |
| A role gains an ability by running as a child | The role table's class and write roots; a test that each read role writes no file but its own |
| A snapshot carries text that steers the child | The README in the snapshot; the brief's untrusted-data rule, as for a chat |
| A webhook leaks a private name | NK7.4's small payload and the content rules on titles |
| A harness cannot write its result in a read-only role | NK6: not offered for that role, with the reason |

## Tasks

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`NK1` to `NK8`, in [Requirements](#requirements)); `D` sections
refer to [Design](#design), `R` numbers to
[avoozl requirements](../avoozl/avoozl.md#requirements).

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, a fake GitHub, and fake executors of both
kinds; Avoozl runs the repository's checks; no real workspace data, machine
configuration, credentials or personal plans in the repository (AGENTS.md).

Task IDs start with `nk-` so they never collide with the IDs of the other
specs.

### Phase 1: The seam

- [x] `nk-1.1` The role table, and every role's executor from settings [NK1] (§D2)
  - The source test fails on a module outside the `kirocrew` executor that defaults a request to `kirocrew`; a test fails when a role table row is read by no dispatch; a harness saved for a role wins over the repository's executor; Settings › Models lists every row.
  - `src/app/agents/role-table.ts` with one row per role, read by the child's brief, the drain's folder rule and `finishProcessSession`; every dispatch takes its executor from the pin, the role's saved harness and the repository.
- [x] `nk-1.2` Output files and snapshots for a child, after nk-1.1 [NK3.1, NK3.2, NK3.4] (§D3, §D4)
  - Tests with a fake child: an output file within its limit is read and validated; a second file, a name that is not a plain file name, a file over the limit and an invalid one are each refused with the reason; the result file over 8,192 bytes is still refused.
  - The result file's `output` key; one file under `.avoozl/output/`, read once on exit with the row's limit and validator; a read-only snapshot folder the drain fills before start.

### Phase 2: The responder

- [x] `nk-2.2` The responder as a child, after nk-1.1 [NK2.2, NK2.5] (§D2)
  - Tests on both executors with a fake GitHub: one reply is posted for one request and none for a blocked result; a reply that matches a content rule is held as it is for a chat; the child has no credential or network path.
  - Its row: read-only and offline in a detached copy at the base branch; Avoozl posts the reply after the checks a chat's reply gets.

### Phase 3: Definitions

- [x] `nk-5.1` Read-only roles on each shipped definition, after nk-1.2 [NK6] (§D3)
  - Tests: a definition with no way to write the result is refused for a read role with the reason, and still offered for a write role; Settings › Models shows that reason; each shipped definition lists the role classes it is proved for.
  - A definition says how a read-only child writes its result and output (`resultAllow`); one that does not is not offered for a read-only role; `examples/harnesses/codex.json` lists `proved`.

### Phase 4: Notifications

- [x] `nk-6.1` Send notifications from the tick pass [NK7.1, NK7.6, NK7.7, NK7.8] (§D6)
  - Tests: a tick with a fake sink sends a queued decision once; with no sink, `status` shows the count and the oldest age; forty waiting items and a new sink give one notification; a sink that throws does not stop the tick or a second sink, and is tried again later; the Kiro Crew push marks each row sent, one push per row.
  - The tick pass calls `notifications.deliver`; a per-sink record of what was sent; `avoozl status` shows what waits; a backlog becomes one notification; a failing sink backs off.
- [x] `nk-6.2` Command and webhook sinks, after nk-6.1 [NK7.2, NK7.3, NK7.4, NK7.5] (§D6)
  - Tests: `notifications.sinks` in `.avoozl.json` is refused naming the machine file; a title with shell characters reaches the command as one argument; a webhook to plain `http` on another host is refused when the configuration loads; the payload holds only channel, title, ID, time and link; a title that matches a content rule is held; the link is the page's address with the page on and the show command with it off; the schema parity test passes.
  - `notifications.sinks` in the machine configuration and its schema; a `command` sink run without a shell and with a timeout; a `webhook` sink to `https` or loopback; the small payload; links that are not Kiro Crew paths.

### Phase 5: What needs Kiro Crew

- [x] `nk-7.1` The table, and no silent queue, after nk-1.1 [NK8] (§D7)
  - Tests: a `kirocrew` request on a headless tick opens one item across three ticks and starts nothing; Run on from a person moves the role and cancels its waiting `kirocrew` start, and from MCP it is refused; a test fails when a module calls a Kiro Crew reader for an operation outside the table; the table holds its one part, then each role that cannot run as a child.
  - `src/app/tick/needs-kirocrew.ts`; a tick with no Kiro Crew seen lately that finds a `kirocrew` request opens one Needs you item per role with the person-only **Run on**; `avoozl status` says whether Kiro Crew is reachable and lists what waits on it.
