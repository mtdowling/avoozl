// `machine.tickSeconds`: how often the machine server passes over every enabled
// workspace (MS1.1, MS1.6). A machine setting, so `.avoozl.json` may not hold
// it (landing-config.mjs).
import fs from "node:fs";
import path from "node:path";

export const TICK_SECONDS_DEFAULT = 60;
const MIN = 10;
const MAX = 86400;

export function validateTickSeconds(value, source = "Avoozl configuration") {
  if (value === undefined) return;
  if (!(Number.isInteger(value) && value >= MIN && value <= MAX))
    throw Error(
      `${source}: machine.tickSeconds must be a whole number from ${MIN} to ${MAX}.`,
    );
}

// Seconds between passes from the machine file, or the default when it says
// nothing or cannot be read.
export function readTickSeconds(configDirectory) {
  try {
    const { machine } = JSON.parse(
      fs.readFileSync(path.join(configDirectory, "config.json"), "utf8"),
    );
    validateTickSeconds(machine?.tickSeconds);
    return machine?.tickSeconds ?? TICK_SECONDS_DEFAULT;
  } catch {
    return TICK_SECONDS_DEFAULT;
  }
}
