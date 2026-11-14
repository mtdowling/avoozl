# Kiro Crew Bot heartbeats: can one drive remote work while nobody is there?

Date: 2026-11-13. Kiro Crew 0.12.2.4.

Claim checked: "Crew Bots wake themselves on scheduled heartbeats, decide what
to work on next, and delegate new work. Ultra Mode / Crew Mode conductors don't
have that loop."

Goal behind it: Avoozl runs from Crew Mode, and remote-crew tasks show on the
driver's board, while nobody is sending turns.

## Short answer

A Bot heartbeat is a real standing wake. It keeps running with nobody there,
across a gateway restart and a conversation reset. It can open and bind
**local** workers.

It cannot reach a remote crew. The heartbeat turn is not a turn the owner
sent, and a Bot's own thread is refused for `crew=` by two more rules that a
fix to the first would not lift. So a Bot does not make "remote work with
nobody present, shown on the driver's board" possible today.

Two parts of the claim are wrong or half right:

- Conductors do have a wake loop (a monitor loop). It is armed by the person,
  capped, and it stops being a standing wake. The heartbeat is the standing
  one.
- "Delegate new work" is true for local workers only.

## Labels

- **Verified**: run in an isolated gateway started for this check, with its own
  `KIROCREW_HOME`, its own `KIRO_HOME`, its own port, no tunnel, and every
  inherited `KIROCREW_*` variable removed (the inherited `KIROCREW_BOUND_PORT`
  made an earlier probe's tool calls dial the main gateway). The main crew's
  home was never touched, and no Bot was created or changed there.
- **Inferred**: read in the 0.12.2.4 source (paths under `kiro_crew/`), the
  bundled docs, or the public GitHub issues.

Test setup, so the Verified rows can be repeated:

- One Bot created with `kirocrew agent create`, a goal set and the Heartbeat
  switched on through the owner's goal routes, as a person would on the Bot's
  Goals tab.
- The gateway ran with `--approval yolo`, so no tool call waited for a person.
- The Heartbeat's cron expression was changed from every 30 minutes to every
  minute by editing the isolated home's cron store while the gateway was
  stopped. The product floor is 30 minutes. Everything below that depends on
  timing was therefore seen at 1-minute spacing.
- `work_ledger.remote_dispatch` was turned on. No remote crew was connected, so
  nothing was ever sent to one.
- Earlier research in this folder covers what a conductor can and cannot do.
  Read `kirocrew-session-approval-2026-11-13.md` and
  `kirocrew-hooks-and-wake-paths-2026-11-13.md` first. This note does not repeat
  them.

## 1. What is a Bot heartbeat?

| Question                                                    | Answer                                                                                                                                                                                                                                                                                                                                    | How known                                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is it?                                                 | One of four per-Bot check-ins (Daily, Weekly, Monthly, Heartbeat). Off by default. Only available once the Bot has a goal. Only the owner's route or a card the owner presses can turn it on; the Bot cannot.                                                                                                                             | Inferred: `member_goals.py:126`, `dashboard/goal_reminder.py:48-52`; docs `crew-members.md:253-262`                                                     |
| How is it scheduled?                                        | A gateway-owned cron job per Bot, keyed `goal-heartbeat:<slug>`, in the same cron store as any cron. Intervals: 30, 60 (default), 120 or 240 minutes, on clock marks (`*/30`, `0 *`, `0 */2`, `0 */4`).                                                                                                                                   | Verified (job created in the cron store with `*/30 * * * *` when the switch was turned on); `member_goals.py:133`, `dashboard/goal_reminder.py:73, 116` |
| Where is it configured?                                     | The Bot's Goals tab, or `PUT /api/members/<slug>/goals/schedules` with `heartbeat` and `interval`. The job is hidden from `cron list` and the Schedule page.                                                                                                                                                                              | Verified (route); Inferred (hidden): `dashboard/goal_reminder.py:98-110`; public issue #34363                                                           |
| What kind of turn is it?                                    | A hidden, gateway-authored turn in the Bot's own standing thread. `_turn_actor="gateway"`. It is not a user turn (`_turn_user_sent` stays false) and not an owner turn (`_turn_owner_sent` is false). It is not a cron-slot turn, so the "unattended cron caller" refusals do not apply to it.                                            | Inferred: `dashboard/mate_welcome.py:365-411` (405), `dashboard/chat_turn/turn_entry.py:248-256`; Verified in effect (rows 2 and 3)                     |
| What does the prompt ask?                                   | Look at goals, milestones and open work-ledger items. Move forward what you can. Hand long work to a worker with `session_create` and `session_send`. Record it on the ledger and the Dashboard tab. End with `nothing_to_do` unless the person would lose something by not hearing now. Steps that cannot be undone wait for the person. | Inferred: `dashboard/goal_reminder.py:521-610`                                                                                                          |
| How does it differ from a conductor's `monitor_start` loop? | See the table below.                                                                                                                                                                                                                                                                                                                      | Verified and Inferred, per row                                                                                                                          |

Heartbeat against a conductor's monitor loop:

|                           | Bot heartbeat                                                    | Conductor monitor loop (`monitor_start`)                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Armed by                  | The owner, once, on the Goals tab.                               | The chat itself, in a turn the person sent.                                                                                                                                   |
| Armed from a hidden turn  | n/a                                                              | Refused: "this turn was started by something other than the user" (Verified in a heartbeat wake).                                                                             |
| Timer                     | Cron store, clock marks, 30 minutes at the fastest.              | Seconds between wakes, set per loop.                                                                                                                                          |
| Cap                       | None.                                                            | 24 cycles by default when the agent arms it. Runtime budget bounded by `monitoring.max_runtime_secs` (7 days default, 30 days most). Inferred: `docs/monitor-loops.md:35-50`. |
| Survives a restart        | Yes (row 4).                                                     | Reads time since `created_ts` on restart; ends when the budget is spent. Inferred: `docs/monitor-loops.md:40-50`.                                                             |
| Runs while the other runs | A wake is skipped while a monitor loop is running in the thread. | n/a                                                                                                                                                                           |

The last row matters. After a Bot dispatches work, the gateway arms a patrol
loop on the Bot's thread by itself (idle 600 s, up to 300 cycles, up to 86400 s
of runtime). While it runs, every heartbeat is skipped with the run-log line
"skipped: a monitor loop is running". Verified: twice, a goal edit made the Bot
open a research worker, the gateway armed a patrol loop, and every wake after it
was skipped until the loop was deleted by hand. The first time, the Bot ended
its loop itself with `autonudge_stop` (a request, not a confirmation) and wakes
resumed. Nothing made it do so the other two times. Other skip lines seen: "skipped: the Bot is busy". Inferred, same file:
"skipped: the gateway is stopping", "skipped: the Bot's thread is not open"
(`dashboard/goal_reminder.py:650-667, 714-808, 819-836`).

