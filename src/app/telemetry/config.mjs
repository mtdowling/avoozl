// Reads the OTLP exporter's configuration (spec otel-export, OT4 to OT6, OT12):
// the machine setting `telemetry.enabled` in the machine config's
// `config.json`, and the standard OTEL_EXPORTER_OTLP_* environment of the
// process that runs the tick. A missing file, a missing key or a file that
// cannot be read all mean off.
import fs from "node:fs";
import path from "node:path";
import { validateTelemetry } from "../settings/telemetry-config.mjs";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

// "a=1,b=2" as {a: "1", b: "2"}. A pair that is not name=value, or whose name
// is not a header name, is refused by its name and never by its value.
export function parseHeaders(text) {
  const headers = {};
  for (const pair of String(text ?? "")
    .split(",")
    .filter((part) => part.trim())) {
    const at = pair.indexOf("=");
    const name = (at < 0 ? pair : pair.slice(0, at)).trim();
    if (at < 0 || !TOKEN.test(name))
      throw Error(
        `OTEL_EXPORTER_OTLP_HEADERS: "${name.slice(0, 40)}" is not name=value.`,
      );
    const value = pair.slice(at + 1).trim();
    try {
      headers[name.toLowerCase()] = decodeURIComponent(value);
    } catch {
      headers[name.toLowerCase()] = value;
    }
  }
  return headers;
}

// "a=1,b=2" resource attributes; a malformed pair is left out.
function parseResource(text) {
  const attributes = {};
  for (const pair of String(text ?? "").split(",")) {
    const at = pair.indexOf("=");
    const name = pair.slice(0, at).trim();
    if (at > 0 && name) attributes[name] = pair.slice(at + 1).trim();
  }
  return attributes;
}

// Where one signal goes: its own endpoint as set, else the shared endpoint
// with the signal's path added.
function signalEndpoint(own, shared, path) {
  if (own) return own;
  return shared ? `${shared.replace(/\/+$/, "")}${path}` : null;
}

// https, or http to this machine, and nothing else.
function allowed(endpoint) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOOPBACK.has(url.hostname))
    );
  } catch {
    return false;
  }
}

// The endpoint as scheme, host and port only: never a user, password, path or
// query (OT6.4).
export function showEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function readEnabled(configDirectory) {
  try {
    const file = path.join(configDirectory, "config.json");
    const { telemetry } = JSON.parse(fs.readFileSync(file, "utf8"));
    validateTelemetry(telemetry);
    return telemetry?.enabled === true;
  } catch {
    return false;
  }
}

// {enabled, status, endpoints, endpoint, protocol, headerNames, headers,
// timeoutMs, serviceName, resource}. `headers` holds the values: only
// `send.mjs` reads it, and no status reply carries it.
export function readTelemetryConfig(configDirectory, env = process.env) {
  const enabled = readEnabled(configDirectory);
  const shared = env.OTEL_EXPORTER_OTLP_ENDPOINT || null;
  const endpoints = {
    traces: signalEndpoint(
      env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      shared,
      "/v1/traces",
    ),
    metrics: signalEndpoint(
      env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
      shared,
      "/v1/metrics",
    ),
  };
  const protocol = env.OTEL_EXPORTER_OTLP_PROTOCOL || "http/json";
  const timeout = Number.parseInt(env.OTEL_EXPORTER_OTLP_TIMEOUT, 10);
  const config = {
    enabled,
    endpoints,
    endpoint: showEndpoint(endpoints.traces ?? endpoints.metrics),
    protocol,
    headerNames: [],
    headers: {},
    timeoutMs:
      timeout > 0 ? Math.min(timeout, MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS,
    serviceName: env.OTEL_SERVICE_NAME || "avoozl",
    resource: parseResource(env.OTEL_RESOURCE_ATTRIBUTES),
  };
  const found = Object.values(endpoints).filter(Boolean);
  if (!enabled) return { ...config, status: "off" };
  if (!found.length) return { ...config, status: "no-endpoint" };
  if (protocol !== "http/json") return { ...config, status: "protocol" };
  if (!found.every(allowed))
    return { ...config, status: "endpoint-not-allowed" };
  try {
    config.headers = parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);
  } catch {
    return { ...config, status: "bad-headers" };
  }
  config.headerNames = Object.keys(config.headers);
  return { ...config, status: "ready" };
}
