// Spec changed (RC2.8, design D4.3). After a spec is edited, this lists what
// each changed task would do to its GitHub issue, and applies it only once
// the spec is approved again at the new revision. A claimed issue is never
// edited: it gets one comment. A removed task closes its issue as not
// planned. Nothing here reads GitHub or the store: callers pass the issues.
import { createHash } from "node:crypto";
import { specFacts, specItems } from "./spec-plans.mjs";

const sha = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Task ID -> {id, title, hash} for one spec revision. The hash covers the
// task's facts, so an edit to acceptance, checks or edges counts.
export function specTasks(name, files = {}) {
  const manifest = specFacts(files).tasks;
  const tasks = new Map();
  for (const item of specItems(name, files["tasks.md"] || "")) {
    if (!item.id) continue;
    tasks.set(item.id, {
      id: item.id,
      title: item.title,
      hash: sha([item.title, manifest[item.key] ?? null]),
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
