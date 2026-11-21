// Each workspace's last tick pass, in the supervisor database, for
// `avoozl status`: when the timer last ran it and what came out.
import type { DatabaseSync } from "node:sqlite";

export function ensurePassTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS passes (
      root TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      result TEXT NOT NULL
    );
  `);
}

// Record one result per workspace a pass ticked.
export function recordPasses(
  db: DatabaseSync,
  results: ({ root?: string; at?: string } | null)[],
) {
  const put = db.prepare(
    "INSERT OR REPLACE INTO passes (root, at, result) VALUES (?, ?, ?)",
  );
  for (const found of results)
    if (found?.root)
      put.run(found.root, found.at ?? null, JSON.stringify(found));
}

export function lastPasses(db: DatabaseSync) {
  try {
    return db
      .prepare("SELECT root, at, result FROM passes ORDER BY root")
      .all()
      .map((row) => ({
        root: row.root,
        at: row.at,
        ...JSON.parse(String(row.result)),
      }));
  } catch {
    // A database from before this table existed.
    return [];
  }
}
