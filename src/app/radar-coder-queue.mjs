// The Release queue and the Step click (RC4.5, design D6). The queue reads the
// store only, in the order the engine releases, and gives each task one
// reason: why it is released, claimed, next, or held. It repeats the engine's
// own rules (graph, stop, phase, mode, capacity) and writes nothing.
import { statusComplete } from "../model.mjs";
import { isManual, taskKind } from "../work-model.mjs";
import { fail } from "./store.mjs";
import { graphOrder } from "./delivery.mjs";
import { openStops, stopScope } from "./flow.mjs";
import { pausedTaskIds } from "./github-project.mjs";
import { phaseHeldTasks, stoppedTasks } from "./github-projection.mjs";
import {
  isRadarRepository,
  releaseFor,
  scopeLabelOf,
  stepReceiptId,
} from "./radar-coder-release.mjs";

const BLOCKING = new Set(["requires", "sequence"]);
const phaseOf = (task) => task.phase?.id ?? "";
const phaseName = (task) => task.phase?.title || task.phase?.id || "No phase";

// The repository a projected task lives in; null when it has none yet.
const repositoryOf = (store, task) =>
  task.github?.repository ??
  store
    .list("github_repositories")
    .find((entry) => entry.projectId === task.projectId)?.id ??
  null;

// Phases of one plan in release order, each with whether its click is done.
function stepsOf(store, data, plan) {
  const seen = new Map();
  for (const task of data.tasks)
    if (task.planId === plan.id && task.authority !== "local")
      if (!seen.has(phaseOf(task)))
        seen.set(phaseOf(task), {
          planId: plan.id,
          phase: phaseOf(task),
          title: phaseName(task),
          released: Boolean(
            store.get("receipts", stepReceiptId(plan.id, task)),
          ),
        });
  return [...seen.values()];
}

export function releaseQueue(store, identity) {
  const data = store.read(),
    complete = (status) => statusComplete(data, status),
    order = graphOrder(data),
    paused = pausedTaskIds(store),
    stops = openStops(store).filter((stop) => !stop.runAnyway),
    claims = store.getMeta("radarClaims")?.repositories ?? {},
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    plans = new Map(store.list("plans").map((plan) => [plan.id, plan])),
    repositories = new Map();
  const candidates = data.tasks.filter(
    (task) =>
      task.planId &&
      task.authority !== "local" &&
      taskKind(task) === "leaf" &&
      plans.get(task.planId)?.state === "approved" &&
      isRadarRepository(
        identity.repositories?.[repositoryOf(store, task)],
        identity.mode,
      ),
  );
  const repositoryName = (task) => repositoryOf(store, task),
    stopped = stoppedTasks(store, data, identity, candidates, repositoryName),
    phased = phaseHeldTasks(data, identity, candidates, repositoryName);
  for (const task of [...candidates].sort(order)) {
    const id = repositoryOf(store, task);
    if (!id) continue;
    const release = releaseFor(identity.repositories?.[id], identity.mode),
      ready =
        identity.repositories?.[id]?.managedLabels?.ready ||
        store.get("github_repositories", id)?.label ||
        "ready",
      label = scopeLabelOf(task, release, ready),
      entry = repositories.get(id) ?? {
        repository: id,
        ready,
        mode: release.mode,
        capacity: release.capacity,
        scopes: release.scopes,
        rows: [],
        steps: [],
      };
    repositories.set(id, entry);
    if (complete(task.status) || task.githubVerdict?.state === "order")
      continue;
    const claim = (claims[id]?.rows ?? []).find(
        (row) => row.number === task.github?.number,
      ),
      open = data.edges
        .filter((edge) => edge.to === task.id && BLOCKING.has(edge.kind))
        .map((edge) => byId.get(edge.from))
        .filter((blocker) => blocker && !complete(blocker.status)),
      stop = stops.find((entryStop) =>
        stopScope(store, data, entryStop).has(task.id),
      ),
      phase = phased.get(task.id),
      plan = plans.get(task.planId);
    let state = "next",
      reason = "Next in line.";
    if (paused.has(task.id)) {
      state = "held";
      reason = "Deferred on the Project board.";
    } else if (stopped.has(task.id)) {
      state = "held";
      reason = `The line is stopped: ${stop?.reason || "see Stop the line"}.`;
    } else if (open.length) {
      state = "held";
      reason = `Waiting on ${open.map((blocker) => blocker.id).join(", ")}.`;
    } else if (phase) {
      state = "held";
      reason = `Phase ${phaseName(task)} waits for phase ${phase.previous} to merge (${phase.waiting.join(", ")}).`;
    } else if (claim) {
      state = "claimed";
      reason = claim.crewName ? `Claimed by ${claim.crewName}.` : "Claimed.";
    } else if (task.dispatch?.ready) {
      state = "released";
      reason = "Ready label is on. A crew has not claimed it yet.";
    } else if (release.mode === "hold") {
      state = "held";
      reason =
        "Release mode is Hold. Add the ready label by hand to release it.";
    } else if (
      release.mode === "step" &&
      !store.get("receipts", stepReceiptId(task.planId, task))
    ) {
      state = "held";
      reason = `Step: waiting for a click to release phase ${phaseName(task)}.`;
    }
    entry.rows.push({
      taskId: task.id,
      title: task.title,
      planId: task.planId,
      spec: plan?.spec ?? null,
      phase: phaseName(task),
      scope: task.releaseScope ?? null,
      label,
      number: task.github?.number ?? null,
      url: task.github?.url ?? null,
      manual: isManual(task),
      state,
      reason,
    });
  }
  // Slots in use per scope, and who waits for one.
  for (const entry of repositories.values()) {
    const used = new Map();
    for (const row of entry.rows)
      if (["released", "claimed"].includes(row.state))
        used.set(row.label, (used.get(row.label) ?? 0) + 1);
    for (const row of entry.rows) {
      const cap =
        row.label === "ready" ||
        !entry.scopes.some((s) => s.label === row.label)
          ? entry.capacity
          : entry.scopes.find((s) => s.label === row.label).capacity;
      row.used = used.get(row.label) ?? 0;
      row.capacity = cap;
      if (row.state === "next" && row.used >= cap) {
        row.state = "held";
        row.reason =
          cap === 0
            ? "Capacity is 0, so nothing is released."
            : `Waiting for a free slot (${row.used} of ${cap} in use).`;
      }
    }
    for (const plan of plans.values())
      if (
        plan.state === "approved" &&
        entry.rows.some((r) => r.planId === plan.id)
      )
        entry.steps.push(
          ...stepsOf(store, data, plan).map((step) => ({
            ...step,
            spec: plan.spec ?? null,
          })),
        );
  }
  return {
    repositories: [...repositories.values()].filter(
      (entry) => entry.rows.length,
    ),
  };
}

