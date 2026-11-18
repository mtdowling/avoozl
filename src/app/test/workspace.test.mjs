import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applicationRoot, workspaceConfig } from "../config.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { REPOSITORY_CONFIG_SCHEMA_URL } from "../config-schema.mjs";
import { Store } from "../store.mjs";
import { Operations } from "../operations.mjs";
import { seedExample } from "../examples.mjs";
import { createSpecPlan, readSpecFolder } from "../spec-plans.mjs";
import { temporaryDirectory } from "./temporary.mjs";
const exec = promisify(execFile);
function temporary(t) {
  return temporaryDirectory();
}

test("initialization starts empty, refuses replacement, and paths survive moving a workspace", (t) => {
  const root = temporary(t),
    original = path.join(root, "original"),
    moved = path.join(root, "moved workspace");
  initializeWorkspace(original, { name: "A team project", port: 9477 });
  const repositoryConfig = path.join(original, ".avoozl.json");
  assert.equal(fs.existsSync(repositoryConfig), true);
  assert.equal(fs.existsSync(path.join(original, "workspace.json")), false);
  const savedConfig = JSON.parse(fs.readFileSync(repositoryConfig, "utf8"));
  assert.equal(savedConfig.$schema, REPOSITORY_CONFIG_SCHEMA_URL);
  // Only what the person chose is written: no default and no host.
  assert.deepEqual(Object.keys(savedConfig), [
    "$schema",
    "version",
    "name",
    "namespace",
    "port",
  ]);
  assert.equal(savedConfig.port, 9477);
  assert.match(savedConfig.namespace, /^avz_[a-z2-7]{16}$/);
  let config = workspaceConfig({ workspace: original }),
    store = new Store(config.dbPath);
  assert.deepEqual(store.read().tasks, []);
  assert.deepEqual(store.read().documents, {});
  assert.equal(store.read().project.name, "A team project");
  assert.equal(store.list("projects").length, 0);
  assert.equal(store.list("plans").length, 0);
  store.close();
  assert.throws(() => initializeWorkspace(original), /already exists/);
  fs.renameSync(original, moved);
  config = workspaceConfig({ workspace: moved });
  assert.equal(config.endpoint, "http://127.0.0.1:9477");
  assert.equal(config.plansRoot, path.join(moved, "plans"));
  store = new Store(config.dbPath);
  assert.equal(store.read().project.name, "A team project");
  store.close();
});

test("a new workspace has the documented layout and no default-valued keys", async (t) => {
  const root = path.join(temporary(t), "plans");
  const result = initializeWorkspace(root, { name: "My plans" });
  assert.equal(result.port, 9428);
  assert.deepEqual(
    Object.keys(
      JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8")),
    ),
    ["$schema", "version", "name", "namespace"],
  );
  assert.deepEqual(fs.readdirSync(root).sort(), [
    ".avoozl",
    ".avoozl.json",
    ".kiro",
  ]);
  assert.deepEqual(fs.readdirSync(path.join(root, ".kiro", "specs")), []);
  const config = workspaceConfig({ workspace: root });
  assert.equal(
    config.dbPath,
    path.join(root, ".avoozl", "local", "workspace.sqlite"),
  );
  assert.equal(config.plansRoot, path.join(root, "plans"));
  assert.equal(config.port, 9428);
  // Operations given the documents root do not make it until a document is
  // published there, and reindexing reads a missing root as empty.
  const store = new Store(config.dbPath);
  try {
    const ops = new Operations(store, {
      workspaceRoot: root,
      plansRoot: config.plansRoot,
    });
    assert.deepEqual(await ops.execute("query"), []);
    assert.deepEqual((await ops.execute("plan.specs")).items, []);
  } finally {
    store.close();
  }
  const { stdout } = await exec(process.execPath, [
    path.join(applicationRoot, "cli.mjs"),
    "generate",
    "--workspace",
    root,
  ]);
  assert.deepEqual(JSON.parse(stdout), {
    added: 0,
    changed: 0,
    removed: 0,
    newTasks: 0,
  });
  assert.equal(fs.existsSync(path.join(root, "plans")), false);
});

