import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  WorkspaceProposalRecord,
  WorkspaceProvisionProposal,
} from "../workspace/workspace-proposal.ts";

const stamp = () => new Date().toISOString();

// One workspace as the machine catalog lists it.
export interface CatalogWorkspace {
  id: string;
  root: string;
  name: string;
  enabled: boolean;
  state: string;
  displayOrder: number;
  instanceEpoch: string | null;
  revision: number | null;
  health: unknown;
  aggregate: unknown;
  observedAt: string | null;
  updatedAt: string;
}
interface WorkspaceRow {
  id: string;
  root: string;
  name: string;
  enabled: number;
  state: string;
  display_order: number;
  instance_epoch: string | null;
  revision: number | null;
  health_json: string | null;
  aggregate_json: string | null;
  observed_at: string | null;
  updated_at: string;
}
// The workspaces a machine configuration names, by ID.
interface CatalogConfig {
  workspaces?: Record<
    string,
    { root: string; name?: string; enabled?: boolean }
  >;
  defaultWorkspace?: string | null;
}
interface WorkspaceProposalRow {
  id: string;
  status: WorkspaceProposalRecord["status"];
  body: string;
  submitted_at: string;
  updated_at: string;
  resolved_at: string | null;
}

function assertLocalStatePath(filename: string) {
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

function parsed(value: unknown, fallback: unknown = null): unknown {
  if (value == null) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export class CatalogStore {
  filename: string;
  db: DatabaseSync;
  constructor(filename: string) {
    this.filename = assertLocalStatePath(filename);
    fs.mkdirSync(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(this.filename);
    fs.chmodSync(this.filename, 0o600);
    this.db.exec(`PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      PRAGMA journal_mode=WAL;
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
      );
      CREATE TABLE IF NOT EXISTS workspace_proposals(
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        body TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );`);
  }

  transaction<T>(fn: () => T): T {
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

  setMeta(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }

  getMeta(key: string) {
    const row = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key);
    return row ? parsed(row.value) : null;
  }

  record(
    workspaceId: string | null,
    kind: string,
    body: Record<string, unknown> = {},
  ) {
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

  receipt(
    workspaceId: string,
    action: string,
    body: Record<string, unknown> = {},
  ) {
    const at = stamp();
    const id = `${workspaceId}:${action}:${at}:${randomUUID()}`;
    this.db
      .prepare(
        "INSERT INTO registration_receipts(id,workspace_id,action,at,body) VALUES (?,?,?,?,?)",
      )
      .run(id, workspaceId, action, at, JSON.stringify(body));
    return { id, workspaceId, action, at, ...body };
  }

  workspaceProposals(): WorkspaceProposalRecord[] {
    return (
      this.db
        .prepare("SELECT * FROM workspace_proposals ORDER BY submitted_at,id")
        .all() as unknown as WorkspaceProposalRow[]
    ).map((row) => ({
      id: row.id,
      status: row.status,
      proposal: parsed(row.body) as WorkspaceProvisionProposal,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
    }));
  }

  workspaceProposal(id: string) {
    return (
      this.workspaceProposals().find((proposal) => proposal.id === id) || null
    );
  }

  submitWorkspaceProposal(proposal: WorkspaceProvisionProposal) {
    const at = stamp(),
      current = this.workspaceProposal(proposal.proposalId);
    if (current && current.status !== "pending")
      throw Error(
        `Workspace proposal ${proposal.proposalId} is already resolved.`,
      );
    return this.transaction(() => {
      const saved = this.db
        .prepare(
          `INSERT INTO workspace_proposals(
            id,status,body,submitted_at,updated_at,resolved_at
          ) VALUES (?,?,?,?,?,NULL)
          ON CONFLICT(id) DO UPDATE SET
            body=excluded.body,
            updated_at=excluded.updated_at
          WHERE workspace_proposals.status='pending'`,
        )
        .run(
          proposal.proposalId,
          "pending",
          JSON.stringify(proposal),
          current?.submittedAt || at,
          at,
        );
      if (!saved.changes)
        throw Error(
          `Workspace proposal ${proposal.proposalId} is already resolved.`,
        );
      this.record(
        null,
        current ? "workspace.proposal.updated" : "workspace.proposal.submitted",
        {
          proposalId: proposal.proposalId,
          workspaceId: proposal.workspace.id,
          requestedBy: proposal.requestedBy,
        },
      );
      return this.workspaceProposal(proposal.proposalId);
    });
  }

  resolveWorkspaceProposal(
    id: string,
    status: "applied" | "dismissed",
    detail: Record<string, unknown> = {},
  ) {
    const at = stamp();
    return this.transaction(() => {
      const changed = this.db
        .prepare(
          `UPDATE workspace_proposals
           SET status=?,updated_at=?,resolved_at=?
           WHERE id=? AND status='pending'`,
        )
        .run(status, at, at, id);
      if (!changed.changes)
        throw Error(`Pending workspace proposal ${id} was not found.`);
      this.record(null, `workspace.proposal.${status}`, {
        proposalId: id,
        ...detail,
      });
      return this.workspaceProposal(id);
    });
  }

  sync(
    config: CatalogConfig,
    {
      reason = "configuration-sync",
      audit = false,
    }: { reason?: string; audit?: boolean } = {},
  ) {
    const entries = Object.entries(config.workspaces || {});
    return this.transaction(() => {
      const seen = new Set<string>();
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
          // shortcut: max_concurrent_runs is kept, NOT NULL and unread, so an
          // older Avoozl sharing this catalog still writes; drop it in a
          // later migration once no older version runs here.
          0,
          null,
          null,
          null,
          null,
          null,
          stamp(),
        );
      });
      for (const row of this.db.prepare("SELECT id FROM workspaces").all())
        if (!seen.has(String(row.id)))
          this.db
            .prepare("DELETE FROM workspaces WHERE id=?")
            .run(String(row.id));
      this.setMeta("defaultWorkspace", config.defaultWorkspace || null);
      this.setMeta("lastRebuiltAt", stamp());
      if (audit)
        this.record(null, "catalog.rebuilt", {
          reason,
          workspaces: entries.length,
        });
      return this.list();
    });
  }

  rebuild(config: CatalogConfig) {
    return this.sync(config, { reason: "explicit-rebuild", audit: true });
  }

  list(): CatalogWorkspace[] {
    return (
      this.db
        .prepare("SELECT * FROM workspaces ORDER BY display_order,id")
        .all() as unknown as WorkspaceRow[]
    ).map((row) => ({
      id: row.id,
      root: row.root,
      name: row.name,
      enabled: Boolean(row.enabled),
      state: row.state,
      displayOrder: row.display_order,
      instanceEpoch: row.instance_epoch,
      revision: row.revision,
      health: parsed(row.health_json),
      aggregate: parsed(row.aggregate_json, {}),
      observedAt: row.observed_at,
      updatedAt: row.updated_at,
    }));
  }

  get(id: string) {
    return this.list().find((workspace) => workspace.id === id) || null;
  }

  setState(id: string, state: string, body: Record<string, unknown> = {}) {
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
    id: string,
    {
      state = "ready",
      instanceEpoch = null,
      revision = null,
      health = null,
      aggregate = {},
    }: {
      state?: string;
      instanceEpoch?: string | null;
      revision?: number | null;
      health?: unknown;
      aggregate?: unknown;
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
      .map((row) => String(row.quick_check));
  }
}