## 2. Does a heartbeat turn pass the `crew=` gate?

No. Is there a Bot-only path? No.

`session_create(crew=)` and `session_send(crew=)` run `authorize_remote_dispatch`
(`dashboard/handlers/remote_dispatch_routes.py:198-304`). It has seven arms.
Three of them refuse a Bot's heartbeat turn, each on its own:

| Arm | Rule                                                                              | Heartbeat turn                               | How known                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3   | The slot is not "a crew member's own thread" and was not opened for someone else. | Refused: the Bot's thread has mode `member`. | Verified: the heartbeat's `session_create(crew="peer")` returned "crew= is open only to the owner's own tab, not a session opened for someone else". Source: `remote_dispatch_routes.py:248-259` |
| 4   | The session is not bound to a private member memory store.                        | Refused: every Bot has its own store.        | Inferred: `remote_dispatch_routes.py:268-278`                                                                                                                                                    |
| 7   | The running turn was sent by the owner (`_turn_owner_sent`).                      | Refused: the gateway turn declares no owner. | Inferred: `remote_dispatch_routes.py:292-304`, `turn_entry.py:256`                                                                                                                               |

Control, so the Verified refusal is not an artifact of the setup: the same
`crew="peer"` call from a Crew Mode conductor chat, in a turn the owner sent,
got past every arm and failed only at the last step: "no connected crew has that
id or name".

