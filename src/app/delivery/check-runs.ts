// Checks in code (design §5.2 Checks, R7.1, R38): a reported commit's
// repository checks are run by Avoozl itself, with no model call. The tick
// queues a `check-run` flow record and starts a detached runner off its path,
// one runner at a time per repository. A run first
// checks the diff's paths (verify.mjs, R86.6); then its checks run warm in
// the task worktree when it is at the exact commit, else in a clean detached
// worktree there, every check as argv with its own timeout (R86.7). The next
// tick judges the result (verdictCause).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  baseRef,
  commandEvidence,
  git,
  type Repository,
  withWorkLock,
  remoteGit,
} from "../git/git.ts";
import {
  checkApplies,
  repositoryChecks,
} from "../workspace/repository-checks.ts";
import type { RepositoryCheck } from "../workspace/repository-checks.ts";
import { pluginChecksOf, pluginOptionsOf } from "../plugins/plugin-checks.ts";
import { runPluginCheck } from "../plugins/plugin-check-run.ts";
import { decideAnswer, decideNow } from "../plugins/check-decide.ts";
import { requireDiskSpace } from "../workspace/disk-space.ts";
import { openStops, recordSpan, readFlowPolicy } from "../flow/flow.ts";
import { contentBinding } from "../content/content-rules.ts";
import { fail } from "../store/store.ts";
import {
  type Check,
  type CheckRecord,
  checkTimeout,
  type PluginStep,
  outputTail,
  notRunChecks,
  runEach,
  verifyPaths,
  warmWorktree,
} from "./verify.ts";
import type { Store } from "../store/store.ts";
import type { Task } from "../../types.ts";

export { outputTail };

export const CHECK_TIMEOUT_MS = 20 * 60_000;
const KIND = "check-run";

// One queued, running or finished check run (a `check-run` flow record).
export interface CheckRun {
  id: string;
  kind: string;
  taskId?: string;
  repositoryId: string;
  commit: string;
  attempt?: number;
  state: string;
  queuedAt: string;
  pid?: number;
  scope?: { kind: string; branch?: string; first?: string; tasks?: string[] };
  fresh?: boolean;
  mcpIds?: Record<string, string>;
  waiting?: string;
  // The plugin checks a paths or decide filter left out.
  skipped?: {
    name: string;
    plugin?: string;
    filter: string;
    reason?: string;
  }[];
  // A finished run's results, and the checks its diff picked, by name.
  checks?: CheckRecord[];
  selected?: string[];
  [key: string]: unknown;
}
// What runChecksAt and runEach are given.
type RunOptions = Omit<Parameters<typeof runEach>[2], "timeoutFor"> & {
  timeoutFor?: Parameters<typeof runEach>[2]["timeoutFor"];
  timeoutMs?: number;
};
// What a queue pass is given: the plugin checks, the default timeout, a
// check runner and the MCP step options (tests).
export interface DrainOptions {
  plugins?: Parameters<typeof repositoryChecks>[1];
  timeoutMs?: number;
  run?: RunOptions["run"];
  mcp?: Record<string, unknown>;
  repositoryIds?: string[];
}

export const checkRuns = (store: Store): CheckRun[] => {
  try {
    return store.list<CheckRun>("flow_records").filter((r) => r.kind === KIND);
  } catch {
    return [];
  }
};

export const taskCheckRuns = (store: Store, taskId: string) =>
  checkRuns(store)
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => Number(a.attempt) - Number(b.attempt));

