// Checks in code (design §5.2 Checks, R7.1, R38): a reported commit's
// repository checks are run by Avoozl itself, not by a verifier chat. The tick
// only queues a run (a `check-run` flow record); the app backend runs the
// queue off the tick's path, one run at a time per repository. A run first
// checks the diff's paths (verify.mjs, R86.6); then its checks run warm in
// the task worktree when it is at the exact commit, else in a clean detached
// worktree there, every check as argv with its own timeout (R86.7). The next
// tick judges the result with the same rules as
// before (verdictCause). A verifier chat opens only for a bar that needs
// judgment: `verify: "agent"` on the task, or a repository with no checks.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandEvidence, git, withWorkLock } from "./git.mjs";
import { selectedChecks } from "./repository-checks.mjs";
import { openStops, putSpan, readFlowPolicy } from "./flow.mjs";
import { contentBinding } from "./content-rules.mjs";
import {
  checkTimeout,
  outputTail,
  runEach,
  verifyPaths,
  warmWorktree,
} from "./verify.mjs";

export { outputTail };

export const CHECK_TIMEOUT_MS = 20 * 60_000;
const KIND = "check-run";

// The checks a commit runs: the repository's, keeping a check with paths
// only when `files` (the commit's diff against the base) touches one.
// Without a file list, every check. Tasks never name checks.
export const declaredArgv = (_task, project, files = null) =>
  selectedChecks(project, files);

// Whether this leaf's bar needs a verifier chat's judgment (§5.2): an
// explicit `verify: "agent"`, or a repository with no checks.
export const needsJudgment = (task, project) =>
  task.verify === "agent" || !selectedChecks(project).length;

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

// Run every declared check at `commit` in a clean detached worktree, then
// remove it. A worktree that cannot be made at the exact commit runs
// nothing: every check is not run, the checking's failure, not the writer's.
export async function runChecksAt(
  project,
  commit,
  checks,
  { timeoutMs = CHECK_TIMEOUT_MS, timeoutFor, run = commandEvidence } = {},
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-checks-")),
    notRunAll = (why) =>
      checks.map((check) => {
        const argv = Array.isArray(check) ? check : check.argv;
        return {
          name: Array.isArray(check) ? argv.join(" ") : check.name,
          command: argv.join(" "),
          exitCode: null,
          notRun: why,
        };
      });
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
    const results = await runEach(dir, checks, {
      timeoutFor: timeoutFor || (() => timeoutMs),
      run,
      env: project.checksEnv,
    });
    return { head, checks: results };
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
      waiting: undefined,
      state: "running",
      pid: process.pid,
      startedAt,
    }),
  );
  const flow = readFlowPolicy(contentBinding(store)?.workspaceRoot).for(
      project.id,
    ),
    timeoutFor = (name, command) =>
      checkTimeout(name, flow, options.timeoutMs, command),
    verdict = task
      ? await verifyPaths(store, {
          task,
          project,
          commit: record.commit,
          flow,
        }).catch(() => null)
      : null,
    { files = null, ...paths } = verdict ?? {},
    argvs = task ? declaredArgv(task, project, files) : [],
    held = Boolean(paths.outside?.length || paths.protected?.length),
    warm = held
      ? null
      : await warmWorktree(store, record.taskId, record.commit),
    { head, checks } = held
      ? { head: record.commit, checks: [] }
      : warm
        ? {
            head: record.commit,
            checks: await runEach(warm, argvs, {
              timeoutFor,
              run: options.run,
              env: project.checksEnv,
            }),
          }
        : await runChecksAt(project, record.commit, argvs, {
            timeoutFor,
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
      // The checks this commit's diff picked, by name (R7.1).
      selected: argvs.map((check) => check.name),
      ...(verdict ? { paths } : {}),
      ...(warm ? { warm: true } : {}),
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
