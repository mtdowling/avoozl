// A person takes one ready task by hand (worker-paths WP2, design D6):
// `avoozl take TASK` binds it to the person and prepares its worktree;
// `avoozl runner report TASK done` from that worktree finishes it, and Avoozl
// reads the commit and runs the checks. The tick stays the one dispatcher: it
// leaves a taken task alone because the ready query skips every task with a
// live worker session (busyTaskIds), and a take is one.
import { fail } from "../store/store.mjs";
import { cliCommand } from "./report-command.mjs";
import {
  busyTaskIds,
  liveAttempt,
  prepareWorktree,
  readyCandidates,
} from "../delivery/delivery.mjs";
import { linePausedTaskIds } from "../flow/flow.mjs";
import { taskGit, worktreeChanges } from "../git/git.mjs";
import { sessionUrl } from "../tick/notifications.mjs";
import {
  bindSession,
  listSessionBindings,
} from "../sessions/session-bindings.mjs";
import { scheduleHolds } from "../specs/spec-scheduler.mjs";

// Why `task` cannot be taken now, or null when it may be.
function refusal(store, task, github) {
  const data = store.read(),
    why = (reason) =>
      `${task.id} is not ready to start: ${reason}. Run avoozl next to see what is ready.`;
  if (busyTaskIds(store).has(task.id))
    return why("it has a session running or a delivery under way");
  if (linePausedTaskIds(store, data).has(task.id))
    return why("Stop the line holds it");
  const schedule = scheduleHolds(store, { github });
  if (schedule.held.has(task.id)) return why(schedule.held.get(task.id));
  if (!readyCandidates(store).some((t) => t.id === task.id))
    return why("it is blocked, or not a leaf this machine can run");
  return null;
}

// runner.take / `avoozl take TASK`: the caller is the person at this
// machine's command line (the operation refuses any other).
export async function manualTake(store, input = {}, { github = null } = {}) {
  const task = store.read().tasks.find((t) => t.id === input.taskId);
  if (!task) fail(`Task ${input.taskId} not found.`, 404);
  if (input.release === true) return giveBack(store, task, input);
  const attempt =
    listSessionBindings(store).filter(
      (b) => b.taskId === task.id && b.role === "worker",
    ).length + 1;
  const { binding, changed } = bindSession(
    store,
    {
      taskId: task.id,
      slot: input.slot ?? `manual-${task.id}-${attempt}`,
      role: "worker",
      title: `avoozl:${task.id} ${task.title || ""}`.trim().slice(0, 200),
    },
    {
      conductor: "cli",
      guard: () => {
        const reason = refusal(store, task, github);
        if (reason) fail(reason, 409);
      },
    },
  );
  let worktree = null,
    worktreeError = null;
  try {
    worktree = await prepareWorktree(store, { taskId: binding.taskId });
  } catch (error) {
    worktreeError = error.message;
  }
  const where = input.workspaceRoot
    ? ` --workspace ${JSON.stringify(input.workspaceRoot)}`
    : "";
  return {
    binding,
    changed,
    link: sessionUrl(binding.slot),
    worktree: worktree && { path: worktree.path, branch: worktree.branch },
    ...(worktreeError ? { worktreeError } : {}),
    // From inside the worktree: commit, then run this.
    report: `${cliCommand()} runner report ${task.id} done${where}`,
  };
}

// `avoozl take TASK --release`: give the task back. The take must still be
// open (no done or blocked report), and a worktree with uncommitted changes
// keeps them unless the person says `--discard`, which drops them.
async function giveBack(store, task, input) {
  const binding = listSessionBindings(store)
    .filter(
      (b) =>
        b.taskId === task.id && b.role === "worker" && b.conductor === "cli",
    )
    .sort((a, b) => b.attempt - a.attempt)[0];
  if (!binding || !liveAttempt(binding))
    fail(
      `${task.id} has not been taken by hand, so there is nothing to give back.`,
      409,
    );
  const record = store.get("task_worktrees", task.id),
    worktree = record?.path,
    checkout = store.get("repositories", record?.repository ?? "")?.root;
  let dirty = "";
  if (worktree)
    dirty = await worktreeChanges(worktree, checkout).catch(() => "");
  if (dirty && input.discard !== true)
    fail(
      `${task.id}'s worktree has uncommitted changes. Commit or move them, or release with --discard to drop them.`,
      409,
    );
  if (dirty) {
    await taskGit(worktree, ["reset", "--hard", "HEAD"], { checkout });
    await taskGit(worktree, ["clean", "-fd"], { checkout });
  }
  store.transaction(() => store.remove("session_bindings", binding.slot));
  return { released: task.id, slot: binding.slot, discarded: Boolean(dirty) };
}