Other candidate paths, all closed:

| Path                                   | Result                                                                 | How known                                                        |
| -------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `work_dispatch`                        | Has no `crew` field. Always local. Verified: it opened a local worker. | Verified; `mcp_dashboard_session_tools.py:700-760`               |
| Hub placement (`work_item`, no `crew`) | Same `authorize_remote_dispatch` call.                                 | Inferred (earlier research, `remote_dispatch_routes.py:869-877`) |
| `agent="<bot>"` on a local create      | A plain session on the Bot's memory store and template. Not remote.    | Verified (below, row 5)                                          |
| A Bot's thread on a remote executor    | The heartbeat skips it.                                                | Inferred: `dashboard/goal_reminder.py:650-667`                   |
| `work_ledger.remote_dispatch`          | A global switch. Every arm still runs.                                 | Inferred: `remote_dispatch.py:28-39`                             |

If the owner-sent arm alone were relaxed, arms 3 and 4 would still refuse. A
Bot-specific grant would have to change all three.

## 3. Can a heartbeat turn dispatch local workers, bind items, read `work_brief`?

| Question                   | Answer                                                                                                                                                                                                                       | How known                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open a local worker        | Yes. The wake called `work_ledger_record` (goal), then `work_dispatch` with the `kirocrew-worker` agent: "created, opened, bound, and seeded". The session is a `kirocrew-mate-worker` session with the Bot as creator.      | Verified; `members_parts/member_sessions.py:209`, `dashboard/session_control_parts/session_create.py:236-251` (a Bot thread passes without `agent.session_control`) |
| Bind an item               | Yes, same call.                                                                                                                                                                                                              | Verified                                                                                                                                                            |
| Finish the loop            | Yes. The worker wrote its file and reported. A later turn ran the acceptance check, recorded the verdict and closed the item.                                                                                                | Verified                                                                                                                                                            |
| Tools it has               | The Bot's own chat runs `kirocrew-mate-conductor`: the dashboard session tools, the work ledger (`work_ledger_read`, `work_ledger_record`, `work_brief`), `kirocrew-mate`, no sub-agent, `task_run` or `workflow_run` tools. | Inferred: `agent_materialization/service_agents.py:133-185`; Verified in the materialized spec                                                                      |
| `work_brief`               | Answers `not_bound`. A Bot's thread is not a worker a parent dispatched, so there is no parent decision to read.                                                                                                             | Verified (reply written to a file)                                                                                                                                  |
| Read a parent's `decision` | Not possible for the heartbeat thread. A parent binds an item to a session it created, and it did not create the Bot's standing thread.                                                                                      | Inferred: `remote_ingest.py:134-` (`create_bound`), `caller_access.py:440-446`                                                                                      |
| Start a monitor loop       | Refused in the wake (see section 1).                                                                                                                                                                                         | Verified                                                                                                                                                            |
| Tool approvals             | The test gateway ran with approvals off. In normal mode an unattended wake that needs an approval waits and is rejected after 180 s (earlier research).                                                                      | Not rechecked for Bots                                                                                                                                              |

## 4. Does it stop when idle, after a reset, or after a restart?

| Case                        | Result                                                                                                                                                                                           | How known                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Bot idle                    | No stop. Every tick with nothing to do still starts a model turn that ends in `nothing_to_do`. Cron auto-pause fires only on a run of failures.                                                  | Verified (wakes at 1-minute spacing for the whole test); Inferred: `cron_service/settlement.py:99-105`           |
| `reset_conversation`        | The tool is a user-surface directive, so it is refused inside a heartbeat turn. The owner's "fresh start" clears the context on the same thread and slot key. Heartbeats kept starting after it. | Verified (fresh start); Inferred: `directive_origin.py:17`, `dashboard/handlers/members_thread_turns.py:109-125` |
| Gateway restart             | Survives. The cron job is persisted. On the first wake after the restart, the Bot's thread was loaded from its transcript with no dashboard open, and the turn ran.                              | Verified; `dashboard/goal_reminder.py:669-711`                                                                   |
| Gateway down or host asleep | No wake while it is down. Whether missed ticks run as a backlog afterward was not checked. Public issues #35019 and #36919 ask for active hours and no backlog after sleep.                      | Not checked; issues open                                                                                         |
| Thread closed               | Reopened from its transcript.                                                                                                                                                                    | Inferred: `dashboard/goal_reminder.py:669-711`                                                                   |
| Thread busy                 | Skipped, not queued: "skipped: the Bot is busy".                                                                                                                                                 | Verified                                                                                                         |
| Monitor loop running        | Skipped. See section 1.                                                                                                                                                                          | Verified                                                                                                         |

