// @ts-nocheck: typing debt
// The supervisor pass (R95.1-R95.4): owns pid, exit code and log; a child
// outlives the tick that started it, and a later tick's pass reaps or resumes
// it, and records a lost one `gone`; two passes at once start nothing twice.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
} from "../harness-definitions.ts";
import {
  childRecord,
  harnessSession,
  childStatus,
  openSupervisor,
  openSupervisorDatabase,
  requestChild,
  sendChild,
  supervisorPaths,
} from "../supervisor.ts";
import { tryLock } from "../pass-lock.ts";
import { sandboxKind } from "../sandbox.ts";
import { scratchRoot } from "./process-machine.ts";

const SUPERVISOR = new URL("../supervisor.ts", import.meta.url).href;

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

function scratch(t, { approve = true, keepEnv = undefined, extra = {} } = {}) {
  const { root, defer } = scratchRoot(t, "avoozl-supervisor-");
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
    ...(keepEnv ? { keepEnv } : {}),
    ...extra,
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

// The child's log, to explain a failed status.
const childLog = (db, id) => {
  const row = childRecord(db, id);
  return `${row.error ?? ""}\n${row.log_file && fs.existsSync(row.log_file) ? fs.readFileSync(row.log_file, "utf8") : ""}`;
};

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

// A supervisor for one tick, after its first pass.
function openAndPass(options) {
  const supervisor = openSupervisor(options);
  supervisor.pass();
  return supervisor;
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
  const supervisor = openAndPass({
    stateDirectory,
    configDirectory,
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
  assert.equal(childStatus(db, id), "exited 3", childLog(db, id));
  const row = childRecord(db, id);
  assert.equal(row.exit_code, 3);
  assert.match(fs.readFileSync(row.log_file, "utf8"), /agent says hello/);
  assert.equal(
    fs.readFileSync(path.join(worktree, "edited.txt"), "utf8"),
    "edited",
  );
});

// A reader between "message delivered" and "child running" saw the old
// run's exit with no queued message, so the backend took it for the
// resumed run's end and reported done before the resumed run had edited.
test("a resumed child never reads as exited while its message starts it", async (t) => {
  const { stateDirectory, configDirectory, worktree, defer } = scratch(t);
  const db = openSupervisorDatabase(stateDirectory);
  const reader = openSupervisorDatabase(stateDirectory);
  defer(() => {
    db.close();
    reader.close();
  });
  const id = requestChild(db, request(worktree));
  const seen = [];
  const supervisor = openAndPass({
    stateDirectory,
    configDirectory,
    // Read by the backend's own connection while the supervisor starts a run.
    startTime: () => {
      if (childRecord(reader, id)) seen.push(childStatus(reader, id));
      return null;
    },
  });
  defer(() => supervisor.close());
  await until(() => {
    supervisor.pass();
    return childStatus(db, id) !== "working";
  });
  assert.equal(childStatus(db, id), "exited 0", childLog(db, id));
  assert.equal(sendChild(db, id, "again"), "accepted");
  seen.length = 0;
  supervisor.pass();
  assert.equal(childRecord(db, id).runs, 2);
  assert.ok(seen.length > 0);
  assert.deepEqual([...new Set(seen)], ["working"]);
});

test("a supervised agent gets no push credentials but the child marker (R102.4, R95.5)", async (t) => {
  const { stateDirectory, configDirectory, worktree, defer } = scratch(t);
  // This agent writes the names of its environment into the worktree.
  fs.writeFileSync(
    path.join(worktree, "agent.mjs"),
    `import fs from "node:fs";
fs.writeFileSync("env.json", JSON.stringify(Object.keys(process.env)));
fs.writeFileSync("marker.json", JSON.stringify([process.env.AVOOZL_CHILD, process.env.AVOOZL_CHILD_SESSION]));`,
  );
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const id = requestChild(db, request(worktree));
  const supervisor = openAndPass({
    stateDirectory,
    configDirectory,
    env: {
      ...process.env,
      GH_TOKEN: "made-up",
      GITHUB_TOKEN: "made-up",
      SSH_AUTH_SOCK: "made-up",
    },
  });
  defer(() => supervisor.close());
  await until(() => {
    supervisor.pass();
    return childStatus(db, id) !== "working";
  });
  const names = JSON.parse(
    fs.readFileSync(path.join(worktree, "env.json"), "utf8"),
  );
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "SSH_AUTH_SOCK"])
    assert.equal(names.includes(name), false, name);
  assert.ok(names.includes("PATH") || names.includes("Path"));
  // The child marker the CLI refuses person-only commands on (R95.5).
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(worktree, "marker.json"), "utf8")),
    ["1", id],
  );
});

