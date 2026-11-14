// Kiro Crew session bindings: which visible session (slot key) works on which
// task. Kiro Crew owns the sessions; Avoozl keeps only this pointer, and a lost
// pointer is recovered from the session title `avoozl:<task-id> <short title>`.
import { fail } from "./store.mjs";
import { resolveTaskId } from "../task-identity.mjs";
import { hasRemoteTask } from "./remote-runner.mjs";

const ROLES = new Set([
  "worker",
  "verifier",
  "responder",
  "planner",
  "retro",
  "pr-review",
  // A review draft chat (review-draft.mjs, RC20).
  "review-draft",
  // Tries to prove a worker's findings wrong (§4.21).
  "falsifier",
  // The routing agent (§4.10): binds to its call, not a task.
  "router",
]);
// A review role's session (§5.2): `review:<role id>`, so each role numbers its
// own attempts.
const REVIEW_ROLE = /^review:[a-z0-9][a-z0-9-]{0,39}$/;
export const isRole = (role) => ROLES.has(role) || REVIEW_ROLE.test(role);
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const TITLE = /^avoozl:(\S+)(?:\s|$)/;
const MAX_SLOT = 256;
const MAX_TITLE = 500;
const MAX_ROSTER = 256 * 1024;

// The task ID a session title names, or null when the title is not Avoozl's.
export function taskIdFromSessionTitle(title) {
  return typeof title === "string" ? title.match(TITLE)?.[1] || null : null;
}

function text(value, label, max) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    fail(
      `Choose ${/^[aeiou]/.test(label) ? "an" : "a"} ${label} of 1–${max} printable characters.`,
    );
  return value.trim();
}

function existingTask(store, id) {
  const data = store.read(),
    taskId = resolveTaskId(data, id);
  // A runner's task exists only as its handed envelope (R84).
  return data.tasks.some((task) => task.id === taskId) ||
    hasRemoteTask(store, id)
    ? taskId
    : null;
}

function bindingsFor(store, taskId) {
  return store
    .list("session_bindings")
    .filter((binding) => binding.taskId === taskId);
}

// Record one slot for one task before the first brief is sent. Binding the same
// slot again is a no-op that writes nothing; a slot never moves between tasks.
// `guard(taskId)` runs inside the write transaction, before a new binding, so
// a claim is checked and recorded atomically across processes.
function batchInput(value, role, leader) {
  if (
    role !== "worker" ||
    !value ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    value.id.length > 1000 ||
    !Array.isArray(value.tasks) ||
    value.tasks.length < 2 ||
    value.tasks.length > 10 ||
    value.tasks.some(
      (id) => typeof id !== "string" || !id || id.length > 200,
    ) ||
    value.tasks[0] !== leader
  )
    fail(
      "A batch is {id, tasks: [leader, ...]} of 2–10 task IDs on a worker binding.",
    );
  return {
    id: value.id,
    tasks: [...value.tasks],
    ...(typeof value.by === "string" ? { by: value.by } : {}),
  };
}

