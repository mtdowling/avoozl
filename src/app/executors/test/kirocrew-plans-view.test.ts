import assert from "node:assert/strict";

import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { startAppBackend } from "../kirocrew/app-backend.ts";
import { workspaceConfig } from "../../settings/config.ts";
import { initializeWorkspace } from "../../workspace/workspace.ts";
import { writeSpec } from "../../test/spec-fixture.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { SECRET, sign } from "../../test/signed-principal.ts";

// One spec folder on plan.specs.
interface SpecItem {
  name: string;
  plan: { approved?: boolean } | null;
}
// The command endpoint's reply: the fields these tests read.
interface Reply {
  result: {
    root: string;
    items: SpecItem[];
    hash: string;
    expectedRevision: number;
  };
  error: string;
}

async function backend(t: TestContext) {
  const root = temporaryDirectory(),
    served = path.join(root, "served"),
    env: NodeJS.ProcessEnv = {
      ...process.env,
      XDG_CONFIG_HOME: path.join(root, "config"),
    };
  for (const name of Object.keys(env))
    if (/^AVOOZL_/.test(name)) delete env[name];
  initializeWorkspace(served);
  const server = startAppBackend({
    config: workspaceConfig({ workspace: served, env }),
    secret: SECRET,
    registryOptions: {
      configPath: path.join(root, "machine", "config.json"),
      catalogPath: path.join(root, "machine", "catalog.sqlite"),
    },
  });
  t.after(() => server.close());
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("The backend has no port.");
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (
    operation: string,
    input = {},
    kind = "owner-session",
  ) => {
    const body = JSON.stringify({ operation, input }),
      response = await fetch(base + "/api/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KiroCrew-Principal": sign(body, kind),
        },
        body,
      });
    // The endpoint's JSON reply.
    const reply = (await response.json()) as Reply;
    return { status: response.status, body: reply };
  };
  return { served, call };
}

test("the Plans view lists, stores, and approves a spec folder", async (t) => {
  const { served, call } = await backend(t);
  writeSpec(served, "config");
  const listed = await call("plan.specs");
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.equal(
    fs.realpathSync.native(listed.body.result.root),
    fs.realpathSync.native(served),
  );
  assert.deepEqual(
    listed.body.result.items.map((item) => [item.name, item.plan]),
    [["config", null]],
  );
  const stored = await call("plan.create", { spec: "config" });
  assert.equal(stored.status, 200, JSON.stringify(stored.body));
  const preview = (await call("plan.preview", { id: "config" })).body.result;
  const approved = await call("plan.approve", {
    id: "config",
    expectedHash: stored.body.result.hash,
    expectedRevision: preview.expectedRevision,
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const after = (await call("plan.specs")).body.result.items[0];
  assert.equal(after.plan?.approved, true);
});

test("app tokens may read spec plans but not store or approve them", async (t) => {
  const { served, call } = await backend(t);
  writeSpec(served, "config");
  const stored = (await call("plan.create", { spec: "config" })).body.result;
  for (const kind of ["app-token", "agent-tool"]) {
    assert.equal((await call("plan.specs", {}, kind)).status, 200, kind);
    assert.equal((await call("plan.get", { id: "config" }, kind)).status, 200);
    assert.equal(
      (await call("plan.create", { spec: "config" }, kind)).status,
      403,
      kind,
    );
    assert.equal(
      (
        await call(
          "plan.approve",
          { id: "config", expectedHash: stored.hash, expectedRevision: 1 },
          kind,
        )
      ).status,
      403,
      kind,
    );
  }
});

test("a spec name that leaves the specs directory is refused", async (t) => {
  const { call } = await backend(t);
  for (const spec of ["../served", "/etc", "a/b"]) {
    const reply = await call("plan.create", { spec });
    assert.equal(reply.status, 400, spec);
    assert.match(reply.body.error, /Name one spec folder/);
  }
});
