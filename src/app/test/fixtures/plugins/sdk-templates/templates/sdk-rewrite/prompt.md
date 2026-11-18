# Plan the {{sdk}} SDK rewrite

Rewrite the {{sdk}} SDK on the new runtime in {{repository}}, phase by phase.

- Start from the starter folder. Keep its six phases, its task IDs, and the
  manual task `team-review`: cutover waits on it.
- Inventory first: list every operation and feature the current {{sdk}} SDK
  has. Read the gap list, if one came with this request, and add a task for
  each gap it names.
- When several small, independent tasks are cheaper for one worker in one
  chat, list them in a `batches` group in the manifest with a one-line
  reason. Never group tasks where one requires another.
- Fill in each proof kind listed below for this SDK: its setup, action,
  expected result, what failure means and the next decision.
- Give `team-review` the acceptance the team will check before cutover.
