import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { startAppBackend } from "../kirocrew/app-backend.mjs";
import { workspaceConfig } from "../../settings/config.mjs";
import { Store } from "../../store/store.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { SECRET, sign, isolatedEnv } from "../../test/signed-principal.mjs";

// A backend serving one initialized workspace, with its own machine catalog.
async function backend(t) {
  const root = temporaryDirectory(),
    served = path.join(root, "served"),
    home = path.join(root, "home");
  initializeWorkspace(served);
  fs.mkdirSync(home);
  const server = startAppBackend({
    config: workspaceConfig({ workspace: served, env: isolatedEnv(root) }),
    secret: SECRET,
    registryOptions: {
      configPath: path.join(root, "machine", "config.json"),
      catalogPath: path.join(root, "machine", "catalog.sqlite"),
    },
    home,
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (value, kind) => {
    const body = JSON.stringify(value),
      response = await fetch(base + "/api/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KiroCrew-Principal": sign(body, kind),
        },
        body,
      });
    return { status: response.status, body: await response.json() };
  };
  return { root, served, home, call };
}

test("Workspace view lists, adds, and initializes catalog workspaces", async (t) => {
  const { root, served, call } = await backend(t);
  const empty = await call({ operation: "workspaces.list" });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.result.items, []);

  const fresh = path.join(root, "fresh");
  const created = await call({
    operation: "workspaces.init",
    input: { id: "fresh", root: fresh, name: "Fresh" },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.result.id, "fresh");
  assert.ok(fs.existsSync(workspaceConfig({ workspace: fresh }).dbPath));

  const added = await call({
    operation: "workspaces.add",
    input: { id: "served", root: served },
  });
  assert.equal(added.status, 200, JSON.stringify(added.body));

  const listed = (await call({ operation: "workspaces.list" })).body.result;
  assert.deepEqual(
    listed.items.map(({ id, name, served }) => ({ id, name, served })),
    [
      { id: "fresh", name: "Fresh", served: false },
      { id: "served", name: "served", served: true },
    ],
  );
  assert.equal(listed.defaultWorkspace, "fresh");

  const refused = {
    relative: [{ id: "rel", root: "relative/path" }, 400],
    duplicate: [{ id: "fresh", root: path.join(root, "other") }, 409],
    "existing directory": [{ id: "again", root: fresh }, 409],
  };
  for (const [name, [input, status]] of Object.entries(refused))
    assert.equal(
      (await call({ operation: "workspaces.init", input })).status,
      status,
      name,
    );
  assert.equal(
    (
      await call({
        operation: "workspaces.add",
        input: { id: "missing", root: path.join(root, "missing") },
      })
    ).status,
    400,
  );
});

test("app tokens may list workspaces and read tick health but not change them", async (t) => {
  const { root, call } = await backend(t);
  for (const kind of ["app-token", "agent-tool"]) {
    assert.equal(
      (await call({ operation: "workspaces.list" }, kind)).status,
      200,
    );
    assert.equal(
      (await call({ operation: "workspace.tick.health" }, kind)).status,
      200,
    );
    for (const operation of ["workspaces.add", "workspaces.init"])
      assert.equal(
        (
          await call(
            { operation, input: { id: "x", root: path.join(root, "x") } },
            kind,
          )
        ).status,
        403,
        `${kind} ${operation}`,
      );
    assert.equal(
      (await call({ operation: "workspace.tick" }, kind)).status,
      403,
    );
  }
  assert.equal(fs.existsSync(path.join(root, "x")), false);
});

test("run tick now records health outside SQLite and reports a held lock", async (t) => {
  const { served, call } = await backend(t);
  const before = await call({ operation: "workspace.tick.health" });
  assert.deepEqual(before.body.result, { lastRun: null, lock: null });

  const store = new Store(workspaceConfig({ workspace: served }).dbPath);
  t.after(() => store.close());
  const revision = store.read().revision;
  const ran = await call({ operation: "workspace.tick" });
  assert.equal(ran.status, 200, JSON.stringify(ran.body));
  assert.equal(ran.body.result.policy.status, "loaded");
  assert.equal(store.read().revision, revision, "the tick changed no state");

  const health = (await call({ operation: "workspace.tick.health" })).body
    .result;
  assert.equal(health.lastRun.outcome, "ok");
  assert.equal(health.lastRun.policy, "loaded");
  assert.ok(Date.parse(health.lastRun.at));
  assert.equal(health.lock, null);

  store.db
    .prepare("INSERT INTO work_locks VALUES (?,?,?,?,?)")
    .run(
      "avoozl:workspace-tick",
      "avoozl:workspace",
      "tick",
      process.pid,
      "held",
    );
  assert.deepEqual((await call({ operation: "workspace.tick" })).body.result, {
    skipped: "locked",
  });
  const locked = (await call({ operation: "workspace.tick.health" })).body
    .result;
  assert.equal(locked.lastRun.outcome, "locked");
  assert.deepEqual(locked.lock, { pid: process.pid, live: true });
});

