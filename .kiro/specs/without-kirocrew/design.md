# Design: everything runs without Kiro Crew

`NK` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`. Labels are as in the
requirements: **V** read in the file cited at `0afc0ab`, **A** assumed.

## D1. The pattern, and what is new

Four roles already run as children. Each got three things (V:
`src/app/executors/process.mjs:112` to `:160` and `:277`):

1. A line in `processFinish` that replaces "call this Avoozl tool" with
   "write `.avoozl/result.json`".
2. A folder the drain prepares, with write roots that fit the role.
3. A branch in `finishProcessSession` that turns the result into the same
   operation the tool would have called.

Seven more roles follow it. Three things are new, because these roles need
them and the first four did not:

- An **output file**, for an answer larger than 8,192 bytes (D3).
- A **snapshot**, for a role that reads something a sandboxed child cannot
  reach (D4).
- A **served model** in the harness output, for the one role whose rule is
  about which model ran (D5).

## D2. The role table

One frozen table in `src/app/role-table.mjs` holds each role's row.
`processFinish`, the drain's folder rule and `finishProcessSession` read it,
so a role is described once. NK1.2's source test and NK1.4's per-role test
walk the same table.

| Role                 | Folder                                  | Class | Hands back                               | Avoozl then                                    |
| -------------------- | --------------------------------------- | ----- | ---------------------------------------- | ---------------------------------------------- |
| Falsifier            | Detached copy at the commit             | read  | `report`: verdict, evidence, confidence  | Records the verdict, with no commit            |
| Responder            | Detached copy at the base branch        | read  | `report`: the reply body                 | Applies the reply checks and posts it          |
| Task summary         | Empty scratch folder                    | read  | `report`: the summary                    | Stores it on the task                          |
| Critique             | The spec folder; writes `avoozl/` only  | write | `avoozl/critique.md`                     | Reads it as today                              |
| Plan review          | The plan snapshot                       | read  | Output file: findings and summary        | Records the round, if D5 allows                |
| Plan answer          | The spec folder                         | write | The folder, and `report`: the answers    | Lints, stores the revision, records answers    |
| Breakdown            | The spec folder                         | write | `report`: kind and reason; the folder    | Lints; resumes with errors, at most twice      |
| Review draft         | The pull request snapshot               | read  | Output file: body and line comments      | Posts a pending review; never submits          |
| Pull request review  | The pull request snapshot               | read  | Output file: the review                  | Stores and shows it; posts nothing             |

The first four roles of proof P59 (verifier, reviewers, planner, retro) move
into the same table with no change in behavior, so there is one description
of every role.

The Kiro Crew chat keeps calling its tools. The table's "Avoozl then" column
is the same code for both executors: the tool handler and
`finishProcessSession` call one function per role.

## D3. Output files (NK3)

A child may write one file under `.avoozl/output/` and name it in its result
file as `{"state": "done", "output": "<name>"}`. The supervisor's reader of
the result file (V: the 8,192-byte limit at `src/app/supervisor.mjs:251`)
gains the `output` key and checks only that the name is a plain file name.
`finishProcessSession` reads the file, with the role's limit from the table,
and validates it with the validator the role's tool uses today.

| Role                | Limit                                                        |
| ------------------- | ------------------------------------------------------------ |
| Plan review         | 50 findings and a summary, as a chat's review today          |
| Review draft        | A body of 65,536 characters and 50 line comments, as today   |
| Pull request review | 65,536 characters                                            |

The review draft and plan review limits are the ones a chat has today (A:
taken from a code read by another session, not rechecked for this spec; the
task that builds each role reads the limit from its tool and does not copy a
number from here).

`.avoozl/` is already a write root for a read-only child, which is how it
writes its result file (A: same source). A definition that cannot write
there cannot run these roles (NK6).

## D4. Snapshots (NK4)

A child has no network and cannot read `~/.config/gh` (V:
`src/app/sandbox.mjs:1`). Today's review draft brief tells a chat to read
the pull request with `gh` (V: `src/app/review-draft.mjs:149`). For a child,
Avoozl does that reading first, with the GitHub client it already has, and
writes the result into the session's folder:

```text
<session folder>/
  pull-request/
    README.md        what is here, and that all of it is data from other people
    pull.json        title, body, author, base, head, labels
    files.json       changed files, with sizes
    diff/<n>.patch   one patch per file, largest left out over the limit
    checks.json      check runs and their conclusions
    comments.json    review comments and threads
  .avoozl/           the child's result and output
