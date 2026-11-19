import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const filename = () =>
  path.join(temporaryDirectory("avoozl-schema-"), "workspace.sqlite");
const schema = (db) =>
  db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY name",
    )
    .all();
function healthy(db) {
  assert.equal(
    db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
  assert.equal(db.prepare("PRAGMA synchronous").get().synchronous, 2);
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.equal(db.prepare("PRAGMA busy_timeout").get().timeout, 5000);
}

test("fresh schema and reopened workspace keep the same schema, data and durability", () => {
  const file = filename();
  let store = new Store(file);
  let expected;
  try {
    healthy(store.db);
    expected = schema(store.db);
    assert(expected.some((row) => row.name === "activity_log_at"));
    assert(expected.some((row) => row.name === "planning_usage"));
    store.setMeta("preserved", { value: "fake" });
    store.put("plans", { id: "fake-plan", state: "draft", hash: "fake-hash" });
  } finally {
    store.close();
  }
  store = new Store(file);
  try {
    healthy(store.db);
    assert.deepEqual(schema(store.db), expected);
    assert.deepEqual(store.getMeta("preserved"), { value: "fake" });
    assert.equal(store.get("plans", "fake-plan").hash, "fake-hash");
  } finally {
    store.close();
  }
});

test("legacy schema gains missing tables and retains activity and idea migrations", () => {
  const file = filename();
  let store = new Store(file);
  let expected;
  try {
    expected = schema(store.db);
    store.initialize(snapshot());
    store.put("plans", { id: "fake-plan", state: "draft", hash: "fake-hash" });
    store.put("incoming_items", { id: "idea", record: { kind: "idea" } });
    store.put("incoming_items", { id: "ticket", record: { kind: "ticket" } });
    for (const table of ["activity_log", "pr_ci", "ci_runs", "planning_usage"])
      store.db.exec(`DROP TABLE ${table}`);
  } finally {
    store.close();
  }
  store = new Store(file);
  try {
    healthy(store.db);
    assert.deepEqual(schema(store.db), expected);
    assert.deepEqual(store.read().tasks, snapshot().tasks);
    assert.equal(store.get("plans", "fake-plan").hash, "fake-hash");
    assert.equal(store.getMeta("activity.upgrade"), true);
    assert.deepEqual(
      store.list("incoming_items").map((row) => row.id),
      ["ticket"],
    );
    store.setMeta("activity.upgrade", false);
  } finally {
    store.close();
  }
  store = new Store(file);
  try {
    assert.equal(store.getMeta("activity.upgrade"), false);
    healthy(store.db);
  } finally {
    store.close();
  }
});

test("failed schema initialization rolls back every new object and closes its handle", () => {
  const file = filename(),
    legacy = new DatabaseSync(file);
  let expected;
  try {
    // The events index fails after earlier base tables have been created.
    legacy.exec(
      "CREATE TABLE events(legacy TEXT); INSERT INTO events VALUES ('kept')",
    );
    expected = schema(legacy);
  } finally {
    legacy.close();
  }
  assert.throws(() => new Store(file), /no such column: run_id/);
  // SQLite removes its WAL and shared-memory files when the last handle closes.
  assert.equal(fs.existsSync(file + "-wal"), false);
  assert.equal(fs.existsSync(file + "-shm"), false);
  const check = new DatabaseSync(file);
  try {
    assert.deepEqual(schema(check), expected);
    assert.equal(
      check.prepare("SELECT legacy FROM events").get().legacy,
      "kept",
    );
    assert.equal(
      check.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    check.exec("BEGIN IMMEDIATE; DROP TABLE events; COMMIT");
  } finally {
    check.close();
  }
  const retried = new Store(file);
  try {
    healthy(retried.db);
    assert(schema(retried.db).some((row) => row.name === "events_run"));
  } finally {
    retried.close();
  }
});

test("opening a complete schema can read alongside another connection's writer", () => {
  const file = filename(),
    writer = new Store(file);
  let reader;
  try {
    writer.db.exec("BEGIN IMMEDIATE");
    writer.setMeta("uncommitted", "fake-value");
    reader = new Store(file);
    assert.equal(reader.getMeta("uncommitted"), null);
    assert.deepEqual(schema(reader.db), schema(writer.db));
    writer.db.exec("COMMIT");
    assert.equal(reader.getMeta("uncommitted"), "fake-value");
    healthy(reader.db);
  } finally {
    reader?.close();
    writer.close();
  }
});

test("opening waits for another process's exclusive lock instead of failing", async () => {
  const file = filename();
  new Store(file).close();
  // Another process holds the file exclusively for a moment, as a tick's
  // writer can while a CLI command opens the workspace.
  const holder = spawn(
    process.execPath,
    [
      "-e",
      `const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(${JSON.stringify(file)});
db.exec("PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS held(a); COMMIT;");
console.log("locked");
setTimeout(() => db.close(), 300);`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const exited = once(holder, "exit");
  await once(holder.stdout, "data");
  const store = new Store(file);
  try {
    healthy(store.db);
  } finally {
    store.close();
  }
  await exited;
});
