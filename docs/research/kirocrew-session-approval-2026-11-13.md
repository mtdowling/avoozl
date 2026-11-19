# Kiro Crew `sessionApproval`: can it keep a person-opened conductor dispatching to a remote crew?

Date: 2026-11-13. Kiro Crew 0.12.2.4.

Question: a person opens a conductor chat once and leaves. The chat keeps
running on its check-in loop. On those turns the person did not send, can it
(a) be woken by an outside signal, and (b) open and message chats on a remote
crew with `session_create` / `session_send` and `crew=`?

Short answer: no. `sessionApproval` covers (a) for an app's own HTTP calls,
but never (b). No setting or grant in 0.12.2.4 makes a turn count as
owner-sent unless the owner sent it.

Labels:

- **Verified**: ran in a fresh, isolated test gateway with its own
  `KIROCREW_HOME` and `KIRO_HOME`, started for this check. Evidence is that
  gateway's own audit log and transcripts.
- **Inferred**: read in source. Paths are under the installed `kiro_crew`
  package.

One limit on the live run: an app-scoped token could not be minted in the
test (a host safety rule blocks token minting from a shell). So the step where
an app sends a turn into a person's chat is Inferred, not Verified. Every
other row marked Verified was run.

## 1. What `sessionApproval` is

| Question       | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                        | How known                                                                                                                                                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| What it is     | A boolean in an app's manifest, `permissions.sessionApproval`. It lets an enabled app "send turns, choose response options, approve or deny pending tool requests, and change approval modes for user-owned sessions".                                                                                                                                                                                                                        | Inferred: `apps/manifest_sections.py:567-570`                                                                                                                                                                                                                                                         |
| Who asks       | The app, by declaring it in `app.json`. Only the literal `true` grants it.                                                                                                                                                                                                                                                                                                                                                                    | Inferred: `apps/manifest_sections.py:637`. Verified: a test app with it installed with `sessionApprovalConsentPending: true` and stayed off.                                                                                                                                                          |
| Who grants     | Only the owner, from the dashboard. The enable route needs `sessionApprovalConsent: true` and an owner dashboard request. The CLI never gives consent: no flag, no prompt.                                                                                                                                                                                                                                                                    | Inferred: `apps/routes_enable.py:301-316`, `cli_commands_app.py:189-196`. Verified: enable with `{}` returned `session_approval_consent_required`; enable with consent as owner returned `ok`; `kirocrew app enable` on a second fresh app printed "asks to control your chats. Nothing was enabled." |
| What it covers | Every local user session, for the whole app. Not one chat. A "local user session" is a slot with user origin, a `dashboard:` session key, not a crew-member thread and not a remote executor. It never reaches another app's slot, cron or workflow tabs. Through `chat_send` it may only send a turn: it may not change the agent, persona, or run a slash command. It may also approve tool prompts (`/approve`) and answer question cards. | Inferred: `dashboard/slot_ownership.py:86-93, 444-455`, `dashboard/chat_api/chat_send.py:771-833`, `dashboard/handlers/slot_question.py:32`                                                                                                                                                           |
| How long       | Until revoked. Consent is stored once and survives disable and re-enable.                                                                                                                                                                                                                                                                                                                                                                     | Verified: disable, then enable with `{}`, returned `ok`, and `sessionApprovalConsentPending` stayed `false`.                                                                                                                                                                                          |
| How revoked    | Disable or uninstall the app, or remove the flag from the manifest. The grant is read live from the manifest and install record on every request, never cached across requests. An update that adds the flag disables the app and asks for consent again. At boot, any app whose grant predates the consent record is disabled and marked pending.                                                                                            | Inferred: `apps/permissions.py:205-238`, `dashboard/slot_ownership.py:465-474`, `apps/manager_install.py:588-635, 847-863`, `slack/gateway_runtime/service_boot.py:1108-1111`                                                                                                                         |
| Logged         | Each allowed app send into a user session is audited with `permissions.sessionApproval                                                                                                                                                                                                                                                                                                                                                        | slot=…`. Refusals are audited too.                                                                                                                                                                                                                                                                    | Inferred: `dashboard/chat_api/chat_send.py:821-827`, `dashboard/slot_ownership.py:525-526` |

