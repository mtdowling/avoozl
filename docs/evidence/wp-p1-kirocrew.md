# wp-p1 receipt: the `kirocrew` half

Run k4, 2026-11-19 02:22 to 03:51 UTC, on linux with node v24.22.3 and git 2.50.1. Script: `scripts/proof-wp-p1-live.mjs --executor kirocrew`. No image.

## Setup

- A throwaway Kiro Crew (kirocrew 0.12.2.4) with its own home and port, from `scripts/live-harness/harness.sh` (`AVOOZL_HARNESS_DIR=/tmp/avz-wp-p1-harness`, port 5711), running this repository's app at main.
- A scratch repository with a bare remote and `check.mjs`, and a scratch workspace with six tasks: `single`, `inv` (investigate first), `b1`, `b2` and `b3` (one batch), and `land` (a conflict lands on the base under it).
- MCP sharing for `avoozl:avoozl` was off for the whole run: the test crew's `mcp_gateway.stub_servers` never listed it.
- The workers used `wp-worker`, a copy of the stock `kirocrew-worker` agent with shell and file tools added, set as `delivery.agent` in the scratch workspace. The stock agent has no shell, so it cannot run the brief's commands (run k1). This agent lives only in the test crew's home.
- The script's `watch` acts as the person: it answers the chats' tool approval cards, chooses Go ahead when the findings wait on a person, and commits a change to `notes/land.txt` on the checkout's main once `land` reports done.

## Expected and observed

- EXPECTED (1): every task lands; the batch runs as one chat.
- OBSERVED (1): all six tasks integrated on main. `b1`, `b2` and `b3` ran in one chat (1 session, 1 expected). `land` hit one landing conflict, went back to its own chat, merged main and landed (`03c9863`).
- EXPECTED (2): the investigated task codes only after Go ahead, in the session it investigated in.
- OBSERVED (2): `inv` sent findings at 02:24 and changed nothing. A falsifier refuted one claim (medium confidence), so the findings waited on a person, who chose Go ahead. `inv` committed `notes/inv.txt` at 03:46 (`e745361`), after the Go ahead, in the same chat (`avoozl_wpk4-inv_Write_notes_inv.txt`, the only worker session for `inv`).
- EXPECTED (3): no brief names an MCP tool or a bare `avoozl`.
- OBSERVED (3): of the 5 briefs, none names an MCP tool, and none names a bare `avoozl`; every command is the quoted node path plus the CLI path.

## What the runs found and fixed

| Run | Found                                                                                               | Fix                                                                                              |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| k1  | `harnesses.falsifier` is not a role and broke the app's MCP initialize; stock workers have no shell | script stops setting it; test-crew `wp-worker` agent                                             |
| k1  | the falsifier could report only by MCP                                                              | #685: `runner report TASK done --role falsifier`                                                 |
| k2  | `inv` could not send findings: no worktree yet                                                      | #699: prepare the worktree before the findings report                                            |
| k3  | the batch split because its head was judged against its own paths only                              | #704: judge the head against every member's paths                                                |
| k3  | the landing conflict went to a person instead of the chat                                           | #709: an integration conflict goes back to the worker chat                                       |
| k4  | the quiet nudge and the Go ahead went to `inv` in one tick, and the nudge named `plans_report`      | #714: no quiet nudge before the decision on findings is sent; the nudge names the brief's report |

## Not from Avoozl

- The test crew was stopped mid-run once, when the host ran short of memory. After the restart, the `inv` chat showed as interrupted and the Go ahead sat in Kiro Crew's queue without being delivered. Acting as the person, I cancelled the queued card and sent its exact text again (03:45). Avoozl had sent it once (`sentAt` 02:56:27).
- After that restart, the script's watch committed the `notes/land.txt` change to main a second time (`85c52be`, after `land` had landed). The script now commits it once per run.

## Still open

The `process` half (`--executor process`) needs Claude Code, which this machine does not have. It runs from the owner's terminal.
