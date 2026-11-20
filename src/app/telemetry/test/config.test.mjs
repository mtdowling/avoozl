// ot-3.1: the environment and the endpoint check (OT6, OT12.1, OT12.5).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { parseHeaders, readTelemetryConfig } from "../config.mjs";
import { instanceId } from "../state.mjs";

function machine(enabled = true) {
  const directory = temporaryDirectory("avoozl-telemetry-");
  fs.writeFileSync(
    path.join(directory, "config.json"),
    JSON.stringify({ telemetry: { enabled } }),
  );
  return directory;
}
const read = (env, enabled) => readTelemetryConfig(machine(enabled), env);

test("a shared endpoint gets the signal paths and a signal endpoint does not", () => {
  const shared = read({
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example:4318/",
  });
  assert.deepEqual(shared.endpoints, {
    traces: "https://otlp.example:4318/v1/traces",
    metrics: "https://otlp.example:4318/v1/metrics",
  });
  const own = read({
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example:4318",
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://traces.example/custom",
  });
  assert.equal(own.endpoints.traces, "https://traces.example/custom");
  assert.equal(own.endpoints.metrics, "https://otlp.example:4318/v1/metrics");
});

test("the status follows the setting, the endpoint, the protocol and the host", () => {
  const https = { OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example" };
  assert.equal(read(https, false).status, "off");
  assert.equal(read({}, true).status, "no-endpoint");
  assert.equal(read(https).status, "ready");
  assert.equal(read(https).protocol, "http/json");
  for (const protocol of ["grpc", "http/protobuf"])
    assert.equal(
      read({ ...https, OTEL_EXPORTER_OTLP_PROTOCOL: protocol }).status,
      "protocol",
    );
  assert.equal(
    read({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://otlp.example" }).status,
    "endpoint-not-allowed",
  );
  assert.equal(
    read({ OTEL_EXPORTER_OTLP_ENDPOINT: "ftp://127.0.0.1" }).status,
    "endpoint-not-allowed",
  );
  for (const host of ["localhost", "127.0.0.1", "[::1]"])
    assert.equal(
      read({ OTEL_EXPORTER_OTLP_ENDPOINT: `http://${host}:4318` }).status,
      "ready",
      host,
    );
});

test("headers parse into names and values, and a bad pair is refused by name", () => {
  assert.deepEqual(parseHeaders("a=1,b=2"), { a: "1", b: "2" });
  assert.deepEqual(parseHeaders("Authorization=Bearer%20x=="), {
    authorization: "Bearer x==",
  });
  assert.throws(
    () => parseHeaders("a=1,secretvalue"),
    /"secretvalue" is not name=value/,
  );
  const config = read({
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://u:p@otlp.example:4318/path?q=1",
    OTEL_EXPORTER_OTLP_HEADERS: "authorization=CANARY-VALUE,x-team=blue",
  });
  assert.deepEqual(config.headerNames, ["authorization", "x-team"]);
  assert.equal(config.endpoint, "https://otlp.example:4318");
  assert.equal(
    read({
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example",
      OTEL_EXPORTER_OTLP_HEADERS: "broken",
    }).status,
    "bad-headers",
  );
});

test("the timeout, service name and resource have their defaults", () => {
  const base = { OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example" };
  assert.equal(read(base).timeoutMs, 10_000);
  assert.equal(
    read({ ...base, OTEL_EXPORTER_OTLP_TIMEOUT: "500" }).timeoutMs,
    500,
  );
  assert.equal(
    read({ ...base, OTEL_EXPORTER_OTLP_TIMEOUT: "99999" }).timeoutMs,
    30_000,
  );
  assert.equal(read(base).serviceName, "avoozl");
  const set = read({
    ...base,
    OTEL_SERVICE_NAME: "flow",
    OTEL_RESOURCE_ATTRIBUTES: "team=blue,bad",
  });
  assert.equal(set.serviceName, "flow");
  assert.deepEqual(set.resource, { team: "blue" });
});

test("the instance ID is made once and returned after", () => {
  const directory = path.join(temporaryDirectory("avoozl-state-"), "state");
  const first = instanceId(directory);
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.equal(instanceId(directory), first);
  fs.writeFileSync(path.join(directory, "telemetry.json"), "not json");
  const fresh = instanceId(directory);
  assert.notEqual(fresh, first);
  assert.equal(instanceId(directory), fresh);
});

test("a saved endpoint and protocol are used, and the environment beats them", () => {
  const directory = temporaryDirectory("avoozl-telemetry-");
  fs.writeFileSync(
    path.join(directory, "config.json"),
    JSON.stringify({
      telemetry: {
        enabled: true,
        endpoint: "https://saved.example:4318",
        protocol: "http/json",
      },
    }),
  );
  const saved = readTelemetryConfig(directory, {});
  assert.equal(saved.status, "ready");
  assert.equal(saved.endpoints.traces, "https://saved.example:4318/v1/traces");
  assert.equal(saved.endpointFrom, "machine");
  const env = readTelemetryConfig(directory, {
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://env.example",
    OTEL_EXPORTER_OTLP_PROTOCOL: "grpc",
  });
  assert.equal(env.endpoint, "https://env.example");
  assert.equal(env.endpointFrom, "environment");
  assert.equal(env.status, "protocol");
});

test("a saved header name with no value in the environment holds the export", () => {
  const directory = temporaryDirectory("avoozl-telemetry-");
  fs.writeFileSync(
    path.join(directory, "config.json"),
    JSON.stringify({
      telemetry: {
        enabled: true,
        endpoint: "https://saved.example",
        headers: ["Authorization"],
      },
    }),
  );
  const missing = readTelemetryConfig(directory, {});
  assert.equal(missing.status, "missing-headers");
  assert.deepEqual(missing.missingHeaders, ["Authorization"]);
  const found = readTelemetryConfig(directory, {
    OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20x",
  });
  assert.equal(found.status, "ready");
  assert.deepEqual(found.missingHeaders, []);
});
