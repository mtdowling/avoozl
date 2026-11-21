# Flow

Flow settings control how work moves once delivery is on: when it pauses and
when it checks. They live under `flow` in `.avoozl.json`, and a repository can
override them.

```json
{
  "flow": {
    "stopTheLine": {
      "scope": "dependents"
    },
    "localChecksFirst": true
  }
}
```

**Settings › Flow** edits the same settings, and `avoozl flow` prints where
the time went.

## Timing

Timing is always on. It records each task's time per stage. It keeps no
prompts or text. [Telemetry](telemetry.md) says what is kept, for how long,
and how to send it to an OpenTelemetry backend.

## Stop the line

When a check that passed on the base branch fails on a later commit, and again
on one rerun, new work in scope waits and a fix task goes first. Running
sessions keep going. Work resumes when the check passes, or when a person
presses **Run anyway**.

`stopTheLine.scope` sets what waits: `dependents` (the default), `repo`, or
`all`.

### Pulling the line by hand

The red **Stop the line** icon in the heading of **In flight**
stops new work for everything, one repository, one spec, or one task, with a
one-line reason. A person can pull it, and so can an agent through MCP.
Running sessions keep going, and only a person presses **Resume**.

## Local checks first

With `localChecksFirst` on, the default, a session that pushes runs the
repository's checks in its worktree before each push.

## Insights

Insights is the page's home and reads only what Avoozl already keeps. It
calls no GitHub API. `avoozl insights` prints the same numbers:

```text
$ avoozl insights --days 30
Needs you 2 · In flight 1 · Ready 3 · Main passing · Autopilot on

Last 30 days
Finished tasks: 12
Lead time: median 3.5 h, 85th percentile 12 h over 12 tasks
```

| Chart | Source |
| --- | --- |
| Burndown per spec | the commits that changed the spec's task list on the specs branch, open and ticked tasks at each |
| Tasks finished per day | `avoozl.tasks.finished` points |
| Lead time per task | `avoozl.task.lead_time` points |
| Time per stage | finished `avoozl.stage.*` spans |
| Review rounds | `review` spans per task |
| Rework | finished tasks with more than one attempt, and first-pass results |

The telemetry rows live in the workspace database ([Telemetry](telemetry.md)).
Filters in the nav narrow every chart to one spec, one repository, and the
last 7, 30 or 90 days. The main check state is the line watch's last read of
each repository's landing branch: passing, line stopped, or not read yet.

## Retros

A retro is a skill you run when you want one: press **Run a retro** in
Insights, or ask an agent session for a retro, and it loads `avoozl-retro`.
The skill reads `avoozl insights` and `avoozl flow`, names the biggest
slowdown with its numbers, and proposes up to three changes, each a settings
change or a spec change. It saves its report through `retro.save` as
`.avoozl/local/retros/<YYYY-MM-DD-HHMM>-<scope>.md` (UTC) and changes nothing
else; you decide and make each change. Insights lists the saved reports
newest first and opens each in the file reader. `avoozl retro list` and
`avoozl retro read NAME` read them at the command line.