test("a request may name a catalog workspace to register repositories in", async (t) => {
  const { root, call } = await backend(t);
  const other = path.join(root, "other");
  assert.equal(
    (
      await call({
        operation: "workspaces.init",
        input: { id: "other", root: other },
      })
    ).status,
    200,
  );
  const checkout = path.join(root, "checkout");
  fs.mkdirSync(checkout);
  execFileSync("git", ["init", "-q", "-b", "main", checkout]);
  execFileSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "init",
    ],
    { cwd: checkout },
  );
  const configured = await call({
    workspaceId: "other",
    operation: "repositories.configure",
    input: { id: "app", localCheckout: checkout },
  });
  assert.equal(configured.status, 200, JSON.stringify(configured.body));
  const listed = (
    await call({ workspaceId: "other", operation: "repositories.list" })
  ).body.result.items;
  assert.deepEqual(
    listed.map(({ id }) => id),
    ["app"],
  );
  const servedList = (await call({ operation: "repositories.list" })).body
    .result.items;
  assert.deepEqual(servedList, [], "the served workspace is unchanged");
  assert.equal(
    (await call({ workspaceId: "nope", operation: "repositories.list" }))
      .status,
    404,
  );
  assert.equal(
    (await call({ workspaceId: 7, operation: "repositories.list" })).status,
    400,
  );
});

test("a catalog workspace with a read-only database is read without writing", async (t) => {
  const { root, call } = await backend(t);
  const copy = path.join(root, "copy");
  initializeWorkspace(copy);
  const dbPath = workspaceConfig({ workspace: copy }).dbPath;
  // An older database lacks newer tables; reading it must not create them.
  const older = new Store(dbPath);
  older.db.exec("DROP TABLE session_requests");
  older.close();
  fs.chmodSync(dbPath, 0o444);
  const hash = () =>
    createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex");
  const before = hash();
  assert.equal(
    (
      await call({
        operation: "workspaces.add",
        input: { id: "copy", root: copy },
      })
    ).status,
    200,
  );
  const state = await call({ workspaceId: "copy", operation: "state" });
  assert.equal(state.status, 200, JSON.stringify(state.body));
  assert.ok(Array.isArray(state.body.result.tasks));
  assert.equal(hash(), before);
});

test("Remove takes a workspace off the list and keeps its folder and database; the default moves to the next enabled one", async (t) => {
  const { root, call } = await backend(t);
  const roots = {};
  for (const id of ["first", "second", "third"]) {
    roots[id] = path.join(root, id);
    assert.equal(
      (
        await call({
          operation: "workspaces.init",
          input: { id, root: roots[id] },
        })
      ).status,
      200,
    );
  }
  // Stop turns one off; it stays listed.
  const stopped = await call({
    operation: "workspaces.stop",
    input: { id: "second" },
  });
  assert.equal(stopped.status, 200, JSON.stringify(stopped.body));
  assert.equal(stopped.body.result.enabled, false);
  let listed = (await call({ operation: "workspaces.list" })).body.result;
  assert.equal(listed.defaultWorkspace, "first");
  // Removing the default picks the next enabled one, skipping the stopped one.
  const removed = await call({
    operation: "workspaces.remove",
    input: { id: "first" },
  });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.deepEqual(
    {
      id: removed.body.result.id,
      removed: removed.body.result.removed,
      databasePreserved: removed.body.result.databasePreserved,
    },
    { id: "first", removed: true, databasePreserved: true },
  );
  listed = (await call({ operation: "workspaces.list" })).body.result;
  assert.deepEqual(
    listed.items.map((item) => item.id),
    ["second", "third"],
  );
  assert.equal(listed.defaultWorkspace, "third");
  // Nothing on disk was touched.
  assert.ok(fs.existsSync(roots.first));
  assert.ok(fs.existsSync(workspaceConfig({ workspace: roots.first }).dbPath));
  // An unknown workspace is a 404.
  assert.equal(
    (await call({ operation: "workspaces.remove", input: { id: "first" } }))
      .status,
    404,
  );
});

