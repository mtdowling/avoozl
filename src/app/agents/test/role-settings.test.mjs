// Settings › Models: the `roles` table (role-table.mjs), saved in .avoozl.json.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  chatModel,
  resolveRoles,
  roleHarness,
  validateRoles,
} from "../role-table.mjs";
import { deliveryPolicy } from "../../delivery/delivery.mjs";
import { RepositorySettings } from "../../settings/repository-settings.mjs";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

test("a role's auto model is no model", () => {
  assert.equal(
    chatModel({ roles: { checkDecide: { model: "auto" } } }, "checkDecide"),
    null,
  );
  assert.equal(chatModel({}, "checkDecide"), null);
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
      { roles: { checkDecide: { model: "m1" } }, expectedHash: before.hash },
      undefined,
      { mcp: true },
    ),
    (e) => e.status === 403,
  );
  const saved = await ops.execute("models.settings.update", {
    roles: { checkDecide: { model: "m1" }, worker: { model: "auto" } },
    expectedHash: before.hash,
  });
  assert.deepEqual(saved.roles, {
    checkDecide: { model: "m1" },
    worker: { model: "auto" },
  });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8")).roles,
    { checkDecide: { model: "m1" }, worker: { model: "auto" } },
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
      roles: { checkDecide: { agent: "a" } },
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
    delivery: {},
    roles: {
      worker: { agent: "w-agent", model: "w-new", harness: "codex" },
      checkDecide: { harness: "kirocrew", model: "d-new" },
    },
  };
  assert.equal(chatModel(config, "checkDecide"), "d-new");
  assert.equal(roleHarness(config, "checkDecide"), "kirocrew");
  assert.equal(roleHarness(config, "worker"), "codex");
  // The delivery policy's worker comes from the table.
  const policy = deliveryPolicy(config);
  assert.equal(policy.agent, "w-agent");
  assert.equal(policy.model, "w-new");
  assert.equal(deliveryPolicy({ delivery: {} }).agent, "kirocrew-worker");
  // Nearby inputs: each older spelling of a role's agent or model.
  for (const [delivery, key] of [
    [{ agent: "old" }, /delivery\.agent/],
    [{ model: "old" }, /delivery\.model/],
    [
      { investigate: { mode: "all" } },
      /delivery\.investigate is not a delivery setting/,
    ],
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

test("roles names only known roles and fields; agent only for the worker", () => {
  const ok = {
    worker: { harness: "claude-code", agent: "w", model: "m" },
    reviewer: { harness: "auto" },
  };
  assert.deepEqual(validateRoles({ roles: ok }), ok);
  assert.deepEqual(validateRoles({}), {});
  assert.throws(() => validateRoles({ roles: [] }), /roles must be an object/);
  assert.throws(() => validateRoles({ roles: { coder: {} } }), /not a role/);
  assert.throws(
    () => validateRoles({ roles: { reviewer: "m" } }),
    /must be an object/,
  );
  assert.throws(
    () => validateRoles({ roles: { checkDecide: { agent: "a" } } }),
    /checkDecide.agent is not a role setting/,
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
    () => validateRoles({ roles: { reviewer: { model: "m" } } }),
    /reviewer.model is not a role setting/,
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
      roles: {
        checkDecide: { model: "p1" },
        worker: { harness: "claude-code" },
      },
      delivery: {},
    }),
  );
  const settings = new RepositorySettings(store, { workspaceRoot: root });
  const delivered = settings.updateDeliverySettings({
    landingPr: "ready",
    expectedHash: settings.readDeliverySettings().hash,
  });
  assert.equal(delivered.landingPr, "ready");
  const before = settings.readModelSettings();
  assert.deepEqual(before.roles, {
    worker: { harness: "claude-code" },
    checkDecide: { model: "p1" },
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
  assert.deepEqual(file.delivery, {});
  assert.equal(deliveryPolicy(file).agent, "alt-worker");
});
