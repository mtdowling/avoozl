// `telemetry.enabled`: the machine setting that turns on the OTLP exporter
// (spec otel-export, OT4). Everything else about it is the standard OTLP
// environment of the process that runs the tick. It is a machine setting, so
// `.avoozl.json` may not hold it (landing-config.mjs).
export const TELEMETRY_KEYS = ["enabled"];

export function validateTelemetry(value, source = "Avoozl configuration") {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw Error(`${source}: telemetry must be an object.`);
  for (const key of Object.keys(value))
    if (!TELEMETRY_KEYS.includes(key))
      throw Error(`${source}: telemetry.${key} is not a known setting.`);
  if (value.enabled !== undefined && typeof value.enabled !== "boolean")
    throw Error(`${source}: telemetry.enabled must be true or false.`);
}
