// @ts-nocheck: typing debt
// Lane sessions (simplify §D22, sim-7.1): the tick hands each worker and
// review start a free lane, a lane's chat moves on to its next task, and a
// lane a person closed waits for Resume.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  as,
  bind,
  deliveryWorkspace,
  leaf,
  workerDone,
} from "../../test/delivery-fixture.ts";
import { laneHeader, laneTable, observeLanes } from "../lane-sessions.ts";
import { loopOn } from "../../test/fixtures.ts";

// The tick starts work only with the server loop on.
loopOn();

const setup = (t, { tasks = [leaf("a"), leaf("b")], delivery = {} } = {}) =>
  deliveryWorkspace(t, {
    prefix: "avoozl-lanes-",
    tasks,
    config: {
      version: 1,
      lanes: { local: 1, reviewers: 1 },
      delivery: { retries: 1, reviewers: [], ...delivery },
    },
  });

// The cron's tick, with each named slot in its roster.
const tick = (ops, sessions = {}) =>
  ops.execute("workspace.tick", {
    sessions: Object.entries(sessions).map(([target, status]) => ({
      target,
      status,
    })),
  });

const workers = (result) => result.dispatch.filter((d) => d.role === "worker");

test("one worker lane runs one task at a time, and its chat takes the next task", async (t) => {
  // Nearby inputs: a second ready task while the lane is busy, a reported
  // but unrecorded attempt, and the lane's binding for the next task.
  const { root, store, ops } = setup(t);
  const workspace = path.basename(root),
    header = laneHeader(workspace, "worker", 1, 1);
  assert.equal(header, `Avoozl · ${workspace} · worker 1`);
  const first = workers(await tick(ops));
  assert.deepEqual(
    first.map((d) => [d.task, d.lane]),
    [["a", { id: "worker-1", header, workspace }]],
    "one lane, one start, with no chat yet",
  );
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "lane-w1",
    role: "worker",
    attempt: 1,
    source: "tick",
    title: header,
    lane: "worker-1",
  });
  assert.deepEqual(
    workers(await tick(ops, { "lane-w1": "working" })),
    [],
    "a busy lane takes no task",
  );
  // The worker reports done in the lane's chat; once recorded the lane is
  // free and the next start names the chat to clear and reuse.
  const { path: worktree } = await ops.execute("worktree.prepare", {
    taskId: "a",
  });
  const { execFileSync } = await import("node:child_process");
  const git = (...args) =>
    execFileSync("git", args, { cwd: worktree, encoding: "utf8" }).trim();
  git("commit", "--allow-empty", "-qm", "Work a");
  await ops.execute(
    "session.report",
    { taskId: "a", kind: "done", commit: git("rev-parse", "HEAD") },
    undefined,
    as("lane-w1"),
  );
  const next = workers(await tick(ops, { "lane-w1": "idle" }));
  const before = store.get("session_bindings", "lane-w1");
  assert.deepEqual(
    next.map((d) => [d.task, d.lane]),
    [
      [
        "b",
        {
          id: "worker-1",
          header,
          workspace,
          slot: "lane-w1",
          // A process lane keeps task a's sessions until b starts.
          keepSince: before.boundAt,
        },
      ],
    ],
  );
  await ops.execute("session.bind", {
    taskId: "b",
    slot: "lane-w1",
    role: "worker",
    attempt: 1,
    source: "tick",
    title: header,
    lane: "worker-1",
  });
  assert.equal(store.get("session_bindings", "lane-w1").taskId, "b");
  assert.deepEqual(
    store.get("session_bindings", `lane-w1#${before.boundAt}`),
    { ...before, id: `lane-w1#${before.boundAt}` },
    "the earlier binding moves aside with every field kept",
  );
  assert.equal(
    store.get("task_deliveries", "a").attempts[0].outcome,
    "done",
    "task a's attempt stays recorded",
  );
  // A report from the chat now matches task b, not a.
  await assert.rejects(
    ops.execute(
      "session.report",
      { taskId: "a", kind: "progress", text: "late" },
      undefined,
      as("lane-w1"),
    ),
  );
});

