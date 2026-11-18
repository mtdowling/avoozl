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
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { fail } from "./store.mjs";
import { withoutPushCredentials } from "./git.mjs";
import { WorkspaceRegistry, machineAvoozlPaths } from "./host-config.mjs";
import {
  fillHarnessArgv,
  harnessPermission,
  loadHarnessDefinition,
} from "./harness-definitions.mjs";
import {
  catalogWorkspaceRoots,
  confineChild,
  sandboxNetwork,
  sandboxSecretPaths,
} from "./sandbox.mjs";
import { harnessAllow, sandboxAllowCommands } from "./harness-allow.mjs";

const CHILD_WRAPPER = fileURLToPath(
  new URL("./supervisor-child.mjs", import.meta.url),
);
const SUPERVISOR_MAIN = fileURLToPath(
  new URL("./supervisor-main.mjs", import.meta.url),
);
const TICK_MAIN = fileURLToPath(
  new URL("./headless-tick-main.mjs", import.meta.url),
);
const INTEGRATOR_MAIN = fileURLToPath(
  new URL("./integrator-main.mjs", import.meta.url),
);
const INTEGRATOR_SCAN_MS = 30_000;
const SESSION = /^process-[0-9a-f-]{36}$/;
// Placeholders the supervisor fills itself; a request cannot set them.
const OWN_VALUES = [
  "worktree",
  "brief_file",
  "message_file",
  "model",
  "session",
  "session_uuid",
  "permission",
  "project_allow_commands",
];
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
    tickLog: path.join(root, "tick.log"),
    integratorLog: path.join(root, "integrator.log"),
    children: path.join(root, "children"),
  };
}