// Queue one run for the delivery's commit. Returns the record.
export function queueCheckRun(
  store: Store,
  {
    task,
    repository,
    commit,
    attempt,
    now,
  }: {
    task: { id: string };
    repository: { id: string };
    commit: string;
    attempt: number;
    now?: number;
  },
) {
  const record: CheckRun = {
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

export const queueCheckRuns = (
  store: Store,
  runs: Omit<Parameters<typeof queueCheckRun>[1], "now">[],
  now = Date.now(),
) => runs.map((run) => queueCheckRun(store, { ...run, now }));

// Run every declared check at `commit` in a clean detached worktree, then
// remove it. A worktree that cannot be made at the exact commit runs
// nothing: every check is not run, the checking's failure, not the writer's.
export async function runChecksAt(
  repository: NonNullable<RunOptions["repository"]> & { root: string },
  commit: string,
  checks: Check[],
  {
    timeoutMs = CHECK_TIMEOUT_MS,
    timeoutFor,
    run = commandEvidence,
    plugin,
  }: RunOptions = {},
): Promise<{ head: string | null; checks: CheckRecord[] }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-checks-")),
    notRunAll = (why: string) => notRunChecks(checks, why);
  let head: string | null = null;
  try {
    try {
      await git(repository.root, ["worktree", "add", "--detach", dir, commit]);
      head = await git(dir, ["rev-parse", "HEAD"]);
    } catch (error) {
      return {
        head,
        checks: notRunAll(
          `no worktree at ${commit.slice(0, 12)}: ${String(
            (error as Error).message,
          )
            .split("\n")[0]
            ?.slice(0, 160)}`,
        ),
      };
    }
    if (head !== commit)
      return {
        head,
        checks: notRunAll(
          `the worktree is at ${String(head).slice(0, 12)}, not ${commit.slice(0, 12)}`,
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

const alive = (pid: number | undefined) => {
  // No pid cannot be signalled, so it is not known to be gone.
  if (pid === undefined) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

// A run left `running` by a process that is gone goes back in the queue.
function requeueOrphans(store: Store) {
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

const inFlight = new WeakMap<Store, Promise<void>>();

// Requeue a run whose worker vanished, then name each repository that has
// queued work and no live worker of its own. The tick uses this to start one
// detached check runner per repository without waiting for its commands.
export function runnableCheckRepositories(store: Store) {
  requeueOrphans(store);
  if (openStops(store).some((stop: { full?: boolean }) => stop.full)) return [];
  const records = checkRuns(store),
    running = new Set(
      records
        .filter((record) => record.state === "running" && alive(record.pid))
        .map((record) => record.repositoryId),
    );
  return [
    ...new Set(
      records
        .filter(
          (record) =>
            record.state === "queued" && !running.has(record.repositoryId),
        )
        .map((record) => record.repositoryId),
    ),
  ];
}

// Run the queue: per repository, queued runs oldest first, one at a time,
// under a work lock so another process never runs the same repository at
// once. Nothing starts while all agents are stopped (R64.12). Never throws;
// returns the promise of this pass (one pass per store at a time).
export function drainCheckRuns(store: Store, options: DrainOptions = {}) {
  const current = inFlight.get(store);
  if (current) return current;
  const pass = (async () => {
    try {
      requeueOrphans(store);
      const selected = options.repositoryIds
        ? new Set(options.repositoryIds)
        : null;
      const repositories = new Set(
        checkRuns(store)
          .filter(
            (record) =>
              record.state === "queued" &&
              (!selected || selected.has(record.repositoryId)),
          )
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

async function drainRepository(
  store: Store,
  repositoryId: string,
  options: DrainOptions,
) {
  const repository = store.get<Repository>("repositories", repositoryId);
  if (!repository?.root) return;
  try {
    await withWorkLock(
      store,
      { id: `checks:${repositoryId}`, repositoryId, kind: "checks" },
      async () => {
        const skip = new Set<string>();
        for (;;) {
          if (openStops(store).some((s: { full?: boolean }) => s.full)) return;
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
    if (!(error as { contention?: boolean }).contention) throw error;
  }
}

// What a phase or branch run checks (plugin-checks D7): the commit, the
// base its `{base}` and diff name, and the changed files between them. A
// commit the checkout lacks is fetched first.
async function stageRange(repository: Repository, record: CheckRun) {
  const scope = record.scope ?? { kind: "task" },
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
            await baseRef(root, repository.baseBranch || "main"),
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
function stageAnswer(store: Store, check: RepositoryCheck, taskIds: string[]) {
  const answers = taskIds.map((id) =>
    decideAnswer(
      store,
      id,
      check,
      store.get<{ id: string; commit?: string }>("task_deliveries", id)
        ?.commit ?? null,
    ),
  );
  if (answers.some((a) => a.state === "needed" || a.state === "none"))
    return { state: "needed" };
  if (answers.some((a) => a.state === "pending")) return { state: "pending" };
  return { state: "skip", reason: answers.find((a) => a.reason)?.reason };
}

async function runOne(
  store: Store,
  repository: Repository,
  record: CheckRun,
  options: DrainOptions,
) {
  // The run as stored now; a record removed meanwhile stops the run.
  const current = () =>
    store.get<CheckRun>("flow_records", record.id) ??
    fail(`Check run ${record.id} is gone.`);
  const scope = record.scope?.kind ?? "task",
    task =
      scope === "task"
        ? store.read().tasks.find((t: Task) => t.id === record.taskId)
        : null,
    startedAt = new Date().toISOString(),
    plugins = options.plugins ?? pluginChecksOf(store);
  // A run that will make a worktree waits, queued, while its volume is full.
  const warmAt =
    scope === "task"
      ? await warmWorktree(store, String(record.taskId), record.commit)
      : null;
  if (!warmAt)
    try {
      requireDiskSpace(
        store,
        os.tmpdir(),
        `The check run of ${record.taskId ?? record.id}`,
      );
    } catch (error) {
      if (!(error as { lowDisk?: boolean }).lowDisk) throw error;
      store.transaction(() =>
        store.put("flow_records", { ...record, waiting: "low disk" }),
      );
      return { held: true };
    }
  const flow = readFlowPolicy(contentBinding(store)?.workspaceRoot).for(
      repository.id,
    ),
    timeoutFor = (name: string, command: string, ownSeconds?: number) =>
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
        plugin: check.plugin?.id,
        filter: "paths",
      })),
    picked = all.filter((check) => checkApplies(check, files)),
    deciding: string[] = [],
    diff = () =>
      git(repository.root, ["diff", range.base ?? "", record.commit]).catch(
        () => "",
      ),
    argvs: typeof picked = [];
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
        plugin: check.plugin?.id,
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
        ...current(),
        waiting: `deciding: ${deciding.join(", ")}`,
      }),
    );
    return { deciding: true };
  }
  store.transaction(() =>
    store.put("flow_records", {
      ...current(),
      waiting: undefined,
      state: "running",
      pid: process.pid,
      startedAt,
    }),
  );
  const held = Boolean(verdict?.outside?.length || verdict?.protected?.length),
    warm = held || scope !== "task" ? null : warmAt,
    pluginOptions = pluginOptionsOf(store),
    plugin = (check: PluginStep, dir: string, timeoutMs: number) =>
      // approvedPluginChecks built the plugin block runPluginCheck reads.
      runPluginCheck(check as Parameters<typeof runPluginCheck>[0], {
        store,
        repository,
        root: repository.root,
        dir,
        commit: record.commit,
        base: range.base ?? undefined,
        repo: repository.github || repository.id,
        timeoutMs,
        fresh: record.fresh === true,
        pluginOptions,
        mcpId: store.get<CheckRun>("flow_records", record.id)?.mcpIds?.[
          check.name
        ],
        onMcpId: (id: string) =>
          store.transaction(() => {
            const now = current();
            store.put("flow_records", {
              ...now,
              mcpIds: {
                ...(now?.mcpIds ?? {}),
                [check.name]: id,
              },
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
      ...current(),
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
  recordSpan(store, {
    id: `events:${record.taskId}:${record.attempt}:checks:${startedAt}`,
    taskId: task.id,
    attempt: record.attempt,
    role: "checks",
    stage: "checks",
    startedAt,
    endedAt,
    source: "events",
    detail: null,
  });
}
