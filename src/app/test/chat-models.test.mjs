// Settings › Models: the models of Avoozl's own chats, saved in .avoozl.json.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  chatModel,
  resolveRoles,
  roleHarness,
  validateRoles,
  withChatModels,
} from "../chat-models.mjs";
import { deliveryPolicy } from "../delivery.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

test("a role's auto model is no model", () => {
  assert.equal(
    chatModel({ roles: { retro: { model: "auto" } } }, "retro"),
    null,
  );
  assert.equal(chatModel({}, "retro"), null);
});

test("planner and retro dispatches ask for the saved model", () => {
  const config = {
    roles: {
      planner: { model: "p" },
      retro: { model: "r" },
    },
  };
  const out = withChatModels(
    [
      { task: "a", role: "planner" },
      { task: "b", role: "retro", model: "old" },
      { task: "d", role: "review", model: "kept" },
      { task: "e", role: "planner", model: "asked" },
    ],
    config,
  );
  assert.deepEqual(
    out.map((d) => d.model),
    ["p", "r", "kept", "asked"],
  );
  assert.deepEqual(withChatModels([{ role: "planner" }], {}), [
    { role: "planner" },
  ]);
});

test("models.settings saves to .avoozl.json and is a person's", async (t) => {
  const root = temporaryDirectory("avoozl-models-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1 }) + "\n",
  );
  const ops = new Operations(store, { workspaceRoot: root });
  const before = await ops.execute("models.settings.get", {});
  assert.deepEqual(before.roles, {});
  await assert.rejects(
    ops.execute(
      "models.settings.update",
      { roles: { retro: { model: "m1" } }, expectedHash: before.hash },
      undefined,
      { mcp: true },
    ),
    (e) => e.status === 403,
  );
  const saved = await ops.execute("models.settings.update", {
    roles: { retro: { model: "m1" }, planner: { model: "auto" } },
    expectedHash: before.hash,
  });
  assert.deepEqual(saved.roles, {
    retro: { model: "m1" },
    planner: { model: "auto" },
  });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8")).roles,
    { retro: { model: "m1" }, planner: { model: "auto" } },
  );
  await assert.rejects(
    ops.execute("models.settings.update", {
      roles: { driver: { model: "m1" } },
      expectedHash: saved.hash,
    }),
    /not a role/,
  );
  await assert.rejects(
    ops.execute("models.settings.update", {
      roles: { planner: { agent: "a" } },
      expectedHash: saved.hash,
    }),
    /not a role setting/,
  );
  const cleared = await ops.execute("models.settings.update", {
    roles: {},
    expectedHash: saved.hash,
  });
  assert.deepEqual(cleared.roles, {});
});

// R98.6: one roles table, the only place for a role's agent and model.
test("the roles table names each role's agent and model; the older keys are refused", () => {
  const config = {
    delivery: { investigate: { mode: "all" } },
    roles: {
      worker: { agent: "w-agent", model: "w-new", harness: "codex" },
      falsifier: { agent: "f-agent", model: "auto" },
      planner: { harness: "kirocrew", model: "p-old" },
      retro: { model: "r-new" },
    },
  };
  assert.equal(chatModel(config, "planner"), "p-old");
  assert.equal(chatModel(config, "retro"), "r-new");
  assert.equal(roleHarness(config, "planner"), "kirocrew");
  assert.equal(roleHarness(config, "worker"), "codex");
  // The delivery policy's worker and falsifier come from the table.
  const policy = deliveryPolicy(config);
  assert.equal(policy.agent, "w-agent");
  assert.equal(policy.model, "w-new");
  assert.deepEqual(policy.investigate, {
    mode: "all",
    agent: "f-agent",
    model: "auto",
  });
  assert.equal(deliveryPolicy({ delivery: {} }).agent, "kirocrew-worker");
  // Nearby inputs: each older spelling of a role's agent or model.
  for (const [delivery, key] of [
    [{ agent: "old" }, /delivery\.agent/],
    [{ model: "old" }, /delivery\.model/],
    [{ investigate: { agent: "old" } }, /roles\.falsifier\.agent/],
    [{ investigate: { model: "old" } }, /roles\.falsifier\.model/],
  ])
    assert.throws(() => deliveryPolicy({ delivery }), key);
  assert.deepEqual(resolveRoles({ flow: { retro: { model: "r-old" } } }), {});
  // A review role that must differ checks the table's worker model.
  assert.throws(
    () =>
      deliveryPolicy({
        delivery: {
          reviewers: [{ id: "r", focus: "f", agent: "a", model: "w-new" }],
        },
        roles: { worker: { model: "w-new" } },
      }),
    /must differ from the writer's model w-new/,
  );
});

test("roles names only known roles and fields; agent only for the worker and falsifier", () => {
  const ok = {
    worker: { harness: "claude-code", agent: "w", model: "m" },
    falsifier: { agent: "f", model: "auto" },
    retro: { harness: "auto" },
  };
  assert.deepEqual(validateRoles({ roles: ok }), ok);
  assert.deepEqual(validateRoles({}), {});
  assert.throws(() => validateRoles({ roles: [] }), /roles must be an object/);
  assert.throws(() => validateRoles({ roles: { coder: {} } }), /not a role/);
  assert.throws(
    () => validateRoles({ roles: { retro: "m" } }),
    /must be an object/,
  );
  assert.throws(
    () => validateRoles({ roles: { planner: { agent: "a" } } }),
    /planner.agent is not a role setting/,
  );
  assert.throws(
    () => validateRoles({ roles: { worker: { harness: "Bad" } } }),
    /harness name/,
  );
  assert.throws(
    () => validateRoles({ roles: { worker: { agent: "bad agent" } } }),
    /agent name/,
  );
  assert.throws(
    () =>
      validateRoles({
        roles: { planner: { model: "same" }, planReviewer: { model: "same" } },
      }),
    /planReviewer.model must differ/,
  );
});

// R98.9: a Models save writes `roles`; Delivery's own save leaves it alone
// and keeps delivery on.
test("a Models save writes roles, and a Delivery save keeps them", (t) => {
  const root = temporaryDirectory("avoozl-roles-move-"),
    filename = path.join(root, ".avoozl.json"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(
    filename,
    JSON.stringify({
      version: 1,
      roles: { planner: { model: "p1" }, worker: { harness: "claude-code" } },
      delivery: {},
    }),
  );
  const settings = new RepositorySettings(store, { workspaceRoot: root });
  const delivered = settings.updateDeliverySettings({
    delivery: { investigate: { mode: "off" } },
    expectedHash: settings.readDeliverySettings().hash,
  });
  assert.deepEqual(delivered.delivery.investigate, { mode: "off" });
  const before = settings.readModelSettings();
  assert.deepEqual(before.roles, {
    worker: { harness: "claude-code" },
    planner: { model: "p1" },
  });
  for (const delivery of [{ agent: "x" }, { ship: "manual" }])
    assert.throws(
      () =>
        settings.updateDeliverySettings({
          delivery,
          expectedHash: before.hash,
        }),
      /not set here/,
    );
  const roles = {
    ...before.roles,
    worker: { harness: "claude-code", agent: "alt-worker", model: "w1" },
  };
  const saved = settings.updateModelSettings({
    roles,
    expectedHash: before.hash,
  });
  assert.deepEqual(saved.roles, roles);
  const file = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.deepEqual(file.roles, roles);
  assert.deepEqual(file.delivery, { investigate: { mode: "off" } });
  assert.equal(deliveryPolicy(file).agent, "alt-worker");
});
