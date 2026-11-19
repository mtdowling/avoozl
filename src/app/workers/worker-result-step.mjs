// The driver's tick checks what a worker machine pushed (worker-paths WP5.3,
// design D8). For each acknowledged grant of a spec this machine drives, it
// reads the head of the task's checkpoint branch on the worker's fork, has
// worker-results.mjs fetch it, check its paths and run the checks again, and
// integrates a verified head into the spec's working branch. A result that
// fails any of that is a failed attempt on the driver, with the reason. A
// task nobody was granted (no grant record) is never read, so a stranger's branch
// is ignored. Each judged head is remembered, so a head is judged once.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { declaredArgv } from "../delivery/check-runs.mjs";
import { driverState } from "./driver-generations.mjs";
import { replayJournal } from "../specs/spec-journal.mjs";
import { expectedCheckpoint, verifyWorkerResult } from "./worker-results.mjs";
import {
  checkpointBranch,
  ensureWorkingBranch,
  integrateVerified,
  sourceRegistry,
  workingBranch,
} from "./working-heads.mjs";

const run = promisify(execFile);
const JUDGED = "worker.results";
const COMPLETING = new Set(["landed", "done", "skipped"]);

// The head of `branch` on a registered repository, or null. Reads only.
export async function remoteHead(registry, repository, branch) {
  try {
    const { stdout } = await run(
      "git",
      ["ls-remote", registry.get(repository).url, `refs/heads/${branch}`],
      { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
    );
    return stdout.split(/\s/)[0] || null;
  } catch {
    return null;
  }
}

const failedAttempt = (store, task, { worker, cause, state, at }) =>
  store.transaction(() => {
    const delivery = store.get("task_deliveries", task.id) ?? {
      id: task.id,
      taskId: task.id,
      state: "running",
      attempts: [],
    };
    store.put("task_deliveries", {
      ...delivery,
      state,
      cause,
      attempts: [
        ...delivery.attempts,
        {
          attempt: (delivery.attempts.at(-1)?.attempt ?? 0) + 1,
          slot: `worker:${worker}`,
          outcome: "failed",
          cause,
          at,
        },
      ],
      updatedAt: at,
    });
  });

// Lands a spec's working branch on its repository's base branch in the
// driver's checkout: a fast-forward, after merging a moved base into the
// working branch first. The checkout must be on its base branch with no
// tracked change; it is never stashed or reset. Throws with the reason.
export async function landWorkingBranch(store, repository, { spec, task, at }) {
  const git = async (...args) =>
      (await run("git", args, { cwd: repository.root })).stdout.trim(),
    base = repository.baseBranch || "main",
    working = `refs/heads/${workingBranch(spec)}`;
  if ((await git("branch", "--show-current")) !== base)
    throw Error(`the checkout is not on ${base}`);
  if (await git("status", "--porcelain", "--untracked-files=no"))
    throw Error("the checkout has changes");
  let head = await git("rev-parse", working);
  const ancestor = await git("merge-base", "--is-ancestor", base, head).then(
    () => true,
    () => false,
  );
  if (!ancestor) {
    // The base moved under the working branch: merge it in, never rebase.
    const tree = (
      await git("merge-tree", "--write-tree", "--no-messages", head, base)
    ).split("\n")[0];
    const merged = await git(
      "commit-tree",
      tree,
      "-p",
      head,
      "-p",
      await git("rev-parse", base),
      "-m",
      `Merge ${base} into ${workingBranch(spec)}`,
    );
    await git("update-ref", working, merged, head);
    head = merged;
  }
  await git("merge", "--ff-only", "-q", head);
  store.mutate(`Land ${task} from a worker machine`, (data) => {
    const found = data.tasks.find((t) => t.id === task);
    if (found)
      found.integration = {
        commit: head,
        branch: workingBranch(spec),
        into: base,
        at,
      };
  });
  const delivery = store.get("task_deliveries", task);
  store.put("task_deliveries", {
    ...(delivery ?? { id: task, taskId: task, attempts: [] }),
    state: "integrated",
    integratedCommit: head,
    into: base,
    updatedAt: at,
  });
  return head;
}

export async function workerResultsStep(
  store,
  {
    driving,
    journalFor,
    github = null,
    sources = {},
    protectedPaths = [],
    verify = verifyWorkerResult,
    headOf = remoteHead,
    now = () => new Date().toISOString(),
  },
) {
  const registry = sourceRegistry(sources),
    judged = store.getMeta(JUDGED) ?? {},
    result = { landed: [], failed: [], waiting: [], notify: [] };
  for (const spec of driving) {
    const found = await journalFor(spec);
    if (!found?.journal || found.journal.unreadable) continue;
    const state = driverState(
      await replayJournal(await found.journal.list(), {
        ...found.options,
        permission: found.journal.permission,
      }),
    );
    if (state.held) continue;
    for (const grant of state.grants) {
      const [{ task: id, definition }] = grant.tasks,
        key = `${spec}:${id}:${definition}`,
        settled = state.outcomes.some(
          (o) =>
            COMPLETING.has(o.kind) &&
            o.task === id &&
            o.definition === definition,
        ),
        offer = state.offers.find(
          (o) =>
            o.worker === grant.worker &&
            o.tasks[0].task === id &&
            o.tasks[0].definition === definition,
        ),
        task = store
          .read()
          .tasks.find((t) => t.id === id && (t.planId ?? spec) === spec),
        repository = task && store.get("repositories", task.repository ?? ""),
        source = offer?.refs?.[0]?.repository;
      if (settled || !offer || !task || !repository?.root || !source) continue;
      const branch = checkpointBranch(spec, id),
        head = await headOf(registry, source, branch);
      if (!head || head === offer.base) {
        result.waiting.push(id);
        continue;
      }
      if (judged[key]?.commit === head) continue;
      const target = {
          repository: repository.github || repository.id,
          base: repository.baseBranch || "main",
        },
        verdict = await verify({
          root: repository.root,
          registry,
          ref: { source: { repository: source, branch, commit: head }, target },
          expected: expectedCheckpoint({
            spec,
            task: id,
            repository: source,
          }),
          spec,
          github,
          declared: task.paths ?? [],
          protectedPaths,
          checks: declaredArgv(task, repository),
        });
      let outcome = verdict.state,
        cause = `the worker's result ${head.slice(0, 12)} was ${verdict.state}: ${verdict.reason ?? verdict.problem ?? "see the checks"}`;
      if (verdict.state === "verified") {
        try {
          await ensureWorkingBranch(repository.root, {
            spec,
            repository: target.repository,
            target,
            baseCommit: offer.base,
          });
          await integrateVerified(repository.root, {
            spec,
            task: id,
            commit: head,
            evidence: verdict.evidence,
          });
          outcome = "landed";
          // The working branch then lands on the base branch here (wp-p3).
          await landWorkingBranch(store, repository, {
            spec,
            task: id,
            at: now(),
          });
        } catch (error) {
          outcome = "held";
          cause = `the worker's result ${head.slice(0, 12)} did not integrate: ${error.message}`;
        }
      }
      judged[key] = { commit: head, state: outcome, at: now() };
      if (outcome === "landed") result.landed.push(id);
      else {
        // A protected path is a person's call; the rest go back as a failed
        // attempt on the driver.
        const decision = outcome === "protected";
        failedAttempt(store, task, {
          worker: grant.worker,
          cause,
          state: decision ? "decision" : "failed",
          at: now(),
        });
        result.failed.push({ task: id, outcome, cause });
        if (decision)
          result.notify.push({
            channel: "decision",
            task: id,
            title: `Avoozl holds ${id}: protected paths`,
            text: cause,
            resume: `Read the worker's diff, then retry ${id} or let it land.`,
          });
      }
    }
  }
  store.setMeta(JUDGED, judged);
  return result;
}
