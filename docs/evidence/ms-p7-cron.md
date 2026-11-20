# ms-p7 receipt: the cron on a throwaway Kiro Crew

Run 3, 2026-11-20 11:20 to 11:35 UTC, on linux with node v24.22.3 and git 2.50.1. Script: `scripts/proofs/proof-ms-p7-live.mjs` (`setup`, then `watch`). No image.

## Setup

- A throwaway Kiro Crew (kirocrew 0.12.2.4) with its own home and port, from `scripts/dev/live-harness.sh` (`AVOOZL_HARNESS_DIR=/tmp/avz-wp-p1-harness`, port 5711), running this repository's app at `1fdc2471`.
- The test crew's `avoozl/avoozl-tick` cron (`4f4e7fc9`) runs the app's `crons/tick.py` every 60 seconds.
- A scratch repository with a bare remote and `check.mjs`, and a scratch workspace with one `kirocrew` task, `msp7-1`, in the spec `msp7-notes`. The task investigates first (`investigate: {mode: "all", minConfidence: "high"}`).
- The machine server owned the scratch workspace's loop. Its `tick.log` shows `"tick":"ran"` for the workspace once a minute through the run.
- The worker used `wp-worker`, the test-crew agent from the wp-p1 receipt.
- The script's `watch` acts as the person. It approves the spec, answers the chats' tool approval cards, and restarts the test crew's gateway once the worker chat is open.

## Expected and observed

- EXPECTED (1): the chat opens, gets the message and keeps trust mode.
- OBSERVED (1): the cron opened `avoozl_msp7-1_Write_notes_beta.txt` at 11:25:54 with the task's brief. The script restarted the gateway at 11:26:06; it was back at 11:26:36. The worker sent its findings, and a falsifier found they stand (high confidence), so the tick released the Go ahead. The cron sent it (`send:0288b99c…`, state `sent`), and the chat received it. After the restart the slot read `trust: true`. Every worker tool call after the restart ran without an approval card. The falsifier chat had no trust mode and raised the only 2 cards.
- EXPECTED (2): the cron history shows only open, send and trust calls.
- OBSERVED (2): all 20 cron runs from 11:14:52 to 11:33:52 ended `success`, with an empty summary and no error, in 2154 to 2325 ms. Kiro Crew's run detail keeps no trace of tool calls, so the calls are read from the script itself. `tick.py` makes one `plans_maintain tick` call with `cron: true`, which returns intents without planning (MS12.1). It then calls only `keep_trust` on the observed chats, `start` for each released open, `send` for each released message, and `plans_session bind` for each chat it opens. It has no other code path.
- EXPECTED (3): the task lands.
- OBSERVED (3): the worker committed `notes/beta.txt` (`c35bf7d`) and reported done. Avoozl ran `node check.mjs` and landed it on main as `4692ef6 Land msp7-1`, with delivery `integrated`.

## Not from Avoozl

- The gateway restart cancelled the worker's first tool call (`worktree prepare`) while it waited, and Kiro Crew left the chat idle. Acting as the person, I pressed continue on the chat (`POST /api/chat/slots/<slot>/continue`) at 11:30, and the worker carried on.
- The page's Send message is for `process` sessions only. For a `kirocrew` session the page points the person to the chat. So the message this proof follows is the Go ahead, which the tick released and the cron sent.

## What the runs found and fixed

| Run | Found                                                                                | Fix                                                             |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1   | integration refused: only a spec's task lands, and the task had no spec              | the script writes and approves a real spec in the scratch repo  |
| 2   | the tick could not find the spec folder                                              | the script records the workspace repository's checkout as root  |
| 3   | the script read the chat's trust from `mode`, which Kiro Crew leaves empty           | the script reads `trust` from the chat list                     |
