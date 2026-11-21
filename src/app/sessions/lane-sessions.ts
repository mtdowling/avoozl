// Lane sessions (simplify §D22): each machine runs `lanes.local` worker
// lanes and `lanes.reviewers` reviewer lanes per workspace, each one
// long-lived session reused task after task. This module says which lanes
// exist, which are free, and which a person closed; the executors open,
// clear and bind the sessions.
import { fail, type Store } from "../store/store.ts";
import {
  listSessionBindings,
  type SessionBinding,
} from "./session-bindings.ts";

// The lane counts of a workspace's policy.
type LanePolicy = { concurrency?: number; reviewerLanes?: number } | null;
type Work = { task?: string; role?: string };
// A start request that names its lane.
type LaneStart = Work & {
  executor?: string;
  lane?: { id?: string };
  [key: string]: unknown;
};
type Pause = { at: string; status?: string; task?: string };
type LaneState = { paused?: Pause; resumedAt?: string };
export interface Lane {
  id: string;
  role: string;
  header: string;
  workspace: string;
}
export type LaneRow = Lane & {
  state: "free" | "busy" | "paused";
  taskBindings: SessionBinding[];
  task: string | null | undefined;
  slot: string | null;
  executor: string | null;
  binding: SessionBinding | null;
  request: LaneStart | null;
  paused?: Pause;
};

const STATE = "lanes";
// A Kiro Crew chat a person closed: Kiro Crew says closed or lost, or a
// stock Kiro Crew no longer lists it. (A literal: session-bindings.mjs's
// FINAL_STATUSES is not set yet while the import cycle through
// delivery.mjs loads.)
const CLOSED = new Set(["closed", "lost", "gone"]);

// The lane a dispatch role runs on, or null for a role with no lanes.
const laneRole = (role: string | undefined) =>
  role === "worker"
    ? "worker"
    : /^review:/.test(String(role))
      ? "reviewer"
      : null;

// The fixed header of a lane's session (SM20.2).
export function laneHeader(
  workspace: string,
  role: string,
  n: number,
  count: number,
) {
  return `Avoozl · ${workspace} · ${role}${role === "reviewer" && count === 1 ? "" : ` ${n}`}`;
}

// Every lane of this machine for one workspace, worker lanes first.
function laneList(policy: LanePolicy, workspace: string) {
  const lanes: Lane[] = [];
  const counts: [string, number][] = [
    ["worker", policy?.concurrency ?? 0],
    ["reviewer", policy?.reviewerLanes ?? 0],
  ];
  for (const [role, count] of counts)
    for (let n = 1; n <= count; n++)
      lanes.push({
        id: `${role}-${n}`,
        role,
        header: laneHeader(workspace, role, n, count),
        workspace,
      });
  return lanes;
}

const laneStates = (store: Store) =>
  store.getMeta<Record<string, LaneState>>(STATE) ?? {};

