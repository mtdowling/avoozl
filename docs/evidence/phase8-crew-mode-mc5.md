# Task 8.3: Crew Mode dispatch and MC-5

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 8,
task 8.3: "Crew Mode dispatch if Kiro Crew provides MC-5; otherwise apply its
kill criterion" (design §7.1, §14).

- Recorded: 2026-11-12, from source, not from docs.
- Avoozl: `kirocrew-native` at `d0f6b36` plus this task's commits.
- Kiro Crew checkout `<kiro-crew-checkout>`, read with `git show`
  and `git grep`, nothing built or changed:
  - `origin/main` at `7a7f070afc` (2026-11-12 21:42 UTC; local `main` is
    262 commits behind it at `c6b537e49`)
  - `mc2-cron-session-status` at `8ea150ee9`
  - `cron-session-served-model` at `a3bd3be3a`

## Verdict

**Kiro Crew does not provide MC-5. The kill criterion for Crew Mode dispatch
does not hold, so Crew Mode dispatch stays as built in task 2.14, with its
§7.1 interim.** Nothing new was built for MC-5.

## What MC-5 asks for

§7.1: "Read a Crew Mode work-ledger item's session binding from an app."
The interim is that the conductor reports each item's session ID to Avoozl
(`avoozl claim TASK --slot WORKER`, task 2.14), which relies on the conductor
following the runner steering.

## What Kiro Crew offers an app, by surface

| Surface an app has                                                     | What it reads                                                                                                                                                                                     | Work-ledger items?                                                                                                                                                                                        | Source                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Script cron `ctx`                                                      | `list_session_folders`, `create_session_folder`, `open_session`, `send_to_session`, `set_session_mode`, `crew_log_append`, `call_tool`, `notify`; on the two local branches also `session_status` | No                                                                                                                                                                                                        | `src/kiro_crew/cron_script_context.py` on all three refs                                                                                                                                        |
| `ctx.session_status()` (local branches only)                           | `GET /api/chat/cron-sessions`: "Only slots this job created are listed, live or persisted; no other session is."                                                                                  | No: a conductor's workers are not slots the cron created                                                                                                                                                  | `cron_script_context.py` on `mc2-cron-session-status`, `cron-session-served-model`; commit `8ea150ee9` touches no work-ledger file                                                              |
| `/api/work-ledger` (read, record, brief, report, rebuild, accept-eval) | The caller's own ledger, resolved from the calling session's identity (`X-Session-Key`), "never from the request body"                                                                            | Only for the conductor session that owns it, or the worker bound to one item                                                                                                                              | `dashboard/handlers/work_ledger.py` (module doc), `work_ledger_read.py` `api_work_ledger_get` (`_caller_key`, `_own_ledger`); MCP-only, listed in `server_internal_paths.py` `/api/work-ledger` |
| `/api/crew-board?conductor=KEY`                                        | A conductor's board, masked                                                                                                                                                                       | Refused to apps: `require_owner_dashboard_request` runs first, with the comment "a non-owner dashboard token (a member, an app) could name any conductor key and read its goal, items and worker reports" | `dashboard/handlers/work_ledger_board.py` `api_work_ledger_board`, same on all three refs                                                                                                       |

The two local branches' own commits (`8ea150ee9`, `a3bd3be3a`) add only the
cron's session status and served model. Their other differences from
`origin/main` are the 0.12.1 hotfix line, which adds no app-facing ledger read.

## The kill criterion, as written

§14: "Crew Mode dispatch — Proof P2b fails twice, or conductors skip reporting
session bindings in real use."

| Condition                                              | Evidence                                                                                                                                                                                                                                                                                                                     | Holds?                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| P2b fails twice                                        | `docs/evidence/proof-p2b.md`: PASS on the first run, no repair or retry                                                                                                                                                                                                                                                      | No                    |
| Conductors skip reporting session bindings in real use | Searching `.avoozl.json` files under `~/projects` and `$TMPDIR` finds one with `"runner": "crew-mode"`: the P2b profile (`$TMPDIR/kc-p2b/workspace/.avoozl.json`). In P2b every worker has a structured `session_bindings` row with `source: conductor`; none was skipped. No real use outside the proof was found | No (not yet observed) |

So the feature stays. The second condition can still be met later, and the
code makes a skip visible rather than silent: a worker whose conductor never
claimed its task cannot record a result (`reportSession` refuses it with 403,
"Only the session bound to this task may report on it"), and the task stays
in `next`'s ready list. The new test
`src/app/test/kirocrew-runner.test.mjs` "a worker whose conductor skipped the
claim cannot report, and its task stays ready" checks both.

## Left for 8.4 and later

- 8.4 reviews every §14 criterion; this receipt is the input for the Crew Mode
  row.
- If Kiro Crew later lets an app read a ledger item's worker session (for
  example a scoped read of `/api/crew-board` for the app that owns the
  conductor's steering), the claim can be checked against Kiro Crew's own
  binding instead of trusted.
- Comment-mention steering (task 8.2) reaches only sessions the tick opened
  for the same reason: the cron can message only its own slots.
