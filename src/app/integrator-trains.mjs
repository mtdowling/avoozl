// Integrator trains (landing-trains spec, `.kiro/specs/landing-trains/`).
// Finished work waits in a queue as a pushed batch branch; one integrator
// stacks the ready branches and lands them in a train. This module holds the
// queue side (lt-1.2); later tasks add the lease, the train engine and
// failure handling here (design D21). Nothing here force pushes: a batch
// branch is created or fast-forwarded, never replaced.
import { contentBinding } from "./content-rules.mjs";
import { git } from "./git.mjs";
import { branchNameProblem } from "./integration-branch.mjs";
import { loadLayeredConfig } from "./layered-config.mjs";
import { runCheckAt } from "./flow-line.mjs";
import { enqueueLanding } from "./landing-queue.mjs";
import { trainSettings } from "./landing-config.mjs";
import { driverIdOf } from "./spec-scheduler.mjs";
import { taskDefinition } from "./task-outcomes.mjs";
import { fail } from "./store.mjs";
import { taskRepository } from "../work-model.mjs";
import { pushHead, sourceRegistry } from "./working-heads.mjs";

const TABLE = "landing_queue";
const NO_PROMPT = { GIT_TERMINAL_PROMPT: "0" };
const LIVE = ["queued", "in-train", "landed"];

export const isTrainLanding = (project) => project?.landing === "train";

const isAncestor = async (root, older, newer) => {
  try {
    await git(root, ["merge-base", "--is-ancestor", older, newer]);
    return true;
  } catch {
    return false;
  }
};

// The batch branch name for a task: `<prefix><task>` (LT1.1).
export function batchBranch(settings, taskId) {
  const name = `${settings.branchPrefix}${taskId}`,
    problem = branchNameProblem(name);
  if (problem) fail(`Task ${taskId} cannot be queued: ${problem}`, 409);
  return name;
}

// The train settings for one base, or a refusal that names the first
// problem: `landing: train` with no valid block lands nothing (LT15.4).
export function requireTrainSettings(config, base) {
  const settings = trainSettings(config, base),
    policy = config?.landing?.trains?.targets?.[base]?.policy;
  if (!settings || !policy)
    fail(
      `Landing is train, but landing.trains.targets.${base}.policy is not set in .avoozl.json (optimistic or gated).`,
      409,
    );
  return { ...settings, policy };
}

// What a head changed against its fork point, plus the declared paths.
async function footprintOf(root, forkPoint, commit, declared = []) {
  const changed = (
    await git(root, ["diff", "--name-only", `${forkPoint}..${commit}`])
  )
    .split("\n")
    .filter(Boolean);
  return [...new Set([...declared, ...changed])].sort();
}

// Entry keys whose recorded heads this head descends from (D7).
async function builtOnOf(store, root, { projectId, base, key, commit }) {
  const out = [];
  for (const other of store.list(TABLE))
    if (
      other.projectId === projectId &&
      other.base === base &&
      other.key !== key &&
      LIVE.includes(other.state) &&
      other.commit !== commit &&
      (await isAncestor(root, other.commit, commit))
    )
      out.push(other.key);
  return out.sort();
}