test("only a person removes or stops a workspace", async (t) => {
  const { root, call } = await backend(t);
  const kept = path.join(root, "kept");
  await call({
    operation: "workspaces.init",
    input: { id: "kept", root: kept },
  });
  for (const kind of ["app-token", "agent-tool"])
    for (const operation of ["workspaces.remove", "workspaces.stop"])
      assert.equal(
        (await call({ operation, input: { id: "kept" } }, kind)).status,
        403,
        `${kind} ${operation}`,
      );
  const listed = (await call({ operation: "workspaces.list" })).body.result;
  assert.deepEqual(
    listed.items.map((item) => [item.id, item.enabled]),
    [["kept", true]],
  );
  // MCP has no route to either: the MCP server never names them.
  const mcp = fs.readFileSync(
    new URL("../../mcp/mcp.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(mcp, /workspaces\.(remove|stop)/);
});

test("a folder typed with ~ is under the person's home folder", async (t) => {
  const { home, call } = await backend(t);
  const started = await call({
    operation: "workspaces.init",
    input: { id: "tilde", root: "~/plans" },
  });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(
    started.body.result.root,
    fs.realpathSync(path.join(home, "plans")),
  );
  assert.ok(
    fs.existsSync(
      workspaceConfig({ workspace: path.join(home, "plans") }).dbPath,
    ),
  );
  // `~user` names someone else's home: it stays relative and is refused.
  assert.equal(
    (
      await call({
        operation: "workspaces.add",
        input: { id: "other", root: "~other/plans" },
      })
    ).status,
    400,
  );
});

test("the folder picker lists folders under home only, and only for a person", async (t) => {
  const { root, home, call } = await backend(t);
  fs.mkdirSync(path.join(home, "b"));
  fs.mkdirSync(path.join(home, "a"));
  fs.mkdirSync(path.join(home, ".hidden"));
  fs.writeFileSync(path.join(home, "file.txt"), "");
  initializeWorkspace(path.join(home, "plans"));
  const top = await call({ operation: "workspaces.browse", input: {} });
  assert.equal(top.status, 200, JSON.stringify(top.body));
  assert.equal(top.body.result.path, fs.realpathSync(home));
  assert.equal(top.body.result.parent, null);
  assert.deepEqual(
    top.body.result.folders.map(({ name, workspace }) => [name, workspace]),
    [
      ["a", false],
      ["b", false],
      ["plans", true],
    ],
  );
  const inner = await call({
    operation: "workspaces.browse",
    input: { path: "~/a" },
  });
  assert.equal(inner.status, 200, JSON.stringify(inner.body));
  assert.equal(inner.body.result.parent, fs.realpathSync(home));
  // Outside home, directly or through a link, is refused.
  // Windows needs a privilege for links; there the link case is skipped.
  let linked = true;
  try {
    fs.symlinkSync(root, path.join(home, "out"), "dir");
  } catch {
    linked = false;
  }
  for (const at of [
    root,
    ...(linked ? ["~/out"] : []),
    "~/../served",
    "relative",
  ])
    assert.equal(
      (await call({ operation: "workspaces.browse", input: { path: at } }))
        .status,
      400,
      at,
    );
  for (const kind of ["app-token", "agent-tool"])
    assert.equal(
      (await call({ operation: "workspaces.browse", input: {} }, kind)).status,
      403,
      kind,
    );
});

test("a person edits a workspace's name, folder, on/off and default", async (t) => {
  const { root, home, call } = await backend(t);
  for (const id of ["one", "two"])
    assert.equal(
      (
        await call({
          operation: "workspaces.init",
          input: { id, root: path.join(root, id) },
        })
      ).status,
      200,
    );
  const named = await call({
    operation: "workspaces.update",
    input: {
      id: "two",
      name: "  Second  ",
      // Old input: accepted and ignored (R6.3).
      maxConcurrentRuns: 5,
      enabled: false,
      default: true,
    },
  });
  assert.equal(named.status, 200, JSON.stringify(named.body));
  assert.deepEqual(
    {
      name: named.body.result.name,
      max: named.body.result.maxConcurrentRuns,
      enabled: named.body.result.enabled,
    },
    { name: "Second", max: undefined, enabled: false },
  );
  let listed = (await call({ operation: "workspaces.list" })).body.result;
  assert.equal(listed.defaultWorkspace, "two");

  // A moved folder: the new path holds this workspace.
  fs.renameSync(path.join(root, "two"), path.join(home, "moved"));
  const moved = await call({
    operation: "workspaces.update",
    input: { id: "two", root: "~/moved" },
  });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(
    moved.body.result.root,
    fs.realpathSync(path.join(home, "moved")),
  );
  assert.equal(moved.body.result.name, "Second");

  // Refused: a blank name, a relative or missing folder, an
  // empty folder, another workspace's folder, an unknown ID.
  fs.mkdirSync(path.join(home, "empty"));
  const refused = [
    [{ id: "two", name: "  " }, 400],
    [{ id: "two", root: "relative" }, 400],
    [{ id: "two", root: path.join(root, "nope") }, 400],
    [{ id: "two", root: "~/empty" }, 400],
    [{ id: "two", root: path.join(root, "one") }, 400],
    [{ id: "three", name: "x" }, 404],
  ];
  for (const [input, status] of refused)
    assert.equal(
      (await call({ operation: "workspaces.update", input })).status,
      status,
      JSON.stringify(input),
    );
  listed = (await call({ operation: "workspaces.list" })).body.result;
  const two = listed.items.find((item) => item.id === "two");
  assert.deepEqual(
    [two.name, two.maxConcurrentRuns, two.root],
    ["Second", undefined, fs.realpathSync(path.join(home, "moved"))],
  );
  for (const kind of ["app-token", "agent-tool"])
    assert.equal(
      (
        await call(
          { operation: "workspaces.update", input: { id: "two", name: "x" } },
          kind,
        )
      ).status,
      403,
      kind,
    );
});
