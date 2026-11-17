// What this machine's supervisor owns, for a headless machine that has only
// the CLI (R98.5, design §4.28): `avoozl status` and `avoozl runner status
// --json`. Read-only: it never creates the supervisor directory, takes the
// lock or changes a child. No brief, token or log text, only ids and states.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runningSupervisor, supervisorPaths } from "./supervisor.mjs";

const COLUMNS = `session_id, role, task, harness, state, pid, exit_code,
  error, requested_at, updated_at`;

// Same words as childStatus (R93): working, exited <code> or gone.
const statusOf = (row) =>
  row.state === "requested" || row.state === "running"
    ? "working"
    : row.state === "exited"
      ? `exited ${row.exit_code}`
      : "gone";

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
    children,
  };
}
