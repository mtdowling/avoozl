// The `process` executor (R93.2, design §4.28): runs an agent CLI as a child
// of this machine's supervisor, in the task worktree, with an approved
// harness definition. It only writes requests to and reads records from the
// supervisor's database; the supervisor owns the children (R95).
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createExecutor } from "../executors.mjs";
import {
  childStatus,
  openSupervisorDatabase,
  requestChild,
  sendChild,
  stopChild,
} from "../supervisor.mjs";
import {
  completeSessionRequest,
  pendingSessionRequests,
  releaseSessionRequest,
  takeSessionRequest,
} from "../session-requests.mjs";
import { bindSession, recordSessionStatus } from "../session-bindings.mjs";
import { sessionStartHold } from "../session-request-eligibility.mjs";
import { taskRepository } from "../../work-model.mjs";

export const PROCESS_EXECUTOR = "process";
// The harness a `process` project runs when it names none.
export const DEFAULT_HARNESS = "claude-code";
const CONSUMER = "supervisor";

// The executor a project's sessions run on: its `executor` setting, else
// `kirocrew` (R93.5; a repository opts in, as the Nupp compiler's does).
export const projectExecutor = (project) =>
  project?.executor === PROCESS_EXECUTOR ? PROCESS_EXECUTOR : "kirocrew";

function withDatabase(stateDirectory, use) {
  const db = openSupervisorDatabase(stateDirectory);
  try {
    return use(db);
  } finally {
    db.close();
  }
}

// `projectFor(task)` names the task's project record, whose `harness` and
// `sandbox` ({writeRoots, allowCommands, network}) shape the child.
export function processExecutor({ stateDirectory, projectFor = () => null }) {
  return createExecutor({
    start(role, task, worktree, brief, model, permissionClass) {
      if (!worktree) throw Error("A process session needs the task worktree.");
      const project = projectFor(task) ?? {};
      const sandbox = project.sandbox ?? {};
      const sessionId = `process-${randomUUID()}`;
      return withDatabase(stateDirectory, (db) =>
        requestChild(db, {
          executor: PROCESS_EXECUTOR,
          sessionId,
          role,
          task,
          worktree,
          harness: project.harness ?? DEFAULT_HARNESS,
          permissionClass,
          model,
          brief,
          values: {
            // The session's own temp folder, outside the shared one's other
            // checkouts and outside the state folder the child cannot reach.
            tmp: path.join(os.tmpdir(), `avoozl-${sessionId}`),
            project_cache_dirs: sandbox.writeRoots ?? [],
          },
          allowCommands: sandbox.allowCommands,
          network: sandbox.network,
        }),
      );
    },
    send: (sessionId, text) =>
      withDatabase(stateDirectory, (db) => sendChild(db, sessionId, text)),
    status: (sessionId) =>
      withDatabase(stateDirectory, (db) => childStatus(db, sessionId)),
    stop: (sessionId) =>
      withDatabase(stateDirectory, (db) => stopChild(db, sessionId)),
  });
}

// The binding status an executor status reads as: an exited child closed
// its session; `gone` follows R88.4 as a vanished chat does.
export function bindingStatus(status) {
  if (status.startsWith("exited ")) return "closed";
  return status;
}

const FINISHED = new Set(["closed", "lost", "gone"]);

// Consume this workspace's `process` requests (R93.3: the tick only writes
// them): start each claimed one, bind its session, and queue each message.
// Then record the status of each live `process` session. A write worker
// gets its own task worktree (R88.6), never the main checkout. Never throws
// for one request; returns the errors it saw.
export async function drainProcessRequests(
  store,
  { stateDirectory, prepareWorktree },
) {
  const projectFor = (taskId) => {
    const task = store.read().tasks.find((t) => t.id === taskId);
    return store.get("projects", taskRepository(task) || "") ?? null;
  };
  const executor = processExecutor({ stateDirectory, projectFor });
  const owner = { executor: PROCESS_EXECUTOR, consumer: CONSUMER };
  const errors = [];
  for (const pending of pendingSessionRequests(store, PROCESS_EXECUTOR)) {
    const taken = takeSessionRequest(store, pending, {
      ...owner,
      eligible: (request, queued) => sessionStartHold(store, request, queued),
    });
    if (!taken) continue;
    const { request, claimToken } = taken;
    try {
      if (request.operation === "send") {
        const outcome = await executor.send(
          request.slot ?? request.sessionId,
          request.text,
        );
        completeSessionRequest(
          store,
          {
            id: request.id,
            claimToken,
            outcome: outcome === "accepted" ? "sent" : "refused",
          },
          owner,
        );
        continue;
      }
      const worktree =
        request.role === "worker" &&
        request.permissionClass === "write" &&
        prepareWorktree
          ? (await prepareWorktree(store, { taskId: request.task })).path
          : request.worktree;
      let sessionId;
      try {
        sessionId = await executor.start(
          request.role,
          request.task,
          worktree,
          request.brief,
          request.model ?? null,
          request.permissionClass,
        );
      } catch (error) {
        // Nothing opened: the request waits for the next pass.
        releaseSessionRequest(
          store,
          { id: request.id, claimToken, reason: "before-open" },
          owner,
        );
        throw error;
      }
      bindSession(
        store,
        {
          slot: sessionId,
          taskId: request.task,
          role: request.role,
          attempt: request.attempt ?? 1,
          ...(request.title ? { title: request.title } : {}),
          source: "tick",
          ...(request.model ? { model: request.model } : {}),
          ...(request.commit ? { commit: request.commit } : {}),
          ...(request.batch ? { batch: request.batch } : {}),
          ...(request.investigate ? { investigate: true } : {}),
          ...(request.worktree ? { worktree: request.worktree } : {}),
          ...(request.context ? { context: request.context } : {}),
          permissionClass: request.permissionClass,
          executor: PROCESS_EXECUTOR,
          requestId: request.id,
          claimToken,
        },
        { consumer: CONSUMER },
      );
    } catch (error) {
      errors.push({ id: request.id, error: error.message });
    }
  }
  for (const binding of store.list("session_bindings"))
    if (binding.executor === PROCESS_EXECUTOR && !FINISHED.has(binding.status))
      try {
        recordSessionStatus(store, {
          slot: binding.slot,
          status: bindingStatus(await executor.status(binding.slot)),
        });
      } catch (error) {
        // An unreadable record is not evidence the child is gone.
        errors.push({ id: binding.slot, error: error.message });
      }
  return { errors };
}
