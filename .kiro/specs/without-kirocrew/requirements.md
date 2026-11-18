---
category: Planning
---

# Requirements: everything runs without Kiro Crew

Status: Approved

## Introduction

A machine with no Kiro Crew can already run a worker, verify and land its
work, and approve a spec from the command line. This spec covers what it
still cannot do: the roles that only run as Kiro Crew chats, and
notifications. With the two specs named below, a person who never installs
Kiro Crew can use all of Avoozl.

This spec is a draft. Approving it, creating issues and starting agents are
separate acts that a person does later. Nothing in it changes code, GitHub
repositories or settings until its tasks run.

Every claim about today's code carries one label: **V**, read in the file
cited at `0afc0ab`; or **A**, assumed and not checked, with the reason.

### What "without Kiro Crew" needs, and where it is specified

| Part                                   | State today                                                | Spec                                        |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| The worker, on every kind of task      | Works for a single task; three kinds get a wrong brief     | `.kiro/specs/worker-paths/` (draft)         |
| The page                               | Kiro Crew only (Requirement 98)                            | `.kiro/specs/standalone-web/` (draft)       |
| Verifier, reviewers, New spec planner, retro | Run on `process` (proof P59)                         | Done                                        |
| The other roles                        | Kiro Crew chat only                                        | This spec, NK1 to NK6                       |
| Notifications                          | Sent only by the Kiro Crew app backend                     | This spec, NK7                              |
| What truly needs Kiro Crew             | Fails quietly on a headless machine                        | This spec, NK8                              |
| Proof of the whole                     | None                                                       | This spec, NK9                              |

### Why

- Requirement 97.3 says every role runs on either executor. Seven do not.
  The falsifier, the issue planner, the responder, review drafts, the pull
  request review and the task summary build their request with
  `kirocrewRequest`, which names the `kirocrew` executor unless told
  otherwise (V: `src/app/investigate.mjs:492`,
  `src/app/github-planner.mjs:202`, `src/app/github-respond.mjs:351`,
  `src/app/review-draft.mjs:442`, `src/app/pr-review.mjs:177`,
  `src/app/task-summary.mjs:133`; the default is at
  `src/app/executors/kirocrew.mjs:241`). The plan review step defaults to
  `kirocrew` (V: `src/app/plan-review-step.mjs:436`).
- Settings › Models accepts a harness for the plan reviewer and for review
  drafts (V: `HARNESS_ROLES`, `src/app/chat-models.mjs:82`), and nothing
  reads it: `roleHarness` is called for the worker, the retro and the New
  spec planner only (V: `src/app/delivery.mjs:2217`,
  `src/app/flow-retro.mjs:789`, `src/app/operations.mjs:3463`).
- Investigate first is on by default, and its second chat, the falsifier,
  runs only on Kiro Crew. So a machine with no Kiro Crew must turn
  investigate first off to code anything.
- On a headless machine a request for a Kiro Crew chat stays queued with no
  word to anyone (V: the comment at `src/app/headless-tick.mjs:6`).
- Notifications are queued by the tick and sent only by the Kiro Crew app
  backend, to the gateway (V: `deliverNotifications` and `gatewayPusher`,
  `src/app/notifications.mjs:82` and `:112`; the one caller is
  `src/app/app-backend.mjs:711`). The headless tick never sends them (V: no
  reference to a notifier in `src/app/headless-tick.mjs`). A person with no
  Kiro Crew is told nothing.

### What this builds on

The pattern already moved four roles (V: `processFinish` and
`finishProcessSession`, `src/app/executors/process.mjs:137` and `:277`): the
child gets its role's prompt file, then its brief, then one instruction to
write `.avoozl/result.json` instead of calling an Avoozl tool; Avoozl reads
the file and does the write the chat used to ask for. A child has no
database, no network and no credentials (V: `src/app/sandbox.mjs:1`), and
its result file is at most 8,192 bytes (V: `src/app/supervisor.mjs:251`).

This spec keeps Requirements 93 to 97 of `.kiro/specs/avoozl/` and finishes
Requirement 97.3. It does not change what any role may do: a role that could
not write a file, merge or post still cannot.

### Scope

- The seven roles named above, on the `process` executor.
- Notifications with no Kiro Crew.
- Saying so, in one place, when something needs Kiro Crew.

### Out of scope

- The worker (`worker-paths`) and the page (`standalone-web`).
- New abilities for any role.
- The conflict-fix chat for a crew's pull request. Requirement 91.6 removes
  it.
- Issue Radar's crew views, which read Kiro Crew's own API. They are among
  the things NK8 marks.
