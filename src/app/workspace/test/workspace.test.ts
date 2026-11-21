// @ts-nocheck: typing debt
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applicationRoot, workspaceConfig } from "../../settings/config.ts";
import { initializeWorkspace } from "../workspace.ts";
import { REPOSITORY_CONFIG_SCHEMA_URL } from "../../settings/config-schema.ts";
import { Store } from "../../store/store.ts";
import { Operations } from "../../api/operations.ts";
import { createSpecPlan, readSpecFolder } from "../../specs/spec-plans.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
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
  assert.equal(store.list("repositories").length, 0);
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

test("offline skill export binds the chosen workspace without creating data", async (t) => {
  const root = temporary(t),
    workspace = path.join(root, "not-created");
  const args = [
    path.join(applicationRoot, "cli.ts"),
    "skill",
    "--workspace",
    workspace,
  ];
  const { stdout } = await exec(process.execPath, args, { cwd: root });
  assert.match(stdout, /^---\nname: avoozl\n/);
  assert(stdout.includes(workspace));
  assert(stdout.includes(`avoozl mcp --workspace ${workspace}`));
  assert(!stdout.includes("{{"));
  assert.equal(fs.existsSync(workspace), false);
  const command = stdout
    .split("\n")
    .find((line) => line.startsWith("node ") && line.includes(" query "));
  assert(command.includes("--workspace"));
  assert(command.includes(path.join(applicationRoot, "cli.ts")));
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
  // A layout the person chose is written, as a portable relative path.
  const saved = JSON.parse(
    fs.readFileSync(path.join(workspace, ".avoozl.json"), "utf8"),
  );
  assert.equal(saved.dbPath, "../database/tasks.sqlite");
  assert.equal(saved.documents, "../designs");
  assert.equal("port" in saved, false);
  assert.equal("host" in saved, false);
});

test("a named operation runs in process when no server is running", async (t) => {
  const workspace = temporary(t);
  initializeWorkspace(workspace);
  const { stdout } = await exec(process.execPath, [
    path.join(applicationRoot, "cli.ts"),
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
