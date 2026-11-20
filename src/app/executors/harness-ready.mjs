// Whether a harness can start on this machine's server, and why not (MS5.3):
// its program is not on `PATH`, or none of its sign-in variables is set and no
// model proxy is named. One function, read by `avoozl status`, Settings ›
// Models and the Needs you item a blocked request opens.
import fs from "node:fs";
import path from "node:path";

function onPath(program, pathEnv, platform) {
  if (path.isAbsolute(program)) return fs.existsSync(program);
  const names =
    platform === "win32"
      ? ["", ".exe", ".cmd", ".bat"].map((suffix) => program + suffix)
      : [program];
  return String(pathEnv ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .some((directory) =>
      names.some((name) => {
        try {
          fs.accessSync(path.join(directory, name), fs.constants.X_OK);
          return true;
        } catch {
          return false;
        }
      }),
    );
}

// `value` is the definition's parsed JSON. Returns a sentence, or null when it
// can start. `modelProxy` is true when a repository names a model proxy.
export function harnessStartProblem(
  value,
  {
    env = process.env,
    machineEnv = {},
    modelProxy = false,
    platform = process.platform,
  } = {},
) {
  const program = Array.isArray(value?.start) ? value.start[0] : null;
  if (typeof program !== "string" || !program) return null;
  if (!onPath(program, env.PATH, platform))
    return `${program} is not on the PATH of this machine's server.`;
  const keep = Array.isArray(value.keepEnv) ? value.keepEnv : [];
  if (
    keep.length &&
    !modelProxy &&
    !keep.some((name) => env[name] || machineEnv[name])
  )
    return `None of ${keep.join(", ")} is set for this machine's server, and no repository names a model proxy. Set one in machine.env.`;
  return null;
}