test("a keepEnv value from machine.env reaches the child and no other name does (MS5.2)", async (t) => {
  const { stateDirectory, configDirectory, worktree, defer } = scratch(t, {
    keepEnv: ["MODEL_KEY"],
  });
  fs.writeFileSync(
    path.join(configDirectory, "machine.env"),
    "MODEL_KEY=from-the-file\nOTHER_NAME=not-passed\n",
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(worktree, "agent.mjs"),
    `import fs from "node:fs";
fs.writeFileSync("seen.json", JSON.stringify([process.env.MODEL_KEY, process.env.OTHER_NAME ?? null]));`,
  );
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const id = requestChild(db, request(worktree));
  const supervisor = openAndPass({
    stateDirectory,
    configDirectory,
  });
  defer(() => supervisor.close());
  await until(() => {
    supervisor.pass();
    return childStatus(db, id) !== "working";
  });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(worktree, "seen.json"), "utf8")),
    ["from-the-file", null],
    childLog(db, id),
  );
  // Nothing the server wrote down holds the value.
  assert.doesNotMatch(
    JSON.stringify(childRecord(db, id)) +
      fs.readFileSync(childRecord(db, id).log_file, "utf8"),
    /from-the-file/,
  );
});

test("the child is the program the readiness check finds, on machine.env's PATH (MS5.3)", {
  skip: process.platform === "win32",
}, async (t) => {
  const { root, stateDirectory, configDirectory, worktree, defer } = scratch(
    t,
    { extra: { start: ["only-in-machine-env"] } },
  );
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "only-in-machine-env"),
    '#!/bin/sh\nprintf "%s\\n%s" "$0" "$PATH" > ran.txt\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(configDirectory, "machine.env"),
    `PATH=${bin}:/usr/bin:/bin\n`,
    { mode: 0o600 },
  );
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const id = requestChild(db, request(worktree));
  const supervisor = openAndPass({ stateDirectory, configDirectory });
  defer(() => supervisor.close());
  await until(() => {
    supervisor.pass();
    return childStatus(db, id) !== "working";
  });
  assert.deepEqual(
    fs.readFileSync(path.join(worktree, "ran.txt"), "utf8").split("\n"),
    [path.join(bin, "only-in-machine-env"), `${bin}:/usr/bin:/bin`],
    childLog(db, id),
  );
});

test("an unapproved definition never runs and takes the retry path", (t) => {
  const { stateDirectory, configDirectory, worktree, defer } = scratch(t, {
    approve: false,
  });
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const id = requestChild(db, request(worktree));
  const supervisor = openAndPass({
    stateDirectory,
    configDirectory,
  });
  defer(() => supervisor.close());
  assert.equal(childStatus(db, id), "exited -1");
  assert.match(childRecord(db, id).error, /approve this exact version/);
  assert.equal(fs.existsSync(path.join(worktree, "edited.txt")), false);
});

test("two passes at once: the one without the pass lock starts nothing", (t) => {
  const { stateDirectory, configDirectory, worktree, defer } = scratch(t);
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const id = requestChild(db, request(worktree));
  const held = tryLock(supervisorPaths(stateDirectory).lock);
  assert.equal(held.held, true);
  const supervisor = openSupervisor({ stateDirectory, configDirectory });
  defer(() => supervisor.close());
  try {
    assert.equal(supervisor.pass(), false);
    assert.equal(childRecord(db, id).state, "requested");
  } finally {
    held.close();
  }
  assert.equal(supervisor.pass(), true);
  assert.equal(childRecord(db, id).state, "running");
});

