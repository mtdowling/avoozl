import fs from "node:fs";
import path from "node:path";
import { fail } from "./store.mjs";
import { digest } from "../model.mjs";

// Publish pending Markdown projections from the outbox under root, and mark
// each published row in SQLite. Operations calls this after every operation it
// executes when it is given a plans root.
export function flushOutbox(store, root) {
  fs.mkdirSync(root, { recursive: true });
  const report = [];
  for (const row of store.db
    .prepare("SELECT * FROM outbox WHERE state='pending' ORDER BY rowid")
    .all()) {
    const full = path.resolve(root, row.path);
    if (!full.startsWith(path.resolve(root) + path.sep))
      fail("Invalid document projection path.");
    let parent = path.dirname(full);
    while (parent !== path.resolve(root)) {
      if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink())
        fail("Document symlink refused.");
      parent = path.dirname(parent);
    }
    if (fs.existsSync(full) && fs.lstatSync(full).isSymbolicLink())
      fail("Document symlink refused.");
    const old = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    if (
      old !== null &&
      digest(old) !== digest(row.text) &&
      (!row.expected_hash || digest(old) !== row.expected_hash)
    ) {
      report.push({ id: row.id, state: "conflict", path: row.path });
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full + ".workspace-pending", row.text);
    fs.renameSync(full + ".workspace-pending", full);
    store.db
      .prepare("UPDATE outbox SET state='published' WHERE id=?")
      .run(row.id);
    report.push({ id: row.id, state: "published", path: row.path });
  }
  if (report.length) store.setMeta("publication", report);
  return report;
}
