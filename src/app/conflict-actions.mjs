// The owner's actions on Conflicts items, one or many at a time (the page's
// bulk select). Each item is settled or refused on its own, so one locked
// task does not stop the rest, and the reply says which and why. Task row
// edits keep the authority lock (§3.2): a GitHub or plugin task's row is
// refused, as task.update refuses it.
import { fail } from "./store.mjs";
import { taskAuthority } from "../work-model.mjs";

const ACTIONS = new Set(["reviewed", "unblock", "dismiss", "settle"]);
const MAX_ITEMS = 500;

function lockReason(task) {
  const authority = taskAuthority(task);
  if (authority === "github")
    return "GitHub owns this task. Settle it on its issue.";
  if (authority.startsWith("plugin:"))
    return `${authority} owns this task. Settle it in its record.`;
  return null;
}

// The status an unblocked task goes back to: `planned` when the workspace
// has it, else its first open status that is not blocked or deferred.
function openStatus(data) {
  const open = (data.statuses || []).filter(
    (s) => !s.complete && !["blocked", "deferred"].includes(s.id),
  );
  return open.find((s) => s.id === "planned")?.id ?? open[0]?.id ?? null;
}

export function settleConflicts(store, input = {}, expectedRevision) {
  const { action, items, answer } = input;
  if (!ACTIONS.has(action))
    fail("Choose reviewed, unblock, dismiss or settle.");
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > MAX_ITEMS ||
    items.some((item) => typeof item?.taskId !== "string")
  )
    fail(`Name 1 to ${MAX_ITEMS} items, each with its taskId.`);
  if (
    action === "dismiss" &&
    items.some((item) => typeof item.slot !== "string")
  )
    fail("Name the ended session's slot for each item to dismiss.");
  if (
    action === "settle" &&
    (typeof answer !== "string" || !answer.trim() || answer.length > 2000)
  )
    fail("Give the decision's answer in 1–2000 characters.");
  if (expectedRevision === undefined)
    fail("Send the revision you read, so a stale page is refused.", 428);
  const settled = [],
    refused = [];
  store.mutate(
    `Settle ${items.length} conflict${items.length === 1 ? "" : "s"}: ${action}`,
    (data) => {
      const at = new Date().toISOString(),
        status = openStatus(data);
      for (const item of items) {
        const task = data.tasks.find((t) => t.id === item.taskId);
        const refuse = (reason) => refused.push({ ...item, reason });
        if (!task) {
          refuse("Task not found.");
          continue;
        }
        if (action === "dismiss") {
          const binding = store.get("session_bindings", item.slot);
          if (!binding || binding.taskId !== task.id) {
            refuse("That session is not bound to this task.");
            continue;
          }
          store.put("session_bindings", { ...binding, dismissedAt: at });
          settled.push(item);
          continue;
        }
        const locked = lockReason(task);
        if (locked) {
          refuse(locked);
          continue;
        }
        if (action === "reviewed") {
          if (!task.needsReview) {
            refuse("It does not need review.");
            continue;
          }
          task.needsReview = false;
        } else if (action === "unblock") {
          if (task.status !== "blocked") {
            refuse("It is not blocked.");
            continue;
          }
          if (!status) {
            refuse("This workspace has no open status to return it to.");
            continue;
          }
          task.status = status;
        } else {
          if (!task.decision) {
            refuse("It has no open decision.");
            continue;
          }
          task.notes = [
            task.notes,
            `Decision ${task.decision} settled ${at}: ${answer.trim()}`,
          ]
            .filter(Boolean)
            .join("\n");
          delete task.decision;
        }
        task.statusAuthority = "database";
        task.updatedAt = at;
        settled.push(item);
      }
      return null;
    },
    expectedRevision,
  );
  return { revision: store.read().revision, settled, refused };
}