- Remote access, and notifications to more than one person.

### Words

| Word           | Meaning                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------- |
| Child          | A `process` session: an agent CLI the supervisor runs in a sandbox                       |
| Result file    | `.avoozl/result.json` in the child's folder (Requirement 96.1)                           |
| Output file    | A second file a child writes when its answer is too large for the result file (NK3)      |
| Snapshot       | A read-only folder Avoozl fills before a child starts, with what the child must read     |
| Sink           | Where a notification goes: a command, a webhook, the standalone page, or Kiro Crew       |

## Requirements

### Requirement NK1: Every role's executor comes from settings

**User story:** As the owner, I want the harness I choose for a role to be
the harness that runs it, so that no role quietly needs Kiro Crew.

#### Acceptance criteria

1. Every role Avoozl starts SHALL take its executor from, in order: the
   task's `session.harness` pin where the role has a task, the role's entry
   in `harnesses`, and the project's `executor`.
2. No module outside `src/app/executors/kirocrew.mjs` SHALL default a
   request to `kirocrew`. A source test SHALL fail on one that does.
3. Settings › Models SHALL list every role of this spec, and a harness
   saved for a role SHALL be used for it. A test SHALL fail when
   `HARNESS_ROLES` holds a role that no dispatch reads.
4. A role SHALL give the same kind of result on both executors, checked by
   one test per role that runs it on a fake `kirocrew` and a fake
   `process`.

### Requirement NK2: Roles with a small answer

**User story:** As the owner, I want the falsifier, the responder and the
task summary to run as children, so that investigate first and issue
replies work on any harness.

#### Acceptance criteria

1. The falsifier SHALL run read-only in a detached copy of the checkout at
   the commit it judges, and SHALL write its verdict, evidence and
   confidence as the result file's `report`. Avoozl SHALL record them as it
   records a chat's, with no commit attached.
2. The responder SHALL run read-only and SHALL write the reply text as the
   result file's `report`. Avoozl SHALL post it with its own GitHub access,
   after the checks it applies to a chat's reply today.
3. The task summary SHALL run in an empty folder and SHALL write its
   summary as the result file's `report`.
4. The issue planner's critique SHALL run with one write root, the spec
   folder's `avoozl/` folder, and SHALL write `critique.md` there as it
   does today.
5. For each of these roles Avoozl SHALL treat the result's text as data and
   SHALL apply the content rules before any of it is posted or stored.

### Requirement NK3: Answers larger than the result file

**User story:** As the owner, I want a child to hand back a long review
without raising the result file's limit, so that a small file stays small.

#### Acceptance criteria

1. A role that says so in its entry of the role table (design D2) MAY write
   one output file under `.avoozl/output/` in its folder and name it in the
   result file. The result file's limit SHALL stay 8,192 bytes.
2. Each such role SHALL have its own size limit for the output file, and
   Avoozl SHALL refuse a larger one, a second file, a path outside
   `.avoozl/output/`, and a file that is not valid for the role.
3. Plan review SHALL write its findings and summary this way, with the
   limits `plans_submit_review` applies to a chat today.
4. Avoozl SHALL read an output file once, when the child has exited, and
   SHALL treat its text as data.

### Requirement NK4: Roles that read a pull request

**User story:** As the owner, I want review drafts and pull request reviews
on any harness, so that a child needs no network and no GitHub login.

#### Acceptance criteria

1. Before it starts a review draft or a pull request review as a child,
   Avoozl SHALL fetch, with its own GitHub access, the pull request's
   title, body, diff, changed files, checks and review comments, and SHALL
   put them in a snapshot the child can only read. The child SHALL have no
   network and no credentials (Requirement 95.6).
2. The snapshot SHALL have a size limit. Over it, Avoozl SHALL leave the
   largest diffs out, name them in the snapshot, and say so in the brief.
3. A review draft child SHALL write its body and line comments to an
   output file. Avoozl SHALL post them as a pending review under the
   person's login, with the limits and checks it applies to a chat's draft
   today. Avoozl SHALL NOT submit the review.
4. A pull request review child SHALL write its review to an output file.
   Avoozl SHALL store it with the session and show it where the session is
   shown, and `avoozl show` SHALL print it. Nothing SHALL be posted to
   GitHub, as today.
5. Text from the pull request is data. The brief SHALL say so, and the
   snapshot SHALL be marked as data from other people.

### Requirement NK5: Roles with rules about who wrote what

**User story:** As the owner, I want plan review and plan answers to keep
their rules on any harness, so that a child cannot review its own plan or
answer for another session.

