// Each tick keeps the standalone page up (SW9): it starts the server child
// when `serve.enabled` is set, starts it again on the same fixed port once it
// has exited, stops it when the setting goes off, prints no link, shows the
// origin in `avoozl status`, and listens on no socket itself.
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { loadLayeredConfig } from "../settings/layered-config.ts";
import { machineStatus } from "../workspace/machine-status.ts";
import { supervisorPaths } from "../executors/supervisor.ts";
import { hostPage } from "../executors/page-child.ts";
import { temporaryDirectory } from "./temporary.ts";

const until = async <T>(
  check: () => T | Promise<T>,
  what: string,
  ms = 30000,
): Promise<NonNullable<T>> => {
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
  await new Promise<void>((resolve) =>
    probe.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve) => probe.close(resolve));
  return address.port;
}

// serve.json and page.json as the page child writes them.
interface PageState {
  pid: number;
  port?: number;
  origin?: string;
}
const readJson = (file: string): PageState | null => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

async function hosted(t: TestContext, serve: Record<string, unknown>) {
  const root = temporaryDirectory(),
    stateDirectory = path.join(root, "state"),
    configDirectory = path.join(root, "config");
  fs.mkdirSync(configDirectory, { recursive: true });
  const configFile = path.join(configDirectory, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({ version: 1, serve }));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    XDG_CONFIG_HOME: path.join(root, "xdg"),
    XDG_STATE_HOME: path.join(root, "xdg-state"),
  };
  for (const name of Object.keys(env))
    if (/^AVOOZL_/.test(name)) delete env[name];
  // One tick's page step; a test calls it again as the next tick.
  const tick = () => hostPage({ stateDirectory, configDirectory, env });
  let page = tick();
  t.after(async () => {
    const pid = readJson(
      path.join(supervisorPaths(stateDirectory).root, "page.json"),
    )?.pid;
    if (!pid) return;
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
    await until(() => {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    }, "the server child to stop").catch(() => {});
  });
  return {
    tick,
    page: () => page,
    stateDirectory,
    configDirectory,
    configFile,
    root,
  };
}

test("with serve.enabled a tick starts the server child and records its pid and port (SW9.1)", async (t) => {
  const port = await freePort();
  const h = await hosted(t, { enabled: true, port });
  const state = await until(
    () => readJson(path.join(h.stateDirectory, "serve.json")),
    "serve.json",
  );
  assert.equal(state.port, port);
  assert.equal(state.origin, `http://127.0.0.1:${port}`);
  assert.equal(state.pid, h.page()?.pid);
  // The next tick finds the same child and starts no second one.
  assert.equal(h.tick()?.pid, state.pid);
  // `avoozl status` shows the origin (SW9.3).
  const status = machineStatus({ stateDirectory: h.stateDirectory });
  assert.deepEqual(status.serve, {
    running: true,
    origin: state.origin,
    pid: state.pid,
  });
});

test("a killed child is started again by the next tick on the same fixed port; it prints no link (SW9.1, SW9.2)", async (t) => {
  const port = await freePort();
  const h = await hosted(t, { enabled: true, port });
  const first = await until(
    () => readJson(path.join(h.stateDirectory, "serve.json")),
    "the first server",
  );
  process.kill(first.pid, "SIGKILL");
  await until(() => {
    try {
      process.kill(first.pid, 0);
      return false;
    } catch {
      return true;
    }
  }, "the first server to end");
  h.tick();
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

test("the tick process itself listens on no socket (SW9.4)", async (t) => {
  const port = await freePort();
  const h = await hosted(t, { enabled: true, port });
  await until(
    () => readJson(path.join(h.stateDirectory, "serve.json")),
    "serve.json",
  );
  // Node's own handle list; @types/node leaves the internal method out.
  const handles = (
    process as NodeJS.Process & { _getActiveHandles(): unknown[] }
  )._getActiveHandles();
  const listening = handles.filter(
    (handle) => handle instanceof net.Server && handle.listening,
  );
  assert.equal(listening.length, 0);
});

test("without serve.enabled no server starts and status says so (SW9.1, SW9.3)", async (t) => {
  const off = await hosted(t, { enabled: false });
  assert.equal(off.page(), null);
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

test("a tick stops the page once serve.enabled is off (SW9.1)", async (t) => {
  const port = await freePort();
  const h = await hosted(t, { enabled: true, port });
  const first = await until(
    () => readJson(path.join(h.stateDirectory, "serve.json")),
    "the server",
  );
  fs.writeFileSync(
    h.configFile,
    JSON.stringify({ version: 1, serve: { enabled: false } }),
  );
  assert.equal(h.tick(), null);
  await until(() => {
    try {
      process.kill(first.pid, 0);
      return false;
    } catch {
      return true;
    }
  }, "the page to stop");
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
  const { normalizeHostConfig } = await import("../settings/host-config.ts");
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
