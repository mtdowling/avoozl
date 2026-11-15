// References to a different spec are declarations until that spec's owner
// approves its task. No foreign executable row is created to satisfy a link.
export const hasPendingSpecDependencies = (task) =>
  (task?.pendingSpecDependencies || []).some(
    (entry) => entry?.kind !== "supports",
  );

export function approvedSpecDependency(ref, target, owner, receipt) {
  return (
    target?.planId === ref.planId &&
    owner?.spec === ref.spec &&
    !owner.deletedAt &&
    !owner.archivedAt &&
    receipt?.hash === target.planHash &&
    receipt?.taskIds?.includes(target.id)
  );
}

export function reconcileSpecDependencies(data, plans, approvals) {
  const owners = new Map(plans.map((plan) => [plan.id, plan])),
    receipts = new Map(approvals.map((receipt) => [receipt.id, receipt])),
    tasks = new Map(data.tasks.map((task) => [task.id, task]));
  for (const task of data.tasks) {
    if (!Array.isArray(task.specDependencies)) continue;
    const pending = [];
    for (const ref of task.specDependencies) {
      const target = tasks.get(ref.taskId),
        owner = owners.get(ref.planId),
        receipt = owner && receipts.get(owner.approvalId),
        approved = approvedSpecDependency(ref, target, owner, receipt);
      const id = `${ref.taskId}:${ref.kind}:${task.id}`;
      data.edges = data.edges.filter(
        (edge) => !(edge.id === id && edge.planId === task.planId),
      );
      if (!approved) {
        pending.push(ref);
        continue;
      }
      if (!data.edges.some((edge) => edge.id === id))
        data.edges.push({
          id,
          from: ref.taskId,
          to: task.id,
          kind: ref.kind,
          ...(ref.condition ? { condition: ref.condition } : {}),
          planId: task.planId,
          reason: "Approved cross-spec dependency",
        });
    }
    if (pending.length && task.github?.number) {
      const error = Error(
        `Approve referenced spec owners before changing projected task ${task.id}.`,
      );
      error.status = 409;
      throw error;
    }
    if (pending.length) task.pendingSpecDependencies = pending;
    else delete task.pendingSpecDependencies;
  }
  // Resolution can join two formerly separate components. Check both edge
  // kinds before a transaction commits, rather than leave a latent cycle.
  const graph = new Map(),
    active = new Set(),
    seen = new Set();
  for (const edge of data.edges)
    if (["requires", "sequence"].includes(edge.kind)) {
      if (!graph.has(edge.from)) graph.set(edge.from, []);
      graph.get(edge.from).push(edge.to);
    }
  function visit(id) {
    if (active.has(id)) {
      const error = Error(`Dependency cycle ${id}`);
      error.status = 409;
      throw error;
    }
    if (seen.has(id)) return;
    active.add(id);
    for (const to of graph.get(id) || []) visit(to);
    active.delete(id);
    seen.add(id);
  }
  if (data.tasks.some((task) => task.specDependencies))
    for (const task of data.tasks) visit(task.id);
}
