import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  chatModel,
  validateModels,
  validatePlanReview,
  withChatModels,
} from "../chat-models.mjs";
import { loadLayeredConfig } from "../layered-config.mjs";
import { Operations } from "../operations.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { Store } from "../store.mjs";
import { readDeliveryPolicy } from "../tick.mjs";
import { temporaryDirectory } from "./temporary.mjs";

test("plan reviewers must differ from a named planner; auto is unset", () => {
  assert.throws(
    () =>
      validateModels({ planner: "fake-writer", planReviewer: "fake-writer" }),
    /planReviewer must differ/,
  );
  for (const models of [
    { planner: "auto", planReviewer: "auto" },
    { planner: "fake-writer", planReviewer: "auto" },
    { planner: "auto", planReviewer: "fake-reviewer" },
    { planReviewer: "fake-reviewer" },
    { planner: "fake-writer", planReviewer: "fake-reviewer" },
  ])
    assert.deepEqual(validateModels(models), models);
  assert.equal(
    chatModel({ models: { planReviewer: "auto" } }, "planReviewer"),
    null,
  );
  assert.deepEqual(
    withChatModels([{ role: "plan-review", task: "draft" }], {
      models: { planReviewer: "fake-reviewer" },
    }),
    [{ role: "plan-review", task: "draft", model: "fake-reviewer" }],
  );
});

test("plan review defaults to one auto round and rejects invalid settings", () => {
  assert.deepEqual(validatePlanReview(), { mode: "auto", rounds: 1 });
  assert.deepEqual(validatePlanReview({}), { mode: "auto", rounds: 1 });
  for (const mode of ["auto", "ask", "off"])
    for (const rounds of [1, 2, 3])
      assert.deepEqual(validatePlanReview({ mode, rounds }), { mode, rounds });
  for (const mode of ["", "later", null, false, 1])
    assert.throws(() => validatePlanReview({ mode }), /planReview.mode/);
  for (const rounds of [0, 4, 1.5, "2", null, false])
    assert.throws(() => validatePlanReview({ rounds }), /planReview.rounds/);
  for (const value of [null, [], "auto"])
    assert.throws(() => validatePlanReview(value), /must be an object/);
  assert.throws(() => validatePlanReview({ round: 2 }), /not a setting/);
});

test("Settings saves the reviewer, preserves review settings and refuses equal models without writing", async (t) => {
  const root = temporaryDirectory("avoozl-plan-review-settings-"),
    filename = path.join(root, ".avoozl.json"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(
    filename,
    JSON.stringify({
      version: 1,
      planReview: { mode: "ask", rounds: 2 },
    }),
  );
  const configuration = new RepositorySettings(store, { workspaceRoot: root }),
    ops = new Operations(store, { workspaceRoot: root, configuration }),
    before = await ops.execute("models.settings.get"),
    models = { planner: "fake-writer", planReviewer: "fake-reviewer" },
    roles = {
      planner: { model: "fake-writer" },
      planReviewer: { model: "fake-reviewer" },
    };
  const saved = await ops.execute("models.settings.update", {
    roles,
    expectedHash: before.hash,
  });
  assert.deepEqual(saved.roles, roles);
  assert.deepEqual(JSON.parse(fs.readFileSync(filename, "utf8")), {
    version: 1,
    $schema: "https://avoozl.dev/schema/repository-config-v1.json",
    planReview: { mode: "ask", rounds: 2 },
    roles,
  });
  const text = fs.readFileSync(filename, "utf8");
  await assert.rejects(
    ops.execute("models.settings.update", {
      roles: {
        planner: { model: "fake-writer" },
        planReviewer: { model: "fake-writer" },
      },
      expectedHash: saved.hash,
    }),
    /planReviewer.model must differ/,
  );
  assert.equal(fs.readFileSync(filename, "utf8"), text);

  for (const planReview of [{ mode: "unknown" }, { rounds: 4 }]) {
    await assert.rejects(
      ops.execute("configuration.update", {
        scope: "repository",
        text: JSON.stringify({ version: 1, models, planReview }),
        expectedHash: saved.hash,
      }),
      /planReview\.(mode|rounds)/,
    );
    assert.equal(fs.readFileSync(filename, "utf8"), text);
  }
});

test("file-loaded review settings and effective models are validated across config layers", () => {
  const root = temporaryDirectory("avoozl-plan-review-layers-"),
    configHome = path.join(root, "config"),
    home = path.join(root, "home"),
    globalDirectory = path.join(configHome, "avoozl"),
    filename = path.join(root, ".avoozl.json"),
    load = () =>
      loadLayeredConfig({
        workspaceRoot: root,
        home,
        env: { XDG_CONFIG_HOME: configHome },
      });
  fs.mkdirSync(globalDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(globalDirectory, "config.json"),
    JSON.stringify({
      version: 1,
      models: { planner: "fake-writer" },
    }),
  );
  fs.writeFileSync(
    filename,
    JSON.stringify({ version: 1, planReview: { rounds: 0 } }),
  );
  assert.throws(load, /planReview.rounds/);
  assert.equal(readDeliveryPolicy(root).status, "invalid");
  fs.writeFileSync(
    filename,
    JSON.stringify({ version: 1, models: { planReviewer: "fake-writer" } }),
  );
  assert.throws(load, /planReviewer must differ/);
  fs.writeFileSync(
    filename,
    JSON.stringify({
      version: 1,
      models: { planReviewer: "fake-reviewer" },
      planReview: { mode: "off" },
    }),
  );
  assert.deepEqual(load().config.models, {
    planner: "fake-writer",
    planReviewer: "fake-reviewer",
  });
});

test("saving repository models refuses a collision with an inherited planner before writing", (t) => {
  const root = temporaryDirectory("avoozl-plan-review-inherited-"),
    filename = path.join(root, ".avoozl.json"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(filename, JSON.stringify({ version: 1 }));
  const configuration = new RepositorySettings(store, {
      workspaceRoot: root,
      baseConfig: { models: { planner: "fake-writer" } },
    }),
    before = configuration.readModelSettings(),
    text = fs.readFileSync(filename, "utf8");
  assert.equal(before.roles.planner.model, "fake-writer");
  assert.throws(
    () =>
      configuration.updateModelSettings({
        roles: { planReviewer: { model: "fake-writer" } },
        expectedHash: before.hash,
      }),
    /planReviewer.model must differ/,
  );
  assert.equal(fs.readFileSync(filename, "utf8"), text);
  const saved = configuration.updateModelSettings({
    roles: { planReviewer: { model: "fake-reviewer" } },
    expectedHash: before.hash,
  });
  assert.deepEqual(saved.roles, {
    planner: { model: "fake-writer" },
    planReviewer: { model: "fake-reviewer" },
  });
});
