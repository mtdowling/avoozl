// @ts-nocheck: typing debt
// `avoozl land TASK` and `plans_land` (simplify §D7, SM7.1): land one
// reported task now, by its repository's landing mode, instead of waiting
// for the tick. Only the caller that claimed the task may: the session bound
// to it, or at the command line this machine's own claim or take.
import { callerSlot, integrateVerified } from "../delivery/delivery.ts";
import { landingSettings } from "./landing-config.ts";
import { landingQueue } from "./landing-queue.ts";
import { landDirect } from "./direct-landing.ts";
import { landPullRequests } from "./pr-landing.ts";
import { listSessionBindings } from "../sessions/session-bindings.ts";
import { taskRepository } from "../../work-model.ts";
import { cachedOwnClaims } from "../workers/claims.ts";
import { fail } from "../store/store.ts";

const slotOf = (slot) =>
  slot.startsWith("dashboard:") ? slot.slice("dashboard:".length) : slot;

// Whether this caller claimed `taskId`: a session bound to it, or with no
// session (the command line) a claim branch this machine created or a task
// it took by hand.
export function claimedBy(store, taskId, { caller = null, local = false }) {
  const bindings = listSessionBindings(store).filter(
    (b) => b.taskId === taskId,
  );
  const own = callerSlot(caller);
  if (own) return bindings.some((b) => slotOf(b.slot) === own);
  if (!local) return false;
  return (
    cachedOwnClaims(store).some((claim) => claim.task === taskId) ||
    bindings.some((b) => b.conductor === "cli")
  );
}

// Land `taskId` once: queue its verified commit, then take its repository's
// landing queue one step. Returns {task, mode, state, queue}: the delivery's
// state after the step, and the task's landing queue state when it has one.
export async function landTask(
  store,
  taskId,
  { caller, local, github, workspaceRoot, config },
) {
  const task = store.read().tasks.find((t) => t.id === taskId);
  if (!task) fail(`Task ${taskId} not found.`, 404);
  if (!claimedBy(store, taskId, { caller, local }))
    fail(`${taskId} is not yours to land: claim it first.`, 403);
  const repository = store.get("repositories", taskRepository(task) ?? "");
  if (!repository) fail(`${taskId} names no repository here.`, 409);
  const mode = repository.landing ?? "off",
    before = store.get("task_deliveries", taskId);
  if (before?.state === "verified") {
    const others = store
      .list("task_deliveries")
      .map((d) => d.taskId)
      .filter((id) => id !== taskId);
    await integrateVerified(store, { skip: new Set(others) });
    const options = {
      github,
      workspaceRoot,
      config,
      only: repository.id,
      rounds: (r) => landingSettings(config || {}, r.github, r).maxAttempts,
    };
    if (mode === "direct") await landDirect(store, options);
    if (mode === "pr") await landPullRequests(store, options);
  }
  const delivery = store.get("task_deliveries", taskId),
    queued = landingQueue(store, {
      repositoryId: repository.id,
      base: repository.baseBranch || "main",
    }).find((entry) => entry.key === taskId);
  return {
    task: taskId,
    mode,
    state: delivery?.state ?? "not reported",
    ...(queued ? { queue: queued.waiting?.reason ?? "queued" } : {}),
  };
}
