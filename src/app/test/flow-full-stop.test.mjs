// Task 30.1: Stop all agents (design §4.11, Requirement 64.12-64.16). A
// person's full stop pauses everything, stops each running session Avoozl
// opened, keeps worktrees, and marks each attempt "Interrupted by stop";
// Resume starts each again on the same worktree, agent and model.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { openStops } from "../flow.mjs";
import {
  INTERRUPTED,
  deliveryPolicy,
  liveAttempt,
  planReadyDispatches,
  planVerifierDispatches,
  reconcileDeliveries,
} from "../delivery.mjs";
import { mcpRefusal } from "../mcp-policy.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "r1",
  ...extra,
});

const binding = (slot, taskId, extra = {}) => ({
  id: slot,
  slot,
  taskId,
  role: "worker",
  attempt: 1,
  source: "tick",
  status: "working",
  title: `avoozl:${taskId} Task ${taskId}`,
  boundAt: "2026-11-13T00:00:00Z",
  ...extra,
});

function setup(t, { refuse = new Set() } = {}) {
  const root = temporaryDirectory("avoozl-full-stop-"),
    store = new Store(path.join(root, "workspace.sqlite")),
    stopped = [];
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("a1"), leaf("a2"), leaf("a3"), leaf("b1")],
    edges: [],
  });
  store.put("projects", { id: "r1", root: temporaryDirectory("avoozl-r1-") });
  // a1: a running worker the tick opened, on its own model.
  store.put("session_bindings", binding("s-a1", "a1", { model: "model-a1" }));
  // a2: a checks session the tick opened on a done delivery.
  store.put("task_deliveries", {
    id: "a2",
    taskId: "a2",
    state: "done",
    commit: "c".repeat(40),
    attempts: [
      { attempt: 1, slot: "s-a2", outcome: "done", commit: "c".repeat(40) },
    ],
  });
  store.put(
    "session_bindings",
    binding("s-a2", "a2", {
      status: "closed",
      report: { kind: "done", commit: "c".repeat(40) },
    }),
  );
  store.put(
    "session_bindings",
    binding("s-a2-v", "a2", { role: "verifier", commit: "c".repeat(40) }),
  );
  // a3: a Crew Mode conductor's worker; Avoozl did not open it.
  store.put("session_bindings", binding("s-a3", "a3", { source: "conductor" }));
  // b1: a worker Kiro Crew refuses to stop.
  store.put("session_bindings", binding("s-b1", "b1"));
  const ops = new Operations(store, {
    workspaceRoot: root,
    sessionStopper: async (slot) => {
      if (refuse.has(slot))
        throw Error("Kiro Crew refused the session stop (404).");
      stopped.push(slot);
    },
  });
  return { root, store, ops, stopped };
}

test("only a person stops all agents, and only where sessions can be stopped", async (t) => {
  const { store, ops, stopped } = setup(t);
  assert.match(
    mcpRefusal("flow.stop", { full: true, reason: "x" }),
    /Only a person stops all agents/,
  );
  assert.equal(mcpRefusal("flow.stop", { scope: "all", reason: "x" }), null);
  for (const context of [
    { mcp: true },
    { caller: { sessionKey: "chat-1" }, mcp: true },
    { caller: { sessionKey: "chat-1" } },
  ])
    await assert.rejects(
      ops.execute("flow.stop", { full: true, reason: "x" }, undefined, context),
      (error) => error.status === 403 && /Only a person/.test(error.message),
    );
  // The CLI without the app backend has no session stopper.
  const local = new Operations(store, {});
  await assert.rejects(
    local.execute("flow.stop", { full: true, reason: "x" }, undefined, {
      local: true,
    }),
    (error) => error.status === 409 && /Avoozl page/.test(error.message),
  );
  assert.equal(openStops(store).length, 0);
  assert.deepEqual(stopped, []);
  assert.equal(store.get("session_bindings", "s-a1").interrupted, undefined);
});

