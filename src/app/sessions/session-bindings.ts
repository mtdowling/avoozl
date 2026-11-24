import { bindSessionRequest } from "./session-requests.ts";
import { saveKirocrewIntent } from "../executors/kirocrew.ts";
import { hasPendingSpecDependencies } from "../../spec-dependencies.ts";
import { queryTasks } from "../../query.ts";
// Kiro Crew session bindings: which visible session (slot key) works on which
// task. Kiro Crew owns the sessions; Avoozl keeps only this pointer, and a lost
// pointer is recovered from the session title `avoozl:<task-id> <short title>`.
import { fail, type Store } from "../store/store.ts";
import { resolveTaskId } from "../../task-identity.ts";
import type { Snapshot } from "../../types.ts";
import type { Closure, Finding } from "../delivery/delivery.ts";

// One `session_bindings` row: which session works on which task.
export interface SessionBinding {
  id: string;
  slot: string;
  taskId: string;
  role: string;
  attempt: number;
  title: string | null;
  source: string;
  boundAt: string;
  conductor?: string;
  model?: string;
  agent?: string;
  crew?: string;
  sessionReason?: string;
  commit?: string;
  lane?: string;
  harnessSession?: string;
  executor?: string;
  permissionClass?: unknown;
  worktree?: string;
  context?: unknown;
  status?: string;
  statusAt?: string;
  served?: unknown;
  interrupted?: unknown;
  report?: {
    kind?: string;
    at?: string;
    commit?: string;
    text?: string;
    phase?: string;
    review?: {
      verdict?: string;
      findings?: Finding[];
      closures?: Closure[];
    };
  } | null;
  // The epic context a worker's brief carried (briefContext).
  epicContext?: {
    mode: string;
    sources?: unknown;
    items?: unknown;
    tests?: EpicContextTest[];
  };
  [key: string]: unknown;
}
// One epic-context test result (epic-context.ts).
type EpicContextTest = { name: string; passed: boolean; why?: string };
// What a caller asks to bind; every field is checked here.
export type BindInput = {
  executor?: string;
  requestId?: string;
  slot?: unknown;
  role?: string;
  title?: unknown;
  model?: unknown;
  crew?: unknown;
  agent?: unknown;
  sessionReason?: unknown;
  commit?: unknown;
  lane?: unknown;
  harnessSession?: unknown;
  attempt?: unknown;
  taskId?: unknown;
  source?: unknown;
  permissionClass?: unknown;
  worktree?: string;
  context?: unknown;
  [key: string]: unknown;
};

const ROLES = new Set([
  "worker",
  "responder",
  // A page-opened assistant (session-open.mjs).
  "assist",
  // One plugin check's decide call (check-decide.mjs).
  "check-decide",
]);
// A review role's session (§5.2): `review:<role id>`, so each role numbers its
// own attempts.
const REVIEW_ROLE = /^review:[a-z0-9][a-z0-9-]{0,39}$/;
const isRole = (role: string) => ROLES.has(role) || REVIEW_ROLE.test(role);
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const TITLE = /^avoozl:(\S+)(?:\s|$)/;
const MAX_SLOT = 256;
const MAX_TITLE = 500;
const MAX_ROSTER = 256 * 1024;

// The task ID a session title names, or null when the title is not Avoozl's.
export function taskIdFromSessionTitle(title: unknown) {
  return typeof title === "string" ? title.match(TITLE)?.[1] || null : null;
}

function text(value: unknown, label: string, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    fail(
      `Choose ${/^[aeiou]/.test(label) ? "an" : "a"} ${label} of 1–${max} printable characters.`,
    );
  return (value as string).trim();
}

// The epic context a chat worker's brief carried, from the task's record
// when the tests passed (epic-context EC8.1).
function briefContext(
  store: Store,
  taskId: string,
  role: string,
  executor: string | undefined,
) {
  const last = store.getMeta<{
    tasks?: Record<
      string,
      {
        briefOnly?: boolean;
        given?: boolean;
        sources?: unknown;
        items?: unknown;
        tests?: EpicContextTest[];
      }
    >;
  }>("epicContext")?.tasks?.[taskId];
  return role === "worker" &&
    executor !== "process" &&
    last?.briefOnly &&
    last.given
    ? {
        epicContext: {
          mode: "brief only",
          sources: last.sources,
          items: last.items,
          tests: last.tests,
        },
      }
    : {};
}

