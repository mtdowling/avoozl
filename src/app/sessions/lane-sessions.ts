// @ts-nocheck: typing debt
// Lane sessions (simplify §D22): each machine runs `lanes.local` worker
// lanes and `lanes.reviewers` reviewer lanes per workspace, each one
// long-lived session reused task after task. This module says which lanes
// exist, which are free, and which a person closed; the executors open,
// clear and bind the sessions.
import { fail } from "../store/store.ts";
import { listSessionBindings } from "./session-bindings.ts";

const STATE = "lanes";
// A Kiro Crew chat a person closed: Kiro Crew says closed or lost, or a
// stock Kiro Crew no longer lists it. (A literal: session-bindings.mjs's
// FINAL_STATUSES is not set yet while the import cycle through
// delivery.mjs loads.)
const CLOSED = new Set(["closed", "lost", "gone"]);

// The lane a dispatch role runs on, or null for a role with no lanes.
export const laneRole = (role) =>
  role === "worker" ? "worker" : /^review:/.test(role) ? "reviewer" : null;

// The fixed header of a lane's session (SM20.2).
export function laneHeader(workspace, role, n, count) {
  return `Avoozl · ${workspace} · ${role}${role === "reviewer" && count === 1 ? "" : ` ${n}`}`;
}

// Every lane of this machine for one workspace, worker lanes first.
export function laneList(policy, workspace) {
  const lanes = [];
  for (const [role, count] of [
    ["worker", policy?.concurrency ?? 0],
    ["reviewer", policy?.reviewerLanes ?? 0],
  ])
    for (let n = 1; n <= count; n++)
      lanes.push({
        id: `${role}-${n}`,
        role,
        header: laneHeader(workspace, role, n, count),
        workspace,
      });
  return lanes;
}

export const laneStates = (store) => store.getMeta(STATE) ?? {};

// The newest binding each lane holds, by lane id.
function laneBindings(bindings) {
  const out = new Map();
  for (const binding of bindings)
    if (binding.lane) {
      const held = out.get(binding.lane);
      if (!held || held.boundAt < binding.boundAt)
        out.set(binding.lane, binding);
    }
  return out;
}

// Start requests that hold a lane before their session is bound, by lane id
// ({task, role}): a lane is never planned for two tasks at once.
function laneRequests(store, bindings) {
  const bound = new Set(bindings.map((b) => b.requestId).filter(Boolean)),
    out = new Map();
  for (const row of store.list("session_requests"))
    if (
      row.kind === "start" &&
      ["pending", "claimed"].includes(row.state) &&
      row.request?.lane?.id &&
      !bound.has(row.id)
    )
      out.set(row.request.lane.id, row.request);
  return out;
}

// Whether a lane's binding still holds it: until its delivery records the
// binding's attempt (a worker's attempt, or a review's verification), with
// or without a report. A quiet review the tick failed after its nudges has
// no report of its own, and must still free the lane.
export function holdsLane(store, binding) {
  if (!binding || binding.interrupted || CLOSED.has(binding.status))
    return false;
  const delivery = store.get("task_deliveries", binding.taskId);
  if (binding.role === "worker")
    return !delivery?.attempts?.some((a) => a.attempt === binding.attempt);
  const role = binding.role.slice("review:".length);
  return !(delivery?.verifications || []).some(
    (v) => v.role === role && v.attempt === binding.attempt,
  );
}

// Each lane with its state: free, busy (its task), or paused (a person
// closed its session and has not pressed Resume).
export function laneView(store, policy, workspace) {
  const bindings = listSessionBindings(store),
    held = laneBindings(bindings),
    requested = laneRequests(store, bindings),
    states = laneStates(store);
  return laneList(policy, workspace).map((lane) => {
    const binding = held.get(lane.id) ?? null,
      request = requested.get(lane.id) ?? null,
      saved = states[lane.id] ?? {};
    const state = saved.paused
      ? "paused"
      : request || holdsLane(store, binding)
        ? "busy"
        : "free";
    return {
      ...lane,
      state,
      // Every session this lane ran for its last task, oldest first.
      taskBindings: binding
        ? bindings.filter(
            (b) => b.lane === lane.id && b.taskId === binding.taskId,
          )
        : [],
      task: request?.task ?? (state === "busy" ? binding?.taskId : null),
      // The open session a new task reuses; a closed one is never reused.
      slot: binding && !CLOSED.has(binding.status) ? binding.slot : null,
      executor: binding?.executor ?? request?.executor ?? null,
      binding,
      request,
      ...(saved.paused ? { paused: saved.paused } : {}),
    };
  });
}

// The lane a start for (task, role) takes: the one its own pending request
// already holds, else the free lane its last session ran on (a review round
// continues there), else the first free lane of its role, or null when
// every lane is taken. `taken` holds lane ids this planning pass gave out.
export function pickLane(lanes, { task, role }, taken) {
  const own = lanes.find(
    (lane) =>
      lane.request?.task === task &&
      lane.request?.role === role &&
      !taken.has(lane.id),
  );
  const again = lanes.find(
    (lane) =>
      lane.state === "free" &&
      sameWork(lane.binding, { task, role }) &&
      !taken.has(lane.id),
  );
  const lane =
    own ??
    again ??
    lanes.find(
      (lane) =>
        lane.role === laneRole(role) &&
        lane.state === "free" &&
        !taken.has(lane.id),
    );
  if (!lane) return null;
  taken.add(lane.id);
  return lane;
}

