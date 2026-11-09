import { randomUUID } from "./task-identity.mjs";
export const ACTIVITY_LEASE_MINUTES = 30;
export function activityState(task, now = Date.now()) {
  const a = task.activity;
  if (!a) return "none";
  if (a.state !== "active") return a.state;
  return Number.isFinite(Date.parse(a.expiresAt)) &&
    Date.parse(a.expiresAt) > now
    ? "active"
    : "stale";
}
function conflict(message) {
  const error = Error(message);
  error.status = 409;
  throw error;
}
export function applyActivity(data, input, now = Date.now()) {
  const task = data.tasks.find((t) => t.id === input.id);
  if (!task) throw Error("Task not found");
  const action = input.action;
  if (!["start", "heartbeat", "pause", "finish"].includes(action))
    throw Error("Choose start, heartbeat, pause or finish");
  for (const key of [
    "owner",
    "sessionId",
    "leaseId",
    "branch",
    "worktree",
    "summary",
  ])
    if (
      input[key] !== undefined &&
      (typeof input[key] !== "string" ||
        input[key].length > ({ summary: 2000, worktree: 1000 }[key] || 240))
    )
      throw Error(key + " must be bounded text");
  const minutes =
    input.leaseMinutes ?? task.activity?.leaseMinutes ?? ACTIVITY_LEASE_MINUTES;
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240)
    throw Error("Lease must be 5–240 minutes");
  const old = task.activity,
    at = new Date(now).toISOString();
  let record;
  if (action === "start") {
    if (!input.owner?.trim())
      throw Error("Name the person or agent starting this task");
    if (!input.sessionId?.trim())
      throw Error("A stable worker/session ID is required");
    if (
      activityState(task, now) === "active" &&
      old.sessionId !== input.sessionId
    )
      conflict(
        "Already in flight with " + old.owner + " until " + old.expiresAt,
      );
    if (
      activityState(task, now) === "active" &&
      old.sessionId === input.sessionId
    )
      record = { ...old };
    else {
      if (old)
        task.activityHistory = [
          { ...old, replacedAt: at },
          ...(task.activityHistory || []),
        ].slice(0, 20);
      record = {
        state: "active",
        leaseId: randomUUID(),
        sessionId: input.sessionId,
        owner: input.owner.trim(),
        startedAt: at,
      };
    }
  } else {
    if (!old || !input.leaseId || old.leaseId !== input.leaseId)
      conflict(
        "The activity lease changed. Read this task before checking in or ending work.",
      );
    if (old.state === "finished" && action !== "finish")
      conflict("This work session finished. Start a new one.");
    record = { ...old };
  }
  for (const key of ["branch", "worktree", "summary"])
    if (input[key] !== undefined) record[key] = input[key].trim();
  if (action === "start" || action === "heartbeat") {
    record.state = "active";
    record.leaseMinutes = minutes;
    record.heartbeatAt = at;
    record.expiresAt = new Date(now + minutes * 60000).toISOString();
    delete record.endedAt;
  } else {
    record.state = action === "pause" ? "paused" : "finished";
    record.endedAt = at;
  }
  task.activity = record;
  // Activity does not imply implementation, acceptance, or a dependency change.
  return { task, activity: record, state: activityState(task, now) };
}
export function activityErrors(task) {
  const a = task.activity;
  if (!a) return [];
  const errors = [];
  if (!["active", "paused", "finished"].includes(a.state))
    errors.push("Unknown activity state " + task.id);
  for (const key of ["owner", "sessionId", "leaseId"])
    if (typeof a[key] !== "string" || !a[key])
      errors.push("Missing activity " + key + " " + task.id);
  for (const key of ["startedAt", "heartbeatAt", "expiresAt"])
    if (!Number.isFinite(Date.parse(a[key])))
      errors.push("Invalid activity " + key + " " + task.id);
  return errors;
}