This is the opposite of the remote foreman conductor in the earlier probe,
whose loop went quiet after an idle turn plus `reset_conversation`.

## 5. Can a Bot be the remote foreman and keep heartbeating on the crew?

Not as such. Nothing here could be run end to end, because no remote crew was
connected, so this section is mostly Inferred.

- The dispatch has to start from an owner-sent turn in a conductor chat, not
  from a Bot (section 2). That part is a person present.
- `session_create(crew=, agent=<bot>)` makes an ordinary session on that crew.
  The local equivalent was Verified: `session_create(agent="hb")` from a
  conductor gave a session running on the Bot's memory store and template,
  mode not `member`, and no heartbeat turn ever entered it.
- A heartbeat belongs to the Bot's standing thread, found through the Bot's
  stored thread binding (`dashboard/goal_reminder.py:714-740`). It runs in the
  cron store of the gateway that owns the Bot. A Bot on a remote crew heartbeats
  there only if someone created it there, gave it a goal and turned the switch
  on, on that crew's own dashboard.
- A session another gateway's conductor opens with `work_item` is bound to an
  item, so it counts as a worker and cannot dispatch onward
  (`remote_dispatch_routes.py:278-291`, `remote_ingest.py:1-30`). Dispatch stays
  one level deep.
- Reports reach the parent's ledger only from such a bound worker session, by
  pull: `work_ledger_read` (or the background puller) reads the peer's copy of
  the item (`remote_ingest.py:ingest_board`, `remote_puller.py:1-28`). A
  Bot's heartbeat thread is not bound to the parent's item, so its work is not
  reported there.
- The docs list the Bot and the remote crew as two different things. A Bot is
  "Not a machine" (`docs/remote-crew.md:245`).

## 6. Model-turn cost per idle hour

Measured on the isolated gateway, credits as the gateway's usage log records
them. Three wakes that did nothing but end with `nothing_to_do`:

| Wake | Credits | Context          | Time  |
| ---- | ------- | ---------------- | ----- |
| 1    | 0.93    | about 13k tokens | 8.7 s |
| 2    | 0.83    | about 13.7k      | 7.2 s |
| 3    | 0.85    | about 14.1k      | 7.5 s |

Each is one model turn of three or four model calls (load the tool schema, call
`nothing_to_do`, sometimes a no-op shell call). Mean about 0.87 credits.

| Interval             | Wakes per idle hour | Credits per idle hour | Per day  |
| -------------------- | ------------------- | --------------------- | -------- |
| 30 minutes           | 2                   | about 1.7             | about 42 |
| 60 minutes (default) | 1                   | about 0.9             | about 21 |
| 120 minutes          | 0.5                 | about 0.4             | about 10 |
| 240 minutes          | 0.25                | about 0.2             | about 5  |

Other costs seen: a wake that wrote one log line cost 0.63-0.98. A wake that
dispatched and then closed a worker cost 2.2-3.0, plus the worker's own turns
(0.3-0.4 each). Context grew about 0.5k tokens per wake until the owner cleared
it. A background memory-consolidation turn added about 0.1 each time it ran (three
times in about 25 turns). Three samples is not a distribution: treat the table as the right order
of magnitude. The docs say only "Each run uses credits" (`crew-members.md:262`).

## 7. Is the claim true of Kiro's docs?

Partly. The docs support the Bot half and say nothing of "decides what to work
on next" beyond the heartbeat bullet. They do not say conductors lack a loop.

