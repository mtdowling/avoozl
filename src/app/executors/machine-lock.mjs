// The machine lock and the workspace loop lock (MS2, design D3). A lock is an
// exclusive SQLite transaction that is never ended: the operating system holds
// it for the life of the handle and drops it when the process ends in any way.
// The JSON record beside it only names the holder; it never decides who holds
// the lock. No code here renames or deletes a lock file.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function machineLockPaths(stateDirectory) {
  const root = path.join(path.resolve(stateDirectory), "machine");
  return {
    root,
    lock: path.join(root, "lock.sqlite"),
    record: path.join(root, "lock.json"),
  };
}

// The loop lock for one workspace database, and the record that names its holder.
export const loopLockPaths = (database) => ({
  lock: `${database}.loop-lock`,
  record: `${database}.loop-lock.json`,
});

export function readRecord(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const isBusy = (error) =>
  /database is locked|SQLITE_BUSY|busy/i.test(String(error?.message));

// Try once to take the lock at `lock`. Returns { held: true, close } or
// { held: false }. Any other failure is thrown.
export function tryLock(lock) {
  fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
  let db;
  try {
    db = new DatabaseSync(lock);
    db.exec(
      "PRAGMA busy_timeout = 0; PRAGMA locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE",
    );
  } catch (error) {
    try {
      db?.close();
    } catch {}
    if (isBusy(error)) return { held: false };
    throw error;
  }
  let closed = false;
  return {
    held: true,
    holds: () => !closed,
    close() {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}

// Whether another process holds the lock now, without taking it: a shared
// read is refused while an exclusive transaction is open. A missing file
// means nobody holds it.
export function lockIsHeld(lock) {
  if (!fs.existsSync(lock)) return false;
  let db;
  try {
    db = new DatabaseSync(lock, { readOnly: true });
    db.exec("PRAGMA busy_timeout = 0");
    db.prepare("SELECT count(*) FROM sqlite_master").get();
    return false;
  } catch {
    // Busy, or caught while a holder sets the file up: either way someone
    // holds it, and the record names who.
    return true;
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

// Take the lock, then write the record. A probe by another process can refuse
// the first try for a moment, so a refusal is tried again a few times; a real
// holder refuses every time.
export function takeLock(
  { lock, record },
  info,
  { tries = 3, pauseMs = 50 } = {},
) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const taken = tryLock(lock);
    if (taken.held) {
      fs.writeFileSync(record, JSON.stringify(info, null, 2) + "\n", {
        mode: 0o600,
      });
      return taken;
    }
    if (attempt + 1 < tries)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pauseMs);
  }
  return { held: false, holder: readRecord(record) };
}

// The holder named by the record when the lock is held now, else null.
export function lockHolder({ lock, record }) {
  return lockIsHeld(lock) ? (readRecord(record) ?? {}) : null;
}
