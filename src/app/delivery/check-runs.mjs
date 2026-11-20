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
import { withStrangerChecks } from "../intake/stranger-input.mjs";
import os from "node:os";
import path from "node:path";
import { commandEvidence, git, withWorkLock, remoteGit } from "../git/git.mjs";
import {
  checkApplies,
  repositoryChecks,
  selectedChecks,
} from "../workspace/repository-checks.mjs";
import { pluginChecksOf, pluginOptionsOf } from "../plugins/plugin-checks.mjs";
import { runPluginCheck } from "../plugins/plugin-check-run.mjs";
import { decideAnswer, decideNow } from "../plugins/check-decide.mjs";
import { requireDiskSpace } from "../workspace/disk-space.mjs";
import { openStops, putSpan, readFlowPolicy } from "../flow/flow.mjs";
import { contentBinding } from "../content/content-rules.mjs";
import {
  checkTimeout,
  outputTail,
  notRunChecks,
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
export const declaredArgv = (_task, repository, files = null) =>
  selectedChecks(repository, files);

// Whether this leaf's bar needs a verifier chat's judgment (§5.2): a
// repository with no checks.
export const needsJudgment = (_task, repository) =>
  !selectedChecks(repository).length;

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
export function queueCheckRun(
  store,
  { task, repository, commit, attempt, now },
) {
  const record = {
    id: `${KIND}:${task.id}:${attempt}`,
    kind: KIND,
    taskId: task.id,
    repositoryId: repository.id,
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
  repository,
  commit,
  checks,
  {
    timeoutMs = CHECK_TIMEOUT_MS,
    timeoutFor,
    run = commandEvidence,
    plugin,
  } = {},
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-checks-")),
    notRunAll = (why) => notRunChecks(checks, why);
  let head = null;
  try {
    try {
      await git(repository.root, ["worktree", "add", "--detach", dir, commit]);
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
      env: repository.checksEnv,
      repository,
      plugin,
    });
    return { head, checks: results };
  } finally {
    await git(repository.root, ["worktree", "remove", "--force", dir]).catch(
      () => {},
    );
    fs.rmSync(dir, { recursive: true, force: true });
    await git(repository.root, ["worktree", "prune"]).catch(() => {});
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
      const repositories = new Set(
        checkRuns(store)
          .filter((r) => r.state === "queued")
          .map((r) => r.repositoryId),
      );
      await Promise.all(
        [...repositories].map((repositoryId) =>
          drainRepository(store, repositoryId, options).catch(() => {}),
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

async function drainRepository(store, repositoryId, options) {
  const repository = store.get("repositories", repositoryId);
  if (!repository?.root) return;
  try {
    await withWorkLock(
      store,
      { id: `checks:${repositoryId}`, repositoryId, kind: "checks" },
      async () => {
        const skip = new Set();
        for (;;) {
          if (openStops(store).some((s) => s.full)) return;
          const next = checkRuns(store)
            .filter(
              (r) =>
                r.state === "queued" &&
                r.repositoryId === repositoryId &&
                !skip.has(r.id),
            )
            .sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : 1))[0];
          if (!next) return;
          const ran = await runOne(store, repository, next, options);
          if (ran?.held) return;
          // A run waiting on its decide answers stays queued; the others
          // go on.
          if (ran?.deciding) skip.add(next.id);
        }
      },
    );
  } catch (error) {
    // Held by integration or another process: the next pass tries again.
    if (!error.contention) throw error;
  }
}

// What a phase or branch run checks (plugin-checks D7): the commit, the
// base its `{base}` and diff name, and the changed files between them. A
// commit the checkout lacks is fetched first.
async function stageRange(repository, record) {
  const scope = record.scope,
    root = repository.root;
  if (scope.kind === "branch")
    await remoteGit(
      root,
      [
        "fetch",
        "--quiet",
        "origin",
        `+refs/heads/${scope.branch}:refs/avoozl/heads/${scope.branch}`,
      ],
      { job: "check-in" },
    ).catch(() => {});
  const base =
      scope.kind === "phase"
        ? await git(root, ["rev-parse", `${scope.first}^1`])
        : await git(root, [
            "merge-base",
            record.commit,
            repository.baseBranch || "main",
          ]),
    files = (
      await git(root, [
        "diff",
        "--name-only",
        "--no-renames",
        "-z",
        base,
        record.commit,
      ])
    )
      .split("\0")
      .filter(Boolean);
  return { base, files };
}

// The decide answer a phase or branch check takes from its tasks: needed
// when any task's answer was, pending while any is, else skipped. A task
// with no answer at all counts as needed.
function stageAnswer(store, check, taskIds) {
  const answers = taskIds.map((id) =>
    decideAnswer(
      store,
      id,
      check,
      store.get("task_deliveries", id)?.commit ?? null,
    ),
  );
  if (answers.some((a) => a.state === "needed" || a.state === "none"))
    return { state: "needed" };
  if (answers.some((a) => a.state === "pending")) return { state: "pending" };
  return { state: "skip", reason: answers.find((a) => a.reason)?.reason };
}

async function runOne(store, repository, record, options) {
  const scope = record.scope?.kind ?? "task",
    task =
      scope === "task"
        ? store.read().tasks.find((t) => t.id === record.taskId)
        : null,
    startedAt = new Date().toISOString(),
    plugins = options.plugins ?? pluginChecksOf(store);
  // A stranger's task runs its checks under the stranger rule (VM6.4).
  repository = withStrangerChecks(store, repository, task);
  // A run that will make a worktree waits, queued, while its volume is full.
  const warmAt =
    scope === "task"
      ? await warmWorktree(store, record.taskId, record.commit)
      : null;
  if (!warmAt)
    try {
      requireDiskSpace(
        store,
        os.tmpdir(),
        `The check run of ${record.taskId ?? record.id}`,
      );
    } catch (error) {
      if (!error.lowDisk) throw error;
      store.transaction(() =>
        store.put("flow_records", { ...record, waiting: "low disk" }),
      );
      return { held: true };
    }
  const flow = readFlowPolicy(contentBinding(store)?.workspaceRoot).for(
      repository.id,
    ),
    timeoutFor = (name, command, ownSeconds) =>
      checkTimeout(
        name,
        flow,
        ownSeconds ? ownSeconds * 1000 : options.timeoutMs,
        command,
      ),
    verdict = task
      ? await verifyPaths(store, {
          task,
          repository,
          commit: record.commit,
          flow,
        }).catch(() => null)
      : null,
    range =
      scope === "task"
        ? { base: verdict?.base ?? null, files: verdict?.files ?? null }
        : await stageRange(repository, record).catch(() => ({
            base: null,
            files: null,
          })),
    { files: _files, ...paths } = verdict ?? {},
    files = range.files,
    stage = scope,
    // This stage's checks for the change, then the plugin checks its
    // paths leave out (shown as skipped: paths).
    all = repositoryChecks(repository, plugins).filter(
      (check) =>
        check.stage === stage &&
        (scope === "task" || check.source === "plugin"),
    ),
    skipped = all
      .filter(
        (check) => check.source === "plugin" && !checkApplies(check, files),
      )
      .map((check) => ({
        name: check.name,
        plugin: check.plugin.id,
        filter: "paths",
      })),
    picked = all.filter((check) => checkApplies(check, files)),
    deciding = [],
    diff = () =>
      git(repository.root, ["diff", range.base, record.commit]).catch(() => ""),
    argvs = [];
  // The decide answers (PK3, D5). A task's run also asks the diff calls
  // its phase and branch checks will read.
  if (task)
    for (const check of repositoryChecks(repository, plugins))
      if (check.decide && check.stage !== "task" && checkApplies(check, files))
        await decideNow(store, { task, check, commit: record.commit, diff });
  for (const check of picked) {
    if (!check.decide) {
      argvs.push(check);
      continue;
    }
    const answer = task
      ? await decideNow(store, { task, check, commit: record.commit, diff })
      : stageAnswer(store, check, record.scope?.tasks ?? []);
    if (answer.state === "pending") deciding.push(check.name);
    else if (answer.state === "skip")
      skipped.push({
        name: check.name,
        plugin: check.plugin.id,
        filter: "decide",
        ...(answer.reason ? { reason: answer.reason } : {}),
      });
    else argvs.push(check);
  }
  // One record holds every check of the commit: it waits, queued, while
  // any check is Deciding (D5).
  if (deciding.length) {
    store.transaction(() =>
      store.put("flow_records", {
        ...store.get("flow_records", record.id),
        waiting: `deciding: ${deciding.join(", ")}`,
      }),
    );
    return { deciding: true };
  }
  store.transaction(() =>
    store.put("flow_records", {
      ...store.get("flow_records", record.id),
      waiting: undefined,
      state: "running",
      pid: process.pid,
      startedAt,
    }),
  );
  const held = Boolean(paths.outside?.length || paths.protected?.length),
    warm = held || scope !== "task" ? null : warmAt,
    pluginOptions = pluginOptionsOf(store),
    plugin = (check, dir, timeoutMs) =>
      runPluginCheck(check, {
        store,
        repository,
        root: repository.root,
        dir,
        commit: record.commit,
        base: range.base,
        repo: repository.github || repository.id,
        timeoutMs,
        fresh: record.fresh === true,
        pluginOptions,
        mcpId: store.get("flow_records", record.id)?.mcpIds?.[check.name],
        onMcpId: (id) =>
          store.transaction(() => {
            const now = store.get("flow_records", record.id);
            store.put("flow_records", {
              ...now,
              mcpIds: { ...(now.mcpIds ?? {}), [check.name]: id },
            });
          }),
        ...(options.mcp ?? {}),
      }),
    { head, checks } = held
      ? { head: record.commit, checks: [] }
      : warm
        ? {
            head: record.commit,
            checks: await runEach(warm, argvs, {
              timeoutFor,
              run: options.run,
              env: repository.checksEnv,
              repository,
              plugin,
            }),
          }
        : await runChecksAt(repository, record.commit, argvs, {
            timeoutFor,
            run: options.run,
            plugin,
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
      ...(skipped.length ? { skipped } : {}),
      ...(verdict ? { paths } : {}),
      ...(warm ? { warm: true } : {}),
      endedAt,
    }),
  );
  if (!task) return;
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
