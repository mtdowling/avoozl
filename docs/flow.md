# Flow

Flow settings control how work moves once delivery is on: when it pauses, when
it checks, and when Avoozl stops to look back. They live under `flow` in
`.avoozl.json`, and a repository can override them.

```json
{
  "flow": {
    "stopTheLine": { "scope": "dependents" },
    "localChecksFirst": true,
    "retro": { "everyTasks": 10, "slowFactor": 3 }
  }
}
```

**Settings › Flow** edits the same settings. The **Flow** page shows where the
time went, the share of finished tasks that were bug fixes, and corrections
per week.

## Timing

Timing is always on. It records each task's time per stage, and token and
credit counts per stage. It keeps no prompts or text.

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

A retro starts after every `retro.everyTasks` finished tasks (default 10). It
also starts when a task or a CI wait takes more than `retro.slowFactor` times
its repository's usual time (default 3), or when a worker starts its third
attempt. A tool-less `avoozl-retro` session names the biggest slowdown and
proposes up to three changes. You approve or reject each one, and Avoozl
measures an approved change afterward. **Retros** in the nav holds the Retros
and Proposals pages.

## Rules from corrections

Avoozl records changes requested, work sent back with a reason, and a revert
of an agent's commit. When the retro sees the same correction on two tasks, it
may propose a rule. Once you approve it, the rule lands as one task that edits
`.kiro/steering/avoozl-rules.md` in that repository and points `AGENTS.md` at
it, so every chat reads the rules. Avoozl keeps no lessons store of its own.
