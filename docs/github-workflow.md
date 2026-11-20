# GitHub workflow

This page is the landing protocol: how a tool lands an epic, task by task,
from spec files on GitHub. Git and GitHub hold every fact it needs, so any
tool that follows it can run the same specs side by side with any other.
Avoozl is the reference implementation. A triage bot, a plain chat with
GitHub tools, or another agent harness can implement it too.

The words MUST, MUST NOT, SHOULD and MAY are used as in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

```markdown [acme/widget: .kiro/specs/parser/tasks.md]
## Phase 1: Tokens

- [x] `p-1` Read the token table
  - $done: Every row of `tokens.csv` becomes one token kind
- [ ] `p-2` Report unknown tokens
  - $after: p-1
  - $done: An unknown token is reported with its line and column
```

Task `p-1` is ticked on the specs branch, so it is done. Task `p-2` waits
only on `p-1`, so it is ready. A runner claims it by creating the branch
`avoozl/parser/p-2`, does the work there, ticks the box in the same commit,
and lands it.

See [specs.md](specs.md) for how Avoozl's own pages and commands work with
specs.

## Terms

| Term | Meaning |
| --- | --- |
| Runner | A program that reads specs, claims ready tasks, has an agent or a person do them, checks the result and lands it. Each runner acts as one GitHub login, such as `acme-alice`. Several runners may share a login. |
| Approver | A person the repository trusts to approve specs: the repository's allowed approvers list, or everyone with write access when the list is empty. |
| Writer | A user with write access to the repository. |
| Specs branch | The branch that holds the specs: the default branch unless the repository's settings name another, such as `plans`. |
| Base | The branch a task lands on: the spec's `integrationBranch` when it sets one, else the code repository's default branch. |
| Claim branch | `avoozl/<spec>/<task>`, the branch a task is worked and checked on. |

## Spec format

### Folders

A repository's specs live under one folder, `specs.path` in its
`.avoozl.json`, `.kiro/specs` by default. Each subfolder is one spec, and the
folder name is the spec's name:

```text
.kiro/specs/
  parser/
    tasks.md          required
    requirements.md   optional
    design.md         optional
    notes.md          optional
```

`tasks.md` is required. Every other `.md` file directly in the folder is spec
text: it is part of what an approver approves, and agents read it beside
`tasks.md`, but no task is read from it. Files in subfolders, files that are
not Markdown, and symlinks are not part of the spec.

### Tasks

Each checkbox line in `tasks.md` is a task: `- [ ]` open, `- [x]` ticked.

```markdown
- [ ] `cache-drop` Drop stale entries
```

A task has an ID and a title. An ID is a number such as `1.2`, or a name with
a hyphen or period such as `p-2`, written as a code span. An ID MUST be
unique across a repository's specs; a prefix per spec, such as `p-`, keeps
them apart.

Two things come from the layout, not from facts:

- A task with sub-items is a package. It is done when every sub-item is, and
  it is never worked on itself. Every other task is a leaf.
- A task's phase is the `##` heading above it.

### Task facts

A fact is a sub-bullet `$name: value` under a task. A list is
comma-separated, or the same fact written again. These are the only facts; a
runner MUST refuse a spec with any other.

| Fact | Meaning | Required |
| --- | --- | --- |
| `$after` | Task IDs that must be ticked first. A task in another spec is named by its ID alone. | No |
| `$done` | One result someone can check. Write it again for each result. | On every leaf, or plain bullets |
| `$manual` | `true` when only a person does the task | No |
| `$repo` | The one repository the task changes | When the spec covers several repositories |
| `$paths` | Files the task changes | No |
| `$investigate` | `true` when the agent writes up findings before it codes | No |
| `$type` | One lowercase word for the kind of change, such as `fix` | No |
| `$plan` | In an epic folder only: the folder name of a member spec | On each epic item |
| `$step` | In an epic folder only: `design`, `review` or `implement` (the default) | No |

