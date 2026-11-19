import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";

test("prompt search moved to Kiro Crew and changes no task", async (t) => {
  const { store } = fixture(t),
    before = JSON.stringify(store.read().tasks),
    ops = new Operations(store);
  const moved = await ops.execute("search.prompt", {
    prompt: "Find the fixture",
    submissionId: "search-fixture",
  });
  assert.equal(moved.moved, true);
  assert.equal(JSON.stringify(store.read().tasks), before);
});
