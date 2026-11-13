# Proof P2: tick script cron opens, messages, and observes sessions

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 1,
proof P2 [R26, R1.2].

- App source: `kirocrew-native` at `20e4805`
- Kiro Crew: source checkout `<kiro-crew-checkout>`, branch
  `mc2-cron-session-status` at `8ea150ee9` (v0.12.1, the installed version, plus
  MC-2). Not the installed app bundle.
- Recorded: 2026-11-12 02:02–02:12 UTC, Node v26.13.0, Python 3.12, macOS
- Verdict: pass

## MC-2

The earlier P2 runs failed because `kirocrew-dashboard` `session_status`
resolves its caller to a live dashboard slot, and a script cron has none, so it
answered `caller session could not be identified`.

Kiro Crew `8ea150ee9` adds `ScriptContext.session_status()`, which calls
`GET /api/chat/cron-sessions`. The route admits only a caller whose
`cron:<job id>` key the gateway attests (internal secret plus the run's signed
session token). It lists only slots that job created, live or persisted, and
rows carry no titles. Any other caller gets 403 `cron_caller_required`, and
while `agent.session_control` is off it gets 403 `session_control_disabled`.
Every decision is a `chat.cron_sessions` audit record. The existing chat caller
checks in session control are unchanged.

Avoozl `20e4805` makes the tick read `ctx.session_status()` and pass each
bound slot's status to `plans_session_status`.

## Setup

| Step | Result |
|---|---|
| Clean profile | New temporary `HOME`, `KIROCREW_HOME`, `KIRO_HOME`, `KIROCREW_WORKSPACE`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME` and `AVOOZL_WORKSPACE` under `$TMPDIR/kc-p2/live3`; the active profile and the real Avoozl catalog were not used |
| Avoozl workspace | One stub task `p2-stub`, repository `p2-repo` with a local checkout, one `session.request` for role `worker` on agent `p2-worker` |
| Build and install | `npm run build:kirocrew-app` exit 0; source `kirocrew app install <worktree>/kirocrew-app` -> `installed avoozl v0.1.0`; `agent.apps_trusted = ["avoozl"]` in the temporary profile; `kirocrew app enable avoozl` registered cron `avoozl/avoozl-tick` (`c86677f9`, every 60 s) |
| Gateway | Source `kirocrew gateway --test-mode --no-tunnel`; `lsof` shows only `127.0.0.1:53082` and `[::1]:53082` listening |
| Model | The packaged fake ACP backend (`KIROCREW_KIRO_BIN=src/kiro_crew/testing/fake_acp_backend.py`), the one fake Kiro Crew's integration suite uses. The agent shell cannot read the real `~/.kiro`, so a real sign-in was not available. The gateway, cron, app, MCP servers and routes are real |
| Project directory | The first tick created folders `Avoozl/p2-repo` and opened nothing (MC-1). The owner then set `p2-repo`'s project directory to the checkout with `PATCH /api/chat/folders/<id>` |

## Action and expected results

| Expected | Observed | Result |
|---|---|---|
| One session titled `avoozl:<task-id>` opens in that folder on the named agent | Tick at 02:07:11 opened slot `avoozl_p2-stub_Stub_dispatch`, title `avoozl:p2-stub Stub dispatch`, agent `p2-worker`, folder `p2-repo` (`21f2e7a1a14d`) | pass |
| It is bound before the brief is sent | Binding `boundAt` 02:07:11.227Z; the brief's user message 02:07:11.274Z | pass |
| It receives one brief | The transcript holds one user message (the brief) and one reply from the fake backend at 02:07:20 | pass |
| The cron fires twice without a second session | Ticks at 02:08:11 and 02:09:11 opened nothing; one binding, attempt 1, throughout | pass |
| The status is read | The 02:08:11 tick recorded `status: idle` on the binding | pass |
| Close the session; its closed status is read on the next tick | Owner `DELETE /api/chat/slots/avoozl_p2-stub_Stub_dispatch` at 02:10:19 -> `{"ok": true}`. The next tick recorded `status: closed` at 02:11:12; the 02:12 tick left it unchanged | pass |
| A non-cron caller cannot read the cron roster | Owner `GET /api/chat/cron-sessions` -> 403 `cron_caller_required` | pass |
| Each read is audited | `security_events.jsonl`: 4 `chat.cron_sessions` allowed for `cron:c86677f9`, 1 denied `cron_caller_required` | pass |

## Checks

- Kiro Crew: focused tests 604 passed (`test_cron_session_status.py` new,
  plus cron script, preview, chat cron route, route table, owner gate and
  internal path tests); `mypy --platform linux src/kiro_crew`, black, isort,
  flake8, comment-history and brand checks clean.
- Avoozl: `npm test` 592 passed; `git diff --check` clean.

## Notes

- The model was faked, so P2 shows the session handoff, not a real worker's
  reply. A real sign-in in a clean profile would also cover that.
- The installed app's three agents did not register in the temporary profile
  ("agent source missing or unreadable"), and the dashboard repeated the
  `kirocrew-conductor` `agent_not_found` warning, as in P1. P2 does not use
  them.
- A persisted `created_by` line is a claim a sandboxed shell could write. The
  cron roster trusts it the same way the existing cron creator check does; a
  forged line can add at most a slot key and its status to the forger's own
  read.
