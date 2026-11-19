// `serve.enabled` and `serve.port`: the machine configuration that makes the
// supervisor host the standalone page (spec standalone-web, SW9). They are
// machine settings, so `.avoozl.json` may not hold them (landing-config.mjs).
import fs from "node:fs";
import path from "node:path";

// Whole-number port range of `avoozl serve --port` (SW3.2).
const SERVE_PORT_MIN = 1024;
const SERVE_PORT_MAX = 65535;

export const SERVE_KEYS = ["enabled", "port"];

export function validateServe(value, source = "Avoozl configuration") {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw Error(`${source}: serve must be an object.`);
  for (const key of Object.keys(value))
    if (!SERVE_KEYS.includes(key))
      throw Error(`${source}: serve.${key} is not a known setting.`);
  if (value.enabled !== undefined && typeof value.enabled !== "boolean")
    throw Error(`${source}: serve.enabled must be true or false.`);
  if (
    value.port !== undefined &&
    !(
      Number.isInteger(value.port) &&
      value.port >= SERVE_PORT_MIN &&
      value.port <= SERVE_PORT_MAX
    )
  )
    throw Error(
      `${source}: serve.port must be a whole number from ${SERVE_PORT_MIN} to ${SERVE_PORT_MAX}.`,
    );
}

// What the machine file says: { enabled, port }, off when it says nothing or
// cannot be read (the supervisor then runs no server).
export function readServeConfig(configDirectory) {
  try {
    const file = path.join(configDirectory, "config.json");
    const { serve } = JSON.parse(fs.readFileSync(file, "utf8"));
    validateServe(serve);
    return { enabled: serve?.enabled === true, port: serve?.port ?? 0 };
  } catch {
    return { enabled: false, port: 0 };
  }
}
