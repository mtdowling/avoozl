// Run `avoozl mcp` (directly, or through the Kiro Crew launcher) on a machine
// of its own: each run gets its own state folder under `dir`, so a tick it
// runs never touches this machine's state.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LAUNCHER = fileURLToPath(
  new URL("../../../hosts/kirocrew/bin/avoozl_mcp.py", import.meta.url),
);

export function runOwnMachine(program, args, { dir, env, ...options }) {
  return execFileSync(program, args, {
    encoding: "utf8",
    ...options,
    env: { ...env, XDG_STATE_HOME: path.join(dir, "state") },
  });
}

// The tools the packaged Kiro Crew MCP launcher lists for `workspace`.
export function packagedTools({ dir, workspace, env }) {
  const output = runOwnMachine(
    "python3",
    [LAUNCHER, "--workspace", workspace],
    {
      cwd: dir,
      dir,
      env,
      input:
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n",
    },
  );
  return JSON.parse(output.trim().split("\n")[0]).result.tools;
}

// An environment for a machine of its own under `root`: its own home, config
// and state folders, and no Avoozl or Kiro Crew variable from this machine.
export function ownMachineEnv(root) {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^AVOOZL(_|$)|^KIROCREW_/.test(key)) delete env[key];
  Object.assign(env, {
    HOME: path.join(root, "home"),
    USERPROFILE: path.join(root, "home"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
  });
  fs.mkdirSync(env.HOME, { recursive: true });
  return env;
}
