// Test helper for epic context: the store records an approval leaves for a
// spec committed in `root`, tasks linked to it, and the driver row the
// Specs list reads.
import path from "node:path";
import { approvalCommits } from "../git/git-approvals.mjs";
import { bindDriver } from "../workers/driver.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const DRIVER = {
  driver: { state: "driver", reason: "driver" },
  "not-shared": { state: "driver", reason: "not-shared" },
  "other-person": {
    state: "read-only",
    reason: "other-person",
    assignees: ["octo-dev"],
  },
  "no-assignee": { state: "read-only", reason: "no-assignee" },
  several: { state: "read-only", reason: "several", assignees: ["a", "b"] },
  unreadable: { state: "read-only", reason: "unreadable", error: "boom" },
};

// `none` writes no row: nobody has read who drives yet.
export function setDriver(store, name, planId = "config") {
  if (name !== "none")
    store.put("drivers", { id: planId, mode: "github", ...DRIVER[name] });
}

// The plan `config` approved at the newest commit that changed it, its
// receipt, each task in `tasks` (an ID, or a task row) linked to the plan,
// and a driver bound with `drive` as its state.
export async function seedApproval(
  store,
  { root, tasks, drive = "driver", planId = "config" },
) {
  const [entry] = await approvalCommits(root, { allowed: async () => true });
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
    const at = data.tasks.findIndex((existing) => existing.id === row.id);
    if (at >= 0) data.tasks[at] = { ...data.tasks[at], ...row, planId };
    else data.tasks.push({ ...row, planId });
  }
  store.commit(data, "seed", data.revision);
  bindDriver(store, {
    settingsFile: path.join(temporaryDirectory(), "driver.json"),
    workspaceRoot: root,
  });
  setDriver(store, drive, planId);
  return entry;
}
