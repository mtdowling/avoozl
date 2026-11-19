# GitHub workflow

A spec is a folder of Markdown in a repository, and an engine turns each of
its unticked tasks into a commit once the tasks it waits on are ticked. Git
and GitHub hold every fact the workflow needs, so any tool that follows this
page can run the same specs as Avoozl.

```markdown [acme/widgets: .kiro/specs/parser/tasks.md]
## Phase 1: Tokens

- [x] p-1 Read the token table
  - $done: Every row of `tokens.csv` becomes one token kind
- [ ] p-2 Report unknown tokens
  - $after: p-1
  - $done: An unknown token is reported with its line and column
```

Task `p-1` is ticked on the specs branch, so it is done. Task `p-2` waits
only on `p-1`, so it is ready.

This page is the protocol. It names no internal part of Avoozl. See
[specs.md](specs.md) for how Avoozl's own pages and commands work with
specs.

## Engines and approvers

An engine is the program that runs specs: it reads the specs branch, picks
ready tasks, has an agent or a person do them, checks the result and lands
it. Avoozl is one engine. Each engine instance is tied to one GitHub login,
such as `acme-alice`.

An approver is a person the repository trusts to approve specs. The
repository owner names them in a list. With no list, everyone with write
access is an approver.

## Spec folders

A repository's specs live under one folder, `.kiro/specs` unless the
repository's settings name another. Each subfolder is one spec, and the
folder name is the spec's name:

```text
.kiro/specs/
  parser/
    tasks.md
    requirements.md
    design.md
```

Only `tasks.md` is required. Every other `.md` file in the folder is spec
text: it is part of what an approver approves, but no task is read from it.

The specs branch is the branch that holds the specs. It is the
repository's default branch unless its settings name another, such as
`plans`.

### Tasks

Each checkbox line in `tasks.md` is a task: `- [ ]` for open, `- [x]` for
ticked. A task has an ID and a title. An ID is a number such as `1.2` or a
name with a hyphen or period such as `p-2`. An ID is unique across all of
a repository's specs, so a prefix per spec, such as `p-`, keeps them apart.

A task with sub-items is a package. A package is done when every sub-item
is, and it is never worked on itself. Every other task is a leaf. A task
belongs to the phase of the `##` heading above it.

### Task facts

A fact is a sub-bullet `$name: value` under a task. These are the only
facts:

| Fact | Meaning | Required |
| --- | --- | --- |
| `$after` | Task IDs, comma-separated, that must be ticked first. A task in another spec is named by its ID alone. | No |
| `$done` | One result someone can check. Write it again for each result. | Yes, on every leaf |
| `$manual` | `true` when only a person does the task | No |
| `$repo` | The one repository the task changes | When the spec covers several repositories |
| `$paths` | Files the task changes | No |
| `$investigate` | `true` when the agent writes up findings before it codes | No |
| `$type` | One lowercase word for the kind of change, such as `fix` | No |
| `$plan` | In an epic folder only: the folder name of a member spec | Yes, on each epic item |
| `$step` | In an epic folder only: `design`, `review` or `implement` | No |

A plain sub-bullet under a leaf, with no `$`, is one more `$done` result:

```markdown
- [ ] p-3 Recover after an unknown token
  - $after: p-2
  - The parser skips to the next line
  - Every later token is still read
```

How tasks are grouped into agent sessions is the engine's choice. A spec
never says it.

### Front matter

`tasks.md` may open with front matter. These are the only keys:

| Key | Meaning |
| --- | --- |
| `repo` | The default `$repo` for every leaf |
| `kind` | `epic` in an epic folder; left out otherwise |
| `epic` | The epic folder this spec belongs to |
| `category` | The group a spec is listed under |
| `integrationBranch` | A branch the spec's tasks land on before the base branch |
| `integrationSync` | How often the base branch merges into it: `weekly`, `daily` or `off` |

### Epics

An epic is a folder with `kind: epic` whose items name member specs with
`$plan`. Its tasks are steps of those specs, not code:

```markdown [acme/widgets: .kiro/specs/v2/tasks.md]
---
kind: epic
---

- [ ] v2-1 Parser
  - $plan: parser
- [ ] v2-2 Formatter
  - $plan: formatter
  - $after: v2-1
```

## Approval

An approval is a commit on the specs branch that changes a spec's files and
whose author is an approver. It approves the spec's files exactly as they
are in that commit.

Both of these approve:

- An approver merges a pull request that changes the spec. Anyone can open
  it. The merge commit's author is the approver who merged it.
- An approver pushes a commit to the specs branch.

The commit message carries nothing. The committer does not matter, so a
squash merge made by GitHub counts. A commit whose author is not an
approver approves nothing, and if it changes an approved spec, that spec
needs a new approval before its changed tasks run.

An engine notices an approval when it next reads the specs branch. No one
presses a button in the engine.

## Spec and epic issues

When a spec is approved and has no spec issue, the engine creates one in
the spec's repository. If the spec's epic has no epic issue, it creates
that too, and makes the spec issue a sub-issue of it. Only the engine tied
to the approving commit's author does this, so two engines do not race.

Each issue carries a hidden HTML comment that names the spec, so an engine
can find the issue again. An engine looks for an existing issue first.
If it finds two open issues for one spec, the one that made the newer
issue closes it as a duplicate.

