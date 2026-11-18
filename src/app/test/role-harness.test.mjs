// Settings › Models picks a harness per role, and a task's `session` pin
// may name one (R98.3, R98.4, design §4.28).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  harnessExecutor,
  roleHarness,
  validateHarnesses,
} from "../chat-models.mjs";
import { deliveryPolicy, planReadyDispatches } from "../delivery.mjs";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
} from "../harness-definitions.mjs";
import { Operations } from "../operations.mjs";
import { newPlanStarts } from "../new-plan.mjs";
import { validateSession } from "../placement.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "r1",
  ...extra,
});

test("harnesses names roles, each kirocrew, a harness name or auto", () => {
  assert.deepEqual(
    validateHarnesses({ worker: "claude-code", planner: "kirocrew" }),
    { worker: "claude-code", planner: "kirocrew" },
  );
  assert.deepEqual(validateHarnesses(undefined), {});
  assert.throws(() => validateHarnesses({ falsifier: "x" }), /not a role/);
  assert.throws(
    () => validateHarnesses({ worker: "Bad Name" }),
    /kirocrew, a harness name or "auto"/,
  );
  assert.throws(() => validateHarnesses([]), /must be an object/);
  assert.equal(roleHarness({ harnesses: { worker: "auto" } }, "worker"), null);
  assert.equal(roleHarness({}, "worker"), null);
  assert.equal(
    roleHarness({ harnesses: { worker: "codex" } }, "worker"),
    "codex",
  );
  assert.deepEqual(harnessExecutor("kirocrew"), { executor: "kirocrew" });
  assert.deepEqual(harnessExecutor("codex"), {
    executor: "process",
    harness: "codex",
  });
});

test("a session pin may name a harness, never auto or a bad name", () => {
  assert.deepEqual(validateSession({ harness: "codex", model: "m" }), {
    harness: "codex",
    model: "m",
  });
  assert.deepEqual(validateSession({ harness: "kirocrew" }), {
    harness: "kirocrew",
  });
  for (const harness of ["auto", "Bad", 3])
    assert.throws(
      () => validateSession({ harness }),
      /harness must be kirocrew or a harness name/,
    );
});

test("a worker runs on its pin's harness, else the saved one, else its project's", (t) => {
  const root = temporaryDirectory("avoozl-role-harness-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [
      leaf("pinned", { session: { harness: "codex" } }),
      leaf("chat", { session: { harness: "kirocrew" } }),
      leaf("plain"),
    ],
    edges: [],
  });
  store.put("projects", { id: "r1", root: temporaryDirectory("avoozl-r1-") });
  const policy = deliveryPolicy({ delivery: { concurrency: 5 } });
  const run = (options) =>
    Object.fromEntries(
      planReadyDispatches(store, policy, options).map((d) => [
        d.task,
        [d.executor, d.harness ?? null],
      ]),
    );
  assert.deepEqual(run({}), {
    pinned: ["process", "codex"],
    chat: ["kirocrew", null],
    plain: ["kirocrew", null],
  });
  assert.deepEqual(run({ harnesses: { worker: "claude-code" } }), {
    pinned: ["process", "codex"],
    chat: ["kirocrew", null],
    plain: ["process", "claude-code"],
  });
  // A process worker's brief ends with the result file, as a project on
  // process does; a chat's keeps the runner report.
  const briefs = Object.fromEntries(
    planReadyDispatches(store, policy, {
      harnesses: { worker: "claude-code" },
    }).map((d) => [d.task, d.brief]),
  );
  assert.match(briefs.plain, /result\.json/);
  assert.doesNotMatch(briefs.chat, /result\.json/);
  // A project on process with nothing named keeps its own harness.
  store.put("projects", {
    id: "r1",
    root: temporaryDirectory("avoozl-r1-"),
    executor: "process",
  });
  assert.deepEqual(run({}).plain, ["process", null]);
});

