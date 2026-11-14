// Spec changed (RC2.8, design D4.3). After a spec is edited, this lists what
// each changed task would do to its GitHub issue, and applies it only once
// the spec is approved again at the new revision. A claimed issue is never
// edited: it gets one comment. A removed task closes its issue as not
// planned. Nothing here reads GitHub or the store: callers pass the issues.
import { createHash } from "node:crypto";
import { MANIFEST, specItems } from "./spec-plans.mjs";
import { fail } from "./store.mjs";

const sha = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Task ID -> {id, title, hash} for one spec revision. The hash covers the
// manifest entry, so an edit to acceptance, checks or edges counts.
export function specTasks(name, files = {}) {
  let manifest = {};
  try {
    manifest = JSON.parse(files[MANIFEST] || "{}").tasks || {};
  } catch {
    manifest = {};
  }
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

const PAST = {
  edited: "was edited",
  added: "was added",
  removed: "was removed",
};

// One row per change, with the issue it touches and what Avoozl will do.
// `issues`: task ID -> {repository, number, state: "open" | "closed",
// claimed, shared} for tasks that have an issue. `shared` is true when the
// issue also holds a task that stays in the spec (a batch).
export function planSpecChange({ name, before, after, issues = new Map() }) {
  return diffSpec(name, before, after).map((row) => {
    const issue = issues.get(row.taskId) ?? null,
      base = {
        ...row,
        repository: issue?.repository ?? null,
        number: issue?.number ?? null,
        issueState: !issue
          ? "none"
          : issue.state === "closed"
            ? "closed"
            : issue.claimed
              ? "claimed"
              : "unclaimed",
      };
    if (row.change === "added")
      return { ...base, action: "create", text: "Create the issue." };
    if (!issue || issue.state === "closed")
      return { ...base, action: "none", text: "No open issue. Nothing to do." };
    if (issue.claimed || (row.change === "removed" && issue.shared))
      return {
        ...base,
        action: "comment",
        text: issue.claimed
          ? "Do not edit. Comment that the spec changed."
          : "Do not close: the issue holds other tasks. Comment instead.",
      };
    if (row.change === "removed")
      return { ...base, action: "close", text: "Close as not planned." };
    return {
      ...base,
      action: "update",
      text: "Update the issue body and the approval hash.",
    };
  });
}

export const changeComment = (row) =>
  `Spec changed: task ${row.taskId} ${PAST[row.change]}. This issue is not edited while it is claimed or shared. See the spec diff.`;

// Write the changes. Refused until the spec is approved again. `project()`
// runs the projection for create and update rows (the projection holds claimed
// issues); comments and closes are made here, and `archive(taskId)` retires
// a task whose issue was closed. Returns what was done.
export async function applySpecChange(
  github,
  { rows, approved, project, archive },
) {
  if (!approved)
    fail("Approve the spec again at the new revision before applying.", 409);
  const done = [];
  for (const row of rows) {
    if (row.action === "comment") {
      await github.createIssueComment(
        row.repository,
        row.number,
        changeComment(row),
      );
      done.push({ taskId: row.taskId, action: "comment" });
    } else if (row.action === "close") {
      await github.updateIssue(row.repository, row.number, {
        state: "closed",
        state_reason: "not_planned",
      });
      await archive?.(row.taskId);
      done.push({ taskId: row.taskId, action: "close" });
    }
  }
  if (rows.some((row) => row.action === "create" || row.action === "update")) {
    await project();
    for (const row of rows)
      if (row.action === "create" || row.action === "update")
        done.push({ taskId: row.taskId, action: row.action });
  }
  return done;
}

// The issue each task of the old revision has, read from GitHub. A task is
// claimed when its issue carries the crew claim label or a local session
// holds it. `remaining` is the task IDs still in the new revision.
export async function changeIssues({
  tasks,
  github,
  claimLabel,
  localClaimed = new Set(),
  remaining = new Set(),
}) {
  const issues = new Map(),
    read = new Map();
  for (const task of tasks) {
    const link = task.github;
    if (!link?.number || !link.repository) continue;
    const key = `${link.repository}#${link.number}`;
    if (!read.has(key))
      read.set(key, await github.issue(link.repository, link.number));
    const issue = read.get(key);
    if (!issue) continue;
    issues.set(task.id, {
      repository: link.repository,
      number: link.number,
      state: issue.state === "closed" ? "closed" : "open",
      claimed:
        localClaimed.has(task.id) ||
        (issue.labels || []).some(
          (label) => (label.name ?? label) === claimLabel(link.repository),
        ),
      shared: (link.batch?.members || []).some(
        (id) => id !== task.id && remaining.has(id),
      ),
    });
  }
  return issues;
}

// The last revision that was approved before the current one, or null.
export function approvedBefore(plan) {
  const entry = [...(plan.history || [])]
    .reverse()
    .find((item) => item.state === "approved" && item.files);
  return entry?.files ?? null;
}
