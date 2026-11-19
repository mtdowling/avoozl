// What a person and `avoozl gate list` read about tracker gates (RC23.11,
// RC23.12, design D28.8): one row per gate with its tracker, state word, last
// and next check, evidence, link and any order, plus the tasks it holds. The
// page, the CLI and the MCP read all take this one list. Reads only.
import { isGate } from "../work-model.mjs";
import { gateRecord } from "./gate-step.mjs";
import { gateNeedsYou } from "./gate-clear.mjs";
import { waitingTasks } from "./gate-label.mjs";

const live = (task) =>
  task.planId &&
  !task.source?.removed &&
  !task.planArchived &&
  !task.supersededBy;

// open, failed, unknown, done or cleared. A gate never read is open.
function stateWord(task, record) {
  if (task.gateVerdict?.state === "order") return "cleared";
  if (task.gateVerdict?.state === "done") return "done";
  return record?.state ?? "open";
}

export function gateRows(store) {
  const data = store.read(),
    waiting = waitingTasks(data),
    asked = new Set(gateNeedsYou(store).map((row) => row.taskId));
  return data.tasks
    .filter((task) => isGate(task) && live(task))
    .map((task) => {
      const record = gateRecord(store, task.id),
        order =
          task.gateVerdict?.state === "order" ? task.gateVerdict.order : null,
        held = data.edges
          .filter(
            (edge) =>
              edge.from === task.id &&
              ["requires", "sequence"].includes(edge.kind),
          )
          .map((edge) => edge.to)
          .filter((id) => waiting.has(id));
      return {
        taskId: task.id,
        title: task.title || task.id,
        plan: task.planId,
        tracker: task.gate?.plugin ?? null,
        item: task.gate?.item ?? null,
        done: task.gate?.done ?? null,
        state: stateWord(task, record),
        lastCheck: record?.checkedAt ?? null,
        nextCheck:
          order || task.gateVerdict ? null : (record?.nextCheck ?? null),
        evidence: record?.evidence ?? null,
        link: record?.link ?? null,
        cleared: order,
        needsYou: asked.has(task.id),
        held,
      };
    });
}

// The Tracker step of Trace for a gate's issue, and a "waits on" step for a
// task one holds. `number` is the issue number in `repository`.
export function gateTraceStep(store, repository, number) {
  const data = store.read(),
    task = data.tasks.find(
      (row) =>
        row.github?.number === number &&
        String(row.github.repository).toLowerCase() ===
          String(repository).toLowerCase(),
    );
  if (!task) return null;
  const rows = gateRows(store);
  const own = rows.find((row) => row.taskId === task.id);
  if (own)
    return {
      key: "tracker",
      label: "Tracker",
      at:
        own.state === "done"
          ? (own.lastCheck ?? null)
          : (own.cleared?.at ?? null),
      by: own.cleared?.actor ?? null,
      link: own.link,
      detail: [
        `${own.tracker} ${own.item}: ${own.state}`,
        own.lastCheck ? `last check ${own.lastCheck}` : null,
        own.nextCheck ? `next ${own.nextCheck}` : null,
        own.evidence,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  const holding = rows.filter((row) => row.held.includes(task.id));
  if (!holding.length) return null;
  return {
    key: "waitsOn",
    label: "Waits on gate",
    at: null,
    detail: holding
      .map(
        (row) =>
          `${row.taskId} (${row.tracker} ${row.item}): ${row.state}${row.nextCheck ? `, next check ${row.nextCheck}` : ""}`,
      )
      .join("; "),
  };
}
