import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const stamp = () => new Date().toISOString();

function assertLocalStatePath(filename) {
  const absolute = path.resolve(filename);
  for (const candidate of [path.dirname(absolute), absolute]) {
    if (!fs.existsSync(candidate)) continue;
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink())
      throw Error(`Avoozl host state cannot use a symlink: ${candidate}`);
    if (candidate === absolute && !stat.isFile())
      throw Error(`Avoozl catalog must be a regular file: ${candidate}`);
  }
  return absolute;
}

function parsed(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export class CatalogStore {
  constructor(filename) {
    this.filename = assertLocalStatePath(filename);
    fs.mkdirSync(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(this.filename);
    fs.chmodSync(this.filename, 0o600);
    this.db.exec(`PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspaces(
        id TEXT PRIMARY KEY,
        root TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        state TEXT NOT NULL,
        display_order INTEGER NOT NULL,
        max_concurrent_runs INTEGER NOT NULL,
        instance_epoch TEXT,
        revision INTEGER,
        health_json TEXT,
        aggregate_json TEXT,
        observed_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS catalog_events(
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT,
        kind TEXT NOT NULL,
        at TEXT NOT NULL,
        body TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS catalog_events_workspace
        ON catalog_events(workspace_id, seq);
      CREATE TABLE IF NOT EXISTS registration_receipts(
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        action TEXT NOT NULL,
        at TEXT NOT NULL,
        body TEXT NOT NULL
      );`);
  }

  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.db.close();
  }

  setMeta(key, value) {
    this.db
      .prepare(
        "INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }

  getMeta(key) {
    const row = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key);
    return row ? parsed(row.value) : null;
  }

  record(workspaceId, kind, body = {}) {
    const at = stamp();
    const result = this.db
      .prepare(
        "INSERT INTO catalog_events(workspace_id,kind,at,body) VALUES (?,?,?,?)",
      )
      .run(workspaceId || null, kind, at, JSON.stringify(body));
    return {
      seq: Number(result.lastInsertRowid),
      workspaceId: workspaceId || null,
      kind,
      at,
      ...body,
    };
  }

  receipt(workspaceId, action, body = {}) {
    const at = stamp();
    const id = `${workspaceId}:${action}:${at}:${randomUUID()}`;
    this.db
      .prepare(
        "INSERT INTO registration_receipts(id,workspace_id,action,at,body) VALUES (?,?,?,?,?)",
      )
      .run(id, workspaceId, action, at, JSON.stringify(body));
    return { id, workspaceId, action, at, ...body };
  }

  sync(config, { reason = "configuration-sync", audit = false } = {}) {
    const entries = Object.entries(config.workspaces || {});
    return this.transaction(() => {
      const seen = new Set();
      const existingState = this.db.prepare(
        "SELECT state FROM workspaces WHERE id=?",
      );
      const upsert = this.db.prepare(`INSERT INTO workspaces(
          id,root,name,enabled,state,display_order,max_concurrent_runs,
          instance_epoch,revision,health_json,aggregate_json,observed_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          root=excluded.root,
          name=excluded.name,
          enabled=excluded.enabled,
          display_order=excluded.display_order,
          max_concurrent_runs=excluded.max_concurrent_runs,
          updated_at=excluded.updated_at`);
      entries.forEach(([id, workspace], index) => {
        seen.add(id);
        const currentState = existingState.get(id)?.state;
        const state = workspace.enabled
          ? currentState === "stopped"
            ? "closed"
            : currentState || "closed"
          : "stopped";
        upsert.run(
          id,
          workspace.root,
          workspace.name || id,
          workspace.enabled ? 1 : 0,
          state,
          index,
          workspace.maxConcurrentRuns,
          null,
          null,
          null,
          null,
          null,
          stamp(),
        );
      });
      for (const row of this.db.prepare("SELECT id FROM workspaces").all())
        if (!seen.has(row.id))
          this.db.prepare("DELETE FROM workspaces WHERE id=?").run(row.id);
      this.setMeta("defaultWorkspace", config.defaultWorkspace || null);
      this.setMeta("hostMaxConcurrentRuns", config.maxConcurrentRuns);
      this.setMeta("lastRebuiltAt", stamp());
      if (audit)
        this.record(null, "catalog.rebuilt", {
          reason,
          workspaces: entries.length,
        });
      return this.list();
    });
  }

  rebuild(config) {
    return this.sync(config, { reason: "explicit-rebuild", audit: true });
  }

  list() {
    return this.db
      .prepare("SELECT * FROM workspaces ORDER BY display_order,id")
      .all()
      .map((row) => ({
        id: row.id,
        root: row.root,
        name: row.name,
        enabled: Boolean(row.enabled),
        state: row.state,
        displayOrder: row.display_order,
        maxConcurrentRuns: row.max_concurrent_runs,
        instanceEpoch: row.instance_epoch,
        revision: row.revision,
        health: parsed(row.health_json),
        aggregate: parsed(row.aggregate_json, {}),
        observedAt: row.observed_at,
        updatedAt: row.updated_at,
      }));
  }

  get(id) {
    return this.list().find((workspace) => workspace.id === id) || null;
  }

  setState(id, state, body = {}) {
    const allowed = new Set([
      "closed",
      "opening",
      "ready",
      "draining",
      "stopped",
      "degraded",
      "quarantined",
    ]);
    if (!allowed.has(state)) throw Error(`Unknown workspace state: ${state}`);
    return this.transaction(() => {
      const changed = this.db
        .prepare("UPDATE workspaces SET state=?,updated_at=? WHERE id=?")
        .run(state, stamp(), id);
      if (!changed.changes) throw Error(`Unknown workspace: ${id}`);
      this.record(id, `workspace.${state}`, body);
      return this.get(id);
    });
  }

  observe(
    id,
    {
      state = "ready",
      instanceEpoch = null,
      revision = null,
      health = null,
      aggregate = {},
    } = {},
  ) {
    return this.transaction(() => {
      const changed = this.db
        .prepare(
          `UPDATE workspaces SET
          state=?,instance_epoch=?,revision=?,health_json=?,aggregate_json=?,
          observed_at=?,updated_at=? WHERE id=?`,
        )
        .run(
          state,
          instanceEpoch,
          revision,
          JSON.stringify(health),
          JSON.stringify(aggregate),
          stamp(),
          stamp(),
          id,
        );
      if (!changed.changes) throw Error(`Unknown workspace: ${id}`);
      return this.get(id);
    });
  }

  integrityCheck() {
    return this.db
      .prepare("PRAGMA quick_check")
      .all()
      .map((row) => row.quick_check);
  }
}