export function bindSession(
  store,
  input = {},
  { guard, conductor, relay } = {},
) {
  const slot = text(input.slot, "session slot key", MAX_SLOT),
    role = input.role ?? "worker",
    title =
      input.title === undefined
        ? null
        : text(input.title, "session title", MAX_TITLE);
  if (!isRole(role))
    fail(
      "Choose role worker, verifier, responder, planner, falsifier, or review:<id>.",
    );
  if (input.model !== undefined && !MODEL.test(input.model))
    fail("Choose a model name.");
  // Placement (§4.10, R41.9, R53.10): the crew, agent, and why.
  if (
    input.crew !== undefined &&
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.crew)
  )
    fail("Choose a crew id.");
  if (input.agent !== undefined && !AGENT.test(input.agent))
    fail("Choose an agent name.");
  if (
    input.placement !== undefined &&
    (!input.placement ||
      typeof input.placement !== "object" ||
      JSON.stringify(input.placement).length > 8000)
  )
    fail("A placement is an object of at most 8000 characters.");
  if (
    input.sessionReason !== undefined &&
    (typeof input.sessionReason !== "string" ||
      input.sessionReason.length > 300)
  )
    fail("A session reason is at most 300 characters.");
  if (input.commit !== undefined && !SHA.test(input.commit))
    fail("Name the subject commit as a full lowercase SHA.");
  if (
    input.attempt !== undefined &&
    (!Number.isInteger(input.attempt) || input.attempt < 1)
  )
    fail("Choose a positive whole attempt number.");
  // A batch worker (§4.11): the leader's binding names every task it runs.
  const batch =
    input.batch === undefined
      ? null
      : batchInput(input.batch, role, text(input.taskId, "task ID", 200));
  return store.transaction(() => {
    if (batch)
      for (const id of batch.tasks)
        if (!existingTask(store, id)) fail(`Batch task ${id} not found.`, 404);
    const named = text(input.taskId, "task ID", 200),
      // A responder binds to the issue snapshot it answers (github-respond.mjs).
      taskId =
        (role === "responder" && store.get("github_responses", named)) ||
        // A retrospective binds to its retro record (§4.11).
        (role === "retro" && store.get("flow_retros", named)) ||
        (role === "router" &&
          store.getMeta("routing.router.batch")?.id === named) ||
        // A code review chat binds to its request (pr-review.mjs).
        (role === "pr-review" &&
          store.get("receipts", named)?.kind === "pr-review") ||
        // A review draft chat binds to its draft (review-draft.mjs).
        (role === "review-draft" &&
          store.get("receipts", named)?.kind === "review-draft")
          ? named
          : existingTask(store, named);
    if (!taskId) fail("Task not found.", 404);
    const current = store.get("session_bindings", slot);
    if (current) {
      if (
        current.taskId !== taskId ||
        current.role !== role ||
        (input.attempt !== undefined && current.attempt !== input.attempt)
      )
        fail(
          `Session ${slot} is already bound to ${current.taskId} as ${current.role} attempt ${current.attempt}.`,
          409,
        );
      return { binding: current, changed: false };
    }
    guard?.(taskId);
    const attempt =
      input.attempt ??
      bindingsFor(store, taskId).filter((binding) => binding.role === role)
        .length + 1;
    if (
      bindingsFor(store, taskId).some(
        (binding) => binding.role === role && binding.attempt === attempt,
      )
    )
      fail(
        `Task ${taskId} already has a ${role} session for attempt ${attempt}.`,
        409,
      );
    const binding = {
      id: slot,
      slot,
      taskId,
      role,
      attempt,
      title,
      source: conductor
        ? "conductor"
        : ["title", "tick"].includes(input.source)
          ? input.source
          : "bind",
      // Who claimed it for a Crew Mode conductor: its own session slot, or
      // "cli" for the local command line. Set only by runner.claim.
      ...(conductor ? { conductor } : {}),
      // The Remote relay chat that opened this worker on its crew and
      // relays its reports (relay.mjs). Set only by plans_relay opened.
      ...(relay ? { relay } : {}),
      // The model the session was opened on, and the commit a checks or
      // review session judges (§5.2). Unset means unknown.
      ...(input.model ? { model: input.model } : {}),
      ...(input.agent ? { agent: input.agent } : {}),
      ...(input.crew && input.crew !== "local" ? { crew: input.crew } : {}),
      ...(input.placement ? { placement: input.placement } : {}),
      ...(input.sessionReason ? { sessionReason: input.sessionReason } : {}),
      ...(input.commit ? { commit: input.commit } : {}),
      ...(batch ? { batch } : {}),
      // A worker opened to investigate first codes only after Go ahead
      // (§4.21).
      ...(input.investigate === true && role === "worker"
        ? { investigate: true }
        : {}),
      boundAt: new Date().toISOString(),
    };
    store.put("session_bindings", binding);
    // A batch (§4.11): one record per batch, for the Flow tab and the views.
    if (binding.batch)
      store.put("flow_batches", {
        id: binding.batch.id,
        tasks: binding.batch.tasks,
        by: binding.batch.by ?? null,
        slot,
        state: "running",
        openedAt: binding.boundAt,
      });
    return { binding, changed: true };
  });
}

// Rebuild lost bindings from session titles. Sessions that are already bound,
// do not carry an Avoozl title, or name an unknown task are reported, not bound.
export function rediscoverSessions(store, input = {}) {
  if (!Array.isArray(input.sessions) || input.sessions.length > 1000)
    fail("Provide sessions as a list of up to 1000 {slot, title} entries.");
  const result = { bound: [], unchanged: [], ignored: [] };
  for (const session of input.sessions) {
    const slot = text(session?.slot, "session slot key", MAX_SLOT),
      named = taskIdFromSessionTitle(session?.title);
    const taskId = named && existingTask(store, named);
    if (!taskId) {
      result.ignored.push({
        slot,
        reason: named ? "unknown-task" : "not-avoozl",
      });
      continue;
    }
    const current = store.get("session_bindings", slot);
    if (current) {
      result.unchanged.push(current);
      continue;
    }
    result.bound.push(
      bindSession(store, {
        taskId,
        slot,
        title: text(session.title, "session title", MAX_TITLE),
        source: "title",
      }).binding,
    );
  }
  return result;
}

export function listSessionBindings(store) {
  return store.list("session_bindings").reverse();
}

const AGENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

// Ask the tick to open one session for one task and role, in the repository's
// Kiro Crew folder, on a named agent. The tick dispatches it while no session is
// bound for that task and role, so a request yields at most one session.
// shortcut: an explicit request stands in for readiness-driven dispatch until
// task 2.7 plans dispatches from the graph.
export function requestSession(store, input = {}, repositories = []) {
  const role = input.role ?? "worker",
    agent = text(input.agent, "agent name", 128),
    repositoryId = text(input.repository, "repository ID", 100);
  if (!ROLES.has(role))
    fail("Choose role worker, verifier, responder, or planner.");
  if (!AGENT.test(agent))
    fail("Choose an agent name of letters, digits, '.', '_', ':', or '-'.");
  const repository = repositories.find((entry) => entry.id === repositoryId);
  if (!repository?.localCheckout)
    fail("Choose a registered repository with a local checkout.", 404);
  return store.transaction(() => {
    const taskId = existingTask(store, text(input.taskId, "task ID", 200));
    if (!taskId) fail("Task not found.", 404);
    const id = `${taskId}:${role}`,
      current = store.get("session_requests", id);
    if (current) {
      if (current.repository !== repositoryId || current.agent !== agent)
        fail(
          `Task ${taskId} already requests a ${role} session in ${current.repository} on ${current.agent}.`,
          409,
        );
      return { request: current, changed: false };
    }
    const request = {
      id,
      taskId,
      role,
      repository: repositoryId,
      agent,
      requestedAt: new Date().toISOString(),
    };
    store.put("session_requests", request);
    return { request, changed: true };
  });
}

export function listSessionRequests(store) {
  return store.list("session_requests").reverse();
}

// Statuses Kiro Crew's `session_status` roster reports (kirocrew-dashboard),
// plus `gone`: the app backend's read of a stock Kiro Crew, which says only
// that the gateway no longer holds the session (session-observer.mjs). Unlike
// closed and lost it is not final: Avoozl cannot tell a finished session from
// a lost one, so a person decides, and a session that reappears reads live.
const STATUSES = new Set([
  "working",
  "queued",
  "idle",
  "closed",
  "lost",
  "unknown",
  "gone",
]);
export const FINAL_STATUSES = new Set(["closed", "lost"]);

// The roster is text: one line per session, "`<slot>` (<title>) — <status>…",
// or "`<slot>` — <status> (…)" for closed and lost rows. The bound title is
// skipped first, so a title holding " — idle" cannot pose as a status.
// Returns the named slot's status, or null when the roster does not list it.
export function statusFromRoster(roster, slot, title = null) {
  if (typeof roster !== "string") return null;
  for (const line of roster.split("\n")) {
    const start = line.indexOf("`" + slot + "`");
    if (start < 0) continue;
    let rest = line.slice(start + slot.length + 2);
    if (title && rest.startsWith(` (${title})`))
      rest = rest.slice(title.length + 3);
    const status = rest.match(/^(?: \(.*?\))? — ([a-z]+)/)?.[1];
    if (STATUSES.has(status)) return status;
  }
  return null;
}

// Record what the tick read for a bound slot. A status that has not changed, or
// a slot the roster does not list, writes nothing. `served` is what Kiro Crew
// said about the session's model ({requested, model, withheld, changed}),
// passed only by the tick; it is kept on the binding as `served`, and left
// unset by a Kiro Crew that does not report it.
export function recordSessionStatus(store, input = {}, { served: seen } = {}) {
  const slot = text(input.slot, "session slot key", MAX_SLOT);
  return store.transaction(() => {
    const binding = store.get("session_bindings", slot);
    if (!binding) fail("Session not bound.", 404);
    if (typeof input.status === "string" && input.status.length > MAX_ROSTER)
      fail("The session roster is too large.");
    const status =
      typeof input.status === "string" && STATUSES.has(input.status)
        ? input.status
        : statusFromRoster(input.status, slot, binding.title);
    // Kiro Crew states nothing about a closed or lost session's model, so
    // the last live reading stands; with none, its null is kept and judged.
    const reading =
      seen && FINAL_STATUSES.has(status) && binding.served
        ? binding.served
        : seen;
    const served =
      reading && JSON.stringify(reading) !== JSON.stringify(binding.served)
        ? reading
        : null;
    if (!served && (!status || binding.status === status))
      return { binding, status, changed: false };
    const next = {
      ...binding,
      ...(status && status !== binding.status
        ? { status, statusAt: new Date().toISOString() }
        : {}),
      ...(served ? { served } : {}),
    };
    store.put("session_bindings", next);
    return { binding: next, status, changed: true };
  });
}
