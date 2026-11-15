// The removed lessons store's one-time export (RC30.5): a workspace's own
// lessons are appended to its steering rules file under a dated heading,
// their rows go in the same transaction, the tables drop once no lesson is
// left, and a failed write keeps every row.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { RULES_FILE } from "../corrections.mjs";
import { LESSONS_DATABASE, exportLessons } from "../lessons-export.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const NOW = Date.parse("2026-12-01T10:00:00Z");

function oldStore(lessons) {
  const configDirectory = temporaryDirectory("avoozl-lessons-config-"),
    db = new DatabaseSync(path.join(configDirectory, LESSONS_DATABASE));
  db.exec(`CREATE TABLE lessons(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const put = db.prepare("INSERT INTO lessons VALUES (?,?)");
  for (const l of lessons) put.run(l.id, JSON.stringify(l));
  db.close();
  return configDirectory;
}
const lesson = (id, source, extra = {}) => ({
  id,
  source,
  finding: `Finding ${id}.`,
  change: { summary: `change ${id}` },
  outcome: "kept",
  state: "ok",
  ...extra,
});
const rows = (configDirectory) => {
  const db = new DatabaseSync(path.join(configDirectory, LESSONS_DATABASE));
  try {
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE name='lessons'")
      .get();
    return table
      ? db
          .prepare("SELECT id FROM lessons ORDER BY id")
          .all()
          .map((r) => r.id)
      : null;
  } finally {
    db.close();
  }
};

test("own lessons are appended under a dated heading and their rows go", () => {
  const configDirectory = oldStore([
      lesson("L-1", "w1"),
      lesson("L-2", "w1", { state: "retired" }),
      lesson("L-3", "w1", { outcome: "undone" }),
      lesson("L-4", "w2"),
      lesson("L-5", "pack:p@1", { readOnly: true }),
    ]),
    root = temporaryDirectory("avoozl-lessons-root-"),
    file = path.join(root, RULES_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "---\ninclusion: always\n---\n\n- An old rule.\n");

  const result = exportLessons({
    configDirectory,
    workspaceRoot: root,
    workspaceId: "w1",
    now: NOW,
  });
  assert.deepEqual(result, { written: 1, file });
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.startsWith("---\ninclusion: always\n---\n\n- An old rule.\n"));
  assert.match(text, /## Lessons exported 2026-12-01/);
  assert.match(text, /- Finding L-1\. \(Changed: change L-1\.\)/);
  assert.doesNotMatch(text, /L-2|L-3|L-4|L-5/);
  // Another workspace's lesson keeps the tables for its own export.
  assert.deepEqual(rows(configDirectory), ["L-4", "L-5"]);

  // A second run writes nothing twice.
  assert.deepEqual(
    exportLessons({
      configDirectory,
      workspaceRoot: root,
      workspaceId: "w1",
      now: NOW,
    }),
    { written: 0, file: null },
  );
  assert.equal(fs.readFileSync(file, "utf8"), text);

  // The last workspace's export drops the tables, pack rows with them.
  const other = temporaryDirectory("avoozl-lessons-root-");
  exportLessons({
    configDirectory,
    workspaceRoot: other,
    workspaceId: "w2",
    now: NOW,
  });
  assert.equal(rows(configDirectory), null);
  assert.match(
    fs.readFileSync(path.join(other, RULES_FILE), "utf8"),
    /^---\ninclusion: always\n---\n[\s\S]*- Finding L-4\./,
  );
});

test("a failed write keeps the lessons and says why", () => {
  const configDirectory = oldStore([lesson("L-1", "w1")]),
    root = temporaryDirectory("avoozl-lessons-root-");
  // The rules file's path is a folder, so the append fails.
  fs.mkdirSync(path.join(root, RULES_FILE), { recursive: true });
  const result = exportLessons({
    configDirectory,
    workspaceRoot: root,
    workspaceId: "w1",
    now: NOW,
  });
  assert.match(result.error, /lessons store is kept/);
  assert.deepEqual(rows(configDirectory), ["L-1"]);
});

test("Operations exports on bind and the Proposals view reports it", async (t) => {
  const root = temporaryDirectory("avoozl-lessons-ws-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.setMeta("workspaceId", "w1");
  const configDirectory = oldStore([lesson("L-1", "w1")]),
    ops = new Operations(store, { workspaceRoot: root, configDirectory });
  const view = await ops.execute("flow.proposals", {});
  assert.equal(view.lessonsExport.written, 1);
  assert.match(
    fs.readFileSync(path.join(root, RULES_FILE), "utf8"),
    /Finding L-1/,
  );
  assert.equal(rows(configDirectory), null);
});
