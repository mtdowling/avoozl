import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import path from "node:path";
import fs from "node:fs";
import { startServer } from "../server.mjs";
import { handleMcp } from "../mcp.mjs";
import { Operations } from "../operations.mjs";
import { fixture, markdown } from "./fixtures.mjs";

test("React UI and editing APIs run on SQLite; HTTP and MCP share task mutations", async (t) => {
  const { root, store } = fixture(t),
    server = startServer({
      dbPath: store.filename,
      port: 0,
      projectionRoot: path.join(root, "docs"),
    });
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const home = await fetch(base);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /\/assets\/.*\.js/);
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(asset);
  assert.equal((await fetch(base + asset)).status, 200);
  const legacy = await (await fetch(base + "/legacy")).text();
  assert.match(legacy, /workspace.mjs/);
  assert.match(legacy, /strip-view/);
  for (const asset of [
    "app.mjs",
    "graph-layout.mjs",
    "workspace.mjs",
    "workspace.css",
    "strip.mjs",
    "progress.mjs",
    "workbench.mjs",
    "page-details.mjs",
  ])
    assert.equal((await fetch(base + "/" + asset)).status, 200);
  fs.mkdirSync(path.join(root, "docs/evidence"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs/evidence/proof.log"),
    "Preserved evidence",
  );
  assert.equal(
    await (await fetch(base + "/source?path=evidence/proof.log")).text(),
    "Preserved evidence",
  );
  assert.equal(
    (await fetch(base + "/source?path=evidence/../workspace.sqlite")).status,
    404,
  );
  store.put("evidence", {
    id: "fixture-evidence",
    taskId: "sample-task",
    runId: "fixture-run",
    stdout: "Passed",
    exitCode: 0,
  });
  assert.equal(
    (await (await fetch(base + "/api/evidence/fixture-evidence")).json())
      .stdout,
    "Passed",
  );
  const graph = await (await fetch(base + "/api/graph?scope=all")).json();
  assert.deepEqual(graph.tasks, graph.nodes);
  const state = await fetch(base + "/api/state"),
    etag = state.headers.get("etag");
  assert.equal(
    (
      await fetch(base + "/database.json", {
        headers: { "If-None-Match": etag },
      })
    ).status,
    304,
  );
  const patch = await fetch(base + "/api/task", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "If-Match": etag },
    body: JSON.stringify({ id: "sample-task", notes: "HTTP update" }),
  });
  assert.equal(patch.status, 200);
  const stale = await fetch(base + "/api/task", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "If-Match": etag },
    body: JSON.stringify({ id: "sample-task", notes: "Stale" }),
  });
  assert.equal(stale.status, 409);
  const mcp = await fetch(base + "/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "plans_update_task",
        arguments: { input: { id: "sample-task", notes: "MCP update" } },
      },
    }),
  });
  assert.equal(mcp.status, 200);
  assert.equal((await mcp.json()).result.isError, undefined);
  const detail = await fetch(base + "/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "task.get",
      input: { id: "sample-task" },
    }),
  });
  assert.equal((await detail.json()).result.notes, "MCP update");
  const ops = server.workspace.ops,
    plan = await ops.execute("plan.create", {
      prompt: "MCP publication proof",
      text: markdown,
    });
  const approved = await fetch(base + "/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "plans_approve_plan",
        arguments: {
          input: {
            id: plan.id,
            expectedHash: plan.hash,
            expectedRevision: store.read().revision,
            approvedBy: "Fixture user",
            evidence: "Explicit fixture approval",
          },
        },
      },
    }),
  });
  assert.equal((await approved.json()).result.isError, undefined);
  assert.ok(
    fs.existsSync(path.join(root, "docs/workspace/plans", plan.id + ".md")),
  );
  const documents = await (await fetch(base + "/api/documents")).json();
  assert.equal(documents.total, 1);
  assert.equal(documents.documents[0].text, undefined);
  assert.ok(Array.isArray(documents.documents[0].taskIds));
  assert.ok(
    (await (await fetch(base + "/api/documents?content=true")).json())
      .documents[0].text,
  );
  const crossOrigin = await fetch(base + "/api/command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.invalid",
    },
    body: "{}",
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await fetch(base + "/../store.mjs")).status, 404);
});
test("MCP approval checks exact revision and owned agent connections cannot approve or merge", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      prompt: "Feature",
      text: markdown,
    });
  const message = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "plans_approve_plan",
      arguments: {
        input: {
          id: plan.id,
          expectedHash: plan.hash,
          expectedRevision: store.read().revision,
          approvedBy: "User",
          evidence: "Explicit instruction",
        },
      },
    },
  };
  const denied = await handleMcp(message, ops, { runId: "run-test" });
  assert.equal(denied.body.result.isError, true);
  assert.equal(store.read().tasks.length, 1);
  const result = await handleMcp(message, ops, {});
  assert.equal(result.body.result.structuredContent.taskIds.length, 2);
  const tools = await handleMcp(
    { jsonrpc: "2.0", id: 3, method: "tools/list" },
    ops,
    { runId: "run-test" },
  );
  assert.equal(
    tools.body.result.tools.some((t) => t.name === "plans_approve_plan"),
    false,
  );
  assert.ok(tools.body.result.tools.some((t) => t.name === "plans_visualize"));
});
test("events replay by durable cursor across database connections", async (t) => {
  const { store } = fixture(t);
  const first = store.event("run-test", "message", { text: "First" });
  const second = store.event("run-test", "message", { text: "Second" });
  assert.deepEqual(
    store.events({ after: first.seq, runId: "run-test" }).map((e) => e.seq),
    [second.seq],
  );
});
test("document hash protects saves while unrelated task revisions can advance", async (t) => {
  const { root, store } = fixture(t),
    { digest } = await import("../../model.mjs");
  store.mutate("Add plan", (data) => {
    data.documents["plan.md"] = {
      id: "plan.md",
      path: "plan.md",
      title: "Plan",
      text: "# Plan",
      hash: digest("# Plan"),
      links: [],
    };
  });
  const server = startServer({
    dbPath: store.filename,
    port: 0,
    projectionRoot: path.join(root, "docs"),
  });
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const initial = await fetch(base + "/api/state"),
    etag = initial.headers.get("etag");
  store.mutate("Other task check-in", (data) => {
    data.tasks[0].notes = "An unrelated update";
  });
  const save = (text) =>
    fetch(base + "/api/document", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": etag },
      body: JSON.stringify({
        id: "plan.md",
        text,
        expectedHash: digest("# Plan"),
      }),
    });
  assert.equal((await save("# Edited plan")).status, 200);
  assert.equal(store.read().tasks[0].notes, "An unrelated update");
  assert.equal((await save("# Stale overwrite")).status, 409);
  assert.equal(store.read().documents["plan.md"].text, "# Edited plan");
});