| Claim part                         | Docs                                                                                                                                 | Verdict                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Bots wake themselves on a schedule | "While it is on, the Bot wakes in its own chat every 30 minutes, hour (the default), 2 hours or 4 hours" (`crew-members.md:255-257`) | True                                                                                               |
| Decide what to work on next        | "looks for what it can move forward toward its goals, and does it" (`crew-members.md:257-258`)                                       | True                                                                                               |
| Delegate new work                  | "A Bot hands longer work to a worker from its own thread: a session it opens with `session_create`" (`crew-members.md:203-205`)      | True for local workers; the docs do not mention remote crews for Bots                              |
| Quiet by default                   | "It works quietly" and writes in the chat only for a decision, a finished job or something urgent (`crew-members.md:258-261`)        | True (Verified: a person-visible reply appeared only on goal-setup turns, not on wakes)            |
| Skipped when busy or looping       | "A wake is skipped while the chat is busy or a monitor loop is running in it" (`crew-members.md:262`)                                | True (Verified)                                                                                    |
| Costs                              | "Each run uses credits" (`crew-members.md:262`)                                                                                      | True                                                                                               |
| Conductors don't have that loop    | `docs/monitor-loops.md:5`: "the session wakes itself on an interval"                                                                 | Half true. Conductors have a loop. It is armed by the person, capped, and not a standing schedule. |
| A Bot is not a remote machine      | `docs/remote-crew.md:245` calls a Bot an assistant "Not a machine"                                                                   | Matches the finding                                                                                |

## Verdict and smallest setup

Does a Bot make "remote work with nobody present, shown on the driver's board"
possible today? **No.**

- The wake is real and standing. The remote half is closed by three separate
  rules (sections 2 and 5), and the one that bites in practice is not the
  owner-sent check.
- A Bot gives you a standing local driver on **each machine**. That already works.

Smallest setup that gets close, using only what is verified:

1. On each machine that should work with nobody present, create one Bot
   (`kirocrew agent create`), give it a goal that says "run Avoozl's tick for the
   plans repo", and turn its Heartbeat on in that machine's own dashboard. Set
   the interval to 30 minutes (the floor).
2. Put that Bot's chat in a mode that does not stop for approvals, or its
   dispatches wait and are rejected after 180 s. This is a person's choice, not
   something the Bot may set for itself.
3. Let each Bot dispatch **local** workers with `work_dispatch`. Work spreads
   across machines because each machine has its own Bot, not because one
   conductor reaches out.
4. Show it on the driver's board through GitHub, not through the Crew ledger.
   Each Bot's workers write issues, branches and pull requests, and the board
   reads those. The Crew ledger on the driver's machine will not list work a
   remote Bot started.
5. Stop patrol loops from hiding the heartbeat: end each wake without leaving a
   monitor loop armed, and check the Bot's run log for "skipped: a monitor loop
   is running". The gateway arms a patrol loop itself after a dispatch.

What this does not give you: one conductor that sends work to a remote crew
while the owner is away; a heartbeat faster than 30 minutes; the work showing
in the driver's Crew ledger; one place to see every Bot's wakes (the cron job is
hidden from the Schedule page; issue #34363).

What would change the answer: a per-Bot (or per-app) standing owner grant for
`crew=` that also lifts arms 3 and 4. Closest open request is #36335, which asks
for an app or cron grant. Nothing for a Bot's heartbeat is filed. #35035 asks
for a front-desk Bot that routes to scoped background Bots; it does not mention
remote crews either.

## Not checked

- Any call to a real remote crew. None was connected. Section 5 is Inferred.
- A Bot as the bound worker of a parent's remote item, and the parent's
  ledger receiving its reports.
- A heartbeat at its real 30-minute spacing, and a wake in normal approval
  mode with nobody present.
- Cost in money. Credits only, three samples, and one model.
- Arms 4 and 7 of the `crew=` gate on a heartbeat turn. Arm 3 refused first, so
  they were never reached.
- Kiro Crew `main`: it is ahead of 0.12.2.4. Since #31960, `crew=` also needs an
  Ultra Mode root chat, which only narrows it.
