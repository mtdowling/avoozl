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

A runner starts a spec's tasks only when the spec issue, and every parent
spec's issue, is assigned to its own login alone; a spec with no issue runs
here. See [Spec issues and assignment](github-workflow.md#8-spec-issues-and-assignment).

A workspace whose `.avoozl.json` still says `"runner": "crew-mode"` starts
nothing until a person chooses **Let the tick run it** in **Needs you**.

### The server loop

The tick starts and lands work only on a machine whose own config turns the
loop on. Put `loop` in `~/.config/avoozl/config.json`; `.avoozl.json` may not
set it:

```json
{
  "version": 1,
  "loop": {
    "run": [
      "specs",
      "issues"
    ],
    "every": "1m"
  }
}
```

`run` lists the kinds of work the loop takes: `specs` (every spec's tasks),
`epics` (only the specs `loop.epics` names and the specs they link) and
`issues` (labeled issues). `every` is the least time between two passes. With
no `loop`, the tick still reads and caches, and `avoozl next`, `avoozl land`,
`avoozl graph` and every page read answer, but it starts and lands nothing.

### Lanes

A lane is one long-lived agent session that takes task after task. A
machine runs `lanes.local` worker lanes (default 3) and `lanes.reviewers`
reviewer lanes (default 1), set in `~/.config/avoozl/config.json`:

```json
{
  "version": 1,
  "lanes": {
    "local": 2,
    "reviewers": 1
  }
}
```

A task starts only on a free lane of its role. Each lane session carries a
fixed header, such as `Avoozl · my-workspace · worker 2` or
`Avoozl · my-workspace · reviewer`. In Kiro Crew every lane chat of a
workspace sits in the sidebar folder **Avoozl › my-workspace**. Avoozl
clears a lane chat's conversation before its next task and sets its trust
mode on every tick, so a lane never waits on a tool approval.

A process harness such as Claude Code or Codex keeps each lane's sessions in
`~/.avoozl/lanes/my-workspace/worker-2/` when its harness definition names
its home variable. That folder, not your own `~/.claude` or `~/.codex`, holds
the lane's transcripts:

```json
{
  "home": "CLAUDE_CONFIG_DIR",
  "label": [
    "--name",
    "{lane_header}"
  ],
  "sessions": "projects"
}
```

`label` names each session with the lane's header; a harness without one
gets the header as its prompt's first line. A review round resumes its
task's session in the same lane. When the lane's next task starts, Avoozl
deletes the lane's session files older than the previous task, so the
previous task stays readable until then. A harness signed in through its
default home, such as a Claude.ai login, does not see that login in a lane
home; leave `home` out of its definition.

`avoozl lanes` lists each lane with its role, state, task, and how to open
its session:

```sh
avoozl lanes
```

When you close a lane's chat, the lane pauses and **Needs you** shows a row
for it. Press **Resume**, or run `avoozl lane resume worker-2`, and the next
tick opens a new chat for that lane. The task that was running moves to
another free lane once.

### Kiro Crew setup

A local worker needs nothing more. Its brief names this Avoozl's Node binary
and CLI file, so it needs neither `avoozl` on its `PATH` nor MCP sharing. The
other chats need two steps in Kiro Crew, each done once:

1. Share the MCP server. A worker that opens a pull request, and every
   reviewer chat, reports with `plans_report`.
   Kiro Crew names the calling chat only to MCP servers it shares. Open **MCP
   Management**, find `avoozl:avoozl`, turn on sharing, and press **Approve
   sharing**. Then restart the gateway from **Settings › About › Restart
   gateway**. Without this, `plans_report` refuses those chats. A shared server
   runs outside the chat sandbox, with your access.
2. Set the chat folder. After the first tick, open the chat folder
   **Avoozl** › _repository ID_ in the sidebar and set its project directory
   to the checkout. The worker, reviewer and responder chats open there, and
   the tick opens none of them until it is set.

## Workers and verification

With the loop on, each minute the tick starts a worker session for each ready
task, in its own worktree. The worker runs as a Kiro Crew chat or as a process harness such as
Claude Code or Codex. See [Agents and the CLI](agents.md#roles-and-models) for
choosing one. Sessions run on this machine.

When a session reports done, Avoozl runs the checks itself on the exact commit
in a clean worktree, with no model call. It then integrates the commit and
releases the tasks that waited on it. A repository with no checks is judged
by its reviewers alone.

Implementation, integration, and acceptance are separate steps, and each keeps
its own record. Avoozl never replaces a worker only because its activity went
quiet. It checks the durable session and delivery records first.

### Review

Every task gets a reviewer before it lands. The reviewer is a separate session
that never saw the worker's reasoning. It reads the task's diff with its
callers and tests, tries to defeat the change, reruns the checks it relies on,
and reports `approved` or `changes-requested` with ranked findings. Its prompt
is `prompts/reviewer.md`.

```json
{
  "delivery": {
    "reviewRounds": 3,
    "repositories": {
      "docs-site": {
        "reviewers": []
      }
    }
  }
}
```

On `changes-requested` the worker gets the findings. It fixes each defect or
answers it in its done report, and the reviewer then judges each finding
against the new commit: `fixed`, `unchanged`, or `withdrawn` when the answer
shows it was not a defect. After `reviewRounds` rounds (default 3) with a
defect still open, the task waits in **Needs you** with the open findings and
does not land. A review round spends no `retries`.

A reviewer turn that ends without a verdict is nudged and never counts as
approval. `reviewers: []` turns review off for the workspace or, under
`repositories`, for one repository. A `reviewers` list replaces the default
reviewer with review roles of your own, each with an `id`, `focus`, `agent`
and `distinctFrom` rule.

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

The task's box is ticked before its checks run: in the landing commit with
`direct`, and in a commit of its own on top of the work with `pr`, so the
pull request carries the tick. A spec kept in another repository is ticked
there once the work lands. After a task lands, Avoozl deletes the claim branch
it created and its leases. Until its tick is on the done branch, the claim
stays and the tick tries again.

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

1. **Draft.** **Needs you** has one row for it. A person releases it: click **Ready for
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

A pull request closed without merging leaves the landing queue. Its task
stays claimed, and **Needs you** offers **Delete claim branch**, after the
high-risk confirm, to make the task ready again.

GitHub does not let anyone approve their own pull request, and Avoozl opens
pull requests as the owner. So **Ready for review** is the release signal, not
a review approval. The review rule of the base branch still applies as before.

The GitHub checks named in the repository's **Required checks** setting
(**Edit repository › Landing**) are separate from the repository's own checks.

### Merge batches

With `landing` set to `direct`, Avoozl stacks waiting tasks on the current base
in a landing worktree, checks that exact candidate, and fast-forwards the base
on the remote. Waiting tasks are local refs, and only the base branch is
pushed. A moved base means a new candidate and new checks.

When the checks fail, Avoozl runs them again, finds the task that broke the
batch, lands the tasks before it, and sends it back. The batch size starts at
1, grows while batches land, and halves after a failure. `landing.mergeBatch`
caps it, from 1 to 16. Avoozl adds no trailer or attribution to a landing
commit; its subject is `Land <task>`.

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

A task that should be understood before it is fixed names a findings file in
its done bullets, such as `findings/loader.md`. The worker writes that file
before the fix, as the `avoozl-investigate` skill says, and the reviewer tries
to prove it wrong. Avoozl has no setting for this.