## 2. Does it make a turn owner-sent for `crew=`?

No.

How a turn gets the owner mark:

```
owner's dashboard request
  -> is_owner_dashboard_request(request)   (false if the request has an app claim)
  -> _owner_sent = _person_send and that    (false for app and agent sends)
  -> turn._directive_owner_origin
  -> slot._turn_owner_sent                  (set only at turn entry)
  -> crew= arm 7 checks it
```

| Step                                                  | Source                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| An app claim makes `is_owner_dashboard_request` false | `dashboard/handlers/source_providers.py:893-902`                                                                                                                                                 |
| An app send is not a person send                      | `dashboard/chat_api/chat_send.py:506`                                                                                                                                                            |
| Owner mark for the send                               | `dashboard/chat_api/chat_send.py:605`                                                                                                                                                            |
| The only place the mark is set true                   | `dashboard/chat_turn/turn_entry.py:256`. Every other write sets it false: `dashboard/chat_delivery.py:715`, `dashboard/chat_turn/queue_cycle.py:727`, `dashboard/state_parts/slot_ladder.py:439` |
| Non-owner text steered into an owner turn clears it   | `dashboard/chat_delivery.py:705-715`                                                                                                                                                             |
| `crew=` refuses a turn without the mark               | `dashboard/handlers/remote_dispatch_routes.py:292-299`, `dashboard/handlers_instances_crew_reads.py:233-234`                                                                                     |

Live result in the test gateway (Verified), same conductor chat, opened by the
owner, remote dispatch switched on, no remote crew connected:

| Turn                                     | `session_create crew=…` result                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Owner-sent                               | `crew_unknown`: passed every authorization arm, failed only because the crew name did not exist |
| Check-in loop wake (one autonudge cycle) | `crew_owner_unverifiable`: "the running turn was not sent by the owner"                         |

An app-sent turn reaches the same arm with the mark false (Inferred, see the
chain above). So does a cron injection or a `session_send`.

Other paths checked:

| Path                               | Gives a standing owner turn?                                                                                                                                                             | Source                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A config setting                   | No. `work_ledger.remote_dispatch` only switches `crew=` on. It does not loosen arm 7. `agent.session_control` only switches session verbs off.                                           | `dashboard/handlers/remote_dispatch_routes.py:187-195, 849-863`; `config/service_sections.py:366`                  |
| App backend calling `crew=` itself | No. An app claim is refused (`app_caller`), and the session key must be in the `dashboard` namespace.                                                                                    | `dashboard/handlers/guide.py:232-235`; `dashboard/handlers/remote_dispatch_routes.py:236-240`; `constants.py:1660` |
| A cron-opened chat                 | No. A slot with `_created_by` set is refused `owner_only`, even for a turn the owner types.                                                                                              | `dashboard/handlers/remote_dispatch_routes.py:248-259`                                                             |
| A message the owner queued earlier | One turn only. A queued entry keeps the owner mark, and the drain gives the turn the mark only if every folded entry has it. It fires once, when the queue drains. Not a standing right. | `dashboard/chat_turn/queue_drain.py:984-990`                                                                       |

## 3. Can a person-owned grant let a bell wake a chat the person opened?

| Waker                                                                     | Can it start a turn in the person's chat?                                                                                     | Can that turn use `crew=`?                | How known                                                              |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| Person-owned script cron (`ctx.send_to_session`)                          | No. `not_creator`: "a scheduled run can only control sessions it created itself". `set_session_mode` is refused the same way. | n/a                                       | Verified. Source: `dashboard/handlers/_shared_route_guards.py:123-151` |
| An app's own manifest cron                                                | No. It presents the cron's credential (`cron:<id>`), not an app claim, so the same fence applies.                             | n/a                                       | Inferred: `cron_script_context.py:84-92, 382-395`                      |
| App backend holding `sessionApproval` (`POST /api/chat`)                  | Yes.                                                                                                                          | No. The turn is not owner-sent.           | Inferred: `dashboard/chat_api/chat_send.py:771-833`, plus section 2    |
| Firing the chat's own check-in loop now (`POST /api/autonudge/{id}/fire`) | Only for the owner's dashboard request. A bell has no owner token.                                                            | No (Verified for a loop wake, section 2). | Inferred: `dashboard/handlers/autonudge.py:409-430, 1410-1412`         |
| The chat's own check-in loop timer                                        | Yes, on its own schedule.                                                                                                     | No. Verified above.                       | Verified                                                               |

