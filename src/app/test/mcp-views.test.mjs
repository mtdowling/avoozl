// MCP App views (R20, task 8.5): the four tools that name a ui:// resource, the
// resource itself, and the writes their buttons make.
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { handleMcp } from "../mcp.mjs";
import { createAppMcp } from "../app-mcp.mjs";
import { Operations } from "../operations.mjs";
import { readView, VIEW_URI_LIST, VIEW_URIS } from "../mcp-views.mjs";
import { fixture } from "./fixtures.mjs";

const rpc = (ops, method, params) =>
  handleMcp({ jsonrpc: "2.0", id: 1, method, params }, ops).then(
    (response) => response.body.result,
  );
const call = (ops, name, args) =>
  rpc(ops, "tools/call", { name, arguments: args });

test("four tools name their own ui:// view, and no other tool does", async (t) => {
  const { store } = fixture(t),
    { tools } = await rpc(new Operations(store), "tools/list", {});
  const linked = Object.fromEntries(
    tools
      .filter((tool) => tool._meta?.ui)
      .map((tool) => [tool.name, tool._meta.ui.resourceUri]),
  );
  assert.deepEqual(linked, VIEW_URIS);
});

test("each view reads as one page and its script parses", () => {
  for (const uri of VIEW_URI_LIST) {
    const { contents } = readView(uri),
      [{ mimeType, text }] = contents;
    assert.equal(mimeType, "text/html;profile=mcp-app");
    const script = text.match(/<script>([\s\S]*)<\/script>/)[1];
    new vm.Script(script);
    // Data is set as text, never as markup.
    assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|document\.write/);
  }
  assert.equal(readView("ui://avoozl/other"), null);
});

test("the app's server lists and reads views with no workspace", async () => {
  const server = createAppMcp({ env: {} });
  try {
    const list = (
        await server.handle({ jsonrpc: "2.0", id: 1, method: "resources/list" })
      ).result.resources.map((resource) => resource.uri),
      read = (
        await server.handle({
          jsonrpc: "2.0",
          id: 2,
          method: "resources/read",
          params: { uri: VIEW_URIS.plans_graph },
        })
      ).result.contents[0];
    for (const uri of VIEW_URI_LIST) assert.ok(list.includes(uri), uri);
    assert.match(read.text, /Refresh/);
  } finally {
    server.close();
  }
});

test("plans_graph answers a short grouped graph with its revision", async (t) => {
  const { store } = fixture(t),
    result = await call(new Operations(store), "plans_graph", {});
  assert.equal(result.isError, undefined);
  const view = result.structuredContent;
  assert.equal(view.revision, store.read().revision);
  assert.equal(view.total, 1);
  assert.equal(
    Object.values(view.groups).flatMap((g) => g.tasks)[0].id,
    "sample-task",
  );
});

test("plans_preview names a plan, and a missing one is refused", async (t) => {
  const ops = new Operations(fixture(t).store);
  assert.match(
    (await call(ops, "plans_preview", {})).content[0].text,
    /input\.id/,
  );
  const missing = await call(ops, "plans_preview", { input: { id: "nope" } });
  assert.equal(missing.isError, true);
});

test("plans_decision shows one decision and its Settle button is checked against the revision", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  store.mutate("Open a decision", (data) => {
    data.tasks[0].decision = "pick-a-path";
  });
  const view = (await call(ops, "plans_decision", {})).structuredContent;
  assert.equal(view.open, 1);
  assert.equal(view.decision.taskId, "sample-task");
  const settle = (expectedRevision) =>
    call(ops, "plans_conflicts", {
      action: "settle",
      input: {
        action: "settle",
        items: [{ taskId: "sample-task" }],
        answer: "Take path A.",
      },
      expectedRevision,
    });
  // Another window changed the workspace after the view was drawn.
  store.mutate("Other change", (data) => {
    data.tasks[0].title = "Changed";
  });
  const stale = await settle(view.revision);
  assert.equal(stale.isError, true);
  assert.ok(store.read().tasks[0].decision, "a stale view writes nothing");
  const fresh = await settle(store.read().revision);
  assert.equal(fresh.isError, undefined);
  assert.equal(store.read().tasks[0].decision, undefined);
  assert.equal(
    (await call(ops, "plans_decision", {})).structuredContent.decision,
    null,
  );
});

test("a view cannot approve: plan approval stays refused over MCP", async (t) => {
  const result = await call(
    new Operations(fixture(t).store),
    "plans_approve_plan",
    {
      input: { id: "x" },
    },
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Only a person/);
});
