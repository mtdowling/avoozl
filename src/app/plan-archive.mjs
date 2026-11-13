// Archiving a plan (plan.archive, plan.unarchive). Archive is the
// reversible way to put a plan away; Delete (plan-retire.mjs) is the
// one-way one. An archived plan keeps every row and its spec folder. Its
// open tasks are held: each carries `planArchived: <plan id>`, which the
// ready rule reads, so no new session starts for them. A running chat is
// left alone. Each task outside the plan that waits on one of its open
// tasks gets a decision for the owner. Unarchive takes back exactly what
// archive added: the hold marks and the decisions it wrote, if nobody has
// changed them since. Task statuses are never touched, so a task the
// person deferred by hand stays deferred.
import { planTasks } from "./plan-retire.mjs";
import { fail } from "./store.mjs";

const entry = (action, by, at) => ({ action, by: by || null, at });

export function archivePlan(store, plan, { by = null } = {}) {
  if (plan.deletedAt) fail("This plan is deleted.", 409);
  if (plan.archivedAt) fail("This plan is already archived.", 409);
  const at = new Date().toISOString(),
    title = plan.title || plan.spec || plan.id;
  return store.mutate("Archive plan " + plan.id, (data) => {
    const found = planTasks(store, data, plan),
      byId = new Map(data.tasks.map((t) => [t.id, t])),
      held = [],
      decisions = [];
    // Open and running tasks: a running chat keeps going, but a retry or
    // the next attempt must not start while the plan is archived.
    for (const { id } of [...found.open, ...found.running]) {
      const row = byId.get(id);
      if (!row || row.planArchived) continue;
      row.planArchived = plan.id;
      row.updatedAt = at;
      held.push(id);
    }
    for (const { id, waitsOn } of found.dependents) {
      const row = byId.get(id);
      // A task that already has a decision already waits for the owner;
      // keep its decision rather than overwrite it.
      if (!row || row.decision) continue;
      const text = `It waits on ${waitsOn}, from the archived plan ${title}. Unarchive that plan, remove the link, or point it at another task.`;
      row.decision = text;
      row.updatedAt = at;
      decisions.push({ id, text });
    }
    store.put("plans", {
      ...plan,
      archivedAt: at,
      archivedBy: by,
      archive: { held, decisions },
      events: [...(plan.events || []), entry("archived", by, at)],
    });
    store.event(null, "plan.archive", {
      id: plan.id,
      by,
      held,
      decisions: decisions.map((d) => d.id),
    });
    return {
      id: plan.id,
      archivedAt: at,
      archivedBy: by,
      held: held.length,
      running: found.running.length,
      decisions: decisions.length,
    };
  });
}

export function unarchivePlan(store, plan, { by = null } = {}) {
  if (plan.deletedAt) fail("This plan is deleted.", 409);
  if (!plan.archivedAt) fail("This plan is not archived.", 409);
  const at = new Date().toISOString(),
    { decisions = [] } = plan.archive || {};
  return store.mutate("Unarchive plan " + plan.id, (data) => {
    let released = 0,
      cleared = 0;
    for (const row of data.tasks)
      if (row.planArchived === plan.id) {
        delete row.planArchived;
        row.updatedAt = at;
        released += 1;
      }
    const byId = new Map(data.tasks.map((t) => [t.id, t]));
    for (const { id, text } of decisions) {
      const row = byId.get(id);
      // Only the decision archive wrote; one the owner or Avoozl changed
      // since is someone else's and stays.
      if (row?.decision !== text) continue;
      delete row.decision;
      row.updatedAt = at;
      cleared += 1;
    }
    const next = {
      ...plan,
      events: [...(plan.events || []), entry("unarchived", by, at)],
    };
    delete next.archivedAt;
    delete next.archivedBy;
    delete next.archive;
    store.put("plans", next);
    store.event(null, "plan.unarchive", { id: plan.id, by, released, cleared });
    return { id: plan.id, released, decisions: cleared };
  });
}
