// Deleting a plan (plan.delete). A draft that was never approved is only
// marked deleted. A plan with an approved revision is retired in one
// transaction: its open tasks are archived (rows kept as history), a task
// whose chat is still running is archived when that chat ends, each task
// outside the plan that waits on one of its tasks gets a decision, and the
// plan is marked deleted and kept. Nothing is ever removed from the
// database. The spec folder is removed from the working tree only when the
// person asks, and only when Git shows no uncommitted change in it.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { gitEnvironment } from "./content-rules.mjs";
import { graphView, inPlan } from "./page-views.mjs";
import { fail } from "./store.mjs";

const BLOCKING = new Set(["requires", "blocks"]);

// The archive every path uses: the row stays, marked archived.
export function archiveTask(task, at = new Date().toISOString()) {
  task.archivedAt = task.archivedAt || at;
  task.updatedAt = at;
  return task;
}

const approvedOnce = (plan) =>
  plan.state === "approved" ||
  Boolean(plan.approvedAt) ||
  Object.keys(plan.mapping || {}).length > 0 ||
  (plan.revisions || []).some((r) => r.state === "approved" || r.approvedAt);

// The plan's tasks by state, and the tasks outside it that wait on them.
export function planTasks(store, data, plan) {
  const scope = { plan: plan.id, spec: plan.spec || null },
    tasks = data.tasks.filter((t) => !t.archivedAt && inPlan(t, scope)),
    ids = new Set(tasks.map((t) => t.id)),
    state = new Map(
      graphView(store, data, {}).tasks.map((t) => [t.id, t.state]),
    ),
    done = tasks.filter((t) => state.get(t.id) === "done"),
    running = tasks.filter((t) => state.get(t.id) === "running"),
    open = tasks.filter((t) => !["done", "running"].includes(state.get(t.id))),
    dependents = data.edges
      .filter((e) => BLOCKING.has(e.kind) && ids.has(e.from) && !ids.has(e.to))
      .filter((e) => state.get(e.to) !== "done")
      .map((e) => ({ id: e.to, waitsOn: e.from }));
  return { tasks, done, running, open, dependents };
}

// Where the spec folder is and whether Git shows an uncommitted change in
// it. `root` is the checkout readSpec found the folder in.
export function specFolderState(root, name) {
  if (!root || !name) return null;
  const folder = path.join(root, ".kiro", "specs", name);
  if (!fs.existsSync(folder))
    return { path: folder, exists: false, dirty: false };
  let dirty = false,
    reason = null;
  try {
    dirty = Boolean(
      execFileSync("git", ["status", "--porcelain", "--", folder], {
        cwd: root,
        encoding: "utf8",
        env: gitEnvironment(),
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    // Not a Git checkout: nothing would bring the folder back.
    dirty = true;
    reason = "Git cannot read this folder, so nothing could bring it back.";
  }
  return {
    path: folder,
    exists: true,
    dirty,
    reason:
      reason ||
      (dirty
        ? "The folder has changes Git has not committed. Commit or discard them first."
        : null),
  };
}

// What a delete would do, for the confirm dialog. Writes nothing.
export function deletePreview(store, data, plan, folder) {
  const { done, running, open, dependents } = planTasks(store, data, plan);
  return {
    id: plan.id,
    title: plan.title || plan.spec || plan.id,
    spec: plan.spec || null,
    retire: approvedOnce(plan),
    open: open.length,
    running: running.length,
    done: done.length,
    dependents: dependents.length,
    folder,
  };
}

// plan.delete. `retire` must be true for a plan with an approved revision,
// so a caller never retires one by accident.
export function deletePlan(
  store,
  plan,
  { retire = false, deleteSpecFolder = false, folder = null } = {},
) {
  if (plan.deletedAt) fail("This spec is already deleted.", 409);
  const approved = approvedOnce(plan);
  if (approved && retire !== true)
    fail(
      "This spec has an approved revision. Deleting it archives its open tasks; pass retire: true after the person confirms.",
      409,
    );
  if (deleteSpecFolder && folder?.exists && folder.dirty)
    fail(`Not deleted. ${folder.reason} (${folder.path})`, 409);
  const at = new Date().toISOString();
  const result = store.mutate("Delete plan " + plan.id, (data) => {
    const found = planTasks(store, data, plan),
      byId = new Map(data.tasks.map((t) => [t.id, t]));
    for (const task of found.open) archiveTask(byId.get(task.id), at);
    for (const task of found.running) {
      const row = byId.get(task.id);
      row.archiveWhenEnded = plan.id;
      row.updatedAt = at;
    }
    const title = plan.title || plan.spec || plan.id;
    for (const { id, waitsOn } of found.dependents) {
      const row = byId.get(id);
      if (!row) continue;
      row.decision = `It waits on ${waitsOn}, from the deleted plan ${title}. Remove that link, or point it at another task.`;
      row.updatedAt = at;
    }
    store.put("plans", {
      ...plan,
      deletedAt: at,
      retiredAt: approved ? at : undefined,
    });
    store.event(null, "plan.delete", {
      id: plan.id,
      retired: approved,
      archived: found.open.map((t) => t.id),
      archiveWhenEnded: found.running.map((t) => t.id),
      decisions: found.dependents.map((d) => d.id),
    });
    return {
      id: plan.id,
      deletedAt: at,
      retired: approved,
      archived: found.open.length,
      archiveWhenEnded: found.running.length,
      decisions: found.dependents.length,
    };
  });
  // The folder goes only after the database change is committed, from the
  // working tree only: never a commit or a push.
  let removedFolder = null;
  if (deleteSpecFolder && folder?.exists) {
    fs.rmSync(folder.path, { recursive: true });
    removedFolder = folder.path;
  }
  return { ...result, removedFolder };
}

// After a tick: a retired plan's task whose chat has ended is archived now.
export function archiveEnded(store) {
  const data = store.read(),
    waiting = data.tasks.filter((t) => t.archiveWhenEnded && !t.archivedAt);
  if (!waiting.length) return 0;
  const state = new Map(
      graphView(store, data, {}).tasks.map((t) => [t.id, t.state]),
    ),
    ended = waiting.filter((t) => state.get(t.id) !== "running");
  if (!ended.length) return 0;
  store.mutate("Archive tasks of a deleted plan", (next) => {
    const at = new Date().toISOString();
    for (const task of next.tasks)
      if (ended.some((t) => t.id === task.id)) archiveTask(task, at);
  });
  return ended.length;
}