test("a workspace file written by an earlier init loads as before", (t) => {
  const earlier = (documents) => {
    const root = temporary(t);
    initializeWorkspace(root, { name: "Earlier" });
    const file = path.join(root, ".avoozl.json"),
      saved = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          ...saved,
          dbPath: ".avoozl/local/workspace.sqlite",
          documents,
          port: 9431,
          host: "127.0.0.1",
        },
        null,
        2,
      ) + "\n",
    );
    return { root, config: workspaceConfig({ workspace: root }) };
  };
  const plans = earlier("plans");
  assert.equal(plans.config.plansRoot, path.join(plans.root, "plans"));
  assert.equal(
    plans.config.dbPath,
    path.join(plans.root, ".avoozl", "local", "workspace.sqlite"),
  );
  assert.equal(plans.config.port, 9431);
  assert.equal(plans.config.endpoint, "http://127.0.0.1:9431");
  assert.equal(plans.config.name, "Earlier");
  const inPlace = earlier(".");
  assert.equal(inPlace.config.plansRoot, inPlace.root);
  const store = new Store(inPlace.config.dbPath);
  assert.equal(store.read().project.name, "Earlier");
  store.close();
  assert.throws(() => initializeWorkspace(inPlace.root), /already exists/);
});

test("init on a configuration with no database keeps its namespace", (t) => {
  const root = temporary(t);
  initializeWorkspace(root, { name: "Kept", port: 9477 });
  const file = path.join(root, ".avoozl.json"),
    before = fs.readFileSync(file, "utf8"),
    { dbPath } = workspaceConfig({ workspace: root });
  fs.rmSync(dbPath);
  const result = initializeWorkspace(root);
  assert.equal(result.existingConfiguration, true);
  assert.equal(result.dbPath, dbPath);
  assert.equal(result.name, "Kept");
  assert.equal(fs.readFileSync(file, "utf8"), before);
  const store = new Store(dbPath);
  assert.equal(store.read().tasks.length, 0);
  assert.equal(store.read().project.name, "Kept");
  store.close();
  assert.throws(() => initializeWorkspace(root), /already exists/);
});

test("examples preserve user state and edits on retries and keep proposal tasks outside the queue", async (t) => {
  const root = temporary(t);
  initializeWorkspace(root);
  const config = workspaceConfig({ workspace: root }),
    store = new Store(config.dbPath);
  t.after(() => store.close());
  const ops = new Operations(store);
  await ops.execute("task.update", {
    id: "user-task",
    create: true,
    title: "User authored task",
    notes: "Keep this.",
  });
  const result = await ops.execute("workspace.seed", {
    example: "product-launch",
  });
  assert.equal(result.taskIds.length, 8);
  assert.equal(store.read().tasks.length, 9);
  assert.equal(store.list("plans").length, 1);
  assert.equal(store.list("plans")[0].state, "draft");
  assert.equal(store.list("approvals").length, 0);
  assert.equal(store.list("runs").length, 0);
  assert.equal(store.list("projects").length, 0);
  const taskId = result.taskIds[0];
  await ops.execute("task.update", {
    id: taskId,
    title: "My revised scope",
    notes: "User edits survive.",
  });
  const before = structuredClone(store.read());
  const retry = await ops.execute("workspace.seed", {
    example: "product-launch",
  });
  assert.equal(retry.existing, true);
  assert.deepEqual(store.read(), before);
  assert.equal(
    (await ops.execute("task.get", { id: "user-task" })).notes,
    "Keep this.",
  );
  assert(
    !(await ops.execute("query")).some(
      (t) => t.title === "Invite a second pilot group",
    ),
  );
  await assert.rejects(
    ops.execute("workspace.seed", { example: "../../private" }),
    /Unknown example/,
  );
});

test("colliding IDs and stale requests roll back all example data and receipts", async (t) => {
  const root = temporary(t);
  initializeWorkspace(root);
  const store = new Store(workspaceConfig({ workspace: root }).dbPath);
  t.after(() => store.close());
  const ops = new Operations(store),
    revision = store.read().revision;
  await ops.execute("task.update", {
    id: "example-launch-release",
    create: true,
    title: "Existing independent work",
  });
  const before = structuredClone(store.read());
  await assert.rejects(
    ops.execute("workspace.seed", { example: "product-launch" }, revision),
    /changed/,
  );
  await assert.rejects(
    ops.execute("workspace.seed", { example: "product-launch" }),
    /already exists/,
  );
  assert.deepEqual(store.read(), before);
  assert.equal(store.list("plans").length, 0);
  assert.equal(store.get("receipts", "example:product-launch"), null);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM outbox").get().n, 0);
});

