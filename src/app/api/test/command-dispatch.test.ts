// @ts-nocheck: typing debt
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { startAppBackend } from "../../executors/kirocrew/app-backend.ts";
import { commandContext, dispatchCommand } from "../command-dispatch.ts";
import { workspaceConfig } from "../../settings/config.ts";
import { initializeWorkspace } from "../../workspace/workspace.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { Store } from "../../store/store.ts";
import { SECRET, sign, isolatedEnv } from "../../test/signed-principal.ts";

const OWNER = { kind: "owner-session", ownerId: "local" };

// One workspace served two ways over the same database.
async function both(t) {
  const root = temporaryDirectory(),
    served = path.join(root, "served"),
    home = path.join(root, "home"),
    registryOptions = {
      configPath: path.join(root, "machine", "config.json"),
      catalogPath: path.join(root, "machine", "catalog.sqlite"),
    };
  initializeWorkspace(served);
  fs.mkdirSync(home);
  const config = workspaceConfig({ workspace: served, env: isolatedEnv(root) }),
    server = startAppBackend({
      config,
      secret: SECRET,
      registryOptions,
      home,
      notifier: null,
      slotReader: null,
      rowReader: null,
      usageReader: null,
      modelSwitcher: null,
      modelReader: null,
      crewReader: null,
      sessionStopper: null,
    });
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`,
    context = commandContext({
      host: "standalone",
      config,
      home,
      registryOptions,
    });
  t.after(() => context.close());
  const viaBackend = async (value, kind) => {
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
  const direct = (request) =>
    dispatchCommand({ principal: OWNER, request, context });
  return { viaBackend, direct };
}

test("one write and one observe operation give the same result through both servers", async (t) => {
  const { viaBackend, direct } = await both(t);
  const observe = { operation: "workspaces.list" },
    hash = async () =>
      (await direct({ operation: "activity.settings.get" })).body.result.hash,
    write = async () => ({
      operation: "activity.settings.update",
      input: { retentionDays: 30, expectedHash: await hash() },
    });
  const a = await viaBackend(await write()),
    b = await direct(await write());
  assert.equal(a.status, 200);
  assert.deepEqual(b, a);
  const seen = await viaBackend(observe),
    through = await direct(observe);
  assert.equal(seen.body.result.host, "kirocrew");
  assert.equal(through.body.result.host, "standalone");
  assert.deepEqual(
    { ...through.body.result, host: undefined },
    { ...seen.body.result, host: undefined },
  );
});

test("an operation neither server offers gets the same 403 message", async (t) => {
  const { viaBackend, direct } = await both(t);
  const request = { operation: "no.such.operation" },
    a = await viaBackend(request),
    b = await direct(request);
  assert.equal(a.status, 403);
  assert.deepEqual(b, a);
});

test("an operation that needs a Kiro Crew reader says so when it is absent", async (t) => {
  const { direct } = await both(t);
  for (const request of [{ operation: "flow.stop", input: { full: true } }]) {
    const result = await direct(request);
    assert.ok(result.status >= 200 && result.status < 500, request.operation);
    assert.match(JSON.stringify(result.body), /Needs Kiro Crew/);
  }
});

// A configured workspace whose database was never initialized is not a dead
// end: a read neither creates nor needs the file, and init then fills it.
test("a page read refuses an uninitialized workspace and init then fixes it", async (t) => {
  const root = temporaryDirectory(),
    served = path.join(root, "served"),
    home = path.join(root, "home");
  initializeWorkspace(served, { name: "Kept" });
  fs.mkdirSync(home);
  const config = workspaceConfig({ workspace: served, env: isolatedEnv(root) });
  fs.rmSync(config.dbPath);
  const context = commandContext({
    host: "standalone",
    config,
    home,
    registryOptions: {
      configPath: path.join(root, "machine", "config.json"),
      catalogPath: path.join(root, "machine", "catalog.sqlite"),
    },
  });
  t.after(() => context.close());
  const view = () =>
    dispatchCommand({
      principal: OWNER,
      request: { operation: "conflicts.view" },
      context,
    });
  const refused = await view();
  assert.equal(refused.status, 503);
  assert.match(refused.body.error, /avoozl init .*avoozl rebuild/);
  assert.equal(fs.existsSync(config.dbPath), false);
  // A schema with no snapshot, as an older read left behind.
  new Store(config.dbPath).close();
  assert.equal((await view()).status, 503);
  assert.equal(initializeWorkspace(served).existingConfiguration, true);
  assert.equal((await view()).status, 200);
  assert.throws(() => initializeWorkspace(served), /already exists/);
});
