# Proof P4: one local parent decomposes into dependent leaves

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 2,
proof P4 [R4].

- App source: `kirocrew-native` at `315d8b8` (the repair below, on `7ace224`)
- Kiro Crew: source checkout `<kiro-crew-checkout>`, branch
  `mc2-cron-session-status` at `8ea150ee9` (v0.12.1 plus MC-2), as in P2
- Model: real kiro-cli (`agent.acp_backend: kiro`), signed in, model `auto`
- Recorded: 2026-11-12 04:47–05:15 UTC, Node v26.13.0, macOS
- Verdict: **PASS** on the retry, after one repair

## Setup

Kept in place for P5:

| Path | What |
|---|---|
| `$TMPDIR/kc-p4/env.sh` | Source it to reach the profile |
| `$TMPDIR/kc-p4/crew` | `KIROCREW_HOME`; `KIRO_HOME` is `crew/kiro` |
| `$TMPDIR/kc-p4/home`, `os-home`, `kc-workspace`, `xdg-*`, `gh` | Temporary `HOME`, kiro-cli child home, Kiro Crew workspace, XDG and gh homes |
| `$TMPDIR/kc-p4/workspace` | Avoozl workspace `p4` (catalog default), planning root |
| `$TMPDIR/kc-p4/sample` | Sample repository `sample`, branch `main` at `5124a0e`, `npm test` (2 tests pass) |
| `$TMPDIR/kc-p4/attempt1/workspace` | Copy of the first attempt's workspace |
| `$TMPDIR/kc-p4/api.sh`, `watch.sh`, `snap.sh`, `ticks.sh`, `snaps.log` | Owner API calls, chat transcript reader, workspace fingerprint, tick watcher, all fingerprints |

| Step | Result |
|---|---|
| Profile | `HOME`, `KIROCREW_HOME`, `KIRO_HOME`, `KIROCREW_WORKSPACE`, `XDG_*`, `GH_CONFIG_DIR`, `AVOOZL_WORKSPACE` all under `$TMPDIR/kc-p4`. `KIRO_HOME=<KIROCREW_HOME>/kiro` is the directory Kiro Crew lets an isolated instance own, so this time the app's agents registered (P1–P3 had "agent source missing or unreadable") |
| Sign-in | `KIROCREW_POD=1` and `KIROCREW_OS_HOME=$TMPDIR/kc-p4/os-home`. The kiro-cli sign-in store was staged there with Kiro Crew's own pod routine (`kiro_crew.pod.runtime_home._seed_pod_os_home`, files `0600`). kiro-cli children run with that `HOME` |
| Avoozl workspace | `initializeWorkspace`, `.avoozl.json` `{"version": 1, "name": "P4", "workspaceId": "p4"}` with no `delivery` section, repository `sample` registered with its checkout. 0 tasks, 0 plans |
| App | `npm run build:kirocrew-app` exit 0; `kirocrew app install <worktree>/kirocrew-app`, `agent.apps_trusted = ["avoozl"]`, `kirocrew app enable avoozl` -> 3 agents, 1 skill, cron `avoozl/avoozl-tick` (`c223a286`, every 60 s). The repaired app was applied with the owner route `POST /api/apps/avoozl/update` |
| Config | `agent.session_control: true`, `agent.sandbox_allow_unsandboxed_exec: true`, `agent.acp_backend: kiro`, `mcp_gateway.stub_servers: ["avoozl:avoozl"]`. The stub's launch was approved with `POST /api/mcp-gateway/servers/stub` and the `expected_launch` from `GET /api/mcp-gateway/servers/launch` |
| Gateway | `kirocrew gateway --test-mode --no-tunnel --approval yolo` on loopback. Restarts went through the owner route `POST /api/restart` |
| Workspace in the app | `workspaces.add {id: "p4", root}` through `/apps/avoozl/api/command` |

## Action