function seededWorkspace(t) {
  const root = temporary(t);
  initializeWorkspace(root);
  const store = new Store(workspaceConfig({ workspace: root }).dbPath);
  t.after(() => store.close());
  return {
    root,
    store,
    ops: new Operations(store, { workspaceRoot: root }),
    specs: path.join(root, ".kiro", "specs"),
  };
}

test("the default example is draft spec folders, installed once, edits kept", async (t) => {
  const { store, ops, specs } = seededWorkspace(t);
  const result = await ops.execute("workspace.seed");
  assert.equal(result.example, "recipe-box");
  assert.equal(result.existing, false);
  assert.deepEqual(result.planIds, result.specs);
  for (const spec of result.specs)
    for (const file of [
      "requirements.md",
      "design.md",
      "tasks.md",
      "avoozl/manifest.json",
    ])
      assert(fs.existsSync(path.join(specs, spec, file)), `${spec}/${file}`);
  // Stored as drafts: nothing approved, started or configured, no task.
  assert.deepEqual(
    store
      .list("plans")
      .map((plan) => [plan.id, plan.spec, plan.state])
      .sort(),
    result.specs.map((spec) => [spec, spec, "draft"]).sort(),
  );
  assert.equal(store.list("approvals").length, 0);
  assert.equal(store.list("runs").length, 0);
  assert.equal(store.list("projects").length, 0);
  assert.deepEqual(store.read().tasks, []);
  assert.deepEqual(store.read().epics, []);
  const listed = (await ops.execute("plan.specs")).items;
  assert.deepEqual(
    listed.map((item) => [
      item.name,
      item.plan.state,
      item.plan.approved,
      item.counts.error,
    ]),
    [...result.specs].sort().map((spec) => [spec, "draft", false, 0]),
  );
  assert.equal(listed.find((item) => item.name === "recipe-box").kind, "epic");
  const epics = (await ops.execute("epic.list")).items;
  assert.equal(epics.length, 1);
  assert.equal(epics[0].id, "recipe-box");
  assert.equal(epics[0].approved, false);
  assert.equal(epics[0].members.length, 3);
  // A retry writes nothing: an edited folder and its stored draft stay.
  const edited = path.join(specs, "meal-planner", "design.md");
  fs.writeFileSync(edited, "# My own design\n");
  const before = store.list("plans"),
    retry = await ops.execute("workspace.seed", { example: "recipe-box" });
  assert.equal(retry.existing, true);
  assert.equal(retry.at, result.at);
  assert.equal(fs.readFileSync(edited, "utf8"), "# My own design\n");
  assert.deepEqual(store.list("plans"), before);
  // The earlier pack still loads by name.
  assert.equal(
    (await ops.execute("workspace.seed", { example: "product-launch" })).taskIds
      .length,
    8,
  );
});

test("a spec-folder example that cannot finish leaves no folder, draft or receipt", async (t) => {
  const { root, store, ops, specs } = seededWorkspace(t);
  const empty = () => {
    assert.equal(store.list("plans").length, 0);
    assert.equal(store.get("receipts", "example:recipe-box"), null);
  };
  // A stale request.
  await assert.rejects(
    ops.execute("workspace.seed", {}, store.read().revision + 1),
    /changed/,
  );
  assert.deepEqual(fs.readdirSync(specs), []);
  empty();
  // A failure after the folders were written removes them again.
  let stored = 0;
  assert.throws(
    () =>
      seedExample(store, {}, undefined, {
        specRoot: () => root,
        createDraft: (spec) => {
          if (++stored === 3) throw Error("disk full");
          return createSpecPlan(store, {}, readSpecFolder(root, spec));
        },
      }),
    /disk full/,
  );
  assert.deepEqual(fs.readdirSync(specs), []);
  empty();
  // A folder of the person's own with an example's name is never touched.
  const own = path.join(specs, "meal-planner");
  fs.mkdirSync(own);
  fs.writeFileSync(path.join(own, "tasks.md"), "# Mine\n");
  await assert.rejects(
    ops.execute("workspace.seed"),
    /meal-planner already exists/,
  );
  assert.deepEqual(fs.readdirSync(specs), ["meal-planner"]);
  assert.deepEqual(fs.readdirSync(own), ["tasks.md"]);
  empty();
  // A stored plan with an example's name refuses it too.
  fs.rmSync(own, { recursive: true });
  await ops.execute("plan.create", {
    id: "shopping-list",
    prompt: "My own shopping list plan.",
  });
  await assert.rejects(
    ops.execute("workspace.seed"),
    /shopping-list already exists/,
  );
  assert.deepEqual(fs.readdirSync(specs), []);
  assert.equal(store.get("receipts", "example:recipe-box"), null);
});

