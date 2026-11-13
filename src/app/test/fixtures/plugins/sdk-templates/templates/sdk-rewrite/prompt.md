# Plan the {{sdk}} SDK rewrite

Rewrite the {{sdk}} SDK on the new runtime in {{repository}}, phase by phase.

- Start from the starter folder. Keep its six phases, its task IDs, and the
  manual task `team-review`: cutover waits on it.
- Inventory first: list every operation and feature the current {{sdk}} SDK
  has. Read the gap list, if one came with this request, and add a task for
  each gap it names.
- Mark each task that is small and self-contained `"size": "small"` in the
  manifest, so Avoozl can batch it with others in its phase.
- Fill in each proof kind listed below for this SDK: its setup, action,
  expected result, what failure means and the next decision.
- Give `team-review` the acceptance the team will check before cutover.