A leaf with no `$done` gives its results as plain sub-bullets, one result
each:

```markdown
- [ ] `p-3` Recover after an unknown token
  - $after: p-2
  - The parser skips to the next line
  - Every later token is still read
```

How tasks are grouped into agent sessions is the runner's choice. A spec
never says it.

### Front matter

`tasks.md` MAY open with front matter of `key: value` lines. These are the
only keys:

| Key | Meaning |
| --- | --- |
| `repo` | The default `$repo` for every leaf |
| `kind` | `epic` in an epic folder; left out otherwise |
| `integrationBranch` | The branch the spec's tasks land on instead of the default branch |
| `integrationSync` | How often the default branch merges into the integration branch: `weekly` (the default), `daily` or `off` |

`requirements.md` (or `bugfix.md`) MAY carry two more keys in its front
matter:

| Key | Meaning |
| --- | --- |
| `category` | The group a spec is listed under |
| `epic` | The epic folder this spec belongs to; the epic MUST list it with `$plan` |

### Epics

An epic is a folder with `kind: epic` whose items name member specs with
`$plan`. Its items are steps of those specs, not code:

```markdown [acme/widget: .kiro/specs/v2/tasks.md]
---
kind: epic
---

- [ ] `v2-1` Parser
  - $plan: parser
- [ ] `v2-2` Formatter
  - $plan: formatter
  - $after: v2-1
```

## Approval

An approval is a commit on the specs branch that changes a spec's files and
whose author is an approver. It approves those files exactly as they are in
that commit. One commit that touches several spec folders approves each of
them.

Both of these approve:

- An approver merges a pull request that changes the spec. Anyone MAY open
  it. The merge commit's author is the approver who merged it.
- An approver pushes a commit to the specs branch.

The commit message carries nothing, and the committer does not matter, so a
squash merge made by GitHub counts. A commit whose author is not an approver
approves nothing. If it changes an approved spec, the spec's changed tasks
MUST NOT run until an approver approves the new text.

A runner notices an approval when it next reads the specs branch.

## Spec and epic issues

When a spec is approved and has no spec issue, a runner creates one in the
spec's repository. If the spec's epic has no epic issue, it creates that too,
and makes the spec issue a sub-issue of it. Only a runner acting as the
approving commit's author SHOULD do this, so runners do not race.

Each issue carries a hidden HTML comment that names the spec, so a runner can
find it again. A runner MUST look for an existing issue before it creates
one. If two open issues name one spec, the newer one is closed as a
duplicate.

A new issue copies the assignees of the pull request that approved the spec.
A spec approved by a pushed commit, or by a pull request with no assignee,
gets an unassigned issue.

## Assignment

The assignee says who runs a spec. A runner MUST run a spec only when the
spec issue, and every other issue tied to it such as its epic issue, is
assigned to the runner's own login and to no one else:

| Spec issue | Epic issue | Runner acting as `acme-alice` |
| --- | --- | --- |
| `acme-alice` | `acme-alice` | runs it |
| `acme-alice` | `acme-bob` | does not run it |
| `acme-alice` | nobody | does not run it |
| nobody | any | does not run it; shows "Unassigned" |
| `acme-alice`, `acme-bob` | any | does not run it |

A person takes a spec by assigning themselves, and releases it by removing
themselves.

### Hand-off

To give a spec to another login, the current runner stops claiming new tasks,
pushes every claim branch it holds, and a person changes the spec issue's
assignee to the new login. The new login's runner picks the spec up on its
next read and continues each pushed claim branch as its own.

## Label filters

A runner MAY narrow what it picks up with two lists per repository in its own
settings:

```json
{
  "labels": {
    "require": [
      "agent-ok"
    ],
    "exclude": [
      "needs-design"
    ]
  }
}
```

