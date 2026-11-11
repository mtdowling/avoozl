import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { startWorkspaceHostServer } from "../workspace-host-server.mjs";
import { handleMcp } from "../mcp.mjs";
import { fixture } from "./fixtures.mjs";

function runtime(id, name, store, counts = {}) {
  store.setMeta("workspaceId", id);
  store.setMeta("instanceEpoch", 3);
  return {
    id,
    name,
    state: "ready",
    instanceEpoch: 3,
    store,
    ops: new Operations(store),
    counts,
    concurrency: { limit: 2, active: 0, queued: 0 },
  };
}

function manager(runtimes, defaultWorkspaceId = runtimes[0].id) {
  const byId = new Map(runtimes.map((item) => [item.id, item]));
  return {
    defaultWorkspaceId,
    lifecycle: [],
    async list() {
      return {
        defaultWorkspace: this.defaultWorkspaceId,
        items: [...byId.values()].map((item) => ({
          id: item.id,
          name: item.name,
          state: item.state,
          revision: item.store.read().revision,
          instanceEpoch: item.instanceEpoch,
          counts: item.counts,
          concurrency: item.concurrency,
        })),
      };
    },
    async open(id) {
      const item = byId.get(id);
      if (!item) {
        const error = Error("Workspace not registered.");
        error.status = 404;
        throw error;
      }
      return item;
    },
    describe(id) {
      const item = byId.get(id);
      if (!item) throw Error("Workspace not registered.");
      return {
        id: item.id,
        name: item.name,
        state: item.state,
        enabled: item.enabled !== false,
        instanceEpoch: item.instanceEpoch,
        concurrency: item.concurrency,
      };
    },
    async add(input) {
      if (byId.has(input.id)) throw Error("Workspace already registered.");
      const item = {
        id: input.id,
        name: input.name || input.id,
        state: input.enabled === false ? "stopped" : "ready",
        enabled: input.enabled !== false,
        instanceEpoch: null,
        store: runtimes[0].store,
        ops: runtimes[0].ops,
        concurrency: {
          limit: input.maxConcurrentRuns ?? 2,
          active: 0,
          queued: 0,
        },
      };
      byId.set(item.id, item);
      return item;
    },
    setDefault(id) {
      if (!byId.has(id)) throw Error("Workspace not registered.");
      this.defaultWorkspaceId = id;
      return { id, default: true };
    },
    setConcurrency(id, limit) {
      const item = byId.get(id);
      if (!item) throw Error("Workspace not registered.");
      item.concurrency.limit = limit;
      return { workspace: { id }, concurrency: item.concurrency };
    },
    async start(id) {
      this.lifecycle.push(["start", id]);
      return { id, state: "ready" };
    },
    async drain(id) {
      this.lifecycle.push(["drain", id]);
      return { id, state: "draining" };
    },
    async resume(id) {
      this.lifecycle.push(["resume", id]);
      return { id, state: "ready" };
    },
    async stop(id) {
      this.lifecycle.push(["stop", id]);
      return { id, state: "stopped" };
    },
    async remove(id) {
      this.lifecycle.push(["remove", id]);
      return { id, removed: true };
    },
  };
}

async function json(response) {
  const value = await response.json();
  assert.equal(
    response.ok,
    true,
    `${response.status}: ${value.error || "request failed"}`,
  );
  return value;
}

