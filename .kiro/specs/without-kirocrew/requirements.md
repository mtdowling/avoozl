---
category: Planning
---

# Requirements: everything runs without Kiro Crew

## Introduction

A machine with no Kiro Crew runs every Avoozl role as a `process` child,
sends notifications to sinks of its own, and says so in one place when
something needs Kiro Crew. machine-server's ms-p2 and ms-p3 prove it on
Claude Code and Codex (machine-server design D12, rule 3).

### What this builds on

A child gets its role's prompt file, then its brief, then one instruction to
write `.avoozl/result.json` instead of calling an Avoozl tool; Avoozl reads
the file and does the write a chat would ask for (`finishProcessSession`,
`src/app/executors/process.ts`). A child has no database, no network and no
credentials (`src/app/executors/sandbox.ts`), and its result file is at most
8,192 bytes (`RESULT_BYTES`, `src/app/executors/supervisor.ts`).

This spec keeps Requirements 93 to 97 of `.kiro/specs/avoozl/`. Moving a
role to a child gives it no ability it has as a chat.

### Scope

- Every role in the role table, on the `process` executor.
- Notifications with no Kiro Crew.
- Saying so, in one place, when something needs Kiro Crew.

### Out of scope

- The worker's briefs (`worker-paths`) and the page (`standalone-web`).
- New abilities for any role.
- Remote access, and notifications to more than one person.

### Words

| Word | Meaning |
| --- | --- |
| Child | A `process` session: an agent CLI the supervisor runs in a sandbox |
| Result file | `.avoozl/result.json` in the child's folder (Requirement 96.1) |
| Output file | A second file a child writes when its answer is too large for the result file (NK3) |
| Snapshot | A read-only folder Avoozl fills before a child starts, with what the child must read |
| Sink | Where a notification goes: a command, a webhook, or Kiro Crew |

## Requirements

### Requirement NK1: Every role's executor comes from settings

**User story:** As the owner, I want the harness I choose for a role to be
the harness that runs it, so that no role quietly needs Kiro Crew.

#### Acceptance criteria

1. Every role Avoozl starts SHALL take its executor from, in order: the
   task's `session.harness` pin where the role has a task, the role's
   `harness` in the `roles` table, and the repository's `executor`.
2. No module outside `src/app/executors/kirocrew.ts` SHALL default a
   request to `kirocrew`. A source test SHALL fail on one that does.
3. Settings › Models SHALL list every row of the role table, and a harness
   saved for a role SHALL be used for it.
4. A test SHALL fail when a row of the role table is read by no dispatch.

### Requirement NK2: Roles with a small answer

**User story:** As the owner, I want the responder to run as a child, so
that issue and discussion replies work on any harness.

#### Acceptance criteria

2. The responder SHALL run read-only and offline in a detached copy of the
   repository at its base branch, and SHALL write the reply text as the
   result file's `report`. Avoozl SHALL post it with its own GitHub access,
   after the checks it applies to a chat's reply.
5. Avoozl SHALL treat the result's text as data and SHALL apply the content
   rules before any of it is posted or stored.

### Requirement NK3: Answers larger than the result file

**User story:** As the owner, I want a child to hand back an answer in a
file of its own without raising the result file's limit, so that a small
file stays small.

#### Acceptance criteria

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

### Requirement NK6: Read-only roles on every definition

**User story:** As the owner, I want to know whether a harness can run a
read-only role before I pick it, so that a role does not fail on its first
run.

#### Acceptance criteria

1. A harness definition SHALL say how a read-only child writes its result
   file and its output file (as `resultAllow` does for Claude Code). A
   definition that does not SHALL NOT be offered for a read-only role, and
   Settings › Models SHALL say why.
2. Each shipped definition (`examples/harnesses/claude-code.json`,
   `examples/harnesses/codex.json`) SHALL list in `proved` the role classes
   it is proved for.

### Requirement NK7: Notifications without Kiro Crew

**User story:** As the owner, I want to be told when Avoozl needs me or a
delivery fails, on a machine with no Kiro Crew, so that work does not wait
unseen.

#### Acceptance criteria

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

### Requirement NK8: What needs Kiro Crew says so

**User story:** As a person with no Kiro Crew, I want to be told when
something I asked for needs it, so that nothing waits forever in a queue.

#### Acceptance criteria

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