function existingTask(store: Store, id: string) {
  const data = store.read(),
    taskId = resolveTaskId(data, id);
  return data.tasks.some((task) => task.id === taskId) ? taskId : null;
}

function bindingsFor(store: Store, taskId: string) {
  return store
    .list<SessionBinding>("session_bindings")
    .filter((binding) => binding.taskId === taskId);
}

// Record one slot for one task before the first brief is sent. Binding the same
// slot again is a no-op that writes nothing. Only a lane's session moves
// between tasks: its ended binding moves to the key
// `<slot>#<boundAt>`, every field kept, and the slot's key holds the new one.
// `guard(taskId)` runs inside the write transaction, before a new binding, so
// a claim is checked and recorded atomically across processes.
export function bindSession(
  store: Store,
  input: BindInput = {},
  {
    guard,
    conductor,
    consumer,
  }: {
    guard?: (taskId: string) => void;
    conductor?: string;
    consumer?: string;
  } = {},
): { binding: SessionBinding; changed: boolean } {
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
      "Choose role worker, responder, assist, check-decide, or review:<id>.",
    );
  if (input.model !== undefined && !MODEL.test(String(input.model)))
    fail("Choose a model name.");
  // The crew, agent, and why (R41.9, R53.10).
  if (
    input.crew !== undefined &&
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(String(input.crew))
  )
    fail("Choose a crew id.");
  if (input.agent !== undefined && !AGENT.test(String(input.agent)))
    fail("Choose an agent name.");
  if (
    input.sessionReason !== undefined &&
    (typeof input.sessionReason !== "string" ||
      input.sessionReason.length > 300)
  )
    fail("A session reason is at most 300 characters.");
  if (input.commit !== undefined && !SHA.test(String(input.commit)))
    fail("Name the subject commit as a full lowercase SHA.");
  if (input.lane !== undefined && !LANE.test(String(input.lane)))
    fail("Choose a lane, such as worker-1 or reviewer-1.");
  if (
    input.harnessSession !== undefined &&
    !/^[0-9a-f-]{36}$/.test(String(input.harnessSession))
  )
    fail("Name the harness session as a UUID.");
  if (
    input.attempt !== undefined &&
    (!Number.isInteger(input.attempt) || (input.attempt as number) < 1)
  )
    fail("Choose a positive whole attempt number.");
  return store.transaction(() => {
    const named = text(input.taskId, "task ID", 200),
      // A responder binds to the issue snapshot it answers (github-respond.mjs).
      taskId =
        (role === "responder" && store.get("github_responses", named)) ||
        // A page-opened assistant binds to its record (session-open.mjs).
        (role === "assist" &&
          store.get("receipts", named)?.kind === "assist-session") ||
        // A decide session binds to its call (check-decide.mjs).
        (role === "check-decide" &&
          store.get("flow_records", named)?.kind === "check-decide")
          ? named
          : existingTask(store, named);
    if (!taskId) fail("Task not found.", 404);
    let current = store.get<SessionBinding>("session_bindings", slot);
    if (
      current &&
      input.lane &&
      current.lane === input.lane &&
      ended(current) &&
      (current.taskId !== taskId ||
        current.role !== role ||
        (input.attempt !== undefined && current.attempt !== input.attempt))
    ) {
      store.put("session_bindings", {
        ...current,
        id: `${slot}#${current.boundAt}`,
      });
      current = null;
    }
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
      (input.attempt as number | undefined) ??
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
    const binding: SessionBinding = {
      id: slot,
      slot,
      taskId,
      role,
      attempt,
      title,
      source: conductor
        ? "conductor"
        : input.source === "title" || input.source === "tick"
          ? input.source
          : "bind",
      // Who took it, for a Crew Mode conductor: its own session slot, or
      // "cli" for the local command line. Set only by runner.take.
      ...(conductor ? { conductor } : {}),
      // The model the session was opened on, and the commit a checks or
      // review session judges (§5.2). Unset means unknown.
      ...(input.model ? { model: input.model as string } : {}),
      ...(input.agent ? { agent: input.agent as string } : {}),
      ...(input.crew && input.crew !== "local"
        ? { crew: input.crew as string }
        : {}),
      ...(input.sessionReason
        ? { sessionReason: input.sessionReason as string }
        : {}),
      ...(input.commit ? { commit: input.commit as string } : {}),
      ...(input.lane ? { lane: input.lane as string } : {}),
      ...(input.harnessSession
        ? { harnessSession: input.harnessSession as string }
        : {}),
      ...(input.executor ? { executor: input.executor } : {}),
      ...(input.permissionClass
        ? { permissionClass: input.permissionClass }
        : {}),
      ...(input.worktree ? { worktree: input.worktree } : {}),
      ...(input.context ? { context: structuredClone(input.context) } : {}),
      // A chat worker's brief named epic context: its skills and reads, and
      // no MCP server (epic-context EC8).
      ...briefContext(store, taskId, role, input.executor),
      boundAt: new Date().toISOString(),
    };
    if (input.requestId)
      bindSessionRequest(store, input, binding, {
        executor: input.executor,
        consumer,
      });
    store.put("session_bindings", binding);
    store.ensureReportSecret();
    return { binding, changed: true };
  });
}

