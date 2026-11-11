import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { temporaryDirectory } from "./temporary.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { WorkspaceRegistry } from "../host-config.mjs";
import { WorkspaceManager } from "../workspace-manager.mjs";
import { HostScheduler } from "../host-scheduler.mjs";
import { Store } from "../store.mjs";
import { RunManager } from "../manager.mjs";
import { workspaceConfig } from "../config.mjs";

function fixtureRoot(parent, id) {
  const root = path.join(parent, id);
  initializeWorkspace(root, { name: id, port: 0 });
  return root;
}

function gitRepository(root) {
  fs.mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Avoozl test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "avoozl@example.test"], {
    cwd: root,
  });
  fs.writeFileSync(path.join(root, "README.md"), "# Test\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "-m", "Initialize"], { cwd: root });
  return root;
}

test("workspace manager isolates identical task IDs and applies fair concurrency", async (t) => {
  const root = temporaryDirectory("avoozl-manager-");
  const first = fixtureRoot(root, "first");
  const second = fixtureRoot(root, "second");
  const configPath = path.join(root, "config.json");
  const catalogPath = path.join(root, "catalog.sqlite");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      version: 1,
      maxConcurrentRuns: 1,
      defaultWorkspace: "first",
      workspaces: {
        first: { root: first, maxConcurrentRuns: 1 },
        second: { root: second, maxConcurrentRuns: 1 },
      },
    }),
  );
  const starts = [];
  const sends = [];
  const factory = ({ emit }) => ({
    async start({ cwd }) {
      starts.push(cwd);
      emit("session", { providerSessionId: "session-" + starts.length });
      emit("state", { state: "running" });
    },
    async send(text) {
      sends.push(text);
      return { accepted: true };
    },
    async close() {},
  });
  const manager = new WorkspaceManager({
    registry: new WorkspaceRegistry({ configPath, catalogPath }),
    factories: { codex: factory },
    scheduler: new HostScheduler({ maxConcurrentRuns: 1 }),
    watch: false,
  });
  t.after(() => manager.close());
  await manager.startEnabled();
  const firstRuntime = await manager.open("first");
  const secondRuntime = await manager.open("second");
  for (const runtime of [firstRuntime, secondRuntime])
    runtime.store.mutate("Add colliding fixture task", (data) => {
      data.tasks.push({
        id: "sample-task",
        title: "Same local ID",
        status: "planned",
        epic: "inbox",
        track: "catalog",
        scope: "catalog",
      });
    });
  firstRuntime.store.put("projects", {
    id: "repo",
    root: first,
    baseBranch: "main",
  });
  secondRuntime.store.put("projects", {
    id: "repo",
    root: second,
    baseBranch: "main",
  });
  const firstRun = await firstRuntime.manager.start({
    id: "run-first",
    mode: "ask",
    prompt: "First",
    projectId: "repo",
    provider: "codex",
    background: true,
  });
  const secondRun = await secondRuntime.manager.start({
    id: "run-second",
    mode: "ask",
    prompt: "Second",
    projectId: "repo",
    provider: "codex",
    background: true,
  });
  assert.equal(firstRun.workspaceId, "first");
  assert.equal(secondRun.workspaceId, "second");
  assert.equal(secondRuntime.store.get("runs", "run-second").state, "queued");
  firstRuntime.manager.receive("run-first", "turn.completed", {
    state: "completed",
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (secondRuntime.store.get("runs", "run-second").state === "running")
      break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(secondRuntime.store.get("runs", "run-second").state, "running");
  secondRuntime.manager.receive("run-second", "turn.completed", {
    state: "completed",
  });
  await secondRuntime.manager.start({
    id: "run-blocker",
    mode: "ask",
    prompt: "Block the host slot",
    projectId: "repo",
    provider: "codex",
    background: true,
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (secondRuntime.store.get("runs", "run-blocker").state === "running")
      break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(secondRuntime.store.get("runs", "run-blocker").state, "running");
  const delivery = {
    id: "followup-first",
    runId: "run-first",
    text: "Continue the first conversation",
    mode: "queue",
    state: "queued",
    createdAt: new Date().toISOString(),
  };
  firstRuntime.store.put("deliveries", delivery);
  const sendsBeforeFollowup = sends.length;
  const followup = firstRuntime.manager.deliver(
    firstRuntime.store.get("runs", "run-first"),
    delivery,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sends.length, sendsBeforeFollowup);
  assert.equal(manager.scheduler.status().waiting, 1);
  secondRuntime.manager.receive("run-blocker", "turn.completed", {
    state: "completed",
  });
  await followup;
  assert.equal(sends.at(-1), "Continue the first conversation");
  firstRuntime.manager.receive("run-first", "turn.completed", {
    state: "completed",
  });
  assert.equal(firstRuntime.store.read().tasks[0].id, "sample-task");
  assert.equal(secondRuntime.store.read().tasks[0].id, "sample-task");
});

test("editable checkout bindings are fenced and synchronized across workspaces", async (t) => {
  const root = temporaryDirectory("avoozl-manager-repositories-"),
    first = fixtureRoot(root, "first"),
    second = fixtureRoot(root, "second"),
    checkout = gitRepository(path.join(root, "shared-checkout")),
    configPath = path.join(root, "config.json"),
    catalogPath = path.join(root, "catalog.sqlite");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      version: 1,
      workspaces: { first: { root: first }, second: { root: second } },
    }),
  );
  const manager = new WorkspaceManager({
    registry: new WorkspaceRegistry({ configPath, catalogPath }),
    watch: false,
  });
  t.after(() => manager.close());
  await manager.startEnabled();
  const firstRuntime = await manager.open("first"),
    secondRuntime = await manager.open("second");

  await firstRuntime.ops.execute("repositories.configure", {
    id: "code",
    localCheckout: checkout,
    editable: true,
  });
  assert.equal(
    manager.registry.get("first").repositories.code,
    fs.realpathSync(checkout),
  );
  await assert.rejects(
    secondRuntime.ops.execute("repositories.configure", {
      id: "code",
      localCheckout: checkout,
      editable: true,
    }),
    /already bound to workspace first/,
  );
  assert.equal(secondRuntime.store.get("projects", "code"), null);

  await firstRuntime.ops.execute("repositories.configure", {
    id: "code",
    localCheckout: checkout,
    editable: false,
  });
  assert.equal(manager.registry.get("first").repositories.code, undefined);

  await secondRuntime.ops.execute("repositories.configure", {
    id: "code",
    localCheckout: checkout,
    editable: true,
  });
  assert.equal(
    manager.registry.get("second").repositories.code,
    fs.realpathSync(checkout),
  );
  await secondRuntime.ops.execute("repositories.remove", { id: "code" });
  assert.equal(manager.registry.get("second").repositories.code, undefined);
});

