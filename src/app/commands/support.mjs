// Helpers CLI commands share.
import { planFiles } from "../../catalog.mjs";
import { reconcileSource } from "../source-sync.mjs";
import { Store, fail } from "../store.mjs";
import fs from "node:fs";

// Reindex every plan file and stored document from the plans root.
export function generate(config) {
  if (!config.configured)
    fail("Choose an initialized workspace before indexing Markdown.");
  const store = new Store(config.dbPath),
    stats = { added: 0, changed: 0, removed: 0, newTasks: 0 };
  try {
    for (const file of new Set([
      // No plans root yet means no Markdown plan files.
      ...(fs.existsSync(config.plansRoot) ? planFiles(config.plansRoot) : []),
      ...Object.keys(store.read().documents).filter(
        (id) => !store.read().documents[id].managed,
      ),
    ])) {
      const result = reconcileSource(store, config.plansRoot, file);
      if (result.changed) stats[result.removed ? "removed" : "changed"]++;
    }
    return { stats };
  } finally {
    store.close();
  }
}

// `avoozl integrator ...` and `avoozl landing submit` were retired by the
// merge batches spec; they print this line and change nothing.
export const RETIRED_LANDING =
  "This command is retired. Verified work lands in merge batches with landing mode direct; see landing status.";

// One line per base for `landing status`.
export const landingStatusLine = (b) =>
  `${b.repository ?? b.projectId} ${b.base}: ${b.items.length} waiting` +
  (b.testing
    ? `, testing ${b.testing.members.length} (${b.testing.step})`
    : "") +
  (b.size ? `, size limit ${b.size.limit}` : "");

// One spec in `plan batches` and the approve preview.
export function batchLine(entry) {
  return [
    entry.spec,
    entry.hash.slice(0, 16),
    `${entry.tasks} tasks`,
    ...(entry.writes !== undefined && entry.writes !== null
      ? [`${entry.writes} writes`]
      : []),
    ...(entry.writesError ? [`writes unknown: ${entry.writesError}`] : []),
    ...(entry.loop ? ["loop"] : []),
    ...(entry.errors ? [`${entry.errors} lint errors`] : []),
    ...(entry.waitsOn ? [`waits on ${entry.waitsOn.join(", ")}`] : []),
    ...(entry.failure ? [`fails: ${entry.failure}`] : []),
  ].join("  ");
}
