# Epic types

An epic is a goal that needs many changes in a set order, often across specs
and repositories. Most specs are light, with one task or a few that each land as
their own change.

```sh
cp -R examples/epic-templates/rewrite .kiro/specs/my-rewrite
```

Four shapes of epic come up often, and three have a template in
`examples/epic-templates/`. Copy a template folder to
`.kiro/specs/<your-name>/`, replace the text in angle brackets, and approve it
like any spec.

| Type                       | Shape                                                                                                              | Template         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Rewrite                    | Small pull requests into a long-lived integration branch; one person lands the branch.                             | `rewrite`        |
| Cross-repository migration | A tool or compatibility layer first; one task per repository, each checked by that repository's checks; then remove the old path. | `migration`      |
| Large generated change     | Change the generator; regenerate one sample and review it; regenerate the rest in batches; remove the old output.  | `codegen-change` |
| Cross-repository proposal  | A parent spec with one sub-spec per repository.                                                                    | See below.       |

## Rewrite

Create a branch named exactly as the epic's folder, such as `my-epic`, and
protect it. Avoozl creates no branch. Every task pull request targets the
branch. Before each claim, Avoozl merges the default branch into it when the
default branch has moved, as a merge commit, and never rebases or force pushes.
See [Integration branches](github-workflow.md#11-integration-branches). The tick reads the branch head's checks and records acceptance for that
head. A task merge moves the head, so acceptance stays open until the new head
is green. While the head is red, or a sync has a conflict, release and
auto-merge stop for the epic. When the head is green and level with the default
branch, one Needs you row asks a person to approve landing that head. Avoozl
records who and which head, and never merges the branch itself.

## Cross-repository migration

Stage one builds the tool. Each repository task follows stage one in the list,
and its repository's checks run on it. Removal comes last. To add a repository,
copy a `migrate-repo-*` entry above `remove-old-path`.

## Large generated change

Each regeneration task names the command it runs and, in its `done` lines, the
command that compares the output. Replace `<generate command>` and `<compare
command>` in each task. Keep a batch small enough to review in one pull request.

## Cross-repository proposal

A proposal is an epic folder (the parent) that lists one sub-spec per
repository. The parent holds the shared requirements and the list of sub-specs,
and no repository tasks. Each sub-spec has its own requirements, design and
tasks, and is approved and released on its own. The parent links each sub-spec
from a task title, and the order of those tasks is the order of the sub-specs.
See [Linked specs](github-workflow.md#6-linked-specs).

### Gap report

A gap report lists, per repository, which requirements it still fails. Give
Avoozl a Markdown table from a file or an issue body:

```text
| Repository | R1   | R2   |
| ---------- | ---- | ---- |
| repo-a     | pass | fail |
| repo-b     | fail | pass |
```

```text
avoozl gap-report preview PARENT_SPEC --path report.md
avoozl gap-report accept PARENT_SPEC --path report.md
```

To read the table from an issue body, use `--issue OWNER/REPO#N` in place of
`--path`.

`preview` prints the table and one proposed task for each failing cell. A
passing cell gives none. Avoozl refuses a line it cannot read and names its
number. Nothing is added to a spec until a person runs `accept`, and then the
tasks arrive as draft work that you review and approve again. A sub-spec takes a
repository when its front matter names it (`repo`), or when its folder name is
the repository's name.
