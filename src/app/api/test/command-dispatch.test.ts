import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { startAppBackend } from "../../executors/kirocrew/app-backend.ts";
import { commandContext, dispatchCommand } from "../command-dispatch.ts";
import { workspaceConfig } from "../../settings/config.ts";
import { initializeWorkspace } from "../../workspace/workspace.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { Store } from "../../store/store.ts";
import { SECRET, sign, isolatedEnv } from "../../test/signed-principal.ts";

// What either server answers: a status and a JSON body.
interface Reply {
  status: number;
  body: { result?: unknown; error?: string };
}

// A reply's result object.
function resultOf(reply: Reply): Record<string, unknown> {
  const { result } = reply.body;
  assert.ok(result && typeof result === "object");
  return Object.fromEntries(Object.entries(result));
}

const OWNER = { kind: "owner-session", ownerId: "local" };

// One workspace served two ways over the same database.
async function both(t: TestContext) {
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
      sessionStopper: null,
    });
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("The backend has no port.");
  const base = `http://127.0.0.1:${address.port}`,
    context = commandContext({
      host: "standalone",
      config,
      home,
      registryOptions,
    });
  t.after(() => context.close());
  const viaBackend = async (value: unknown, kind?: string): Promise<Reply> => {
    const body = JSON.stringify(value),
      response = await fetch(base + "/api/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KiroCrew-Principal": sign(body, kind),
        },
        body,
      });
    // The endpoint's JSON reply.
    const parsed = (await response.json()) as Reply["body"];
    return { status: response.status, body: parsed };
  };
  const direct = (request: Parameters<typeof dispatchCommand>[0]["request"]) =>
    dispatchCommand({ principal: OWNER, request, context }) as Promise<Reply>;
  return { viaBackend, direct };
}

test("one write and one observe operation give the same result through both servers", async (t) => {
  const { viaBackend, direct } = await both(t);
  const observe = { operation: "workspaces.list" },
    hash = async () =>
      resultOf(await direct({ operation: "activity.settings.get" })).hash,
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
  assert.equal(resultOf(seen).host, "kirocrew");
  assert.equal(resultOf(through).host, "standalone");
  assert.deepEqual(
    { ...resultOf(through), host: undefined },
    { ...resultOf(seen), host: undefined },
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
  assert.match(refused.body.error ?? "", /avoozl init .*avoozl rebuild/);
  assert.equal(fs.existsSync(config.dbPath), false);
  // A schema with no snapshot, as an older read left behind.
  new Store(config.dbPath).close();
  assert.equal((await view()).status, 503);
  assert.equal(initializeWorkspace(served).existingConfiguration, true);
  assert.equal((await view()).status, 200);
  assert.throws(() => initializeWorkspace(served), /already exists/);
});
