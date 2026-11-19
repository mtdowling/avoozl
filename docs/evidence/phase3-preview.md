# Phase 3 projection preview: task 3.12

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 3.

- Implementation commit: `17c8234` ("Preview every GitHub write a projection would make")
- Base: `kirocrew-native` at `c7af204`
- Recorded: 2026-11-12, macOS. Tests use temporary workspaces and a fake
  GitHub. No live GitHub call was made.

## Checks

| Check | Result |
|---|---|
| `npm test` at `17c8234` | exit 0; 746 tests, 746 pass, 0 fail |
| New tests | `src/app/test/github-preview.test.mjs`, 4 tests |
| `kirocrew-app/ui` tests | 19 of 19 pass (1 new) |
| `git diff --check` | clean |

`npm test` rebuilds `canvas-app/extension.js`; that file was restored and is
not part of the change.

## How the preview cannot drift

The preview runs the real `projectPlanIssues` (with `dryRun: true`) and the
real `syncProject`. It gives them two stand-ins:

| Stand-in | Job |
|---|---|
| `store.scratch()` (`src/app/store.mjs`) | an in-memory copy of every table; SQLite writes land there and are dropped |
| `PreviewGitHub` (`src/app/github-preview.mjs`) | passes reads through, applies each write to its own copy of what it read, and records the write instead of sending it |

`dryRun` changes one thing in projection: a repository whose active machine
is not this one is listed in `previewOnly` instead of failing, and the
writes its writer would make are still listed. The real run still refuses it.

A write the stand-in has no method for throws; it is never passed through.

## Surfaces

| Surface | Name |
|---|---|
| Operation (observe) | `github.project.preview` `{planId, repository?}` |
| MCP (read-only) | `plans_project_preview` |
| CLI | `avoozl github preview PLAN_ID [--repository OWNER/REPO]` |
| Plans view | "GitHub preview" card on an approved plan, writes grouped by repository |
| Skill | Flow step 6 names `plans_project_preview` |

Result: `{planId, planHash, writes, conflicts, notes, previewOnly, project}`.
Each write is `{kind, repository, taskId, issue, ...}`; `issue` is null for
an issue the run would create. Kinds: `issue.create`, `issue.update`,
`label.add`, `label.remove`, `assignee.add`, `sub-issue.add`, `blocker.add`,
`blocker.remove`, `comment.create`, `comment.update`, `project.add`,
`project.fields`. Project fields read back as names (Release, Wave,
Iteration). Status never appears, because Project sync never writes it.

## Tests

| Test | Shows |
|---|---|
| "the preview lists exactly the writes the projection then makes, and makes none" | epic plus three leaves (requires, sequence), Epic type, Release, Wave, Iteration. The preview leaves fake GitHub and SQLite (data, issues, receipts, events) byte-equal. The real run's write log equals the preview's list, in order. A preview after projection lists nothing, and a second run writes nothing. |
| "the preview of a changed plan names existing issues and still matches" | a rename and a dropped edge preview as `issue.update` with an issue number and `blocker.remove`, and match the real run |
| "a repository another machine writes is preview-only" | `previewOnly: ["example/code"]`, writes listed, real run refused, nothing written |
| "plans_project_preview is a read-only MCP tool" | `readOnlyHint: true` |

## Not done here

- The CLI command is not covered by its own test; it maps to the same
  operation as the MCP tool.
- The Plans view card has no Apply button. Apply stays with projection
  (`github.project`, planning merge).
- The preview reads GitHub in full each time, the same reads as a run.
