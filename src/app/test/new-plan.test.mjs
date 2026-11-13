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
    (error) =>
      /Register a repository/.test(error.message) && error.status === 409,
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

// Spec Builder hand-off: plan.new returns the create body, the steering
// file is written only when asked and never over a changed copy, and the
// tick writes avoozl/manifest.json from Spec Builder's tasks.md.
const steeringPath = (root) =>
  path.join(root, ".kiro", "steering", "avoozl-specs.md");
const builderRequest = (overrides = {}) =>
  request({ handoff: "spec-builder", epic: "rewrite", ...overrides });

test("plan.new preview says whether the steering file is there and records nothing", async (t) => {
  const { root, store, ops } = workspace(t);
  const preview = await ops.execute(
    "plan.new",
    builderRequest({ preview: true }),
  );
  assert.equal(preview.steering.state, "missing");
  assert.equal(preview.steering.path, steeringPath(root));
  assert.match(preview.steering.text, /Do not write `avoozl\/manifest.json`/);
  assert.deepEqual(pendingNewPlans(store), []);
  assert.equal(fs.existsSync(steeringPath(root)), false);
  // The same field checks run.
  await assert.rejects(
    ops.execute(
      "plan.new",
      builderRequest({ preview: true, epic: "Bad Epic" }),
    ),
    /epic by its spec folder/,
  );
});

test("plan.new for Spec Builder writes the steering file when asked and returns the create body", async (t) => {
  const { root, store, ops } = workspace(t);
  const result = await ops.execute(
    "plan.new",
    builderRequest({ writeSteering: true }),
  );
  assert.equal(result.handoff, "spec-builder");
  assert.equal(result.steering.state, "current");
  assert.ok(
    fs.readFileSync(steeringPath(root), "utf8").includes("# Avoozl spec rules"),
  );
  const body = result.specBuilder;
  assert.equal(body.name, "cache-invalidation");
  assert.equal(body.working_dir, root);
  assert.equal(body.spec_type, "feature");
  for (const needle of [
    "Follow the spec rules in .kiro/steering/avoozl-specs.md.",
    "---\ncategory: Runtime\nepic: rewrite\n---",
    "Phases, as ## headings in tasks.md:\n- Phase 1\n- Phase 2",
    "Repositories in scope",
    "app (",
    "What I want:\nInvalidate the cache when config changes.",
    "Links and context:\nSee issue 12.",
  ])
    assert.ok(body.description.includes(needle), needle);
  assert.equal(pendingNewPlans(store)[0].handoff, "spec-builder");
});

test("a changed steering file is never overwritten, and a declined one puts the rules in the description", async (t) => {
  const { root, ops } = workspace(t);
  const declined = await ops.execute("plan.new", builderRequest());
  assert.equal(fs.existsSync(steeringPath(root)), false);
  assert.ok(declined.specBuilder.description.includes("## Task IDs"));
  assert.ok(!declined.specBuilder.description.includes("inclusion: always"));

  fs.mkdirSync(path.dirname(steeringPath(root)), { recursive: true });
  fs.writeFileSync(steeringPath(root), "# Our own rules\n");
  const kept = await ops.execute(
    "plan.new",
    builderRequest({ writeSteering: true }),
  );
  assert.equal(kept.steering.state, "changed");
  assert.equal(
    fs.readFileSync(steeringPath(root), "utf8"),
    "# Our own rules\n",
  );
  assert.ok(kept.specBuilder.description.includes("Follow the spec rules in"));
});

// What Spec Builder writes: prose and tasks.md, no manifest.
const builderTasks = [
  "# Tasks",
  "",
  "## Phase 1",
  "",
  "- [ ] 1. Load and validate configuration",
  "  - [ ] 1.1 Read the config file",
  "    - A missing file yields defaults.",
  "    - _Checks: `npm test`_",
  "    - _Requirements: 1.1_",
  "  - [ ] 1.2 Validate loaded config",
  "    - An unknown key is reported with its path.",
  "    - _Requires: 1.1_",
  "    - _Checks: `npm test`_",
  "",
].join("\n");
const builderFiles = (tasks = builderTasks) => ({
  "tasks.md": tasks,
  "avoozl/manifest.json": null,
});
const manifestOf = (root) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        ".kiro",
        "specs",
        "cache-invalidation",
        "avoozl",
        "manifest.json",
      ),
      "utf8",
    ),
  );

test("the tick writes the manifest once Spec Builder's tasks.md holds still, then imports a draft", async (t) => {
  const { root, store, ops } = workspace(t);
  await ops.execute("plan.new", builderRequest());
  const before = { approvals: approvals(store), sessions: sessions(store) };
  writeSpec(root, "cache-invalidation", builderFiles());
  const manifestFile = path.join(
    root,
    ".kiro",
    "specs",
    "cache-invalidation",
    "avoozl",
    "manifest.json",
  );

  // First sight of tasks.md: Spec Builder may still be writing it.
  await ops.execute("workspace.tick", {});
  assert.equal(fs.existsSync(manifestFile), false);
  assert.equal(store.get("plans", "cache-invalidation"), null);

  await ops.execute("workspace.tick", {});
  assert.deepEqual(manifestOf(root).tasks, {
    1: {
      kind: "package",
      summary: "Load and validate configuration",
      requires: ["1.1", "1.2"],
    },
    1.1: {
      kind: "leaf",
      summary: "Read the config file",
      checks: ["npm test"],
      repository: "app",
      acceptance: ["A missing file yields defaults."],
    },
    1.2: {
      kind: "leaf",
      summary: "Validate loaded config",
      requires: ["1.1"],
      checks: ["npm test"],
      repository: "app",
      acceptance: ["An unknown key is reported with its path."],
    },
  });
  const plan = store.get("plans", "cache-invalidation");
  assert.equal(plan.state, "draft");
  assert.equal(approvals(store), before.approvals, "never approves");
  assert.equal(sessions(store), before.sessions, "starts no session");

  // A revised tasks.md before approval: the manifest follows it.
  writeSpec(
    root,
    "cache-invalidation",
    builderFiles(
      builderTasks.replace(
        "Validate loaded config",
        "Validate the loaded config",
      ),
    ),
  );
  await ops.execute("workspace.tick", {});
  await ops.execute("workspace.tick", {});
  assert.equal(
    manifestOf(root).tasks["1.2"].summary,
    "Validate the loaded config",
  );

  // A manifest a person edited is never replaced.
  const edited = manifestOf(root);
  edited.tasks["1.2"].checks = ["npm run lint"];
  fs.writeFileSync(manifestFile, JSON.stringify(edited));
  writeSpec(
    root,
    "cache-invalidation",
    builderFiles(
      builderTasks.replace("Read the config file", "Read config.json"),
    ),
  );
  await ops.execute("workspace.tick", {});
  await ops.execute("workspace.tick", {});
  assert.deepEqual(manifestOf(root).tasks["1.2"].checks, ["npm run lint"]);
});