test("models.settings saves harnesses and lists this machine's definitions", async (t) => {
  const root = temporaryDirectory("avoozl-role-harness-settings-"),
    configDirectory = temporaryDirectory("avoozl-role-harness-config-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, models: { retro: "m1" } }) + "\n",
  );
  const harnesses = path.join(configDirectory, "harnesses");
  fs.mkdirSync(harnesses);
  const bytes = Buffer.from('{"name": "fake-cli", "model": ["--model", "{model}"]}\n');
  fs.writeFileSync(path.join(harnesses, "fake-cli.json"), bytes);
  fs.writeFileSync(path.join(harnesses, "other-cli.json"), "{}\n");
  fs.writeFileSync(path.join(harnesses, "notes.txt"), "not a definition\n");
  approveHarnessDefinition({
    configDirectory,
    name: "fake-cli",
    hash: harnessDefinitionHash(bytes),
  });
  const ops = new Operations(store, { workspaceRoot: root, configDirectory });
  const before = await ops.execute("models.settings.get", {});
  assert.deepEqual(before.harnesses, {});
  assert.deepEqual(before.harnessDefinitions, [
    { name: "fake-cli", approved: true, model: true },
    { name: "other-cli", approved: false, model: false },
  ]);
  await assert.rejects(
    ops.execute(
      "models.settings.update",
      {
        models: {},
        harnesses: { worker: "fake-cli" },
        expectedHash: before.hash,
      },
      undefined,
      { mcp: true },
    ),
    (e) => e.status === 403,
  );
  const saved = await ops.execute("models.settings.update", {
    models: { retro: "m1" },
    harnesses: { worker: "fake-cli", planner: "kirocrew" },
    expectedHash: before.hash,
  });
  assert.deepEqual(saved.harnesses, {
    worker: "fake-cli",
    planner: "kirocrew",
  });
  const file = () =>
    JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"));
  assert.deepEqual(file().harnesses, {
    worker: "fake-cli",
    planner: "kirocrew",
  });
  await assert.rejects(
    ops.execute("models.settings.update", {
      models: {},
      harnesses: { worker: "Bad Name" },
      expectedHash: saved.hash,
    }),
    /harness name/,
  );
  // A save without harnesses keeps them; an empty object removes them.
  const kept = await ops.execute("models.settings.update", {
    models: {},
    expectedHash: saved.hash,
  });
  assert.deepEqual(kept.harnesses, { worker: "fake-cli", planner: "kirocrew" });
  const cleared = await ops.execute("models.settings.update", {
    models: {},
    harnesses: {},
    expectedHash: kept.hash,
  });
  assert.deepEqual(cleared.harnesses, {});
  assert.equal(file().harnesses, undefined);
  // Without a machine config folder there is nothing to list.
  const bare = new Operations(store, { workspaceRoot: root });
  assert.deepEqual(
    (await bare.execute("models.settings.get", {})).harnessDefinitions,
    [],
  );
});

test("the planner's saved harness wins over its project's executor", (t) => {
  const root = temporaryDirectory("avoozl-role-harness-planner-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot(snapshot());
  const checkout = path.join(root, "app");
  store.put("projects", { id: "app", root: checkout });
  store.setMeta("newPlans", [
    {
      name: "cache",
      goal: "x",
      repositories: ["app"],
      brief: "Mode: draft.",
      root: checkout,
      attempt: 1,
    },
  ]);
  const [chat] = newPlanStarts(store, {});
  assert.equal(chat.executor, "kirocrew");
  assert.equal(chat.harness, undefined);
  const [child] = newPlanStarts(store, { harness: "codex" });
  assert.equal(child.executor, "process");
  assert.equal(child.harness, "codex");
  assert.equal(child.worktree, path.join(checkout, ".kiro", "specs", "cache"));
  store.put("projects", { id: "app", root: checkout, executor: "process" });
  const [back] = newPlanStarts(store, { harness: "kirocrew" });
  assert.equal(back.executor, "kirocrew");
  assert.equal(back.worktree, checkout);
});
