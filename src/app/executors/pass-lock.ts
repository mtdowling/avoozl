// @ts-nocheck: typing debt
// The locks one tick holds for its pass (machine-server MS2, design D3): the
// workspace pass lock beside each workspace database, and the supervisor's
// pass lock over the children. A lock is an exclusive SQLite transaction,
// held until the pass closes it; the operating system drops it when the
// process ends in any way, so a killed tick never leaves one behind. The JSON
// record beside a lock only names its holder; it never decides who holds it.
// No code here renames or deletes a lock file.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// The pass lock for one workspace database, and the record that names its holder.
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

// Open locks, kept reachable: a lock lives as long as its connection, and a
// caller that drops the handle must not let the garbage collector close it.
const open = new Set();

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
  open.add(db);
  return {
    held: true,
    close() {
      if (closed) return;
      closed = true;
      open.delete(db);
      db.close();
    },
  };
}

// Write a holder's record; only the holder calls this, after it holds the lock.
function writeRecord(record, info) {
  const temporary = `${record}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(info, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(temporary, record);
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
      writeRecord(record, info);
      return taken;
    }
    if (attempt + 1 < tries)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pauseMs);
  }
  return { held: false, holder: readRecord(record) };
}
