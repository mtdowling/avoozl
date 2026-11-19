# Phase 3 task 3.16: spec folder reading

Recorded 2026-11-12 on branch `kirocrew-native`, code commit `7c98d4e`.

## What changed

- `src/app/spec-plans.mjs`: `specRoots` picks where a mode keeps spec folders
  (plans-repo and no GitHub mode: the planning repository; single-repo: every
  code repository). `findSpecFolder` refuses a name found in two repositories.
  `specHash` reads every `tasks.md` checkbox as open, so Kiro's `[x]`, `[-]`,
  and `[~]` marks never change a revision. `lintSpec` reports
  `task.changed-text` for an approved ID whose item text changed.
- `src/app/operations.mjs`: `specRoots()` and `readSpec()` replace
  `specsRoot()`; `plan.specs` lists every root and each item's `root`;
  `plan.approve` accepts `retitled` (task IDs whose new text this approval
  accepts).
- `src/app/client.mjs`, `src/app/mcp.mjs`: pass and describe `retitled`.
- `src/app/test/spec-plans.test.mjs`: five new tests (marks, task order and
  nesting, changed text, single-repo roots, plans-repo root).

Kiro's task waves were already ignored: edges come only from the manifest.
The new order-and-nesting test pins that.

## Mode setting

Read through `Operations.githubMode()`, which reads the `githubMode` meta
until repository policy stores `github.mode`. Switch the helper then.

## Checks

- `npm test`: 672 of 672 passed.
- `git diff --check`: clean.
