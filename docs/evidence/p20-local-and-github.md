# Proof P20: local and github tasks in one workspace

Receipt for proof P20 of the Kiro Crew-native spec
(`assess-avoozls-future-as-a`, tasks.md P20; R28.2–R28.5, R31.4).

- Result: **pass on the retry**, after one repair.
- Repair commit: `99175c7` ("Show local or the issue link in every task view")
- Code under test: `kirocrew-native` at `82200b4` (run 1), then `99175c7` (run 2)
- Recorded: 2026-11-12, macOS, Node v26.13.0, `gh` as `mtdowling`
- Repository: private `mtdowling/avoozl-e2e-code-20261111`, single-repo mode.
  No other repository was read or written.

## Setup

Each run used a fresh, isolated workspace under `$TMPDIR/kc-p20/`
(`ws/` for run 1, `run2/ws/` for run 2), made with `avoozl init`, and a fresh
clone of the code repository as project `code`. The clone was never pushed.

`.avoozl.json` set `github.mode: "single-repo"` with one repository entry
(`baseBranch: main`, `allowedActors: [mtdowling]`, managed labels
`p20-managed` and `p20-ready`). No `github.project` was set: a user account
has no org Project or issue types, and P20 is about authority. Project sync
reported `{"status": "off"}` in every preview and apply.

The plan is the Kiro spec folder `code/.kiro/specs/p20-mixed/`
(`requirements.md`, `design.md`, `tasks.md`, `avoozl/manifest.json`) with
three leaves, `p20-mixed.1`, `.2` and `.3`. Only `.3` has
`"authority": "local"` in the manifest.

Steps, through `Operations` in process (`plan.create {spec}`, `plan.lint`,
`plan.approve`, `github.project.preview`, `github.project`,
`workspace.tick`, `graph.view`, `delivery.view`, `conflicts.view`,
`plan.preview`): create, lint, approve, preview, apply, bind one session to
`.3` and one to `.1` (run 2 only, so both appear in Delivery), tick five
times with views after each, preview again, delete `authority` from `.3`,
`plan.save`, approve, preview, apply, apply again, tick, views.

## Run 1: fail

| Expected | Observed |
|---|---|
| Two issues, none for the local leaf | #9 (`.1`), #10 (`.2`); none for `.3` |
| Local leaf never in a preview while local | Preview had 6 writes, all for `.1` and `.2` |
| Five ticks | No intents, no writes; database revision 4 before and after |
| After the plan change, one issue, same ID | `.3` got #11 with marker `taskId: p20-mixed.3` |
| One writable row per task | One task row and at most one `github_issues` row each |
| "local" or the issue link in every view | **Only the Graph view.** Delivery, Conflicts, and the Plans view's task list carried neither field |

R28.5 says every view. That was the failure.

## Repair

`99175c7` adds `ownership(task)` (`{authority, issue}`) in
`src/app/page-views.mjs`. It is on every Graph, Delivery and Conflicts item,
and on each `plan.preview` task. A stored row's owner wins over the
manifest's; a task with no row yet shows the authority approval would give
it. `kirocrew-app/ui/src/Authority.tsx` is the Graph view's badge, moved out
so Delivery, Conflicts and the Plans view's Manifest list draw it too:
`local`, `pending projection`, or the `#N` issue link.

| Check | Result |
|---|---|
| `npm test` | exit 0; 764 tests, 764 pass |
| `node --test kirocrew-app/ui/test/*.test.mjs` | 21 of 21 pass |
| New tests | `page-views.test.mjs` "delivery and conflicts views show local or the issue link"; `spec-plans.test.mjs` "plan preview shows each task's authority and issue link" |
| `git diff --check` | clean |

`npm test` rebuilds `canvas-app/extension.js`; that file was restored and is
not part of the change.

## Run 2: pass

Issues #12 (`.1`), #13 (`.2`) and, after the plan change, #14 (`.3`), all
with namespace `avz_csdj6gsguf5jzpgt`. Run 1's closed issues (other
namespace) were never matched.

| Check (from `$TMPDIR/kc-p20/check.mjs`) | Result |
|---|---|
| Every step returned without error | pass |
| First apply makes two issues, none for the local leaf | pass |
| Local leaf absent from the first preview and the preview after five ticks | pass |
| While local, `.3` shows `local` with no issue link in Graph and Plans, plus Delivery after its session was bound (after each of the five ticks), plus Conflicts when listed | pass |
| The github leaves show their issue link in Graph and Delivery after apply | pass |
| Five ticks ran (only `observe` intents for the two bound slots; no dispatch, no messages) | pass |
| After the plan change `.3` gets exactly one issue (#14) and keeps ID `p20-mixed.3` | pass |
| `.1` and `.2` keep #12 and #13 | pass |
| A second apply creates nothing | pass |
| After the move, `.3` shows #14 in Graph, Plans, Delivery and Conflicts | pass |
| No task ever has two task rows or two `github_issues` rows, in any view snapshot | pass |

GitHub read-back: #12–#14 each carried `p20-managed` and a marker with its
own task ID and the run's namespace.

## Seen, not part of P20

- Re-approving the plan set `needsReview` on all three tasks, including the
  unchanged `.1` and `.2`. The next apply removed their `p20-ready` labels,
  and Conflicts listed them as "Task needs review". This comes from
  `approvePlan` in `src/app/plans.mjs`, which marks every existing task of
  the plan. Fully automatic delivery would stall on a plan edit that only
  touches one task.
- The Graph view reports a github task with no issue yet as `ready: true`.
  Dispatch does not start it (`pendingProjection`).

## Issues created and closed

All were closed as `not planned` with a comment.

| Issue | Task | Run |
|---|---|---|
| [#9](https://github.com/mtdowling/avoozl-e2e-code-20261111/issues/9) | `p20-mixed.1` | 1 |
| [#10](https://github.com/mtdowling/avoozl-e2e-code-20261111/issues/10) | `p20-mixed.2` | 1 |
| [#11](https://github.com/mtdowling/avoozl-e2e-code-20261111/issues/11) | `p20-mixed.3` | 1 |
| [#12](https://github.com/mtdowling/avoozl-e2e-code-20261111/issues/12) | `p20-mixed.1` | 2 |
| [#13](https://github.com/mtdowling/avoozl-e2e-code-20261111/issues/13) | `p20-mixed.2` | 2 |
| [#14](https://github.com/mtdowling/avoozl-e2e-code-20261111/issues/14) | `p20-mixed.3` | 2 |

The labels `p20-managed` and `p20-ready` stay in the test repository.

## Next decision

The spec asks whether workspace-level `defaultAuthority: local` needs its own
proof. This run did not cover it. `newTaskAuthority` in
`src/app/github-policy.mjs` returns `local` for it, but no test covers a
GitHub mode together with `defaultAuthority: "local"`.
