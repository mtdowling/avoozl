// ot-3.4: register the exporter beside the tick (OT4.2, OT4.4, OT6.6, OT7.2,
// OT10.1, OT10.7).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { sandboxEnv } from "../../executors/sandbox.mjs";
import { Store } from "../../store/store.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { exporters, finishTask, point, span } from "../record.mjs";
import { startTelemetry, telemetryStatus } from "../index.mjs";
import { startCollector } from "./fake-collector.mjs";

function setup(t, enabled) {
  const configDirectory = temporaryDirectory("avoozl-config-");
  const stateDirectory = temporaryDirectory("avoozl-state-");
  const write = (value) =>
    fs.writeFileSync(
      path.join(configDirectory, "config.json"),
      JSON.stringify(value),
    );
  if (enabled !== undefined) write({ telemetry: { enabled } });
  const store = new Store(":memory:");
  t.after(() => store.close());
  return { store, configDirectory, stateDirectory, write };
}
const names = (store) => exporters(store).map((e) => e.name);
const record = (store, id) => {
  span(store, {
    key: `${id}:1:coding`,
    taskId: id,
    repo: "acme/app",
    spec: "acme-cache",
    stage: "coding",
    attempt: 1,
    startedAt: "2025-11-20T03:00:00.000Z",
    endedAt: "2025-11-20T03:10:00.000Z",
  });
  finishTask(store, {
    taskId: id,
    repo: "acme/app",
    spec: "acme-cache",
    finishedAt: "2025-11-20T03:30:00.000Z",
    outcome: "landed",
    firstPass: true,
  });
};

test("with the setting off nothing is registered and no connection opens", async (t) => {
  const collector = await startCollector(t);
  const s = setup(t);
  const env = { OTEL_EXPORTER_OTLP_ENDPOINT: collector.url };
  const handle = startTelemetry({ store: s.store, ...s, env });
  t.after(() => handle.stop());
  record(s.store, "a1");
  await handle.flush();
  assert.deepEqual(names(s.store), ["sqlite"]);
  assert.equal(collector.requests.length, 0);
  assert.equal(handle.status().status, "off");
  assert.equal(telemetryStatus(s.store, { ...s, env }).local.spans, 2);
});

test("turning it on registers the exporter and sees only later records; off empties the queue", async (t) => {
  const collector = await startCollector(t);
  const s = setup(t, false);
  const env = {
    OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
    OTEL_EXPORTER_OTLP_HEADERS: "x-team=blue",
  };
  const handle = startTelemetry({ store: s.store, ...s, env });
  t.after(() => handle.stop());
  record(s.store, "before");
  s.write({ telemetry: { enabled: true } });
  await handle.step();
  assert.deepEqual(names(s.store), ["sqlite", "otlp"]);
  assert.equal(collector.requests.length, 0, "earlier records are not sent");
  record(s.store, "after");
  await handle.flush();
  const traces = collector.requests.filter((r) => r.url === "/v1/traces");
  assert.equal(traces.length, 1);
  const spans = traces[0].body.resourceSpans[0].scopeSpans[0].spans;
  assert.ok(spans[0].attributes.some((a) => a.value.stringValue === "after"));
  assert.equal(handle.status().status, "sending");
  assert.equal(handle.status().sent > 0, true);
  // Off again: the queue is emptied and nothing more is sent.
  s.write({ telemetry: { enabled: false } });
  point(s.store, {
    id: "queued",
    name: "avoozl.tokens",
    kind: "sum",
    value: 1,
    at: "2025-11-20T04:00:00.000Z",
  });
  record(s.store, "queued-trace");
  const count = collector.requests.length;
  await handle.step();
  assert.deepEqual(names(s.store), ["sqlite"]);
  await handle.flush();
  assert.equal(collector.requests.length, count);
});

test("a collector that never answers leaves recording unchanged and raises nothing", async (t) => {
  const collector = await startCollector(t);
  collector.behave = () => "hold";
  const s = setup(t, true);
  const env = {
    OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
    OTEL_EXPORTER_OTLP_TIMEOUT: "200",
  };
  const handle = startTelemetry({ store: s.store, ...s, env });
  t.after(() => handle.stop());
  const started = Date.now();
  record(s.store, "a1");
  assert.ok(Date.now() - started < 1000);
  await handle.flush(1000);
  assert.equal(handle.status().failure, "timeout");
  assert.equal(handle.status().status, "backing-off");
  // No notification and no Needs you item came of it.
  assert.deepEqual(s.store.list("app_notifications"), []);
});

test("a status with no endpoint, a bad protocol or a remote http endpoint sends nothing", async (t) => {
  const s = setup(t, true);
  for (const [env, status] of [
    [{}, "no-endpoint"],
    [
      {
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://x.example",
        OTEL_EXPORTER_OTLP_PROTOCOL: "grpc",
      },
      "protocol",
    ],
    [
      { OTEL_EXPORTER_OTLP_ENDPOINT: "http://x.example" },
      "endpoint-not-allowed",
    ],
  ]) {
    const handle = startTelemetry({ store: s.store, ...s, env });
    record(s.store, status);
    await handle.step();
    assert.equal(handle.status().status, status);
    assert.deepEqual(names(s.store), ["sqlite"]);
    handle.stop();
  }
});

test("an agent process gets no OTEL_ variable", () => {
  const env = sandboxEnv({
    PATH: process.env.PATH,
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://x.example",
    OTEL_EXPORTER_OTLP_HEADERS: "authorization=CANARY",
    OTEL_SERVICE_NAME: "x",
  });
  const seen = JSON.parse(
    execFileSync(
      process.execPath,
      ["-e", "console.log(JSON.stringify(Object.keys(process.env)))"],
      { env, encoding: "utf8" },
    ),
  );
  assert.deepEqual(
    seen.filter((name) => name.startsWith("OTEL_")),
    [],
  );
});

test("the tick, workers, checks and landing import only the recording API", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "test") walk(full);
      else if (entry.name.endsWith(".mjs")) files.push(full);
    }
  };
  for (const folder of ["tick", "workers", "landing"])
    walk(path.join(root, folder));
  files.push(
    path.join(root, "delivery", "check-runs.mjs"),
    path.join(root, "plugins", "check-decide.mjs"),
  );
  for (const file of files) {
    const imports = [
      ...fs
        .readFileSync(file, "utf8")
        .matchAll(/from\s+["']([^"']*telemetry\/[^"']*)["']/g),
    ].map((match) => match[1]);
    for (const spec of imports)
      assert.ok(spec.endsWith("/record.mjs"), `${file} imports ${spec}`);
  }
});
