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
//   head the stored wait (draft, review missing, checks pending) or the cached
//   checks (failing, pending); every other queued portion is behind the ones
//   before it.
import { linkSets } from "../tasks/scm-links.mjs";
import { pausedBy, taskIds } from "./landing-queue.mjs";
import { taskRepository } from "../../work-model.mjs";
import { landingSettings } from "./landing-config.mjs";
import {
  failureRate,
  sizeLimit,
  sizeRecord,
  testingNow,
} from "./merge-batch-size.mjs";

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
function queuedHold(store, entry, position, repository, checks) {
  const stop = pausedBy(store, entry);
  if (stop) return stopHold(stop);
  if (repository?.landing === "off")
    return { kind: "off", text: "Landing is off for this repository." };
  if (position > 0)
    return {
      kind: "behind",
      text: `Behind ${plural(position, "portion")}.`,
    };
  const wait = entry.waiting?.candidate ? entry.waiting : null;
  if (wait?.reason === "draft")
    return { kind: "draft", text: "Draft, waiting for you." };
  if (wait?.reason === "merge")
    return entry.mergeApproved?.commit === entry.commit
      ? { kind: "next", text: "Merge approved; merges on the next tick." }
      : { kind: "merge", text: "Ready to merge, waiting for you." };
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

export function landingQueueView(
  store,
  data,
  { now = Date.now(), config = null } = {},
) {
  const tasks = new Map((data?.tasks ?? []).map((t) => [t.id, t])),
    repositories = new Map(listOr(store, "repositories").map((p) => [p.id, p])),
    deliveries = new Map(
      listOr(store, "task_deliveries").map((d) => [d.taskId ?? d.id, d]),
    ),
    worktrees = new Map(
      listOr(store, "task_worktrees").map((w) => [w.taskId ?? w.id, w]),
    ),
    links = linkSets(store, { now }).tasks,
    groups = new Map();
  const group = (repositoryId, base) => {
    const key = `${repositoryId}\0${base}`;
    if (!groups.has(key)) {
      const repository = repositories.get(repositoryId);
      groups.set(key, {
        key,
        repositoryId,
        repository: repository?.github ?? null,
        base,
        landing: repository?.landing ?? null,
        items: [],
      });
    }
    return groups.get(key);
  };
  // Every `direct` base shows its size and its last merge batches, even
  // while nothing waits.
  for (const repository of repositories.values())
    if (repository.landing === "direct")
      group(repository.id, repository.baseBranch || "main");
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
      // A check of this entry that ran with no isolation.
      unsandboxed: (entry.checks ?? []).some(
        (check) => check?.isolation === "unconfined",
      ),
      ...extra,
    };
  };
  const entries = listOr(store, TABLE),
    queued = entries
      .filter((e) => e.state === "queued")
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
    positions = new Map(),
    shown = new Set();
  for (const entry of queued) {
    const line = group(entry.repositoryId, entry.base),
      position = positions.get(line.key) ?? 0,
      ids = taskIds(entry),
      first = links[ids[0]] ?? null;
    positions.set(line.key, position + 1);
    ids.forEach((id) => shown.add(id));
    line.items.push(
      item(entry, ids, {
        position: position + 1,
        since: entry.queuedAt ?? null,
        waitedMinutes: entry.queuedAt
          ? Math.max(0, Math.floor((now - Date.parse(entry.queuedAt)) / 60000))
          : null,
        hold: queuedHold(
          store,
          entry,
          position,
          repositories.get(entry.repositoryId),
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
      line: group(entry.repositoryId, entry.base),
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
      repositoryId =
        worktree?.repository ?? (task ? taskRepository(task) : null),
      repository = repositories.get(repositoryId);
    if (!repositoryId) continue;
    later.push({
      line: group(
        repositoryId,
        worktree?.base?.branch || repository?.baseBranch || "main",
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
  // The merge batch being tested, the last ones and the size limit, from
  // stored records (MB7.1).
  for (const line of groups.values()) {
    if (line.landing !== "direct") continue;
    const at = { repositoryId: line.repositoryId, base: line.base },
      record = sizeRecord(store, at),
      setting = landingSettings(
        config,
        line.repository,
        repositories.get(line.repositoryId),
      ).mergeBatch;
    line.testing = testingNow(store, at);
    line.last = [...record.last].reverse();
    line.size = {
      limit: sizeLimit(record, setting),
      fixed: Number.isInteger(setting),
      failureRate: failureRate(record.results),
      results: record.results.length,
    };
  }
  return {
    bases: [...groups.values()].sort(
      (a, b) =>
        String(a.repository ?? a.repositoryId).localeCompare(
          String(b.repository ?? b.repositoryId),
        ) || a.base.localeCompare(b.base),
    ),
    readAt: new Date(now).toISOString(),
  };
}

// A member that has waited more than 60 minutes is one Needs you row naming
// why it waits (MB7.3). The row's id is the entry's, so reading twice shows
// one row, and it goes when the member leaves the queue. A draft pull
// request, and one ready to merge, is one row at once, with Ready or Merge
// (R119), and no wait row.
export const LONG_WAIT_MINUTES = 60;
export function landingWaitNeedsYou(
  store,
  data,
  { now = Date.now(), config } = {},
) {
  const view = landingQueueView(store, data, { now, config });
  return view.bases.flatMap((line) =>
    line.items
      .filter(
        (i) =>
          i.position != null &&
          (PERSON.has(i.hold.kind) || i.waitedMinutes > LONG_WAIT_MINUTES),
      )
      .map((i) =>
        PERSON.has(i.hold.kind)
          ? pullRow(store, line, i)
          : {
              kind: "needs-human",
              reason: "approval",
              id: `landing-wait:${line.repositoryId}:${line.base}:${i.key}`,
              taskId: i.tasks[0]?.id ?? null,
              authority: "avoozl",
              title: `${i.tasks[0]?.id ?? i.key} has waited ${i.waitedMinutes} minutes to land on ${line.base}`,
              detail: i.hold.text,
              openedAt: new Date(
                Date.parse(i.since) + LONG_WAIT_MINUTES * 60000,
              ).toISOString(),
            },
      ),
  );
}

// The holds only a person moves: a draft, and a pull request whose
// checks passed, which a person merges (R119).
const PERSON = new Set(["draft", "merge"]);
const PULL_ROWS = {
  draft: {
    reason: "draft-pr",
    title: (n) => `draft pull request${n} waits for you`,
    detail:
      "This repository opens pull requests as drafts (landing.pr: draft). Mark it ready for review on GitHub, or press Approve here. A person merges it once its checks pass.",
  },
  merge: {
    reason: "pr-merge",
    title: (n) => `pull request${n} is ready to merge`,
    detail:
      "Its checks and reviews passed on this exact head. Merge it on GitHub, or press Merge here. Avoozl never merges it on its own.",
  },
};

function pullRow(store, line, item) {
  const entry = store.get(
      TABLE,
      `${line.repositoryId}\0${line.base}\0${item.key}`,
    ),
    number = entry?.pr ?? item.pr?.number ?? null,
    task = item.tasks[0]?.id ?? item.key,
    shape = PULL_ROWS[item.hold.kind];
  return {
    kind: "needs-human",
    reason: shape.reason,
    id: `${shape.reason}:${line.repositoryId}:${line.base}:${item.key}`,
    taskId: item.tasks[0]?.id ?? null,
    authority: "avoozl",
    title: `${task}: ${shape.title(number ? ` #${number}` : "")}`,
    detail: shape.detail,
    commit: entry?.commit ?? item.commit ?? null,
    repositoryId: line.repositoryId,
    repository: line.repository,
    base: line.base,
    key: item.key,
    pullRequest: number,
    link:
      number && line.repository
        ? `https://github.com/${line.repository}/pull/${number}`
        : (item.pr?.url ?? null),
    openedAt: entry?.waiting?.since ?? item.since ?? null,
  };
}
