import {
  endLease,
  leaseState,
  renewLease,
  takeLease,
  type LeaseRecord,
} from "./lease.ts";
import type { Snapshot, Task } from "./types.ts";

// One check-in: start, heartbeat, pause or finish, with what it reports.
interface ActivityInput {
  id?: string;
  action?: string;
  owner?: string;
  sessionId?: string;
  leaseId?: string;
  branch?: string;
  worktree?: string;
  summary?: string;
  leaseMinutes?: number;
  [key: string]: unknown;
}
const TEXT_KEYS = [
  "owner",
  "sessionId",
  "leaseId",
  "branch",
  "worktree",
  "summary",
] as const;
const LIMITS: Record<string, number> = { summary: 2000, worktree: 1000 };
const ACTIVITY_LEASE_MINUTES = 30;
export function activityState(task: Task, now = Date.now()) {
  const a = task.activity as LeaseRecord | null | undefined;
  if (!a) return "none";
  if (a.state !== "active") return a.state;
  return leaseState(a, now);
}
function conflict(message: string): never {
  throw Object.assign(Error(message), { status: 409 });
}
export function applyActivity(
  data: Snapshot,
  input: ActivityInput,
  now = Date.now(),
) {
  const task = data.tasks.find((t) => t.id === input.id);
  if (!task) throw Error("Task not found");
  const action = input.action;
  if (!action || !["start", "heartbeat", "pause", "finish"].includes(action))
    throw Error("Choose start, heartbeat, pause or finish");
  for (const key of TEXT_KEYS) {
    const value = input[key];
    if (
      value !== undefined &&
      (typeof value !== "string" || value.length > (LIMITS[key] || 240))
    )
      throw Error(key + " must be bounded text");
  }
  const minutes =
    input.leaseMinutes ??
    (task.activity?.leaseMinutes as number | undefined) ??
    ACTIVITY_LEASE_MINUTES;
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240)
    throw Error("Lease must be 5–240 minutes");
  const old = task.activity as LeaseRecord | null | undefined,
    at = new Date(now).toISOString(),
    seconds = minutes * 60;
  let record: LeaseRecord;
  if (action === "start") {
    if (!input.owner?.trim())
      throw Error("Name the person or agent starting this task");
    if (!input.sessionId?.trim())
      throw Error("A stable worker/session ID is required");
    const taken = takeLease(old, { sessionId: input.sessionId, seconds, now });
    if (taken.busy)
      conflict(
        "Already in flight with " + old?.owner + " until " + old?.expiresAt,
      );
    if (taken.replaced) {
      task.activityHistory = [
        { ...old, replacedAt: at },
        ...(task.activityHistory || []),
      ].slice(0, 20);
    }
    record =
      "replaced" in taken
        ? { ...taken.record, owner: input.owner.trim() }
        : taken.record;
  } else {
    if (!old || !input.leaseId || old.leaseId !== input.leaseId)
      conflict(
        "The activity lease changed. Read this task before checking in or ending work.",
      );
    if (old.state === "finished" && action !== "finish")
      conflict("This work session finished. Start a new one.");
    const next =
      action === "heartbeat"
        ? renewLease(old, { leaseId: input.leaseId, seconds, now })
        : endLease(old, {
            leaseId: input.leaseId,
            now,
            state: action === "pause" ? "paused" : "finished",
          });
    if (!next.record) conflict("The activity lease changed.");
    record = next.record;
  }
  for (const key of ["branch", "worktree", "summary"])
    if (input[key] !== undefined) record[key] = String(input[key]).trim();
  if (action === "start" || action === "heartbeat")
    record.leaseMinutes = minutes;
  task.activity = record;
  // Activity does not imply implementation, acceptance, or a dependency change.
  return { task, activity: record, state: activityState(task, now) };
}
export function activityErrors(task: Task) {
  const a = task.activity as Record<string, unknown> | null | undefined;
  if (!a) return [];
  const errors: string[] = [];
  if (!["active", "paused", "finished"].includes(String(a.state)))
    errors.push("Unknown activity state " + task.id);
  for (const key of ["owner", "sessionId", "leaseId"])
    if (typeof a[key] !== "string" || !a[key])
      errors.push("Missing activity " + key + " " + task.id);
  for (const key of ["startedAt", "heartbeatAt", "expiresAt"])
    if (!Number.isFinite(Date.parse(String(a[key]))))
      errors.push("Invalid activity " + key + " " + task.id);
  return errors;
}
