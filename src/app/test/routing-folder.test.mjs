// Found in live check 2: with the routing prompt on, a leaf whose chat folder
// has no project directory opened a new routing chat every few ticks, since
// its pick was dropped after placement. It now waits before placement.
import assert from "node:assert/strict";
import test from "node:test";
import { PROMPT, workspace } from "./fixtures/crews/workspace.mjs";
import { routerBatch } from "../router.mjs";

test("a leaf whose chat folder has no project directory asks no routing chat", async (t) => {
  const env = await workspace(t, {
      machine: PROMPT,
      crews: { local: { tags: ["trust:local"], chatLimit: 4 } },
    }),
    { ops, store } = env;
  store.setMeta("routing.models", {
    models: ["model-a", "model-b"],
    readAt: new Date().toISOString(),
  });
  const tick = (folders) =>
    ops.execute("workspace.tick", { cron: true, sessions: [], folders });
  const waiting = await tick({ Avoozl: false, "Avoozl/app": false });
  assert.deepEqual(
    waiting.dispatch.filter((d) => d.role === "router"),
    [],
    "no routing chat",
  );
  assert.ok(!routerBatch(store));
  assert.ok(
    waiting.notify.some((n) => /Set the project directory/.test(n.title)),
  );
  // Set: the routing chat opens for the ready leaves.
  const set = await tick({ Avoozl: false, "Avoozl/app": true });
  assert.equal(set.dispatch.filter((d) => d.role === "router").length, 1);
});
