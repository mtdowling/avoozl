import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url)),
  source = fs.readFileSync(new URL("../cli.mjs", import.meta.url), "utf8");

// Commands the help leaves out on purpose: hooks a session runs for itself.
const UNLISTED = new Set(["help", "register-session", "session-hook"]);
// A listener that never exits; the write-path tests start and drive it.
const LONG_RUNNING = new Set(["app-backend"]);
// What a crash looks like, as opposed to a refusal a person can act on.
const CRASH =
  /\n\s+at .+:\d+:\d+|TypeError|ReferenceError|SyntaxError|RangeError|is not a function|Cannot read prop|cannot be bound to SQLite|argument must be of type|fetch failed|Unhandled/;

// An isolated machine: no real workspace, host, or GitHub is reachable.
function machineEnvironment(machine) {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)(_|$)/.test(key)) delete env[key];
  Object.assign(env, {
    HOME: path.join(machine, "home"),
    XDG_CONFIG_HOME: path.join(machine, "config"),
    XDG_STATE_HOME: path.join(machine, "state"),
    GH_TOKEN: "fake-token",
    GITHUB_TOKEN: "fake-token",
    // A closed loopback port: every GitHub call fails fast, none leaves.
    GITHUB_API_URL: "http://127.0.0.1:9",
  });
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.mkdirSync(path.join(env.XDG_CONFIG_HOME, "avoozl"), { recursive: true });
  fs.writeFileSync(
    path.join(env.XDG_CONFIG_HOME, "avoozl", "config.json"),
    JSON.stringify({ version: 1, port: 0, workspaces: {} }),
  );
  return env;
}

// Command paths the help names: leading lowercase words of each entry, with
// `a|b` alternatives and ` | `-joined entries split apart.
function helpPaths(help) {
  const paths = [];
  for (const line of help.split("\n").slice(1)) {
    if (!/^ {2}[a-z]/.test(line)) continue;
    for (const entry of line.trim().split(" | ")) {
      const words = [];
      for (const token of entry.split(/\s+/)) {
        if (!/^[a-z][a-z|-]*$/.test(token)) break;
        words.push(token.split("|"));
      }
      if (!words.length) continue;
      const [first, second] = words;
      for (const command of first)
        for (const action of second || [null])
          paths.push(action ? [command, action] : [command]);
    }
  }
  return paths;
}

// stdin is /dev/null, so stdio servers and hooks see end of input at once.
// The working folder is the test machine, so a stray path lands there.
function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
        env,
        cwd: env.HOME,
        stdio: ["ignore", "pipe", "pipe"],
      }),
      timer = setTimeout(() => child.kill("SIGKILL"), 30000);
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

// Run `jobs` with at most `limit` in flight.
async function pool(jobs, limit) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < jobs.length) {
        const index = next++;
        results[index] = await jobs[index]();
      }
    }),
  );
  return results;
}

// About a hundred node processes; the walk outlasts the default timeout.
test(
  "every CLI command and subcommand runs without crashing",
  { timeout: 240000 },
  async () => {
    const machine = temporaryDirectory("avoozl-cli-smoke-"),
      env = machineEnvironment(machine),
      template = path.join(machine, "template");
    execFileSync(process.execPath, [cli, "init", template, "--port", "0"], {
      env,
    });
    execFileSync(process.execPath, [cli, "seed", "--workspace", template], {
      env,
    });

    const help = (await run(["help"], env)).stdout,
      paths = helpPaths(help),
      listed = new Set(paths.map(([command]) => command));

    // A command the CLI dispatches is one the help names.
    for (const [, command] of source.matchAll(/command === "([a-z][a-z-]*)"/g))
      if (!UNLISTED.has(command))
        assert(listed.has(command), `avoozl help does not list ${command}`);

    // Subcommands the CLI itself offers ("Choose X a, b, or c.").
    for (const command of listed) {
      if (LONG_RUNNING.has(command)) continue;
      const { stderr } = await run(
        [command, "smoke-unknown", "--workspace", template],
        env,
      );
      const offered = stderr.match(
        new RegExp(`^Choose ${command} (.+)\\.$`, "m"),
      );
      if (!offered) continue;
      for (const action of offered[1].split(/, or |, | or /))
        if (!paths.some(([c, a]) => c === command && a === action))
          paths.push([command, action]);
    }

    // Each top-level command gets its own copy of the seeded workspace, so
    // commands run side by side without sharing a database.
    const workspaces = new Map();
    const workspaceFor = (command) => {
      if (!workspaces.has(command)) {
        const copy = path.join(machine, "ws-" + command);
        fs.cpSync(template, copy, { recursive: true });
        workspaces.set(command, copy);
      }
      return workspaces.get(command);
    };
    const runs = paths
      .filter(([command]) => !LONG_RUNNING.has(command))
      .map((words) => {
        const args = [...words, "--workspace", workspaceFor(words[0])];
        return async () => ({ args, ...(await run(args, env)) });
      });
    assert(runs.length > 60, `walked only ${runs.length} command paths`);

    const failures = (
      await pool(runs, Math.max(2, Math.min(8, os.availableParallelism())))
    )
      .filter(
        (r) =>
          r.signal ||
          // verify-issue with no argument is a wrong argument: exit 64.
          ![0, 1, ...(r.args[0] === "verify-issue" ? [64] : [])].includes(
            r.code,
          ) ||
          CRASH.test(r.stderr),
      )
      .map(
        (r) =>
          `avoozl ${r.args.slice(0, -2).join(" ")} -> ${r.signal || r.code}: ${r.stderr.slice(0, 300)}`,
      );
    assert.deepEqual(failures, []);
  },
);

test("legacy workspace variables and registered IDs reach the database", async () => {
  const machine = temporaryDirectory("avoozl-cli-smoke-alias-"),
    env = machineEnvironment(machine),
    workspace = path.join(machine, "ws");
  execFileSync(process.execPath, [cli, "init", workspace, "--port", "0"], {
    env,
  });
  for (const name of [
    "AVOOZL_WORKSPACE",
    "AICOMMANDER_WORKSPACE",
    "NUPP_WORKSPACE",
  ]) {
    const result = await run(["check"], { ...env, [name]: workspace });
    assert.equal(result.code, 0, `${name}: ${result.stderr}`);
  }
  // A registered workspace ID names its root; no host server is needed.
  assert.equal(
    (await run(["workspace", "add", "smoke", "--root", workspace], env)).code,
    0,
  );
  const query = await run(["query", "--workspace", "smoke"], env);
  assert.equal(query.code, 0, query.stderr);
  assert(Array.isArray(JSON.parse(query.stdout)));
  // Without a workspace, a command says how to make one.
  const missing = await run(
    ["query", "--workspace", path.join(machine, "none")],
    env,
  );
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /avoozl init PATH/);
});