// The enabled workspaces in the machine catalog whose `.avoozl.json` sets
// `landing.trains`: each gets one integrator process (landing-trains D4).
export function trainWorkspaceRoots({ stateDirectory, configDirectory }) {
  let registry;
  const configPath = path.join(path.resolve(configDirectory), "config.json");
  // A machine with no workspace configuration has nothing to integrate, and
  // opening the registry would create its catalog.
  if (!fs.existsSync(configPath)) return [];
  try {
    registry = new WorkspaceRegistry({
      configPath,
      catalogPath: path.join(path.resolve(stateDirectory), "catalog.sqlite"),
    });
    return registry
      .list()
      .filter((workspace) => workspace.enabled)
      .map((workspace) => workspace.root)
      .filter((root) => {
        const value = readJson(path.join(root, ".avoozl.json"));
        return Boolean(value?.landing?.trains);
      });
  } catch {
    return [];
  } finally {
    registry?.close();
  }
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
    -- Machine-wide resource slots held by integrator trains (landing-trains
    -- D14): two workspaces on one machine share one Windows VM.
    CREATE TABLE IF NOT EXISTS resource_slots (
      slot TEXT NOT NULL,
      n INTEGER NOT NULL,
      workspace TEXT NOT NULL,
      train TEXT NOT NULL,
      pid INTEGER NOT NULL,
      process_started TEXT,
      taken_at TEXT NOT NULL,
      PRIMARY KEY (slot, n)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      text TEXT NOT NULL,
      state TEXT NOT NULL,
      queued_at TEXT NOT NULL
    );
  `);
  // Columns added after the first release of this file.
  const columns = new Set(
    db
      .prepare("PRAGMA table_info(children)")
      .all()
      .map((c) => c.name),
  );
  if (!columns.has("settings"))
    db.exec(
      "ALTER TABLE children ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'",
    );
  if (!columns.has("runs"))
    db.exec("ALTER TABLE children ADD COLUMN runs INTEGER NOT NULL DEFAULT 0");
  if (!columns.has("result"))
    db.exec("ALTER TABLE children ADD COLUMN result TEXT");
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
  // The project's allow-list and network (R94.4c, R95.6), checked here and
  // again at start, so a bad request fails where it was made.
  const settings = {
    allowCommands: sandboxAllowCommands(request.allowCommands, {
      source: "allowCommands",
    }),
    network: request.network ?? "off",
  };
  sandboxNetwork(settings.network === "off" ? undefined : settings.network);
  const now = stamp();
  try {
    db.prepare(
      `INSERT INTO children (session_id, role, task, worktree, harness,
         permission_class, model, brief, placeholder_values, settings, state,
         requested_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)`,
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
      JSON.stringify(settings),
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
// How a child finishes (R96.1): `.avoozl/result.json` in its task folder.
export const RESULT_FILE = path.join(".avoozl", "result.json");
export const RESULT_BYTES = 8192;

// Read a finished run's result file (R96.1, R96.4): a regular file of at
// most 8 KB holding {"state": "done" | "blocked", "text": "..."}, and for a
// role that reports more than that (a verdict, a retro's reply) a `report`
// object. Returns { state, text, report? } or { problem }. Both are data,
// never an instruction.
export function readChildResult(worktree) {
  const file = path.join(worktree, RESULT_FILE);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return { problem: "The child wrote no result file." };
  }
  if (!stat.isFile())
    return { problem: "The result file is not a regular file." };
  if (stat.size > RESULT_BYTES)
    return { problem: `The result file is over ${RESULT_BYTES} bytes.` };
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { problem: "The result file is not valid JSON." };
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["state", "text", "report", "output"].includes(key),
    ) ||
    (value.output !== undefined && !OUTPUT_NAME.test(value.output)) ||
    !["done", "blocked", "findings"].includes(value.state) ||
    // Findings (R75.1) are the report; Avoozl's findings check reads them.
    (value.state === "findings" && !value.report) ||
    (value.text !== undefined && typeof value.text !== "string") ||
    (value.report !== undefined &&
      (!value.report ||
        typeof value.report !== "object" ||
        Array.isArray(value.report)))
  )
    return {
      problem:
        'The result file must be {"state": "done" | "blocked", "text": "...", "report"?: {...}, "output"?: "<file name>"}, or {"state": "findings", "report": {...}}.',
    };
  return {
    state: value.state,
    text: value.text ?? "",
    ...(value.report ? { report: value.report } : {}),
    ...(value.output ? { output: value.output } : {}),
  };
}

// The one output file a child may write beside its result file, for an
// answer too large for it (NK3): a plain name, read from `.avoozl/output/`.
export const OUTPUT_DIRECTORY = path.join(".avoozl", "output");
const OUTPUT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

// Read a finished child's output file once (NK3.2, NK3.4): exactly one
// regular file in `.avoozl/output/`, the one the result names, at most
// `limit` bytes, and valid by `validate(text)`, which throws its reason.
// Returns { text, value } or { problem }. The text is data, never an
// instruction.
export function readChildOutput(worktree, name, { limit, validate }) {
  if (typeof name !== "string" || !OUTPUT_NAME.test(name) || name === "..")
    return { problem: "The output must be a plain file name." };
  const folder = path.join(worktree, OUTPUT_DIRECTORY);
  let names;
  try {
    if (!fs.lstatSync(folder).isDirectory())
      return { problem: "The output folder is not a folder." };
    names = fs.readdirSync(folder);
  } catch {
    return { problem: "The child wrote no output file." };
  }
  if (names.length > 1)
    return { problem: "The child wrote more than one output file." };
  if (names[0] !== name)
    return {
      problem: `The result names ${name}, which is not in the output folder.`,
    };
  const file = path.join(folder, name),
    stat = fs.lstatSync(file);
  if (!stat.isFile())
    return { problem: "The output file is not a regular file." };
  if (stat.size > limit)
    return { problem: `The output file is over ${limit} bytes.` };
  const text = fs.readFileSync(file, "utf8");
  try {
    return { text, value: validate ? validate(text) : text };
  } catch (error) {
    return { problem: `The output file is not valid: ${error.message}` };
  }
}

// The finished run's outcome (R96.3, R96.4), or null while it runs. `done`
// needs exit code 0 and a good file; `blocked` needs a good file; anything
// else has no state and takes the retry path as `exited <code>`.
export function childResult(db, sessionId) {
  const row = childRecord(db, sessionId);
  if (!row) fail(`No supervisor session ${sessionId}.`, 404);
  if (row.state !== "exited" || queuedMessage(db, sessionId)) return null;
  const read = row.result ? JSON.parse(row.result) : { problem: row.error };
  const state =
    read.state === "blocked" ||
    ((read.state === "done" || read.state === "findings") &&
      row.exit_code === 0)
      ? read.state
      : null;
  return {
    exitCode: row.exit_code,
    run: row.runs,
    worktree: row.worktree,
    state,
    text: state ? read.text : null,
    ...(state && read.report ? { report: read.report } : {}),
    ...(state && read.output ? { output: read.output } : {}),
    problem: state
      ? null
      : read.state === "done" || read.state === "findings"
        ? `The child said ${read.state} but exited ${row.exit_code}.`
        : (read.problem ?? "The child wrote no result file."),
  };
}

export function childStatus(db, sessionId) {
  const row = childRecord(db, sessionId);
  if (!row) fail(`No supervisor session ${sessionId}.`, 404);
  if (row.state === "requested" || row.state === "running") return "working";
  if (row.state === "exited")
    return queuedMessage(db, sessionId) ? "working" : `exited ${row.exit_code}`;
  return "gone";
}

const queuedMessage = (db, sessionId) =>
  db
    .prepare(
      "SELECT * FROM messages WHERE session_id = ? AND state = 'queued' ORDER BY id LIMIT 1",
    )
    .get(sessionId);

// Queue a message for a session (R93 send). The supervisor delivers it with
// the definition's resume argv once the current run exits. A gone or
// stopped session, or one that never ran, refuses it.
export function sendChild(db, sessionId, text) {
  if (typeof text !== "string") fail("A message must be text.");
  const row = childRecord(db, sessionId);
  if (!row) fail(`No supervisor session ${sessionId}.`, 404);
  if (
    row.state === "gone" ||
    row.state === "stopped" ||
    (row.state === "exited" && !row.runs)
  )
    return "refused";
  db.prepare(
    "INSERT INTO messages (session_id, text, state, queued_at) VALUES (?, ?, 'queued', ?)",
  ).run(sessionId, text, stamp());
  return "accepted";
}

// Stop a session (R93 stop): a request not started never starts, queued
// messages are dropped, and a running child is asked to end (a stop file
// its wrapper reads, and SIGTERM to its process group off Windows); its
// wrapper then records the exit code. The signal checks the pid's start
// time first, so a reused pid is never signaled.
export function stopChild(
  db,
  sessionId,
  { startTime = processStartTime } = {},
) {
  const row = childRecord(db, sessionId);
  if (!row) fail(`No supervisor session ${sessionId}.`, 404);
  db.prepare(
    "UPDATE messages SET state = 'dropped' WHERE session_id = ? AND state = 'queued'",
  ).run(sessionId);
  if (row.state === "requested")
    update(db, sessionId, {
      state: "exited",
      exit_code: -1,
      error: "Stopped before it started.",
    });
  else if (row.state === "running") {
    // The wrapper polls for this file and ends its program; on Windows it
    // is the only way, since a signal ends the wrapper before it records.
    if (row.exit_file) fs.writeFileSync(`${row.exit_file}.stop`, "");
    if (
      process.platform !== "win32" &&
      sameProcess(row.pid, row.process_started, startTime)
    )
      try {
        process.kill(-row.pid, "SIGTERM");
      } catch {
        // Already exiting: the wrapper writes the code.
      }
  }
  return "stopped";
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
            {
              encoding: "utf8",
              timeout: 15_000,
              windowsHide: true,
              stdio: ["ignore", "pipe", "ignore"],
            },
          )
        : execFileSync("ps", ["-o", "lstart=", "-p", String(Number(pid))], {
            encoding: "utf8",
            timeout: 15_000,
            stdio: ["ignore", "pipe", "ignore"],
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

// The worktree's shared git directory, which no write root may cover
// (R94.4a), or null outside a repository.
function gitCommonDir(worktree) {
  try {
    const out = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: worktree,
      encoding: "utf8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out ? path.resolve(worktree, out) : null;
  } catch {
    return null;
  }
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
// and records the state of running ones. With `tickIntervalMs` (a headless
// machine, R95.3) it also runs the tick of every catalog workspace, one pass
// at a time, that long after the last pass ended.
export function startSupervisor({
  stateDirectory,
  configDirectory,
  intervalMs = 1000,
  tickIntervalMs = null,
  startTime = processStartTime,
  env = process.env,
  // Workspaces that get an integrator; tests pass their own.
  integratorRetryMs = 5000,
  integratorRoots = () =>
    trainWorkspaceRoots({ stateDirectory, configDirectory }),
}) {
  if (
    tickIntervalMs !== null &&
    !(Number.isInteger(tickIntervalMs) && tickIntervalMs > 0)
  )
    fail("The tick interval must be a whole number of milliseconds.");
  const lock = acquireSupervisorLock(stateDirectory, { startTime });
  const paths = supervisorPaths(stateDirectory);
  const db = openSupervisorDatabase(stateDirectory);
  // Children this process spawned; others were found again after a restart.
  const own = new Map();
  let timer = null;
  let closed = false;
  let ticking = null;
  let nextTick = 0;

  // The tick runs as its own process, so a slow or failing tick never
  // stalls the children's records. It keeps the supervisor's environment,
  // which reads GitHub; only agent children are confined.
  const tick = () => {
    if (ticking || Date.now() < nextTick) return;
    const out = fs.openSync(paths.tickLog, "a", 0o600);
    try {
      ticking = spawn(
        process.execPath,
        [
          TICK_MAIN,
          "--state-directory",
          path.resolve(stateDirectory),
          "--config-directory",
          path.resolve(configDirectory),
        ],
        { stdio: ["ignore", out, out], env, windowsHide: true },
      );
    } finally {
      fs.closeSync(out);
    }
    const ended = () => {
      ticking = null;
      nextTick = Date.now() + tickIntervalMs;
    };
    ticking.once("exit", ended);
    ticking.once("error", ended);
  };

  // One integrator per train workspace, restarted when it dies. Unlike an
  // agent child it ends with the supervisor, so a restart never doubles it.
  const integrators = new Map();
  let nextScan = 0,
    roots = [];
  const integrate = () => {
    const now = Date.now();
    if (now >= nextScan) {
      roots = integratorRoots();
      nextScan = now + INTEGRATOR_SCAN_MS;
    }
    for (const [root, record] of integrators)
      if (!roots.includes(root) && record.child.exitCode === null) {
        record.child.kill("SIGTERM");
        integrators.delete(root);
      }
    for (const root of roots) {
      const record = integrators.get(root);
      if (
        record &&
        ((record.child.exitCode === null && record.child.signalCode === null) ||
          now < record.retryAt)
      )
        continue;
      const out = fs.openSync(paths.integratorLog, "a", 0o600);
      let child;
      try {
        child = spawn(
          process.execPath,
          [INTEGRATOR_MAIN, "--workspace", root],
          {
            stdio: ["ignore", out, out],
            // The integrator pushes: it keeps the supervisor's environment,
            // like the tick; only agent children are confined.
            env,
            windowsHide: true,
          },
        );
      } finally {
        fs.closeSync(out);
      }
      const entry = { child, retryAt: 0 };
      integrators.set(root, entry);
      const ended = () => {
        entry.retryAt = Date.now() + integratorRetryMs;
      };
      child.once("exit", ended);
      child.once("error", ended);
    }
  };

  const start = (row, message = null) => {
    const folder = path.join(paths.children, row.session_id);
    const log = path.join(folder, "log");
    const run = (row.runs ?? 0) + 1;
    const exitFile = path.join(folder, `exit-${run}.json`);
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
      // Each run writes its own result; one from an earlier run never counts.
      fs.mkdirSync(path.join(row.worktree, ".avoozl"), { recursive: true });
      fs.rmSync(path.join(row.worktree, RESULT_FILE), { force: true });
      fs.rmSync(path.join(row.worktree, OUTPUT_DIRECTORY), {
        recursive: true,
        force: true,
      });
      const briefFile = path.join(folder, "brief.md");
      fs.writeFileSync(briefFile, row.brief, { mode: 0o600 });
      let messageFile = null;
      if (message) {
        messageFile = path.join(folder, `message-${message.id}.md`);
        fs.writeFileSync(messageFile, message.text, { mode: 0o600 });
      }
      const values = JSON.parse(row.placeholder_values);
      const settings = JSON.parse(row.settings || "{}");
      const filled = {
        ...values,
        worktree: row.worktree,
        brief_file: briefFile,
        model: row.model,
        session: row.session_id,
        session_uuid: row.session_id.slice("process-".length),
        permission: definition.permission[row.permission_class],
        ...(messageFile ? { message_file: messageFile } : {}),
      };
      // start or resume, then the model when one is named, then the
      // project's allow-list, checked again here (R94.4c).
      const argv = [
        ...fillHarnessArgv(
          message ? definition.resume : definition.start,
          filled,
        ),
        ...(row.model && definition.model
          ? fillHarnessArgv(definition.model, filled)
          : []),
        // An empty list adds no flag: a bare allow flag would take the
        // next argument as its value.
        ...(settings.allowCommands?.length
          ? harnessAllow(definition, settings.allowCommands)
          : []),
        // A read-only session may still write its result file (R96.1).
        ...(row.permission_class === "read" && definition.resultAllow
          ? fillHarnessArgv(definition.resultAllow, filled)
          : []),
      ];
      const promptFile = message ? messageFile : briefFile;
      const stdin =
        definition.promptFrom === "stdin" ? ["--stdin", promptFile] : [];
      // The sandbox wraps the agent, not the wrapper, which must still write
      // its exit file in the state folder the child cannot reach (R95.6).
      const access = harnessPermission(definition, {
        permissionClass: row.permission_class,
        worktree: row.worktree,
        tmp: values.tmp,
        cacheDirs: values.project_cache_dirs ?? [],
        gitCommonDir: gitCommonDir(row.worktree),
        configDirectory,
      });
      if (values.tmp)
        fs.mkdirSync(values.tmp, { recursive: true, mode: 0o700 });
      const confined = confineChild(argv, {
        definition,
        configDirectory,
        writeRoots: access.writeRoots,
        secrets: sandboxSecretPaths({
          home: env.HOME || os.homedir(),
          env,
          configDirectory,
          stateDirectory,
          workspaceRoots: catalogWorkspaceRoots(
            path.join(path.resolve(stateDirectory), "catalog.sqlite"),
          ),
        }),
        readable: [promptFile],
        writable: [log],
        network: sandboxNetwork(
          !settings.network || settings.network === "off"
            ? undefined
            : settings.network,
        ),
        keepEnv: definition.keepEnv ?? [],
        // Avoozl pushes; an agent gets no push credentials (R102.6). The
        // sandbox then sets git's own empty credential helper.
        // The child marker makes the CLI refuse person-only commands, even
        // on the command line (R95.5).
        env: withoutPushCredentials({
          ...env,
          ...(values.tmp
            ? Object.fromEntries(
                ["TMPDIR", ...(definition.tmpEnv ?? [])].map((name) => [
                  name,
                  values.tmp,
                ]),
              )
            : {}),
          AVOOZL_CHILD: "1",
          AVOOZL_CHILD_SESSION: row.session_id,
        }),
      });
      const out = fs.openSync(log, "a", 0o600);
      let child;
      try {
        child = spawn(
          process.execPath,
          [CHILD_WRAPPER, exitFile, ...stdin, ...confined.argv],
          {
            cwd: row.worktree,
            detached: true,
            stdio: ["ignore", out, out],
            env: confined.env,
            windowsHide: true,
          },
        );
      } finally {
        fs.closeSync(out);
      }
      if (!child.pid) fail(`The supervisor could not start ${argv[0]}.`);
      child.on("error", () => {});
      child.unref();
      own.set(row.session_id, child);
      // One step for readers: the message is delivered only as the child
      // reads running, so no reader sees the earlier run's exit with no
      // queued message and takes it for this run's end.
      const started = startTime(child.pid);
      db.exec("BEGIN IMMEDIATE");
      try {
        if (message)
          db.prepare(
            "UPDATE messages SET state = 'delivered' WHERE id = ?",
          ).run(message.id);
        update(db, row.session_id, {
          state: "running",
          harness_hash: hash,
          pid: child.pid,
          process_started: started,
          log_file: log,
          exit_file: exitFile,
          exit_code: null,
          result: null,
          error: null,
          runs: run,
        });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      // Refused before it ran (an unapproved definition, a missing worktree):
      // `exited -1` takes the retry path rather than reopening as gone. A
      // refused resume drops its message and keeps the earlier run count.
      if (message)
        db.prepare("UPDATE messages SET state = 'refused' WHERE id = ?").run(
          message.id,
        );
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
      const read = readChildResult(row.worktree);
      return update(db, row.session_id, {
        state: "exited",
        exit_code: exit.code,
        error: exit.error ?? read.problem ?? null,
        result: JSON.stringify(read),
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
    // A message for a session whose run has exited resumes it.
    for (const row of db
      .prepare(
        `SELECT c.* FROM children c WHERE c.state = 'exited' AND c.runs > 0
           AND EXISTS (SELECT 1 FROM messages m
             WHERE m.session_id = c.session_id AND m.state = 'queued')`,
      )
      .all())
      start(row, queuedMessage(db, row.session_id));
    if (tickIntervalMs) tick();
    integrate();
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
    for (const { child } of integrators.values()) child.kill("SIGTERM");
    db.close();
    lock.release();
  };

  pass();
  schedule();
  return {
    pass,
    close,
    holder: lock.holder,
    database: paths.database,
    ticking: () => Boolean(ticking),
    // Running integrators by workspace root, with their pids.
    integrators: () =>
      [...integrators]
        .filter(
          ([, r]) => r.child.exitCode === null && r.child.signalCode === null,
        )
        .map(([root, r]) => ({ root, pid: r.child.pid })),
  };
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

// Run as this process's job until a signal, with the machine's folders by
// default. A second supervisor sets exit code 1 and names the first.
// `tickSeconds` runs the tick too, on a headless machine (R95.3).
export function runSupervisor({
  stateDirectory,
  configDirectory,
  tickSeconds = null,
} = {}) {
  const machine = machineAvoozlPaths();
  let supervisor;
  try {
    supervisor = startSupervisor({
      stateDirectory: stateDirectory ?? machine.stateDirectory,
      configDirectory: configDirectory ?? machine.configDirectory,
      tickIntervalMs: tickSeconds === null ? null : tickSeconds * 1000,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return null;
  }
  console.log(`Avoozl supervisor running as pid ${process.pid}.`);
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"])
    process.on(signal, () => {
      supervisor.close();
      process.exit(0);
    });
  return supervisor;
}