#### Acceptance criteria

1. For a child, the supervisor's record of the session SHALL be the
   identity Avoozl checks, as it is when a verifier child reports (V:
   `cliReportCaller`, `src/app/executors/process.mjs:332`).
2. Plan review on `process` SHALL count as a review by another model only
   when the harness output names the model that served it. A definition
   SHALL say where its output names the model. With no served model the
   round SHALL be skipped with the reason shown, as it is for a chat with
   no reported model today.
3. A plan answer child SHALL get one write root, the spec folder it
   answers for. When it exits, Avoozl SHALL lint the folder, store the
   revision as written by that session, and record each answer from the
   result file's `report`. An answer of "fixed" SHALL be refused when the
   stored revision is not the one the child wrote.
4. The issue planner's breakdown SHALL write `{"kind", "reason"}` as the
   result file's `report`. When the kind is broad it SHALL also write the
   spec folder. Avoozl SHALL lint the folder after the child exits and
   SHALL send the errors back with the definition's `resume` command, at
   most twice. Errors left after that SHALL open one Needs you item.
5. No child SHALL be given a write root that holds a git directory.

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
   `examples/harnesses/codex.json`) SHALL be proved for one read-only role
   and one write role, or SHALL be marked as not proved for it where the
   definition is listed.

### Requirement NK7: Notifications without Kiro Crew

**User story:** As the owner, I want to be told when Avoozl needs me or a
delivery fails, on a machine with no Kiro Crew, so that work does not wait
unseen.

#### Acceptance criteria

1. The tick SHALL send queued notifications wherever it runs. The headless
   tick SHALL call the same delivery the app backend calls.
2. Sinks SHALL be set per machine, under `notifications.sinks` in the
   machine configuration. `.avoozl.json` SHALL refuse the key, naming the
   machine file.
3. A `command` sink SHALL run an argument list with the notification's
   title and body as arguments, never through a shell, with a timeout. A
   `webhook` sink SHALL send the notification as JSON with one POST to an
   `https` URL or a loopback URL. The standalone page's notices
   (`standalone-web`, SW8) SHALL count as a sink.
4. A notification sent to a `command` or `webhook` sink SHALL hold its
   channel, its title, a task or spec ID and a time, and nothing else. It
   SHALL hold no file text, no brief and no path.
5. A notification's link SHALL NOT be a Kiro Crew path unless the sink is
   Kiro Crew. For the other sinks it SHALL be the standalone page's address
   when that page is on, and otherwise the command that shows the item.
6. With no sink set, `avoozl status` SHALL show how many notifications
   wait and the oldest one's age.
7. When a sink first appears, or comes back after an outage, Avoozl SHALL
   send one notification that counts what waited, not one for each.
8. A sink that fails SHALL be tried again on later ticks with a growing
   wait. A failed sink SHALL never hold up the tick or another sink.
9. `src/web-notifications.mjs`, which only its own test imports (V), SHALL
   be removed.

### Requirement NK8: What needs Kiro Crew says so

**User story:** As a person with no Kiro Crew, I want to be told when
something I asked for needs it, so that nothing waits forever in a queue.

#### Acceptance criteria

1. One table in code SHALL list every operation, role and view that needs
   Kiro Crew, with the reason. The page's "Needs Kiro Crew" states
   (`standalone-web`, SW10) and the CLI SHALL read that table.
2. When a tick runs with no Kiro Crew and finds a request for the
   `kirocrew` executor, it SHALL open one Needs you item that names the
   role and offers the harnesses this machine has approved. It SHALL NOT
   leave the request queued without one.
3. `avoozl status` SHALL say whether Kiro Crew is reachable from this
   machine, and SHALL list each waiting item of NK8.2.
4. After this spec, the table SHALL hold only: Issue Radar's crew views and
   Send to Issue Radar, Spec Builder as a way to start a spec, attaching to
   a Kiro Crew chat, and the Kiro Crew side panel.

### Requirement NK9: Proof of the whole

**User story:** As the owner, I want one run that uses every part with no
Kiro Crew on the machine, so that "works without Kiro Crew" is a recorded
fact.

#### Acceptance criteria

1. One proof SHALL run, on a machine user with no Kiro Crew installed: a
   spec from a goal, a plan review, approval, a task with investigate
   first, verification, a review role, landing, a task summary, a retro, a
   review draft on a labeled pull request, a reply to an issue, and one
   notification through a `command` sink.
2. Every session in the proof SHALL have executor `process`.
3. The proof SHALL be run once with Claude Code. A second run with Codex
   SHALL record which roles it could not run, with the reason.
