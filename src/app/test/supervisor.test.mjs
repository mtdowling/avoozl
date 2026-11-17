// The machine supervisor (R95.1-R95.4): owns pid, exit code and log; one per
// machine; finds its children after a restart and records a lost one `gone`.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
} from "../harness-definitions.mjs";
import {
  childRecord,
  childStatus,
  launchSupervisor,
  openSupervisorDatabase,
  requestChild,
  runningSupervisor,
  startSupervisor,
  supervisorPaths,
} from "../supervisor.mjs";
import { sandboxKind } from "../sandbox.mjs";
import { startAppBackend } from "../app-backend.mjs";
import { workspaceConfig } from "../config.mjs";

const MAIN = fileURLToPath(new URL("../supervisor-main.mjs", import.meta.url));

// A fake agent: reads its brief (JSON), writes a file in the worktree, waits
// for a release file when asked, and exits with the brief's code.
const AGENT = `
import fs from "node:fs";
const brief = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
console.log("agent says hello");
fs.writeFileSync("edited.txt", "edited");
const finish = () => process.exit(brief.exit ?? 0);
if (brief.waitFor) {
  const timer = setInterval(() => {
    if (fs.existsSync(brief.waitFor)) { clearInterval(timer); finish(); }
  }, 50);
} else finish();
`;

function scratch(t, { approve = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-supervisor-"));
  // Windows cannot remove an open database or a live process's folder, so
  // every test's own cleanup runs first, newest first.
  const cleanups = [];
  const defer = (fn) => cleanups.push(fn);
  t.after(async () => {
    for (const fn of cleanups.reverse()) await fn();
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
  });
  const stateDirectory = path.join(root, "state");
  const configDirectory = path.join(root, "config");
  const worktree = path.join(root, "worktree");
  fs.mkdirSync(worktree, { recursive: true });
  fs.writeFileSync(path.join(worktree, "agent.mjs"), AGENT);
  fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
  const bytes = JSON.stringify({
    name: "fake-cli",
    start: ["node", "{worktree}/agent.mjs", "{brief_file}"],
    resume: ["node", "{worktree}/agent.mjs", "{message_file}"],
    permission: { write: "workspace-write", read: "read-only" },
    writeRoots: ["{worktree}", "{tmp}"],
  });
  fs.writeFileSync(
    path.join(configDirectory, "harnesses", "fake-cli.json"),
    bytes,
  );
  if (approve)
    approveHarnessDefinition({
      configDirectory,
      name: "fake-cli",
      hash: harnessDefinitionHash(Buffer.from(bytes)),
    });
  // A machine with no sandbox runs children only with the person's opt-in.
  if (!sandboxKind())
    fs.writeFileSync(
      path.join(configDirectory, "harness-unconfined.json"),
      JSON.stringify({ "fake-cli": harnessDefinitionHash(Buffer.from(bytes)) }),
    );
  return { root, stateDirectory, configDirectory, worktree, defer };
}

const request = (worktree, brief = {}, extra = {}) => ({
  executor: "process",
  role: "worker",
  task: "1.1",
  worktree,
  harness: "fake-cli",
  permissionClass: "write",
  model: null,
  brief: JSON.stringify(brief),
  values: { tmp: path.join(path.dirname(worktree), "tmp") },
  ...extra,
});

// Stop a process this test started and wait until it is gone.
async function stopProcess(pid) {
  try {
    process.kill(pid);
  } catch {
    return;
  }
  await until(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  });
}

async function until(check, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > end) throw Error("Timed out waiting.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test("requests: only process requests, and the supervisor fills its own placeholders", (t) => {
  const { stateDirectory, worktree, defer } = scratch(t);
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  assert.throws(
    () => requestChild(db, request(worktree, {}, { executor: "kirocrew" })),
    /only process requests/,
  );
  assert.throws(
    () =>
      requestChild(db, request(worktree, {}, { values: { worktree: "/x" } })),
    /fills \{worktree\} itself/,
  );
  const id = requestChild(db, request(worktree));
  assert.match(id, /^process-/);
  assert.equal(childStatus(db, id), "working");
  assert.throws(
    () => childStatus(db, "process-missing"),
    /No supervisor session/,
  );
});

test("supervisor starts the approved harness and records pid, log and exit code", async (t) => {
  const { stateDirectory, configDirectory, worktree, defer } = scratch(t);
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const id = requestChild(db, request(worktree, { exit: 3 }));
  const supervisor = startSupervisor({
    stateDirectory,
    configDirectory,
    intervalMs: 60_000,
  });
  defer(() => supervisor.close());
  const running = childRecord(db, id);
  assert.equal(running.state, "running");
  assert.ok(Number.isInteger(running.pid));
  assert.match(running.harness_hash, /^[0-9a-f]{64}$/);
  await until(() => {
    supervisor.pass();
    return childStatus(db, id) !== "working";
  });
  assert.equal(childStatus(db, id), "exited 3");
  const row = childRecord(db, id);
  assert.equal(row.exit_code, 3);
  assert.match(fs.readFileSync(row.log_file, "utf8"), /agent says hello/);
  assert.equal(
    fs.readFileSync(path.join(worktree, "edited.txt"), "utf8"),
    "edited",
  );
});

