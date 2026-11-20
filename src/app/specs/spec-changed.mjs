// Spec changed (RC2.8, design D4.3). After a spec is edited, this lists what
// each changed task would do to its GitHub issue, and applies it only once
// the spec is approved again at the new revision. A claimed issue is never
// edited: it gets one comment. A removed task closes its issue as not
// planned. Nothing here reads GitHub or the store: callers pass the issues.
import { createHash } from "node:crypto";
import { parseSpec, specItems } from "./spec-plans.mjs";
import { specTasks as taskList } from "./spec-tasks.mjs";

const sha = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Task ID -> {id, title, hash} for one spec revision. The hash covers the
// task as parsed, so an edit to its done bullets or its waits counts.
export function specTasks(name, files = {}) {
  const parsed = new Map(
      parseSpec({ name, exists: true, files }).proposals.map((p) => [p.id, p]),
    ),
    tasks = new Map();
  for (const item of specItems(name, taskList(files)?.text ?? "")) {
    if (!item.id) continue;
    const task = parsed.get(item.id);
    tasks.set(item.id, {
      id: item.id,
      title: item.title,
      hash: sha([
        item.title,
        task?.acceptance ?? null,
        task?.requires ?? null,
        task?.manual ?? null,
      ]),
    });
  }
  return tasks;
}

// What changed between two revisions: edited, added or removed tasks.
export function diffSpec(name, before, after) {
  const a = specTasks(name, before),
    b = specTasks(name, after),
    rows = [];
  for (const task of b.values()) {
    const old = a.get(task.id);
    if (!old)
      rows.push({ taskId: task.id, title: task.title, change: "added" });
    else if (old.hash !== task.hash)
      rows.push({ taskId: task.id, title: task.title, change: "edited" });
  }
  for (const task of a.values())
    if (!b.has(task.id))
      rows.push({ taskId: task.id, title: task.title, change: "removed" });
  return rows;
}

// The last revision that was approved before the current one, or null.
export function approvedBefore(plan) {
  const entry = [...(plan.history || [])]
    .reverse()
    .find((item) => item.state === "approved" && item.files);
  return entry?.files ?? null;
}
