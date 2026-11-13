# Phase 2 planner: task 2.3

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 2,
task 2.3 (design §4.1, §4.2, §5 steps 1 to 4).

- Implementation commit: `85f5ea3` ("Ship the planner agent and goal-planning skill")
- Base: `kirocrew-native` at `445a519`, fast-forwarded to `85f5ea3`
- Recorded: 2026-11-11, Node v26.13.0, macOS, Kiro Crew app bundle installed at `/Applications`

## What landed

| File | Change |
|---|---|
| `kirocrew-app/agents/avoozl-planner.json` | Draft or critique mode, chosen by the brief. Tools: `fs_read`, `grep`, `glob`, `fs_write`, `thinking`, and seven read-only Avoozl tools named one by one (`plans_workspace`, `plans_query`, `plans_get_task`, `plans_duplicates`, `plans_documents`, `plans_get_document`, `plans_get_plan`). No shell, no write or approve tool, `allowedTools: []`, `includeMcpJson: false`. Already listed in `app.json`. |
| `kirocrew-app/skills/avoozl/SKILL.md` | New "Plan a goal" section for the chat (capture, draft session, isolated critique session, validate) and a "Planner" section for planner sessions (plan file format and critique file format). |
| `src/app/test/kirocrew-planner.test.mjs` | New package test; no other `src/` file changed. |

Flow, as the skill gives it:

1. Capture: `plans_workspace`, `plans_query`, `plans_duplicates`; choose a plan ID; the file is `plans/<plan-id>.md` in the planning repository.
2. Draft: a new `avoozl/avoozl-planner` session (`spawn_run`, `include_memory: false`) writes the plan file with fenced `task` blocks.
3. Critique: another new planner session gets only the goal, the plan path and its git blob hash. It never gets the draft session, its result or its transcript. It writes `plans/<plan-id>.critique.md`: a `Reviewed:` line, then fenced `finding` blocks (`missing-acceptance`, `unbounded-leaf`, `wrong-edge`, `missing-edge`, `uncovered-goal`, `open-decision`). At most two rounds.
4. Validate: the chat, not the planner, stores the revision with `plans_create_plan` or `plans_save_plan`, then runs `plans_lint_plan`. It stops after two failures. It never calls `plans_approve_plan`; the user approves the exact revision.

Goal, issue and user text goes in briefs only inside a fenced `data` block, with
a fence longer than any backtick run in that text. The instructions are restated
outside the block.

Plan blocks use today's `extractPlan` fields plus the §4.3 fields `kind`,
`repository`, `checks` and `completion`. A parent `requires` its children. A
plain ID in `requires` works with today's parser. Plans never set `authority`.

## Checks

| Check | Result |
|---|---|
| `npm test` at `85f5ea3` (typecheck, build including `build:kirocrew-app`, all tests) | exit 0; 596 tests, 596 pass, 0 fail |
| `src/app/test/kirocrew-planner.test.mjs` | 3 of 3 pass: the agent is in the manifest and parses; its built-in tools are exactly the five above; every MCP ref is `@avoozl:avoozl/<tool>`, is served by the packaged `bin/avoozl_mcp.py` `tools/list`, and has `readOnlyHint: true`; the skill's frontmatter parses, its example task blocks pass `extractPlan` (epic plus two leaves with `repository`, `checks`, `completion`), and its `finding` blocks are JSON |
| Example blocks against the in-progress work model (`task/phase2-model-validation` worktree's `extractPlan`) | parse; kinds `epic`, `leaf`, `leaf` |
| Kiro Crew's own parser: `AppManifest.from_json_file(...).validate(app_root)` | no errors |
| Kiro Crew's `_unresolvable_tool_refs` with the app server registered as `avoozl:avoozl` | planner: none |
| `kiro-cli agent validate --path kirocrew-app/agents/avoozl-planner.json` | exit 0 |
| `git diff --check` | clean |

Two earlier full runs under host memory pressure each had one timing failure:
`serve --ahp brings up the site...` (a 100 s start timeout), then
`concurrent clients see the same actions in the same order`. Both test files
pass on their own (1 of 1, and 18 of 18 three times). Neither touches the
changed files. The third full run was clean. `npm test` also rebuilds
`canvas-app/extension.js` with different output; that file was restored and is
not part of the change.

## Limits and open items

- Isolation of the critique session is by brief and prompt only. The planner's
  `fs_read` could still read Kiro Crew session files on disk. A Kiro Crew app
  cannot scope file reads to named roots; the skill marks this as a shortcut.
- `fs_write` is not path-scoped. kiro-cli's `toolsSettings` paths only skip
  prompts; they do not block writes. With `allowedTools: []`, every write goes
  through Kiro Crew's approval gate.
- Kiro Crew registers the app's server as `avoozl:avoozl`. The verifier's
  `@avoozl` and the responder's `@avoozl/plans_post_reply` refs do not resolve
  (`_unresolvable_tool_refs` reports both), so those tools would never mount.
  This was left for tasks 2.8 and the responder task.
- The skill opens planner sessions with `spawn_run`. This needs no new Avoozl
  operation. It was not run in a live Kiro Crew chat; proof P4 checks it.
