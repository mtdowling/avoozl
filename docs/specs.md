# Specs

A spec is a Kiro spec folder that says what to build and in what order. Avoozl
turns an approved spec into tasks and runs each one once the tasks it waits on
have landed.

```text
.kiro/specs/<name>/
  tasks.md                         required
  requirements.md (or bugfix.md)   optional
  design.md                        optional
  <anything>.md                    optional
```

Only `tasks.md` is required. Kiro's layout of `requirements.md` (or
`bugfix.md`), `design.md` and `tasks.md` works as it always has. Every other
Markdown file directly in the folder is spec text: it is part of the
revision, so editing it needs a new approval, and workers and reviewers read
it beside `tasks.md`. Files in subfolders such as `avoozl/`, files that are
not Markdown, and symlinks are not part of the spec. A spec file may be at
most 1 MB, and a folder may hold at most 50 of them.

### Where specs live

Spec folders live in `.kiro/specs/` unless the `.avoozl.json` at the root of
the repository that holds them says otherwise:

```json
{ "version": 1, "specs": { "path": "docs/specs" } }
```

`specs.path` is relative to that repository's root. Avoozl refuses one that
is absolute, names a `.` or `..` folder, or is a symlink that leads out of
the checkout. Kiro's Spec Builder and Kiro Crew planner chats still write in
`.kiro/specs/`; with another path, draft with a planner that runs as a
process, or move the folder there after Kiro writes it.

Inside Avoozl's interfaces a spec is stored as a plan, so the `plan.*`
operations, the `plans_*` MCP tools, and the `plan` CLI commands keep that
name.

See [GitHub workflow](github-workflow.md) for the protocol any tool can
follow to run specs on GitHub: approvals, assignees, claims, landing and
ticks.

## Task list

Each checkbox in `tasks.md` is a task with an ID and a title. The bullets
under it that start with `$` are its facts, and the other bullets are its
summary:

```markdown
---
repo: app
---

- [ ] 1.2 Validate config [R1.2] (§2.1)
  - $after: 1.1
  - $done: An unknown key is reported with its path
  - Report each key the schema does not name, with its JSON path.
```

An ID is Kiro's number (`1`, `1.2`) or a named ID with a hyphen or period.
Write a named ID as a code span, as Avoozl does:
``- [ ] `cache-invalidation` Drop stale entries``. A bare
`- [ ] cache-invalidation Drop stale entries` names the same task.

A title may end in refs. `[R1.2]` names the requirements the task builds and
`(§2.1)` the design sections it follows; each is a comma-separated list, and
a range such as `R4.1–R4.3` (or `NK1 to NK3`) names both ends. Each ref must
exist in the same spec:

- A requirement ref is `R<n>` for a `Requirement <n>:` heading, or the
  heading's own ID, such as `DL2` for `Requirement DL2:`. Add `.<m>` for its
  numbered criterion `<m>.`, such as `R1.2` or `DL2.3`.
- A design ref is `§` and the number a `design.md` heading starts with, such
  as `§2.1` for `### 2.1 Loader` or `§D1` for `## D1. Shape`.
- Either list may name a fact row such as `| F13 |` in its own file.

A ref is checked against its file only when the spec has that file. A spec
with no `requirements.md` or `bugfix.md` can name no requirement, and one
with no `design.md` no design section: lint names the missing file.

The page shows a task's refs as chips beside it, and a chip opens that
requirement or section in the spec.