// Queues one verified task as a batch branch (LT1.1 to LT1.5).
//
//   source "verify"  the tick, after Verify passed: pushes the exact commit
//                    as the batch branch.
//   source "submit"  `avoozl landing submit`: the branch already exists on
//                    the remote; its head is fetched, checked and queued.
//
// A head that does not descend from the pushed batch branch is refused
// before any push, and the branch and entry stay as they were (LT1.5).
export async function queueBatch(
  store,
  {
    project,
    task,
    commit,
    branch,
    source = "verify",
    config,
    env,
    machine,
    configFile,
    run = runCheckAt,
    now = Date.now(),
  },
) {
  const base = project.baseBranch || "main",
    settings = requireTrainSettings(config, base),
    planId = task?.planId,
    plan = planId ? store.get("plans", planId) : null,
    environment = { ...(env ?? process.env), ...NO_PROMPT };
  if (source === "submit" && plan?.state !== "approved")
    fail(
      `${task?.id ?? "The task"} is not in an approved plan, so its branch cannot be queued. Approve the plan first.`,
      409,
    );
  const driver = planId ? driverIdOf(store, planId) : null;
  if (!driver)
    fail(
      `Take over ${planId ?? "the spec"} before it lands: avoozl spec takeover ${planId ?? "SPEC"}.`,
      409,
    );
  const name = branch ?? batchBranch(settings, task.id);
  if (branchNameProblem(name)) fail(branchNameProblem(name), 400);
  if (!name.startsWith(settings.branchPrefix))
    fail(
      `Branch ${name} does not start with the batch prefix ${settings.branchPrefix}. Rename it, then submit it again.`,
      409,
    );
  const url = await git(project.root, ["remote", "get-url", "origin"]),
    repository = project.repository || `local/${project.id}`,
    remoteOf = async (ref) =>
      (
        await git(
          project.root,
          ["ls-remote", "--heads", url, `refs/heads/${ref}`],
          {
            env: environment,
          },
        )
      ).split(/\s+/)[0] || null;
  const fetchRef = async (ref) => {
    await git(project.root, ["fetch", "--quiet", url, `refs/heads/${ref}`], {
      env: environment,
    });
    return git(project.root, ["rev-parse", "FETCH_HEAD"]);
  };
  const trunk = await fetchRef(base);
  if (source === "submit") commit = await fetchRef(name);
  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) fail("Queue an exact commit.", 400);
  const key = task.id,
    id = `${project.id}\0${base}\0${key}`,
    existing = store.get(TABLE, id);
  if (existing?.state === "in-train")
    fail(
      `${key} is in train ${existing.train} now; queue it again when the train ends.`,
      409,
    );
  // A rewritten head is refused before anything is pushed or changed.
  const pushed = source === "submit" ? commit : await remoteOf(name);
  if (pushed && pushed !== commit) {
    if (
      !(await git(project.root, ["cat-file", "-t", pushed]).catch(() => null))
    )
      await fetchRef(name);
    if (!(await isAncestor(project.root, pushed, commit)))
      fail(
        `${key}: the new head ${commit.slice(0, 12)} does not descend from the pushed ${name} (${pushed.slice(0, 12)}). Merge the branch into your work instead of rewriting it; nothing was changed.`,
        409,
      );
  }
  if (
    existing?.state === "queued" &&
    existing.commit !== commit &&
    !(await isAncestor(project.root, existing.commit, commit))
  )
    fail(
      `${key}: the new head ${commit.slice(0, 12)} does not descend from the queued ${existing.commit.slice(0, 12)}; nothing was changed.`,
      409,
    );
  // Cheap checks: Verify already ran them for the tick; a submitted branch
  // runs them now, before it is queued.
  const cheap = {
    commit,
    source,
    at: new Date(now).toISOString(),
    results: [],
  };
  if (source === "submit") {
    const argvs = settings.validation.cheap.length
      ? settings.validation.cheap
      : (project.checks ?? []);
    for (const argv of argvs) {
      const result = await run(project, commit, argv);
      cheap.results.push({
        command: argv.join(" "),
        exitCode: result.exitCode,
      });
      if (result.exitCode !== 0)
        fail(
          `${key}: the cheap check \`${argv.join(" ")}\` failed at ${commit.slice(0, 12)}. Fix it, then submit again.`,
          409,
        );
    }
  }
  if (source === "verify" && pushed !== commit)
    await pushHead(
      project.root,
      { repository, branch: name, commit },
      sourceRegistry({ [repository]: { url } }),
      { since: trunk, env, machine, configFile, store },
    );
  const forkPoint = await git(project.root, ["merge-base", commit, trunk]),
    extra = {
      branch: name,
      forkPoint,
      builtOn: await builtOnOf(store, project.root, {
        projectId: project.id,
        base,
        key,
        commit,
      }),
      footprint: await footprintOf(project.root, forkPoint, commit, task.paths),
      cheap,
    };
  if (existing?.state === "queued") {
    // Same place in line for a descendant head (LT1.5).
    if (existing.commit === commit && existing.branch === name) return existing;
    return store.transaction(() =>
      store.put(TABLE, { ...existing, commit, ...extra }),
    );
  }
  return enqueueLanding(
    store,
    {
      projectId: project.id,
      base,
      key,
      commit,
      spec: planId,
      driver,
      tasks: [
        {
          task: task.id,
          definition: taskDefinition({
            id: task.id,
            title: task.title,
            acceptance: task.acceptance ?? null,
          }),
        },
      ],
      extra,
    },
    { now },
  );
}

// The tick's path: queue a task that passed Verify, from the workspace's
// own configuration. Returns the delivery with the queued commit recorded.
export async function queueVerified(store, { delivery, project, task, at }) {
  const workspaceRoot = contentBinding(store)?.workspaceRoot;
  if (!workspaceRoot)
    fail("Landing is train, but this workspace has no configuration.", 409);
  const { config } = loadLayeredConfig({ workspaceRoot });
  await queueBatch(store, {
    project,
    task,
    commit: delivery.commit,
    config,
    now: Date.parse(at),
  });
  return { ...delivery, landing: { commit: delivery.commit, queuedAt: at } };
}

// `avoozl landing submit TASK --branch NAME` and its MCP twin: queue a
// branch from a session Avoozl did not start (LT1.4). Refuses a prefix
// mismatch, a task outside an approved plan and a failed cheap check, each
// naming the step.
export async function submitBranch(store, workspaceRoot, input = {}) {
  const task = store.read().tasks.find((t) => t.id === input.taskId);
  if (!task) fail(`Task ${input.taskId ?? ""} was not found.`, 404);
  if (typeof input.branch !== "string" || !input.branch)
    fail("Name the branch to submit: --branch NAME.", 400);
  const project = store.get("projects", taskRepository(task) ?? "");
  if (!isTrainLanding(project))
    fail(`${task.id} is in a repository that does not land in trains.`, 409);
  const { config } = loadLayeredConfig({ workspaceRoot });
  const entry = await queueBatch(store, {
    project,
    task,
    branch: input.branch,
    source: "submit",
    config,
  });
  return { queued: entry.key, branch: entry.branch, commit: entry.commit };
}
