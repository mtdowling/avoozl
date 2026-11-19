# Planner batches (task 61.1, R108)

> Screenshots for this receipt were checked and are not kept in git.

Made with `AVOOZL_CHROME_NO_SANDBOX=1 node kirocrew-app/ui/test/browser/agent-batching-shots.mjs docs/evidence/agent-batching`
on the harness (`?page=app&delivery=1&batch=1`), fake data.

- `delivery-<width>-<theme>.png`: Delivery's In progress lane. The batch of
  three (m5, m6, m7) is one card led by m5, with the planner's reason and a
  link to each task. s5 is grouped but runs alone, and its card says why.
- `details-<width>-<theme>.png`: m6's details. The Batch box names the batch,
  its reason and its tasks, and links to m5, the task that leads it.

Widths 1280 and 390, light and dark.
