// One workspace's own state, for `avoozl status` when a workspace is named
// with --workspace or AVOOZL_WORKSPACE: what it is, where it is, whether this
// machine's catalog lists it, and what its database holds. Read-only, like
// machine-status.mjs: it creates no folder or database and changes no file,
// so asking about a path that holds nothing leaves it holding nothing.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const real = (target) => {
  try {
    return fs.realpathSync.native(target);
  } catch {
    return null;
  }
};

function savedIdentity(filename) {
  try {
    const saved = JSON.parse(fs.readFileSync(filename, "utf8"));
    return {
      workspaceId:
        typeof saved.workspaceId === "string" ? saved.workspaceId : null,
      namespace: typeof saved.namespace === "string" ? saved.namespace : null,
    };
  } catch {
    return { workspaceId: null, namespace: null };
  }
}

// The stored snapshot's revision and what the database holds, counted in
// SQLite. A table an older database lacks counts as empty.
function contents(database) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const rows = (sql) => {
      try {
        return db.prepare(sql).all();
      } catch {
        return [];
      }
    };
    const snapshot = rows("SELECT value FROM meta WHERE key = 'snapshot'")[0];
    if (!snapshot) return null;
    const { revision = null, updatedAt = null } = JSON.parse(snapshot.value);
    const byStatus = {};
    for (const { body } of rows(
      "SELECT body FROM entities WHERE kind = 'task'",
    )) {
      const status = JSON.parse(body).status ?? "unknown";
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }
    const count = (sql) => rows(sql)[0]?.n ?? 0;
    const meta = (key) => {
      const row = rows(`SELECT value FROM meta WHERE key = '${key}'`)[0];
      return row ? JSON.parse(row.value) : null;
    };
    // Notifications sent nowhere yet (NK7.6), as notifications.mjs counts.
    const waiting = rows("SELECT body FROM app_notifications")
      .map(({ body }) => JSON.parse(body))
      .filter((row) => !row.sentAt && !Object.keys(row.sentTo ?? {}).length)
      .map((row) => row.queuedAt)
      .filter(Boolean)
      .sort();
    const seenAt = meta("kirocrew.seenAt");
    return {
      revision,
      updatedAt,
      // Kiro Crew is reachable when its executor cron took a request in
      // the last ten minutes (needs-kirocrew.mjs), and what waits on it.
      kirocrew: {
        reachable:
          typeof seenAt === "string" &&
          Date.now() - Date.parse(seenAt) < 600_000,
        seenAt: typeof seenAt === "string" ? seenAt : null,
        waiting: Object.values(meta("needs-kirocrew.items") ?? {}).map(
          (item) => ({
            role: item.role,
            since: item.since,
            sessions: item.requests.length,
          }),
        ),
      },
      notifications: {
        waiting: waiting.length,
        oldestAt: waiting[0] ?? null,
        oldestAgeSeconds: waiting.length
          ? Math.max(
              0,
              Math.round((Date.now() - Date.parse(waiting[0])) / 1000),
            )
          : null,
      },
      counts: {
        tasks: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
        tasksByStatus: byStatus,
        documents: count(
          "SELECT COUNT(*) AS n FROM entities WHERE kind = 'document'",
        ),
        plans: count("SELECT COUNT(*) AS n FROM plans"),
        runsByState: Object.fromEntries(
          rows(
            "SELECT state, COUNT(*) AS n FROM runs GROUP BY state ORDER BY state",
          ).map((row) => [row.state, row.n]),
        ),
      },
    };
  } finally {
    db.close();
  }
}

// `named` is what the person wrote and `from` where (--workspace or the
// environment variable). `config` is that workspace's resolved configuration.
// `catalog` is the machine view `avoozl status` prints beside this: its
// `workspaces` and `defaultWorkspace` say whether the workspace is registered.
export function workspaceStatus({ named, from, config, catalog }) {
  const root = config.workspaceRoot,
    realRoot = real(root),
    configFile = [config.filename, config.legacyFilename].find(
      (filename) => filename && fs.existsSync(filename),
    ),
    registration = (catalog.workspaces || []).find(
      (workspace) =>
        workspace.id === named ||
        (realRoot !== null && real(workspace.root) === realRoot),
    );
  const status = {
    named,
    from,
    root,
    name: configFile ? config.name : null,
    ...savedIdentity(config.filename),
    configFile: configFile ?? null,
    database: config.dbPath,
    documentsRoot: config.plansRoot,
    registered: Boolean(registration),
    ...(registration
      ? {
          registration: {
            id: registration.id,
            default: catalog.defaultWorkspace === registration.id,
            enabled: registration.enabled,
            state: registration.state,
          },
        }
      : {}),
    initialized: false,
  };
  if (!fs.existsSync(config.dbPath))
    return {
      ...status,
      health: configFile
        ? `This workspace is configured but has no database at ${config.dbPath}. avoozl init ${root} creates an empty one under the same configuration.`
        : `No workspace at ${root}. Create one with avoozl init ${root}.`,
    };
  let held;
  try {
    held = contents(config.dbPath);
  } catch (error) {
    return {
      ...status,
      health: `The database at ${config.dbPath} could not be read: ${error.message}`,
    };
  }
  if (!held)
    return {
      ...status,
      health: `The database at ${config.dbPath} holds no workspace yet.`,
    };
  return { ...status, initialized: true, health: "ok", ...held };
}
