# Phase 2 verify and integrate: live reports, tasks 2.8, 2.9, 2.10

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 2.

- Commits: `622bf3c` ("Make the app MCP server safe to share between sessions"), `e5e77ad` ("Verify, integrate and release delivered leaves")
- Base: `kirocrew-native` at `61f9c64`, fast-forwarded under `$TMPDIR/avoozl-kirocrew-native-land.lock` (`lockf`)
- Task worktree: `$TMPDIR/aicommander-phase2-verify-integrate`, branch `task/phase2-verify-integrate`
- Recorded: 2026-11-12, Node v26.13.0, macOS

## Checks

| Check                                                                     | Result                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `npm test` at `e5e77ad` (typecheck, build, all tests)                     | exit 0; 655 tests, 655 pass, 0 fail                        |
| New `src/app/test/app-mcp.test.mjs`                                       | 2 of 2 pass                                                |
| New `src/app/test/verify-integrate.test.mjs`                              | 5 of 5 pass                                                |
| `npm run build:kirocrew-app` in the `kirocrew-native` worktree            | exit 0; `kirocrew-app/bin/lib/src/app/app-mcp.mjs` present |
| `git diff --check`; `prettier --check` on changed files                   | clean                                                      |
| `kiro-cli agent validate --path kirocrew-app/agents/avoozl-verifier.json` | exit 0                                                     |
| Mutation: pooled server ignores the caller's binding                      | `app-mcp.test.mjs` fails                                   |
| Mutation: verdict skips the SHA comparison                                | `verify-integrate.test.mjs` fails                          |
| Mutation: unconditioned edges keep the status-only rule                   | `verify-integrate.test.mjs` fails (dependent not released) |

`npm test` rebuilds `canvas-app/extension.js` with different output. That file
was restored and is not part of the change.

## Step 0: the Kiro Crew contract

Read in `<kiro-crew-checkout>` on branch `mc2-cron-session-status`; nothing there was edited.

| Fact                                                                                                                                                                              | Source                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Capability: `initialize` result `capabilities.experimental["kirocrew.caller-identity"] = {"schemaVersion": 1}`                                                                    | `src/kiro_crew/mcp_caller.py:96` (`CALLER_CAPABILITY_KEY`), `:731-743`              |
| Gatewayd reads it from the backend's `initialize` reply (`supports_caller_identity`)                                                                                              | `src/kiro_crew/mcp_gateway/backend_handshake.py:121-124`                            |
| Every forwarded request has any client-sent block stripped, then gets the gateway's block only when the backend advertised and the caller is known                                | `src/kiro_crew/mcp_gateway/backend_stubs.py:432-442`; `backend_wire.py:160`, `:344` |
| Block: `params._meta["kirocrew.caller"] = {schemaVersion: 1, sessionKey, sessionType, principalId, channelId, sessionToken?, identityDenial?, toolCallId?}`; no project directory | `src/kiro_crew/mcp_caller.py:26-35`, `:749-773`                                     |
| Advertising does not decide pooling; an unadvertised backend is pooled and identity-blind                                                                                         | `src/kiro_crew/mcp_caller.py:47-55`                                                 |
| A pooled backend runs in the gateway's default work dir (part of the pool key), not a session's project                                                                           | `src/kiro_crew/mcp_gateway/pool.py:221-240`; `rewriter.py:594-596`                  |
| Injection exists only for servers in `mcp_gateway.stub_servers`, empty by default                                                                                                 | `src/kiro_crew/doctor_checks/mcp.py:560-576`                                        |
| A script cron's `ctx.call_tool` spawns its own server process, with no caller block                                                                                               | `src/kiro_crew/cron_script_mcp.py:79-165`, `cron_script_context.py:331-353`         |

## What landed

