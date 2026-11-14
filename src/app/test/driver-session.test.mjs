// The driver session: the one long-running Kiro Crew chat that releases work.
// Kiro Crew gives an app no read of a chat the person opened, so Avoozl learns
// the session from the chat itself: the avoozl-driver agent's hooks, or its
// attested plans_next call. One test per rule.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../config.mjs";
import {
  QUIET_MINUTES,
  driverSessionView,
  registerDriverSession,
} from "../driver-session.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const app = fileURLToPath(new URL("../../../kirocrew-app", import.meta.url));

function setup(t) {
  const root = temporaryDirectory("avoozl-driver-session-");
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  store.importSnapshot(snapshot());
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

const MINUTE = 60_000;

test("no session was seen: not started, with no link", (t) => {
  const { store } = setup(t);
  assert.deepEqual(driverSessionView(store, { now: 0 }), {
    state: "none",
    slot: null,
    href: null,
    openedAt: null,
    lastSeenAt: null,
    source: null,
    quietAfterMinutes: QUIET_MINUTES,
  });
});

test("a session seen lately is running; a quiet one is idle and keeps its link", (t) => {
  const { store } = setup(t);
  const start = Date.parse("2026-11-14T10:00:00Z");
  registerDriverSession(store, {
    slot: "chat-7-1",
    source: "hook",
    now: start,
  });
  const soon = driverSessionView(store, { now: start + 5 * MINUTE });
  assert.equal(soon.state, "running");
  assert.equal(soon.href, "/chat?sid=chat-7-1");
  const later = driverSessionView(store, {
    now: start + (QUIET_MINUTES + 1) * MINUTE,
  });
  assert.equal(later.state, "idle");
  assert.equal(later.href, "/chat?sid=chat-7-1");
  assert.equal(later.lastSeenAt, "2026-11-14T10:00:00.000Z");
});

test("seeing the same session again keeps when it opened; a new one resets it", (t) => {
  const { store } = setup(t);
  const start = Date.parse("2026-11-14T10:00:00Z");
  registerDriverSession(store, {
    slot: "chat-7-1",
    source: "hook",
    now: start,
  });
  registerDriverSession(store, {
    slot: "chat-7-1",
    source: "stop",
    now: start + 10 * MINUTE,
  });
  const same = driverSessionView(store, { now: start + 11 * MINUTE });
  assert.equal(same.openedAt, "2026-11-14T10:00:00.000Z");
  assert.equal(same.lastSeenAt, "2026-11-14T10:10:00.000Z");
  registerDriverSession(store, {
    slot: "chat-8-2",
    source: "hook",
    now: start + 20 * MINUTE,
  });
  const other = driverSessionView(store, { now: start + 21 * MINUTE });
  assert.equal(other.slot, "chat-8-2");
  assert.equal(other.openedAt, "2026-11-14T10:20:00.000Z");
});

test("a slot that is not a plain chat key is refused", (t) => {
  const { store } = setup(t);
  for (const slot of ["", "a/b", "x y", "../up", "a".repeat(300), null, 7])
    assert.throws(() => registerDriverSession(store, { slot, source: "hook" }));
  assert.equal(driverSessionView(store, {}).state, "none");
});

test("plans_next from an attested session registers it; no caller registers nothing", async (t) => {
  const { ops } = setup(t);
  await ops.execute("runner.next", {});
  assert.equal((await ops.execute("driversession.view", {})).state, "none");
  await ops.execute("runner.next", {}, undefined, {
    caller: { sessionKey: "dashboard:chat-9-3" },
  });
  const view = await ops.execute("driversession.view", {});
  assert.equal(view.state, "running");
  assert.equal(view.slot, "chat-9-3");
  assert.equal(view.source, "next");
});

test("the hook command registers the key Kiro Crew sends and prints nothing", (t) => {
  const { root, store } = setup(t);
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  const run = (input) =>
    execFileSync(
      process.execPath,
      [cli, "driver", "hook", "--workspace", root],
      { encoding: "utf8", env, input: JSON.stringify(input) },
    );
  assert.equal(
    run({ hook_event_name: "agentSpawn", session_key: "dashboard:chat-5-1" }),
    "",
  );
  assert.equal(driverSessionView(store, {}).slot, "chat-5-1");
  assert.equal(driverSessionView(store, {}).source, "agentSpawn");
  // A payload with no session key, or a bad one, changes nothing and never fails.
  assert.equal(run({ hook_event_name: "stop" }), "");
  assert.equal(run({ hook_event_name: "stop", session_key: "cron:abc" }), "");
  assert.equal(driverSessionView(store, {}).slot, "chat-5-1");
  assert.equal(
    run({ hook_event_name: "stop", session_key: "dashboard:chat-5-1" }),
    "",
  );
  assert.equal(driverSessionView(store, {}).source, "stop");
});

test("the avoozl-driver agent is packaged with the hooks and tools a conductor needs", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(app, "app.json"), "utf8"),
  );
  assert.ok(manifest.agents.includes("agents/avoozl-driver.json"));
  const spec = JSON.parse(
    fs.readFileSync(path.join(app, "agents", "avoozl-driver.json"), "utf8"),
  );
  assert.equal(spec.name, "avoozl-driver");
  for (const event of ["agentSpawn", "stop"])
    assert.match(spec.hooks[event][0].command, /avoozl\.mjs" driver hook$/);
  assert.ok(spec.tools.includes("@avoozl:avoozl/plans_next"));
  assert.ok(spec.tools.includes("@kirocrew-work"));
  assert.ok(spec.allowedTools.includes("@kirocrew-work/work_ledger_record"));
  assert.ok(spec.allowedTools.includes("@kirocrew-dashboard/session_create"));
  // Nothing that merges or edits code runs without asking.
  assert.ok(!spec.allowedTools.some((tool) => /merge|retry/.test(tool)));
  // The driver releases and watches. It never merges, and it has no shell.
  for (const tool of ["fs_write", "execute_bash"])
    assert.ok(!spec.tools.includes(tool), tool);
  assert.match(spec.prompt, /never merge/i);
  const bin = fs.readFileSync(path.join(app, "bin", "avoozl.mjs"), "utf8");
  assert.match(bin, /"driver"/);
});

test("the packaged launcher runs driver hook and nothing else of driver", (t) => {
  const { root, store } = setup(t);
  const launcher = path.join(app, "bin", "avoozl.mjs");
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [launcher, "driver", "status", "--workspace", root],
        { env, stdio: "pipe" },
      ),
    (error) =>
      error.status === 2 && /unknown command "driver"/.test(error.stderr),
  );
  execFileSync(
    process.execPath,
    [launcher, "driver", "hook", "--workspace", root],
    {
      env,
      input: JSON.stringify({
        hook_event_name: "stop",
        session_key: "dashboard:chat-6-6",
      }),
    },
  );
  assert.equal(driverSessionView(store, {}).slot, "chat-6-6");
});
