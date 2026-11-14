# Kiro Crew hooks and conductor wake paths (2026-11-13)

A live probe of Kiro Crew 0.12.2.4 (default ACP backend: KAS) in a second,
isolated Kiro Crew home (`KIROCREW_HOME` set to a temporary folder, `--port auto`),
with Avoozl from main at `9b9d1c4`. No dashboard token was read or used, so
nothing was done as the person in the dashboard.

Each answer is marked:

- **Verified**: run in the test crew; the observation is quoted.
- **Inferred**: read in Kiro Crew's source; the cite is `kiro_crew/<file>:<line>`
  in the 0.12.2.4 package.

Probe-only changes, made to the test install and never to this repo:

1. A worker app agent `avoozl-probe-worker` with `hooks` for `agentSpawn`,
   `userPromptSubmit`, `preToolUse` (`*`), `postToolUse` (`*`) and `stop`. Each
   hook logged its stdin and `KIRO_SESSION_ID`. `.avoozl.json`
   `delivery.agent` pointed at it.
2. In `crons/tick.py`, after `ctx.open_session(...)`, a call to
   `ctx.set_session_mode(slot, "trust")`, so a second worker ran in trust mode.
3. The test folder's project directory was set by hand (the step Avoozl's
   notice asks a person to do).

## Setup snag: an inherited `KIROCREW_BOUND_PORT`

A test gateway started from a shell inside a Kiro Crew chat inherits that
chat's `KIROCREW_BOUND_PORT` (here 5476, the main crew's port). Its MCP
children then dial the main gateway with the test gateway's credential, and
every `kirocrew-work` and `kirocrew-dashboard` call fails with
`internal_auth_mismatch` (Verified: the conductor's first `work_ledger_record` and
`work_dispatch` both failed this way). The main gateway refused the calls, so
nothing changed there. Kiro Crew drops only an inherited `KIROCREW_PORT`, not
`KIROCREW_BOUND_PORT` (Inferred: `kiro_crew/acp/launch.py:982-1000`).

Fix: start a test gateway with the parent's variables removed, for example
`env -u KIROCREW_BOUND_PORT -u KIROCREW_PORT -u KIROCREW_SPAWN_HOME -u KIROCREW_SPAWN_INSTANCE -u KIROCREW_HOST_PID -u KIROCREW_SPAWNED -u KIRO_SESSION_ID KIROCREW_HOME=<home> kirocrew gateway --port auto --no-open --no-tunnel`.
D1 and D2 below ran after this fix.

## A. Hooks in worker chats the tick opens

Avoozl's own tick (`avoozl/avoozl-tick`, `ctx.open_session`) opened two
workers: one in the default (normal) approval mode, one in trust mode.

| Question | Answer | Evidence |
|---|---|---|
| Does `agentSpawn` fire? | Yes, in both chats | Verified |
| Does `userPromptSubmit` fire? | Yes, on the tick's brief, on Avoozl's nudge and on a hook continuation | Verified |
| Does `preToolUse` fire? | Yes, for MCP calls (`@avoozl:avoozl/plans_*`) and built-in calls (`shell`) | Verified |
| Does `postToolUse` fire? | Yes, also for refused and failed calls | Verified |
| Does `stop` fire? | Yes, after every turn | Verified |
| Does a Stop hook keep the worker going? | Yes, but only with `{"decision": "block", "reason": "..."}` on stdout and exit 0. The next turn starts with `[Hook continuation — automatic]` plus the reason, and the stop payload then has `stop_hook_active: true, hook_continuation_count: 1`. Plain text on stdout does nothing. Capped by `agent.max_stop_hook_nudges`. | Verified; `kiro_crew/dashboard/chat_turn/turn_spec_hooks.py:933-1000`, `kiro_crew/dashboard/state_parts/injected_turns.py:281-305` |
| Does PreToolUse block an auto-approved MCP tool? | Yes. Exit 2 blocks it, and the model sees "The user rejected this tool call." In trust mode no approval prompt was raised. In normal mode the block lands before the prompt (70 ms, while unblocked calls waited 180 s). A spec hook that crashes or times out only warns. | Verified; `kiro_crew/hook_runtime/script_hooks.py:122-136` |
| Does the payload carry a key Avoozl can tie to its task? | Yes. `session_key` is `dashboard:<slot>`, and `<slot>` is the same slot Avoozl stores in `session_bindings` for the task. The payload also has `session_id` and `acp_session_id`, and the env has `KIRO_SESSION_ID`. | Verified; `kiro_crew/hook_runtime/script_hooks.py:935-936` |
| Who runs these hooks? | Kiro Crew's turn loop, because the backend is KAS. An app agent's `hooks` survive materialization unchanged. | Inferred: `kiro_crew/agent_sdk/backends.py:413`, `kiro_crew/agent_sdk/backends_routing.py:333-335`, `kiro_crew/agent_sdk/spec_hooks.py:1-20`; Verified in the materialized agent file |