So the grant covers (a) only when the bell runs as an app backend with the
consent in place. It never covers (b).

## 4. Draft feature request (not filed)

**Title:** Standing, revocable owner grant: let one chat dispatch to named crews on turns the owner did not send

**Problem.** `crew=` on `session_create` / `session_send` needs the running
turn to be one the owner sent. A conductor the owner opens and leaves can wake
on its check-in loop, but on those turns it cannot place work on a remote crew.
It stalls until the owner types again.

**Ask.** A per-chat grant the owner gives from the dashboard:

- The owner opens a chat's settings and turns on "May dispatch to crews while
  I'm away", then picks one or more crews by id.
- Stored on the gateway, keyed by the session key, with the crew ids, who
  granted it and when. Not writable by agents, apps, crons or the CLI. Same
  consent rule as `sessionApproval` today.
- On a turn without the owner mark, arm 7 passes only if the calling slot holds
  the grant and the target crew is in its list. Arms 1-6 stay as they are: the
  owner's own dashboard tab, not cron- or app-opened, persistent memory, not a
  worker. A channel turn or a turn with channel text steered in stays refused.
- Revoked by the owner toggle, by closing the chat, and by removing a crew from
  the registry. Optional expiry time.
- Every use is audited with the grant id, the crew and the verb. Grant and
  revoke are audited too.

**Out of scope.** No change to what an app's `sessionApproval` can do, and no
new way for a cron or app to send owner-sent turns.

**Why this is small.** The check is one extra branch in
`owner_unverifiable_reason` (`dashboard/handlers/remote_dispatch_routes.py:326`)
plus a stored record and a settings toggle.

## 5. Wider search: every existing path, not just `sessionApproval`

Added after the first version, at the owner's request. Sources searched:
Kiro Crew's public GitHub issues and pull requests (open and closed,
`kirodotdev/KiroCrew`, read-only), its bundled docs and skills, its built-in
apps, and the 0.12.2.4 code. Same labels as above. "Fits" means it fits a
per-machine conductor that a bell cron opens on each machine.

Version note: `main` is ahead of 0.12.2.4 here. Since #31960 (merged), `crew=`
also needs the caller to be an Ultra Mode root chat (`ultra_mode_only`). That
arm is not in 0.12.2.4 (Verified: no match for `ultra_mode_only` in the
installed package). It makes `crew=` narrower, never wider.

### (a) Start or message a chat on a remote crew from a timer, cron, hook, webhook or app turn

None exists. Every path is refused.

