// The `process` executor (R93.2, design §4.28): runs an agent CLI as a child
// of this machine's supervisor, in the task worktree, with an approved
// harness definition. It only writes requests to and reads records from the
// supervisor's database; the supervisor owns the children (R95).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createExecutor } from "../executors.mjs";
import { rolePrompt } from "../prompts.mjs";
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
import { healthContext, providerOf } from "../provider-health.mjs";
import { taskRepository } from "../../work-model.mjs";
import { hasRemoteTask } from "../remote-runner.mjs";
import { addEvidence } from "../evidence.mjs";

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
// `harnessFor(task, role)` names the harness a request asked for (R98.3,
// R98.4), or null for the project's.
export function processExecutor({
  stateDirectory,
  projectFor = () => null,
  harnessFor = () => null,
}) {
  return createExecutor({
    start(role, task, worktree, brief, model, permissionClass) {
      if (!worktree) throw Error("A process session needs the task worktree.");
      const project = projectFor(task, worktree) ?? {};
      const sandbox = project.sandbox ?? {};
      const sessionId = `process-${randomUUID()}`;
      return withDatabase(stateDirectory, (db) =>
        requestChild(db, {
          executor: PROCESS_EXECUTOR,
          sessionId,
          role,
          task,
          worktree,
          harness: harnessFor(task, role) ?? project.harness ?? DEFAULT_HARNESS,
          permissionClass,
          model,
          brief: processBrief(role, brief, {
            allowCommands: sandbox.allowCommands,
          }),
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

// A decision on findings (Go ahead, Investigate again, Stop) resumes the
// child: its findings report is history (the investigation row keeps it) and its run is open again.
function reopenAfterFindings(store, slot) {
  const binding = store.get("session_bindings", slot);
  if (binding?.report?.kind !== "findings") return;
  const { report, ...open } = binding;
  void report;
  store.put("session_bindings", {
    ...open,
    status: "working",
    statusAt: new Date().toISOString(),
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

// R97.3: every role runs on `process`. A Kiro Crew chat gets its role's
// prompt from its agent file; a child gets the same prompt file at the top
// of its brief. A worker's brief already holds its steps (processSteps).
const reviewRole = (role) => /^review:/.test(role);
const reportsVerdict = (role) => role === "verifier" || reviewRole(role);
function rolePromptName(role) {
  if (reviewRole(role)) return "reviewer";
  return ["verifier", "retro", "planner"].includes(role) ? role : null;
}

// What a child does instead of the Avoozl tools it cannot reach (R96.1): a
// sandboxed child has no database, so its report is the result file.
const RESULT_LIMIT =
  "Write no other file, keep the result file under 8 KB, then exit.";
// A verdict child runs unattended, so only the project's allow-list runs in
// its shell, and a command line runs only when every part of it is listed
// (P59: a verifier that chained `od` and `cat` onto the check was refused
// and reported blocked).
function allowedShell(allowCommands) {
  if (!allowCommands?.length)
    return "Your shell runs no command here: read files with your file tools.";
  return `Your shell runs only these commands, one per call, with no ; && | or $(...): ${allowCommands
    .map((command) => `\`${command.join(" ")}\``)
    .join(", ")}. Read files with your file tools.`;
}
function processFinish(role, allowCommands) {
  if (reportsVerdict(role))
    return [
      "You run without Avoozl's tools, so these steps replace the worktree and plans_report steps above.",
      "1. Avoozl already added the detached worktree at the commit: it is the current folder. Do not run git worktree add, and read only there.",
      allowedShell(allowCommands),
      '2. Instead of calling plans_report, write .avoozl/result.json in the current folder: {"state": "done", "report": {<every field of the plans_report input except taskId and commit>}}, or {"state": "blocked", "text": "<why>"} if you cannot judge the commit. Avoozl reads the commit from the folder itself.',
      RESULT_LIMIT,
    ];
  if (role === "retro")
    return [
      'You run without Avoozl\'s tools. Instead of answering in chat, write your one JSON reply to .avoozl/result.json in the current folder as {"state": "done", "report": <the reply object>}.',
      RESULT_LIMIT,
    ];
  if (role === "planner")
    return [
      "You run without Avoozl's tools. Write the spec folder's files as above, but skip plans_create_plan, plans_save_plan and every other plans_* call: Avoozl stores the folder once it lints clean. Then exit.",
    ];
  return [];
}

// The brief a `process` child reads: its role's prompt, the brief, then how
// it finishes. A worker's brief is passed as it is. `allowCommands` is the
// project's allow-list, which a verdict child is told.
export function processBrief(role, brief, { allowCommands } = {}) {
  const prompt = rolePromptName(role);
  if (!prompt) return brief;
  return [
    rolePrompt(prompt).trim(),
    "",
    brief,
    "",
    ...processFinish(role, allowCommands),
  ]
    .join("\n")
    .trim();
}

// The project a process session runs in: its task's repository, else the
// repository the request names (a retro), else the project whose checkout is
// the session's folder (a planner).
export function sessionProject(store, { task: taskId, repository, worktree }) {
  const task = store.read().tasks.find((t) => t.id === taskId);
  const id = taskRepository(task) || repository;
  if (id) return store.get("projects", id) ?? null;
  if (!worktree) return null;
  // The project whose checkout holds the folder, the nearest one first.
  const folder = path.resolve(worktree);
  const holds = (project) => {
    const root = project.root && path.resolve(project.root);
    return root && (folder === root || folder.startsWith(root + path.sep));
  };
  return (
    store
      .list("projects")
      .filter(holds)
      .sort((a, b) => b.root.length - a.root.length)[0] ?? null
  );
}

// A verdict role reads one exact commit (R94.4: read-only). The child cannot
// write the git directory, so Avoozl adds the detached worktree its brief
// names before it starts, and removes it after the result is read.
async function prepareDetached(checkout, worktree, commit) {
  if (!checkout) throw Error("A verdict session needs the project checkout.");
  if (!fs.existsSync(worktree))
    await git(checkout, ["worktree", "add", "--detach", worktree, commit]);
  const head = await git(worktree, ["rev-parse", "HEAD"]);
  if (head !== commit)
    throw Error(
      `${worktree} is at ${head.slice(0, 12)}, not ${commit.slice(0, 12)}.`,
    );
  return worktree;
}

// A verdict session whose folder is its own detached worktree, not the
// checkout (the shape planVerifierDispatches gives a `process` project).
const verdictSession = (session, checkout) =>
  reportsVerdict(session.role) &&
  session.permissionClass === "read" &&
  Boolean(session.commit && session.worktree && checkout) &&
  path.resolve(session.worktree) !== path.resolve(checkout);

async function removeDetached(checkout, worktree) {
  if (!checkout || path.resolve(checkout) === path.resolve(worktree)) return;
  await git(checkout, ["worktree", "remove", "--force", worktree]).catch(
    () => {},
  );
  await git(checkout, ["worktree", "prune"]).catch(() => {});
}

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
// comes before this read. A verdict role's report fields come from the
// file's `report`, which session.report checks as it does plans_report; a
// retro's reply is recorded as its chat reply is; a planner's folder is
// stored by the tick's plan import, so its result records nothing.
const VERDICT_FIELDS = ["verdict", "findings", "closures", "checks", "text"];
export async function finishProcessSession(ops, binding, result, store = null) {
  if (binding.role === "retro") {
    if (!store) return null;
    const { recordRetroReply } = await import("../flow-retro.mjs");
    return recordRetroReply(
      store,
      binding.taskId,
      result.state === "done" && result.report
        ? JSON.stringify(result.report)
        : result.state === "done"
          ? result.text
          : "",
    );
  }
  if (binding.role === "planner") return null;
  // A plan-less worker's task is not in a plan: its own runner reads HEAD,
  // runs the checks and pushes (R90.2).
  if (store && hasRemoteTask(store, binding.taskId))
    return ops.execute(
      "remote.report",
      {
        taskId: binding.taskId,
        state: result.state === "done" ? "done" : "blocked",
      },
      { local: true },
    );
  const head = () =>
    new Promise((resolve, reject) =>
      execFile(
        "git",
        ["rev-parse", "HEAD"],
        { cwd: result.worktree },
        (error, out) => (error ? reject(error) : resolve(out.trim())),
      ),
    );
  if (result.state === "findings")
    return ops.execute(
      "session.report",
      { taskId: binding.taskId, kind: "findings", findings: result.report },
      undefined,
      { caller: cliReportCaller(binding) },
    );
  const input =
    result.state === "done"
      ? {
          taskId: binding.taskId,
          kind: "done",
          commit: await head(),
          ...(reportsVerdict(binding.role) && result.report
            ? Object.fromEntries(
                VERDICT_FIELDS.filter(
                  (key) => result.report[key] !== undefined,
                ).map((key) => [key, result.report[key]]),
              )
            : {}),
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
  // Sends, status and stop name only a session; no project is needed.
  const executor = processExecutor({ stateDirectory });
  const owner = { executor: PROCESS_EXECUTOR, consumer: CONSUMER };
  const errors = [];
  let health = null;
  // Checked when a start is taken, so a mark set after the tick queued it
  // still holds it.
  const startHold = (request) => {
    if (request.operation === "send") return null;
    health ??= healthContext(store);
    const harness =
      request.harness ??
      sessionProject(store, request)?.harness ??
      DEFAULT_HARNESS;
    return planQuotaHold(health, { model: request.model, harness });
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
        if (outcome === "accepted") reopenAfterFindings(store, request.slot);
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
      const project = sessionProject(store, request);
      const worktree =
        request.role === "worker" &&
        request.permissionClass === "write" &&
        prepareWorktree &&
        !hasRemoteTask(store, request.task)
          ? (await prepareWorktree(store, { taskId: request.task })).path
          : verdictSession(request, project?.root)
            ? await prepareDetached(
                project.root,
                request.worktree,
                request.commit,
              ).catch((error) => {
                releaseSessionRequest(
                  store,
                  { id: request.id, claimToken, reason: "before-open" },
                  owner,
                );
                throw error;
              })
            : // A retro reads only its brief: a scratch folder of its own.
              request.role === "retro" && !request.worktree
              ? fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-retro-"))
              : request.role === "planner" && request.worktree
                ? (fs.mkdirSync(request.worktree, { recursive: true }),
                  request.worktree)
                : request.worktree;
      let sessionId;
      try {
        sessionId = await processExecutor({
          stateDirectory,
          projectFor: () => project,
          // The harness the request names (R98.3, R98.4), else the project's.
          harnessFor: () => request.harness ?? null,
        }).start(
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
      if (request.investigateSkipped)
        addEvidence(store, request.task, {
          kind: "note",
          source: "avoozl",
          text: `Investigate first was skipped: ${request.investigateSkipped}.`,
          key: `investigate-skipped:${request.task}`,
        });
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
          // A retro that wrote no good result still ends its retro, as
          // failed, so the next one can start.
          if (result?.state || (result && binding.role === "retro"))
            await finishProcessSession(ops, binding, result, store).catch(
              (error) =>
                errors.push({ id: binding.slot, error: error.message }),
            );
        }
        if (status.startsWith("exited ")) {
          const checkout = sessionProject(store, {
            task: binding.taskId,
          })?.root;
          if (verdictSession(binding, checkout))
            await removeDetached(checkout, binding.worktree);
          if (binding.role === "retro" && !binding.worktree) {
            const scratch = withDatabase(
              stateDirectory,
              (db) => childRecord(db, binding.slot)?.worktree,
            );
            if (
              scratch &&
              path.basename(scratch).startsWith("avoozl-retro-") &&
              path.dirname(scratch) === path.resolve(os.tmpdir())
            )
              fs.rmSync(scratch, { recursive: true, force: true });
          }
          // The supervisor's result folder must not stay in a spec folder.
          if (binding.role === "planner" && binding.worktree) {
            const folder = path.join(binding.worktree, ".avoozl");
            fs.rmSync(path.join(folder, "result.json"), { force: true });
            try {
              fs.rmdirSync(folder);
            } catch {
              // Not empty or already gone: leave it.
            }
          }
        }
        // A child that exited with findings waits for Go ahead, as a chat
        // does: idle, not closed (WP3.2).
        const waiting =
          status.startsWith("exited ") &&
          store.get("session_bindings", binding.slot)?.report?.kind ===
            "findings";
        recordSessionStatus(store, {
          slot: binding.slot,
          status: waiting ? "idle" : bindingStatus(status),
        });
      } catch (error) {
        // An unreadable record is not evidence the child is gone.
        errors.push({ id: binding.slot, error: error.message });
      }
  return { errors };
}
