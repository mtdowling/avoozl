# Do agent hooks fire in Issue Radar crew chats?

Question: when an Issue Radar crew runs on an Avoozl-shipped agent
(`avoozl-crew`), do the agent's hooks fire? This decides whether Avoozl can
stream live per-tool events from crew chats.

**Answer: yes.** All five hook events fired in a live crew on `avoozl-crew`,
on timer turns, on a typed turn, and after the chat was reopened. This
disagrees with the "Agent list and hooks" section of
[radar-setup-from-avoozl.md](radar-setup-from-avoozl.md), where no hook ran. I
did not find out why (see "Disagreement with the earlier result").

Tested on Kiro Crew 0.12.2.4, Issue Radar 0.1.0, Avoozl `main` at `56e811c`
built with `npm run build:kirocrew-app`. Scratch repo
`mtdowling/avoozl-radar-test`, issue #40, which the crew turned into PR #41.

## Setup

- A second Kiro Crew home (own `KIROCREW_HOME` and `KIRO_HOME`, own port), with
  the built `kirocrew-app/` installed and enabled, plus Issue Radar enabled.
  The real home and its crews were not touched.
- `avoozl-crew.json` in the test copy only got a `hooks` block for
  `agentSpawn`, `userPromptSubmit`, `preToolUse` (`*`), `postToolUse` (`*`) and
  `stop`. Each hook ran a 15-line Python script that read the payload on stdin
  and appended one JSON line (event, tool, `KIRO_SESSION_ID`, payload ids, time)
  to a file. No network.
- The crew was created with `POST /api/apps/issue-radar/crews`
  (`{"name": "hooksprobe", "agent": "avoozl-crew"}`) on the owner session of the
  test gateway. Nothing was typed into it for the first two turns.
- Radar could not run `gh` itself in the test home. It refuses a binary whose
  parent directories belong to another user, and the sandbox shows `/`, `/tmp`
  and `/home` that way. The repo was added to Radar's `config.json` by hand.
  The crew ran its own `gh` from its shell and found the issue itself.

## Results

| Event | Fired? | Evidence |
|---|---|---|
| `agentSpawn` | Yes, once per chat start | Lines 0, 44, 55: first turn, first turn after a gateway restart, first turn after close and resume |
| `userPromptSubmit` | Yes, every turn | Timer nudges (`[auto-nudge cycle 1..3]`) and a typed message each have a line, with the prompt text in the payload |
| `preToolUse` | Yes, for MCP and built-in tools | `@kirocrew-core/issue_radar_crew_read`, `issue_radar_crew_record` and `shell`. 13 lines for 14 calls in turn 1: the one call that Kiro Crew's command policy blocked had no pre line |
| `postToolUse` | Yes, also for the blocked call | 14 lines for 14 calls in turn 1 |
| `stop` | Yes, after every turn | Lines 29, 39, 43, 54, 63. `stop_hook_active` was false each time |

Session id: all 64 lines carry the same `session_id`, and it equals
`acp_session_id` and `KIRO_SESSION_ID` in each hook's environment. `session_key`
is `dashboard:crew-<crew id>` on every line (`dashboard:crew-c_b8b65e80`), so
Avoozl can map a line to a Radar crew without asking Kiro Crew. The id stayed
the same across the restart and across close and resume.

Payload keys seen:

| Event | Keys |
|---|---|
| `agentSpawn` | `acp_session_id`, `cwd`, `hook_event_name`, `session_id`, `session_key` |
| `userPromptSubmit` | the above plus `prompt` |
| `preToolUse` | the first set plus `tool_name`, `tool_input`, `tool_tags` |
| `postToolUse` | the first set plus `tool_name`, `tool_response`, `tool_tags` |
| `stop` | the first set plus `assistant_response`, `assistant_text`, `stop_hook_active`, `hook_continuation_count` |

## Timer turns, typed turns, reopen

| Case | Fired? | Evidence |
|---|---|---|
| Timer turn, no person typing (cycle 1, 2 and 3) | Yes, all five events | The crew's own idle loop (300 s) sent `[auto-nudge cycle N]`. Cycle 1 has `agentSpawn`, `userPromptSubmit`, 13 tool lines, `stop`. Cycle 2 has no `agentSpawn` because the chat was already open |
| Typed turn from the dashboard API | Yes | `userPromptSubmit`, `preToolUse`, `postToolUse` for `shell`, `stop` |
| Reopened by Radar after a gateway restart | Yes | Restart at 22:07:58. The next timer turn (cycle 3, 22:10:38) got a fresh `agentSpawn`, then all other events |
| Closed with the tab's close (DELETE on the slot), then resumed | Yes | Closing paused the crew (`paused_reason` "session closed"). Resuming it made Radar arm a new loop. Its first timer turn (cycle 1, 22:18) fired all five events with the same session id |

The crew's first timer turn started about 5 minutes after create, not at once.
Radar arms the loop with a 300 s idle gap, and nothing sends a first message.

## Latency

Tool call to `preToolUse` line: 0.21 to 0.33 s for the first 11 calls, matching
the tool's chat timestamp to the hook line's clock. The typed turn was 0.28 s.
The later calls in turn 1 cannot be paired one to one because of the blocked
call, so no figure is given for them. Timer nudge to `userPromptSubmit`: 0.34 s
on cycle 2, 6.8 s on cycle 1 (the chat had to start). `postToolUse` follows
the tool's end by under a second in these runs. The hook script is a short
Python start, so a hook that sends over the network will add its own time. Hooks
run one after another with the turn, so a slow hook slows the turn (not
measured here).

## Disagreement with the earlier result

[radar-setup-from-avoozl.md](radar-setup-from-avoozl.md) says no spec hook fires
because the `capabilities.script_hooks` gate is pinned off. In this run the
same Kiro Crew build ran the hooks for a crew chat. The earlier test used three
events (`agentSpawn`, `preToolUse`, `stop`) and I did not see its hook command.
I did not find the cause and did not test the gate directly, so treat the
earlier section as not reproduced rather than disproved. The hook lines here
come from this run.

## What this means for a live event stream

- A hook in `avoozl-crew.json` can stream per-tool events from a crew chat.
  `session_key` identifies the crew, and `session_id` identifies the chat.
- Hooks fire in the chat's own turns, so they work with nobody present.
- Not every call has a `preToolUse` line. A call refused by Kiro Crew's command
  policy only has `postToolUse`. A stream should treat `postToolUse` as the
  record of a call and `preToolUse` as optional.
- A crew must be created on `avoozl-crew` from the start. An existing crew does
  not move agents when edited (see the earlier doc).
- Tool inputs and responses are in the payloads. A stream that leaves the
  machine must decide what to cut first, since commands and file text can hold
  secrets.

## Not checked

- Whether a hook that exits non-zero or times out changes a crew turn (the
  earlier hooks research covers worker chats).
- Hooks in a crew chat that ran as a different Radar crew, or two crews at once.
- A crew picked up through Radar's own issue sync. Radar could not run `gh`
  here, so the crew found the issue with its own shell.
- Any network hook, and the Kinesis stream itself.
- Windows and macOS. Only Linux was run.

Cleanup: the crew was retired and the test gateway stopped. The scratch repo
has the crew's PR #41 (merged) and issue #40. The test hook file and the
modified agent copy were never added to this repository.
