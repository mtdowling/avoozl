# Proof P21: Kiro spec folder validation

Recorded 2026-11-12 on branch `kirocrew-native`. Requirement 30, design §6.8.

## Result

**Pass on retry.** The first run found one gap: a bugfix spec's unchanged
behavior clauses never reached task acceptance. Repair commit `fa7e3c7`
("Carry bugfix unchanged behavior into fix leaf acceptance") fixed it. The
retry passed 24 of 24 checks, live.

## Setup

- Isolated workspace and code repository under `$TMPDIR/kc-p21/live`
  (script `$TMPDIR/kc-p21/run-proof.mjs`, results in `results.json`).
- `.avoozl.json`: `github.mode: single-repo`, repository
  `mtdowling/avoozl-e2e-combined-20261111` (private, user account),
  allowed actor `mtdowling`. No Project, no `epicIssueType`.
- Specs in the code repository, Kiro's layout (`requirements.md` or
  `bugfix.md`, `design.md`, `tasks.md`, `avoozl/manifest.json`):
  - `p21-config-loader`: feature spec. Epic `1`, leaves `1.1`, `1.2`, `2`.
    Kiro's order and nesting put `1.1` before `1.2`; the manifest says
    `1.1` requires `1.2`, and `2` depends on nothing.
  - `p21-empty-config-crash`: bugfix spec in Kiro's Current / Expected /
    Unchanged Behavior format, with clauses 3.1 and 3.2. Leaves `1`, `2`;
    `2` requires `1`. The manifest acceptance does not repeat 3.1 or 3.2.
  - Broken copies of the feature spec, listed below.

## Broken copies

Each lint is refused and `plan.approve` refuses each one.

| Copy                                                                   | Code                    | File:line                        |
| ---------------------------------------------------------------------- | ----------------------- | -------------------------------- |
| no `design.md`                                                         | `spec.missing-file`     | `design.md:1`                    |
| both `requirements.md` and `bugfix.md`                                 | `spec.kind`             | `bugfix.md:1`                    |
| item with no ID                                                        | `task.missing-id`       | `tasks.md:9`                     |
| duplicate ID `1.2`                                                     | `task.duplicate-id`     | `tasks.md:9` (first use: line 7) |
| manifest entry `9` with no item                                        | `manifest.unknown-task` | `avoozl/manifest.json:3`         |
| approved, then renumbered (new `1.1` inserted, old `1.1` became `1.2`) | `task.changed-text`     | `tasks.md:4` and `tasks.md:5`    |

The no-ID and duplicate copies also report `manifest.unknown-task` for
entry `2`, which then has no item. A second `plan.specs` read gave the same
hash and counts.

## Good specs

Both lint clean (`feature`, `bugfix`), are approved, and project.

| Task                         | Issue                                                                      | Blocked by |
| ---------------------------- | -------------------------------------------------------------------------- | ---------- |
| `p21-config-loader.1` (epic) | [#13](https://github.com/mtdowling/avoozl-e2e-combined-20261111/issues/13) | none       |
| `p21-config-loader.1.1`      | [#14](https://github.com/mtdowling/avoozl-e2e-combined-20261111/issues/14) | #15        |
| `p21-config-loader.1.2`      | [#15](https://github.com/mtdowling/avoozl-e2e-combined-20261111/issues/15) | none       |
| `p21-config-loader.2`        | [#16](https://github.com/mtdowling/avoozl-e2e-combined-20261111/issues/16) | none       |
| `p21-empty-config-crash.1`   | [#17](https://github.com/mtdowling/avoozl-e2e-combined-20261111/issues/17) | none       |
| `p21-empty-config-crash.2`   | [#18](https://github.com/mtdowling/avoozl-e2e-combined-20261111/issues/18) | #17        |

- **Kiro's waves.** Local edges are exactly
  `p21-config-loader.1.2 -> .1.1` and `p21-empty-config-crash.1 -> .2`.
  GitHub's blocked-by lists match. Kiro's order and nesting added none.
- **Bugfix acceptance.** Both fix leaves (#17, #18) list 3.1 and 3.2 as
  acceptance checkboxes, after the manifest's own line.
- **Epic type.** User accounts have no issue types, so no type was set; every
  issue's `type` read back `null`. Recorded as unavailable.
- All six issues were closed as `not planned` after the read-back.

## Repair

`src/app/spec-plans.mjs`:

- `unchangedClauses(bugfix.md)` reads the lines under an "Unchanged Behavior"
  heading, without numbering or list markers. `parseSpec` appends them,
  without duplicates, to the acceptance of every non-epic, non-package task
  of a bugfix spec. Feature specs are unchanged.
- `parseSpec` defaults `folder` from the name. Before, a stored revision's
  missing-file message read "Add undefineddesign.md."

Tests: two new cases in `src/app/test/spec-plans.test.mjs`.

## Checks

- `npm test` on the rebased fix: 762 of 762 passed.
- `git diff --check`: clean.
- Proof rerun on the rebased tree (local checks only): 20 of 20.

## Not checked

- The Plans view and CLI showing these diagnostics; only operations were run.
- Project sync: no Project was configured.
- Kiro's spec folders came from this script in Kiro's format, not from a
  live Kiro session.