test("an unapproved definition never runs and takes the retry path", (t) => {
  const { stateDirectory, configDirectory, worktree, defer } = scratch(t, {
    approve: false,
  });
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const id = requestChild(db, request(worktree));
  const supervisor = startSupervisor({
    stateDirectory,
    configDirectory,
    intervalMs: 60_000,
  });
  defer(() => supervisor.close());
  assert.equal(childStatus(db, id), "exited -1");
  assert.match(childRecord(db, id).error, /approve this exact version/);
  assert.equal(fs.existsSync(path.join(worktree, "edited.txt")), false);
});

test("a second supervisor on the machine exits and names the first", async (t) => {
  const { stateDirectory, configDirectory, defer } = scratch(t);
  const supervisor = startSupervisor({
    stateDirectory,
    configDirectory,
    intervalMs: 60_000,
  });
  defer(() => supervisor.close());
  assert.throws(
    () => startSupervisor({ stateDirectory, configDirectory }),
    new RegExp(`already runs on this machine: pid ${process.pid}`),
  );
  const second = spawnSync(
    process.execPath,
    [
      MAIN,
      "--state-directory",
      stateDirectory,
      "--config-directory",
      configDirectory,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(second.status, 1);
  assert.match(second.stderr, new RegExp(`pid ${process.pid}`));
});

test("after a restart the supervisor finds its children again; a missing one is gone", async (t) => {
  const { root, stateDirectory, configDirectory, worktree, defer } = scratch(t);
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const release = path.join(root, "release");
  const id = requestChild(db, request(worktree, { waitFor: release, exit: 0 }));

  // The first supervisor runs as its own process and dies mid-run.
  const first = spawn(process.execPath, [
    MAIN,
    "--state-directory",
    stateDirectory,
    "--config-directory",
    configDirectory,
  ]);
  const firstExit = new Promise((resolve) => first.once("exit", resolve));
  const pid = await until(() => childRecord(db, id).pid);
  first.kill("SIGKILL");
  await firstExit;
  defer(() => stopProcess(pid));

  // A dead pid and a reused pid, both left `running` by the old supervisor.
  const dead = spawnSync(process.execPath, ["-e", ""]).pid;
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO children (session_id, role, task, worktree, harness,
       permission_class, brief, placeholder_values, state, pid,
       process_started, requested_at, updated_at)
     VALUES (?, 'worker', '1.2', ?, 'fake-cli', 'write', '', '{}', 'running',
       ?, ?, ?, ?)`,
  );
  const lost = "process-00000000-0000-4000-8000-000000000001";
  const reused = "process-00000000-0000-4000-8000-000000000002";
  insert.run(lost, worktree, dead, null, now, now);
  insert.run(reused, worktree, process.pid, "not this process", now, now);

  const second = startSupervisor({
    stateDirectory,
    configDirectory,
    intervalMs: 60_000,
    // Some sandboxes cannot run ps; name this process's start time here.
    startTime: (at) => (at === process.pid ? "this process" : null),
  });
  defer(() => second.close());
  assert.equal(childStatus(db, id), "working");
  assert.equal(childStatus(db, lost), "gone");
  assert.equal(childStatus(db, reused), "gone");

  fs.writeFileSync(release, "");
  await until(() => {
    second.pass();
    return childStatus(db, id) !== "working";
  });
  assert.equal(childStatus(db, id), "exited 0");
  assert.match(
    fs.readFileSync(childRecord(db, id).log_file, "utf8"),
    /agent says hello/,
  );
});

test("launchSupervisor starts one detached supervisor and reuses it", async (t) => {
  const { stateDirectory, configDirectory, defer } = scratch(t);
  const first = launchSupervisor({ stateDirectory, configDirectory });
  assert.equal(first.started, true);
  defer(() => stopProcess(first.pid));
  await until(() => runningSupervisor(stateDirectory));
  assert.equal(runningSupervisor(stateDirectory).pid, first.pid);
  const again = launchSupervisor({ stateDirectory, configDirectory });
  assert.deepEqual(again, { pid: first.pid, started: false });
  assert.ok(fs.existsSync(supervisorPaths(stateDirectory).log));
});

test("the app backend starts the supervisor once it listens", async (t) => {
  const { root, defer } = scratch(t);
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "xdg") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  let calls = 0;
  const server = startAppBackend({
    config: workspaceConfig({ workspace: path.join(root, "ws"), env }),
    supervisor: () => calls++,
    notifier: null,
    slotReader: null,
    rowReader: null,
    usageReader: null,
    modelSwitcher: null,
    modelReader: null,
  });
  defer(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});
