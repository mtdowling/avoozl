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
  const { file } = setup(t);
  assert.deepEqual(driverSessionView({ file, now: 0 }), {
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
  const { file } = setup(t);
  const start = Date.parse("2026-11-14T10:00:00Z");
  registerDriverSession({
    file,
    slot: "chat-7-1",
    source: "hook",
    now: start,
  });
  const soon = driverSessionView({ file, now: start + 5 * MINUTE });
  assert.equal(soon.state, "running");
  assert.equal(soon.href, "/chat?sid=chat-7-1");
  const later = driverSessionView({
    file,
    now: start + (QUIET_MINUTES + 1) * MINUTE,
  });
  assert.equal(later.state, "idle");
  assert.equal(later.href, "/chat?sid=chat-7-1");
  assert.equal(later.lastSeenAt, "2026-11-14T10:00:00.000Z");
});

test("seeing the same session again keeps when it opened; a new one resets it", (t) => {
  const { file } = setup(t);
  const start = Date.parse("2026-11-14T10:00:00Z");
  registerDriverSession({
    file,
    slot: "chat-7-1",
    source: "hook",
    now: start,
  });
  registerDriverSession({
    file,
    slot: "chat-7-1",
    source: "stop",
    now: start + 10 * MINUTE,
  });
  const same = driverSessionView({ file, now: start + 11 * MINUTE });
  assert.equal(same.openedAt, "2026-11-14T10:00:00.000Z");
  assert.equal(same.lastSeenAt, "2026-11-14T10:10:00.000Z");
  registerDriverSession({
    file,
    slot: "chat-8-2",
    source: "hook",
    now: start + 20 * MINUTE,
  });
  const other = driverSessionView({ file, now: start + 21 * MINUTE });
  assert.equal(other.slot, "chat-8-2");
  assert.equal(other.openedAt, "2026-11-14T10:20:00.000Z");
});

test("a slot that is not a plain chat key is refused", (t) => {
  const { file } = setup(t);
  for (const slot of ["", "a/b", "x y", "../up", "a".repeat(300), null, 7])
    assert.throws(() => registerDriverSession({ file, slot, source: "hook" }));
  assert.equal(driverSessionView({ file }).state, "none");
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
  assert.equal(driverSessionView({ file }).slot, "chat-5-1");
  assert.equal(driverSessionView({ file }).source, "agentSpawn");
  // A payload with no session key, or a bad one, changes nothing and never fails.
  assert.equal(run({ hook_event_name: "stop" }), "");
  assert.equal(run({ hook_event_name: "stop", session_key: "cron:abc" }), "");
  assert.equal(driverSessionView({ file }).slot, "chat-5-1");
  assert.equal(
    run({ hook_event_name: "stop", session_key: "dashboard:chat-5-1" }),
    "",
  );
  assert.equal(driverSessionView({ file }).source, "stop");
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
  assert.equal(driverSessionView({ file }).slot, "chat-6-6");
});

// The bug: the hook resolved its own workspace (the catalog default, or its
// working directory when there is none) and wrote that database, or none,
// while the app page and side panel read the workspace they show. The record is
// now the machine's, so the hook needs no workspace at all.
test("Start -> the driver's hook, with no workspace and no default, makes every view show it running with a link", async (t) => {
  const { root, ops } = setup(t);
  // A second workspace the page might show: it reads the same record.
  const other = setup(t);
  const launcher = path.join(app, "bin", "avoozl.mjs");
  assert.equal((await ops.execute("driversession.view", {})).state, "none");
  // The Start button opens the chat on avoozl-driver; its agentSpawn hook runs
  // in the chat's own folder, inside the agent session, with no --workspace.
  const elsewhere = temporaryDirectory("avoozl-driver-cwd-");
  execFileSync(process.execPath, [launcher, "driver", "hook"], {
    cwd: elsewhere,
    env: machineEnv(root, { KIROCREW_SPAWNED: "1", KIRO_SESSION_ID: "acp-1" }),
    input: JSON.stringify({
      hook_event_name: "agentSpawn",
      session_key: "dashboard:chat-31-1",
    }),
  });
  const otherOps = new Operations(other.store, {
    workspaceRoot: other.root,
    driverSessionFile: path.join(
      root,
      "state",
      "avoozl",
      "driver-session.json",
    ),
  });
  for (const view of [
    await ops.execute("driversession.view", {}),
    await otherOps.execute("driversession.view", {}),
  ]) {
    assert.equal(view.state, "running");
    assert.equal(view.href, "/chat?sid=chat-31-1");
    assert.equal(view.source, "agentSpawn");
  }
});

test("a closed driver chat stops counting as running: no hook, then not running after the quiet window", (t) => {
  const { file } = setup(t);
  const start = Date.parse("2026-11-14T13:31:00Z");
  registerDriverSession({
    file,
    slot: "chat-31-1",
    source: "stop",
    now: start,
  });
  assert.equal(
    driverSessionView({ file, now: start + MINUTE }).state,
    "running",
  );
  // Closed: no turn ends, so no hook fires again.
  const closed = driverSessionView({
    file,
    now: start + (QUIET_MINUTES + 1) * MINUTE,
  });
  assert.notEqual(closed.state, "running");
  assert.equal(closed.state, "idle");
});

test("a hook that cannot write the record prints nothing and exits 0", (t) => {
  const { root } = setup(t);
  // The state folder is a file, so the record cannot be written.
  fs.writeFileSync(path.join(root, "state"), "");
  const env = machineEnv(root, {
    XDG_STATE_HOME: path.join(root, "state", "x"),
  });
  const out = execFileSync(process.execPath, [cli, "driver", "hook"], {
    env,
    encoding: "utf8",
    input: JSON.stringify({
      hook_event_name: "stop",
      session_key: "dashboard:chat-5-1",
    }),
  });
  assert.equal(out, "");
});

test("Operations without a record file reads none and never writes this machine's file", async (t) => {
  const { store, root } = setup(t);
  const ops = new Operations(store, { workspaceRoot: root });
  await ops.execute("runner.next", {}, undefined, {
    caller: { sessionKey: "dashboard:chat-1-1" },
  });
  assert.equal((await ops.execute("driversession.view", {})).state, "none");
});
