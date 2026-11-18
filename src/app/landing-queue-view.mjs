// Dashboards › Landing queue (Requirement 92.7, design §4.27, task 44.5):
// what waits to land, one group per repository and target base, in landing
// order, and why each held item is held.
//
// - Read from the store only: the landing queue (41.2, 41.3), the deliveries
//   and worktrees, open line stops, and the link sets (44.1) for the pull
//   request, branch and cached check state. It takes no GitHub client and
//   runs no git, so Refresh only redraws.
// - In each group the queued portions come first, in queue order. After them
//   come tasks that left the queue and will come back: a conflict or failed
//   checks sent to the worker chat, and a verified task held for a protected
//   path.
// - Hold reasons, first match wins: line stopped, landing off, then for the
//   head the stored wait (review missing, checks pending) or the cached
//   checks (failing, pending); every other queued portion is behind the ones
//   before it.
import { linkSets } from "./scm-links.mjs";
import { pausedBy, taskIds } from "./landing-queue.mjs";
import { readyEntries, runningTrain } from "./integrator-trains.mjs";
import { taskRepository } from "../work-model.mjs";

const TABLE = "landing_queue";
const BACK = new Set(["conflict", "failed"]);

function listOr(store, table) {
  try {
    return store.list(table);
  } catch {
    return [];
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Check names from a stored wait, at most a few.
const names = (checks, keep) => {
  const shown = (checks ?? [])
    .filter(keep)
    .map((c) => c.command)
    .filter((name) => typeof name === "string" && name)
    .slice(0, 3);
  return shown.length ? `: ${shown.join(", ")}` : "";
};

const pending = (c) => c.conclusion == null || c.conclusion === "pending";

function stopHold(stop) {
  const why =
    typeof stop.reason === "string" && stop.reason.trim()
      ? `: ${stop.reason.trim().slice(0, 200)}`
      : "";
  return { kind: "stopped", text: `Line stopped${why}.` };
}

// Why a queued portion waits, at its place in its queue.
function queuedHold(store, entry, position, project, checks) {
  const stop = pausedBy(store, entry);
  if (stop) return stopHold(stop);
  if (project?.landing === "off")
    return { kind: "off", text: "Landing is off for this repository." };
  if (position > 0)
    return {
      kind: "behind",
      text: `Behind ${plural(position, "portion")}.`,
    };
  const wait = entry.waiting?.candidate ? entry.waiting : null;
  if (wait?.reason === "review")
    return { kind: "review", text: "Review missing on this head." };
  if (checks?.current && checks.state === "fail")
    return { kind: "failing", text: "Checks failing on this head." };
  if (wait)
    return {
      kind: "pending",
      text: `Checks pending${names(wait.checks, pending)}.`,
    };
  if (checks?.current && checks.state === "pending")
    return { kind: "pending", text: "Checks pending." };
  return { kind: "next", text: "Next to land." };
}

// Why an entry of an integrator train target waits (landing-trains LT14.1):
// in a train and its step, held with the reason, or waiting for a train.
function trainHold(store, entry, { running, held }) {
  if (entry.state === "in-train") {
    const step =
      running?.id === entry.train
        ? (running.current ?? running.steps.at(-1)?.name)
        : null;
    return {
      kind: "train",
      text: `In ${entry.train}${step ? `, step ${step}` : ""}.`,
    };
  }
  const stop = pausedBy(store, entry);
  if (stop) return stopHold(stop);
  const reason = held.get(entry.key);
  if (reason) return { kind: "held", text: `Held: ${reason}.` };
  return {
    kind: "waiting",
    text: running
      ? `Waiting for the next train; ${running.id} is running.`
      : "Waiting for the next train.",
  };
}

// Why a task that left the queue waits: back with its worker, or a person.
function backHold(entry, delivery) {
  const conflict = entry.state === "conflict",
    rounds = (conflict ? delivery.landingConflicts : delivery.landingFailures)
      ?.length,
    round = rounds ? ` round ${rounds}` : "";
  if (delivery.state === "decision")
    return {
      kind: conflict ? "conflict" : "failing",
      text: `${conflict ? "Conflict" : "Checks failed"}; needs you.`,
    };
  return conflict
    ? { kind: "conflict", text: `Conflict${round}: back with the worker.` }
    : {
        kind: "failing",
        text: `Checks failed${round}: back with the worker.`,
      };
}

// A verified commit held for a protected path (R86.6), or null.
function pathHeld(delivery) {
  if (delivery?.state !== "decision") return null;
  const held = (delivery.verifications ?? []).findLast(
    (v) => v.outcome === "protected",
  );
  return held && held.commit === delivery.commit ? held : null;
}

export function landingQueueView(store, data, { now = Date.now() } = {}) {
  const tasks = new Map((data?.tasks ?? []).map((t) => [t.id, t])),
    projects = new Map(listOr(store, "projects").map((p) => [p.id, p])),
    deliveries = new Map(
      listOr(store, "task_deliveries").map((d) => [d.taskId ?? d.id, d]),
    ),
    worktrees = new Map(
      listOr(store, "task_worktrees").map((w) => [w.taskId ?? w.id, w]),
    ),
    links = linkSets(store, { now }).tasks,
    groups = new Map();
  const group = (projectId, base) => {
    const key = `${projectId}\0${base}`;
    if (!groups.has(key)) {
      const project = projects.get(projectId);
      groups.set(key, {
        key,
        projectId,
        repository: project?.repository ?? null,
        base,
        landing: project?.landing ?? null,
        items: [],
      });
    }
    return groups.get(key);
  };
  const item = (entry, ids, extra) => {
    const first = links[ids[0]] ?? null;
    return {
      key: entry.key ?? ids[0],
      tasks: ids.map((id) => ({ id, title: tasks.get(id)?.title ?? id })),
      commit: entry.commit ?? null,
      pr: first?.pr ?? null,
      reviewPr: entry.reviewPr ?? null,
      branch: first?.branch ?? null,
      checks: first?.checks ?? null,
      ...extra,
    };
  };
  // Per train target: the running train and why each queued entry is held.
  const trainFor = (entry) => {
    const key = `${entry.projectId}\0${entry.base}`;
    if (!trainState.has(key))
      trainState.set(key, {
        running: runningTrain(store, entry.projectId, entry.base),
        held: new Map(
          readyEntries(store, {
            projectId: entry.projectId,
            base: entry.base,
          }).held.map((h) => [h.key, h.reason]),
        ),
      });
    return trainState.get(key);
  };
  const entries = listOr(store, TABLE),
    queued = entries
      .filter((e) => e.state === "queued" || e.state === "in-train")
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
    trainState = new Map(),
    positions = new Map(),
    shown = new Set();
  for (const entry of queued) {
    const line = group(entry.projectId, entry.base),
      position = positions.get(line.key) ?? 0,
      ids = taskIds(entry),
      first = links[ids[0]] ?? null;
    positions.set(line.key, position + 1);
    ids.forEach((id) => shown.add(id));
    line.items.push(
      item(entry, ids, {
        position: position + 1,
        since: entry.queuedAt ?? null,
        hold:
          projects.get(entry.projectId)?.landing === "train"
            ? trainHold(store, entry, trainFor(entry))
            : queuedHold(
                store,
                entry,
                position,
                projects.get(entry.projectId),
                first?.checks,
              ),
      }),
    );
  }
  // The newest finished entry per task: conflict or failed, and its task
  // still out of the queue and not landed, means it will come back.
  const newest = new Map();
  for (const entry of entries)
    for (const id of taskIds(entry))
      if ((newest.get(id)?.seq ?? -1) < (entry.seq ?? 0)) newest.set(id, entry);
  const later = [];
  for (const [id, entry] of newest) {
    const delivery = deliveries.get(id);
    if (shown.has(id) || !BACK.has(entry.state) || !delivery) continue;
    if (!["running", "decision"].includes(delivery.state)) continue;
    shown.add(id);
    later.push({
      line: group(entry.projectId, entry.base),
      at: entry.finishedAt ?? null,
      row: item(entry, [id], {
        key: id,
        position: null,
        since: entry.finishedAt ?? null,
        hold: backHold(entry, delivery),
      }),
    });
  }
  for (const [id, delivery] of deliveries) {
    const held = shown.has(id) ? null : pathHeld(delivery);
    if (!held) continue;
    const task = tasks.get(id),
      worktree = worktrees.get(id),
      projectId = worktree?.repository ?? (task ? taskRepository(task) : null),
      project = projects.get(projectId);
    if (!projectId) continue;
    later.push({
      line: group(
        projectId,
        worktree?.base?.branch || project?.baseBranch || "main",
      ),
      at: held.at ?? delivery.updatedAt ?? null,
      row: item({ commit: delivery.commit }, [id], {
        key: id,
        position: null,
        since: held.at ?? delivery.updatedAt ?? null,
        hold: {
          kind: "path",
          text: `Path hold: ${String(held.cause ?? delivery.cause ?? "touches a protected path").slice(0, 200)}.`,
        },
      }),
    });
  }
  later
    .sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")))
    .forEach(({ line, row }) => line.items.push(row));
  // A train target also reports its queue depth and the running train.
  for (const line of groups.values()) {
    if (line.landing !== "train") continue;
    const running = runningTrain(store, line.projectId, line.base);
    line.queue = {
      depth: line.items.filter((i) => i.position != null).length,
      train: running
        ? {
            id: running.id,
            policy: running.policy,
            step: running.current ?? running.steps.at(-1)?.name ?? "starting",
            members: running.members.length,
            startedAt: running.startedAt,
          }
        : null,
    };
  }
  return {
    bases: [...groups.values()].sort(
      (a, b) =>
        String(a.repository ?? a.projectId).localeCompare(
          String(b.repository ?? b.projectId),
        ) || a.base.localeCompare(b.base),
    ),
    readAt: new Date(now).toISOString(),
  };
}
