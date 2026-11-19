# People and machines

An epic spreads across people by giving each of its specs one driver, and
across machines by letting worker machines pull that driver's ready tasks.
Every Avoozl reads the shared state from git, so no one machine holds the
work for the others.

```sh
avoozl driver status
avoozl worker setup --workspace ~/plans
avoozl supervisor unit --write
avoozl rebuild --workspace ~/plans
```

## Spec lanes

An epic is a parent spec with one sub-spec per part of the work, as
[Epic types](epic-types.md#cross-repository-proposal) shows. Each sub-spec is
approved and released on its own, and each has one driver: the one machine
that starts its tasks, writes to GitHub for it, and lands it. Give each spec
to the person who runs that part, and their machine runs its lane. Every other
Avoozl only reads that spec.

In a GitHub mode, the spec's plan issue names the driver. Its one assignee is
the person, and a machine claim on the issue says which of that person's
machines. `avoozl driver status` says which machine drives each spec, and why
this one only reads:

```sh
avoozl driver status recipe-box
avoozl driver set --label "Draco"
```

`driver set --label` names this machine in that claim. Use a public alias, not
a hostname, because the claim is on the issue.

A task in one spec can wait on a task in another by naming its ID in `$after`.
The waiting spec's driver starts it once the other task's tick reaches that
spec's base branch, whoever drove that task. See
[Specs](specs.md#dependencies-across-specs) for the rules.

### Handing off a spec

`avoozl driver handoff` stops new work on the spec, lets running sessions
finish, and with `--folder` writes an export file. Reassign the plan issue to
the new person, and on their machine `avoozl driver takeover` reads the
export:

```sh
avoozl driver handoff recipe-box --folder ~/handoff
avoozl driver takeover recipe-box --file ~/handoff/recipe-box.json
```

When the old machine is gone, `driver takeover --force --confirm SPEC`
assigns the plan issue to you and takes over without an export, after it
lists what that loses. Nothing moves the role because a machine went quiet.
Hand off, take over and force take over are a person's commands. See
[Drivers](drivers.md) for the export, what each machine sets up again, and the
overlap a take over can leave.

## Shared state in git

Each person's Avoozl keeps its own database, and git is what they share. The
database is a cache that every machine builds from the same commits:

| State | Where it lives |
| ----- | -------------- |
| Spec text | `.kiro/specs/<name>/` on main |
| Approval | A commit on main that changes the spec's files, authored by an approver |
| Task done | The tick in `tasks.md` on the spec's base branch |
| Landing record | `Avoozl-Task:` trailers on the landing commit |
| Retro | `.kiro/retros/` |
| Driver and worker grants | The spec issue's journal on GitHub |

A tick another person lands counts on your machine at your next tick, and so
does one committed by hand. An approval counts on every machine that pulls
main, because the author of the commit is the approval. See
[Specs](specs.md#approval-commits) for who counts as an approver.

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

## Worker machines

A worker machine adds lanes to a driver without holding a plan. The driver
offers ready tasks to worker logins, a worker asks for the ones its free lanes
can take, and the driver grants each task to one worker. The worker runs the
session, runs its own checks and pushes the task branch. The driver then
fetches that exact commit, checks its paths, runs the repository's checks
again, and lands it. It never trusts the worker's result.

On the driver, `workers.offerTo` in `.avoozl.json` lists the GitHub logins to
offer to. With it set, the driver's tick offers each ready task of the specs
it drives once, stops starting those tasks itself, and answers grant
requests:

```json
{ "workers": { "offerTo": ["worker-a"] } }
```

On the worker, a `runner` block with `role` `worker` names the specs it pulls
from, the checks it runs, its executor and its lanes (1 to 16, default 1):

```json
{
  "runner": {
    "role": "worker",
    "executor": "process",
    "lanes": 3,
    "checks": { "test": { "argv": ["npm", "test"] } },
    "pools": [
      {
        "spec": "recipe-box",
        "repository": "acme/plans",
        "issue": 12,
        "target": "acme/recipes",
        "base": "main"
      }
    ]
  }
}
```

A pool's `repository` and `issue` are the spec issue that holds the journal,
and `target` is the repository the work lands in. The checkout paths and the
source repositories it may fetch belong to the machine, so they go in
`~/.config/avoozl/config.json`:

```json
{
  "version": 1,
  "runner": {
    "repos": { "recipes": { "path": "/path/to/recipes" } },
    "sources": { "acme/recipes": { "url": "https://github.com/acme/recipes" } }
  }
}
```

`avoozl worker setup` previews this: the GitHub login, the repositories it can
read and push to, grant access, and the executor. The worker's tick then
pulls, asks and starts work by itself. `avoozl worker pull` and
`avoozl worker accept` run the same steps once by hand.

A worker machine needs GitHub access. A grant is a branch,
`avoozl/<spec>/grant/<task>`, in the spec's one grant repository, so only one
worker wins a task. A branch of the same name in a fork grants nothing.

### Executors on a worker

`runner.executor` picks how the worker runs each session:

- `process` starts an agent CLI as a child of the machine's supervisor, with
  no Kiro Crew. It runs the `claude-code` harness by default.
- `kirocrew`, the default, opens a Kiro Crew chat on the worker machine's own
  Kiro Crew. Set `runner.workerMode` to `trust` or `trust_reads`, or the
  chat's tool calls wait for an approval nobody gives.

Every session runs on the machine that started it. A driver never opens a chat
on another machine's Kiro Crew; it reaches another machine only through worker
pull.

### Headless workers

A `process` worker runs with the CLI alone. `avoozl supervisor` owns this
machine's agent children, one supervisor per machine, and with
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
    "worker": { "harness": "codex" },
    "planner": { "harness": "claude-code" },
    "retro": { "harness": "kirocrew" }
  }
}
```

When coworkers share one `.avoozl.json`, leave `roles` out of it and set it
in each person's `~/.config/avoozl/config.json` instead. Where both files set
a role, `.avoozl.json` wins. A task can pin its own harness with a `$session`
fact, and the pin wins over the role:

```markdown
- [ ] 2.1 Port the parser
  - $session: {"harness": "claude-code"}
```

The harness names a file on the machine that runs the session, so each
machine approves its own. See [Agents and the CLI](agents.md#roles-and-models)
for the roles and the ones that still run as Kiro Crew chats.

## Limits

No shared record says who is working on a task right now. A task running on
a driver's own lanes, or held with `avoozl take`, is known only to that
machine's database until its tick reaches main. A grant branch says which
worker was granted a task, not whether its session is still running. A
coworker who wants to know whether a task is in progress asks its spec's
driver.

A quiet worker never loses its grant. After `workers.grantStaleAfter`
(default 24 h) with no accepted result, **Needs you** on the driver shows the
grant as quiet, and only a person releases it:

```sh
avoozl spec grants release recipe-box 2.1 --grants acme/recipes
```

Other limits:

- In Local only mode the driver claim is a row in one database, so a spec
  cannot move between people's machines.
- A worker task that lands writes no outcome record to the journal yet, so
  its grant stays open there.
- Worker pull has run between two workspaces against a fake GitHub. See
  [wp-p3-driver-worker-ticks.md](evidence/wp-p3-driver-worker-ticks.md) for
  that receipt. The run between two machines and two logins on real GitHub,
  proof P53, has not run yet.