test("a spec-folder example is refused where specs live in a repository", async (t) => {
  const root = temporary(t);
  initializeWorkspace(root);
  const store = new Store(workspaceConfig({ workspace: root }).dbPath);
  t.after(() => store.close());
  // No workspace root to write into.
  await assert.rejects(
    new Operations(store).execute("workspace.seed"),
    /no planning repository/,
  );
  // A separate planning checkout: the example is not written into it.
  const checkout = temporary(t);
  store.put("projects", {
    id: "planning",
    name: "Planning",
    root: checkout,
    planning: true,
  });
  await assert.rejects(
    new Operations(store, { workspaceRoot: root }).execute("workspace.seed"),
    /reads its specs from a repository/,
  );
  assert.deepEqual(fs.readdirSync(path.join(root, ".kiro", "specs")), []);
  assert.equal(fs.existsSync(path.join(checkout, ".kiro")), false);
  assert.equal(store.list("plans").length, 0);
});

test("offline skill export binds the chosen workspace without creating data", async (t) => {
  const root = temporary(t),
    workspace = path.join(root, "not-created");
  const args = [
    path.join(applicationRoot, "cli.mjs"),
    "skill",
    "--workspace",
    workspace,
    "--url",
    "http://127.0.0.1:9876",
  ];
  const { stdout } = await exec(process.execPath, args, { cwd: root });
  assert.match(stdout, /^---\nname: avoozl\n/);
  assert(stdout.includes(workspace));
  assert(stdout.includes("http://127.0.0.1:9876/mcp"));
  assert(!stdout.includes("{{"));
  assert.equal(fs.existsSync(workspace), false);
  const command = stdout
    .split("\n")
    .find((line) => line.startsWith("node ") && line.includes(" query "));
  assert(command.includes("--workspace"));
  assert(command.includes(path.join(applicationRoot, "cli.mjs")));
});

test("application, plans, state, and working repository can use independent directories", async (t) => {
  const root = temporary(t),
    workspace = path.join(root, "configuration"),
    plans = path.join(root, "designs"),
    database = path.join(root, "database", "tasks.sqlite");
  fs.mkdirSync(plans);
  fs.writeFileSync(path.join(plans, "existing.md"), "# Existing design\n");
  initializeWorkspace(workspace, { documents: plans, db: database });
  const config = workspaceConfig({ workspace });
  assert.equal(config.plansRoot, plans);
  assert.equal(config.dbPath, database);
  assert.equal(
    fs.readFileSync(path.join(plans, "existing.md"), "utf8"),
    "# Existing design\n",
  );
  const cli = async (args) =>
    JSON.parse(
      (
        await exec(
          process.execPath,
          [
            path.join(applicationRoot, "cli.mjs"),
            "--workspace",
            workspace,
            ...args,
          ],
          { cwd: root },
        )
      ).stdout,
    );
  // A layout the person chose is written, as a portable relative path.
  const saved = JSON.parse(
    fs.readFileSync(path.join(workspace, ".avoozl.json"), "utf8"),
  );
  assert.equal(saved.dbPath, "../database/tasks.sqlite");
  assert.equal(saved.documents, "../designs");
  assert.equal("port" in saved, false);
  assert.equal("host" in saved, false);
  const legacy = ["seed", "--example", "product-launch"];
  assert.equal((await cli(legacy)).existing, false);
  assert.equal((await cli(legacy)).existing, true);
  const rows = await cli(["query"]);
  assert.equal(rows.length, 8);
  assert(fs.existsSync(path.join(plans, "examples/product-launch.md")));
  assert(!fs.existsSync(path.join(applicationRoot, "state")));
});

