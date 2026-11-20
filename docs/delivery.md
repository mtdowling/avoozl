# Delivery

Delivery is how an approved task becomes landed code: a worker writes it, Avoozl
checks it, and Avoozl lands it. Avoozl calls delivery Autopilot in the app.

```sh
avoozl repository configure code --workspace ~/plans \
  --json '{
  "root": "/path/to/code",
  "baseBranch": "main",
  "worktreeRoot": "/path/to/worktrees",
  "checks": {
    "test": [
      "npm",
      "test"
    ],
    "diff": [
      "git",
      "diff",
      "--check"
    ]
  }
}'
```

That registers the checkout the work changes, its base branch, a folder for
worktrees, and its checks. Checkout paths are per machine, so they stay out of
`.avoozl.json`. See
[Repository checks and isolation](checks.md)
for checks, their environment, and the sandbox they run in.

## Turning delivery on

Delivery starts with a `delivery` block in `.avoozl.json`:

```json
{
  "delivery": {}
}
```

A task lands only from the workspace that drives its spec: the spec issue's
assignee, or this workspace when the spec has no issue. See
[Drivers](drivers.md) for how a spec's driver is chosen.

A workspace whose `.avoozl.json` still says `"runner": "crew-mode"` starts
nothing until a person chooses **Let the tick run it** in **Needs you**.

### Lanes

A machine's `lanes.local` sets how many worker sessions run at once. The
default is 3. It lives in `~/.config/avoozl/config.json`:

```json
{
  "version": 1,
  "lanes": {
    "local": 1
  }
}
```

### Kiro Crew setup

A local worker needs nothing more. Its brief names this Avoozl's Node binary
and CLI file, so it needs neither `avoozl` on its `PATH` nor MCP sharing. The
other chats need two steps in Kiro Crew, each done once:

1. Share the MCP server. A worker that opens a pull request, and every
   verifier, reviewer, and investigation chat, reports with `plans_report`.
   Kiro Crew names the calling chat only to MCP servers it shares. Open **MCP
   Management**, find `avoozl:avoozl`, turn on sharing, and press **Approve
   sharing**. Then restart the gateway from **Settings › About › Restart
   gateway**. Without this, `plans_report` refuses those chats. A shared server
   runs outside the chat sandbox, with your access.
2. Set the chat folder. After the first tick, open the chat folder
   **Avoozl** › _repository ID_ in the sidebar and set its project directory
   to the checkout. The planner, responder, and retro chats open there, and the
   tick opens none of them until it is set.

## Workers and verification