The facts give the task's acceptance (`$done`) and its dependencies
(`$after`). Each fact is one bullet on one line. A list is comma-separated
(`$after: 1.1, 1.2`) or the same fact written again, and each `$done:`
bullet is one result. A comma inside backticks does not split. `$paths`
also reads a Files note as written: in
``$paths: `src/a.nupp` (new), `README.md`.`` the backticks, the `(new)` note
and the closing period are not part of the paths. The front matter holds
defaults for every task, such as `repo`, written without the `$`.
[Task facts](#task-facts) lists every fact, and
[Front matter](#front-matter) every front-matter key.

Two things are read from the layout, not from facts. An item with sub-items
is a package, done when its sub-items are; every other item is a leaf. A
task's phase is the `##` heading above it, and the heading text is the
phase title.

The summary says what the task delivers and how, and its worker reads it after
the title. Write one only when it adds to the title. Lint refuses a summary
that repeats the title.

A leaf with no `$done` gives its results as plain bullets instead: each plain
bullet under it is one result, and it has no summary. Avoozl's own writers
(the planner, templates and skills) always write `$done`, so a task can keep
a summary.

A task never names checks. Every task runs its repository's checks. See
[Repository checks and isolation](checks.md) for how
checks are set.

### Task facts

These are all the facts a task can have. A fact not listed here is the lint
error `facts.unknown-key`. A list fact takes `a, b` on one line, or the same
fact written again.

| Fact | What it does | Required? | Format | Example |
| --- | --- | --- | --- | --- |
| `$done` | One result someone can check. The task is accepted when all hold. | Yes, on every leaf, or plain bullets in its place. A package may leave it out. | one per bullet | `$done: An unknown key is reported` |
| `$after` | Tasks that must finish first. | No | list | `$after: 1.1, x-2` |
| `$repo` | The one repository the task changes. | Yes when the workspace has several repositories, and on a manual task | one value | `$repo: app` |
| `$manual` | `true` makes a step only a person does. It is never sent to an agent and is done when a person marks it. It may not have `$paths`. | No | one value | `$manual: true` |
| `$paths` | Files the task changes. Avoozl holds a task back while a running task changes the same paths. | No | list | ``$paths: `src/a.mjs` (new)`` |
| `$investigate` | `true` or `false`. With `true` the worker writes up its findings before it codes. | No | one value | `$investigate: true` |
| `$type` | One lowercase word for the kind of change. `fix` counts as a bug fix in Flow. | No | one value | `$type: fix` |
| `$plan` | In an epic folder only: the member spec's folder name. | Yes, on each epic item | one value | `$plan: runtime-contracts` |
| `$step` | In an epic folder only: `design`, `review` or `implement` (the default). | No | one value | `$step: review` |

An epic item may hold only `$plan` and `$step`.

Every other fact is gone. Lint reports each one as `facts.removed-key` at
its line and says what to do: `$kind`, `$phase`, `$batch`, `$completion`,
`$sequence`, `$repositoryId`, `$taskId`, `$nextAction`, `$labels`,
`$milestone`, `$iteration`, `$scope`, `$resources`, `$needs`, `$tags`,
`$supports`, `$unblocks`, `$authority`, `$route`, `$track`, `$source`,
`$distinctReason`, `$session`, `$verify`, `$acceptFrom`, `$ship`, `$built`,
`$summary` and `$checks`. An `$after` entry with a completion level, such
as `x-2:released`, is refused too: write the task ID alone.

A small spec with every common fact:

```markdown
---
repo: app
---

- [ ] `x-1` Parse the config file
  - $done: A file with every key loads
  - $paths: `src/config.mjs`
- [ ] `x-2` Check the config with a person
  - $after: x-1
  - $manual: true
  - $done: The owner read the sample output
```

### Front matter

`tasks.md` may start with a front-matter block of `key: value` lines,
written without the `$`. A key not listed here is the lint error
`facts.unknown-key`. A `Status:` line and a `#` comment are skipped.

| Key | What it does | Required? | Format | Example |
| --- | --- | --- | --- | --- |
| `repo` | The default `$repo` for every leaf. | No | one value | `repo: app` |
| `integrationBranch` | The branch the spec's tasks land on before main. | No | one value | `integrationBranch: rewrite` |
| `integrationSync` | How often main merges into the integration branch: `weekly` (the default), `daily` or `off`. Needs `integrationBranch`. | No | one value | `integrationSync: daily` |
| `kind` | Only `epic`: this folder lists member specs, not tasks. Leave it out otherwise. | Yes, in an epic folder | one value | `kind: epic` |

The keys `completion`, `ship`, `forwardTarget`, `publicBranch`, `checks`,
`phase-<id>` and `batch-<id>` are gone. Lint reports each one as
`facts.removed-key` and says what to do.

`requirements.md` or `bugfix.md` may start with front matter too. Avoozl
reads two keys there, and skips the rest without a warning. A bad value is
a warning, not an error, because it changes only how the spec is grouped.

| Key | What it does | Required? | Format | Example |
| --- | --- | --- | --- | --- |
| `category` | The group the spec is shown under, up to 160 characters. | No | one value | `category: Runtime` |
| `epic` | The epic folder the spec belongs to. The epic's `tasks.md` must list it too. | No | one value | `epic: rewrite` |

Avoozl reads no front matter in `design.md`.

### Lint

Avoozl refuses a folder that:

- has no `tasks.md`, or has both `requirements.md` and `bugfix.md`
- has a `tasks.md` with a missing or repeated ID
- has a requirement or design ref that names nothing in the spec, or whose
  file the spec does not have
- uses a fact or front-matter key Avoozl does not know, or one that is gone
- still has a `Facts:` bullet, the old layout; write its facts as `$` bullets
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
avoozl plan.create --json '{"spec":"NAME"}' --workspace ~/plans
```

## Approving a spec

Select the spec, review the lint results and the graph, then choose **Approve
revision**. Approval records the exact revision hash, so a later edit reads as
unapproved until you approve again. `avoozl plan approve NAME` previews
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
