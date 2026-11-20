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
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { readServeConfig } from "../settings/serve-config.mjs";
import { fail } from "../store/store.mjs";
import { withoutPushCredentials } from "../git/git.mjs";
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import {
  fillHarnessArgv,
  harnessPermission,
  harnessReads,
  loadHarnessDefinition,
  readRoleProblem,
} from "./harness-definitions.mjs";
import {
  catalogWorkspaceRoots,
  confineChild,
  sandboxNetwork,
  sandboxSecretPaths,
} from "./sandbox.mjs";
import { harnessAllow, sandboxAllowCommands } from "./harness-allow.mjs";
import { lockHolder, machineLockPaths, takeLock } from "./machine-lock.mjs";
import { createBroker } from "./context-broker.mjs";
import { markPluginBroken } from "../plugins/plugin-checks.mjs";
import { buildId } from "./machine-build.mjs";
import { readMachineEnv, withKeptValues } from "./machine-env.mjs";
import {
  ensureRequestTables,
  pendingRequests,
  recordPasses,
  setRequest,
} from "./machine-requests.mjs";
import { readTickSeconds } from "../settings/machine-config.mjs";

const CHILD_WRAPPER = fileURLToPath(
  new URL("./supervisor-child.mjs", import.meta.url),
);
const SUPERVISOR_MAIN = fileURLToPath(
  new URL("./supervisor-main.mjs", import.meta.url),
);
const TICK_MAIN = fileURLToPath(
  new URL("../tick/headless-tick-main.mjs", import.meta.url),
);
const SERVE_MAIN = fileURLToPath(
  new URL("../serve/serve-main.mjs", import.meta.url),
);
const SERVE_SCAN_MS = 5_000;
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
  "repository_allow_commands",
  "context_mcp",
  "lane_header",
];
const CONTEXT_RELAY = fileURLToPath(
  new URL("./context-relay.mjs", import.meta.url),
);
const stamp = () => new Date().toISOString();

export function supervisorPaths(stateDirectory) {
  if (typeof stateDirectory !== "string" || !stateDirectory)
    fail("The machine state directory is required for the supervisor.");
  const root = path.join(path.resolve(stateDirectory), "supervisor");
  return {
    root,
    database: path.join(root, "supervisor.sqlite"),
    log: path.join(root, "supervisor.log"),
    tickLog: path.join(root, "tick.log"),
    serveLog: path.join(root, "serve.log"),
    children: path.join(root, "children"),
  };
}

export function openSupervisorDatabase(stateDirectory) {
  const paths = supervisorPaths(stateDirectory);
  fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(paths.database);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
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
  ensureRequestTables(db);
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
  // The repository's allow-list and network (R94.4c, R95.6), checked here and
  // again at start, so a bad request fails where it was made.
  const settings = {
    allowCommands: sandboxAllowCommands(request.allowCommands, {
      source: "allowCommands",
    }),
    network: request.network ?? "off",
    readable: absolutePaths(request.readable, "readable"),
    context: contextSettings(request.context),
    ...(request.lane ? { lane: laneSettings(request.lane) } : {}),
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

// The harness's own session UUID for a child: the session a review round
// resumes, else the child's own (simplify §D22.2).
export function harnessSession(row) {
  const lane = JSON.parse(row.settings || "{}").lane;
  return lane?.resume ?? row.session_id.slice("process-".length);
}

// A lane session's settings (simplify §D22.2): {home, header, resume?}. The
// home is the lane's own folder; `resume` names the harness session a
// review round continues.
export function laneSettings(value) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.home !== "string" ||
    !path.isAbsolute(value.home) ||
    typeof value.header !== "string" ||
    !value.header.trim() ||
    value.header.length > 200 ||
    /[\u0000-\u001f]/.test(value.header) ||
    (value.resume !== undefined &&
      !/^[0-9a-f-]{36}$/.test(String(value.resume))) ||
    (value.keepSince !== undefined && Number.isNaN(Date.parse(value.keepSince)))
  )
    fail("A request's lane must be {home, header, resume?, keepSince?}.");
  return {
    home: path.resolve(value.home),
    header: value.header,
    ...(value.resume ? { resume: value.resume } : {}),
    ...(value.keepSince ? { keepSince: value.keepSince } : {}),
  };
}

