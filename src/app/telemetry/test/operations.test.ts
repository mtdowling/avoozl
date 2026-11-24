// ot-4.1: operations and CLI (OT5.3, OT5.5, OT11.7, OT11.8).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { OPERATIONS } from "../../api/operation-table.ts";
import { Operations, type OperationContext } from "../../api/operations.ts";
import type { StatusError } from "../../store/store.ts";
import type { telemetryStatus } from "../index.ts";

// What telemetry.status and telemetry.configure answer.
type Status = ReturnType<typeof telemetryStatus>;
import { GROUPED_TOOLS } from "../../mcp/mcp-tools.ts";
import { fixture } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

function setup(t: TestContext) {
  const { root, store } = fixture(t);
  const configDirectory = path.join(root, "machine-config");
  fs.mkdirSync(configDirectory, { recursive: true });
  const file = path.join(configDirectory, "config.json");
  return {
    file,
    ops: new Operations(store, { workspaceRoot: root, configDirectory }),
  };
}

test("telemetry.configure is audited and on MCP, and telemetry.status is not on MCP", async (t) => {
  const { ops, file } = setup(t);
  const contexts: OperationContext[] = [
    { mcp: true },
    { caller: { sessionKey: "worker-session" } },
  ];
  for (const context of contexts)
    await ops.execute(
      "telemetry.configure",
      { enabled: false },
      undefined,
      context,
    );
  assert.equal(fs.existsSync(file), true);
  assert.equal(OPERATIONS.get("telemetry.configure").policy.audit, true);
  assert.equal(OPERATIONS.get("telemetry.status").policy.kind, "notOnMcp");
  assert.equal(OPERATIONS.get("telemetry.status").class, "observe");
  assert.deepEqual(
    Object.values(GROUPED_TOOLS).flatMap((tool) =>
      Object.values(tool.actions)
        .map(([operation]) => operation)
        .filter((operation) => operation.startsWith("telemetry")),
    ),
    ["telemetry.configure"],
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
  const on = await ops.execute<Status>("telemetry.configure", {
    enabled: true,
  });
  assert.equal(on.status, "no-endpoint");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
    version: 1,
    machine: { alias: "box" },
    serve: { port: 4000 },
    telemetry: { enabled: true },
  });
  const off = await ops.execute<Status>("telemetry.configure", {
    enabled: false,
  });
  assert.equal(off.status, "off");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).telemetry, {
    enabled: false,
  });
  await assert.rejects(
    ops.execute("telemetry.configure", { enabled: "yes" }),
    /telemetry\.enabled/,
  );
});

test("configure saves the endpoint, protocol and header names, never a value", async (t) => {
  const { ops, file } = setup(t);
  const saved = await ops.execute<Status>("telemetry.configure", {
    enabled: true,
    endpoint: "https://otlp.example:4318",
    protocol: "http/json",
    headers: ["authorization"],
  });
  assert.equal(saved.status, "missing-headers");
  assert.deepEqual(saved.missingHeaders, ["authorization"]);
  assert.deepEqual(saved.saved, {
    endpoint: "https://otlp.example:4318",
    protocol: "http/json",
    headers: ["authorization"],
  });
  await ops.execute<Status>("telemetry.configure", { enabled: false });
  assert.equal(
    JSON.parse(fs.readFileSync(file, "utf8")).telemetry.endpoint,
    "https://otlp.example:4318",
    "turning it off keeps the rest",
  );
  await ops.execute<Status>("telemetry.configure", { endpoint: "" });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).telemetry, {
    enabled: false,
    protocol: "http/json",
    headers: ["authorization"],
  });
  const inputs: Record<string, unknown>[] = [
    {},
    { headers: ["authorization=Bearer x"] },
    { endpoint: "https://u:p@otlp.example" },
    { token: "x" },
  ];
  for (const input of inputs)
    await assert.rejects(ops.execute("telemetry.configure", input));
  assert.ok(!fs.readFileSync(file, "utf8").includes("Bearer"));
});

test("status holds the status, the counts and the local rows, never a header value or a path", async (t) => {
  const { ops, file } = setup(t);
  fs.writeFileSync(file, JSON.stringify({ telemetry: { enabled: true } }));
  const status = await ops.execute<Status>("telemetry.status", {});
  assert.deepEqual(Object.keys(status).sort(), [
    "dropped",
    "endpoint",
    "endpointFrom",
    "failure",
    "headerNames",
    "lastSuccessAt",
    "local",
    "missingHeaders",
    "protocol",
    "queued",
    "rejected",
    "saved",
    "sent",
    "status",
  ]);
  assert.deepEqual(status.local, {
    spans: 0,
    points: 0,
    days: 90,
    spanCap: 200_000,
    pointCap: 1_000_000,
  });
});

test("the CLI prints the status and writes the setting", () => {
  const machine = temporaryDirectory("avoozl-telemetry-cli-");
  const env: NodeJS.ProcessEnv = {
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
  const cli = path.resolve(import.meta.dirname, "../../../../cli.ts");
  const workspace = path.join(machine, "workspace");
  execFileSync(process.execPath, [cli, "init", workspace], {
    env,
    encoding: "utf8",
    cwd: machine,
  });
  const run = (...args: string[]) =>
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
  const files: string[] = [];
  const walk = (dir: string) => {
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
