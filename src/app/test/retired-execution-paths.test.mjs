import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { adapterFor } from "../coder-adapter.mjs";
import { groupedCall, GROUPED_TOOLS } from "../mcp-tools.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { workspace, PROMPT } from "./fixtures/crews/workspace.mjs";

test("retired relay aliases resolve and refuse without changing state", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  store.setMeta("routing.relay", {
    slot: "old-relay",
    queue: [{ id: "old-request" }],
  });
  const before = store.getMeta("routing.relay");
  for (const action of Object.keys(GROUPED_TOOLS.plans_relay.actions)) {
    const call = groupedCall("plans_relay", { action });
    assert.equal(call.operation, "relay.call");
    await assert.rejects(
      ops.execute(call.operation, call.input),
      /Remote relay was removed/,
    );
  }
  await assert.rejects(
    ops.execute("relay.forget", {}),
    /Remote relay was removed/,
  );
  assert.deepEqual(store.getMeta("routing.relay"), before);
  assert.throws(() => adapterFor("remote"), /remote coder was removed/);
});

test("legacy relay configuration is readable but cannot be enabled again", async (t) => {
  const env = await workspace(t, { ids: ["w1"] }),
    file = path.join(env.root, ".avoozl.json");
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.routing = { remoteRelay: "on" };
  fs.writeFileSync(file, JSON.stringify(value));
  const view = await env.ops.execute("routing.view", {});
  assert.equal("relay" in view, false);
  await assert.rejects(
    env.ops.execute("routing.update", {
      where: "workspace",
      routing: { remoteRelay: "on" },
      expectedHash: view.configHash,
    }),
    /Remote relay was removed/,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(file, "utf8")).routing.remoteRelay,
    "on",
    "refusal never rewrites an existing configuration",
  );
});

test("multiple permitted models dispatch workers without a router or relay", async (t) => {
  const env = await workspace(t, { ids: ["w1"], machine: PROMPT });
  env.store.setMeta("routing.models", { models: ["model-a", "model-b"] });
  const result = await env.ops.execute("workspace.tick", {
    cron: true,
    sessions: [],
  });
  assert.ok(result.dispatch.some((d) => d.role === "worker"));
  assert.ok(result.dispatch.every((d) => d.role !== "router" && !d.relay));
  assert.equal(env.store.getMeta("routing.router.batch"), null);
});