const sameWork = (binding, { task, role }) =>
  binding?.taskId === task && laneRole(binding.role) === laneRole(role);

// The lane fields a start for (task, role) carries to its executor:
// `resume` when the lane's last session worked this same task, so a review
// round continues it; else `keepSince`, the start of the lane's last task,
// whose sessions a process lane keeps until this one starts (§D22.2).
export function laneRequest(lane, { task, role } = {}) {
  const resume = sameWork(lane.binding, { task, role }),
    since = lane.binding ? firstBound(lane) : null;
  return {
    id: lane.id,
    header: lane.header,
    workspace: lane.workspace,
    ...(lane.slot ? { slot: lane.slot } : {}),
    ...(resume && lane.slot
      ? {
          resume: true,
          ...(lane.binding.harnessSession
            ? { session: lane.binding.harnessSession }
            : {}),
        }
      : since
        ? { keepSince: since }
        : {}),
  };
}

// When the lane's last task first bound a session there.
const firstBound = (lane) =>
  listBindingsOf(lane)
    .map((b) => b.boundAt)
    .sort()[0] ?? null;
const listBindingsOf = (lane) => lane.taskBindings ?? [lane.binding];

// Pause each lane whose session a person closed (SM20.8), once. A close
// read before the lane's last Resume does not pause it again. A process
// child closes its session itself when its run ends, so only a chat's close
// pauses a lane. Returns the lanes paused now.
export function observeLanes(store, policy, workspace, now = Date.now()) {
  const states = laneStates(store),
    held = laneBindings(listSessionBindings(store)),
    next = { ...states },
    paused = [];
  for (const lane of laneList(policy, workspace)) {
    const binding = held.get(lane.id),
      saved = states[lane.id] ?? {};
    if (
      !binding ||
      binding.executor === "process" ||
      !CLOSED.has(binding.status) ||
      saved.paused
    )
      continue;
    if (saved.resumedAt && (binding.statusAt ?? "") <= saved.resumedAt)
      continue;
    next[lane.id] = {
      paused: {
        at: new Date(now).toISOString(),
        status: binding.status,
        task: binding.taskId,
      },
    };
    paused.push(lane);
  }
  if (paused.length) store.setMeta(STATE, next);
  return paused;
}

// lane.resume: a person's Resume on a paused lane. The next tick opens a new
// session for it with the same header.
export function resumeLane(store, input = {}) {
  const id = input.lane;
  if (typeof id !== "string" || !/^(worker|reviewer)-[0-9]{1,2}$/.test(id))
    fail("Name a lane, such as worker-1 or reviewer-1.", 400);
  const states = laneStates(store);
  if (!states[id]?.paused) fail(`Lane ${id} is not paused.`, 409);
  store.setMeta(STATE, {
    ...states,
    [id]: { resumedAt: new Date().toISOString() },
  });
  return { lane: id, resumed: true };
}

// One Needs you row per paused lane, with Resume.
export function lanesNeedsYou(store) {
  return Object.entries(laneStates(store))
    .filter(([, saved]) => saved.paused)
    .map(([id, saved]) => ({
      kind: "needs-human",
      reason: "lane-closed",
      id: `lane-closed:${id}`,
      taskId: saved.paused.task ?? null,
      title: `Lane ${id.replace("-", " ")} was closed`,
      detail: `Its session was ${saved.paused.status}, so the lane is paused and takes no task. The task it ran starts again on another free lane. Press Resume to open a new session for this lane on the next tick.`,
      openedAt: saved.paused.at,
      actions: [
        {
          label: "Resume",
          operation: "lane.resume",
          input: { lane: id },
        },
      ],
    }));
}

// `avoozl lanes` and the page's lanes (simplify §D22.3): one row per lane
// with its role, harness, state, task, and how a person opens its session.
// `attach(slot)` returns a process session's attach command, or null.
export function lanesView(store, policy, workspace, { attach = null } = {}) {
  return laneView(store, policy, workspace).map((lane) => {
    const process = lane.executor === "process";
    return {
      lane: lane.id,
      role: lane.role,
      header: lane.header,
      harness: process ? lane.binding?.harness || "process" : lane.executor,
      state: lane.state,
      task: lane.task,
      slot: lane.slot,
      open:
        lane.state === "paused"
          ? `Resume in Needs you, or avoozl lane resume ${lane.id}`
          : !lane.slot
            ? null
            : process
              ? (attach?.(lane.slot) ?? null)
              : `Kiro Crew chat "${lane.header}" in Avoozl › ${lane.workspace}`,
    };
  });
}

// `avoozl lanes` as text: one padded row per lane, the open command last.
export function laneTable(lanes) {
  const head = ["LANE", "ROLE", "HARNESS", "STATE", "TASK", "OPEN"],
    rows = lanes.map((l) => [
      l.lane,
      l.role,
      l.harness ?? "-",
      l.state,
      l.task ?? "-",
      l.open ?? "-",
    ]),
    widths = head.map((_, i) =>
      Math.max(...[head, ...rows].map((row) => row[i].length)),
    );
  return [head, ...rows]
    .map((row) =>
      row
        .map((cell, i) =>
          i === row.length - 1 ? cell : cell.padEnd(widths[i]),
        )
        .join("  "),
    )
    .join("\n")
    .concat("\n");
}