// Rebuild lost bindings from session titles. Sessions that are already bound,
// do not carry an Avoozl title, or name an unknown task are reported, not bound.
export function rediscoverSessions(
  store: Store,
  input: { sessions?: unknown } = {},
) {
  if (!Array.isArray(input.sessions) || input.sessions.length > 1000)
    fail("Provide sessions as a list of up to 1000 {slot, title} entries.");
  const result: {
    bound: SessionBinding[];
    unchanged: SessionBinding[];
    ignored: { slot: string; reason: string }[];
  } = { bound: [], unchanged: [], ignored: [] };
  for (const session of input.sessions as
    | { slot?: unknown; title?: unknown }[]
    | never[]) {
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
    const current = store.get<SessionBinding>("session_bindings", slot);
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

// A lane binding whose task let go of the session: reported done or
// blocked, stopped, or closed.
const ended = (binding: SessionBinding) =>
  binding.interrupted ||
  FINAL_STATUSES.has(String(binding.status)) ||
  binding.status === "gone" ||
  ["done", "blocked"].includes(String(binding.report?.kind));

export function listSessionBindings(store: Store) {
  return store.list<SessionBinding>("session_bindings").reverse();
}

const AGENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LANE = /^(?:worker|reviewer)-[0-9]{1,2}$/;

// Check explicit requests again when the tick consumes them. A request is not
// permission to bypass a spec approval hold, including one on a prerequisite.
export function sessionRequestHold(
  data: Snapshot,
  taskId: string,
  role = "worker",
) {
  const tasks = new Map(data.tasks.map((task) => [task.id, task])),
    incoming = new Map<string, string[]>();
  for (const edge of data.edges)
    if (["requires", "sequence"].includes(edge.kind)) {
      if (!incoming.has(edge.to)) incoming.set(edge.to, []);
      incoming.get(edge.to)!.push(edge.from);
    }
  const seen = new Set<string>(),
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
// privately while the caller reads only the portable intent.
export function requestSession(
  store: Store,
  input: {
    role?: string;
    executor?: unknown;
    repository?: unknown;
    taskId?: unknown;
    agent?: unknown;
    model?: unknown;
    permissionClass?: unknown;
  } = {},
  repositories: { id: string; localCheckout?: unknown }[] = [],
) {
  const role = input.role ?? "worker",
    executor = input.executor ?? "kirocrew",
    repositoryId = text(input.repository, "repository ID", 100);
  if (!ROLES.has(role))
    fail("Choose role worker, responder, assist, or check-decide.");
  if (typeof executor !== "string" || !/^[a-z][a-z0-9-]*$/.test(executor))
    return fail("Choose an executor name.");
  const repository = repositories.find((entry) => entry.id === repositoryId);
  if (!repository?.localCheckout)
    fail("Choose a registered repository with a local checkout.", 404);
  return store.transaction(() => {
    const taskId = existingTask(store, text(input.taskId, "task ID", 200));
    if (!taskId) fail("Task not found.", 404);
    const held = sessionRequestHold(store.read(), taskId, role);
    if (held) fail(held, 409);
    type Intent = {
      id: string;
      repository?: string;
      executor?: string;
      [key: string]: unknown;
    };
    const id = `${taskId}:${role}`,
      row = store.get<Intent & { intent?: Intent }>("session_requests", id),
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

export function listSessionRequests(store: Store) {
  return store
    .list<{ id: string; kind?: string; intent?: unknown }>("session_requests")
    .reverse()
    .flatMap((row) =>
      row.intent
        ? [row.intent]
        : !["start", "send"].includes(String(row.kind))
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
export function statusFromRoster(
  roster: unknown,
  slot: string,
  title: string | null = null,
) {
  if (typeof roster !== "string") return null;
  for (const line of roster.split("\n")) {
    const start = line.indexOf("`" + slot + "`");
    if (start < 0) continue;
    let rest = line.slice(start + slot.length + 2);
    if (title && rest.startsWith(` (${title})`))
      rest = rest.slice(title.length + 3);
    const status = rest.match(/^(?: \(.*?\))? — ([a-z]+)/)?.[1];
    if (status && STATUSES.has(status)) return status;
  }
  return null;
}

// Record what the tick read for a bound slot. A status that has not changed, or
// a slot the roster does not list, writes nothing. `served` is what Kiro Crew
// said about the session's model ({requested, model, withheld, changed}),
// passed by the tick or by the backend's slot read; it is kept on the binding
// as `served`, and left unset by a Kiro Crew that does not report it.
export function recordSessionStatus(
  store: Store,
  input: { slot?: unknown; status?: unknown } = {},
  { served: seen }: { served?: unknown } = {},
) {
  const slot = text(input.slot, "session slot key", MAX_SLOT);
  return store.transaction(() => {
    const binding = store.get<SessionBinding>("session_bindings", slot);
    if (!binding) return fail("Session not bound.", 404);
    if (typeof input.status === "string" && input.status.length > MAX_ROSTER)
      fail("The session roster is too large.");
    const status =
      typeof input.status === "string" && STATUSES.has(input.status)
        ? input.status
        : statusFromRoster(input.status, slot, binding.title);
    // Kiro Crew states nothing about a closed or lost session's model, so
    // the last live reading stands; with none, its null is kept and judged.
    const reading =
      seen && FINAL_STATUSES.has(String(status)) && binding.served
        ? binding.served
        : seen;
    const served =
      reading && JSON.stringify(reading) !== JSON.stringify(binding.served)
        ? reading
        : null;
    if (!served && (!status || binding.status === status))
      return { binding, status, changed: false };
    const next: SessionBinding = {
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
// progress or final report: "wait", "request", or "exhausted" once the missed
// check-in bound is spent. Only an observed idle status counts, so a session
// Avoozl cannot see (disconnected, or a lapsed lease) is never treated as
// missing a check-in.
export function unansweredCheckIns(
  binding: Partial<SessionBinding>,
  checkIn: { at?: string; count?: number } | null | undefined,
) {
  if (
    binding.report?.at &&
    (!checkIn?.at || Date.parse(binding.report.at) > Date.parse(checkIn.at))
  )
    return 0;
  return checkIn?.count || 0;
}

export function checkInStep(
  binding: Partial<SessionBinding>,
  checkIn: { at?: string; count?: number } | null | undefined,
  policy: { checkInMinutes: number; missedCheckIns: number },
  now: number,
) {
  if (binding.status !== "idle" || binding.source !== "tick") return "wait";
  const since = Math.max(
    ...[binding.boundAt, binding.statusAt, binding.report?.at, checkIn?.at]
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value)),
  );
  if (now - since < policy.checkInMinutes * 60_000) return "wait";
  return unansweredCheckIns(binding, checkIn) < policy.missedCheckIns
    ? "request"
    : "exhausted";
}
