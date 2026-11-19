import { bindSessionRequest } from "./session-requests.mjs";
import { saveKirocrewIntent } from "./executors/kirocrew.mjs";
import { hasPendingSpecDependencies } from "../spec-dependencies.mjs";
import { queryTasks } from "../query.mjs";
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
  // A page-opened assistant (session-open.mjs).
  "assist",
  "pr-review",
  // A review draft chat (review-draft.mjs, RC20).
  "review-draft",
  "plan-review",
  "plan-answer",
  // The AI summary on a task's Overview tab (task-summary.mjs).
  "task-summary",
  // Tries to prove a worker's findings wrong (§4.21).
  "falsifier",
]);
// A review role's session (§5.2): `review:<role id>`, so each role numbers its
// own attempts.
const REVIEW_ROLE = /^review:[a-z0-9][a-z0-9-]{0,39}$/;
const isRole = (role) => ROLES.has(role) || REVIEW_ROLE.test(role);
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

// A `new-plan:<name>` key whose New plan request is still pending; the
// request list is new-plan.mjs's `newPlans` meta entry.
function newPlanRequested(store, id) {
  const pending = store.getMeta("newPlans");
  return (
    id.startsWith("new-plan:") &&
    Array.isArray(pending) &&
    pending.some((entry) => "new-plan:" + entry?.name === id)
  );
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
    // The planner's one-line reason (§4.37), shown on the batch's card.
    ...(typeof value.reason === "string"
      ? { reason: value.reason.slice(0, 200) }
      : {}),
  };
}

