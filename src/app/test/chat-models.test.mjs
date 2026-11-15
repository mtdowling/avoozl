// Settings › Models: the models of Avoozl's own chats, saved in .avoozl.json.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  applyDriverModel,
  chatModel,
  validateModels,
  withChatModels,
} from "../chat-models.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

test("models names only Avoozl's own roles, each a model name or auto", () => {
  assert.deepEqual(validateModels({ planner: "m1", retro: "auto" }), {
    planner: "m1",
    retro: "auto",
  });
  assert.throws(() => validateModels({ worker: "m1" }), /not a role/);
  assert.throws(() => validateModels({ driver: "" }), /model name or "auto"/);
  assert.throws(() => validateModels([]), /must be an object/);
  assert.equal(chatModel({ models: { driver: "auto" } }, "driver"), null);
  assert.equal(chatModel({}, "driver"), null);
});

test("planner, retro and review-draft dispatches ask for the saved model", () => {
  const config = { models: { planner: "p", retro: "r", reviewDraft: "d" } };
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

test("the driver chat gets its saved model once per chat and model", async () => {
  const calls = [],
    switcher = async (slot, model) => (calls.push([slot, model]), { ok: true }),
    applied = new Map();
  const ask = (model) =>
    applyDriverModel({ slot: "s1", model, switcher, applied });
  assert.deepEqual(await ask("m1"), { slot: "s1", model: "m1", ok: true });
  assert.equal(await ask("m1"), null);
  await ask("m2");
  assert.equal(await ask(null), null);
  assert.deepEqual(calls, [
    ["s1", "m1"],
    ["s1", "m2"],
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
  assert.deepEqual(before.models, {});
  await assert.rejects(
    ops.execute(
      "models.settings.update",
      { models: { driver: "m1" }, expectedHash: before.hash },
      undefined,
      { mcp: true },
    ),
    (e) => e.status === 403,
  );
  const saved = await ops.execute("models.settings.update", {
    models: { driver: "m1", planner: "auto" },
    expectedHash: before.hash,
  });
  assert.deepEqual(saved.models, { driver: "m1", planner: "auto" });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8")).models,
    { driver: "m1", planner: "auto" },
  );
  await assert.rejects(
    ops.execute("models.settings.update", {
      models: { worker: "m1" },
      expectedHash: saved.hash,
    }),
    /not a role/,
  );
  const cleared = await ops.execute("models.settings.update", {
    models: {},
    expectedHash: saved.hash,
  });
  assert.deepEqual(cleared.models, {});
});