test("stopping one workspace preserves the other and its database", async (t) => {
  const root = temporaryDirectory("avoozl-manager-stop-");
  const first = fixtureRoot(root, "first");
  const second = fixtureRoot(root, "second");
  const configPath = path.join(root, "config.json");
  const catalogPath = path.join(root, "catalog.sqlite");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      version: 1,
      workspaces: { first: { root: first }, second: { root: second } },
    }),
  );
  const manager = new WorkspaceManager({
    registry: new WorkspaceRegistry({ configPath, catalogPath }),
    watch: false,
  });
  t.after(() => manager.close());
  await manager.startEnabled();
  const secondRuntime = await manager.open("second");
  const database = secondRuntime.config.dbPath;
  await manager.stop("first");
  assert.equal(
    (await manager.list()).find((item) => item.id === "first").state,
    "stopped",
  );
  assert.equal((await manager.open("second")).state, "ready");
  assert.equal(fs.existsSync(database), true);
});

test("workspace manager binds an unclaimed database once and quarantines identity mismatches", async (t) => {
  const root = temporaryDirectory("avoozl-manager-identity-");
  const workspace = fixtureRoot(root, "workspace");
  const configPath = path.join(root, "config.json");
  const catalogPath = path.join(root, "catalog.sqlite");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      version: 1,
      workspaces: { expected: { root: workspace } },
    }),
  );
  const workspaceStore = new Store(
    path.join(workspace, ".avoozl", "local", "workspace.sqlite"),
  );
  workspaceStore.setMeta("workspaceId", "unexpected");
  workspaceStore.close();
  const manager = new WorkspaceManager({
    registry: new WorkspaceRegistry({ configPath, catalogPath }),
    watch: false,
  });
  t.after(() => manager.close());
  await assert.rejects(
    () => manager.open("expected"),
    /database belongs to unexpected/,
  );
  assert.equal(
    (await manager.list()).find((item) => item.id === "expected").state,
    "quarantined",
  );
});

test("idle workspaces close while subscribers keep their store open", async (t) => {
  const root = temporaryDirectory("avoozl-manager-idle-");
  const workspace = fixtureRoot(root, "workspace");
  const configPath = path.join(root, "config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      version: 1,
      workspaces: { workspace: { root: workspace } },
    }),
  );
  const manager = new WorkspaceManager({
    registry: new WorkspaceRegistry({
      configPath,
      catalogPath: path.join(root, "catalog.sqlite"),
    }),
    watch: false,
    idleTimeoutMs: 10,
  });
  t.after(() => manager.close());
  await manager.open("workspace");
  const release = manager.retain("workspace");
  assert.deepEqual(await manager.closeIdle(Date.now() + 100), []);
  release();
  assert.deepEqual(await manager.closeIdle(Date.now() + 100), ["workspace"]);
  assert.equal(manager.runtimes.has("workspace"), false);
  assert.equal((await manager.open("workspace")).state, "ready");
});

test("closing a run manager cancels queued admission before its store can close", async (t) => {
  const root = temporaryDirectory("avoozl-manager-close-");
  const workspace = fixtureRoot(root, "workspace");
  const store = new Store(workspaceConfig({ workspace }).dbPath);
  const scheduler = new HostScheduler({ maxConcurrentRuns: 1 });
  scheduler.configureWorkspace("workspace", { maxConcurrentRuns: 0 });
  const manager = new RunManager(store, {
    workspaceId: "workspace",
    scheduler,
    factories: {
      codex() {
        return {
          async start() {
            assert.fail("A paused workspace must not start the provider.");
          },
          async close() {},
        };
      },
    },
  });
  t.after(() => {
    scheduler.close();
    store.close();
  });
  store.put("projects", {
    id: "repo",
    root: workspace,
    baseBranch: "main",
  });
  await manager.start({
    id: "queued-run",
    mode: "ask",
    prompt: "Wait",
    projectId: "repo",
    provider: "codex",
    background: true,
  });
  assert.equal(scheduler.status("workspace").workspace.waiting, 1);
  await manager.close();
  assert.equal(scheduler.status("workspace").workspace.waiting, 0);
  assert.equal(store.get("runs", "queued-run").state, "failed");
});
