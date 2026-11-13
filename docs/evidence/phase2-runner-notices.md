# Phase 2 evidence: Crew Mode runner support (2.14) and notifications (2.12)

Spec: `<plans repo>/.kiro/specs/assess-avoozls-future-as-a/` tasks 2.14 and
2.12 (design §5.1, §6.6, §4.2; requirements 6.5, 9, 26, 26.10, 27.14).

## Commits

- `819db47` Add Crew Mode runner support and channel notifications (code,
  tests, app package files). Both tasks share `delivery.mjs`, `tick.mjs`,
  `operations.mjs`, `mcp.mjs` and `cli.mjs`, so they landed as one commit.
- This file, in the commit after it.

Base: `kirocrew-native` at `31adf4e`. Landed by fast-forward. Nothing pushed.

## Tests

`npm test` (typecheck, build, then every test): 664 of 664 pass. Before this
change: 655 tests. `git diff --check` is clean.

New tests are in `src/app/test/kirocrew-runner.test.mjs`. One more is in
`src/app/test/kirocrew-app-package.test.mjs`:

| Test | What it checks |
|---|---|
| a claimed task never appears ready twice and cannot be claimed twice | claim, re-claim no-op, second slot 409, `query ready:true`, `queue`, the window before the tick records a result, retry as attempt 2, runner `tick` refused, no identity refused |
| the tick leaves ready leaves to a Crew Mode conductor and still verifies its work | runner `crew-mode` dispatches no worker, a relayed done report gets one verifier, runner `tick` still dispatches |
| only the claiming conductor, the worker, or the local command line may report | relay identity rules |
| plans_next puts every local leaf in one bucket with what it waits on | all five buckets, blockers, capacity, deferred, question link, `finished` |
| every runner write goes through Operations.execute, whichever surface calls | CLI process and app MCP share one writer; a CLI claim is refused over MCP |
| decisions and failures queue once on the app's channels with a link to the session | payload shape and `/chat?sid=` link, queue once, page tick queues nothing, failed push stays queued, `plans_retry_delivery` resumes |
| the backend pushes to the gateway only on a proven origin, with an app token | origin proof, token exchange, expired token, refused push |
| the AgentSpawn hook briefs a Crew Mode conductor only in this workspace | gating by cwd and runner, stdin timeout, real CLI `next --hook`, packaged hook file |
| packaged launcher serves the Crew Mode runner and lists its tools | built package runs `next`, MCP lists `plans_next`, `plans_claim_task`, `plans_retry_delivery`, steering ships |

Three existing tests changed with behavior: retries exhausted now uses the
`failure` channel; the tick cron no longer calls `ctx.notify`; the package
launcher allows the runner commands.

## 2.14 Crew Mode runner support

- **Claim-aware readiness.** `claimedTaskIds` (`src/app/delivery.mjs`) marks a
  leaf claimed when it has a live worker session, a delivery that is not
  `failed`, or a runner attempt the tick has not recorded yet. The `ready`
  query term excludes claimed leaves and leaves that reached their own
  completion. `query`, `queue`, the Graph view, the tick and `next` all pass the
  claimed set, so the spike's "partial still shows ready" gap is closed in code.
- **Claim operation and structured binding.** `runner.claim`
  (`plans_claim_task`, `avoozl claim TASK --slot SESSION`) binds the worker
  session with `source: "conductor"`, the attempt number, and `conductor` (the
  claiming session, or `cli`). The readiness check runs inside the binding's
  `BEGIN IMMEDIATE` transaction, so two claims cannot both win. The claim also
  prepares the leaf's worktree. It is refused unless `.avoozl.json` sets
  `delivery.runner` to `crew-mode`.
- **Reports.** `plans_report` accepts a relay: `{taskId, slot, kind, ...}` from
  the conductor that claimed the slot, or from the local CLI
  (`avoozl report`). The worker itself may still report.
- **`delivery.runner`.** New setting, `tick` (default) or `crew-mode`. With
  `crew-mode` the tick opens no worker sessions, but it still records results,
  verifies, integrates and completes parents for conductor-claimed leaves.
- **`next`.** `runner.next` (`plans_next`, `avoozl next`) returns `ready`
  (with brief and session title, capped by free capacity), `running` (with
  phase working, recording, verifying or integrating, and the session link),
  `waiting` (with `blockedBy`, or a reason), `needsYou` (blocked, review,
  worker questions, stopped deliveries, an invalid policy), `done`,
  `finished`, and the rule text.
- **Steering and hook.** `src/app/runner/avoozl-runner.md` is the conductor
  steering; the build copies it into the package. `kirocrew-app/hooks/avoozl-runner.json`
  is a Kiro v1 `AgentSpawn` hook that runs `bin/avoozl.mjs next --hook`. The
  hook prints the steering and current bucket counts only when the session
  starts in the workspace or a registered checkout and the runner is
  `crew-mode`; otherwise it prints nothing and always exits 0.
- **One writer.** Every runner write is an `Operations.execute` operation. The
  CLI runs it in process with `{local: true}`; the app MCP server passes the
  attested caller.
- **Route-neutral brief.** `workerBrief(task, project, {steps})` takes the
  route's steps. `localSteps` gives the local and Crew Mode relay steps; task
  4.7 passes plans-repo steps.
- **Package.** `bin/avoozl.mjs` serves `next`, `claim`, `report`, `retry`. The
  package was rebuilt by `npm test` (`build:kirocrew-app`); the packaged MCP
  server lists the new tools.

## 2.12 Decisions and notifications

- Each tick notice now has `channel` (`decision` or `failure`, the two app.json
  channels), `title`, `text`, `resume` (the action that resumes work), `task`
  and `slot`. Retries exhausted and refused integration use `failure`;
  questions, quiet sessions and an invalid policy use `decision`.
- `notificationPayload` builds the push body: title, body (cause and resume
  action), `url` `/chat?sid=<slot>` (the Avoozl page when there is no
  session) and `group_key` `avoozl:<task>`.
- The cron's tick queues each notice once in the new `app_notifications`
  table. The tick's `notify` intents carry the same `link`.
- The app backend is the only Avoozl process with the app secret. It pushes
  queued notices to `POST /api/notifications/push` with an app token from
  `POST /api/apps/avoozl/token`, and only when `KIROCREW_GATEWAY_ORIGIN_PROOF`
  matches the origin. It drains when it starts and when the tick writes
  `tick-health.json`. A failed push stays queued. The backend still listens
  on 127.0.0.1 only; this adds outbound loopback calls and no listener.
- `crons/tick.py` no longer calls `ctx.notify`, which posts a plain bell note
  with no channel and no link to another session.
- `delivery.retry` (`plans_retry_delivery`, `avoozl retry`) resumes a leaf that
  stopped for a decision with a fresh retry budget, so every stop names its
  resume action.

## Not verified live

- No real Crew Mode conductor ran these rounds; proof P2b covers that.
- The `AgentSpawn` hook file has not been installed in `~/.kiro/hooks/` or run
  by Kiro Crew. The stdin event shape (`cwd`) is taken from kiro-cli's hook
  contract; without it the hook uses its process directory.
- The push to `/api/notifications/push` was tested against a fake gateway
  only. The query-string app token and the 401-on-expiry retry follow Kiro
  Crew's source (`token_auth.py`, `handlers/notifications_push.py`), not a live
  call.
- Whether a Crew Mode worker can call `plans_prepare_worktree` and
  `plans_report` itself is unknown; the relay brief covers both cases.
- Only the served workspace drains notices; another catalog workspace's
  notices wait until it is served (marked `shortcut` in `app-backend.mjs`).
