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

test("planner, retro and review-draft dispatches ask for the saved model", () => {
  const config = {
    roles: {
      planner: { model: "p" },
      retro: { model: "r" },
      reviewDraft: { model: "d" },
    },
  };
  const out = withChatModels(
    [
      { task: "a", role: "planner" },
      { task: "b", role: "retro", model: "old" },
      { task: "c", role: "review-draft" },
      { task: "d", role: "review", model: "kept" },
      { task: "e", role: "planner", model: "asked" },
    ],
    config,
  );
  assert.deepEqual(
    out.map((d) => d.model),
    ["p", "r", "d", "kept", "asked"],
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

// R98.6, R98.8: one roles table; older keys read in silently, `roles` wins.
test("the roles table reads the older keys in, and roles wins field by field", () => {
  const older = {
    delivery: {
      agent: "old-worker",
      model: "w-old",
      investigate: { mode: "all", agent: "old-falsifier", model: "f-old" },
    },
    flow: { retro: { model: "r-old" } },
  };
  assert.deepEqual(resolveRoles(older), {
    retro: { model: "r-old" },
    worker: { agent: "old-worker", model: "w-old" },
    falsifier: { agent: "old-falsifier", model: "f-old" },
  });
  const config = {
    ...older,
    roles: {
      worker: { model: "w-new", harness: "codex" },
      falsifier: { model: "auto" },
      planner: { harness: "kirocrew", model: "p-old" },
    },
  };
  assert.equal(chatModel(config, "planner"), "p-old");
  assert.equal(roleHarness(config, "planner"), "kirocrew");
  assert.equal(roleHarness(config, "worker"), "codex");
  assert.equal(
    chatModel({ flow: { retro: { model: "r-old" } } }, "retro"),
    "r-old",
  );
  // The delivery policy's worker and falsifier come from the table.
  const policy = deliveryPolicy(config);
  assert.equal(policy.agent, "old-worker");
  assert.equal(policy.model, "w-new");
  assert.deepEqual(policy.investigate, {
    mode: "all",
    agent: "old-falsifier",
    model: "auto",
  });
  assert.equal(
    deliveryPolicy({ delivery: {}, roles: { worker: { agent: "a1" } } }).agent,
    "a1",
  );
  assert.equal(deliveryPolicy({ delivery: {} }).agent, "kirocrew-worker");
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

// R98.9: a Models save writes `roles` and drops the older keys; delivery
// stays on, and Delivery's own save keeps an older agent and model.
test("a Models save moves the older delivery and flow keys into roles; Delivery keeps delivery on", (t) => {
  const root = temporaryDirectory("avoozl-roles-move-"),
    filename = path.join(root, ".avoozl.json"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(
    filename,
    JSON.stringify({
      version: 1,
      roles: { planner: { model: "p1" }, worker: { harness: "claude-code" } },
      delivery: {
        agent: "alt-worker",
        model: "w1",
        investigate: { agent: "alt-falsifier" },
        prFeedback: false,
      },
      flow: { retro: { model: "r1" } },
    }),
  );
  const settings = new RepositorySettings(store, { workspaceRoot: root });
  const delivered = settings.updateDeliverySettings({
    delivery: { feedbackRounds: 4 },
    expectedHash: settings.readDeliverySettings().hash,
  });
  assert.equal(delivered.delivery.feedbackRounds, 4);
  const kept = JSON.parse(fs.readFileSync(filename, "utf8")).delivery;
  assert.equal(kept.agent, "alt-worker");
  assert.equal(kept.model, "w1");
  const before = settings.readModelSettings();
  assert.deepEqual(before.roles, {
    retro: { model: "r1" },
    worker: { agent: "alt-worker", model: "w1", harness: "claude-code" },
    falsifier: { agent: "alt-falsifier" },
    planner: { model: "p1" },
  });
  assert.throws(
    () =>
      settings.updateDeliverySettings({
        delivery: { agent: "x" },
        expectedHash: before.hash,
      }),
    /not set here/,
  );
  const saved = settings.updateModelSettings({
    roles: before.roles,
    expectedHash: before.hash,
  });
  assert.deepEqual(saved.roles, before.roles);
  const file = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.deepEqual(file.roles, before.roles);
  for (const key of ["flow"]) assert.equal(file[key], undefined, key);
  assert.deepEqual(file.delivery, { feedbackRounds: 4 });
  assert.equal(deliveryPolicy(file).agent, "alt-worker");
});
