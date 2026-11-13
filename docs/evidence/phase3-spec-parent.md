# Phase 3 fix: spec approval sets task parents

Recorded 2026-11-12 on branch `task/p3-parent`, fast-forwarded onto
`kirocrew-native` (code commit 627ee25). Fixes the finding in `p9-cross-repo-rebuild.md` (d85c379)
before proof P8. Requirements R13.7, R30; design §6.1–§6.3, §6.8; tasks 3.7,
3.16. Fake GitHub only.

## Finding

Approving a Kiro spec folder plan never set `task.parent`. Projection links
sub-issues only from `task.parent`, so an epic had no sub-issues, and
`completeParents` never saw an epic's children. P8 expects one Epic parent
issue with three sub-issues.

## Where the spec names a parent

The spec does not say it in one sentence, so this is the reading used:

- R13.7: epics and packages project as parent issues, their children as
  sub-issues. The manifest gives `kind` (§6.8) but has no parent field.
- R30.6 and §6.8: edges come only from the manifest; Kiro's task waves and
  checkbox marks are not Avoozl's graph. A parent link is not an edge.
- §6.7's Wave versus Epic table: an epic comes from parent and child links.
- Kiro writes sub-tasks indented under their parent item in `tasks.md`, and
  every Avoozl example (the planner prompt, the test fixture, P21's specs)
  already nests leaves under the epic.

So nesting in `tasks.md` names the parent: an item indented under another
item is its child. Edges still come only from the manifest.

## Change

- `specItems` (`src/app/spec-plans.mjs`) records each item's parent: the
  nearest item above it with less indent.
- `parseSpec` puts `parent` on each nested proposal. It refuses, at the line,
  an item nested under an item that is not an `epic` or `package`
  (`task.parent-kind`), and a manifest entry that names `parent`
  (`manifest.schema`), so there is one source for parents.
- `approvePlan` (`src/app/plans.mjs`) sets `parent` for spec plans through the
  task ID mapping, clears it when an item is moved out from under its epic on
  re-approval, and counts `parent` in the review entry, so a move needs
  review. Fenced migration plans are unchanged.
- The planner prompt (`kirocrew-app/agents/avoozl-planner.json`) now says
  nesting names parents and that leaves are never nested under a leaf.
- Projection and rebuild were already correct once `parent` is set:
  projection writes `parent` in the marker and links sub-issues; rebuild reads
  the marker and sub-issues back.

## Tests

- `an item nested under an epic is its child; flat items have no parent`
- `nesting under a leaf, or a manifest parent, is refused at its line`
- `approval sets each nested task's parent and re-approval moves it`
- `a spec epic projects as one Epic parent with three sub-issues, and rebuild
  restores the parents` (P8's shape on fake GitHub): spec `loader` with epic
  `1` nesting leaves `1.1`, `1.2` (requires `1.1`) and `1.3` (sequence `1.2`),
  single-repo mode, `epicIssueType: "Epic"`. Result: one issue typed Epic,
  exactly three sub-issue links under it, `"parent":"loader.1"` in each leaf
  marker, blocked-by links `1.2 ← 1.1` and `1.3 ← 1.2`; a second apply adds
  no issue or link; a fresh workspace's `github.rebuild` restores the same
  parent and kind on all four tasks.

All four fail on the code before the fix and pass after it.

## Checks

`npm test` passed 770 of 770 (766 before, plus 4 new). `git diff --check`
was clean.

## Not checked

Live GitHub, the UI and the CLI. A spec whose epic is a flat item with its
leaves not indented still gets no parents; that follows Kiro's layout.