| Task           | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Where                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 0 pooling-safe | `avoozl mcp --kirocrew` (what `bin/avoozl_mcp.py` now runs). Each request picks its workspace: a caller whose slot has a session binding works in that binding's workspace (catalog workspaces plus the launch one, read again per call); a slot bound in two workspaces is refused; any other request uses the launch workspace (`--workspace`, `AVOOZL_WORKSPACE` family, or catalog default), else it is refused. The working directory is never used. One Store and Operations per database, kept open. `initialize` advertises `kirocrew.caller-identity`         | `src/app/app-mcp.mjs`, `src/app/cli.mjs`, `kirocrew-app/bin/avoozl_mcp.py`                                                  |
| 0 fail closed  | A request without a caller block still runs (the tick cron's own process needs this) but carries no caller, so `plans_report` refuses it. Plain `avoozl mcp` (no gateway in front) no longer reads caller blocks at all                                                                                                                                                                                                                                                                                                                                                | `src/app/cli.mjs`                                                                                                           |
| 2.8 agent      | `avoozl-verifier`: read tools, shell, `thinking`, and only `@avoozl:avoozl/plans_report`; no file writes; prompt says add a detached worktree, run every declared check, report each exit code, never judge                                                                                                                                                                                                                                                                                                                                                            | `kirocrew-app/agents/avoozl-verifier.json`                                                                                  |
| 2.8 tick       | For each worker `done` (delivery state `done`) with no live verifier, the tick plans one verifier dispatch on agent `avoozl/avoozl-verifier`, title `avoozl:<task> verify <sha>`, brief with the SHA, checkout, declared checks (the leaf's `checks`, else the repository's) and the detached-worktree command. A verifier `done` must list `checks: [{command, exitCode}]`; workers may not                                                                                                                                                                           | `src/app/delivery.mjs` (`planVerifierDispatches`, `reportSession`), `src/app/tick.mjs`                                      |
| 2.8 verdict    | Accepted only when the reported commit equals the worker's SHA and every declared check is listed with exit 0 → state `verified`. Otherwise the worker attempt is marked failed with `verifier rejected: …` and the 2.11 retry path retries it with that cause or opens a decision. A verifier that ends without a verdict is retried up to `retries`, then a decision                                                                                                                                                                                                 | `reconcileVerifications`, `verdictCause`                                                                                    |
| 2.9            | The cron's tick integrates each `verified` delivery through `integrateRun` (rebase, rerun the repository's checks, then land), from the task's worktree. A repository may set `integrationBranch`: it is created from the base branch if missing, must not be checked out anywhere, and moves by `git update-ref` from the value read before the rebase, so the user's checkout is untouched. The task records `integration: {commit, branch, into, at}`; the delivery records `integratedCommit` and `into`. Any refusal but a held lock is one decision notification | `src/app/git.mjs`, `integrateVerified`, `projectConfig`, `src/app/repository-settings.mjs`, `src/avoozl-config.schema.json` |
| 2.10 release   | Integration runs before readiness in the same tick. An unconditioned `requires` edge now waits for the dependency's own completion (§4.3) when the dependency has a work-model `kind` or `completion`; rows stored before the work model keep the old rule (complete status)                                                                                                                                                                                                                                                                                           | `src/work-model.mjs` `completionReached`                                                                                    |
| 2.10 parents   | New task field `parent` (via `task.update`). An `epic` or `package` whose children all reached their own completion gets `childrenComplete: {at, children}`, innermost first; that counts as its completion. The tick never sets `accepted`; `task.accept` stays the only whole-head acceptance                                                                                                                                                                                                                                                                        | `completeParents`, `src/app/operations.mjs`                                                                                 |

## One test per rule, and the nearby inputs checked

