// `avoozl supervisor` (R95.1-R95.4, design §4.28): one long-lived process per
// machine that owns every `process` child. Its state is one SQLite file in the
// machine state folder. A caller (the `process` executor) writes a session
// request there; the supervisor starts the approved harness in the request's
// worktree, through supervisor-child.mjs, and records the child's pid, start
// time, log and exit code. The children are detached, so they outlive the
// supervisor; a restarted supervisor finds each one again by pid and start
// time, and records one it cannot find as `gone` (R88.4 decides what follows).
// Nothing here listens on a socket.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { fail } from "./store.mjs";
import {
  fillHarnessArgv,
  loadHarnessDefinition,
} from "./harness-definitions.mjs";

const CHILD_WRAPPER = fileURLToPath(
  new URL("./supervisor-child.mjs", import.meta.url),
);
const SUPERVISOR_MAIN = fileURLToPath(
  new URL("./supervisor-main.mjs", import.meta.url),
);
const SESSION = /^process-[0-9a-f-]{36}$/;
// Placeholders the supervisor fills itself; a request cannot set them.
const OWN_VALUES = ["worktree", "brief_file", "model", "session", "permission"];
const stamp = () => new Date().toISOString();

export function supervisorPaths(stateDirectory) {
  if (typeof stateDirectory !== "string" || !stateDirectory)
    fail("The machine state directory is required for the supervisor.");
  const root = path.join(path.resolve(stateDirectory), "supervisor");
  return {
    root,
    database: path.join(root, "supervisor.sqlite"),
    lock: path.join(root, "supervisor.lock"),
    log: path.join(root, "supervisor.log"),
    children: path.join(root, "children"),
  };
}

