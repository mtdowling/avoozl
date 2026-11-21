// Test helper for epic context: the store records an approval leaves for a
// spec committed in `root`, and tasks linked to it.
import type { Task } from "../../types.ts";
import { approvalCommits } from "../git/git-approvals.ts";
import type { Store, StoredRecord } from "../store/store.ts";

// The plan `config` approved at the newest commit that changed it, its
// receipt, and each task in `tasks` (an ID, or a task row) linked to the
// plan.
export async function seedApproval(
  store: Store,
  {
    root,
    tasks,
    planId = "config",
  }: {
    root: string;
    tasks: (string | (Partial<Task> & { id: string }))[];
    planId?: string;
  },
) {
  const [entry] = await approvalCommits(root, { allowed: async () => true });
  if (!entry) throw Error(`No approval commit in ${root}.`);
  store.put("plans", {
    id: planId,
    spec: planId,
    state: "approved",
    hash: entry.hash,
    approvalId: "approval-1",
    files: entry.files,
  });
  store.put("approvals", { id: "approval-1", planId, hash: entry.hash });
  const data = store.read();
  for (const task of tasks) {
    const id = typeof task === "string" ? task : task.id,
      row = {
        id,
        title: id,
        scope: "catalog",
        status: "planned",
        track: "catalog",
        tags: [],
        acceptance: ["x"],
        ...(typeof task === "string" ? {} : task),
      };
    const at = data.tasks.findIndex((existing: Task) => existing.id === row.id);
    if (at >= 0) data.tasks[at] = { ...data.tasks[at], ...row, planId };
    else data.tasks.push({ ...row, planId });
  }
  store.commit(data, "seed", data.revision);
  return entry;
}

// The plan's approval names a revision git does not hold, so the gate's
// approved test fails while the task still runs.
export function unapprove(store: Store, planId = "config") {
  const plan = store.get<StoredRecord>("plans", planId);
  if (!plan) throw Error(`No plan ${planId}.`);
  const id = `${plan.approvalId}-moved`;
  store.put("approvals", { id, planId, hash: "0".repeat(64) });
  store.put("plans", { ...plan, approvalId: id });
}
