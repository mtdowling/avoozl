// Which Delivery lane a task is in, for the Delivery tab (the page imports
// this file).
// `task` is a graph.view task, `item` its delivery.view item or null.

// Session statuses after which a session will not move again.
const ENDED = new Set(["closed", "lost"]);

// A task's state on the Graph, with the word the page shows for it. The page
// (kirocrew-app/ui/src/graph-layout.ts) and the `query` and `task.get`
// operations read this one list, so the CLI says what the page says.
export const NODE_STATES = Object.freeze([
  ["ready", "Ready"],
  ["running", "Running"],
  ["waiting", "Waiting"],
  ["needs-you", "Needs you"],
  ["done", "Done"],
  ["deferred", "Deferred"],
  ["draft", "Draft"],
]);

// Older backends send no `state`; derive the same order from the fields
// they do send.
export function nodeState(task) {
  if (task.state) return task.state;
  if (task.complete) return "done";
  if (task.decision || task.status === "blocked") return "needs-you";
  if (task.status === "deferred") return "deferred";
  if (task.status === "running" || task.status === "review") return "running";
  return task.ready ? "ready" : "waiting";
}

const deliveryState = (item) => {
  const states = (item?.deliveries ?? [])
    .map((d) => d.state)
    .filter((s) => typeof s === "string");
  return states.at(-1) ?? null;
};

// Which lane a task is in. Needs-you wins, then done, then review, then a
// live session, then readiness.
export function laneOf(task, item) {
  const state = deliveryState(item);
  const live = (item?.sessions ?? []).filter((s) => !ENDED.has(s.status ?? ""));
  if (
    state === "decision" ||
    item?.needsYou ||
    (task && nodeState(task) === "needs-you" && !item?.complete)
  )
    return "needs-you";
  if (item?.complete || (task && nodeState(task) === "done")) return "done";
  if (
    state === "done" ||
    state === "verified" ||
    (item?.status === "review" && !item.handSetReview) ||
    live.some((s) => s.role !== "worker")
  )
    return "reviewing";
  if (
    live.length ||
    state === "running" ||
    state === "failed" ||
    (item?.status === "running" && !item.handSetReview)
  )
    return "running";
  if (task && nodeState(task) === "ready") return "ready";
  return "waiting";
}