test("seed with no name installs draft spec folders the CLI then lists", async (t) => {
  const workspace = path.join(temporary(t), "plans");
  initializeWorkspace(workspace);
  const run = (args) =>
      exec(process.execPath, [
        path.join(applicationRoot, "cli.mjs"),
        ...args,
        "--workspace",
        workspace,
      ]),
    cli = async (args) => JSON.parse((await run(args)).stdout);
  const listed = await cli(["examples"]);
  assert.equal(listed.default, "recipe-box");
  assert.deepEqual(
    listed.examples.map((pack) => pack.id),
    ["recipe-box", "product-launch"],
  );
  const seeded = await cli(["seed"]);
  assert.equal(seeded.example, "recipe-box");
  assert.equal(seeded.existing, false);
  assert.deepEqual(seeded.specs, [
    "recipe-import",
    "meal-planner",
    "shopping-list",
    "recipe-box",
  ]);
  assert.deepEqual(
    fs.readdirSync(path.join(workspace, ".kiro", "specs")).sort(),
    [...seeded.specs].sort(),
  );
  assert.equal((await cli(["seed"])).existing, true);
  // Nothing is approved, so the graph holds no task; the drafts wait in
  // approval order and the epic lists its member specs.
  assert.deepEqual(await cli(["query"]), []);
  const batches = (await run(["plan", "batches"])).stdout;
  for (const spec of seeded.specs) assert.match(batches, new RegExp(spec));
  const epics = await cli(["epics"]);
  assert.deepEqual(
    epics.items.map((epic) => [epic.id, epic.approved]),
    [["recipe-box", false]],
  );
  assert.deepEqual(
    epics.items[0].members.map((member) => [member.plan, member.status]),
    [
      ["recipe-import", "draft"],
      ["meal-planner", "draft"],
      ["shopping-list", "draft"],
    ],
  );
  assert.equal(fs.existsSync(path.join(workspace, "plans")), false);
});

test("a named operation runs in process when no server is running", async (t) => {
  const workspace = temporary(t);
  initializeWorkspace(workspace);
  const { stdout } = await exec(process.execPath, [
    path.join(applicationRoot, "cli.mjs"),
    "plan.list",
    "--json",
    "{}",
    "--workspace",
    workspace,
    // A port nothing listens on: a request to a server would fail.
    "--port",
    "9",
  ]);
  assert.deepEqual(JSON.parse(stdout).items, []);
});

test("source changes preserve portable document IDs across filesystem separators", async (t) => {
  const root = temporary(t);
  initializeWorkspace(root);
  const config = workspaceConfig({ workspace: root });
  fs.mkdirSync(path.join(config.plansRoot, "design"), { recursive: true });
  fs.writeFileSync(
    path.join(config.plansRoot, "design", "plan.md"),
    "# Design\n\n[Next](next.md)\n",
  );
  const store = new Store(config.dbPath);
  t.after(() => store.close());
  const { reconcileSource } = await import("../source-sync.mjs");
  reconcileSource(store, config.plansRoot, "design\\plan.md");
  const doc = store.read().documents["design/plan.md"];
  assert.equal(doc.id, "design/plan.md");
  assert.deepEqual(doc.links, ["design/next.md"]);
  assert.equal(store.read().documents["design\\plan.md"], undefined);
});

test("the earlier environment names still select a workspace after the rename", async (t) => {
  const root = temporaryDirectory("avoozl-env-");
  const workspace = path.join(root, "workspace");
  initializeWorkspace(workspace, { name: "Renamed workspace" });
  const saved = { ...process.env };
  t.after(() => {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });
  for (const key of [
    "AVOOZL_WORKSPACE",
    "AICOMMANDER_WORKSPACE",
    "AVOOZL_URL",
    "AICOMMANDER_URL",
    "NUPP_WORKSPACE_URL",
  ])
    delete process.env[key];

  // The previous product name remains a working interface, not a casualty of
  // the rename.
  process.env.AICOMMANDER_WORKSPACE = workspace;
  assert.equal(workspaceConfig({}).workspaceRoot, workspace);
  process.env.AICOMMANDER_URL = "http://127.0.0.1:1234";
  assert.equal(workspaceConfig({}).endpoint, "http://127.0.0.1:1234");

  // The current name wins when both are set.
  process.env.AVOOZL_URL = "http://127.0.0.1:4321";
  assert.equal(workspaceConfig({}).endpoint, "http://127.0.0.1:4321");
  // An explicit option still outranks both.
  assert.equal(
    workspaceConfig({ url: "http://127.0.0.1:9999" }).endpoint,
    "http://127.0.0.1:9999",
  );

  // Who is working here is resolved rather than typed.
  const operator = workspaceConfig({}).operator;
  assert.equal(typeof operator, "string");
  assert.ok(operator.length);
  assert.equal(
    workspaceConfig({ operator: "Someone else" }).operator,
    "Someone else",
  );
});