test("a full stop stops each running chat Avoozl opened and marks it interrupted", async (t) => {
  const { store, ops, stopped } = setup(t, { refuse: new Set(["s-b1"]) });
  const { stop } = await ops.execute("flow.stop", {
    full: true,
    reason: "runaway agents",
  });
  assert.equal(stop.full, true);
  assert.equal(stop.scope, "all");
  assert.equal(stop.manual, true);
  assert.deepEqual(stop.by, { kind: "person", name: "dashboard" });
  assert.deepEqual(stopped.sort(), ["s-a1", "s-a2-v"]);
  const bySlot = Object.fromEntries(stop.sessions.map((s) => [s.slot, s]));
  assert.deepEqual(Object.keys(bySlot).sort(), ["s-a1", "s-a2-v", "s-b1"]);
  assert.equal(bySlot["s-a1"].stopped, true);
  assert.equal(bySlot["s-a1"].model, "model-a1");
  assert.equal(bySlot["s-b1"].stopped, false);
  assert.match(bySlot["s-b1"].error, /refused/);

  const a1 = store.get("session_bindings", "s-a1");
  assert.equal(a1.interrupted.stop, stop.id);
  assert.equal(liveAttempt(a1), false);
  assert.equal(
    store.get("session_bindings", "s-a2-v").interrupted.stop,
    stop.id,
  );
  // Refused and not Avoozl's: left alone.
  assert.equal(store.get("session_bindings", "s-b1").interrupted, undefined);
  assert.equal(store.get("session_bindings", "s-a3").interrupted, undefined);

  const delivery = store.get("task_deliveries", "a1");
  assert.equal(delivery.state, "interrupted");
  assert.deepEqual(
    delivery.attempts.map((a) => [a.attempt, a.outcome, a.cause]),
    [[1, "interrupted", INTERRUPTED]],
  );
  assert.equal(store.get("task_deliveries", "b1"), null);
  assert.ok(
    store
      .list("app_notifications")
      .some((n) => /All agents stopped/.test(n.payload.title)),
  );

  // The tick neither nudges the stopped chat nor counts it as a failure,
  // and nothing new starts, checks and reviews included.
  const policy = deliveryPolicy({ delivery: { retries: 0, quietMinutes: 1 } });
  const { messages } = reconcileDeliveries(store, policy, {
    script: true,
    now: Date.parse("2026-11-14T00:00:00Z"),
  });
  assert.ok(!messages.some((m) => m.slot === "s-a1"));
  assert.equal(store.get("task_deliveries", "a1").state, "interrupted");
  assert.deepEqual(planReadyDispatches(store, policy), []);
  assert.deepEqual(planVerifierDispatches(store, policy), []);
  const view = await ops.execute("flow.view", {});
  assert.ok(
    view.stops.some(
      (s) => s.id === stop.id && s.full && s.sessions.length === 3,
    ),
  );
});

test("Resume starts each interrupted task again on the same branch and model", async (t) => {
  const { store, ops } = setup(t);
  store.put("task_worktrees", {
    id: "a1",
    taskId: "a1",
    repository: "r1",
    path: "/tmp/wt-a1",
    branch: "avoozl/a1",
  });
  const { stop } = await ops.execute("flow.stop", {
    full: true,
    reason: "pause",
  });
  await assert.rejects(
    ops.execute("flow.resume", { stopId: stop.id }, undefined, { mcp: true }),
    (error) => error.status === 403,
  );
  await ops.execute("flow.resume", { stopId: stop.id });
  assert.equal(store.get("task_deliveries", "a1").state, "failed");
  const policy = deliveryPolicy({
    delivery: {
      retries: 0,
      concurrency: 5,
      model: "policy-model",
      agent: "policy-agent",
    },
  });
  const dispatch = planReadyDispatches(store, policy).find(
    (d) => d.task === "a1",
  );
  assert.ok(dispatch, "a1 is dispatched again");
  assert.equal(dispatch.attempt, 2);
  assert.equal(dispatch.model, "model-a1");
  assert.match(dispatch.brief, /Resume in \/tmp\/wt-a1/);
  assert.match(dispatch.brief, /Interrupted by stop/);
  assert.match(dispatch.brief, /git status/);
  // The interrupted attempt spent no retry: retries 0 still allows it.
  assert.ok(
    !store
      .get("task_deliveries", "a1")
      .attempts.some((a) => a.outcome === "failed"),
  );
  // The checks session opens again once the stop is resumed.
  assert.ok(planVerifierDispatches(store, policy).some((d) => d.task === "a2"));
});
