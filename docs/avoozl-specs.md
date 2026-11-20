# Specs in Avoozl

A spec is a Kiro spec folder that says what to build and in what order. Avoozl
runs an approved spec as [workflow v1](github-workflow.md) says, and this page
covers what Avoozl adds: where it finds specs, how it names refs, what its
lint refuses and how its page and commands handle a spec.

```markdown
---
repo: app
---

- [ ] `cfg-1` Validate config [R1.2] (§2.1)
  - An unknown key is reported with its path
- [ ] `cfg-2` Report the keys (**PARALLEL**)
  - [ ] `cfg-3` Print each key
    - Each key the schema does not name is printed with its JSON path
  - [ ] `cfg-4` Count the keys
    - The report names how many keys were unknown
```

[Workflow v1](github-workflow.md#2-tasks) defines the task format, the order
of the list, the two title tags, front matter, linked specs and integration
branches. Avoozl reads each of them as written there.

## Spec folders

```text
.kiro/specs/<name>/
  tasks.md                         required
  requirements.md (or bugfix.md)   optional
  design.md                        optional
  <anything>.md                    optional
```

Kiro's layout of `requirements.md` (or `bugfix.md`), `design.md` and `tasks.md`
works as it always has. Every other Markdown file directly in the folder is
spec text: it is part of the revision, so editing it needs a new approval, and
workers and reviewers read it beside `tasks.md`. Files in subfolders such as
`avoozl/`, files that are not Markdown, and symlinks are not part of the spec.
A spec file may be at most 1 MB, and a folder may hold at most 50 of them.

### Where specs live

Spec folders live in `.kiro/specs/` unless the `.avoozl.json` at the root of
the repository that holds them says otherwise:

```json
{
  "version": 1,
  "specs": {
    "path": "docs/specs"
  }
}
```

`specs.path` is relative to that repository's root. Avoozl refuses one that
is absolute, names a `.` or `..` folder, or is a symlink that leads out of
the checkout. Kiro's Spec Builder and Kiro Crew planner chats still write in
`.kiro/specs/`; with another path, draft with a planner that runs as a
process, or move the folder there after Kiro writes it.

Inside Avoozl's interfaces a spec is stored as a plan, so the `plan.*`
operations, the `plans_*` MCP tools, and the `plan` CLI commands keep that
name.

## Refs

A title may end in refs. `[R1.2]` names the requirements the task builds and
`(§2.1)` the design sections it follows; each is a comma-separated list, and
a range such as `R4.1–R4.3` (or `NK1 to NK3`) names both ends. Each ref must
exist in the same spec:

- A requirement ref is `R<n>` for a `Requirement <n>:` heading, or the
  heading's own ID, such as `DL2` for `Requirement DL2:`. Add `.<m>` for its
  numbered criterion `<m>.`, such as `R1.2` or `DL2.3`.
- A design ref is `§` and the number a `design.md` heading starts with, such
  as `§2.1` for `### 2.1 Loader` or `§D1` for `## D1. Shape`.

A ref is checked against its file only when the spec has that file. A spec
with no `requirements.md` or `bugfix.md` can name no requirement, and one
with no `design.md` no design section: lint names the missing file.

The page shows a task's refs as chips beside it, and a chip opens that
requirement or section in the spec.

A task never names checks. Every task runs its repository's checks. See
[Repository checks and isolation](checks.md) for how checks are set.

## Lint

Spec lint checks a folder against the spec rules of workflow v1 (sections 1 to
6). Avoozl also refuses a folder that:

- has no `tasks.md`, or has both `requirements.md` and `bugfix.md`
- has a `tasks.md` with a missing or repeated ID
- has a requirement or design ref that names nothing in the spec, or whose
  file the spec does not have
- still holds an `avoozl/manifest.json`

## Creating a spec

Choose **New spec** on the Specs page. Name it, pick the repositories in
scope, and pick how to start:

- **Blank**: Kiro Crew's Spec Builder writes the spec with you, requirements
  first, then design, then tasks, each for you to review.
- **From a goal**: you type the goal, and an Avoozl planner chat writes the
  draft.

Before Spec Builder starts, Avoozl offers to add
`.kiro/steering/avoozl-specs.md` to the repository and shows its text. The
file holds Avoozl's spec rules, and Avoozl never writes it over a copy you
changed. When Spec Builder is turned off in Kiro Crew's Apps, the drawer says
so and offers an `avoozl-planner` chat instead.

Once the folder lints clean, Avoozl stores it as a draft. From the CLI:

```sh
avoozl plan.create --json '{"spec":"NAME"}' --workspace ~/plans
```

## Approving a spec

Approve a spec by merging its pull request on GitHub. An approver's commit
on main is the approval, and Avoozl reads it on its next tick. One pull
request may carry several specs and their epic; it approves each of them.
For a draft in a checkout here, select the spec, review the lint results
and the graph, then choose **Approve**: it commits the draft to main as you.
`avoozl plan approve NAME` previews that from the CLI. Approval records the
exact revision hash, so a later edit reads as unapproved until it is
approved again. After approval, **Make the GitHub issues** makes the spec's
issue and its epic's.

A spec can be as small as one task. With the repository's `landing` set to
`pr`, a one-task spec becomes one pull request, checked and merged like any
other task. See [Delivery](delivery.md#landing) for the landing settings.

### Approval commits

An approval is a commit on the spec repository's specs branch (see
[The specs branch](#the-specs-branch)) that changes the spec's files and whose
author is an approver. The approvers are
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

## Order across specs

A parent spec links each member spec from a task title, and the order of those
tasks is the order of the specs. See
[Linked specs](github-workflow.md#6-linked-specs) for the rules.

You approve each spec separately, and approval creates only that spec's tasks.
`plan approve NAME...` approves exactly the specs it names. A task of a linked
spec waits until that spec is approved too, and the preview counts those tasks.
Retiring a spec puts the tasks that wait on it on hold again. An unrelated
newer draft does not erase a spec's last real approval.

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

## The specs branch

Specs live on one branch of the spec repository: the planning repository in
plans-repo mode, else the repository that holds `.kiro/specs/`. It is the
repository's base branch unless `.avoozl.json` names another:

```json [.avoozl.json]
{
  "specs": {
    "branch": "avoozl-plans"
  }
}
```

Avoozl reads `.kiro/specs/` from that branch, an approval is an approver's
commit there, and ticks are read and written there. Code still lands on each
code repository's own base branch. Keep the spec checkout on that branch:
when it has another branch checked out, the Specs page names the problem.
The repository can be private or public; nothing else changes.

## Older plan files

Avoozl still reads plan files written with fenced `task` blocks, so their work
can move to spec folders.