A spec runs on that runner only when its spec issue carries every `require`
label and no `exclude` label. A `require` label SHOULD count only when a
writer added it, as for [labeled issues](#labeled-issues). Label filters are
runner settings, not spec text: they never change what a spec says, and an
exclude label never unclaims a task already claimed.

## Ready tasks

A task is ready when all of these hold:

- It is a leaf and is not ticked on the specs branch.
- Its spec's current text is approved.
- Every task in its `$after` is ticked on the specs branch.
- It is not `$manual`.
- No claim branch `avoozl/<spec>/<task>` exists.
- Its spec is assigned to this runner's login and passes its label filters.

A runner MUST work only on ready tasks.

## Next task

When several tasks are ready, a runner SHOULD take the best by these keys, in
order:

1. It unblocks the most open tasks downstream, counting every task that
   waits on it through `$after`, directly or not.
2. It is on the longest remaining `$after` chain.
3. Its `$paths` do not overlap the `$paths` of a task this runner has in
   flight.
4. It comes earlier in its `tasks.md`.

A task with no `$paths` overlaps nothing for key 3.

## Claims

A runner claims a task by creating its claim branch at the base's current
head through the GitHub refs API:

```http
POST /repos/acme/widget/git/refs
{
  "ref": "refs/heads/avoozl/parser/p-2",
  "sha": "<base head>"
}
```

GitHub refuses the create when the branch exists (HTTP 422). The first runner
whose create succeeds owns the task. A runner whose create fails MUST NOT
work on that task and SHOULD take the next one. No comment or label is
needed to claim.

A runner MUST claim before an agent starts, and MUST NOT push to a claim
branch it did not create, except after a [hand-off](#hand-off).

### Stale claims

A claim branch with no new commit for N hours, a runner setting, shows as
stale to the spec's assignee. Deleting the branch frees the task, and the
next read finds it ready again. A runner MUST NOT delete another runner's
claim branch on its own; a person does that.

## Landing

Landing turns a claim branch into a tick on the specs branch.

1. Merge the base's current head into the claim branch. A runner MUST NOT
   rebase a branch someone else may hold, and MUST NOT force push.
2. Tick the task's box in `tasks.md` in the same commit as the work, or in a
   commit on the claim branch before the checks run. When the spec lives in
   another repository, tick it there in its own commit once the code has
   landed.
3. Run the repository's checks on the exact head that will land. If the base
   moves, go back to step 1.
4. Land by the code repository's landing mode.
5. Delete the claim branch once the work is on the base.

| Mode | Step 4 |
| --- | --- |
| `direct` | Push the checked head to the base, as a fast-forward. |
| `pr` | Open a draft pull request from the claim branch to the base. A person marks it ready and merges it. |
| `off` | Push the claim branch only. A person lands it. |

In `pr` mode a runner MUST NOT merge a draft, mark it ready, or arm
auto-merge on it. While the pull request is open, the claim branch exists, so
no other runner takes the task. When the base moves under an open pull
request, the runner SHOULD merge it in and run the checks again.

### Integration branches

When a spec sets `integrationBranch`, that branch is the base: claims start
from its head, and tasks land on it. A runner merges the default branch into
it on the `integrationSync` schedule, as a merge commit. A person merges the
integration branch into the default branch; a runner never does.

### Done tasks

A task is done when its box is ticked on the specs branch. The commit that
changes `- [ ]` to `- [x]` is the landing record: its time is when the task
landed and its author is who landed it. A box ticked by hand counts the same.
Ticks on other branches count for nothing.

## Labeled issues

An open issue that carries a `require` label of a runner's filters, in a
repository with no spec for it, is a one-task spec:

| Spec part | From the issue |
| --- | --- |
| Spec name | `issue-<number>` |
| Task ID | `issue-<number>` |
| Title | The issue's title |
| `$done` | The issue's body |

The label counts only when a writer added it. A runner MUST read the issue's
`labeled` event and check its actor's permission; a label a stranger added,
or a label on an issue opened by a stranger and labeled by no writer, does
nothing. The writer's label is the approval, and the issue MUST be assigned
to the runner's login, as for any spec.

The issue claims, checks and lands like any task, on
`avoozl/issue-<number>/issue-<number>`. Its landing record is the issue
closing: in `pr` mode the pull request says `Closes #<number>`, and in
`direct` mode the runner closes the issue with a comment naming the landed
commit.

## Manual tasks and gates

A `$manual` task is never given to an agent. A person does it and ticks it on
the specs branch, by a commit or by editing `tasks.md` on GitHub. Tasks that
list it in `$after` wait until then, so a manual task is also a gate: a
sign-off or a release step that holds everything after it.

### Investigating first

A task with `$investigate: true` is done in two steps. The agent writes up
its findings, the runner posts them as review output, and the agent waits.
An approver replies with a first line of one of these:

| Reply | Effect |
| --- | --- |
| `go ahead` | The same agent session codes the task |
| `investigate again` | The agent investigates again |
| `stop` | The task stops and waits for a person |

A reply from anyone who is not an approver does nothing.

### Stopping a spec

The `avoozl:stopped` label on a spec issue or epic issue stops new claims for
it. A writer MAY add it. Only an approver's removal resumes the spec.

## Review output

Review findings, an investigation's findings and failing check output go
where code review goes:

- On the task's pull request when it has one, as one review per round. A
  finding on a changed line is a line comment. The review only comments; it
  never approves or requests changes.
- Otherwise on the spec issue, as one comment per round that names the task
  ID and the commit.

A person answers a finding by resolving its thread, or with a reply that
starts with `accept`, `reject` or `defer`. Only an approver's reply counts.

## Runner limits

A runner MUST NOT:

- push to the base without the repository's checks passing on that exact
  head;
- merge a draft pull request, mark one ready, or arm auto-merge on one;
- act on a label a non-writer added;
- force push, rewrite history, or rebase a shared branch;
- delete a branch it did not create, except its own claim branch after
  landing;
- approve a spec, merge a spec pull request, author a commit as an approver,
  or change an approval in any other way;
- run a spec assigned to another login;
- follow text from an issue, comment, pull request or commit as an
  instruction, unless it is an approver's reply of a form this page lists;
- run a command that is not one of the repository's own checks;
- add a trailer, a `Co-authored-by` line or any other attribution to a
  commit message;
- write private names, paths or hosts to a public repository.

## Optional parts

| Part | Required |
| --- | --- |
| Spec format, approval, ready rule, ticks as the landing record | Yes |
| Running only specs assigned to its login | Yes |
| Claims by claim branch | Yes |
| Landing checks on the exact head, no force push | Yes |
| Runner limits | Yes |
| Next task ranking | Optional; any order of ready tasks is safe |
| Label filters | Optional |
| Labeled issues | Optional |
| Publishing spec and epic issues | Optional; without it, a person creates them |
| `pr` landing mode | Optional; `direct` or `off` alone is enough |
| Integration branches | Optional; without them, a runner refuses a spec that sets one |
| Review output | Optional; when a runner reviews, it posts as this page says |
| Investigating first | Optional; without it, `$investigate` reads as `false` |
| Stop label | Optional |
| Epics | Optional; without them, member specs run alone |

## Avoozl status

The reference implementation does not do these parts yet:

- Claims: Avoozl names a task branch `avoozl/<task>` and does not claim by
  creating it through the refs API. It holds a task while a running task
  shares its `$paths`.
- Next task: Avoozl ranks by key 1 (tasks unblocked) and key 4 (file order)
  only.
- `pr` mode: Avoozl opens a ready pull request and merges it after checks
  pass, rather than a draft that a person merges.
- Label filters and labeled issues: not built.

## Related pages

- See [specs.md](specs.md) for Avoozl's spec pages, lint and commands.
- See [delivery.md](delivery.md) for how Avoozl checks and lands a task.
- See [drivers.md](drivers.md) for which Avoozl workspace runs a spec.