test("a child outlives the tick that started it; the next tick reaps it, resumes it, and records a lost one gone", async (t) => {
  const { root, stateDirectory, configDirectory, worktree, defer } = scratch(t);
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const release = path.join(root, "release");
  const id = requestChild(db, request(worktree, { waitFor: release, exit: 0 }));

  // The first tick is its own process: one pass, then it exits.
  const first = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { openSupervisor } = await import(${JSON.stringify(SUPERVISOR)});
       const s = openSupervisor(${JSON.stringify({ stateDirectory, configDirectory })});
       s.pass(); s.close();`,
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  assert.equal(first.status, 0, first.stderr);
  const { pid, session_id } = childRecord(db, id);
  assert.equal(session_id, id);
  defer(() => stopProcess(pid));
  // Its child still runs, with its pid and session recorded.
  assert.equal(childRecord(db, id).state, "running");
  process.kill(pid, 0);

  // A dead pid and a reused pid, both left `running` by an earlier tick.
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

  // Some sandboxes cannot run ps; name this process's start time here.
  const startTime = (at) => (at === process.pid ? "this process" : null);
  const tick = () => {
    const second = openSupervisor({
      stateDirectory,
      configDirectory,
      startTime,
    });
    try {
      second.pass();
    } finally {
      second.close();
    }
  };
  tick();
  assert.equal(childStatus(db, id), "working");
  assert.equal(childStatus(db, lost), "gone");
  assert.equal(childStatus(db, reused), "gone");

  // It ends between ticks; the next tick reaps it from its exit file.
  fs.writeFileSync(release, "");
  await until(() => {
    tick();
    return childStatus(db, id) !== "working";
  });
  assert.equal(childStatus(db, id), "exited 0", childLog(db, id));
  assert.match(
    fs.readFileSync(childRecord(db, id).log_file, "utf8"),
    /agent says hello/,
  );

  // A message queued between ticks resumes the same session on the next.
  assert.equal(sendChild(db, id, JSON.stringify({ exit: 3 })), "accepted");
  tick();
  await until(() => {
    tick();
    return childStatus(db, id) !== "working";
  });
  assert.equal(childStatus(db, id), "exited 3", childLog(db, id));
  assert.equal(childRecord(db, id).runs, 2);
});

// A fake agent that records its argv, its home variable and its prompt.
const LANE_AGENT = `
import fs from "node:fs";
fs.writeFileSync("seen.json", JSON.stringify({
  argv: process.argv.slice(2),
  home: process.env.FAKE_HOME ?? null,
  prompt: fs.readFileSync(process.argv[2], "utf8"),
}));
`;

// Run one requested lane child to its exit and read what it recorded.
async function runSeen({
  stateDirectory,
  configDirectory,
  worktree,
  defer,
  db,
  id,
}) {
  const supervisor = openSupervisor({ stateDirectory, configDirectory });
  defer(() => supervisor.close());
  await until(() => {
    supervisor.pass();
    return childStatus(db, id) !== "working";
  });
  return JSON.parse(fs.readFileSync(path.join(worktree, "seen.json"), "utf8"));
}

test("a lane child runs in its lane's home, named by its header, and a new task prunes older sessions (simplify §D22.2)", async (t) => {
  // Nearby inputs: a session file older than the lane's last task (deleted),
  // a newer one (kept), a file outside the session folder (kept), and a
  // definition with no label (the header leads the prompt instead).
  const { root, stateDirectory, configDirectory, worktree, defer } = scratch(
    t,
    {
      extra: {
        home: "FAKE_HOME",
        label: ["--name", "{lane_header}"],
        sessions: "projects",
      },
    },
  );
  fs.writeFileSync(path.join(worktree, "agent.mjs"), LANE_AGENT);
  const home = path.join(root, "lanes", "ws", "worker-1"),
    sessions = path.join(home, "projects", "slug");
  fs.mkdirSync(sessions, { recursive: true });
  const old = path.join(sessions, "old.jsonl"),
    kept = path.join(sessions, "kept.jsonl"),
    config = path.join(home, "settings.json");
  for (const file of [old, kept, config]) fs.writeFileSync(file, "{}");
  const long = new Date(Date.now() - 3_600_000);
  fs.utimesSync(old, long, long);
  fs.utimesSync(config, long, long);
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const header = "Avoozl · ws · worker 1";
  const id = requestChild(
    db,
    request(
      worktree,
      {},
      {
        lane: {
          home,
          header,
          keepSince: new Date(Date.now() - 60_000).toISOString(),
        },
      },
    ),
  );
  const seen = await runSeen({
    stateDirectory,
    configDirectory,
    worktree,
    defer,
    db,
    id,
  });
  assert.equal(seen.home, home, childLog(db, id));
  assert.deepEqual(seen.argv.slice(1), ["--name", header]);
  assert.equal(seen.prompt, JSON.stringify({}), "a label names the session");
  assert.equal(fs.existsSync(old), false, "an older session file is deleted");
  assert.equal(fs.existsSync(kept), true, "the last task's session stays");
  assert.equal(fs.existsSync(config), true, "nothing outside sessions/");
  assert.throws(
    () =>
      requestChild(
        db,
        request(worktree, {}, { lane: { home: "relative", header } }),
      ),
    /lane must be/,
  );
});

test("a lane review round resumes its task's harness session", async (t) => {
  const { stateDirectory, configDirectory, worktree, defer } = scratch(t, {
    extra: { home: "FAKE_HOME" },
  });
  fs.writeFileSync(path.join(worktree, "agent.mjs"), LANE_AGENT);
  const db = openSupervisorDatabase(stateDirectory);
  defer(() => db.close());
  const resume = "0b9a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
    home = path.join(path.dirname(worktree), "lane-home");
  const id = requestChild(
    db,
    request(
      worktree,
      { round: 2 },
      { lane: { home, header: "Avoozl · ws · worker 1", resume } },
    ),
  );
  const seen = await runSeen({
    stateDirectory,
    configDirectory,
    worktree,
    defer,
    db,
    id,
  });
  // The resume argv reads the brief as its message, led by the header.
  assert.equal(
    seen.prompt,
    `Avoozl · ws · worker 1\n\n${JSON.stringify({ round: 2 })}`,
    childLog(db, id),
  );
  assert.equal(seen.home, home);
  assert.equal(harnessSession(childRecord(db, id)), resume);
});
