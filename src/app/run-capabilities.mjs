import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { fail } from "./store.mjs";

const MODE_WRITES = Object.freeze({
  ask: new Set([
    "plans_visualize",
    "plans_present",
    "plans_activate_visualization",
    "plans_submit_review",
  ]),
  plan: new Set(["plans_propose_work"]),
  implement: new Set(["plans_activity", "plans_propose_work"]),
});

function hash(value) {
  return createHash("sha256").update(value).digest();
}

function record(row) {
  return row ? { ...JSON.parse(row.body), id: row.id } : null;
}

export function mintRunCapability(
  store,
  run,
  { lifetimeMs = 24 * 60 * 60 * 1000 } = {},
) {
  const token = "avoozl_run_" + randomBytes(32).toString("hex"),
    id = "cap-" + randomUUID(),
    now = new Date(),
    capability = {
      id,
      runId: run.id,
      taskId: run.taskId,
      mode: run.mode,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + lifetimeMs).toISOString(),
    };
  store.transaction(() => {
    store.db
      .prepare(
        "UPDATE run_capabilities SET revoked_at=? WHERE run_id=? AND revoked_at IS NULL",
      )
      .run(now.toISOString(), run.id);
    store.db
      .prepare(
        "INSERT INTO run_capabilities(id,run_id,token_hash,expires_at,revoked_at,body) VALUES (?,?,?,?,NULL,?)",
      )
      .run(
        id,
        run.id,
        hash(token),
        capability.expiresAt,
        JSON.stringify(capability),
      );
  });
  return { token, capability };
}

export function revokeRunCapabilities(store, runId) {
  store.db
    .prepare(
      "UPDATE run_capabilities SET revoked_at=? WHERE run_id=? AND revoked_at IS NULL",
    )
    .run(new Date().toISOString(), runId);
}

export function authorizeRunCapability(store, runId, token) {
  if (!runId || typeof token !== "string" || !token.startsWith("avoozl_run_"))
    fail("Run capability required.", 403);
  const candidate = hash(token),
    rows = store.db
      .prepare(
        "SELECT * FROM run_capabilities WHERE run_id=? AND revoked_at IS NULL ORDER BY rowid DESC",
      )
      .all(runId);
  for (const row of rows) {
    const expected = Buffer.from(row.token_hash);
    if (
      expected.length === candidate.length &&
      timingSafeEqual(expected, candidate)
    ) {
      if (Date.parse(row.expires_at) <= Date.now())
        fail("Run capability expired.", 403);
      const capability = record(row);
      if (!store.get("runs", runId)) fail("Run not found.", 404);
      return capability;
    }
  }
  fail("Run capability refused.", 403);
}

export function toolAllowedForRun(capability, tool) {
  if (!capability || !tool) return false;
  if (tool.annotations?.readOnlyHint === true) return true;
  return MODE_WRITES[capability.mode]?.has(tool.name) === true;
}
