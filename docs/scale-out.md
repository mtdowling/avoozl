# People and machines

An epic spreads across people by assigning each of its specs to one person.
Every Avoozl reads the shared state from git and GitHub, so no one machine
holds the work for the others. Claim branches keep two machines off one task.

```sh
avoozl next
avoozl tick
avoozl rebuild --workspace ~/plans
```

## Spec lanes

An epic is a parent spec whose task titles link one spec per part of the
work, as [linked specs](github-workflow.md) describe. Each linked spec is
approved and released on its own. Give each spec to the person who runs that
part by assigning its spec issue to them: their runner starts its tasks, and
every other runner leaves it alone. A spec with no spec issue is not shared,
so every machine that holds it runs it.

A spec can wait on another when a parent spec links both and lists one first.
See [Linked specs](github-workflow.md#6-linked-specs) for the rules.

### Handing off a spec

Reassign the spec issue on GitHub. Each claim branch the old runner pushed
stays, and the new runner resumes it. Nothing moves the spec because a machine
went quiet.

## Shared state in git

Each person's Avoozl keeps its own database, and git is what they share. The
database is a cache that every machine builds from the same commits:

| State | Where it lives |
| ----- | -------------- |
| Spec text | `.kiro/specs/<name>/` on main |
| Approval | A commit on main that changes the spec's files, authored by an approver |
| Task done | The tick in `tasks.md` on the spec's base branch |
| Who runs a spec | The spec issue's assignee on GitHub |
| Who holds a task | Its claim branch on origin |

A tick another person lands counts on your machine at your next tick, and so
does one committed by hand. An approval counts on every machine that pulls
main. For who counts as an approver, see
[Approval](github-workflow.md#7-approval).

A new machine, or a new coworker, clones the repository and runs
`avoozl rebuild` on an empty database. It reads the spec folders, approves
each spec whose current text an approver committed, and marks each ticked
task done. See
[Workspaces](workspaces.md#rebuilding-the-database) for the steps.

## Headless machines

A machine whose roles use `process` harnesses runs with the CLI alone. A
timer runs `avoozl tick` once a minute: a launchd agent on macOS, a systemd
user timer on Linux, or a crontab line, as
[Getting started](getting-started.md#run-the-tick-on-a-timer) gives them.
Each tick passes every workspace on the machine, starts the agents the tick
asks for, and exits; the agents run on, and the next tick reaps or resumes
them.

```sh
avoozl tick
avoozl status
avoozl runner status --json
```

`avoozl status` names the workspace, each workspace's last pass and this
machine's agents, and `avoozl runner status --json` lists this machine's
process children. A
harness runs only after a person on that machine approves it with
`avoozl harness approve NAME`. See
[Getting started](getting-started.md#approve-a-harness) for harness files.

## Harnesses per role

Each person picks the harness for each role: `kirocrew` for a Kiro Crew chat,
or the name of an approved harness file such as `claude-code` or `codex` for a
process child. **Settings › Models** saves the choices as the `roles` table
in `.avoozl.json`:

```json
{
  "roles": {
    "worker": {
      "harness": "codex"
    },
    "responder": {
      "harness": "claude-code"
    },
    "reviewer": {
      "harness": "kirocrew"
    }
  }
}
```

When coworkers share one `.avoozl.json`, leave `roles` out of it and set it
in each person's `~/.config/avoozl/config.json` instead. Where both files set
a role, `.avoozl.json` wins. A task names no harness of its own.

The harness names a file on the machine that runs the session, so each
machine approves its own. See [Agents and the CLI](agents.md#roles-and-models)
for the roles and the ones that still run as Kiro Crew chats.

## Limits

- A spec with no spec issue shows "Not shared": two machines that both hold
  it both run it, and only the claim branches keep them off one task.
- In Local only mode there is no spec issue, so this machine runs every spec.
