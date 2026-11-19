// Stranger input that waits (vm-harness VM6.5, VM6.10, VM8.1, D7): one
// Needs you item per repository and reason, read by conflicts.view. A start
// that waits stays queued; when the reason clears, the next tick starts it.
// A stranger-input start on the `kirocrew` executor waits with **Run on
// {harness}**, which moves that one request to a `process` harness with
// `box`. The preflight's failures (D5) show here too, with **Run preflight
// again**.
import fs from "node:fs";
import path from "node:path";
import { fail } from "../store/store.mjs";
import {
  listHarnessDefinitions,
  loadHarnessDefinition,
} from "../executors/harness-definitions.mjs";
import {
  boxPreflight,
  forgetBoxPreflight,
  openSupervisorDatabase,
} from "../executors/supervisor.mjs";
import { enqueueSessionRequests } from "../sessions/session-requests.mjs";

const WAITS = "stranger.waits";
const rows = (store) => {
  const value = store.getMeta(WAITS);
  return value && typeof value === "object" ? value : {};
};
const keyOf = (repository, kind) => `${repository}\0${kind}`;

// Record that a request waits: `kind` is "box" (no box can run it, or the
// rule holds it) or "kirocrew" (its role runs on a Kiro Crew chat).
export function recordStrangerWait(
  store,
  { repository, kind, reason, requestId },
) {
  const all = rows(store),
    key = keyOf(repository, kind),
    current = all[key];
  const requests = [...new Set([...(current?.requests ?? []), requestId])];
  if (current?.reason === reason && current.requests.length === requests.length)
    return;
  store.setMeta(WAITS, {
    ...all,
    [key]: {
      repository,
      kind,
      reason,
      requests,
      at: current?.at ?? new Date().toISOString(),
    },
  });
}

// A request that started, or went: it waits no more.
export function clearStrangerWait(store, requestId) {
  const all = rows(store);
  let changed = false;
  for (const [key, row] of Object.entries(all)) {
    if (!row.requests.includes(requestId)) continue;
    changed = true;
    const requests = row.requests.filter((id) => id !== requestId);
    if (requests.length) all[key] = { ...row, requests };
    else delete all[key];
  }
  if (changed) store.setMeta(WAITS, all);
}

// The Needs you rows. `harnesses` are this machine's approved definitions
// with `box`, offered as **Run on** for a Kiro Crew wait.
export function strangerNeedsYou(store, harnesses = []) {
  return Object.values(rows(store)).map((row) => ({
    kind: "needs-human",
    reason: "stranger",
    id: `stranger:${row.repository}:${row.kind}`,
    taskId: null,
    repository: row.repository,
    authority: "local",
    title:
      row.kind === "kirocrew"
        ? `${row.repository}: stranger input waits; a Kiro Crew chat never takes it`
        : `${row.repository}: stranger input waits`,
    detail:
      row.kind === "kirocrew"
        ? `${row.requests.length} start${row.requests.length === 1 ? "" : "s"} with stranger input name a Kiro Crew chat, which runs as you with only a speed bump in the way. Run ${row.requests.length === 1 ? "it" : "them"} on a harness whose commands go to a box.`
        : `${row.reason}. ${row.requests.length} start${row.requests.length === 1 ? "" : "s"} wait${row.requests.length === 1 ? "s" : ""}; the next tick starts ${row.requests.length === 1 ? "it" : "them"} once this clears.`,
    ...(row.kind === "kirocrew"
      ? { choices: harnesses, requests: row.requests }
      : {}),
    openedAt: row.at,
  }));
}

// **Run on {harness}** (person only): each waiting Kiro Crew start of the
// repository becomes the same start on the `process` executor with
// `harness`, which must be approved here and have a box.
export function runStrangerOn(store, { repository, harness }, { boxed }) {
  const row = rows(store)[keyOf(repository, "kirocrew")];
  if (!row) fail(`No stranger input of ${repository} waits on Kiro Crew.`, 404);
  if (!boxed.includes(harness))
    fail(
      `${harness} is not an approved harness with a box on this machine.`,
      409,
    );
  const starts = [];
  store.transaction(() => {
    for (const id of row.requests) {
      const queued = store.get("session_requests", id);
      if (queued?.state !== "pending") continue;
      store.put("session_requests", {
        ...queued,
        state: "canceled",
        reason: `A person moved this stranger input to ${harness}.`,
      });
      starts.push({
        ...queued.request,
        id: `${id}:process`,
        executor: "process",
        harness,
      });
    }
    const all = rows(store);
    delete all[keyOf(repository, "kirocrew")];
    store.setMeta(WAITS, all);
  });
  if (starts.length)
    enqueueSessionRequests(store, { starts }, { source: "person" });
  return { repository, harness, moved: starts.length };
}

// The preflight's Needs you rows (D5): one per repository whose latest
// preflight failed, naming the step and its output.
export function preflightNeedsYou(failures) {
  return failures.map((row) => ({
    kind: "needs-human",
    reason: "box-preflight",
    id: `box-preflight:${row.repository}`,
    taskId: null,
    repository: row.repository,
    authority: "local",
    title: `${row.repository}: the box preflight failed at "${row.failed?.name ?? "a step"}"`,
    detail: `${row.failed?.output || "No output."} Contained work of ${row.repository} waits. Fix it, then run the preflight again.`,
    openedAt: row.at,
  }));
}

// This machine's approved harnesses whose box routes commands to box exec.
export function boxedHarnesses(configDirectory) {
  return listHarnessDefinitions(configDirectory)
    .filter((entry) => entry.approved)
    .filter((entry) => {
      try {
        const box = loadHarnessDefinition({
          configDirectory,
          name: entry.name,
        }).box;
        return [...Object.values(box?.env ?? {}), ...(box?.args ?? [])].some(
          (item) => String(item).includes("{box_exec}"),
        );
      } catch {
        return false;
      }
    })
    .map((entry) => entry.name);
}

// The repositories of this workspace whose latest preflight failed, read
// from the supervisor's database when there is one.
export function preflightFailures(store, stateDirectory) {
  if (!stateDirectory) return [];
  const file = path.join(
    path.resolve(stateDirectory),
    "supervisor",
    "supervisor.sqlite",
  );
  if (!fs.existsSync(file)) return [];
  const db = openSupervisorDatabase(stateDirectory);
  try {
    return store
      .list("repositories")
      .map((repository) => boxPreflight(db, repository.id))
      .filter((row) => row && row.state === "failed");
  } finally {
    db.close();
  }
}

// **Run preflight again** (person only).
export function retryPreflight(store, stateDirectory, { repository }) {
  if (!store.get("repositories", String(repository ?? "")))
    fail("Repository not found.", 404);
  const db = openSupervisorDatabase(stateDirectory);
  try {
    return { repository, forgotten: forgetBoxPreflight(db, repository) };
  } finally {
    db.close();
  }
}
