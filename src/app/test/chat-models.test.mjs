// Settings › Models: the models of Avoozl's own chats, saved in .avoozl.json.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { chatModel, validateModels, withChatModels } from "../chat-models.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

test("models names only Avoozl's own roles, each a model name or auto", () => {
  assert.deepEqual(validateModels({ planner: "m1", retro: "auto" }), {
    planner: "m1",
    retro: "auto",
  });
  assert.throws(() => validateModels({ worker: "m1" }), /not a role/);
  assert.throws(() => validateModels({ retro: "" }), /model name or "auto"/);
  // The removed driver chat's role still loads from an old file, and is dropped.
  assert.deepEqual(validateModels({ driver: "m1", retro: "r" }), {
    retro: "r",
  });
  assert.throws(() => validateModels([]), /must be an object/);
  assert.equal(chatModel({ models: { retro: "auto" } }, "retro"), null);
  assert.equal(chatModel({}, "retro"), null);
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
      { models: { retro: "m1" }, expectedHash: before.hash },
      undefined,
      { mcp: true },
    ),
    (e) => e.status === 403,
  );
  const saved = await ops.execute("models.settings.update", {
    models: { retro: "m1", planner: "auto" },
    expectedHash: before.hash,
  });
  assert.deepEqual(saved.models, { retro: "m1", planner: "auto" });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8")).models,
    { retro: "m1", planner: "auto" },
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
