// The driver's tick offers work to worker machines and acknowledges their
// grants (worker-paths WP5, proof wp-p3). With `workers.offerTo` naming one
// or more GitHub logins, each tick, for every spec this machine drives:
//
// - each ready leaf of the spec is offered once to each named login, at the
//   base branch's head, and from then on the tick does not start it here
//   (`offeredTaskIds`);
// - each pending grant request is answered as `spec grants` answers it: the
//   grant branch is made, then the acknowledgment is written.
//
// Without `workers.offerTo` this step does nothing, and `spec offer` and
// `spec grants` stay a person's commands. A worker's pushed result is
// fetched and checked by worker-result-step.mjs.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { taskRepository } from "../work-model.mjs";
import { readyCandidates } from "./delivery.mjs";
import { driverState } from "./driver-generations.mjs";
import { replayJournal } from "./spec-journal.mjs";
import { taskDefinition } from "./task-outcomes.mjs";
import { publishOffer, reserveGrants } from "./worker-grants.mjs";
import { workerId } from "./worker-offers.mjs";

const run = promisify(execFile);
const OFFERED = "worker.offered";
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

// The logins `workers.offerTo` names, checked; throws naming the key.
export function offerLogins(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => LOGIN.test(String(v))))
    throw Error("workers.offerTo is a list of GitHub logins.");
  return [...new Set(value)];
}

// Tasks offered to worker machines: the tick does not start them here.
export const offeredTaskIds = (store) =>
  new Set(Object.keys(store.getMeta(OFFERED) ?? {}));

export async function workerOffersStep(
  store,
  { driving, logins, authorityFor, now = () => new Date().toISOString() },
) {
  const result = { offered: [], acknowledged: [], declined: [], skipped: [] };
  if (!logins.length) return result;
  const offered = store.getMeta(OFFERED) ?? {};
  for (const spec of driving) {
    let authority;
    try {
      authority = await authorityFor(spec);
    } catch (error) {
      result.skipped.push({ spec, reason: error.message });
      continue;
    }
    if (!authority) continue;
    const { journal, options, login, owner, driver } = authority,
      state = driverState(
        await replayJournal(await journal.list(), {
          ...options,
          permission: journal.permission,
        }),
      );
    if (state.held) {
      result.skipped.push({ spec, reason: "the spec's journal is held" });
      continue;
    }
    const driving = { driver, owner, login, spec },
      leaves = readyCandidates(store).filter(
        (task) => (task.planId ?? null) === spec,
      );
    let grants = null,
      baseBranch = null;
    for (const task of leaves) {
      const project = store.get("projects", taskRepository(task));
      if (!project?.root) continue;
      const repository = project.repository || project.id;
      baseBranch = project.baseBranch || "main";
      grants ??= repository;
      const base = (
          await run("git", ["rev-parse", `refs/heads/${baseBranch}`], {
            cwd: project.root,
          })
        ).stdout.trim(),
        definition = taskDefinition({
          id: task.id,
          title: task.title,
          acceptance: task.acceptance ?? null,
        });
      for (const worker of logins) {
        const has = state.offers.some(
          (o) =>
            o.worker === workerId(worker) &&
            o.tasks[0].task === task.id &&
            o.tasks[0].definition === definition,
        );
        if (!has) {
          await publishOffer(
            journal,
            {
              ...driving,
              task: task.id,
              definition,
              worker,
              // The base branch at its head, which a worker can fetch
              // exactly; the working branch lives in this checkout only.
              ref: { repository, branch: baseBranch, commit: base },
              base,
            },
            options,
          );
          result.offered.push({ task: task.id, worker });
        }
      }
      offered[task.id] = { spec, at: offered[task.id]?.at ?? now() };
    }
    grants ??= firstRepository(store, spec);
    if (!grants) continue;
    const answered = await reserveGrants({
      github: authority.github,
      journal,
      options,
      ...driving,
      grants,
      base: baseBranch ?? "main",
      // A worker asks only for its free lanes, so the driver caps nothing.
      // shortcut: a landed worker task writes no outcome record yet, so its
      // grant would count against a cap forever; record one through
      // landIntent when worker results land by the journal's protocol.
      cap: Number.MAX_SAFE_INTEGER,
    });
    result.acknowledged.push(...(answered.acknowledged ?? []));
    result.declined.push(...(answered.declined ?? []));
  }
  store.setMeta(OFFERED, offered);
  return result;
}

// The repository of a spec's first task with a project, or null.
function firstRepository(store, spec) {
  for (const task of store.read().tasks)
    if ((task.planId ?? null) === spec) {
      const project = store.get("projects", taskRepository(task));
      if (project) return project.repository || project.id;
    }
  return null;
}
