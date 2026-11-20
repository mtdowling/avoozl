// ot-4.1: operations and CLI (OT5.3, OT5.5, OT11.5, OT11.6).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { OPERATIONS } from "../../api/operation-table.mjs";
import { Operations } from "../../api/operations.mjs";
import { GROUPED_TOOLS } from "../../mcp/mcp-tools.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

function setup(t) {
  const { root, store } = fixture(t);
  const configDirectory = path.join(root, "machine-config");
  fs.mkdirSync(configDirectory, { recursive: true });
  const file = path.join(configDirectory, "config.json");
  return {
    file,
    ops: new Operations(store, { workspaceRoot: root, configDirectory }),
  };
}

test("telemetry.configure is person-only and telemetry.status is not on MCP", async (t) => {
  const { ops, file } = setup(t);
  for (const context of [{ mcp: true }, { caller: { role: "worker" } }])
    await assert.rejects(
      ops.execute("telemetry.configure", { enabled: true }, undefined, context),
      (error) => error.status === 403,
    );
  assert.equal(fs.existsSync(file), false);
  assert.equal(OPERATIONS.get("telemetry.configure").policy.kind, "person");
  assert.equal(OPERATIONS.get("telemetry.status").policy.kind, "notOnMcp");
  assert.equal(OPERATIONS.get("telemetry.status").class, "observe");
  assert.ok(
    !JSON.stringify(GROUPED_TOOLS).toLowerCase().includes("telemetry"),
    "no MCP tool names telemetry",
  );
});

test("configure writes only telemetry.enabled and keeps the other keys", async (t) => {
  const { ops, file } = setup(t);
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      machine: { alias: "box" },
      serve: { port: 4000 },
    }),
  );
  const on = await ops.execute("telemetry.configure", { enabled: true });
  assert.equal(on.status, "no-endpoint");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
    version: 1,
    machine: { alias: "box" },
    serve: { port: 4000 },
    telemetry: { enabled: true },
  });
  const off = await ops.execute("telemetry.configure", { enabled: false });
  assert.equal(off.status, "off");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).telemetry, {
    enabled: false,
  });
  await assert.rejects(
    ops.execute("telemetry.configure", { enabled: "yes" }),
    /telemetry\.enabled/,
  );
});

test("status holds the status, the counts and the local rows, never a header value or a path", async (t) => {
  const { ops, file } = setup(t);
  fs.writeFileSync(file, JSON.stringify({ telemetry: { enabled: true } }));
  const status = await ops.execute("telemetry.status", {});
  assert.deepEqual(Object.keys(status).sort(), [
    "dropped",
    "endpoint",
    "failure",
    "headerNames",
    "lastSuccessAt",
    "local",
    "protocol",
    "queued",
    "rejected",
    "sent",
    "status",
  ]);
  assert.deepEqual(status.local, { spans: 0, points: 0 });
});

test("the CLI prints the status and writes the setting", () => {
  const machine = temporaryDirectory("avoozl-telemetry-cli-");
  const env = {
    ...process.env,
    HOME: path.join(machine, "home"),
    XDG_CONFIG_HOME: path.join(machine, "config"),
    XDG_STATE_HOME: path.join(machine, "state"),
    OTEL_EXPORTER_OTLP_ENDPOINT:
      "https://u:p@otlp.example:4318/secret/path?q=1",
    OTEL_EXPORTER_OTLP_HEADERS: "authorization=CANARY-VALUE",
  };
  for (const key of Object.keys(env))
    if (/^(AVOOZL|KIROCREW|KIRO)(_|$)/.test(key)) delete env[key];
  const cli = path.resolve(import.meta.dirname, "../../../../cli.mjs");
  const workspace = path.join(machine, "workspace");
  execFileSync(process.execPath, [cli, "init", workspace], {
    env,
    encoding: "utf8",
    cwd: machine,
  });
  const run = (...args) =>
    execFileSync(
      process.execPath,
      [cli, "telemetry", ...args, "--workspace", workspace],
      { env, encoding: "utf8", cwd: machine },
    );
  assert.equal(JSON.parse(run("status")).status, "off");
  const on = run("enable");
  assert.equal(JSON.parse(on).status, "ready");
  for (const text of [on, run("status")]) {
    assert.ok(!text.includes("CANARY-VALUE"));
    assert.ok(!text.includes("secret"));
    assert.ok(!text.includes("u:p"));
    assert.equal(JSON.parse(text).endpoint, "https://otlp.example:4318");
    assert.deepEqual(JSON.parse(text).headerNames, ["authorization"]);
  }
  const saved = JSON.parse(
    fs.readFileSync(
      path.join(machine, "config", "avoozl", "config.json"),
      "utf8",
    ),
  );
  assert.deepEqual(saved.telemetry, { enabled: true });
  assert.equal(JSON.parse(run("disable")).status, "off");
});

test("no prompt, brief or skill names the setting", () => {
  const root = path.resolve(import.meta.dirname, "../../../..");
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(path.join(root, "prompts"));
  walk(path.join(root, ".kiro", "skills"));
  for (const file of files)
    assert.doesNotMatch(
      fs.readFileSync(file, "utf8"),
      /telemetry\.enabled|OTEL_EXPORTER|avoozl telemetry/,
      file,
    );
});