// When a lane's next task starts, delete the lane's session files older
// than its last task's start (simplify §D22.2). Only files under the lane's
// own home and the harness's session folder there, never another home.
export function pruneLaneSessions(home, sessions, keepSince) {
  const root = path.join(home, sessions),
    before = Date.parse(keepSince),
    removed = [];
  const walk = (folder, depth) => {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file, depth + 1);
      else if (entry.isFile() && fs.statSync(file).mtimeMs < before) {
        fs.rmSync(file, { force: true });
        removed.push(file);
      }
    }
  };
  if (Number.isFinite(before)) walk(root, 0);
  return removed;
}

// The epic context of a request (epic-context D6): {readable: [absolute],
// cleanup: [absolute], mcp: {alias: {command, env, plugin?}}}, or null.
// Reads are read-only roots for this session; `cleanup` folders are removed
// when it exits; each MCP alias is served by the broker.
export function contextSettings(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    fail("Request context must be an object.");
  const mcp = value.mcp ?? {};
  if (typeof mcp !== "object" || Array.isArray(mcp))
    fail("Request context.mcp must be an object.");
  const strings = (list) =>
    Array.isArray(list) && list.every((item) => typeof item === "string");
  for (const [alias, server] of Object.entries(mcp))
    if (
      !/^[a-z][a-z0-9-]{0,39}$/.test(alias) ||
      !strings(server?.command) ||
      !server.command.length ||
      !strings(server.env ?? [])
    )
      fail(`Request context.mcp.${alias} must be {command, env}.`);
  return {
    readable: absolutePaths(value.readable, "context.readable"),
    cleanup: absolutePaths(value.cleanup, "context.cleanup"),
    mcp,
  };
}

// Replace a session's epic context before it resumes (null drops it), so a
// resume runs with what the gate gave this time.
export function setChildContext(db, sessionId, context) {
  const row = childRecord(db, sessionId);
  if (!row) fail(`No supervisor session ${sessionId}.`, 404);
  const settings = JSON.parse(row.settings || "{}");
  settings.context = contextSettings(context);
  db.prepare("UPDATE children SET settings = ? WHERE session_id = ?").run(
    JSON.stringify(settings),
    sessionId,
  );
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
  const linked = linkedOnTheWay(worktree, RESULT_FILE);
  if (linked) return { problem: linked };
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
    value = JSON.parse(readNoFollow(file));
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

// Why a file under a task folder must not be read, or null (D6, VM5.3):
// a symbolic link at any level below the folder, or a real path outside it.
// Nothing of a link's target is read.
export function linkedOnTheWay(folder, relative) {
  let at = path.resolve(folder);
  for (const part of relative.split(/[\\/]+/).filter(Boolean)) {
    at = path.join(at, part);
    let stat;
    try {
      stat = fs.lstatSync(at);
    } catch {
      return null;
    }
    if (stat.isSymbolicLink())
      return `${path.relative(folder, at)} is a symbolic link, so Avoozl does not read it.`;
  }
  try {
    const real = fs.realpathSync.native(at),
      root = fs.realpathSync.native(folder);
    if (real !== root && !real.startsWith(root + path.sep))
      return `${relative} is outside the task folder, so Avoozl does not read it.`;
  } catch {}
  return null;
}

// Read a file without following a link at its last part, which a check
// before the read cannot rule out.
function readNoFollow(file) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    return fs.readFileSync(fd, "utf8");
  } finally {
    fs.closeSync(fd);
  }
}

