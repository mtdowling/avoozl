# Proof P5: automatic Kiro Crew execution of ready leaves

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 2,
proof P5 [R6, R7]. This receipt replaces the earlier FAIL receipt (commit
`6613970`), which is kept in history.

- App source: `kirocrew-native` at `abdc905` ("Run verifiers on their declared
  agent and retry quiet ones"), after `6f7d996` ("Name the attempt in retry
  session titles")
- Kiro Crew: source checkout `<kiro-crew-checkout>`, branch
  `mc2-cron-session-status` at `8ea150ee9`, as in P2 and P4
- Model: real kiro-cli (`agent.acp_backend: kiro`), model `auto`
- Recorded: 2026-11-12 05:55–06:10 UTC, Node v26.13.0, macOS
- Verdict: **PASS** on the first run in the new profile. No repair or retry
  was used.

## Setup

A new profile, `$TMPDIR/kc-p5r`. `$TMPDIR/kc-p4` and
`$TMPDIR/kc-p4-snapshot` were only read.

| Step | Result |
|---|---|
| Profile | `HOME`, `KIROCREW_HOME`, `KIRO_HOME=<KIROCREW_HOME>/kiro`, `KIROCREW_WORKSPACE`, `XDG_*`, `GH_CONFIG_DIR`, `AVOOZL_WORKSPACE` all under `$TMPDIR/kc-p5r` (`env.sh`). `KIROCREW_POD=1`; `os-home` holds a copy of the P4 profile's staged kiro-cli sign-in store. `home/.gitconfig` gives the test home a git identity, as a real user's home has |
| Avoozl workspace | `cp -a` of the snapshot's `workspace` and `sample`. Dump hash `42e8db9857813f25`, the P4 post-approval hash: plan `config-loader` revision `424a5f83…d288d`, epic `config-loader.1`, leaves `.1.1`, `.1.2`, `.1.3`, edges `1.1 -> 1.2 -> 1.3` and `1.1 -> 1.3` |
| Repository | `repositories.configure` through `Operations.execute` (`setup-p5.mjs`): checkout `$TMPDIR/kc-p5r/sample`, base `main`, worktree root `$TMPDIR/kc-p5r/.avoozl-worktrees`, `checks: [["npm","test"]]` (integration reruns the repository's checks) |
| Delivery | `.avoozl.json` `delivery: {"concurrency": 2}`; defaults otherwise (`runner: tick`, agent `kirocrew-worker`, `retries: 2`, `quietMinutes: 15`, `nudges: 3`) |
| Config | `kirocrew config set`: `agent.session_control true`, `agent.sandbox_allow_unsandboxed_exec true`, `agent.acp_backend kiro`, `agent.apps_trusted ["avoozl"]`, `mcp_gateway.stub_servers ["avoozl:avoozl"]` |
| App | `npm run build:kirocrew-app` at `abdc905`, exit 0; `kirocrew app install <worktree>/kirocrew-app` -> `installed avoozl v0.1.0`; `kirocrew app enable avoozl` -> 3 agents, 1 skill, 1 cron |
| Gateway | `kirocrew gateway --test-mode --no-tunnel --approval yolo`, loopback, ephemeral ports 62944, 63105, 63271, 63471 (one per boot) |
| Default agent spec | Enabling the app before the first gateway boot left `crew/kiro/agents/kirocrew.json` with only `@avoozl:avoozl`, `@kirocrew-guide`, `@kirocrew-mate`, so `kirocrew-worker` had no file or shell tools. This is what broke P5's first attempt in the P4 profile. Before any dispatch, both specs were moved aside (`setup-agents-aside/`), the gateway restarted (`POST /api/restart`), and `POST /api/apps/avoozl/update` run; after one more restart both specs had the builtins and the resolved app server |
| Stub launch | Approved with `POST /api/mcp-gateway/servers/stub` and the `expected_launch` from `GET /api/mcp-gateway/servers/launch`, then a restart |
| Folder | The first tick created `Avoozl/sample` and opened nothing (MC-1). At 06:01:13 the owner set its project directory to the sample checkout (`PATCH /api/chat/folders/3137ed5ebb64`). Nothing after this was done by hand |

The one tick error in the log, at 05:58:46 (`MCP server 'avoozl:avoozl' not
found in agent config`), came from the narrowed default spec during setup,
before the restarts. Every tick after 06:01 was `ok`.

## Dispatch order

All times UTC on 2026-11-12, from the session bindings and delivery records.

| Time | Event |
|---|---|
| 06:01:51.730 | Worker bound for **1.1** (loader), the only ready leaf |
| 06:02:34.539 | 1.1 worker `done`, commit `83961f8` |
| 06:02:52.772 | Tick recorded 1.1 `done`; verifier bound at 06:02:52.849 |
| 06:03:08.736 | 1.1 verifier `done`, `npm test` exit 0 |
| 06:03:52.093 | Tick accepted the verdict; integrated 1.1 into `main` (06:03:54.306) |
| 06:03:54.369 | Same tick: worker bound for **1.2** (validator) |
| 06:04:28.532 | 1.2 worker `done`, commit `15a4ef5` |
| 06:04:51.866 | Tick recorded 1.2 `done`; verifier bound at 06:04:51.922 |
| 06:05:05.647 | 1.2 verifier `done`, `npm test` exit 0 |
| 06:05:52.125 | Tick accepted; integrated 1.2 (06:05:53.886) |
| 06:05:53.954 | Same tick: worker bound for **1.3** (flag) |
| 06:06:31.341 | 1.3 worker `done`, commit `c643846` |
| 06:06:52.037 | Tick recorded 1.3 `done`; verifier bound at 06:06:52.096 |
| 06:07:06.604 | 1.3 verifier `done`, `npm test` exit 0 |
| 06:07:52.157 | Tick accepted; integrated 1.3 (06:07:54.512) |

Concurrency was 2, but no two leaves were ever ready together: 1.2 waits on
1.1, and 1.3 on both. Each leaf took one worker attempt and one verifier
attempt; no nudges or retries were needed.

## Sessions per task

Each session was opened by the `avoozl/avoozl-tick` cron in folder
`Avoozl/sample`, bound before its brief.

| Task | Worker session (agent `kirocrew-worker`) | Verifier session (agent `avoozl-verifier`) |
|---|---|---|
| `config-loader.1.1` | `avoozl_config-loader.1.1_Load_a_JSON_config_file` | `avoozl_config-loader.1.1_verify_83961f8f6a5b` |
| `config-loader.1.2` | `avoozl_config-loader.1.2_Validate_a_loaded_config` | `avoozl_config-loader.1.2_verify_15a4ef5bafb1` |
| `config-loader.1.3` | `avoozl_config-loader.1.3_Add_the_--config_CLI_flag` | `avoozl_config-loader.1.3_verify_c64384606df7` |

## Verifier results

| Task | Worker commit | Verifier reported | Checks | Verdict |
|---|---|---|---|---|
| 1.1 | `83961f8f6a5b21ce8b1ba2deaadd9c8259e3a9ff` | same SHA | `npm test` exit 0 | accepted |
| 1.2 | `15a4ef5bafb1633c1b45879702881e65f631f109` | same SHA | `npm test` exit 0 | accepted |
| 1.3 | `c64384606df7ca462416f8c4db9222c5f2ffa332` | same SHA | `npm test` exit 0 | accepted |

Each delivery ends `integrated` into `main` with `integratedCommit` equal to
the verified commit (each was already on top of `main`, so the rebase moved
nothing). Each task records `integration: {commit, branch:
avoozl/<task-id>, into: main, at}`.

## Integration branch log

```text
$ git -C $TMPDIR/kc-p5r/sample log --format='%h %an %s' main
c643846 P5 Test Add the --config CLI flag
15a4ef5 P5 Test Add validateConfig and loadAndValidate
83961f8 P5 Test Add loadConfig JSON config loader
5124a0e P4 Start sample CLI
$ (cd $TMPDIR/kc-p5r/sample && npm test)
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

The checkout holds untracked `.kiro/` (written by Kiro Crew for the folder's
project directory). Since `abdc905` that no longer holds integration;
`git status --porcelain` lists nothing tracked.

## Quiet ticks

After the last integration, ticks kept running `ok`. `snap.sh` before
(06:09:33) and after (06:10:39) the 06:09:52 tick gave the same database dump
(`cd3b13823312027f`) and file hash (`d33cbbd46f4c2a9e`).

## Expected results

| Expected | Observed | Result |
|---|---|---|
| Only the loader dispatches first | 06:01:51 tick bound one worker, for 1.1 | pass |
| After its verifier passes and it integrates, the validator dispatches, then the flag | 1.2 bound in the tick that integrated 1.1 (06:03:52); 1.3 in the tick that integrated 1.2 (06:05:52) | pass |
| Every task links to its worker and verifier sessions | Each leaf has a worker binding and a verifier binding, attempt 1, named above | pass |
| The integration branch has three verified commits | `main`: `83961f8`, `15a4ef5`, `c643846`, each accepted by its verifier and rechecked by integration | pass |

## Checks on the source

`npm test` at `abdc905`: 667 of 667 pass; `git diff --check` clean.

## Notes

- Not covered by P5: the epic `config-loader.1` is not marked complete.
  Plan approval does not set `parent` on the leaves yet (noted in
  `phase2-verify-integrate.md`), so `completeParents` has nothing to roll up.
- The default-spec problem above is a Kiro Crew behavior: enabling an app
  before the first gateway boot creates a default spec with only MCP refs,
  and later boots keep it. Kiro Crew's own `build_agent_config()` returns the
  builtins. It needs a Kiro Crew fix or a documented install order.
- `workspaces.add` through `/apps/avoozl/api/command` answered `This caller
  may not run that operation.`; it was not needed, because the cron's MCP
  server uses the launch workspace from `AVOOZL_WORKSPACE`.
- `kirocrew-worker` starts by calling `work_brief`, which answers `not_bound`
  for a tick-opened session; each worker went on to the Avoozl brief.
- The gateway in `$TMPDIR/kc-p5r` is still running.
