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
import { execFile, execFileSync, spawn } from "node:child_process";
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
import {
  BOX_EXEC,
  BOX_FORWARD,
  BOX_FRAMES,
  openContainedSession,
} from "./box-session.mjs";
import {
  preflightKey,
  runBoxPreflight,
  runtimeVersion,
} from "./box-preflight.mjs";
import { startEgressProxy } from "./egress-proxy.mjs";
import {
  isolationSetting,
  pickRuntime,
  pinnedImage,
  sweepBoxes,
} from "../workspace/check-isolation.mjs";
import { emptyHooksFolder, noHookConfig } from "../git/task-git.mjs";

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
  "box_exec",
  "box_settings",
];
const stamp = () => new Date().toISOString();
// How often the supervisor removes boxes whose session is not running.
const SWEEP_MS = 60_000;

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
    serveLog: path.join(root, "serve.log"),
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
  // The session's isolation (VM1.6): {kind, runtime?, image?, stranger?}.
  if (!columns.has("isolation"))
    db.exec("ALTER TABLE children ADD COLUMN isolation TEXT");
  // Each contained-session preflight (vm-harness D5): its steps, by key.
  db.exec(`
    CREATE TABLE IF NOT EXISTS box_preflights (
      key TEXT PRIMARY KEY,
      repository TEXT NOT NULL,
      runtime TEXT NOT NULL,
      harness TEXT NOT NULL,
      state TEXT NOT NULL,
      steps TEXT NOT NULL DEFAULT '[]',
      failed TEXT,
      at TEXT NOT NULL
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
  // The repository's allow-list and network (R94.4c, R95.6), checked here and
  // again at start, so a bad request fails where it was made.
  const settings = {
    allowCommands: sandboxAllowCommands(request.allowCommands, {
      source: "allowCommands",
    }),
    network: request.network ?? "off",
    readable: absolutePaths(request.readable, "readable"),
    ...(request.contained
      ? { contained: containedRequest(request.contained) }
      : {}),
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

// A contained session's settings, as a request names them (vm-harness
// D3): the repository, its isolation and caches, and the stranger reason.
function containedRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("A contained request must be an object.");
  const isolation = isolationSetting(
    value.isolation ?? {},
    "contained.isolation",
  );
  if (!isolation.image) fail("A contained session needs isolation.image.");
  return {
    repository: text(value.repository, "contained.repository"),
    isolation,
    caches: absolutePaths(value.caches, "contained.caches"),
    ...(value.stranger
      ? {
          stranger: {
            reason: text(value.stranger.reason, "a stranger reason"),
          },
        }
      : {}),
  };
}

// The latest preflight for a repository, or null (vm-harness D5).
export function boxPreflight(db, repository) {
  const row = db
    .prepare(
      "SELECT * FROM box_preflights WHERE repository = ? ORDER BY at DESC LIMIT 1",
    )
    .get(repository);
  return row
    ? {
        ...row,
        steps: JSON.parse(row.steps),
        failed: row.failed ? JSON.parse(row.failed) : null,
      }
    : null;
}

// **Run preflight again** (person only): the repository's failed preflights
// go, so its next contained session runs a new one.
export function forgetBoxPreflight(db, repository) {
  return db
    .prepare(
      "DELETE FROM box_preflights WHERE repository = ? AND state != 'passed'",
    )
    .run(repository).changes;
}

// The program paths a contained session's CLI tree may start on macOS
// (VM3.4): the harness's program, node, box exec, git and the definition's
// host programs. `env` gives the PATH a bare name is found on.
function containedPrograms(definition, env) {
  const found = (name) => {
    if (path.isAbsolute(name)) return [name];
    for (const folder of String(env.PATH ?? "").split(path.delimiter))
      if (folder && fs.existsSync(path.join(folder, name)))
        return [path.join(folder, name)];
    return [];
  };
  let gitCore = null;
  try {
    gitCore = execFileSync("git", ["--exec-path"], {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {}
  return {
    programs: [
      ...found(definition.start[0]),
      process.execPath,
      // box exec is a node script: its #! line runs env, then node.
      "/usr/bin/env",
      BOX_EXEC,
      ...found("git"),
      ...(gitCore
        ? [path.join(path.dirname(path.dirname(gitCore)), "bin", "git")]
        : []),
      ...(definition.box?.hostPrograms ?? []),
    ],
    programFolders: gitCore ? [gitCore] : [],
  };
}

// Whether a box routes the CLI's commands to box exec: some `box` value
// names {box_exec}. One that does not (Codex until vm-2.3 proves its
// routing, D11 question 3) runs no contained session.
const routesToBox = (box) =>
  Boolean(box) &&
  [...Object.values(box.env ?? {}), ...(box.args ?? [])].some((item) =>
    String(item).includes("{box_exec}"),
  );

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
function sameProcess(pid, started, startTime = processStartTime) {
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
function acquireSupervisorLock(
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

// The preflight's routing steps: the CLI once, as a contained session
// with a fixed prompt, read-only, allowed only the preflight's commands.
export const launchPreflight = (
  {
    session,
    definition,
    runtime,
    configDirectory,
    stateDirectory,
    env = process.env,
  },
  input,
) =>
  new Promise((resolve, reject) => {
    try {
      const values = { tmp: input.tmp };
      const opened = { ...input.opened, runtime, gitDirs: null };
      const filled = {
        box_exec: BOX_EXEC,
        box_settings: opened.folders.settings,
        worktree: input.worktree,
        tmp: input.tmp,
        session: session,
        session_uuid: randomUUID(),
        model: null,
        permission: definition.permission.read,
        brief_file: path.join(input.tmp, "brief.md"),
      };
      fs.writeFileSync(filled.brief_file, input.prompt, { mode: 0o600 });
      const argv = [
        ...fillHarnessArgv(definition.start, filled),
        ...harnessAllow(definition, input.allow),
        ...(definition.resultAllow
          ? fillHarnessArgv(definition.resultAllow, filled)
          : []),
        ...fillHarnessArgv(definition.box.args ?? [], filled),
      ];
      const box = containedChild(definition, filled, opened, {
        worktree: input.worktree,
      });
      const confined = confineChild(argv, {
        definition,
        configDirectory,
        writeRoots: [input.tmp, path.join(input.worktree, ".avoozl")],
        secrets: sandboxSecretPaths({
          home: env.HOME || os.homedir(),
          env,
          configDirectory,
          stateDirectory,
        }),
        readable: [filled.brief_file, ...box.readable],
        home: env.HOME || os.homedir(),
        readRoots: [
          input.worktree,
          input.tmp,
          ...harnessReads(definition, env.HOME || os.homedir()),
        ],
        network: box.network,
        contained: box.contained,
        keepEnv: definition.keepEnv ?? [],
        env: withoutPushCredentials({
          ...env,
          TMPDIR: values.tmp,
          AVOOZL_CHILD: "1",
          AVOOZL_CHILD_SESSION: session,
          ...box.env,
        }),
      });
      const child = spawn(confined.argv[0], confined.argv.slice(1), {
        cwd: input.worktree,
        stdio: [
          definition.promptFrom === "stdin" ? "pipe" : "ignore",
          "ignore",
          "ignore",
        ],
        env: confined.env,
        windowsHide: true,
      });
      if (definition.promptFrom === "stdin") child.stdin.end(input.prompt);
      const timer = setTimeout(() => child.kill("SIGTERM"), 300_000);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve({ code });
      });
    } catch (error) {
      reject(error);
    }
  });

// What a contained session adds to its CLI's sandbox and environment
// (vm-harness D3): its box settings, the egress proxy as its only network,
// box exec's broker socket, its sign-in store, its programs, and git pinned
// to its task folder.
function containedChild(definition, filled, opened, row) {
  const box = definition.box,
    home = process.env.HOME || os.homedir(),
    linux = process.platform === "linux";
  // On Linux the CLI's proxy port lives in its own namespace, carried by
  // the forwarder to the proxy's socket; on macOS it is the proxy's port.
  const port = linux
    ? 20000 + Math.floor(Math.random() * 40000)
    : opened.proxy.port;
  const env = {
    ...Object.fromEntries(
      Object.entries(box.env ?? {}).map(([name, value]) => [
        name,
        fillHarnessArgv([value], filled)[0],
      ]),
    ),
    HTTPS_PROXY: `http://127.0.0.1:${port}`,
    https_proxy: `http://127.0.0.1:${port}`,
    NO_PROXY: "",
    AVOOZL_BOX_SOCKET: opened.folders.brokerSocket,
  };
  const { programs, programFolders } = containedPrograms(
    definition,
    process.env,
  );
  return {
    env,
    network: { mode: "restricted", ports: [port] },
    readable: [opened.folders.settings, BOX_EXEC, BOX_FRAMES, BOX_FORWARD],
    contained: {
      signIn: {
        ...(box.signIn?.darwin ? { darwin: box.signIn.darwin } : {}),
        ...(box.signIn?.linux
          ? {
              linux: box.signIn.linux.map((item) =>
                path.join(home, item.slice(2)),
              ),
            }
          : {}),
      },
      programs,
      programFolders,
      brokerSocket: opened.folders.brokerSocket,
      sockets: linux
        ? [opened.folders.brokerSocket, opened.folders.proxySocket]
        : [],
      forward: linux
        ? [
            process.execPath,
            BOX_FORWARD,
            String(port),
            opened.folders.proxySocket,
            "--",
          ]
        : [],
      ...(opened.gitDirs
        ? {
            git: {
              gitDir: opened.gitDirs.gitDir,
              workTree: row.worktree,
              hooks: emptyHooksFolder(),
            },
          }
        : {}),
    },
  };
}

