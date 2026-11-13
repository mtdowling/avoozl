import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { startAppBackend } from "../app-backend.mjs";
import { workspaceConfig } from "../config.mjs";
import { Store } from "../store.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const SECRET = "test-proxy-secret";

// Mirrors kiro_crew/apps/proxy_auth.py `sign_proxy_principal_claim`.
function sign(body, kind = "owner-session") {
  const issuedAt = Math.floor(Date.now() / 1000),
    claim = {
      issuedAt,
      kind,
      ownerId: kind === "owner-session" ? "owner" : "",
      requestId: randomBytes(16).toString("hex"),
      version: 1,
    },
    encoded = Buffer.from(JSON.stringify(claim)).toString("base64url"),
    signature = createHmac("sha256", SECRET)
      .update(
        [
          "kirocrew-proxy-principal-v1",
          String(issuedAt),
          "POST",
          "/api/command",
          createHash("sha256").update(body).digest("hex"),
          encoded,
        ].join("\n"),
      )
      .digest("hex");
  return `${encoded}.${signature}`;
}

function isolatedEnv(root) {
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  return env;
}

// A backend serving one initialized workspace, with its own machine catalog.
async function backend(t) {
  const root = temporaryDirectory(),
    served = path.join(root, "served");
  initializeWorkspace(served);
  const server = startAppBackend({
    config: workspaceConfig({ workspace: served, env: isolatedEnv(root) }),
    secret: SECRET,
    registryOptions: {
      configPath: path.join(root, "machine", "config.json"),
      catalogPath: path.join(root, "machine", "catalog.sqlite"),
    },
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
  return { root, served, call };
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