// The Step click (RC4.5): releases the next phase of a plan that has no click
// yet. The tick labels its tasks, up to capacity, on its next pass.
export function releaseStep(store, input = {}, { by, now = Date.now() } = {}) {
  const plan = store.get("plans", String(input.planId ?? ""));
  if (!plan || plan.state !== "approved")
    fail("That plan is not approved.", 404);
  const data = store.read(),
    next = stepsOf(store, data, plan).find((step) => !step.released);
  if (!next) fail("Every phase of this plan is already released.", 409);
  store.put("receipts", {
    id: `release-step:${plan.id}:${next.phase}`,
    planId: plan.id,
    phase: next.phase,
    by,
    at: new Date(now).toISOString(),
  });
  return { planId: plan.id, phase: next.phase, title: next.title };
}

// Plans whose release inputs changed since the tick last projected them: the
// capacity, scopes and mode of their repositories, and their Step clicks.
// The first look records and changes nothing.
const FINGERPRINT = "releaseFingerprint";
function fingerprints(store, identity) {
  const data = store.read(),
    out = {};
  for (const task of data.tasks) {
    if (!task.planId || task.authority === "local") continue;
    const id = repositoryOf(store, task);
    if (!id || !isRadarRepository(identity.repositories?.[id], identity.mode))
      continue;
    out[task.planId] ??= {
      release: releaseFor(identity.repositories?.[id], identity.mode),
      steps: [],
    };
    const receipt = store.get("receipts", stepReceiptId(task.planId, task));
    if (receipt && !out[task.planId].steps.includes(phaseOf(task)))
      out[task.planId].steps.push(phaseOf(task));
  }
  return Object.fromEntries(
    Object.entries(out).map(([planId, value]) => [
      planId,
      JSON.stringify(value),
    ]),
  );
}

export function releaseChangedPlanIds(store, identity) {
  const now = fingerprints(store, identity),
    before = store.getMeta(FINGERPRINT);
  if (!before) {
    if (Object.keys(now).length) store.setMeta(FINGERPRINT, now);
    return new Set();
  }
  return new Set(
    Object.keys(now).filter((planId) => before[planId] !== now[planId]),
  );
}

export function releaseRecorded(store, identity, planIds) {
  if (!planIds.length) return;
  const now = fingerprints(store, identity),
    before = store.getMeta(FINGERPRINT) ?? {};
  for (const planId of planIds) before[planId] = now[planId];
  store.setMeta(FINGERPRINT, before);
}
