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
  // The machine record, where the CLI finds it with XDG_STATE_HOME=<root>/state.
  const file = path.join(root, "state", "avoozl", "driver-session.json");
  return {
    root,
    store,
    file,
    ops: new Operations(store, {
      workspaceRoot: root,
      driverSessionFile: file,
    }),
  };
}

const MINUTE = 60_000;

// A subprocess environment whose machine folders are under `root`.
function machineEnv(root, extra = {}) {
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
    ...extra,
  };
  delete env.KIROCREW_HOME;
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  return env;
}

test("no session was seen: not started, with no link", (t) => {
  const { file, root } = setup(t);
  assert.deepEqual(driverSessionView({ file, root, name: "Avoozl", now: 0 }), {
    state: "none",
    workspace: "Avoozl",
    slot: null,
    href: null,
    openedAt: null,
    lastSeenAt: null,
    source: null,
    quietAfterMinutes: QUIET_MINUTES,
    others: [],
  });
});

test("a session seen lately is running; a quiet one is idle and keeps its link", (t) => {
  const { file, root } = setup(t);
  const start = Date.parse("2026-11-14T10:00:00Z");
  registerDriverSession({
    file,
    root,
    slot: "chat-7-1",
    source: "hook",
    now: start,
  });
  const soon = driverSessionView({ file, root, now: start + 5 * MINUTE });
  assert.equal(soon.state, "running");
  assert.equal(soon.href, "/chat?sid=chat-7-1");
  const later = driverSessionView({
    file,
    root,
    now: start + (QUIET_MINUTES + 1) * MINUTE,
  });
  assert.equal(later.state, "idle");
  assert.equal(later.href, "/chat?sid=chat-7-1");
  assert.equal(later.lastSeenAt, "2026-11-14T10:00:00.000Z");
});

test("seeing the same session again keeps when it opened; a new one resets it", (t) => {
  const { file, root } = setup(t);
  const start = Date.parse("2026-11-14T10:00:00Z");
  registerDriverSession({
    file,
    root,
    slot: "chat-7-1",
    source: "hook",
    now: start,
  });
  registerDriverSession({
    file,
    root,
    slot: "chat-7-1",
    source: "stop",
    now: start + 10 * MINUTE,
  });
  const same = driverSessionView({ file, root, now: start + 11 * MINUTE });
  assert.equal(same.openedAt, "2026-11-14T10:00:00.000Z");
  assert.equal(same.lastSeenAt, "2026-11-14T10:10:00.000Z");
  registerDriverSession({
    file,
    root,
    slot: "chat-8-2",
    source: "hook",
    now: start + 20 * MINUTE,
  });
  const other = driverSessionView({ file, root, now: start + 21 * MINUTE });
  assert.equal(other.slot, "chat-8-2");
  assert.equal(other.openedAt, "2026-11-14T10:20:00.000Z");
});

test("a slot that is not a plain chat key is refused", (t) => {
  const { file, root } = setup(t);
  for (const slot of ["", "a/b", "x y", "../up", "a".repeat(300), null, 7])
    assert.throws(() =>
      registerDriverSession({ file, root, slot, source: "hook" }),
    );
  assert.equal(driverSessionView({ file, root }).state, "none");
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
  const { root, file } = setup(t);
  const env = machineEnv(root);
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
  assert.equal(driverSessionView({ file, root }).slot, "chat-5-1");
  assert.equal(driverSessionView({ file, root }).source, "agentSpawn");
  // A payload with no session key, or a bad one, changes nothing and never fails.
  assert.equal(run({ hook_event_name: "stop" }), "");
  assert.equal(run({ hook_event_name: "stop", session_key: "cron:abc" }), "");
  assert.equal(driverSessionView({ file, root }).slot, "chat-5-1");
  assert.equal(
    run({ hook_event_name: "stop", session_key: "dashboard:chat-5-1" }),
    "",
  );
  assert.equal(driverSessionView({ file, root }).source, "stop");
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
  const { root, file } = setup(t);
  const launcher = path.join(app, "bin", "avoozl.mjs");
  const env = machineEnv(root);
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
  assert.equal(driverSessionView({ file, root }).slot, "chat-6-6");
});