| Path                                                                                                  | Result                                                                                                                            | How known                                                                                                                                             | Fits              |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Script cron `ctx.open_session` / `ctx.send_to_session`                                                | No `crew` argument; local only                                                                                                    | Inferred: `cron_script_context.py:196-243`                                                                                                            | No                |
| Cron, workflow, `subagent:` or `side:` session calling `crew=`                                        | `owner_only` (key is not in the `dashboard` namespace)                                                                            | Inferred: `dashboard/handlers/remote_dispatch_routes.py:236-240`                                                                                      | No                |
| A chat a cron opened, even on a turn the owner types                                                  | `owner_only` (`_created_by` set)                                                                                                  | Inferred: `dashboard/handlers/remote_dispatch_routes.py:248-259`                                                                                      | No                |
| Check-in loop or patrol wake in a person-opened chat                                                  | `crew_owner_unverifiable`                                                                                                         | Verified (section 2)                                                                                                                                  | No                |
| App backend or app agent calling `crew=`                                                              | `app_caller` / `app_scoped_caller`                                                                                                | Inferred: `dashboard/handlers/guide.py:232-235, 261-263`                                                                                              | No                |
| App or cron calling the remote-crew routes (`/api/instances/...`: proxy, `crew-turn`, `send-session`) | Owner dashboard request only; an app claim fails `is_owner_dashboard_request`                                                     | Inferred: `dashboard/handlers_instances_gate.py:116-142`, `dashboard/handlers_crew_turn.py:503-511`, `dashboard/handlers/source_providers.py:893-902` | No                |
| Inbound webhook (`/api/hooks/agent`) or `register_hook`                                               | Runs one turn in a new, temporary `hook:` session on this machine, then destroys it. Never a remote crew, never an existing chat. | Inferred: `docs/inbound-webhooks.md:5, 82-93` (bundled), `mcp_tools/control.py:299-398`                                                               | No                |
| Kiro CLI hooks, folder hooks                                                                          | Run inside a turn that is already running; add no caller rights                                                                   | Inferred: `kirocrew-hooks-and-wake-paths-2026-11-13.md` section A                                                                                     | No                |
| A message the owner queued earlier                                                                    | Runs once with the owner mark, then gone                                                                                          | Inferred: `dashboard/chat_turn/queue_drain.py:984-990`                                                                                                | No (not standing) |

What does work on a turn the owner did not send, for remote work that already
exists:

| Path                                   | What it does                                                                                                                         | How known                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `work_ledger_read` remote pull         | Reads the status of remote workers already bound to the conductor's own ledger. A background puller also does it with no model turn. | Inferred: `dashboard/handlers/remote_puller.py:1-28`; maintainer exception recorded in the remote-dispatch RFC open question 4 (#26651) |
| `work_ledger_record action=decide`     | Forwards a decision to a remote worker already bound to an item                                                                      | Inferred: `dashboard/handlers/remote_ingest.py:1201-1239`; `builtin_skills/goal-conductor/SKILL.md:665-670`                             |
| Hub placement (`work_item`, no `crew`) | Refused on a patrol wake                                                                                                             | Inferred: `dashboard/handlers/remote_placement.py:240`                                                                                  |

So a patrol turn can follow and steer remote work, but cannot start new remote
work or send a new message to a remote chat.

### (b) Wake an existing person-opened chat

| Path                                                                                                                   | Wakes it?                                                   | Turn owner-sent?                   | How known                                                                                                                                                                         | Fits                                      |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| The chat's own check-in loop (autonudge / `monitor_start`)                                                             | Yes, on its timer                                           | No                                 | Verified                                                                                                                                                                          | Yes, for local work                       |
| A worker's `done` / `blocked` / `question` / `reply` report on the chat's own ledger (local, or remote via the puller) | Yes: moves the loop's deadline forward                      | No                                 | Inferred: `conductor_wake.py:1-11, 28-34`; seen live in `kirocrew-hooks-and-wake-paths-2026-11-13.md` section D1                                                                  | Yes                                       |
| `POST /api/autonudge/{id}/fire`                                                                                        | Yes, but only from the owner's dashboard request            | No                                 | Inferred: `dashboard/handlers/autonudge.py:409-430, 1410-1412`                                                                                                                    | No (a bell has no owner token)            |
| `session_send` from another person-opened chat                                                                         | Yes. An agent in a person's own tab is not fenced for send. | No                                 | Verified: a check-in turn in one person-opened chat sent to a second person-opened chat, and the second chat started a turn on it. Rule: `mcp_dashboard_session_tools.py:889-950` | Only if a person-opened chat is the waker |
| `session_send` from a cron-opened or agent-opened chat                                                                 | No: `not_creator`                                           | n/a                                | Inferred: `dashboard/session_control_parts/caller_access.py:440-446`                                                                                                              | No                                        |
| Script cron (`ctx.send_to_session`)                                                                                    | No: `not_creator`                                           | n/a                                | Verified (section 3)                                                                                                                                                              | No                                        |
| App with `sessionApproval` (`POST /api/chat`)                                                                          | Yes                                                         | No                                 | Inferred (section 3)                                                                                                                                                              | Partly: the app backend is the bell       |
| Inbound webhook                                                                                                        | No: opens its own temporary session                         | n/a                                | Inferred (above)                                                                                                                                                                  | No                                        |
| MCP resource subscription wake                                                                                         | Not in 0.12.2.4. Open PR #24885.                            | Would be a wake, not an owner turn | Issue                                                                                                                                                                             | Later, for local work                     |

