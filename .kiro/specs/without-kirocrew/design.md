# Design: everything runs without Kiro Crew

`NK` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`.

## D1. The pattern

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

## D2. The role table

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

## D3. Output files (NK3)

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

## D4. Snapshots

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

## D6. Notifications (NK7)

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

## D7. The Kiro Crew table (NK8)

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

## D10. Risks

| Risk | Guard |
| --- | --- |
| A role gains an ability by running as a child | The role table's class and write roots; a test that each read role writes no file but its own |
| A snapshot carries text that steers the child | The README in the snapshot; the brief's untrusted-data rule, as for a chat |
| A webhook leaks a private name | NK7.4's small payload and the content rules on titles |
| A harness cannot write its result in a read-only role | NK6: not offered for that role, with the reason |
