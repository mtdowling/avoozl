// Reads the OTLP exporter's configuration (spec otel-export, OT4 to OT6, OT12):
// the machine setting `telemetry` in the machine config's `config.json`, and
// the standard OTEL_EXPORTER_OTLP_* environment of the process that runs the
// tick, which beats the saved endpoint and protocol. Header values come from
// the environment only. A missing file, a missing key or a file that cannot
// be read all mean off.
import fs from "node:fs";
import path from "node:path";
import {
  HEADER_NAME,
  endpointAllowed,
  validateTelemetry,
} from "../settings/telemetry-config.ts";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

// "a=1,b=2" as {a: "1", b: "2"}. A pair that is not name=value, or whose name
// is not a header name, is refused by its name and never by its value.
export function parseHeaders(text: unknown) {
  const headers: Record<string, string> = {};
  for (const pair of String(text ?? "")
    .split(",")
    .filter((part) => part.trim())) {
    const at = pair.indexOf("=");
    const name = (at < 0 ? pair : pair.slice(0, at)).trim();
    if (at < 0 || !HEADER_NAME.test(name))
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
function parseResource(text: unknown) {
  const attributes: Record<string, string> = {};
  for (const pair of String(text ?? "").split(",")) {
    const at = pair.indexOf("=");
    const name = pair.slice(0, at).trim();
    if (at > 0 && name) attributes[name] = pair.slice(at + 1).trim();
  }
  return attributes;
}

// Where one signal goes: its own endpoint as set, else the shared endpoint
// with the signal's path added.
function signalEndpoint(
  own: string | undefined,
  shared: string | null,
  path: string,
) {
  if (own) return own;
  return shared ? `${shared.replace(/\/+$/, "")}${path}` : null;
}

// The endpoint as scheme, host and port only: never a user, password, path or
// query (OT6.6).
function showEndpoint(endpoint: string | null) {
  try {
    const url = new URL(String(endpoint));
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

// The saved setting, or {} when there is none or it cannot be read.
type TelemetrySetting = {
  enabled?: boolean;
  endpoint?: string;
  protocol?: string;
  headers?: string[];
};

function readTelemetrySetting(configDirectory: string): TelemetrySetting {
  try {
    const file = path.join(configDirectory, "config.json");
    const { telemetry } = JSON.parse(fs.readFileSync(file, "utf8"));
    validateTelemetry(telemetry);
    return telemetry ?? {};
  } catch {
    return {};
  }
}

// {enabled, status, endpoints, endpoint, endpointFrom, protocol, headerNames,
// missingHeaders, headers, timeoutMs, serviceName, resource, saved}.
// `headers` holds the values: only `send.ts` reads it, and no status reply
// carries it.
export function readTelemetryConfig(
  configDirectory: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const saved = readTelemetrySetting(configDirectory);
  const enabled = saved.enabled === true;
  const fromEnv = Boolean(
    env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  );
  const shared = env.OTEL_EXPORTER_OTLP_ENDPOINT || saved.endpoint || null;
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
  const protocol =
    env.OTEL_EXPORTER_OTLP_PROTOCOL || saved.protocol || "http/json";
  const timeout = Number.parseInt(env.OTEL_EXPORTER_OTLP_TIMEOUT ?? "", 10);
  const config = {
    enabled,
    endpoints,
    endpoint: showEndpoint(endpoints.traces ?? endpoints.metrics),
    endpointFrom: fromEnv ? "environment" : saved.endpoint ? "machine" : null,
    protocol,
    headerNames: [] as string[],
    missingHeaders: [] as string[],
    headers: {} as Record<string, string>,
    timeoutMs:
      timeout > 0 ? Math.min(timeout, MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS,
    serviceName: env.OTEL_SERVICE_NAME || "avoozl",
    resource: parseResource(env.OTEL_RESOURCE_ATTRIBUTES),
    saved: {
      endpoint: saved.endpoint ?? null,
      protocol: saved.protocol ?? "http/json",
      headers: saved.headers ?? [],
    },
  };
  const found = Object.values(endpoints).filter(Boolean);
  if (!enabled) return { ...config, status: "off" };
  if (!found.length) return { ...config, status: "no-endpoint" };
  if (protocol !== "http/json") return { ...config, status: "protocol" };
  if (!found.every(endpointAllowed))
    return { ...config, status: "endpoint-not-allowed" };
  try {
    config.headers = parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);
  } catch {
    return { ...config, status: "bad-headers" };
  }
  config.headerNames = Object.keys(config.headers);
  config.missingHeaders = config.saved.headers.filter(
    (name) => !(name.toLowerCase() in config.headers),
  );
  if (config.missingHeaders.length)
    return { ...config, status: "missing-headers" };
  return { ...config, status: "ready" };
}