### (c) Keep a standing owner grant across turns

| Grant                                       | Lasts                                                                   | Gives owner-sent turns or `crew=`?                                                                    | How known                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Owner-set Trust on one chat                 | Across turns until the gateway exits. Crash survival is open PR #15894. | No. Only approvals. A Trust conductor's Trust is carried to its bound remote worker (#34782, merged). | Inferred: #15894 body; remote-dispatch RFC section 4            |
| App `sessionApproval`                       | Until the app is disabled, uninstalled or the flag is removed           | No                                                                                                    | Verified / Inferred (section 1)                                 |
| Agent profile permission `trust`            | Standing per agent                                                      | No. Approvals only.                                                                                   | Inferred: #15894 body                                           |
| Answering cards and tool prompts from Slack | Per card                                                                | No. A channel turn is refused `channel_caller`.                                                       | Inferred: #34822, #34474; `dashboard/handlers/guide.py:275-284` |
| Proposed per-app tool grant                 | RFC only, accepted, not built                                           | No                                                                                                    | #35966 (merged RFC)                                             |
| Proposed delegated Crew API credential      | RFC draft                                                               | Not specified                                                                                         | #26837 (open PR)                                                |

No grant in 0.12.2.4 or on `main` makes a later turn count as owner-sent.

### Issues and pull requests that already ask for part of this

Comment on these instead of filing a duplicate.

| #      | State                                   | Asks for                                                                                    | Overlap with the section 4 draft                                                                                                     |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| #36335 | Open, triaged "not on the current plan" | Per-app owner grant: an app backend and script crons may use `crew=` for sessions they open | Closest match. Covers app and cron callers. Does not cover a person-opened conductor's own patrol turns. Add the per-chat case here. |
| #25777 | Open                                    | Owner-delegated wake: a lead crewmate may wake other crewmates' sessions                    | Same shape (owner grant, scoped, audited), local only                                                                                |
| #24885 | Open PR                                 | Wake a session when an MCP resource changes                                                 | (b) only                                                                                                                             |
| #15894 | Open PR                                 | Keep owner-granted Trust across a gateway crash                                             | (c), approvals only                                                                                                                  |
| #15469 | Open PR                                 | `session_run_queued`: run one of the caller's queued messages now                           | (b), local only                                                                                                                      |
| #20225 | Open                                    | Let a webhook target a crewmate                                                             | (a) webhook path, local only                                                                                                         |
| #31960 | Merged                                  | `crew=` only from an Ultra Mode chat                                                        | Narrows `crew=`; the grant in section 4 must also require Ultra Mode                                                                 |
| #26651 | Merged                                  | Remote report pull and decide forward on non-owner turns                                    | The precedent for a non-owner-turn exception                                                                                         |

### What this means for a bell-opened per-machine conductor

It works today without `crew=`. Each machine runs its own bell cron. The bell
opens and messages only its own conductor chat on that machine, and that
conductor dispatches local workers (seen live in `kirocrew-hooks-and-wake-paths-2026-11-13.md` section D1; cron
creator fence: `dashboard/handlers/_shared_route_guards.py:123-151`). Worker
reports wake it (`conductor_wake.py`). Nothing crosses machines through Kiro
Crew, so the owner-sent rule never applies. Shared state across machines must
live outside Kiro Crew (for Avoozl, on GitHub).

What it cannot do: one machine's conductor cannot start work on another
machine. That needs #36335, or the per-chat grant in section 4.
