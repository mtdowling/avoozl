// `serve.enabled` and `serve.port`: the machine configuration that makes the
// supervisor host the standalone page (spec standalone-web, SW9). They are
// machine settings, so `.avoozl.json` may not hold them (landing-config.mjs).
import fs from "node:fs";
import path from "node:path";

// Whole-number port range of `serve.port` (SW3.2).
const SERVE_PORT_MIN = 1024;
const SERVE_PORT_MAX = 65535;

export const SERVE_KEYS = ["enabled", "port"];

export function validateServe(value: unknown, source = "Avoozl configuration") {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw Error(`${source}: serve must be an object.`);
  const serve = value as { enabled?: unknown; port?: unknown };
  for (const key of Object.keys(value))
    if (!SERVE_KEYS.includes(key))
      throw Error(`${source}: serve.${key} is not a known setting.`);
  if (serve.enabled !== undefined && typeof serve.enabled !== "boolean")
    throw Error(`${source}: serve.enabled must be true or false.`);
  if (
    serve.port !== undefined &&
    !(
      typeof serve.port === "number" &&
      Number.isInteger(serve.port) &&
      serve.port >= SERVE_PORT_MIN &&
      serve.port <= SERVE_PORT_MAX
    )
  )
    throw Error(
      `${source}: serve.port must be a whole number from ${SERVE_PORT_MIN} to ${SERVE_PORT_MAX}.`,
    );
}

// What the machine file says: { enabled, port }. On unless `serve.enabled` is
// false; a missing file is on too. A file that cannot be parsed or holds a bad
// `serve` value turns it off (the supervisor then runs no server).
export function readServeConfig(configDirectory: string) {
  const file = path.join(configDirectory, "config.json");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return { enabled: missing, port: 0 };
  }
  try {
    const { serve } = JSON.parse(text);
    validateServe(serve);
    return { enabled: serve?.enabled !== false, port: serve?.port ?? 0 };
  } catch {
    return { enabled: false, port: 0 };
  }
}
