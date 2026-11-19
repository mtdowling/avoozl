import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { blocks, queryTasks, validate } from "./model.mjs";
import { syncPlans } from "./catalog.mjs";
const minimal = () => ({
  schemaVersion: 1,
  revision: 1,
  updatedAt: new Date().toISOString(),
  project: { pollIntervalMs: 10000 },
  statuses: [
    { id: "planned", complete: false },
    { id: "partial", complete: false },
    { id: "implemented", complete: true },
    { id: "review", complete: false },
  ],
  epics: [
    { id: "W1", title: "Execution" },
    { id: "W2", title: "Storage" },
  ],
  tracks: [{ id: "frontend" }, { id: "storage" }, { id: "catalog" }],
  documents: {},
  tasks: [],
  edges: [],
  changelog: [],
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nupp-plan-report-"));
  fs.mkdirSync(path.join(root, "todo"));
  fs.mkdirSync(path.join(root, "native-runtime"));
  fs.writeFileSync(
    path.join(root, "todo/nupp-native-runtime.md"),
    "# Runtime\n\n### W1. Execution\n\n- [ ] Make compiler work\n  Exact context with posix_spawn.\n",
  );
  const d = minimal();
  syncPlans(d, root, { initial: true });
  const t = d.tasks[0];
  t.id = "compiler";
  t.status = "partial";
  t.scope = "runtime";
  t.epic = "W1";
  t.track = "frontend";
  return { root, data: d };
}
test("stable checklist keys distinguish repeated headings and survive inserted prose", () => {
  const original =
    "# Plan\n## First\n- [ ] Same task\n## Second\n- [ ] Same task";
  const a = blocks(original),
    b = blocks("Intro\n" + original);
  assert.equal(new Set(a.map((x) => x.key)).size, 2);
  assert.deepEqual(
    a.map((x) => x.key),
    b.map((x) => x.key),
  );
});
test("queries search full context and follow only prerequisite directions", () => {
  const f = fixture();
  try {
    const d = f.data;
    d.tasks.push({
      id: "release",
      title: "Delivery",
      scope: "runtime",
      status: "planned",
      epic: "W2",
      track: "storage",
      tags: ["ship"],
    });
    d.edges.push({ from: "compiler", to: "release", kind: "requires" });
    assert.deepEqual(
      queryTasks(d, { q: "posix_spawn" }).map((t) => t.id),
      ["compiler"],
    );
    assert.deepEqual(
      queryTasks(d, { q: "depends:release" })
        .map((t) => t.id)
        .sort(),
      ["compiler", "release"],
    );
    assert.equal(queryTasks(d, { q: "tag:ship ready:true" }).length, 0);
    d.tasks[0].status = "implemented";
    assert.equal(queryTasks(d, { q: "tag:ship ready:true" }).length, 1);
    assert.equal(validate(d).length, 0);
    d.edges.push({ from: "release", to: "compiler", kind: "requires" });
    assert.ok(validate(d).some((e) => e.includes("cycle")));
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
import { captureTask } from "./capture.mjs";

test("prompt capture inherits view context without inventing dependencies or completion", () => {
  const d = minimal();
  d.tasks = [
    {
      id: "io-task",
      title: "Existing I/O",
      scope: "runtime",
      status: "implemented",
      epic: "W2",
      track: "storage",
      tags: ["io"],
    },
  ];
  const before = structuredClone(d.edges),
    input = {
      submissionId: "capture-one",
      prompt: "Make file reads cooperative\nPreserve cancellation cleanup.",
      context: {
        revision: 1,
        view: "graph",
        filters: {
          scope: "runtime",
          status: "implemented",
          epic: "W2",
          tag: "cleanup",
        },
        selected: "io-task",
        taskIds: ["io-task", "missing"],
        url: "/?view=graph&node=io-task",
      },
    };
  const result = captureTask(d, input);
  // A captured task has no plan, so no epic (Requirement 59.6).
  assert.equal(result.task.epic, undefined);
  assert.equal(result.task.scope, "runtime");
  assert.equal(result.task.track, "storage");
  assert.equal(result.task.status, "planned");
  assert.ok(result.task.tags.includes("cleanup"));
  assert.equal(result.task.prompt, input.prompt);
  assert.deepEqual(result.task.capture.context.taskIds, ["io-task"]);
  assert.deepEqual(d.edges, before);
  assert.equal(captureTask(d, input).task.id, result.task.id);
  assert.equal(d.tasks.length, 2);
  assert.throws(
    () => captureTask(d, { ...input, prompt: "Different request" }),
    /another prompt/,
  );
  const unscoped = captureTask(d, {
    submissionId: "capture-two",
    prompt: "Plan a new graphics library",
    context: { view: "strip", filters: { scope: "all" } },
  }).task;
  assert.equal(unscoped.scope, "catalog");
  assert.equal(unscoped.epic, undefined);
  assert.equal(validate(d).length, 0);
});

import { applyActivity, activityState } from "./activity.mjs";
test("activity reports work independently of progress, expires, and prevents stale worker writes", () => {
  const d = minimal();
  d.tasks = [
    {
      id: "work",
      title: "Work",
      scope: "runtime",
      status: "partial",
      epic: "W1",
      track: "frontend",
      owner: "Historical owner",
    },
  ];
  const now = Date.parse("2026-11-08T12:00:00Z"),
    original = structuredClone(d.tasks[0]);
  assert.equal(
    queryTasks(d, { scope: "all", q: "inflight:true", now }).length,
    0,
  );
  const first = applyActivity(
    d,
    {
      id: "work",
      action: "start",
      owner: "Agent A",
      sessionId: "session-a",
      branch: "feature",
      summary: "Checking ownership",
      leaseMinutes: 5,
    },
    now,
  );
  assert.equal(first.state, "active");
  assert.equal(d.tasks[0].status, original.status);
  assert.equal(d.tasks[0].owner, original.owner);
  assert.equal(
    queryTasks(d, { scope: "all", q: "inflight:true", now }).length,
    1,
  );
  assert.equal(
    queryTasks(d, { scope: "all", activity: "active", now }).length,
    1,
  );
  assert.throws(
    () =>
      applyActivity(
        d,
        {
          id: "work",
          action: "start",
          owner: "Agent B",
          sessionId: "session-b",
        },
        now + 1000,
      ),
    /Already in flight/,
  );
  assert.equal(activityState(d.tasks[0], now + 300000), "stale");
  assert.equal(
    queryTasks(d, { scope: "all", q: "activity:stale", now: now + 300000 })
      .length,
    1,
  );
  const second = applyActivity(
    d,
    { id: "work", action: "start", owner: "Agent B", sessionId: "session-b" },
    now + 300001,
  );
  assert.notEqual(first.activity.leaseId, second.activity.leaseId);
  assert.throws(
    () =>
      applyActivity(
        d,
        { id: "work", action: "heartbeat", leaseId: first.activity.leaseId },
        now + 300002,
      ),
    /lease changed/,
  );
  assert.equal(d.tasks[0].activityHistory[0].owner, "Agent A");
  applyActivity(
    d,
    { id: "work", action: "pause", leaseId: second.activity.leaseId },
    now + 300003,
  );
  assert.equal(activityState(d.tasks[0], now + 300003), "paused");
  applyActivity(
    d,
    {
      id: "work",
      action: "heartbeat",
      leaseId: second.activity.leaseId,
      summary: "Back to validation",
    },
    now + 300004,
  );
  assert.equal(activityState(d.tasks[0], now + 300004), "active");
  applyActivity(
    d,
    { id: "work", action: "finish", leaseId: second.activity.leaseId },
    now + 300005,
  );
  assert.equal(activityState(d.tasks[0], now + 300005), "finished");
  assert.equal(d.tasks[0].status, "partial");
  assert.equal(validate(d).length, 0);
});
