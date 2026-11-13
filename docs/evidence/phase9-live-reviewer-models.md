# Live check: Kiro Crew opens Avoozl's sessions on the requested model

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 9,
fact F31 and the review gate's `distinctFrom: model` rule (tasks 9.1, 9.2).
Proof P27 used a fake session driver; this run used a real Kiro Crew and real
model calls.

- App source: `kirocrew-native` at `fe043ea`, built in the worktree
  `$TMPDIR/kc-p9-live/wt` (`npm run build:kirocrew-app`, exit 0)
- Kiro Crew: source checkout `<kiro-crew-checkout>`, branch
  `mc2-cron-session-status` at `8ea150ee9`, as in P2, P5 and P6; run, not changed
- Model backend: real kiro-cli (`agent.acp_backend: kiro`), signed in from a
  staged copy of the P6 profile's sign-in store
- Recorded: 2026-11-12 19:11–19:19 UTC, Node v26.13.0, macOS
- Verdict: **PASS**. Every session opened on the model Avoozl asked for. No
  Avoozl change was needed. One gap is recorded below: a model Kiro Crew does
  not offer is silently replaced by `auto`, and Avoozl cannot see that.

## Setup

Everything is under `$TMPDIR/kc-p9-live`. The user's own Kiro Crew, its
port and its settings were not touched.

| Step              | Result                                                                                                                                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile           | `env.sh`: `HOME`, `KIROCREW_HOME`, `KIRO_HOME=<KIROCREW_HOME>/kiro`, `KIROCREW_WORKSPACE`, `XDG_*`, `GH_CONFIG_DIR`, `AVOOZL_WORKSPACE`, `KIROCREW_POD=1`, `KIROCREW_OS_HOME`                                                                                                                   |
| Clean environment | `kc.sh` runs the CLI under `env -i` with `KIROCREW_PROFILE=standalone`, so no `KIROCREW_*` variable from the calling shell reaches the test copy                                                                                                                                                |
| Sign-in           | `data.sqlite3` copied with `sqlite3 .backup` from the P6 profile's staged store into `os-home` and the test `HOME`. `GET /api/models` then listed 20 models (`models.json`)                                                                                                                     |
| Config            | `agent.session_control true`, `agent.sandbox_allow_unsandboxed_exec true`, `agent.acp_backend kiro`, `mcp_gateway.stub_servers ["avoozl:avoozl"]`, `agent.apps_trusted ["avoozl"]` (set after `app install`; set before it, install refuses with "execution trust predates repository binding") |
| App               | `kirocrew app install <wt>/kirocrew-app`, `app enable avoozl`: 4 agents, 1 skill, cron `avoozl/avoozl-tick`                                                                                                                                                                                     |
| Stub              | Approved with `POST /api/mcp-gateway/servers/stub` and the `expected_launch` from `GET /api/mcp-gateway/servers/launch?name=avoozl:avoozl`                                                                                                                                                      |
| Gateway           | `kirocrew gateway --test-mode --no-tunnel --approval yolo`, loopback, own ephemeral ports. Restarted by stop and start (`boot.sh`), not `POST /api/restart` (see Notes)                                                                                                                         |
| Sample repo       | `$TMPDIR/kc-p9-live/sample`, branch `main`, `npm test` (`node --test`), registered as `sample` with `checks: [["npm","test"]]`. No GitHub                                                                                                                                                  |
| Folder            | `Avoozl/sample`, created by the tick; project directory set with `PATCH /api/chat/folders/<id>`                                                                                                                                                                                                 |

`.avoozl.json` delivery policy, with three model ids from `models.json`:

```json
{
  "concurrency": 1,
  "retries": 1,
  "quietMinutes": 5,
  "model": "claude-sonnet-5.5",
  "reviewers": [
    {
      "id": "conventions",
      "focus": "language and repository conventions",
      "agent": "avoozl-reviewer",
      "model": "claude-haiku-5.5"
    },
    {
      "id": "correctness",
      "focus": "correctness of the change against its acceptance",
      "agent": "avoozl-reviewer",
      "model": "gpt-5.6-luna"
    }
  ]
}
```

Spec `.kiro/specs/models/` has one leaf, `models.1.1` (add `shout()` and a
test), approved through `plan.preview` and `plan.approve` (`setup.mjs`).

## Run

| Time (UTC) | Event                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| 19:12:12   | Tick opened and bound the worker `avoozl_models.1.1_Add_shout_helper`              |
| 19:12:49   | Worker reported done, commit `45ff469`                                             |
| 19:13:11   | Tick opened checks (`verify_45ff4699349b`) and both review sessions on that commit |
| 19:13:31   | Checks: `npm test` exit 0. `correctness`: approved, no findings                    |
| 19:13:39   | `conventions`: approved, one observation (F1, a missing header comment)            |
| 19:14:11   | Tick accepted all three roles on `45ff469`                                         |
| 19:14:13   | Integrated into `main`; delivery state `integrated`                                |

## Requested and actual model per session