export function bindSession(
  store,
  input = {},
  { guard, conductor, consumer } = {},
) {
  if (input.executor && input.executor !== "kirocrew" && !input.requestId)
    fail("Executor bindings require their claimed request.", 403);
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
  // The crew, agent, and why (R41.9, R53.10).
  if (
    input.crew !== undefined &&
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.crew)
  )
    fail("Choose a crew id.");
  if (input.agent !== undefined && !AGENT.test(input.agent))
    fail("Choose an agent name.");
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
        // A code review chat binds to its request (pr-review.mjs).
        (role === "pr-review" &&
          store.get("receipts", named)?.kind === "pr-review") ||
        // A review draft chat binds to its draft (review-draft.mjs).
        (role === "review-draft" &&
          store.get("receipts", named)?.kind === "review-draft") ||
        // A task summary chat binds to its receipt (task-summary.mjs).
        (role === "task-summary" &&
          store.get("receipts", named)?.kind === "task-summary") ||
        // A spec review binds to its revision-bound round, not a task.
        (["plan-review", "plan-answer"].includes(role) &&
          store.get("review_rounds", named)?.spec) ||
        // A page-opened assistant binds to its record (session-open.mjs).
        (role === "assist" &&
          store.get("receipts", named)?.kind === "assist-session") ||
        // New plan's planner binds to its pending request (new-plan.mjs).
        (role === "planner" && newPlanRequested(store, named))
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
      // Who took it, for a Crew Mode conductor: its own session slot, or
      // "cli" for the local command line. Set only by runner.take.
      ...(conductor ? { conductor } : {}),
      // The model the session was opened on, and the commit a checks or
      // review session judges (§5.2). Unset means unknown.
      ...(input.model ? { model: input.model } : {}),
      ...(input.agent ? { agent: input.agent } : {}),
      ...(input.crew && input.crew !== "local" ? { crew: input.crew } : {}),
      ...(input.sessionReason ? { sessionReason: input.sessionReason } : {}),
      ...(input.commit ? { commit: input.commit } : {}),
      ...(batch ? { batch } : {}),
      // A worker opened to investigate first codes only after Go ahead
      // (§4.21).
      ...(input.investigate === true && role === "worker"
        ? { investigate: true }
        : {}),
      ...(input.executor ? { executor: input.executor } : {}),
      ...(input.permissionClass
        ? { permissionClass: input.permissionClass }
        : {}),
      ...(input.worktree ? { worktree: input.worktree } : {}),
      ...(input.context ? { context: structuredClone(input.context) } : {}),
      boundAt: new Date().toISOString(),
    };
    if (input.requestId)
      bindSessionRequest(store, input, binding, {
        executor: input.executor,
        consumer,
      });
    store.put("session_bindings", binding);
    // A retro keeps its chat on its own record, so the Retros page can link
    // it, and a failure can say what became of it.
    if (role === "retro") {
      const retro = store.get("flow_retros", taskId),
        harness = input.requestId
          ? store.get("session_requests", input.requestId)?.request?.harness
          : undefined;
      if (retro)
        store.put("flow_retros", {
          ...retro,
          session: {
            slot,
            executor: binding.executor ?? "kirocrew",
            ...(harness ? { harness } : {}),
            boundAt: binding.boundAt,
          },
        });
    }
    store.ensureReportSecret();
    // A batch (§4.11): one record per batch, for the Flow tab and the views.
    if (binding.batch)
      store.put("flow_batches", {
        id: binding.batch.id,
        tasks: binding.batch.tasks,
        by: binding.batch.by ?? null,
        reason: binding.batch.reason ?? null,
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

// Check explicit requests again when the tick consumes them. A request is not
// permission to bypass a spec approval hold, including one on a prerequisite.
export function sessionRequestHold(data, taskId, role = "worker") {
  const tasks = new Map(data.tasks.map((task) => [task.id, task])),
    incoming = new Map();
  for (const edge of data.edges)
    if (["requires", "sequence"].includes(edge.kind)) {
      if (!incoming.has(edge.to)) incoming.set(edge.to, []);
      incoming.get(edge.to).push(edge.from);
    }
  const seen = new Set(),
    queue = [taskId];
  for (let at = 0; at < queue.length; at++) {
    const id = queue[at];
    if (seen.has(id)) continue;
    seen.add(id);
    if (hasPendingSpecDependencies(tasks.get(id)))
      return (
        "Task " + taskId + " waits for referenced spec approval at " + id + "."
      );
    queue.push(...(incoming.get(id) || []));
  }
  if (role === "worker") {
    const task = tasks.get(taskId);
    if (
      !task ||
      !queryTasks(data, { scope: "all", q: "ready:true" }).some(
        (row) => row.id === taskId,
      )
    )
      return "Task " + taskId + " is not ready for a worker session.";
  }
  return null;
}

// Explicit requests keep their existing API; provider configuration is adapted
// privately while the planner reads only the portable intent.
export function requestSession(store, input = {}, repositories = []) {
  const role = input.role ?? "worker",
    executor = input.executor ?? "kirocrew",
    repositoryId = text(input.repository, "repository ID", 100);
  if (!ROLES.has(role))
    fail("Choose role worker, verifier, responder, or planner.");
  if (typeof executor !== "string" || !/^[a-z][a-z0-9-]*$/.test(executor))
    fail("Choose an executor name.");
  const repository = repositories.find((entry) => entry.id === repositoryId);
  if (!repository?.localCheckout)
    fail("Choose a registered repository with a local checkout.", 404);
  return store.transaction(() => {
    const taskId = existingTask(store, text(input.taskId, "task ID", 200));
    if (!taskId) fail("Task not found.", 404);
    const held = sessionRequestHold(store.read(), taskId, role);
    if (held) fail(held, 409);
    const id = `${taskId}:${role}`,
      row = store.get("session_requests", id),
      current = row?.intent ?? row;
    if (
      current &&
      (current.repository !== repositoryId ||
        (current.executor ?? "kirocrew") !== executor)
    )
      fail(
        `Task ${taskId} already requests a ${role} session in ${current.repository}.`,
        409,
      );
    const compatibility =
      executor === "kirocrew" && input.agent !== undefined
        ? saveKirocrewIntent(store, id, input)
        : {};
    if (current)
      return { request: { ...current, ...compatibility }, changed: false };
    const request = {
      id,
      kind: "intent",
      taskId,
      role,
      repository: repositoryId,
      executor,
      ...(input.model ? { model: input.model } : {}),
      ...(input.permissionClass
        ? { permissionClass: input.permissionClass }
        : {}),
      requestedAt: new Date().toISOString(),
    };
    store.put("session_requests", request);
    return { request: { ...request, ...compatibility }, changed: true };
  });
}

export function listSessionRequests(store) {
  return store
    .list("session_requests")
    .reverse()
    .flatMap((row) =>
      row.intent
        ? [row.intent]
        : !["start", "send"].includes(row.kind)
          ? [row]
          : [],
    );
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
// passed by the tick or by the backend's slot read; it is kept on the binding
// as `served`, and left unset by a Kiro Crew that does not report it.
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

// What to do about a session the cron opened that ended its turn without a
// done or blocked report: "wait", "nudge", or "exhausted" once the nudge bound
// is spent. Only an observed idle status counts, so a session Avoozl cannot see
// (disconnected, or a lapsed lease) is never treated as quiet.
export function quietStep(binding, nudge, policy, now) {
  if (binding.status !== "idle" || binding.source !== "tick") return "wait";
  const since = Math.max(
    ...[binding.boundAt, binding.statusAt, binding.report?.at, nudge?.at]
      .filter(Boolean)
      .map((value) => Date.parse(value)),
  );
  if (now - since < policy.quietMinutes * 60_000) return "wait";
  return (nudge?.count || 0) < policy.nudges ? "nudge" : "exhausted";
}
