# P39 live: pull the Andon cord

Proof P39 (Requirement 64, design §4.11), also `an-4.2`, run on 2026-11-19
from 03:55 to 04:44 UTC on the throwaway P50 test Kiro Crew (0.12.2.4, port
5698, its own home), at Avoozl `9eb4a720` plus the fixes below. A first try
on the P60 test crew (port 5700) was dropped: its chats could not start (Kiro
Crew's managed MCP servers timed out after 90 s), so no worker ran there.

Every page step was a headless Chrome click by the proof chat, signed in with
the test crew's saved cookie. Agent steps were a test-crew chat with the
default agent calling the Avoozl MCP tools. The chat's tool cards were
approved by a script, as the person at that dashboard would. Screenshots
were checked, not kept in git.

**Verdict: pass, with one gap noted below (Flow lists no stops). P39 is
ticked.**

## Setup

- Workspace `p39b` in the test crew's catalog, folder
  `p3943-run/p39/ws`. Two scratch repositories with bare remotes, `r1` and
  `r2`, each with the check `node check.mjs` and `landing: "direct"`.
- An approved spec `s1` (installed approved, as P57's and P59's) with
  `p39-a1` and `p39-a2` (`a2` requires `a1`) in `r1` and `p39-b1` in `r2`.
- A content rule set `names` banning `secretword`.
- A scope-`all` pulled stop, `setup hold`, so nothing started before the
  person's own pull. The person resumed it from the banner in step 1.

## Expected, item by item

| #   | Expected | Seen | Pass |
| --- | --- | --- | --- |
| 1   | `a1` and `a2` not dispatched, `b1` is, a running session untouched; the banner shows who, when, scope and `bad base` | Pulled from the Delivery heading's Stop the line icon: scope One task, task `p39-a1`, reason `bad base`. Resume on the `setup hold` banner row, then the tick dispatched only `p39-b1`, which landed (`d619c87 Land p39-b1`). Banner: "Line stopped by dashboard: bad base. Scope: task p39-a1 and its dependents. 2 tasks paused. Pulled by dashboard, just now. Only a person can resume it." | yes |
| 2   | Each bad pull refused by field; the unknown repository named; the rule named without the text; nothing recorded | Through the page's command route: empty reason 400 "Give a reason…"; two lines 400 "Keep the reason to one line."; 201 characters 400; `r9` 404 "Repository r9 was not found."; `secretword here` 422 "…names rule codename at flow-stop line 1…", no matched text. Stop count unchanged. | yes |
| 3   | The stop names the session; `b1`'s repository waits; the owner is notified once | The agent chat called `plans_session` `stop_line` (scope repo, `r2`). The stop's `by` is `{kind: agent, name: session:dashboard:p39_agent_pull}`; the banner shows it with 2 tasks paused; one notification "Line stopped by session:dashboard:p39_agent_pull: worker found a broken base in r2". | yes |
| 4   | Both pulled stops stay open when the check passes and the fix integrates | A commit on `r2`'s local `main` made the check fail: an automatic stop opened with fix task `line.fix-1`. Removing the file made the check pass: the automatic stop closed after 3 min. Both pulled stops stayed open. | yes |
| 5   | Resume from an agent session and the app token refused with 403 | The agent chat looked through every `plans_*` tool and found no resume action (`flow.resume` is person-only in `mcp-policy.mjs`; an MCP call gets 403). App token: not reachable from a chat; `principalAllows` lets an app token only observe (unit-tested). | yes |
| 6   | Run anyway on a pulled stop and Resume on an automatic stop refused | 409 "A pulled stop resumes with Resume, not Run anyway." and 409 "This is an automatic stop: it resumes when its check passes, or use Run anyway." | yes |
| 7   | Owner's Resume on each pulled stop resumes dispatch there; each stop records who | Resume on each banner row, with its confirm. `resumedBy` `Michael Dowling` on both. The tick then dispatched `p39-a1`; it landed (`63514ae`), and `p39-a2` followed (`61b7805`). | yes |
| 8   | Both pulls listed and counted with a time to fix; the retro sees scope and reason; the CLI pulls and resumes the same way | `flow.view` lists all four stops with `timeToFixMs` (pulled 20 and 26 min, automatic 3 min); the Flow page shows Time to fix 20 m. The retro brief's `lineStops` holds each pulled stop's scope and reason. `avoozl flow stop --scope repo --repository r1 --reason "cli pull"` and `avoozl flow resume <id>` worked, by `cli`. | yes, see gap |

## Bugs found and fixed in this change

| Bug | Fix |
| --- | --- |
| A person's pull and resume were stored as by `dashboard`, while the activity row named the person. | `flow.stop`, `flow.resume`, Run anyway and the other `by` fields take the signed-in operator's name (`operations.mjs`). |
| A repository stop's activity row said "for repository undefined". | `activity-log.mjs` reads the stop's `projectId` and `planId`. |
| The line watch never started on a `direct` landing repository: a direct landing writes no `integration` row, so no head counted as first green. | `integratedHead` also takes an integrated delivery at that head (`flow-line.mjs`), with a test. |
| A Kiro Crew worker that reported done keeps its last read status, `working`, so every landed task showed Running. | `liveSessions` uses `liveAttempt`, which ends an attempt at its done or blocked report (`page-views.mjs`), with a test. |

## Gap, not fixed here

- R64.11 says each pull is listed in Flow with the automatic stops. The data
  is in `flow.view`, and Time to fix counts it, but the Flow page draws no
  list of stops. A page change needs the owner's screenshot review.
- The Delivery icon, when the line is stopped, resumes every open stop at
  once after one confirm. The banner resumes one stop at a time.

## Not checked

- The App token call itself (a chat cannot mint one).
- Stop all agents (R64.12): not part of P39.
