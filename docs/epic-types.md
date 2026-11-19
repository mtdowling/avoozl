# Epic types

Most specs are light: one task or a few, each landing as its own change. An epic is the large kind: a goal that needs many changes in a set order, often across specs and repositories.

Four shapes of epic come up often. Three have a template in `examples/epic-templates/`. Copy a template folder to `.kiro/specs/<your-name>/`, replace the text in angle brackets, and approve it like any spec.

| Type                       | Shape                                                                                                              | Template         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Rewrite                    | Small pull requests into a long-lived integration branch; one person lands the branch.                             | `rewrite`        |
| Cross-repository migration | A tool or compatibility layer first; one task per repository, each checked by that repository's checks; then remove the old path. | `migration`      |
| Large generated change     | Change the generator; regenerate one sample and review it; regenerate the rest in batches; remove the old output.  | `codegen-change` |
| Cross-repository proposal  | A parent spec with one sub-spec per repository.                                                                    | See below.       |

## Rewrite

Set `integrationBranch` in the front-matter of the epic's `tasks.md`, for example `integrationBranch: rewrite/my-epic`. Avoozl creates no branch: create it and protect it first. Every task pull request targets the branch. Avoozl merges the default branch into it on the schedule in `integrationSync` (`weekly`, `daily` or `off`) as a merge commit, and never rebases or force pushes. The tick reads the branch head's checks and records acceptance for that head. A task merge moves the head, so acceptance stays open until the new head is green. While the head is red, or a sync has a conflict, release and auto-merge stop for the epic. When the head is green and level with the default branch, one Needs you row asks a person to approve landing that head. Avoozl records who and which head, and never merges the branch itself.

## Cross-repository migration

Stage one builds the tool. Each repository task lists stage one in its `after` fact, and its repository's checks run on it. Removal lists every repository task in `after`. To add a repository, copy a `migrate-repo-*` entry and add its ID to the `after` fact of `remove-old-path`.

## Large generated change

Each regeneration task names the command it runs and, in its `done` lines, the command that compares the output. Replace `<generate command>` and `<compare command>` in each task. Keep a batch small enough to review in one pull request.

## Cross-repository proposal

A proposal is an epic folder (the parent) that lists one sub-spec per repository. The parent holds the shared requirements and the list of sub-specs, and no repository tasks. Each sub-spec has its own requirements, design and tasks, and is approved and released on its own. A task in one sub-spec can need a task in another by naming that task's ID in its `after` fact. Avoozl refuses the ID until the other sub-spec is approved and holds it.

### Gap report

A gap report lists, per repository, which requirements it still fails. Give Avoozl a Markdown table, from a file or an issue body:

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

To read the table from an issue body, use `--issue OWNER/REPO#N` in place of `--path`.

`preview` prints the table and one proposed task for each failing cell. A passing cell gives none. A line Avoozl cannot read is refused by its number. Nothing is added to a spec until a person runs `accept`; the tasks are added as draft work that you review and approve again. A sub-spec takes a repository when its task facts name the repository (`repo`), or when its folder name is the repository's name.