export function openSupervisorDatabase(stateDirectory) {
  const paths = supervisorPaths(stateDirectory);
  fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(paths.database);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS children (
      session_id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      task TEXT NOT NULL,
      worktree TEXT NOT NULL,
      harness TEXT NOT NULL,
      permission_class TEXT NOT NULL,
      model TEXT,
      brief TEXT NOT NULL,
      placeholder_values TEXT NOT NULL,
      state TEXT NOT NULL,
      harness_hash TEXT,
      pid INTEGER,
      process_started TEXT,
      log_file TEXT,
      exit_file TEXT,
      exit_code INTEGER,
      error TEXT,
      requested_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

const text = (value, name) => {
  if (typeof value !== "string" || !value.trim())
    fail(`A supervisor request needs ${name}.`);
  return value;
};

// Queue one session request. Only the `process` executor's requests are
// taken (R95.2); a Kiro Crew chat never reaches the supervisor.
export function requestChild(db, request) {
  if (!request || typeof request !== "object")
    fail("A supervisor request must be an object.");
  if (request.executor !== "process")
    fail(
      `The supervisor takes only process requests, not ${JSON.stringify(request.executor)}.`,
    );
  const sessionId = request.sessionId ?? `process-${randomUUID()}`;
  if (!SESSION.test(sessionId))
    fail(`Session ID ${JSON.stringify(sessionId)} is not a process session.`);
  if (!["read", "write"].includes(request.permissionClass))
    fail("permissionClass must be read or write.");
  if (typeof request.brief !== "string")
    fail("A supervisor request needs a brief.");
  if (request.model !== undefined && request.model !== null)
    text(request.model, "a model or null");
  const values = request.values ?? {};
  if (!values || typeof values !== "object" || Array.isArray(values))
    fail("Request values must be an object.");
  for (const [key, value] of Object.entries(values)) {
    if (OWN_VALUES.includes(key))
      fail(`The supervisor fills {${key}} itself; a request cannot set it.`);
    const list = Array.isArray(value) ? value : [value];
    if (!list.every((item) => typeof item === "string"))
      fail(`Value {${key}} must be a string or a list of strings.`);
  }
  const now = stamp();
  try {
    db.prepare(
      `INSERT INTO children (session_id, role, task, worktree, harness,
         permission_class, model, brief, placeholder_values, state,
         requested_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)`,
    ).run(
      sessionId,
      text(request.role, "a role"),
      text(request.task, "a task"),
      path.resolve(text(request.worktree, "a worktree")),
      text(request.harness, "a harness"),
      request.permissionClass,
      request.model ?? null,
      request.brief,
      JSON.stringify(values),
      now,
      now,
    );
  } catch (error) {
    if (/UNIQUE/.test(error.message))
      fail(`Session ${sessionId} was already requested.`, 409);
    throw error;
  }
  return sessionId;
}

export function childRecord(db, sessionId) {
  return db
    .prepare("SELECT * FROM children WHERE session_id = ?")
    .get(sessionId);
}

// The executor status of one child (R93): a request not yet started counts
// as working, as the child it becomes will be.
export function childStatus(db, sessionId) {
  const row = childRecord(db, sessionId);
  if (!row) fail(`No supervisor session ${sessionId}.`, 404);
  if (row.state === "requested" || row.state === "running") return "working";
  if (row.state === "exited") return `exited ${row.exit_code}`;
  return "gone";
}

// The OS's start time for a pid, as an opaque string, or null when it cannot
// be read. A pid with a different start time is another process.
// shortcut: macOS needs the setuid `ps`, which some sandboxes forbid; then
// only pid liveness is checked. Read sysctl directly if pid reuse shows up.
export function processStartTime(pid) {
  try {
    const out =
      process.platform === "win32"
        ? execFileSync(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `(Get-Process -Id ${Number(pid)}).StartTime.ToUniversalTime().ToString('o')`,
            ],
            { encoding: "utf8", timeout: 15_000, windowsHide: true },
          )
        : execFileSync("ps", ["-o", "lstart=", "-p", String(Number(pid))], {
            encoding: "utf8",
            timeout: 15_000,
            env: { ...process.env, LC_ALL: "C" },
          });
    return out.trim() || null;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

// Whether `pid` is still the process that started at `started`. An unreadable
// start time keeps the child: a failed observation is never evidence of gone.
export function sameProcess(pid, started, startTime = processStartTime) {
  if (!pidAlive(pid)) return false;
  if (!started) return true;
  const now = startTime(pid);
  return now === null || now === started;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// One supervisor per machine (R95.1). The lock holds the owner's pid and
// start time; a lock whose owner is gone is taken over.
export function acquireSupervisorLock(
  stateDirectory,
  { startTime = processStartTime } = {},
) {
  const { root, lock } = supervisorPaths(stateDirectory);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const mine = {
    pid: process.pid,
    started: startTime(process.pid),
    at: stamp(),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(lock, JSON.stringify(mine) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const holder = readJson(lock);
      if (holder && sameProcess(holder.pid, holder.started, startTime))
        fail(
          `A supervisor already runs on this machine: pid ${holder.pid}, started ${holder.at}.`,
          409,
        );
      // The owner is gone. Rename, not unlink, so only one taker wins it.
      try {
        fs.renameSync(lock, `${lock}.${process.pid}.stale`);
        fs.rmSync(`${lock}.${process.pid}.stale`, { force: true });
      } catch {
        // Another taker moved it first; try again.
      }
      continue;
    }
    const holds = () => readJson(lock)?.pid === process.pid;
    return {
      holder: mine,
      holds,
      release() {
        if (holds()) fs.rmSync(lock, { force: true });
      },
    };
  }
  fail("Could not take the supervisor lock; try again.", 409);
}

// The supervisor that runs now, from its lock, or null.
export function runningSupervisor(stateDirectory, { startTime } = {}) {
  const holder = readJson(supervisorPaths(stateDirectory).lock);
  return holder && sameProcess(holder.pid, holder.started, startTime)
    ? holder
    : null;
}

function update(db, sessionId, fields) {
  const keys = Object.keys(fields);
  db.prepare(
    `UPDATE children SET ${keys.map((k) => `${k} = ?`).join(", ")},
       updated_at = ? WHERE session_id = ?`,
  ).run(...keys.map((k) => fields[k]), stamp(), sessionId);
}

function killGroup(pid) {
  if (process.platform === "win32") return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group is already empty.
  }
}

// Run the supervisor until close(). Takes the machine lock first, so a second
// one refuses and names the first (R95.1). Each pass starts requested children
// and records the state of running ones.
export function startSupervisor({
  stateDirectory,
  configDirectory,
  intervalMs = 1000,
  startTime = processStartTime,
  env = process.env,
}) {
  const lock = acquireSupervisorLock(stateDirectory, { startTime });
  const paths = supervisorPaths(stateDirectory);
  const db = openSupervisorDatabase(stateDirectory);
  // Children this process spawned; others were found again after a restart.
  const own = new Map();
  let timer = null;
  let closed = false;

  const start = (row) => {
    const folder = path.join(paths.children, row.session_id);
    const log = path.join(folder, "log");
    const exitFile = path.join(folder, "exit.json");
    let hash = null;
    try {
      const stat = fs.statSync(row.worktree, { throwIfNoEntry: false });
      if (!stat?.isDirectory())
        fail(`The worktree ${row.worktree} does not exist.`);
      const definition = loadHarnessDefinition({
        configDirectory,
        name: row.harness,
      });
      hash = definition.hash;
      fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
      const briefFile = path.join(folder, "brief.md");
      fs.writeFileSync(briefFile, row.brief, { mode: 0o600 });
      const argv = fillHarnessArgv(definition.start, {
        ...JSON.parse(row.placeholder_values),
        worktree: row.worktree,
        brief_file: briefFile,
        model: row.model,
        session: row.session_id,
        permission: definition.permission[row.permission_class],
      });
      const out = fs.openSync(log, "a", 0o600);
      let child;
      try {
        child = spawn(process.execPath, [CHILD_WRAPPER, exitFile, ...argv], {
          cwd: row.worktree,
          detached: true,
          stdio: ["ignore", out, out],
          env,
          windowsHide: true,
        });
      } finally {
        fs.closeSync(out);
      }
      if (!child.pid) fail(`The supervisor could not start ${argv[0]}.`);
      child.on("error", () => {});
      child.unref();
      own.set(row.session_id, child);
      update(db, row.session_id, {
        state: "running",
        harness_hash: hash,
        pid: child.pid,
        process_started: startTime(child.pid),
        log_file: log,
        exit_file: exitFile,
      });
    } catch (error) {
      // Refused before it ran (an unapproved definition, a missing worktree):
      // `exited -1` takes the retry path rather than reopening as gone.
      update(db, row.session_id, {
        state: "exited",
        harness_hash: hash,
        exit_code: -1,
        error: error.message,
      });
    }
  };

  const observe = (row) => {
    const exit = row.exit_file && readJson(row.exit_file);
    if (exit && Number.isInteger(exit.code)) {
      own.delete(row.session_id);
      return update(db, row.session_id, {
        state: "exited",
        exit_code: exit.code,
        error: exit.error ?? null,
      });
    }
    const child = own.get(row.session_id);
    const alive = child
      ? child.exitCode === null && child.signalCode === null
      : sameProcess(row.pid, row.process_started, startTime);
    if (alive) return;
    // The wrapper died without writing its exit file. Its agent may still
    // run in the same process group; stop it so nothing edits unowned.
    if (child) killGroup(row.pid);
    own.delete(row.session_id);
    update(db, row.session_id, {
      state: "gone",
      error: "The supervisor cannot find this child.",
    });
  };

  const pass = () => {
    if (closed) return;
    if (!lock.holds()) return close();
    for (const row of db
      .prepare("SELECT * FROM children WHERE state = 'running'")
      .all())
      observe(row);
    for (const row of db
      .prepare(
        "SELECT * FROM children WHERE state = 'requested' ORDER BY requested_at",
      )
      .all())
      start(row);
  };

  const schedule = () => {
    timer = setTimeout(() => {
      try {
        pass();
      } finally {
        if (!closed) schedule();
      }
    }, intervalMs);
  };

  // Children are left running: they outlive the supervisor by design.
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    db.close();
    lock.release();
  };

  pass();
  schedule();
  return { pass, close, holder: lock.holder, database: paths.database };
}

// Start a detached supervisor unless one runs (R95.3, used by the app
// backend). Returns the running or new supervisor's pid.
export function launchSupervisor({
  stateDirectory,
  configDirectory,
  env = process.env,
  startTime,
}) {
  const running = runningSupervisor(stateDirectory, { startTime });
  if (running) return { pid: running.pid, started: false };
  const { root, log } = supervisorPaths(stateDirectory);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const out = fs.openSync(log, "a", 0o600);
  let child;
  try {
    child = spawn(
      process.execPath,
      [
        SUPERVISOR_MAIN,
        "--state-directory",
        path.resolve(stateDirectory),
        "--config-directory",
        path.resolve(configDirectory),
      ],
      { detached: true, stdio: ["ignore", out, out], env, windowsHide: true },
    );
  } finally {
    fs.closeSync(out);
  }
  child.on("error", () => {});
  child.unref();
  return { pid: child.pid, started: true };
}
