// Checks in code (design §5.2 Checks, R7.1, R38): a reported commit's
// declared checks are run by Avoozl itself, not by a verifier chat. The tick
// only queues a run (a `check-run` flow record); the app backend runs the
// queue off the tick's path, one run at a time per repository, each in a
// clean detached worktree at the exact commit, every check as argv with its
// own timeout. The next tick judges the result with the same rules as
// before (verdictCause). A verifier chat opens only for a bar that needs
// judgment: `verify: "agent"` on the task, or a prose-only bar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PUBLISH_RULES, secretReason } from "./content-rules.mjs";
import { commandEvidence, git, withWorkLock } from "./git.mjs";
import { openStops, putSpan } from "./flow.mjs";

export const CHECK_TIMEOUT_MS = 20 * 60_000;
const TAIL_LINES = 20;
const TAIL_CHARS = 2000;
const KIND = "check-run";

// The declared checks as argv: the leaf's own (split on spaces, as the
// verifier brief showed them), else its repository's argv lists. Each is
// named by its argv joined with spaces, as declaredChecks names it.
// shortcut: a task check is split on whitespace, so an argument holding a
// space cannot be written in tasks.md; take argv lists there if one needs it.
export function declaredArgv(task, project) {
  if (task.checks?.length)
    return task.checks.map((check) => String(check).trim().split(/\s+/));
  return (project?.checks || []).map((argv) => [...argv]);
}

// Whether this leaf's bar needs a verifier chat's judgment (§5.2): an
// explicit `verify: "agent"`, or acceptance in prose with no declared check.
export const needsJudgment = (task, project) =>
  task.verify === "agent" || !declaredArgv(task, project).length;

export const checkRuns = (store) => {
  try {
    return store.list("flow_records").filter((r) => r.kind === KIND);
  } catch {
    return [];
  }
};

export const taskCheckRuns = (store, taskId) =>
  checkRuns(store)
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => a.attempt - b.attempt);

// Queue one run for the delivery's commit. Returns the record.
export function queueCheckRun(store, { task, project, commit, attempt, now }) {
  const record = {
    id: `${KIND}:${task.id}:${attempt}`,
    kind: KIND,
    taskId: task.id,
    projectId: project.id,
    commit,
    attempt,
    state: "queued",
    queuedAt: new Date(now ?? Date.now()).toISOString(),
  };
  store.transaction(() => store.put("flow_records", record));
  return record;
}

export const queueCheckRuns = (store, runs, now = Date.now()) =>
  runs.map((run) => queueCheckRun(store, { ...run, now }));

// One output line as it may be stored: a secret or a home path never is.
function redactLine(line, dir) {
  if (secretReason(line)) return "[redacted]";
  if (
    PUBLISH_RULES.some((r) => r.category === "secret" && r.pattern.test(line))
  )
    return "[redacted]";
  return line
    .split(dir)
    .join(".")
    .replace(/\/(?:Users|home)\/[^/\s]+\//g, "~/")
    .replace(/\b[A-Za-z]:\\+Users\\+[^\\\s]+\\+/g, "~\\");
}

export function outputTail(text, dir = "\u0000") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(-TAIL_LINES)
    .map((line) => redactLine(line, dir));
  const tail = lines.join("\n");
  return tail.length > TAIL_CHARS ? tail.slice(-TAIL_CHARS) : tail;
}

// Why a check that ended without an exit code did not run (R38.1).
function notRunCause(result, elapsed, timeoutMs) {
  if (result.signal && elapsed >= timeoutMs)
    return `timed out after ${Math.round(timeoutMs / 1000)} s`;
  if (result.signal) return `stopped by ${result.signal}`;
  return (
    String(result.stderr || "could not start")
      .split("\n")[0]
      .slice(0, 200) || "could not start"
  );
}

