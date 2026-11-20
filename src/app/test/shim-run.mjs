// Run `avoozl mcp` (directly, or through the Kiro Crew launcher) on a machine
// of its own: the shim starts a machine server, so each run gets its own state
// folder under `dir` and stops that server before returning (MS10.3).
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));

export function runOwnMachine(program, args, { dir, env, ...options }) {
  const machine = { ...env, XDG_STATE_HOME: path.join(dir, "state") };
  try {
    return execFileSync(program, args, {
      encoding: "utf8",
      ...options,
      env: machine,
    });
  } finally {
    spawnSync(process.execPath, [CLI, "stop"], {
      env: machine,
      encoding: "utf8",
      timeout: 60_000,
    });
  }
}