Found along the way:

| Finding | Evidence |
|---|---|
| A worker the tick opens runs in normal approval mode. Every non-read tool, even an MCP tool in `allowedTools`, asks for approval. With nobody there, the call is rejected after 180 s, so the normal-mode worker never ran a tool. Avoozl's `tick.py` never calls `ctx.set_session_mode(slot, "trust")`. | Verified; `kiro_crew/cron_script_context.py:245-263` |
| An app agent's `allowedTools` loses its built-in tools: `fs_read`, `fs_write`, `execute_bash`, `grep` and `glob` were dropped, and only `thinking` and the `@avoozl:avoozl/...` refs were kept. | Verified; `kiro_crew/apps/bridges_agents.py:193` |
| The per-session Avoozl MCP server (`avoozl.mjs mcp --kirocrew`) gets `KIRO_HOME` but not `KIROCREW_HOME`, while the app backend gets both. So in a second Kiro Crew home, the MCP server reads the main home's Avoozl config, and every worker call fails with "Avoozl has no workspace for this session". The comment in `src/app/layered-config.mjs` says Kiro Crew passes `KIROCREW_HOME` to the MCP server; it does not. | Verified (process environments, worker tool results) |
| Kiro Crew's cron `open_session` takes no `crew` argument, so the tick's remote branch always takes `except TypeError: continue`. | Inferred: `kiro_crew/cron_script_context.py:196-198`; `kirocrew-app/crons/tick.py` |

## B. A conductor the person opens (no bell cron)

A chat the person opens needs the dashboard, and `kirocrew chat` runs a
standalone CLI provider rather than a gateway chat (`kiro_crew/cli_chat.py:342`),
so a CLI chat gets no monitor nudges. The test crew had no remote crew
connected, and `work_ledger.remote_dispatch` is off by default
(`kiro_crew/config/service_sections.py:366-367`). Every row here is Inferred.

| Question | Answer | Source |
|---|---|---|
| (1) On a monitor nudge turn, can it run the `avoozl` CLI with `execute_bash`? | Yes, if the chat is in trust mode. `execute_bash` is in the conductor's `tools` but not its `allowedTools`, so in normal mode it asks for approval, and with nobody there the call is rejected after 180 s (seen live in A). Shell has no user-turn gate. | `kiro_crew/dashboard/handlers/guide.py:153-170, 285-293` (the only user-turn gates) |
| (2) Can it `work_dispatch` a local worker on an Avoozl agent? | Yes. A local `session_create` refuses only unattended callers (cron or workflow) that are not the cron itself, plus app-scoped callers. `work_dispatch` has no `crew` field. In normal mode it asks for approval. | `kiro_crew/dashboard/session_control_parts/session_create.py:256-260`, `kiro_crew/dashboard/session_control_parts/target_authorization.py:495-500`, `kiro_crew/mcp_dashboard_session_tools.py:700-760` |
| (3) Can it `session_create` with `crew=` on a nudge turn? | No: `403 crew_owner_unverifiable`. `_turn_owner_sent` is required, and a loop wake, a cron, a `session_send` or a sub-agent completion never sets it. Hub placement (a `work_item` with no `crew`) passes the same gate. | `kiro_crew/dashboard/handlers/remote_dispatch_routes.py:198-300` (owner check at 292-299), `:326-342`; `kiro_crew/dashboard/handlers_instances_crew_reads.py:233-236`; `kiro_crew/dashboard/chat_turn/turn_entry.py:248-256`; `kiro_crew/dashboard/handlers/session_control.py:454-458`; `remote_dispatch_routes.py:869-877` |
| (4) What origin do its children get, and can Avoozl see them? | `user` when a person's conductor opens them. They get `cron` only when the caller is a cron chat or itself cron-origin. Avoozl can't see them: app slot routes refuse slots with no app owner, and the cron's `session_status` lists only sessions that job opened. Only an app whose manifest has `permissions.sessionApproval`, with the person's consent, can control local `user` sessions, and Avoozl does not declare it. | `session_create.py:1017-1022`; `kiro_crew/dashboard/state_parts/slot_directory.py:234-237`; `kiro_crew/dashboard/slot_ownership.py:270-289, 444-489`; `kiro_crew/apps/permissions.py:205-230` |

