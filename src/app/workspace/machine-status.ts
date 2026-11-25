// This machine's process children and last tick passes, for a machine that
// has only the CLI (R98.5, design §4.28): `avoozl status` and `avoozl runner
// status --json`. Read-only: it never creates the supervisor directory, takes
// a lock or changes a child. No brief, token or log text, only ids and states.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { supervisorPaths } from "../executors/supervisor.ts";
import { listHarnessDefinitions } from "../executors/harness-definitions.ts";
import { machineAvoozlPaths } from "../settings/host-config.ts";
import { readServeConfig } from "../settings/serve-config.ts";
import { ROLES, resolveRoles } from "../agents/role-table.ts";
import { lastPasses } from "../executors/tick-passes.ts";
import { engineStatus } from "../tick/engine.ts";
import type { RolesConfig } from "../agents/role-table.ts";

type ChildRow = Record<string, unknown>;
type Harness = {
  name: string;
  approved?: boolean;
  startProblem?: string | null;
};

const COLUMNS = `session_id, role, task, harness, state, pid, exit_code,
  error, requested_at, updated_at`;

// Same words as childStatus (R93): working, exited <code> or gone.
const statusOf = (row: ChildRow) =>
  row.state === "requested" || row.state === "running"
    ? "working"
    : row.state === "exited"
      ? `exited ${row.exit_code}`
      : "gone";

// The command that prints a one-time sign-in link for the running page.
export const PAGE_LINK_COMMAND = "avoozl link";

// The standalone page's server, from the file it writes at start (serve.json):
// its origin and pid, when that process is alive, or why it could not start.
export function serveStatus(stateDirectory: string): {
  running: boolean;
  origin?: string;
  pid?: number;
  open?: string;
  problem?: string;
} {
  let found: { origin?: string; pid: number; error?: string };
  try {
    found = JSON.parse(
      fs.readFileSync(path.join(stateDirectory, "serve.json"), "utf8"),
    );
  } catch {
    return { running: false };
  }
  if (typeof found.error === "string")
    return { running: false, problem: found.error };
  try {
    process.kill(found.pid, 0);
  } catch (error) {
    // EPERM: the process exists, owned by another user.
    if ((error as NodeJS.ErrnoException)?.code === "EPERM")
      return { running: true };
    return { running: false };
  }
  return {
    running: true,
    origin: found.origin,
    pid: found.pid,
    open: PAGE_LINK_COMMAND,
  };
}

// The page for `avoozl status` and Settings: whether the machine file leaves
// it on, and serveStatus.
export const pageStatus = (
  stateDirectory: string,
  configDirectory: string,
) => ({
  enabled: readServeConfig(configDirectory).enabled,
  ...serveStatus(stateDirectory),
});

// Each role whose saved harness cannot start on this machine, and why (MS5.3).
export function roleProblems(config: RolesConfig, harnesses: Harness[]) {
  const table = resolveRoles(config);
  return ROLES.flatMap((role) => {
    const harness = harnesses.find((h) => h.name === table[role]?.harness);
    return harness?.startProblem
      ? [{ role, harness: harness.name, problem: harness.startProblem }]
      : [];
  });
}

export function machineStatus({
  stateDirectory,
  configDirectory = machineAvoozlPaths().configDirectory,
}: {
  stateDirectory: string;
  configDirectory?: string;
}) {
  const paths = supervisorPaths(stateDirectory);
  let children: Record<string, unknown>[] = [],
    passes: Record<string, unknown>[] = [];
  let unreadable: string | null = null;
  if (fs.existsSync(paths.database)) {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(paths.database, { readOnly: true });
      db.exec("PRAGMA busy_timeout = 5000");
      passes = lastPasses(db);
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
    } catch (error) {
      // A tick may be setting its database up; status still answers.
      unreadable = (error as Error).message;
    } finally {
      db?.close();
    }
  }
  return {
    version: 1,
    at: new Date().toISOString(),
    // Each workspace's last pass: whether a timer runs `avoozl tick`.
    passes,
    serve: pageStatus(stateDirectory, configDirectory),
    // The build the machine tick runs; commit null: the installed copy.
    engine: engineStatus(
      stateDirectory,
      path.join(configDirectory, "config.json"),
    ),
    harnesses: (listHarnessDefinitions(configDirectory) as Harness[]).map(
      ({ name, approved, startProblem }) => ({ name, approved, startProblem }),
    ),
    children,
    ...(unreadable ? { unreadable } : {}),
  };
}
