// The standalone page's server (standalone-web SW9), kept up by each tick
// when the machine file has `serve.enabled`. The tick starts it detached and
// records its pid and start time in `page.json`; a later tick finds it again
// by both, stops it when the setting is off or names another port, and
// starts it again when it has exited. The tick itself never listens.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readServeConfig } from "../settings/serve-config.mjs";
import {
  processStartTime,
  sameProcess,
  supervisorPaths,
} from "./supervisor.mjs";

const SERVE_MAIN = fileURLToPath(
  new URL("../serve/serve-main.mjs", import.meta.url),
);

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

// Returns {pid, port} of the page that runs after this call, or null.
export function hostPage({
  stateDirectory,
  configDirectory,
  env = process.env,
  startTime = processStartTime,
}) {
  const paths = supervisorPaths(stateDirectory),
    record = path.join(paths.root, "page.json"),
    config = readServeConfig(configDirectory),
    running = readJson(record);
  const alive = running && sameProcess(running.pid, running.started, startTime);
  if (alive && (!config.enabled || running.port !== config.port)) {
    try {
      process.kill(running.pid, "SIGTERM");
    } catch {}
    fs.rmSync(record, { force: true });
    return null;
  }
  if (alive) return { pid: running.pid, port: running.port };
  if (!config.enabled) return null;
  fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  const args = [
    SERVE_MAIN,
    "--state-directory",
    path.resolve(stateDirectory),
    "--config-directory",
    path.resolve(configDirectory),
    "--port",
    String(config.port),
  ];
  const pid =
    process.platform === "win32"
      ? launchWindows([...args, "--log", paths.serveLog], env)
      : launchPosix(args, paths.serveLog, env);
  if (!pid) return null;
  fs.writeFileSync(
    record,
    JSON.stringify({ pid, started: startTime(pid), port: config.port }) + "\n",
    { mode: 0o600 },
  );
  return { pid, port: config.port };
}

function launchPosix(args, log, env) {
  const out = fs.openSync(log, "a", 0o600);
  let child;
  try {
    child = spawn(process.execPath, args, {
      detached: true,
      stdio: ["ignore", out, out],
      env,
    });
  } finally {
    fs.closeSync(out);
  }
  child.on("error", () => {});
  child.unref();
  return child.pid ?? null;
}

// On Windows a child inherits every inheritable handle of its parent, so a
// page started directly would hold the tick caller's stdout open and that
// caller would wait on it. Start-Process starts it through the shell, which
// passes no handle; the page writes its own log (--log).
function launchWindows(args, env) {
  const quote = (value) => `"${value.replaceAll('"', '\\"')}"`;
  const literal = (value) => `'${value.replaceAll("'", "''")}'`;
  const command = [
    "Start-Process -WindowStyle Hidden -PassThru",
    `-FilePath ${literal(process.execPath)}`,
    `-ArgumentList ${literal(args.map(quote).join(" "))}`,
    "| ForEach-Object { $_.Id }",
  ].join(" ");
  const started = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { env, encoding: "utf8", windowsHide: true, timeout: 60_000 },
  );
  return Number(started.stdout?.trim()) || null;
}
