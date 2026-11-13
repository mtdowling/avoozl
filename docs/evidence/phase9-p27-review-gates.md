# Proof P27: review gates with fake writers and reviewers

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 9,
proof P27 (tasks.md; design §5.2; R36–R39).

- Base: `kirocrew-native` at `87bdd70` (Phase 9: `c69f0e5`, `4b82981`, `87bdd70`)
- Recorded: 2026-11-12, macOS
- Result: **pass**, first run of the proof, no code repair

## What ran

An automated test, `src/app/test/proof-p27.test.mjs`, with a test-only fake
session driver, `src/app/test/fake-crew.mjs`. No real workspace, no Kiro Crew
install, no GitHub, no network listener.

- Workspace: a temporary directory with its own SQLite store, `.avoozl.json`,
  and a sample git repository `app` (`README.md`, executable
  `scripts/validate.sh`). The repository is registered with
  `project.configure`, with `scripts/validate.sh` as its check.
- Policy: `concurrency: 1`, `retries: 2`, writer model `fake-a`, review roles
  `conventions` on `fake-b` and `correctness` on `fake-c`.
- Plan: spec folder `.kiro/specs/p27/`, created with `plan.create` and approved
  with `plan.preview` + `plan.approve`. Leaves `p27.1` (w1, `acceptFrom:
  "validation"`) -> `p27.2` (d1) and `p27.3` (w2) -> `p27.4` (d2), all in
  `app`, each declaring `scripts/validate.sh`.
- Driver: every `workspace.tick` dispatch is bound as a session (as tick.py's
  `open_session` would), with its model and commit. `play` runs each open
  session's script: a writer commits in the worktree from `worktree.prepare`
  and reports; the checks role reports check results; a reviewer reports a
  verdict. Scripts are keyed `<task>:<role>:<attempt>`; unscripted sessions
  pass or approve. w2's three role sessions are held open, so w2 stays
  undelivered until it is superseded.

## Expected items

| # | Expected | Result |
|---|---|---|
| 1 | `w2` does not start while `w1`'s writer is live; three role sessions open on C1 with three models | pass. Tick 1 dispatches only w1's writer on `fake-a`; tick 2 (writer live) dispatches nothing. After C1: `verifier` (no model, the verifier agent's own), `review:conventions` on `fake-b`, `review:correctness` on `fake-c`, all on C1; the bindings record those models. w2's writer opens in the same tick (reviews take no writer capacity). |
| 2 | `d1` waits, the attempt fails, the retry brief quotes F1 | pass. Delivery `failed`, attempt 1 cause `review correctness requested changes: F1`; attempt 2's brief quotes `1:correctness:F1 (defect, src/a.txt): a1 is wrong.` as data; d1 not ready, no integration. |
| 3 | `unchanged` approval refused in-session; not-run check fails only the checks session and is retried; no writer attempt spent | pass. Every role reviews C2. correctness's `approved` closing F1 `unchanged` is refused (`cannot be unchanged`); `fixed` + `approved` is taken. The checks role's `exitCode: null, notRun` fails that session (`checks not run: ... sh missing`); the delivery stays `done` with 2 attempts and only `verifier` attempt 3 is dispatched on C2. |
| 4 | Rebase makes C3, nothing merges, all three roles review C3 with F1 closed; after approval C3 fast-forwards and d1 dispatches | pass. A commit on `main` by hand; the next tick records `rebases: [C2 -> C3]`, `main` stays on the hand commit, and three roles open on C3; correctness's brief no longer quotes F1. After approval: `integrated`, `integratedCommit` C3, `main` = C3, and d1's writer dispatches. |
| 5 | Typed `integration` on d1 and typed evidence on w1 refused; w1 accepted only from validation at its integrated commit | pass. `task.update` with `integration` on d1: 409 (review roles). `task.accept` with `evidence` on w1: 409 (typed evidence). w1 was not yet accepted; `task.accept` with no evidence then accepts it, and its evidence reads `... passed at commit <C3>`. |
| 6 | Policy refuses `fake-a`; `auto` opens a decision instead of a review | pass under the conductor's reading (below). `deliveryPolicy` refuses `fake-a` (`must differ from the writer's model fake-a`) and `auto` (`not auto`); the tick reports each such file `invalid`, raises a decision, and dispatches nothing. A Crew Mode `runner.claim` with no model, then a done report, gives delivery `decision` (`writer's model is unknown`), no review or checks session, and a decision notice. |
| 7 | `d2` waits on `w2b`, not `w2`; `w2` stays `superseded` after re-approval; history intact | pass. `task.supersede` w2 -> `p27-w2b`, then re-approval of the unchanged plan: w2 `superseded`, `supersededBy` w2b; w2's delivery row and session bindings unchanged; d2 not ready. w2 gets no new session. w2b dispatches once d1's writer finishes, goes through its own review round, integrates, and only then does d2 dispatch. |
| — | Every earlier verdict stays on the delivery | pass. `delivery.view` for w1 has rounds C1 (3 verdicts), C2 (4: includes the not-run checks session), C3 (3, current); C1's correctness verdict keeps `changes-requested`, `fake-c`, finding `1:correctness:F1` now `fixed`. |

### Reading of Expected (6)

Conductor decision: the spec says a reviewer model of `auto` opens a decision.
The built code refuses `auto` in policy validation and opens a decision only
when the writer's binding has no model. (6) counts as passing when validation
refuses both `fake-a` and `auto`, and a writer claim with no model opens a
decision instead of a review. The test checks exactly that.

## Repairs

None in code. While writing the test, the first full run stopped at
integration with `Cannot read properties of undefined (reading 'length')`:
the test had put the project row straight into the store without `checks`.
`project.configure` always sets `checks` (default `[]`), so the test now
registers the repository through `project.configure` with
`scripts/validate.sh`. Not a defect in the Phase 9 code.

## Checks

| Check | Result |
|---|---|
| `node --test src/app/test/proof-p27.test.mjs` | 2 of 2 pass |
| `npm test` (build, all tests) | exit 0; 510 tests, 510 pass, 0 fail |
| `git diff --check` | clean |
| `prettier` on the new files | applied |

## Not covered

No live Kiro Crew: whether the installed `open_session` takes `model=` is
still from F31 only. Reviewer and verifier sessions are scripted, so the
agents' own prompts and tools are not exercised.
