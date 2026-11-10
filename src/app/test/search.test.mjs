import test from "node:test";
import assert from "node:assert/strict";
import { fixture, runCapability } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { handleMcp } from "../mcp.mjs";
import { addQueryFacet, removeQueryFacet } from "../../facets.mjs";

test("query facets replace exclusive values, retain multiple tags and preserve quoted text", () => {
  assert.equal(
    addQueryFacet('status:planned tag:ffi "byte buffer"', "status:partial"),
    'tag:ffi "byte buffer" status:partial',
  );
  assert.equal(
    addQueryFacet("tag:ffi", "tag:ownership"),
    "tag:ffi tag:ownership",
  );
  assert.equal(addQueryFacet("tag:ffi", "tag:ffi"), "tag:ffi");
  assert.equal(removeQueryFacet("ready:true tag:ffi", "ready:true"), "tag:ffi");
});
test("prompt search is read-only, preserves the current view, and saves validated results once", async (t) => {
  const { store } = fixture(t),
    before = JSON.stringify(store.read().tasks),
    manager = {
      remote: true,
      async start(input) {
        return store.put("runs", {
          ...input,
          id: input.id,
          taskId: "plan:" + input.planId,
          state: "completed",
        });
      },
    },
    ops = new Operations(store, { manager });
  const run = await ops.execute("search.prompt", {
    prompt: "Find the fixture",
    submissionId: "search-fixture",
    provider: "codex",
    projectId: "fixture",
    context: { view: "activity", group: "status" },
  });
  const token = runCapability(store, run.id, "ask");
  const tools = await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ops,
    { runId: run.id, runCapability: token },
  );
  assert.ok(tools.body.result.tools.every((t) => t.annotations.readOnlyHint));
  const denied = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "plans_visualize",
        arguments: { title: "Unwanted", view: "graph" },
      },
    },
    ops,
    { runId: run.id, runCapability: token },
  );
  assert.equal(denied.body.result.isError, true);
  assert.equal(store.read().presentation, undefined);
  store.event(run.id, "message", {
    text: JSON.stringify({
      scope: "all",
      query: "id:sample-task",
      explanation: "The fixture task.",
    }),
  });
  const result = await ops.execute("search.result", { id: run.id });
  assert.equal(result.view.view, "activity");
  assert.equal(result.view.group, "status");
  assert.equal(result.view.filters.q, "id:sample-task");
  await ops.execute("search.result", { id: run.id });
  assert.equal(store.read().presentation.views.length, 1);
  assert.equal(JSON.stringify(store.read().tasks), before);
});
test("empty prompt-search IDs mean zero results and unknown IDs cannot enter a saved view", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  store.put("runs", {
    id: "run-empty-search",
    taskId: "sample-task",
    state: "completed",
    provider: "codex",
    prompt: "NUPP_PROMPT_SEARCH",
  });
  store.event("run-empty-search", "message", {
    text: JSON.stringify({ scope: "all", query: "", ids: [] }),
  });
  const result = await ops.execute("search.result", { id: "run-empty-search" });
  assert.equal((await ops.execute("query", result.view.filters)).length, 0);
  store.put("runs", {
    id: "run-invalid-search",
    taskId: "sample-task",
    state: "completed",
    provider: "codex",
    prompt: "NUPP_PROMPT_SEARCH",
  });
  store.event("run-invalid-search", "message", {
    text: JSON.stringify({ scope: "all", query: "", ids: ["invented-task"] }),
  });
  await assert.rejects(
    ops.execute("search.result", { id: "run-invalid-search" }),
    /unknown/,
  );
  assert.equal(store.read().presentation.views.length, 1);
});
