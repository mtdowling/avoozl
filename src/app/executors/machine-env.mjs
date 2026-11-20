// `machine.env` in the machine config folder (MS5.2, design D6): `NAME=value`
// lines that give an unattended child its model access when the machine
// server's own environment lacks it. Only names in a harness definition's
// `keepEnv` reach a child. The file is under the config folder, which every
// child's sandbox already hides, and its values are never logged or shown.
import fs from "node:fs";
import path from "node:path";
import { fail } from "../store/store.mjs";

export const machineEnvPath = (configDirectory) =>
  path.join(path.resolve(configDirectory), "machine.env");

// The file's values, {} when there is none. On macOS and Linux a file anyone
// but the owner can read is refused, naming the file and never a value.
export function readMachineEnv(configDirectory) {
  const file = machineEnvPath(configDirectory);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  if (process.platform !== "win32" && stat.mode & 0o077)
    fail(`${file} can be read by other users. Run: chmod 600 ${file}`, 409);
  const values = {};
  for (const [index, line] of fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .entries()) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]{0,63})\s*=(.*)$/.exec(
      line,
    );
    if (!match) fail(`${file} line ${index + 1} is not NAME=value.`, 400);
    values[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

// `env` with each `keep` name that it lacks filled from the machine file.
export function withKeptValues(env, keep, machineEnv) {
  const out = { ...env };
  for (const name of keep)
    if (!out[name] && machineEnv[name]) out[name] = machineEnv[name];
  return out;
}
