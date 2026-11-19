# Specs

A spec is a Kiro spec folder that says what to build and in what order. Avoozl
turns an approved spec into tasks and runs each one once the tasks it waits on
have landed.

```text
.kiro/specs/<name>/
  requirements.md (or bugfix.md)
  design.md
  tasks.md
```

Inside Avoozl's interfaces a spec is stored as a plan, so the `plan.*`
operations, the `plans_*` MCP tools, and the `plan` CLI commands keep that
name.

## Task list

Each checkbox in `tasks.md` is a task with an ID and a title. Its first child
is a `Facts:` bullet, and the bullets after it are the task's summary:

```markdown
---
repo: app
---

- [ ] 1.2 Validate config
  - Facts:
    - after: 1.1
    - done:
      - An unknown key is reported with its path
  - Report each key the schema does not name, with its JSON path.
```

The facts give the task's kind, its acceptance (`done`), its dependencies
(`after`), and its completion level. The front matter holds defaults for every
task, such as `repo`.

The summary says what the task delivers and how, and its worker reads it after
the title. Write one only when it adds to the title. Lint refuses a summary
that repeats the title.

A task never names checks. Every task runs its repository's checks. See
[Repository checks and isolation](checks.md) for how
checks are set.

### Batches

The planner can group small related tasks so they run in one session and one
worktree, with one commit per task. Each member's facts say `batch: <group>`,
and the front matter gives the group's reason:

```markdown
---
repo: app
batch-docs: Three one-line help text fixes in the same file
---
```

A group runs once every task in it is ready. Avoozl checks that the members
share one spec and one repository, have no dependency between them, number at
most 5, and come from an approved revision. A group that breaks a rule runs as
single tasks, and Avoozl says why. A batch whose checks fail splits.

### Lint

Avoozl refuses a folder that:

- is missing one of its files
- has a `tasks.md` with a missing or repeated ID
- uses a fact Avoozl does not know
- still holds an `avoozl/manifest.json`

## Creating a spec

Choose **New spec** on the Specs page. Name it, pick the repositories in
scope, and pick how to start:

- **Blank**: Kiro Crew's Spec Builder writes the spec with you, requirements
  first, then design, then tasks, each for you to review.
- **From a goal**: you type the goal, and an Avoozl planner chat writes the
  draft.
- **From template**: you start from a workflow template in an approved
  plugin. See [Writing a plugin](plugins.md#template-part) for writing one.

Before Spec Builder starts, Avoozl offers to add
`.kiro/steering/avoozl-specs.md` to the repository and shows its text. The
file holds Avoozl's spec rules, and Avoozl never writes it over a copy you
changed. When Spec Builder is turned off in Kiro Crew's Apps, the drawer says
so and offers an `avoozl-planner` chat instead.

Once the folder lints clean, Avoozl stores it as a draft. From the CLI:

```sh
node cli.mjs plan.create --json '{"spec":"NAME"}' --workspace ~/plans
```

## Approving a spec

Select the spec, review the lint results and the graph, then choose **Approve
revision**. Approval records the exact revision hash, so a later edit reads as
unapproved until you approve again. `node cli.mjs plan approve NAME` previews
the approval from the CLI.

A spec can be as small as one task. With the repository's `landing` set to
`pr`, a one-task spec becomes one pull request, checked and merged like any
other task. See [Delivery](delivery.md#landing) for the landing settings.

To let an agent approve for you, grant it once from your own terminal. See
[Person-only operations](person-only.md#approval-delegation) for approval
delegation.

### Approval commits

An approval is a commit on the spec repository's main branch that changes the
spec's files and whose author is an approver. The approvers are
`github.repositories.<repo>.allowedActors`, or the people with write access
when it names nobody. In Local only mode the approver is this checkout's
`user.email`.

The commit message carries nothing. The committer neither grants nor blocks
an approval, so a squash merge or a commit someone made for the author counts
the same.

Avoozl and its agents commit with the checkout's own git identity as author
and committer, with no `Co-authored-by` or other attribution. Spec drafts
stay on a spec branch, so an agent's spec edit reaches main only through
**Approve**. Approve writes one commit on main, authored by you, with the spec
as you reviewed it, and pushes it without force. If main already holds that
exact text from someone who is not an approver, Approve refuses, because git
cannot record an approval that changes nothing; edit it through a spec branch.

## Dependencies across specs

A task can wait on a task in another spec. Load each referenced spec as a
stored draft first; the preview then tells a declared task apart from an
existing approved one.

You approve each spec separately, and approval creates only that spec's tasks.
`plan approve NAME...` approves exactly the specs it names. A task that waits
on a draft spec stays pending, and the preview counts those tasks. They start
once that spec is approved too. Only a task marked `[x]`, which starts as
done, needs its owners approved in the same batch.

An unrelated newer draft does not erase a spec's last real approval. Retiring
an owning spec puts the waiting tasks on hold again.

## Ticks in tasks.md

A tick in `tasks.md` on the spec's base branch is how task state moves
between people. The commit that lands a task ticks its box there; a spec kept
in a separate plans repository gets its own commit for it. Another machine
that reads the branch marks the task done in its own database.

A tick you commit by hand counts the same. On its next tick, Avoozl marks the
task done with no new approval and closes any worker session it had on it.
Ticks on other branches, unsaved edits, and `[~]` or `[-]` marks do nothing.

If a tick is taken out of a done task, the task stays done, and **Needs you**
offers **Reopen** or **Keep done**.

## Older plan files

Avoozl still reads plan files written with fenced `task` blocks, so their work
can move to spec folders.
