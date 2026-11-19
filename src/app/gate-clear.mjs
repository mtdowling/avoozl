// Tracker gates a person clears, and the rows a gate raises (RC23.9, RC23.10,
// design D28.6, D28.7). A clear is an order, never a verified completion: it
// records who, how, when, why and the last state Avoozl read, releases the
// dependents on the next pass, and is recorded once. Avoozl itself never
// clears a gate. Only an actor the repository policy allows may clear one;
// a stranger's label removal is put back with one row.
import { actorAllowed } from "./github-policy.mjs";
import { gateRecord, GATE_RECORDS } from "./gate-step.mjs";
import { isGate } from "../work-model.mjs";
import { fail } from "./store.mjs";

const STRANGERS = "gateStrangers";
const CLEAR_ROUTES = Object.freeze(["label", "command", "mcp", "control"]);

// The same allowed-actor or minimum-permission check the trigger labels use.
export async function allowedToClear(github, policy, repository, login) {
  if (!login) return { allowed: false, reason: "The actor could not be read." };
  const rules = policy?.repositories?.[repository];
  if (!rules)
    return { allowed: false, reason: `No policy names ${repository}.` };
  try {
    const permission = rules.minimumPermission
      ? ((await github.permission(repository, login))?.permission ?? "none")
      : null;
    return actorAllowed(rules, login, permission);
  } catch (error) {
    return {
      allowed: false,
      reason: `Permission not readable: ${error.message}`,
    };
  }
}

const strangers = (store) => store.getMeta(STRANGERS) || {};
export function putStranger(store, taskId, row) {
  const rows = strangers(store);
  if (rows[taskId]?.actor === row.actor) return;
  store.setMeta(STRANGERS, { ...rows, [taskId]: row });
}
function dropStranger(store, taskId) {
  const { [taskId]: gone, ...rest } = strangers(store);
  if (gone) store.setMeta(STRANGERS, rest);
}

// Record the order once. Returns true when it was written now.
export function recordClear(
  store,
  taskId,
  { actor, how, reason, now = new Date() },
) {
  if (!CLEAR_ROUTES.includes(how)) fail(`Unknown clear route ${how}.`);
  const last = gateRecord(store, taskId);
  let written = false;
  store.mutate(`gate ${taskId} cleared`, (data) => {
    const task = data.tasks.find((row) => row.id === taskId);
    if (!task || !isGate(task) || task.gateVerdict) return;
    task.gateVerdict = {
      state: "order",
      at: now.toISOString(),
      order: {
        actor,
        how,
        at: now.toISOString(),
        reason: String(reason ?? "").slice(0, 500),
        lastState: last?.state ?? "unknown",
      },
    };
    written = true;
  });
  if (written) {
    store.event(null, "gate.cleared", { taskId, actor, how });
    if (last)
      store.put(GATE_RECORDS, { ...last, clearedAt: now.toISOString() });
    dropStranger(store, taskId);
  }
  return written;
}

// The command, MCP call and control route. `local` names the person for a
// gate with no GitHub issue; otherwise the machine's GitHub login is the
// actor and passes the same check as a label.
export async function clearGate(
  store,
  github,
  policy,
  { taskId, reason, how, local = null },
) {
  if (!taskId) fail("Name the gate task to clear.", 400);
  const task = store.read().tasks.find((row) => row.id === taskId);
  if (!task || !isGate(task)) fail(`${taskId} is not a tracker gate.`, 404);
  if (task.gateVerdict)
    return { cleared: false, state: task.gateVerdict.state };
  if (!String(reason ?? "").trim()) fail("Say why the gate is cleared.", 400);
  let actor = local;
  const repository = task.github?.repository;
  if (repository) {
    if (!github?.available?.()) fail("GitHub is not available.", 409);
    actor = (await github.currentUser())?.login ?? null;
    const verdict = await allowedToClear(github, policy, repository, actor);
    if (!verdict.allowed) fail(`Not cleared: ${verdict.reason}`, 403);
  } else if (!actor) fail("A gate with no issue is cleared by a person.", 403);
  const cleared = recordClear(store, taskId, { actor, how, reason });
  return { cleared, state: "order", actor };
}

// Needs you rows: a failed gate, a gate unknown for two reads in a row, and a
// stranger's removal of the label. Derived from the record, so a retried tick
// opens no second row; each stays until a person clears the gate, the plan
// removes it or the plugin reports done.
export function gateNeedsYou(store) {
  const rows = [],
    held = strangers(store);
  for (const task of store.read().tasks) {
    if (!isGate(task) || !task.planId || task.gateVerdict) continue;
    if (task.source?.removed || task.planArchived || task.supersededBy)
      continue;
    const record = gateRecord(store, task.id),
      failed = record?.state === "failed",
      unknown = record?.state === "unknown" && (record.unknownRun ?? 0) >= 2;
    if (failed || unknown)
      rows.push({
        id: `gate:${task.id}:${record.state}`,
        kind: "needs-human",
        reason: "tracker-gate",
        taskId: task.id,
        authority: "github",
        title: `Tracker gate ${task.id} is ${record.state}`,
        detail: `${task.gate.plugin} item ${task.gate.item}: ${record.evidence || "no detail"} Avoozl does not clear a gate; clear it or edit the plan.`,
        link: record.link ?? null,
        openedAt: record.checkedAt,
      });
    if (held[task.id])
      rows.push({
        id: `gate:${task.id}:stranger`,
        kind: "needs-human",
        reason: "tracker-gate",
        taskId: task.id,
        authority: "github",
        title: `${held[task.id].actor} removed the waiting label from gate ${task.id}`,
        detail: `${held[task.id].actor} may not clear a gate, so Avoozl put the label back.`,
        link: null,
        openedAt: held[task.id].at,
      });
  }
  return rows;
}

// Notes for a dependent whose gate a person cleared (RC23.10).
export function gateClearNotes(data, task) {
  const notes = [];
  for (const edge of data.edges) {
    if (edge.to !== task.id || !["requires", "sequence"].includes(edge.kind))
      continue;
    const gate = data.tasks.find((row) => row.id === edge.from);
    if (!isGate(gate) || gate.gateVerdict?.state !== "order") continue;
    const { order } = gate.gateVerdict;
    notes.push(
      `Gate ${gate.id} was cleared by a person: ${order.actor} cleared it by ${order.how} at ${order.at}, last state ${order.lastState}. Its outside item (${gate.gate?.item}) may not be done. Check before relying on it.`,
    );
  }
  return notes;
}
