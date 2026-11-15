// The one-time export of the removed lessons store (RC30.5, design §D35.4).
// Lessons lived in one SQLite file on this machine, `lessons.sqlite` in the
// Avoozl settings folder, shared by every workspace. When a workspace binds,
// its own lessons are appended to its steering rules file under a dated
// heading, and their rows go in the same transaction. Once no lesson is
// left, the tables drop. A failed write rolls back and keeps every row.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RULES_FILE } from "./corrections.mjs";

export const LESSONS_DATABASE = "lessons.sqlite";
// The heading carries the workspace, so a second run after a write that
// landed but a commit that did not adds nothing twice.
const marker = (workspaceId) => `<!-- avoozl-lessons-export ${workspaceId} -->`;
const NEW_FILE = "---\ninclusion: always\n---\n\n# Rules from corrections\n";

const line = (lesson) =>
  `- ${[
    lesson.finding,
    lesson.change?.summary && `(Changed: ${lesson.change.summary}.)`,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()}`;

// Returns null when there is nothing to do, {written, file} after an
// export, or {error} when the file could not be written; the rows stay.
export function exportLessons({
  configDirectory,
  workspaceRoot,
  workspaceId,
  now = Date.now(),
}) {
  const database = path.join(configDirectory || "", LESSONS_DATABASE);
  if (!configDirectory || !workspaceRoot || !fs.existsSync(database))
    return null;
  const db = new DatabaseSync(database);
  try {
    db.exec("PRAGMA busy_timeout=5000");
    const table = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='lessons'",
      )
      .get();
    if (!table) return null;
    const rows = db
      .prepare("SELECT id, body FROM lessons ORDER BY id")
      .all()
      .map((row) => ({ id: row.id, lesson: JSON.parse(row.body) }));
    // Rows a plugin pack brought in belong to no workspace; they go with
    // the tables.
    const own = rows.filter(
        ({ lesson }) => lesson.source === workspaceId && !lesson.readOnly,
      ),
      left = rows.filter(
        ({ lesson }) => lesson.source !== workspaceId && !lesson.readOnly,
      );
    // A retired lesson, or one whose change was undone, is not a rule.
    const kept = own.filter(
      ({ lesson }) => lesson.state !== "retired" && lesson.outcome !== "undone",
    );
    const file = path.join(workspaceRoot, RULES_FILE);
    db.exec("BEGIN IMMEDIATE");
    try {
      if (kept.length) {
        const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
        if (!old?.includes(marker(workspaceId))) {
          const date = new Date(now).toISOString().slice(0, 10),
            text = [
              old === null ? NEW_FILE : old.endsWith("\n") ? "" : "\n",
              `\n## Lessons exported ${date}\n\n${marker(workspaceId)}\n\n`,
              kept.map(({ lesson }) => line(lesson)).join("\n"),
              "\n",
            ].join("");
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.appendFileSync(file, text);
        }
      }
      const remove = db.prepare("DELETE FROM lessons WHERE id=?");
      for (const { id } of own) remove.run(id);
      if (!left.length) {
        db.exec("DROP TABLE lessons");
        db.exec("DROP TABLE IF EXISTS meta");
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      return {
        error: `Could not export lessons to ${RULES_FILE}; the lessons store is kept: ${error.message}`,
      };
    }
    return { written: kept.length, file: kept.length ? file : null };
  } finally {
    db.close();
  }
}
