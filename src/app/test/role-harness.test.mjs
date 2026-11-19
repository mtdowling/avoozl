// Settings › Models picks a harness per role (R98.3, R98.4, design §4.28).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { harnessExecutor, roleHarness } from "../settings/chat-models.mjs";
import { deliveryPolicy, planReadyDispatches } from "../delivery/delivery.mjs";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
} from "../executors/harness-definitions.mjs";
import { Operations } from "../api/operations.mjs";
import { newPlanStarts } from "../specs/new-plan.mjs";
import { Store } from "../store/store.mjs";
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

test("a role's harness is kirocrew, a harness name or auto", () => {
  assert.equal(
    roleHarness({ roles: { worker: { harness: "auto" } } }, "worker"),
    null,
  );
  assert.equal(roleHarness({}, "worker"), null);
  assert.equal(
    roleHarness({ roles: { worker: { harness: "codex" } } }, "worker"),
    "codex",
  );
  assert.deepEqual(harnessExecutor("kirocrew"), { executor: "kirocrew" });
  assert.deepEqual(harnessExecutor("codex"), {
    executor: "process",
    harness: "codex",
  });
});

test("a worker runs on the saved harness, else its repository's", (t) => {
  const root = temporaryDirectory("avoozl-role-harness-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: [leaf("plain")],
    edges: [],
  });
  store.put("repositories", {
    id: "r1",
    root: temporaryDirectory("avoozl-r1-"),
  });
  const policy = deliveryPolicy({ lanes: { local: 5 }, delivery: {} });
  const run = (options) =>
    Object.fromEntries(
      planReadyDispatches(store, policy, options).map((d) => [
        d.task,
        [d.executor, d.harness ?? null],
      ]),
    );
  const saved = { config: { roles: { worker: { harness: "claude-code" } } } };
  assert.deepEqual(run({}), { plain: ["kirocrew", null] });
  assert.deepEqual(run(saved), { plain: ["process", "claude-code"] });
  // A process worker's brief ends with the result file, as a repository on
  // process does; a chat's keeps the runner report.
  const brief = (options) =>
    planReadyDispatches(store, policy, options)[0].brief;
  assert.match(brief(saved), /result\.json/);
  assert.doesNotMatch(brief({}), /result\.json/);
  // A repository on process with nothing named keeps its own harness.
  store.put("repositories", {
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
    JSON.stringify({ version: 1, roles: { retro: { model: "m1" } } }) + "\n",
  );
  const harnesses = path.join(configDirectory, "harnesses");
  fs.mkdirSync(harnesses);
  const bytes = Buffer.from(
    '{"name": "fake-cli", "model": ["--model", "{model}"]}\n',
  );
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
  assert.deepEqual(before.roles, { retro: { model: "m1" } });
  assert.deepEqual(before.harnessDefinitions, [
    {
      name: "fake-cli",
      path: path.join(harnesses, "fake-cli.json"),
      hash: harnessDefinitionHash(bytes),
      approved: true,
      changed: false,
      model: true,
      readRoles:
        "fake-cli names no resultAllow, so a read-only session cannot write its result file.",
      proved: [],
    },
    {
      name: "other-cli",
      path: path.join(harnesses, "other-cli.json"),
      hash: harnessDefinitionHash(Buffer.from("{}\n")),
      approved: false,
      changed: false,
      model: false,
      readRoles:
        "other-cli names no resultAllow, so a read-only session cannot write its result file.",
      proved: [],
    },
  ]);
  await assert.rejects(
    ops.execute(
      "models.settings.update",
      {
        roles: { worker: { harness: "fake-cli" } },
        expectedHash: before.hash,
      },
      undefined,
      { mcp: true },
    ),
    (e) => e.status === 403,
  );
  const table = {
    retro: { model: "m1" },
    worker: { harness: "fake-cli" },
    planner: { harness: "kirocrew" },
  };
  const saved = await ops.execute("models.settings.update", {
    roles: table,
    expectedHash: before.hash,
  });
  assert.deepEqual(saved.roles, table);
  const file = () =>
    JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"));
  // The save writes `roles` and drops the older `models` (R98.9).
  assert.deepEqual(file().roles, table);
  assert.equal(file().models, undefined);
  await assert.rejects(
    ops.execute("models.settings.update", {
      roles: { worker: { harness: "Bad Name" } },
      expectedHash: saved.hash,
    }),
    /harness name/,
  );
  const cleared = await ops.execute("models.settings.update", {
    roles: {},
    expectedHash: saved.hash,
  });
  assert.deepEqual(cleared.roles, {});
  assert.equal(file().roles, undefined);
  // Without a machine config folder there is nothing to list.
  const bare = new Operations(store, { workspaceRoot: root });
  assert.deepEqual(
    (await bare.execute("models.settings.get", {})).harnessDefinitions,
    [],
  );
});

test("the planner's saved harness wins over its repository's executor", (t) => {
  const root = temporaryDirectory("avoozl-role-harness-planner-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize(snapshot());
  const checkout = path.join(root, "app");
  store.put("repositories", { id: "app", root: checkout });
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
  store.put("repositories", { id: "app", root: checkout, executor: "process" });
  const [back] = newPlanStarts(store, { harness: "kirocrew" });
  assert.equal(back.executor, "kirocrew");
  assert.equal(back.worktree, checkout);
});
