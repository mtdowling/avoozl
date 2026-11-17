// The `process` executor (R93.2, design §4.28): runs an agent CLI as a child
// of this machine's supervisor, in the task worktree, with an approved
// harness definition. It only writes requests to and reads records from the
// supervisor's database; the supervisor owns the children (R95).
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createExecutor } from "../executors.mjs";
import { execFile } from "node:child_process";
import { cliReportCaller } from "../report-match.mjs";
import {
  childRecord,
  childResult,
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
import { commitWorkerChanges, git } from "../git.mjs";
import { sessionStartHold } from "../session-request-eligibility.mjs";
import { spendCapUsd } from "../budget.mjs";
import { healthContext, providerOf } from "../provider-health.mjs";
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
// `budgetFor(task, role)` gives the dollars left on the task's cap, or null,
// which fills the harness's spend cap (R94.6).
export function processExecutor({
  stateDirectory,
  projectFor = () => null,
  budgetFor = () => null,
}) {
  return createExecutor({
    start(role, task, worktree, brief, model, permissionClass) {
      if (!worktree) throw Error("A process session needs the task worktree.");
      const project = projectFor(task) ?? {};
      const sandbox = project.sandbox ?? {};
      const sessionId = `process-${randomUUID()}`;
      const budget = budgetFor(task, role);
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
            // shortcut: set once at start; a resume reuses it, so a resumed
            // round may spend up to it again. Avoozl's own budget stop
            // (R67) still holds the task at its cap.
            ...(typeof budget === "number"
              ? { budget_usd: budget.toFixed(2) }
              : {}),
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
const LOW = new Set(["low", "out"]);

// The plan-quota stop (R94.6a): no new session on a harness whose quota
// reads low or out (R72), judged by the session's model and by the
// harness's name, whose provider is its name up to the first `-` (so
// `claude-code` reads the `claude` provider). Running sessions and their
// messages go on. Returns the hold, or null.
// shortcut: Avoozl cannot tell a plan login from an API login, so a low
// mark stops new `process` sessions on either; add a login field to the
// definition if API logins should keep starting.
export function planQuotaHold(health, { model, harness }) {
  for (const name of [model, harness])
    if (name && LOW.has(health.level(name)))
      return `The ${providerOf(name)} plan quota reads ${health.level(name)}; no new session starts on ${harness}.`;
  return null;
}

// R94.4a: a write worker's worktree has its git directory in the main
// checkout, outside the child's write roots, so the child only edits and
// Avoozl commits the changed files once it exits. Only a linked worktree is
// committed in, never a main checkout. The commit then goes through Verify
// like any worker's (declared and protected paths, checks). Returns the
// commit, or null when nothing changed.
export async function commitChildWork(binding, worktree) {
  const [dir, common] = (
    await git(worktree, [
      "rev-parse",
      "--path-format=absolute",
      "--git-dir",
      "--git-common-dir",
    ])
  ).split("\n");
  if (dir === common)
    throw Error(
      `${worktree} is not a task worktree; Avoozl commits only there.`,
    );
  return commitWorkerChanges(
    worktree,
    `Avoozl task ${binding.taskId}, attempt ${binding.attempt ?? 1}`,
  );
}

// Record a child's result as its session's report, as `runner report` does
// for a chat (R96.2, R96.3): matched by the supervisor's record, the text
// kept as data, and a done report's commit read from the worktree's HEAD,
// never from the child. Avoozl's own commit of the child's edits (R94.4a)
// comes before this read.
export async function finishProcessSession(ops, binding, result) {
  const input =
    result.state === "done"
      ? {
          taskId: binding.taskId,
          kind: "done",
          commit: await new Promise((resolve, reject) =>
            execFile(
              "git",
              ["rev-parse", "HEAD"],
              { cwd: result.worktree },
              (error, out) => (error ? reject(error) : resolve(out.trim())),
            ),
          ),
        }
      : {
          taskId: binding.taskId,
          kind: "blocked",
          text: result.text || "The worker reported blocked.",
        };
  return ops.execute("session.report", input, undefined, {
    caller: cliReportCaller(binding),
  });
}

// Consume this workspace's `process` requests (R93.3: the tick only writes
// them): start each claimed one, bind its session, and queue each message.
// Then record the status of each live `process` session. A write worker
// gets its own task worktree (R88.6), never the main checkout. Never throws
// for one request; returns the errors it saw.
export async function drainProcessRequests(
  store,
  { stateDirectory, prepareWorktree, ops = null },
) {
  const projectFor = (taskId) => {
    const task = store.read().tasks.find((t) => t.id === taskId);
    return store.get("projects", taskRepository(task) || "") ?? null;
  };
  const executor = processExecutor({
    stateDirectory,
    projectFor,
    budgetFor: (taskId, role) => spendCapUsd(store, taskId, role),
  });
  const owner = { executor: PROCESS_EXECUTOR, consumer: CONSUMER };
  const errors = [];
  let health = null;
  // Checked when a start is taken, so a mark set after the tick queued it
  // still holds it.
  const startHold = (request) => {
    if (request.operation === "send") return null;
    health ??= healthContext(store);
    const harness = projectFor(request.task)?.harness ?? DEFAULT_HARNESS;
    return (
      planQuotaHold(health, { model: request.model, harness }) ??
      (spendCapUsd(store, request.task, request.role) === 0
        ? "The task budget is spent."
        : null)
    );
  };
  for (const pending of pendingSessionRequests(store, PROCESS_EXECUTOR)) {
    const taken = takeSessionRequest(store, pending, {
      ...owner,
      eligible: (request, queued) =>
        sessionStartHold(store, request, queued) ?? startHold(request),
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
        const status = await executor.status(binding.slot);
        // Commit before the exit is recorded, so whatever reads the result
        // reads HEAD with the child's work in it. A failed commit keeps the
        // files in the worktree and closes the session unreported, so the
        // retry path resumes there instead of a done at the old HEAD.
        let committed = true;
        if (
          status.startsWith("exited ") &&
          binding.role === "worker" &&
          binding.permissionClass === "write"
        )
          await commitChildWork(
            binding,
            withDatabase(
              stateDirectory,
              (db) => childRecord(db, binding.slot).worktree,
            ),
          ).catch((error) => {
            committed = false;
            errors.push({ id: binding.slot, error: error.message });
          });
        // A finished run's result file is its report (R96.1, R96.3); one
        // with none, a bad one, or done with a non-zero exit closes the
        // session unreported, which takes the retry path (R96.4).
        if (
          status.startsWith("exited ") &&
          ops &&
          committed &&
          !binding.report
        ) {
          const result = withDatabase(stateDirectory, (db) =>
            childResult(db, binding.slot),
          );
          if (result?.state)
            await finishProcessSession(ops, binding, result).catch((error) =>
              errors.push({ id: binding.slot, error: error.message }),
            );
        }
        recordSessionStatus(store, {
          slot: binding.slot,
          status: bindingStatus(status),
        });
      } catch (error) {
        // An unreadable record is not evidence the child is gone.
        errors.push({ id: binding.slot, error: error.message });
      }
  return { errors };
}