// The newest binding each lane holds, by lane id.
function laneBindings(bindings: SessionBinding[]) {
  const out = new Map<string, SessionBinding>();
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
function laneRequests(store: Store, bindings: SessionBinding[]) {
  const bound = new Set(bindings.map((b) => b.requestId).filter(Boolean)),
    out = new Map<string, LaneStart>();
  for (const row of store.list<{
    id: string;
    kind?: string;
    state?: string;
    request?: LaneStart;
  }>("session_requests"))
    if (
      row.kind === "start" &&
      ["pending", "claimed"].includes(String(row.state)) &&
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
function holdsLane(store: Store, binding: SessionBinding | null) {
  if (!binding || binding.interrupted || CLOSED.has(String(binding.status)))
    return false;
  const delivery = store.get<{
    id: string;
    attempts?: { attempt: number }[];
    verifications?: { role: string; attempt: number }[];
  }>("task_deliveries", binding.taskId);
  if (binding.role === "worker")
    return !delivery?.attempts?.some((a) => a.attempt === binding.attempt);
  const role = binding.role.slice("review:".length);
  return !(delivery?.verifications || []).some(
    (v) => v.role === role && v.attempt === binding.attempt,
  );
}

// Each lane with its state: free, busy (its task), or paused (a person
// closed its session and has not pressed Resume).
export function laneView(
  store: Store,
  policy: LanePolicy,
  workspace: string,
): LaneRow[] {
  const bindings = listSessionBindings(store),
    held = laneBindings(bindings),
    requested = laneRequests(store, bindings),
    states = laneStates(store);
  return laneList(policy, workspace).map((lane) => {
    const binding = held.get(lane.id) ?? null,
      request = requested.get(lane.id) ?? null,
      saved = states[lane.id] ?? {};
    const state: LaneRow["state"] = saved.paused
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
      slot:
        binding && !CLOSED.has(String(binding.status)) ? binding.slot : null,
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
export function pickLane(
  lanes: LaneRow[],
  { task, role }: Work,
  taken: Set<string>,
) {
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

const sameWork = (binding: SessionBinding | null, { task, role }: Work) =>
  binding?.taskId === task && laneRole(binding?.role) === laneRole(role);

// The lane fields a start for (task, role) carries to its executor:
// `resume` when the lane's last session worked this same task, so a review
// round continues it; else `keepSince`, the start of the lane's last task,
// whose sessions a process lane keeps until this one starts (§D22.2).
export function laneRequest(lane: LaneRow, { task, role }: Work = {}) {
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
          ...(lane.binding?.harnessSession
            ? { session: lane.binding.harnessSession }
            : {}),
        }
      : since
        ? { keepSince: since }
        : {}),
  };
}

// When the lane's last task first bound a session there.
const firstBound = (lane: LaneRow) =>
  listBindingsOf(lane)
    .map((b) => b?.boundAt)
    .sort()[0] ?? null;
const listBindingsOf = (lane: LaneRow) => lane.taskBindings ?? [lane.binding];

// Pause each lane whose session a person closed (SM20.8), once. A close
// read before the lane's last Resume does not pause it again. A process
// child closes its session itself when its run ends, so only a chat's close
// pauses a lane. Returns the lanes paused now.
export function observeLanes(
  store: Store,
  policy: LanePolicy,
  workspace: string,
  now = Date.now(),
) {
  const states = laneStates(store),
    held = laneBindings(listSessionBindings(store)),
    next = { ...states },
    paused: Lane[] = [];
  for (const lane of laneList(policy, workspace)) {
    const binding = held.get(lane.id),
      saved = states[lane.id] ?? {};
    if (
      !binding ||
      binding.executor === "process" ||
      !CLOSED.has(String(binding.status)) ||
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
export function resumeLane(store: Store, input: { lane?: unknown } = {}) {
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
export function lanesNeedsYou(store: Store) {
  return Object.entries(laneStates(store))
    .filter(([, saved]) => saved.paused)
    .map(([id, saved]) => ({
      kind: "needs-human",
      reason: "lane-closed",
      id: `lane-closed:${id}`,
      taskId: saved.paused?.task ?? null,
      title: `Lane ${id.replace("-", " ")} was closed`,
      detail: `Its session was ${saved.paused?.status}, so the lane is paused and takes no task. The task it ran starts again on another free lane. Press Resume to open a new session for this lane on the next tick.`,
      openedAt: saved.paused?.at,
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
export function lanesView(
  store: Store,
  policy: LanePolicy,
  workspace: string,
  { attach = null }: { attach?: ((slot: string) => string | null) | null } = {},
) {
  return laneView(store, policy, workspace).map((lane) => {
    const process = lane.executor === "process";
    return {
      lane: lane.id,
      role: lane.role,
      header: lane.header,
      harness: process
        ? (lane.binding?.harness as string | undefined) || "process"
        : lane.executor,
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
export function laneTable(lanes: ReturnType<typeof lanesView>) {
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
      Math.max(...[head, ...rows].map((row) => String(row[i]).length)),
    );
  return [head, ...rows]
    .map((row) =>
      row
        .map((cell, i) =>
          i === row.length - 1 ? cell : String(cell).padEnd(widths[i]),
        )
        .join("  "),
    )
    .join("\n")
    .concat("\n");
}