1. A new chat (`<chat-2>`, agent `kirocrew`, project
   `$TMPDIR/kc-p4/workspace`) got this message:

   > Use the avoozl skill to plan this goal in the Avoozl workspace p4, for the
   > registered repository sample (checkout $TMPDIR/kc-p4/sample): add a
   > config file loader, a validator that uses it, and a CLI flag that uses
   > both. Follow the skill's Plan a goal section: draft in one
   > avoozl/avoozl-planner session, critique in a second, separate planner
   > session, store the revision, and run validation. Do not approve the plan;
   > I will approve it in the Plans view. When you are done, show me the graph,
   > the critique findings and the revision hash.

2. The chat ran the skill on its own: `plans_workspace`, `plans_specs`,
   `plans_query`, `plans_duplicates`, then four `spawn_run` planner sessions,
   `plans_create_plan`, `plans_save_plan`, and `plans_lint_plan` after each
   revision. It did not approve.
3. Approval, as the owner, with the requests the Plans view's Approve button
   sends: `plan.preview` (database revision 1), then `plan.approve {id:
   "config-loader", expectedHash: "424a5f83…d288d", expectedRevision: 1}`.
4. Three cron ticks after approval, at 05:12:21, 05:13:21 and 05:14:21 UTC.

## Planner sessions

All are separate `avoozl-planner` sessions with parent
`dashboard:<chat-2>`; records in `$TMPDIR/kc-p4/crew/subagents/<id>/`.

| Session | Mode | kiro-cli session | Revision read | Result |
|---|---|---|---|---|
| `<session-1>` | draft | `00000000-0000-0000-0000-000000000001` | — | Revision 1 `0054a0938c29`; lint 0 errors |
| `<session-2>` | critique | `00000000-0000-0000-0000-000000000002` | `0054a0938c29` | 1 finding (`open-decision`, 1.3) |
| `<session-3>` | draft | `00000000-0000-0000-0000-000000000003` | — | Revision 2 `424a5f83462e`; lint 0 errors |
| `<session-4>` | critique | `00000000-0000-0000-0000-000000000004` | `424a5f83462e` | 2 findings (`unbounded-leaf` 1.3, `open-decision` 1.2), left open after the skill's two rounds |

Each critique brief is the skill's template and nothing else: mode, folder and
hash, the one file to write, read roots, and the goal in a `data` block. The
draft session, its result and its transcript are not in it. `critique.md`
starts `Reviewed: .kiro/specs/config-loader/ 424a5f83…d288d`, and `plan.get`
reports it `current: true` for the approved revision.

## Spec folder

`$TMPDIR/kc-p4/workspace/.kiro/specs/config-loader/`, revision
`424a5f83462edd54ef17e609b40fd12314848dbae3e2ac990260f6d2e67d288d`:

| File | SHA-256 |
|---|---|
| `requirements.md` | `41d29606e124009a2aa87571a7760a9f3431416d1d37d978d03d86ba52cec21d` |
| `design.md` | `dad3164c555fd7cd8b27066604c7297509c84d13c04220757fc0fa24049a1933` |
| `tasks.md` | `77c37f31a5521279bd6ecf61e77df82aa0bd102474bde10df50fe180ab6ccd4d` |
| `avoozl/manifest.json` | `994d8dbb355bd0cc893a3d350f041a519c26a5aac77f02fdce7aa36218ab6986` |
| `avoozl/critique.md` | `52ec0958cf7113f7076294707bdfe09af21eb98378905c5abe93c2d9a27bc6cd` |

`plan.lint`: `canApprove: true`, 0 errors, 0 warnings, 0 info, type `feature`,
4 tasks. The planner wrote nothing outside the folder. The sample repository is
unchanged (`git status` clean, one commit). Kiro Crew itself wrote
`workspace/.kiro/settings/cli.json` when the folder became a chat project.

## Graph

| ID | Kind | Repository | Checks | Completion | Requires |
|---|---|---|---|---|---|
| `config-loader.1` | epic | — | — | — | 1.1, 1.2, 1.3 |
| `config-loader.1.1` | leaf: loader `src/config.mjs` | `sample` | `npm test` | `integrated` | — |
| `config-loader.1.2` | leaf: validator `src/validate.mjs` | `sample` | `npm test` | `integrated` | 1.1 |
| `config-loader.1.3` | leaf: `--config` flag | `sample` | `npm test` | `integrated` | 1.1, 1.2 |

