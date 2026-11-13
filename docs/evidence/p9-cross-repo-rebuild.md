# Proof P9: cross-repository dependencies and fresh-workspace recovery

Recorded 2026-11-12 against live GitHub as `mtdowling`, on branch
`task/p9-fix`, fast-forwarded onto `kirocrew-native`. Requirements R13.2, R14
and R19; design §3.3. Result: **pass on the retry**, after one repair.

## Setup

- Isolated workspace `$TMPDIR/kc-p9/ws2` (namespace
  `avz_m3eg2gnqjxttaf5w`), single-repo mode, managed labels `p9-managed` and
  `p9-ready`, allowed actor `mtdowling`.
- Two repositories, each a registered project with a local clone:
  - public `mtdowling/avoozl-e2e-public-20261112` (project `public`), new,
    holding only a README and the test spec `.kiro/specs/p9-cross-repo/`;
  - private `mtdowling/avoozl-e2e-planning-20261111` (project `private`).
- Spec `p9-cross-repo`: epic `1` and leaf `1.1` in the public repository; leaf
  `1.2` in the private repository, which `requires` `1.1` (completion
  `integrated`, checks `npm test`).
- Unavailable on a user account, recorded and not used: the `Epic` issue type
  (issues get no type) and an org Project (Project sync is `off`).
- Driver and scripts: `$TMPDIR/kc-p9/run.sh` (the whole proof),
  `driver.mjs` (plan steps, the cron tick with `sessions: []`, state and
  GitHub snapshots), `cmp.mjs` (field diff). Outputs in
  `$TMPDIR/kc-p9/out/ws2/`.

## Action

`avoozl init`, policy written, `project configure` ×2, `github configure` ×2,
`plan.create`, `plan.lint`, `plan.approve`, `avoozl github preview`, `avoozl
github project` (apply), the cron tick and `avoozl tick`, snapshot. Then
delete `workspace.sqlite`, `avoozl init` the same directory, connect the two
repositories again (`project configure`, `github configure`), `avoozl
rebuild` (twice), the cron tick and `avoozl tick`, `avoozl github project`
again, snapshot.

## Results

| Check | Result |
| --- | --- |
| Preview lists every write before the first one | 3 creates, 1 cross-repo `blocker.add`, 1 `label.add`, 2 body updates |
| GitHub shows the cross-repository blocker | private #8 blocked by public #4 |
| Only the first leaf is ready | `p9-ready` only on public #4; Graph: `1.1` ready, `1.2` and `1` not |
| Tick before and after rebuild | `github: ok`, no dispatch, no notice |
| `init` on the kept configuration | `existingConfiguration: true`; `.avoozl.json` byte-identical, namespace kept |
| Rebuild | 3 tasks, 1 edge, plan row restored, no notes or conflicts |
| Second rebuild | `written: false` |
| Apply after rebuild | same issues #3, #4, #8; no conflict |
| Duplicates | none: one issue per task in the namespace |
| GitHub writes after the database was deleted | none: every issue's `updated_at` is before the re-init (08:22:00Z) |
| GitHub before vs after (titles, bodies, labels, blockers, sub-issues) | identical |

SQLite state (`state-before.json` vs `state-after.json`): plan row, every
task field, the edge, and every `github_issues` baseline (body, `bodyHash`,
managed label, managed blocker IDs, state, conflicts, resolutions) match,
except these fields:

- `dispatch.machineId`: a new database is a new machine identity. That is
  correct, and the repositories name the new machine as their writer.
- edge `reason`: `Approved plan revision ff5441edf121` becomes `Rebuilt from
  GitHub`. It is a provenance note.

Right after rebuild, before the tick and apply, two more gaps exist, and the
P9 sequence closes both. The leaves' `githubVerdict` (`open`) comes back on
the first tick. The `github_issues` `state` (`blocked`) and empty
`conflicts`/`resolutions` come back on the apply.

## First run and repair

The first run (`$TMPDIR/kc-p9/ws`, namespace `avz_rlndmnkoq4hzjk3y`)
found two failures:

1. After deleting the SQLite file, no CLI command could create the database
   again. `avoozl init` refused a configured directory, and every other
   command fell through to the server (`fetch failed`). The run continued
   with an in-process stand-in for init.
2. The rebuilt tasks lost design fields that only the spec folder and SQLite
   held: `completion`, `checks`, `source`, `approvedSource`,
   `contextDocuments`, `resources`, `statusAuthority` and `needsReview`, plus
   the `spec:<name>` document. The cross-repository blocker, readiness, issue
   reuse and GitHub state were already correct.

Repair, in two commits:

- `0dc6ae0` Recreate a missing database under the existing workspace
  configuration. `initializeWorkspace` (`src/app/workspace.mjs`) gives a
  configured directory with no database an empty one. It keeps
  `.avoozl.json`, and with it the namespace and the saved `dbPath`. A
  directory that still has its database is refused as before. Test: `init on a
  configuration with no database keeps its namespace`.
- `9ddc81c` Restore spec design fields and document on rebuild. When
  rebuild restores a plan row from a folder whose hash matches the markers,
  `specPlans` (`src/app/github-rebuild.mjs`) also parses the folder with
  `parseSpec`. It fills the approval's design fields under each rebuilt row
  (an existing row's values win) and adds the virtual `spec:<name>` document.
  The test `rebuild restores an approved spec plan row from its folder` now
  checks those fields and the document against the original. It fails on the
  code before the fix.

Checks on the rebased branch: `npm test` passed 766 of 766, and `git diff
--check` was clean. The retry ran on the same two commits before the rebase
onto `c7c2f2d`/`52e4782`.

## Finding outside P9

Spec approval never sets `task.parent`. `validateProposal` and `approvePlan`
in `src/app/plans.mjs` carry no parent, and `parseSpec` does not derive one
from `tasks.md` nesting. So the epic issue (#3) has no sub-issues, and P8's
"three sub-issues" check would fail on a Kiro spec. P9 is not affected,
because parents are absent both before and after.

## Issues made and closed

All closed as not planned:

- `mtdowling/avoozl-e2e-public-20261112#1`, `#2` and
  `mtdowling/avoozl-e2e-planning-20261111#7`: first run.
- `mtdowling/avoozl-e2e-public-20261112#3`, `#4` and
  `mtdowling/avoozl-e2e-planning-20261111#8`: retry.

Labels `p9-managed` and `p9-ready` remain in both repositories. The public
repository is left in place. To delete it:

```sh
gh repo delete mtdowling/avoozl-e2e-public-20261112 --yes
```