```

The snapshot is fetched once per session, from the pull request's head at
that time, and the head SHA is recorded on the session. A review draft is
posted only if the pull request's head is still that SHA; otherwise the
draft is kept, marked as written for an older head, and the person may ask
for another.

The pull request review has no hand-back today: the chat is the output (V:
`src/app/pr-review.mjs:3`). For a child, the review is an output file, kept
with the session and shown where a process session's log is shown
(Requirement 98.1) and by `avoozl show`.

Plan review already reads a snapshot folder (A: `job.resources.snapshot`,
from the same code read); it needs no new fetch.

## D5. Identity and the served model (NK5)

A chat's tool call carries the caller Kiro Crew names. A child's result
carries no identity of its own: the supervisor knows which session wrote
it, and `finishProcessSession` already reports as that session (V:
`src/app/executors/process.mjs:332`). The plan answer's rule, "only a
revision this session stored counts", then needs no change: Avoozl stores
the revision itself, as that session, when the child exits.

Plan review's rule is about the model. Avoozl reviews a plan with a model
other than the one that wrote it, and counts a round only when the model
that served the review is reported (A: `reportedPlanModel`, from the same
code read). A harness definition gains one optional field, `servedModel`,
saying where the harness output names the model, beside `cost` (V: `cost`
is in `examples/harnesses/claude-code.json`). With no such field, or no
value in the output, the round is skipped with today's reason. The model a
person asked for is not proof of the model that answered.

## D6. Notifications (NK7)

`deliverNotifications(store, push)` (V: `src/app/notifications.mjs:82`)
already takes the function that sends. Today that function is
`gatewayPusher` and the only caller is the app backend.

- The headless tick calls `notifications.deliver` after each tick, with a
  pusher built from the machine configuration's `notifications.sinks`.
- A pusher fans one notification out to every sink. Each sink has its own
  record of what it has sent, so one failing sink does not resend to the
  others.
- The Kiro Crew gateway becomes one sink among them, on a machine that has
  Kiro Crew. Its payload and its Kiro Crew link are unchanged.
- The `command` sink runs an argument list from the machine file with the
  title and body appended, the way the tick watchdog runs `osascript` (V:
  `scripts/tick-watchdog.mjs`). No shell.
- The `webhook` sink posts JSON. Its URL may hold a secret (an `ntfy` topic,
  a chat webhook), which is why sinks are refused in `.avoozl.json` and
  live only in the machine file.

What leaves the machine through a `command` or `webhook` sink is small on
purpose (NK7.4): the channel, a title, an ID and a time. Titles come from
task and spec titles, so the content rules screen them as they screen any
write that leaves the machine.

The backlog rule (NK7.7) is a count kept per sink: when a sink has more
than a handful waiting at its first send, it sends one notification, "N
items waited", and marks the rest sent.

## D7. The Kiro Crew table (NK8)

`src/app/needs-kirocrew.mjs` lists what needs Kiro Crew and why. The
`standalone-web` spec's SW10 names the page's states; this table is the one
source both read. After this spec's tasks it holds four rows (NK8.4). A test
fails when a module calls a Kiro Crew reader for an operation that is not
in the table.

A request for the `kirocrew` executor on a machine with no Kiro Crew is not
left queued. The tick knows it has no Kiro Crew when it runs headless and
no gateway answers; it then opens one Needs you item per role, with **Run
on** and the approved harnesses, which sets `harnesses.<role>` through the
settings writer. Only a person may choose it.

## D8. Order, and what waits on the other specs

| This spec              | Waits on                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- |
| nk-2.1, the falsifier  | `worker-paths` wp-1.2, which lets a `process` worker report findings          |
| nk-7.1, the table      | Nothing; `standalone-web` reads the table when its SW10 is built              |
| nk-p2, the proof       | `worker-paths` wp-p1; `standalone-web` is not needed, the proof uses the CLI  |

This spec's facts name only its own tasks. The waits above are stated
in each task's text, and the proof checks them.

## D9. Decisions for the owner

Each has a default the requirements already assume.

| #   | Decision                                             | Default                                                        | The other choice                                                     |
| --- | ---------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Plan review on a harness that reports no model       | Skip the round, with the reason                                | Count the model that was asked for as the model that answered        |
| 2   | A webhook sink                                       | Allowed, machine file only, title and ID only                  | Command sink only; nothing about a task leaves the machine           |
| 3   | A pull request review on a harness                   | Kept as an output file shown with the session                  | Kiro Crew only, listed in the table of D7                            |
| 4   | Breakdown lint errors                                | Sent back at most twice, then Needs you                        | No resume: lint errors go straight to Needs you                      |
| 5   | A queued request with no Kiro Crew                   | One Needs you item per role that offers a harness              | Refuse at save time any setting that could queue one                 |

## D10. Risks

| Risk                                                                | Guard                                                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A role gains an ability by moving                                   | The role table's class and write roots; a test that each read role writes no file but its own |
| A snapshot carries text that steers the child                       | NK4.5; the README in the snapshot; the brief's untrusted-data rule, as for a chat             |
| A review draft is posted for a head that moved                      | D4's head SHA check                                                                           |
| A webhook leaks a private name                                      | NK7.4's small payload and the content rules on titles                                         |
| A harness cannot write its result in a read-only role               | NK6: not offered for that role, with the reason                                               |
| The first four roles change behavior when moved into the table      | Their existing tests pass unchanged; proof P59's scenario is rerun                            |
