// The Kiro Crew cron's tick call (MS1.3, MS12.1): it starts this machine's
// tick pass, records what the cron observed, and returns what an earlier pass
// released without waiting for repository work.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../../api/operations.mjs";
import { listSessionBindings } from "../../../sessions/session-bindings.mjs";
import { enqueueSessionRequests } from "../../../sessions/session-requests.mjs";
import { workspaceConfig } from "../../../settings/config.mjs";
import { WorkspaceRegistry } from "../../../settings/host-config.mjs";
import { Store } from "../../../store/store.mjs";
import { recordReleased, tickHealth } from "../../../tick/tick.mjs";
import { initializeWorkspace } from "../../../workspace/workspace.mjs";
import { temporaryDirectory } from "../../../test/temporary.mjs";
import { createAppMcp } from "../app-mcp.mjs";
import { ownMachineEnv } from "../../../test/own-machine.mjs";

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

const cronCall = (id, name, action, input) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: {
    name,
    arguments: { action, input },
    _meta: {
      "kirocrew.caller": {
        schemaVersion: 1,
        sessionKey: "cron:test-job",
      },
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

const answer = async (
  { config, env },
  input,
  cron = true,
  startPass = () => 123,
) => {
  const mcp = createAppMcp({ fallback: config, env, startPass });
  try {
    const reply = await mcp.handle(tickCall(input, cron));
    return JSON.parse(reply.result.content[0].text);
  } finally {
    mcp.close();
  }
};

test("the cron starts a machine pass, returns released work, and records observations", async () => {
  const w = await scratch();
  const started = [];
  try {
    // Nothing is released until a tick says so.
    let intents = await answer(w, {}, true, (options) => {
      started.push(options);
      return 123;
    });
    assert.deepEqual(intents.dispatch, []);
    assert.equal(started.length, 1);
    assert.equal(
      started[0].stateDirectory,
      path.join(w.env.XDG_STATE_HOME, "avoozl"),
    );

    recordReleased(w.store, { dispatch: [w.request], messages: [] });
    intents = await answer(
      w,
      {
        sessions: [{ target: "slot-2", status: "idle" }],
      },
      true,
      (options) => {
        started.push(options);
        return 124;
      },
    );
    assert.deepEqual(
      intents.dispatch.map((d) => d.id),
      [w.request.id],
    );
    assert.deepEqual(intents.observe, [
      { slot: "slot-2", taskId: "task-2", role: "worker" },
    ]);
    const bound = listSessionBindings(w.store).find((b) => b.slot === "slot-2");
    assert.equal(bound.status, "idle");
    assert.equal(started.length, 2);
    // This workspace is not in the machine's catalog, so no tick ran on it.
    assert.equal(tickHealth(w.store).lastRun, null);
  } finally {
    w.store.close();
  }
});

test("the same cron recovers its claimed start after a process restart", async () => {
  const w = await scratch();
  let mcp;
  try {
    recordReleased(w.store, { dispatch: [w.request], messages: [] });
    mcp = createAppMcp({
      fallback: w.config,
      env: w.env,
      startPass: () => 123,
    });
    const first = await mcp.handle(
      cronCall(1, "plans_maintain", "tick", { cron: true }),
    );
    const firstBody = JSON.parse(first.result.content[0].text);
    assert.ok(Array.isArray(firstBody.dispatch), JSON.stringify(firstBody));
    const [request] = firstBody.dispatch;
    const claimed = await mcp.handle(
      cronCall(2, "plans_executor", "take", {
        id: request.id,
        version: request.version,
      }),
    );
    const original = JSON.parse(claimed.result.content[0].text);

    // A completed pass no longer releases this already-claimed row. The next
    // invocation by its owning cron still receives it and its original token.
    recordReleased(w.store, { dispatch: [], messages: [] });
    const again = await mcp.handle(
      cronCall(3, "plans_maintain", "tick", { cron: true }),
    );
    const [recoveredRequest] = JSON.parse(
      again.result.content[0].text,
    ).dispatch;
    assert.equal(recoveredRequest.id, request.id);
    const recovered = await mcp.handle(
      cronCall(4, "plans_executor", "take", {
        id: recoveredRequest.id,
        version: recoveredRequest.version,
      }),
    );
    const body = JSON.parse(recovered.result.content[0].text);
    assert.equal(body.claimToken, original.claimToken);
    assert.equal(body.recovered, true);
  } finally {
    mcp?.close();
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

test("the cron returns and routes intents for every enabled workspace", async () => {
  const dir = temporaryDirectory("avoozl-cron-workspaces-"),
    env = ownMachineEnv(path.join(dir, "machine")),
    roots = new Map(),
    stores = new Map();
  let mcp;
  try {
    const registry = new WorkspaceRegistry({ env });
    try {
      for (const id of ["alpha", "beta"]) {
        const root = path.join(dir, id);
        initializeWorkspace(root, { name: id });
        registry.add(id, { root });
        roots.set(id, root);
      }
      const saved = JSON.parse(fs.readFileSync(registry.configPath, "utf8"));
      saved.loop = { run: ["specs"] };
      fs.writeFileSync(
        registry.configPath,
        JSON.stringify(saved, null, 2) + "\n",
      );
    } finally {
      registry.close();
    }
    for (const [id, root] of roots) {
      const store = new Store(workspaceConfig({ workspace: root, env }).dbPath);
      stores.set(id, store);
      const ops = new Operations(store, { workspaceRoot: root });
      await ops.execute("task.update", {
        id: "shared-task",
        create: true,
        title: `${id} task`,
      });
      const { starts } = enqueueSessionRequests(store, {
        starts: [
          {
            executor: "kirocrew",
            role: "worker",
            task: "shared-task",
            title: `avoozl:shared-task ${id}`,
            brief: `Work in ${id}.`,
            worktree: null,
            model: "fake-model",
            permissionClass: "write",
          },
        ],
      });
      recordReleased(store, { dispatch: starts, messages: [] });
    }

    const started = [];
    mcp = createAppMcp({
      fallback: workspaceConfig({ workspace: roots.get("alpha"), env }),
      env,
      startPass(options) {
        started.push(options);
        return 123;
      },
    });
    const warm = await mcp.handle(
      cronCall(0, "plans_task", "sessions", { id: "shared-task" }),
    );
    assert.equal(warm.result.isError, undefined);
    const tick = await mcp.handle(tickCall({}));
    const intents = JSON.parse(tick.result.content[0].text);
    assert.equal(started.length, 1);
    assert.deepEqual(
      intents.dispatch.map((request) => request._avoozlWorkspaceId).sort(),
      ["alpha", "beta"],
    );

    const claims = new Map();
    for (const [index, request] of intents.dispatch.entries()) {
      const workspaceId = request._avoozlWorkspaceId;
      const take = await mcp.handle(
        cronCall(index + 2, "plans_executor", "take", {
          id: request.id,
          version: request.version,
          _avoozlWorkspaceId: workspaceId,
        }),
      );
      assert.equal(take.result.isError, undefined);
      const claimed = JSON.parse(take.result.content[0].text);
      claims.set(workspaceId, claimed);
      assert.equal(claimed.request.title, `avoozl:shared-task ${workspaceId}`);
      assert.equal(
        stores.get(workspaceId).get("session_requests", request.id).state,
        "claimed",
      );
    }

    const beta = claims.get("beta");
    const bind = await mcp.handle(
      cronCall(4, "plans_session", "bind", {
        taskId: "shared-task",
        slot: "beta-slot",
        title: "avoozl:shared-task beta",
        role: "worker",
        attempt: 1,
        model: "fake-model",
        permissionClass: "write",
        executor: "kirocrew",
        requestId: beta.request.id,
        claimToken: beta.claimToken,
        _avoozlWorkspaceId: "beta",
      }),
    );
    assert.equal(bind.result.isError, undefined);
    assert.equal(
      stores.get("beta").get("session_bindings", "beta-slot").taskId,
      "shared-task",
    );
    assert.equal(
      stores.get("alpha").get("session_bindings", "beta-slot"),
      null,
    );
  } finally {
    mcp?.close();
    for (const store of stores.values()) store.close();
  }
});