test("a lane whose chat a person closed pauses, shows in Needs you, and opens again after Resume", async (t) => {
  // Nearby inputs: a session's own MCP Resume (refused), a second tick
  // while paused (no new row, no start), and Resume naming a free lane.
  const { store, ops } = setup(t, { tasks: [leaf("a")] });
  await tick(ops);
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "lane-w1",
    role: "worker",
    attempt: 1,
    source: "tick",
    title: "lane",
    lane: "worker-1",
  });
  await tick(ops, { "lane-w1": "closed" });
  const items = (await ops.execute("conflicts.view", {})).items.filter(
    (item) => item.reason === "lane-closed",
  );
  assert.deepEqual(
    items.map((item) => [item.id, item.actions[0].operation]),
    [["lane-closed:worker-1", "lane.resume"]],
  );
  // The task follows the vanished rule, but the paused lane takes nothing.
  assert.deepEqual(workers(await tick(ops, { "lane-w1": "closed" })), []);
  await assert.rejects(
    ops.execute("lane.resume", { lane: "worker-1" }, undefined, { mcp: true }),
    (error) => error.status === 403,
  );
  await assert.rejects(
    ops.execute("lane.resume", { lane: "reviewer-1" }),
    /not paused/,
  );
  await ops.execute("lane.resume", { lane: "worker-1" });
  const reopened = workers(await tick(ops, { "lane-w1": "closed" }));
  assert.deepEqual(
    reopened.map((d) => [d.task, d.lane.id, d.lane.slot ?? null]),
    [["a", "worker-1", null]],
    "a new chat for the lane, never the closed one",
  );
  assert.equal(
    (await ops.execute("conflicts.view", {})).items.filter(
      (item) => item.reason === "lane-closed",
    ).length,
    0,
  );
  const { lanes } = await ops.execute("lanes.view", {});
  assert.deepEqual(
    lanes.map((l) => [l.lane, l.role, l.state]),
    [
      ["worker-1", "worker", "free"],
      ["reviewer-1", "reviewer", "free"],
    ],
  );
  assert.match(
    laneTable(lanes),
    /^LANE\s+ROLE\s+HARNESS\s+STATE\s+TASK\s+OPEN\n/,
  );
  assert.equal(store.getMeta("lanes")["worker-1"].paused, undefined);
});

test("a process lane whose child exited stays free", (t) => {
  // Nearby input: the same closed status on a chat binding pauses the lane.
  const { store } = setup(t, { tasks: [leaf("a")] });
  const policy = { concurrency: 1, reviewerLanes: 0 },
    binding = {
      id: "p-w1",
      slot: "p-w1",
      taskId: "a",
      role: "worker",
      lane: "worker-1",
      status: "closed",
      boundAt: "2026-01-01T00:00:00Z",
    };
  store.put("session_bindings", { ...binding, executor: "process" });
  assert.deepEqual(observeLanes(store, policy, "ws"), []);
  store.put("session_bindings", binding);
  assert.deepEqual(
    observeLanes(store, policy, "ws").map((lane) => lane.id),
    ["worker-1"],
  );
});

test("reviews wait for a free reviewer lane", async (t) => {
  // Nearby inputs: two deliveries done at once with one reviewer lane, and
  // the second review after the first one's verdict is recorded.
  const { ops } = setup(t, {
    delivery: { reviewers: undefined },
  });
  await tick(ops);
  await workerDone(ops, "a", "w-a");
  await bind(ops, "b", "w-b", "worker", 1);
  const { path: worktree } = await ops.execute("worktree.prepare", {
    taskId: "b",
  });
  const { execFileSync } = await import("node:child_process");
  execFileSync("git", ["commit", "--allow-empty", "-qm", "Work b"], {
    cwd: worktree,
  });
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: worktree,
    encoding: "utf8",
  }).trim();
  await ops.execute(
    "session.report",
    { taskId: "b", kind: "done", commit: head },
    undefined,
    as("w-b"),
  );
  const result = await tick(ops, { "w-a": "idle", "w-b": "idle" });
  const reviews = result.dispatch.filter((d) => d.role === "review:review");
  assert.deepEqual(
    reviews.map((d) => d.lane.id),
    ["reviewer-1"],
    "one reviewer lane, one review",
  );
});

