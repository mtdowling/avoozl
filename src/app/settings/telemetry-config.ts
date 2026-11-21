// @ts-nocheck: typing debt
// `telemetry`: the machine setting for the OTLP exporter (spec otel-export,
// OT4, OT5). `enabled` turns it on; `endpoint`, `protocol` and `headers` (the
// header NAMES only) are what the Telemetry form saves. The standard OTLP
// environment of the process that runs the tick beats each of them, and
// header values only ever come from that environment. It is a machine
// setting, so `.avoozl.json` may not hold it (landing-config.mjs).
export const TELEMETRY_KEYS = ["enabled", "endpoint", "protocol", "headers"];
export const TELEMETRY_PROTOCOLS = ["http/json"];
export const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

// https, or http to this machine, and nothing else (OT12.1).
export function endpointAllowed(endpoint) {
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

// A saved endpoint holds no user, password, query or fragment, so it is safe
// to show and to keep in a file.
function checkEndpoint(endpoint, source) {
  if (typeof endpoint !== "string" || !endpointAllowed(endpoint))
    throw Error(
      `${source}: telemetry.endpoint must be an https URL, or http to localhost, 127.0.0.1 or ::1.`,
    );
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash)
    throw Error(
      `${source}: telemetry.endpoint may not hold a user, a password, a query or a fragment.`,
    );
}

export function validateTelemetry(value, source = "Avoozl configuration") {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw Error(`${source}: telemetry must be an object.`);
  for (const key of Object.keys(value))
    if (!TELEMETRY_KEYS.includes(key))
      throw Error(`${source}: telemetry.${key} is not a known setting.`);
  if (value.enabled !== undefined && typeof value.enabled !== "boolean")
    throw Error(`${source}: telemetry.enabled must be true or false.`);
  if (value.endpoint !== undefined) checkEndpoint(value.endpoint, source);
  if (
    value.protocol !== undefined &&
    !TELEMETRY_PROTOCOLS.includes(value.protocol)
  )
    throw Error(`${source}: telemetry.protocol must be http/json.`);
  if (
    value.headers !== undefined &&
    (!Array.isArray(value.headers) ||
      value.headers.length > 20 ||
      !value.headers.every(
        (name) => typeof name === "string" && HEADER_NAME.test(name),
      ))
  )
    throw Error(
      `${source}: telemetry.headers must be a list of header names, never values.`,
    );
}