## C. A person-granted standing permission for non-owner remote dispatch?

None. Every arm of `authorize_remote_dispatch` is unconditional.

| Candidate | Why it is not one | Source |
|---|---|---|
| `work_ledger.remote_dispatch` | A global on/off switch. When on, every arm still runs, including the owner-sent check. | `kiro_crew/remote_dispatch.py:28-39`; `remote_dispatch_routes.py:187-196, 198-300` |
| Hub placement (`work_item`, no `crew`) | It makes the same `authorize_remote_dispatch` call. | `remote_dispatch_routes.py:869-877` |
| A folder's `default_destination_crew`, or `instances.default_destination` | Only the order of the "Send a copy to" menu; it grants nothing. | `kiro_crew/instances/crew_ref.py:1-7` |
| App `permissions.sessionApproval` | Reaches local `user` sessions only; a remote executor is excluded. | `kiro_crew/dashboard/slot_ownership.py:444-455` |
| Trust or yolo mode | Covers approvals only; the `crew=` gate is separate. | `remote_dispatch_routes.py:198-300` |
| Cron and app callers | Refused at arm 1 (a `cron:` key is not owner-minted) or arm 2 (an app-scoped or unattended slot). | `remote_dispatch_routes.py:236-241`; `kiro_crew/dashboard/handlers/guide.py:262-266` |

## D. Wake paths for a conductor

### D1. A conductor opened by a bell (a script cron the person owns)

The person's script cron (registered with `kirocrew cron add --script`) opens
one `kirocrew-conductor` chat with `ctx.open_session`, and on each doorbell file
touch calls `ctx.send_to_session` with the file's text.

| Question | Answer | Evidence |
|---|---|---|
| Can it open and wake a conductor? | Yes. The chat's header has `origin: cron` and `created_by: cron:<job id>`, and its turns run with `actor: cron`. | Verified |
| Cron interval floor | `--every 10` was stored as every 1 minute. | Verified |
| Time from touch to turn start | 3.8 s when the cron ran just after the touch, and 19.5 s on a ring that also reopened the chat after a restart. Worst case is about one interval (60 s) plus about 1 s. | Verified |
| Can it `work_dispatch` local workers? | Yes. `work_ledger_record` (goal) then `work_dispatch` opened a `kirocrew-worker` chat, and the worker wrote its file and reported done. The gateway armed the conductor's patrol by itself and woke it on the report with an `actor: autonudge` turn. The child's header has `origin: cron` and `created_by: <conductor slot>`. | Verified |
| Approvals | `work_dispatch` is not in the conductor's `allowedTools`, so it asks. Trust mode set by the cron does not survive a gateway restart. The cron calling `ctx.set_session_mode(slot, "trust")` again on its next run approved the waiting prompt. | Verified; `kiro_crew/cron_script_context.py:245-263` (only the cron that opened the chat may set it) |
| Can the person still type into that chat? | Yes: the creator fence applies only to cron callers. But that person's turn cannot use `crew=`, because the chat has `_created_by` set and arm 3 refuses it with `owner_only`. | Inferred: `kiro_crew/dashboard/handlers/_shared_route_guards.py:150-151`, `kiro_crew/dashboard/chat_api/chat_send.py:726-729`, `remote_dispatch_routes.py:246-254` |

