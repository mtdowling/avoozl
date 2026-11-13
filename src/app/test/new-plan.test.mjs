// New plan (Plans page): plan.new checks the fields, runs content rules on
// the seed and records the request; the tick imports the folder as a draft
// once it lints clean. It never approves, starts work or pushes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { pendingNewPlans } from "../new-plan.mjs";
import { fixture } from "./fixtures.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

function workspace(t, { repositories = ["app"], contentRules } = {}) {
  const { root, store } = fixture(t);
  if (contentRules) {
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, contentRules: contentRules.policy }),
    );
    const dir = path.join(root, ".avoozl", "local", "content-rules");
    fs.mkdirSync(dir, { recursive: true });
    for (const [id, text] of Object.entries(contentRules.terms))
      fs.writeFileSync(path.join(dir, `${id}.txt`), text);
  }
  for (const id of repositories)
    store.put("projects", {
      id,
      name: id,
      root: temporaryDirectory(`avoozl-repo-${id}-`),
    });
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

const request = (overrides = {}) => ({
  name: "cache-invalidation",
  category: "Runtime",
  epics: ["Phase 1", "Phase 2"],
  repositories: ["app"],
  goal: "Invalidate the cache when config changes.",
  context: "See issue 12.",
  ...overrides,
});

// Every repository-named leaf, so the folder lints clean for project `app`.
function cleanSpec() {
  const files = specFiles(),
    manifest = JSON.parse(files["avoozl/manifest.json"]);
  for (const entry of Object.values(manifest.tasks))
    if (entry.kind === "leaf") entry.repository = "app";
  return { "avoozl/manifest.json": JSON.stringify(manifest, null, 2) };
}

const approvals = (store) => store.list("approvals").length;
const sessions = (store) => {
  try {
    return store.list("session_bindings").length;
  } catch {
    return 0;
  }
};

test("plan.new returns a planner seed with Avoozl's spec rules and records the request", async (t) => {
  const { root, store, ops } = workspace(t);
  const result = await ops.execute("plan.new", request());
  assert.equal(result.agent, "avoozl-planner");
  assert.equal(result.name, "cache-invalidation");
  assert.equal(
    result.folder,
    path.join(root, ".kiro", "specs", "cache-invalidation"),
  );
  for (const needle of [
    "Mode: draft.",
    `Write only inside: ${result.folder}/.`,
    "requirements.md",
    "design.md",
    "tasks.md",
    "avoozl/manifest.json",
    "unique task ID",
    "category: Runtime",
    "Repositories: app.",
    "Do not approve it",
    "Invalidate the cache when config changes.",
    "- Phase 2",
    "See issue 12.",
  ])
    assert.ok(result.message.includes(needle), needle);
  assert.deepEqual(
    pendingNewPlans(store).map((entry) => entry.name),
    ["cache-invalidation"],
  );
  // Asking again for the same name replaces the request.
  await ops.execute("plan.new", request({ goal: "Second try." }));
  assert.deepEqual(
    pendingNewPlans(store).map((entry) => entry.goal),
    ["Second try."],
  );
  assert.equal(store.list("plans").filter((p) => p.spec).length, 0);
});

test("plan.new refuses bad names, duplicates, missing repositories and an empty goal", async (t) => {
  const { root, store, ops } = workspace(t);
  const refuses = (input, pattern, status = 400) =>
    assert.rejects(
      ops.execute("plan.new", request(input)),
      (error) => pattern.test(error.message) && error.status === status,
    );
  await refuses({ name: "has spaces" }, /lowercase letters/);
  await refuses({ name: "a/b" }, /lowercase letters/);
  await refuses({ name: "../escape" }, /lowercase letters/);
  await refuses({ name: "" }, /lowercase letters/);
  await refuses({ goal: "  " }, /What you want is required/);
  await refuses({ repositories: [] }, /at least one repository/);
  await refuses({ repositories: ["nope"] }, /not a registered repository/, 404);
  await refuses({ category: "a: b" }, /Category may not use/);
  await refuses({ epics: ["two\nlines"] }, /one line/);
  writeSpec(root, "taken");
  await refuses({ name: "taken" }, /already exists/, 409);
  await ops.execute("plan.create", { spec: "taken" });
  await refuses({ name: "taken" }, /plan named taken already exists/, 409);
  assert.deepEqual(pendingNewPlans(store), []);
});

test("plan.new with no registered repository says to register one", async (t) => {
  const { ops } = workspace(t, { repositories: [] });
  await assert.rejects(
    ops.execute("plan.new", request()),
    (error) => /Register a repository/.test(error.message) && error.status === 409,
  );
});

test("plan.new is the page's alone: agents and MCP are refused", async (t) => {
  const { ops } = workspace(t);
  for (const context of [{ caller: "agent" }, { mcp: true }])
    await assert.rejects(
      ops.perform("plan.new", request(), undefined, context),
      (error) => error.status === 403,
    );
});

test("content rules run on the seed: a blocked term refuses and records nothing", async (t) => {
  const { store, ops } = workspace(t, {
    contentRules: {
      policy: { sets: [{ id: "fake-terms" }] },
      terms: { "fake-terms": "# fake\ncodename: \\bzorblat\\b\n" },
    },
  });
  await assert.rejects(
    ops.execute("plan.new", request({ goal: "Ship zorblat next week." })),
    (error) => error.status === 422,
  );
  assert.deepEqual(pendingNewPlans(store), []);
  await ops.execute("plan.new", request());
  assert.equal(pendingNewPlans(store).length, 1);
});

test("the tick imports a requested folder as a draft once it lints clean, and never approves or starts work", async (t) => {
  const { root, store, ops } = workspace(t);
  await ops.execute("plan.new", request());
  const before = { approvals: approvals(store), sessions: sessions(store) };

  // No folder yet: the request waits.
  await ops.execute("workspace.tick", {});
  assert.equal(store.get("plans", "cache-invalidation"), null);

  // Half written (no manifest): still waits, with the reason.
  writeSpec(root, "cache-invalidation", { "avoozl/manifest.json": null });
  await ops.execute("workspace.tick", {});
  assert.equal(store.get("plans", "cache-invalidation"), null);
  assert.ok(pendingNewPlans(store)[0].lastError);

  writeSpec(root, "cache-invalidation", cleanSpec());
  await ops.execute("workspace.tick", {});
  const plan = store.get("plans", "cache-invalidation");
  assert.equal(plan.state, "draft");
  assert.equal(plan.spec, "cache-invalidation");
  assert.equal(plan.prompt, request().goal);
  assert.deepEqual(pendingNewPlans(store), []);
  assert.equal(approvals(store), before.approvals, "never approves");
  assert.equal(sessions(store), before.sessions, "starts no session");
  assert.ok(
    !store.read().tasks.some((task) => task.planId === "cache-invalidation"),
    "an unapproved draft adds no tasks",
  );
});
