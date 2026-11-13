# Phase 2 Kiro spec plans: spec reader (2.4), planner rework (2.3), Plans view (2.5)

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 2,
after the 2026-11-11 change note (Requirement 30).

- Commits: `b79bbdd` ("Read plans from Kiro spec folders"), `068789d`
  ("Draft and critique plans as Kiro spec folders"), `9d9c7d4` ("Add the
  Plans view")
- Base: `kirocrew-native` at `0307b04`, fast-forwarded under `$TMPDIR/avoozl-kirocrew-native-land.lock`
- Recorded: 2026-11-12, Node v26.13.0, macOS

## Checks

| Check | Result |
|---|---|
| `npm test` on the same tree as `9d9c7d4` (typecheck, build, all tests; the last rebase added only `docs/evidence/phase2-dispatch-recovery.md`) | exit 0; 648 tests, 648 pass, 0 fail |
| New spec tests, `src/app/test/spec-plans.test.mjs` | 21 of 21 pass |
| Rewritten proposal tests, `src/app/test/proposals.test.mjs` | 6 of 6 pass |
| Planner tests, `src/app/test/kirocrew-planner.test.mjs` | 4 of 4 pass |
| Backend route tests, `src/app/test/kirocrew-plans-view.test.mjs` | 3 of 3 pass |
| `node --test kirocrew-app/ui/test/*.test.mjs` | 12 of 12 pass (5 new in `plans-api.test.mjs`) |
| `npm run build:kirocrew-app` (UI `tsc`, Vite, CLI bundle) | exit 0; `kirocrew-app/bin/lib/src/app/spec-plans.mjs` present |
| `git diff --check`, `prettier --check` on changed `src/app` files | clean |

`npm test` rebuilds `canvas-app/extension.js` with different output. That file
was restored and is not part of the change.

## What landed

| Part | Change |
|---|---|
| Reader | `src/app/spec-plans.mjs` reads `<root>/.kiro/specs/<name>/`. Root is the configured planning repository, else the workspace root. The revision hash covers `requirements.md`, `bugfix.md`, `design.md`, `tasks.md`, and `avoozl/manifest.json`; `avoozl/critique.md` is read beside it and never changes it |
| Task IDs | A checklist item's first token is its ID. A number path (`1`, `1.2`, `1.`) becomes `<name>.<token>`; a token with a separator (`w3.reactor-timers`) is used as is; anything else is "no ID". Items inside code fences are skipped. Edges come only from the manifest |
| Validation | Every diagnostic names `file` and `lineStart`. Refused: missing folder, missing `design.md`, `tasks.md`, or manifest, neither or both of `requirements.md` and `bugfix.md`, an item with no ID, a repeated ID, an ID owned by another plan, a manifest entry with no item, an item with no entry, bad manifest JSON, and an entry that fails the task rules. The proposals then go through `lintPlan` (boundedness, cycles, unknown references) unchanged |
| Shared rules | `extractPlan`'s field checks moved to `validateProposal` in `plans.mjs`; the manifest reader and `extractPlan` both call it. `extractPlan` is commented as the migration read path and is now called only for free-form plan text (legacy lint, preview, approval) |
| Operations | `plan.create {spec}` stores a folder as a draft plan (ID defaults to the name). `plan.save {id, expectedHash}` reloads it from disk; an unchanged folder writes nothing. `plan.lint`, `plan.get`, `plan.preview`, `plan.approve` use the spec reader for spec plans. `plan.get` adds `disk` (hash, changed, critique). `plan.approve` refuses while the folder on disk differs from the stored revision. New read-only `plan.specs` (MCP `plans_specs`) lists folders with type, hash, counts, critique, and stored plan |
| Approval | A spec plan's tasks keep their `tasks.md` IDs. The document is `spec:<name>`, virtual; no outbox entry and no Markdown file is written. Task source lines point at the `tasks.md` item |
| Propose | `plan.propose {proposal}` on a spec plan appends `- [ ] <id> <title>` to `tasks.md` and the entry to the manifest, then stores the next revision. On a free-form plan it is refused with 409: the fenced-block append path (`appendProposal`) is deleted. The cited-fact form is unchanged |
| Planner (2.3) | `avoozl-planner` prompt and the `avoozl` skill draft one spec folder and critique into `avoozl/critique.md` with `Reviewed: .kiro/specs/<name>/ <hash>`. The hash comes from `plans_create_plan`/`plans_save_plan`. Tools unchanged: file read and write, search, seven read-only Avoozl tools; no shell, approve, or dispatch |
| Plans view (2.5) | `PlansView.tsx` and `plans-api.ts`, loaded through `useAppApi()` with the workspace `WorkspaceView` selects (same pattern as Graph, Delivery, Conflicts). Lists folders; shows diagnostics with file and line, critique findings and whether they review this revision, the manifest's tasks and `requires` edges, and approvals. Buttons: Store revision, Reload from disk, Approve revision `<hash>`, Open planning draft (chat draft, not auto-sent). Approve sends the shown hash and the previewed database revision, and is off while the folder changed, the revision is approved, or an error remains. Shared files touched: `App.tsx` (two lines) |

## Nearby inputs checked

| Input | Result | Test |
|---|---|---|
| `- [ ] 1.`, `- [x] 1.2`, `- [ ]* w3.x`, an item inside a code fence, `- [ ] Write tests` | `config.1`, `config.1.2`, `w3.x`, skipped, no ID | spec-plans: stable IDs |
| Bugfix spec | type `bugfix`, no diagnostics | spec-plans: bugfix |
| Spec names `../config`, `Config`, `a/b`, empty, 81 characters, `/etc` | refused, 400 through the backend | spec-plans; plans-view |
| `design.md` symlinked out of the root; a spec folder that is a symlink out of the root | read as missing file; folder missing | spec-plans: symlink |
| Critique for another hash; a finding that is not JSON; no critique | `current: false`; `unreadable` finding; `null` | spec-plans: critique |
| Unchanged folder reloaded; folder changed then approved; approved with an error | no new revision; 409 "changed on disk"; 409 `task.missing-id` | spec-plans |
| Proposal with a plain ID, empty or two-line title, empty acceptance, bad field types, a repeated `1.2`, a non-object | refused; files and revision unchanged | proposals |
| Stale `expectedHash`; folder edited by hand before a proposal | 409; 409 "changed on disk" | proposals |
| App token and agent tool on `plan.specs`, `plan.get`, `plan.create`, `plan.approve` | 200, 200, 403, 403 | plans-view |
| Approve with a hash the preview no longer shows | refused in the client, no approve call sent | plans-api |

## Security

The backend still binds `127.0.0.1` and verifies the gateway-signed principal
on every route. `plan.specs` is classified `observe`; `plan.create`,
`plan.save`, `plan.propose`, and `plan.approve` stay owner-only through the
backend. The caller names a spec folder only by a validated name, never a
path, and reads are confined to regular files under the planning root.

## Skipped

- The §6.8 check that refuses an approved ID whose item text changed without
  a new approval: every change already yields a new hash that needs a new
  approval, so it is left for projection (Phase 3).
- `Prepare delivery`, `Preview` of a GitHub projection, and `Apply` in the
  Plans view: they belong to Phase 3.
- Exact lines for every invalid manifest JSON: the line comes from the
  runtime's error message, which this Node version omits for some errors
  (line 1 is reported then, with a `shortcut:` comment).
- A live planner session (proof P4) and a click-through of the Plans view in
  Kiro Crew were not run.
- The legacy web app skill (`src/app/skills/avoozl/SKILL.md`) and `README.md`
  still describe fenced task blocks; they cover the migration path and were
  not changed.
