// What this machine's supervisor owns, for a headless machine that has only
// the CLI (R98.5, design §4.28): `avoozl status` and `avoozl runner status
// --json`. Read-only: it never creates the supervisor directory, takes the
// lock or changes a child. No brief, token or log text, only ids and states.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  runningSupervisor,
  supervisorPaths,
} from "../executors/supervisor.mjs";

const COLUMNS = `session_id, role, task, harness, state, pid, exit_code,
  error, requested_at, updated_at`;

// Same words as childStatus (R93): working, exited <code> or gone.
const statusOf = (row) =>
  row.state === "requested" || row.state === "running"
    ? "working"
    : row.state === "exited"
      ? `exited ${row.exit_code}`
      : "gone";

// The standalone page's server, from the file it writes at start (serve.json):
// its origin and pid, when that process is alive.
export function serveStatus(stateDirectory) {
  try {
    const found = JSON.parse(
      fs.readFileSync(path.join(stateDirectory, "serve.json"), "utf8"),
    );
    process.kill(found.pid, 0);
    return { running: true, origin: found.origin, pid: found.pid };
  } catch (error) {
    // EPERM: the process exists, owned by another user.
    if (error?.code === "EPERM") return { running: true };
    return { running: false };
  }
}

export function machineStatus({ stateDirectory }) {
  const paths = supervisorPaths(stateDirectory),
    holder = runningSupervisor(stateDirectory);
  let children = [];
  if (fs.existsSync(paths.database)) {
    const db = new DatabaseSync(paths.database, { readOnly: true });
    try {
      db.exec("PRAGMA busy_timeout = 5000");
      children = db
        .prepare(`SELECT ${COLUMNS} FROM children ORDER BY requested_at`)
        .all()
        .map((row) => ({
          sessionId: row.session_id,
          role: row.role,
          task: row.task,
          harness: row.harness,
          state: row.state,
          status: statusOf(row),
          pid: row.pid ?? null,
          exitCode: row.exit_code ?? null,
          error: row.error ?? null,
          requestedAt: row.requested_at,
          updatedAt: row.updated_at,
        }));
    } finally {
      db.close();
    }
  }
  return {
    version: 1,
    at: new Date().toISOString(),
    supervisor: holder
      ? { running: true, pid: holder.pid }
      : { running: false },
    serve: serveStatus(stateDirectory),
    children,
  };
}
