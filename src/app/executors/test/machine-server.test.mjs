// `avoozl start`, `stop`, `link` and the loop (MS1, MS3), driven through the
// real CLI on an isolated machine, and the source rules of MS1.2.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadLayeredConfig } from "../../settings/layered-config.mjs";
import { machineLockPaths, readRecord } from "../machine-lock.mjs";
import { requestPass } from "../machine-server.mjs";

const CLI = fileURLToPath(new URL("../../../../cli.mjs", import.meta.url));
const SRC = fileURLToPath(new URL("../../../", import.meta.url));
const SUPERVISOR = new URL("../supervisor.mjs", import.meta.url).href;

function machine(t, { tickSeconds } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-machine-"));
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
  fs.mkdirSync(path.join(env.XDG_CONFIG_HOME, "avoozl"), { recursive: true });
  fs.writeFileSync(
    path.join(env.XDG_CONFIG_HOME, "avoozl", "config.json"),
    JSON.stringify({ version: 1, machine: { tickSeconds } }),
  );
  const run = (args, extra = {}) =>
    spawnSync(process.execPath, [CLI, ...args], {
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 90_000,
    });
  const state = () => {
    const found = run(["status"]);
    return JSON.parse(found.stdout).machine.supervisor;
  };
  t.after(() => {
    run(["stop"]);
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 200,
    });
  });
  const stateDirectory = path.join(env.XDG_STATE_HOME, "avoozl");
  return { root, env, run, state, stateDirectory };
}

test("start returns once the lock is held, a second names the holder, status shows the server, stop ends it", (t) => {
  const m = machine(t);
  const first = m.run(["start"]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Started the machine server: pid (\d+)/);
  const pid = Number(first.stdout.match(/pid (\d+)/)[1]);

  const second = m.run(["start"]);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, new RegExp(`already runs: pid ${pid}, build `));

  const server = m.state();
  assert.equal(server.running, true);
  assert.equal(server.pid, pid);
  assert.match(server.build, /^\d+\.\d+\.\d+\+[0-9a-f]{12}$/);
  assert.equal(server.starter, "terminal");
  assert.equal(server.tickSeconds, 60);
  assert.ok(server.started);
  assert.deepEqual(server.passes, []);

  const stopped = m.run(["stop"]);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.match(
    stopped.stdout,
    new RegExp(`Stopped the machine server \\(pid ${pid}\\)`),
  );
  assert.equal(m.state().running, false);
  assert.match(m.run(["stop"]).stdout, /No machine server runs/);
});

test("the server outlives the process that started it and still answers a pass", async (t) => {
  const m = machine(t);
  const script = path.join(m.root, "starter.mjs");
  fs.writeFileSync(
    script,
    `import { launchSupervisor } from ${JSON.stringify(SUPERVISOR)};
launchSupervisor({
  stateDirectory: process.argv[2],
  configDirectory: process.argv[3],
});
console.log("launched");
setInterval(() => {}, 1000);
`,
  );
  const starter = spawn(
    process.execPath,
    [script, m.stateDirectory, path.join(m.env.XDG_CONFIG_HOME, "avoozl")],
    { env: m.env, stdio: ["ignore", "pipe", "inherit"] },
  );
  await new Promise((resolve) => starter.stdout.once("data", resolve));
  let holder;
  for (let i = 0; i < 100 && !holder; i++) {
    holder = readRecord(machineLockPaths(m.stateDirectory).record);
    if (!holder) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(holder, "the server took its lock");
  starter.kill("SIGKILL");
  await new Promise((resolve) => starter.once("exit", resolve));
  // No catalog workspace, so the pass has no rows, but the server answers it.
  const tick = m.run(["tick"]);
  assert.equal(tick.status, 0, tick.stderr);
  assert.deepEqual(JSON.parse(tick.stdout), []);
  assert.equal(m.state().pid, holder.pid);
});

test("start replaces a server of another build and keeps the new one", (t) => {
  const m = machine(t);
  m.run(["start"]);
  const { record } = machineLockPaths(m.stateDirectory);
  const old = readRecord(record);
  fs.writeFileSync(record, JSON.stringify({ ...old, build: "0.0.0+old" }));
  assert.match(m.state().note, /Run avoozl start to replace/);
  const again = m.run(["start"]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /Stopped the machine server/);
  assert.match(again.stdout, /Started the machine server/);
  const now = m.state();
  assert.notEqual(now.pid, old.pid);
  assert.equal(now.note, undefined);
});

test("a pass is asked of a running server and is null with none", async (t) => {
  const m = machine(t);
  assert.equal(await requestPass({ stateDirectory: m.stateDirectory }), null);
});

test("supervisor, supervisor unit, serve and serve link are unknown commands", (t) => {
  const m = machine(t);
  for (const args of [
    ["supervisor"],
    ["supervisor", "unit"],
    ["serve"],
    ["serve", "link"],
  ]) {
    const found = m.run(args);
    assert.notEqual(found.status, 0, args.join(" "));
    assert.match(found.stderr, /is not a command/, args.join(" "));
  }
});

test("a supervisor child is refused start, stop and link", (t) => {
  const m = machine(t);
  for (const command of ["start", "stop", "link"]) {
    const found = m.run([command], { AVOOZL_CHILD: "1" });
    assert.notEqual(found.status, 0, command);
    assert.match(found.stderr, /A supervisor child may not run/, command);
  }
  assert.equal(m.state().running, false);
});

test("machine.tickSeconds is read from the machine file and refused in .avoozl.json", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-tickseconds-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, machine: { tickSeconds: 30 } }),
  );
  assert.throws(
    () =>
      loadLayeredConfig({
        workspaceRoot: root,
        env: { XDG_CONFIG_HOME: path.join(root, "xdg") },
        home: root,
      }),
    /machine\.tickSeconds is set in .*\.avoozl\.json\. Put it in .*config\.json/,
  );
});

test("an out-of-range machine.tickSeconds in the machine file is refused", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-tickseconds-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "xdg", "avoozl"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "xdg", "avoozl", "config.json"),
    JSON.stringify({ version: 1, machine: { tickSeconds: 5 } }),
  );
  assert.throws(
    () =>
      loadLayeredConfig({
        workspaceRoot: root,
        env: { XDG_CONFIG_HOME: path.join(root, "xdg") },
        home: root,
      }),
    /tickSeconds/,
  );
});

// MS1.2: the loop is the only caller of the drains, and nothing else runs the
// tick on a timer.
test("only the machine server's loop drains requests and runs the tick on a timer", () => {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "test") walk(file);
      } else if (file.endsWith(".mjs")) files.push(file);
    }
  };
  walk(SRC);
  const rel = (file) => path.relative(SRC, file).replaceAll("\\", "/");
  const callers = (pattern) =>
    files
      .filter((file) => pattern.test(fs.readFileSync(file, "utf8")))
      .map(rel);
  const loop = ["app/tick/headless-tick.mjs"];
  for (const name of ["drainProcessRequests", "drainCheckRuns"]) {
    const found = callers(new RegExp(`\\b${name}\\(`)).filter(
      (file) =>
        !/^app\/(executors\/process|delivery\/check-runs)\.mjs$/.test(file),
    );
    assert.deepEqual(found, loop, `${name} is called outside the loop`);
  }
  const timed = files
    .filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return (
        /["']workspace\.tick["']/.test(text) &&
        /setInterval|setTimeout/.test(text)
      );
    })
    .map(rel);
  assert.deepEqual(timed, [], "the tick runs on a timer outside the loop");
});
