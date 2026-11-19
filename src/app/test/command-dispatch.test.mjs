import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { startAppBackend } from "../app-backend.mjs";
import { commandContext, dispatchCommand } from "../command-dispatch.mjs";
import { readCrews } from "../radar-handoff.mjs";
import { workspaceConfig } from "../config.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const SECRET = "test-proxy-secret";
const OWNER = { kind: "owner-session", ownerId: "local" };

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
    if (/^AVOOZL_/.test(name)) delete env[name];
  return env;
}

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
  for (const request of [
    { operation: "untriaged.handoff", input: { repository: "a/b", items: [] } },
    { operation: "flow.stop", input: { full: true } },
  ]) {
    const result = await direct(request);
    assert.ok(result.status >= 200 && result.status < 500, request.operation);
    assert.match(JSON.stringify(result.body), /Needs Kiro Crew/);
  }
  assert.match((await readCrews(null, "a/b")).reason, /^Needs Kiro Crew/);
});
