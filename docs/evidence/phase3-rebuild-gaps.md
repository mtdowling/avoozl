# Phase 3: rebuild gaps after task 3.10

Recorded 2026-11-12 on branch `task/p3-gaps`, fast-forwarded onto
`kirocrew-native`. Code commits `b043d1a` (order body hash) and `6c2460d`
(plan row rebuild). Fake GitHub only.

## 1. Body hash after an order write

`src/app/github-close.mjs`: the tick's marker `order` write (and its removal
on reopen) now stores the new issue body the way the Project marker write in
`github-project.mjs` does: the `github_issues` row's `body` and `bodyHash`,
and the task's `github.bodyHash`. A trigger snapshot (`snapshotHash`) that
matched the body before the write moves with it, so intake sync does not
quarantine Avoozl's own write.

Test `the order write keeps stored body hashes, so the next tick and
projection see no edit` (`src/app/test/github-rebuild.test.mjs`): after the
order write both stored hashes equal the issue body's hash; a second tick
writes nothing to GitHub; projecting again reports no conflict. It fails on
the code before the fix. The rebuild test no longer drops `bodyHash` when it
compares the rebuilt state to the original: rebuild after an order matches,
hashes included.

## 2. Plan row

The design allows it. §3.1 makes Git the authority for the reviewed spec and
the SQLite plan row a receipt (approved commit and hash); §3.4 says the
planning workspace maps the marker's hashes back to its own file. §3.3's
rebuild test lists tasks, edges, statuses, verdicts and baselines, and does
not forbid the plan row.

`src/app/github-rebuild.mjs` (`specPlans`): for each plan ID a rebuilt issue's
managed section names, with no plan row in SQLite, rebuild reads
`.kiro/specs/<plan ID>/` through `Operations.readSpec` (3.16's `specRoots` and
`findSpecFolder`). Only when the folder's `specHash` equals the
`source.manifest` every marker pins does it write an approved plan row (title
from `specTitle`, files, hash, mapping of the rebuilt task IDs) and an
approval receipt `approval-rebuilt-<plan>-<hash12>` with the files, so 3.16's
changed-text check still has its baseline. Projection writes that hash only
for an approved revision. Otherwise it writes a note and no plan row:

- no folder (a fenced plan file is not a spec folder);
- the folder changed since projection;
- the issues pin more than one revision;
- the mode has no spec root.

An existing plan row is never changed. The result has a new `plans` list.

Tests:

- `rebuild restores an approved spec plan row from its folder`: the rebuilt
  row matches the original's spec, title, text, files, hash and state;
  projecting it again creates and updates no issue; a second rebuild writes
  nothing.
- `rebuild leaves the plan row out when its spec folder changed`: one note,
  no plan row, the three tasks still rebuilt.
- The 3.10 test now expects the note for its fenced plan `graph`.

## Checks

- `npm test`: 749 of 749 passed.
- `git diff --check`: clean.

## Limits

- A folder edited after projection is not read at `source.commit`; the note
  asks the person to reload and approve it.
- The rebuilt row has no plan document (`spec:<name>` in `documents`) and
  empty `context`; projection does not need either.
- The rebuilt approval receipt has no `approvedBy`; its `evidence` says it
  was rebuilt from GitHub.
