// @ts-nocheck: typing debt
// The Kiro Crew cron's tick call (MS1.3, MS12.1): it runs this machine's tick
// pass, records what the cron observed, and returns what the pass released.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../../api/operations.ts";
import { listSessionBindings } from "../../../sessions/session-bindings.ts";
import { enqueueSessionRequests } from "../../../sessions/session-requests.ts";
import { workspaceConfig } from "../../../settings/config.ts";
import { Store } from "../../../store/store.ts";
import { recordReleased, tickHealth } from "../../../tick/tick.ts";
import { initializeWorkspace } from "../../../workspace/workspace.ts";
import { temporaryDirectory } from "../../../test/temporary.ts";
import { createAppMcp } from "../app-mcp.ts";
import { ownMachineEnv } from "../../../test/own-machine.ts";

const tickCall = (input, cron = true) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "plans_maintain",
    arguments: {
      action: "tick",
      input: { ...(cron ? { cron } : {}), ...input },
    },
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
  // A machine of its own, whose catalog does not list this workspace.
  const env = ownMachineEnv(path.join(dir, "machine"));
  return { config, store, request: starts[0], env, dir };
}

const answer = async ({ config, env }, input, cron = true) => {
  const mcp = createAppMcp({ fallback: config, env });
  try {
    const reply = await mcp.handle(tickCall(input, cron));
    return JSON.parse(reply.result.content[0].text);
  } finally {
    mcp.close();
  }
};

test("the cron's call runs the machine's pass, returns the released start, and records its observations", async () => {
  const w = await scratch();
  try {
    // Nothing is released until a tick says so.
    let intents = await answer(w, {});
    assert.deepEqual(intents.dispatch, []);
    // The pass ran on this machine's own state folder.
    assert.ok(
      fs.existsSync(path.join(w.env.XDG_STATE_HOME, "avoozl", "supervisor")),
    );

    recordReleased(w.store, { dispatch: [w.request], messages: [] });
    intents = await answer(w, {
      sessions: [{ target: "slot-2", status: "idle" }],
    });
    assert.deepEqual(
      intents.dispatch.map((d) => d.id),
      [w.request.id],
    );
    assert.deepEqual(intents.observe, [
      { slot: "slot-2", taskId: "task-2", role: "worker" },
    ]);
    const bound = listSessionBindings(w.store).find((b) => b.slot === "slot-2");
    assert.equal(bound.status, "idle");
    // This workspace is not in the machine's catalog, so no tick ran on it.
    assert.equal(tickHealth(w.store).lastRun, null);
  } finally {
    w.store.close();
  }
});

test("a chat's tick call runs one pass for its own workspace", async () => {
  const w = await scratch();
  try {
    const results = await answer(w, {}, false);
    assert.deepEqual(
      results.filter((r) => r.root).map((r) => [r.root, r.tick]),
      [[w.config.workspaceRoot, "ran"]],
    );
    assert.notEqual(tickHealth(w.store).lastRun, null);
  } finally {
    w.store.close();
  }
});
