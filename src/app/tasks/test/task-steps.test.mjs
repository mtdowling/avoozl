// Task details' Timeline steps (Requirement 106, design 4.35): built from
// stored records only, with no GitHub call.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.mjs";
import { taskSteps } from "../task-steps.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const at = (m) => `2026-11-17T10:${String(m).padStart(2, "0")}:00Z`;

test("steps follow the records in order, with a failed attempt in place", () => {
  const steps = taskSteps({
    approval: { at: at(0), approvedBy: "pat" },
    spans: [{ stage: "queued", startedAt: at(5) }],
    delivery: {
      sessions: [
        { attempt: 1, role: "worker", boundAt: at(10), model: "m1" },
        { attempt: 2, role: "worker", boundAt: at(30) },
      ],
      deliveries: [
        {
          state: "integrated",
          commit: "abcdef0123456789",
          updatedAt: at(50),
          attempts: [
            {
              attempt: 1,
              outcome: "failed",
              at: at(20),
              lastReport: "tests red",
            },
            {
              attempt: 2,
              outcome: "done",
              at: at(40),
              commit: "abcdef0123456789",
            },
          ],
        },
      ],
      evidence: [
        { exitCode: 0, at: at(41) },
        { exitCode: 1, at: at(42) },
      ],
      integration: { at: at(55), commit: "fedcba9876543210" },
    },
    builds: [
      {
        phase: "build",
        target: "linux",
        start: "cold",
        attempt: 1,
        task: "a",
        ms: 1000,
        failed: false,
        at: at(44),
        counters: {},
      },
      {
        phase: "test",
        target: "linux",
        start: "cold",
        attempt: 1,
        task: "a",
        ms: 9000,
        failed: true,
        at: at(45),
        counters: {},
      },
    ],
  });
  assert.deepEqual(
    steps.map((s) => [s.key, s.state, s.at]),
    [
      ["spec", "done", at(0)],
      ["ready", "done", at(5)],
      ["started-1", "done", at(10)],
      ["failed-1", "done", at(20)],
      ["started-2", "done", at(30)],
      ["checks", "done", at(42)],
      ["landed", "done", at(40)],
      ["builds", "done", at(45)],
      ["integrated", "done", at(55)],
    ],
  );
  assert.equal(steps[0].by, "pat");
  assert.equal(steps[2].by, "m1");
  assert.equal(steps[3].label, "Attempt 1 failed");
  assert.equal(steps[3].detail, "tests red");
  assert.equal(steps[5].detail, "1 of 2 failed");
  assert.equal(steps[6].detail, "Commit abcdef012345");
  assert.deepEqual(
    steps[7].builds.map((g) => [g.phase, g.items.map((i) => i.failed)]),
    [
      ["build", [false]],
      ["test", [true]],
    ],
  );
});

test("a step a later one passed is skipped, the next is in progress, the rest later", () => {
  const steps = taskSteps({
    approval: { at: at(0) },
    delivery: {
      sessions: [{ attempt: 1, role: "worker", boundAt: at(10) }],
      deliveries: [],
      evidence: [],
    },
  });
  assert.deepEqual(
    steps.map((s) => [s.key, s.state]),
    [
      ["spec", "done"],
      ["ready", "skipped"],
      ["started-1", "done"],
      ["checks", "now"],
      ["landed", "later"],
      ["integrated", "later"],
    ],
  );
  assert.equal(taskSteps()[0].state, "now");
});

test("task.detail returns steps from stored records and makes no GitHub call", async (t) => {
  const root = temporaryDirectory("avoozl-steps-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: [
      {
        id: "a",
        title: "Task a",
        kind: "leaf",
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        planId: "p",
      },
    ],
    edges: [],
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1 }),
  );
  store.put("approvals", {
    id: "ap",
    planId: "p",
    hash: "h",
    at: at(0),
    approvedBy: "pat",
  });
  store.put("plans", {
    id: "p",
    title: "P",
    state: "approved",
    approvalId: "ap",
  });
  store.db
    .prepare("INSERT INTO flow_spans VALUES (?,?,?,?,?,?,?,?,?)")
    .run("s1", "a", 1, "worker", "queued", at(3), at(9), "events", null);
  const github = new Proxy(
      {},
      {
        get: (_, name) => () => {
          throw new Error(`GitHub was called: ${String(name)}`);
        },
      },
    ),
    ops = new Operations(store, { workspaceRoot: root, github }),
    view = await ops.execute("task.detail", { id: "a" });
  assert.deepEqual(
    view.steps.slice(0, 2).map((s) => [s.key, s.at]),
    [
      ["spec", at(0)],
      ["ready", at(3)],
    ],
  );
  assert.ok(Array.isArray(view.timeline));
});