// A task folder's own git directory and the shared one, read before the
// session starts, with no hook and no fsmonitor; null outside a repository.
function taskGitDirs(worktree) {
  try {
    const [gitDir, common] = execFileSync(
      "git",
      [
        ...noHookConfig(),
        "rev-parse",
        "--path-format=absolute",
        "--git-dir",
        "--git-common-dir",
      ],
      {
        cwd: worktree,
        encoding: "utf8",
        timeout: 15_000,
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
      .trim()
      .split("\n");
    return { gitDir, common };
  } catch {
    return null;
  }
}

const runAsync = (argv) =>
  new Promise((resolve) => {
    execFile(
      argv[0],
      argv.slice(1),
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 600_000 },
      (error, stdout, stderr) =>
        resolve({
          status: error ? (Number.isInteger(error.code) ? error.code : 1) : 0,
          stdout,
          stderr,
        }),
    );
  });

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
  // The standalone page's server child (SW9): restarted this long after it exits.
  serveRetryMs = 2000,
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

  // Contained sessions (vm-harness D3): their box, broker and proxy, by
  // session, while they open, run and close.
  const contained = new Map();
  let sweptAt = 0;

  const start = (row, message = null, opened = null) => {
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
      const briefFile = path.join(folder, "brief.md");
      fs.writeFileSync(briefFile, row.brief, { mode: 0o600 });
      let messageFile = null;
      if (message) {
        messageFile = path.join(folder, `message-${message.id}.md`);
        fs.writeFileSync(messageFile, message.text, { mode: 0o600 });
      }
      const values = JSON.parse(row.placeholder_values);
      const settings = JSON.parse(row.settings || "{}");
      if (settings.contained && !opened)
        fail("A contained session starts only once its box is open.", 409);
      const filled = {
        ...(opened
          ? {
              box_exec: BOX_EXEC,
              box_settings: opened.folders.settings,
            }
          : {}),
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
      // repository's allow-list, checked again here (R94.4c).
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
        // A contained session's routing and what it turns off (D3).
        ...(opened && definition.box?.args
          ? fillHarnessArgv(definition.box.args, filled)
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
        cacheDirs: values.repository_cache_dirs ?? [],
        gitCommonDir: gitCommonDir(row.worktree),
        configDirectory,
      });
      if (values.tmp)
        fs.mkdirSync(values.tmp, { recursive: true, mode: 0o700 });
      const box = opened
        ? containedChild(definition, filled, opened, row)
        : null;
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
        readable: [promptFile, ...(box?.readable ?? [])],
        writable: [log],
        // Home is confined to the session's own folders, the harness's
        // config, git's user config and what the repository lists.
        home: env.HOME || os.homedir(),
        readRoots: [
          row.worktree,
          ...(values.tmp ? [values.tmp] : []),
          ...(values.repository_cache_dirs ?? []),
          ...(gitCommonDir(row.worktree) ? [gitCommonDir(row.worktree)] : []),
          ...harnessReads(definition, env.HOME || os.homedir()),
          ...GIT_USER_CONFIG.map((file) =>
            path.join(env.HOME || os.homedir(), file),
          ),
          ...(settings.readable ?? []),
        ],
        network: box
          ? box.network
          : sandboxNetwork(
              !settings.network || settings.network === "off"
                ? undefined
                : settings.network,
            ),
        ...(box ? { contained: box.contained } : {}),
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
          ...(box?.env ?? {}),
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
          isolation: JSON.stringify(
            opened
              ? {
                  kind: "container",
                  runtime: opened.runtime,
                  image: opened.image,
                  ...(settings.contained?.stranger
                    ? { stranger: settings.contained.stranger.reason }
                    : {}),
                }
              : { kind: confined.sandbox ? "sandbox" : "unconfined" },
          ),
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
      // A contained session's box goes first, so nothing in it can change
      // the folder once Avoozl reads it (VM2.1).
      const open = contained.get(row.session_id);
      if (open) {
        if (open.state === "running") {
          open.state = "closing";
          open.opened.close().finally(() => contained.delete(row.session_id));
        }
        return;
      }
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
      startOrOpen(row);
    // A message for a session whose run has exited resumes it.
    for (const row of db
      .prepare(
        `SELECT c.* FROM children c WHERE c.state = 'exited' AND c.runs > 0
           AND EXISTS (SELECT 1 FROM messages m
             WHERE m.session_id = c.session_id AND m.state = 'queued')`,
      )
      .all())
      startOrOpen(row, queuedMessage(db, row.session_id));
    sweep();
    if (tickIntervalMs) tick();
    hostServe();
  };

  // A row with no box starts now. A contained one opens its box, broker and
  // proxy first, after its preflight (D5), and starts on a later pass; one
  // that cannot open is refused as `exited -1` with the reason.
  const startOrOpen = (row, message = null) => {
    const settings = JSON.parse(row.settings || "{}");
    if (!settings.contained) return start(row, message);
    const open = contained.get(row.session_id);
    if (open?.state === "ready") {
      open.state = "running";
      return start(row, message, open.opened);
    }
    if (open) return;
    const entry = { state: "opening" };
    contained.set(row.session_id, entry);
    openContained(row, settings.contained).then(
      (opened) => {
        entry.opened = opened;
        entry.state = "ready";
      },
      (error) => {
        contained.delete(row.session_id);
        if (message)
          db.prepare("UPDATE messages SET state = 'refused' WHERE id = ?").run(
            message.id,
          );
        update(db, row.session_id, {
          state: "exited",
          exit_code: -1,
          error: error.message,
        });
      },
    );
  };

  // Open one contained session: its harness routes to the box, its runtime
  // works, the preflight for its key passed (run now when there is none),
  // then the box, broker and proxy start.
  const openContained = async (row, settings) => {
    const definition = loadHarnessDefinition({
      configDirectory,
      name: row.harness,
    });
    if (!definition.box)
      fail(
        `Harness ${definition.name} has no box key, so it cannot run a contained session.`,
        409,
      );
    if (!routesToBox(definition.box))
      fail(
        `Harness ${definition.name}'s box sends no command to box exec, so it cannot run a contained session.`,
        409,
      );
    const picked = pickRuntime({
      named: settings.isolation.runtime,
      purpose: "box",
    });
    if (picked.refused) fail(`The box cannot start: ${picked.refused}`, 409);
    const runtime = picked.runtime,
      pinned = await pinnedImage(runtime, settings.isolation.image, {
        run: (program, args) => runAsync([program, ...args]),
      });
    if (pinned.refused) fail(pinned.refused, 409);
    const key = preflightKey({
      repository: settings.repository,
      runtime,
      version: await runtimeVersion(runtime),
      digest: pinned.image,
      harnessHash: definition.hash,
    });
    let record = db
      .prepare("SELECT * FROM box_preflights WHERE key = ?")
      .get(key);
    if (!record) {
      const result = await runBoxPreflight(
        {
          runtime,
          image: pinned.image,
          hosts: definition.box.hosts ?? [],
          stateDirectory,
          tmpEnv: definition.tmpEnv ?? [],
        },
        {
          startProxy: startEgressProxy,
          launch: (input) =>
            launchPreflight(
              {
                session: row.session_id,
                definition,
                runtime,
                configDirectory,
                stateDirectory,
                env,
              },
              input,
            ),
        },
      );
      db.prepare(
        `INSERT OR REPLACE INTO box_preflights
           (key, repository, runtime, harness, state, steps, failed, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        key,
        settings.repository,
        runtime,
        definition.name,
        result.passed ? "passed" : "failed",
        JSON.stringify(result.steps),
        result.failed ? JSON.stringify(result.failed) : null,
        stamp(),
      );
      record = {
        state: result.passed ? "passed" : "failed",
        failed: JSON.stringify(result.failed ?? null),
      };
    }
    if (record.state !== "passed") {
      const failed = record.failed ? JSON.parse(record.failed) : null;
      fail(
        `The contained-session preflight failed at "${failed?.name ?? "a step"}": ${failed?.output ?? ""}`,
        409,
      );
    }
    const values = JSON.parse(row.placeholder_values);
    const gitDirs = taskGitDirs(row.worktree);
    const opened = await openContainedSession(
      {
        runtime,
        session: row.session_id,
        image: pinned.image,
        worktree: row.worktree,
        gitDir: gitDirs?.common ?? null,
        tmp: values.tmp,
        caches: settings.caches ?? [],
        readable: settings.isolation.readable ?? [],
        writable: settings.stranger ? [] : (settings.isolation.writable ?? []),
        tmpEnv: definition.tmpEnv ?? [],
        hosts: definition.box.hosts ?? [],
        secrets: sandboxSecretPaths({
          home: env.HOME || os.homedir(),
          env,
          configDirectory,
          stateDirectory,
        }),
        stateDirectory,
      },
      { startProxy: startEgressProxy },
    );
    return { ...opened, runtime, gitDirs };
  };

  // Remove boxes whose session is not running here (VM2.8), now and then.
  const sweep = () => {
    if (Date.now() - sweptAt < SWEEP_MS) return;
    sweptAt = Date.now();
    const picked = pickRuntime({ purpose: "box" });
    if (!picked.runtime) return;
    const live = new Set([
      ...contained.keys(),
      ...db
        .prepare(
          "SELECT session_id FROM children WHERE state IN ('requested', 'running')",
        )
        .all()
        .map((r) => r.session_id),
    ]);
    try {
      sweepBoxes(picked.runtime, live);
    } catch {
      // A runtime that cannot list leaves its boxes for the next sweep.
    }
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
