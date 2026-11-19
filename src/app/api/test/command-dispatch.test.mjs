import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { startAppBackend } from "../../executors/kirocrew/app-backend.mjs";
import { commandContext, dispatchCommand } from "../command-dispatch.mjs";
import { workspaceConfig } from "../../settings/config.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { SECRET, sign, isolatedEnv } from "../../test/signed-principal.mjs";

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
  const observe = { operation: "instance.view" },
    write = { operation: "instance.rename", input: { name: "Same name" } };
  const a = await viaBackend(write),
    b = await direct(write);
  assert.equal(a.status, 200);
  assert.deepEqual(b, a);
  const seen = await viaBackend(observe),
    through = await direct(observe);
  assert.equal(seen.body.result.name, "Same name");
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
