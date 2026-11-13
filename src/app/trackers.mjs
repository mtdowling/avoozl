// Tracker plugins (design §3.2, §4.8 Tracker kind, Requirement 35). A task
// with `authority: plugin:<id>` keeps its record in that plugin's tracker,
// the way a github task keeps its record in an issue. SQLite only caches the
// record (`task.tracker`): direct edits are refused (operations.mjs), and
// the tick projects the approved plan's values with `project`, reads the
// record back with `read`, and closes it with `close` after Avoozl's own
// completion verdict. The record carries a marker (namespace, task ID, plan
// revision, last applied managed values, and the verdict), so `list` alone
// rebuilds the cache. Without the `edges` capability the graph stays in
// Avoozl, from the approved plan.
import { statusComplete } from "../query.mjs";
import { completionReached, pluginId, taskAuthority } from "../work-model.mjs";
import { PluginUnavailable } from "./plugin-session.mjs";
import { canonical } from "./store.mjs";

export const trackerOf = (task) => pluginId(taskAuthority(task));

const same = (a, b) => canonical(a ?? null) === canonical(b ?? null);

// The managed values Avoozl wants on a task's record (R35.6).
export function desiredFields(task, blockedBy) {
  const acceptance = [].concat(task.acceptance || []);
  return {
    title: task.title || task.id,
    section: [
      task.summary || "",
      acceptance.length
        ? "Acceptance:\n" + acceptance.map((line) => "- " + line).join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    tags: [...(task.tags || [])],
    ...(blockedBy ? { blockedBy } : {}),
  };
}

// What made the task complete, kept in the marker so rebuild restores it.
function verdictOf(task, at) {
  if (task.routeVerdict?.state === "done")
    return {
      state: "verified",
      basis: "route",
      route: task.routeVerdict.route,
      result: task.routeVerdict.result,
      at,
    };
  if (task.integration?.commit)
    return {
      state: "verified",
      basis: "integrated",
      commit: task.integration.commit,
      at,
    };
  return {
    state: "verified",
    basis: task.childrenComplete ? "children" : "status",
    at,
  };
}

// Changes one task row only when `fn` changed it, so a quiet tick writes
// nothing.
function patch(store, taskId, summary, fn) {
  const current = store.read().tasks.find((t) => t.id === taskId);
  if (!current) return false;
  const next = structuredClone(current);
  fn(next);
  if (canonical(next) === canonical(current)) return false;
  store.mutate(summary, (draft) => {
    draft.tasks[draft.tasks.findIndex((t) => t.id === taskId)] = next;
  });
  return true;
}

function cacheOf(id, record, extra = {}) {
  return {
    plugin: id,
    id: record.id,
    link: record.link,
    state: record.state,
    closeReason: record.closeReason,
    closedBy: record.closedBy,
    fields: record.fields,
    marker: record.marker,
    ...extra,
  };
}

// Who closed or paused a record, judged like a GitHub close (R33.8, R35.9):
// an actor the plugin entry's `allowedActors` names gives an order; anyone
// else, or an actor the plugin cannot report, holds the task for a person.
function allowedActor(info, actor) {
  if (!info.capabilities.includes("actor") || !actor) return false;
  const allowed = info.config.allowedActors;
  return Array.isArray(allowed) && allowed.includes(actor);
}

function judge(store, id, info, task, record, notify, now) {
  const closeKey = `${record.closedBy ?? ""}@${record.closedAt ?? ""}`,
    own = task.tracker?.closedByAvoozl || record.marker?.verdict;
  patch(store, task.id, `Read ${task.id} from ${id}`, (row) => {
    if (record.state === "closed" && !own) {
      if (row.trackerVerdict?.state === "order") return;
      if (row.trackerHold?.key === closeKey) return;
      if (allowedActor(info, record.closedBy)) {
        row.trackerVerdict = {
          state: "order",
          order: {
            actor: record.closedBy,
            reason:
              record.closeReason === "not_planned"
                ? "not planned"
                : "completed",
            closedAt: record.closedAt || now,
          },
          issue: null,
          at: now,
        };
        delete row.trackerHold;
        return;
      }
      const who = info.capabilities.includes("actor")
          ? record.closedBy || "someone the plugin cannot name"
          : "someone the plugin cannot name",
        text = `${row.id}'s record ${record.link || record.id} was closed by ${who}, whom the plugin:${id} entry does not allow. Its dependents wait. Avoozl did not reopen it.`;
      row.decision = text;
      row.trackerHold = {
        key: closeKey,
        actor: record.closedBy,
        decision: text,
      };
      notify.push({
        channel: "decision",
        task: row.id,
        title: `${row.id} was closed in plugin:${id} by someone not allowed`,
        text,
      });
      return;
    }
    if (record.state === "open") {
      // A reopened record withdraws an order and lifts its own hold.
      if (row.trackerVerdict?.state === "order") delete row.trackerVerdict;
      if (row.trackerHold) {
        if (row.decision === row.trackerHold.decision) delete row.decision;
        delete row.trackerHold;
      }
    }
    if (info.capabilities.includes("pause")) {
      if (record.paused && allowedActor(info, record.pausedBy))
        row.trackerPaused = { actor: record.pausedBy };
      else delete row.trackerPaused;
      if (record.paused && !allowedActor(info, record.pausedBy))
        row.trackerPauseIgnored = { actor: record.pausedBy };
      else delete row.trackerPauseIgnored;
    }
  });
}

// The three-way rule (R15.1-15.3) per managed field, against the marker's
// last applied values: {send, applied, conflicts, changed}.
function merge(desired, record, applied) {
  const send = {},
    nextApplied = {},
    conflicts = [];
  let changed = false;
  for (const field of Object.keys(desired)) {
    const current = record?.fields?.[field],
      last = applied?.[field],
      want = desired[field];
    if (!record || same(current, last)) {
      send[field] = want;
      nextApplied[field] = want;
      if (!record || !same(want, last)) changed = true;
    } else if (same(current, want)) {
      // A person made the same change: it becomes the baseline.
      send[field] = current;
      nextApplied[field] = current;
      changed = true;
    } else {
      send[field] = current;
      nextApplied[field] = last;
      conflicts.push({ field, current, applied: last ?? null, desired: want });
    }
  }
  return { send, applied: nextApplied, conflicts, changed };
}

function markerFor(namespace, task, plan, applied, verdict) {
  return {
    namespace,
    taskId: task.id,
    planId: task.planId ?? null,
    spec: plan?.spec ?? null,
    hash: task.planHash ?? null,
    applied,
    ...(verdict ? { verdict } : {}),
  };
}

// `project`, checking the tracker stored the marker it was given (R35.3).
async function project(plugins, id, task, send, marker) {
  const reply = await plugins.call(id, "tracker", "project", {
    task: { id: task.id, title: task.title, kind: task.kind ?? "leaf" },
    desired: send,
    marker,
  });
  if (!same(reply.marker, marker)) {
    const reason =
      "it did not store Avoozl's marker with the record, so it cannot be a tracker.";
    plugins.fail(id, reason);
    throw new PluginUnavailable(id, reason);
  }
  return reply;
}

// One tick of every tracker plugin: read each projected record and judge
// outside closes and pauses, project new and changed values, then close
// records whose task Avoozl found complete. A plugin failure stops only that
// plugin's tasks. Returns {notify}.
// shortcut: one `read` per plugin per tick and no write budget; add paging
// and a budget when a tracker holds hundreds of tasks.
export async function trackerStep(store, plugins, { namespace }) {
  const notify = [],
    now = new Date().toISOString(),
    data = store.read(),
    complete = (status) => statusComplete(data, status),
    ids = [...new Set(data.tasks.map(trackerOf).filter(Boolean))];
  for (const id of ids) {
    if (!(await plugins.use(id, "tracker")).ok) continue;
    if (!namespace) {
      plugins.fail(
        id,
        'add a "namespace" to .avoozl.json; tracker records carry it.',
      );
      continue;
    }
    const info = plugins.describe(id, "tracker"),
      edges = info.capabilities.includes("edges");
    try {
      const own = () => store.read().tasks.filter((t) => trackerOf(t) === id);
      const projected = own().filter((t) => t.tracker?.id),
        { records } = projected.length
          ? await plugins.call(id, "tracker", "read", {
              ids: projected.map((t) => t.tracker.id),
            })
          : { records: [] },
        byId = new Map(records.map((record) => [record.id, record]));
      for (const record of records)
        if (
          record.marker &&
          (record.marker.namespace !== namespace ||
            !projected.some(
              (t) =>
                t.id === record.marker.taskId && t.tracker.id === record.id,
            ))
        ) {
          const reason = `record ${record.id} carries another task's marker.`;
          plugins.fail(id, reason);
          throw new PluginUnavailable(id, reason);
        }
      for (const task of projected) {
        const record = byId.get(task.tracker.id);
        if (record) judge(store, id, info, task, record, notify, now);
      }
      // Project: new records, and open records whose values differ.
      for (const task of own()) {
        const record = task.tracker?.id ? byId.get(task.tracker.id) : null;
        if (task.tracker?.id && !record) continue;
        const data = store.read(),
          blockers = edges
            ? data.edges
                .filter(
                  (e) =>
                    e.to === task.id &&
                    ["requires", "sequence"].includes(e.kind),
                )
                .map(
                  (e) => data.tasks.find((t) => t.id === e.from)?.tracker?.id,
                )
                .filter(Boolean)
                .sort()
            : null,
          desired = desiredFields(task, blockers),
          applied = record?.marker?.applied ?? task.tracker?.marker?.applied,
          merged = merge(desired, record, applied),
          plan = task.planId ? store.get("plans", task.planId) : null;
        let next;
        // A closed record is never written; a person's edit to it is still
        // a conflict.
        if (merged.changed && record?.state !== "closed") {
          const marker = markerFor(namespace, task, plan, merged.applied),
            reply = await project(plugins, id, task, merged.send, marker);
          next = cacheOf(id, {
            id: reply.id,
            link: reply.link,
            state: "open",
            closeReason: null,
            closedBy: null,
            fields: merged.send,
            marker,
          });
          store.event(null, "tracker.projected", {
            taskId: task.id,
            plugin: id,
            record: reply.id,
          });
        } else
          next = cacheOf(id, record, {
            ...(task.tracker.closedByAvoozl ? { closedByAvoozl: true } : {}),
          });
        next.conflicts = merged.conflicts;
        patch(store, task.id, `Project ${task.id} to ${id}`, (row) => {
          row.tracker = next;
        });
      }
      // Close after Avoozl's own verdict (R35.8): the verdict goes into the
      // marker first, so rebuild restores it.
      for (const task of own()) {
        if (
          task.tracker?.state !== "open" ||
          task.trackerVerdict ||
          task.decision ||
          !completionReached(task, undefined, complete)
        )
          continue;
        // The status integration set rides along, so rebuild restores it.
        const verdict = { ...verdictOf(task, now), status: task.status },
          marker = { ...task.tracker.marker, verdict };
        await project(plugins, id, task, task.tracker.fields, marker);
        await plugins.call(id, "tracker", "close", {
          id: task.tracker.id,
          reason: "completed",
        });
        patch(store, task.id, `Close ${task.id} in ${id}`, (row) => {
          row.trackerVerdict = verdict;
          row.tracker = {
            ...row.tracker,
            state: "closed",
            closeReason: "completed",
            closedByAvoozl: true,
            marker,
          };
        });
        store.event(null, "tracker.closed", {
          taskId: task.id,
          plugin: id,
          record: task.tracker.id,
        });
      }
    } catch (error) {
      if (!(error instanceof PluginUnavailable)) throw error;
    }
  }
  return { notify };
}

// Tasks that must not start this tick: their tracker is unavailable (R34.7:
// write nothing for them) or an allowed actor paused their record.
export function heldByTrackers(data, plugins) {
  return new Set(
    data.tasks
      .filter((task) => {
        const id = trackerOf(task);
        return id && (plugins.unavailable(id) || task.trackerPaused);
      })
      .map((task) => task.id),
  );
}

// The cache rows a tracker's `list` rebuilds (§3.3, R35.7): per record, the
// task it names, its cache and verdict. Rows whose record lacks a marker in
// this namespace are left out.
export function rebuiltRows(id, records, namespace) {
  return records
    .filter((record) => record.marker?.namespace === namespace)
    .map((record) => ({
      taskId: record.marker.taskId,
      planId: record.marker.planId,
      spec: record.marker.spec,
      hash: record.marker.hash,
      tracker: cacheOf(id, record, {
        ...(record.marker.verdict ? { closedByAvoozl: true } : {}),
        conflicts: [],
      }),
      verdict: record.marker.verdict ?? null,
    }));
}