// The one output file a child may write beside its result file, for an
// answer too large for it (NK3): a plain name, read from `.avoozl/output/`.
const OUTPUT_DIRECTORY = path.join(".avoozl", "output");
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
  const linked = linkedOnTheWay(worktree, path.join(OUTPUT_DIRECTORY, name));
  if (linked) return { problem: linked };
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
  const text = readNoFollow(file);
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
function processStartTime(pid) {
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
export const processIsSame = (pid, started) => sameProcess(pid, started);
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

// One machine server per machine (MS2, design D3). The operating system holds
// the lock for the life of the handle; the record only names the holder.
function acquireSupervisorLock(
  stateDirectory,
  {
    startTime = processStartTime,
    starter = "terminal",
    tickSeconds = null,
  } = {},
) {
  const paths = machineLockPaths(stateDirectory);
  const mine = {
    pid: process.pid,
    started: startTime(process.pid),
    at: stamp(),
    build: buildId(),
    starter,
    tickSeconds,
    stateDirectory: path.resolve(stateDirectory),
  };
  const taken = takeLock(paths, mine);
  if (!taken.held)
    fail(
      `A supervisor already runs on this machine: pid ${taken.holder?.pid ?? "unknown"}, started ${taken.holder?.at ?? "unknown"}.`,
      409,
    );
  return {
    holder: mine,
    holds: taken.holds,
    release: taken.close,
  };
}

// The supervisor that runs now, from its lock, or null.
export function runningSupervisor(stateDirectory) {
  return lockHolder(machineLockPaths(stateDirectory));
}

function update(db, sessionId, fields) {
  const keys = Object.keys(fields);
  db.prepare(
    `UPDATE children SET ${keys.map((k) => `${k} = ?`).join(", ")},
       updated_at = ? WHERE session_id = ?`,
  ).run(...keys.map((k) => fields[k]), stamp(), sessionId);
}

// Git's own user config under home, which a confined child still reads.
const GIT_USER_CONFIG = [".gitconfig", path.join(".config", "git")];

// Absolute paths a request names, or [].
function absolutePaths(value, label) {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !path.isAbsolute(item))
  )
    fail(`Request ${label} must be absolute paths.`);
  return value.map((item) => path.resolve(item));
}