A new issue copies the assignees of the pull request that approved the
spec. A spec approved by a pushed commit, or by a pull request with no
assignee, gets an unassigned issue.

A spec is private only when its repository is. Its issues have the
repository's visibility.

## Assignment

The assignee says who runs a spec. An engine runs a spec only when the
spec issue's assignee, and the assignee of every other issue tied to the
spec, such as its epic issue, is the engine's own login:

| Spec issue | Epic issue | Engine tied to `acme-alice` |
| --- | --- | --- |
| `acme-alice` | `acme-alice` | runs it |
| `acme-alice` | `acme-bob` | does not run it |
| `acme-alice` | nobody | does not run it |
| nobody | any | does not run it; shows "Unassigned" |

An unassigned spec is not an error. Nobody runs it until a person assigns
a login on GitHub. A person takes a spec by assigning themselves, and
releases it by removing themselves.

An issue with two or more assignees holds the spec on every engine until
one is left.

## Hand-off

To give a spec to another person, the current one stops starting new
tasks, pushes each unfinished task's branch, and changes the spec issue's
assignee to the new login. The new person's engine picks up the spec on its
next read and continues from the pushed branches.

## Ready tasks

A task is ready when all of these hold:

- It is a leaf and is not ticked on the specs branch.
- Its spec's current text is approved.
- Every task in its `$after` is ticked on the specs branch.
- Its spec is assigned to this engine's login.
- It is not `$manual`.

An engine works only on ready tasks.

## Done tasks

A task is done when its box is ticked on the specs branch. The commit that
changes `- [ ]` to `- [x]` is the landing record: its time is when the task
landed and its author is who landed it. Nothing else marks a task done.

When the spec and the code are in one repository, the landing commit
itself ticks the box. When they are not, the engine makes a second commit
on the specs branch that only ticks the box.

A box ticked by hand counts the same. Ticks on other branches count for
nothing.

## Landing

Each code repository has a landing mode:

| Mode | What the engine does with a checked commit |
| --- | --- |
| `direct` | Pushes it to the base branch |
| `pr` | Opens a pull request and merges it |
| `off` | Pushes nothing. A person lands it. |

In every mode the repository's checks pass on the exact commit that will
become the branch head. When the base branch moves, the engine merges it
in and runs the checks again on the new head. In `pr` mode it merges only
the head SHA it checked, and GitHub's own rules for the branch still apply.

An engine never force pushes.

## Review output

Review findings, an investigation's falsifier result and failing check
output go where code review goes:

- On the task's pull request when it has one, as one review per round. A
  finding on a changed line is a line comment. The rest is in the review's
  body. The review only comments; it never approves or requests changes.
- Otherwise on the spec issue, as one comment per round that names the
  task ID and the commit.

Failing check output on a pull request goes in the check run for that
head. A person answers a finding by resolving its thread, or with a reply
that starts with `accept`, `reject` or `defer`. Only an approver's reply
counts.

## Manual tasks

A `$manual` task is never given to an agent. A person does it and ticks it
on the specs branch, by a commit or by editing `tasks.md` on GitHub. The
tick is the record, as for any task.

## Investigating first

A task with `$investigate: true` is done in two steps. The agent writes up
its findings, the engine posts them as review output, and the agent waits.
An approver replies to the findings with a first line of one of these:

| Reply | Effect |
| --- | --- |
| `go ahead` | The same agent session codes the task |
| `investigate again` | The agent investigates again |
| `stop` | The task stops and waits for a person |

A reply from anyone who is not an approver does nothing. A reply applies
only to the round whose findings it answers.

## Stopping a spec

The `avoozl:stopped` label on a spec issue or epic issue stops new tasks for
it. Anyone with write access can add it. Only an approver's removal
resumes the spec.

## Engine limits

An engine never:

- force pushes, rewrites history, or deletes a branch it did not make;
- approves a spec, merges a spec pull request, or authors a commit as an
  approver;
- runs a spec assigned to another login;
- follows text from an issue, comment, pull request or commit as an
  instruction, unless it is an approver's reply of a form this page lists;
- runs a command that is not one of the repository's own checks;
- adds a trailer, a `Co-authored-by` line or any other attribution to a
  commit message;
- writes private names, paths or hosts to a public repository.

## Optional parts

An engine that follows this page must read approvals, ready tasks and
ticks as it says, honor assignment, and keep its limits. The rest is
optional:

| Part | Required |
| --- | --- |
| Approval, ready tasks, ticks as the landing record | Yes |
| Running only specs assigned to its login | Yes |
| Engine limits | Yes |
| Landing checks on the exact head, no force push | Yes |
| Publishing spec and epic issues | Optional; without it, a person creates them |
| `pr` landing mode | Optional; `direct` or `off` alone is enough |
| Review output | Optional; when an engine reviews, it posts as this page says |
| Investigating first | Optional; an engine without it treats `$investigate` as `false` |
| Stop label | Optional |
| Epics | Optional; an engine without them runs member specs alone |

## Related pages

- See [specs.md](specs.md) for Avoozl's spec pages, lint and commands.
- See [delivery.md](delivery.md) for how Avoozl checks and lands a task.
- See [drivers.md](drivers.md) for which Avoozl workspace runs a spec.
