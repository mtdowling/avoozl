# Flow

Flow settings control how work moves once delivery is on: what a broken check
pauses and what verification protects. They live under `flow` in
`.avoozl.json`, and a repository's own `flow` block overrides them.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-flow-desktop-dark.png">
  <img alt="Settings, Flow tab: timing, pause on a broken check and local checks first" src="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-flow-desktop-light.png" width="800">
</picture>

```json
{
  "flow": {
    "stopTheLine": {
      "scope": "dependents"
    },
    "verify": {
      "checkTimeoutSeconds": 1200
    }
  }
}
```

**Settings › Flow** edits the same settings, and `avoozl flow` prints where
the time went.

## Timing

Timing is always on. It records each task's time per stage. It keeps no
prompts or text. See [Telemetry](telemetry.md) for what is kept, for how
long, and how to send it to an OpenTelemetry backend.

## Stop the line

When a check that passed on a repository's landing branch fails on a later
commit, and again on one rerun, new work in scope waits and a fix task goes
first. Running sessions keep going. Work resumes when the check passes on the
branch head, or when a person presses **Run anyway**.

`stopTheLine.scope` sets what waits: `dependents` (the default), `repo`, or
`all`. **Settings › Flow** shows it as **Pause on a broken check**.

### Pulling the line by hand

The red **Stop the line** icon in the heading of **In flight** opens a dialog
with two choices:

- **Stop the line** stops new work for everything, one repository, one spec,
  or one task, with a one-line reason. Running sessions keep going. A person
  can pull it, and so can an agent through MCP.
- **Stop all agents** stops new work everywhere and also stops every running
  chat Avoozl opened. The page, `avoozl flow stop --full` and
  `plans_control` action `stop_all` pull it.

A stopped line shows a banner on every page until someone presses
**Resume**, or an agent calls `plans_control` action `resume_stop`. The
command line does the same:

```sh
avoozl flow stop --scope repo --repository code --reason "main is red"
avoozl flow resume STOP_ID
avoozl flow run-anyway STOP_ID --confirm
```

## Verification

Avoozl holds a worker's commit that changes a protected path. The built-in
protected paths are `.github/workflows/**` and `scripts/worktree`, and
`verify.protectedPaths` adds globs of your own:

```json
{
  "flow": {
    "verify": {
      "protectedPaths": [
        "deploy/**"
      ],
      "checkTimeouts": {
        "test": 3600
      }
    }
  }
}
```

`avoozl verify allow TASK --reason TEXT` lets one held commit's protected
paths land. `verify.checkTimeoutSeconds` (default 1200) bounds each check,
and `verify.checkTimeouts` sets one check's own timeout by its name.

## Local checks first

`localChecksFirst` (default `true`) is shown in **Settings › Flow** as
**Require a local pass before push**. Avoozl stores the value but does not
act on it: every commit runs the repository's checks before it lands either
way, as [Repository checks and isolation](checks.md) describes.

## Insights

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/insights-desktop-dark.png">
  <img alt="The Insights view: the waiting strip and each spec burndown" src="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/insights-desktop-light.png" width="800">
</picture>

Insights is the page's home and reads only what Avoozl already keeps. It
calls no GitHub API. `avoozl insights` prints the same numbers:

```text
$ avoozl insights --days 30
Needs you 2 · In flight 1 · Ready 3 · Main passing · Autopilot on

Last 30 days
Finished tasks: 12
Lead time: median 3.5 h, 85th percentile 12 h over 12 tasks
```

It goes on with time per stage, review rounds, rework and each spec's
burndown.

| Chart | Source |
| --- | --- |
| Burndown | the commits that changed each spec's task list on the specs branch, open and ticked tasks at each |
| Tasks finished per day | `avoozl.tasks.finished` points |
| Lead time per task | `avoozl.task.lead_time` points |
| Time per stage | finished `avoozl.stage.*` spans |
| Review rounds | `review` spans per task |
| Rework | finished tasks with more than one attempt, and first-pass results |

The telemetry rows live in the workspace database. Filters in the nav narrow
every chart to one spec, one repository, and the last 7, 30 or 90 days, as
`--spec`, `--repo` and `--days` do. The main check state is the line watch's
last read of each repository's landing branch: passing, line stopped, or not
read yet.

## Retros

A retro is a skill you run when you want one: press **Run a retro** in
Insights, or ask an agent session for a retro, and it loads `avoozl-retro`.
The skill reads `avoozl insights` and `avoozl flow`, names the biggest
slowdown with its numbers, and proposes up to three changes, each a settings
change or a spec change. It saves its report through `retro.save` as
`.avoozl/local/retros/<YYYY-MM-DD-HHMM>-<scope>.md` (UTC) and changes nothing
else. You decide and make each change. Insights lists the saved reports
newest first and opens each in the file reader.

```sh
avoozl retro list
avoozl retro read NAME
```