// `env` without the named variables.
function withoutNames(env, names) {
  const kept = { ...env };
  for (const name of names) delete kept[name];
  return kept;
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
  // What started it, for `avoozl status` (MS3.6); and a call when a stop
  // request has closed it (MS3.3).
  starter = "terminal",
  onStop = () => {},
  // The standalone page's server child (SW9): restarted this long after it exits.
  serveRetryMs = 2000,
}) {
  if (
    tickIntervalMs !== null &&
    !(Number.isInteger(tickIntervalMs) && tickIntervalMs > 0)
  )
    fail("The tick interval must be a whole number of milliseconds.");
  const lock = acquireSupervisorLock(stateDirectory, {
    startTime,
    starter,
    tickSeconds: tickIntervalMs === null ? null : tickIntervalMs / 1000,
  });
  const paths = supervisorPaths(stateDirectory);
  const db = openSupervisorDatabase(stateDirectory);
  // Children this process spawned; others were found again after a restart.
  const own = new Map();
  // The epic context MCP broker: one socket per session that was given
  // servers, outside every sandbox. Its calls go to the session's folder
  // for its evidence.
  const broker = createBroker({
    onCall: (entry) => {
      const file = path.join(
        paths.children,
        entry.session,
        "context-calls.jsonl",
      );
      try {
        fs.appendFileSync(file, JSON.stringify(entry) + "\n", { mode: 0o600 });
      } catch {}
    },
    onViolation: ({ plugin, reason }) => {
      if (plugin)
        markPluginBroken(
          {
            settingsFile: path.join(
              path.resolve(configDirectory),
              "plugins.json",
            ),
          },
          plugin,
          reason,
        );
    },
  });
  // A finished session's epic context: its sockets and servers, and the
  // folders made for it (the skills copy).
  // One stdio MCP server per alias, each the relay: the file holds no
  // environment value, only where to connect (EC7.2).
  const openContextMcp = (session, mcp, folder) => {
    const { socket, token } = broker.open({ session, servers: mcp }),
      file = path.join(folder, "context-mcp.json");
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          mcpServers: Object.fromEntries(
            Object.keys(mcp).map((alias) => [
              alias,
              {
                command: process.execPath,
                args: [
                  CONTEXT_RELAY,
                  "--socket",
                  socket,
                  "--token",
                  token,
                  "--alias",
                  alias,
                ],
              },
            ]),
          ),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    return { file, socket };
  };
  const endContext = (row) => {
    broker.close(row.session_id);
    try {
      for (const folder of JSON.parse(row.settings || "{}").context?.cleanup ??
        [])
        fs.rmSync(folder, { recursive: true, force: true });
    } catch {}
  };
  let timer = null;
  let closed = false;
  let ticking = null;
  let nextTick = 0;
  // Manual tick requests waiting for the pass that serves them (MS1.5).
  let asked = [];

  // The tick runs as its own process, so a slow or failing tick never
  // stalls the children's records. It keeps the supervisor's environment,
  // which reads GitHub; only agent children are confined.
  const tick = () => {
    if (ticking || Date.now() < nextTick) return;
    const out = fs.openSync(paths.tickLog, "a", 0o600);
    const from = fs.fstatSync(out).size;
    const serving = asked;
    asked = [];
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
      nextTick = asked.length ? 0 : Date.now() + tickIntervalMs;
      // One JSON line per workspace; they are the pass's result.
      let lines = [];
      try {
        lines = fs
          .readFileSync(paths.tickLog, "utf8")
          .slice(from)
          .split("\n")
          .filter((line) => line.startsWith("{"));
      } catch {}
      if (!closed) {
        recordPasses(db, lines);
        setRequest(db, serving, "done", lines.join("\n"));
      }
    };
    ticking.once("exit", ended);
    ticking.once("error", ended);
  };

  // The standalone page's server (SW9), when the machine file has
  // `serve.enabled`. It ends with the supervisor, which restarts it on the same
  // fixed port. This process itself never listens.
  let serveChild = null,
    serveRetryAt = 0,
    serveRead = 0,
    serveConfig = { enabled: false, port: 0 };
  const hostServe = () => {
    const now = Date.now();
    if (now >= serveRead) {
      serveConfig = readServeConfig(configDirectory);
      serveRead = now + SERVE_SCAN_MS;
    }
    const alive =
      Boolean(serveChild) &&
      serveChild.exitCode === null &&
      serveChild.signalCode === null;
    if (
      alive &&
      (!serveConfig.enabled || serveChild.wantedPort !== serveConfig.port)
    ) {
      serveChild.kill("SIGTERM");
      return;
    }
    if (!serveConfig.enabled || alive || now < serveRetryAt) return;
    const out = fs.openSync(paths.serveLog, "a", 0o600);
    let child;
    try {
      child = spawn(
        process.execPath,
        [
          SERVE_MAIN,
          "--state-directory",
          path.resolve(stateDirectory),
          "--config-directory",
          path.resolve(configDirectory),
          "--port",
          String(serveConfig.port),
        ],
        { stdio: ["ignore", out, out], env, windowsHide: true },
      );
    } finally {
      fs.closeSync(out);
    }
    serveChild = child;
    child.wantedPort = serveConfig.port;
    const ended = () => {
      serveRetryAt = Date.now() + serveRetryMs;
    };
    child.once("exit", ended);
    child.once("error", ended);
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
      // A read-only child that cannot write its result never starts (NK6.1).
      if (row.permission_class === "read" && readRoleProblem(definition))
        fail(readRoleProblem(definition), 409);
      fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
      // Each run writes its own result; one from an earlier run never counts.
      fs.mkdirSync(path.join(row.worktree, ".avoozl"), { recursive: true });
      fs.rmSync(path.join(row.worktree, RESULT_FILE), { force: true });
      fs.rmSync(path.join(row.worktree, OUTPUT_DIRECTORY), {
        recursive: true,
        force: true,
      });
      const settings = JSON.parse(row.settings || "{}"),
        lane = settings.lane ?? null;
      const briefFile = path.join(folder, "brief.md");
      // A harness that names no session gets the lane's header as the
      // prompt's first line (simplify §D22).
      fs.writeFileSync(
        briefFile,
        lane && !definition.label
          ? `${lane.header}\n\n${row.brief}`
          : row.brief,
        { mode: 0o600 },
      );
      let messageFile = null;
      if (message) {
        messageFile = path.join(folder, `message-${message.id}.md`);
        fs.writeFileSync(messageFile, message.text, { mode: 0o600 });
      }
      const values = JSON.parse(row.placeholder_values);
      // Epic context (epic-context D6): read-only folders, and MCP servers
      // through the relay when the harness loads a config file for them.
      const context = settings.context ?? null;
      const contextMcp =
        // shortcut: the relay's Unix socket is POSIX only; Windows has no
        // sandbox to keep a server's sign-in from the worker either.
        process.platform !== "win32" &&
        context &&
        Object.keys(context.mcp).length &&
        definition.context?.mcp
          ? openContextMcp(row.session_id, context.mcp, folder)
          : null;
      if (!contextMcp) broker.close(row.session_id);
      const filled = {
        ...values,
        worktree: row.worktree,
        brief_file: briefFile,
        model: row.model,
        session: row.session_id,
        session_uuid: harnessSession(row),
        permission: definition.permission[row.permission_class],
        ...(lane ? { lane_header: lane.header } : {}),
        // A review round's resume reads the new brief as its message.
        ...(messageFile
          ? { message_file: messageFile }
          : lane?.resume
            ? { message_file: briefFile }
            : {}),
        ...(contextMcp ? { context_mcp: contextMcp.file } : {}),
      };
      // start or resume, then the model when one is named, then the
      // repository's allow-list, checked again here (R94.4c).
      // A review round continues its task's session in the lane.
      const argv = [
        ...fillHarnessArgv(
          message || lane?.resume ? definition.resume : definition.start,
          filled,
        ),
        ...(lane && definition.label
          ? fillHarnessArgv(definition.label, filled)
          : []),
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
        ...(contextMcp ? fillHarnessArgv(definition.context.mcp, filled) : []),
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
        cacheDirs: values.repository_cache_dirs ?? [],
        gitCommonDir: gitCommonDir(row.worktree),
        configDirectory,
      });
      if (values.tmp)
        fs.mkdirSync(values.tmp, { recursive: true, mode: 0o700 });
      if (lane && definition.home) {
        fs.mkdirSync(lane.home, { recursive: true, mode: 0o700 });
        if (definition.sessions && lane.keepSince && !lane.resume)
          pruneLaneSessions(lane.home, definition.sessions, lane.keepSince);
      }
      const confined = confineChild(argv, {
        definition,
        configDirectory,
        // A lane's home holds its harness's sessions (simplify §D22.2).
        writeRoots: [
          ...access.writeRoots,
          ...(lane && definition.home ? [lane.home] : []),
        ],
        secrets: sandboxSecretPaths({
          home: env.HOME || os.homedir(),
          env,
          configDirectory,
          stateDirectory,
          workspaceRoots: catalogWorkspaceRoots(
            path.join(path.resolve(stateDirectory), "catalog.sqlite"),
          ),
        }),
        readable: [promptFile, ...(contextMcp ? [contextMcp.file] : [])],
        writable: [log],
        // Home is confined to the session's own folders, the harness's
        // config, git's user config and what the repository lists.
        home: env.HOME || os.homedir(),
        readRoots: [
          row.worktree,
          ...(lane && definition.home ? [lane.home] : []),
          ...(values.tmp ? [values.tmp] : []),
          ...(values.repository_cache_dirs ?? []),
          ...(gitCommonDir(row.worktree) ? [gitCommonDir(row.worktree)] : []),
          ...harnessReads(definition, env.HOME || os.homedir()),
          ...GIT_USER_CONFIG.map((file) =>
            path.join(env.HOME || os.homedir(), file),
          ),
          ...(settings.readable ?? []),
          ...(context?.readable ?? []),
          // The relay and the node that runs it, and the config naming it.
          ...(contextMcp ? [CONTEXT_RELAY, process.execPath] : []),
        ],
        sockets: contextMcp ? [contextMcp.socket] : [],
        network: sandboxNetwork(
          !settings.network || settings.network === "off"
            ? undefined
            : settings.network,
        ),
        keepEnv: definition.keepEnv ?? [],
        // Avoozl pushes; an agent gets no push credentials (R102.4). The
        // sandbox then sets git's own empty credential helper.
        // The child marker makes the CLI refuse person-only commands, even
        // on the command line (R95.5).
        // A name a context server's mapping reads never reaches the worker.
        env: withoutNames(
          withoutPushCredentials({
            // Model access the server's own environment lacks comes from
            // machine.env, for the definition's keepEnv names only (MS5.2).
            ...withKeptValues(
              env,
              definition.keepEnv ?? [],
              readMachineEnv(configDirectory),
            ),
            ...(values.tmp
              ? Object.fromEntries(
                  ["TMPDIR", ...(definition.tmpEnv ?? [])].map((name) => [
                    name,
                    values.tmp,
                  ]),
                )
              : {}),
            ...(lane && definition.home
              ? { [definition.home]: lane.home }
              : {}),
            AVOOZL_CHILD: "1",
            AVOOZL_CHILD_SESSION: row.session_id,
          }),
          Object.values(context?.mcp ?? {}).flatMap((server) => server.env),
        ),
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
      endContext(row);
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
      endContext(row);
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
    endContext(row);
    update(db, row.session_id, {
      state: "gone",
      error: "The supervisor cannot find this child.",
    });
  };

  const pass = () => {
    if (closed) return;
    if (!lock.holds()) return close();
    const stops = pendingRequests(db, "stop");
    if (stops.length) {
      setRequest(db, stops, "done", "stopped");
      close();
      return onStop();
    }
    const wanted = pendingRequests(db, "tick");
    if (wanted.length && tickIntervalMs) {
      setRequest(db, wanted, "running");
      asked.push(...wanted);
      nextTick = 0;
    }
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
    hostServe();
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
    broker.closeAll();
    serveChild?.kill("SIGTERM");
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
    // The standalone page's server child, or null: its pid.
    serve: () =>
      serveChild &&
      serveChild.exitCode === null &&
      serveChild.signalCode === null
        ? { pid: serveChild.pid }
        : null,
  };
}

