# Proof P2b: Crew Mode conductor runs the local graph through Avoozl

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 2,
proof P2b [R6, R8] (design §5.1).

- App source: `kirocrew-native` at `9829739` (task 2.14 shipped in
  `819db47`; verifier fixes in `abdc905`)
- Kiro Crew: source checkout `<kiro-crew-checkout>`, branch
  `mc2-cron-session-status` at `8ea150ee9`, as in P2, P4 and P5
- Model: real kiro-cli (`agent.acp_backend: kiro`), model `auto`
- Recorded: 2026-11-12 06:14–06:45 UTC, Node v26.13.0, macOS
- Verdict: **PASS** on the first run. No repair or retry was used.

## Setup

A new profile, `$TMPDIR/kc-p2b`. `$TMPDIR/kc-p4-snapshot` and the
P5 and P6 profiles were only read.

| Step | Result |
|---|---|
| Profile | Same layout as P5 (`env.sh`): `HOME`, `KIROCREW_HOME`, `KIRO_HOME=<KIROCREW_HOME>/kiro`, `KIROCREW_WORKSPACE`, `XDG_*`, `GH_CONFIG_DIR`, `AVOOZL_WORKSPACE` under `$TMPDIR/kc-p2b`; `KIROCREW_POD=1` with a copy of the staged kiro-cli sign-in store in `os-home` |
| Approved graph | `cp -a` of the snapshot's `workspace` and `sample`. Dump hash `42e8db9857813f25`, the P4 post-approval hash: plan `config-loader` revision `424a5f83…d288d`, leaves `.1.1 -> .1.2 -> .1.3` (plus `1.1 -> 1.3`) |
| Repository | `repositories.configure` through `Operations.execute`: checkout `$TMPDIR/kc-p2b/sample`, base `main`, worktree root `$TMPDIR/kc-p2b/.avoozl-worktrees`, `checks: [["npm","test"]]` |
| Delivery | `.avoozl.json` `delivery: {"concurrency": 2, "runner": "crew-mode"}`: the tick opens no worker sessions; it still verifies and integrates |
| Config | `agent.session_control true`, `agent.sandbox_allow_unsandboxed_exec true`, `agent.acp_backend kiro`, `dashboard.feature_previews.crew_mode true`, `mcp_gateway.stub_servers ["avoozl:avoozl"]`, `agent.apps_trusted ["avoozl"]` |
| App | `npm run build:kirocrew-app` at `9829739`, exit 0; `kirocrew app install` and `kirocrew app enable avoozl` -> 3 agents, 1 skill, 1 cron |
| Default agent spec (P5's fix) | `app enable` before the first boot had written `crew/kiro/agents/kirocrew.json` with no builtins. It was moved aside (`setup-agents-aside/`) before the first boot; after `POST /api/apps/avoozl/update` and a restart, `kirocrew` and `kirocrew-worker` had `execute_bash`/`fs_write` and the resolved app server |
| Stub launch | Approved with `POST /api/mcp-gateway/servers/stub` and the displayed `expected_launch`, then a restart |
| Hook | `avoozl-runner.json` copied into `crew/kiro/hooks/`, as the skill's "Deliver with Crew Mode" section describes. Run by hand with `{"cwd": ".../sample"}` it prints the runner steering |
| Folders | Owner-created before the run, so nothing waited on MC-1: `Avoozl/sample` (project directory the sample checkout, used by the tick's verifier sessions) and `P2b` (the same project directory, for the conductor) |
| Gateway | `kirocrew gateway --test-mode --no-tunnel --approval yolo`, loopback, ephemeral ports 50486, 51016, 51151 (one per boot) |

## Action

At 06:22:25 a Crew Mode chat, `P2b_deliver` (agent `kirocrew-conductor`,
`agent_kind: template`, folder `P2b`, project `$TMPDIR/kc-p2b/sample`),
got one message and nothing else for the rest of the run:

> Deliver the Avoozl workspace for this project with Crew Mode, until every
> leaf is done.
>
> For this test, fail config-loader.1.2 once on purpose: tell the worker of
> its first attempt to make no commit and to report blocked with the text
> "Deliberate P2b failure". Its later attempt does the task normally. Let
> Avoozl decide the retry; do not retry it by hand.

The conductor found the runner steering
(`crew/apps/avoozl/bin/lib/src/app/runner/avoozl-runner.md`) by searching the
profile for Avoozl files, not through the hook's output (see Notes). It then
ran only the steering's commands with `execute_bash`: `avoozl.mjs next`,
`claim`, and once `report`. It opened workers with `work_dispatch` on
`kirocrew-worker` and closed each finished worker with `session_close`.

## Rounds

Times UTC. "next" is the conductor's `avoozl.mjs next`; bindings and
deliveries are from the workspace database.

| Time | Event |
|---|---|
| 06:23:04 | next: ready `[1.1]`; 1.2 and 1.3 waiting with `blockedBy` |
| 06:23:32 | Worker `<chat-1>` dispatched |
| 06:23:38 | `claim config-loader.1.1 --slot <chat-1>` -> binding attempt 1, `source: conductor`, worktree prepared |
| 06:24:14 | Worker `plans_report` done, commit `2ea90c7` |
| 06:24:19 | Tick recorded the attempt; verifier `avoozl_config-loader.1.1_verify_2ea90c7fa972` bound |
| 06:24:37, 06:24:46 | next: ready `[]`, running `[1.1 verifying]` |
| 06:25:18 | Tick accepted the verdict (`npm test` 0) and integrated 1.1 into `main` |
| 06:25:57 | next: ready `[1.2 attempt 1]`, done `[1.1]` |
| 06:27:39 | Worker `<chat-2>` dispatched with the deliberate-failure instruction |
| 06:27:43 | `claim config-loader.1.2 --slot <chat-2>` -> attempt 1 |
| 06:27:59 | Worker `plans_report` blocked, "Deliberate P2b failure"; no commit |
| 06:28:19 | Tick recorded attempt 1 `failed` (`blocked: Deliberate P2b failure`); delivery `failed`, retryable |
| 06:36:23 | next: ready `[1.2 attempt 2]` (the conductor's patrol woke it; see Notes) |
| 06:36:37 | Worker `<chat-3>` dispatched with the plain brief |
| 06:36:41 | `claim config-loader.1.2 --slot <chat-3>` -> attempt 2 |
| 06:37:27 | Worker `plans_report` done, commit `e9275c6` |
| 06:37:56 | next: ready `[]`, running `[1.2 verifying]` |
| 06:38:24 | Verifier `avoozl_config-loader.1.2_verify_e9275c6051b2` bound |
| 06:39:28 | Tick accepted and integrated 1.2 |
| 06:39:30 | next: ready `[1.3 attempt 1]`, done `[1.1, 1.2]` |
| 06:40:34 | Worker `<chat-4>` dispatched |
| 06:40:39 | `claim config-loader.1.3 --slot <chat-4>` -> attempt 1 |
| 06:41:26 | Worker `plans_report` done, commit `94d3edd` |
| 06:42:03 | Conductor relayed the same result: `report config-loader.1.3 --slot <chat-4> --kind done --commit 94d3edd…` (identical to the worker's report, so no change) |
| 06:42:08 | next: ready `[]`, running `[]`, done `[1.1, 1.2, 1.3]`, `finished: true` |
| 06:42:20 | Verifier `avoozl_config-loader.1.3_verify_94d3edddfcaf` bound |
| 06:43:19 | Tick accepted and integrated 1.3 |
| 06:43:47 | Conductor closed the last worker and stopped |

## Session bindings

Every worker binding is a structured row in `session_bindings`, written by
`runner.claim`: `role: worker`, `attempt`, `source: conductor`, `conductor:
cli`, `boundAt`, and its `report`. Verifier rows are written by the tick
(`source: tick`).

| Task | Attempt | Worker session | Report | Verifier session | Verdict |
|---|---|---|---|---|---|
| 1.1 | 1 | `<chat-1>` | done `2ea90c7fa972cce3ecc02fe9c2fac1a5506dc19a` | `avoozl_config-loader.1.1_verify_2ea90c7fa972` | accepted, `npm test` 0 |
| 1.2 | 1 | `<chat-2>` | blocked "Deliberate P2b failure" | — | — |
| 1.2 | 2 | `<chat-3>` | done `e9275c6051b279cbe2e3d6f79fb25e00cb60cc55` | `avoozl_config-loader.1.2_verify_e9275c6051b2` | accepted, `npm test` 0 |
| 1.3 | 1 | `<chat-4>` | done `94d3edddfcaff8e848385057097df687a06bfac1` | `avoozl_config-loader.1.3_verify_94d3edddfcaf` | accepted, `npm test` 0 |

## Integration branch log

```text
$ git -C $TMPDIR/kc-p2b/sample log --format='%h %an %s' main
94d3edd P4 Add the --config CLI flag
e9275c6 P4 Add validateConfig and loadAndValidate
2ea90c7 P4 Add loadConfig to read and parse a JSON config file
5124a0e P4 Start sample CLI
$ (cd $TMPDIR/kc-p2b/sample && npm test)
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

## Writes

- The conductor never touched the database: its only Avoozl calls were the
  CLI commands above, and the one `sqlite` string in its transcript is an
  `ls` line naming Kiro Crew's own skill index.
- Every Avoozl write in the run went through `Operations.execute`: the
  conductor's `claim` and `report` (CLI, `{local: true}`), the workers'
  `plans_report` (app MCP server, gateway-attested caller), and the tick's
  `workspace.tick` (cron's MCP server). These are three processes on one
  code path; SQLite transactions serialize them, and claims check readiness
  inside `BEGIN IMMEDIATE`. No second write path exists.
- The events table holds only operation events: `plan.*` from P4, two
  `workspace.repository.configured` (P4 and this setup), and three each of
  `validation.started`, `validation.result`, `integration.ready`,
  `integration.started`, `integration.completed`, `project.base.moved`.
- The tick log has no failed run.

## Expected results

| Expected | Observed | Result |
|---|---|---|
| Rounds match readiness | {1.1}, then {1.2 attempt 1}, then {1.2 attempt 2}, then {1.3}. Each round started only after `next` listed it ready, and only after its blockers were integrated | pass |
| A claimed task never appears ready twice | After each claim, every `next` showed that task under `running` (`recording`, `verifying`) or `done`, never `ready`. 1.2 came back as ready only as attempt 2, after attempt 1 was recorded failed. No claim was refused or repeated | pass |
| Every task carries a structured session binding | Four worker rows with `source: conductor`, `attempt`, `conductor`; three verifier rows with `source: tick` (table above) | pass |
| The failed leaf retries and passes | 1.2 attempt 1 blocked on purpose; Avoozl listed attempt 2 ready on its own; attempt 2 committed, was verified and integrated. The conductor never ran `retry` | pass |
| All writes go through one writer | Every write is an `Operations.execute` operation; the conductor wrote nothing outside the CLI | pass |

## Notes

- **Steering reached the conductor by search, not by the hook.** The
  conductor's first turn grepped the profile for Avoozl files and read
  `avoozl-runner.md` itself. Nothing shows that kiro-cli ran
  `crew/kiro/hooks/avoozl-runner.json` on `AgentSpawn`. Kiro Crew only folds
  `~/.kiro/hooks/*.json` into turns on the KAS backend
  (`agent_sdk/spec_hooks.py` `user_hook_files`). On the `kiro` backend it is
  up to kiro-cli, and it was not checked which directory it reads; under the
  pod remap a child's `HOME` is `os-home`, not the test home. The app manifest has no way to ship an `AgentSpawn`
  hook. A conductor that does not search would need the steering path in its
  message. Worth fixing before relying on Crew Mode without a person.
- **Latency.** After the deliberate failure the conductor waited for its
  ledger patrol (`idle_secs: 600`; woke at 06:36) because the worker's
  `work_report` landed while the conductor's turn was still running. P2b
  makes no timing claim.
- **Authorship.** Workers committed as the sample repository's existing
  author `P4`; the test home's `.gitconfig` is not under the kiro-cli
  child's `HOME` (`os-home`).
- **Not covered:** the epic `config-loader.1` is not marked complete, because
  plan approval does not set `parent` on the leaves yet (as in P5).
- The gateway in `$TMPDIR/kc-p2b` is still running.
