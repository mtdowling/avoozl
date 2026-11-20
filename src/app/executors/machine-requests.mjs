// Requests to the running machine server: rows in its database, so no
// listener is needed. The server reads them on its one-second pass.
// Requests are rows in the supervisor database, so no listener is needed:
// the server reads them on its one-second pass.
export function ensureRequestTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      state TEXT NOT NULL,
      result TEXT,
      at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS passes (
      root TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      result TEXT NOT NULL
    );
  `);
}

export function addRequest(db, kind) {
  return Number(
    db
      .prepare(
        "INSERT INTO requests (kind, state, at) VALUES (?, 'pending', ?)",
      )
      .run(kind, new Date().toISOString()).lastInsertRowid,
  );
}

export const pendingRequests = (db, kind, state = "pending") =>
  db
    .prepare("SELECT id FROM requests WHERE kind = ? AND state = ?")
    .all(kind, state)
    .map((row) => row.id);

export function setRequest(db, ids, state, result = null) {
  for (const id of ids)
    db.prepare("UPDATE requests SET state = ?, result = ? WHERE id = ?").run(
      state,
      result,
      id,
    );
}

// Record one JSON line per workspace the tick child printed.
export function recordPasses(db, lines) {
  const put = db.prepare(
    "INSERT OR REPLACE INTO passes (root, at, result) VALUES (?, ?, ?)",
  );
  for (const line of lines) {
    let found;
    try {
      found = JSON.parse(line);
    } catch {
      continue;
    }
    if (found?.root) put.run(found.root, found.at, line);
  }
}

export function lastPasses(db) {
  try {
    return db
      .prepare("SELECT root, at, result FROM passes ORDER BY root")
      .all()
      .map((row) => ({
        root: row.root,
        at: row.at,
        ...JSON.parse(row.result),
      }));
  } catch {
    // A database from before this table existed.
    return [];
  }
}
