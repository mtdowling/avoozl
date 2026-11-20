# People and machines

An epic spreads across people by giving each of its specs one driver. Every
Avoozl reads the shared state from git, so no one machine holds the work for
the others. Spreading one person's work over several machines is that
person's own agent's job, such as a Kiro Crew ultra mode run.

```sh
avoozl driver status
avoozl supervisor unit --write
avoozl rebuild --workspace ~/plans
```

## Spec lanes

An epic is a parent spec whose task titles link one spec per part of the
work, as [linked specs](github-workflow.md) describe. Each linked spec is
approved and released on its own, and each has one driver: the one machine
that starts its tasks, writes to GitHub for it, and lands it. Give each spec
to the person who runs that part, and their machine runs its lane. Every other
Avoozl only reads that spec.

In a GitHub mode, the spec issue's one assignee is the driver, and that
person's Avoozl drives it. A spec with no spec issue is not shared, and the
machine that holds it drives it. `avoozl driver status` says who drives each
spec, and why this machine only reads:

```sh
avoozl driver status recipe-box
avoozl driver set --label "Draco"
```

`driver set --label` names this machine in the driver banner and status.

A spec can wait on another when a parent spec links both and lists one first.
See [Linked specs](github-workflow.md#6-linked-specs) for the rules.

### Handing off a spec

Push the branch you were working on, mention the spec issue in it, and
reassign the spec issue on GitHub. The new assignee's Avoozl drives the spec
from its next tick; unassigning releases it. Nothing moves the role because a
machine went quiet. See [Drivers](drivers.md) for what each machine sets up
again.

## Shared state in git

Each person's Avoozl keeps its own database, and git is what they share. The
database is a cache that every machine builds from the same commits:

| State | Where it lives |
| ----- | -------------- |
| Spec text | `.kiro/specs/<name>/` on main |
| Approval | A commit on main that changes the spec's files, authored by an approver |
| Task done | The tick in `tasks.md` on the spec's base branch |
| Landing record | `Avoozl-Task:` trailers on the landing commit |
| Driver | The spec issue's assignee on GitHub |

A tick another person lands counts on your machine at your next tick, and so
does one committed by hand. An approval counts on every machine that pulls
main. For who counts as an approver, see
[Approval](github-workflow.md#7-approval).

Each landed task's trailers carry when its first worker started, its tries,
its harness and model, its cost and its Flow spans:

```text
Avoozl-Task: 1.2
Avoozl-Started: 2026-11-19T01:02:03.000Z
Avoozl-Tries: 2
Avoozl-Harness: kirocrew
Avoozl-Model: claude-opus-5.5
```

A new machine, or a new coworker, clones the repository and runs
`avoozl rebuild` on an empty database. It reads the spec folders, approves
each spec whose current text an approver committed, and lists what landed
from those trailers. See
[Workspaces](workspaces.md#rebuilding-the-database) for the steps.

## Headless machines

A machine whose roles use `process` harnesses runs with the CLI alone.
`avoozl supervisor` owns this machine's agent children, one supervisor per
machine, and with
`--tick-seconds N` it also runs the tick of every workspace on the machine.
`avoozl supervisor unit` prints a launchd unit on macOS or a systemd user unit
on Linux that starts it at login and again if it stops. `--write` writes the
file and prints the commands that load it:

```sh
avoozl supervisor unit --write
avoozl status
avoozl runner status --json
```

`avoozl status` names the workspace, the supervisor and its children, and
`avoozl runner status --json` lists the worker's tasks and their states. A
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
    "planner": {
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

Who is working on what is shared per spec, not per task: the spec issue's
assignee names the person who drives it, and the Specs list shows it on each
row. Which of that spec's tasks are running, or held with `avoozl take`, is
known only to the driver's own database until each tick reaches main. A
coworker who wants to know whether a task is in progress asks its spec's
driver.

Other limits:

- A spec with no spec issue shows "Not shared": two machines that both hold
  it both drive it.
- In Local only mode there is no spec issue, so this machine drives every
  spec and a spec cannot move between people's machines.