// Start a detached supervisor unless one runs (R95.3, used by the app
// backend). Returns the running or new supervisor's pid.
export function launchSupervisor({
  stateDirectory,
  configDirectory,
  starter = "terminal",
  env = process.env,
  startTime,
}) {
  const running = runningSupervisor(stateDirectory);
  if (running) return { pid: running.pid, started: false };
  const { root, log } = supervisorPaths(stateDirectory);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const args = [
    SUPERVISOR_MAIN,
    "--state-directory",
    path.resolve(stateDirectory),
    "--config-directory",
    path.resolve(configDirectory),
    "--starter",
    starter,
  ];
  if (process.platform === "win32")
    return launchWindows([...args, "--log", log], env);
  const out = fs.openSync(log, "a", 0o600);
  let child;
  try {
    child = spawn(process.execPath, args, {
      detached: true,
      stdio: ["ignore", out, out],
      env,
      windowsHide: true,
    });
  } finally {
    fs.closeSync(out);
  }
  child.on("error", () => {});
  child.unref();
  return { pid: child.pid, started: true };
}

// On Windows a child process inherits every inheritable handle of its
// parent, so a server started directly would hold the starter's stdout open
// and its caller would wait on it forever. Start-Process starts it through
// the shell, which passes no handle; the server writes its own log (--log).
function launchWindows(args, env) {
  const quote = (value) => `"${value.replaceAll('"', '\\"')}"`;
  const literal = (value) => `'${value.replaceAll("'", "''")}'`;
  const command = [
    "Start-Process -WindowStyle Hidden -PassThru",
    `-FilePath ${literal(process.execPath)}`,
    `-ArgumentList ${literal(args.map(quote).join(" "))}`,
    "| ForEach-Object { $_.Id }",
  ].join(" ");
  const started = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { env, encoding: "utf8", windowsHide: true, timeout: 60_000 },
  );
  return { pid: Number(started.stdout?.trim()) || null, started: true };
}

