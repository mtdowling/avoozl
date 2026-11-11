import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptiveRecentGitHubItems,
  queueItemNeedsAttention,
  queueItemProcessed,
  queueTriageItems,
} from "./queue-triage.mjs";

const NOW = Date.parse("2026-11-11T00:00:00.000Z");
const item = (id, repository, daysAgo, extra = {}) => ({
  id,
  kind: "issue",
  repository,
  state: "open",
  updatedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  ...extra,
});

test("adaptive recency widens independently for quiet repositories", () => {
  const selected = adaptiveRecentGitHubItems(
    [
      item("busy-new", "org/busy", 1),
      item("busy-mid", "org/busy", 2),
      item("busy-old", "org/busy", 3),
      item("busy-ancient", "org/busy", 40),
      item("quiet-new", "org/quiet", 4),
      item("quiet-mid", "org/quiet", 20),
      item("quiet-old", "org/quiet", 80),
    ],
    { now: NOW, minPerRepository: 3 },
  );

  assert.deepEqual(
    selected.map(({ id }) => id),
    ["busy-new", "busy-mid", "busy-old", "quiet-new", "quiet-mid", "quiet-old"],
  );
  assert.ok(!selected.some(({ id }) => id === "busy-ancient"));
});

test("triage includes approval tasks and excludes closed GitHub work", () => {
  const approval = item("approval", "", 0, {
      kind: "task",
      attention: "approval",
    }),
    ready = item("ready", "", 0, { kind: "task", attention: "ready" }),
    closed = item("closed", "org/repo", 0, { state: "closed" }),
    merged = item("merged", "org/repo", 0, {
      kind: "pull-request",
      state: "merged",
    }),
    open = item("open", "org/repo", 1);

  assert.equal(queueItemNeedsAttention(approval), true);
  assert.equal(queueItemNeedsAttention(ready), false);
  assert.deepEqual(
    queueTriageItems([approval, ready, closed, merged, open], {
      now: NOW,
      minPerRepository: 1,
    }).map(({ id }) => id),
    ["approval", "open"],
  );
});

test("processed work is detected without discarding its queue record", () => {
  assert.equal(
    queueItemProcessed(
      item("linked", "org/repo", 1, {
        associations: [{ targetKind: "task", targetId: "task-1" }],
      }),
    ),
    true,
  );
  assert.equal(
    queueItemProcessed(
      item("terminal", "org/repo", 1, {
        processedAt: "2026-11-10T00:00:00.000Z",
        disposition: "no-longer-open",
      }),
    ),
    true,
  );
  assert.equal(queueItemProcessed(item("open", "org/repo", 1)), false);
});

test("adaptive recency remains bounded across busy repositories", () => {
  const items = Array.from({ length: 20 }, (_, index) =>
    item(`item-${index}`, index < 10 ? "org/one" : "org/two", index % 10),
  );
  const selected = adaptiveRecentGitHubItems(items, {
    now: NOW,
    minPerRepository: 1,
    maxPerRepository: 4,
    maxTotal: 6,
  });
  assert.equal(selected.length, 6);
  assert.equal(
    selected.filter(({ repository }) => repository === "org/one").length,
    3,
  );
  assert.equal(
    selected.filter(({ repository }) => repository === "org/two").length,
    3,
  );
});