| Rule                                                 | Test                                                                                                       | Nearby inputs                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One pooled process never mixes workspaces            | `one pooled MCP process serves two workspaces without mixing them` (real packaged `avoozl_mcp.py` process) | interleaved callers from two workspaces; a bound caller naming the other workspace's task; no caller block; an unbound caller (catalog default); a `cron:` caller; a slot bound in both; a working directory that is itself a workspace; the advertised capability        |
| No launch workspace means refusal, not cwd           | `without a launch workspace, an unbound caller is refused, not served from the cwd`                        | no catalog; cwd is a workspace                                                                                                                                                                                                                                            |
| Verifier tool refs use the registered key            | `the verifier agent ships with tool refs on the server key Kiro Crew registers`                            | bare `@avoozl`; an unserved tool; `fs_write`                                                                                                                                                                                                                              |
| One verifier per done; accept only SHA + checks pass | `a done report opens one verifier; only the matching SHA with passing declared checks is accepted`         | tick while the verifier is live; verifier done without checks; worker sending checks; another SHA; a missing check; exit 1; verifier closed without a verdict (retried); past the bound (decision); a recorded verdict not recorded again; a page tick does not integrate |
| Verified commits integrate and record the commit     | `a verified commit integrates with integrateRun and records the integrated commit`                         | checkout on its base branch (fast-forward); dirty checkout (decision, nothing moved, notified once); repository without checks (decision); a repeated tick                                                                                                                |
| Integration branch leaves the checkout untouched     | `an integration branch takes the verified commit and leaves the checkout untouched`                        | branch created from base; branch checked out in another worktree (decision); config naming the base branch or an invalid name                                                                                                                                             |
| Same-tick release, parents, acceptance separate      | `integration releases dependents in the same tick and completes parents, never acceptance`                 | work-model leaf edge (released); legacy row edge (waits for acceptance); package with a child left; epic over a package; a quiet tick writes nothing; `task.accept` afterwards                                                                                            |

`delivery.test.mjs` "never dispatched twice" now counts worker dispatches only,
since a done report also plans a verifier.

## Security checks

| Check                  | Result                                                                                                                                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Builder-security skill | Read before editing `mcp.mjs`, `cli.mjs`, and the new stdio server                                                                                                                                                                                                               |
| Listeners              | No listener, bind, route or port change. The stdio server opens no socket                                                                                                                                                                                                        |
| Caller identity        | Read only from the gateway's block, only in `--kirocrew` mode. Plain `avoozl mcp`, which no gateway fronts, used to accept a client-written block; it no longer reads one (fixed in place). A caller cannot choose a workspace: only its binding or the launch workspace is used |
| Workspace choice       | Only catalog-registered roots and the launch workspace are opened; a database that does not exist is never created                                                                                                                                                               |
| Untrusted text         | A verifier's rejection cause reaches the worker's resume brief inside the existing fenced data block                                                                                                                                                                             |
| Sweep                  | `0.0.0.0` and `[::]` in `src`, `kirocrew-app`, `scripts`: unchanged from the previous receipt                                                                                                                                                                                    |

No credential, workspace data, or machine path was added.

## Not done, and risks

- **Live reports still need one Kiro Crew setting.** Advertising is in place,
  but gatewayd injects the block only into servers listed in
  `mcp_gateway.stub_servers` (empty by default). The user must stub
  `avoozl:avoozl` (Kiro Crew MCP gateway settings) before `plans_report` works
  from a live session. Not tried live; proof P5 covers it.
- **No project directory in the caller block.** An unbound session (a Crew
  Mode conductor) always gets the launch workspace; it cannot select another.
- Verification and integration apply only to tick-opened workers (they own
  `task_deliveries`); a conductor-bound worker's `done` opens no verifier.
- The verifier's exit codes are its own claim; integration reruns the
  repository's checks itself before landing. A repository with no `checks`
  cannot integrate (decision).
- `parent` is not yet set by plan approval or the spec reader (owned by the
  other chat); until it is, parents complete only for rows given `parent`
  through `task.update`.
- An integrated leaf still reads `ready:true` in queries; dispatch skips it
  through its delivery record.
- A verifier `question` report is not routed to a decision; a delivery in
  `decision` still has no resolve operation (2.12).
- The responder agent's `@avoozl/plans_post_reply` ref is still broken
  (Phase 4 owns it).
