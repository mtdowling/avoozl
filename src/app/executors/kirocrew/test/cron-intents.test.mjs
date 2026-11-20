// The Kiro Crew cron's tick call (MS1.3, MS12.1, MS12.3): it records what the
// cron observed, returns what the machine server released, and never plans.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../../api/operations.mjs";
import { listSessionBindings } from "../../../sessions/session-bindings.mjs";
import { enqueueSessionRequests } from "../../../sessions/session-requests.mjs";
import { workspaceConfig } from "../../../settings/config.mjs";
import { Store } from "../../../store/store.mjs";
import { recordReleased, tickHealth } from "../../../tick/tick.mjs";
import { initializeWorkspace } from "../../../workspace/workspace.mjs";
import { temporaryDirectory } from "../../../test/temporary.mjs";
import { createAppMcp } from "../app-mcp.mjs";

const tickCall = (input) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "plans_maintain",
    arguments: { action: "tick", input: { cron: true, ...input } },
  },
});

async function scratch() {
  const dir = temporaryDirectory("avoozl-cron-intents-"),
    root = path.join(dir, "ws");
  initializeWorkspace(root, { name: "ws" });
  const config = workspaceConfig({ workspace: root });
  const store = new Store(config.dbPath);
  const ops = new Operations(store, { workspaceRoot: root });
  await ops.execute("task.update", {
    id: "task-1",
    create: true,
    title: "task-1",
  });
  await ops.execute("task.update", {
    id: "task-2",
    create: true,
    title: "task-2",
  });
  await ops.execute("session.bind", { taskId: "task-2", slot: "slot-2" });
  const start = (task) => ({
    executor: "kirocrew",
    role: "worker",
    task,
    title: `avoozl:${task} work`,
    brief: "Do the work.",
    worktree: null,
    model: "fake-model",
    permissionClass: "write",
  });
  const { starts } = enqueueSessionRequests(store, {
    starts: [start("task-1")],
  });
  return { config, store, request: starts[0] };
}

const answer = async (config, ensureServer, input) => {
  const mcp = createAppMcp({ fallback: config, ensureServer });
  try {
    const reply = await mcp.handle(tickCall(input));
    return JSON.parse(reply.result.content[0].text);
  } finally {
    mcp.close();
  }
};

test("with a server running the cron gets the released start, and its observations are recorded", async () => {
  const { config, store, request } = await scratch();
  try {
    // Nothing is released until the server's tick says so.
    let intents = await answer(config, () => ({ started: false }), {});
    assert.deepEqual(intents.dispatch, []);

    recordReleased(store, { dispatch: [request], messages: [] });
    intents = await answer(config, () => ({ started: false }), {
      sessions: [{ target: "slot-2", status: "idle" }],
    });
    assert.deepEqual(
      intents.dispatch.map((d) => d.id),
      [request.id],
    );
    assert.deepEqual(intents.observe, [
      { slot: "slot-2", taskId: "task-2", role: "worker" },
    ]);
    const bound = listSessionBindings(store).find((b) => b.slot === "slot-2");
    assert.equal(bound.status, "idle");
    // It never reached the planner: no tick receipt was written.
    assert.equal(tickHealth(store).lastRun, null);
  } finally {
    store.close();
  }
});

test("with no server the call starts one, records observations and returns no intents", async () => {
  const { config, store, request } = await scratch();
  try {
    recordReleased(store, { dispatch: [request], messages: [] });
    let started = 0;
    const intents = await answer(
      config,
      () => {
        started += 1;
        return { started: true };
      },
      { sessions: [{ target: "slot-2", status: "working" }] },
    );
    assert.equal(started, 1);
    assert.deepEqual(intents, {
      observe: [],
      dispatch: [],
      messages: [],
      notify: [],
    });
    const bound = listSessionBindings(store).find((b) => b.slot === "slot-2");
    assert.equal(bound.status, "working");
  } finally {
    store.close();
  }
});
