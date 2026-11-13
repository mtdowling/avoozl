import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";

test("prompt search moved to Kiro Crew, and an old search result still saves its view once", async (t) => {
  const { store } = fixture(t),
    before = JSON.stringify(store.read().tasks),
    ops = new Operations(store);
  const moved = await ops.execute("search.prompt", {
    prompt: "Find the fixture",
    submissionId: "search-fixture",
  });
  assert.equal(moved.moved, true);
  assert.equal(store.list("runs").length, 0);
  // A search the removed agent host ran, as an old workspace holds it.
  const run = store.put("runs", {
    id: "run-search-old",
    taskId: "sample-task",
    state: "completed",
    provider: "codex",
    prompt: "NUPP_PROMPT_SEARCH",
    searchContext: { view: "activity", group: "status" },
    searchPrompt: "Find the fixture",
  });
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