// Run as this process's job until a signal or a stop request, with the
// machine's folders by default (MS1.1, MS3.2). The tick is always on, every
// `machine.tickSeconds`. Without `foreground` a second server sets exit code 1
// and names the first; with it, this process waits for the lock and takes it
// when the holder ends (MS2.2).
export async function runSupervisor({
  stateDirectory,
  configDirectory,
  starter = "terminal",
  foreground = false,
} = {}) {
  const machine = machineAvoozlPaths();
  stateDirectory ??= machine.stateDirectory;
  configDirectory ??= machine.configDirectory;
  let supervisor = null;
  let said = false;
  let stopped = () => {};
  while (!supervisor) {
    try {
      supervisor = startSupervisor({
        stateDirectory,
        configDirectory,
        starter,
        tickIntervalMs: readTickSeconds(configDirectory) * 1000,
        onStop: () => {
          stopped();
          process.exit(0);
        },
      });
    } catch (error) {
      if (!foreground || error.status !== 409) {
        console.error(error.message);
        process.exitCode = 1;
        return null;
      }
      if (!said) console.error(`${error.message} Waiting for it to end.`);
      said = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  // The control interface for `avoozl mcp` (MS9). Loaded here, so the
  // supervisor module itself pulls in no MCP code.
  let control = null;
  try {
    const { serveControl } = await import("./machine-control.mjs");
    control = await serveControl({ stateDirectory });
  } catch (error) {
    console.error(`The control interface did not start: ${error.message}`);
  }
  stopped = () => control?.close();
  console.log(`Avoozl machine server running as pid ${process.pid}.`);
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"])
    process.on(signal, () => {
      control?.close();
      supervisor.close();
      process.exit(0);
    });
  return supervisor;
}
