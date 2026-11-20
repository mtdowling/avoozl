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

**Settings › Flow** edits the same settings. The **Flow** page shows where the
time went.

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

The red **Stop the line** icon in the heading of **Dashboards › Delivery**
stops new work for everything, one repository, one spec, or one task, with a
one-line reason. A person can pull it, and so can an agent through MCP.
Running sessions keep going, and only a person presses **Resume**.

## Local checks first

With `localChecksFirst` on, the default, a session that pushes runs the
repository's checks in its worktree before each push.

## Retros

A retro is a skill you run when you want one: ask an agent session for a retro
and it loads `avoozl-retro`. The skill reads `avoozl flow`, names the biggest
slowdown with its numbers, and proposes up to three changes, each a settings
change or a spec change. It changes nothing; you decide and make each change.
