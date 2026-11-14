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