// Run every declared check at `commit` in a clean detached worktree, then
// remove it. A worktree that cannot be made at the exact commit runs
// nothing: every check is not run, the checking's failure, not the writer's.
export async function runChecksAt(
  project,
  commit,
  argvs,
  { timeoutMs = CHECK_TIMEOUT_MS, run = commandEvidence } = {},
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-checks-")),
    notRunAll = (why) =>
      argvs.map((argv) => ({
        command: argv.join(" "),
        exitCode: null,
        notRun: why,
      }));
  let head = null;
  try {
    try {
      await git(project.root, ["worktree", "add", "--detach", dir, commit]);
      head = await git(dir, ["rev-parse", "HEAD"]);
    } catch (error) {
      return {
        head,
        checks: notRunAll(
          `no worktree at ${commit.slice(0, 12)}: ${String(error.message).split("\n")[0].slice(0, 160)}`,
        ),
      };
    }
    if (head !== commit)
      return {
        head,
        checks: notRunAll(
          `the worktree is at ${head.slice(0, 12)}, not ${commit.slice(0, 12)}`,
        ),
      };
    const checks = [];
    for (const argv of argvs) {
      const started = Date.now(),
        result = await run(dir, argv, { timeoutMs }),
        elapsed = Date.now() - started,
        tail = outputTail(
          (result.stdout || "") + "\n" + (result.stderr || ""),
          dir,
        );
      checks.push({
        command: argv.join(" "),
        exitCode: Number.isInteger(result.exitCode) ? result.exitCode : null,
        ...(Number.isInteger(result.exitCode)
          ? {}
          : { notRun: notRunCause(result, elapsed, timeoutMs) }),
        durationMs: elapsed,
        ...(tail ? { tail } : {}),
      });
    }
    return { head, checks };
  } finally {
    await git(project.root, ["worktree", "remove", "--force", dir]).catch(
      () => {},
    );
    fs.rmSync(dir, { recursive: true, force: true });
    await git(project.root, ["worktree", "prune"]).catch(() => {});
  }
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
};

// A run left `running` by a process that is gone goes back in the queue.
function requeueOrphans(store) {
  for (const record of checkRuns(store))
    if (record.state === "running" && !alive(record.pid))
      store.transaction(() =>
        store.put("flow_records", {
          ...record,
          state: "queued",
          pid: undefined,
        }),
      );
}

const inFlight = new WeakMap();

// Run the queue: per repository, queued runs oldest first, one at a time,
// under a work lock so another process never runs the same repository at
// once. Nothing starts while all agents are stopped (R64.12). Never throws;
// returns the promise of this pass (one pass per store at a time).
export function drainCheckRuns(store, options = {}) {
  const current = inFlight.get(store);
  if (current) return current;
  const pass = (async () => {
    try {
      requeueOrphans(store);
      const projects = new Set(
        checkRuns(store)
          .filter((r) => r.state === "queued")
          .map((r) => r.projectId),
      );
      await Promise.all(
        [...projects].map((projectId) =>
          drainProject(store, projectId, options).catch(() => {}),
        ),
      );
    } catch {
      // A closed store or a vanished checkout: the next pass tries again.
    } finally {
      inFlight.delete(store);
    }
  })();
  inFlight.set(store, pass);
  return pass;
}

async function drainProject(store, projectId, options) {
  const project = store.get("projects", projectId);
  if (!project?.root) return;
  try {
    await withWorkLock(
      store,
      { id: `checks:${projectId}`, projectId, kind: "checks" },
      async () => {
        for (;;) {
          if (openStops(store).some((s) => s.full)) return;
          const next = checkRuns(store)
            .filter((r) => r.state === "queued" && r.projectId === projectId)
            .sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : 1))[0];
          if (!next) return;
          await runOne(store, project, next, options);
        }
      },
    );
  } catch (error) {
    // Held by integration or another process: the next pass tries again.
    if (!error.contention) throw error;
  }
}

async function runOne(store, project, record, options) {
  const task = store.read().tasks.find((t) => t.id === record.taskId),
    startedAt = new Date().toISOString();
  store.transaction(() =>
    store.put("flow_records", {
      ...record,
      state: "running",
      pid: process.pid,
      startedAt,
    }),
  );
  const argvs = task ? declaredArgv(task, project) : [],
    { head, checks } = await runChecksAt(project, record.commit, argvs, {
      timeoutMs: options.timeoutMs,
      run: options.run,
    }),
    endedAt = new Date().toISOString();
  store.transaction(() =>
    store.put("flow_records", {
      ...store.get("flow_records", record.id),
      state: "finished",
      pid: undefined,
      head,
      checks,
      endedAt,
    }),
  );
  // Flow timing: Avoozl's own check time is the `checks` stage (§4.11).
  putSpan(store, {
    id: `events:${record.taskId}:${record.attempt}:checks:${startedAt}`,
    taskId: record.taskId,
    attempt: record.attempt,
    role: "checks",
    stage: "checks",
    startedAt,
    endedAt,
    source: "events",
    detail: null,
  });
}
