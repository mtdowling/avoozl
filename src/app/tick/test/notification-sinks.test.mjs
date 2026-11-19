// Notifications without Kiro Crew (without-kirocrew nk-6.1, NK7.1, NK7.6 to
// NK7.9): the headless tick delivers to this machine's sinks, each sink keeps
// its own record, a backlog is one notice, and a failing sink backs off.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../../settings/config.mjs";
import { Store } from "../../store/store.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { tickWorkspace } from "../headless-tick.mjs";
import {
  BACKLOG,
  deliverNotifications,
  queueNotifications,
  waitingNotifications,
} from "../notifications.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const CLI = fileURLToPath(new URL("../../../../cli.mjs", import.meta.url));
const MINUTE = 60_000;

function scratch() {
  const root = temporaryDirectory("avoozl-sinks-"),
    directory = path.join(root, "workspace");
  initializeWorkspace(directory, { name: "Sinks fixture", port: 0 });
  return {
    root,
    directory,
    db: workspaceConfig({ workspace: directory }).dbPath,
  };
}

const notice = (n, channel = "decision") => ({
  channel,
  task: `task-${n}`,
  title: `Decide ${n}`,
  text: `Synthetic decision ${n}.`,
});

const sink = (id, { fail = false } = {}) => {
  const got = [];
  return {
    id,
    got,
    push: async (payload) => {
      if (fail) throw Error(`${id} is down`);
      got.push(payload);
    },
  };
};

async function withStore(db, use) {
  const store = new Store(db);
  try {
    return await use(store);
  } finally {
    store.close();
  }
}

test("a headless tick sends a queued decision to a sink once", async () => {
  const { root, directory, db } = scratch();
  await withStore(db, (store) => queueNotifications(store, [notice(1)]));
  const fake = sink("file"),
    paths = {
      stateDirectory: path.join(root, "state"),
      configDirectory: path.join(root, "config"),
      sinks: [fake],
    };
  fs.mkdirSync(paths.stateDirectory, { recursive: true });
  fs.mkdirSync(paths.configDirectory, { recursive: true });
  const first = await tickWorkspace(directory, paths);
  assert.equal(first.notifications.sinks[0].sent, 1, JSON.stringify(first));
  await tickWorkspace(directory, paths);
  assert.equal(fake.got.length, 1);
  assert.equal(fake.got[0].title, "Decide 1");
  assert.equal(fake.got[0].channel, "decision");
});

test("with no sink, status shows how many wait and the oldest one's age", async () => {
  const { root, directory, db } = scratch();
  const at = Date.now() - 10 * MINUTE;
  await withStore(db, (store) =>
    queueNotifications(store, [notice(1), notice(2)], at),
  );
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^(AVOOZL|KIROCREW)(_|$)/.test(key)) delete env[key];
  Object.assign(env, {
    HOME: path.join(root, "home"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
  });
  const hostFile = path.join(env.XDG_CONFIG_HOME, "avoozl", "config.json");
  fs.mkdirSync(path.dirname(hostFile), { recursive: true });
  fs.writeFileSync(
    hostFile,
    JSON.stringify({ version: 1, port: 0, workspaces: {} }),
  );
  const run = spawnSync(
    process.execPath,
    [CLI, "status", "--workspace", directory],
    { env, encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  const waiting = JSON.parse(run.stdout).workspace.notifications;
  assert.equal(waiting.waiting, 2);
  assert.equal(waiting.oldestAt, new Date(at).toISOString());
  assert.ok(waiting.oldestAgeSeconds >= 600, String(waiting.oldestAgeSeconds));
});

test("forty waiting items and a new sink give one notification", async () => {
  const { db } = scratch();
  await withStore(db, async (store) => {
    queueNotifications(
      store,
      Array.from({ length: 40 }, (_, n) =>
        notice(n, n ? "failure" : "decision"),
      ),
    );
    assert.ok(40 > BACKLOG);
    const fake = sink("hook");
    await deliverNotifications(store, [fake]);
    assert.equal(fake.got.length, 1);
    assert.equal(fake.got[0].title, "40 Avoozl notifications waited");
    assert.equal(fake.got[0].channel, "decision");
    assert.equal(waitingNotifications(store).count, 0);
    // A new one after that is sent as itself.
    queueNotifications(store, [notice(99)]);
    await deliverNotifications(store, [fake]);
    assert.deepEqual(
      fake.got.map((p) => p.title),
      ["40 Avoozl notifications waited", "Decide 99"],
    );
  });
});

test("a sink that throws does not stop another, and is tried again later", async () => {
  const { db } = scratch();
  await withStore(db, async (store) => {
    const now = Date.now();
    queueNotifications(store, [notice(1), notice(2)], now);
    const down = sink("down", { fail: true }),
      up = sink("up");
    const first = await deliverNotifications(store, [down, up], now);
    assert.equal(first.sinks[0].error, "down is down");
    assert.equal(up.got.length, 2);
    // Not before its wait; the other sink resends nothing.
    const early = await deliverNotifications(store, [down, up], now + 1000);
    assert.equal(early.sinks[0].waiting, true);
    assert.equal(up.got.length, 2);
    // Down again after a minute: the wait grows.
    await deliverNotifications(store, [down, up], now + MINUTE + 1);
    const again = store.getMeta("notifications.sink.down");
    assert.equal(again.failures, 2);
    assert.ok(Date.parse(again.retryAt) >= now + 3 * MINUTE);
    // Back up: it gets what waited, once.
    const back = sink("down");
    await deliverNotifications(store, [back, up], now + 10 * MINUTE);
    assert.deepEqual(
      back.got.map((p) => p.title),
      ["Decide 1", "Decide 2"],
    );
    assert.equal(up.got.length, 2);
    assert.equal(store.getMeta("notifications.sink.down").failures, 0);
  });
});

test("the Kiro Crew push still marks each row sent, one push per row", async () => {
  const { db } = scratch();
  await withStore(db, async (store) => {
    queueNotifications(store, [notice(1), notice(2)]);
    const pushed = [];
    const result = await deliverNotifications(store, async (payload) => {
      pushed.push(payload);
    });
    assert.equal(result.sent, 2);
    assert.equal(pushed.length, 2);
    assert.ok(store.list("app_notifications").every((row) => row.sentAt));
  });
});
