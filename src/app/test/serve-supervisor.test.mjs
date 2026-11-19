// The supervisor hosts the standalone page (SW9): it starts the server child
// when `serve.enabled` is set, restarts it on the same fixed port, prints no
// link, shows the origin in `avoozl status`, and listens on no socket itself.
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { loadLayeredConfig } from "../layered-config.mjs";
import { machineStatus } from "../machine-status.mjs";
import { startSupervisor, supervisorPaths } from "../supervisor.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const until = async (check, what, ms = 30000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw Error(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

async function hosted(t, serve) {
  const root = temporaryDirectory(),
    stateDirectory = path.join(root, "state"),
    configDirectory = path.join(root, "config");
  fs.mkdirSync(configDirectory, { recursive: true });
  const configFile = path.join(configDirectory, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({ version: 1, serve }));
  const env = {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    XDG_CONFIG_HOME: path.join(root, "xdg"),
    XDG_STATE_HOME: path.join(root, "xdg-state"),
  };
  for (const name of Object.keys(env))
    if (/^AVOOZL_/.test(name)) delete env[name];
  const supervisor = startSupervisor({
    stateDirectory,
    configDirectory,
    env,
    intervalMs: 100,
    serveRetryMs: 200,
  });
  t.after(async () => {
    supervisor.close();
    const pid = supervisor.serve()?.pid;
    if (pid)
      await until(() => {
        try {
          process.kill(pid, 0);
          return false;
        } catch {
          return true;
        }
      }, "the server child to stop").catch(() => {});
  });
  return { supervisor, stateDirectory, configDirectory, configFile, root };
}

test("with serve.enabled the supervisor starts the server child and records its pid and port (SW9.1)", async (t) => {
  const port = await freePort();
  const h = await hosted(t, { enabled: true, port });
  const state = await until(
    () => readJson(path.join(h.stateDirectory, "serve.json")),
    "serve.json",
  );
  assert.equal(state.port, port);
  assert.equal(state.origin, `http://127.0.0.1:${port}`);
  assert.equal(state.pid, h.supervisor.serve().pid);
  // `avoozl status` shows the origin (SW9.3).
  const status = machineStatus({ stateDirectory: h.stateDirectory });
  assert.deepEqual(status.serve, {
    running: true,
    origin: state.origin,
    pid: state.pid,
  });
});

test("a killed child is restarted on the same fixed port; it prints no link (SW9.1, SW9.2)", async (t) => {
  const port = await freePort();
  const h = await hosted(t, { enabled: true, port });
  const first = await until(
    () => readJson(path.join(h.stateDirectory, "serve.json")),
    "the first server",
  );
  process.kill(first.pid, "SIGKILL");
  const again = await until(() => {
    const now = readJson(path.join(h.stateDirectory, "serve.json"));
    return now && now.pid !== first.pid ? now : null;
  }, "the restarted server");
  assert.equal(again.port, port);
  assert.equal(again.origin, first.origin);
  const log = fs.readFileSync(
    supervisorPaths(h.stateDirectory).serveLog,
    "utf8",
  );
  assert.match(log, /Avoozl is at http:\/\/127\.0\.0\.1:/);
  assert.doesNotMatch(log, /login|token/i);
});

test("the supervisor process itself listens on no socket (SW9.4)", async (t) => {
  const port = await freePort();
  const h = await hosted(t, { enabled: true, port });
  await until(
    () => readJson(path.join(h.stateDirectory, "serve.json")),
    "serve.json",
  );
  const listening = process
    ._getActiveHandles()
    .filter((handle) => handle instanceof net.Server && handle.listening);
  assert.equal(listening.length, 0);
});

test("without serve.enabled no server starts and status says so (SW9.1, SW9.3)", async (t) => {
  const off = await hosted(t, { enabled: false });
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(off.supervisor.serve(), null);
  assert.equal(
    fs.existsSync(path.join(off.stateDirectory, "serve.json")),
    false,
  );
  assert.deepEqual(
    machineStatus({ stateDirectory: off.stateDirectory }).serve,
    {
      running: false,
    },
  );
});

test("serve.* in .avoozl.json is refused, naming the key (SW9.1)", () => {
  const root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, serve: { enabled: true, port: 4000 } }),
  );
  assert.throws(
    () =>
      loadLayeredConfig({
        workspaceRoot: root,
        env: { XDG_CONFIG_HOME: path.join(root, "xdg") },
        home: root,
      }),
    /serve\.enabled is set in .*\.avoozl\.json\. Put it in .*config\.json/,
  );
});

test("the machine file's serve settings are checked (SW9.1)", async () => {
  const { normalizeHostConfig } = await import("../host-config.mjs");
  const ok = normalizeHostConfig({
    version: 1,
    serve: { enabled: true, port: 4000 },
  });
  assert.deepEqual(ok.serve, { enabled: true, port: 4000 });
  for (const serve of [
    { port: 80 },
    { port: "x" },
    { enabled: "yes" },
    { other: 1 },
    3,
  ])
    assert.throws(() => normalizeHostConfig({ version: 1, serve }), /serve/);
});