### D2. A person's conductor that blocks in `execute_bash` inside one turn

A person's turn can't be run without a dashboard token, so the same pattern
ran inside the bell's conductor (a single `actor: cron` turn) to check how it
behaves, and the `crew=` answer comes from source.

| Question | Answer | Evidence |
|---|---|---|
| Can it wait in the shell, dispatch, then wait again, in one turn? | Yes. A 1 s poll loop blocked for 140 s and returned 0.6 s after the file was touched. Then `work_dispatch` ran (the worker finished), then a second wait started, all in the same turn. A full 25-minute wait was not run. | Verified |
| Do wakes interrupt the wait? | No. The worker's done report arrived during the second wait and was not steered into the turn. | Verified |
| Does `crew=` still work in a person's turn after a wait? | Yes, as long as no text that isn't the owner's is steered into the turn. `_turn_owner_sent` is set once when the turn starts, and is cleared only when the turn ends or a non-owner steer arrives. A shell wait does not clear it. | Inferred: `kiro_crew/dashboard/chat_turn/turn_entry.py:256`; `kiro_crew/dashboard/chat_delivery.py:476-483, 710-715`; `remote_dispatch_routes.py:292-299` |
| What a gateway restart does | Ends the turn at once and does not resume it. The shell tool failed 0.9 s after the restart, the turn completed, and the poll process was gone. No new turn ran in the next 147 s, even with an unread done report waiting. | Verified |
| The turn ceiling | `agent.chat_turn_timeout_secs`: 4 h by default, clamped to 300 s through 24 h, and it cannot be turned off. The turn ends with a card. | Inferred: `kiro_crew/config/sections_agent.py:1206-1218` |
| The tool stall watchdog | Does not stop a live shell child: a matched shell child counts as working and is bounded only by the turn ceiling. The 2 h hard cap covers unknown verdicts and opaque MCP tools. | Inferred: `kiro_crew/config/service_sections.py:285-299` |

### D3. Can an outside process wake a chat it did not open?

No, with one exception the person grants.

| Path | What it can wake | Source |
|---|---|---|
| Cron `send_to_session` and `set_session_mode` | Only chats that cron created | Inferred: `kiro_crew/dashboard/handlers/_shared_route_guards.py:123-151`, `kiro_crew/cron_script_context.py:226-263` |
| `session_send` from another chat | Only sessions the caller created | Inferred: `kiro_crew/dashboard/session_control_parts/caller_access.py:440-446` |
| `conductor_wake` | Only a worker's own `work/recorded` report (done, blocked, question, reply) on a board it is bound to. It moves the deadline of a loop the conductor itself armed. | Inferred: `kiro_crew/conductor_wake.py:1-11, 28-34` |
| Monitor watches | `watch` accepts only `work-ledger`. The probe kinds are `gh-pr` and `work-ledger`, and the chat arms both itself. | Inferred: `kiro_crew/mcp_tools/control_parts/schemas.py:44-51`, `kiro_crew/probes/__init__.py:25-39` |
| Inbound webhook `POST /api/hooks/agent` | Only `hook:` sessions. Any other `sessionKey` is refused with `session_key_prefix_invalid`. | Inferred: `kiro_crew/dashboard/handlers/hooks.py:376-394` |
| App calls | The app's own slots. With a manifest `permissions.sessionApproval` grant that the person consented to, also local `user` sessions, but never remote, member or cron-linked ones. This is the one exception, and Avoozl does not declare it. | Inferred: `kiro_crew/dashboard/slot_ownership.py:444-489`, `kiro_crew/apps/permissions.py:205-230`, `kiro_crew/dashboard/chat_api/chat_send.py:615-624` |

## Not checked

- A turn the person sends from the dashboard (B, D1's person-typed turn, D2 as
  a person turn): these need a dashboard token.
- `crew=` against a real remote crew: none was connected.
- A shell wait longer than 140 s.