"Requested" is what Avoozl sent to `open_session` (the binding's `model`).
"Actual" comes only from Kiro Crew's and kiro-cli's own records, never from
Avoozl's binding:

- **kiro-cli**: `crew/kiro/sessions/cli/<id>.json`,
  `session_state.rts_model_state.model_info.model_id` and each user turn's
  `model`. The session id maps to the slot through the header of
  `crew/crew-log/sessions/<id>-*/log.jsonl`.
- **Kiro Crew**: the crew log's `session/opened` (`model`, `model_requested`)
  and `turn/completed` (`model`) events; `GET /api/chat/slots` (`model` is the
  pin, `served_model` is what the live session reported).

| Session                                             | Role               | Requested            | kiro-cli session    | Crew log opened / turn                    | Slot `served_model`                    |
| --------------------------------------------------- | ------------------ | -------------------- | ------------------- | ----------------------------------------- | -------------------------------------- |
| `avoozl_models.1.1_Add_shout_helper`                | worker             | `claude-sonnet-5.5`  | `claude-sonnet-5.5` | `claude-sonnet-5.5` / `claude-sonnet-5.5` | `claude-sonnet-5.5`                    |
| `avoozl_models.1.1_verify_45ff4699349b`             | checks             | none (agent default) | `auto`              | `""` / `auto`                             | `""` (Kiro Crew shows `auto` as empty) |
| `avoozl_models.1.1_review_conventions_45ff4699349b` | review:conventions | `claude-haiku-5.5`   | `claude-haiku-5.5`  | `claude-haiku-5.5` / `claude-haiku-5.5`   | `claude-haiku-5.5`                     |
| `avoozl_models.1.1_review_correctness_45ff4699349b` | review:correctness | `gpt-5.6-luna`       | `gpt-5.6-luna`      | `gpt-5.6-luna` / `gpt-5.6-luna`           | `gpt-5.6-luna`                         |

The verdicts Avoozl stored carry the same models: `conventions` with
`claude-haiku-5.5`, `correctness` with `gpt-5.6-luna`, both on `45ff469`.

## Probe: a model Kiro Crew does not offer

To see what happens when the model is not available, a session was opened by
hand on the same route the cron uses (`POST /api/chat/slots`, agent
`avoozl-reviewer`, model `not-a-real-model`) and sent one message.

| Record                             | Value                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Create reply                       | 200; `model: "not-a-real-model"`                                                      |
| Transcript notice                  | "not-a-real-model isn't offered right now — this session is running on auto instead…" |
| Turn                               | Ran and answered                                                                      |
| kiro-cli session                   | `model_id: auto`                                                                      |
| Crew log `session/opened`          | `model: ""`, `model_requested: "not-a-real-model"`                                    |
| Slot                               | `model: "not-a-real-model"`, `served_model: ""`, `model_withheld: true`               |
| Usage ledger (`crew/usage/tokens`) | `model: "not-a-real-model"` (the pin, not what ran)                                   |

So Kiro Crew does not refuse an unoffered model. It keeps the pin, runs the
session on `auto`, and records the swap in its slot (`model_withheld`) and
crew log. Avoozl only sees the slot key from `open_session` and the status
rows from `session_status()` (`/api/chat/cron-sessions`), and neither carries
a model. The gateway's `kirocrew.caller` block on `plans_report` carries no
model either. Kiro Crew can also move a pinned dashboard session to another
model mid-session: on throttling (`agent.fallback_model`, default `auto`;
`dashboard/chat_turn/model_fallback.py`) and when kiro-cli's engine promotes a
fallback (`dashboard/engine_fallback.py` sets `slot.model` to the new model).
In each case a reviewer can run on `auto` or on the writer's model while
Avoozl records the requested model as proof the two were distinct.

Avoozl cannot detect this today without a Kiro Crew change, so no Avoozl
detection was added. The smallest Kiro Crew change would be to add
`served_model` (or `model` plus `model_withheld`) to each row of
`/api/chat/cron-sessions`. Then `tick.py` could pass it to `plans_tick`, and
the tick could refuse a review verdict whose served model is unknown, `auto`,
or equal to the writer's, opening a decision instead.

## Notes

- `POST /api/restart` brought the gateway back once, on a new port. The second
  call left PID 96301 holding `crew/gateway.lock` with a listener that did not
  answer for about 5 minutes, after which it exited by itself. Later restarts
  used `boot.sh` (stop the PID in the profile's own lock file, then start).
- One kiro-cli session file (`58e4dca4…`) has no crew-log session and no model
  state. It is not one of Avoozl's sessions.
- Kiro Crew's usage ledger records the pin, not the served model, as the probe
  shows. Do not use it as model proof.
- Checks run on the verifier agent's own model (`auto`), as the 9.1 notes say.
  No model rule applies to the checks role.

## Not checked

- What `auto` resolved to on the server side: kiro-cli reports only `auto`.
- A live throttle or engine fallback during a review. The fallback paths are
  read from Kiro Crew source only.
- A review that requests changes, a rebase round, or more than one attempt.
- The installed Kiro Crew release (0.12.2.3). This run used the source
  checkout with MC-2, as in earlier proofs.

## Artifacts

`$TMPDIR/kc-p9-live/`: `env.sh`, `kc.sh`, `boot.sh`, `api.sh`,
`slots.sh`, `setup.mjs`, `models.json`, `evidence.txt` (every table above,
dumped from the records named), `gateway.out`, and `crew/` (the test copy's
data).