The IDs are the `tasks.md` IDs (`1`, `1.1`, `1.2`, `1.3`) under the spec name.
Approval `approval-00000000-0000-0000-0000-000000000005` maps each ID to
itself. Edges after approval (prerequisite -> dependent), all `requires`:
`1.1 -> 1.2`, `1.2 -> 1.3`, `1.1 -> 1.3`, and `1.1`, `1.2`, `1.3 -> 1`.

## Ticks

`snap.sh` hashes a read-only `sqlite3 .dump`, counts every table's rows, and
hashes every workspace file except the database and `tick-health.json`.

| Point | Database dump | Files | Writes |
|---|---|---|---|
| Before approval | `5001cdc52d14f585` | `2adf74873a00e650` | — |
| After approval | `42e8db9857813f25` | `2adf74873a00e650` | 1 approval, 11 entities, 1 event |
| After tick 1 (05:12:21, `ok`) | `42e8db9857813f25` | `2adf74873a00e650` | 0 |
| After tick 2 (05:13:21, `ok`) | `42e8db9857813f25` | `2adf74873a00e650` | 0 |
| After tick 3 (05:14:21, `ok`) | `42e8db9857813f25` | `2adf74873a00e650` | 0 |

Each tick's receipt, `tick-health.json` beside the database, reads `outcome:
ok, policy: loaded`; it is outside SQLite by design (§4.5).

## Expected results

| Expected | Observed | Result |
|---|---|---|
| One Kiro spec folder that passes validation | `.kiro/specs/config-loader/` with the four required files; lint 0 diagnostics | pass |
| One epic and at least three leaves with stable IDs | `config-loader.1` epic; leaves `.1.1`, `.1.2`, `.1.3`; IDs kept from revision 1 to 2 and mapped to themselves on approval | pass |
| `requires` edges loader -> validator -> flag | `1.1 -> 1.2 -> 1.3` (plus `1.1 -> 1.3`) | pass |
| A critique record from a separate session | `avoozl/critique.md` from session `<session-4>`, reviewing the approved hash; round 1 from `<session-2>` | pass |
| Ticks 2 and 3 write nothing | Ticks 1, 2 and 3 all leave the database and files unchanged | pass |

## First attempt and repair

The first attempt (chat `<chat-1>`, copy in
`$TMPDIR/kc-p4/attempt1/workspace`) did not meet the bar as shipped:

- The planner prompt and both briefs said "Follow the avoozl skill's Planner
  section". A planner session has no skill tool, so the first draft guessed
  the manifest (top-level `version`, `spec`, a `tasks` list). Lint refused it
  with `manifest.schema`.
- The chat recovered only by pasting the Planner rules into later briefs. That
  is not the skill's flow, and it reached a valid revision only on round 3.

Repair `315d8b8` ("Put the planner's spec rules in its own prompt"): the draft
and critique rules, the manifest fields and the examples moved from the
skill's Planner section into the `avoozl-planner` prompt. The skill's briefs
now say "Follow your prompt's draft rules" and "... critique rules". The test
parses the prompt's example folder with the spec reader and fails if the
prompt or a brief sends a planner to the skill. `npm test` 665 of 665 pass,
`git diff --check` clean, `kiro-cli agent validate` exit 0. On the retry the
first draft passed lint.

## Notes

- `.avoozl.json` has no `delivery` section, so the ticks plan no dispatch. P5
  turns delivery on (`concurrency: 2`); the approved graph is waiting with
  loader 1.1 the only leaf without prerequisites.
- `--approval yolo` was used in this throwaway profile, so planner writes did
  not stop for tool approval. The planner has no shell, but its `fs_write` is
  not path-scoped; the prompt is the only limit. Kiro Crew reported no OS
  sandbox backend for agent processes on this host.
- The responder agent still warns that `@avoozl/plans_post_reply` does not
  resolve. P4 does not use it.
- Approval went through the owner API with the Plans view's own requests,
  not a click in the page.
- spawn_run records `memory_mode: persistent` with an empty `memory_store` for
  every planner session.
