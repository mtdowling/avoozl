// Reads the machine setting (spec otel-export, OT4, OT5): `telemetry.enabled`
// in the machine config's `config.json`. A missing file, a missing key or a
// file that cannot be read all mean off.
import fs from "node:fs";
import path from "node:path";
import { validateTelemetry } from "../settings/telemetry-config.mjs";

export function readTelemetryConfig(configDirectory) {
  let enabled = false;
  try {
    const file = path.join(configDirectory, "config.json");
    const { telemetry } = JSON.parse(fs.readFileSync(file, "utf8"));
    validateTelemetry(telemetry);
    enabled = telemetry?.enabled === true;
  } catch {}
  return { enabled, status: enabled ? "no-endpoint" : "off" };
}