// Each workspace has its own driver. A Nupp driver is not Avoozl's: Avoozl's
// view says it has none, and names Nupp's running one so it can be opened.
test("a driver for another workspace is not this one's; the view names it under others", (t) => {
  const { file, root } = setup(t);
  const nupp = temporaryDirectory("avoozl-driver-nupp-");
  const now = Date.parse("2026-11-14T13:31:00Z");
  registerDriverSession({
    file,
    root: nupp,
    name: "Nupp",
    slot: "chat-nupp",
    source: "agentSpawn",
    now,
  });
  const avoozl = driverSessionView({
    file,
    root,
    name: "Avoozl",
    now: now + MINUTE,
  });
  assert.equal(avoozl.state, "none");
  assert.equal(avoozl.workspace, "Avoozl");
  assert.deepEqual(
    avoozl.others.map((other) => [other.workspace, other.slot, other.href]),
    [["Nupp", "chat-nupp", "/chat?sid=chat-nupp"]],
  );
  const own = driverSessionView({
    file,
    root: nupp,
    name: "Nupp",
    now: now + MINUTE,
  });
  assert.equal(own.state, "running");
  assert.deepEqual(own.others, []);
  // A quiet driver elsewhere is not offered.
  assert.deepEqual(
    driverSessionView({ file, root, now: now + (QUIET_MINUTES + 1) * MINUTE })
      .others,
    [],
  );
});

test("Start -> the driver's hook records it for the workspace it serves; that workspace's views show it running with a link; a closed chat stops counting", async (t) => {
  const { root, ops, file } = setup(t);
  const launcher = path.join(app, "bin", "avoozl.mjs");
  assert.equal((await ops.execute("driversession.view", {})).state, "none");
  // The Start button opens the chat on avoozl-driver; its agentSpawn hook runs
  // in the chat's own folder, inside the agent session.
  execFileSync(
    process.execPath,
    [launcher, "driver", "hook", "--workspace", root],
    {
      cwd: temporaryDirectory("avoozl-driver-cwd-"),
      env: machineEnv(root, {
        KIROCREW_SPAWNED: "1",
        KIRO_SESSION_ID: "acp-1",
      }),
      input: JSON.stringify({
        hook_event_name: "agentSpawn",
        session_key: "dashboard:chat-31-1",
      }),
    },
  );
  const view = await ops.execute("driversession.view", {});
  assert.equal(view.state, "running");
  assert.equal(view.href, "/chat?sid=chat-31-1");
  // Closed: no turn ends, so no hook fires again.
  const closed = driverSessionView({
    file,
    root,
    now: Date.parse(view.lastSeenAt) + (QUIET_MINUTES + 1) * MINUTE,
  });
  assert.notEqual(closed.state, "running");
});

test("a hook with no workspace records nothing and logs why", (t) => {
  const { root, file } = setup(t);
  const empty = temporaryDirectory("avoozl-driver-none-");
  const out = execFileSync(
    process.execPath,
    [cli, "driver", "hook", "--workspace", empty],
    {
      env: machineEnv(root),
      encoding: "utf8",
      input: JSON.stringify({
        hook_event_name: "stop",
        session_key: "dashboard:chat-5-1",
      }),
    },
  );
  assert.equal(out, "");
  assert.equal(driverSessionView({ file, root: empty }).state, "none");
  assert.match(
    fs.readFileSync(file + ".log", "utf8"),
    /No Avoozl workspace at/,
  );
});

test("Operations without a record file reads none and never writes this machine's file", async (t) => {
  const { store, root } = setup(t);
  const ops = new Operations(store, { workspaceRoot: root });
  await ops.execute("runner.next", {}, undefined, {
    caller: { sessionKey: "dashboard:chat-1-1" },
  });
  assert.equal((await ops.execute("driversession.view", {})).state, "none");
});
