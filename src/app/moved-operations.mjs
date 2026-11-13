// Operations from when Avoozl ran its own agents, safety gate, and execution
// targets (design §9). Kiro Crew owns sessions now, so each of these still
// answers by name, with a pointer to where the work went instead of an error
// (Requirement 24.5). Old run, safety, and team rows stay in SQLite as
// read-only history.
import { resolveTaskId } from "../task-identity.mjs";
import { listSessionBindings } from "./session-bindings.mjs";
import { sessionUrl } from "./notifications.mjs";

const SESSIONS =
  "Agent sessions run in Kiro Crew. Steer, answer, interrupt, or resume the task's Kiro Crew session itself.";
const DISPATCH =
  "Avoozl no longer starts agents. The tick opens Kiro Crew sessions for ready leaves; ask for one with plans_request_session {taskId, repository, agent}, or run Crew Mode rounds with plans_next and plans_claim_task.";
const BINDINGS =
  "Kiro Crew sessions are bound to tasks with plans_bind_session; rebuild lost bindings from session titles with plans_rediscover_sessions.";
const RUNTIME = "Kiro Crew owns models, usage, concurrency, and agent routing.";
const SAFETY =
  "The andon gate was replaced by repository rule actions: a pause rule label or a move to the Deferred column pauses a GitHub task, and a resume rule or a move out of Deferred resumes it. Kiro Crew stops a running session. To stop new work in a scope by hand, pull the Andon cord with avoozl flow stop.";
const RESTART = "Kiro Crew starts and restarts the Avoozl app backend.";
const TEAM =
  "Team coordination and execution targets were removed. Kiro Crew sessions are the delivery route, and GitHub issues, assignees, and pull requests hold shared state.";

export const MOVED_OPERATIONS = new Map([
  ...[
    "run.send",
    "run.interrupt",
    "run.resume",
    "run.approvals",
    "run.answer",
    "run.model",
    "run.unsend",
    "run.queue",
    "run.context",
    "driver.open",
    "driver.context",
  ].map((name) => [name, SESSIONS]),
  ...[
    "run.start",
    "batch.start",
    "batch.control",
    "github.start",
    "search.prompt",
    "plan.extract",
    "plan.review.pipeline",
  ].map((name) => [name, DISPATCH]),
  ...["session.discover", "session.register"].map((name) => [name, BINDINGS]),
  ...[
    "models",
    "usage.limits",
    "metrics",
    "concurrency.status",
    "conversations.routing.preview",
    "openhands.profiles",
    "openhands.models",
  ].map((name) => [name, RUNTIME]),
  ...[
    "safety.status",
    "safety.raise",
    "safety.note",
    "safety.interrupt.retry",
    "safety.remediation.request",
    "safety.remediation.grant",
    "safety.remediation.revoke",
    "safety.review",
    "safety.resolve",
    "safety.resume",
    "safety.coordinator.ack",
  ].map((name) => [name, SAFETY]),
  ...[
    "server.restart.status",
    "server.restart.request",
    "server.restart.clear",
  ].map((name) => [name, RESTART]),
  ...[
    "targets.list",
    "targets.pair",
    "targets.unpair",
    "targets.status",
    "jobs.dispatch",
    "jobs.redispatch",
    "jobs.stop",
    "jobs.heartbeat",
    "jobs.status",
    "review.queue",
    "review.request",
    "checkpoint.publish",
    "checkpoint.reconcile",
    "primary.liveState",
    "primary.handover",
    "primary.adopt",
    "primary.rebuild",
  ].map((name) => [name, TEAM]),
]);

// The task an old run-era input names: a taskId, or the task of the run it
// names by id.
function namedTask(store, input) {
  const data = store.read(),
    run = typeof input?.id === "string" ? store.get("runs", input.id) : null,
    id = input?.taskId || run?.taskId || null;
  return id ? resolveTaskId(data, id) : null;
}

// The Kiro Crew sessions bound to one task, with a link to each.
export function kiroCrewSessions(store, taskId) {
  return listSessionBindings(store)
    .filter((binding) => binding.taskId === taskId)
    .map((binding) => ({
      slot: binding.slot,
      role: binding.role,
      attempt: binding.attempt,
      status: binding.status || null,
      url: sessionUrl(binding.slot),
    }));
}

// The answer a moved operation gives: what moved, where to, and the Kiro Crew
// sessions bound to the named task. Writes nothing.
export function movedOperation(store, name, input = {}) {
  const taskId = namedTask(store, input);
  return {
    moved: true,
    operation: name,
    message: MOVED_OPERATIONS.get(name),
    ...(taskId ? { taskId, sessions: kiroCrewSessions(store, taskId) } : {}),
  };
}