test("a quiet review recorded as failed frees its reviewer lane for the next review", async (t) => {
  // Nearby inputs: a reviewer that never reports (no MCP identity) and the
  // nudge bound. Once the delivery records the quiet failure, the lane's
  // chat takes the next review; before, the lane stayed busy forever.
  const { store, ops } = setup(t, {
    tasks: [leaf("a")],
    delivery: { reviewers: undefined, nudges: 0, quietMinutes: 1 },
  });
  await tick(ops);
  await workerDone(ops, "a", "w-a");
  const first = (await tick(ops, { "w-a": "idle" })).dispatch.filter(
    (d) => d.role === "review:review",
  );
  assert.deepEqual(
    first.map((d) => d.lane.id),
    ["reviewer-1"],
  );
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "lane-r1",
    role: "review:review",
    attempt: 1,
    source: "tick",
    title: first[0].lane.header,
    lane: "reviewer-1",
  });
  await tick(ops, { "w-a": "idle", "lane-r1": "idle" });
  const binding = store.get("session_bindings", "lane-r1"),
    at = new Date(Date.now() - 10 * 60_000).toISOString();
  store.put("session_bindings", { ...binding, boundAt: at, statusAt: at });
  await tick(ops, { "w-a": "idle", "lane-r1": "idle" });
  assert.match(
    store.get("task_deliveries", "a").verifications.at(-1).cause,
    /quiet after 0 nudges/,
  );
  const again = (
    await tick(ops, { "w-a": "idle", "lane-r1": "idle" })
  ).dispatch.filter((d) => d.role === "review:review");
  assert.deepEqual(
    again.map((d) => [d.attempt, d.lane.id, d.lane.slot]),
    [[2, "reviewer-1", "lane-r1"]],
    "the next review runs in the lane's chat",
  );
});

test("a start request not bound yet holds its lane", async (t) => {
  // One lane: task a, first in line, finds it held by b's request.
  const { store, ops } = setup(t);
  store.put("session_requests", {
    id: "start:held",
    kind: "start",
    executor: "kirocrew",
    state: "pending",
    request: {
      id: "start:held",
      task: "b",
      role: "worker",
      executor: "kirocrew",
      lane: { id: "worker-1", header: "h" },
    },
  });
  assert.deepEqual(
    workers(await tick(ops)).map((d) => [d.task, d.lane.id]),
    [],
    "task a finds no free lane while b's request holds worker-1",
  );
});

test("a process lane's home is ~/.avoozl/lanes/<workspace>/<lane>", async () => {
  const { laneHome } = await import("../../executors/process.ts");
  assert.equal(
    laneHome("my ws", "worker-2", "/home/me"),
    path.join("/home/me", ".avoozl", "lanes", "my-ws", "worker-2"),
  );
  assert.throws(() => laneHome("..", "worker-1", "/home/me"), /lane needs/);
  assert.throws(() => laneHome("ws", "../x", "/home/me"), /lane needs/);
});

test("a review round's lane is the one its task's last session ran on, and it resumes there", async () => {
  const { laneRequest, pickLane } = await import("../lane-sessions.ts");
  const binding = {
      taskId: "a",
      role: "worker",
      lane: "worker-2",
      boundAt: "2026-11-20T00:00:00.000Z",
      harnessSession: "0b9a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
    },
    lanes = [
      { id: "worker-1", role: "worker", state: "free", workspace: "ws" },
      {
        id: "worker-2",
        role: "worker",
        state: "free",
        workspace: "ws",
        header: "h",
        slot: "process-x",
        binding,
        taskBindings: [binding],
      },
    ];
  const lane = pickLane(lanes, { task: "a", role: "worker" }, new Set());
  assert.equal(lane.id, "worker-2");
  assert.deepEqual(laneRequest(lane, { task: "a", role: "worker" }), {
    id: "worker-2",
    header: "h",
    workspace: "ws",
    slot: "process-x",
    resume: true,
    session: binding.harnessSession,
  });
  assert.deepEqual(laneRequest(lane, { task: "b", role: "worker" }), {
    id: "worker-2",
    header: "h",
    workspace: "ws",
    slot: "process-x",
    keepSince: binding.boundAt,
  });
});
