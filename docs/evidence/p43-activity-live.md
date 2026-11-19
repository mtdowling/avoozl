# P43 live: activity log

Proof P43 (Requirement 71, design §4.19), also `an-4.4`, run on 2026-11-19
from 04:50 to 05:22 UTC on the throwaway P50 test Kiro Crew (port 5698), at
Avoozl `9eb4a720` plus the fixes below. Page steps were headless Chrome
clicks by the proof chat; MCP steps were a test-crew chat calling the Avoozl
tools. Screenshots were checked, not kept in git.

**Verdict: pass for every step that still has a subject. P43 is ticked.**

## Setup

- Workspace `p43` (folder `p3943-run/p43/ws`): one scratch repository `r3`
  with a bare remote, check `node check.mjs`, `landing: "direct"`; an
  approved spec `p43s` with `p43-a1`, `p43-a2` (`a2` requires `a1`) and
  `p43-a3`; content rule set `names` banning `secretword`; an `mcp` intake
  source `inbox`; this machine's lanes at 0, so Start now only queues.
- The test crew's shared Avoozl MCP server serves workspace `p39b` (it
  started while that was the default), so the MCP steps ran there, with one
  added leaf `p39-c1` and the same `inbox` source.

## Expected, item by item

| #   | Expected | Seen | Pass |
| --- | --- | --- | --- |
| 1   | One `local` row each, the person as actor | Start now on `p43-a1` (Dispatched p43-a1); Stop the line on `p43-a3` and Resume from the banner (andon.pull, andon.resume); Defer on `p43-a2` (Stopped p43-a2 (Deferred)); Settings › Flow, After this many tasks 12, Save (Saved Flow settings); Settings › Models, worker model, Save (Saved model settings, after the fix). Each one row, `local`, actor `Michael Dowling`. Plugin approval: not run, no plugin in the run. | yes |
| 2   | One `mcp` row naming the session | `plans_session` `start` for `p39-c1`: one row, `mcp`, `session:dashboard:p43_agent`, Dispatched p39-c1. | yes |
| 3   | GitHub rows: merge, order, ignored move, revert, label, conflict | Superseded: these are per-task GitHub issue and Project events, which Phase 56 (R102.20, §4.32) retires and 45.4 deletes. Not run. | n/a |
| 4   | One `plugin` row each for a tracker conflict and a new incoming item | The incoming items came through the `mcp` source, so their rows are `mcp` (`tickSnapshot` sets source by `via`). The tracker conflict row is covered by `activity-log.test.mjs`; no tracker plugin ran. | partly |
| 5   | A `ghp_` value and `secretword` saved redacted; no row holds either | `plans_intake` `submit_items` with an item ID `ghp_` plus 36 letters and one holding `secretword`; two ticks. Two `intake.item` rows, both "Redacted by content rules", `redacted` 1. No `activity_log` row holds `ghp_` or `secretword`. The second tick added no row. | yes |
| 6   | The old row is gone after a tick | Keep activity (days) set to 1 on the Activity tab ("Saved", `.avoozl.json` `retentionDays: 1`); one row recorded two days old; `avoozl tick`: that row gone, 7 rows left. | yes |
| 7   | Tab and MCP show the same rows newest first; a task row opens the drawer | `plans_view` `activity` `{source: mcp}` returned the same four rows, in the same order, as the stored `mcp` rows. The Activity tab lists rows newest first; pressing the `p43-a2` target opened its task drawer. No GitHub row exists to open. | yes |

## Bugs found and fixed in this change

| Bug | Fix |
| --- | --- |
| A Settings › Models save (the writer model of R71.2) left no row; Delivery and driver saves neither. | `models.settings.update`, `delivery.settings.update` and `driver.settings.update` record `settings.save` (`activity-log.mjs`), with a test. |
| A repository stop's row said "repository undefined" (seen in P39's row, kept as recorded). | Fixed with P39. |

## Not checked

- A plugin approval row: no plugin in this run.
- A GitHub row opening in a new tab: no GitHub source.