Each minute the tick starts a worker session for each ready task, in its own
worktree. The worker runs as a Kiro Crew chat or as a process harness such as
Claude Code or Codex. See [Agents and the CLI](agents.md#roles-and-models) for
choosing one. Sessions run on this machine.

When a session reports done, Avoozl runs the checks itself on the exact commit
in a clean worktree, with no model call. It then integrates the commit and
releases the tasks that waited on it. A verifier session opens only when a
task needs judgment: the repository has no checks, or it sets
`verify: "agent"`.

Implementation, integration, and acceptance are separate steps, and each keeps
its own record. Avoozl never replaces a worker only because its activity went
quiet. It checks the durable session and delivery records first.

### Taking a task by hand

`avoozl take TASK` holds one task for you while the tick runs the rest. It
prints the task's worktree and the report command:

```sh
avoozl take 1.2
avoozl runner report 1.2 done
```

Commit in the worktree, then report, and Avoozl runs the checks.
`avoozl take TASK --release` gives the task back.

## Landing

Avoozl pushes and merges only after the checks pass on the exact head it
lands. It never force pushes, uses `--admin`, or bypasses a required check or
review. Each repository's `landing` setting picks how:

- `off` pushes nothing. The verified commit waits in **Needs you**. This is the
  default until setup writes another.
- `direct` lands it in merge batches on the base branch.
- `pr` pushes the task branch, opens or reuses one pull request, and waits
  for its required checks and reviews on that head. `landing.pr` says whether
  it opens as a draft and who merges it (see below).

### How pull requests land

`landing.pr` says how Avoozl opens a `pr` repository's pull requests, and who
merges them. Set it for the workspace at the top of `.avoozl.json`
(`"landing": {"pr": "ready"}`), or for one repository in its landing block,
which wins. Settings shows the workspace's in **Settings › Delivery**, and a
repository's on its **Landing** tab, where unset uses the workspace's. Only a
person changes it; agents, MCP and the tick cannot. It is the only setting for
who merges.

| `landing.pr` | Opens as | Who merges |
| --- | --- | --- |
| `draft` (default) | Draft | A person, after marking it ready |
| `ready` | Ready for review | A person |
| `auto` | Ready for review | Avoozl, once checks pass on the exact head |

With `draft`:

1. **Draft.** The **Landing queue** shows **Draft, waiting for you**, and
   **Needs you** has one row for it. A person releases it: click **Ready for
   review** on GitHub, or press **Approve** on the row. Avoozl sees a GitHub
   click on its next read of the pull request, which it makes anyway, so it
   costs no extra GitHub call. **Approve** calls
   `markPullRequestReadyForReview` and only marks it ready. A later push does
   not make it a draft again. A required check that fails on a draft still
   goes back to the worker.
2. Then it goes on as with `ready`.

With `draft` and `ready`:

1. **Ready to merge.** Avoozl waits for the required checks and reviews on the
   exact head. Then the queue shows **Ready to merge, waiting for you**, and
   **Needs you** has one row for it.
2. **Merge.** A person merges it on GitHub, and Avoozl records that merge. Or
   the person presses **Merge** on the row: the next tick checks that exact
   head again and merges it, guarded by the head. If the head moved, nothing
   merges.

With `auto`, Avoozl merges the pull request itself from the tick once the
required checks and reviews pass on the exact head.

In every mode a draft is never merged, never auto-merged and never batched
while it is a draft. Pull request landing never makes a merge batch, and
Avoozl never arms GitHub auto-merge. Only a person can press **Approve** or
**Merge**.

GitHub does not let anyone approve their own pull request, and Avoozl opens
pull requests as the owner. So **Ready for review** is the release signal, not
a review approval. The review rule of the base branch still applies as before.

`avoozl setup OWNER/REPO --repo ID --landing pr|direct|off` previews the
repository setup, and `--yes` applies it. Setup requires the GitHub checks
named in the repository's **Required checks** setting (**Edit repository ›
Landing**), which are separate from the repository's own checks.

### Merge batches

With `landing` set to `direct`, Avoozl stacks waiting tasks on the current base
in a landing worktree, checks that exact candidate, and fast-forwards the base
on the remote. Waiting tasks are local refs, and only the base branch is
pushed. A moved base means a new candidate and new checks.

When the checks fail, Avoozl runs them again, finds the task that broke the
batch, lands the tasks before it, and sends it back. The batch size starts at
1, grows while batches land, and halves after a failure. `landing.mergeBatch`
caps it, from 1 to 16. The **Landing queue** page shows the waiting tasks, the
batch under test, recent batches, and the current size.

A repository whose checks enforce a commit-message format can set
`landing.commitPrefix`, such as `"chore: "`. Every subject Avoozl writes there
then starts with it: landing commits, the merge-forward commit, tick commits,
the merge into an integration branch, and landing pull request titles. With no
prefix, Avoozl keeps its own subjects (`Land KEY`, `Merge main into BRANCH`,
`Tick IDS`). A worker's own commit, `Avoozl task ID, attempt N`, is not
prefixed yet.

### Conflicts

When the base moves and a merge conflicts, or the checks fail, the task goes
back to its worker chat. After the repository's `conflicts.maxAttempts` rounds
(default 2) it goes to **Needs you**. **Stop the line** pauses the queue.

## Investigate first

Before it changes a file, a worker reports what it read, the cause it
believes, the change it plans, how it will check it, and how sure it is. A
second, read-only chat tries to prove that wrong. Coding starts only when both
are sure enough and the findings stand. Otherwise the task waits in **Needs
you** with **Go ahead**, **Investigate again**, and **Stop**.

```json
{
  "delivery": {
    "investigate": {
      "mode": "all",
      "minConfidence": "high"
    }
  }
}
```

`mode` is `not-small` (the default), `all`, or `off`, and `minConfidence`
defaults to `high`. A task's facts may set `investigate: true` or `false`.

## Evidence

Each task keeps one evidence bundle under `.avoozl/local/evidence/`. It holds
the task's findings, decisions, review verdicts, check results, and the images
or videos the worker attaches, up to 20 MB. The task drawer shows it, and one
comment on the pull request holds its text summary.