test("host routes identical task IDs through isolated workspace runtimes", async (t) => {
  const first = fixture(t),
    second = fixture(t);
  first.store.mutate("Name first task", (data) => {
    data.tasks[0].notes = "First workspace";
    data.documents["plans/alpha.md"] = {
      id: "plans/alpha.md",
      path: "plans/alpha.md",
      title: "Alpha plan",
      text: "# Alpha plan",
      links: [],
    };
  });
  second.store.mutate("Name second task", (data) => {
    data.tasks[0].notes = "Second workspace";
  });
  const host = manager([
      runtime("alpha", "Alpha", first.store, { running: 1 }),
      runtime("beta", "Beta", second.store, { review: 2 }),
    ]),
    server = startWorkspaceHostServer({
      workspaceManager: host,
      port: 0,
      hostInstanceId: "host-test",
    });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const listed = await json(await fetch(base + "/api/workspaces"));
  assert.equal(listed.hostInstanceId, "host-test");
  assert.equal(listed.defaultWorkspace, "alpha");
  assert.deepEqual(
    listed.items.map(({ id, counts, concurrency }) => ({
      id,
      counts,
      concurrency,
    })),
    [
      {
        id: "alpha",
        counts: { running: 1, blocked: 0, review: 0, queue: 0 },
        concurrency: { limit: 2, active: 0, queued: 0 },
      },
      {
        id: "beta",
        counts: { running: 0, blocked: 0, review: 2, queue: 0 },
        concurrency: { limit: 2, active: 0, queued: 0 },
      },
    ],
  );

  const getTask = (id) =>
    fetch(base + `/api/workspaces/${id}/operations/task.get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { id: "sample-task" } }),
    }).then(json);
  assert.equal((await getTask("alpha")).result.notes, "First workspace");
  assert.equal((await getTask("beta")).result.notes, "Second workspace");

  await json(
    await fetch(base + "/api/workspaces/alpha/operations/task.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { id: "sample-task", notes: "Only alpha changed" },
      }),
    }),
  );
  assert.equal((await getTask("alpha")).result.notes, "Only alpha changed");
  assert.equal((await getTask("beta")).result.notes, "Second workspace");

  const defaultTask = await json(
    await fetch(base + "/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "task.get",
        input: { id: "sample-task" },
      }),
    }),
  );
  assert.equal(defaultTask.result.notes, "Only alpha changed");

  const documents = await json(
    await fetch(base + "/api/workspaces/alpha/documents?content=true"),
  );
  assert.equal(documents.workspaceId, "alpha");
  assert.equal(documents.total, 1);
  assert.equal(documents.documents[0].text, "# Alpha plan");
  const query = await json(
    await fetch(base + "/api/workspaces/alpha/query?q=fixture"),
  );
  assert.equal(query.total, 1);
  const graph = await json(
    await fetch(base + "/api/workspaces/alpha/graph?q=fixture"),
  );
  assert.deepEqual(graph.tasks, graph.nodes);
});

test("qualified responses identify workspace and reject foreign event cursors", async (t) => {
  const first = fixture(t),
    second = fixture(t),
    server = startWorkspaceHostServer({
      workspaceManager: manager([
        runtime("alpha", "Alpha", first.store),
        runtime("beta", "Beta", second.store),
      ]),
      port: 0,
      hostInstanceId: "host-test",
    });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  first.store.event(null, "alpha.event", {});
  const events = await json(await fetch(base + "/api/workspaces/alpha/events"));
  assert.equal(events.workspaceId, "alpha");
  assert.equal(events.hostInstanceId, "host-test");
  assert.equal(events.workspaceInstanceEpoch, 3);
  assert.match(events.cursor, /^alpha:\d+$/);
  assert.ok(events.events.every((event) => event.workspaceId === "alpha"));

  const crossed = await fetch(
    base +
      "/api/workspaces/beta/events?after=" +
      encodeURIComponent(events.cursor),
  );
  assert.equal(crossed.status, 409);
  assert.match((await crossed.json()).error, /another workspace/);

  const health = await json(await fetch(base + "/api/workspaces/beta/health"));
  assert.equal(health.workspaceId, "beta");
  assert.equal(
    health.workspaceInstanceEpoch,
    Number(health.workspaceInstanceEpoch),
  );
  assert.equal(
    (await fetch(base + "/api/workspaces/%2Ftmp%2Fevil/health")).status,
    400,
  );
});

test("MCP binding refuses an operations object from another workspace", async (t) => {
  const first = fixture(t),
    second = fixture(t),
    alpha = runtime("alpha", "Alpha", first.store),
    beta = runtime("beta", "Beta", second.store),
    message = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "plans_update_task",
        arguments: {
          input: { id: "sample-task", notes: "Should not cross" },
        },
      },
    };
  const crossed = await handleMcp(message, alpha.ops, {
    workspaceId: beta.id,
  });
  assert.equal(crossed.body.result.isError, true);
  assert.match(
    crossed.body.result.content[0].text,
    /bound to another workspace/,
  );
  assert.equal(first.store.read().tasks[0].notes, undefined);
});

test("host MCP discovery returns qualified endpoints without changing default", async (t) => {
  const first = fixture(t),
    second = fixture(t),
    workspaceManager = manager([
      runtime("alpha", "Alpha", first.store),
      runtime("beta", "Beta", second.store),
    ]),
    server = startWorkspaceHostServer({
      workspaceManager,
      port: 0,
      hostInstanceId: "host-test",
    });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await json(
    await fetch(base + "/mcp/host", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "avoozl_select_workspace",
          arguments: { workspaceId: "beta" },
        },
      }),
    }),
  );
  assert.equal(
    response.result.structuredContent.mcpUrl,
    base + "/api/workspaces/beta/mcp",
  );
  assert.equal(workspaceManager.defaultWorkspaceId, "alpha");
});

test("legacy MCP sessions remain bound when the default workspace changes", async (t) => {
  const first = fixture(t),
    second = fixture(t),
    workspaceManager = manager([
      runtime("alpha", "Alpha", first.store),
      runtime("beta", "Beta", second.store),
    ]),
    server = startWorkspaceHostServer({
      workspaceManager,
      port: 0,
      hostInstanceId: "host-test",
    });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`,
    initialized = await fetch(base + "/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      }),
    }),
    sessionId = initialized.headers.get("mcp-session-id");
  assert.equal(initialized.status, 200);
  assert.ok(sessionId);

  workspaceManager.setDefault("beta");
  const updated = await json(
    await fetch(base + "/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Session-Id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "plans_update_task",
          arguments: {
            input: { id: "sample-task", notes: "Still alpha" },
          },
        },
      }),
    }),
  );
  assert.equal(updated.result.isError, undefined);
  assert.equal(first.store.read().tasks[0].notes, "Still alpha");
  assert.equal(second.store.read().tasks[0].notes, undefined);

  const crossed = await fetch(base + "/api/workspaces/beta/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Session-Id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
    }),
  });
  assert.equal(crossed.status, 409);
  assert.match((await crossed.json()).error, /another workspace/);
});

