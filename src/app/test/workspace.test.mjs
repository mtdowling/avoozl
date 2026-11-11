import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applicationRoot, workspaceConfig } from "../config.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { Store } from "../store.mjs";
import { Operations } from "../operations.mjs";
import { handleMcp } from "../mcp.mjs";
import { startServer } from "../server.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { mintRunCapability } from "../run-capabilities.mjs";
const exec = promisify(execFile);
function temporary(t) {
  return temporaryDirectory();
}

test("initialization starts empty, refuses replacement, and paths survive moving a workspace", (t) => {
  const root = temporary(t),
    original = path.join(root, "original"),
    moved = path.join(root, "moved workspace");
  initializeWorkspace(original, { name: "A team project", port: 9477 });
  const repositoryConfig = path.join(original, ".avoozl", "config.json");
  assert.equal(fs.existsSync(repositoryConfig), true);
  assert.equal(fs.existsSync(path.join(original, "workspace.json")), false);
  const savedConfig = JSON.parse(fs.readFileSync(repositoryConfig, "utf8"));
  assert.equal(savedConfig.$schema, "https://avoozl.dev/schema/config-v1.json");
  assert.equal(savedConfig.dbPath, "local/workspace.sqlite");
  assert.equal(savedConfig.documents, "../plans");
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

test("CLI, MCP, and HTTP use the same seed receipt and publish example Markdown", async (t) => {
  const root = temporary(t);
  initializeWorkspace(root);
  const config = workspaceConfig({ workspace: root }),
    server = startServer({
      dbPath: config.dbPath,
      workspaceName: "Named deployment",
      projectionRoot: config.plansRoot,
      sourceRoot: config.plansRoot,
      port: 0,
    });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = "http://127.0.0.1:" + server.address().port;
  assert.equal(
    (await (await fetch(url + "/api/view-state")).json()).project.workspaceName,
    "Named deployment",
  );
  assert.equal(
    (await (await fetch(url + "/database.json")).json()).project.workspaceName,
    undefined,
  );
  const cli = async (args) =>
    JSON.parse(
      (
        await exec(process.execPath, [
          path.join(applicationRoot, "cli.mjs"),
          "--workspace",
          root,
          "--url",
          url,
          ...args,
        ])
      ).stdout,
    );
  assert.equal((await cli(["query"])).length, 0);
  const seeded = await cli(["seed", "--example", "product-launch"]);
  assert.equal(seeded.existing, false);
  assert.equal(
    fs.existsSync(path.join(config.plansRoot, "examples/product-launch.md")),
    true,
  );
  const message = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "plans_seed_example",
      arguments: { input: { example: "product-launch" } },
    },
  };
  const response = await fetch(url + "/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    }),
    body = await response.json();
  assert.equal(body.result.structuredContent.existing, true);
  assert.deepEqual(body.result.structuredContent.taskIds, seeded.taskIds);
  assert.equal((await cli(["query", "--q", "tag:product-launch"])).length, 8);
  assert.equal((await cli(["examples"])).examples[0].id, "product-launch");
  assert.equal(
    (await (await fetch(url + "/api/health")).json()).application,
    "avoozl",
  );
  const ownedRun = {
      id: "owned-run",
      taskId: "sample-task",
      provider: "codex",
      mode: "implement",
      state: "running",
    },
    ownedToken = mintRunCapability(
      server.workspace.store,
      server.workspace.store.put("runs", ownedRun),
    ).token;
  const denied = await handleMcp(message, server.workspace.ops, {
    runId: "owned-run",
    runCapability: ownedToken,
  });
  assert.equal(denied.body.result.isError, true);
  const list = await handleMcp(
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    server.workspace.ops,
    { runId: "owned-run", runCapability: ownedToken },
  );
  assert(!list.body.result.tools.some((t) => t.name === "plans_seed_example"));
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
  assert.equal((await cli(["seed"])).existing, false);
  assert.equal((await cli(["seed"])).existing, true);
  assert.equal((await cli(["query"])).length, 8);
  assert(fs.existsSync(path.join(plans, "examples/product-launch.md")));
  assert(!fs.existsSync(path.join(applicationRoot, "state")));
});

test("source changes preserve portable document IDs across filesystem separators", async (t) => {
  const root = temporary(t);
  initializeWorkspace(root);
  const config = workspaceConfig({ workspace: root });
  fs.mkdirSync(path.join(config.plansRoot, "design"));
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
