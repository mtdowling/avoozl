// @ts-nocheck: typing debt
// Whether a harness can start on this machine's server, and why not (MS5.3):
// its program is not found, or its last sign-in probe failed. One function,
// read by `avoozl status`, Settings › Models and the Needs you item a
// blocked request opens. The supervisor spawns the path `findProgram`
// returns, so the check and the spawn agree. `keepEnv` names only what
// passes through to a child; no name in it is required.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { machineEnvPath } from "./machine-env.ts";

const probeCachePath = (configDirectory) =>
  path.join(path.resolve(configDirectory), "harness-probes.json");

// A probe answer holds for one definition hash and one machine.env, since
// each probe is a model call: a changed file or machine.env needs a new one.
function probeKey(configDirectory, hash) {
  let bytes = "";
  try {
    bytes = fs.readFileSync(machineEnvPath(configDirectory));
  } catch {}
  return `${hash}:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readProbes(configDirectory) {
  try {
    const value = JSON.parse(
      fs.readFileSync(probeCachePath(configDirectory), "utf8"),
    );
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}

// The cached probe of harness `name` at `hash`: {ok, message, at}, or null
// when none ran for this hash and machine.env.
export function cachedProbe(configDirectory, name, hash) {
  if (!configDirectory || !hash) return null;
  const entry = readProbes(configDirectory)[name];
  return entry?.key === probeKey(configDirectory, hash)
    ? { ok: entry.ok === true, message: entry.message ?? null, at: entry.at }
    : null;
}

export function recordProbe(configDirectory, name, hash, result) {
  const file = probeCachePath(configDirectory);
  const all = {
    ...readProbes(configDirectory),
    [name]: { key: probeKey(configDirectory, hash), ...result },
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(all, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
}

function inDirectory(program, pathEnv, platform) {
  const names =
    platform === "win32"
      ? ["", ".exe", ".cmd", ".bat"].map((suffix) => program + suffix)
      : [program];
  for (const directory of String(pathEnv ?? "")
    .split(path.delimiter)
    .filter(Boolean))
    for (const name of names) {
      // The link itself, not its target: a launcher can read its own name.
      const file = path.join(directory, name);
      try {
        fs.accessSync(file, fs.constants.X_OK);
        if (fs.statSync(file).isFile()) return file;
      } catch {}
    }
  return null;
}

// The person's login-shell PATH, read once per process for each shell: a
// server a desktop app starts lacks what the shell's startup files add
// (~/.local/bin, Homebrew). The command is fixed text, never built from
// input. Null on Windows, or when $SHELL is not an absolute path or the
// shell fails.
const loginPaths = new Map();
export function loginShellPath({
  env = process.env,
  platform = process.platform,
} = {}) {
  const shell = env.SHELL;
  if (platform === "win32" || !shell || !path.isAbsolute(shell)) return null;
  if (loginPaths.has(shell)) return loginPaths.get(shell);
  const result = spawnSync(shell, ["-l", "-c", "/usr/bin/env"], {
    encoding: "utf8",
    timeout: 3000,
    stdio: ["ignore", "pipe", "ignore"],
    env,
  });
  // The last PATH= line: startup files may print before env runs.
  const line = String(result.stdout ?? "")
    .split("\n")
    .findLast((item) => item.startsWith("PATH="));
  const value = result.status === 0 && line ? line.slice(5) : null;
  loginPaths.set(shell, value);
  return value;
}

// Where a definition's program is: {file, path}, where `path` is the PATH it
// was found on (the child runs with it), or {problem}. Looked up in order: an
// absolute path in the definition; machine.env's PATH; the server's PATH;
// the person's login-shell PATH.
export function findProgram(
  program,
  {
    env = process.env,
    machineEnv = {},
    platform = process.platform,
    loginPath = () => loginShellPath({ env, platform }),
  } = {},
) {
  if (path.isAbsolute(program))
    return fs.existsSync(program)
      ? { file: program, path: env.PATH }
      : { problem: `${program} does not exist on this machine.` };
  const places = [
    ...(machineEnv.PATH ? [["machine.env's PATH", machineEnv.PATH]] : []),
    ["the server's PATH", env.PATH],
  ];
  for (const [, pathEnv] of places) {
    const file = inDirectory(program, pathEnv, platform);
    if (file) return { file, path: pathEnv };
  }
  const login = loginPath();
  if (login) {
    const file = inDirectory(program, login, platform);
    if (file) return { file, path: login };
    places.push(["your login shell's PATH", login]);
  }
  const looked = places.map(([name]) => name);
  const where =
    looked.length > 1
      ? `${looked.slice(0, -1).join(", ")} or ${looked.at(-1)}`
      : looked[0];
  return {
    problem: `${program} was not found on ${where}. Set PATH in machine.env, or give an absolute path in the harness definition.`,
  };
}

// `value` is the definition's parsed JSON. Returns a sentence, or null when it
// can start. `probe` is its cached sign-in probe, or null when none ran: an
// unchecked harness is not held back.
export function harnessStartProblem(
  value,
  {
    env = process.env,
    machineEnv = {},
    probe = null,
    platform = process.platform,
    loginPath,
  } = {},
) {
  const program = Array.isArray(value?.start) ? value.start[0] : null;
  if (typeof program !== "string" || !program) return null;
  const found = findProgram(program, { env, machineEnv, platform, loginPath });
  if (found.problem) return found.problem;
  return probe && !probe.ok ? probe.message : null;
}