test("OpenHands surface capabilities remain bound to their workspace", async (t) => {
  const first = fixture(t),
    second = fixture(t);
  first.store.put("runs", {
    id: "run-shared",
    taskId: "sample-task",
    provider: "openhands",
    providerSessionId: "conversation-alpha",
    mode: "implement",
    state: "running",
  });
  second.store.put("runs", {
    id: "run-shared",
    taskId: "sample-task",
    provider: "openhands",
    providerSessionId: "conversation-beta",
    mode: "implement",
    state: "running",
  });
  const server = startWorkspaceHostServer({
    workspaceManager: manager([
      runtime("alpha", "Alpha", first.store),
      runtime("beta", "Beta", second.store),
    ]),
    port: 0,
    hostInstanceId: "host-test",
  });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`,
    surface = await json(
      await fetch(base + "/api/workspaces/alpha/openhands-surface", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-shared" }),
      }),
    );
  assert.equal(
    surface.host,
    base + "/api/workspaces/alpha/openhands/run-shared",
  );
  assert.equal(surface.conversationId, "conversation-alpha");

  const accepted = await fetch(surface.host + "/api/auth/workspace-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-API-Key": surface.apiKey,
    },
    body: "{}",
  });
  assert.equal(accepted.status, 204);

  const crossed = await fetch(
    base +
      "/api/workspaces/beta/openhands/run-shared/api/auth/workspace-session",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": surface.apiKey,
      },
      body: "{}",
    },
  );
  assert.equal(crossed.status, 403);
  assert.match((await crossed.json()).error, /capability refused/i);
});

test("host lifecycle and concurrency controls remain workspace-scoped", async (t) => {
  const first = fixture(t),
    second = fixture(t),
    workspaceManager = manager([
      runtime("alpha", "Alpha", first.store),
      runtime("beta", "Beta", second.store),
    ]),
    server = startWorkspaceHostServer({
      workspaceManager,
      port: 0,
      hostInstanceId: "host-test",
    });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const concurrency = await json(
    await fetch(
      base + "/api/workspaces/beta/operations/workspace.concurrency.configure",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { limit: 0 } }),
      },
    ),
  );
  assert.equal(concurrency.result.concurrency.limit, 0);
  assert.equal((await workspaceManager.open("alpha")).concurrency.limit, 2);

  const stopped = await json(
    await fetch(base + "/api/workspaces/beta/lifecycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    }),
  );
  assert.equal(stopped.result.state, "stopped");
  assert.deepEqual(workspaceManager.lifecycle, [["stop", "beta"]]);

  const selected = await json(
    await fetch(base + "/api/workspaces/default", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "beta" }),
    }),
  );
  assert.equal(selected.defaultWorkspace, "beta");
});

test("host registration creates a workspace without changing the default", async (t) => {
  const first = fixture(t),
    workspaceManager = manager([runtime("alpha", "Alpha", first.store)]),
    server = startWorkspaceHostServer({
      workspaceManager,
      port: 0,
      hostInstanceId: "host-test",
    });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const added = await json(
    await fetch(base + "/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "beta",
        root: "/tmp/beta",
        name: "Beta",
        enabled: false,
        maxConcurrentRuns: 5,
      }),
    }),
  );
  assert.equal(added.workspaceId, "beta");
  assert.equal(added.result.name, "Beta");
  assert.equal(added.result.concurrency.limit, 5);

  const listed = await json(await fetch(base + "/api/workspaces"));
  assert.equal(listed.defaultWorkspace, "alpha");
  assert.deepEqual(
    listed.items.map((item) => item.id),
    ["alpha", "beta"],
  );
  const detail = await json(await fetch(base + "/api/workspaces/beta"));
  assert.equal(detail.state, "stopped");
  assert.equal(detail.workspaceId, "beta");
  assert.equal(detail.workspaceInstanceEpoch, null);
});
