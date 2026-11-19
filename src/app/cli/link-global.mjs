#!/usr/bin/env node
// Links the `avoozl` command globally after `npm install` or `npm ci` in a
// checkout (the `postinstall` script), as `npm link` does: the global
// `avoozl` then runs this checkout's cli.mjs from any folder. It skips CI, a
// global install, an install as another package's dependency, and
// AVOOZL_NO_GLOBAL_LINK=1. A failed link prints how to link by hand and never
// fails the install.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

// Returns why this install does not link the command, or "" when it does.
export function skipReason(env, dir) {
  if (env.AVOOZL_NO_GLOBAL_LINK) return "AVOOZL_NO_GLOBAL_LINK is set";
  if (env.CI) return "CI is set";
  if (env.npm_config_global === "true") return "this is a global install";
  if (dir.split(/[\\/]/).includes("node_modules"))
    return "Avoozl is installed as a dependency";
  return "";
}

// Returns the command and arguments that link `dir` into npm's global prefix.
// A folder installed globally is a symlink to it, and --ignore-scripts keeps
// that install from running this script again.
export function linkCommand(env, dir) {
  const args = [
    "install",
    "--global",
    "--install-links=false",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--loglevel=error",
    dir,
  ];
  return env.npm_execpath
    ? [process.execPath, [env.npm_execpath, ...args]]
    : ["npm", args];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reason = skipReason(process.env, root);
  if (reason) {
    console.log(`Not linking the global avoozl command: ${reason}.`);
  } else {
    const [command, args] = linkCommand(process.env, root),
      result = spawnSync(command, args, {
        stdio: "inherit",
        shell: command === "npm" && process.platform === "win32",
      });
    if (result.status === 0)
      console.log(`Linked the global avoozl command to ${root}.`);
    else
      console.warn(
        `Could not link the global avoozl command. Run "npm link" in ${root}, or use "node cli.mjs".`,
      );
  }
}
